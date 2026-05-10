import * as THREE from 'three';
import { System, SystemID } from './System';
import { GameSessionLogic } from '../game/session/GameSessionLogic';
import { VoiceSounds } from '../utils/audio/AudioLib';
import { audioEngine } from '../utils/audio/AudioEngine';
import { FXSystem } from './FXSystem';
import { PlayerDeathState, DamageID, EnemyAttackType } from '../entities/player/CombatTypes';
import { PERKS, PerkCategory } from '../content/perks';
import { PlayerStatID, PlayerStatusFlags, TelemetrySourceOffset } from '../entities/player/PlayerTypes';
import { SoundID } from '../utils/audio/AudioTypes';
import { EnemyType, EnemyFlags } from '../entities/enemies/EnemyTypes';
import { KMH_TO_MS, COMBAT, MAX_ENTITIES } from '../content/constants';
import { DataResolver } from '../utils/ui/DataResolver';
import { FXParticleType } from '../types/FXTypes';
import { DiscoveryType } from '../components/ui/hud/HudTypes';
import { InputAction } from '../core/engine/InputManager';
import { UIEventRingBuffer, UIEventType } from './ui/UIEventRingBuffer';
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

    constructor(
        private playerGroup: THREE.Group,
        private t: (key: string) => string,
        private activeFamilyMembers: { current: any[] }
    ) { }

    init(session: GameSessionLogic) {
        this.bakeFinalStats(session.state.statsBuffer);
    }

    update(session: GameSessionLogic, delta: number, simTime: number, renderTime: number) {
        if (!session || !session.engine || !session.state) return;
        const state = session.state;
        if ((state.statusFlags & PlayerStatusFlags.DEAD) !== 0) return;
        if ((state.statusFlags & PlayerStatusFlags.STUNNED) !== 0) return;

        this.checkAdrenalinePatch(session, simTime);

        // --- PERK ACTIVATION TRACKING (Logic-Dead Transitions) ---
        const currentMask = state.statusMask;
        const startMask = state.previousPerkMask;
        if (currentMask !== startMask) {
            for (let i = 0; i < MAX_ENTITIES.PERKS; i++) {
                const isNew = (currentMask & (1 << i)) && !(startMask & (1 << i));
                if (isNew) {
                    const perk = PERKS[i];
                    if (perk) {
                        if (perk.category === PerkCategory.BUFF) audioEngine.playSound(SoundID.BUFF_GAINED);
                        else if (perk.category === PerkCategory.DEBUFF) audioEngine.playSound(SoundID.DEBUFF_GAINED);
                        else if (perk.category === PerkCategory.PASSIVE) audioEngine.playSound(SoundID.PASSIVE_GAINED);

                        if (state.discoveredPerksMap[i] === 0) {
                            state.discoveredPerksMap[i] = 1;
                            UIEventRingBuffer.push(UIEventType.DISCOVERY, i, DiscoveryType.PERK);
                        }

                        if (!state.isPlayground) {
                            state.perkTimesGained[i]++;
                        }
                    }
                }
            }
        }

        state.previousPerkMask = currentMask | 0;
        this.bakeFinalStats(state.statsBuffer);
        this.syncActivePerks(session);
    }

    private syncActivePerks(session: GameSessionLogic) {
        const state = session.state;

        // Zero-GC: Clear without re-allocating (resetting pointer)
        (state.activeBuffs as any)._count = 0;
        (state.activeDebuffs as any)._count = 0;

        for (let i = 0; i < MAX_ENTITIES.PERKS; i++) {
            if (state.effectDurations[i] > 0) {
                const perk = PERKS[i];
                if (perk) {
                    if (perk.category === PerkCategory.BUFF) {
                        const buffs = state.activeBuffs as any;
                        buffs[buffs._count++] = i | 0;
                    }
                    else if (perk.category === PerkCategory.DEBUFF) {
                        const debuffs = state.activeDebuffs as any;
                        debuffs[debuffs._count++] = i | 0;
                    }
                }
            }
        }
    }

    public updatePassives(session: GameSessionLogic) {
        const state = session.state;
        (state.activePassives as any)._count = 0;

        for (let i = 0; i < MAX_ENTITIES.PERKS; i++) {
            const perk = PERKS[i];
            if (perk && perk.category === PerkCategory.PASSIVE) {
                if (state.discoveredPerksMap[i] > 0) {
                    const passives = state.activePassives as any;
                    passives[passives._count++] = i | 0;
                }
            }
        }
    }

    private bakeFinalStats(stats: Float32Array) {
        // --- BAKE FINAL PRE-CALCULATED STATS (O(1) Access for Systems) ---
        // Final Speed in m/s (Unit conversion + Perk Multipliers)
        stats[PlayerStatID.FINAL_SPEED] = stats[PlayerStatID.SPEED] * stats[PlayerStatID.MULTIPLIER_SPEED] * KMH_TO_MS;
    }

    private checkAdrenalinePatch(session: GameSessionLogic, simTime: number) {
        const state = session.state;
        const perkID = StatusEffectID.ADRENALINE_PATCH;
        const perk = PERKS[perkID];
        if (!perk) return;

        const hp = state.statsBuffer[PlayerStatID.HP];
        const maxHp = state.statsBuffer[PlayerStatID.MAX_HP];

        if (hp > 0 && hp < maxHp * COMBAT.CRISIS_HP_RATIO) {
            const cooldown = perk.cooldown ?? 60000;
            if (simTime - state.lastAdrenalinePatchTime > cooldown) {
                state.lastAdrenalinePatchTime = simTime;

                state.effectDurations[perkID] = perk.duration ?? 3000;
                state.effectMaxDurations[perkID] = perk.duration ?? 3000;

                if (state.discoveredPerksMap[perkID] === 0) {
                    state.discoveredPerksMap[perkID] = 1;
                    UIEventRingBuffer.push(UIEventType.DISCOVERY, perkID, DiscoveryType.PERK);
                }

                const tracker = session.getSystem<any>(SystemID.DAMAGE_TRACKER);
                if (tracker) tracker.recordCrisisSave(session);
            }
        }
    }

    public handlePlayerHit(
        session: GameSessionLogic,
        damage: number,
        attacker: any,
        type: DamageID,
        isDoT: boolean = false,
        effectType?: number,
        effectDuration?: number,
        effectIntensity?: number,
        specificAttackType?: EnemyAttackType
    ) {
        if (!session || !session.state) return;
        const state = session.state;
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
            // Find which perk is providing the resistance (heuristic for telemetry)
            // For now, we aggregate it to the first active defensive perk found.
            for (let i = 0; i < MAX_ENTITIES.PERKS; i++) {
                if (state.effectDurations[i] > 0 || state.activePassives.includes(i)) {
                    if (PERKS[i]?.damageResistModifier) {
                        state.perkDamageAbsorbed[i] += absorbed;
                        break;
                    }
                }
            }
        }

        const actualDmg = Math.max(0, damageAfterResist);
        state.statsBuffer[PlayerStatID.HP] -= actualDmg;

        const isBite = type === DamageID.BITE;
        let attackIndex = isBite ? EnemyAttackType.BITE : EnemyAttackType.HIT;
        if (isDoT && effectType !== undefined) {
            attackIndex = effectType as any;
        }

        // Damage Telemetry
        const damageTracker = session.getSystem<any>(SystemID.DAMAGE_TRACKER);
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
                telemetrySourceKey = TelemetrySourceOffset.ENVIRONMENT + type;
            }

            damageTracker.recordIncomingDamage(session, actualDmg, telemetrySourceKey as any, telemetryAttackIndex, (attacker?.statusFlags & EnemyFlags.BOSS) !== 0);
        }

        if (effectType !== undefined) {
            const perk = PERKS[effectType];
            if (perk) {
                const duration = perk.duration || effectDuration || 0;
                state.effectDurations[effectType] = duration;
                state.effectMaxDurations[effectType] = duration;
                state.effectIntensities[effectType] = effectIntensity !== undefined ? effectIntensity : 1;

                if (!isDoT) {
                    let effectSourceKey = type;
                    if (attacker) {
                        const isBossAttacker = (attacker.statusFlags & EnemyFlags.BOSS) !== 0;
                        if (isBossAttacker && attacker.bossId !== undefined) {
                            effectSourceKey = TelemetrySourceOffset.BOSS + attacker.bossId;
                        } else {
                            effectSourceKey = attacker.type;
                        }
                    } else {
                        effectSourceKey = TelemetrySourceOffset.ENVIRONMENT + type;
                    }
                    state.effectSources[effectType] = effectSourceKey;
                }
            }
        }

        if (!isDoT) {
            if (isBite) {
                state.lastBiteTime = now;
                // Infection chance (30%)
                if (Math.random() < 0.3) {
                    const perk = PERKS[StatusEffectID.INFECTED];
                    const duration = perk.duration || 60000;
                    state.effectDurations[StatusEffectID.INFECTED] = duration;
                    state.effectMaxDurations[StatusEffectID.INFECTED] = duration;
                    state.effectIntensities[StatusEffectID.INFECTED] = 1;
                    state.effectSources[StatusEffectID.INFECTED] = attacker ? (attacker.statusFlags & EnemyFlags.BOSS ? TelemetrySourceOffset.BOSS + attacker.bossId! : TelemetrySourceOffset.ENEMY + attacker.type) : TelemetrySourceOffset.ENVIRONMENT + type;
                }
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
                telemetrySourceKey = TelemetrySourceOffset.ENVIRONMENT + type;
            }

            this.executePlayerDeath(session, attacker, type, finalAttackType, telemetrySourceKey, telemetryAttackIndex, now, isDoT ? effectType : undefined);
        }
    }

    private executePlayerDeath(session: GameSessionLogic, attacker: any, type: DamageID, attackType: EnemyAttackType, sourceKey: number, attackIndex: number, now: number, lethalEffect?: StatusEffectID) {
        const state = session.state;
        const damageTracker = session.getSystem<any>(SystemID.DAMAGE_TRACKER);
        if (damageTracker) {
            damageTracker.recordPlayerDeath(session, sourceKey, attackIndex);
        }

        state.statusFlags |= PlayerStatusFlags.DEAD;
        state.statusFlags &= ~(PlayerStatusFlags.RUSHING | PlayerStatusFlags.DODGING);
        state.isRushing = false;
        state.isDodging = false;
        state.deathStartTime = now;
        state.killerType = type;
        state.playerDeathState = PlayerDeathState.NORMAL;

        if (type === DamageID.EXPLOSION) state.playerDeathState = PlayerDeathState.GIBBED;
        else if (type === DamageID.BURN) state.playerDeathState = PlayerDeathState.BURNED;
        else if (type === DamageID.DROWNING) state.playerDeathState = PlayerDeathState.DROWNED;
        else if (type === DamageID.ELECTRIC) state.playerDeathState = PlayerDeathState.ELECTROCUTED;

        state.lethalStatusEffect = lethalEffect !== undefined ? lethalEffect : -1;

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
                state.killerName = DataResolver.getDamageName(type);
                state.killedByEnemy = false;
                state.lethalSourceId = TelemetrySourceOffset.ENVIRONMENT + type;
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
                this.triggerBuff(session, StatusEffectID.ADRENALINE_PATCH, now);
            }
        }

        const kill5Time = state.killStreakBuffer[0];
        if (kill5Time > 0 && (now - kill5Time) < 5000) {
            const cooldown = PERKS[StatusEffectID.GIB_MASTER]?.cooldown || 30000;
            if (now - (state.lastGibMasterTime || 0) > cooldown) {
                state.lastGibMasterTime = now;
                this.triggerBuff(session, StatusEffectID.GIB_MASTER, now);
            }
        }

        const qfPerk = PERKS[StatusEffectID.QUICK_FINGER];
        if (qfPerk) {
            const cooldown = qfPerk.cooldown || 10000;
            if (now - (state.lastQuickFingerTime || 0) > cooldown) {
                state.lastQuickFingerTime = now;
                this.triggerBuff(session, StatusEffectID.QUICK_FINGER, now);
            }
        }

        const tracker = session.getSystem<any>(SystemID.DAMAGE_TRACKER);
        if (tracker) {
            tracker.recordKill(session, enemy.type, (enemy.statusFlags & EnemyFlags.BOSS) !== 0, enemy.bossId, weaponId, distSq);
        }
    }

    public triggerReflexShield(session: GameSessionLogic, now: number) {
        const state = session.state;
        const perkID = StatusEffectID.REFLEX_SHIELD;
        const perk = PERKS[perkID];

        let cleansedCount = 0;
        for (let i = 0; i < MAX_ENTITIES.PERKS; i++) {
            const p = PERKS[i];
            if (p && p.category === PerkCategory.DEBUFF && state.effectDurations[i] > 0) {
                state.effectDurations[i] = 0;
                cleansedCount++;
            }
        }

        if (cleansedCount > 0) {
            state.perkDebuffsCleansed[perkID] += cleansedCount;
            const tracker = session.getSystem<any>(SystemID.DAMAGE_TRACKER);
            if (tracker) tracker.recordDebuffsResisted(session, cleansedCount);
        }

        state.effectDurations[perkID] = perk.duration || 1000;
        state.effectMaxDurations[perkID] = perk.duration || 1000;
        state.perkTimesGained[perkID]++;
    }

    private triggerBuff(session: GameSessionLogic, type: StatusEffectID, now: number) {
        const state = session.state;
        const perk = PERKS[type];
        if (perk) {
            state.effectDurations[type] = perk.duration || 3000;
            state.effectMaxDurations[type] = perk.duration || 3000;
            state.perkTimesGained[type]++;
        }
    }

    public triggerPerfectDodge(session: GameSessionLogic) {
        const state = session.state;
        const now = state.simTime;
        const cooldown = PERKS[StatusEffectID.QUICK_FINGER]?.cooldown || 30000;

        if (now - state.lastPerfectDodgeTime > cooldown) {
            state.lastPerfectDodgeTime = now;
            this.triggerBuff(session, StatusEffectID.QUICK_FINGER, now);
            state.globalTimeScale = 0.2; // ACTIVATE SLOWMO
            audioEngine.playSound(SoundID.BUFF_GAINED);

            if (session.triggerDiscovery) {
                if (state.discoveredPerksMap[StatusEffectID.QUICK_FINGER] === 0) {
                    state.discoveredPerksMap[StatusEffectID.QUICK_FINGER] = 1;
                    UIEventRingBuffer.push(UIEventType.DISCOVERY, StatusEffectID.QUICK_FINGER, DiscoveryType.PERK);
                }
            }
        }
    }

    clear() { }
}
