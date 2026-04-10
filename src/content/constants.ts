import * as THREE from 'three';
import { PlayerStats, PlayerStatID } from '../entities/player/PlayerTypes';
import { GameSettings } from '../core/engine/EngineTypes';

// Re-export Data
export { ZOMBIE_TYPES } from './enemies/zombies';
export { BOSSES } from './enemies/bosses';
export { WEAPONS } from './weapons';

// 20% HP
export const HEALTH_CRITICAL_THRESHOLD = 0.2;
export const PLAYER_BASE_SPEED = 15.0; // km/h, km/tim, kph
export const KMH_TO_MS = 1.0 / 3.6;

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
    statusFlags: 0,
    activePassives: [],
    activeBuffs: [],
    activeDebuffs: [],

    killsByType: {},
    deaths: 0,
    sectorsCompleted: 0,
    totalSkillPointsEarned: 0,
    totalBulletsFired: 0,
    totalBulletsHit: 0,
    totalThrowablesThrown: 0,
    chestsOpened: 0,
    bigChestsOpened: 0,

    collectiblesDiscovered: [],
    viewedCollectibles: [],
    cluesFound: [],
    discoveredPOIs: [],
    seenEnemies: [],
    seenBosses: [],
    discoveredPerks: [],

    prologueSeen: false,
    rescuedFamilyIds: [],
    familyFoundCount: 0,
    mostUsedWeapon: '',
    deathsByEnemyType: {},
    incomingDamageBreakdown: {},
    outgoingDamageBreakdown: {},
};

export const PLAYER_CHARACTER = {
    id: 'player',
    name: 'Robert',
    race: 'human',
    gender: 'male',
    title: 'family.dad',
    color: 0x3b82f6,
    scale: 1.0
};

export const FAMILY_MEMBERS = [
    { id: 0, name: 'Loke', race: 'human', gender: 'male', title: 'family.son', color: 0xfacc15, scale: 0.7 },
    { id: 1, name: 'Jordan', race: 'human', gender: 'male', title: 'family.son', color: 0x4ade80, scale: 0.5 },
    { id: 2, name: 'Esmeralda', race: 'human', gender: 'female', title: 'family.daughter', color: 0xe879f9, scale: 0.8 },
    { id: 3, name: 'Nathalie', race: 'human', gender: 'female', title: 'family.wife', color: 0xf43f5e, scale: 0.95 },
    { id: 4, name: 'Sotis', race: 'animal', gender: 'female', title: 'family.cat', color: 0xcccccc, scale: 0.6 },
    { id: 5, name: 'Panter', race: 'animal', gender: 'male', title: 'family.cat', color: 0x222222, scale: 0.6 }
];