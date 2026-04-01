import { StatusEffectType, PerkCategory, PerkStats } from '../entities/player/CombatTypes';

/**
 * SOURCE OF TRUTH: Perks, Buffs, and Debuffs
 * Balanced here for duration, cooldowns, and effects.
 */
export const PERKS: Record<string, PerkStats> = {
    // --- TACTICAL BUFFS ---
    [StatusEffectType.REFLEX_SHIELD]: {
        id: StatusEffectType.REFLEX_SHIELD,
        displayName: 'perks.REFLEX_SHIELD.title',
        description: 'perks.REFLEX_SHIELD.description',
        category: PerkCategory.BUFF,
        duration: 500,
        cooldown: 10000, // 10s as requested
    },
    [StatusEffectType.ADRENALINE_PATCH]: {
        id: StatusEffectType.ADRENALINE_PATCH,
        displayName: 'perks.ADRENALINE_PATCH.title',
        description: 'perks.ADRENALINE_PATCH.description',
        category: PerkCategory.BUFF,
        duration: 3000,
        cooldown: 60000, // 60s
    },

    // --- PASSIVES (Family) ---
    [StatusEffectType.LOKE_RELOAD]: {
        id: StatusEffectType.LOKE_RELOAD,
        displayName: 'family.loke',
        description: 'skills.loke_passive',
        category: PerkCategory.PASSIVE,
        intensity: 0.8, // 20% faster reload
    },
    [StatusEffectType.JORDAN_RANGE]: {
        id: StatusEffectType.JORDAN_RANGE,
        displayName: 'family.jordan',
        description: 'skills.jordan_passive',
        category: PerkCategory.PASSIVE,
        intensity: 1.15, // 15% more range
    },
    [StatusEffectType.ESMERALDA_FIRE]: {
        id: StatusEffectType.ESMERALDA_FIRE,
        displayName: 'family.esmeralda',
        description: 'skills.esmeralda_passive',
        category: PerkCategory.PASSIVE,
        intensity: 1.2, // 20% faster fire rate
    },
    [StatusEffectType.NATHALIE_RESIST]: {
        id: StatusEffectType.NATHALIE_RESIST,
        displayName: 'family.nathalie',
        description: 'skills.nathalie_passive',
        category: PerkCategory.PASSIVE,
        intensity: 0.9, // 10% damage resistance
    },

    // --- DEBUFFS (Enemies/Environment) ---
    [StatusEffectType.BLEEDING]: {
        id: StatusEffectType.BLEEDING,
        displayName: 'attacks.BLEEDING.title',
        description: 'attacks.BLEEDING.description',
        category: PerkCategory.DEBUFF,
        duration: 3000,
        damage: 5, // Damage per tick
        intensity: 0.9, // 10% slow
    },
    [StatusEffectType.BURNING]: {
        id: StatusEffectType.BURNING,
        displayName: 'attacks.BURNING.title',
        description: 'attacks.BURNING.description',
        category: PerkCategory.DEBUFF,
        duration: 3000,
        damage: 10,
        intensity: 0.9,
    },
    [StatusEffectType.STUNNED]: {
        id: StatusEffectType.STUNNED,
        displayName: 'ui.stunned',
        description: 'attacks.STUNNED_DESC',
        category: PerkCategory.DEBUFF,
        duration: 3000,
        intensity: 0, // 0 speed
    },
    [StatusEffectType.DISORIENTED]: {
        id: StatusEffectType.DISORIENTED,
        displayName: 'ui.disoriented',
        description: 'attacks.DISORIENTED_DESC',
        category: PerkCategory.DEBUFF,
        duration: 2000,
        intensity: 0.8,
    },
    [StatusEffectType.SLOWED]: {
        id: StatusEffectType.SLOWED,
        displayName: 'ui.slowed',
        description: 'attacks.SLOWED_DESC',
        category: PerkCategory.DEBUFF,
        duration: 2500,
        intensity: 0.6,
    },
    [StatusEffectType.FREEZING]: {
        id: StatusEffectType.FREEZING,
        displayName: 'ui.freezing',
        description: 'attacks.FREEZING_DESC',
        category: PerkCategory.DEBUFF,
        duration: 2000,
        damage: 10,
        intensity: 0.4,
    },
    [StatusEffectType.ELECTRIFIED]: {
        id: StatusEffectType.ELECTRIFIED,
        displayName: 'ui.electrified',
        description: 'attacks.ELECTRIFIED_DESC',
        category: PerkCategory.DEBUFF,
        duration: 2000,
        damage: 10,
        intensity: 0.8 / 1.5, // Reduced fire rate/speed as well?
    },
};
