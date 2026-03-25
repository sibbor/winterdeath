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
    flickerRate: number;
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
            const proxy = new THREE.PointLight(0x000000, 0, 10);
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
        console.log(`[LightSystem] Initialized pool with ${MAX_PROXIES} proxies (${MAX_SHADOW_CASTERS} shadows)`);
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
            const ll = logicalLights[i];

            if (!ll._worldPos) ll._worldPos = new THREE.Vector3();

            if (ll.targetObject) {
                ll.targetObject.getWorldPosition(ll._worldPos);
                if (ll.offset) {
                    ll._worldPos.x += ll.offset.x;
                    ll._worldPos.y += ll.offset.y;
                    ll._worldPos.z += ll.offset.z;
                }
            } else if (ll.position) {
                ll._worldPos.copy(ll.position);
            }

            const sqDist = ll._worldPos.distanceToSquared(playerPos);
            if (sqDist < 3600) {
                ll._sqDist = sqDist;
                _tempLights.push(ll);
            }
        }

        _tempLights.sort((a, b) => (a._sqDist as number) - (b._sqDist as number));

        for (let i = 0; i < MAX_PROXIES; i++) {
            const proxy = this.proxyPool[i];
            const ll = _tempLights[i];

            if (ll && ll._worldPos) {
                proxy.position.copy(ll._worldPos);
                proxy.color.setHex(ll.color);
                proxy.distance = ll.distance;

                let currentIntensity = ll.intensity;
                if (ll.flickerRate > 0) {
                    if (Math.random() < ll.flickerRate) {
                        currentIntensity *= (0.2 + Math.random() * 0.5);
                    }
                }
                proxy.intensity = currentIntensity;

            } else {
                proxy.intensity = 0;
                proxy.position.set(0, -1000, 0);
            }
        }
    }
}