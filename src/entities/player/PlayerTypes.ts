import { StatusEffectType } from '../../content/perks';

/**
 * VINTERDÖD: Player DOD & Zero-GC Refactor (Phase 9)
 * * This file defines the core Data-Oriented structures for the player.
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

    // --- NEW ANALYTICS (Phase 12) ---
    TOTAL_SESSIONS_STARTED = 17,
    TOTAL_GAME_TIME = 18,
    LONGEST_KILLSTREAK = 19,
    TOTAL_CHESTS_OPENED = 20,
    TOTAL_BIG_CHESTS_OPENED = 21,
    TOTAL_ENGAGEMENT_DISTANCE_SQ = 22,

    // --- NEW MOVEMENT ANALYTICS ---
    TOTAL_DODGES = 23,
    TOTAL_RUSHES = 24,
    TOTAL_RUSH_DISTANCE = 25,

    // --- NEW PERK ANALYTICS ---
    TOTAL_BUFF_TIME = 26,
    TOTAL_DEBUFFS_RESISTED = 27,
    TOTAL_CRISIS_SAVES = 28,

    // --- MULTIPLIERS (29+) ---
    MULTIPLIER_SPEED = 29,
    MULTIPLIER_RELOAD = 30,
    MULTIPLIER_FIRERATE = 31,
    MULTIPLIER_DMG_RESIST = 32,
    MULTIPLIER_RANGE = 33,

    // Pre-calculated stats (Zero-GC / O(1))
    FINAL_SPEED = 34,

    // Buffer Size
    COUNT = 35
}

/**
 * SMI-indexed index for weapon-specific statistics.
 * Used with Float64Arrays to avoid dictionary lookups in hot loops.
 * Maps to DamageID (1-15) via (id - 1).
 */
export enum StatWeaponIndex {
    SMG = 0,
    SHOTGUN = 1,
    RIFLE = 2,
    PISTOL = 3,
    REVOLVER = 4,
    GRENADE = 5,
    MOLOTOV = 6,
    FLASHBANG = 7,
    MINIGUN = 8,
    FLAMETHROWER = 9,
    ARC_CANNON = 10,
    RADIO = 11,
    RUSH = 12,
    VEHICLE = 13,
    DODGE = 14,
    COUNT = 20 // Buffer for future expansion
}

/**
 * SMI-indexed index for enemy-specific statistics.
 * Optimized for Zero-GC kill tracking.
 */
export enum StatEnemyIndex {
    WALKER = 0,
    RUNNER = 1,
    TANK = 2,
    BOMBER = 3,
    BOSS = 4,
    COUNT = 8 // Sized for future variants
}

/**
 * SMI-indexed index for perk-specific performance metrics.
 * Sized to 32 to match StatusEffectType bitmasking capacity.
 */
export enum StatPerkIndex {
    COUNT = 32
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
    DODGING = 1 << 8,

    // --- BUFFS (Phase 11) ---
    REFLEX_SHIELD = 1 << 9,
    ADRENALINE_SHOT = 1 << 10,
    GIB_MASTER = 1 << 11,
    QUICK_FINGER = 1 << 12
}

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

    // --- WEAPON PERFORMANCE BUFFERS (Zero-GC / Phase 12) ---
    // All indexed by StatWeaponIndex
    weaponKills: Float64Array;
    weaponDamageDealt: Float64Array;
    weaponShotsFired: Float64Array;
    weaponShotsHit: Float64Array;
    weaponTimeActive: Float64Array;
    weaponEngagementDistSq: Float64Array;

    // --- PERK PERFORMANCE BUFFERS (Zero-GC / Phase 12) ---
    // All indexed by StatusEffectType (0-31)
    perkTimesGained: Float64Array;
    perkDamageAbsorbed: Float64Array;
    perkDamageDealt: Float64Array;
    perkDebuffsCleansed: Float64Array;

    // --- ENEMY STATS BUFFERS ---
    // Indexed by StatEnemyIndex
    enemyKills: Float64Array;

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
    chestsOpened: number;
    bigChestsOpened: number;
    totalBulletsFired: number;
    totalBulletsHit: number;
    totalThrowablesThrown: number;

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
     * V8-Opt: Uses a raw for-loop instead of Array.from() to prevent iterator allocation.
     */
    serializeStats: (buffer: Float32Array): number[] => {
        const len = buffer.length;
        const arr = new Array(len);
        for (let i = 0; i < len; i++) {
            arr[i] = buffer[i];
        }
        return arr;
    },

    /**
     * Deserializes a standard array back into a Float32Array statsBuffer.
     */
    deserializeStats: (data: number[]): Float32Array => {
        return new Float32Array(data);
    },

    /**
     * Serializes Float64Arrays to standard arrays for persistence.
     */
    serializeBuffer64: (buffer: Float64Array): number[] => {
        const len = buffer.length;
        const arr = new Array(len);
        for (let i = 0; i < len; i++) arr[i] = buffer[i];
        return arr;
    },

    /**
     * Deserializes standard arrays back into Float64Arrays.
     */
    deserializeBuffer64: (data: number[]): Float64Array => {
        return new Float64Array(data);
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
            
            weaponKills: new Float64Array(StatWeaponIndex.COUNT),
            weaponDamageDealt: new Float64Array(StatWeaponIndex.COUNT),
            weaponShotsFired: new Float64Array(StatWeaponIndex.COUNT),
            weaponShotsHit: new Float64Array(StatWeaponIndex.COUNT),
            weaponTimeActive: new Float64Array(StatWeaponIndex.COUNT),
            weaponEngagementDistSq: new Float64Array(StatWeaponIndex.COUNT),

            perkTimesGained: new Float64Array(StatPerkIndex.COUNT),
            perkDamageAbsorbed: new Float64Array(StatPerkIndex.COUNT),
            perkDamageDealt: new Float64Array(StatPerkIndex.COUNT),
            perkDebuffsCleansed: new Float64Array(StatPerkIndex.COUNT),

            enemyKills: new Float64Array(StatEnemyIndex.COUNT),

            activePassives: [] as StatusEffectType[],
            activeBuffs: [] as StatusEffectType[],
            activeDebuffs: [] as StatusEffectType[],
            discoveredPerks: [] as StatusEffectType[]
        };
    },

    // --- BITWISE HELPERS (O(1) Check & Mutate) ---

    /** Checks if a specific status flag is currently active */
    hasFlag: (stats: PlayerStats, flag: PlayerStatusFlags): boolean => {
        return (stats.statusFlags & flag) !== 0;
    },

    /** Sets a specific status flag to active */
    setFlag: (stats: PlayerStats, flag: PlayerStatusFlags) => {
        stats.statusFlags |= flag;
    },

    /** Removes a specific status flag */
    clearFlag: (stats: PlayerStats, flag: PlayerStatusFlags) => {
        stats.statusFlags &= ~flag;
    }
};