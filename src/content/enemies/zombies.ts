import { ZombieTypeData } from '../../types/enemy';
import { EnemyAttackType, StatusEffectType } from '../../types/combat';

export const ZOMBIE_TYPES: Record<string, ZombieTypeData> = {
    WALKER: {
        hp: 50,
        speed: 0.9,
        damage: 5,
        score: 20,
        color: 0xc27ba0, // Pinkish
        scale: 1.0,
        attacks: [
            { type: EnemyAttackType.HIT, damage: 10, cooldown: 1800, range: 6.5, soundImpact: 'impact_flesh' }
        ]
    },
    RUNNER: {
        hp: 30,
        speed: 1.10,
        damage: 2.5,
        score: 10,
        color: 0x33a366, // Green
        scale: 0.8,
        attacks: [
            { type: EnemyAttackType.BITE, damage: 5, cooldown: 1200, range: 5.5, effect: StatusEffectType.BLEEDING, effectDuration: 5000, effectIntensity: 2, vfx: 'blood', soundImpact: 'zombie_bite' }
        ]
    },
    TANK: {
        hp: 150,
        speed: 0.80,
        damage: 10,
        score: 50,
        color: 0x2b6599, // Blue
        scale: 1.15,
        widthScale: 1.1,
        attacks: [
            { type: EnemyAttackType.HIT, damage: 10, cooldown: 2000, range: 1.8 }
        ]
    },
    BOMBER: {
        hp: 80,
        speed: 0.70,
        damage: 25,
        score: 30,
        color: 0xcf6e36,
        scale: 1.25,
        widthScale: 1.4,
        attacks: [
            { type: EnemyAttackType.EXPLODE, damage: 60, cooldown: 1000, range: 15.0, effect: StatusEffectType.BURNING, effectDuration: 3000, effectIntensity: 5, vfx: 'large_fire', soundImpact: 'bomber_explode' }
        ]
    }
};
