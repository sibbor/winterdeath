export enum EnemyAttackType {
    HIT = 'HIT',
    BITE = 'BITE',
    JUMP = 'JUMP',
    EXPLODE = 'EXPLODE',
    SMASH = 'SMASH',
    SCREECH = 'SCREECH',
    ELECTRIC_BEAM = 'ELECTRIC_BEAM',
    MAGNETIC_CHAIN = 'MAGNETIC_CHAIN'
}

export enum StatusEffectType {
    BLEEDING = 'BLEEDING',
    SLOWED = 'SLOWED',
    BURNING = 'BURNING',
    DISORIENTED = 'DISORIENTED',
    FREEZING = 'FREEZING',
    ELECTRIFIED = 'ELECTRIFIED',
    DROWNING = 'DROWNING'
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
    effectIntensity?: number;
    // For visuals/audio
    vfx?: string;
    soundStart?: string;
    soundActive?: string;
    soundImpact?: string;
}

export interface ActiveStatusEffect {
    duration: number;   // Remaining time in ms
    intensity: number;  // Multiplier or value
    lastTick: number;   // Timestamp of last DoT tick
}
