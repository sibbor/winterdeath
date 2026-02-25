import * as THREE from 'three';
import { GameSessionLogic } from '../GameSessionLogic';
import { System } from './System';
import { SectorContext } from '../../types/SectorEnvironment';

interface FlickeringLight {
    light: THREE.PointLight;
    baseInt: number;
    flickerRate: number;
}

// Scratchpads for sorting to avoid GC
const _sortableLightsScratch: { light: THREE.PointLight, distSq: number }[] = [];
for (let i = 0; i < 128; i++) {
    _sortableLightsScratch.push({ light: null as any, distSq: 0 });
}

export class LightingSystem implements System {
    id = 'lighting';

    private flickeringLights: FlickeringLight[];
    private sectorContext: { current: SectorContext | null };
    private playerGroup: { current: THREE.Group | null };
    private frame: number = 0;

    constructor(
        flickeringLights: FlickeringLight[],
        sectorContext: { current: SectorContext | null },
        playerGroup: { current: THREE.Group | null }
    ) {
        this.flickeringLights = flickeringLights;
        this.sectorContext = sectorContext;
        this.playerGroup = playerGroup;
    }

    update(_session: GameSessionLogic, _dt: number, _now: number) {
        this.frame++;

        // 1. Flicker Logic (Every frame)
        for (let i = 0; i < this.flickeringLights.length; i++) {
            const fl = this.flickeringLights[i];

            // Skip culled lights to avoid accidentally re-enabling them
            if (fl.light.userData.isCulled) continue;

            if (Math.random() < fl.flickerRate) {
                fl.light.intensity = fl.baseInt * (0.5 + Math.random());
            }
        }

        // 2. Culling Logic (Every 15 frames)
        if (this.frame % 15 === 0 && this.playerGroup.current && this.sectorContext.current?.dynamicLights) {
            const dynamicLights = this.sectorContext.current.dynamicLights;
            const pPos = this.playerGroup.current.position;

            let lightCount = 0;
            for (let i = 0; i < dynamicLights.length; i++) {
                const light = dynamicLights[i] as any;
                if (light.name === 'flashlight') continue;

                if (!_sortableLightsScratch[lightCount]) {
                    _sortableLightsScratch.push({ light: null as any, distSq: 0 });
                }
                _sortableLightsScratch[lightCount].light = light;
                _sortableLightsScratch[lightCount].distSq = light.position.distanceToSquared(pPos);
                lightCount++;
            }

            // Fast insertion sort to avoid .sort() GC allocation
            for (let i = 1; i < lightCount; i++) {
                let key = _sortableLightsScratch[i];
                let j = i - 1;
                while (j >= 0 && _sortableLightsScratch[j].distSq > key.distSq) {
                    _sortableLightsScratch[j + 1] = _sortableLightsScratch[j];
                    j = j - 1;
                }
                _sortableLightsScratch[j + 1] = key;
            }

            // Apply Culling and Shadow Budgeting (Fix for 16 Texture Unit Limit)
            // Dynamically calculate budget based on GPU capabilities.
            // maxTextures is the total slots. We reserve ~8 for material maps, env, etc.
            const engineRenderer = this.sectorContext.current?.engine?.renderer;
            const maxTextures = engineRenderer?.capabilities?.maxTextures || 16;
            const SHADOW_BUDGET = Math.max(4, maxTextures - 8);
            let shadowsAssigned = 0;

            for (let i = 0; i < lightCount; i++) {
                const lightInfo = _sortableLightsScratch[i];
                const light = lightInfo.light;
                const isActive = (i < 32 || lightInfo.distSq < 3600); // 32 lights or 60m radius

                if (isActive) {
                    if (light.userData.isCulled) {
                        light.intensity = light.userData.baseIntensity !== undefined ? light.userData.baseIntensity : 1;
                        light.userData.isCulled = false;
                    }

                    // Shadow Budgeting: Only allow the absolute closest lights to cast shadows
                    const shouldCastShadow = shadowsAssigned < SHADOW_BUDGET && lightInfo.distSq < 1600; // 40m for shadows
                    if (light.castShadow !== shouldCastShadow) {
                        light.castShadow = shouldCastShadow;
                    }
                    if (shouldCastShadow) shadowsAssigned++;

                } else {
                    if (!light.userData.isCulled) {
                        if (light.intensity > 0) light.userData.baseIntensity = light.intensity;
                        light.intensity = 0;
                        light.userData.isCulled = true;
                        light.castShadow = false; // Always disable shadow for culled lights
                    }
                }
            }
        }
    }
}