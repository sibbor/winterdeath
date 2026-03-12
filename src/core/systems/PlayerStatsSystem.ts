import * as THREE from 'three';
import { System } from './System';
import { GameSessionLogic } from '../GameSessionLogic';
import { soundManager } from '../../utils/SoundManager';
import { FXSystem } from './FXSystem';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export class PlayerStatsSystem implements System {
    id = 'player_stats_system';

    constructor(
        private playerGroup: THREE.Group,
        private t: (key: string) => string
    ) { }

    init(session: GameSessionLogic) {
        // Initialized at start
    }

    update(session: GameSessionLogic, dt: number, now: number) {
        // Empty for now, handles events via handlePlayerHit
    }

    public handlePlayerHit(session: GameSessionLogic, damage: number, attacker: any, type: string) {
        const state = session.state;
        const now = performance.now();

        if (state.isDead || state.sectorState?.isInvincible) return;

        const isBite = type === 'BITING';

        // I-frames logic
        if (!isBite && now < (state.invulnerableUntil || 0)) return;
        if (isBite && now < (state.lastBiteTime || 0) + 50) return;

        // Apply damage
        state.damageTaken += damage;
        state.hp -= damage;

        if (isBite) {
            state.lastBiteTime = now;
        } else {
            state.invulnerableUntil = now + 400;
        }

        // Feedback
        soundManager.playDamageGrunt();
        state.hurtShake = 1.0;
        state.lastDamageTime = now;

        if (type === 'Boss') state.bossDamageTaken += damage;

        // Visuals
        if (state.particles) {
            FXSystem.spawnPart(session.engine.scene, state.particles, this.playerGroup.position.x, 1.2, this.playerGroup.position.z, 'splash', 5);
        }

        // Death check
        if (state.hp <= 0) {
            this.executePlayerDeath(session, attacker, type, now);
        }
    }

    private executePlayerDeath(session: GameSessionLogic, attacker: any, type: string, now: number) {
        const state = session.state;
        state.isDead = true;
        state.deathStartTime = now;

        console.log("[PlayerStatsSystem] Player died from " + type + ", attacker:", attacker);

        // Setup killer name for UI
        state.killerType = type;
        if (attacker && attacker.isBoss && attacker.bossId !== undefined) {
            state.killerName = this.t(`bosses.${attacker.bossId}.name`);
        } else if (attacker) {
            state.killerName = this.t(`enemies.${attacker.type}.name`);
        } else {
            state.killerName = this.t('ui.unknown_threat');
        }

        const input = session.engine.input.state;
        _v1.set(0, 0, 0);

        // Calculate death vector based on movement input
        if (input.w) _v1.z -= 1;
        if (input.s) _v1.z += 1;
        if (input.a) _v1.x -= 1;
        if (input.d) _v1.x += 1;

        if (_v1.lengthSq() > 0) {
            state.deathVel.copy(_v1).normalize().multiplyScalar(15);
        } else {
            if (attacker && attacker.mesh) {
                _v2.copy(attacker.mesh.position);
                state.deathVel.subVectors(this.playerGroup.position, _v2).normalize().multiplyScalar(12);
            } else {
                state.deathVel.set(0, 0, 12);
            }
        }

        state.deathVel.y = 4;
    }

    cleanup(session: GameSessionLogic) {
    }
}