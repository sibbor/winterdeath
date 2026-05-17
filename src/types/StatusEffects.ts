/**
 * Unified Status System (Phase 11)
 * 
 * Merges HUD bitmasking and Perk/Stat logic into a single Source of Truth.
 * All status effects (Buffs, Debuffs, Passives, and System States) are defined here.
 */

export enum StatusEffectID {
    NONE = -1,

    // --- PERKS: PASSIVES [0-9] ---
    TRICKSTERS_HASTE = 0,
    EAGLES_SIGHT = 1,
    LEAD_FEVER = 2,
    WINTERS_BONE = 3,

    // --- PERKS: BUFFS [10-49] ---
    REFLEX_SHIELD = 10,
    ADRENALINE_PATCH = 11,
    GIB_MASTER = 12,
    QUICK_FINGER = 13,

    // --- PERKS: DEBUFFS [50-98] ---
    BLEEDING = 50,
    SLOWED = 51,
    STUNNED = 52,
    BURNING = 53,
    DISORIENTED = 54,
    FREEZING = 55,
    ELECTRIFIED = 56,
    DROWNING = 57,

    // --- SYSTEM STATES (No Perk definition needed) ---
    INVULNERABLE = 99,
}

/**
 * SMI Bitmask for high-frequency synchronization with HUD.
 * ZERO-GC: Derived from StatusEffectID indices to prevent redundancy.
 */
export const StatusEffect = {
    NONE: 0,

    // --- BUFFS ---
    REFLEX_SHIELD: 1 << StatusEffectID.REFLEX_SHIELD,
    ADRENALINE_PATCH: 1 << StatusEffectID.ADRENALINE_PATCH,
    GIB_MASTER: 1 << StatusEffectID.GIB_MASTER,
    QUICK_FINGER: 1 << StatusEffectID.QUICK_FINGER,
    INVULNERABLE: 1 << StatusEffectID.INVULNERABLE,

    // --- DEBUFFS ---
    BLEEDING: 1 << StatusEffectID.BLEEDING,
    SLOWED: 1 << StatusEffectID.SLOWED,
    STUNNED: 1 << StatusEffectID.STUNNED,
    BURNING: 1 << StatusEffectID.BURNING,
    DISORIENTED: 1 << StatusEffectID.DISORIENTED,
    FREEZING: 1 << StatusEffectID.FREEZING,
    ELECTRIFIED: 1 << StatusEffectID.ELECTRIFIED,
    DROWNING: 1 << StatusEffectID.DROWNING,
} as const;

export type StatusEffectBit = number;
