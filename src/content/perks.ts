import { StatusEffectID } from '../types/StatusEffects';
import { ColorPair } from '../utils/ui/ColorUtils';
export { StatusEffectID };

export enum PerkCategory {
    BUFF = 0,
    DEBUFF = 1,
    PASSIVE = 2
}

export const PerkColors: ColorPair[] = [
    { num: 0x22c55e, str: '#22c55e' }, // BUFF
    { num: 0xef4444, str: '#ef4444' }, // DEBUFF (Red-500)
    { num: 0xa855f7, str: '#a855f7' }  // PASSIVE
];

export const PerkColor = {
    BUFF: PerkColors[0],
    DEBUFF: PerkColors[1],
    PASSIVE: PerkColors[2]
};

// StatusEffectType has been moved to src/types/StatusEffects.ts as StatusEffectID

export interface PerkStats {
    id: StatusEffectID;
    icon: string;
    displayName: string;
    description: string;
    category: PerkCategory;
    prerequisite?: string;
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
 * Indexed directly by StatusEffectID (SMI).
 */
export const PERKS: PerkStats[] = [];

// --- PASSIVES ---
PERKS[StatusEffectID.TRICKSTERS_HASTE] = {
    id: StatusEffectID.TRICKSTERS_HASTE,
    icon: '🔁',
    displayName: 'perks.TRICKSTERS_HASTE.title',
    description: 'perks.TRICKSTERS_HASTE.description',
    prerequisite: 'perks.TRICKSTERS_HASTE.prerequisite',
    category: PerkCategory.PASSIVE,
    reloadModifier: 20, // 20% faster reload
};
PERKS[StatusEffectID.EAGLES_SIGHT] = {
    id: StatusEffectID.EAGLES_SIGHT,
    icon: '🎯',
    displayName: 'perks.EAGLES_SIGHT.title',
    description: 'perks.EAGLES_SIGHT.description',
    prerequisite: 'perks.EAGLES_SIGHT.prerequisite',
    category: PerkCategory.PASSIVE,
    rangeModifier: 15, // 15% more range
};
PERKS[StatusEffectID.LEAD_FEVER] = {
    id: StatusEffectID.LEAD_FEVER,
    icon: '🔫',
    displayName: 'perks.LEAD_FEVER.title',
    description: 'perks.LEAD_FEVER.description',
    prerequisite: 'perks.LEAD_FEVER.prerequisite',
    category: PerkCategory.PASSIVE,
    fireRateModifier: 20, // 20% faster fire rate
};
PERKS[StatusEffectID.WINTERS_BONE] = {
    id: StatusEffectID.WINTERS_BONE,
    icon: '🛡️',
    displayName: 'perks.WINTERS_BONE.title',
    description: 'perks.WINTERS_BONE.description',
    prerequisite: 'perks.WINTERS_BONE.prerequisite',
    category: PerkCategory.PASSIVE,
    damageResistModifier: 10, // 10% damage resistance
};

// --- BUFFS ---
PERKS[StatusEffectID.REFLEX_SHIELD] = {
    id: StatusEffectID.REFLEX_SHIELD,
    icon: '🛡️',
    displayName: 'perks.REFLEX_SHIELD.title',
    description: 'perks.REFLEX_SHIELD.description',
    prerequisite: 'perks.REFLEX_SHIELD.prerequisite',
    category: PerkCategory.BUFF,
    duration: 1000, // Linger duration
    cooldown: 10000,
    damageResistModifier: 50, // 50% damage resistance
};
PERKS[StatusEffectID.ADRENALINE_PATCH] = {
    id: StatusEffectID.ADRENALINE_PATCH,
    icon: '💉',
    displayName: 'perks.ADRENALINE_PATCH.title',
    description: 'perks.ADRENALINE_PATCH.description',
    prerequisite: 'perks.ADRENALINE_PATCH.prerequisite',
    category: PerkCategory.BUFF,
    duration: 3000,
    cooldown: 30000,
    speedModifier: 30,
    fireRateModifier: 20
};
PERKS[StatusEffectID.GIB_MASTER] = {
    id: StatusEffectID.GIB_MASTER,
    icon: '🎯',
    displayName: 'perks.GIB_MASTER.title',
    description: 'perks.GIB_MASTER.description',
    prerequisite: 'perks.GIB_MASTER.prerequisite',
    category: PerkCategory.BUFF,
    duration: 3000,
    cooldown: 30000
};
PERKS[StatusEffectID.QUICK_FINGER] = {
    id: StatusEffectID.QUICK_FINGER,
    icon: '⏱️',
    displayName: 'perks.QUICK_FINGER.title',
    description: 'perks.QUICK_FINGER.description',
    prerequisite: 'perks.QUICK_FINGER.prerequisite',
    category: PerkCategory.BUFF,
    duration: 5000,
    cooldown: 30000,
    reloadModifier: 30
};

// --- DEBUFFS ---
PERKS[StatusEffectID.BLEEDING] = {
    id: StatusEffectID.BLEEDING,
    icon: '🩸',
    displayName: 'perks.BLEEDING.title',
    description: 'perks.BLEEDING.description',
    prerequisite: 'perks.BLEEDING.prerequisite',
    category: PerkCategory.DEBUFF,
    duration: 3000,
    dotDamage: 5
};
PERKS[StatusEffectID.BURNING] = {
    id: StatusEffectID.BURNING,
    icon: '🔥',
    displayName: 'perks.BURNING.title',
    description: 'perks.BURNING.description',
    prerequisite: 'perks.BURNING.prerequisite',
    category: PerkCategory.DEBUFF,
    duration: 3000,
    dotDamage: 10
};
PERKS[StatusEffectID.STUNNED] = {
    id: StatusEffectID.STUNNED,
    icon: '😵',
    displayName: 'perks.STUNNED.title',
    description: 'perks.STUNNED.description',
    prerequisite: 'perks.STUNNED.prerequisite',
    category: PerkCategory.DEBUFF,
    duration: 3000,
};
PERKS[StatusEffectID.DISORIENTED] = {
    id: StatusEffectID.DISORIENTED,
    icon: '😵‍💫',
    displayName: 'perks.DISORIENTED.title',
    description: 'perks.DISORIENTED.description',
    prerequisite: 'perks.DISORIENTED.prerequisite',
    category: PerkCategory.DEBUFF,
    duration: 2000,
    speedModifier: -20,
};
PERKS[StatusEffectID.SLOWED] = {
    id: StatusEffectID.SLOWED,
    icon: '🐌',
    displayName: 'perks.SLOWED.title',
    description: 'perks.SLOWED.description',
    prerequisite: 'perks.SLOWED.prerequisite',
    category: PerkCategory.DEBUFF,
    duration: 2500,
    speedModifier: -40,
};
PERKS[StatusEffectID.FREEZING] = {
    id: StatusEffectID.FREEZING,
    icon: '❄️',
    displayName: 'perks.FREEZING.title',
    description: 'perks.FREEZING.description',
    prerequisite: 'perks.FREEZING.prerequisite',
    category: PerkCategory.DEBUFF,
    duration: 2000,
    dotDamage: 10,
    speedModifier: -20,
};
PERKS[StatusEffectID.ELECTRIFIED] = {
    id: StatusEffectID.ELECTRIFIED,
    icon: '⚡',
    displayName: 'perks.ELECTRIFIED.title',
    description: 'perks.ELECTRIFIED.description',
    prerequisite: 'perks.ELECTRIFIED.prerequisite',
    category: PerkCategory.DEBUFF,
    duration: 2000,
    dotDamage: 10,
    speedModifier: -20,
};
PERKS[StatusEffectID.DROWNING] = {
    id: StatusEffectID.DROWNING,
    icon: '🫧',
    displayName: 'perks.DROWNING.title',
    description: 'perks.DROWNING.description',
    prerequisite: 'perks.DROWNING.prerequisite',
    category: PerkCategory.DEBUFF,
    duration: 3000,
    dotDamage: 10,
};

/**
 * EXPERT OPTIMIZATION: PERK_CATALOG
 * Groups perks by category during module load to avoid O(N) filtering in UI renders.
 * STRICT: Category enums are numeric to support Zero-GC and Bitwise engine evaluations.
 */
export const PERK_CATALOG: Record<PerkCategory, PerkStats[]> = {
    [PerkCategory.PASSIVE]: [],
    [PerkCategory.BUFF]: [],
    [PerkCategory.DEBUFF]: []
};

// Initialize catalog from the flat array (Run once on load)
PERKS.forEach(p => {
    if (p) PERK_CATALOG[p.category].push(p);
});
