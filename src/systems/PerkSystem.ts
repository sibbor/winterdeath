import * as THREE from 'three';
import { System, SystemID } from './System';
import { GameSessionLogic } from '../game/session/GameSessionLogic';
import { PERKS, PerkCategory, StatusEffectID } from '../content/perks';
import { PlayerStatID, PlayerStatusFlags } from '../types/CareerStats';
import { FXSystem } from './FXSystem';
import { FXParticleType } from '../types/FXTypes';
import { DamageID, DamageType } from '../entities/player/CombatTypes';
import { FamilyMemberID } from '../content/constants';
import { audioEngine } from '../utils/audio/AudioEngine';
import { SoundID } from '../utils/audio/AudioTypes';
import { DiscoveryType } from '../components/ui/hud/HudTypes';
import { KMH_TO_MS, MAX_ENTITIES, COMBAT } from '../content/constants';
import { DiscoverySystem } from './DiscoverySystem';
import type { DamageTrackerSystem } from './DamageTrackerSystem';
import type { PlayerStatsSystem } from './PlayerStatsSystem';

/**
 * PerkSystem
 * 
 * Centralized logic for all perks, buffs, and debuffs.
 * Handles duration management, modifier aggregation, and DoT ticks.
 */
export class PerkSystem implements System {
    readonly systemId = SystemID.PERK_SYSTEM;
    id = 'perk_system';
    enabled = true;
    persistent = false;
    isFixedStep = true;

    private _v1 = new THREE.Vector3();
    private _effectNextTicks = new Float32Array(MAX_ENTITIES.PERKS);

    // System references
    private discoverySystem!: DiscoverySystem;
    private damageTracker!: DamageTrackerSystem;
    private playerStats!: PlayerStatsSystem;

    constructor(
        private playerGroup: THREE.Group,
        private activeFamilyMembers: { current: any[] }
    ) { }

    init(session: GameSessionLogic) {
        this.discoverySystem = session.getSystem<DiscoverySystem>(SystemID.DISCOVERY_SYSTEM)!;
        this.damageTracker = session.getSystem<DamageTrackerSystem>(SystemID.DAMAGE_TRACKER)!;
        this.playerStats = session.getSystem<PlayerStatsSystem>(SystemID.PLAYER_STATS)!;
        this.refreshBaseStats(session);

        this.processEffects(session, 0);
    }

    /**
     * Unified Perk/Buff/Debuff Activation
     * Centralized Source of Truth for all state transitions.
     */
    public applyPerk(session: GameSessionLogic, id: StatusEffectID, duration?: number, intensity?: number) {
        if (id === undefined || id < 0) return;

        const state = session.state;
        const perk = PERKS[id];
        if (!perk) return;

        const isAlreadyActive = state.combat.effectDurations[id] > 0;

        // 1. Duration Management (Zero-GC Array Access)
        const finalDuration = duration || perk.duration || 3000;
        state.combat.effectDurations[id] = finalDuration;
        state.combat.effectMaxDurations[id] = finalDuration;
        state.combat.effectIntensities[id] = intensity !== undefined ? intensity : 1;

        if (perk.damageResistModifier) {
            state.combat.activeResistPerkIdx = id;
        }

        // 2. Telemetry & Discovery Signal
        if (state.combat.perkTimesGained[id] === 0) {
            this.discoverySystem.handleDiscovery(session, DiscoveryType.PERK, id, id, perk.displayName, perk.description);
        }

        if (!isAlreadyActive) {
            state.combat.perkTimesGained[id]++;

            // Visual/Audio Feedback based on category
            if (perk.category === PerkCategory.BUFF) {
                audioEngine.playSound(SoundID.BUFF_GAINED);
            } else if (perk.category === PerkCategory.DEBUFF) {
                audioEngine.playSound(SoundID.DEBUFF_GAINED);
            } else if (perk.category === PerkCategory.PASSIVE) {
                audioEngine.playSound(SoundID.PASSIVE_GAINED);
            }
        }

        // 3. Perk-Specific Trigger Logic (Phase 11 Refactor)
        switch (id) {
            case StatusEffectID.REFLEX_SHIELD:
                this.handleReflexShieldActivation(session);
                break;

            case StatusEffectID.ADRENALINE_PATCH:
                this.handleAdrenalinePatchActivation(session);
                break;

            case StatusEffectID.QUICK_FINGER:
                // Perfect Dodge slows time significantly
                state.metrics.globalTimeScale = 0.2;
                break;

            case StatusEffectID.GIB_MASTER:
                break;
        }
    }

    private handleReflexShieldActivation(session: GameSessionLogic) {
        const state = session.state;
        const perkID = StatusEffectID.REFLEX_SHIELD;

        // SPECIFIC: Reflex Shield cleanses all active debuffs on trigger
        let cleansedCount = 0;
        for (let i = 0; i < MAX_ENTITIES.PERKS; i++) {
            const p = PERKS[i];
            if (p && p.category === PerkCategory.DEBUFF && state.combat.effectDurations[i] > 0) {
                state.combat.effectDurations[i] = 0;
                cleansedCount++;
            }
        }

        if (cleansedCount > 0) {
            state.combat.perkDebuffsCleansed[perkID] += cleansedCount;
            this.damageTracker.recordDebuffsResisted(session, cleansedCount);
        }

        audioEngine.playSound(SoundID.UI_CHIME);
    }

    private handleAdrenalinePatchActivation(session: GameSessionLogic) {
        const state = session.state;
        const perkID = StatusEffectID.ADRENALINE_PATCH;

        // SPECIFIC: Adrenaline Patch cleanses all active debuffs on trigger
        let cleansedCount = 0;
        for (let i = 0; i < MAX_ENTITIES.PERKS; i++) {
            const p = PERKS[i];
            if (p && p.category === PerkCategory.DEBUFF && state.combat.effectDurations[i] > 0) {
                state.combat.effectDurations[i] = 0;
                cleansedCount++;
            }
        }

        if (cleansedCount > 0) {
            state.combat.perkDebuffsCleansed[perkID] += cleansedCount;
            this.damageTracker.recordDebuffsResisted(session, cleansedCount);
        }

        audioEngine.playSound(SoundID.UI_CHIME);
    }

    update(session: GameSessionLogic, delta: number, simTime: number) {
        if (!session || !session.state) return;

        // 1. Process Active Buffs/Debuffs (Passives are handled via event-driven BASE_MULTIPLIER)
        this.processEffects(session, delta);

        // 2. Apply DoT Ticks
        this.applyStatusTicks(session, simTime);

        // 3. Adrenaline Patch check (refactored from PlayerStatsSystem)
        this.checkAdrenalinePatch(session, simTime);

        // 4. Reflex Shield check on active dodge/rush (refactored from PlayerMovementSystem)
        if (session.state.player.isDodging || session.state.player.isRushing) {
            this.checkReflexShield(session, simTime);
        }
    }

    private checkAdrenalinePatch(session: GameSessionLogic, simTime: number) {
        const state = session.state;
        const perkID = StatusEffectID.ADRENALINE_PATCH;
        const perk = PERKS[perkID];
        if (!perk) return;

        const hp = state.player.statsBuffer[PlayerStatID.HP];
        const maxHp = state.player.statsBuffer[PlayerStatID.MAX_HP];

        if (hp > 0 && hp < maxHp * COMBAT.CRISIS_HP_RATIO) {
            const cooldown = perk.cooldown ?? 60000;
            if (simTime - state.combat.lastAdrenalinePatchTime > cooldown) {
                state.combat.lastAdrenalinePatchTime = simTime;

                this.applyPerk(session, perkID);

                this.damageTracker.recordCrisisSave(session);
            }
        }
    }

    private checkReflexShield(session: GameSessionLogic, simTime: number) {
        const state = session.state;
        const perkID = StatusEffectID.REFLEX_SHIELD;

        const perk = PERKS[perkID];
        const cooldown = perk?.cooldown ?? 10000;

        if (simTime - state.combat.lastReflexShieldTime > cooldown) {
            state.combat.lastReflexShieldTime = simTime;

            this.applyPerk(session, perkID);
        }
    }

    /**
     * Permanent Base Upgrade: Refreshes multipliers from following family members.
     * Called ONLY on sector load and when a family member is rescued.
     */
    public refreshBaseStats(session: GameSessionLogic) {
        const family = this.activeFamilyMembers.current;
        const state = session.state;
        const stats = state.player.statsBuffer;

        // Reset Base Multipliers
        stats[PlayerStatID.BASE_MULTIPLIER_SPEED] = 1.0;
        stats[PlayerStatID.BASE_MULTIPLIER_RELOAD] = 1.0;
        stats[PlayerStatID.BASE_MULTIPLIER_FIRERATE] = 1.0;
        stats[PlayerStatID.BASE_MULTIPLIER_DMG_RESIST] = 1.0;
        stats[PlayerStatID.BASE_MULTIPLIER_RANGE] = 1.0;

        state.combat.activePassivesCount = 0;

        for (let i = 0; i < family.length; i++) {
            const member = family[i];
            if (!member.following) continue;

            let passiveId: StatusEffectID | null = null;
            if (member.id === FamilyMemberID.LOKE) passiveId = StatusEffectID.TRICKSTERS_HASTE;
            else if (member.id === FamilyMemberID.JORDAN) passiveId = StatusEffectID.EAGLES_SIGHT;
            else if (member.id === FamilyMemberID.ESMERALDA) passiveId = StatusEffectID.LEAD_FEVER;
            else if (member.id === FamilyMemberID.NATHALIE) passiveId = StatusEffectID.WINTERS_BONE;

            if (passiveId !== null) {
                state.combat.activePassives[state.combat.activePassivesCount++] = passiveId;

                // Discovery & Feedback (Only triggers the first time per sector if newly found)
                if (state.combat.perkTimesGained[passiveId] === 0) {
                    this.applyPerk(session, passiveId);
                }

                // Apply permanent base upgrade
                const perk = PERKS[passiveId];
                if (perk) {
                    if (perk.speedModifier) stats[PlayerStatID.BASE_MULTIPLIER_SPEED] += (perk.speedModifier / 100);
                    if (perk.reloadModifier) stats[PlayerStatID.BASE_MULTIPLIER_RELOAD] *= (1.0 / (1.0 + perk.reloadModifier / 100));
                    if (perk.fireRateModifier) stats[PlayerStatID.BASE_MULTIPLIER_FIRERATE] *= (1.0 / (1.0 + perk.fireRateModifier / 100));
                    if (perk.damageResistModifier) stats[PlayerStatID.BASE_MULTIPLIER_DMG_RESIST] *= (1.0 - (perk.damageResistModifier / 100));
                    if (perk.rangeModifier) stats[PlayerStatID.BASE_MULTIPLIER_RANGE] += (perk.rangeModifier / 100);
                }
            }
        }
    }

    private processEffects(session: GameSessionLogic, delta: number) {
        const state = session.state;
        const stats = state.player.statsBuffer;
        const durations = state.combat.effectDurations;

        // 1. Initialize Multipliers from Permanent Base Layer (Phase 11 Refactor)
        stats[PlayerStatID.MULTIPLIER_SPEED] = stats[PlayerStatID.BASE_MULTIPLIER_SPEED];
        stats[PlayerStatID.MULTIPLIER_RELOAD] = stats[PlayerStatID.BASE_MULTIPLIER_RELOAD];
        stats[PlayerStatID.MULTIPLIER_FIRERATE] = stats[PlayerStatID.BASE_MULTIPLIER_FIRERATE];
        stats[PlayerStatID.MULTIPLIER_DMG_RESIST] = stats[PlayerStatID.BASE_MULTIPLIER_DMG_RESIST];
        stats[PlayerStatID.MULTIPLIER_RANGE] = stats[PlayerStatID.BASE_MULTIPLIER_RANGE];

        // 2. Clear high-frequency flags driven by perks
        state.combat.statusFlags &= ~(
            PlayerStatusFlags.REFLEX_SHIELD |
            PlayerStatusFlags.ADRENALINE_PATCH |
            PlayerStatusFlags.GIB_MASTER |
            PlayerStatusFlags.QUICK_FINGER |
            PlayerStatusFlags.STUNNED |
            PlayerStatusFlags.DISORIENTED |
            PlayerStatusFlags.BLEEDING |
            PlayerStatusFlags.BURNING |
            PlayerStatusFlags.SLOWED |
            PlayerStatusFlags.FREEZING |
            PlayerStatusFlags.ELECTRIFIED |
            PlayerStatusFlags.DROWNING
        );

        // Reset UI category counts
        state.combat.activeBuffsCount = 0;
        state.combat.activeDebuffsCount = 0;

        // 3. Iterate All Buffs & Debuffs
        for (let i = 0; i < MAX_ENTITIES.PERKS; i++) {
            if (durations[i] <= 0) continue;

            // Decrement duration
            durations[i] = Math.max(0, durations[i] - delta * 1000);

            if (durations[i] <= 0) {
                if (state.combat.activeResistPerkIdx === i) {
                    state.combat.activeResistPerkIdx = -1;
                }
                // Expiry Logic: Reset timescale if Quick Finger expires
                if (i === StatusEffectID.QUICK_FINGER && state.metrics.globalTimeScale < 1.0) {
                    state.metrics.globalTimeScale = 1.0;
                }
                continue;
            }

            const perk = PERKS[i];
            if (!perk) continue;

            // Category tracking for UI
            if (perk.category === PerkCategory.BUFF) state.combat.activeBuffs[state.combat.activeBuffsCount++] = i;
            else if (perk.category === PerkCategory.DEBUFF) state.combat.activeDebuffs[state.combat.activeDebuffsCount++] = i;

            // Modifier stacking
            this.aggregateModifiers(stats, perk);

            // Flag syncing for systems
            this.syncPerkFlags(state.combat, i);
        }

        // --- FINAL BAKE ---
        stats[PlayerStatID.FINAL_SPEED] = stats[PlayerStatID.SPEED] * stats[PlayerStatID.MULTIPLIER_SPEED] * KMH_TO_MS;

        // Track Buff Uptime for Statistics
        if (state.combat.activeBuffsCount > 0) {
            this.damageTracker.recordBuffTime(session, delta);
        }
    }

    private aggregateModifiers(stats: Float32Array, perk: any) {
        if (perk.speedModifier) stats[PlayerStatID.MULTIPLIER_SPEED] += (perk.speedModifier / 100);
        if (perk.reloadModifier) stats[PlayerStatID.MULTIPLIER_RELOAD] *= (1.0 / (1.0 + perk.reloadModifier / 100));
        if (perk.fireRateModifier) stats[PlayerStatID.MULTIPLIER_FIRERATE] *= (1.0 / (1.0 + perk.fireRateModifier / 100));
        if (perk.damageResistModifier) stats[PlayerStatID.MULTIPLIER_DMG_RESIST] *= (1.0 - (perk.damageResistModifier / 100));
        if (perk.rangeModifier) stats[PlayerStatID.MULTIPLIER_RANGE] += (perk.rangeModifier / 100);
    }

    private syncPerkFlags(state: any, id: StatusEffectID) {
        switch (id) {
            case StatusEffectID.REFLEX_SHIELD: state.statusFlags |= PlayerStatusFlags.REFLEX_SHIELD; break;
            case StatusEffectID.ADRENALINE_PATCH: state.statusFlags |= PlayerStatusFlags.ADRENALINE_PATCH; break;
            case StatusEffectID.GIB_MASTER: state.statusFlags |= PlayerStatusFlags.GIB_MASTER; break;
            case StatusEffectID.QUICK_FINGER: state.statusFlags |= PlayerStatusFlags.QUICK_FINGER; break;
            case StatusEffectID.STUNNED: state.statusFlags |= PlayerStatusFlags.STUNNED; break;
            case StatusEffectID.DISORIENTED: state.statusFlags |= PlayerStatusFlags.DISORIENTED; break;
            case StatusEffectID.BLEEDING: state.statusFlags |= PlayerStatusFlags.BLEEDING; break;
            case StatusEffectID.BURNING: state.statusFlags |= PlayerStatusFlags.BURNING; break;
            case StatusEffectID.SLOWED: state.statusFlags |= PlayerStatusFlags.SLOWED; break;
            case StatusEffectID.FREEZING: state.statusFlags |= PlayerStatusFlags.FREEZING; break;
            case StatusEffectID.ELECTRIFIED: state.statusFlags |= PlayerStatusFlags.ELECTRIFIED; break;
            case StatusEffectID.DROWNING: state.statusFlags |= PlayerStatusFlags.DROWNING; break;
        }
    }

    private applyStatusTicks(session: GameSessionLogic, simTime: number) {
        const state = session.state;
        const durations = state.combat.effectDurations;
        const TICK_INTERVAL_MS = 1000;

        for (let i = 0; i < MAX_ENTITIES.PERKS; i++) {
            if (durations[i] <= 0) {
                this._effectNextTicks[i] = 0;
                continue;
            }

            const perk = PERKS[i];
            if (!perk || !perk.dotDamage) continue;

            if (this._effectNextTicks[i] === 0) {
                this._effectNextTicks[i] = simTime + TICK_INTERVAL_MS;
                this.dealTickDamage(session, i, perk);
                continue;
            }

            if (simTime >= this._effectNextTicks[i]) {
                this._effectNextTicks[i] = simTime + TICK_INTERVAL_MS;
                this.dealTickDamage(session, i, perk);
            }
        }
    }

    private dealTickDamage(session: GameSessionLogic, i: number, perk: any) {
        const state = session.state;
        const intensity = state.combat.effectIntensities[i] || 1.0;
        const totalDamage = perk.dotDamage * intensity;

        const dmgID = this.getDebuffDamageID(i);
        const dmgType = this.getDebuffDamageType(i);
        this.playerStats.handlePlayerHit(session, totalDamage, null, dmgType, dmgID, true, i);

        state.combat.perkDamageDealt[i] += totalDamage;
        this.spawnTickFX(session, perk.id);
    }

    private spawnTickFX(session: GameSessionLogic, effectId: StatusEffectID) {
        const state = session.state;
        const pos = this.playerGroup.position;
        const scene = session.engine.scene;

        switch (effectId) {
            case StatusEffectID.BLEEDING:
                FXSystem.spawnParticle(scene, state.combat.particles, pos.x, 1.5, pos.z, FXParticleType.BLOOD_SPLATTER, 3);
                break;
            case StatusEffectID.BURNING:
                this._v1.set(pos.x + (Math.random() - 0.5) * 0.5, pos.y + 1.2, pos.z + (Math.random() - 0.5) * 0.5);
                FXSystem.spawnParticle(scene, state.combat.particles, this._v1.x, this._v1.y, this._v1.z, FXParticleType.FLAME, 4 + Math.floor(Math.random() * 3));
                break;
            case StatusEffectID.ELECTRIFIED:
                this._v1.set(pos.x + (Math.random() - 0.5) * 0.4, pos.y + 1.2, pos.z + (Math.random() - 0.5) * 0.4);
                FXSystem.spawnParticle(scene, state.combat.particles, this._v1.x, this._v1.y, this._v1.z, FXParticleType.SPARK, 3);
                break;
            case StatusEffectID.FREEZING:
                this._v1.set(pos.x + (Math.random() - 0.5) * 0.5, pos.y + 1.5, pos.z + (Math.random() - 0.5) * 0.5);
                FXSystem.spawnParticle(scene, state.combat.particles, this._v1.x, this._v1.y, this._v1.z, FXParticleType.SNOW_PUFF, 3);
                break;
            case StatusEffectID.DROWNING:
                FXSystem.spawnParticle(scene, state.combat.particles, pos.x, 0.2, pos.z, FXParticleType.SPLASH, 3);
                break;
        }
    }

    private getDebuffDamageID(effectId: StatusEffectID): DamageID {
        switch (effectId) {
            case StatusEffectID.BURNING: return DamageID.BURN;
            case StatusEffectID.BLEEDING: return DamageID.BLEED;
            case StatusEffectID.ELECTRIFIED: return DamageID.ELECTRIC;
            case StatusEffectID.FREEZING: return DamageID.FROST;
            case StatusEffectID.DROWNING: return DamageID.DROWNING;
            default: return DamageID.OTHER;
        }
    }

    private getDebuffDamageType(effectId: StatusEffectID): DamageType {
        switch (effectId) {
            case StatusEffectID.BURNING: return DamageType.BURN;
            case StatusEffectID.BLEEDING: return DamageType.BLEED;
            case StatusEffectID.ELECTRIFIED: return DamageType.ELECTRIC;
            case StatusEffectID.FREEZING: return DamageType.FROST;
            case StatusEffectID.DROWNING: return DamageType.DROWNING;
            default: return DamageType.PHYSICAL;
        }
    }



    clear() { }
}

