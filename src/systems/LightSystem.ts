import * as THREE from 'three';
import { FLASHLIGHT, LIGHT_SYSTEM } from '../content/constants';
import { GameSessionLogic } from '../game/session/GameSessionLogic';
import { System } from './System';
import { SectorContext } from '../game/session/SectorTypes';

interface FlickeringLight {
    light: THREE.PointLight;
    baseInt: number;
    flickerRate: number;
}

// Absolute max dynamic lights tracked by the CPU per sector.
const MAX_LIGHTS = 1024;
const _sortableLightsScratch: { light: THREE.PointLight | null, influence: number }[] = new Array(MAX_LIGHTS);
for (let i = 0; i < MAX_LIGHTS; i++) {
    _sortableLightsScratch[i] = { light: null, influence: 0 };
}

// Zero-GC objects for Frustum Culling visibility checks
const _frustum = new THREE.Frustum();
const _projScreenMatrix = new THREE.Matrix4();
const _lightSphere = new THREE.Sphere();

// Zero-GC In-place QuickSort
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

export class LightSystem implements System {
    id = 'lightsystem';

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
            if (obj instanceof THREE.PointLight) {
                // Flashlight is ignored. It is handled separately and can never be turned off.
                if (obj.name === FLASHLIGHT.name) return;

                if (!sectorCtx.dynamicLights.includes(obj)) {
                    sectorCtx.dynamicLights.push(obj);
                    if (obj.userData.isCulled === undefined) obj.userData.isCulled = false;
                    if (obj.userData.baseIntensity === undefined) obj.userData.baseIntensity = obj.intensity;
                }
            }
        });

        // GUARANTEE: Fill up with dummy lights so we ALWAYS have exactly as many 
        // lights in the scene as the shader program expects. This solves black screens and recompiles.
        const ENGINE_MAX_VISIBLE = (session.engine as any).maxVisibleLights || LIGHT_SYSTEM.MAX_VISIBLE_LIGHTS;
        while (sectorCtx.dynamicLights.length < ENGINE_MAX_VISIBLE) {
            const dummy = new THREE.PointLight(0x000000, 0, 0.1);
            dummy.position.set(0, -1000, 0); // Hide far away
            dummy.userData.isCulled = true;
            dummy.userData.baseIntensity = 0;
            dummy.name = 'DummyPaddingLight';
            session.engine.scene.add(dummy);
            sectorCtx.dynamicLights.push(dummy);
        }
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

        // 3. ZERO-RECOMPILE CULLING & SHADOW BUDGETING (Every 15 frames)
        if (this.frame % 15 === 0 && this.playerGroup.current && sectorCtx.dynamicLights && session.engine.camera) {
            const dynamicLights = sectorCtx.dynamicLights;
            const pPos = this.playerGroup.current.position;
            const totalLights = dynamicLights.length;

            const engineCamera = session.engine.camera.threeCamera;
            engineCamera.updateMatrixWorld();
            _projScreenMatrix.multiplyMatrices(engineCamera.projectionMatrix, engineCamera.matrixWorldInverse);
            _frustum.setFromProjectionMatrix(_projScreenMatrix);

            let sortableCount = 0;

            // Pass 1: Gather ALL active lights and calculate their influence
            for (let i = 0; i < totalLights; i++) {
                if (sortableCount >= MAX_LIGHTS) break;

                const light = dynamicLights[i] as THREE.PointLight;
                const baseIntensity = light.userData.baseIntensity || 1;

                const dx = light.position.x - pPos.x;
                const dy = light.position.y - pPos.y;
                const dz = light.position.z - pPos.z;
                const distSq = dx * dx + dy * dy + dz * dz;

                // If the light belongs to a Throwable (e.g. a Molotov), 
                // give it extremely high priority (influence + 1000) so it never turns off while flying.
                const isThrowable = light.name.includes('throwable') || light.parent?.name.includes('throwable');
                const prioBoost = isThrowable ? 1000 : 0;

                let influence = 0;

                if (distSq <= 15000 || isThrowable) {
                    _lightSphere.set(light.position, light.distance > 0 ? light.distance : 15);
                    if (_frustum.intersectsSphere(_lightSphere) || isThrowable) {
                        influence = (baseIntensity / (distSq + 0.1)) + prioBoost;
                    }
                }

                const scratchObj = _sortableLightsScratch[sortableCount];
                scratchObj.light = light;
                scratchObj.influence = influence;
                sortableCount++;
            }

            if (sortableCount > 1) {
                quickSortLightsDesc(_sortableLightsScratch, 0, sortableCount - 1);
            }

            // --- VITAL GPU SAFEGUARDS ---
            // Get the dynamic limit from the engine, fallback to constants if not loaded yet
            const ENGINE_MAX_VISIBLE = (session.engine as any).maxVisibleLights || LIGHT_SYSTEM.MAX_VISIBLE_LIGHTS;
            const SHADOW_BUDGET = (session.engine as any).maxSafeShadows ?? LIGHT_SYSTEM.MAX_SHADOW_CASTING_LIGHTS;

            let visibleAssigned = 0; // Added this back to track active visible slots for padding logic!

            // Pass 2: STRICT ASSIGNMENT. We force exactly N lights to be visible and exactly M to cast shadows.
            // This prevents Three.js from ever changing the shader signature.
            for (let i = 0; i < sortableCount; i++) {
                const lightInfo = _sortableLightsScratch[i];
                const light = lightInfo.light!;
                const influence = lightInfo.influence;
                const userData = light.userData;

                const isVisibleSlot = i < ENGINE_MAX_VISIBLE;
                const isShadowSlot = i < SHADOW_BUDGET;

                if (isVisibleSlot) {
                    visibleAssigned++; // We have occupied a visible slot

                    // This light MUST be visible to fill the shader quota
                    if (!light.visible) light.visible = true;
                    if (light.castShadow !== isShadowSlot) light.castShadow = isShadowSlot;

                    if (influence > 0) {
                        // Real light that the player should see
                        if (userData.isCulled) {
                            light.intensity = userData.baseIntensity !== undefined ? userData.baseIntensity : 1;
                            userData.isCulled = false;
                        }
                    } else {
                        // This is a padding light to prevent shader crashes
                        if (!userData.isCulled) {
                            light.intensity = 0;
                            userData.isCulled = true;
                        }
                    }
                } else {
                    // Completely outside the quota - turn everything off.
                    if (light.visible) light.visible = false;
                    if (light.castShadow) light.castShadow = false;
                    if (!userData.isCulled) {
                        light.intensity = 0;
                        userData.isCulled = true;
                    }
                }
            }

            // PADDING FIX: If there are FEWER lights in the level than the engine's MAX_VISIBLE_LIGHTS
            // we must ensure we don't force shader recompiles. The WebGL engine always wants the same number.
            // Solution: Keep the "fake" lights visible=true with intensity=0.
            if (visibleAssigned < ENGINE_MAX_VISIBLE && dynamicLights.length > visibleAssigned) {
                for (let i = 0; i < dynamicLights.length; i++) {
                    if (visibleAssigned >= ENGINE_MAX_VISIBLE) break;

                    const paddingLight = dynamicLights[i] as THREE.PointLight;
                    // Find lights that were turned off due to Frustum Culling and use them as "dummies"
                    if (!paddingLight.visible) {
                        paddingLight.visible = true;
                        paddingLight.intensity = 0;
                        paddingLight.castShadow = false;
                        paddingLight.userData.isCulled = true;
                        visibleAssigned++;
                    }
                }
            }
        }
    }
}