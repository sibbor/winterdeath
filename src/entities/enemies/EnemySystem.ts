import * as THREE from 'three';
import { System } from '../../systems/System';
import { GameSessionLogic } from '../../game/session/GameSessionLogic';
import { EnemyManager } from '../enemies/EnemyManager';
import { FXSystem } from '../../systems/FXSystem';
import { WorldLootSystem } from '../../systems/WorldLootSystem';

// --- TYPE DEFINITIONS ---
interface Callbacks {
    gainXp: (amount: number) => void;
    onBossKilled: (id: number) => void;
    onPlayerHit: (damage: number, attacker: any, type: string, isDoT?: boolean, effect?: any, effectDuration?: number, effectIntensity?: number, attackName?: string) => void;
    onDiscovery?: (type: string, id: string, titleKey: string, detailsKey: string, payload?: any) => void;
}

export class EnemySystem implements System {
    id = 'enemy_system';

    private currentSession: GameSessionLogic | null = null;
    private updateCallbacks: any;
    private cleanupCallbacks: any;

    constructor(
        private playerGroup: THREE.Group,
        private callbacks: Callbacks
    ) {
        // Initialize callbacks exactly once to prevent GC allocation and closure memory leaks
        this.updateCallbacks = {
            spawnPart: (x: number, y: number, z: number, t: string, c: number, m?: THREE.Object3D, v?: THREE.Vector3, col?: number, s?: number) => {
                if (this.currentSession) this.spawnPart(this.currentSession, x, y, z, t, c, m, v, col, s);
            },
            spawnDecal: (x: number, z: number, s: number, mat: THREE.Material, type?: string) => {
                if (this.currentSession) this.spawnDecal(this.currentSession, x, z, s, mat, type);
            },
            applyDamage: (enemy: any, amount: number, type: string, isHighImpact: boolean = false) => {
                if (!this.currentSession) return;

                const state = this.currentSession.state;
                if (state.applyDamage) {
                    state.applyDamage(enemy, amount, type, isHighImpact);
                }
            }
        };

        this.cleanupCallbacks = {
            spawnPart: this.updateCallbacks.spawnPart,
            spawnDecal: this.updateCallbacks.spawnDecal,
            spawnScrap: (x: number, z: number, amt: number) => {
                if (!this.currentSession) return;
                WorldLootSystem.spawnScrapExplosion(this.currentSession.engine.scene, this.currentSession.state.scrapItems, x, z, amt);
            },
            gainXp: (amount: number) => this.callbacks.gainXp(amount),
            onBossKilled: (id: number) => this.callbacks.onBossKilled(id),
            getSession: () => this.currentSession
        };
    }

    init(session: GameSessionLogic) {
        this.currentSession = session;
        const scene = session.engine.scene;

        // Initialize the EnemyManager to setup ZombieRenderer for instanced drawing.
        // This is mandatory for enemies to be visible.
        EnemyManager.init(scene);
    }

    update(session: GameSessionLogic, dt: number, now: number) {
        this.currentSession = session;

        const state = session.state;
        const scene = session.engine.scene;

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
        // Zero-GC: Drop references to the session, but keep the callback objects intact
        this.currentSession = null;
    }
}