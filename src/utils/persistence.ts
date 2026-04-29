import { GameState } from '../types/StateTypes';
import { GameScreen } from '../types/SessionTypes';
import { WeaponType } from '../content/weapons';
import { INITIAL_STATS, DEFAULT_SETTINGS, OVERRIDE_DEFAULT_SECTOR } from '../content/constants';
import { PlayerStatsUtils, PlayerStatID } from '../entities/player/PlayerTypes';
import { WeatherType } from '../core/engine/EngineTypes';

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
    weather: WeatherType.SNOW,
    environmentOverrides: {},
    midRunCheckpoint: null,
    sectorState: {
        unlimitedAmmo: false,
        noReload: false,
        unlimitedThrowables: false,
        isInvincible: false
    },
    sessionToken: 0
};

export const getPersistentState = (state: GameState) => {
    return {
        stats: {
            ...state.stats,
            statsBuffer: Array.from(state.stats.statsBuffer),
            effectDurations: Array.from(state.stats.effectDurations),
            effectMaxDurations: Array.from(state.stats.effectMaxDurations || []),
            effectIntensities: Array.from(state.stats.effectIntensities),
            weaponKills: Array.from(state.stats.weaponKills || []),
            weaponDamageDealt: Array.from(state.stats.weaponDamageDealt || []),
            weaponShotsFired: Array.from(state.stats.weaponShotsFired || []),
            weaponShotsHit: Array.from(state.stats.weaponShotsHit || []),
            weaponTimeActive: Array.from(state.stats.weaponTimeActive || []),
            weaponEngagementDistSq: Array.from(state.stats.weaponEngagementDistSq || []),
            perkTimesGained: Array.from(state.stats.perkTimesGained || []),
            perkDamageAbsorbed: Array.from(state.stats.perkDamageAbsorbed || []),
            perkDamageDealt: Array.from(state.stats.perkDamageDealt || []),
            perkDebuffsCleansed: Array.from(state.stats.perkDebuffsCleansed || []),
            enemyKills: Array.from(state.stats.enemyKills || [])
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
        sectorState: state.sectorState,
        sessionToken: state.sessionToken
    };
};

const SAVE_KEY = 'winterDeathSave_v1';

export const loadGameState = (): GameState => {
    const saved = localStorage.getItem(SAVE_KEY);
    let state: GameState;

    if (saved) {
        try {
            const loaded = JSON.parse(saved);
            state = {
                ...DEFAULT_STATE,
                ...loaded,
                stats: {
                    ...DEFAULT_STATE.stats,
                    ...(loaded.stats || {}),
                    statsBuffer: PlayerStatsUtils.deserializeStats(loaded.stats?.statsBuffer || Array.from(INITIAL_STATS.statsBuffer)),
                    effectDurations: new Float32Array(loaded.stats?.effectDurations || 32),
                    effectMaxDurations: new Float32Array(loaded.stats?.effectMaxDurations || 32),
                    effectIntensities: new Float32Array(loaded.stats?.effectIntensities || 32),
                    weaponKills: new Float64Array(loaded.stats?.weaponKills || 20),
                    weaponDamageDealt: new Float64Array(loaded.stats?.weaponDamageDealt || 20),
                    weaponShotsFired: new Float64Array(loaded.stats?.weaponShotsFired || 20),
                    weaponShotsHit: new Float64Array(loaded.stats?.weaponShotsHit || 20),
                    weaponTimeActive: new Float64Array(loaded.stats?.weaponTimeActive || 20),
                    weaponEngagementDistSq: new Float64Array(loaded.stats?.weaponEngagementDistSq || 20),
                    perkTimesGained: new Float64Array(loaded.stats?.perkTimesGained || 32),
                    perkDamageAbsorbed: new Float64Array(loaded.stats?.perkDamageAbsorbed || 32),
                    perkDamageDealt: new Float64Array(loaded.stats?.perkDamageDealt || 32),
                    perkDebuffsCleansed: new Float64Array(loaded.stats?.perkDebuffsCleansed || 32),
                    enemyKills: new Float64Array(loaded.stats?.enemyKills || 8)
                },
                loadout: (function() {
                    const saved = loaded.loadout;
                    if (!saved) return { ...DEFAULT_STATE.loadout };
                    
                    // VINTERDÖD FIX: If even one weapon is changed, we want to store all four slots.
                    // We ensure this by merging the saved state over the default state.
                    return {
                        primary: saved.primary || DEFAULT_STATE.loadout.primary,
                        secondary: saved.secondary || DEFAULT_STATE.loadout.secondary,
                        throwable: saved.throwable || DEFAULT_STATE.loadout.throwable,
                        special: saved.special || DEFAULT_STATE.loadout.special,
                    };
                })(),
                weaponLevels: { ...DEFAULT_STATE.weaponLevels, ...(loaded.weaponLevels || {}) },
                screen: loaded.stats?.prologueSeen ? GameScreen.CAMP : GameScreen.PROLOGUE,
                settings: { ...DEFAULT_STATE.settings, ...(loaded.settings || {}) },
                environmentOverrides: loaded.environmentOverrides || {},
                sectorState: loaded.sectorState || DEFAULT_STATE.sectorState,
            };

            // --- VINTERDÖD FIX: Sanitize Legacy/Corrupted Data ---
            const sb = state.stats.statsBuffer;
            // 1. Clamp Game Time (If played for 10 mins, it shouldn't be 100 hours)
            // 100 hours = 360,000s. We clamp to a reasonable max if the session count is low.
            const sessionCount = sb[PlayerStatID.TOTAL_SESSIONS_STARTED];
            const timeLimit = (sessionCount + 1) * 3600 * 2; // 2 hours per session is a very safe upper bound
            if (sb[PlayerStatID.TOTAL_GAME_TIME] > timeLimit && sessionCount < 10) {
                console.warn(`[Persistence] Clamping inflated game time from ${sb[PlayerStatID.TOTAL_GAME_TIME]}s to ${timeLimit}s`);
                sb[PlayerStatID.TOTAL_GAME_TIME] = timeLimit;
            }

            // 2. Fix Enemy Kill Buffer Size (Ensure we have space for TANK/BOMBER/BOSS)
            if (state.stats.enemyKills.length < 8) {
                const oldKills = state.stats.enemyKills;
                state.stats.enemyKills = new Float64Array(8);
                for (let i = 0; i < oldKills.length; i++) state.stats.enemyKills[i] = oldKills[i];
            }

        } catch (e) {
            console.error('Save file corrupted, resetting.');
            state = { ...DEFAULT_STATE };
        }
    } else {
        state = { ...DEFAULT_STATE };
    }

    // --- VINTERDÖD DEBUG OVERRIDE ---
    if (OVERRIDE_DEFAULT_SECTOR >= 0 && OVERRIDE_DEFAULT_SECTOR <= 4) {
        state.screen = GameScreen.SECTOR;
        state.currentSector = OVERRIDE_DEFAULT_SECTOR;
    }

    return state;
};

export const saveGameState = (state: GameState) => {
    localStorage.setItem(SAVE_KEY, JSON.stringify(getPersistentState(state)));
};

export const clearSave = () => {
    localStorage.removeItem(SAVE_KEY);
};