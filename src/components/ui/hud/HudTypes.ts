import { WeaponType } from '../../../content/weapons';
import { InteractionType } from '../../../systems/InteractionTypes';
import { StatusEffectType } from '../../../content/perks';

// ============================================================================
// HUD & ZERO-GC TYPES
// ============================================================================
// To maintain V8 Hidden Class optimization (Shapes) during Double-Buffering,
// DO NOT use optional properties ('?') in the main HudState. 
// Every property must be explicitly defined. Use `| null` instead of `?` 
// if a value can be empty.
// ============================================================================

export interface HudVector2 {
  x: number;
  z: number;
}

export interface HudBossInfo {
  active: boolean;
  name: string;
  hp: number;
  maxHp: number;
}

export enum MapItemType {
  POI = 0,
  BUILDING = 1,
  ROAD = 2,
  OBSTACLE = 3,
  CHEST = 4,
  TRIGGER = 5,
  FAMILY = 6,
  PLAYER = 7,
  BOSS = 8,
  ENEMY = 9,
  OTHER = 10,
  LAKE = 11,
  FOREST = 12,
  WHEAT = 13,
  MOUNTAIN = 14,
  ZOMBIE_WAVE = 15
}

export interface MapItem {
  id: string;
  x: number;
  z: number;
  type: MapItemType;
  label: string | null;
  icon: string | null; // Emoji or SVG path
  color: string | null;
  radius: number | null; // Size on map
  points?: HudVector2[] | null; // For polygons (forests, fields, lakes)
}

export interface StatusEffectData {
  type: StatusEffectType;
  duration: number;
  maxDuration: number;
  intensity: number;
  progress: number;
}

export interface DebugInfoData {
  aim: { x: number; y: number };
  input: { w: number; a: number; s: number; d: number; fire: number; reload: number };
  cam: { x: number; y: number; z: number };
  camera: { x: number; y: number; z: number; rotX: number; rotY: number; rotZ: number; fov: number };
  modes: string;
  enemies: number;
  objects: number;
  drawCalls: number;
  coords: { x: number; z: number };
  performance: {
    cpu: Record<string, number> | null;
    memory: { heapLimit: number; heapTotal: number; heapUsed: number };
    renderer: any | null;
  };
}

export interface InteractionPromptData {
  active: boolean;
  type: InteractionType;
  label: string;
  targetId: string;
  x: number;
  y: number;
}


export interface DialogueLineData {
  active: boolean;
  text: string;
  speaker: string;
}

export enum DiscoveryType {
  CLUE = 0,
  POI = 1,
  COLLECTIBLE = 2,
  ENEMY = 3,
  BOSS = 4,
  PERK = 5,
  CHALLENGE = 6
}

export enum OverlayType {
  NONE = 0,
  PAUSE = 1,
  SETTINGS = 2,
  MAP = 3,
  TELEPORT = 4,
  COLLECTIBLE = 5,
  DIALOGUE = 6,
  ADVENTURE_LOG = 7,
  SECTOR_REPORT = 8,
  DEATH = 9,
  STATION_ARMORY = 10,
  STATION_SKILLS = 11,
  STATION_SPAWNER = 12,
  STATION_ENVIRONMENT = 13,
  STATION_SECTORS = 14,
  STATION_STATISTICS = 15,
  INTRO = 16,
  RESET_CONFIRM = 17
}

export interface DiscoveryEvent {
  active: boolean;
  id: string;
  type: DiscoveryType;
  title: string;
  details: string;
  timestamp: number;
}

export interface SectorStatsData {
  unlimitedAmmo: boolean;
  unlimitedThrowables: boolean;
  isInvincible: boolean;
  waveActive: boolean;
  waveKills: number;
  waveTarget: number;
  currentWave: number;
  totalWaves: number;
}

export interface HudState {
  // --- DOD BUFFERS (Zero-GC / O(1)) ---
  statsBuffer: Float32Array;
  vectorBuffer: Float32Array; // SMI-indexed (x, z) pairs for entities
  statusFlags: number;

  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  ammo: number;
  magSize: number;
  score: number;
  scrap: number;
  challengePoints: number;
  multiplier: number;
  activeWeapon: WeaponType;
  isReloading: boolean;

  // Complex state slices
  boss: HudBossInfo;
  bossSpawned: boolean;
  bossDefeated: boolean;
  familyFound: boolean;
  familySignal: number;

  level: number;
  currentXp: number;
  nextLevelXp: number;
  throwableAmmo: number;
  reloadProgress: number;

  // Positioning
  playerPos: HudVector2;
  familyPos: HudVector2 | null;
  bossPos: HudVector2 | null;
  distanceTraveled: number;

  // Statistics & Run info
  kills: number;
  spEarned: number;
  isDead: boolean;
  isDriving: boolean;
  vehicleSpeed: number;
  throttleState: number;
  currentSector: number;
  cluesFoundCount: number;
  poisFoundCount: number;
  collectiblesFoundCount: number;
  fps: number;
  sectorStats: SectorStatsData;

  // Real-time telemetry (Synced from persistent stats + session)
  enemyKills: Float64Array;
  seenEnemies: number[];
  seenBosses: number[];

  // Status & Buffs
  statusEffects: StatusEffectData[];
  isDisoriented: boolean;
  activePassives: StatusEffectType[];
  activeBuffs: StatusEffectType[];
  activeDebuffs: StatusEffectType[];

  // Death details
  killerName: string;
  killerAttackName: string;
  killedByEnemy: boolean;
  lethalSourceId: number;      // Specific ID (EnemyType or Boss ID)
  lethalStatusEffect: number;  // StatusEffectType that caused the final tick (if any)

  // Exploration & Environment
  mapItems: MapItem[];
  debugMode: boolean;
  debugInfo: DebugInfoData;
  systems: any[]; // Consider typing if you pass specific System data to UI

  // Cinematics & Interactions
  currentLine: DialogueLineData;
  cinematicActive: boolean;
  interactionPrompt: InteractionPromptData;
  hudVisible: boolean;
  sectorName: string;
  isMobileDevice: boolean;
  discovery: DiscoveryEvent;
  challengeTiers: Int32Array;
}