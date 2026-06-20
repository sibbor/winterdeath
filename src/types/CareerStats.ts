import * as THREE from 'three';
import { StatusEffectID } from '../content/perks';
import { DamageID } from '../entities/player/CombatTypes';
import { MAX_ENTITIES, PLAYER } from '../content/constants';

/**
 * Player DOD & Zero-GC Refactor (Career Stats)
 * This file defines the core Data-Oriented structures for the player's career profile.
 * High-frequency stats are stored in contiguous Float32Arrays to ensure
 * L1/L2 cache locality and prevent V8 hidden-class deoptimizations.
 */

/**
 * SMI-indexed IDs for the statsBuffer.
 * Pre-allocated to ensure O(1) direct memory access.
 */
export enum StatID {
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
    TOTAL_GIBBED_BY_REVOLVER_SHOTGUN = 52,

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
    RUSH = 21,
    DODGE = 22,

    // --- VEHICLES (33-36) ---
    VEHICLE = 23,
    VEHICLE_SPLATTER = 24,
    VEHICLE_RAM = 25,
    VEHICLE_PUSH = 26,

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
    BOSS = 16,       // 16 - 23: BossID
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
    BLOATER = 3,
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
 * CareerStats Interface
 * Holds persistent, serializable lifetime aggregated player statistics and career progression.
 * Purged of all transient runtime physics vectors and skeletal nodes to prevent leaks.
 */
export interface CareerStats {
    // --- DOD BUFFERS (Zero-GC / O(1)) ---
    statsBuffer: Float32Array;      // Sized by PlayerStatID.COUNT
    effectDurations: Float32Array;  // Sized by StatusEffectID (e.g. 128)
    effectMaxDurations: Float32Array;
    effectIntensities: Float32Array;

    // --- INCOMING DAMAGE BUFFER (Zero-GC / Flattened) ---
    incomingDamageBuffer: Float64Array;

    // --- OUTGOING PERFORMANCE BUFFERS ---
    // All indexed by StatWeaponIndex
    outgoingKillsBuffer: Float64Array;
    outgoingDamageBuffer: Float64Array;
    outgoingShotsFiredBuffer: Float64Array;
    outgoingShotsHitBuffer: Float64Array;
    outgoingTimeActiveBuffer: Float64Array;
    outgoingEngagementDistSqBuffer: Float64Array;

    // --- PERK PERFORMANCE BUFFERS ---
    // All indexed by StatusEffectID
    perkTimesGained: Float64Array;
    perkDamageAbsorbed: Float64Array;
    perkDamageDealt: Float64Array;
    perkDebuffsCleansed: Float64Array;

    // --- ENEMY STATS BUFFERS ---
    // Indexed by StatEnemyIndex
    enemyKills: Float64Array;
    deathsByEnemyType: Float64Array;

    mostUsedWeapon: DamageID;
    totalEnemiesKilled: number;

    // --- SMI STATE ---
    statusFlags: number; // Bitmask (PlayerStatusFlags)
    activePassives: StatusEffectID[];
    activeBuffs: StatusEffectID[];
    activeDebuffs: StatusEffectID[];

    // --- SECTOR PROGRESSION ---
    sectorsCompleted: number;
    totalSkillPointsEarned: number;

    // --- DISCOVERY DATA (Uint8Array maps, indexed by resolved SMI) ---
    discoveredClues: Uint8Array;
    discoveredPois: Uint8Array;
    discoveredCollectibles: Uint8Array;
    discoveredZombies: Uint8Array;
    discoveredBosses: Uint8Array;
    discoveredPerks: Uint8Array;

    // --- STORY & PROGRESSION ---
    prologueSeen?: boolean;
    deadBossIndices: number[];
    rescuedFamilyIndices: number[];
    familyFoundCount: number;

    // --- CHALLENGE PROGRESSION ---
    challengeTiers: Int32Array;
    totalChallengePoints: number;
    trackedChallengeIds: number[];
}

/**
 * Serialization Helpers (Zero-GC Friendly)
 */
export const CareerStatsUtils = {
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
    initBuffers: (): CareerStats => {
        return {
            statsBuffer: new Float32Array(StatID.COUNT),
            effectDurations: new Float32Array(StatPerkIndex.COUNT),
            effectMaxDurations: new Float32Array(StatPerkIndex.COUNT),
            effectIntensities: new Float32Array(StatPerkIndex.COUNT),

            outgoingKillsBuffer: new Float64Array(StatWeaponIndex.COUNT),
            outgoingDamageBuffer: new Float64Array(StatWeaponIndex.COUNT),
            outgoingShotsFiredBuffer: new Float64Array(StatWeaponIndex.COUNT),
            outgoingShotsHitBuffer: new Float64Array(StatWeaponIndex.COUNT),
            outgoingTimeActiveBuffer: new Float64Array(StatWeaponIndex.COUNT),
            outgoingEngagementDistSqBuffer: new Float64Array(StatWeaponIndex.COUNT),

            perkTimesGained: new Float64Array(StatPerkIndex.COUNT),
            perkDamageAbsorbed: new Float64Array(StatPerkIndex.COUNT),
            perkDamageDealt: new Float64Array(StatPerkIndex.COUNT),
            perkDebuffsCleansed: new Float64Array(StatPerkIndex.COUNT),

            enemyKills: new Float64Array(StatEnemyIndex.COUNT),
            deathsByEnemyType: new Float64Array(StatEnemyIndex.COUNT),
            incomingDamageBuffer: new Float64Array(TELEMETRY_BUFFER_SIZE),
            challengeTiers: new Int32Array(64),

            statusFlags: 0,
            activePassives: [] as StatusEffectID[],
            activeBuffs: [] as StatusEffectID[],
            activeDebuffs: [] as StatusEffectID[],
            discoveredPerks: new Uint8Array(MAX_ENTITIES.DISCOVERY_MAP_SIZE),
            discoveredClues: new Uint8Array(MAX_ENTITIES.DISCOVERY_MAP_SIZE),
            discoveredPois: new Uint8Array(MAX_ENTITIES.DISCOVERY_MAP_SIZE),
            discoveredCollectibles: new Uint8Array(MAX_ENTITIES.DISCOVERY_MAP_SIZE),
            discoveredZombies: new Uint8Array(MAX_ENTITIES.DISCOVERY_MAP_SIZE),
            discoveredBosses: new Uint8Array(MAX_ENTITIES.DISCOVERY_MAP_SIZE),
            rescuedFamilyIndices: [] as number[],
            deadBossIndices: [] as number[],
            trackedChallengeIds: [] as number[],

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
    hasFlag: (careerStats: CareerStats, flag: PlayerStatusFlags): boolean => {
        return (careerStats.statusFlags & flag) !== 0;
    },

    /** Sets a specific status flag to active */
    setFlag: (careerStats: CareerStats, flag: PlayerStatusFlags) => {
        careerStats.statusFlags |= flag;
    },

    /** Removes a specific status flag */
    clearFlag: (careerStats: CareerStats, flag: PlayerStatusFlags) => {
        careerStats.statusFlags &= ~flag;
    }
};

/**
 * INITIAL_STATS constant
 * Default starting career stats object for a new save game profile.
 * Completely decoupled from constant files to prevent circular dependencies.
 */
export const INITIAL_STATS: CareerStats = {
    statsBuffer: (function () {
        const buffer = new Float32Array(StatID.COUNT);
        buffer[StatID.HP] = 100;
        buffer[StatID.MAX_HP] = 100;
        buffer[StatID.STAMINA] = 100;
        buffer[StatID.MAX_STAMINA] = 100;
        buffer[StatID.XP] = 0;
        buffer[StatID.LEVEL] = 1;
        buffer[StatID.CURRENT_XP] = 0;
        buffer[StatID.NEXT_LEVEL_XP] = 1500;
        buffer[StatID.SKILL_POINTS] = 0;
        buffer[StatID.SCRAP] = 0;
        buffer[StatID.SPEED] = PLAYER.BASE_SPEED;

        // --- TOTALS ---
        buffer[StatID.TOTAL_SCRAP_COLLECTED] = 0;
        buffer[StatID.TOTAL_DAMAGE_DEALT] = 0;
        buffer[StatID.TOTAL_DAMAGE_TAKEN] = 0;
        buffer[StatID.TOTAL_DISTANCE_TRAVELED] = 0;
        buffer[StatID.TOTAL_KILLS] = 0;
        buffer[StatID.SCORE] = 0;

        // --- MULTIPLIERS ---
        buffer[StatID.MULTIPLIER_SPEED] = 1.0;
        buffer[StatID.MULTIPLIER_RELOAD] = 1.0;
        buffer[StatID.MULTIPLIER_FIRERATE] = 1.0;
        buffer[StatID.MULTIPLIER_DMG_RESIST] = 1.0;
        buffer[StatID.MULTIPLIER_RANGE] = 1.0;

        // --- BASE MULTIPLIERS ---
        buffer[StatID.BASE_MULTIPLIER_SPEED] = 1.0;
        buffer[StatID.BASE_MULTIPLIER_RELOAD] = 1.0;
        buffer[StatID.BASE_MULTIPLIER_FIRERATE] = 1.0;
        buffer[StatID.BASE_MULTIPLIER_DMG_RESIST] = 1.0;
        buffer[StatID.BASE_MULTIPLIER_RANGE] = 1.0;

        // --- BAKE FINAL PRE-CALCULATED STATS (Zero-GC) ---
        buffer[StatID.FINAL_SPEED] = buffer[StatID.SPEED] * buffer[StatID.BASE_MULTIPLIER_SPEED] * buffer[StatID.MULTIPLIER_SPEED] * (1.0 / 3.6); // KMH_TO_MS

        return buffer;
    })(),

    effectDurations: new Float32Array(128), // Sized by MAX_ENTITIES.PERKS (128)
    effectMaxDurations: new Float32Array(128),
    effectIntensities: new Float32Array(128),

    incomingDamageBuffer: new Float64Array(TELEMETRY_BUFFER_SIZE),

    outgoingKillsBuffer: new Float64Array(StatWeaponIndex.COUNT),
    outgoingDamageBuffer: new Float64Array(StatWeaponIndex.COUNT),
    outgoingShotsFiredBuffer: new Float64Array(StatWeaponIndex.COUNT),
    outgoingShotsHitBuffer: new Float64Array(StatWeaponIndex.COUNT),
    outgoingTimeActiveBuffer: new Float64Array(StatWeaponIndex.COUNT),
    outgoingEngagementDistSqBuffer: new Float64Array(StatWeaponIndex.COUNT),

    perkTimesGained: new Float64Array(StatPerkIndex.COUNT),
    perkDamageAbsorbed: new Float64Array(StatPerkIndex.COUNT),
    perkDamageDealt: new Float64Array(StatPerkIndex.COUNT),
    perkDebuffsCleansed: new Float64Array(StatPerkIndex.COUNT),

    enemyKills: new Float64Array(StatEnemyIndex.COUNT),
    deathsByEnemyType: new Float64Array(StatEnemyIndex.COUNT),

    statusFlags: 0,
    activePassives: [],
    activeBuffs: [],
    activeDebuffs: [],

    sectorsCompleted: 0,
    totalSkillPointsEarned: 0,

    discoveredClues: new Uint8Array(MAX_ENTITIES.DISCOVERY_MAP_SIZE),
    discoveredPois: new Uint8Array(MAX_ENTITIES.DISCOVERY_MAP_SIZE),
    discoveredCollectibles: new Uint8Array(MAX_ENTITIES.DISCOVERY_MAP_SIZE),
    discoveredZombies: new Uint8Array(MAX_ENTITIES.DISCOVERY_MAP_SIZE),
    discoveredBosses: new Uint8Array(MAX_ENTITIES.DISCOVERY_MAP_SIZE),
    discoveredPerks: new Uint8Array(MAX_ENTITIES.DISCOVERY_MAP_SIZE),
    deadBossIndices: [],

    prologueSeen: false,
    rescuedFamilyIndices: [],
    familyFoundCount: 0,
    mostUsedWeapon: DamageID.NONE,
    challengeTiers: new Int32Array(64), // Sized by MAX_ENTITIES.CHALLENGES (64)
    totalEnemiesKilled: 0,
    totalChallengePoints: 0,
    trackedChallengeIds: [],
};
