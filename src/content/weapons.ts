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
  icon: string;          // SVG string for UI rendering
  piercing: boolean;     // If true, projectile passes through enemies
  pierceDecay: number;   // Damage multiplier per hit (e.g. 0.7)

  // Death Mapping
  // Maps directly to EnemyAI.deathState
  impactType: 'shot' | 'gib' | 'exploded' | 'burning' | 'electrified';
  statusEffect: StatusEffect;
}

// --- SVG ICONS ---

const ICONS = {
  SMG: `<svg viewBox="0 0 100 100" fill="white"><path d="M10 40h50v20H10zM60 45h30v10H60zM20 60h15v25H20zM60 60h10v20H60z"/></svg>`,
  SHOTGUN: `<svg viewBox="0 0 100 100" fill="white"><path d="M5 40h80v15H5zM10 55h20v15H10zM40 55h30v5H40z"/></svg>`,
  RIFLE: `<svg viewBox="0 0 100 100" fill="white"><path d="M5 42h40v16H5zM45 45h50v10H45zM10 58h15v20H10zM55 55h5v15h-5z"/></svg>`,
  PISTOL: `<svg viewBox="0 0 100 100" fill="white"><path d="M10 30h50v15H10zM10 45h20v30H10z"/></svg>`,
  REVOLVER: `<svg viewBox="0 0 100 100" fill="white"><path d="M10 30h40v10H10zM50 25h15v20H50zM10 40h20v35H10zM70 32h20v6H70z"/></svg>`,
  GRENADE: `<svg viewBox="0 0 100 100" fill="white"><circle cx="50" cy="55" r="30"/><rect x="40" y="15" width="20" height="15"/><circle cx="65" cy="25" r="5" fill="none" stroke="white" stroke-width="3"/></svg>`,
  MOLOTOV: `<svg viewBox="0 0 100 100" fill="white"><path d="M35 40h30v50H35zM42 10h16v30H42z"/><path d="M45 5l5-5 5 5z" opacity="0.7"/></svg>`,
  FLASHBANG: `<svg viewBox="0 0 100 100" fill="white"><rect x="35" y="30" width="30" height="50" rx="2"/><rect x="40" y="15" width="20" height="15"/><path d="M40 30 L60 80" stroke="black" stroke-width="2"/><circle cx="65" cy="25" r="5" fill="none" stroke="white" stroke-width="3"/></svg>`,
  MINIGUN: `<svg viewBox="0 0 100 100" fill="white"><rect x="10" y="30" width="40" height="40"/><rect x="50" y="35" width="45" height="5"/><rect x="50" y="45" width="45" height="5"/><rect x="50" y="55" width="45" height="5"/><rect x="20" y="70" width="10" height="20"/></svg>`,
  FLAMETHROWER: `<svg viewBox="0 0 100 100" fill="white"><rect x="10" y="40" width="30" height="20"/><rect x="40" y="45" width="45" height="10"/><path d="M85 40l10 10-10 10z" fill="#ff4400"/></svg>`,
  ARC_CANNON: `<svg viewBox="0 0 100 100" fill="white"><rect x="15" y="35" width="35" height="30"/><circle cx="60" cy="50" r="10"/><path d="M70 50h25" stroke="cyan" stroke-width="3" stroke-dasharray="4"/></svg>`,
  RADIO: `<svg viewBox="0 0 100 100" fill="white"><rect x="20" y="30" width="60" height="50" rx="5"/><line x1="30" y1="30" x2="30" y2="10" stroke="white" stroke-width="4"/><circle cx="30" cy="10" r="4"/><circle cx="60" cy="55" r="15" fill="none" stroke="white" stroke-width="3"/><rect x="30" y="40" width="40" height="5"/></svg>`
};

const NO_EFFECT: StatusEffect = { type: 'none', duration: 0 };

// --- DATABASE ---

export const WEAPONS: Record<string, WeaponStats> = {
  // --- PRIMARY ---
  [WeaponType.SMG]: {
    name: WeaponType.SMG, displayName: 'weapons.smg', category: WeaponCategory.PRIMARY, behavior: WeaponBehavior.PROJECTILE,
    damage: 12, baseDamage: 12, fireRate: 100, bulletSpeed: 70, magSize: 30, reloadTime: 2000, range: 12, spread: 0.18, color: '#ef4444', icon: ICONS.SMG,
    piercing: false, pierceDecay: 1.0, impactType: 'shot', statusEffect: NO_EFFECT
  },
  [WeaponType.SHOTGUN]: {
    name: WeaponType.SHOTGUN, displayName: 'weapons.shotgun', category: WeaponCategory.PRIMARY, behavior: WeaponBehavior.PROJECTILE,
    damage: 15, baseDamage: 15, fireRate: 1000, bulletSpeed: 55, magSize: 6, reloadTime: 3000, range: 8, spread: 0.35, color: '#ef4444', icon: ICONS.SHOTGUN,
    piercing: false, pierceDecay: 1.0, impactType: 'gib', statusEffect: NO_EFFECT
  },
  [WeaponType.RIFLE]: {
    name: WeaponType.RIFLE, displayName: 'weapons.rifle', category: WeaponCategory.PRIMARY, behavior: WeaponBehavior.PROJECTILE,
    damage: 35, baseDamage: 35, fireRate: 200, bulletSpeed: 90, magSize: 25, reloadTime: 2500, range: 20, spread: 0.04, color: '#ef4444', icon: ICONS.RIFLE,
    piercing: false, pierceDecay: 1.0, impactType: 'shot', statusEffect: NO_EFFECT
  },

  // --- SECONDARY ---
  [WeaponType.PISTOL]: {
    name: WeaponType.PISTOL, displayName: 'weapons.pistol', category: WeaponCategory.SECONDARY, behavior: WeaponBehavior.PROJECTILE,
    damage: 25, baseDamage: 25, fireRate: 400, bulletSpeed: 65, magSize: 12, reloadTime: 1500, range: 15, spread: 0.05, color: '#fbbf24', icon: ICONS.PISTOL,
    piercing: false, pierceDecay: 1.0, impactType: 'shot', statusEffect: NO_EFFECT
  },
  [WeaponType.REVOLVER]: {
    name: WeaponType.REVOLVER, displayName: 'weapons.revolver', category: WeaponCategory.SECONDARY, behavior: WeaponBehavior.PROJECTILE,
    damage: 85, baseDamage: 85, fireRate: 850, bulletSpeed: 85, magSize: 6, reloadTime: 2500, range: 25, spread: 0.01, color: '#fbbf24', icon: ICONS.REVOLVER,
    piercing: true, pierceDecay: 0.7, impactType: 'gib', statusEffect: NO_EFFECT
  },

  // --- THROWABLE ---
  [WeaponType.GRENADE]: {
    name: WeaponType.GRENADE, displayName: 'weapons.grenade', category: WeaponCategory.THROWABLE, behavior: WeaponBehavior.THROWABLE,
    damage: 180, baseDamage: 180, fireRate: 5, bulletSpeed: 0, magSize: 5, reloadTime: 0, range: 10, spread: 0, color: '#10b981', icon: ICONS.GRENADE,
    piercing: false, pierceDecay: 1.0, impactType: 'exploded', statusEffect: NO_EFFECT
  },
  [WeaponType.MOLOTOV]: {
    name: WeaponType.MOLOTOV, displayName: 'weapons.molotov', category: WeaponCategory.THROWABLE, behavior: WeaponBehavior.THROWABLE,
    damage: 15, baseDamage: 15, fireRate: 4, bulletSpeed: 0, magSize: 5, reloadTime: 0, range: 12, spread: 0, color: '#10b981', icon: ICONS.MOLOTOV,
    piercing: true, pierceDecay: 1.0, impactType: 'burning', statusEffect: { type: 'burning', duration: 5.0, damagePerTick: 12 }
  },
  [WeaponType.FLASHBANG]: {
    name: WeaponType.FLASHBANG, displayName: 'weapons.flashbang', category: WeaponCategory.THROWABLE, behavior: WeaponBehavior.THROWABLE,
    damage: 0, baseDamage: 0, fireRate: 10, bulletSpeed: 0, magSize: 5, reloadTime: 0, range: 12, spread: 0, color: '#10b981', icon: ICONS.FLASHBANG,
    piercing: false, pierceDecay: 1.0, impactType: 'shot', statusEffect: { type: 'stun', duration: 3.5 }
  },

  // --- SPECIAL ---
  [WeaponType.MINIGUN]: {
    name: WeaponType.MINIGUN, displayName: 'weapons.minigun', category: WeaponCategory.SPECIAL, behavior: WeaponBehavior.PROJECTILE,
    damage: 18, baseDamage: 18, fireRate: 50, bulletSpeed: 75, magSize: 200, reloadTime: 5000, range: 25, spread: 0.18, color: '#3b82f6', icon: ICONS.MINIGUN,
    piercing: false, pierceDecay: 1.0, impactType: 'shot', statusEffect: NO_EFFECT
  },
  [WeaponType.FLAMETHROWER]: {
    name: WeaponType.FLAMETHROWER, displayName: 'weapons.flamethrower', category: WeaponCategory.SPECIAL, behavior: WeaponBehavior.CONTINUOUS,
    damage: 6, baseDamage: 6, fireRate: 35, bulletSpeed: 30, magSize: 100, reloadTime: 4000, range: 10, spread: 0.25, color: '#ff4400', icon: ICONS.FLAMETHROWER,
    piercing: true, pierceDecay: 1.0, impactType: 'burning', statusEffect: { type: 'burning', duration: 4.5, damagePerTick: 10 }
  },
  [WeaponType.ARC_CANNON]: {
    name: WeaponType.ARC_CANNON, displayName: 'weapons.arc_cannon', category: WeaponCategory.SPECIAL, behavior: WeaponBehavior.CONTINUOUS,
    damage: 14, baseDamage: 14, fireRate: 90, bulletSpeed: 100, magSize: 60, reloadTime: 3500, range: 15, spread: 0.05, color: '#00ffff', icon: ICONS.ARC_CANNON,
    piercing: true, pierceDecay: 0.5, impactType: 'electrified', statusEffect: { type: 'electrified', duration: 2.5 }
  },

  // --- TOOL ---
  [WeaponType.RADIO]: {
    name: WeaponType.RADIO, displayName: 'weapons.radio', category: WeaponCategory.TOOL, behavior: WeaponBehavior.PROJECTILE,
    damage: 0, baseDamage: 0, fireRate: 0, bulletSpeed: 0, magSize: 0, reloadTime: 0, range: 0, spread: 0, color: '#3b82f6', icon: ICONS.RADIO,
    piercing: false, pierceDecay: 1.0, impactType: 'shot', statusEffect: NO_EFFECT
  }
};