import * as THREE from 'three';
import { System } from './System'; // Uppdatera sökvägen till din System-fil om det behövs!

export interface LogicalLight {
    isLogicalLight: boolean;
    position?: THREE.Vector3;
    targetObject?: THREE.Object3D;
    offset?: THREE.Vector3;
    color: number;
    intensity: number;
    distance: number;
    flickerRate?: number;    // Staccato drops (0.0-1.0)
    flickerSpeed?: number;   // Smooth oscillation frequency
    flickerSpread?: number;  // Smooth oscillation amplitude

    // --- Shadow System ---
    castShadow?: boolean;
    shadowBias?: number;
    shadowNormalBias?: number;
    shadowMapSize?: number;

    _sqDist?: number;
    _worldPos?: THREE.Vector3;
}

const MAX_PROXIES = 16;
const MAX_SHADOW_CASTERS = 2;

const _tempLights: LogicalLight[] = [];

export class LightSystem implements System {
    public id: string = 'light_system';

    private scene: THREE.Scene;
    private proxyPool: THREE.PointLight[] = [];

    constructor(scene: THREE.Scene) {
        this.scene = scene;
        this.initPool();
    }

    private initPool() {
        for (let i = 0; i < MAX_PROXIES; i++) {
            const proxy = new THREE.PointLight(); // defaults set here
            proxy.name = `ProxyLight_${i}`;
            proxy.userData.isProxy = true;
            proxy.position.set(0, -1000, 0);

            if (i < MAX_SHADOW_CASTERS) {
                proxy.castShadow = true;
                proxy.shadow.mapSize.set(256, 256);
                proxy.shadow.bias = -0.005;
                proxy.shadow.radius = 2;
            }

            this.scene.add(proxy);
            this.proxyPool.push(proxy);
        }
        //console.log(`[LightSystem] Initialized pool with ${MAX_PROXIES} proxies (${MAX_SHADOW_CASTERS} shadows)`);
    }

    // FIX 2: Signaturen matchar nu (context, delta, now)
    public update(context: any, delta: number, now: number): void {
        if (!context) return;
        const state = context.state || context;
        if (!state) return;

        const playerPos = context.playerPos || state.playerPos;
        const logicalLights = state.dynamicLights || context.dynamicLights;

        if (!logicalLights || logicalLights.length === 0 || !playerPos) return;

        _tempLights.length = 0;

        for (let i = 0; i < logicalLights.length; i++) {
            const logicalLight = logicalLights[i];

            console.log("[LightSystem] logicalLight: ", logicalLight);

            if (!logicalLight._worldPos) logicalLight._worldPos = new THREE.Vector3();

            if (logicalLight.targetObject) {
                logicalLight.targetObject.getWorldPosition(logicalLight._worldPos);
                if (logicalLight.offset) {
                    logicalLight._worldPos.x += logicalLight.offset.x;
                    logicalLight._worldPos.y += logicalLight.offset.y;
                    logicalLight._worldPos.z += logicalLight.offset.z;
                }
            } else if (logicalLight.position) {
                logicalLight._worldPos.copy(logicalLight.position);
            }

            const sqDist = logicalLight._worldPos.distanceToSquared(playerPos);
            if (sqDist < 3600) {
                logicalLight._sqDist = sqDist;
                _tempLights.push(logicalLight);
            }
        }

        // Priority Sorting for Shadow Casters
        // 1. Mandatory Shadow Casters (Closer is better)
        // 2. Normal lights by Distance
        _tempLights.sort((a, b) => {
            if (a.castShadow && !b.castShadow) return -1;
            if (!a.castShadow && b.castShadow) return 1;
            return (a._sqDist as number) - (b._sqDist as number);
        });

        for (let i = 0; i < MAX_PROXIES; i++) {
            const proxy = this.proxyPool[i];
            const ll = _tempLights[i];

            if (ll && ll._worldPos) {
                proxy.position.copy(ll._worldPos);
                proxy.color.setHex(ll.color);
                proxy.distance = ll.distance;

                // --- Apply Shadow Parameters if this proxy supports them ---
                if (i < MAX_SHADOW_CASTERS) {
                    // Force shadow toggle off if LogicLight doesn't request it (or another light took the slot)
                    proxy.castShadow = !!ll.castShadow;
                    if (proxy.castShadow) {
                        proxy.shadow.bias = ll.shadowBias !== undefined ? ll.shadowBias : -0.005;
                        proxy.shadow.normalBias = ll.shadowNormalBias !== undefined ? ll.shadowNormalBias : 0;
                        // Map size is expensive to change at runtime, we only do it if explicitly requested
                        if (ll.shadowMapSize && ll.shadowMapSize !== proxy.shadow.mapSize.x) {
                            proxy.shadow.mapSize.set(ll.shadowMapSize, ll.shadowMapSize);
                            if (proxy.shadow.map) {
                                proxy.shadow.map.dispose();
                                (proxy.shadow as any).map = null;
                            }
                        }
                    }
                }

                // Intensity:
                let currentIntensity = ll.intensity;

                // 1. Organic Pulse (Sinus)
                if (ll.flickerSpeed && ll.flickerSpread) {
                    currentIntensity += Math.sin(now * ll.flickerSpeed) * ll.flickerSpread;
                }
                // 2. Wind/Fuel Staccato (Rapid drops)
                if (ll.flickerRate && ll.flickerRate > 0) {
                    if (Math.random() < ll.flickerRate) {
                        currentIntensity *= (0.4 + Math.random() * 0.4);
                    }
                }

                proxy.intensity = Math.max(0, currentIntensity);
            } else {
                proxy.intensity = 0;
                proxy.position.set(0, -1000, 0);
            }
        }
    }
}