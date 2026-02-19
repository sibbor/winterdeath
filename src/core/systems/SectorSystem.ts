import * as THREE from 'three';
import { System } from './System';
import { GameSessionLogic } from '../GameSessionLogic';
import { SectorDef } from '../../types/SectorEnvironment';
import { EnemyManager } from '../EnemyManager';
import { Sector1 } from '../../content/sectors/Sector1';
import { Sector2 } from '../../content/sectors/Sector2';
import { Sector3 } from '../../content/sectors/Sector3';
import { Sector4 } from '../../content/sectors/Sector4';
import { Sector5 } from '../../content/sectors/Sector5';
import { Sector6 } from '../../content/sectors/Sector6';
import { SectorGenerator } from '../world/SectorGenerator';

const SECTORS: Record<number, SectorDef> = {
    0: Sector1,
    1: Sector2,
    2: Sector3,
    3: Sector4,
    4: Sector5,
    5: Sector6
};

export class SectorSystem implements System {
    id = 'sector_system';
    private currentSector: SectorDef;
    private lastChimeTime = 0;
    private waterInitialized = false;

    constructor(
        private playerGroup: THREE.Group,
        mapId: number,
        private callbacks: {
            setNotification: (notification: any) => void;
            t: (key: string) => string;
            spawnPart: (x: number, y: number, z: number, type: string, count: number) => void;
            startCinematic: (target: THREE.Object3D, id: number) => void;
            setInteraction: (interaction: any | null) => void;
            playSound: (id: string) => void;
            playTone: (freq: number, type: OscillatorType, duration: number, vol?: number) => void;
            cameraShake: (amount: number) => void;
            scene: THREE.Scene;
            setCameraOverride: (params: any | null) => void;
            emitNoise: (pos: THREE.Vector3, radius: number, type: string) => void;
            spawnZombie: (type: string, pos?: THREE.Vector3) => void;
            spawnHorde: (count: number, type?: string, pos?: THREE.Vector3) => void;
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

        // Initialize water system callbacks and player reference once
        if (!this.waterInitialized && session.engine.water) {
            session.engine.water.setPlayerRef(this.playerGroup);
            session.engine.water.setCallbacks({
                spawnPart: this.callbacks.spawnPart,
                emitNoise: this.callbacks.emitNoise
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
                    const realId = item.id.replace('collectible_', '');
                    if (state.collectiblesFound.includes(realId)) continue;

                    const dx = item.x - pPos.x;
                    const dz = item.z - pPos.z;
                    if (dx * dx + dz * dz < 64) {
                        this.lastChimeTime = now;
                        break;
                    }
                }
            }
        }

        // 2. Define Events Object (Hoisted)
        const events = {
            spawnZombie: (forcedType?: string, forcedPos?: THREE.Vector3) => {
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
            spawnPart: this.callbacks.spawnPart,
            startCinematic: this.callbacks.startCinematic,
            setCameraOverride: this.callbacks.setCameraOverride,
            setWind: (direction: number, strength: number) => session.engine.wind.setOverride(direction, strength),
            resetWind: () => session.engine.wind.clearOverride(),
            setWindRandomized: (active: boolean) => session.engine.wind.setRandomWind(0.02, 0.05),
            setWeather: (type: any, count?: number) => session.engine.weather.sync(type, count || 100),
            setLight: (params: any) => {
                const skyLight = scene.getObjectByName('SKY_LIGHT') as THREE.DirectionalLight;
                if (skyLight) {
                    if (params.skyLightColor) skyLight.color.copy(params.skyLightColor);
                    if (params.skyLightIntensity !== undefined) skyLight.intensity = params.skyLightIntensity;
                    if (params.skyLightPosition) skyLight.position.set(params.skyLightPosition.x, params.skyLightPosition.y, params.skyLightPosition.z);
                    if (params.skyLightVisible !== undefined) skyLight.visible = params.skyLightVisible;
                }
                const amb = scene.getObjectByName('AMBIENT_LIGHT') as THREE.AmbientLight;
                if (amb && params.ambientIntensity !== undefined) amb.intensity = params.ambientIntensity;
            },
            setBackgroundColor: (color: number) => { scene.background = new THREE.Color(color); },
            setGroundColor: (color: number) => {
                const ground = scene.getObjectByName('GROUND') as THREE.Mesh;
                if (ground && ground.material) (ground.material as THREE.MeshStandardMaterial).color.setHex(color);
            },
            setFOV: (fov: number) => {
                const camera = (session.engine as any).camera as THREE.PerspectiveCamera;
                if (camera) { camera.fov = fov; camera.updateProjectionMatrix(); }
            },
            setFog: (color: THREE.Color, density: number) => {
                if (scene.fog) {
                    (scene.fog as THREE.FogExp2).color.copy(color);
                    (scene.fog as THREE.FogExp2).density = density;
                }
            },
            setWater: (level?: number, waveHeight?: number) => {
                // Future expansion: hook into engine.water for global level changes
                // Can make changes in Sector 6:s Weather station here...
            },
            emitNoise: (pos: THREE.Vector3, radius: number, type: string) => session.makeNoise(pos, radius, type as any),
            spawnHorde: (count: number, type?: string, pos?: THREE.Vector3) => {
                if (this.callbacks.spawnHorde) {
                    this.callbacks.spawnHorde(count, type, pos);
                } else {
                    for (let i = 0; i < count; i++) this.callbacks.spawnZombie(type || 'WALKER', pos);
                }
            }
        };

        // 3. Process Interaction Requests
        if (state.interactionRequest && state.interactionRequest.active && state.interactionRequest.type === 'sector_specific') {
            const req = state.interactionRequest;
            this.currentSector.onInteract(req.id, req.object, state, events);
            state.interactionRequest.active = false;
        }

        // 4. Centralized Atmosphere Update
        SectorGenerator.updateAtmosphere(dt, now, pPos, state, state.sectorState, events, this.currentSector, this.currentSector.atmosphereZones);
        this.currentSector.onUpdate(dt, now, pPos, state, state.sectorState, events);
    }
}