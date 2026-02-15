import * as THREE from 'three';
import { System } from './System';
import { GameSessionLogic } from '../GameSessionLogic';
import { EnemyManager } from '../EnemyManager';
import { FXSystem } from './FXSystem';
import { WorldLootSystem } from './WorldLootSystem';
import { soundManager } from '../../utils/sound';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export class EnemySystem implements System {
    id = 'enemy_system';

    // Pre-allocated callback objects to avoid object literal creation in update loop
    private updateCallbacks: any;
    private cleanupCallbacks: any;

    constructor(
        private playerGroup: THREE.Group,
        private callbacks: {
            spawnBubble: (text: string, duration: number) => void;
            gainXp: (amount: number) => void;
            t: (key: string) => string;
            onClueFound: (clue: any) => void;
            onBossKilled: (id: number) => void;
        }
    ) { }

    /**
     * Initializes stable references for callbacks to prevent GC spikes
     */
    init(session: GameSessionLogic) {
        const state = session.state;
        const scene = session.engine.scene;

        // Callback for EnemyManager.update
        this.updateCallbacks = {
            onPlayerHit: (damage: number, attacker: any, type: string) => this.handlePlayerHit(session, damage, attacker, type),
            spawnPart: (x: number, y: number, z: number, t: string, c: number, m: any, v: any, col: number) => this.spawnPart(session, x, y, z, t, c, m, v, col),
            spawnDecal: (x: number, z: number, s: number, mat: any) => this.spawnDecal(session, x, z, s, mat),
            spawnBubble: (text: string, dur: number) => this.callbacks.spawnBubble(text, dur),
            onDamageDealt: (dotDamage: number, e: any) => {
                state.damageDealt += dotDamage;
                if (e.isBoss) state.bossDamageDealt += dotDamage;
                this.callbacks.gainXp(Math.ceil(dotDamage));
            },
            onAshStart: (e: any) => EnemyManager.createAshPile(e)
        };

        // Callback for EnemyManager.cleanupDeadEnemies
        this.cleanupCallbacks = {
            spawnPart: (x: number, y: number, z: number, t: string, c: number, m: any, v: any, col: number) => this.spawnPart(session, x, y, z, t, c, m, v, col),
            spawnDecal: (x: number, z: number, s: number, mat: any) => this.spawnDecal(session, x, z, s, mat),
            spawnScrap: (x: number, z: number, amt: number) => WorldLootSystem.spawnScrapExplosion(scene, state.scrapItems, x, z, amt),
            spawnBubble: this.callbacks.spawnBubble,
            t: this.callbacks.t,
            gainXp: this.callbacks.gainXp,
            onBossKilled: this.callbacks.onBossKilled
        };
    }

    update(session: GameSessionLogic, dt: number, now: number) {
        const state = session.state;
        const scene = session.engine.scene;

        // Ensure init has been called (safety for system management)
        if (!this.updateCallbacks) this.init(session);

        // 1. Process Main AI and Combat Logic
        if (!state.bossIntroActive) {
            EnemyManager.update(
                dt,
                now,
                this.playerGroup.position,
                state.enemies,
                state.collisionGrid,
                session.noiseEvents,
                state.shakeIntensity,
                this.updateCallbacks.onPlayerHit,
                this.updateCallbacks.spawnPart,
                this.updateCallbacks.spawnDecal,
                this.updateCallbacks.spawnBubble,
                this.updateCallbacks.onDamageDealt
            );
        }

        // 2. Process Removal of Dead Entities and Loot Spawning
        EnemyManager.cleanupDeadEnemies(
            scene,
            state.enemies,
            now,
            state,
            this.cleanupCallbacks
        );
    }

    /**
     * Internal handler for when an enemy hits the player
     */
    private handlePlayerHit(session: GameSessionLogic, damage: number, attacker: any, type: string) {
        const state = session.state;
        const now = performance.now();

        if (now < state.invulnerableUntil) return;

        state.damageTaken += damage;
        state.hp -= damage;

        soundManager.playDamageGrunt();
        state.hurtShake = 1.0;
        state.lastDamageTime = now;

        if (type === 'Boss') state.bossDamageTaken += damage;

        // Spawn player blood spray (Zero-GC position access)
        this.spawnPart(session, this.playerGroup.position.x, 1.2, this.playerGroup.position.z, 'blood', 80);

        // Check for Player Death
        if (state.hp <= 0 && !state.isDead) {
            this.executePlayerDeath(session, attacker, type, now);
        }
    }

    /**
     * Optimized death sequence to prevent frame drops during state transition
     */
    private executePlayerDeath(session: GameSessionLogic, attacker: any, type: string, now: number) {
        const state = session.state;
        state.isDead = true;
        state.deathStartTime = now;
        state.killerType = type;

        // Resolve killer name using localization keys
        if (attacker && attacker.isBoss && attacker.bossId !== undefined) {
            state.killerType = attacker.type;
            state.killerName = this.callbacks.t(`bosses.${attacker.bossId}.name`);
        } else if (attacker) {
            state.killerType = attacker.type;
            state.killerName = this.callbacks.t(`enemies.${attacker.type}.name`);
        } else {
            state.killerName = this.callbacks.t('ui.unknown_threat');
        }

        // --- Calculate death velocity (Zero-GC) ---
        const input = session.engine.input.state;
        _v1.set(0, 0, 0);

        if (input.w) _v1.z -= 1;
        if (input.s) _v1.z += 1;
        if (input.a) _v1.x -= 1;
        if (input.d) _v1.x += 1;

        if (_v1.lengthSq() > 0) {
            // Fly in movement direction if moving
            state.deathVel = _v1.normalize().multiplyScalar(15).clone();
        } else {
            // Otherwise fly away from the attacker
            _v2.subVectors(this.playerGroup.position, attacker ? attacker.mesh.position : this.playerGroup.position).normalize().multiplyScalar(12);
            state.deathVel = _v2.clone();
        }
        state.deathVel.y = 4;
    }

    private spawnPart(session: GameSessionLogic, x: number, y: number, z: number, type: string, count: number, mesh?: any, vel?: any, color?: number) {
        FXSystem.spawnPart(session.engine.scene, session.state.particles, x, y, z, type, count, mesh, vel, color);
    }

    private spawnDecal(session: GameSessionLogic, x: number, z: number, scale: number, mat?: any) {
        FXSystem.spawnDecal(session.engine.scene, session.state.bloodDecals, x, z, scale, mat);
    }

    cleanup(session: GameSessionLogic) {
        // Clear references to prevent leaks
        this.updateCallbacks = null;
        this.cleanupCallbacks = null;
    }
}