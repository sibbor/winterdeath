
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
            setNotification: (text: string) => void;
            t: (key: string) => string;
            spawnPart: (x: number, y: number, z: number, type: string, count: number) => void;
            startCinematic: (target: THREE.Object3D, id: number) => void;
        }
    ) {
        this.currentSector = SectorManager.getSector(mapId);
    }

    update(session: GameSessionLogic, dt: number, now: number) {
        const state = session.state;
        const scene = session.engine.scene;

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
                t: this.callbacks.t,
                scene: scene,
                spawnPart: this.callbacks.spawnPart,
                startCinematic: this.callbacks.startCinematic
            }
        );
    }
}
