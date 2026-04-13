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

export const BOSSES: Record<number, { id: number; name: string; story: string; deathStory: string; hp: number; speed: number; color: number; scale: number; widthScale?: number; attacks?: AttackDefinition[] }> = {
    0: {
        id: 0,
        name: 'bosses.0.name',
        story: 'bosses.0.story',
        deathStory: 'bosses.0.deathStory',
        hp: 500,
        speed: 15.0,
        color: 0x4a0404,
        scale: 3.0,
        widthScale: 3.5,
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
        story: 'bosses.1.story',
        deathStory: 'bosses.1.deathStory',
        hp: 800,
        speed: 20.0,
        color: 0x2c3e50,
        scale: 3.0,
        widthScale: 1.5,
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
        story: 'bosses.2.story',
        deathStory: 'bosses.2.deathStory',
        hp: 600,
        speed: 15.0,
        color: 0x8e44ad,
        scale: 3.0,
        widthScale: 1.0,
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
        story: 'bosses.3.story',
        deathStory: 'bosses.3.deathStory',
        hp: 1200,
        speed: 15.0,
        color: 0xc0392b,
        scale: 3.5,
        widthScale: 1.8,
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
