
import * as THREE from 'three';
import { GameState, GameScreen, WeaponType } from '../types';
import { INITIAL_STATS } from '../content/constants';

export const DEFAULT_STATE: GameState = {
    screen: GameScreen.CAMP,
    stats: INITIAL_STATS,
    currentMap: 0,
    loadout: { primary: WeaponType.SMG, secondary: WeaponType.PISTOL, throwable: WeaponType.GRENADE },
    weaponLevels: {
        [WeaponType.PISTOL]: 1, [WeaponType.SMG]: 1, [WeaponType.SHOTGUN]: 1, [WeaponType.RIFLE]: 1,
        [WeaponType.REVOLVER]: 1, [WeaponType.GRENADE]: 1, [WeaponType.MOLOTOV]: 1, [WeaponType.MINIGUN]: 1, [WeaponType.RADIO]: 1, [WeaponType.FLASHBANG]: 1
    },
    missionBriefing: '',
    debugMode: false,
    showFps: false,
    familyMembersFound: [],
    bossesDefeated: [],
    midRunCheckpoint: null,
    familySPAwarded: [],
    graphics: {
        pixelRatio: 1.25,
        antialias: true,
        shadows: true,
        shadowMapType: THREE.PCFShadowMap
    }
};

export const getPersistentState = (state: GameState) => {
    return {
        stats: state.stats,
        currentMap: state.currentMap,
        loadout: state.loadout,
        weaponLevels: state.weaponLevels,
        debugMode: state.debugMode,
        showFps: state.showFps,
        familyMembersFound: state.familyMembersFound,
        bossesDefeated: state.bossesDefeated,
        midRunCheckpoint: state.midRunCheckpoint,
        familySPAwarded: state.familySPAwarded,
        graphics: state.graphics
    };
};

export const loadGameState = (): GameState => {
    const saved = localStorage.getItem('slaughterNationSave_v10');
    if (saved) {
        try {
            const loaded = JSON.parse(saved);
            const mergedState = {
                ...DEFAULT_STATE,
                ...loaded,
                stats: { ...DEFAULT_STATE.stats, ...(loaded.stats || {}) },
                loadout: { ...DEFAULT_STATE.loadout, ...(loaded.loadout || {}) },
                weaponLevels: { ...DEFAULT_STATE.weaponLevels, ...(loaded.weaponLevels || {}) },
                screen: GameScreen.CAMP,
                debugMode: loaded.debugMode || false,
                showFps: loaded.showFps || false,
                graphics: { ...DEFAULT_STATE.graphics, ...(loaded.graphics || {}) }
            };
            // Compatibility checks
            if (mergedState.stats.totalDistanceTraveled === undefined) mergedState.stats.totalDistanceTraveled = 0;
            if (mergedState.stats.cluesFound === undefined) mergedState.stats.cluesFound = [];
            if (mergedState.stats.totalBulletsHit === undefined) mergedState.stats.totalBulletsHit = 0;
            if (mergedState.stats.totalThrowablesThrown === undefined) mergedState.stats.totalThrowablesThrown = 0;
            if (mergedState.familySPAwarded === undefined) mergedState.familySPAwarded = [];

            if (mergedState.midRunCheckpoint) {
                mergedState.currentMap = mergedState.midRunCheckpoint.mapIndex;
            }
            return mergedState;
        } catch (e) {
            console.error("Save file corrupted, resetting.");
        }
    }
    return DEFAULT_STATE;
};

export const saveGameState = (state: GameState) => {
    localStorage.setItem('slaughterNationSave_v10', JSON.stringify(getPersistentState(state)));
};

export const clearSave = () => {
    localStorage.removeItem('slaughterNationSave_v10');
};