import { EnemyDeathState } from '../entities/enemies/EnemyTypes';
import { StatusEffectID } from './perks';
import { ColorPair, COLORS } from '../utils/ui/ColorUtils';
import { DamageType, WeaponID } from '../entities/player/CombatTypes';


// ============================================================================
// 2. ENGINE & COMBAT TYPES
// ============================================================================

export enum WeaponCategory {
  PRIMARY = 0,
  SECONDARY = 1,
  THROWABLE = 2,
  SPECIAL = 3
}

export enum WeaponLightType {
  ELECTRIC = 0,
  FIRE = 1
}

export enum WeaponBehavior {
  PROJECTILE = 0,
  CONTINUOUS = 1,
  THROWABLE = 2
}

export interface StatusEffect {
  type: StatusEffectID;
  duration: number;
  damagePerTick?: number;
}

export interface MuzzleProfile {
  count: number;
  spread: number;
  speedBase: number;
  speedVar: number;
  scaleBase: number;
  scaleVar: number;
  lifeBase: number;
  lifeVar: number;
  colorHex: number;
  lightIntensity: number;
  lightDistance: number;
  lightType: WeaponLightType;
}

export const DEFAULT_MUZZLE: MuzzleProfile = {
  count: 1, spread: 0.0, speedBase: 3, speedVar: 2,
  scaleBase: 0.8, scaleVar: 0.5, lifeBase: 0.05, lifeVar: 0.05,
  colorHex: COLORS.FIRE_ORANGE.num,
  lightIntensity: 4.0, lightDistance: 6.0, lightType: WeaponLightType.FIRE
};

/**
 * Master Configuration for STRICT weapons only.
 * Purged of Tools, Abilities, and Vehicles.
 */
export interface WeaponStats {
  name: WeaponID; // Stenhårt typad till endast riktiga vapen!
  displayName: string;
  category: WeaponCategory;
  behavior: WeaponBehavior;
  defaultDamageType: DamageType; // Anger den fysiska skadenaturen (t.ex. BALLISTIC, BURN)

  // Combat Stats
  damage: number;
  fireRate: number;     // ms mellan skott
  bulletSpeed?: number;  // Resehastighet
  magSize: number;
  reloadTime: number;   // ms
  range: number;        // Max räckvidd
  isEnergy?: boolean;   // Laddningsbaserad (0-100)
  radius?: number;       // AoE-radie för sprängämnen
  spread?: number;       // Precision-avvikelse

  // Visuals & Core Logic
  icon: string;
  iconIsPng?: boolean;
  piercing?: boolean;
  amplyType?: boolean;
  pierceDecay?: number;
  muzzle?: MuzzleProfile;

  // Death & Status Mapping
  impactType: EnemyDeathState;
  statusEffect: StatusEffect | null;
}

export const WeaponCategoryColors: ColorPair[] = [
  { num: 0xef4444, str: '#ef4444' }, // PRIMARY
  { num: 0xfbbf24, str: '#fbbf24' }, // SECONDARY
  { num: 0x16a34a, str: '#16a34a' }, // THROWABLE
  { num: 0xa855f7, str: '#a855f7' }  // SPECIAL
];

export const WEAPON_CATEGORY_NAMES: Record<WeaponCategory, string> = {
  [WeaponCategory.PRIMARY]: 'categories.primary',
  [WeaponCategory.SECONDARY]: 'categories.secondary',
  [WeaponCategory.THROWABLE]: 'categories.throwable',
  [WeaponCategory.SPECIAL]: 'categories.special',
};

const PNG_PATH = '/assets/icons/weapons/';

// ============================================================================
// 3. STRICT WEAPON DATABASE (Indexed by WeaponID SMI)
// ============================================================================
export const WEAPONS: WeaponStats[] = [];

// --- PRIMARY ---
WEAPONS[WeaponID.SMG] = {
  name: WeaponID.SMG, displayName: 'weapons.smg', category: WeaponCategory.PRIMARY, behavior: WeaponBehavior.PROJECTILE, defaultDamageType: DamageType.BALLISTIC,
  damage: 12, fireRate: 100, bulletSpeed: 70, magSize: 30, reloadTime: 2000, range: 12, spread: 0.18,
  icon: PNG_PATH + 'smg.png', iconIsPng: true,
  piercing: false, impactType: EnemyDeathState.SHOT, statusEffect: null
};

WEAPONS[WeaponID.SHOTGUN] = {
  name: WeaponID.SHOTGUN, displayName: 'weapons.shotgun', category: WeaponCategory.PRIMARY, behavior: WeaponBehavior.PROJECTILE, defaultDamageType: DamageType.BALLISTIC,
  damage: 15, fireRate: 1000, bulletSpeed: 55, magSize: 6, reloadTime: 3000, range: 8, spread: 0.35,
  icon: PNG_PATH + 'shotgun.png', iconIsPng: true,
  impactType: EnemyDeathState.GIBBED, statusEffect: null
};

WEAPONS[WeaponID.RIFLE] = {
  name: WeaponID.RIFLE, displayName: 'weapons.rifle', category: WeaponCategory.PRIMARY, behavior: WeaponBehavior.PROJECTILE, defaultDamageType: DamageType.BALLISTIC,
  damage: 35, fireRate: 200, bulletSpeed: 90, magSize: 25, reloadTime: 2500, range: 20, spread: 0.04,
  icon: PNG_PATH + 'rifle.png', iconIsPng: true,
  impactType: EnemyDeathState.SHOT, statusEffect: null
};

// --- SECONDARY ---
WEAPONS[WeaponID.PISTOL] = {
  name: WeaponID.PISTOL, displayName: 'weapons.pistol', category: WeaponCategory.SECONDARY, behavior: WeaponBehavior.PROJECTILE, defaultDamageType: DamageType.BALLISTIC,
  damage: 25, fireRate: 400, bulletSpeed: 65, magSize: 12, reloadTime: 1500, range: 15, spread: 0.05,
  icon: PNG_PATH + 'pistol.png', iconIsPng: true,
  impactType: EnemyDeathState.SHOT, statusEffect: null
};

WEAPONS[WeaponID.REVOLVER] = {
  name: WeaponID.REVOLVER, displayName: 'weapons.revolver', category: WeaponCategory.SECONDARY, behavior: WeaponBehavior.PROJECTILE, defaultDamageType: DamageType.BALLISTIC,
  damage: 85, fireRate: 850, bulletSpeed: 85, magSize: 6, reloadTime: 2500, range: 25, spread: 0.01,
  icon: PNG_PATH + 'revolver.png', iconIsPng: true,
  piercing: true, pierceDecay: 0.7, impactType: EnemyDeathState.GIBBED, statusEffect: null
};

// --- THROWABLE ---
WEAPONS[WeaponID.GRENADE] = {
  name: WeaponID.GRENADE, displayName: 'weapons.grenade', category: WeaponCategory.THROWABLE, behavior: WeaponBehavior.THROWABLE, defaultDamageType: DamageType.EXPLOSION,
  damage: 180, fireRate: 500, range: 20, radius: 8, reloadTime: 1500, magSize: 5,
  icon: PNG_PATH + 'grenade.png', iconIsPng: true,
  impactType: EnemyDeathState.EXPLODED, statusEffect: null
};

WEAPONS[WeaponID.MOLOTOV] = {
  name: WeaponID.MOLOTOV, displayName: 'weapons.molotov', category: WeaponCategory.THROWABLE, behavior: WeaponBehavior.THROWABLE, defaultDamageType: DamageType.BURN,
  damage: 15, fireRate: 500, range: 20, radius: 5, reloadTime: 1500, magSize: 5,
  icon: PNG_PATH + 'molotov.png', iconIsPng: true,
  impactType: EnemyDeathState.BURNED, statusEffect: { type: StatusEffectID.BURNING, duration: 5.0, damagePerTick: 5 }
};

WEAPONS[WeaponID.FLASHBANG] = {
  name: WeaponID.FLASHBANG, displayName: 'weapons.flashbang', category: WeaponCategory.THROWABLE, behavior: WeaponBehavior.THROWABLE, defaultDamageType: DamageType.PHYSICAL,
  damage: 0, fireRate: 500, range: 20, radius: 10, reloadTime: 1500, magSize: 5,
  icon: PNG_PATH + 'flashbang.png', iconIsPng: true,
  impactType: EnemyDeathState.SHOT, statusEffect: { type: StatusEffectID.STUNNED, duration: 3.5 }
};

// --- SPECIAL ---
WEAPONS[WeaponID.MINIGUN] = {
  name: WeaponID.MINIGUN, displayName: 'weapons.minigun', category: WeaponCategory.SPECIAL, behavior: WeaponBehavior.PROJECTILE, defaultDamageType: DamageType.BALLISTIC,
  damage: 18, fireRate: 50, bulletSpeed: 75, magSize: 200, reloadTime: 5000, range: 25, spread: 0.18,
  icon: PNG_PATH + 'minigun.png', iconIsPng: true,
  impactType: EnemyDeathState.SHOT, statusEffect: null
};

WEAPONS[WeaponID.FLAMETHROWER] = {
  name: WeaponID.FLAMETHROWER, displayName: 'weapons.flamethrower', category: WeaponCategory.SPECIAL, behavior: WeaponBehavior.CONTINUOUS, defaultDamageType: DamageType.BURN,
  damage: 6, fireRate: 35, range: 10, spread: 0.25, magSize: 100, isEnergy: true, reloadTime: 0,
  icon: PNG_PATH + 'flamethrower.png', iconIsPng: true,
  impactType: EnemyDeathState.BURNED, statusEffect: { type: StatusEffectID.BURNING, duration: 4.5, damagePerTick: 10 },
  muzzle: {
    count: 3, spread: 0.4, speedBase: 4, speedVar: 3,
    scaleBase: 0.16, scaleVar: 0.24, lifeBase: 0.08, lifeVar: 0.08,
    colorHex: COLORS.FIRE_RED.num,
    lightIntensity: 4.0, lightDistance: 6.0, lightType: WeaponLightType.FIRE
  }
};

WEAPONS[WeaponID.ARC_CANNON] = {
  name: WeaponID.ARC_CANNON, displayName: 'weapons.arc_cannon', category: WeaponCategory.SPECIAL, behavior: WeaponBehavior.CONTINUOUS, defaultDamageType: DamageType.ELECTRIC,
  damage: 14, fireRate: 90, range: 15, spread: 0.05, magSize: 100, isEnergy: true, reloadTime: 0,
  icon: PNG_PATH + 'arc_cannon.png', iconIsPng: true,
  piercing: true, pierceDecay: 0.5, impactType: EnemyDeathState.ELECTROCUTED, statusEffect: { type: StatusEffectID.ELECTRIFIED, duration: 2.5 },
  muzzle: {
    count: 1, spread: 0.0, speedBase: 3, speedVar: 2,
    scaleBase: 0.8, scaleVar: 0.5, lifeBase: 0.05, lifeVar: 0.05,
    colorHex: COLORS.CYAN_BRIGHT.num,
    lightIntensity: 4.0, lightDistance: 6.0, lightType: WeaponLightType.ELECTRIC
  }
};
