import { EnvironmentOverride } from '../core/engine/EngineTypes';
import { WeaponType } from '../content/weapons';
import type { MapItem, MapItemType, HudVector2, HudBossInfo, HudState } from '../components/ui/hud/HudTypes';

export type { MapItem, MapItemType, HudVector2, HudBossInfo, HudState };

// --- CORE TYPES ---

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

export interface GraphicsSettings {
  antialias: boolean;
  shadows: boolean;
  bloom: boolean;
  shadowMapType: number;
  shadowResolution: number;
  pixelRatio: number;
  weatherCount: number;
  textureQuality: number;
}

export interface PlayerStats {
  level: number;
  xp: number;
  currentXp: number;
  nextLevelXp: number;
  maxHp: number;
  maxStamina: number;
  skillPoints: number;
  totalSkillPointsEarned: number;
  kills: number;
  killsByType: Record<string, number>;
  deaths: number;
  sectorsCompleted: number;
  scrap: number;
  totalScrapCollected: number;
  totalBulletsFired: number;
  totalBulletsHit: number;
  totalThrowablesThrown: number;
  totalDamageDealt: number;
  totalDamageTaken: number;
  totalDistanceTraveled: number;
  chestsOpened: number;
  bigChestsOpened: number;
  collectiblesDiscovered: string[];
  viewedCollectibles?: string[];
  cluesFound: string[];
  discoveredPOIs: string[];
  seenEnemies: string[];
  seenBosses: string[];
  prologueSeen?: boolean;
  // Legacy / Additional stats from constants.ts
  speed: number;
  rescuedFamilyIds: number[];
  familyFoundCount: number;
  mostUsedWeapon: string;
  incomingDamageBreakdown?: Record<string, any>;
  outgoingDamageBreakdown?: Record<string, any>;
}

export interface SectorStats {
  kills: number;
  killsByType: Record<string, number>;
  damageDealt: number;
  damageTaken: number;
  timePlayed: number;
  timeElapsed: number;
  accuracy: number;
  itemsCollected: number;
  scrapLooted: number;
  shotsFired: number;
  shotsHit: number;
  throwablesThrown: number;
  distanceTraveled: number;
  chestsOpened: number;
  bigChestsOpened: number;
  cluesFound: string[];
  discoveredPOIs: string[];
  seenEnemies: string[];
  seenBosses: string[];
  xpGained: number;
  spEarned?: number;
  collectiblesDiscovered?: string[];
  aborted?: boolean;
  familyFound?: boolean;
  familyExtracted?: boolean;
  isExtraction?: boolean;
  bossDamageDealt?: number;
  bossDamageTaken?: number;
  incomingDamageBreakdown?: Record<string, Record<string, number>>;
  outgoingDamageBreakdown?: Record<string, number>;
  zombieWaveActive?: boolean;
  zombiesKilled?: number;
  zombiesKillTarget?: number;
  hordeTarget?: number;
}

export interface SectorState {
  unlimitedThrowables?: boolean;
  unlimitedAmmo?: boolean;
  noReload?: boolean;
  isInvincible?: boolean;
  envOverride?: EnvironmentOverride;
  ctx?: any;
  zombieWaveActive?: boolean;
  zombiesKilled?: number;
  zombiesKillTarget?: number;
  hordeTarget?: number;
  [key: string]: any;
}

export interface GameState {
  screen: GameScreen;
  currentSector: number;
  stats: PlayerStats;
  loadout: {
    primary: WeaponType;
    secondary: WeaponType;
    throwable: WeaponType;
    special: WeaponType;
  };
  weaponLevels: Record<WeaponType, number>;
  graphics: GraphicsSettings;
  deadBossIndices: number[];
  rescuedFamilyIndices: number[];
  sectorState?: SectorState;
  showFps?: boolean;
  sectorBriefing?: string;
  midRunCheckpoint: { x: number, z: number, timestamp: number } | null;
  debugMode?: boolean;
  weather: WeatherType;
  environmentOverrides?: Record<number, EnvironmentOverride>;
}

export type TriggerType = 'COLLECTIBLE' | 'CLUE' | 'POI' | 'INTERACTION' | 'STATION' | 'SECTOR_END' | 'SPEAK' | 'THOUGHT' | 'INFO' | 'AMBUSH' | string;

export interface TriggerAction {
  type: string;
  amount?: number;
  id?: string;
  payload?: any;
  [key: string]: any;
}

export interface SectorTrigger {
  id: string;
  position?: { x: number; z: number };
  x?: number;
  z?: number;
  radius?: number;
  size?: { width: number; depth: number };
  type: TriggerType;
  label?: string;
  icon?: string;
  color?: string;
  content?: string;
  triggered?: boolean;
  actions?: TriggerAction[];
  resetOnExit?: boolean;
  repeatInterval?: number;
  lastTriggerTime?: number;
  rotation?: number;
  familyId?: number;
  ownerId?: string;
  data?: any;
}

export interface GameCanvasProps {
  stats: PlayerStats;
  loadout: {
    primary: WeaponType;
    secondary: WeaponType;
    throwable: WeaponType;
    special: WeaponType;
  };
  weaponLevels: Record<WeaponType, number>;
  currentSector: number;
  deadBossIndices: number[];
  rescuedFamilyIndices: number[];
  debugMode?: boolean;
  isRunning: boolean;
  isPaused: boolean;
  onDie: (stats: SectorStats, killer: string) => void;
  onSectorEnded: (stats: SectorStats) => void;
  onPauseToggle: (val: boolean) => void;
  onOpenMap: () => void;
  triggerEndSector: boolean;
  familyAlreadyRescued: boolean;
  bossPermanentlyDefeated: boolean;
  onSectorLoaded: () => void;
  startAtCheckpoint: boolean;
  onCheckpointReached: () => void;
  teleportTarget: { x: number, z: number, timestamp: number } | null;
  onCollectibleDiscovered: (id: string) => void;
  onClueDiscovered: (clue: SectorTrigger) => void;
  onPOIdiscovered: (poi: SectorTrigger) => void;
  isCollectibleOpen: boolean;
  onCollectibleClose: () => void;
  onDialogueStateChange: (active: boolean) => void;
  onDeathStateChange: (active: boolean) => void;
  onBossIntroStateChange: (active: boolean) => void;
  onUpdateLoadout?: (loadout: any, levels: any) => void;
  onEnvironmentOverrideChange?: (overrides: EnvironmentOverride, weather: WeatherType) => void;
  environmentOverrides?: Record<number, EnvironmentOverride>;
  onInteractionStateChange?: (type: string | null) => void;
  isMobileDevice?: boolean;
  disableInput?: boolean;
  isWarmup?: boolean;
  weather: WeatherType;
  initialGraphics: GraphicsSettings;
}

export type DeathPhase = 'NONE' | 'ANIMATION' | 'MESSAGE' | 'CONTINUE';