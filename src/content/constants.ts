import * as THREE from 'three';
import { PlayerStats, PlayerStatID, StatWeaponIndex, StatEnemyIndex, StatPerkIndex } from '../entities/player/PlayerTypes';
import { DamageID } from '../entities/player/CombatTypes';
import { GameSettings } from '../core/engine/EngineTypes';
import { ColorPair } from '../utils/ui/ColorUtils';

// Re-export Data
export { ZOMBIE_TYPES } from './enemies/zombies';
export { BOSSES } from './enemies/bosses';
export { WEAPONS } from './weapons';

// Sector constants
export const OVERRIDE_DEFAULT_SECTOR = -1;       // Set to -1 to disable override

// PHASE 7: SPATIAL GRID CONFIG (DOD Optimized)
export const WORLD_CHUNK_SIZE = 256;             // 256m x 256m active simulation area
export const POOL_PARTICLE_MAX = 5000;          // Max hardware-accelerated particles
export const GRID_CELL_POWER = 2;               // 4m cells (1 << 2)
export const GRID_RESOLUTION = 64;              // 256 / 4
export const GRID_CELL_COUNT = 4096;            // 64 * 64 (Fits in 16KB L1 cache)
export const GRID_OFFSET = 128;                 // Centering offset (WORLD_CHUNK_SIZE / 2)
export const POOL_ENEMY_MAX = 120;              // Current contiguous enemy pool limit

// PHASE 9: ENTITY STATE MASKING
export const ENTITY_STATUS = {
    NONE: 0,
    ALIVE: 1 << 0,
    DEAD: 1 << 1
} as const;

// Player constants
export const PLAYER_DEATH_TIMER = 3000;         // ms
export const HEALTH_CRITICAL_THRESHOLD = 0.2;   // 20% HP
export const PLAYER_BASE_SPEED = 20.0;          // km/h, km/tim, kph
export const KMH_TO_MS = 1.0 / 3.6;             // km/h to m/s

export const CAMERA_HEIGHT = 50;

// WindSystem
export const WIND_SYSTEM = {
    MIN_STRENGTH: 0.02,
    MAX_STRENGTH: 0.05,
    DIRECTION: { x: 0, z: 1 },
    ANGLE_VARIANCE: Math.PI / 4,
};

// WeatherSystem
export const WEATHER_SYSTEM = {
    MAX_NUM_PARTICLES: 5000,
    DEFAULT_NUM_PARTICLES: 400
}

// WaterSystem
export const WATER_SYSTEM = {
    MAX_RIPPLES: 16,
    MAX_FLOATING_OBJECTS: 8
}

// LightSystem
export const LIGHT_SYSTEM = {
    MAX_VISIBLE_LIGHTS: 16,
    MAX_SHADOW_CASTING_LIGHTS: 2,
    SKY_LIGHT: 'SKY_LIGHT',
    AMBIENT_LIGHT: 'AMBIENT_LIGHT'
};

export const LIGHT_SETTINGS = {
    MAX_PROXIES: 6,
    SHADOW_BUDGET: 3,
    DEFAULT_DISTANCE: 10,
    SHADOW_MAP_SIZE: 256,
    SHADOW_BIAS: -0.005,
    SHADOW_RADIUS: 2,
    DEFAULT_COLOR: 0x000000,
};

// Flashlight
export const FLASHLIGHT = {
    name: 'FLASHLIGHT',
    color: 0xffffee,
    intensity: 150.0,
    distance: 60,
    angle: Math.PI / 3,
    penumbra: 0.6,
    decay: 1.0,
    position: { x: 0, y: 3.5, z: 0.5 },
    targetPosition: { x: 0, y: 0, z: 10 },
    castShadows: true,
    cameraNear: 1,
    cameraFar: 40,
    shadowBias: -0.0001,
    shadowMapSize: 512
};

export type ShadowQuality = 'OFF' | 'LOW' | 'MEDIUM' | 'HIGH' | 'VERYHIGH';

export const SHADOW_PRESETS: Record<ShadowQuality, { shadows: boolean; shadowMapType: THREE.ShadowMapType; shadowResolution: number; weatherCount: number }> = {
    OFF: { shadows: false, shadowMapType: 0, shadowResolution: 256, weatherCount: 150 },
    LOW: { shadows: true, shadowMapType: 0, shadowResolution: 512, weatherCount: 250 },      // BasicShadowMap
    MEDIUM: { shadows: true, shadowMapType: 1, shadowResolution: 1024, weatherCount: 400 },   // PCFShadowMap
    HIGH: { shadows: true, shadowMapType: 2, shadowResolution: 2048, weatherCount: 800 },     // PCFSoftShadowMap
    VERYHIGH: { shadows: true, shadowMapType: 3, shadowResolution: 4096, weatherCount: 1600 }  // VSMShadowMap
};

export const DEFAULT_SETTINGS: GameSettings = {
    pixelRatio: 0.75,
    antialias: false,
    shadows: true,
    shadowMapType: 1,
    shadowResolution: 256,
    weatherCount: WEATHER_SYSTEM.DEFAULT_NUM_PARTICLES,
    textureQuality: 1.0,
    volumetricFog: true,
    showDiscoveryPopups: true
};

export const SCRAP_COST_BASE = 50;
export const LEVEL_CAP = 20;
export const MASSIVE_DAMAGE_THRESHOLD = 60;
export const INITIAL_ENEMY_POOL = 100;

export const INITIAL_STATS: PlayerStats = {
    statsBuffer: (function () {
        const b = new Float32Array(PlayerStatID.COUNT);
        b[PlayerStatID.HP] = 100;
        b[PlayerStatID.MAX_HP] = 100;
        b[PlayerStatID.STAMINA] = 100;
        b[PlayerStatID.MAX_STAMINA] = 100;
        b[PlayerStatID.XP] = 0;
        b[PlayerStatID.LEVEL] = 1;
        b[PlayerStatID.CURRENT_XP] = 0;
        b[PlayerStatID.NEXT_LEVEL_XP] = 1500;
        b[PlayerStatID.SKILL_POINTS] = 0;
        b[PlayerStatID.SCRAP] = 0;
        b[PlayerStatID.SPEED] = PLAYER_BASE_SPEED;

        // --- TOTALS (11-15: SCRAP, DAMAGE_DEALT, DAMAGE_TAKEN, DISTANCE, KILLS) ---
        b[PlayerStatID.TOTAL_SCRAP_COLLECTED] = 0;
        b[PlayerStatID.TOTAL_DAMAGE_DEALT] = 0;
        b[PlayerStatID.TOTAL_DAMAGE_TAKEN] = 0;
        b[PlayerStatID.TOTAL_DISTANCE_TRAVELED] = 0;
        b[PlayerStatID.TOTAL_KILLS] = 0;

        b[PlayerStatID.SCORE] = 0;

        // --- MULTIPLIERS (17+) ---
        b[PlayerStatID.MULTIPLIER_SPEED] = 1.0;
        b[PlayerStatID.MULTIPLIER_RELOAD] = 1.0;
        b[PlayerStatID.MULTIPLIER_FIRERATE] = 1.0;
        b[PlayerStatID.MULTIPLIER_DMG_RESIST] = 1.0;
        b[PlayerStatID.MULTIPLIER_RANGE] = 1.0;

        // --- BAKE FINAL PRE-CALCULATED STATS (Zero-GC) ---
        b[PlayerStatID.FINAL_SPEED] = b[PlayerStatID.SPEED] * b[PlayerStatID.MULTIPLIER_SPEED] * KMH_TO_MS;

        return b;
    })(),
    effectDurations: new Float32Array(32),
    effectMaxDurations: new Float32Array(32),
    effectIntensities: new Float32Array(32),

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

    statusFlags: 0,
    statusMask: 0,
    activePassives: [],
    activeBuffs: [],
    activeDebuffs: [],

    sectorsCompleted: 0,
    totalSkillPointsEarned: 0,

    collectiblesDiscovered: [],
    viewedCollectibles: [],
    cluesFound: [],
    discoveredPOIs: [],
    seenEnemies: [],
    seenBosses: [],
    deadBossIndices: [],
    discoveredPerksMap: new Uint8Array(256),

    prologueSeen: false,
    rescuedFamilyIndices: [],
    familyFoundCount: 0,
    mostUsedWeapon: DamageID.NONE,
    challengeTiers: new Int32Array(32),
    totalEnemiesKilled: 0,
    totalChallengePoints: 0,
    trackedChallengeIds: [],

    // --- CACHED ENTITY STATE (Phase 13) ---
    velocity: new THREE.Vector3(),
    nodes: { gun: null, barrelTip: null, laserSight: null },
    baseScale: 1.0,
    baseY: 0,
};

export enum FamilyMemberID {
    LOKE = 0,
    JORDAN = 1,
    ESMERALDA = 2,
    NATHALIE = 3,
    SOTIS = 4,
    PANTER = 5,
    ROBERT = 100,
    UNKNOWN = 200,
    RADIO = 201
}

export const PLAYER_CHARACTER = {
    id: FamilyMemberID.ROBERT,
    name: 'Robert',
    race: 'human',
    gender: 'male',
    title: 'family.dad',
    color: { num: 0x3b82f6, str: '#3b82f6' } as const,
    scale: 1.0
};

/**
 * Maps speaker strings (from scripts/legacy systems) to SMI Enums.
 */
export const SPEAKER_NAME_MAP: Record<string, FamilyMemberID> = {
    'Robert': FamilyMemberID.ROBERT,
    'Player': FamilyMemberID.ROBERT,
    'Loke': FamilyMemberID.LOKE,
    'Jordan': FamilyMemberID.JORDAN,
    'Esmeralda': FamilyMemberID.ESMERALDA,
    'Nathalie': FamilyMemberID.NATHALIE,
    'Sotis': FamilyMemberID.SOTIS,
    'Panter': FamilyMemberID.PANTER,
    'Unknown': FamilyMemberID.UNKNOWN,
    'Radio': FamilyMemberID.RADIO
};

/**
 * Maps SMI Enums to lowercase locale keys used in i18n files.
 */
export const SPEAKER_ID_TO_KEY: Record<FamilyMemberID, string> = {
    [FamilyMemberID.ROBERT]: 'robert',
    [FamilyMemberID.LOKE]: 'loke',
    [FamilyMemberID.JORDAN]: 'jordan',
    [FamilyMemberID.ESMERALDA]: 'esmeralda',
    [FamilyMemberID.NATHALIE]: 'nathalie',
    [FamilyMemberID.SOTIS]: 'sotis',
    [FamilyMemberID.PANTER]: 'panter',
    [FamilyMemberID.UNKNOWN]: 'unknown',
    [FamilyMemberID.RADIO]: 'radio'
};

export const FAMILY_MEMBERS = [
    { id: FamilyMemberID.LOKE, name: 'family.loke', race: 'human', gender: 'male', title: 'family.son', color: { num: 0xfacc15, str: '#facc15' } as const, scale: 0.7 },
    { id: FamilyMemberID.JORDAN, name: 'family.jordan', race: 'human', gender: 'male', title: 'family.son', color: { num: 0x4ade80, str: '#4ade80' } as const, scale: 0.5 },
    { id: FamilyMemberID.ESMERALDA, name: 'family.esmeralda', race: 'human', gender: 'female', title: 'family.daughter', color: { num: 0xe879f9, str: '#e879f9' } as const, scale: 0.8 },
    { id: FamilyMemberID.NATHALIE, name: 'family.nathalie', race: 'human', gender: 'female', title: 'family.wife', color: { num: 0xf43f5e, str: '#f43f5e' } as const, scale: 0.95 },
    { id: FamilyMemberID.SOTIS, name: 'family.sotis', race: 'animal', gender: 'female', title: 'family.cat', color: { num: 0xcccccc, str: '#cccccc' } as const, scale: 0.6 },
    { id: FamilyMemberID.PANTER, name: 'family.panter', race: 'animal', gender: 'male', title: 'family.cat', color: { num: 0x222222, str: '#222222' } as const, scale: 0.6 }
];
/**
 * Type-safe interface for voice parameters to enable Zero-GC audio synthesis.
 */
export interface VoiceParams {
    baseFreq: number;
    oscType: OscillatorType;
    pitchScale: number;
}

/**
 * Central voice profiles for all speakers.
 */
export const VOICE_PARAMS_MAP: Record<number, VoiceParams> = {
    [FamilyMemberID.ROBERT]: { baseFreq: 220, oscType: 'triangle', pitchScale: 1.0 },
    [FamilyMemberID.LOKE]: { baseFreq: 420, oscType: 'triangle', pitchScale: 1.42 },
    [FamilyMemberID.JORDAN]: { baseFreq: 500, oscType: 'triangle', pitchScale: 2.0 },
    [FamilyMemberID.ESMERALDA]: { baseFreq: 450, oscType: 'sine', pitchScale: 1.25 },
    [FamilyMemberID.NATHALIE]: { baseFreq: 380, oscType: 'sine', pitchScale: 1.05 },
    [FamilyMemberID.SOTIS]: { baseFreq: 700, oscType: 'sine', pitchScale: 1.66 },
    [FamilyMemberID.PANTER]: { baseFreq: 700, oscType: 'sine', pitchScale: 1.66 },
    [FamilyMemberID.UNKNOWN]: { baseFreq: 200, oscType: 'triangle', pitchScale: 1.0 },
    [FamilyMemberID.RADIO]: { baseFreq: 150, oscType: 'sawtooth', pitchScale: 1.0 },
};