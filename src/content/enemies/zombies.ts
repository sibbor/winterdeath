import { ZombieTypeData, EnemyType } from '../../types/enemy';
import { EnemyAttackType, StatusEffectType } from '../../types/combat';

/*
Zombie data:
Calculations, animations and sound effects are handled in the game loop.

Description of 'attack':

Ordinary hits:
- type = EnemyAttackType.HIT
- damage = numeric value
- cooldown = time in ms between hits

Special attacks with status effects for the player:
- type = EnemyAttackType.X (this will be used to choose the attack animation etc.)
- damage = numeric value (damage the player takes if hit by the attack)
- cooldown = time in ms before the boss can use this attack again
- range = numeric value set in meters; defines how far the attack reaches
- radius = AoE attack radius set in meters (not set or numeric value if active)
- chargeTime = time in ms it takes for the boss to activate the ability
- effect = status the player gets (StatusEffectType) if hit by the attack
- effectDuration = time in ms the status effect lasts on the playerAttackDefinition
- effectDamage = damage the player takes for every second the status effect is active
*/

export const ZOMBIE_TYPES: Record<EnemyType | string, ZombieTypeData> = {
    [EnemyType.WALKER]: {
        hp: 50,
        speed: 0.9,
        score: 20,
        color: 0xc27ba0, // Pinkish
        scale: 1.0,
        attacks: [
            {
                type: EnemyAttackType.HIT,
                damage: 10,
                cooldown: 750
            },
            {
                type: EnemyAttackType.BITE,
                damage: 5,
                range: 3,
                cooldown: 10000,
                effect: StatusEffectType.BLEEDING,
                effectDuration: 3000,
                effectDamage: 5
            }
        ]
    },
    [EnemyType.RUNNER]: {
        hp: 30,
        speed: 1.10,
        score: 10,
        color: 0x33a366, // Green
        scale: 0.8,
        attacks: [
            {
                type: EnemyAttackType.HIT,
                damage: 5,
                cooldown: 500,
            },
            {
                type: EnemyAttackType.JUMP,
                damage: 5,
                range: 5,
                cooldown: 5000,
                effect: StatusEffectType.SLOWED,
                effectDuration: 2000,
            }
        ]
    },
    [EnemyType.TANK]: {
        hp: 175,
        speed: 0.80,
        score: 50,
        color: 0x2b6599, // Blue
        scale: 1.5,
        widthScale: 1.2,
        attacks: [
            {
                type: EnemyAttackType.HIT,
                damage: 20,
                cooldown: 1250,
            },
            {
                type: EnemyAttackType.SMASH,
                damage: 40,
                chargeTime: 750,
                cooldown: 10000,
                effect: StatusEffectType.DISORIENTED,
                effectDuration: 2000,
            }
        ]
    },
    [EnemyType.BOMBER]: {
        hp: 80,
        speed: 0.70,
        score: 30,
        color: 0xcf6e36,
        scale: 1.25,
        widthScale: 1.4,
        attacks: [
            {
                type: EnemyAttackType.EXPLODE,
                damage: 60,
                range: 3.5,
                radius: 10.0,
                chargeTime: 2000,
                cooldown: 0,
                effect: StatusEffectType.DISORIENTED,
                effectDuration: 2000,
            }
        ]
    }
};
