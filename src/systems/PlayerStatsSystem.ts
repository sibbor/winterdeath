import * as THREE from 'three';
import { System, SystemID } from './System';
import { GameSessionLogic } from '../game/session/GameSessionLogic';
import { VoiceSounds } from '../utils/audio/AudioLib';
import { FXSystem } from './FXSystem';
import { PlayerDeathState, DamageID, EnemyAttackType, DamageType } from '../entities/player/CombatTypes';
import { PERKS } from '../content/perks';
import { PlayerStatID, PlayerStatusFlags, TelemetrySourceOffset } from '../entities/player/PlayerTypes';
import { EnemyType, EnemyFlags } from '../entities/enemies/EnemyTypes';
import { COMBAT, MAX_ENTITIES } from '../content/constants';
import { DataResolver } from '../core/data/DataResolver';
import { FXParticleType } from '../types/FXTypes';
import { InputAction } from '../core/engine/InputManager';
import { StatusEffectID } from '../types/StatusEffects';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1 = new THREE.Vector3();

export class PlayerStatsSystem implements System {
    readonly systemId = SystemID.PLAYER_STATS;
    id = 'player_stats_system';
    enabled = true;
    persistent = false;
    isFixedStep = true;

    private cachedPassives: StatusEffectID[] = [];

    private damageTracker: any = null;
    private perkSystem: any = null;

    constructor(
        private playerGroup: THREE.Group,
        private t: (key: string) => string,
        private activeFamilyMembers: { current: any[] }
    ) { }

    init(session: GameSessionLogic) {
        this.damageTracker = session.getSystem<any>(SystemID.DAMAGE_TRACKER);
        this.perkSystem = session.getSystem<any>(SystemID.PERK_SYSTEM);
    }

    update(session: GameSessionLogic, delta: number, simTime: number, renderTime: number) {
        if (!session || !session.engine || !session.state) return;
        const state = session.state;
        if ((state.statusFlags & PlayerStatusFlags.DEAD) !== 0) return;
        if ((state.statusFlags & PlayerStatusFlags.STUNNED) !== 0) return;
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

        if (state.statusFlags & PlayerStatusFlags.DEAD) return;

        // Invulnerability Guard (Skip for DoTs/Hazards)
        if (!isDoT && state.simTime < state.invulnerableUntil) return;

        // --- DAMAGE RESISTANCE (VINTERDÖD FIX) ---
        const resistance = state.statsBuffer[PlayerStatID.MULTIPLIER_DMG_RESIST] || 1.0;
        const absorbed = damage * (1.0 - resistance);
        const damageAfterResist = damage * resistance;

        // Telemetry: Record Absorbed Damage
        if (absorbed > 0.01) {
            const activeResistIdx = state.activeResistPerkIdx;
            if (activeResistIdx !== -1) {
                state.perkDamageAbsorbed[activeResistIdx] += absorbed;
            }
        }

        const actualDmg = Math.max(0, damageAfterResist);
        state.statsBuffer[PlayerStatID.HP] -= actualDmg;

        const isBite = damageSource === DamageID.BITE;
        let attackIndex = isBite ? EnemyAttackType.BITE : EnemyAttackType.HIT;
        if (isDoT && effectType !== undefined) {
            attackIndex = effectType as any;
        }

        // Damage Telemetry
        const damageTracker = this.damageTracker;
        if (damageTracker) {
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

            damageTracker.recordIncomingDamage(session, actualDmg, telemetrySourceKey as any, telemetryAttackIndex, (attacker?.statusFlags & EnemyFlags.BOSS) !== 0);
        }

        if (effectType !== undefined) {
            const perkSystem = this.perkSystem;
            if (perkSystem) {
                perkSystem.applyPerk(session, effectType, effectDuration, effectIntensity);
            }
        }

        if (!isDoT) {
            if (isBite) {
                state.lastBiteTime = now;
            } else {
                state.invulnerableUntil = now + 400;
            }
            VoiceSounds.playDamageGrunt();
            state.hurtShake = 1.0;
        }

        state.lastDamageTime = now;

        if (state.particles && !isDoT) {
            FXSystem.spawnParticle(session.engine.scene, state.particles, this.playerGroup.position.x, 1.5, this.playerGroup.position.z, FXParticleType.BLOOD_SPLATTER, 6);
        }

        if (state.statsBuffer[PlayerStatID.HP] <= 0) {
            state.statsBuffer[PlayerStatID.HP] = 0;
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
        const damageTracker = this.damageTracker;
        if (damageTracker) {
            damageTracker.recordPlayerDeath(session, sourceKey, attackIndex);
        }

        state.statusFlags |= PlayerStatusFlags.DEAD;

        state.statusFlags &= ~(PlayerStatusFlags.RUSHING | PlayerStatusFlags.DODGING);
        state.isRushing = false;
        state.isDodging = false;
        state.deathStartTime = now;
        state.killerType = damageType;
        state.killerSource = damageSource;
        state.playerDeathState = PlayerDeathState.NORMAL;

        if (damageType === DamageType.EXPLOSION) state.playerDeathState = PlayerDeathState.GIBBED;
        else if (damageType === DamageType.BURN) state.playerDeathState = PlayerDeathState.BURNED;
        else if (damageType === DamageType.DROWNING) state.playerDeathState = PlayerDeathState.DROWNED;
        else if (damageType === DamageType.ELECTRIC) state.playerDeathState = PlayerDeathState.ELECTROCUTED;

        state.lethalStatusEffect = lethalEffect !== undefined ? lethalEffect : StatusEffectID.NONE;

        if (attacker && (attacker.statusFlags & EnemyFlags.BOSS) !== 0 && attacker.bossId !== undefined) {
            state.killerName = DataResolver.getEnemyName(EnemyType.BOSS, attacker.bossId);
            state.killedByEnemy = true;
            state.killerAttackName = DataResolver.getAttackName(attackType);
            state.lethalSourceId = TelemetrySourceOffset.BOSS + attacker.bossId;
        } else if (attacker) {
            state.killerName = DataResolver.getEnemyName(attacker.type);
            state.killedByEnemy = true;
            state.killerAttackName = DataResolver.getAttackName(attackIndex);
            state.lethalSourceId = attacker.type;
        } else {
            if (lethalEffect !== undefined && state.effectSources[lethalEffect] !== 0) {
                const source = state.effectSources[lethalEffect];
                if (source < TelemetrySourceOffset.BOSS) {
                    state.killerName = DataResolver.getEnemyName(source as EnemyType);
                    state.killedByEnemy = true;
                } else if (source < TelemetrySourceOffset.ENVIRONMENT) {
                    state.killerName = DataResolver.getEnemyName(EnemyType.BOSS, (source - TelemetrySourceOffset.BOSS) as any);
                    state.killedByEnemy = true;
                } else {
                    state.killerName = DataResolver.getDamageName((source - TelemetrySourceOffset.ENVIRONMENT) as DamageID);
                    state.killedByEnemy = false;
                }
                state.lethalSourceId = source;
            } else {
                const data = DataResolver.getDamageData(damageSource);
                state.killerName = data.name;
                state.killedByEnemy = false;
                state.lethalSourceId = TelemetrySourceOffset.ENVIRONMENT + damageSource;
            }
            state.killerAttackName = 'HIDDEN';
        }

        const input = session.engine.input.state;
        const acts = input.actions;
        _v1.set(0, 0, 0);
        if (acts[InputAction.UP]) _v1.z -= 1; if (acts[InputAction.DOWN]) _v1.z += 1;
        if (acts[InputAction.LEFT]) _v1.x -= 1; if (acts[InputAction.RIGHT]) _v1.x += 1;

        if (_v1.lengthSq() > 0) {
            state.deathVel.copy(_v1).normalize().multiplyScalar(15);
        } else if (attacker && attacker.mesh) {
            state.deathVel.subVectors(this.playerGroup.position, attacker.mesh.position).normalize().multiplyScalar(12);
        } else {
            state.deathVel.set(0, 0, 12);
        }
        state.deathVel.y = 4;

        // --- STABILIZATION: Clear DoT buffers AFTER attribution is resolved ---
        state.effectDurations.fill(0);
        state.effectMaxDurations.fill(0);
        state.effectIntensities.fill(0);
        state.effectSources.fill(0);
    }

    public onEnemyKilled(session: GameSessionLogic, enemy: any, now: number, weaponId: DamageID, distSq?: number) {
        const state = session.state;
        const streakMax = MAX_ENTITIES.STREAK_BUFFER_SIZE;
        for (let i = 0; i < (streakMax - 1); i++) state.killStreakBuffer[i] = state.killStreakBuffer[i + 1];
        state.killStreakBuffer[streakMax - 1] = now;

        const kill3Time = state.killStreakBuffer[2];
        if (kill3Time > 0 && (now - kill3Time) < 3000) {
            const cooldown = PERKS[StatusEffectID.ADRENALINE_PATCH]?.cooldown || 15000;
            if (now - (state.lastAdrenalineTime || 0) > cooldown) {
                state.lastAdrenalineTime = now;
                const perkSystem = this.perkSystem;
                if (perkSystem) perkSystem.applyPerk(session, StatusEffectID.ADRENALINE_PATCH);
            }
        }

        const kill5Time = state.killStreakBuffer[0];
        if (kill5Time > 0 && (now - kill5Time) < 5000) {
            const cooldown = PERKS[StatusEffectID.GIB_MASTER]?.cooldown || 30000;
            if (now - (state.lastGibMasterTime || 0) > cooldown) {
                state.lastGibMasterTime = now;
                const perkSystem = this.perkSystem;
                if (perkSystem) perkSystem.applyPerk(session, StatusEffectID.GIB_MASTER);
            }
        }

        const qfPerk = PERKS[StatusEffectID.QUICK_FINGER];
        if (qfPerk) {
            const cooldown = qfPerk.cooldown || 10000;
            if (now - (state.lastQuickFingerTime || 0) > cooldown) {
                state.lastQuickFingerTime = now;
                const perkSystem = this.perkSystem;
                if (perkSystem) perkSystem.applyPerk(session, StatusEffectID.QUICK_FINGER);
            }
        }

        const tracker = this.damageTracker;
        if (tracker) {
            tracker.recordKill(session, enemy.type, (enemy.statusFlags & EnemyFlags.BOSS) !== 0, enemy.bossId, weaponId, distSq);
        }
    }

    clear() { }
}