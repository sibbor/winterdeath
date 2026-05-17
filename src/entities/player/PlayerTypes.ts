import * as THREE from 'three';
import { StatusEffectID } from '../../content/perks';
import { DamageID } from './CombatTypes';

/**
 * Player DOD & Zero-GC Refactor (Phase 9)
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
    CHALLENGE_POINTS = 10,
    SPEED = 11,
    TOTAL_SCRAP_COLLECTED = 12,
    TOTAL_DAMAGE_DEALT = 13,
    TOTAL_DAMAGE_TAKEN = 14,
    TOTAL_DISTANCE_TRAVELED = 15,
    TOTAL_KILLS = 16,
    SCORE = 17,

    // --- NEW ANALYTICS (Phase 12) ---
    TOTAL_SESSIONS_STARTED = 18,
    TOTAL_GAME_TIME = 19,
    LONGEST_KILLSTREAK = 20,
    TOTAL_CHESTS_OPENED = 21,
    TOTAL_BIG_CHESTS_OPENED = 22,
    TOTAL_ENGAGEMENT_DISTANCE_SQ = 23,

    // --- NEW MOVEMENT ANALYTICS ---
    TOTAL_DODGES = 24,
    TOTAL_RUSHES = 25,
    TOTAL_RUSH_DISTANCE = 26,

    // --- NEW PERK ANALYTICS ---
    TOTAL_BUFF_TIME = 27,
    TOTAL_DEBUFFS_RESISTED = 28,
    TOTAL_CRISIS_SAVES = 29,
    TOTAL_DEATHS = 30,
    TOTAL_SHOTS_FIRED = 31,
    TOTAL_SHOTS_HIT = 32,
    TOTAL_THROWABLES_THROWN = 33,

    // --- MULTIPLIERS (34+) ---
    MULTIPLIER_SPEED = 34,
    MULTIPLIER_RELOAD = 35,
    MULTIPLIER_FIRERATE = 36,
    MULTIPLIER_DMG_RESIST = 37,
    MULTIPLIER_RANGE = 38,

    // --- BASE PASSIVE MULTIPLIERS (Phase 11 Refactor) ---
    BASE_MULTIPLIER_SPEED = 39,
    BASE_MULTIPLIER_RELOAD = 40,
    BASE_MULTIPLIER_FIRERATE = 41,
    BASE_MULTIPLIER_DMG_RESIST = 42,
    BASE_MULTIPLIER_RANGE = 43,

    // Pre-calculated stats (Zero-GC / O(1))
    FINAL_SPEED = 44,

    // --- CHALLENGE TRACKING ---
    TOTAL_ITEMS_COLLECTED = 45,
    TOTAL_LONG_RANGE_KILLS = 46,
    TOTAL_SECTORS_COMPLETED = 47,
    TOTAL_CRITICAL_HITS = 48,
    TOTAL_CHALLENGE_POINTS = 49,
    TOTAL_GIBBED = 50,
    TOTAL_UNIQUE_ENEMIES_HIT_BY_EXPLOSIVES = 51,

    // Buffer Size
    COUNT = 64
}


/**
 * SMI-indexed index for weapon-specific statistics.
 * Optimized for Zero-GC performance by aligning with DamageID.
 * Sized to 64 to provide ample headroom for tactical effects and future weapons.
 */
export enum StatWeaponIndex {
    NONE = 0,

    // --- WEAPONS (1-11) ---
    SMG = 1,
    SHOTGUN = 2,
    RIFLE = 3,
    PISTOL = 4,
    REVOLVER = 5,
    GRENADE = 6,
    MOLOTOV = 7,
    FLASHBANG = 8,
    MINIGUN = 9,
    FLAMETHROWER = 10,
    ARC_CANNON = 11,

    // --- TOOLS (12-20) ---
    RADIO = 12,

    // --- ABILITIES (20-29) ---
    RUSH = 22,
    DODGE = 21,

    // --- VEHICLES (33-36) ---
    VEHICLE = 30,
    VEHICLE_SPLATTER = 31,
    VEHICLE_RAM = 32,
    VEHICLE_PUSH = 33,

    // --- ENVIRONMENT & MASTER (41+) ---
    PHYSICAL = 41,
    BURN = 42,
    BLEED = 43,
    DROWNING = 44,
    FALL_DAMAGE = 45,
    EXPLOSION = 46,
    BITE = 47,
    ELECTRIC = 48,
    FROST = 49,
    BOSS_GENERIC = 50,
    OTHER = 51,

    COUNT = 64
}

/**
 * Telemetry Source Mapping
 * Defines the row offsets for the 2048-slot incomingDamageBuffer.
 * This prevents ID collisions between EnemyType and DamageID.
 */
export enum TelemetrySourceOffset {
    ENEMY = 0,       // 0 - 15: EnemyType
    BOSS = 16,      // 16 - 23: BossID
    ENVIRONMENT = 24 // 24 - 63: DamageID
}

export const TELEMETRY_SOURCES_COUNT = 64;
export const TELEMETRY_ATTACKS_PER_SOURCE = 32;
export const TELEMETRY_BUFFER_SIZE = TELEMETRY_SOURCES_COUNT * TELEMETRY_ATTACKS_PER_SOURCE; // 2048

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
 * Sized to 128 to match the expanded StatusEffectID range.
 */
export enum StatPerkIndex {
    COUNT = 128
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
    BLEEDING = 1 << 5,
    BURNING = 1 << 6,
    STUNNED = 1 << 7,
    DODGING = 1 << 8,

    // --- BUFFS ---
    REFLEX_SHIELD = 1 << 9,
    ADRENALINE_PATCH = 1 << 10,
    GIB_MASTER = 1 << 11,
    QUICK_FINGER = 1 << 12,

    // --- ADDITIONAL DEBUFFS ---
    SLOWED = 1 << 13,
    FREEZING = 1 << 14,
    ELECTRIFIED = 1 << 15,
    DROWNING = 1 << 16
}

/**
 * SMI-indexed IDs for player skeletal/equipment nodes.
 * Used for O(1) access in Animator and Combat systems.
 */
export interface PlayerNodes {
    gun: THREE.Object3D | null;
    laserSight: THREE.Mesh | null;
    barrelTip: THREE.Object3D | null;
}

/**
 * REFACTORED: PlayerStats (Phase 9 DOD SoA)
 * Removes individual high-frequency fields in favor of contiguous Float32Arrays.
 * No Getters/Setters: Use raw buffer access for Zero-GC performance.
 */
export interface PlayerStats {
    // --- VOLATILE ENTITY STATE (Zero-GC / Phase 13) ---
    velocity: THREE.Vector3;        // Bypasses userData indirection
    nodes: PlayerNodes;             // O(1) bone/equipment lookup
    baseScale: number;              // Cached from ModelFactory
    baseY: number;                  // Cached from ModelFactory
    // --- DOD BUFFERS (Zero-GC / O(1)) ---
    statsBuffer: Float32Array;      // Sized by PlayerStatID.COUNT
    effectDurations: Float32Array;  // Sized by StatusEffectID (e.g. 16/32)
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
    // All indexed by StatusEffectID (0-31)
    perkTimesGained: Float64Array;
    perkDamageAbsorbed: Float64Array;
    perkDamageDealt: Float64Array;
    perkDebuffsCleansed: Float64Array;

    // --- ENEMY STATS BUFFERS ---
    // Indexed by StatEnemyIndex
    enemyKills: Float64Array;
    deathsByEnemyType: Float64Array;

    // --- INCOMING DAMAGE BUFFER (Zero-GC / Flattened) ---
    // Index = (SourceID * 32) + AttackID
    // SourceID 0-15: EnemyType, 16-63: DamageID
    incomingDamageBuffer: Float64Array;

    // --- SMI STATE ---
    statusFlags: number;            // Bitmask (PlayerStatusFlags)
    activePassives: StatusEffectID[];
    activeBuffs: StatusEffectID[];
    activeDebuffs: StatusEffectID[];

    // --- SECTOR PROGRESSION ---
    sectorsCompleted: number;
    totalSkillPointsEarned: number;

    // --- COLLECTION DATA ---
    collectiblesDiscovered: string[];
    viewedCollectibles?: string[];
    cluesFound: string[];
    mostUsedWeapon: DamageID;
    totalEnemiesKilled: number;
    seenEnemies: number[];
    seenBosses: number[];
    discoveredPerksMap: Uint8Array;
    discoveredPOIs: string[];

    // --- STORY & PROGRESSION ---
    prologueSeen?: boolean;
    rescuedFamilyIndices: number[];
    deadBossIndices: number[];

    familyFoundCount: number;

    // --- CHALLENGE PROGRESSION ---
    // Stores current tier (0-3) for each ChallengeID
    challengeTiers: Int32Array;
    totalChallengePoints: number;
    trackedChallengeIds: number[];
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
     * Serializes a Uint8Array map to a standard array for persistence.
     */
    serializeMap8: (buffer: Uint8Array): number[] => {
        const len = buffer.length;
        const arr = new Array(len);
        for (let i = 0; i < len; i++) arr[i] = buffer[i];
        return arr;
    },

    /**
     * Deserializes a standard array back into a Uint8Array map.
     */
    deserializeMap8: (data: number[]): Uint8Array => {
        return new Uint8Array(data);
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
        return {
            velocity: new THREE.Vector3(),
            nodes: { gun: null, laserSight: null, barrelTip: null } as PlayerNodes,
            baseScale: 1.0,
            baseY: 0,

            statsBuffer: new Float32Array(PlayerStatID.COUNT),
            effectDurations: new Float32Array(StatPerkIndex.COUNT),
            effectMaxDurations: new Float32Array(StatPerkIndex.COUNT),
            effectIntensities: new Float32Array(StatPerkIndex.COUNT),

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
            deathsByEnemyType: new Float64Array(StatEnemyIndex.COUNT),
            incomingDamageBuffer: new Float64Array(TELEMETRY_BUFFER_SIZE),
            challengeTiers: new Int32Array(64),

            activePassives: [] as StatusEffectID[],
            activeBuffs: [] as StatusEffectID[],
            activeDebuffs: [] as StatusEffectID[],
            discoveredPerksMap: new Uint8Array(256),
            rescuedFamilyIndices: [] as number[],
            deadBossIndices: [] as number[],
            trackedChallengeIds: [] as number[],

            // Collection data
            collectiblesDiscovered: [] as string[],
            viewedCollectibles: [] as string[],
            cluesFound: [] as string[],
            discoveredPOIs: [] as string[],
            seenEnemies: [] as number[],
            seenBosses: [] as number[],

            // Progression
            sectorsCompleted: 0,
            totalSkillPointsEarned: 0,
            familyFoundCount: 0,
            totalEnemiesKilled: 0,
            totalChallengePoints: 0,
            mostUsedWeapon: StatWeaponIndex.NONE as any
        };
    },

    // --- BITWISE HELPERS (O(1) Check & Mutate) ---

    /** Checks if a specific status flag is currently active */
    hasFlag: (playerStats: PlayerStats, flag: PlayerStatusFlags): boolean => {
        return (playerStats.statusFlags & flag) !== 0;
    },

    /** Sets a specific status flag to active */
    setFlag: (playerStats: PlayerStats, flag: PlayerStatusFlags) => {
        playerStats.statusFlags |= flag;
    },

    /** Removes a specific status flag */
    clearFlag: (playerStats: PlayerStats, flag: PlayerStatusFlags) => {
        playerStats.statusFlags &= ~flag;
    }
};
