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
import { KMH_TO_MS, FamilyMemberID } from '../content/constants';
import { DataResolver } from '../utils/ui/DataResolver';
import { FXParticleType } from '../types/FXTypes';
import { DiscoveryType } from '../components/ui/hud/HudTypes';
import { InputAction } from '../core/engine/InputManager';
import { UIEventRingBuffer, UIEventType } from './ui/UIEventRingBuffer';
import { StatusEffect, StatusEffectID } from '../types/StatusEffects';

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
        this.updatePassives(session);
        this.bakeFinalStats(session.state.statsBuffer);
    }

    update(session: GameSessionLogic, delta: number, simTime: number, renderTime: number) {
        if (!session || !session.engine || !session.state) return;
        // --- TRACK WEAPON USAGE (TIME ACTIVE) ---
        const state = session.state;
        if ((state.statusFlags & PlayerStatusFlags.DEAD) !== 0) return;
        if ((state.statusFlags & PlayerStatusFlags.STUNNED) !== 0) return;

        let currentMask = this.updatePassives(session);
        this.checkAdrenalinePatch(session, simTime);
        currentMask = this.updateBuffsAndDebuffs(session, delta, simTime, currentMask);
        this.applyStatusTicks(session, delta, simTime);
        this.updateStatusEffects(session);

        // --- STATUS TRANSITION SOUNDS (VINTERDÖD FIX: Debounced & Pulse-Protected) ---
        const startMask = state.previousPerkMask;
        if (currentMask !== startMask) {
            for (let i = 0; i < 32; i++) {
                const isNew = (currentMask & (1 << i)) && !(startMask & (1 << i));
                const isRemoved = !(currentMask & (1 << i)) && (startMask & (1 << i));

                if (isNew) {
                    const perk = PERKS[i];
                    if (perk) {
                        // Double check that we aren't just refreshing an existing duration 
                        // by accident (though previousPerkMask should prevent this).
                        if (perk.category === PerkCategory.BUFF) audioEngine.playSound(SoundID.BUFF_GAINED);
                        else if (perk.category === PerkCategory.DEBUFF) audioEngine.playSound(SoundID.DEBUFF_GAINED);
                        else if (perk.category === PerkCategory.PASSIVE) audioEngine.playSound(SoundID.PASSIVE_GAINED);

                        if (state.discoveredPerksMap[i] === 0) {
                            state.discoveredPerksMap[i] = 1;
                            UIEventRingBuffer.push(UIEventType.DISCOVERY, i, DiscoveryType.PERK);
                        }

                        // Increment activation count
                        if (!state.isPlayground) {
                            state.perkTimesGained[i]++;
                        }
                    }
                }
            }
        }

        // --- FINAL BAKE (Zero-GC) ---
        state.previousPerkMask = currentMask;
        this.bakeFinalStats(state.statsBuffer);
    }

    private bakeFinalStats(stats: Float32Array) {
        // --- BAKE FINAL PRE-CALCULATED STATS (O(1) Access for Systems) ---
        // Final Speed in m/s (Unit conversion + Perk Multipliers)
        stats[PlayerStatID.FINAL_SPEED] = stats[PlayerStatID.SPEED] * stats[PlayerStatID.MULTIPLIER_SPEED] * KMH_TO_MS;
    }

    private updateStatusEffects(session: GameSessionLogic) {
        const state = session.state;
        const oldMask = state.statusMask;
        let newMask = 0;

        const hp = state.statsBuffer[PlayerStatID.HP];
        const maxHp = state.statsBuffer[PlayerStatID.MAX_HP];

        // 1. Health-based statuses
        if (hp < maxHp * 0.25) newMask |= StatusEffect.LOW_HEALTH;

        // 2. Map PlayerStatusFlags to HUD StatusEffect bitmask
        const flags = state.statusFlags;
        if ((flags & PlayerStatusFlags.STUNNED) !== 0) newMask |= StatusEffect.STUNNED;
        if ((flags & PlayerStatusFlags.INVULNERABLE) !== 0) newMask |= StatusEffect.INVULNERABLE;
        if ((flags & PlayerStatusFlags.DISORIENTED) !== 0) newMask |= StatusEffect.DISORIENTED;
        if ((flags & PlayerStatusFlags.REGENERATING) !== 0) newMask |= StatusEffect.REGENERATING;
        if ((flags & PlayerStatusFlags.REFLEX_SHIELD) !== 0) newMask |= StatusEffect.REFLEX_SHIELD;
        if ((flags & PlayerStatusFlags.ADRENALINE_SHOT) !== 0) newMask |= StatusEffect.ADRENALINE;
        if ((flags & PlayerStatusFlags.GIB_MASTER) !== 0) newMask |= StatusEffect.GIB_MASTER;
        if ((flags & PlayerStatusFlags.QUICK_FINGER) !== 0) newMask |= StatusEffect.QUICK_FINGER;

        // 3. Map effect durations
        if (state.effectDurations[StatusEffectID.BLEEDING] > 0) newMask |= StatusEffect.BLEEDING;

        // 4. Energy-based statuses
        if (state.statsBuffer[PlayerStatID.STAMINA] <= 0) newMask |= StatusEffect.EXHAUSTED;

        // Only sync if changed to maintain Zero-GC bridge performance
        if (newMask !== oldMask) {
            state.statusMask = newMask;
            UIEventRingBuffer.push(UIEventType.SYNC_STATUS, newMask, 0, session.engine.simTime);
        }
    }

    private checkAdrenalinePatch(session: GameSessionLogic, simTime: number) {
        const state = session.state;
        const perkID = StatusEffectID.ADRENALINE_PATCH;
        const perk = PERKS[perkID];
        if (!perk) return;

        const hp = state.statsBuffer[PlayerStatID.HP];
        const maxHp = state.statsBuffer[PlayerStatID.MAX_HP];

        if (hp > 0 && hp < maxHp * 0.25) {
            // Use canonical cooldown from perks.ts (default to 60s if missing)
            const cooldown = perk.cooldown ?? 60000;
            if (simTime - state.lastAdrenalinePatchTime > cooldown) {
                state.lastAdrenalinePatchTime = simTime;

                // Mark the duration in the buffer
                state.effectDurations[perkID] = perk.duration ?? 3000;
                state.effectMaxDurations[perkID] = perk.duration ?? 3000;

                // Removed legacy sound trigger. 
                // Detection now happens in the main update loop via bitmask.

                if (state.discoveredPerksMap[perkID] === 0) {
                    state.discoveredPerksMap[perkID] = 1;
                    UIEventRingBuffer.push(UIEventType.DISCOVERY, perkID, DiscoveryType.PERK);
                }

                // Increment Crisis Management tracking
                const tracker = session.getSystem<any>(SystemID.DAMAGE_TRACKER);
                if (tracker) tracker.recordCrisisSave(session);
            }
        }
    }

    private cachedFamilyMultipliers = {
        speed: 1.0, reloadTime: 1.0, fireRate: 1.0, damageResist: 1.0, range: 1.0
    };

    public updatePassives(session: GameSessionLogic): number {
        let mask = 0;
        const family = this.activeFamilyMembers.current;
        const state = session.state;

        let pIdx = 0;
        for (let i = 0; i < family.length; i++) {
            const member = family[i];
            if (!member.following) continue;

            const id = member.id;
            let passiveId: StatusEffectID | null = null;

            if (id === FamilyMemberID.LOKE) passiveId = StatusEffectID.TRICKSTERS_HASTE;
            else if (id === FamilyMemberID.JORDAN) passiveId = StatusEffectID.EAGLES_SIGHT;
            else if (id === FamilyMemberID.ESMERALDA) passiveId = StatusEffectID.LEAD_FEVER;
            else if (id === FamilyMemberID.NATHALIE) passiveId = StatusEffectID.WINTERS_BONE;

            if (passiveId !== null) {
                mask |= (1 << passiveId); // Set bit for mask
                this.cachedPassives[pIdx++] = passiveId;
                const perk = PERKS[passiveId];

                if (perk && state.discoveredPerksMap[passiveId] === 0) {
                    state.discoveredPerksMap[passiveId] = 1;
                    UIEventRingBuffer.push(UIEventType.DISCOVERY, passiveId, DiscoveryType.PERK);
                }
            }
        }
        this.cachedPassives.length = pIdx;

        // --- SYNC TO STATE (Zero-GC) ---
        state.activePassives.length = 0;
        for (let i = 0; i < pIdx; i++) state.activePassives.push(this.cachedPassives[i]);

        return mask;
    }


    private updateBuffsAndDebuffs(session: GameSessionLogic, delta: number, simTime: number, initialMask: number): number {
        const state = session.state;
        const stats = state.statsBuffer;
        let currentPerkMask = initialMask;

        // --- SYNC BUFF FLAGS (Phase 11) ---
        state.statusFlags &= ~(
            PlayerStatusFlags.REFLEX_SHIELD |
            PlayerStatusFlags.ADRENALINE_SHOT |
            PlayerStatusFlags.GIB_MASTER |
            PlayerStatusFlags.QUICK_FINGER |
            PlayerStatusFlags.DISORIENTED |
            PlayerStatusFlags.STUNNED
        );

        // Reset active lists for HUD sync
        state.activeBuffs.length = 0;
        state.activeDebuffs.length = 0;

        // Reset modifiers for integer stacking
        let speedMod = 0, reloadMod = 0, fireRateMod = 0, resistMod = 0, rangeMod = 0;

        // Loop through the effect buffer (32 slots)
        for (let i = 0; i < 32; i++) {
            // Clamping decrement before check
            state.effectDurations[i] = Math.max(0, state.effectDurations[i] - delta * 1000);

            if (state.effectDurations[i] <= 0) {
                // Fade time back to normal when buff expires
                if (i === StatusEffectID.QUICK_FINGER && state.globalTimeScale < 1.0) {
                    state.globalTimeScale = Math.min(1.0, state.globalTimeScale + delta * 3.0);
                }
                continue;
            }

            currentPerkMask |= (1 << i);

            const perk = PERKS[i];
            if (perk) {
                // Sync Bitmask
                if (i === StatusEffectID.REFLEX_SHIELD) state.statusFlags |= PlayerStatusFlags.REFLEX_SHIELD;
                if (i === StatusEffectID.ADRENALINE_PATCH) state.statusFlags |= PlayerStatusFlags.ADRENALINE_SHOT;
                if (i === StatusEffectID.GIB_MASTER) state.statusFlags |= PlayerStatusFlags.GIB_MASTER;
                if (i === StatusEffectID.QUICK_FINGER) state.statusFlags |= PlayerStatusFlags.QUICK_FINGER;
                if (i === StatusEffectID.STUNNED) state.statusFlags |= PlayerStatusFlags.STUNNED;
                if (i === StatusEffectID.DISORIENTED) state.statusFlags |= PlayerStatusFlags.DISORIENTED;

                if (perk.speedModifier) speedMod += perk.speedModifier;
                if (perk.reloadModifier) reloadMod += perk.reloadModifier;
                if (perk.fireRateModifier) fireRateMod += perk.fireRateModifier;
                if (perk.damageResistModifier) resistMod += perk.damageResistModifier;
                if (perk.rangeModifier) rangeMod += perk.rangeModifier;

                if (i === StatusEffectID.DISORIENTED) {
                    state.statusFlags |= PlayerStatusFlags.DISORIENTED;
                    session.engine.camera.shake(0.05);
                }

                if (perk.category === PerkCategory.BUFF) state.activeBuffs.push(i);
                else if (perk.category === PerkCategory.DEBUFF) state.activeDebuffs.push(i);
            }
        }

        // --- TRACK BUFF UPTIME (Zero-GC Accumulation) ---
        if (state.activeBuffs.length > 0) {
            const tracker = session.getSystem<any>(SystemID.DAMAGE_TRACKER);
            if (tracker) tracker.recordBuffTime(session, delta);
        }

        // Add modifiers from current passives too
        for (let j = 0; j < state.activePassives.length; j++) {
            const perk = PERKS[state.activePassives[j]];
            if (perk) {
                if (perk.speedModifier) speedMod += perk.speedModifier;
                if (perk.reloadModifier) reloadMod += perk.reloadModifier;
                if (perk.fireRateModifier) fireRateMod += perk.fireRateModifier;
                if (perk.damageResistModifier) resistMod += perk.damageResistModifier;
                if (perk.rangeModifier) rangeMod += perk.rangeModifier;
            }
        }

        // --- CONVERT TO FLOAT MULTIPLIERS (As per step 3 instructions) ---
        stats[PlayerStatID.MULTIPLIER_SPEED] = Math.max(0.1, 1.0 + (speedMod / 100));
        stats[PlayerStatID.MULTIPLIER_RANGE] = Math.max(0.1, 1.0 + (rangeMod / 100));
        stats[PlayerStatID.MULTIPLIER_RELOAD] = Math.max(0.1, 1.0 - (reloadMod / 100));
        stats[PlayerStatID.MULTIPLIER_FIRERATE] = Math.max(0.1, 1.0 - (fireRateMod / 100));
        stats[PlayerStatID.MULTIPLIER_DMG_RESIST] = Math.max(0.0, 1.0 - (resistMod / 100));

        return currentPerkMask;
    }

    private applyStatusTicks(session: GameSessionLogic, delta: number, simTime: number) {
        const state = session.state;

        // Tick DoT every 1 second
        if (Math.floor(simTime / 1000) !== Math.floor((simTime - delta * 1000) / 1000)) {
            for (let i = 0; i < 32; i++) {
                if (state.effectDurations[i] <= 0) continue;

                const perk = PERKS[i];
                if (!perk || perk.dotDamage === undefined || perk.dotDamage <= 0) continue;

                let dmgID = DamageID.PHYSICAL;
                if (i === StatusEffectID.BURNING) dmgID = DamageID.BURN;
                else if (i === StatusEffectID.BLEEDING) dmgID = DamageID.BLEED;
                else if (i === StatusEffectID.ELECTRIFIED) dmgID = DamageID.ELECTRIC;
                else if (i === StatusEffectID.DROWNING) dmgID = DamageID.DROWNING;
                else if (i === StatusEffectID.FREEZING) dmgID = DamageID.BURN;

                this.handlePlayerHit(session, perk.dotDamage, null, dmgID, true);

                // Track Perk Damage Dealt (DoT)
                state.perkDamageDealt[i] += perk.dotDamage;

                // Visuals
                if (i === StatusEffectID.BLEEDING) {
                    FXSystem.spawnParticle(session.engine.scene, state.particles, this.playerGroup.position.x, 1.5, this.playerGroup.position.z, FXParticleType.BLOOD_SPLATTER, 6);
                } else if (i === StatusEffectID.BURNING) {
                    _v1.set(this.playerGroup.position.x + (Math.random() - 0.5) * 0.5, this.playerGroup.position.y + 1.8, this.playerGroup.position.z + (Math.random() - 0.5) * 0.5);
                    FXSystem.spawnParticle(session.engine.scene, state.particles, _v1.x, _v1.y, _v1.z, FXParticleType.FLAME, 1);
                }
            }
        }
    }

    public handlePlayerHit(
        session: GameSessionLogic,
        damage: number,
        attacker: any,
        type: DamageID,
        isDoT: boolean = false,
        effectType?: StatusEffectID,
        effectDuration?: number,
        effectIntensity?: number,
        specificAttackType?: EnemyAttackType
    ) {
        const state = session.state;
        const now = state.simTime;

        if ((state.statusFlags & PlayerStatusFlags.DEAD) !== 0 || state.sectorState?.isInvincible) return;

        if (state.effectDurations[StatusEffectID.REFLEX_SHIELD] > 0 || state.effectDurations[StatusEffectID.ADRENALINE_PATCH] > 0) {
            // Reflex shield reduces damage by 50% in the calculation below, 
            // but we allow the hit to "land" for feedback.
        }

        let actualDmg = damage * state.statsBuffer[PlayerStatID.MULTIPLIER_DMG_RESIST];

        // Track Damage Absorbed specifically by Reflex Shield (vinterdöd Step 2)
        if (state.effectDurations[StatusEffectID.REFLEX_SHIELD] > 0) {
            // Shield is 50% reduction.
            state.perkDamageAbsorbed[StatusEffectID.REFLEX_SHIELD] += (damage * 0.5);
        }

        const isBite = type === DamageID.BITE;

        if (!isDoT) {
            if (!isBite && now < (state.invulnerableUntil || 0)) return;
            if (isBite && now < (state.lastBiteTime || 0) + 50) return;
        }

        state.statsBuffer[PlayerStatID.HP] -= actualDmg;

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
                    // Bosses: TelemetrySourceOffset.BOSS + BossID
                    telemetrySourceKey = TelemetrySourceOffset.BOSS + attacker.bossId;
                    // For bosses, we use the actual attack type if provided, else HIT/BITE
                    if (specificAttackType !== undefined) telemetryAttackIndex = specificAttackType;
                } else {
                    // Normal Enemies: TelemetrySourceOffset.ENEMY + EnemyType
                    telemetrySourceKey = TelemetrySourceOffset.ENEMY + attacker.type;
                }
            } else {
                // Environment / Pseudo-Weapons: TelemetrySourceOffset.ENVIRONMENT + DamageID
                telemetrySourceKey = TelemetrySourceOffset.ENVIRONMENT + type;
            }

            damageTracker.recordIncomingDamage(session, actualDmg, telemetrySourceKey as any, telemetryAttackIndex, (attacker?.statusFlags & EnemyFlags.BOSS) !== 0);
        }

        if (effectType !== undefined) {
            const perk = PERKS[effectType];
            if (perk) {
                const duration = perk.duration || effectDuration || 0;

                // --- TIMER AUDIT (VINTERDÖD FIX) ---
                const simDelta = session.state.lastSimDelta;
                if (simDelta > 0.5) {
                    console.warn(`[PlayerStatsSystem] CRITICAL: Delta looks like milliseconds (${simDelta.toFixed(4)}). Expected seconds (0.016).`);
                }

                const localizedPerk = DataResolver.getPerkName(effectType, true);
                console.log(`[PlayerStatsSystem] APPLY: ${localizedPerk} for ${duration}ms (ID: ${effectType}, Delta: ${simDelta.toFixed(4)})`);
                state.effectDurations[effectType] = duration;
                state.effectMaxDurations[effectType] = duration; // Sync Max Duration for UI
                state.effectIntensities[effectType] = effectIntensity !== undefined ? effectIntensity : 1;

                // --- SOURCE ATTRIBUTION (Zero-GC) ---
                let effectSourceKey = type;
                if (attacker) {
                    const isBossAttacker = (attacker.statusFlags & EnemyFlags.BOSS) !== 0;
                    if (isBossAttacker && attacker.bossId !== undefined) {
                        effectSourceKey = 16 + attacker.bossId;
                    } else {
                        effectSourceKey = attacker.type;
                    }
                } else {
                    effectSourceKey = 24 + type;
                }
                state.effectSources[effectType] = effectSourceKey;
            }
        }

        if (!isDoT) {
            if (isBite) state.lastBiteTime = now;
            else state.invulnerableUntil = now + 400;
            VoiceSounds.playDamageGrunt();
            state.hurtShake = 1.0;
        }

        state.lastDamageTime = now;

        if (state.particles && !isDoT) {
            FXSystem.spawnParticle(session.engine.scene, state.particles, this.playerGroup.position.x, 1.5, this.playerGroup.position.z, FXParticleType.BLOOD_SPLATTER, 6);
        }

        if (state.statsBuffer[PlayerStatID.HP] <= 0) {
            let finalAttackType = specificAttackType !== undefined ? specificAttackType : EnemyAttackType.HIT;
            if (isDoT && effectType !== undefined) {
                // If it's a DoT, we can use a special logic or just pass ENVIRONMENTAL/HIT
                finalAttackType = EnemyAttackType.ENVIRONMENTAL;
            }
            this.executePlayerDeath(session, attacker, type, finalAttackType, attackIndex, now, isDoT ? effectType : undefined);
        }
    }

    private executePlayerDeath(session: GameSessionLogic, attacker: any, type: DamageID, attackType: EnemyAttackType, attackIndex: number, now: number, lethalEffect?: StatusEffectID) {
        const state = session.state;

        // Telemetry
        const damageTracker = session.getSystem<any>(SystemID.DAMAGE_TRACKER);
        if (damageTracker) {
            damageTracker.recordPlayerDeath(session, type, attacker?.type);
        }

        state.statusFlags |= PlayerStatusFlags.DEAD;
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
            // Check if there's a lethal DoT source
            if (lethalEffect !== undefined && state.effectSources[lethalEffect] !== 0) {
                const source = state.effectSources[lethalEffect];
                // Resolve name based on mapping (0-15: Enemy, 16-23: Boss, 24+: DamageID)
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

        // Rolling kill streak (last 5 kills)
        for (let i = 0; i < 4; i++) state.killStreakBuffer[i] = state.killStreakBuffer[i + 1];
        state.killStreakBuffer[4] = now;

        // Check for 3-kill streak (Adrenaline)
        const kill3Time = state.killStreakBuffer[2]; // 3rd most recent
        if (kill3Time > 0 && (now - kill3Time) < 3000) {
            const cooldown = PERKS[StatusEffectID.ADRENALINE_PATCH]?.cooldown || 15000;
            if (now - (state.lastAdrenalineTime || 0) > cooldown) {
                state.lastAdrenalineTime = now;
                this.triggerBuff(session, StatusEffectID.ADRENALINE_PATCH, now);
            }
        }

        // Check for 5-kill streak (Gib Master)
        const kill5Time = state.killStreakBuffer[0]; // 5th most recent
        if (kill5Time > 0 && (now - kill5Time) < 5000) {
            const cooldown = PERKS[StatusEffectID.GIB_MASTER]?.cooldown || 30000;
            if (now - (state.lastGibMasterTime || 0) > cooldown) {
                state.lastGibMasterTime = now;
                this.triggerBuff(session, StatusEffectID.GIB_MASTER, now);
            }
        }

        // Check for Quick Finger (Any kill)
        const qfPerk = PERKS[StatusEffectID.QUICK_FINGER];
        if (qfPerk) {
            const cooldown = qfPerk.cooldown || 10000;
            if (now - (state.lastQuickFingerTime || 0) > cooldown) {
                state.lastQuickFingerTime = now;
                this.triggerBuff(session, StatusEffectID.QUICK_FINGER, now);
            }
        }

        // --- OPTIMIZED KILL TRACKING (Zero-GC / Step 2) ---
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
        for (let i = 0; i < 32; i++) {
            const p = PERKS[i];
            if (p && p.category === PerkCategory.DEBUFF && state.effectDurations[i] > 0) {
                state.effectDurations[i] = 0;
                cleansedCount++;
            }
        }

        if (cleansedCount > 0) {
            state.perkDebuffsCleansed[perkID] += cleansedCount;
            // Track total resistance
            const tracker = session.getSystem<any>(SystemID.DAMAGE_TRACKER);
            if (tracker) tracker.recordDebuffsResisted(session, cleansedCount);
        }

        state.effectDurations[perkID] = perk.duration || 1000;
        state.effectMaxDurations[perkID] = perk.duration || 1000;

        // Activation count for manual trigger
        state.perkTimesGained[perkID]++;
    }

    private triggerBuff(session: GameSessionLogic, type: StatusEffectID, now: number) {
        const state = session.state;
        const perk = PERKS[type];
        if (perk) {
            state.effectDurations[type] = perk.duration || 3000;
            state.effectMaxDurations[type] = perk.duration || 3000;

            // Activation count
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

            // Notification for the player
            if (session.triggerDiscovery) {
                const perk = PERKS[StatusEffectID.QUICK_FINGER];
                if (perk && state.discoveredPerksMap[StatusEffectID.QUICK_FINGER] === 0) {
                    state.discoveredPerksMap[StatusEffectID.QUICK_FINGER] = 1;
                    UIEventRingBuffer.push(UIEventType.DISCOVERY, StatusEffectID.QUICK_FINGER, DiscoveryType.PERK);
                }
            }
        }
    }

    clear() { }
}
