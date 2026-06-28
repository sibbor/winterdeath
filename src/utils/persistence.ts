import { GameState, DEFAULT_STATE as DEFAULT_GAME_STATE } from '../types/StateTypes';
import { GameScreen } from '../types/SessionTypes';
import { OVERRIDE_DEFAULT_SECTOR, MAX_ENTITIES } from '../content/constants';
import { StatID, StatWeaponIndex, StatEnemyIndex, StatPerkIndex, TELEMETRY_BUFFER_SIZE } from '../types/CareerStats';
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
            discoveredClues: [...s.discoveredClues],
            discoveredZombies: [...s.discoveredZombies],
            discoveredBosses: [...s.discoveredBosses],
            discoveredPois: [...s.discoveredPois],
            mostUsedWeapon: s.mostUsedWeapon,
            totalEnemiesKilled: s.totalEnemiesKilled,
            prologueSeen: s.prologueSeen,
            epilogueSeen: s.epilogueSeen,
            gameCompleted: s.gameCompleted,
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
            outgoingKillsBuffer: Array.from(s.outgoingKillsBuffer),
            outgoingDamageBuffer: Array.from(s.outgoingDamageBuffer),
            outgoingShotsFiredBuffer: Array.from(s.outgoingShotsFiredBuffer),
            outgoingShotsHitBuffer: Array.from(s.outgoingShotsHitBuffer),
            outgoingTimeActiveBuffer: Array.from(s.outgoingTimeActiveBuffer),
            outgoingEngagementDistSqBuffer: Array.from(s.outgoingEngagementDistSqBuffer),
            perkTimesGained: Array.from(s.perkTimesGained),
            perkDamageAbsorbed: Array.from(s.perkDamageAbsorbed),
            perkDamageDealt: Array.from(s.perkDamageDealt),
            perkDebuffsCleansed: Array.from(s.perkDebuffsCleansed),
            enemyKills: Array.from(s.enemyKills),
            deathsByEnemyType: Array.from(s.deathsByEnemyType),
            incomingDamageBuffer: Array.from(s.incomingDamageBuffer),
            challengeTiers: Array.from(s.challengeTiers),
            discoveredPerks: Array.from(s.discoveredPerks)
        },
        currentSector: state.currentSector,
        loadout: state.loadout,
        weaponLevels: state.weaponLevels,
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
        })()
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
    let gameState: GameState;

    if (saved) {
        try {
            const loaded = JSON.parse(saved);
            const loadedStats = loaded.careerStats || {};
            gameState = {
                ...DEFAULT_GAME_STATE,
                ...loaded,
                stats: {
                    ...DEFAULT_GAME_STATE.stats,
                    ...loadedStats,
                    discoveredCollectibles: ensureBufferSize(loadedStats.discoveredCollectibles, MAX_ENTITIES.DISCOVERY_MAP_SIZE, Uint8Array),
                    discoveredClues: ensureBufferSize(loadedStats.discoveredClues, MAX_ENTITIES.DISCOVERY_MAP_SIZE, Uint8Array),
                    discoveredPois: ensureBufferSize(loadedStats.discoveredPois, MAX_ENTITIES.DISCOVERY_MAP_SIZE, Uint8Array),
                    discoveredZombies: ensureBufferSize(loadedStats.discoveredZombies, MAX_ENTITIES.DISCOVERY_MAP_SIZE, Uint8Array),
                    discoveredBosses: ensureBufferSize(loadedStats.discoveredBosses, MAX_ENTITIES.DISCOVERY_MAP_SIZE, Uint8Array),
                    discoveredPerks: ensureBufferSize(loadedStats.discoveredPerks, MAX_ENTITIES.DISCOVERY_MAP_SIZE, Uint8Array),
                    statsBuffer: ensureBufferSize(loadedStats.statsBuffer, StatID.COUNT, Float32Array),
                    effectDurations: ensureBufferSize(loadedStats.effectDurations, MAX_ENTITIES.PERKS, Float32Array),
                    effectMaxDurations: ensureBufferSize(loadedStats.effectMaxDurations, MAX_ENTITIES.PERKS, Float32Array),
                    effectIntensities: ensureBufferSize(loadedStats.effectIntensities, MAX_ENTITIES.PERKS, Float32Array),
                    incomingDamageBuffer: ensureBufferSize(loadedStats.incomingDamageBuffer, TELEMETRY_BUFFER_SIZE),
                    outgoingKillsBuffer: ensureBufferSize(loadedStats.outgoingKillsBuffer || loadedStats.weaponKills, StatWeaponIndex.COUNT),
                    outgoingDamageBuffer: ensureBufferSize(loadedStats.outgoingDamageBuffer || loadedStats.weaponDamageDealt, StatWeaponIndex.COUNT),
                    outgoingShotsFiredBuffer: ensureBufferSize(loadedStats.outgoingShotsFiredBuffer || loadedStats.weaponShotsFired, StatWeaponIndex.COUNT),
                    outgoingShotsHitBuffer: ensureBufferSize(loadedStats.outgoingShotsHitBuffer || loadedStats.weaponShotsHit, StatWeaponIndex.COUNT),
                    outgoingTimeActiveBuffer: ensureBufferSize(loadedStats.outgoingTimeActiveBuffer || loadedStats.weaponTimeActive, StatWeaponIndex.COUNT),
                    outgoingEngagementDistSqBuffer: ensureBufferSize(loadedStats.outgoingEngagementDistSqBuffer || loadedStats.weaponEngagementDistSq, StatWeaponIndex.COUNT),
                    perkTimesGained: ensureBufferSize(loadedStats.perkTimesGained, StatPerkIndex.COUNT),
                    perkDamageAbsorbed: ensureBufferSize(loadedStats.perkDamageAbsorbed, StatPerkIndex.COUNT),
                    perkDamageDealt: ensureBufferSize(loadedStats.perkDamageDealt, StatPerkIndex.COUNT),
                    perkDebuffsCleansed: ensureBufferSize(loadedStats.perkDebuffsCleansed, StatPerkIndex.COUNT),
                    enemyKills: ensureBufferSize(loadedStats.enemyKills, StatEnemyIndex.COUNT),
                    deathsByEnemyType: ensureBufferSize(loadedStats.deathsByEnemyType, StatEnemyIndex.COUNT),
                    challengeTiers: ensureBufferSize(loadedStats.challengeTiers, MAX_ENTITIES.CHALLENGES, Int32Array),
                    totalChallengePoints: loadedStats.totalChallengePoints || 0
                },
                loadout: loaded.loadout || { ...DEFAULT_GAME_STATE.loadout },
                weaponLevels: loaded.weaponLevels || { ...DEFAULT_GAME_STATE.weaponLevels },
                screen: loadedStats.prologueSeen ? GameScreen.CAMP : GameScreen.PROLOGUE,
                settings: {
                    ...DEFAULT_GAME_STATE.settings,
                    ...loaded.settings,
                    showFps: loaded.settings?.showFps !== undefined ? loaded.settings.showFps : (loaded.showFps !== undefined ? loaded.showFps : DEFAULT_GAME_STATE.settings.showFps),
                    debugMode: loaded.settings?.debugMode !== undefined ? loaded.settings.debugMode : (loaded.debugMode !== undefined ? loaded.debugMode : DEFAULT_GAME_STATE.settings.debugMode),
                },
                environmental: loaded.environmental || DEFAULT_GAME_STATE.environmental,
                sectorState: loaded.sectorState || DEFAULT_GAME_STATE.sectorState,
            };
        } catch (e) {
            console.error('Save file corrupted, resetting.');
            gameState = { ...DEFAULT_GAME_STATE };
        }
    } else {
        gameState = { ...DEFAULT_GAME_STATE };
    }

    const numSectors = SECTOR_THEMES.length;
    if (OVERRIDE_DEFAULT_SECTOR >= 0 && OVERRIDE_DEFAULT_SECTOR < numSectors) {
        gameState.screen = GameScreen.SECTOR;
        gameState.currentSector = OVERRIDE_DEFAULT_SECTOR;
    }

    return gameState;
};

export const saveGameState = (state: GameState) => {
    localStorage.setItem(SAVE_KEY, JSON.stringify(getPersistentState(state)));
};

export const clearSave = () => {
    localStorage.removeItem(SAVE_KEY);
};
