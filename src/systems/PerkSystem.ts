import * as THREE from 'three';
import { System, SystemID } from './System';
import { GameSessionLogic } from '../game/session/GameSessionLogic';
import { PERKS, PerkCategory, StatusEffectID } from '../content/perks';
import { StatusEffect } from '../types/StatusEffects';
import { PlayerStatID, PlayerStatusFlags } from '../entities/player/PlayerTypes';
import { UIEventRingBuffer, UIEventType } from './ui/UIEventRingBuffer';
import { FXSystem } from './FXSystem';
import { FXParticleType } from '../types/FXTypes';
import { DamageID } from '../entities/player/CombatTypes';
import { FamilyMemberID } from '../content/constants';
import { audioEngine } from '../utils/audio/AudioEngine';
import { SoundID } from '../utils/audio/AudioTypes';
import { DiscoveryType } from '../components/ui/hud/HudTypes';

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

    constructor(
        private playerGroup: THREE.Group,
        private activeFamilyMembers: { current: any[] }
    ) { }

    init(session: GameSessionLogic) {
        this.updatePassives(session);
    }

    update(session: GameSessionLogic, delta: number, simTime: number) {
        if (!session || !session.state) return;
        const state = session.state;

        // 1. Update Active Passives (Based on following family members)
        this.updatePassives(session);

        // 2. Process Timers and Aggregate Modifiers
        this.processEffects(session, delta);

        // 3. Apply DoT Ticks
        this.applyStatusTicks(session, simTime);

        // 4. Synchronize High-Frequency HUD Mask
        this.syncStatusMask(session);
    }

    private updatePassives(session: GameSessionLogic) {
        const state = session.state;
        const family = this.activeFamilyMembers.current;

        // Zero-GC clear
        state.activePassives.length = 0;

        for (let i = 0; i < family.length; i++) {
            const member = family[i];
            if (!member.following) continue;

            let passiveId: StatusEffectID | null = null;
            if (member.id === FamilyMemberID.LOKE) passiveId = StatusEffectID.TRICKSTERS_HASTE;
            else if (member.id === FamilyMemberID.JORDAN) passiveId = StatusEffectID.EAGLES_SIGHT;
            else if (member.id === FamilyMemberID.ESMERALDA) passiveId = StatusEffectID.LEAD_FEVER;
            else if (member.id === FamilyMemberID.NATHALIE) passiveId = StatusEffectID.WINTERS_BONE;

            if (passiveId !== null) {
                state.activePassives.push(passiveId);

                // Track discovery
                if (state.discoveredPerksMap[passiveId] === 0) {
                    state.discoveredPerksMap[passiveId] = 1;
                    UIEventRingBuffer.push(UIEventType.DISCOVERY, passiveId, DiscoveryType.PERK);
                }
            }
        }
    }

    private processEffects(session: GameSessionLogic, delta: number) {
        const state = session.state;
        const stats = state.statsBuffer;
        const durations = state.effectDurations;

        // Reset modifiers for stacking
        let speedMod = 0, reloadMod = 0, fireRateMod = 0, resistMod = 0, rangeMod = 0;

        // Phase 1: Sum from Passives
        for (let i = 0; i < state.activePassives.length; i++) {
            const perk = PERKS[state.activePassives[i]];
            if (perk) {
                if (perk.speedModifier) speedMod += perk.speedModifier;
                if (perk.reloadModifier) reloadMod += perk.reloadModifier;
                if (perk.fireRateModifier) fireRateMod += perk.fireRateModifier;
                if (perk.damageResistModifier) resistMod += perk.damageResistModifier;
                if (perk.rangeModifier) rangeMod += perk.rangeModifier;
            }
        }

        // Phase 2: Process Timed Effects (Buffs & Debuffs)
        state.activeBuffs.length = 0;
        state.activeDebuffs.length = 0;

        // Clear high-frequency flags that are driven by perks
        state.statusFlags &= ~(
            PlayerStatusFlags.REFLEX_SHIELD |
            PlayerStatusFlags.ADRENALINE_SHOT |
            PlayerStatusFlags.GIB_MASTER |
            PlayerStatusFlags.QUICK_FINGER |
            PlayerStatusFlags.STUNNED |
            PlayerStatusFlags.DISORIENTED
        );

        for (let i = 0; i < 32; i++) {
            if (durations[i] <= 0) continue;

            // Decrement duration
            durations[i] = Math.max(0, durations[i] - delta * 1000);

            if (durations[i] <= 0) {
                // Post-expiration cleanup
                if (i === StatusEffectID.QUICK_FINGER && state.globalTimeScale < 1.0) {
                    state.globalTimeScale = 1.0; // Reset slowmo instantly
                }
                continue;
            }

            const perk = PERKS[i];
            if (!perk) continue;

            // Category tracking
            if (perk.category === PerkCategory.BUFF) state.activeBuffs.push(i);
            else if (perk.category === PerkCategory.DEBUFF) state.activeDebuffs.push(i);

            // Modifier stacking
            if (perk.speedModifier) speedMod += perk.speedModifier;
            if (perk.reloadModifier) reloadMod += perk.reloadModifier;
            if (perk.fireRateModifier) fireRateMod += perk.fireRateModifier;
            if (perk.damageResistModifier) resistMod += perk.damageResistModifier;
            if (perk.rangeModifier) rangeMod += perk.rangeModifier;

            // Flag syncing
            if (i === StatusEffectID.REFLEX_SHIELD) state.statusFlags |= PlayerStatusFlags.REFLEX_SHIELD;
            if (i === StatusEffectID.ADRENALINE_PATCH) state.statusFlags |= PlayerStatusFlags.ADRENALINE_SHOT;
            if (i === StatusEffectID.GIB_MASTER) state.statusFlags |= PlayerStatusFlags.GIB_MASTER;
            if (i === StatusEffectID.QUICK_FINGER) state.statusFlags |= PlayerStatusFlags.QUICK_FINGER;
            if (i === StatusEffectID.STUNNED) state.statusFlags |= PlayerStatusFlags.STUNNED;
            if (i === StatusEffectID.DISORIENTED) state.statusFlags |= PlayerStatusFlags.DISORIENTED;
        }

        // --- FINAL MULTIPLIER BAKE (Zero-GC) ---
        stats[PlayerStatID.MULTIPLIER_SPEED] = Math.max(0.1, 1.0 + (speedMod / 100));
        stats[PlayerStatID.MULTIPLIER_RANGE] = Math.max(0.1, 1.0 + (rangeMod / 100));
        stats[PlayerStatID.MULTIPLIER_RELOAD] = Math.max(0.1, 1.0 - (reloadMod / 100));
        stats[PlayerStatID.MULTIPLIER_FIRERATE] = Math.max(0.1, 1.0 - (fireRateMod / 100));
        stats[PlayerStatID.MULTIPLIER_DMG_RESIST] = Math.max(0.0, 1.0 - (resistMod / 100));

        // Track Buff Uptime for Statistics
        if (state.activeBuffs.length > 0) {
            const tracker = session.getSystem<any>(SystemID.DAMAGE_TRACKER);
            if (tracker) tracker.recordBuffTime(session, delta);
        }
    }

    private applyStatusTicks(session: GameSessionLogic, simTime: number) {
        const state = session.state;
        const durations = state.effectDurations;
        const tickRate = 1.0; // Fixed 1Hz tick rate

        for (let i = 0; i < 32; i++) {
            if (durations[i] <= 0) continue;

            const perk = PERKS[i];
            if (!perk || !perk.dotDamage) continue;

            const isTick = (simTime % tickRate) < (state.lastSimDelta || 0.016);
            if (isTick) {
                const intensity = state.effectIntensities[i] || 1.0;
                const totalDamage = perk.dotDamage * intensity;
                const dmgType = this.getStatusDamageID(i);

                // Apply damage through PlayerStatsSystem
                const statsSys = session.getSystem<any>(SystemID.PLAYER_STATS);
                if (statsSys) {
                    statsSys.handlePlayerHit(session, totalDamage, null, dmgType, true, i);
                }

                // Telemetry: Perk Damage Dealt (DoT)
                state.perkDamageDealt[i] += totalDamage;

                // Visual Feedback
                this.spawnTickFX(session, i);
            }
        }
    }

    private spawnTickFX(session: GameSessionLogic, effectId: StatusEffectID) {
        const state = session.state;
        const pos = this.playerGroup.position;
        const scene = session.engine.scene;

        switch (effectId) {
            case StatusEffectID.BLEEDING:
                FXSystem.spawnParticle(scene, state.particles, pos.x, 1.5, pos.z, FXParticleType.BLOOD_SPLATTER, 3);
                break;
            case StatusEffectID.BURNING:
                this._v1.set(pos.x + (Math.random() - 0.5) * 0.5, pos.y + 1.5, pos.z + (Math.random() - 0.5) * 0.5);
                FXSystem.spawnParticle(scene, state.particles, this._v1.x, this._v1.y, this._v1.z, FXParticleType.FLAME, 1);
                break;
            case StatusEffectID.ELECTRIFIED:
                this._v1.set(pos.x + (Math.random() - 0.5) * 0.4, pos.y + 1.5, pos.z + (Math.random() - 0.5) * 0.4);
                FXSystem.spawnParticle(scene, state.particles, this._v1.x, this._v1.y, this._v1.z, FXParticleType.SPARK, 2);
                break;
            case StatusEffectID.FREEZING:
                this._v1.set(pos.x + (Math.random() - 0.5) * 0.5, pos.y + 1.5, pos.z + (Math.random() - 0.5) * 0.5);
                FXSystem.spawnParticle(scene, state.particles, this._v1.x, this._v1.y, this._v1.z, FXParticleType.SNOW_PUFF, 2);
                break;
            case StatusEffectID.DROWNING:
                FXSystem.spawnParticle(scene, state.particles, pos.x, 0.2, pos.z, FXParticleType.SPLASH, 3);
                break;
        }
    }

    private getStatusDamageID(effectId: StatusEffectID): DamageID {
        switch (effectId) {
            case StatusEffectID.BURNING: return DamageID.BURN;
            case StatusEffectID.BLEEDING: return DamageID.BLEED;
            case StatusEffectID.ELECTRIFIED: return DamageID.ELECTRIC;
            case StatusEffectID.FREEZING: return DamageID.FROST;
            case StatusEffectID.DROWNING: return DamageID.DROWNING;
            default: return DamageID.OTHER;
        }
    }

    private syncStatusMask(session: GameSessionLogic) {
        const state = session.state;
        const oldMask = state.statusMask;
        let newMask = 0;

        // 1. System States (Driven by stats/flags)
        const flags = state.statusFlags;
        if ((flags & PlayerStatusFlags.INVULNERABLE) !== 0) newMask |= StatusEffect.INVULNERABLE;
        if ((flags & PlayerStatusFlags.ADRENALINE_SHOT) !== 0) newMask |= StatusEffect.ADRENALINE;

        // 2. Perk Bits (Driven by durations)
        const durations = state.effectDurations;
        for (let i = 0; i < 32; i++) {
            if (durations[i] > 0) {
                newMask |= (1 << i);
            }
        }

        // Only sync if changed
        if (newMask !== oldMask) {
            state.statusMask = newMask;
            UIEventRingBuffer.push(UIEventType.SYNC_STATUS, newMask, 0, session.engine.simTime);
        }
    }

    clear() { }
}
