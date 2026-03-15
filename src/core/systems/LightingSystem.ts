import * as THREE from 'three';
import { FLASHLIGHT, MAX_VISIBLE_LIGHTS, MAX_SHADOW_CASTING_LIGHTS } from '../../content/constants';
import { GameSessionLogic } from '../GameSessionLogic';
import { System } from './System';
import { SectorContext } from '../../types/sector';

interface FlickeringLight {
    light: THREE.PointLight;
    baseInt: number;
    flickerRate: number;
}

// Absolute max dynamic lights tracked by the CPU per sector.
// Keeps the array allocation fixed to prevent runtime Garbage Collection.
const MAX_LIGHTS = 1024;
const _sortableLightsScratch: { light: THREE.PointLight | null, influence: number }[] = new Array(MAX_LIGHTS);
for (let i = 0; i < MAX_LIGHTS; i++) {
    _sortableLightsScratch[i] = { light: null, influence: 0 };
}

// Zero-GC objects for Frustum Culling visibility checks
const _frustum = new THREE.Frustum();
const _projScreenMatrix = new THREE.Matrix4();
const _lightSphere = new THREE.Sphere();

/**
 * Zero-GC In-place QuickSort.
 * Sorts by INFLUENCE descending (highest influence first).
 * Significantly faster than native Array.sort() for our game loop.
 */
function quickSortLightsDesc(arr: { light: THREE.PointLight | null, influence: number }[], left: number, right: number): void {
    if (left >= right) return;

    const pivot = arr[Math.floor((left + right) / 2)].influence;
    let i = left;
    let j = right;

    while (i <= j) {
        while (arr[i].influence > pivot) i++;
        while (arr[j].influence < pivot) j--;

        if (i <= j) {
            const temp = arr[i];
            arr[i] = arr[j];
            arr[j] = temp;
            i++;
            j--;
        }
    }

    quickSortLightsDesc(arr, left, j);
    quickSortLightsDesc(arr, i, right);
}

export class LightingSystem implements System {
    id = 'lighting';

    private flickeringLights: FlickeringLight[];
    private sectorContext: { current: SectorContext | null };
    private playerGroup: { current: THREE.Group | null };
    private frame: number = 14;

    constructor(
        flickeringLights: FlickeringLight[],
        sectorContext: { current: SectorContext | null },
        playerGroup: { current: THREE.Group | null }
    ) {
        this.flickeringLights = flickeringLights;
        this.sectorContext = sectorContext;
        this.playerGroup = playerGroup;
    }

    init(session: GameSessionLogic) {
        const sectorCtx = this.sectorContext.current;
        if (!sectorCtx) return;

        session.engine.scene.traverse((obj) => {
            if ((obj instanceof THREE.PointLight || obj instanceof THREE.SpotLight)) {
                if (obj.name === FLASHLIGHT.name) return;

                if (!sectorCtx.dynamicLights.includes(obj)) {
                    sectorCtx.dynamicLights.push(obj);
                    if (obj.userData.isCulled === undefined) obj.userData.isCulled = false;
                    if (obj.userData.baseIntensity === undefined) obj.userData.baseIntensity = obj.intensity;
                }
            }
        });
    }

    update(session: GameSessionLogic, _dt: number, _now: number) {
        this.frame++;
        const time = _now * 0.001;

        const sectorCtx = this.sectorContext.current;
        if (!sectorCtx) return;

        // 1. DYNAMIC LIGHT ANIMATIONS (Every frame)
        if (sectorCtx.dynamicLights) {
            const dynamicLights = sectorCtx.dynamicLights;
            const lightCount = dynamicLights.length;

            for (let i = 0; i < lightCount; i++) {
                const light = dynamicLights[i] as THREE.PointLight;
                const userData = light.userData;

                if (userData.isCulled) continue;

                // Motion: Swaying light
                if (userData.swing) {
                    if (!userData.origin) {
                        userData.origin = light.position.clone();
                    }
                    const swing = userData.swing;
                    const phase = swing.phase || 0;
                    const timeSpeedPhase = time * swing.speed + phase;

                    light.position.x = userData.origin.x + Math.sin(timeSpeedPhase) * swing.radius;
                    light.position.z = userData.origin.z + Math.cos(time * swing.speed * 0.8 + phase) * (swing.radius * 0.5);
                }

                // Pop: Pulsing light
                if (userData.pulse) {
                    const pulse = userData.pulse;
                    const base = userData.baseIntensity || 1;
                    const factor = (Math.sin(time * pulse.speed) + 1) * 0.5;
                    light.intensity = base * (pulse.min + factor * (pulse.max - pulse.min));
                }
            }
        }

        // 2. ORGANIC FLICKER LOGIC (Every frame)
        const flickerCount = this.flickeringLights.length;
        for (let i = 0; i < flickerCount; i++) {
            const fl = this.flickeringLights[i];
            if (fl.light.userData.isCulled) continue;

            const t = time * fl.flickerRate;
            const noise = (Math.sin(t) + Math.sin(t * 1.3) + Math.sin(t * 2.1)) * 0.3333;
            const normalizedNoise = (noise + 1) * 0.5;
            const pop = Math.random() > 0.95 ? 1.3 : 1.0;

            fl.light.intensity = fl.baseInt * (0.4 + normalizedNoise * 0.8) * pop;
        }

        // 3. MOBILE-SAFE CULLING & SHADOW BUDGETING (Every 15 frames)
        if (this.frame % 15 === 0 && this.playerGroup.current && sectorCtx.dynamicLights && session.engine.camera) {
            const dynamicLights = sectorCtx.dynamicLights;
            const pPos = this.playerGroup.current.position;
            const totalLights = dynamicLights.length;

            // Access the actual Three.js camera from your CameraSystem
            const engineCamera = session.engine.camera.threeCamera;

            // Update Frustum for visibility testing
            engineCamera.updateMatrixWorld();
            _projScreenMatrix.multiplyMatrices(engineCamera.projectionMatrix, engineCamera.matrixWorldInverse);
            _frustum.setFromProjectionMatrix(_projScreenMatrix);

            let sortableCount = 0;

            // Pass 1: Gather ALL lights and calculate their influence
            for (let i = 0; i < totalLights; i++) {
                if (sortableCount >= MAX_LIGHTS) break;

                const light = dynamicLights[i] as THREE.PointLight;
                const baseIntensity = light.userData.baseIntensity || 1;

                const dx = light.position.x - pPos.x;
                const dy = light.position.y - pPos.y;
                const dz = light.position.z - pPos.z;
                const distSq = dx * dx + dy * dy + dz * dz;

                let influence = -1; // Default -1 means "cull this light"

                // Broadphase: Is it reasonably close?
                if (distSq <= 15000) {
                    _lightSphere.set(light.position, light.distance > 0 ? light.distance : 15);

                    if (_frustum.intersectsSphere(_lightSphere)) {
                        influence = baseIntensity / (distSq + 0.1);
                    }
                }

                const scratchObj = _sortableLightsScratch[sortableCount];
                scratchObj.light = light;
                scratchObj.influence = influence;

                sortableCount++;
            }

            // Sort by highest influence first
            if (sortableCount > 1) {
                quickSortLightsDesc(_sortableLightsScratch, 0, sortableCount - 1);
            }

            // --- VITAL GPU SAFEGUARDS ---
            // Relying on the global constant to dictate the uniform payload size
            const engineRenderer = sectorCtx.engine?.renderer;
            const maxTextures = engineRenderer?.capabilities?.maxTextures || 16;
            const baseTextureUnits = 13;
            const SHADOW_BUDGET = Math.max(1, Math.min(MAX_SHADOW_CASTING_LIGHTS, maxTextures - baseTextureUnits));

            let visibleAssigned = 0;
            let shadowsAssigned = 0;

            // Pass 2: Apply states strictly bounded by uniform limits
            for (let i = 0; i < sortableCount; i++) {
                const lightInfo = _sortableLightsScratch[i];
                const light = lightInfo.light!;
                const userData = light.userData;
                const influence = lightInfo.influence;

                // Only the absolute top N lights are ALLOWED to be sent to the shader
                const canBeVisibleToShader = visibleAssigned < MAX_VISIBLE_LIGHTS;

                if (canBeVisibleToShader) {
                    light.visible = true;
                    visibleAssigned++;

                    if (influence > 0) {
                        // REAL LIGHT: It passed the frustum test and is important
                        if (userData.isCulled) {
                            light.intensity = userData.baseIntensity !== undefined ? userData.baseIntensity : 1;
                            userData.isCulled = false;
                        }

                        const shouldCastShadow = shadowsAssigned < SHADOW_BUDGET;
                        if (light.castShadow !== shouldCastShadow) light.castShadow = shouldCastShadow;
                        if (shouldCastShadow) shadowsAssigned++;

                    } else {
                        // PADDING LIGHT: Far away, but kept "visible" with 0 intensity 
                        // so Three.js doesn't recompile the shader (Zero-GC, Zero-Stutter)
                        if (!userData.isCulled) {
                            light.intensity = 0;
                            userData.isCulled = true;
                        }
                        if (light.castShadow) light.castShadow = false;
                    }

                } else {
                    // CULLED LIGHT: Completely stripped from the shader context to save GPU uniforms
                    if (light.visible) light.visible = false;
                    if (light.castShadow) light.castShadow = false;

                    if (!userData.isCulled) {
                        light.intensity = 0;
                        userData.isCulled = true;
                    }
                }
            }
        }
    }
}