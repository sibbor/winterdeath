/**
 * CombatBase.ts
 * Fundamental combat enums that don't depend on content (weapons/tools/abilities).
 * This file prevents circular dependencies between content and systems.
 */

// ============================================================================
// 1. DAMAGE TYPE - Defines the physical nature (particles, shaders, physics)
// ============================================================================
export enum DamageType {
    NONE = 0,
    BALLISTIC = 1,  // Kulfysik, standard blodstänk
    PHYSICAL = 2,   // Kross/Kollision (Vehicles, Dodge, Rush), knuffar tillbaka objekt
    BURN = 3,       // Eld-partiklar, DoT-antändning
    BLEED = 4,      // Blödningsspår på marken
    DROWNING = 5,   // Drunkningsbubblor
    EXPLOSION = 6,  // Skärmskakning, splitter-FX
    ELECTRIC = 7,   // Blixtkedjor, elchock-stunt
    FROST = 8       // Is-partiklar, nedsaktning
}

// ============================================================================
// 2. PLAYER DEATH STATES
// ============================================================================
export enum PlayerDeathState {
    ALIVE = 0,
    NORMAL = 1,
    GIBBED = 2,
    BURNED = 3,
    FREEZED = 4,
    DROWNED = 5,
    ELECTROCUTED = 6
}
