
import * as THREE from 'three';
import { GameState, GameScreen } from '../types';
import { WeaponType } from '../content/weapons';
import { INITIAL_STATS, DEFAULT_GRAPHICS } from '../content/constants';

export const DEFAULT_STATE: GameState = {
    screen: GameScreen.PROLOGUE,
    stats: INITIAL_STATS,
    currentSector: 0,
    loadout: { primary: WeaponType.RIFLE, secondary: WeaponType.REVOLVER, throwable: WeaponType.MOLOTOV, special: WeaponType.ARC_CANNON },
    weaponLevels: {
        [WeaponType.PISTOL]: 1,
        [WeaponType.SMG]: 1,
        [WeaponType.SHOTGUN]: 1,
        [WeaponType.RIFLE]: 1,
        [WeaponType.REVOLVER]: 1,
        [WeaponType.GRENADE]: 1,
        [WeaponType.MOLOTOV]: 1,
        [WeaponType.MINIGUN]: 1,
        [WeaponType.RADIO]: 1,
        [WeaponType.FLASHBANG]: 1,
        [WeaponType.FLAMETHROWER]: 1,
        [WeaponType.ARC_CANNON]: 1,
        [WeaponType.NONE]: 0
    },
    sectorBriefing: '',
    debugMode: false,
    showFps: false,
    rescuedFamilyIndices: [],
    deadBossIndices: [],
    graphics: DEFAULT_GRAPHICS,
    weather: 'snow',
    environmentOverrides: {}
};

export const getPersistentState = (state: GameState) => {
    return {
        stats: state.stats,
        currentSector: state.currentSector,
        loadout: state.loadout,
        weaponLevels: state.weaponLevels,
        debugMode: state.debugMode,
        showFps: state.showFps,
        rescuedFamilyIndices: state.rescuedFamilyIndices,
        deadBossIndices: state.deadBossIndices,
        graphics: state.graphics,
        weather: state.weather,
        environmentOverrides: state.environmentOverrides
    };
};

const SAVE_KEY = 'winterDeathSave_v1';

export const loadGameState = (): GameState => {
    const saved = localStorage.getItem(SAVE_KEY);
    if (saved) {
        try {
            const loaded = JSON.parse(saved);
            const mergedState = {
                ...DEFAULT_STATE,
                ...loaded,
                stats: { ...DEFAULT_STATE.stats, ...(loaded.stats || {}) },
                loadout: { ...DEFAULT_STATE.loadout, ...(loaded.loadout || {}) },
                weaponLevels: { ...DEFAULT_STATE.weaponLevels, ...(loaded.weaponLevels || {}) },
                screen: loaded.stats?.prologueSeen ? GameScreen.CAMP : GameScreen.PROLOGUE,
                debugMode: loaded.debugMode || false,
                showFps: loaded.showFps || false,
                graphics: { ...DEFAULT_STATE.graphics, ...(loaded.graphics || {}) },
                weather: loaded.weather || DEFAULT_STATE.weather,
                environmentOverrides: loaded.environmentOverrides || {}
            };
            // Compatibility checks
            if (mergedState.stats.totalDistanceTraveled === undefined) mergedState.stats.totalDistanceTraveled = 0;
            if (mergedState.stats.cluesFound === undefined) mergedState.stats.cluesFound = [];
            if (mergedState.stats.totalBulletsHit === undefined) mergedState.stats.totalBulletsHit = 0;
            if (mergedState.stats.totalThrowablesThrown === undefined) mergedState.stats.totalThrowablesThrown = 0;
            if (mergedState.stats.seenEnemies === undefined) mergedState.stats.seenEnemies = [];
            if (mergedState.stats.seenBosses === undefined) mergedState.stats.seenBosses = [];
            if (mergedState.stats.discoveredPOIs === undefined) mergedState.stats.discoveredPOIs = [];
            if (mergedState.stats.collectiblesDiscovered === undefined) mergedState.stats.collectiblesDiscovered = [];

            // Migration for renamed fields
            if (loaded.familyMembersFound && mergedState.rescuedFamilyIndices.length === 0) {
                mergedState.rescuedFamilyIndices = loaded.familyMembersFound;
            }
            if (loaded.bossesDefeated && mergedState.deadBossIndices.length === 0) {
                mergedState.deadBossIndices = loaded.bossesDefeated;
            }

            // Ensure special slot exists
            if (!mergedState.loadout.special) {
                mergedState.loadout.special = WeaponType.NONE;
            }

            // Sanitize stats to prevent NaN values (especially after upgrades)
            sanitizeStats(mergedState.stats);

            return mergedState;
        } catch (e) {
            console.error("Save file corrupted, resetting.");
        }
    }
    return DEFAULT_STATE;
};

const sanitizeStats = (stats: any) => {
    if (!stats) return;
    const hp = Number(stats.hp);
    const maxHp = Number(stats.maxHp);
    const st = Number(stats.stamina);
    const maxSt = Number(stats.maxStamina);

    if (isNaN(maxHp) || maxHp < 100) stats.maxHp = 100;
    if (isNaN(hp) || hp <= 0 || hp > stats.maxHp) stats.hp = stats.maxHp;

    if (isNaN(maxSt) || maxSt < 100) stats.maxStamina = 100;
    if (isNaN(st) || st < 0 || st > stats.maxStamina) stats.stamina = stats.maxStamina;

    // Ensure numeric types for other critical stats
    if (isNaN(stats.skillPoints)) stats.skillPoints = 0;
    if (isNaN(stats.level)) stats.level = 1;
};

export const saveGameState = (state: GameState) => {
    localStorage.setItem(SAVE_KEY, JSON.stringify(getPersistentState(state)));
};

export const clearSave = () => {
    localStorage.removeItem(SAVE_KEY);
};