export enum EnemyAttackType {
    HIT = 'HIT',
    BITE = 'BITE',
    JUMP = 'JUMP',
    EXPLODE = 'EXPLODE',
    SMASH = 'SMASH',
    FREEZE_JUMP = 'FREEZE_JUMP',
    SCREECH = 'SCREECH',
    ELECTRIC_BEAM = 'ELECTRIC_BEAM',
    MAGNETIC_CHAIN = 'MAGNETIC_CHAIN'
}

export enum StatusEffectType {
    BLEEDING = 'BLEEDING',
    SLOWED = 'SLOWED',
    STUNNED = 'STUNNED',
    BURNING = 'BURNING',
    DISORIENTED = 'DISORIENTED',
    FREEZING = 'FREEZING',
    ELECTRIFIED = 'ELECTRIFIED',
    DROWNING = 'DROWNING',
    // --- BUFFS ---
    REFLEX_SHIELD = 'REFLEX_SHIELD',
    ADRENALINE_PATCH = 'ADRENALINE_PATCH',

    // --- PASSIVES (Family) ---
    LOKE_RELOAD = 'LOKE_RELOAD',
    JORDAN_RANGE = 'JORDAN_RANGE',
    ESMERALDA_FIRE = 'ESMERALDA_FIRE',
    NATHALIE_RESIST = 'NATHALIE_RESIST'
}

export enum PerkCategory {
    BUFF = 'BUFF',
    DEBUFF = 'DEBUFF',
    PASSIVE = 'PASSIVE'
}

export interface PerkStats {
    id: StatusEffectType;
    displayName: string;
    description: string;
    category: PerkCategory;
    duration?: number; // ms
    cooldown?: number; // ms
    intensity?: number; // Magnitude of effect (e.g. 0.25 for 25% boost)
    damage?: number;    // Damage per tick (for DoT)
}

export enum PlayerDeathState {
    ALIVE = 'ALIVE',
    NORMAL = 'NORMAL',
    GIBBED = 'GIBBED',
    BURNED = 'BURNED',
    FREEZED = 'FREEZED',
    DROWNED = 'DROWNED'
}

export enum DamageType {
    PHYSICAL = 'PHYSICAL',
    BURN = 'BURN',
    BLEED = 'BLEED',
    DROWNING = 'DROWNING',
    FALL = 'FALL',
    EXPLOSION = 'EXPLOSION',
    BITE = 'BITE',
    ELECTRIC = 'ELECTRIC',
    BOSS = 'BOSS',
    VEHICLE_SPLATTER = 'VEHICLE_SPLATTER',
    VEHICLE_RAM = 'VEHICLE_RAM',
    VEHICLE_PUSH = 'VEHICLE_PUSH'
}

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