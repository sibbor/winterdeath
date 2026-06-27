import * as THREE from 'three';
import { GameSettings } from '../types/StateTypes';

// Re-export Data
export { ZOMBIE_TYPES } from './enemies/zombies';
export { BOSSES } from './enemies/bosses';
export { WEAPONS } from './weapons';

// Sector constants
export const OVERRIDE_DEFAULT_SECTOR = -1;       // Set to -1 to disable override

// SPATIAL CONFIG (DOD Optimized)
export const WORLD_CHUNK_SIZE = 256;             // 256m x 256m active simulation area
export const POOL_PARTICLE_MAX = 5000;          // Max hardware-accelerated particles
export const POOL_ENEMY_MAX = 120;              // Current contiguous enemy pool limit

// RENDERER POOL SIZES (Magic Number Eradication)
export const POOL_CORPSE_MAX = 2000;
export const POOL_ASH_MAX = 2000;
export const POOL_ASH_ANIM_MAX = 500;
export const POOL_PROJECTILE_MAX = 2000;
export const POOL_ZOMBIE_PER_TYPE_MAX = 500;

export const KMH_TO_MS = 1.0 / 3.6; // km/h to m/s
export const CAMERA_HEIGHT = 50;
export const SCRAP_COST_BASE = 50;
export const LEVEL_CAP = 20;
export const INITIAL_ENEMY_POOL = 100;

// ENTITY STATE MASKING
export const ENTITY_STATUS = {
    NONE: 0,
    ALIVE: 1 << 0,
    DEAD: 1 << 1
} as const;

// --- ENGINE HARDENING (Magic Number Eradication) ---
export enum TriggerShape { CIRCLE = 0, BOX = 1 }

export const PHYSICS = {
    GRAVITY: 30.0,
    TERMINAL_VELOCITY: 50.0,
    GROUND_HEIGHT_EPSILON: 0.1,
    SWIM_DEPTH_MAX: 1.25,
    SWIM_DEPTH_MID: 0.95,
    WADE_DEPTH: 0.4,
    SWIM_Y_OFFSET: 0.35,
    SOFT_SHOVE_RADIUS_SQ: 0.6,
    SOFT_SHOVE_FORCE: 1.2
};

// AI LOD
export const AI_LOD = {
    CORE_RADIUS_SQ: 5625,       // 75m (Matching Sector0 trigger distance)
    THROTTLED_RADIUS_SQ: 14400,  // 120m (Zombies are updated and visible up to spawn range)
    CULL_RADIUS_SQ: 40000,      // 200m (Zombies stay active until well behind the player)
    CULL_DOT_THRESHOLD: -2.0
};

export const COMBAT = {
    HYSTERESIS: 1.25,            // 25% range buffer
    CRISIS_HP_RATIO: 0.25,       // 25% HP adrenaline trigger
    LONG_RANGE_SQ: 625,          // 25m threshold
    FLAMETHROWER_CONE_COS: 0.94, // ~20 degrees
    LETHAL_DAMAGE: 9999,
    STAMINA_COST_DODGE: 15,
    STAMINA_REGEN_IDLE: 15,
    STAMINA_REGEN_DELAY: 2500,
    STAMINA_DRAIN_SWIM: 7,
    STAMINA_DRAIN_WADE: 3,
    HP_REGEN_IDLE: 3,
    HP_REGEN_DELAY: 5000,
    INVULNERABLE_TIME_HIT: 400,
    DODGE_DURATION: 300,
    RUSH_IMPACT_DAMAGE: 10,
    DODGE_IMPACT_DAMAGE: 5,
    KILL_STREAK_WINDOW_SHORT: 3000,
    KILL_STREAK_WINDOW_LONG: 5000
};

export const MAX_ENTITIES = {
    PERKS: 128,
    FIRE_ZONES: 16,
    BUCKET_CAPACITY: 16,
    MAX_BOSS_IDS: 32,
    STREAK_BUFFER_SIZE: 5,
    CHALLENGES: 64,
    DISCOVERY_MAP_SIZE: 16384,
    TRIGGERS: 256,
    SCRAP: 300,
    FOOTPRINTS: 100,
    DECALS: 250,
    PARTICLE_REQUESTS: 5000,
    PARTICLE_STATES: 10000,
    SPAWN_QUEUE: 512
};

export const FX = {
    NUM_PARTICLE_TYPES: 64,
    MAX_INSTANCES_PER_MESH: 10000,
    MAX_AMBIENT_SPAWNS_PER_FRAME: 500,
    AMBIENT_QUEUE_HARD_CAP: 2000,
    FADE_DURATION: 15000,
    GRAVITY: 150.0
};

export const LOOT = {
    MAGNET_RANGE_SQ: 100.0,
    COLLECTION_RANGE_SQ: 0.8,
    MAGNET_SPEED: 25.0,
    MAGNETISM_DELAY: 500,
    GRAVITY: 35.0,
    GROUND_Y: 0.3
};

export const PLAYER = {
    BASE_HP: 100,
    BASE_STAMINA: 100,
    BASE_SPEED: 20.0, // km/h
    BASE_BODY_MASS: 1.0,
    BASE_BODY_WEIGHT: 75.0, // kg
    DEATH_TIMER: 3000, // ms
    DEATH_VELOCITY_NORMAL: 12,
    DEATH_VELOCITY_RUSH: 15,
    DEATH_UPWARD_VELOCITY: 4,
    INVULNERABILITY_PULSE_SPEED: 0.005,
    DISORIENTED_NOISE_SCALE: 0.01,
    DISORIENTED_DRIFT_MAGNITUDE: 0.5,
    DODGE_PRESS_THRESHOLD: 200,
    RUSH_HOLD_THRESHOLD: 250,
    RUSH_RAMP_SPEED: 0.5 // 2 seconds (1.0 / 0.5)
};

export const HEALTH_CRITICAL_THRESHOLD = 0.2; // 20% HP

// WindSystem
export const WIND_SYSTEM = {
    MIN_STRENGTH: 0.04,
    MAX_STRENGTH: 0.12,
    DIRECTION: { x: 0, z: 1 },
    ANGLE_VARIANCE: Math.PI / 4,
};

// WeatherSystem
export const WEATHER_SYSTEM = {
    MAX_NUM_PARTICLES: 5000,
    DEFAULT_NUM_PARTICLES: 400
};

// WaterSystem
export const WATER_SYSTEM = {
    MAX_RIPPLES: 16,
    MAX_FLOATING_OBJECTS: 8
};

// SkySystem
export const SKY_SYSTEM = {
    STAR_COUNT_MAX: 2000,
    SKY_LIGHT: 'SKY_LIGHT',
    HEMI_LIGHT: 'HEMI_LIGHT'
};

// LightSystem
export const LIGHT_SYSTEM = {
    MAX_VISIBLE_LIGHTS: 16,
    MAX_SHADOW_CASTING_LIGHTS: 2,
    DEFAULT_DISTANCE: 10,
    DEFAULT_COLOR: 0x000000
};

export const LIGHT_SETTINGS = {
    MAX_PROXIES: 6,
    SHADOW_BUDGET: 3,
    SHADOW_MAP_SIZE: 256,
    SHADOW_BIAS: -0.005,
    SHADOW_RADIUS: 2,
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

export type ShadowQuality = 'OFF' | 'LOW' | 'MEDIUM' | 'HIGH';

export const SHADOW_PRESETS: Record<ShadowQuality, { shadows: boolean; shadowMapType: THREE.ShadowMapType; shadowResolution: number; }> = {
    OFF: { shadows: false, shadowMapType: 0, shadowResolution: 256 },
    LOW: { shadows: true, shadowMapType: 0, shadowResolution: 512 },      // BasicShadowMap
    MEDIUM: { shadows: true, shadowMapType: 1, shadowResolution: 1024 },   // PCFShadowMap
    HIGH: { shadows: true, shadowMapType: 2, shadowResolution: 2048 },     // PCFSoftShadowMap
};

export const SETTINGS_DEFAULT: GameSettings = {
    pixelRatio: 0.75,
    antialias: false,
    shadows: true,
    shadowMapType: 1,
    shadowResolution: 256,
    textureQuality: 1.0,
    volumetricFog: true,
    showDiscoveryPopups: true,
    showChallengePopups: true,
    showFps: false,
    debugMode: false,
    hudEffectsQuality: true
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
    scale: 1.0,
    bodyMass: 1.0,
    bodyWeight: 75.0
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
    { id: FamilyMemberID.LOKE, name: 'Loke', race: 'human', gender: 'male', title: 'family.son', color: { num: 0xfacc15, str: '#facc15' } as const, scale: 0.7, bodyMass: 0.7, bodyWeight: 50.0 },
    { id: FamilyMemberID.JORDAN, name: 'Jordan', race: 'human', gender: 'male', title: 'family.son', color: { num: 0x4ade80, str: '#4ade80' } as const, scale: 0.5, bodyMass: 0.5, bodyWeight: 18.0 },
    { id: FamilyMemberID.ESMERALDA, name: 'Esmeralda', race: 'human', gender: 'female', title: 'family.daughter', color: { num: 0xe879f9, str: '#e879f9' } as const, scale: 0.8, bodyMass: 0.8, bodyWeight: 50.0 },
    { id: FamilyMemberID.NATHALIE, name: 'Nathalie', race: 'human', gender: 'female', title: 'family.wife', color: { num: 0xf43f5e, str: '#f43f5e' } as const, scale: 0.95, bodyMass: 0.95, bodyWeight: 69.0 },
    { id: FamilyMemberID.SOTIS, name: 'Sotis', race: 'animal', gender: 'female', title: 'family.cat', color: { num: 0xcccccc, str: '#cccccc' } as const, scale: 0.6, bodyMass: 0.2, bodyWeight: 4.0 },
    { id: FamilyMemberID.PANTER, name: 'Panter', race: 'animal', gender: 'male', title: 'family.cat', color: { num: 0x222222, str: '#222222' } as const, scale: 0.6, bodyMass: 0.2, bodyWeight: 4.0 }
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
