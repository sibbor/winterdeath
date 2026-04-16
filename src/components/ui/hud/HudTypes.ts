import { WeaponType } from '../../../content/weapons';
import { SectorState, GameScreen } from '../../../game/session/SessionTypes';
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

export type MapItemType = 'POI' | 'BUILDING' | 'ROAD' | 'OBSTACLE' | 'CHEST' | 'TRIGGER' | 'FAMILY' | 'PLAYER' | 'BOSS' | 'ENEMY' | 'OTHER' | 'LAKE' | 'FOREST' | 'WHEAT' | 'MOUNTAIN';

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
  PERK = 5
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
  hordeTarget: number;
  zombiesKilled: number;
  zombiesKillTarget: number;
  zombieWaveActive: boolean;
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
  skillPoints: number;
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
}