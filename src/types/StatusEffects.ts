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
    LOW_HEALTH = 17,
    EXHAUSTED = 18,
    INVULNERABLE = 19,
    REGENERATING = 20,
    ADRENALINE_SHOT = 21,
}

/**
 * SMI Bitmask for high-frequency synchronization with HUD.
 * ZERO-GC: Derived from StatusEffectID indices to prevent redundancy.
 */
export const StatusEffect = {
    NONE: 0,

    // Perks (Shifted by ID index)
    BLEEDING: 1 << StatusEffectID.BLEEDING,
    STUNNED: 1 << StatusEffectID.STUNNED,
    DISORIENTED: 1 << StatusEffectID.DISORIENTED,
    REFLEX_SHIELD: 1 << StatusEffectID.REFLEX_SHIELD,
    GIB_MASTER: 1 << StatusEffectID.GIB_MASTER,
    QUICK_FINGER: 1 << StatusEffectID.QUICK_FINGER,
    SLOWED: 1 << StatusEffectID.SLOWED,
    BURNING: 1 << StatusEffectID.BURNING,
    FREEZING: 1 << StatusEffectID.FREEZING,
    ELECTRIFIED: 1 << StatusEffectID.ELECTRIFIED,
    DROWNING: 1 << StatusEffectID.DROWNING,

    // System States
    INFECTED: 1 << StatusEffectID.INFECTED,
    ADRENALINE: 1 << StatusEffectID.ADRENALINE_SHOT, // Map to ADRENALINE_SHOT for backward compatibility in HUD
    LOW_HEALTH: 1 << StatusEffectID.LOW_HEALTH,
    EXHAUSTED: 1 << StatusEffectID.EXHAUSTED,
    INVULNERABLE: 1 << StatusEffectID.INVULNERABLE,
    REGENERATING: 1 << StatusEffectID.REGENERATING,
} as const;

export type StatusEffectBit = number;
