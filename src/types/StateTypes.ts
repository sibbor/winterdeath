import { WeaponID } from '../entities/player/CombatTypes';
import { PlayerStats } from '../entities/player/PlayerTypes';
import { GameSettings, WeatherType, EnvironmentOverride } from '../core/engine/EngineTypes';
import { GameScreen } from './SessionTypes';

export type { PlayerStats };

export interface SectorStats {
  kills: number;
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
  score: number;
  bossDamageDealt: number;
  bossDamageTaken: number;
  chestsOpened: number;
  bigChestsOpened: number;

  maxKillstreak: number;
  engagementDistSqKills: number;

  // --- NEW ANALYTICS ---
  dodges: number;
  rushes: number;
  rushDistance: number;
  buffTime: number;
  debuffsResisted: number;
  crisisSaves: number;
  deaths: number;
  gibbedEnemies: number;
  uniqueEnemiesHitByExplosives: number;

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
  enemyDeaths: Float64Array;
  incomingDamageBuffer: Float64Array;

  activePassives: Int32Array;
  activePassivesCount: number;
  activeBuffs: Int32Array;
  activeBuffsCount: number;
  activeDebuffs: Int32Array;
  activeDebuffsCount: number;

  discoveredClues: any[];
  discoveredPois: string[];
  discoveredZombies: number[];
  discoveredBosses: number[];
  xpGained: number;
  spGained: number;
  killerType?: number;
  killingBlowWeapon?: number;
  killingBlowSource?: number;
  discoveredCollectibles: string[];
  aborted: boolean;
  familyFound: boolean;
  familyExtracted: boolean;
  isExtraction: boolean;
  discoveredPerksMap: Uint8Array;

  // Standardized wave naming
  waveActive?: boolean;
  waveKills?: number;
  waveTarget?: number;
  currentWave?: number;
  totalWaves?: number;
}

export interface SectorState {
  unlimitedThrowables?: boolean;
  unlimitedAmmo?: boolean;
  noReload?: boolean;
  isInvincible?: boolean;
  envOverride?: EnvironmentOverride;
  ctx?: any;

  // Standardized wave naming
  waveActive?: boolean;
  waveKills?: number;
  waveTarget?: number;
  currentWave?: number;
  totalWaves?: number;

  // The Generic Bridge API
  pendingTrigger?: string | null;
  keepCamera?: boolean;

  [key: string]: any;
}

export interface GameState {
  screen: GameScreen;
  currentSector: number;
  stats: PlayerStats;
  loadout: {
    primary: WeaponID;
    secondary: WeaponID;
    throwable: WeaponID;
    special: WeaponID;
  };
  weaponLevels: Partial<Record<WeaponID, number>>;

  settings: GameSettings;
  deadBossIndices: number[];
  rescuedFamilyIndices: number[];
  sectorState?: SectorState;
  showFps?: boolean;
  sectorBriefing?: string;
  debugMode?: boolean;
  weather: WeatherType;
  environmentOverrides?: Record<number, EnvironmentOverride>;
  sessionToken: number;
}
