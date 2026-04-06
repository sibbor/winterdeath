import { EnemyDeathState } from '../entities/enemies/EnemyTypes';
import { StatusEffectType } from './perks';
import { DamageID } from '../entities/player/CombatTypes';

// --- ENUMS (SMI Optimized) ---

export enum WeaponCategory {
  PRIMARY = 0,
  SECONDARY = 1,
  THROWABLE = 2,
  SPECIAL = 3,
  TOOL = 4
}

export const WeaponCategoryColors = [
  '#ef4444', // PRIMARY (Red-500)
  '#fbbf24', // SECONDARY (Yellow-400)
  '#10b981', // THROWABLE (Emerald-500)
  '#a855f7', // SPECIAL (Purple-500)
  '#3b82f6'  // TOOL (Blue-500)
];

/**
 * Defines how the ProjectileSystem handles the delivery of the attack.
 */
export enum WeaponBehavior {
  PROJECTILE = 0, // Standard bullet physics
  CONTINUOUS = 1, // Beam/Spray logic (Flamethrower/Arc-Cannon)
  THROWABLE = 2   // Physics-based arc (Grenade/Molotov)
}

// Re-export DamageID as WeaponType for backward compatibility if needed, 
// but we prefer using DamageID directly.
export { DamageID as WeaponType };

export interface StatusEffect {
  type: StatusEffectType;
  duration: number;       // Seconds the effect lasts
  damagePerTick?: number; // Optional DOT (Damage Over Time)
}

/**
 * Master configuration for every weapon.
 * This is the 'Source of Truth' for combat and UI.
 */
export interface WeaponStats {
  name: DamageID;
  displayName: string;
  category: WeaponCategory;
  behavior: WeaponBehavior;

  // Combat Stats
  damage: number;
  fireRate?: number;     // ms between shots
  bulletSpeed?: number;  // Travel speed
  magSize?: number;
  reloadTime?: number;   // ms
  range: number;         // Bullet range OR Max throw distance
  radius?: number;       // Explosion/AoE radius
  spread?: number;       // Accuracy deviation

  // Logic & Visuals
  icon: string;          // PNG filename
  iconIsPng?: boolean;   // Flag to indicate PNG icon
  piercing?: boolean;    // If true, projectile passes through enemies
  pierceDecay?: number;  // Damage multiplier per hit (e.g. 0.7)

  // Death Mapping
  // Maps directly to EnemyAI.deathState
  impactType: EnemyDeathState;
  statusEffect: StatusEffect | null;
}

const PNG_PATH = '/assets/icons/weapons/';

/**
 * DATABASE (Contiguous Array for O(1) Lookup)
 * VINTERDÖD: This array is indexed directly by DamageID (SMI).
 * No string-hashing or Map overhead during high-frequency combat updates.
 */
export const WEAPONS: WeaponStats[] = [];

// --- PRIMARY ---
WEAPONS[DamageID.SMG] = {
  name: DamageID.SMG, displayName: 'weapons.smg', category: WeaponCategory.PRIMARY, behavior: WeaponBehavior.PROJECTILE,
  damage: 12, fireRate: 100, bulletSpeed: 70, magSize: 30, reloadTime: 2000, range: 12, spread: 0.18,
  icon: PNG_PATH + 'smg.png', iconIsPng: true,
  piercing: false, impactType: EnemyDeathState.SHOT, statusEffect: null
};
WEAPONS[DamageID.SHOTGUN] = {
  name: DamageID.SHOTGUN, displayName: 'weapons.shotgun', category: WeaponCategory.PRIMARY, behavior: WeaponBehavior.PROJECTILE,
  damage: 15, fireRate: 1000, bulletSpeed: 55, magSize: 6, reloadTime: 3000, range: 8, spread: 0.35,
  icon: PNG_PATH + 'shotgun.png', iconIsPng: true,
  impactType: EnemyDeathState.GIBBED, statusEffect: null
};
WEAPONS[DamageID.RIFLE] = {
  name: DamageID.RIFLE, displayName: 'weapons.rifle', category: WeaponCategory.PRIMARY, behavior: WeaponBehavior.PROJECTILE,
  damage: 35, fireRate: 200, bulletSpeed: 90, magSize: 25, reloadTime: 2500, range: 20, spread: 0.04,
  icon: PNG_PATH + 'rifle.png', iconIsPng: true,
  impactType: EnemyDeathState.SHOT, statusEffect: null
};

// --- SECONDARY ---
WEAPONS[DamageID.PISTOL] = {
  name: DamageID.PISTOL, displayName: 'weapons.pistol', category: WeaponCategory.SECONDARY, behavior: WeaponBehavior.PROJECTILE,
  damage: 25, fireRate: 400, bulletSpeed: 65, magSize: 12, reloadTime: 1500, range: 15, spread: 0.05,
  icon: PNG_PATH + 'pistol.png', iconIsPng: true,
  impactType: EnemyDeathState.SHOT, statusEffect: null
};
WEAPONS[DamageID.REVOLVER] = {
  name: DamageID.REVOLVER, displayName: 'weapons.revolver', category: WeaponCategory.SECONDARY, behavior: WeaponBehavior.PROJECTILE,
  damage: 85, fireRate: 850, bulletSpeed: 85, magSize: 6, reloadTime: 2500, range: 25, spread: 0.01,
  icon: PNG_PATH + 'revolver.png', iconIsPng: true,
  piercing: true, pierceDecay: 0.7, impactType: EnemyDeathState.GIBBED, statusEffect: null
};

// --- THROWABLE ---
WEAPONS[DamageID.GRENADE] = {
  name: DamageID.GRENADE, displayName: 'weapons.grenade', category: WeaponCategory.THROWABLE, behavior: WeaponBehavior.THROWABLE,
  damage: 180, range: 20, radius: 8, reloadTime: 1500, magSize: 5,
  icon: PNG_PATH + 'grenade.png', iconIsPng: true,
  impactType: EnemyDeathState.EXPLODED, statusEffect: null
};
WEAPONS[DamageID.MOLOTOV] = {
  name: DamageID.MOLOTOV, displayName: 'weapons.molotov', category: WeaponCategory.THROWABLE, behavior: WeaponBehavior.THROWABLE,
  damage: 15, range: 20, radius: 5, reloadTime: 1500, magSize: 5,
  icon: PNG_PATH + 'molotov.png', iconIsPng: true,
  impactType: EnemyDeathState.BURNED, statusEffect: { type: StatusEffectType.BURNING, duration: 5.0, damagePerTick: 5 }
};
WEAPONS[DamageID.FLASHBANG] = {
  name: DamageID.FLASHBANG, displayName: 'weapons.flashbang', category: WeaponCategory.THROWABLE, behavior: WeaponBehavior.THROWABLE,
  damage: 0, range: 20, radius: 10, reloadTime: 1500, magSize: 5,
  icon: PNG_PATH + 'flashbang.png', iconIsPng: true,
  impactType: EnemyDeathState.SHOT, statusEffect: { type: StatusEffectType.STUNNED, duration: 3.5 }
};

// --- SPECIAL ---
WEAPONS[DamageID.MINIGUN] = {
  name: DamageID.MINIGUN, displayName: 'weapons.minigun', category: WeaponCategory.SPECIAL, behavior: WeaponBehavior.PROJECTILE,
  damage: 18, fireRate: 50, bulletSpeed: 75, magSize: 200, reloadTime: 5000, range: 25, spread: 0.18,
  icon: PNG_PATH + 'minigun.png', iconIsPng: true,
  impactType: EnemyDeathState.SHOT, statusEffect: null
};
WEAPONS[DamageID.FLAMETHROWER] = {
  name: DamageID.FLAMETHROWER, displayName: 'weapons.flamethrower', category: WeaponCategory.SPECIAL, behavior: WeaponBehavior.CONTINUOUS,
  damage: 6, fireRate: 35, range: 10, spread: 0.25, magSize: 500,
  icon: PNG_PATH + 'flamethrower.png', iconIsPng: true,
  impactType: EnemyDeathState.BURNED, statusEffect: { type: StatusEffectType.BURNING, duration: 4.5, damagePerTick: 10 }
};
WEAPONS[DamageID.ARC_CANNON] = {
  name: DamageID.ARC_CANNON, displayName: 'weapons.arc_cannon', category: WeaponCategory.SPECIAL, behavior: WeaponBehavior.CONTINUOUS,
  damage: 14, fireRate: 90, range: 15, spread: 0.05, magSize: 500,
  icon: PNG_PATH + 'arc_cannon.png', iconIsPng: true,
  piercing: true, pierceDecay: 0.5, impactType: EnemyDeathState.ELECTROCUTED, statusEffect: { type: StatusEffectType.ELECTRIFIED, duration: 2.5 }
};

// --- TOOL ---
WEAPONS[DamageID.RADIO] = {
  name: DamageID.RADIO, displayName: 'weapons.radio', category: WeaponCategory.TOOL, behavior: WeaponBehavior.PROJECTILE,
  damage: 0, range: 0,
  icon: PNG_PATH + 'radio.png', iconIsPng: true,
  impactType: EnemyDeathState.SHOT, statusEffect: null
};