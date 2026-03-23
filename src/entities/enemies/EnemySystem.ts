import * as THREE from 'three';
import { System } from '../../systems/System';
import { GameSessionLogic } from '../../game/session/GameSessionLogic';
import { EnemyManager } from '../enemies/EnemyManager';
import { FXSystem } from '../../systems/FXSystem';
import { WorldLootSystem } from '../../systems/WorldLootSystem';

// --- TYPE DEFINITIONS ---
interface Callbacks {
    spawnBubble: (text: string, duration: number) => void;
    gainXp: (amount: number) => void;
    t: (key: string) => string;
    onBossKilled: (id: number) => void;
    onPlayerHit: (damage: number, attacker: any, type: string, isDoT?: boolean, effect?: any, effectDuration?: number, effectIntensity?: number, attackName?: string) => void;
}

export class EnemySystem implements System {
    id = 'enemy_system';

    private updateCallbacks: any = null;
    private cleanupCallbacks: any = null;

    constructor(
        private playerGroup: THREE.Group,
        private callbacks: Callbacks
    ) { }

    init(session: GameSessionLogic) {
        const state = session.state;
        const scene = session.engine.scene;

        // [VINTERDÖD FIX] Initialize the EnemyManager to setup ZombieRenderer for instanced drawing.
        // This is mandatory for enemies to be visible.
        EnemyManager.init(scene);

        this.updateCallbacks = {
            spawnPart: (x: number, y: number, z: number, t: string, c: number, m?: THREE.Object3D, v?: THREE.Vector3, col?: number, s?: number) => this.spawnPart(session, x, y, z, t, c, m, v, col, s),
            spawnDecal: (x: number, z: number, s: number, mat: THREE.Material, type?: string) => this.spawnDecal(session, x, z, s, mat, type),
            spawnBubble: (text: string, dur: number) => this.callbacks.spawnBubble(text, dur),
            applyDamage: (enemy: any, amount: number, type: string, isHighImpact: boolean = false) => {
                if (session.state.applyDamage) {
                    session.state.applyDamage(enemy, amount, type, isHighImpact);
                } else {
                    // Fallback to basic tracking if applyDamage is missing
                    const tracker = session.getSystem('damage_tracker_system') as any;
                    if (tracker) tracker.recordOutgoingDamage(session, amount, type, enemy.isBoss);
                }
            }
        };

        this.cleanupCallbacks = {
            spawnPart: (x: number, y: number, z: number, t: string, c: number, m?: THREE.Object3D, v?: THREE.Vector3, col?: number, s?: number) => this.spawnPart(session, x, y, z, t, c, m, v, col, s),
            spawnDecal: (x: number, z: number, s: number, mat: THREE.Material, type?: string) => this.spawnDecal(session, x, z, s, mat, type),
            spawnScrap: (x: number, z: number, amt: number) => WorldLootSystem.spawnScrapExplosion(scene, state.scrapItems, x, z, amt),
            spawnBubble: this.callbacks.spawnBubble,
            t: this.callbacks.t,
            gainXp: this.callbacks.gainXp,
            onBossKilled: this.callbacks.onBossKilled,
        };
    }

    update(session: GameSessionLogic, dt: number, now: number) {
        const state = session.state;
        const scene = session.engine.scene;

        if (!this.updateCallbacks) this.init(session);

        if (!state.bossIntroActive) {
            EnemyManager.update(
                dt,
                now,
                session.playerPos || this.playerGroup.position,
                state.enemies,
                state.collisionGrid,
                state.isDead,
                this.callbacks.onPlayerHit,
                this.updateCallbacks.spawnPart,
                this.updateCallbacks.spawnDecal,
                this.updateCallbacks.spawnBubble,
                this.updateCallbacks.applyDamage,
                session.engine.water
            );
        }

        EnemyManager.cleanupDeadEnemies(
            scene,
            state.enemies,
            now,
            state,
            this.cleanupCallbacks,
            dt
        );
    }

    private spawnPart(session: GameSessionLogic, x: number, y: number, z: number, type: string, count: number, mesh?: THREE.Object3D, vel?: THREE.Vector3, color?: number, scale?: number) {
        if (!session.state.particles) return;
        FXSystem.spawnPart(session.engine.scene, session.state.particles, x, y, z, type, count, mesh, vel, color, scale);
    }

    private spawnDecal(session: GameSessionLogic, x: number, z: number, scale: number, mat?: THREE.Material, type?: string) {
        if (!session.state.bloodDecals) return;
        FXSystem.spawnDecal(session.engine.scene, session.state.bloodDecals, x, z, scale, mat, type);
    }

    clear() {
        this.updateCallbacks = null;
        this.cleanupCallbacks = null;
    }
}