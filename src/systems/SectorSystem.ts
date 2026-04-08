import * as THREE from 'three';
import { System } from './System';
import { GameSessionLogic } from '../game/session/GameSessionLogic';
import { SectorDef } from '../game/session/SectorTypes';
import { EnemyManager } from '../entities/enemies/EnemyManager';
import { EnemyType, NoiseType } from '../entities/enemies/EnemyTypes';
import { LIGHT_SYSTEM } from '../content/constants';
import { Sector0 } from '../content/sectors/Sector0';
import { Sector1 } from '../content/sectors/Sector1';
import { Sector2 } from '../content/sectors/Sector2';
import { Sector3 } from '../content/sectors/Sector3';
import { Sector4 } from '../content/sectors/Sector4';
import { InteractionType } from './InteractionTypes';
import { SoundID } from '../utils/audio/AudioTypes';

export const SECTORS: Record<number, SectorDef> = {
    0: Sector0,
    1: Sector1,
    2: Sector2,
    3: Sector3,
    4: Sector4
};

export class SectorSystem implements System {
    id = 'sector_system';
    private currentSector: SectorDef;
    private lastChimeTime = 0;
    private waterInitialized = false;

    // Cache the event object to strictly prevent garbage collection overhead during the 60fps loop
    private cachedEvents: any = null;

    constructor(
        private playerGroup: THREE.Group,
        mapId: number,
        private callbacks: {
            setNotification: (notification: any) => void;
            t: (key: string) => string;
            spawnPart: (x: number, y: number, z: number, type: string, count: number, mesh?: any, vel?: any, color?: number, scale?: number, life?: number) => void;
            startCinematic: (target: THREE.Object3D, id: number, params?: any) => void;
            setInteraction: (interaction: any | null) => void;
            playSound: (id: SoundID) => void;
            playTone: (freq: number, type: OscillatorType, duration: number, vol?: number) => void;
            cameraShake: (amount: number) => void;
            scene: THREE.Scene;
            setCameraOverride: (params: any | null) => void;
            makeNoise: (pos: THREE.Vector3, type: NoiseType, radius: number) => void;
            spawnZombie: (type: EnemyType, pos?: THREE.Vector3) => void;
            spawnHorde: (count: number, type?: EnemyType, pos?: THREE.Vector3) => void;
            setOverlay: (type: string | null) => void;
        }
    ) {
        this.currentSector = SectorSystem.getSector(mapId);
    }

    static getSector(mapId: number) {
        return SECTORS[mapId];
    }

    update(session: GameSessionLogic, dt: number, now: number) {
        const state = session.state;
        const scene = session.engine.scene;
        const pPos = this.playerGroup.position;

        if (!this.waterInitialized && session.engine.water) {
            session.engine.water.setPlayerRef(this.playerGroup);
            session.engine.water.setCallbacks({
                spawnPart: this.callbacks.spawnPart,
                makeNoise: this.callbacks.makeNoise
            });
            this.waterInitialized = true;
        }

        // 1. Optimized Proximity Check (Zero-GC)
        if (now - this.lastChimeTime > 2500) {
            const items = state.mapItems;
            const itemsLen = items.length;
            for (let i = 0; i < itemsLen; i++) {
                const item = items[i];
                if (item.type === 'TRIGGER' && item.id.startsWith('collectible_')) {
                    // FIX: Substring(12) safely slices off "collectible_". 
                    // V8 handles this internally as a "Sliced String" (a pointer), averting large allocations.
                    const realId = item.id.substring(12);
                    if (state.collectiblesDiscovered.includes(realId)) continue;

                    const dx = item.x - pPos.x;
                    const dz = item.z - pPos.z;
                    if (dx * dx + dz * dz < 64) {
                        this.lastChimeTime = now;
                        break;
                    }
                }
            }
        }

        // 2. Define Events Object (Hoisted / Zero-GC)
        if (!this.cachedEvents) {
            // Created exactly once per sector load to prevent per-frame Object instantiation
            this.cachedEvents = {
                spawnZombie: (forcedType?: EnemyType, forcedPos?: THREE.Vector3) => {
                    const newEnemy = EnemyManager.spawn(
                        scene, pPos, forcedType, forcedPos,
                        state.bossSpawned, state.enemies.length
                    );
                    if (newEnemy) state.enemies.push(newEnemy);
                },
                setNotification: this.callbacks.setNotification,
                setInteraction: this.callbacks.setInteraction,
                playSound: this.callbacks.playSound,
                playTone: this.callbacks.playTone,
                cameraShake: this.callbacks.cameraShake,
                t: this.callbacks.t,
                scene: scene,
                spawnPart: (x: number, y: number, z: number, type: string, count: number, scale?: number, life?: number) => this.callbacks.spawnPart(x, y, z, type, count, undefined, undefined, undefined, scale, life),
                startCinematic: (target: THREE.Object3D, id: number, params?: any) => this.callbacks.startCinematic(target, id, params),
                setCameraOverride: this.callbacks.setCameraOverride,
                setWind: (direction: number, strength: number) => session.engine.wind.setOverride(direction, strength),
                resetWind: () => session.engine.wind.clearOverride(),
                setWindRandomized: (active: boolean) => session.engine.wind.setRandomWind(0.02, 0.05),
                setWeather: (type: any, count?: number) => session.engine.weather.sync(type, count || 100),

                // Safe Lighting Adjustments
                setLight: (params: any) => {
                    const skyLight = scene.getObjectByName(LIGHT_SYSTEM.SKY_LIGHT) as THREE.DirectionalLight;
                    if (skyLight) {
                        if (params.skyLightColor) skyLight.color.copy(params.skyLightColor);
                        if (params.skyLightPosition) skyLight.position.set(params.skyLightPosition.x, params.skyLightPosition.y, params.skyLightPosition.z);

                        // FIX: Zero-GC approach. We never touch 'skyLight.visible' during runtime 
                        // to prevent WebGL shader re-compilations. We manipulate intensity instead.
                        if (params.skyLightVisible !== undefined) {
                            if (params.skyLightVisible === false) {
                                skyLight.intensity = 0;
                            } else {
                                // Restore to requested intensity, or default back to 1.0
                                skyLight.intensity = params.skyLightIntensity !== undefined ? params.skyLightIntensity : 1.0;
                            }
                        } else if (params.skyLightIntensity !== undefined) {
                            skyLight.intensity = params.skyLightIntensity;
                        }
                    }

                    const amb = scene.getObjectByName(LIGHT_SYSTEM.AMBIENT_LIGHT) as THREE.AmbientLight;
                    if (amb && params.ambientIntensity !== undefined) amb.intensity = params.ambientIntensity;
                },

                setBackgroundColor: (color: number) => { scene.background = new THREE.Color(color); },
                setGroundColor: (color: number) => {
                    const ground = scene.getObjectByName('GROUND') as THREE.Mesh;
                    if (ground && ground.material) (ground.material as THREE.MeshStandardMaterial).color.setHex(color);
                },
                setFOV: (fov: number) => {
                    session.engine.camera.set('fov', fov);
                },
                setFog: (density: number, height?: number, color?: THREE.Color) => {
                    // 1. Uppdatera det volymetriska systemet (FogSystem.ts)
                    session.engine.fog.sync(density, height, color);

                    // 2. Uppdatera horisont-dimman (THREE.FogExp2)
                    if (density > 0) {
                        if (!scene.fog) {
                            // Skapa ny om den saknas, använd ett statiskt djupt värde
                            scene.fog = new THREE.FogExp2(color.getHex(), 0.002);
                        } else {
                            (scene.fog as THREE.FogExp2).color.copy(color);
                            // Notera: Vi rör inte .density på FogExp2, den förblir på 0.002
                            // density-värdet från SectorDef används nu till FogSystem:s instans-antal.
                        }
                    } else {
                        // Stäng av horisont-dimma om densiteten är 0
                        scene.fog = null;
                    }
                },
                setWater: (level?: number, waveHeight?: number) => {
                    // Future expansion: hook into engine.water for global level changes
                },
                makeNoise: (pos: THREE.Vector3, type: NoiseType, radius: number) => session.makeNoise(pos, type, radius),
                spawnHorde: (count: number, type?: EnemyType, pos?: THREE.Vector3) => {
                    if (this.callbacks.spawnHorde) {
                        this.callbacks.spawnHorde(count, type, pos);
                    } else {
                        for (let i = 0; i < count; i++) this.callbacks.spawnZombie(type || EnemyType.WALKER, pos);
                    }
                },
                setOverlay: this.callbacks.setOverlay,
                spawnBubble: (text: string, duration?: number) => this.callbacks.setNotification({ text, visible: true, duration: duration || 3000 })
            };
        }

        // Use the cached reference
        const events = this.cachedEvents;

        // 3. Process Interaction Requests
        if (state.interactionRequest.active && state.interactionRequest.type === InteractionType.SECTOR_SPECIFIC) {
            const req = state.interactionRequest;
            this.currentSector.onInteract(req.id, req.object, state, events);
            req.active = false;
        }

        // 4. Centralized Atmosphere Update
        session.engine.updateAtmosphere(pPos, this.currentSector.environment, this.currentSector.atmosphereZones, state, dt);
        this.currentSector.onUpdate(dt, now, pPos, state, state.sectorState, events);
    }
}