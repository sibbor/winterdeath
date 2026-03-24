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
    private frame: number = 0;
    private lightPool: THREE.PointLight[] = [];

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

        // 0. CLEANUP EXISTING PROXIES TO PREVENT PERFORMANCE LEAKS
        if (this.lightPool && this.lightPool.length > 0) {
            for (let i = 0; i < this.lightPool.length; i++) {
                const p = this.lightPool[i];
                if (p.parent && p.parent !== session.engine.scene) {
                    p.parent.remove(p);
                }
                if (!p.parent) session.engine.scene.add(p);

                // ZERO-GC: No visibility toggling.
                p.intensity = 0;
                p.position.set(0, -1000, 0);
            }
        } else {
            this.lightPool = [];
        }

        // 1. Identify all static lights from the level data
        session.engine.scene.traverse((obj) => {
            if (obj instanceof THREE.PointLight) {
                if (obj.name === FLASHLIGHT.name) return;
                if (obj.userData.isProxy) return;

                // SPECIAL GUARD: Fast loop instead of traverseAncestors (Zero-GC)
                let isPartOfActor = false;
                let parent = obj.parent;

                while (parent) {
                    if (parent.userData.isActor || parent.name.indexOf('enemy') !== -1 || parent.name.indexOf('zombie') !== -1) {
                        isPartOfActor = true;
                        break;
                    }
                    parent = parent.parent;
                }

                if (isPartOfActor) return;

                // Zero-GC array scan
                let isTracked = false;
                for (let i = 0; i < sectorCtx.dynamicLights.length; i++) {
                    if (sectorCtx.dynamicLights[i] === obj) {
                        isTracked = true;
                        break;
                    }
                }

                if (!isTracked) {
                    sectorCtx.dynamicLights.push(obj);
                    obj.userData.isCulled = true;
                    obj.userData.baseIntensity = obj.intensity;

                    // ZERO-GC: Hide the logical source completely for the GPU.
                    // Only our proxies should be visible to Three.js!
                    obj.intensity = 0;
                    obj.visible = false;
                }
            }
        });

        // 2. Spawn the Fixed Proxy Pool (ONLY if not already present from Preloader)
        // Check how many proxy lights the Preloader already placed in the scene.
        let existingProxies = 0;
        session.engine.scene.traverse((obj) => {
            if (obj instanceof THREE.PointLight && obj.userData.isProxy) {
                existingProxies++;
                if (this.lightPool.indexOf(obj) === -1) {
                    this.lightPool.push(obj);
                }
            }
        });

        // Let WinterEngine dictate the ceiling based on the GPU's actual hardware!
        const ENGINE_MAX_VISIBLE = session.engine.maxVisibleLights;
        const SHADOW_BUDGET = session.engine.maxSafeShadows;

        // Only spawn missing proxies
        const proxiesToSpawn = ENGINE_MAX_VISIBLE - existingProxies;

        for (let i = 0; i < proxiesToSpawn; i++) {
            const proxy = new THREE.PointLight(0x000000, 0, 10);
            proxy.name = `LightProxy_${existingProxies + i}`;
            proxy.userData.isProxy = true;
            proxy.userData.isCulled = true;
            proxy.position.set(0, -1000, 0);

            if ((existingProxies + i) < SHADOW_BUDGET) {
                proxy.castShadow = true;
                proxy.shadow.bias = -0.005;
                proxy.shadow.mapSize.set(256, 256);
            } else {
                proxy.castShadow = false;
            }

            // Always visible, just intensity 0
            proxy.visible = true;
            session.engine.scene.add(proxy);
            this.lightPool.push(proxy);
        }

        console.log(`[LightSystem] Initialized pool with ${this.lightPool.length} proxies (${SHADOW_BUDGET} shadows)`);
    }

    update(session: GameSessionLogic, _dt: number, _now: number) {
        this.frame++;
        const time = _now * 0.001;

        const sectorCtx = this.sectorContext.current;
        if (!sectorCtx || this.lightPool.length === 0) return;

        const dynamicLights = sectorCtx.dynamicLights;
        const lightCount = dynamicLights.length;

        // 1. SOURCE DATA ANIMATION (Swing, Pulse, Flicker)
        for (let i = 0; i < lightCount; i++) {
            const light = dynamicLights[i] as THREE.PointLight;
            const userData = light.userData;

            if (userData.swing) {
                if (!userData.origin) {
                    userData.origin = new THREE.Vector3().copy(light.position);
                }
                const s = userData.swing;
                const t = time * s.speed + (s.phase || 0);
                light.position.x = userData.origin.x + Math.sin(t) * s.radius;
                light.position.z = userData.origin.z + Math.cos(time * s.speed * 0.8 + (s.phase || 0)) * (s.radius * 0.5);
            }

            if (userData.pulse) {
                const s = userData.pulse;
                const base = userData.baseIntensity || 1;
                const factor = (Math.sin(time * s.speed) + 1) * 0.5;
                // We store the pulsing target in user data, the proxy reads it.
                userData.currentIntensity = base * (s.min + factor * (s.max - s.min));
            } else {
                userData.currentIntensity = userData.baseIntensity || 1;
            }
        }

        const flickerCount = this.flickeringLights.length;
        for (let i = 0; i < flickerCount; i++) {
            const fl = this.flickeringLights[i];
            const t = time * fl.flickerRate;
            const noise = (Math.sin(t) + Math.sin(t * 1.3) + Math.sin(t * 2.1)) * 0.3333;
            const normalizedNoise = (noise + 1) * 0.5;
            const pop = Math.random() > 0.95 ? 1.3 : 1.0;
            // Write to currentIntensity
            fl.light.userData.currentIntensity = fl.baseInt * (0.4 + normalizedNoise * 0.8) * pop;
        }

        // 2. PROXY MAPPING
        if (this.frame % 15 === 0 && this.playerGroup.current && session.engine.camera) {
            const pPos = this.playerGroup.current.position;
            const engineCamera = session.engine.camera.threeCamera;

            engineCamera.updateMatrixWorld();
            _projScreenMatrix.multiplyMatrices(engineCamera.projectionMatrix, engineCamera.matrixWorldInverse);
            _frustum.setFromProjectionMatrix(_projScreenMatrix);

            let sortableCount = 0;

            for (let i = 0; i < lightCount; i++) {
                if (sortableCount >= MAX_LIGHTS) break;

                const light = dynamicLights[i] as THREE.PointLight;
                const dx = light.position.x - pPos.x;
                const dy = light.position.y - pPos.y;
                const dz = light.position.z - pPos.z;
                const distSq = dx * dx + dy * dy + dz * dz;

                if (light.userData.isThrowable === undefined) {
                    const isNameT = light.name.indexOf('throwable') !== -1;
                    const isParentT = light.parent ? light.parent.name.indexOf('throwable') !== -1 : false;
                    light.userData.isThrowable = isNameT || isParentT;
                }

                const isThrowable = light.userData.isThrowable;
                const prioBoost = isThrowable ? 1000 : 0;
                let influence = 0;

                if (distSq <= 15000 || isThrowable) {
                    _lightSphere.set(light.position, light.distance > 0 ? light.distance : 15);
                    if (isThrowable || _frustum.intersectsSphere(_lightSphere)) {
                        influence = ((light.userData.baseIntensity || 1) / (distSq + 0.1)) + prioBoost;
                    }
                }

                _sortableLightsScratch[sortableCount].light = light;
                _sortableLightsScratch[sortableCount].influence = influence;
                sortableCount++;
            }

            if (sortableCount > 1) quickSortLightsDesc(_sortableLightsScratch, 0, sortableCount - 1);

            // Apply best sources to physical proxies
            for (let i = 0; i < this.lightPool.length; i++) {
                const proxy = this.lightPool[i];
                if (i < sortableCount && _sortableLightsScratch[i].influence > 0) {
                    const src = _sortableLightsScratch[i].light!;
                    proxy.position.copy(src.position);
                    proxy.color.copy(src.color);
                    proxy.intensity = src.userData.currentIntensity !== undefined ? src.userData.currentIntensity : (src.userData.baseIntensity || 1);
                    proxy.distance = src.distance;
                    proxy.decay = src.decay;
                } else {
                    // ZERO-GC: Hide proxy by burying it and setting intensity to 0
                    proxy.intensity = 0;
                    proxy.position.set(0, -1000, 0);
                }
            }
        } else {
            // Frame update: sync intensities for active proxies smoothly
            for (let i = 0; i < this.lightPool.length; i++) {
                const proxy = this.lightPool[i];
                if (proxy.intensity > 0 && i < _sortableLightsScratch.length) {
                    const src = _sortableLightsScratch[i].light;
                    if (src && src.userData.currentIntensity !== undefined) {
                        proxy.intensity = src.userData.currentIntensity;
                    }
                }
            }
        }
    }
}