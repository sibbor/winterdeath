import { GameState } from '../types/StateTypes';
import { GameScreen } from '../types/SessionTypes';
import { WeaponID } from '../entities/player/CombatTypes';
import { INITIAL_STATS, DEFAULT_SETTINGS, OVERRIDE_DEFAULT_SECTOR, MAX_ENTITIES } from '../content/constants';
import { PlayerStatID, StatWeaponIndex, StatEnemyIndex, StatPerkIndex, TELEMETRY_BUFFER_SIZE } from '../entities/player/PlayerTypes';
import { WeatherType } from '../core/engine/EngineTypes';

export const DEFAULT_STATE: GameState = {
    screen: GameScreen.PROLOGUE,
    stats: INITIAL_STATS,
    currentSector: 0,
    loadout: { primary: WeaponID.RIFLE, secondary: WeaponID.REVOLVER, throwable: WeaponID.MOLOTOV, special: WeaponID.ARC_CANNON },
    weaponLevels: {
        [WeaponID.PISTOL]: 1,
        [WeaponID.SMG]: 1,
        [WeaponID.SHOTGUN]: 1,
        [WeaponID.RIFLE]: 1,
        [WeaponID.REVOLVER]: 1,
        [WeaponID.GRENADE]: 1,
        [WeaponID.MOLOTOV]: 1,
        [WeaponID.MINIGUN]: 1,
        [WeaponID.FLASHBANG]: 1,
        [WeaponID.FLAMETHROWER]: 1,
        [WeaponID.ARC_CANNON]: 1,
    },
    sectorBriefing: '',
    debugMode: true,
    showFps: false,
    rescuedFamilyIndices: [],
    deadBossIndices: [],
    settings: DEFAULT_SETTINGS,
    weather: WeatherType.SNOW,
    environmentOverrides: {},
    sectorState: {
        unlimitedAmmo: false,
        noReload: false,
        unlimitedThrowables: false,
        isInvincible: false
    },
    sessionToken: 0
};

export const getPersistentState = (state: GameState) => {
    const s = state.stats;
    return {
        stats: {
            // Pick only serializable core fields
            statusFlags: s.statusFlags,
            activePassives: [...s.activePassives],
            activeBuffs: [...s.activeBuffs],
            activeDebuffs: [...s.activeDebuffs],
            sectorsCompleted: s.sectorsCompleted,
            totalSkillPointsEarned: s.totalSkillPointsEarned,
            discoveredCollectibles: [...(s.discoveredCollectibles || [])],
            viewedCollectibles: s.viewedCollectibles ? [...s.viewedCollectibles] : [],
            discoveredClues: [...(s.discoveredClues || [])],
            mostUsedWeapon: s.mostUsedWeapon,
            totalEnemiesKilled: s.totalEnemiesKilled,
            discoveredZombies: [...(s.discoveredZombies || [])],
            discoveredBosses: [...(s.discoveredBosses || [])],
            discoveredPois: [...(s.discoveredPois || [])],
            prologueSeen: s.prologueSeen,
            rescuedFamilyIndices: [...s.rescuedFamilyIndices],
            deadBossIndices: [...s.deadBossIndices],
            familyFoundCount: s.familyFoundCount,
            totalChallengePoints: s.totalChallengePoints,
            trackedChallengeIds: [...s.trackedChallengeIds],

            // Serialize Buffers
            statsBuffer: Array.from(s.statsBuffer),
            effectDurations: Array.from(s.effectDurations),
            effectMaxDurations: Array.from(s.effectMaxDurations || []),
            effectIntensities: Array.from(s.effectIntensities),
            weaponKills: Array.from(s.weaponKills || []),
            weaponDamageDealt: Array.from(s.weaponDamageDealt || []),
            weaponShotsFired: Array.from(s.weaponShotsFired || []),
            weaponShotsHit: Array.from(s.weaponShotsHit || []),
            weaponTimeActive: Array.from(s.weaponTimeActive || []),
            weaponEngagementDistSq: Array.from(s.weaponEngagementDistSq || []),
            perkTimesGained: Array.from(s.perkTimesGained || []),
            perkDamageAbsorbed: Array.from(s.perkDamageAbsorbed || []),
            perkDamageDealt: Array.from(s.perkDamageDealt || []),
            perkDebuffsCleansed: Array.from(s.perkDebuffsCleansed || []),
            enemyKills: Array.from(s.enemyKills || []),
            deathsByEnemyType: Array.from(s.deathsByEnemyType || []),
            incomingDamageBuffer: Array.from(s.incomingDamageBuffer || []),
            challengeTiers: Array.from(s.challengeTiers || []),
            discoveredPerksMap: Array.from(s.discoveredPerksMap || [])
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
        sectorState: (function () {
            const raw = state.sectorState || {};
            const cleaned: any = {};
            for (const key in raw) {
                const val = raw[key];
                // Skip the ephemeral context and any Three.js objects that might have leaked
                if (key === 'ctx' || (val && (val.isObject3D || val.isMesh || val.isTexture))) continue;

                const t = typeof val;
                if (val === null || t === 'string' || t === 'number' || t === 'boolean') {
                    cleaned[key] = val;
                }
            }
            return cleaned;
        })(),
        sessionToken: state.sessionToken
    };
};

const SAVE_KEY = 'winterDeathSave_v1';

const ensureBufferSize = (loaded: any, defaultSize: number, Type: any = Float64Array) => {
    const arr = new Type(defaultSize);
    if (loaded && Array.isArray(loaded)) {
        for (let i = 0; i < Math.min(loaded.length, defaultSize); i++) {
            arr[i] = loaded[i];
        }
    }
    return arr;
};

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
                    discoveredCollectibles: loaded.stats?.discoveredCollectibles || loaded.stats?.collectiblesDiscovered || [],
                    discoveredClues: loaded.stats?.discoveredClues || loaded.stats?.cluesFound || [],
                    discoveredPois: loaded.stats?.discoveredPois || loaded.stats?.discoveredPOIs || [],
                    discoveredZombies: loaded.stats?.discoveredZombies || loaded.stats?.seenEnemies || [],
                    discoveredBosses: loaded.stats?.discoveredBosses || loaded.stats?.seenBosses || [],
                    statsBuffer: ensureBufferSize(loaded.stats?.statsBuffer, PlayerStatID.COUNT, Float32Array),
                    effectDurations: ensureBufferSize(loaded.stats?.effectDurations, MAX_ENTITIES.PERKS, Float32Array),
                    effectMaxDurations: ensureBufferSize(loaded.stats?.effectMaxDurations, MAX_ENTITIES.PERKS, Float32Array),
                    effectIntensities: ensureBufferSize(loaded.stats?.effectIntensities, MAX_ENTITIES.PERKS, Float32Array),
                    weaponKills: ensureBufferSize(loaded.stats?.weaponKills, StatWeaponIndex.COUNT),
                    weaponDamageDealt: ensureBufferSize(loaded.stats?.weaponDamageDealt, StatWeaponIndex.COUNT),
                    weaponShotsFired: ensureBufferSize(loaded.stats?.weaponShotsFired, StatWeaponIndex.COUNT),
                    weaponShotsHit: ensureBufferSize(loaded.stats?.weaponShotsHit, StatWeaponIndex.COUNT),
                    weaponTimeActive: ensureBufferSize(loaded.stats?.weaponTimeActive, StatWeaponIndex.COUNT),
                    weaponEngagementDistSq: ensureBufferSize(loaded.stats?.weaponEngagementDistSq, StatWeaponIndex.COUNT),
                    perkTimesGained: ensureBufferSize(loaded.stats?.perkTimesGained, StatPerkIndex.COUNT),
                    perkDamageAbsorbed: ensureBufferSize(loaded.stats?.perkDamageAbsorbed, StatPerkIndex.COUNT),
                    perkDamageDealt: ensureBufferSize(loaded.stats?.perkDamageDealt, StatPerkIndex.COUNT),
                    perkDebuffsCleansed: ensureBufferSize(loaded.stats?.perkDebuffsCleansed, StatPerkIndex.COUNT),
                    enemyKills: ensureBufferSize(loaded.stats?.enemyKills, StatEnemyIndex.COUNT),
                    deathsByEnemyType: ensureBufferSize(loaded.stats?.deathsByEnemyType, StatEnemyIndex.COUNT),
                    incomingDamageBuffer: ensureBufferSize(loaded.stats?.incomingDamageBuffer, TELEMETRY_BUFFER_SIZE),
                    discoveredPerksMap: (function () {
                        const arr = new Uint8Array(MAX_ENTITIES.DISCOVERY_MAP_SIZE);
                        const saved = loaded.stats?.discoveredPerksMap;
                        if (saved && Array.isArray(saved)) {
                            for (let i = 0; i < Math.min(saved.length, MAX_ENTITIES.DISCOVERY_MAP_SIZE); i++) arr[i] = saved[i];
                        }
                        return arr;
                    })(),
                    challengeTiers: (function () {
                        const expectedSize = MAX_ENTITIES.CHALLENGES;
                        const buffer = ensureBufferSize(loaded.stats?.challengeTiers, expectedSize, Int32Array);
                        if (process.env.NODE_ENV !== 'production' && buffer.length !== expectedSize) {
                            console.warn(`[VINTERDÖD] Persistence Mismatch: challengeTiers buffer size is ${buffer.length}, expected ${expectedSize}.`);
                        }
                        return buffer;
                    })(),
                    totalChallengePoints: loaded.stats?.totalChallengePoints || 0
                },
                loadout: (function () {
                    const saved = loaded.loadout;
                    if (!saved) return { ...DEFAULT_STATE.loadout };

                    // If even one weapon is changed, we want to store all four slots.
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

            // Sync story progression arrays into stats
            state.stats.deadBossIndices = state.deadBossIndices || [];
            state.stats.rescuedFamilyIndices = state.rescuedFamilyIndices || [];

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
