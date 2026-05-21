import * as THREE from 'three';
import { System, SystemID } from './System';
import { LIGHT_SYSTEM, LIGHT_SETTINGS } from '../content/constants';
import { ChunkManager } from '../core/world/ChunkManager';
import { EffectPool, SubEffectType } from './EffectManager';

export interface LogicalLight {
    isLogicalLight: boolean;
    position?: THREE.Vector3;
    targetObject?: THREE.Object3D;
    offset?: THREE.Vector3;
    color: number;
    intensity: number;
    distance: number;
    flickerRate?: number;
    flickerSpeed?: number;
    flickerSpread?: number;
    castShadow?: boolean;
    shadowBias?: number;
    shadowNormalBias?: number;
    shadowMapSize?: number;

    // Zero-GC data
    currentChunkKey?: number;
    _sqDist?: number;
    _worldPos?: THREE.Vector3;
}

const _shadowLights: LogicalLight[] = [];
const _normalLights: LogicalLight[] = [];
const _c1 = new THREE.Color();
const _v1 = new THREE.Vector3();
let _lastLightSource: LogicalLight[] | null = null;

export class LightSystem implements System {
    readonly systemId = SystemID.LIGHT;
    public id: string = 'light_system';
    public enabled: boolean = true;
    public persistent: boolean = true;

    private scene: THREE.Scene;
    private proxyPool: THREE.PointLight[] = [];
    private maxProxies: number;
    private maxShadows: number;

    // Internal spatial index for lights (O(1) Flat Layout)
    private readonly lightLists: LogicalLight[][] = Array.from({ length: ChunkManager.MAX_CHUNKS }, () => []);
    private dynamicLightsList: LogicalLight[] = [];

    constructor(scene: THREE.Scene, maxProxies: number = LIGHT_SYSTEM.MAX_VISIBLE_LIGHTS,
        maxShadows: number = LIGHT_SYSTEM.MAX_SHADOW_CASTING_LIGHTS) {
        this.scene = scene;
        this.maxProxies = maxProxies;
        this.maxShadows = maxShadows;
        this.initPool();
    }

    private initPool() {
        for (let i = 0; i < this.maxProxies; i++) {
            const proxy = new THREE.PointLight(
                LIGHT_SETTINGS.DEFAULT_COLOR,
                0,
                LIGHT_SETTINGS.DEFAULT_DISTANCE);
            proxy.name = `ProxyLight_${i}`;
            proxy.userData.isPersistent = true;
            proxy.userData.isProxy = true;
            proxy.userData.isEngineStatic = true;
            proxy.position.set(0, -1000, 0);

            // Shadow settings locked for all future
            if (i < this.maxShadows) {
                proxy.castShadow = true;
                proxy.shadow.mapSize.set(LIGHT_SETTINGS.SHADOW_MAP_SIZE, LIGHT_SETTINGS.SHADOW_MAP_SIZE);
                proxy.shadow.bias = LIGHT_SETTINGS.SHADOW_BIAS;
                proxy.shadow.radius = LIGHT_SETTINGS.SHADOW_RADIUS;
            } else {
                proxy.castShadow = false;
            }

            this.scene.add(proxy);
            this.proxyPool.push(proxy);
        }
    }

    public update(context: any, delta: number, simTime: number, renderTime: number): void {
        if (!context) return;
        const state = context.state || context;
        if (!state) return;

        const playerPos = context.playerPos || state.playerPos;
        const logicalLights = state.dynamicLights || context.dynamicLights;

        if (!logicalLights || logicalLights.length === 0 || !playerPos) {
            this.hideAllProxies();
            return;
        }

        // --- 2. SPATIAL AUDIT ---
        _shadowLights.length = 0;
        _normalLights.length = 0;

        // 3. Process Static Lights in Active Chunks (Optimized: Bounded Loop)
        for (let i = 0; i < ChunkManager.MAX_CHUNKS; i++) {
            if (ChunkManager.isActive(i)) {
                const bucket = this.lightLists[i];
                const bLen = bucket.length;
                for (let j = 0; j < bLen; j++) {
                    const l = bucket[j];
                    if (!l._worldPos) l._worldPos = new THREE.Vector3();
                    if (l.position) l._worldPos.copy(l.position);

                    const sqDist = l._worldPos.distanceToSquared(playerPos);
                    // Standard Light Culling (60 units)
                    if (sqDist < 3600) {
                        l._sqDist = sqDist;
                        if (l.castShadow) _shadowLights.push(l);
                        else _normalLights.push(l);
                    }
                }
            }
        }

        // 4. Process Dynamic Lights (Muzzle flashes, player lights, attached lights)
        if (logicalLights) {
            const dLen = logicalLights.length;
            for (let i = 0; i < dLen; i++) {
                const l = logicalLights[i];

                if (!l._worldPos) l._worldPos = new THREE.Vector3();

                if (l.targetObject) {
                    l.targetObject.getWorldPosition(l._worldPos);
                    if (l.offset) {
                        l._worldPos.x += l.offset.x;
                        l._worldPos.y += l.offset.y;
                        l._worldPos.z += l.offset.z;
                    }
                } else if (l.position) {
                    l._worldPos.copy(l.position);
                }

                const sqDist = l._worldPos.distanceToSquared(playerPos);
                if (sqDist < 3600) {
                    l._sqDist = sqDist;
                    if (l.castShadow) _shadowLights.push(l);
                    else _normalLights.push(l);
                }
            }
        }

        // --- 5. MAP TO PROXIES (Optimized: No Sort, Ordered Priority) ---
        let proxyIdx = 0;

        // Priority 1: Shadow-casting lights
        for (let i = 0; i < _shadowLights.length && proxyIdx < this.maxProxies; i++) {
            const proxy = this.proxyPool[proxyIdx];
            const l = _shadowLights[i];
            this.mapToProxy(proxy, l, renderTime);
            proxyIdx++;
        }

        // Priority 2: Standard lights (filling remainder)
        for (let i = 0; i < _normalLights.length && proxyIdx < this.maxProxies; i++) {
            const proxy = this.proxyPool[proxyIdx];
            const l = _normalLights[i];
            this.mapToProxy(proxy, l, renderTime);
            proxyIdx++;
        }


        // Phase 6: Map EffectPool Lights
        // These are handled separately to avoid object allocation in Phase 5
        const effectCount = EffectPool.activeCount;
        for (let i = 0; i < effectCount && proxyIdx < this.maxProxies; i++) {
            if (EffectPool.type[i] !== SubEffectType.LIGHT) continue;

            const target = EffectPool.target[i];
            if (!target || !target.visible) continue;

            const offX = EffectPool.offsetX[i];
            const offY = EffectPool.offsetY[i];
            const offZ = EffectPool.offsetZ[i];

            // LOD Check
            const tx = target.position.x + offX;
            const ty = target.position.y + offY;
            const tz = target.position.z + offZ;

            const dx = tx - playerPos.x;
            const dz = tz - playerPos.z;
            const distSq = dx * dx + dz * dz;

            if (distSq > 3600) continue;

            const proxy = this.proxyPool[proxyIdx];
            proxy.position.set(tx, ty, tz);
            proxy.color.setHex(EffectPool.color[i]);
            proxy.distance = EffectPool.distance[i];

            let intensity = EffectPool.intensity[i];

            // EffectPool Flicker Logic (Simplified for fire/muzzle flashes)
            if (EffectPool.flicker[i] > 0) {
                intensity *= (0.8 + Math.random() * 0.4);
                if (Math.random() > 0.9) intensity *= 0.5; // Random dip
            }

            proxy.intensity = intensity;
            proxyIdx++;
        }

        // Clean up remaining proxies
        for (let i = proxyIdx; i < this.maxProxies; i++) {
            this.proxyPool[i].intensity = 0;
            this.proxyPool[i].position.set(0, -1000, 0);
        }
    }

    public rebuildBuckets(lights: LogicalLight[]) {
        // Optimization: Only rebuild if the reference to the global list changed
        if (_lastLightSource === lights) return;
        _lastLightSource = lights;

        for (let i = 0; i < ChunkManager.MAX_CHUNKS; i++) {
            this.lightLists[i].length = 0;
        }
        this.dynamicLightsList.length = 0;

        for (let i = 0; i < lights.length; i++) {
            const l = lights[i];

            // Enforce vector initialization to prevent lazy allocations in hot-path
            if (!l._worldPos) l._worldPos = new THREE.Vector3();

            // Attached lights (targetObject) go to the dynamic list
            if (l.targetObject) {
                this.dynamicLightsList.push(l);
            } else if (l.position) {
                const nx = ChunkManager.getCoordIndex(l.position.x);
                const nz = ChunkManager.getCoordIndex(l.position.z);
                const idx = (nz * ChunkManager.GRID_DIM) + nx;

                l.currentChunkKey = ChunkManager.getSmiKey(nx, nz);
                if (idx >= 0 && idx < ChunkManager.MAX_CHUNKS) {
                    this.lightLists[idx].push(l);
                }
            }
        }
    }


    private mapToProxy(proxy: THREE.PointLight, logicLight: LogicalLight, renderTime: number) {
        if (!logicLight._worldPos) return;

        proxy.position.copy(logicLight._worldPos);
        proxy.color.setHex(logicLight.color);
        proxy.distance = logicLight.distance;

        let currentIntensity = logicLight.intensity;

        // --- EDGE PROTECTION: SOFT CULLING FADE (Prevents popping) ---
        // Fading starts at 50 units (2500 sqDist) and reaches zero at 60 units (3600 sqDist)
        const sqDist = logicLight._sqDist || 0;
        if (sqDist > 2500) {
            const fadeFactor = 1.0 - (sqDist - 2500) / (3600 - 2500);
            // Force the factor to stay strictly between 0.0 and 1.0 without if-statements
            currentIntensity *= (fadeFactor < 0.0 ? 0.0 : (fadeFactor > 1.0 ? 1.0 : fadeFactor));
        }

        // --- VINTERDÖD FLICKER LOGIC ---
        if (logicLight.flickerSpeed !== undefined) {
            const speed = logicLight.flickerSpeed;
            const spread = logicLight.flickerSpread || 0;
            const rate = logicLight.flickerRate || 1;
            currentIntensity += Math.sin(renderTime * speed) * spread;
            if (Math.random() < rate) currentIntensity += (Math.random() - 0.5) * spread * 0.5;
        }

        proxy.intensity = Math.max(0, currentIntensity);
    }

    private hideAllProxies() {

        for (let i = 0; i < this.maxProxies; i++) {
            this.proxyPool[i].intensity = 0;
            this.proxyPool[i].position.set(0, -1000, 0);
        }
    }

    public reAttach(newScene: THREE.Scene): void {
        this.scene = newScene;
        for (let i = 0; i < this.proxyPool.length; i++) {
            newScene.add(this.proxyPool[i]);
        }
    }

    public clear(): void {
        this.hideAllProxies();
        for (let i = 0; i < ChunkManager.MAX_CHUNKS; i++) {
            this.lightLists[i].length = 0;
        }
        this.dynamicLightsList.length = 0;
        _lastLightSource = null;
    }

}