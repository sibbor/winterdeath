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
    triggerDiscovery: (event: { type: string, id: string, title: string, details: string }) => void;
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
            spawnBubble: (text: string, dur: number) => this.callbacks.spawnBubble(text, dur),
            applyDamage: (enemy: any, amount: number, type: string, isHighImpact: boolean = false) => {
                if (!this.currentSession) return;

                const state = this.currentSession.state;
                if (state.applyDamage) {
                    state.applyDamage(enemy, amount, type, isHighImpact);
                } else {
                    // Fallback to basic tracking if applyDamage is missing
                    const tracker = this.currentSession.getSystem('damage_tracker_system') as any;
                    if (tracker) tracker.recordOutgoingDamage(this.currentSession, amount, type, enemy.isBoss);
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
            spawnBubble: (text: string, dur: number) => this.callbacks.spawnBubble(text, dur),
            t: (key: string) => this.callbacks.t(key),
            gainXp: (amount: number) => this.callbacks.gainXp(amount),
            onBossKilled: (id: number) => this.callbacks.onBossKilled(id),
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

        // --- ENCOUNTER DISCOVERY LOGIC ---
        // Staggered check for new enemy/boss encounters based on awareness/proximity
        if ((Math.floor(now / 100) % 5) === 0) {
            const enemies = state.enemies;
            for (let i = 0; i < enemies.length; i++) {
                const e = enemies[i];
                if (!e.dead && e.awareness > 0.1) {
                    if (e.isBoss) {
                        const bossId = e.type; // or whatever identifies the boss
                        if (!state.seenBosses.includes(bossId)) {
                            state.seenBosses.push(bossId);
                            this.callbacks.triggerDiscovery({
                                id: 'boss-' + bossId,
                                type: 'boss',
                                title: 'ui.boss_encountered',
                                details: 'bosses.' + bossId + '.name'
                            });
                        }
                    } else {
                        if (!state.seenEnemies.includes(e.type)) {
                            state.seenEnemies.push(e.type);
                            this.callbacks.triggerDiscovery({
                                id: 'enemy-' + e.type,
                                type: 'enemy',
                                title: 'ui.enemy_encountered',
                                details: 'enemies.' + e.type + '.name'
                            });
                        }
                    }
                }
            }
        }
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