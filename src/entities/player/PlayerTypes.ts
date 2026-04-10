import { StatusEffectType } from '../../content/perks';

/**

 * VINTERDÖD: Player DOD & Zero-GC Refactor (Phase 9)
 * 
 * This file defines the core Data-Oriented structures for the player.
 * High-frequency stats are stored in contiguous Float32Arrays to ensure
 * L1/L2 cache locality and prevent V8 hidden-class deoptimizations.
 */

/**
 * SMI-indexed IDs for the Player statsBuffer.
 * Pre-allocated to ensure O(1) direct memory access.
 */
export enum PlayerStatID {
    HP = 0,
    MAX_HP = 1,
    STAMINA = 2,
    MAX_STAMINA = 3,
    XP = 4,
    LEVEL = 5,
    CURRENT_XP = 6,
    NEXT_LEVEL_XP = 7,
    SKILL_POINTS = 8,
    SCRAP = 9,
    SPEED = 10,
    TOTAL_SCRAP_COLLECTED = 11,
    TOTAL_DAMAGE_DEALT = 12,
    TOTAL_DAMAGE_TAKEN = 13,
    TOTAL_DISTANCE_TRAVELED = 14,
    TOTAL_KILLS = 15,
    SCORE = 16,

    // --- MULTIPLIERS (17+) ---
    MULTIPLIER_SPEED = 17,
    MULTIPLIER_RELOAD = 18,
    MULTIPLIER_FIRERATE = 19,
    MULTIPLIER_DMG_RESIST = 20,
    MULTIPLIER_RANGE = 21,

    // Pre-calculated stats (Zero-GC / O(1))
    FINAL_SPEED = 22,

    // Buffer Size
    COUNT = 23
}

/**
 * SMI Bitmask for tracking player states.
 * Eliminates per-frame boolean property lookups.
 */
export enum PlayerStatusFlags {
    NONE = 0,
    DEAD = 1 << 0,
    DISORIENTED = 1 << 1,
    INVULNERABLE = 1 << 2,
    IN_VEHICLE = 1 << 3,
    RUSHING = 1 << 4,
    EXHAUSTED = 1 << 5,
    REGENERATING = 1 << 6,
    STUNNED = 1 << 7,
    DODGING = 1 << 8
}

// StatusEffectID has been consolidated into StatusEffectType in perks.ts


/**
 * REFACTORED: PlayerStats (Phase 9 DOD SoA)
 * Removes individual high-frequency fields in favor of contiguous Float32Arrays.
 * No Getters/Setters: Use raw buffer access for Zero-GC performance.
 */
export interface PlayerStats {
    // --- DOD BUFFERS (Zero-GC / O(1)) ---
    statsBuffer: Float32Array;      // Sized by PlayerStatID.COUNT
    effectDurations: Float32Array;  // Sized by StatusEffectType (e.g. 16/32)
    effectMaxDurations: Float32Array; 
    effectIntensities: Float32Array; 

    // --- SMI STATE ---
    statusFlags: number;            // Bitmask (PlayerStatusFlags)
    activePassives: StatusEffectType[];
    activeBuffs: StatusEffectType[];
    activeDebuffs: StatusEffectType[];

    // --- LEGACY/LOW-FREQUENCY PROPERTIES (Non-critical) ---
    killsByType: Record<number, number>;
    deaths: number;
    sectorsCompleted: number;
    totalSkillPointsEarned: number;
    totalBulletsFired: number;
    totalBulletsHit: number;
    totalThrowablesThrown: number;
    chestsOpened: number;
    bigChestsOpened: number;

    // --- COLLECTION DATA ---
    collectiblesDiscovered: string[];
    viewedCollectibles?: string[];
    cluesFound: string[];
    discoveredPOIs: string[];
    seenEnemies: number[];
    seenBosses: number[];
    discoveredPerks: StatusEffectType[];

    // --- STORY & PROGRESSION ---
    prologueSeen?: boolean;
    rescuedFamilyIds: number[];

    familyFoundCount: number;
    mostUsedWeapon: string;
    deathsByEnemyType: Record<number, number>;
    incomingDamageBreakdown: Record<number, Record<number, number>>;
    outgoingDamageBreakdown: Record<number, number>;
}

/**
 * Serialization Helpers (Zero-GC Friendly)
 */
export const PlayerStatsUtils = {
    /**
     * Serializes the Float32Array statsBuffer to a standard array for save-game JSON.
     */
    serializeStats: (buffer: Float32Array): number[] => {
        return Array.from(buffer);
    },

    /**
     * Deserializes a standard array back into a Float32Array statsBuffer.
     */
    deserializeStats: (data: number[]): Float32Array => {
        return new Float32Array(data);
    },

    /**
     * Initializes the DOD buffers for a new session.
     */
    initBuffers: () => {
        const effectCount = 32; // Over-allocated for expansion
        return {
            statsBuffer: new Float32Array(PlayerStatID.COUNT),
            effectDurations: new Float32Array(effectCount),
            effectMaxDurations: new Float32Array(effectCount),
            effectIntensities: new Float32Array(effectCount),
            activePassives: [] as StatusEffectType[],
            activeBuffs: [] as StatusEffectType[],
            activeDebuffs: [] as StatusEffectType[]
        };
    }
};
