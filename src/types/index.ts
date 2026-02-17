import { WeaponType } from '../content/weapons';

export enum GameScreen {
  CAMP = 'CAMP',
  BRIEFING = 'BRIEFING',
  SECTOR = 'SECTOR',
  BOSS_STORY = 'BOSS_STORY',
  BOSS_KILLED = 'BOSS_KILLED',
  RECAP = 'RECAP',
  DEATH = 'DEATH',
  PROLOGUE = 'PROLOGUE',
}

export type WeatherType = 'none' | 'snow' | 'rain' | 'ash' | 'ember';

export interface VehicleDef {
  type: 'BOAT' | 'CAR';
  speed: number;
  turnSpeed: number;
  acceleration: number;
  friction: number;
  mass: number;
  drag: number;
  seats: number;
  gearRatios?: number[];
  forward?: { x: number; y: number; z: number };
}

export interface PlayerStats {
  level: number;
  currentXp: number;
  nextLevelXp: number;
  maxHp: number;
  maxStamina: number;
  speed: number;
  skillPoints: number;
  rescuedFamilyIds: number[]; // IDs of family members currently in the party
  kills: number; // Total kills
  scrap: number; // Current balance

  // Detailed Stats
  sectorsCompleted: number;
  familyFoundCount: number;
  totalSkillPointsEarned: number;

  killsByType: Record<string, number>;
  totalScrapCollected: number;
  totalBulletsFired: number;
  totalBulletsHit: number; // New
  totalThrowablesThrown: number; // New
  totalDamageDealt: number;
  totalDamageTaken: number;
  totalDistanceTraveled: number; // New: In meters
  cluesFound: string[]; // List of collected clue names (IDs)
  collectiblesFound: string[]; // New: List of collected 3D items
  viewedCollectibles: string[]; // New: List of collectibles seen in Adventure Log
  seenEnemies: string[]; // New: List of enemy types seen
  seenBosses: string[]; // New: List of bosses seen
  visitedPOIs: string[]; // New: List of POI IDs visited
  deaths: number;
  mostUsedWeapon: string;
  chestsOpened: number;
  bigChestsOpened: number;
  prologueSeen?: boolean;
}

export interface SectorStats {
  timeElapsed: number;
  shotsFired: number;
  shotsHit: number;
  throwablesThrown: number;
  killsByType: Record<string, number>;
  totalScrapCollected?: number;
  scrapLooted: number;
  xpGained: number;
  familyFound: boolean;
  familyExtracted?: boolean;
  damageDealt: number;
  damageTaken: number;
  bossDamageDealt?: number;
  bossDamageTaken?: number;
  distanceTraveled: number;
  cluesFound: string[];
  collectiblesFound: string[];
  seenEnemies?: string[];
  seenBosses?: string[];
  visitedPOIs?: string[];
  isExtraction?: boolean;
  chestsOpened: number;
  bigChestsOpened: number;
  spEarned?: number;
  aborted?: boolean;
}

export interface GraphicsSettings {
  pixelRatio: number;
  antialias: boolean;
  shadows: boolean;
  shadowMapType: number;
  shadowResolution: number;
  weatherCount: number;
  textureQuality: number;
}

export interface GameState {
  screen: GameScreen;
  stats: PlayerStats;
  currentSector: number;
  loadout: {
    primary: WeaponType;
    secondary: WeaponType;
    throwable: WeaponType;
    special: WeaponType;
  };
  weaponLevels: Record<WeaponType, number>;
  sectorBriefing: string;
  debugMode: boolean;
  showFps: boolean;
  sectorStats?: SectorStats;
  rescuedFamilyIndices: number[];
  deadBossIndices: number[];
  graphics?: GraphicsSettings;
  weather: WeatherType;
  environmentOverrides?: Record<number, EnvironmentOverride>;
}

export interface Vector2 {
  x: number;
  y: number;
}

export type TriggerType = 'COLLECTIBLE' | 'THOUGHTS' | 'SPEECH' | 'POI' | 'EVENT';

// --- NEW ACTION SYSTEM ---
export type TriggerActionType =
  | 'SPAWN_ENEMY'
  | 'PLAY_SOUND'
  | 'UNLOCK_OBJECT'
  | 'GIVE_REWARD'
  | 'CAMERA_SHAKE'
  | 'SHOW_TEXT'
  | 'CAMERA_PAN'
  | 'START_WAVE'
  | 'START_CINEMATIC'
  | 'TRIGGER_FAMILY_FOLLOW'
  | 'OPEN_UI'; // New

export interface TriggerAction {
  type: TriggerActionType;
  payload?: any; // Flexible payload (e.g., { enemyType: 'TANK', count: 1 } or { soundId: 'scream' })
  delay?: number; // Delay in ms before execution
}

export interface SectorTrigger {
  id: string;
  position: { x: number, z: number };
  radius?: number;
  type: TriggerType;
  content: string; // Legacy: The text to display
  description?: string; // Narrative description for clues
  chainedContent?: string[]; // For sequential thoughts
  triggered: boolean;
  icon?: string; // For collectibles

  // New Properties for Event System
  actions?: TriggerAction[]; // List of actions to execute
  repeatInterval?: number; // If > 0, trigger resets after X ms (for recurring events/spawners)
  lastTriggerTime?: number; // Timestamp for repeat logic
  resetOnExit?: boolean; // If true, trigger resets when player leaves the zone

  // Box Shape Support
  size?: { width: number, depth: number }; // For rectangular triggers
  rotation?: number; // Y-rotation of the box
}

export interface NotificationState {
  visible: boolean;
  text: string;
  icon?: string;
  timestamp: number;
}

export interface ThoughtState {
  visible: boolean;
  text: string;
  timestamp: number;
}

export type MapItemType = 'POI' | 'BUILDING' | 'ROAD' | 'OBSTACLE' | 'CHEST' | 'TRIGGER' | 'FAMILY' | 'PLAYER' | 'BOSS' | 'ENEMY' | 'OTHER';

export interface MapItem {
  id: string;
  x: number;
  z: number;
  type: MapItemType;
  label?: string;
  icon?: string; // Emoji or SVG path
  color?: string;
  radius?: number; // Size on map
}

export interface CinematicLine {
  speaker: string;
  text: string;
  type?: string;
  trigger?: string;
  duration?: number;
}

export interface EnvironmentOverride {
  bgColor?: number;
  fogColor?: number;
  fogDensity?: number;
  ambientIntensity?: number;
  groundColor?: number;
  fov?: number;
  skyLightVisible?: boolean;
  skyLightColor?: number;
  skyLightIntensity?: number;
  skyLightPosition?: { x: number; y: number; z: number };
  windStrength?: number;
  windDirection?: number;
  windRandomized?: boolean;
  weather?: WeatherType;
  weatherDensity?: number;
}

export interface SectorState {
  [key: string]: any;
  envOverride?: EnvironmentOverride;
}

export interface Obstacle {
  x: number;
  z: number;
  radius: number;
  type?: string;
}

export interface GameCanvasProps {
  onOpenMap: () => void;
  stats: PlayerStats;
  loadout: { primary: WeaponType; secondary: WeaponType; throwable: WeaponType; special: WeaponType };
  weaponLevels: Record<WeaponType, number>;
  onDie: (stats: SectorStats, killer: string) => void;
  onUpdateHUD: (data: any) => void;
  currentSector: number;
  debugMode: boolean;
  onSectorEnded: (stats: SectorStats) => void;
  onPauseToggle: (paused: boolean) => void;
  triggerEndSector: boolean;
  isRunning: boolean;
  isPaused: boolean;
  onDialogueStateChange: (active: boolean) => void;
  onDeathStateChange?: (active: boolean) => void;
  onBossIntroStateChange?: (active: boolean) => void;
  onMapInit: (items: MapItem[]) => void;
  bossPermanentlyDefeated: boolean;
  familyAlreadyRescued?: boolean;
  rescuedFamilyIndices: number[]; // Added to support multiple followers
  onSectorLoaded: () => void;
  teleportTarget: { x: number, z: number, timestamp: number } | null;
  onCollectibleFound: (id: string) => void;
  onClueFound: (clue: SectorTrigger) => void;
  isCollectibleOpen: boolean;
  onCollectibleClose: () => void;
  onFPSUpdate?: (fps: number) => void;
  initialGraphics?: GraphicsSettings;
  weather?: WeatherType;
  onSpawnEnemies?: (enemies: any[]) => void;
  onUpdateLoadout?: (loadout: any, levels: any) => void;
  onEnvironmentOverrideChange?: (overrides: EnvironmentOverride, weather: WeatherType) => void;
  environmentOverrides?: Record<number, EnvironmentOverride>;
  onInteractionStateChange?: (isOpen: boolean) => void;
  isMobileDevice?: boolean;
}

export type DeathPhase = 'NONE' | 'ANIMATION' | 'MESSAGE' | 'CONTINUE';
