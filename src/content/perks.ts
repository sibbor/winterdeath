export enum PerkCategory {
    BUFF = 'BUFF',
    DEBUFF = 'DEBUFF',
    PASSIVE = 'PASSIVE'
}

export enum PerkColor {
    PASSIVE = '#a855f7',
    BUFF = '#22c55e',
    DEBUFF = '#ff3333'
}

export enum StatusEffectType {
    // --- PASSIVES ---
    TRICKSTERS_HASTE = 'TRICKSTERS_HASTE',
    EAGLES_SIGHT = 'EAGLES_SIGHT',
    LEAD_FEVER = 'LEAD_FEVER',
    WINTERS_BONE = 'WINTERS_BONE',

    // --- BUFFS ---
    REFLEX_SHIELD = 'REFLEX_SHIELD',
    ADRENALINE_PATCH = 'ADRENALINE_PATCH',

    // --- DEBUFFS ---
    BLEEDING = 'BLEEDING',
    SLOWED = 'SLOWED',
    STUNNED = 'STUNNED',
    BURNING = 'BURNING',
    DISORIENTED = 'DISORIENTED',
    FREEZING = 'FREEZING',
    ELECTRIFIED = 'ELECTRIFIED',
    DROWNING = 'DROWNING',
}

export interface PerkStats {
    id: StatusEffectType;
    icon: string;
    displayName: string;
    description: string;
    category: PerkCategory;
    duration?: number; // ms
    cooldown?: number; // ms
    intensity?: number; // Magnitude of effect (e.g. 0.25 for 25% boost)
    damage?: number;    // Damage per tick (for DoT)
}

/**
 * SOURCE OF TRUTH: Perks, Buffs, and Debuffs
 * Balanced here for duration, cooldowns, and effects.
 */
export const PERKS: Record<string, PerkStats> = {

    // --- PASSIVES ---
    [StatusEffectType.TRICKSTERS_HASTE]: {
        id: StatusEffectType.TRICKSTERS_HASTE,
        icon: '🔁',
        displayName: 'perks.TRICKSTERS_HASTE.title',
        description: 'perks.TRICKSTERS_HASTE.description',
        category: PerkCategory.PASSIVE,
        intensity: 0.8, // 20% faster reload
    },
    [StatusEffectType.EAGLES_SIGHT]: {
        id: StatusEffectType.EAGLES_SIGHT,
        icon: '🎯',
        displayName: 'perks.EAGLES_SIGHT.title',
        description: 'perks.EAGLES_SIGHT.description',
        category: PerkCategory.PASSIVE,
        intensity: 1.15, // 15% more range
    },
    [StatusEffectType.LEAD_FEVER]: {
        id: StatusEffectType.LEAD_FEVER,
        icon: '🔫',
        displayName: 'perks.LEAD_FEVER.title',
        description: 'perks.LEAD_FEVER.description',
        category: PerkCategory.PASSIVE,
        intensity: 1.2, // 20% faster fire rate
    },
    [StatusEffectType.WINTERS_BONE]: {
        id: StatusEffectType.WINTERS_BONE,
        icon: '🛡️',
        displayName: 'perks.WINTERS_BONE.title',
        description: 'perks.WINTERS_BONE.description',
        category: PerkCategory.PASSIVE,
        intensity: 0.9, // 10% damage resistance
    },

    // --- BUFFS ---
    [StatusEffectType.REFLEX_SHIELD]: {
        id: StatusEffectType.REFLEX_SHIELD,
        icon: '🌀',
        displayName: 'perks.REFLEX_SHIELD.title',
        description: 'perks.REFLEX_SHIELD.description',
        category: PerkCategory.BUFF,
        duration: 500,
        cooldown: 10000,
    },
    [StatusEffectType.ADRENALINE_PATCH]: {
        id: StatusEffectType.ADRENALINE_PATCH,
        icon: '💉',
        displayName: 'perks.ADRENALINE_PATCH.title',
        description: 'perks.ADRENALINE_PATCH.description',
        category: PerkCategory.BUFF,
        duration: 3000,
        cooldown: 60000,
    },

    // --- DEBUFFS ---
    [StatusEffectType.BLEEDING]: {
        id: StatusEffectType.BLEEDING,
        icon: '🩸',
        displayName: 'perks.BLEEDING.title',
        description: 'perks.BLEEDING.description',
        category: PerkCategory.DEBUFF,
        duration: 3000,
        damage: 5, // Damage per tick
        intensity: 0.9, // 10% slow
    },
    [StatusEffectType.BURNING]: {
        id: StatusEffectType.BURNING,
        icon: '🔥',
        displayName: 'perks.BURNING.title',
        description: 'perks.BURNING.description',
        category: PerkCategory.DEBUFF,
        duration: 3000,
        damage: 10,
        intensity: 0.9,
    },
    [StatusEffectType.STUNNED]: {
        id: StatusEffectType.STUNNED,
        icon: '😵',
        displayName: 'perks.STUNNED.title',
        description: 'perks.STUNNED.description',
        category: PerkCategory.DEBUFF,
        duration: 3000,
        intensity: 0,
    },
    [StatusEffectType.DISORIENTED]: {
        id: StatusEffectType.DISORIENTED,
        icon: '😵‍💫',
        displayName: 'perks.DISORIENTED.title',
        description: 'perks.DISORIENTED.description',
        category: PerkCategory.DEBUFF,
        duration: 2000,
        intensity: 0.8,
    },
    [StatusEffectType.SLOWED]: {
        id: StatusEffectType.SLOWED,
        icon: '🐌',
        displayName: 'perks.SLOWED.title',
        description: 'perks.SLOWED.description',
        category: PerkCategory.DEBUFF,
        duration: 2500,
        intensity: 0.6,
    },
    [StatusEffectType.FREEZING]: {
        id: StatusEffectType.FREEZING,
        icon: '❄️',
        displayName: 'perks.FREEZING.title',
        description: 'perks.FREEZING.description',
        category: PerkCategory.DEBUFF,
        duration: 2000,
        damage: 10,
        intensity: 0.8 / 1.5,
    },
    [StatusEffectType.ELECTRIFIED]: {
        id: StatusEffectType.ELECTRIFIED,
        icon: '⚡',
        displayName: 'perks.ELECTRIFIED.title',
        description: 'perks.ELECTRIFIED.description',
        category: PerkCategory.DEBUFF,
        duration: 2000,
        damage: 10,
        intensity: 0.8 / 1.5,
    },
    [StatusEffectType.DROWNING]: {
        id: StatusEffectType.DROWNING,
        icon: '🫧',
        displayName: 'perks.DROWNING.title',
        description: 'perks.DROWNING.description',
        category: PerkCategory.DEBUFF,
        duration: 3000,
        damage: 15,
    }
};
