import { StatusEffectID } from "../../types/StatusEffects";
import { DamageType, PlayerDeathState } from "./CombatBase";


// Re-export fundamental types for convenience (keeps existing imports working)
export { DamageType, PlayerDeathState };

// ============================================================================
// 1. INVENTORY & ABILITY DOMAINS (SMI Aligned with DamageID)
// ============================================================================

export enum WeaponID {
    NONE = 0,
    SMG = 1,
    SHOTGUN = 2,
    RIFLE = 3,
    PISTOL = 4,
    REVOLVER = 5,
    GRENADE = 6,
    MOLOTOV = 7,
    FLASHBANG = 8,
    MINIGUN = 9,
    FLAMETHROWER = 10,
    ARC_CANNON = 11
}

export enum ToolID {
    RADIO = 12
}

export enum AbilityID {
    RUSH = 21,
    DODGE = 22,
    VEHICLE = 23
}

// Union för det spelaren kan hålla i handen (V8 ser bara en siffra)
export type HoldableID = WeaponID | ToolID;

// ============================================================================
// 2. ENEMY & COMBAT STATES
// ============================================================================

export enum EnemyAttackType {
    HIT = 0,
    BITE = 1,
    JUMP = 2,
    EXPLODE = 3,
    SMASH = 4,
    FREEZE_JUMP = 5,
    SCREECH = 6,
    ELECTRIC_BEAM = 7,
    MAGNETIC_CHAIN = 8,
    GRAPPLE_BITE = 9,
    ENVIRONMENTAL = 100
}

export const ENEMY_ATTACK_NAMES: Record<EnemyAttackType, string> = {
    [EnemyAttackType.HIT]: 'attacks.HIT.title',
    [EnemyAttackType.BITE]: 'attacks.BITE.title',
    [EnemyAttackType.JUMP]: 'attacks.JUMP.title',
    [EnemyAttackType.EXPLODE]: 'attacks.EXPLODE.title',
    [EnemyAttackType.SMASH]: 'attacks.SMASH.title',
    [EnemyAttackType.FREEZE_JUMP]: 'attacks.FREEZE_JUMP.title',
    [EnemyAttackType.SCREECH]: 'attacks.SCREECH.title',
    [EnemyAttackType.ELECTRIC_BEAM]: 'attacks.ELECTRIC_BEAM.title',
    [EnemyAttackType.MAGNETIC_CHAIN]: 'attacks.MAGNETIC_CHAIN.title',
    [EnemyAttackType.GRAPPLE_BITE]: 'attacks.BITE.title',
    [EnemyAttackType.ENVIRONMENTAL]: 'ui.environmental',
};

// ============================================================================
// 3. MASTER DAMAGE ID - Används för Combat Logs, UI-ikoner, DoTs och Kill-screens.
// Optimerad O(1) konvertering från WeaponID/AbilityID.
// ============================================================================
export enum DamageID {
    NONE = 0,

    // --- ARSENAL (1-20) ---
    SMG = WeaponID.SMG,
    SHOTGUN = WeaponID.SHOTGUN,
    RIFLE = WeaponID.RIFLE,
    PISTOL = WeaponID.PISTOL,
    REVOLVER = WeaponID.REVOLVER,
    GRENADE = WeaponID.GRENADE,
    MOLOTOV = WeaponID.MOLOTOV,
    FLASHBANG = WeaponID.FLASHBANG,
    MINIGUN = WeaponID.MINIGUN,
    FLAMETHROWER = WeaponID.FLAMETHROWER,
    ARC_CANNON = WeaponID.ARC_CANNON,
    RADIO = ToolID.RADIO,

    // --- TACTICS (21-22) ---
    RUSH = AbilityID.RUSH,
    DODGE = AbilityID.DODGE,

    // --- VEHICLES (23-30) ---
    VEHICLE = 23,
    VEHICLE_SPLATTER = 24,
    VEHICLE_RAM = 25,
    VEHICLE_PUSH = 26,

    // --- ENVIRONMENT & HAZARDS (41-60) ---
    PHYSICAL = 41,
    BURN = 42,
    BLEED = 43,
    DROWNING = 44,
    FALL_DAMAGE = 45,
    EXPLOSION = 46,
    BITE = 47,
    ELECTRIC = 48,
    FROST = 49,
    BOSS_GENERIC = 50,
    OTHER = 51
}

// --- DOMAIN RANGES (Magic Number Elimination) ---
export const DAMAGE_DOMAIN = {
    ARSENAL_MIN: 1,
    ARSENAL_MAX: 20,
    TACTICS_MIN: 21,
    TACTICS_MAX: 22,
    VEHICLES_MIN: 23,
    VEHICLES_MAX: 30,
    ENVIRONMENT_MIN: 41,
    ENVIRONMENT_MAX: 60
} as const;

export const ABILITY_DAMAGE_NAMES: Partial<Record<DamageID, string>> = {
    [DamageID.RUSH]: 'ui.rush',
    [DamageID.DODGE]: 'ui.dodge',
};

export const VEHICLE_DAMAGE_NAMES: Partial<Record<DamageID, string>> = {
    [DamageID.VEHICLE]: 'ui.vehicle',
    [DamageID.VEHICLE_SPLATTER]: 'ui.vehicle',
    [DamageID.VEHICLE_RAM]: 'ui.vehicle',
    [DamageID.VEHICLE_PUSH]: 'ui.vehicle',
};

export const ENVIRONMENTAL_DAMAGE_NAMES: Partial<Record<DamageID, string>> = {
    [DamageID.PHYSICAL]: 'ui.physical',
    [DamageID.BURN]: 'ui.burn',
    [DamageID.BLEED]: 'ui.bleed',
    [DamageID.DROWNING]: 'ui.drowning',
    [DamageID.FALL_DAMAGE]: 'ui.fall_damage',
    [DamageID.EXPLOSION]: 'ui.explosion',
    [DamageID.BITE]: 'ui.bite',
    [DamageID.ELECTRIC]: 'ui.electric',
    [DamageID.FROST]: 'ui.frost',
    [DamageID.BOSS_GENERIC]: 'ui.boss',
    [DamageID.OTHER]: 'ui.other',
};

// Attack Definition
export interface AttackDefinition {
    type: EnemyAttackType;
    damage: number;
    cooldown: number;
    range?: number;
    radius?: number;
    force?: number;
    chargeTime?: number;
    activeTime?: number;
    effect?: StatusEffectID;
    effectDuration?: number;
    effectDamage?: number;
}

export interface ActiveStatusEffect {
    duration: number;     // Återstående tid i ms
    maxDuration: number;  // Ursprunglig tid i ms
    intensity: number;    // Multiplikator eller värde
    damage: number;       // Skada per tick
    lastTick: number;     // Timestamp för senaste DoT-tick
    sourceType?: number;  // t.ex. EnemyType
    sourceAttack?: EnemyAttackType;
}