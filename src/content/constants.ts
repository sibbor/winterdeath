
import * as THREE from 'three';
import { PlayerStats } from '../entities/player/PlayerTypes';
import { GraphicsSettings } from '../core/engine/EngineTypes';

// Re-export Data
export { ZOMBIE_TYPES } from './enemies/zombies';
export { BOSSES } from './enemies/bosses';
export { WEAPONS } from './weapons';
export { SECTOR_THEMES } from './sectors/sector_themes';

// 20% HP
export const HEALTH_CRITICAL_THRESHOLD = 0.2;

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
    MAX_SHADOW_CASTING_LIGHTS: 12,
    SKY_LIGHT: 'SKY_LIGHT',
    AMBIENT_LIGHT: 'AMBIENT_LIGHT'
};

// Flashlight
export const FLASHLIGHT = {
    name: 'FLASHLIGHT',
    color: 0xffffee,
    intensity: 250.0,
    distance: 60,
    angle: Math.PI / 3,
    penumbra: 0.6,
    decay: 1.0,
    position: { x: 0, y: 3.5, z: 0.5 },
    targetPosition: { x: 0, y: 0, z: 10 },
    castShadows: true,
    cameraNear: 1,
    cameraFar: 40,
    shadowBias: -0.0001
};

export type ShadowQuality = 'OFF' | 'LOW' | 'MEDIUM' | 'HIGH' | 'VERYHIGH';

export const SHADOW_PRESETS: Record<ShadowQuality, { shadows: boolean; shadowMapType: THREE.ShadowMapType; shadowResolution: number; weatherCount: number }> = {
    OFF: { shadows: false, shadowMapType: 0, shadowResolution: 256, weatherCount: 150 },
    LOW: { shadows: true, shadowMapType: 0, shadowResolution: 512, weatherCount: 250 },      // BasicShadowMap
    MEDIUM: { shadows: true, shadowMapType: 1, shadowResolution: 1024, weatherCount: 400 },   // PCFShadowMap
    HIGH: { shadows: true, shadowMapType: 2, shadowResolution: 2048, weatherCount: 800 },     // PCFSoftShadowMap
    VERYHIGH: { shadows: true, shadowMapType: 3, shadowResolution: 4096, weatherCount: 1600 }  // VSMShadowMap
};

export const DEFAULT_GRAPHICS: GraphicsSettings = {
    pixelRatio: 0.75,
    antialias: false,
    shadows: true,
    bloom: true,
    shadowMapType: 1,
    shadowResolution: 256,
    weatherCount: WEATHER_SYSTEM.DEFAULT_NUM_PARTICLES,
    textureQuality: 1.0
};

export const SCRAP_COST_BASE = 50;
export const LEVEL_CAP = 20;

export const INITIAL_STATS: PlayerStats = {
    level: 1,
    xp: 0,
    currentXp: 0,
    nextLevelXp: 1500,
    maxHp: 100,
    maxStamina: 100,
    speed: 1.0,
    skillPoints: 0,
    rescuedFamilyIds: [],
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
    viewedCollectibles: []
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

export const RANKS: Record<number, string> = {
    0: "Fresh Meat", 1: "Noobie", 2: "Rookie", 3: "Scavenger", 4: "Survivor",
    5: "Rat Catcher", 6: "Walker Stalker", 7: "Bone Breaker", 8: "Gutsy", 9: "Bloody Mess",
    10: "Wasteland Warrior", 11: "Horde Hunter", 12: "Skull Crusher", 13: "Executioner", 14: "Grim Reaper",
    15: "Warlord", 16: "Apex Predator", 17: "Legend", 18: "Immortal", 19: "Mega Zombie Slayer"
};

export const CHATTER_LINES: Record<string, string[]> = {
    Robert: ["We need to reinforce the perimeter.", "I hope the supplies last.", "Everyone doing okay?", "Check your gear, always.", "We'll get through this.", "Keep the fire going.", "Stay sharp.", "I won't let anything happen to you."],
    Loke: ["Did you hear that noise?", "This fire is nice.", "I miss my video games.", "Dad, you think they are gone?", "It's really dark out there.", "I'm not scared... mostly."],
    Jordan: ["PAPPA", "MAMMA", "LOKE", "ESME", "ELD", "KATT", "ZOMB"],
    Esmeralda: ["The radio signal is weak.", "We should fix the generator.", "Dad, you look tired.", "I wish we could go home.", "Are we safe here?", "I hate this cold.", "Do you have any food?"],
    Nathalie: ["We are together, that's what matters.", "Hush now, try to sleep.", "I'll take the next watch.", "Robert, be careful out there.", "My brave family.", "Keep close to the warmth.", "I love you all."]
};


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
