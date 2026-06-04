import * as THREE from 'three';
import { System, SystemID } from './System';
import { GameSessionLogic } from '../game/session/GameSessionLogic';
import { VoiceSounds } from '../utils/audio/AudioLib';
import { FXSystem } from './FXSystem';
import { PlayerDeathState, DamageID, EnemyAttackType, DamageType } from '../entities/player/CombatTypes';
import { PERKS } from '../content/perks';
import { StatID, PlayerStatusFlags, TelemetrySourceOffset } from '../types/CareerStats';
import { EnemyType, EnemyFlags } from '../entities/enemies/EnemyTypes';
import { MAX_ENTITIES } from '../content/constants';
import { DataResolver } from '../core/data/DataResolver';
import { FXParticleType } from '../types/FXTypes';
import { InputAction } from '../core/engine/InputManager';
import { StatusEffectID } from '../types/StatusEffects';
import type { DamageTrackerSystem } from './DamageTrackerSystem';
import type { PerkSystem } from './PerkSystem';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1 = new THREE.Vector3();

export class PlayerStatsSystem implements System {
    readonly systemId = SystemID.PLAYER_STATS;
    id = 'player_stats_system';
    enabled = true;
    persistent = false;
    isFixedStep = true;

    private damageTracker!: DamageTrackerSystem;
    private perkSystem: PerkSystem | undefined;

    constructor(
        private playerGroup: THREE.Group
    ) { }

    private getPerkSystem(session: GameSessionLogic): PerkSystem {
        if (!this.perkSystem) {
            this.perkSystem = session.getSystem<PerkSystem>(SystemID.PERK_SYSTEM)!;
        }
        return this.perkSystem;
    }

    init(session: GameSessionLogic) {
        this.damageTracker = session.getSystem<DamageTrackerSystem>(SystemID.DAMAGE_TRACKER)!;
    }

    update(session: GameSessionLogic, delta: number, simTime: number, renderTime: number) {
        if (!session || !session.engine || !session.state) return;
        const state = session.state;
        if ((state.combat.statusFlags & PlayerStatusFlags.DEAD) !== 0) return;
        if ((state.combat.statusFlags & PlayerStatusFlags.STUNNED) !== 0) return;
    }

    public handlePlayerHit(
        session: GameSessionLogic,
        damage: number,
        attacker: any,
        damageType: DamageType,
        damageSource: DamageID,
        isDoT: boolean = false,
        effectType?: StatusEffectID,
        effectDuration?: number,
        effectIntensity?: number,
        specificAttackType?: EnemyAttackType
    ) {
        if (!session || !session.state) return;
        const state = session.state;

        // --- INVINCIBILITY TERMINAL SETTING ---
        if (state.sectorState?.isInvincible) return;

        const now = session.engine.simTime;

        if (state.combat.statusFlags & PlayerStatusFlags.DEAD) return;

        // Invulnerability Guard (Skip for DoTs/Hazards)
        if (!isDoT && now < state.player.invulnerableUntil) return;

        // --- DAMAGE RESISTANCE ---
        const resistance = state.player.statsBuffer[StatID.MULTIPLIER_DMG_RESIST] || 1.0;
        const absorbed = damage * (1.0 - resistance);
        const damageAfterResist = damage * resistance;

        // Telemetry: Record Absorbed Damage
        if (absorbed > 0.01) {
            const activeResistIdx = state.combat.activeResistPerkIdx;
            if (activeResistIdx !== -1) {
                state.combat.perkDamageAbsorbed[activeResistIdx] += absorbed;
            }
        }

        const actualDmg = Math.max(0, damageAfterResist);
        state.player.statsBuffer[StatID.HP] -= actualDmg;

        const isBite = damageSource === DamageID.BITE;
        let attackIndex = isBite ? EnemyAttackType.BITE : EnemyAttackType.HIT;
        if (isDoT && effectType !== undefined) {
            attackIndex = effectType as any;
        }

        // Damage Telemetry
        let telemetrySourceKey = 0;
        let telemetryAttackIndex = attackIndex;

        if (attacker) {
            const isBossAttacker = (attacker.statusFlags & EnemyFlags.BOSS) !== 0;
            if (isBossAttacker && attacker.bossId !== undefined) {
                telemetrySourceKey = TelemetrySourceOffset.BOSS + attacker.bossId;
                if (specificAttackType !== undefined) telemetryAttackIndex = specificAttackType;
            } else {
                telemetrySourceKey = TelemetrySourceOffset.ENEMY + attacker.type;
            }
        } else {
            telemetrySourceKey = TelemetrySourceOffset.ENVIRONMENT + damageSource;
        }

        this.damageTracker.recordIncomingDamage(session, actualDmg, telemetrySourceKey as any, telemetryAttackIndex, (attacker?.statusFlags & EnemyFlags.BOSS) !== 0);

        if (effectType !== undefined) {
            this.getPerkSystem(session).applyPerk(session, effectType, effectDuration, effectIntensity);
        }

        if (!isDoT) {
            if (isBite) {
                state.combat.lastBiteTime = now;
            } else {
                state.player.invulnerableUntil = now + 400;
            }
            VoiceSounds.playDamageGrunt();
            state.metrics.hurtShake = 1.0;
        }

        state.player.lastDamageTime = now;

        if (state.combat.particles && !isDoT) {
            FXSystem.spawnParticle(session.engine.scene, state.combat.particles, this.playerGroup.position.x, 1.5, this.playerGroup.position.z, FXParticleType.BLOOD_SPLATTER, 6);
        }

        if (state.player.statsBuffer[StatID.HP] <= 0) {
            state.player.statsBuffer[StatID.HP] = 0;
            let finalAttackType = specificAttackType !== undefined ? specificAttackType : EnemyAttackType.HIT;
            if (isDoT && effectType !== undefined) {
                finalAttackType = EnemyAttackType.ENVIRONMENTAL;
            }

            // --- ATTRIBUTION PROPAGATION ---
            let telemetrySourceKey = 0;
            let telemetryAttackIndex = finalAttackType as number;

            if (attacker) {
                const isBossAttacker = (attacker.statusFlags & EnemyFlags.BOSS) !== 0;
                if (isBossAttacker && attacker.bossId !== undefined) {
                    telemetrySourceKey = TelemetrySourceOffset.BOSS + attacker.bossId;
                } else {
                    telemetrySourceKey = TelemetrySourceOffset.ENEMY + attacker.type;
                }
            } else {
                telemetrySourceKey = TelemetrySourceOffset.ENVIRONMENT + damageSource;
            }

            this.executePlayerDeath(session, attacker, damageType, damageSource, finalAttackType, telemetrySourceKey, telemetryAttackIndex, now, isDoT ? effectType : undefined);
        }
    }

    public executePlayerDeath(session: GameSessionLogic, attacker: any, damageType: DamageType, damageSource: DamageID, attackType: EnemyAttackType, sourceKey: number, attackIndex: number, now: number, lethalEffect?: StatusEffectID) {
        const state = session.state;
        this.damageTracker.recordPlayerDeath(session, sourceKey, attackIndex);

        state.combat.statusFlags |= PlayerStatusFlags.DEAD;

        state.combat.statusFlags &= ~(PlayerStatusFlags.RUSHING | PlayerStatusFlags.DODGING);
        state.player.isRushing = false;
        state.player.isDodging = false;
        state.player.deathStartTime = now;
        state.player.killerType = damageType;
        state.player.killerSource = damageSource;
        state.player.deathState = PlayerDeathState.NORMAL;

        if (damageType === DamageType.EXPLOSION) state.player.deathState = PlayerDeathState.GIBBED;
        else if (damageType === DamageType.BURN) state.player.deathState = PlayerDeathState.BURNED;
        else if (damageType === DamageType.DROWNING) state.player.deathState = PlayerDeathState.DROWNED;
        else if (damageType === DamageType.ELECTRIC) state.player.deathState = PlayerDeathState.ELECTROCUTED;

        state.player.lethalStatusEffect = lethalEffect !== undefined ? lethalEffect : StatusEffectID.NONE;

        if (attacker && (attacker.statusFlags & EnemyFlags.BOSS) !== 0 && attacker.bossId !== undefined) {
            state.player.killerName = DataResolver.getEnemyName(EnemyType.BOSS, attacker.bossId);
            state.player.killedByEnemy = true;
            state.player.killerAttackName = DataResolver.getAttackName(attackType);
            state.player.lethalSourceId = TelemetrySourceOffset.BOSS + attacker.bossId;
        } else if (attacker) {
            state.player.killerName = DataResolver.getEnemyName(attacker.type);
            state.player.killedByEnemy = true;
            state.player.killerAttackName = DataResolver.getAttackName(attackIndex);
            state.player.lethalSourceId = attacker.type;
        } else {
            if (lethalEffect !== undefined && state.combat.effectSources[lethalEffect] !== 0) {
                const source = state.combat.effectSources[lethalEffect];
                if (source < TelemetrySourceOffset.BOSS) {
                    state.player.killerName = DataResolver.getEnemyName(source as EnemyType);
                    state.player.killedByEnemy = true;
                } else if (source < TelemetrySourceOffset.ENVIRONMENT) {
                    state.player.killerName = DataResolver.getEnemyName(EnemyType.BOSS, (source - TelemetrySourceOffset.BOSS) as any);
                    state.player.killedByEnemy = true;
                } else {
                    state.player.killerName = DataResolver.getDamageName((source - TelemetrySourceOffset.ENVIRONMENT) as DamageID);
                    state.player.killedByEnemy = false;
                }
                state.player.lethalSourceId = source;
            } else {
                const data = DataResolver.getDamageData(damageSource);
                state.player.killerName = data.name;
                state.player.killedByEnemy = false;
                state.player.lethalSourceId = TelemetrySourceOffset.ENVIRONMENT + damageSource;
            }
            state.player.killerAttackName = 'HIDDEN';
        }

        const input = session.engine.input.state;
        const acts = input.actions;
        _v1.set(0, 0, 0);
        if (acts[InputAction.UP]) _v1.z -= 1; if (acts[InputAction.DOWN]) _v1.z += 1;
        if (acts[InputAction.LEFT]) _v1.x -= 1; if (acts[InputAction.RIGHT]) _v1.x += 1;

        if (_v1.lengthSq() > 0) {
            state.player.deathVel.copy(_v1).normalize().multiplyScalar(15);
        } else if (attacker && attacker.mesh) {
            state.player.deathVel.subVectors(this.playerGroup.position, attacker.mesh.position).normalize().multiplyScalar(12);
        } else {
            state.player.deathVel.set(0, 0, 12);
        }
        state.player.deathVel.y = 4;

        // --- STABILIZATION: Clear DoT buffers AFTER attribution is resolved ---
        state.combat.effectDurations.fill(0);
        state.combat.effectMaxDurations.fill(0);
        state.combat.effectIntensities.fill(0);
        state.combat.effectSources.fill(0);
    }

    public onEnemyKilled(session: GameSessionLogic, enemy: any, now: number, weaponId: DamageID, distSq?: number) {
        const state = session.state;
        const streakMax = MAX_ENTITIES.STREAK_BUFFER_SIZE;
        for (let i = 0; i < (streakMax - 1); i++) state.metrics.killStreakBuffer[i] = state.metrics.killStreakBuffer[i + 1];
        state.metrics.killStreakBuffer[streakMax - 1] = now;

        const kill3Time = state.metrics.killStreakBuffer[2];
        if (kill3Time > 0 && (now - kill3Time) < 3000) {
            const cooldown = PERKS[StatusEffectID.ADRENALINE_PATCH]?.cooldown || 15000;
            if (now - (state.combat.lastAdrenalineTime || 0) > cooldown) {
                state.combat.lastAdrenalineTime = now;
                this.getPerkSystem(session).applyPerk(session, StatusEffectID.ADRENALINE_PATCH);
            }
        }

        const kill5Time = state.metrics.killStreakBuffer[0];
        if (kill5Time > 0 && (now - kill5Time) < 5000) {
            const cooldown = PERKS[StatusEffectID.GIB_MASTER]?.cooldown || 30000;
            if (now - (state.combat.lastGibMasterTime || 0) > cooldown) {
                state.combat.lastGibMasterTime = now;
                this.getPerkSystem(session).applyPerk(session, StatusEffectID.GIB_MASTER);
            }
        }

        const qfPerk = PERKS[StatusEffectID.QUICK_FINGER];
        if (qfPerk) {
            const cooldown = qfPerk.cooldown || 10000;
            if (now - (state.combat.lastQuickFingerTime || 0) > cooldown) {
                state.combat.lastQuickFingerTime = now;
                this.getPerkSystem(session).applyPerk(session, StatusEffectID.QUICK_FINGER);
            }
        }

        this.damageTracker.recordKill(session, enemy.type, (enemy.statusFlags & EnemyFlags.BOSS) !== 0, enemy.bossId, weaponId, distSq);
    }

    clear() { }
}
