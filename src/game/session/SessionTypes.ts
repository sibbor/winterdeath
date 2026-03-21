import { WeaponType } from '../../content/weapons';
import { PlayerStats } from '../../entities/player/PlayerTypes';
import { GraphicsSettings, WeatherType, EnvironmentOverride } from '../../core/engine/EngineTypes';

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
  onClueDiscovered: (clue: any) => void; // Using any for now to avoid circular or too many imports
  onPOIdiscovered: (poi: any) => void;
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
