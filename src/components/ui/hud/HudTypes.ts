import { InteractionType, InteractionPromptId, MetaActionId } from '../../../systems/ui/UIEventBridge';
import { StatusEffectID } from '../../../content/perks';
import { HoldableID } from '../../../entities/player/CombatTypes';

export const MAX_STATUS_EFFECTS = 16;
export const MAX_PASSIVES = 16;
export const MAX_BUFFS = 16;
export const MAX_DEBUFFS = 16;
export const MAX_MAP_ITEMS = 128;

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
  type: StatusEffectID;
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

export enum DiscoveryType {
  CLUE = 0,
  POI = 1,
  COLLECTIBLE = 2,
  ZOMBIE = 3,
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

/**
 * HUD STATE (SMI-Hardened & Zero-GC)
 */
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
  activeWeapon: HoldableID;
  isReloading: boolean;

  // Complex state slices (FLATTENED for Zero-GC)
  bossActive: boolean;
  bossName: string;
  bossHp: number;
  bossMaxHp: number;

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

  // Sector Stats (FLATTENED)
  unlimitedAmmo: boolean;
  unlimitedThrowables: boolean;
  isInvincible: boolean;
  waveActive: boolean;
  waveKills: number;
  waveTarget: number;
  currentWave: number;
  totalWaves: number;

  // Real-time telemetry (Synced from persistent stats + session)
  enemyKills: Float64Array;
  seenEnemies: number[];
  seenBosses: number[];

  // Status & Buffs (SoA Pattern)
  StatusEffectIDs: Int32Array;
  statusEffectDurations: Float32Array;
  statusEffectMaxDurations: Float32Array;
  statusEffectIntensities: Float32Array;
  statusEffectProgress: Float32Array;
  statusEffectsCount: number;

  isDisoriented: boolean;
  activePassives: Int32Array;
  activePassivesCount: number;
  activeBuffs: Int32Array;
  activeBuffsCount: number;
  activeDebuffs: Int32Array;
  activeDebuffsCount: number;

  // Death details
  killerName: string;
  killerAttackName: string;
  killedByEnemy: boolean;
  lethalSourceId: number;      // Specific ID (EnemyType or Boss ID)
  lethalStatusEffect: number;  // StatusEffectID that caused the final tick (if any)

  // Exploration & Environment
  mapItems: MapItem[];
  mapItemsCount: number;
  debugMode: boolean;
  debugInfo: DebugInfoData;
  systems: any[]; // Consider typing if you pass specific System data to UI

  // Cinematics & Interactions (FLATTENED)
  dialogueActive: boolean;
  dialogueText: string;
  dialogueSpeaker: string;
  cinematicActive: boolean;

  interactionActive: boolean;
  interactionType: InteractionType;
  interactionLabel: string;
  interactionTargetId: string;
  interactionX: number;
  interactionY: number;
  interactionId: InteractionPromptId;

  hudVisible: boolean;
  sectorName: string;
  isMobileDevice: boolean;

  discoveryActive: boolean;
  discoveryId: string;
  discoveryType: DiscoveryType;
  discoveryTitle: string;
  discoveryDetails: string;
  discoveryTimestamp: number;

  challengeTiers: Int32Array;
  lastMetaSignal: MetaActionId;
  metaSignalTimestamp: number;

  hasCriticalHp: boolean;
}
