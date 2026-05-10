/**
 * Unified Status System (Phase 11)
 * 
 * Merges HUD bitmasking and Perk/Stat logic into a single Source of Truth.
 * All status effects (Buffs, Debuffs, Passives, and System States) are defined here.
 */

export enum StatusEffectID {
    // --- PASSIVES (Perks) ---
    TRICKSTERS_HASTE = 0,
    EAGLES_SIGHT = 1,
    LEAD_FEVER = 2,
    WINTERS_BONE = 3,

    // --- BUFFS (Perks) ---
    REFLEX_SHIELD = 4,
    ADRENALINE_PATCH = 5,

    // --- DEBUFFS (Perks) ---
    BLEEDING = 6,
    SLOWED = 7,
    STUNNED = 8,
    BURNING = 9,
    DISORIENTED = 10,
    FREEZING = 11,
    ELECTRIFIED = 12,
    DROWNING = 13,

    // --- NEW SYSTEM BUFFS (Phase 11) ---
    GIB_MASTER = 14,
    QUICK_FINGER = 15,

    // --- SYSTEM STATES (No Perk definition needed) ---
    INFECTED = 16,
    INVULNERABLE = 17,
    ADRENALINE_SHOT = 18,
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
    ADRENALINE: 1 << StatusEffectID.ADRENALINE_SHOT,
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
    INFECTED: 1 << StatusEffectID.INFECTED,
} as const;

export type StatusEffectBit = number;
