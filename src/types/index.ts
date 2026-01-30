
export enum GameScreen {
  CAMP = 'CAMP',
  BRIEFING = 'BRIEFING',
  MISSION = 'MISSION',
  BOSS_STORY = 'BOSS_STORY',
  BOSS_KILLED = 'BOSS_KILLED',
  RECAP = 'RECAP',
  DEATH = 'DEATH'
}

export enum WeaponCategory {
  PRIMARY = 'PRIMARY',
  SECONDARY = 'SECONDARY',
  THROWABLE = 'THROWABLE',
  SPECIAL = 'SPECIAL',
  TOOL = 'TOOL'
}

export enum WeaponType {
  // Primary
  SMG = 'SMG',
  SHOTGUN = 'Shotgun',
  RIFLE = 'Assault Rifle',
  // Secondary
  PISTOL = 'Pistol',
  REVOLVER = 'Revolver',
  // Throwable
  GRENADE = 'Grenade',
  MOLOTOV = 'Molotov',
  FLASHBANG = 'Flashbang',
  // Special
  MINIGUN = 'Minigun',
  // Tool
  RADIO = 'Radio'
}

export type WeatherType = 'none' | 'snow' | 'rain' | 'ash' | 'embers';

export interface WeaponStats {
  name: WeaponType;
  displayName: string;
  category: WeaponCategory;
  damage: number;
  fireRate: number; // ms between shots
  magSize: number;
  reloadTime: number; // ms
  range: number;
  spread: number;
  color: string;
  baseDamage: number;
  icon: string; // SVG path data or full SVG string
}

export interface PlayerStats {
  level: number;
  currentXp: number;
  nextLevelXp: number;
  maxHp: number;
  maxStamina: number;
  speed: number;
  skillPoints: number;
  kills: number; // Total kills
  scrap: number; // Current balance

  // Detailed Stats
  missionsCompleted: number;
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
  cluesFound: string[]; // New: List of collected clue names
  deaths: number;
  mostUsedWeapon: string;
  chestsOpened: number;
  bigChestsOpened: number;
}

export interface MissionStats {
  timeElapsed: number;
  shotsFired: number;
  shotsHit: number; // New
  throwablesThrown: number; // New
  killsByType: Record<string, number>;
  scrapLooted: number;
  xpGained: number;
  bonusXp: number;
  familyFound: boolean;
  familyExtracted?: boolean; // New: If true, family is saved even on death
  damageDealt: number;
  damageTaken: number;
  bossDamageDealt?: number; // New
  bossDamageTaken?: number; // New
  distanceTraveled: number; // New
  cluesFound: string[]; // New
  isExtraction?: boolean;
  chestsOpened: number;
  bigChestsOpened: number;
  spEarned?: number;
  aborted?: boolean;
}

export interface GameState {
  screen: GameScreen;
  stats: PlayerStats;
  currentMap: number;
  loadout: {
    primary: WeaponType;
    secondary: WeaponType;
    throwable: WeaponType;
  };
  weaponLevels: Record<WeaponType, number>;
  missionBriefing: string;
  debugMode: boolean;
  showFps: boolean; // New
  missionStats?: MissionStats;
  familyMembersFound: number[]; // Array of Map IDs where family was found
  bossesDefeated: number[]; // Array of Map IDs where boss was defeated
  midRunCheckpoint?: {
    mapIndex: number;
    timestamp: number;
  } | null;
  familySPAwarded: number[]; // Maps where family SP has been claimed
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
  | 'START_CINEMATIC'; // New

export interface TriggerAction {
  type: TriggerActionType;
  payload?: any; // Flexible payload (e.g., { enemyType: 'TANK', count: 1 } or { soundId: 'scream' })
  delay?: number; // Delay in ms before execution
}

export interface SectorTrigger {
  id: string;
  position: { x: number, z: number };
  radius: number;
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

export type MapItemType = 'POI' | 'BUILDING' | 'ROAD' | 'OBSTACLE' | 'CHEST' | 'TRIGGER' | 'FAMILY' | 'PLAYER' | 'BOSS' | 'OTHER';

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

export interface SectorState {
  [key: string]: any;
}

export interface Obstacle {
  x: number;
  z: number;
  radius: number;
  type?: string;
}

export interface GameCanvasProps {
  stats: PlayerStats;
  loadout: { primary: WeaponType; secondary: WeaponType; throwable: WeaponType };
  weaponLevels: Record<WeaponType, number>;
  onDie: (stats: MissionStats, killer: string) => void;
  onUpdateHUD: (data: any) => void;
  currentMap: number;
  debugMode: boolean;
  onMissionEnded: (stats: MissionStats) => void;
  onPauseToggle: (paused: boolean) => void;
  triggerEndMission: boolean;
  isRunning: boolean;
  isPaused: boolean;
  disableInput: boolean;
  familyAlreadyRescued: boolean;
  bossPermanentlyDefeated: boolean;
  onLevelLoaded: () => void;
  startAtCheckpoint: boolean;
  onCheckpointReached: () => void;
  teleportTarget: { x: number, z: number, timestamp: number } | null;
  onClueFound: (clue: SectorTrigger) => void;
  isClueOpen: boolean;
  onDialogueStateChange: (isOpen: boolean) => void;
  onMapInit: (items: MapItem[]) => void;
  onFPSUpdate?: (fps: number) => void;
}

export type DeathPhase = 'NONE' | 'ANIMATION' | 'MESSAGE' | 'CONTINUE';
