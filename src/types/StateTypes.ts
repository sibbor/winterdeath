import { WeaponType } from '../content/weapons';
import { PlayerStats } from '../entities/player/PlayerTypes';
import { GameSettings, WeatherType, EnvironmentOverride } from '../core/engine/EngineTypes';
import { GameScreen } from './SessionTypes';

export type { PlayerStats };

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
  score: number;
  bossDamageDealt: number;
  bossDamageTaken: number;

  maxKillstreak: number;
  engagementDistSqKills: number;

  // --- WEAPON PERFORMANCE BUFFERS (Zero-GC / Phase 12) ---
  weaponKills: Float64Array;
  weaponDamageDealt: Float64Array;
  weaponShotsFired: Float64Array;
  weaponShotsHit: Float64Array;
  weaponTimeActive: Float64Array;
  weaponEngagementDistSq: Float64Array;

  // --- PERK PERFORMANCE BUFFERS (Zero-GC / Phase 12) ---
  perkTimesGained: Float64Array;
  perkDamageAbsorbed: Float64Array;
  perkDamageDealt: Float64Array;
  perkDebuffsCleansed: Float64Array;

  // --- ENEMY STATS BUFFERS ---
  enemyKills: Float64Array;

  // VINTERDÖD FIX: cluesFound is an array of objects {id, content}, not strings
  cluesFound: any[];

  discoveredPOIs: string[];
  seenEnemies: number[];
  seenBosses: number[];
  xpGained: number;
  spGained: number;
  killerType?: number;
  collectiblesDiscovered: string[];
  aborted: boolean;
  familyFound: boolean;
  familyExtracted: boolean;
  isExtraction: boolean;
  incomingDamageBreakdown: Record<number, Record<number, number>>;
  outgoingDamageBreakdown: Record<number, number>;
  discoveredPerks: number[];

  // VINTERDÖD FIX: Standardized wave naming
  waveActive?: boolean;
  zombiesKilled?: number;
  targetKills?: number;
  hordeTarget?: number;
}

export interface SectorState {
  unlimitedThrowables?: boolean;
  unlimitedAmmo?: boolean;
  noReload?: boolean;
  isInvincible?: boolean;
  envOverride?: EnvironmentOverride;
  ctx?: any;

  // VINTERDÖD FIX: Standardized wave naming
  waveActive?: boolean;
  zombiesKilled?: number;
  targetKills?: number;
  hordeTarget?: number;

  // VINTERDÖD FIX: The Generic Bridge API
  pendingTrigger?: string | null;
  keepCamera?: boolean;

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
  weaponLevels: Partial<Record<WeaponType, number>>;

  settings: GameSettings;
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
