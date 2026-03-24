import { EnemyDeathState } from '../entities/enemies/EnemyTypes';
import { StatusEffectType } from '../entities/player/CombatTypes';

// --- ENUMS ---

export enum WeaponCategory {
  PRIMARY = 'PRIMARY', // red
  SECONDARY = 'SECONDARY', // orange
  THROWABLE = 'THROWABLE', // green
  SPECIAL = 'SPECIAL', // purple
  TOOL = 'TOOL' // blue
}

export const WeaponCategoryColors = {
  PRIMARY: '#ef4444',   // Red-500
  SECONDARY: '#fbbf24', // Yellow-400
  THROWABLE: '#10b981', // Emerald-500
  SPECIAL: '#a855f7',   // Purple-500
  TOOL: '#3b82f6'       // Blue-500
}

/**
 * Defines how the ProjectileSystem handles the delivery of the attack.
 */
export enum WeaponBehavior {
  PROJECTILE = 'PROJECTILE', // Standard bullet physics
  CONTINUOUS = 'CONTINUOUS', // Beam/Spray logic (Flamethrower/Arc-Cannon)
  THROWABLE = 'THROWABLE'    // Physics-based arc (Grenade/Molotov)
}

export enum WeaponType {
  SMG = 'SMG',
  SHOTGUN = 'Shotgun',
  RIFLE = 'Assault Rifle',
  PISTOL = 'Pistol',
  REVOLVER = 'Revolver',
  GRENADE = 'Grenade',
  MOLOTOV = 'Molotov',
  FLASHBANG = 'Flashbang',
  MINIGUN = 'Minigun',
  FLAMETHROWER = 'Flamethrower',
  ARC_CANNON = 'Arc-Cannon',
  RADIO = 'Radio',
  NONE = 'None'
}

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
  name: WeaponType;
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

// --- DATABASE ---

export const WEAPONS: Record<string, WeaponStats> = {
  // --- PRIMARY ---
  [WeaponType.SMG]: {
    name: WeaponType.SMG, displayName: 'weapons.smg', category: WeaponCategory.PRIMARY, behavior: WeaponBehavior.PROJECTILE,
    damage: 12, fireRate: 100, bulletSpeed: 70, magSize: 30, reloadTime: 2000, range: 12, spread: 0.18,
    icon: PNG_PATH + 'smg.png', iconIsPng: true,
    piercing: false, impactType: EnemyDeathState.SHOT, statusEffect: null
  },
  [WeaponType.SHOTGUN]: {
    name: WeaponType.SHOTGUN, displayName: 'weapons.shotgun', category: WeaponCategory.PRIMARY, behavior: WeaponBehavior.PROJECTILE,
    damage: 15, fireRate: 1000, bulletSpeed: 55, magSize: 6, reloadTime: 3000, range: 8, spread: 0.35,
    icon: PNG_PATH + 'shotgun.png', iconIsPng: true,
    impactType: EnemyDeathState.GIBBED, statusEffect: null
  },
  [WeaponType.RIFLE]: {
    name: WeaponType.RIFLE, displayName: 'weapons.rifle', category: WeaponCategory.PRIMARY, behavior: WeaponBehavior.PROJECTILE,
    damage: 35, fireRate: 200, bulletSpeed: 90, magSize: 25, reloadTime: 2500, range: 20, spread: 0.04,
    icon: PNG_PATH + 'rifle.png', iconIsPng: true,
    impactType: EnemyDeathState.SHOT, statusEffect: null
  },

  // --- SECONDARY ---
  [WeaponType.PISTOL]: {
    name: WeaponType.PISTOL, displayName: 'weapons.pistol', category: WeaponCategory.SECONDARY, behavior: WeaponBehavior.PROJECTILE,
    damage: 25, fireRate: 400, bulletSpeed: 65, magSize: 12, reloadTime: 1500, range: 15, spread: 0.05,
    icon: PNG_PATH + 'pistol.png', iconIsPng: true,
    impactType: EnemyDeathState.SHOT, statusEffect: null
  },
  [WeaponType.REVOLVER]: {
    name: WeaponType.REVOLVER, displayName: 'weapons.revolver', category: WeaponCategory.SECONDARY, behavior: WeaponBehavior.PROJECTILE,
    damage: 85, fireRate: 850, bulletSpeed: 85, magSize: 6, reloadTime: 2500, range: 25, spread: 0.01,
    icon: PNG_PATH + 'revolver.png', iconIsPng: true,
    piercing: true, pierceDecay: 0.7, impactType: EnemyDeathState.GIBBED, statusEffect: null
  },

  // --- THROWABLE ---
  [WeaponType.GRENADE]: {
    name: WeaponType.GRENADE, displayName: 'weapons.grenade', category: WeaponCategory.THROWABLE, behavior: WeaponBehavior.THROWABLE,
    damage: 180, range: 20, radius: 8, reloadTime: 1500, magSize: 5,
    icon: PNG_PATH + 'grenade.png', iconIsPng: true,
    impactType: EnemyDeathState.EXPLODED, statusEffect: null
  },
  [WeaponType.MOLOTOV]: {
    name: WeaponType.MOLOTOV, displayName: 'weapons.molotov', category: WeaponCategory.THROWABLE, behavior: WeaponBehavior.THROWABLE,
    damage: 15, range: 20, radius: 5, reloadTime: 1500, magSize: 5,
    icon: PNG_PATH + 'molotov.png', iconIsPng: true,
    impactType: EnemyDeathState.BURNED, statusEffect: { type: StatusEffectType.BURNING, duration: 5.0, damagePerTick: 5 }
  },
  [WeaponType.FLASHBANG]: {
    name: WeaponType.FLASHBANG, displayName: 'weapons.flashbang', category: WeaponCategory.THROWABLE, behavior: WeaponBehavior.THROWABLE,
    damage: 0, range: 20, radius: 10, reloadTime: 1500, magSize: 5,
    icon: PNG_PATH + 'flashbang.png', iconIsPng: true,
    impactType: EnemyDeathState.SHOT, statusEffect: { type: StatusEffectType.STUNNED, duration: 3.5 }
  },

  // --- SPECIAL ---
  [WeaponType.MINIGUN]: {
    name: WeaponType.MINIGUN, displayName: 'weapons.minigun', category: WeaponCategory.SPECIAL, behavior: WeaponBehavior.PROJECTILE,
    damage: 18, fireRate: 50, bulletSpeed: 75, magSize: 200, reloadTime: 5000, range: 25, spread: 0.18,
    icon: PNG_PATH + 'minigun.png', iconIsPng: true,
    impactType: EnemyDeathState.SHOT, statusEffect: null
  },
  [WeaponType.FLAMETHROWER]: {
    name: WeaponType.FLAMETHROWER, displayName: 'weapons.flamethrower', category: WeaponCategory.SPECIAL, behavior: WeaponBehavior.CONTINUOUS,
    damage: 6, fireRate: 35, range: 10, spread: 0.25, magSize: 500,
    icon: PNG_PATH + 'flamethrower.png', iconIsPng: true,
    impactType: EnemyDeathState.BURNED, statusEffect: { type: StatusEffectType.BURNING, duration: 4.5, damagePerTick: 10 }
  },
  [WeaponType.ARC_CANNON]: {
    name: WeaponType.ARC_CANNON, displayName: 'weapons.arc_cannon', category: WeaponCategory.SPECIAL, behavior: WeaponBehavior.CONTINUOUS,
    damage: 14, fireRate: 90, range: 15, spread: 0.05, magSize: 500,
    icon: PNG_PATH + 'arc_cannon.png', iconIsPng: true,
    piercing: true, pierceDecay: 0.5, impactType: EnemyDeathState.ELECTRIFIED, statusEffect: { type: StatusEffectType.ELECTRIFIED, duration: 2.5 }
  },

  // --- TOOL ---
  [WeaponType.RADIO]: {
    name: WeaponType.RADIO, displayName: 'weapons.radio', category: WeaponCategory.TOOL, behavior: WeaponBehavior.PROJECTILE,
    damage: 0, range: 0,
    icon: PNG_PATH + 'radio.png', iconIsPng: true,
    impactType: EnemyDeathState.SHOT, statusEffect: null
  }
};