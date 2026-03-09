import * as THREE from 'three';
import { GameSessionLogic } from '../GameSessionLogic';
import { System } from './System';
import { SectorContext } from '../../types/SectorEnvironment';

interface FlickeringLight {
    light: THREE.PointLight;
    baseInt: number;
    flickerRate: number;
}

// Scratchpads for sorting to avoid GC allocation during the game loop
const _sortableLightsScratch: { light: THREE.PointLight, distSq: number }[] = [];
for (let i = 0; i < 128; i++) {
    _sortableLightsScratch.push({ light: null as any, distSq: 0 });
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

    update(_session: GameSessionLogic, _dt: number, _now: number) {
        this.frame++;
        const time = _now * 0.001; // Convert ms to seconds for smooth math

        // 1. DYNAMIC LIGHT ANIMATIONS (Every frame)
        // Handles swaying (wind) and pulsing
        if (this.sectorContext.current?.dynamicLights) {
            const dynamicLights = this.sectorContext.current.dynamicLights;

            for (let i = 0; i < dynamicLights.length; i++) {
                const light = dynamicLights[i] as THREE.PointLight;
                if (light.userData.isCulled) continue;

                // Motion: Swinging light
                if (light.userData.swing) {
                    if (!light.userData.origin) {
                        light.userData.origin = light.position.clone();
                    }
                    const swing = light.userData.swing;
                    const phase = swing.phase || 0;

                    light.position.x = light.userData.origin.x + Math.sin(time * swing.speed + phase) * swing.radius;
                    light.position.z = light.userData.origin.z + Math.cos(time * swing.speed * 0.8 + phase) * (swing.radius * 0.5);
                }

                // Pop: Pulsing light
                if (light.userData.pulse) {
                    const pulse = light.userData.pulse;
                    const base = light.userData.baseIntensity || 1;

                    const factor = (Math.sin(time * pulse.speed) + 1) * 0.5;
                    light.intensity = base * (pulse.min + factor * (pulse.max - pulse.min));
                }
            }
        }

        // 2. ORGANIC FLICKER LOGIC (Every frame)
        for (let i = 0; i < this.flickeringLights.length; i++) {
            const fl = this.flickeringLights[i];

            if (fl.light.userData.isCulled) continue;

            // Organic noise using combined sine waves
            const t = time * fl.flickerRate;
            const noise = (Math.sin(t) + Math.sin(t * 1.3) + Math.sin(t * 2.1)) / 3;
            const normalizedNoise = (noise + 1) * 0.5;

            // Sharp "pops"
            const pop = Math.random() > 0.95 ? 1.3 : 1.0;

            fl.light.intensity = fl.baseInt * (0.4 + normalizedNoise * 0.8) * pop;
        }

        // 3. CULLING & SHADOW BUDGETING (Every 15 frames)
        if (this.frame % 15 === 0 && this.playerGroup.current && this.sectorContext.current?.dynamicLights) {
            const dynamicLights = this.sectorContext.current.dynamicLights;
            const pPos = this.playerGroup.current.position;

            let lightCount = 0;
            for (let i = 0; i < dynamicLights.length; i++) {
                const light = dynamicLights[i] as THREE.PointLight;
                if (light.name === 'flashlight' || light.name === 'vehicleLight') continue;

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

            // Apply Culling and Shadow Budgeting 
            const engineRenderer = this.sectorContext.current?.engine?.renderer;
            const maxTextures = engineRenderer?.capabilities?.maxTextures || 16;

            // Standard PBR materials + environment map + directional light shadow map 
            // can easily consume 13 texture units. We allocate the remainder to point light shadows,
            // capping absolutely at 8 to prevent vertex shader instruction limits.
            const baseTextureUnits = 13;
            const SHADOW_BUDGET = Math.max(1, Math.min(8, maxTextures - baseTextureUnits));
            let shadowsAssigned = 0;

            for (let i = 0; i < lightCount; i++) {
                const lightInfo = _sortableLightsScratch[i];
                const light = lightInfo.light;
                const isActive = (i < 32 || lightInfo.distSq < 3600);

                // Zero-GC Shader Fix: Pad shadows exactly to SHADOW_BUDGET
                const shouldCastShadow = shadowsAssigned < SHADOW_BUDGET;

                if (isActive) {
                    if (light.userData.isCulled) {
                        light.intensity = light.userData.baseIntensity !== undefined ? light.userData.baseIntensity : 1;
                        light.userData.isCulled = false;
                    }

                    if (light.castShadow !== shouldCastShadow) {
                        light.castShadow = shouldCastShadow;
                    }
                    if (shouldCastShadow) shadowsAssigned++;

                } else {
                    if (!light.userData.isCulled) {
                        if (light.intensity > 0 && !light.userData.swing && !light.userData.pulse) {
                            light.userData.baseIntensity = light.intensity;
                        }
                        light.intensity = 0;
                        light.userData.isCulled = true;
                    }
                    // Keep castShadow padded to maintain shader permutation cache
                    if (light.castShadow !== shouldCastShadow) {
                        light.castShadow = shouldCastShadow;
                    }
                    if (shouldCastShadow) shadowsAssigned++;
                }
            }
        }
    }
}