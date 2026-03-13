import * as THREE from 'three';

// --- ENUMS ---

export enum WeaponCategory {
  PRIMARY = 'PRIMARY',
  SECONDARY = 'SECONDARY',
  THROWABLE = 'THROWABLE',
  SPECIAL = 'SPECIAL',
  TOOL = 'TOOL'
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

// --- INTERFACES ---

export interface StatusEffect {
  type: 'burning' | 'electrified' | 'stun' | 'none';
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
  baseDamage: number;
  fireRate: number;      // ms between shots
  bulletSpeed: number;   // Travel speed (Fixes TS error)
  magSize: number;
  reloadTime: number;    // ms
  range: number;
  spread: number;        // Accuracy deviation

  // Logic & Visuals
  color: string;
  icon: string;          // PNG filename
  iconIsPng?: boolean;   // Flag to indicate PNG icon
  piercing: boolean;     // If true, projectile passes through enemies
  pierceDecay: number;   // Damage multiplier per hit (e.g. 0.7)

  // Death Mapping
  // Maps directly to EnemyAI.deathState
  impactType: 'SHOT' | 'GIBBED' | 'EXPLODED' | 'BURNED' | 'ELECTRIFIED';
  statusEffect: StatusEffect;
}

const PNG_PATH = '/assets/icons/weapons/';

const NO_EFFECT: StatusEffect = { type: 'none', duration: 0 };

// --- DATABASE ---

export const WEAPONS: Record<string, WeaponStats> = {
  // --- PRIMARY ---
  [WeaponType.SMG]: {
    name: WeaponType.SMG, displayName: 'weapons.smg', category: WeaponCategory.PRIMARY, behavior: WeaponBehavior.PROJECTILE,
    damage: 12, baseDamage: 12, fireRate: 100, bulletSpeed: 70, magSize: 30, reloadTime: 2000, range: 12, spread: 0.18, color: '#ef4444',
    icon: PNG_PATH + 'smg.png', iconIsPng: true,
    piercing: false, pierceDecay: 1.0, impactType: 'SHOT', statusEffect: NO_EFFECT
  },
  [WeaponType.SHOTGUN]: {
    name: WeaponType.SHOTGUN, displayName: 'weapons.shotgun', category: WeaponCategory.PRIMARY, behavior: WeaponBehavior.PROJECTILE,
    damage: 15, baseDamage: 15, fireRate: 1000, bulletSpeed: 55, magSize: 6, reloadTime: 3000, range: 8, spread: 0.35, color: '#ef4444',
    icon: PNG_PATH + 'shotgun.png', iconIsPng: true,
    piercing: false, pierceDecay: 1.0, impactType: 'GIBBED', statusEffect: NO_EFFECT
  },
  [WeaponType.RIFLE]: {
    name: WeaponType.RIFLE, displayName: 'weapons.rifle', category: WeaponCategory.PRIMARY, behavior: WeaponBehavior.PROJECTILE,
    damage: 35, baseDamage: 35, fireRate: 200, bulletSpeed: 90, magSize: 25, reloadTime: 2500, range: 20, spread: 0.04, color: '#ef4444',
    icon: PNG_PATH + 'rifle.png', iconIsPng: true,
    piercing: false, pierceDecay: 1.0, impactType: 'SHOT', statusEffect: NO_EFFECT
  },

  // --- SECONDARY ---
  [WeaponType.PISTOL]: {
    name: WeaponType.PISTOL, displayName: 'weapons.pistol', category: WeaponCategory.SECONDARY, behavior: WeaponBehavior.PROJECTILE,
    damage: 25, baseDamage: 25, fireRate: 400, bulletSpeed: 65, magSize: 12, reloadTime: 1500, range: 15, spread: 0.05, color: '#fbbf24',
    icon: PNG_PATH + 'pistol.png', iconIsPng: true,
    piercing: false, pierceDecay: 1.0, impactType: 'SHOT', statusEffect: NO_EFFECT
  },
  [WeaponType.REVOLVER]: {
    name: WeaponType.REVOLVER, displayName: 'weapons.revolver', category: WeaponCategory.SECONDARY, behavior: WeaponBehavior.PROJECTILE,
    damage: 85, baseDamage: 85, fireRate: 850, bulletSpeed: 85, magSize: 6, reloadTime: 2500, range: 25, spread: 0.01, color: '#fbbf24',
    icon: PNG_PATH + 'revolver.png', iconIsPng: true,
    piercing: true, pierceDecay: 0.7, impactType: 'GIBBED', statusEffect: NO_EFFECT
  },

  // --- THROWABLE ---
  [WeaponType.GRENADE]: {
    name: WeaponType.GRENADE, displayName: 'weapons.grenade', category: WeaponCategory.THROWABLE, behavior: WeaponBehavior.THROWABLE,
    damage: 180, baseDamage: 180, fireRate: 5, bulletSpeed: 0, magSize: 5, reloadTime: 0, range: 10, spread: 0, color: '#10b981',
    icon: PNG_PATH + 'grenade.png', iconIsPng: true,
    piercing: false, pierceDecay: 1.0, impactType: 'EXPLODED', statusEffect: NO_EFFECT
  },
  [WeaponType.MOLOTOV]: {
    name: WeaponType.MOLOTOV, displayName: 'weapons.molotov', category: WeaponCategory.THROWABLE, behavior: WeaponBehavior.THROWABLE,
    damage: 15, baseDamage: 15, fireRate: 4, bulletSpeed: 0, magSize: 5, reloadTime: 0, range: 12, spread: 0, color: '#10b981',
    icon: PNG_PATH + 'molotov.png', iconIsPng: true,
    piercing: true, pierceDecay: 1.0, impactType: 'BURNED', statusEffect: { type: 'burning', duration: 5.0, damagePerTick: 5 }
  },
  [WeaponType.FLASHBANG]: {
    name: WeaponType.FLASHBANG, displayName: 'weapons.flashbang', category: WeaponCategory.THROWABLE, behavior: WeaponBehavior.THROWABLE,
    damage: 0, baseDamage: 0, fireRate: 10, bulletSpeed: 0, magSize: 5, reloadTime: 0, range: 12, spread: 0, color: '#10b981',
    icon: PNG_PATH + 'flashbang.png', iconIsPng: true,
    piercing: false, pierceDecay: 1.0, impactType: 'SHOT', statusEffect: { type: 'stun', duration: 3.5 }
  },

  // --- SPECIAL ---
  [WeaponType.MINIGUN]: {
    name: WeaponType.MINIGUN, displayName: 'weapons.minigun', category: WeaponCategory.SPECIAL, behavior: WeaponBehavior.PROJECTILE,
    damage: 18, baseDamage: 18, fireRate: 50, bulletSpeed: 75, magSize: 200, reloadTime: 5000, range: 25, spread: 0.18, color: '#3b82f6',
    icon: PNG_PATH + 'minigun.png', iconIsPng: true,
    piercing: false, pierceDecay: 1.0, impactType: 'SHOT', statusEffect: NO_EFFECT
  },
  [WeaponType.FLAMETHROWER]: {
    name: WeaponType.FLAMETHROWER, displayName: 'weapons.flamethrower', category: WeaponCategory.SPECIAL, behavior: WeaponBehavior.CONTINUOUS,
    damage: 6, baseDamage: 6, fireRate: 35, bulletSpeed: 30, magSize: 100, reloadTime: 4000, range: 10, spread: 0.25, color: '#ff4400',
    icon: PNG_PATH + 'flamethrower.png', iconIsPng: true,
    piercing: true, pierceDecay: 1.0, impactType: 'BURNED', statusEffect: { type: 'burning', duration: 4.5, damagePerTick: 10 }
  },
  [WeaponType.ARC_CANNON]: {
    name: WeaponType.ARC_CANNON, displayName: 'weapons.arc_cannon', category: WeaponCategory.SPECIAL, behavior: WeaponBehavior.CONTINUOUS,
    damage: 14, baseDamage: 14, fireRate: 90, bulletSpeed: 100, magSize: 60, reloadTime: 3500, range: 15, spread: 0.05, color: '#00ffff',
    icon: PNG_PATH + 'arc_cannon.png', iconIsPng: true,
    piercing: true, pierceDecay: 0.5, impactType: 'ELECTRIFIED', statusEffect: { type: 'electrified', duration: 2.5 }
  },

  // --- TOOL ---
  [WeaponType.RADIO]: {
    name: WeaponType.RADIO, displayName: 'weapons.radio', category: WeaponCategory.TOOL, behavior: WeaponBehavior.PROJECTILE,
    damage: 0, baseDamage: 0, fireRate: 0, bulletSpeed: 0, magSize: 0, reloadTime: 0, range: 0, spread: 0, color: '#3b82f6',
    icon: PNG_PATH + 'radio.png', iconIsPng: true,
    piercing: false, pierceDecay: 1.0, impactType: 'SHOT', statusEffect: NO_EFFECT
  }
};