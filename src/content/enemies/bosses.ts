import { EnemyAttackType, StatusEffectType, AttackDefinition } from '../../types/combat';

export const BOSSES: Record<number, { id: number; name: string; hp: number; maxHp: number; speed: number; damage: number; color: number; scale: number; widthScale?: number; deathStory: string; attacks?: AttackDefinition[] }> = {
    0: {
        id: 0,
        name: 'bosses.0.name',
        hp: 500, maxHp: 500, speed: 1.20, damage: 35, color: 0x4a0404, scale: 3.0, widthScale: 3.5,
        deathStory: "bosses.0.death",
        attacks: [
            { type: EnemyAttackType.HIT, damage: 30, cooldown: 2000, range: 12.0, soundImpact: 'impact_flesh' },
            { type: EnemyAttackType.ELECTRIC_BEAM, damage: 45, cooldown: 5000, range: 45.0, chargeTime: 1200, effect: StatusEffectType.DISORIENTED, effectDuration: 4000, vfx: 'electric_beam', soundImpact: 'ELECTRIC_BEAM' }
        ]
    },
    1: {
        id: 1,
        name: 'bosses.1.name',
        hp: 800, maxHp: 800, speed: 0.75, damage: 20, color: 0x2c3e50, scale: 3.0, widthScale: 1.5,
        deathStory: "bosses.1.death",
        attacks: [
            { type: EnemyAttackType.SMASH, damage: 60, cooldown: 4000, range: 15.0, chargeTime: 1500, effect: StatusEffectType.SLOWED, effectDuration: 3000, vfx: 'ground_impact', soundImpact: 'tank_smash' },
            { type: EnemyAttackType.HIT, damage: 35, cooldown: 1800, range: 10.0, soundImpact: 'impact_flesh' }
        ]
    },
    2: {
        id: 2,
        name: 'bosses.2.name',
        hp: 600, maxHp: 600, speed: 1.25, damage: 30, color: 0x8e44ad, scale: 3.0, widthScale: 1.0,
        deathStory: "bosses.2.death",
        attacks: [
            { type: EnemyAttackType.JUMP, damage: 50, cooldown: 6000, range: 25.0, chargeTime: 1000, activeTime: 800, soundImpact: 'impact_concrete' },
            { type: EnemyAttackType.BITE, damage: 40, cooldown: 3000, range: 12.0, effect: StatusEffectType.BLEEDING, effectDuration: 6000, effectIntensity: 5, vfx: 'blood', soundImpact: 'zombie_bite' }
        ]
    },
    3: {
        id: 3,
        name: 'bosses.3.name',
        hp: 1200, maxHp: 1200, speed: 0.20, damage: 15, color: 0xc0392b, scale: 3.5, widthScale: 1.8,
        deathStory: "bosses.3.death",
        attacks: [
            { type: EnemyAttackType.SCREECH, damage: 20, cooldown: 8000, range: 20.0, chargeTime: 2000, effect: StatusEffectType.DISORIENTED, effectDuration: 5000, vfx: 'screech_wave', soundImpact: 'SCREECH' },
            { type: EnemyAttackType.MAGNETIC_CHAIN, damage: 15, cooldown: 4000, range: 35.0, effect: StatusEffectType.ELECTRIFIED, effectDuration: 2500, effectIntensity: 0.8, vfx: 'electric_beam', soundImpact: 'MAGNETIC_CHAIN' }
        ]
    }
};
