import { GameState, DEFAULT_STATE } from '../types/StateTypes';
import { GameScreen } from '../types/SessionTypes';
import { OVERRIDE_DEFAULT_SECTOR, MAX_ENTITIES } from '../content/constants';
import { PlayerStatID, StatWeaponIndex, StatEnemyIndex, StatPerkIndex, TELEMETRY_BUFFER_SIZE } from '../types/CareerStats';
import { SECTOR_THEMES } from '../game/session/SectorTypes';

export const getPersistentState = (state: GameState) => {
    const s = state.stats;
    return {
        careerStats: {
            // Pick only serializable core fields
            statusFlags: s.statusFlags,
            activePassives: [...s.activePassives],
            activeBuffs: [...s.activeBuffs],
            activeDebuffs: [...s.activeDebuffs],
            sectorsCompleted: s.sectorsCompleted,
            totalSkillPointsEarned: s.totalSkillPointsEarned,
            discoveredCollectibles: [...s.discoveredCollectibles],
            viewedCollectibles: s.viewedCollectibles ? [...s.viewedCollectibles] : [],
            discoveredClues: [...s.discoveredClues],
            mostUsedWeapon: s.mostUsedWeapon,
            totalEnemiesKilled: s.totalEnemiesKilled,
            discoveredZombies: [...s.discoveredZombies],
            discoveredBosses: [...s.discoveredBosses],
            discoveredPois: [...s.discoveredPois],
            prologueSeen: s.prologueSeen,
            rescuedFamilyIndices: [...s.rescuedFamilyIndices],
            deadBossIndices: [...s.deadBossIndices],
            familyFoundCount: s.familyFoundCount,
            totalChallengePoints: s.totalChallengePoints,
            trackedChallengeIds: [...s.trackedChallengeIds],

            // Serialize Buffers
            statsBuffer: Array.from(s.statsBuffer),
            effectDurations: Array.from(s.effectDurations),
            effectMaxDurations: Array.from(s.effectMaxDurations),
            effectIntensities: Array.from(s.effectIntensities),
            weaponKills: Array.from(s.weaponKills),
            weaponDamageDealt: Array.from(s.weaponDamageDealt),
            weaponShotsFired: Array.from(s.weaponShotsFired),
            weaponShotsHit: Array.from(s.weaponShotsHit),
            weaponTimeActive: Array.from(s.weaponTimeActive),
            weaponEngagementDistSq: Array.from(s.weaponEngagementDistSq),
            perkTimesGained: Array.from(s.perkTimesGained),
            perkDamageAbsorbed: Array.from(s.perkDamageAbsorbed),
            perkDamageDealt: Array.from(s.perkDamageDealt),
            perkDebuffsCleansed: Array.from(s.perkDebuffsCleansed),
            enemyKills: Array.from(s.enemyKills),
            deathsByEnemyType: Array.from(s.deathsByEnemyType),
            incomingDamageBuffer: Array.from(s.incomingDamageBuffer),
            challengeTiers: Array.from(s.challengeTiers),
            discoveredPerksMap: Array.from(s.discoveredPerksMap)
        },
        currentSector: state.currentSector,
        loadout: state.loadout,
        weaponLevels: state.weaponLevels,
        debugMode: state.debugMode,
        showFps: state.showFps,
        settings: state.settings,
        environmental: state.environmental,
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
            const loadedStats = loaded.careerStats || {};
            state = {
                ...DEFAULT_STATE,
                ...loaded,
                stats: {
                    ...DEFAULT_STATE.stats,
                    ...loadedStats,
                    discoveredCollectibles: loadedStats.discoveredCollectibles || [],
                    discoveredClues: loadedStats.discoveredClues || [],
                    discoveredPois: loadedStats.discoveredPois || [],
                    discoveredZombies: loadedStats.discoveredZombies || [],
                    discoveredBosses: loadedStats.discoveredBosses || [],
                    statsBuffer: ensureBufferSize(loadedStats.statsBuffer, PlayerStatID.COUNT, Float32Array),
                    effectDurations: ensureBufferSize(loadedStats.effectDurations, MAX_ENTITIES.PERKS, Float32Array),
                    effectMaxDurations: ensureBufferSize(loadedStats.effectMaxDurations, MAX_ENTITIES.PERKS, Float32Array),
                    effectIntensities: ensureBufferSize(loadedStats.effectIntensities, MAX_ENTITIES.PERKS, Float32Array),
                    weaponKills: ensureBufferSize(loadedStats.weaponKills, StatWeaponIndex.COUNT),
                    weaponDamageDealt: ensureBufferSize(loadedStats.weaponDamageDealt, StatWeaponIndex.COUNT),
                    weaponShotsFired: ensureBufferSize(loadedStats.weaponShotsFired, StatWeaponIndex.COUNT),
                    weaponShotsHit: ensureBufferSize(loadedStats.weaponShotsHit, StatWeaponIndex.COUNT),
                    weaponTimeActive: ensureBufferSize(loadedStats.weaponTimeActive, StatWeaponIndex.COUNT),
                    weaponEngagementDistSq: ensureBufferSize(loadedStats.weaponEngagementDistSq, StatWeaponIndex.COUNT),
                    perkTimesGained: ensureBufferSize(loadedStats.perkTimesGained, StatPerkIndex.COUNT),
                    perkDamageAbsorbed: ensureBufferSize(loadedStats.perkDamageAbsorbed, StatPerkIndex.COUNT),
                    perkDamageDealt: ensureBufferSize(loadedStats.perkDamageDealt, StatPerkIndex.COUNT),
                    perkDebuffsCleansed: ensureBufferSize(loadedStats.perkDebuffsCleansed, StatPerkIndex.COUNT),
                    enemyKills: ensureBufferSize(loadedStats.enemyKills, StatEnemyIndex.COUNT),
                    deathsByEnemyType: ensureBufferSize(loadedStats.deathsByEnemyType, StatEnemyIndex.COUNT),
                    incomingDamageBuffer: ensureBufferSize(loadedStats.incomingDamageBuffer, TELEMETRY_BUFFER_SIZE),
                    discoveredPerksMap: (function () {
                        const arr = new Uint8Array(MAX_ENTITIES.DISCOVERY_MAP_SIZE);
                        const savedMap = loadedStats.discoveredPerksMap;
                        if (savedMap && Array.isArray(savedMap)) {
                            for (let i = 0; i < Math.min(savedMap.length, MAX_ENTITIES.DISCOVERY_MAP_SIZE); i++) arr[i] = savedMap[i];
                        }
                        return arr;
                    })(),
                    challengeTiers: (function () {
                        const expectedSize = MAX_ENTITIES.CHALLENGES;
                        const buffer = ensureBufferSize(loadedStats.challengeTiers, expectedSize, Int32Array);
                        if (process.env.NODE_ENV !== 'production' && buffer.length !== expectedSize) {
                            console.warn(`Persistence Mismatch: challengeTiers buffer size is ${buffer.length}, expected ${expectedSize}.`);
                        }
                        return buffer;
                    })(),
                    totalChallengePoints: loadedStats.totalChallengePoints || 0
                },
                loadout: loaded.loadout || { ...DEFAULT_STATE.loadout },
                weaponLevels: loaded.weaponLevels || { ...DEFAULT_STATE.weaponLevels },
                screen: loadedStats.prologueSeen ? GameScreen.CAMP : GameScreen.PROLOGUE,
                settings: loaded.settings || { ...DEFAULT_STATE.settings },
                environmental: loaded.environmental || DEFAULT_STATE.environmental,
                sectorState: loaded.sectorState || DEFAULT_STATE.sectorState,
            };
        } catch (e) {
            console.error('Save file corrupted, resetting.');
            state = { ...DEFAULT_STATE };
        }
    } else {
        state = { ...DEFAULT_STATE };
    }

    const numSectors = SECTOR_THEMES.length;
    if (OVERRIDE_DEFAULT_SECTOR >= 0 && OVERRIDE_DEFAULT_SECTOR < numSectors) {
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
