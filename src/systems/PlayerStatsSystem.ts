import * as THREE from 'three';
import { System } from './System';
import { GameSessionLogic } from '../game/session/GameSessionLogic';
import { UiSounds, VoiceSounds } from '../utils/audio/AudioLib';
import { audioEngine } from '../utils/audio/AudioEngine';
import { FXSystem } from './FXSystem';
import { PlayerDeathState, DamageID, EnemyAttackType } from '../entities/player/CombatTypes';
import { PERKS, StatusEffectType, PerkCategory } from '../content/perks';
import { MaterialType } from '../content/environment';
import { PlayerStatID, PlayerStatusFlags } from '../entities/player/PlayerTypes';
import { SoundID } from '../utils/audio/AudioTypes';
import { EnemyType, EnemyFlags } from '../entities/enemies/EnemyTypes';
import { KMH_TO_MS } from '../content/constants';
import { DataResolver } from '../utils/ui/DataResolver';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export class PlayerStatsSystem implements System {
    id = 'player_stats_system';
    isFixedStep = true;

    private cachedPassives: StatusEffectType[] = [];

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
        const state = session.state;
        if ((state.statusFlags & PlayerStatusFlags.DEAD) !== 0) return;
        if ((state.statusFlags & PlayerStatusFlags.STUNNED) !== 0) return;

        let currentMask = this.updatePassives(session);
        this.checkAdrenalinePatch(session, simTime);
        currentMask = this.updateBuffsAndDebuffs(session, delta, simTime, currentMask);
        this.applyStatusTicks(session, delta, simTime);

        // --- STATUS TRANSITION SOUNDS (VINTERDÖD FIX: Debounced & Pulse-Protected) ---
        const startMask = state.previousPerkMask;
        if (currentMask !== startMask) {
            for (let i = 0; i < 32; i++) {
                const isNew = (currentMask & (1 << i)) && !(startMask & (1 << i));
                const isRemoved = !(currentMask & (1 << i)) && (startMask & (1 << i));

                if (isNew) {
                    const perk = PERKS[i];
                    if (perk) {
                        // VINTERDÖD FIX: Double check that we aren't just refreshing an existing duration 
                        // by accident (though previousPerkMask should prevent this).
                        if (perk.category === PerkCategory.BUFF) audioEngine.playSound(SoundID.BUFF_GAINED);
                        else if (perk.category === PerkCategory.DEBUFF) audioEngine.playSound(SoundID.DEBUFF_GAINED);
                        else if (perk.category === PerkCategory.PASSIVE) audioEngine.playSound(SoundID.PASSIVE_GAINED);

                        if (!state.discoveredPerks.includes(i)) {
                            state.discoveredPerks.push(i);
                            session.triggerDiscovery('perk', i, perk.displayName, perk.description);
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

    private checkAdrenalinePatch(session: GameSessionLogic, simTime: number) {
        const state = session.state;
        const perkID = StatusEffectType.ADRENALINE_PATCH;
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

                // VINTERDÖD: Removed legacy sound trigger. 
                // Detection now happens in the main update loop via bitmask.

                if (!state.discoveredPerks.includes(perkID)) {
                    state.discoveredPerks.push(perkID);
                    session.triggerDiscovery('perk', perkID, perk.displayName, perk.description);
                }
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

            const name = member.name.toLowerCase();
            let passiveId: StatusEffectType | null = null;

            if (name === 'loke') passiveId = StatusEffectType.TRICKSTERS_HASTE;
            else if (name === 'jordan') passiveId = StatusEffectType.EAGLES_SIGHT;
            else if (name === 'esmeralda') passiveId = StatusEffectType.LEAD_FEVER;
            else if (name === 'nathalie') passiveId = StatusEffectType.WINTERS_BONE;

            if (passiveId !== null) {
                mask |= (1 << passiveId); // Set bit for mask
                this.cachedPassives[pIdx++] = passiveId;
                const perk = PERKS[passiveId];

                if (perk && !state.discoveredPerks.includes(passiveId)) {
                    state.discoveredPerks.push(passiveId);
                    session.triggerDiscovery('perk', passiveId, perk.displayName, perk.description);
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
                if (i === StatusEffectType.QUICK_FINGER && state.globalTimeScale < 1.0) {
                    state.globalTimeScale = Math.min(1.0, state.globalTimeScale + delta * 3.0);
                }
                continue;
            }

            currentPerkMask |= (1 << i);

            const perk = PERKS[i];
            if (perk) {
                // Sync Bitmask
                if (i === StatusEffectType.REFLEX_SHIELD) state.statusFlags |= PlayerStatusFlags.REFLEX_SHIELD;
                if (i === StatusEffectType.ADRENALINE_PATCH) state.statusFlags |= PlayerStatusFlags.ADRENALINE_SHOT;
                if (i === StatusEffectType.GIB_MASTER) state.statusFlags |= PlayerStatusFlags.GIB_MASTER;
                if (i === StatusEffectType.QUICK_FINGER) state.statusFlags |= PlayerStatusFlags.QUICK_FINGER;
                if (i === StatusEffectType.STUNNED) state.statusFlags |= PlayerStatusFlags.STUNNED;

                if (perk.speedModifier) speedMod += perk.speedModifier;
                if (perk.reloadModifier) reloadMod += perk.reloadModifier;
                if (perk.fireRateModifier) fireRateMod += perk.fireRateModifier;
                if (perk.damageResistModifier) resistMod += perk.damageResistModifier;
                if (perk.rangeModifier) rangeMod += perk.rangeModifier;

                if (i === StatusEffectType.DISORIENTED) {
                    state.statusFlags |= PlayerStatusFlags.DISORIENTED;
                    session.engine.camera.shake(0.05);
                }

                if (perk.category === PerkCategory.BUFF) state.activeBuffs.push(i);
                else if (perk.category === PerkCategory.DEBUFF) state.activeDebuffs.push(i);
            }
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
                if (i === StatusEffectType.BURNING) dmgID = DamageID.BURN;
                else if (i === StatusEffectType.BLEEDING) dmgID = DamageID.BLEED;
                else if (i === StatusEffectType.ELECTRIFIED) dmgID = DamageID.ELECTRIC;
                else if (i === StatusEffectType.DROWNING) dmgID = DamageID.DROWNING;
                else if (i === StatusEffectType.FREEZING) dmgID = DamageID.BURN;

                this.handlePlayerHit(session, perk.dotDamage, null, dmgID, true);

                // Visuals
                if (i === StatusEffectType.BLEEDING) {
                    FXSystem.spawnPart(session.engine.scene, state.particles, this.playerGroup.position.x, 1.5, this.playerGroup.position.z, 'blood_splatter', 6);
                } else if (i === StatusEffectType.BURNING) {
                    _v1.set(this.playerGroup.position.x + (Math.random() - 0.5) * 0.5, this.playerGroup.position.y + 1.8, this.playerGroup.position.z + (Math.random() - 0.5) * 0.5);
                    FXSystem.spawnPart(session.engine.scene, state.particles, _v1.x, _v1.y, _v1.z, 'flame', 1);
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
        effectType?: StatusEffectType,
        effectDuration?: number,
        effectIntensity?: number,
        specificAttackType?: string
    ) {
        const state = session.state;
        const now = state.simTime;

        if ((state.statusFlags & PlayerStatusFlags.DEAD) !== 0 || state.sectorState?.isInvincible) return;

        // VINTERDÖD: Perfect Dodge Logic
        // If an attack lands while dodging, trigger QUICK_FINGER (Bullet Time)
        if ((state.statusFlags & PlayerStatusFlags.DODGING) !== 0 && !isDoT) {
            const cooldown = PERKS[StatusEffectType.QUICK_FINGER]?.cooldown || 30000;
            if (now - state.lastPerfectDodgeTime > cooldown) {
                state.lastPerfectDodgeTime = now;
                this.triggerBuff(session, StatusEffectType.QUICK_FINGER, now);
                state.globalTimeScale = 0.2; // ACTIVATE SLOWMO
                audioEngine.playSound(SoundID.BUFF_GAINED);
                return; // Negate Damage
            }
        }

        if (state.effectDurations[StatusEffectType.REFLEX_SHIELD] > 0 || state.effectDurations[StatusEffectType.ADRENALINE_PATCH] > 0) {
            // Reflex shield reduces damage by 50% in the calculation below, 
            // but we allow the hit to "land" for feedback.
        }

        let actualDmg = damage * state.statsBuffer[PlayerStatID.MULTIPLIER_DMG_RESIST];
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
        const damageTracker = session.getSystem('damage_tracker_system') as any;
        if (damageTracker) {
            let sourceKey = type; // Use the direct DamageID (SMI)

            if (attacker) {
                const isBossAttacker = (attacker.statusFlags & EnemyFlags.BOSS) !== 0;
                if (isBossAttacker && attacker.bossId !== undefined) {
                    sourceKey = DamageID.BOSS;
                    // For bosses, attackIndex is their identity in telemetry grouping
                    // but we also want the killerAttackName to be correct.
                    // Wait, if I use attackIndex = attacker.bossId here, I overwrite BITE/HIT.
                    // Let's use a separate local for telemetry recording.
                } else {
                    sourceKey = DamageID.PHYSICAL;
                }
            }

            let telemetryAttackIndex = attackIndex;
            if (attacker && (attacker.statusFlags & EnemyFlags.BOSS) !== 0 && attacker.bossId !== undefined) {
                telemetryAttackIndex = attacker.bossId;
            }

            damageTracker.recordIncomingDamage(session, actualDmg, sourceKey, telemetryAttackIndex, (attacker?.statusFlags & EnemyFlags.BOSS) !== 0);
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
            FXSystem.spawnPart(session.engine.scene, state.particles, this.playerGroup.position.x, 1.5, this.playerGroup.position.z, 'blood_splatter', 6);
        }

        if (state.statsBuffer[PlayerStatID.HP] <= 0) {
            let finalAttackName = specificAttackType || 'HIT';
            if (isDoT && effectType !== undefined) {
                finalAttackName = (StatusEffectType as any)[effectType] || 'DOT';
            }
            this.executePlayerDeath(session, attacker, type, finalAttackName, attackIndex, now);
        }
    }

    private executePlayerDeath(session: GameSessionLogic, attacker: any, type: DamageID, attackName: string, attackIndex: number, now: number) {
        const state = session.state;
        state.statusFlags |= PlayerStatusFlags.DEAD;
        state.deathStartTime = now;
        state.killerType = type;
        state.playerDeathState = PlayerDeathState.NORMAL;

        if (type === DamageID.EXPLOSION) state.playerDeathState = PlayerDeathState.GIBBED;
        else if (type === DamageID.BURN) state.playerDeathState = PlayerDeathState.BURNED;
        else if (type === DamageID.DROWNING) state.playerDeathState = PlayerDeathState.DROWNED;
        else if (type === DamageID.ELECTRIC) state.playerDeathState = PlayerDeathState.ELECTROCUTED;

        if (attacker && (attacker.statusFlags & EnemyFlags.BOSS) !== 0 && attacker.bossId !== undefined) {
            state.killerName = DataResolver.getEnemyName(EnemyType.BOSS, attacker.bossId);
            state.killedByEnemy = true;
            state.killerAttackName = attackName; // Boss attacks might be custom strings
        } else if (attacker) {
            state.killerName = DataResolver.getEnemyName(attacker.type);
            state.killedByEnemy = true;
            state.killerAttackName = DataResolver.getAttackName(attackIndex);
        } else {
            state.killerName = DataResolver.getDamageName(type);
            state.killedByEnemy = false;
            state.killerAttackName = 'HIDDEN';
        }

        const input = session.engine.input.state;
        _v1.set(0, 0, 0);
        if (input.w) _v1.z -= 1; if (input.s) _v1.z += 1;
        if (input.a) _v1.x -= 1; if (input.d) _v1.x += 1;

        if (_v1.lengthSq() > 0) {
            state.deathVel.copy(_v1).normalize().multiplyScalar(15);
        } else if (attacker && attacker.mesh) {
            state.deathVel.subVectors(this.playerGroup.position, attacker.mesh.position).normalize().multiplyScalar(12);
        } else {
            state.deathVel.set(0, 0, 12);
        }
        state.deathVel.y = 4;
    }

    public onEnemyKilled(session: GameSessionLogic, enemy: any, now: number) {
        const state = session.state;

        // Rolling kill streak (last 5 kills)
        for (let i = 0; i < 4; i++) state.killStreakBuffer[i] = state.killStreakBuffer[i + 1];
        state.killStreakBuffer[4] = now;

        // Check for 3-kill streak (Adrenaline)
        const kill3Time = state.killStreakBuffer[2]; // 3rd most recent
        if (kill3Time > 0 && (now - kill3Time) < 3000) {
            const cooldown = PERKS[StatusEffectType.ADRENALINE_PATCH]?.cooldown || 15000;
            if (now - (state.lastAdrenalineTime || 0) > cooldown) {
                state.lastAdrenalineTime = now;
                this.triggerBuff(session, StatusEffectType.ADRENALINE_PATCH, now);
            }
        }

        // Check for 5-kill streak (Gib Master)
        const kill5Time = state.killStreakBuffer[0]; // 5th most recent
        if (kill5Time > 0 && (now - kill5Time) < 5000) {
            const cooldown = PERKS[StatusEffectType.GIB_MASTER]?.cooldown || 30000;
            if (now - (state.lastGibMasterTime || 0) > cooldown) {
                state.lastGibMasterTime = now;
                this.triggerBuff(session, StatusEffectType.GIB_MASTER, now);
            }
        }
    }

    public triggerReflexShield(session: GameSessionLogic, now: number) {
        const state = session.state;
        const perkID = StatusEffectType.REFLEX_SHIELD;
        const perk = PERKS[perkID];
        for (let i = 0; i < 32; i++) {
            const p = PERKS[i];
            if (p && p.category === PerkCategory.DEBUFF) state.effectDurations[i] = 0;
        }
        state.effectDurations[perkID] = perk.duration || 1000;
        state.effectMaxDurations[perkID] = perk.duration || 1000;
    }

    private triggerBuff(session: GameSessionLogic, type: StatusEffectType, now: number) {
        const state = session.state;
        const perk = PERKS[type];
        if (perk) {
            state.effectDurations[type] = perk.duration || 3000;
            state.effectMaxDurations[type] = perk.duration || 3000;
        }
    }

    clear() { }
}
