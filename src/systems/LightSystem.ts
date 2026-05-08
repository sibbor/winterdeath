import * as THREE from 'three';
import { System, SystemID } from './System';
import { LIGHT_SYSTEM, LIGHT_SETTINGS } from '../content/constants';
import { ChunkManager } from '../core/world/ChunkManager';

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

const _tempLights: LogicalLight[] = [];
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

    // Internal spatial index for lights (SMI Key -> LogicalLight[])
    private lightBuckets = new Map<number, LogicalLight[]>();
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

        // --- SPATIAL AUDIT ---
        // 1. Re-bucket lights if they changed (usually during init or effect spawn)
        // Optimization: In a real mission, we'd only do this when the array reference changes.
        this.rebuildBuckets(logicalLights);

        _tempLights.length = 0;

        // 2. Query Active Chunks (Zero-GC)
        const activeKeys = ChunkManager.getActiveKeys();
        
        // 3. Process Static Lights in Active Chunks
        activeKeys.forEach(key => {
            const bucket = this.lightBuckets.get(key);
            if (bucket) {
                for (let i = 0; i < bucket.length; i++) {
                    const l = bucket[i];
                    if (!l._worldPos) l._worldPos = new THREE.Vector3();
                    if (l.position) l._worldPos.copy(l.position);
                    
                    const sqDist = l._worldPos.distanceToSquared(playerPos);
                    // Standard Light Culling (60 units)
                    if (sqDist < 3600) {
                        l._sqDist = sqDist;
                        _tempLights.push(l);
                    }
                }
            }
        });

        // 4. Process Dynamic Lights (Muzzle flashes, player lights, attached lights)
        // These are exempt from chunking because they move every frame.
        for (let i = 0; i < this.dynamicLightsList.length; i++) {
            const l = this.dynamicLightsList[i];
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
                _tempLights.push(l);
            }
        }

        // Sortera: Skugg-älskare först, sedan de som är närmast spelaren
        _tempLights.sort((a, b) => {
            if (a.castShadow && !b.castShadow) return -1;
            if (!a.castShadow && b.castShadow) return 1;
            return (a._sqDist as number) - (b._sqDist as number);
        });

        // Map logiska ljus till fysiska Proxies
        for (let i = 0; i < this.maxProxies; i++) {
            const proxy = this.proxyPool[i];
            const logicLight = _tempLights[i];

            if (logicLight && logicLight._worldPos) {
                proxy.position.copy(logicLight._worldPos);
                proxy.color.setHex(logicLight.color);
                proxy.distance = logicLight.distance;

                let currentIntensity = logicLight.intensity;

                // --- VINTERDÖD FLICKER LOGIC ---
                // Low-cost sine-based flicker for fires and damaged lights
                if (logicLight.flickerSpeed !== undefined) {
                    const speed = logicLight.flickerSpeed;
                    const spread = logicLight.flickerSpread || 0;
                    const rate = logicLight.flickerRate || 1;

                    // Simple pulse + optional noise jump
                    currentIntensity += Math.sin(renderTime * speed) * spread;

                    if (Math.random() < rate) {
                        currentIntensity += (Math.random() - 0.5) * spread * 0.5;
                    }
                }

                // --- VINTERDÖD SHADOW CONFIG ---
                if (proxy.castShadow) {
                    if (logicLight.shadowBias !== undefined) proxy.shadow.bias = logicLight.shadowBias;
                    if (logicLight.shadowNormalBias !== undefined) proxy.shadow.normalBias = logicLight.shadowNormalBias;
                    if (logicLight.shadowMapSize !== undefined) {
                        proxy.shadow.mapSize.set(logicLight.shadowMapSize, logicLight.shadowMapSize);
                    }
                }

                proxy.intensity = Math.max(0, currentIntensity);
            } else {
                proxy.intensity = 0;
                proxy.position.set(0, -1000, 0);
                proxy.distance = 0.01;
            }
        }
    }

    private rebuildBuckets(lights: LogicalLight[]) {
        // Optimization: Only rebuild if the reference to the global list changed
        if (_lastLightSource === lights) return;
        _lastLightSource = lights;

        this.lightBuckets.forEach(b => b.length = 0);
        this.dynamicLightsList.length = 0;

        for (let i = 0; i < lights.length; i++) {
            const l = lights[i];
            
            // Attached lights (targetObject) go to the dynamic list
            if (l.targetObject) {
                this.dynamicLightsList.push(l);
            } else if (l.position) {
                const nx = ChunkManager.getCoordIndex(l.position.x);
                const nz = ChunkManager.getCoordIndex(l.position.z);
                const key = ChunkManager.getSmiKey(nx, nz);
                
                l.currentChunkKey = key;
                let bucket = this.lightBuckets.get(key);
                if (!bucket) {
                    bucket = [];
                    this.lightBuckets.set(key, bucket);
                }
                bucket.push(l);
            }
        }
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
            this.scene.add(this.proxyPool[i]);
        }
    }

}
