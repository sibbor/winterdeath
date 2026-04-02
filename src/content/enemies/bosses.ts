import { AttackDefinition, EnemyAttackType } from '../../entities/player/CombatTypes';
import { StatusEffectType } from '../perks';

/*
Boss data:
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

Status effects are defined in the PERKS database.
*/

export const BOSSES: Record<number, { id: number; name: string; hp: number; maxHp: number; speed: number; color: number; scale: number; widthScale?: number; deathStory: string; attacks?: AttackDefinition[] }> = {
    0: {
        id: 0,
        name: 'bosses.0.name',
        hp: 500, maxHp: 500, speed: 20.0, color: 0x4a0404, scale: 3.0, widthScale: 3.5,
        deathStory: "bosses.0.death",
        attacks: [
            {
                type: EnemyAttackType.HIT,
                damage: 30,
                cooldown: 500
            },
            {
                type: EnemyAttackType.FREEZE_JUMP,
                damage: 25,
                range: 25.0,
                radius: 5,
                activeTime: 3000,
                chargeTime: 250,
                cooldown: 10000,
                effect: StatusEffectType.FREEZING,
            },
        ]
    },
    1: {
        id: 1,
        name: 'bosses.1.name',
        hp: 800, maxHp: 800, speed: 30.0, color: 0x2c3e50, scale: 3.0, widthScale: 1.5,
        deathStory: "bosses.1.death",
        attacks: [
            {
                type: EnemyAttackType.HIT,
                damage: 30,
                cooldown: 500
            },
            {
                type: EnemyAttackType.SCREECH,
                damage: 10,
                radius: 10,
                chargeTime: 500,
                activeTime: 3000,
                cooldown: 15000,
                effect: StatusEffectType.DISORIENTED,
            },
        ]
    },
    2: {
        id: 2,
        name: 'bosses.2.name',
        hp: 600, maxHp: 600, speed: 25.0, color: 0x8e44ad, scale: 3.0, widthScale: 1.0,
        deathStory: "bosses.2.death",
        attacks: [
            {
                type: EnemyAttackType.HIT,
                damage: 35,
                cooldown: 500
            },
            {
                type: EnemyAttackType.ELECTRIC_BEAM,
                damage: 20,
                range: 20.0,
                chargeTime: 1200,
                activeTime: 3000,
                cooldown: 15000,
                effect: StatusEffectType.ELECTRIFIED,
            }
        ]
    },
    3: {
        id: 3,
        name: 'bosses.3.name',
        hp: 1200, maxHp: 1200, speed: 17.5, color: 0xc0392b, scale: 3.5, widthScale: 1.8,
        deathStory: "bosses.3.death",
        attacks: [
            {
                type: EnemyAttackType.HIT,
                damage: 30,
                cooldown: 500
            },
            {
                type: EnemyAttackType.MAGNETIC_CHAIN,
                damage: 15,
                range: 20.0,
                activeTime: 2500,
                cooldown: 15000,
                effect: StatusEffectType.SLOWED,
            }
        ]
    }
};
