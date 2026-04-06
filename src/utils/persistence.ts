import { GameState, GameScreen } from '../game/session/SessionTypes';
import { WeaponType } from '../content/weapons';
import { INITIAL_STATS, DEFAULT_SETTINGS } from '../content/constants';
import { PlayerStatsUtils } from '../entities/player/PlayerTypes';

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
        [WeaponType.RUSH]: 1,
        [WeaponType.VEHICLE]: 1,
        [WeaponType.NONE]: 0
    },
    sectorBriefing: '',
    debugMode: true,
    showFps: false,
    rescuedFamilyIndices: [],
    deadBossIndices: [],
    settings: DEFAULT_SETTINGS,
    weather: 'snow',
    environmentOverrides: {},
    midRunCheckpoint: null,
    sectorState: {
        unlimitedAmmo: false,
        noReload: false,
        unlimitedThrowables: false,
        isInvincible: false
    }
};

export const getPersistentState = (state: GameState) => {
    return {
        stats: {
            ...state.stats,
            statsBuffer: Array.from(state.stats.statsBuffer),
            effectDurations: Array.from(state.stats.effectDurations),
            effectIntensities: Array.from(state.stats.effectIntensities)
        },
        currentSector: state.currentSector,
        loadout: state.loadout,
        weaponLevels: state.weaponLevels,
        debugMode: state.debugMode,
        showFps: state.showFps,
        rescuedFamilyIndices: state.rescuedFamilyIndices,
        deadBossIndices: state.deadBossIndices,
        settings: state.settings,
        weather: state.weather,
        environmentOverrides: state.environmentOverrides,
        sectorState: state.sectorState
    };
};

const SAVE_KEY = 'winterDeathSave_v1';

export const loadGameState = (): GameState => {
    const saved = localStorage.getItem(SAVE_KEY);
    if (saved) {
        try {
            const loaded = JSON.parse(saved);
            return {
                ...DEFAULT_STATE,
                ...loaded,
                stats: {
                    ...DEFAULT_STATE.stats,
                    ...(loaded.stats || {}),
                    statsBuffer: PlayerStatsUtils.deserializeStats(loaded.stats?.statsBuffer || Array.from(INITIAL_STATS.statsBuffer)),
                    effectDurations: new Float32Array(loaded.stats?.effectDurations || 14),
                    effectIntensities: new Float32Array(loaded.stats?.effectIntensities || 14)
                },
                loadout: { ...DEFAULT_STATE.loadout, ...(loaded.loadout || {}) },
                weaponLevels: { ...DEFAULT_STATE.weaponLevels, ...(loaded.weaponLevels || {}) },
                screen: loaded.stats?.prologueSeen ? GameScreen.CAMP : GameScreen.PROLOGUE,
                settings: { ...DEFAULT_STATE.settings, ...(loaded.settings || {}) },
                environmentOverrides: loaded.environmentOverrides || {},
                sectorState: loaded.sectorState || DEFAULT_STATE.sectorState,
            };
        } catch (e) {
            console.error('Save file corrupted, resetting.');
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