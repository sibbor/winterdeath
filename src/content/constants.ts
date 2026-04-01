
import * as THREE from 'three';
import { PlayerStats } from '../entities/player/PlayerTypes';
import { GameSettings } from '../core/engine/EngineTypes';

// Re-export Data
export { ZOMBIE_TYPES } from './enemies/zombies';
export { BOSSES } from './enemies/bosses';
export { WEAPONS } from './weapons';

// 20% HP
export const HEALTH_CRITICAL_THRESHOLD = 0.2;
export const DEFAULT_SPEED = 25.0; // kph

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
    level: 1,
    xp: 0,
    currentXp: 0,
    nextLevelXp: 1500,
    hp: 100,
    maxHp: 100,
    stamina: 100,
    maxStamina: 100,
    speed: DEFAULT_SPEED, // kph
    skillPoints: 0,
    rescuedFamilyIds: [],
    discoveredPerks: [],
    kills: 0,
    scrap: 0,
    sectorsCompleted: 0,
    familyFoundCount: 0,
    totalSkillPointsEarned: 0,
    killsByType: {},
    totalScrapCollected: 0,
    totalBulletsFired: 0,
    totalBulletsHit: 0,
    totalThrowablesThrown: 0,
    totalDamageDealt: 0,
    totalDamageTaken: 0,
    totalDistanceTraveled: 0,
    cluesFound: [],
    seenEnemies: [],
    seenBosses: [],
    discoveredPOIs: [],
    deaths: 0,
    mostUsedWeapon: '',
    chestsOpened: 0,
    bigChestsOpened: 0,
    incomingDamageBreakdown: {},
    outgoingDamageBreakdown: {},
    collectiblesDiscovered: [],
    viewedCollectibles: [],
    deathsByEnemyType: {}
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

/**
 * Standardized tree types for environment generation
 */
export enum TREE_TYPE {
    PINE = 'PINE',
    SPRUCE = 'SPRUCE',
    OAK = 'OAK',
    DEAD = 'DEAD',
    BIRCH = 'BIRCH'
}
