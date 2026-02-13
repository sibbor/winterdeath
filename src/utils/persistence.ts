
import * as THREE from 'three';
import { GameState, GameScreen, WeaponType } from '../types';
import { INITIAL_STATS, DEFAULT_GRAPHICS } from '../content/constants';

export const DEFAULT_STATE: GameState = {
    screen: GameScreen.PROLOGUE,
    stats: INITIAL_STATS,
    currentSector: 0,
    loadout: { primary: WeaponType.RIFLE, secondary: WeaponType.REVOLVER, throwable: WeaponType.MOLOTOV },
    weaponLevels: {
        [WeaponType.PISTOL]: 1, [WeaponType.SMG]: 1, [WeaponType.SHOTGUN]: 1, [WeaponType.RIFLE]: 1,
        [WeaponType.REVOLVER]: 1, [WeaponType.GRENADE]: 1, [WeaponType.MOLOTOV]: 1, [WeaponType.MINIGUN]: 1, [WeaponType.RADIO]: 1, [WeaponType.FLASHBANG]: 1
    },
    sectorBriefing: '',
    debugMode: false,
    showFps: false,
    rescuedFamilyIndices: [],
    deadBossIndices: [],
    graphics: DEFAULT_GRAPHICS,
    weather: 'snow'
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
        weather: state.weather
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
                weather: loaded.weather || DEFAULT_STATE.weather
            };
            // Compatibility checks
            if (mergedState.stats.totalDistanceTraveled === undefined) mergedState.stats.totalDistanceTraveled = 0;
            if (mergedState.stats.cluesFound === undefined) mergedState.stats.cluesFound = [];
            if (mergedState.stats.totalBulletsHit === undefined) mergedState.stats.totalBulletsHit = 0;
            if (mergedState.stats.totalThrowablesThrown === undefined) mergedState.stats.totalThrowablesThrown = 0;
            if (mergedState.stats.seenEnemies === undefined) mergedState.stats.seenEnemies = [];
            if (mergedState.stats.seenBosses === undefined) mergedState.stats.seenBosses = [];
            if (mergedState.stats.visitedPOIs === undefined) mergedState.stats.visitedPOIs = [];
            if (mergedState.stats.collectiblesFound === undefined) mergedState.stats.collectiblesFound = [];

            // Migration for renamed fields
            if (loaded.familyMembersFound && mergedState.rescuedFamilyIndices.length === 0) {
                mergedState.rescuedFamilyIndices = loaded.familyMembersFound;
            }
            if (loaded.bossesDefeated && mergedState.deadBossIndices.length === 0) {
                mergedState.deadBossIndices = loaded.bossesDefeated;
            }

            return mergedState;
        } catch (e) {
            console.error("Save file corrupted, resetting.");
        }
    }
    return DEFAULT_STATE;
};

export const saveGameState = (state: GameState) => {
    localStorage.setItem(SAVE_KEY, JSON.stringify(getPersistentState(state)));
};

export const clearSave = () => {
    localStorage.removeItem(SAVE_KEY);
};