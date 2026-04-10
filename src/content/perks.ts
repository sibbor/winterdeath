export enum PerkCategory {
    BUFF = 0,
    DEBUFF = 1,
    PASSIVE = 2
}

export const PerkColors = [
    '#22c55e', // BUFF
    '#ff3333', // DEBUFF
    '#a855f7'  // PASSIVE
];

export const PerkColor = {
    BUFF: PerkColors[0],
    DEBUFF: PerkColors[1],
    PASSIVE: PerkColors[2]
};


export enum StatusEffectType {
    // --- PASSIVES ---
    TRICKSTERS_HASTE = 0,
    EAGLES_SIGHT = 1,
    LEAD_FEVER = 2,
    WINTERS_BONE = 3,

    // --- BUFFS ---
    REFLEX_SHIELD = 4,
    ADRENALINE_PATCH = 5,

    // --- DEBUFFS ---
    BLEEDING = 6,
    SLOWED = 7,
    STUNNED = 8,
    BURNING = 9,
    DISORIENTED = 10,
    FREEZING = 11,
    ELECTRIFIED = 12,
    DROWNING = 13,
}

export interface PerkStats {
    id: StatusEffectType;
    icon: string;
    displayName: string;
    description: string;
    category: PerkCategory;
    duration?: number; // ms
    cooldown?: number; // ms

    // --- ADDITIVE INTEGER MODIFIERS (Step 1 DOD Refactor) ---
    // Rule: Positive = Good for Player, Negative = Bad for Player
    speedModifier?: number;        // e.g. -20 for 20% slow
    reloadModifier?: number;       // e.g. 20 for 20% faster
    fireRateModifier?: number;     // e.g. 20 for 20% faster
    damageResistModifier?: number; // e.g. 10 for 10% resist
    rangeModifier?: number;        // e.g. 15 for 15% range
    dotDamage?: number;            // Fixed damage per tick
}

/**
 * SOURCE OF TRUTH: Perks, Buffs, and Debuffs (Contiguous Array for O(1) Lookup)
 * VINTERDÖD: Indexed directly by StatusEffectType (SMI).
 */
export const PERKS: PerkStats[] = [];

// --- PASSIVES ---
PERKS[StatusEffectType.TRICKSTERS_HASTE] = {
    id: StatusEffectType.TRICKSTERS_HASTE,
    icon: '🔁',
    displayName: 'perks.TRICKSTERS_HASTE.title',
    description: 'perks.TRICKSTERS_HASTE.description',
    category: PerkCategory.PASSIVE,
    reloadModifier: 20, // 20% faster reload
};
PERKS[StatusEffectType.EAGLES_SIGHT] = {
    id: StatusEffectType.EAGLES_SIGHT,
    icon: '🎯',
    displayName: 'perks.EAGLES_SIGHT.title',
    description: 'perks.EAGLES_SIGHT.description',
    category: PerkCategory.PASSIVE,
    rangeModifier: 15, // 15% more range
};
PERKS[StatusEffectType.LEAD_FEVER] = {
    id: StatusEffectType.LEAD_FEVER,
    icon: '🔫',
    displayName: 'perks.LEAD_FEVER.title',
    description: 'perks.LEAD_FEVER.description',
    category: PerkCategory.PASSIVE,
    fireRateModifier: 20, // 20% faster fire rate
};
PERKS[StatusEffectType.WINTERS_BONE] = {
    id: StatusEffectType.WINTERS_BONE,
    icon: '🛡️',
    displayName: 'perks.WINTERS_BONE.title',
    description: 'perks.WINTERS_BONE.description',
    category: PerkCategory.PASSIVE,
    damageResistModifier: 10, // 10% damage resistance
};

// --- BUFFS ---
PERKS[StatusEffectType.REFLEX_SHIELD] = {
    id: StatusEffectType.REFLEX_SHIELD,
    icon: '🌀',
    displayName: 'perks.REFLEX_SHIELD.title',
    description: 'perks.REFLEX_SHIELD.description',
    category: PerkCategory.BUFF,
    duration: 2000,
    cooldown: 10000,
    damageResistModifier: 100, // 100% damage resistance
};
PERKS[StatusEffectType.ADRENALINE_PATCH] = {
    id: StatusEffectType.ADRENALINE_PATCH,
    icon: '💉',
    displayName: 'perks.ADRENALINE_PATCH.title',
    description: 'perks.ADRENALINE_PATCH.description',
    category: PerkCategory.BUFF,
    duration: 3000,
    cooldown: 60000,
    speedModifier: 30,
    fireRateModifier: 20
};

// --- DEBUFFS ---
PERKS[StatusEffectType.BLEEDING] = {
    id: StatusEffectType.BLEEDING,
    icon: '🩸',
    displayName: 'perks.BLEEDING.title',
    description: 'perks.BLEEDING.description',
    category: PerkCategory.DEBUFF,
    duration: 3000,
    dotDamage: 5
};
PERKS[StatusEffectType.BURNING] = {
    id: StatusEffectType.BURNING,
    icon: '🔥',
    displayName: 'perks.BURNING.title',
    description: 'perks.BURNING.description',
    category: PerkCategory.DEBUFF,
    duration: 3000,
    dotDamage: 10
};
PERKS[StatusEffectType.STUNNED] = {
    id: StatusEffectType.STUNNED,
    icon: '😵',
    displayName: 'perks.STUNNED.title',
    description: 'perks.STUNNED.description',
    category: PerkCategory.DEBUFF,
    duration: 3000,
};
PERKS[StatusEffectType.DISORIENTED] = {
    id: StatusEffectType.DISORIENTED,
    icon: '😵‍💫',
    displayName: 'perks.DISORIENTED.title',
    description: 'perks.DISORIENTED.description',
    category: PerkCategory.DEBUFF,
    duration: 2000,
    speedModifier: -20,
};
PERKS[StatusEffectType.SLOWED] = {
    id: StatusEffectType.SLOWED,
    icon: '🐌',
    displayName: 'perks.SLOWED.title',
    description: 'perks.SLOWED.description',
    category: PerkCategory.DEBUFF,
    duration: 2500,
    speedModifier: -40,
};
PERKS[StatusEffectType.FREEZING] = {
    id: StatusEffectType.FREEZING,
    icon: '❄️',
    displayName: 'perks.FREEZING.title',
    description: 'perks.FREEZING.description',
    category: PerkCategory.DEBUFF,
    duration: 2000,
    dotDamage: 10,
    speedModifier: -20,
};
PERKS[StatusEffectType.ELECTRIFIED] = {
    id: StatusEffectType.ELECTRIFIED,
    icon: '⚡',
    displayName: 'perks.ELECTRIFIED.title',
    description: 'perks.ELECTRIFIED.description',
    category: PerkCategory.DEBUFF,
    duration: 2000,
    dotDamage: 10,
    speedModifier: -20,
};
PERKS[StatusEffectType.DROWNING] = {
    id: StatusEffectType.DROWNING,
    icon: '🫧',
    displayName: 'perks.DROWNING.title',
    description: 'perks.DROWNING.description',
    category: PerkCategory.DEBUFF,
    duration: 3000,
    dotDamage: 15,
};