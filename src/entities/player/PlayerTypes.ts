import * as THREE from 'three';
import { StatusEffectType } from '../../content/perks';
import { DamageID } from './CombatTypes';

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
    TOTAL_DEATHS = 29,
    TOTAL_SHOTS_FIRED = 30,
    TOTAL_SHOTS_HIT = 31,
    TOTAL_THROWABLES_THROWN = 32,

    // --- MULTIPLIERS (33+) ---
    MULTIPLIER_SPEED = 33,
    MULTIPLIER_RELOAD = 34,
    MULTIPLIER_FIRERATE = 35,
    MULTIPLIER_DMG_RESIST = 36,
    MULTIPLIER_RANGE = 37,

    // Pre-calculated stats (Zero-GC / O(1))
    FINAL_SPEED = 38,

    // --- CHALLENGE TRACKING ---
    TOTAL_HEADSHOTS = 40,
    TOTAL_ITEMS_COLLECTED = 41,
    TOTAL_LONG_RANGE_KILLS = 42,
    TOTAL_SECTORS_COMPLETED = 43,
    TOTAL_CRITICAL_HITS = 44,

    // Buffer Size
    COUNT = 48
}

/**
 * SMI-indexed index for weapon-specific statistics.
 * Optimized for Zero-GC performance by aligning with DamageID.
 * Sized to 64 to provide ample headroom for tactical effects and future weapons.
 */
export enum StatWeaponIndex {
    NONE = 0,
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
    RADIO = 12,
    RUSH = 13,
    VEHICLE = 14,
    DODGE = 15,

    // --- TACTICAL & ENVIRONMENTAL (Synced with DamageID) ---
    PHYSICAL = 21,
    BURN = 22,
    BLEED = 23,
    DROWNING = 24,
    FALL = 25,
    EXPLOSION = 26,
    BITE = 27,
    ELECTRIC = 28,
    BOSS = 29,
    VEHICLE_SPLATTER = 30,
    VEHICLE_RAM = 31,
    VEHICLE_PUSH = 32,
    FIRE = 33,
    FALL_DAMAGE = 34,
    OTHER = 35,
    BOSS_GENERIC = 36,

    COUNT = 64 
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
    deathsByEnemyType: Float64Array;

    // --- INCOMING DAMAGE BUFFER (Zero-GC / Flattened) ---
    // Index = (SourceID * 32) + AttackID
    // SourceID 0-15: EnemyType, 16-63: DamageID
    incomingDamageBuffer: Float64Array;

    // --- SMI STATE ---
    statusFlags: number;            // Bitmask (PlayerStatusFlags)
    activePassives: StatusEffectType[];
    activeBuffs: StatusEffectType[];
    activeDebuffs: StatusEffectType[];

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
    discoveredPerks: StatusEffectType[];
    discoveredPOIs: string[];

    // --- STORY & PROGRESSION ---
    prologueSeen?: boolean;
    rescuedFamilyIndices: number[];

    familyFoundCount: number;
 
    // --- CHALLENGE PROGRESSION ---
    // Stores current tier (0-3) for each ChallengeID
    challengeTiers: Int32Array;
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
            velocity: new THREE.Vector3(),
            nodes: { gun: null, laserSight: null, barrelTip: null } as PlayerNodes,
            baseScale: 1.0,
            baseY: 0,

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
            deathsByEnemyType: new Float64Array(StatEnemyIndex.COUNT),
            incomingDamageBuffer: new Float64Array(64 * 32),
            challengeTiers: new Int32Array(64),

            activePassives: [] as StatusEffectType[],
            activeBuffs: [] as StatusEffectType[],
            activeDebuffs: [] as StatusEffectType[],
            discoveredPerks: [] as StatusEffectType[],
            rescuedFamilyIndices: [] as number[]
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