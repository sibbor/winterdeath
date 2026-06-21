import { ZombieTypeData, EnemyType } from '../../entities/enemies/EnemyBase';
import { ColorPair, ENEMY_COLORS } from '../../utils/ui/ColorUtils';
import { EnemyAttackType } from '../../entities/player/CombatTypes';
import { StatusEffectID } from '../perks';

/*
Zombie data:
Calculations, animations and sound effects are handled in the game loop.

- hp = health points
- speed = speed in km/h
- xp = xp for killing the zombie
- color = color of the zombie
- scale = scale of the zombie
- widthScale = width scale of the zombie

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
- effect = status the player gets (StatusEffectID) if hit by the attack

Status effects are defined in the PERKS database.
*/

export const ZOMBIE_TYPES: Partial<Record<EnemyType, ZombieTypeData>> & Record<string, ZombieTypeData> = {
    [EnemyType.WALKER]: {
        name: 'enemies.zombies.WALKER.name',
        story: 'enemies.zombies.WALKER.story',
        hp: 50,
        speed: 15,
        bodyMass: 1.21,
        bodyWeight: 70,
        xp: 20,
        color: ENEMY_COLORS.WALKER, // Pinkish
        scale: 1.0,
        widthScale: 1.1,
        attacks: [
            {
                type: EnemyAttackType.HIT,
                damage: 10,
                cooldown: 750
            },
            {
                type: EnemyAttackType.BITE,
                damage: 5,
                range: 2.5,
                chargeTime: 400,
                activeTime: 600,
                cooldown: 8000,
                effect: StatusEffectID.BLEEDING,
            }
        ]
    },
    [EnemyType.RUNNER]: {
        name: 'enemies.zombies.RUNNER.name',
        story: 'enemies.zombies.RUNNER.story',
        hp: 30,
        speed: 20.0,
        bodyMass: 0.8,
        bodyWeight: 55,
        xp: 10,
        color: ENEMY_COLORS.RUNNER, // Green
        scale: 0.8,
        widthScale: 1.0,
        attacks: [
            {
                type: EnemyAttackType.HIT,
                damage: 5,
                cooldown: 500,
            },
            {
                type: EnemyAttackType.JUMP,
                damage: 5,
                range: 6,
                chargeTime: 600,
                activeTime: 800,
                cooldown: 5000,
                effect: StatusEffectID.SLOWED,
            }
        ]
    },
    [EnemyType.TANK]: {
        name: 'enemies.zombies.TANK.name',
        story: 'enemies.zombies.TANK.story',
        hp: 175,
        speed: 13.0,
        bodyMass: 2.16,
        bodyWeight: 90,
        xp: 50,
        color: ENEMY_COLORS.TANK, // Blue
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
                effect: StatusEffectID.DISORIENTED,
            }
        ]
    },
    [EnemyType.BLOATER]: {
        name: 'enemies.zombies.BLOATER.name',
        story: 'enemies.zombies.BLOATER.story',
        hp: 80,
        speed: 12,
        bodyMass: 2.45,
        bodyWeight: 120,
        xp: 30,
        color: ENEMY_COLORS.BLOATER,
        scale: 1.25,
        widthScale: 1.4,
        attacks: [
            {
                type: EnemyAttackType.EXPLODE,
                damage: 60,
                range: 3.5,
                radius: 10.0,
                force: 25,
                chargeTime: 2000,
                cooldown: 0,
                effect: StatusEffectID.DISORIENTED,
            }
        ]
    }
};
