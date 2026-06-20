import * as THREE from 'three';
import { GameSessionLogic } from './GameSessionLogic';
import { Enemy, EnemyDeathState, EnemyFlags, EnemyType } from '../../entities/enemies/EnemyTypes';
import { DamageID, DamageType, EnemyAttackType, PlayerDeathState } from '../../entities/player/CombatTypes';
import { WEAPONS, WeaponBehavior } from '../../content/weapons';
import { DamageNumberSystem } from '../../systems/DamageNumberSystem';
import { CareerStatsSystem } from '../../systems/CareerStatsSystem';
import { StatID, PlayerStatusFlags, TelemetrySourceOffset } from '../../types/CareerStats';
import { StatusEffectID } from '../../types/StatusEffects';
import { VoiceSounds } from '../../utils/audio/AudioLib';
import { FXSystem } from '../../systems/FXSystem';
import { FXParticleType } from '../../types/FXTypes';
import { InputAction } from '../../core/engine/InputManager';
import { DataResolver } from '../../core/data/DataResolver';

// Zero-GC Performance Scratchpads
const _v1 = new THREE.Vector3();

// String cache for damage numbers to prevent GC spikes during rapid fire
const _numberStringCache: Record<number, string> = {};
function getCachedNumberString(num: number): string {
    const rounded = Math.round(num);
    let cached = _numberStringCache[rounded];
    if (cached === undefined) {
        cached = rounded.toString();
        _numberStringCache[rounded] = cached;
    }
    return cached;
}

export class CombatEngine {
    /**
     * Stateless outgoing damage transaction handler.
     */
    public static handleEnemyHit(
        session: GameSessionLogic,
        target: Enemy,
        rawDamage: number,
        type: DamageType,
        sourceId: DamageID,
        isCritical: boolean = false
    ): boolean {
        if (!target || target.deathState !== EnemyDeathState.ALIVE || rawDamage <= 0) {
            return false;
        }

        const waveDisabled = target.isWaveEnemy && session.state?.sectorState?.waveDisabled;
        if (waveDisabled) {
            return false;
        }

        const state = session.state;
        const isBoss = (target.statusFlags & EnemyFlags.BOSS) !== 0;

        // Set visual hit time so animators can process hits even when sim clock is paused
        target.hitRenderTime = state.renderTime;

        const actualDmg = Math.max(0, Math.min(target.hp, rawDamage));
        target.hp -= actualDmg;
        target.lastDamageType = sourceId;
        target.hitTime = session.engine.simTime;
        target.lastHitWasHighImpact = isCritical;
        target._accumulatedDamage += rawDamage;

        if (actualDmg > 0) {
            CareerStatsSystem.recordOutgoingDamage(session, actualDmg, sourceId, isBoss);
        }

        const isDeadNow = target.hp <= 0;

        if (isDeadNow) {
            const playerStats = session.systems.playerStats;
            if (playerStats) {
                const playerPos = state.player.position;
                const dx = target.mesh.position.x - playerPos.x;
                const dz = target.mesh.position.z - playerPos.z;
                const distSq = dx * dx + dz * dz;
                playerStats.onEnemyKilled(session, target, session.engine.simTime, sourceId, distSq);
            }
        }

        const weaponData = (WEAPONS as any)[sourceId];
        const color = DamageNumberSystem.getColorForType(sourceId, !!isCritical);
        const isContinuous = weaponData?.behavior === WeaponBehavior.CONTINUOUS || sourceId === DamageID.BURN || sourceId === DamageID.DROWNING;
        const textThrottle = isContinuous ? 250 : 0;

        if (isDeadNow || (session.engine.simTime - target._lastDamageTextTime > textThrottle)) {
            if (session.callbacks?.showDamageText && target._accumulatedDamage >= 1) {
                const textX = target.mesh.position.x;
                const textY = target.originalScale * 1.8 + 1.2;
                const textZ = target.mesh.position.z;

                session.callbacks.showDamageText(
                    textX, textY, textZ,
                    getCachedNumberString(target._accumulatedDamage),
                    color
                );
                target._accumulatedDamage = 0;
                target._lastDamageTextTime = session.engine.simTime;
            }
        }

        return isDeadNow;
    }

    /**
     * Stateless incoming damage transaction handler.
     */
    public static handlePlayerHit(
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
    ): boolean {
        if (!session || !session.state) return false;
        const state = session.state;

        // --- INVINCIBILITY TERMINAL SETTING ---
        if (state.sectorState?.isInvincible) return false;

        const now = session.engine.simTime;

        if (state.combat.statusFlags & PlayerStatusFlags.DEAD) return true;

        // Invulnerability Guard (Skip for DoTs/Hazards)
        if (!isDoT && now < state.player.invulnerableUntil) return false;

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

        CareerStatsSystem.recordIncomingDamage(session, actualDmg, telemetrySourceKey as any, telemetryAttackIndex, (attacker?.statusFlags & EnemyFlags.BOSS) !== 0);

        if (effectType !== undefined && session.systems.perkSystem) {
            session.systems.perkSystem.applyPerk(session, effectType, effectDuration, effectIntensity);
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
            FXSystem.spawnParticle(session.engine.scene, state.combat.particles, state.player.position.x, 1.5, state.player.position.z, FXParticleType.BLOOD_SPLATTER, 6);
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
            return true;
        }

        return false;
    }

    public static executePlayerDeath(
        session: GameSessionLogic,
        attacker: any,
        damageType: DamageType,
        damageSource: DamageID,
        attackType: EnemyAttackType,
        sourceKey: number,
        attackIndex: number,
        now: number,
        lethalEffect?: StatusEffectID
    ) {
        const state = session.state;
        CareerStatsSystem.recordPlayerDeath(session, sourceKey, attackIndex);

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
            state.player.deathVel.subVectors(state.player.position, attacker.mesh.position).normalize().multiplyScalar(12);
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
}