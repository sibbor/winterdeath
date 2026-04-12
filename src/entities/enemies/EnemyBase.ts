import { AttackDefinition } from '../../entities/player/CombatTypes';

/**
 * SMI ENUMS (Explicit values for Persistence)
 */

export enum NoiseType {
    NONE = 0,
    PLAYER_WALK = 1,
    PLAYER_RUSH = 2,
    PLAYER_DODGING = 3,
    PLAYER_SWIM = 4,
    BULLET_HIT = 5,
    GUNSHOT = 6,
    GRENADE = 7,
    MOLOTOV = 8,
    FLASHBANG = 9,
    VEHICLE_IDLE = 10,
    VEHICLE_DRIVE = 11,
    OTHER = 12
}

export enum AIState {
    IDLE = 0,
    WANDER = 1,
    SEARCH = 2,
    CHASE = 3,
    ATTACK_CHARGE = 4,
    ATTACKING = 5,
    GRAPPLE = 6
}

export enum EnemyDeathState {
    ALIVE = 0,
    DEAD = 1,
    SHOT = 2,
    GIBBED = 3,
    EXPLODED = 4,
    BURNED = 5,
    ELECTROCUTED = 6,
    GENERIC = 7,
    DROWNED = 8,
    FALL = 9
}

export enum EnemyEffectType {
    STUN = 0,
    FLAME = 1,
    SPARK = 2
}

export enum EnemyType {
    WALKER = 0,
    RUNNER = 1,
    TANK = 2,
    BOMBER = 3,
    BOSS = 4
}

/**
 * STATUS BITMASKING (SMI Flags)
 */
export const EnemyFlags = {
    BURNING: 1 << 0,
    BLINDED: 1 << 1,
    STUNNED: 1 << 2,
    GRAPPLING: 1 << 3,
    AIRBORNE: 1 << 4,
    IN_WATER: 1 << 5,
    WADING: 1 << 6,
    DROWNING: 1 << 7,
    FLEEING: 1 << 8,
    DISCOVERED: 1 << 9,
    BOSS: 1 << 10,
    DEAD: 1 << 11,
    STAGGERED: 1 << 12,
    SLOWED: 1 << 13
};

/**
 * Master configuration for an enemy type.
 */
export interface ZombieTypeData {
    displayNameKey: string;
    hp: number;
    speed: number;
    score: number;
    color: number;
    scale: number;
    widthScale: number;
    attacks: AttackDefinition[];
}
