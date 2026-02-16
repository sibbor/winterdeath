import * as THREE from 'three';
import { System } from './System';
import { GameSessionLogic } from '../GameSessionLogic';
import { SectorDef } from '../../types/sectors';
import { EnemyManager } from '../EnemyManager';
import { Sector1 } from '../../content/sectors/Sector1';
import { Sector2 } from '../../content/sectors/Sector2';
import { Sector3 } from '../../content/sectors/Sector3';
import { Sector4 } from '../../content/sectors/Sector4';
import { Sector5 } from '../../content/sectors/Sector5';
import { Sector6 } from '../../content/sectors/Sector6';

const SECTORS: Record<number, SectorDef> = {
    0: Sector1,
    1: Sector2,
    2: Sector3,
    3: Sector4,
    4: Sector5,
    5: Sector6
};

// --- PERFORMANCE SCRATCHPADS ---
const _v1 = new THREE.Vector3();

export class SectorSystem implements System {
    id = 'sector_system';
    private currentSector: SectorDef;
    private lastChimeTime = 0;

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

        // 1. Optimized Proximity Check (Zero-GC)
        if (now - this.lastChimeTime > 2500) {
            const items = state.mapItems;
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.type === 'TRIGGER' && item.id.startsWith('collectible_')) {
                    const realId = item.id.replace('collectible_', '');
                    if (state.collectiblesFound.includes(realId)) continue;

                    const dx = item.x - pPos.x;
                    const dz = item.z - pPos.z;
                    const distSq = dx * dx + dz * dz;

                    if (distSq < 64) { // 8m radius
                        // soundManager logic is handled via callbacks to keep system clean
                        // this.callbacks.playSound('collectible_chime'); 
                        this.lastChimeTime = now;
                        break;
                    }
                }
            }
        }

        // 2. Sector-specific Update Logic
        this.currentSector.onUpdate(
            dt,
            now,
            pPos,
            state,
            state.sectorState,
            {
                spawnZombie: (forcedType?: string, forcedPos?: THREE.Vector3) => {
                    const newEnemy = EnemyManager.spawn(
                        scene,
                        pPos,
                        forcedType,
                        forcedPos,
                        state.bossSpawned,
                        state.enemies.length
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
                // Environment Controls
                setWind: (direction: number, strength: number) => {
                    if (state.sectorState.weatherSystem) {
                        state.sectorState.weatherSystem.wind.setOverride(direction, strength);
                    }
                },
                resetWind: () => {
                    if (state.sectorState.weatherSystem) {
                        state.sectorState.weatherSystem.wind.clearOverride();
                    }
                },
                setWeather: (type: any, count?: number) => {
                    if (state.sectorState.weatherSystem) {
                        state.sectorState.weatherSystem.sync(type, count || 100);
                    }
                },
                setLight: (params: any) => {
                    if (params.sunPos) {
                        const sun = scene.getObjectByName('SUN_LIGHT') as THREE.DirectionalLight;
                        if (sun) sun.position.copy(params.sunPos);
                    }
                    if (params.sunColor) {
                        const sun = scene.getObjectByName('SUN_LIGHT') as THREE.DirectionalLight;
                        if (sun) sun.color.copy(params.sunColor);
                    }
                    if (params.moonColor) {
                        const moon = scene.getObjectByName('MOON_LIGHT') as THREE.DirectionalLight;
                        if (moon) moon.color.copy(params.moonColor);
                    }
                    if (params.ambientIntensity !== undefined) {
                        const amb = scene.getObjectByName('AMBIENT_LIGHT') as THREE.AmbientLight;
                        if (amb) amb.intensity = params.ambientIntensity;
                    }
                },
                setFog: (color: THREE.Color, density: number) => {
                    if (scene.fog && (scene.fog as THREE.FogExp2).density !== undefined) {
                        const fog = scene.fog as THREE.FogExp2;
                        fog.color.copy(color);
                        fog.density = density;
                    }
                },
                setWater: (level?: number, waveHeight?: number) => {
                    if (state.sectorState.waterSystem) {
                        // WaterSystem doesn't have a public setter for these yet, but we can access public props if strict mode allows or use any
                        const ws = state.sectorState.waterSystem as any;
                        if (level !== undefined) ws.waterLevel = level; // Assuming prop exists or added
                        // waveHeight might be shader uniform
                    }
                },
                emitNoise: (pos: THREE.Vector3, radius: number, type: string) => {
                    session.makeNoise(pos, radius, type as any);
                }
            }
        );
    }
}