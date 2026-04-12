import { StatusEffectType } from "../../content/perks";

export enum EnemyAttackType {
    HIT = 0,
    BITE = 1,
    JUMP = 2,
    EXPLODE = 3,
    SMASH = 4,
    FREEZE_JUMP = 5,
    SCREECH = 6,
    ELECTRIC_BEAM = 7,
    MAGNETIC_CHAIN = 8
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
};

export enum PlayerDeathState {
    ALIVE = 0,
    NORMAL = 1,
    GIBBED = 2,
    BURNED = 3,
    FREEZED = 4,
    DROWNED = 5,
    ELECTROCUTED = 6
}

/**
 * VINTERDÖD: Unified DamageID (Step 3: Phase 7)
 * Consolidates WeaponType and DamageType into a single SMI enum.
 * This eliminates polymorphism (was WeaponType | DamageType) and optimizes
 * the hot-path in ProjectileSystem and EnemyAI.
 */
export enum DamageID {
    NONE = 0,

    // --- WEAPONS (1-20) ---
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
    ARC_CANNON = 11,
    RADIO = 12,
    RUSH = 13,
    VEHICLE = 14,
    DODGE = 15,

    // --- ENVIRONMENT & EFFECTS (20+) ---
    PHYSICAL = 21,
    BURN = 22,
    BLEED = 23,
    DROWNING = 24,
    FALL = 25,
    EXPLOSION = 26,
    BITE = 27,
    ELECTRIC = 28,
    BOSS = 29,
    VEHICLE_SPLATTER = 30,
    VEHICLE_RAM = 31,
    VEHICLE_PUSH = 32,
    FIRE = 33,
    FALL_DAMAGE = 34,
    OTHER = 35,
    BOSS_GENERIC = 36
}

export const ENVIRONMENTAL_DAMAGE_NAMES: Partial<Record<DamageID, string>> = {
    [DamageID.PHYSICAL]: 'ui.physical',
    [DamageID.BURN]: 'ui.burn',
    [DamageID.FIRE]: 'ui.fire',
    [DamageID.BLEED]: 'ui.bleed',
    [DamageID.DROWNING]: 'ui.drowning',
    [DamageID.FALL]: 'ui.fall',
    [DamageID.FALL_DAMAGE]: 'ui.fall_damage',
    [DamageID.EXPLOSION]: 'ui.explosion',
    [DamageID.BITE]: 'ui.bite',
    [DamageID.ELECTRIC]: 'ui.electric',
    [DamageID.BOSS]: 'ui.boss',
    [DamageID.BOSS_GENERIC]: 'ui.boss',
    [DamageID.OTHER]: 'ui.other',
    [DamageID.VEHICLE_SPLATTER]: 'ui.vehicle_splatter',
    [DamageID.VEHICLE_RAM]: 'ui.vehicle_ram',
    [DamageID.VEHICLE_PUSH]: 'ui.vehicle_push',
    [DamageID.DODGE]: 'ui.dodge',
};

// Deprecated alias for legacy code during transition
export type DamageType = DamageID;
export const DamageType = DamageID;

export interface AttackDefinition {
    type: EnemyAttackType;
    damage: number;
    cooldown: number;
    range?: number;
    radius?: number;
    chargeTime?: number;
    activeTime?: number;
    effect?: StatusEffectType;
    effectDuration?: number;
    effectDamage?: number;
}

export interface ActiveStatusEffect {
    duration: number;     // Remaining time in ms
    maxDuration: number;  // Original time in ms
    intensity: number;  // Multiplier or value
    damage: number;     // Damage per tick
    lastTick: number;   // Timestamp of last DoT tick
    sourceType?: string; // e.g. "WALKER"
    sourceAttack?: string; // e.g. "BITE" (which caused BLEEDING)
}