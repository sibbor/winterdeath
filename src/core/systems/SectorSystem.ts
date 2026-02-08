
import * as THREE from 'three';
import { System } from './System';
import { GameSessionLogic } from '../GameSessionLogic';
import { SectorDef } from '../../types/sectors';
import { SectorManager } from '../SectorManager';
import { EnemyManager } from '../EnemyManager';

export class SectorSystem implements System {
    id = 'sector_system';
    private currentSector: SectorDef;

    constructor(
        private playerGroup: THREE.Group,
        mapId: number,
        private callbacks: {
            setNotification: (notification: { visible: boolean, text: string, icon: string, timestamp: number }) => void;
            t: (key: string) => string;
            spawnPart: (x: number, y: number, z: number, type: string, count: number) => void;
            startCinematic: (target: THREE.Object3D, id: number) => void;
            setInteraction: (interaction: { id: string, text: string, action: () => void, position?: THREE.Vector3 } | null) => void;
            playSound: (id: string) => void;
            playTone: (freq: number, type: OscillatorType, duration: number, vol?: number) => void;
            cameraShake: (amount: number) => void;
            scene: THREE.Scene;
            setCameraOverride: (params: { active: boolean, targetPos: THREE.Vector3, lookAtPos: THREE.Vector3, endTime: number } | null) => void;
            emitNoise: (pos: THREE.Vector3, radius: number, type: string) => void;
        }
    ) {
        this.currentSector = SectorManager.getSector(mapId);
    }

    private lastChimeTime = 0;

    update(session: GameSessionLogic, dt: number, now: number) {
        const state = session.state;
        const scene = session.engine.scene;

        // Proximity Chime for Collectibles
        if (now - this.lastChimeTime > 2500) {
            // Find nearby collectibles
            const pPos = this.playerGroup.position;
            // mapItems are { x, z, id, type }
            // Filter for collectibles that are NOT found
            const nearby = state.mapItems.find(i => {
                if (i.type === 'TRIGGER' && i.id.startsWith('collectible_')) {
                    const realId = i.id.replace('collectible_', '');
                    if (state.collectiblesFound.includes(realId)) return false; // Already found

                    const dx = i.x - pPos.x;
                    const dz = i.z - pPos.z;
                    const distSq = dx * dx + dz * dz;
                    return distSq < 64; // 8 meters range (8^2)
                }
                return false;
            });

            if (nearby) {
                import('../../utils/sound').then(({ soundManager }) => {
                    // soundManager.playCollectibleChime(); // User requested to mute this for now
                });
                this.lastChimeTime = now;
            }
        }

        this.currentSector.onUpdate(
            dt,
            now,
            this.playerGroup.position,
            state,
            state.sectorState,
            {
                spawnZombie: (forcedType?: string, forcedPos?: THREE.Vector3) => {
                    const newEnemy = EnemyManager.spawn(
                        scene,
                        this.playerGroup.position,
                        forcedType,
                        forcedPos,
                        state.bossSpawned,
                        state.enemies.length
                    );
                    if (newEnemy) state.enemies.push(newEnemy);
                },
                setNotification: this.callbacks.setNotification,
                setInteraction: (this.callbacks as any).setInteraction,
                playSound: (this.callbacks as any).playSound,
                playTone: (this.callbacks as any).playTone,
                cameraShake: (this.callbacks as any).cameraShake,
                t: this.callbacks.t,
                scene: scene,
                spawnPart: this.callbacks.spawnPart,
                startCinematic: this.callbacks.startCinematic,
                setCameraOverride: this.callbacks.setCameraOverride,
                emitNoise: (pos: THREE.Vector3, radius: number, type: string) => {
                    session.noiseEvents.push({ pos: pos.clone(), radius, type: type as any, time: now });
                }
            }
        );
    }
}
