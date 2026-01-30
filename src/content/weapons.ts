
import { WeaponType, WeaponStats, WeaponCategory } from '../types';

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
  RADIO: `<svg viewBox="0 0 100 100" fill="white"><rect x="20" y="30" width="60" height="50" rx="5"/><line x1="30" y1="30" x2="30" y2="10" stroke="white" stroke-width="4"/><circle cx="30" cy="10" r="4"/><circle cx="60" cy="55" r="15" fill="none" stroke="white" stroke-width="3"/><rect x="30" y="40" width="40" height="5"/></svg>`
};

export const WEAPONS: Record<WeaponType, WeaponStats> = {
  [WeaponType.SMG]: { name: WeaponType.SMG, displayName: 'weapons.smg', category: WeaponCategory.PRIMARY, baseDamage: 12, damage: 12, fireRate: 100, magSize: 30, reloadTime: 2000, range: 12, spread: 0.15, color: '#ef4444', icon: ICONS.SMG },
  [WeaponType.SHOTGUN]: { name: WeaponType.SHOTGUN, displayName: 'weapons.shotgun', category: WeaponCategory.PRIMARY, baseDamage: 15, damage: 15, fireRate: 1000, magSize: 6, reloadTime: 3000, range: 8, spread: 0.35, color: '#b91c1c', icon: ICONS.SHOTGUN },
  [WeaponType.RIFLE]: { name: WeaponType.RIFLE, displayName: 'weapons.rifle', category: WeaponCategory.PRIMARY, baseDamage: 35, damage: 35, fireRate: 200, magSize: 25, reloadTime: 2500, range: 20, spread: 0.02, color: '#dc2626', icon: ICONS.RIFLE },
  [WeaponType.PISTOL]: { name: WeaponType.PISTOL, displayName: 'weapons.pistol', category: WeaponCategory.SECONDARY, baseDamage: 25, damage: 25, fireRate: 400, magSize: 12, reloadTime: 1500, range: 15, spread: 0.05, color: '#fbbf24', icon: ICONS.PISTOL },
  [WeaponType.REVOLVER]: { name: WeaponType.REVOLVER, displayName: 'weapons.revolver', category: WeaponCategory.SECONDARY, baseDamage: 60, damage: 60, fireRate: 800, magSize: 6, reloadTime: 2500, range: 25, spread: 0.01, color: '#d97706', icon: ICONS.REVOLVER },
  [WeaponType.GRENADE]: { name: WeaponType.GRENADE, displayName: 'weapons.grenade', category: WeaponCategory.THROWABLE, baseDamage: 150, damage: 150, fireRate: 5, magSize: 3, reloadTime: 0, range: 20, spread: 0, color: '#10b981', icon: ICONS.GRENADE },
  [WeaponType.MOLOTOV]: { name: WeaponType.MOLOTOV, displayName: 'weapons.molotov', category: WeaponCategory.THROWABLE, baseDamage: 10, damage: 10, fireRate: 4, magSize: 3, reloadTime: 0, range: 18, spread: 0, color: '#f59e0b', icon: ICONS.MOLOTOV },
  [WeaponType.FLASHBANG]: { name: WeaponType.FLASHBANG, displayName: 'weapons.flashbang', category: WeaponCategory.THROWABLE, baseDamage: 0, damage: 0, fireRate: 10, magSize: 4, reloadTime: 0, range: 20, spread: 0, color: '#e2e8f0', icon: ICONS.FLASHBANG },
  [WeaponType.MINIGUN]: { name: WeaponType.MINIGUN, displayName: 'weapons.minigun', category: WeaponCategory.SPECIAL, baseDamage: 15, damage: 15, fireRate: 50, magSize: 200, reloadTime: 5000, range: 25, spread: 0.2, color: '#7c3aed', icon: ICONS.MINIGUN },
  [WeaponType.RADIO]: { name: WeaponType.RADIO, displayName: 'weapons.radio', category: WeaponCategory.TOOL, baseDamage: 0, damage: 0, fireRate: 0, magSize: 0, reloadTime: 0, range: 0, spread: 0, color: '#3b82f6', icon: ICONS.RADIO }
};
