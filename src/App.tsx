import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { GameState, SectorStats } from './types/StateTypes';
import { GameScreen } from './types/SessionTypes';
import { CareerStats, StatID } from './types/CareerStats';
import { WeatherType } from './core/engine/EnvironmentalTypes';
import { SectorTrigger } from './types/TriggerTypes';
import { BossID, SectorID } from './game/session/SectorTypes';
import { loadGameState, saveGameState, clearSave } from './utils/persistence';
import { aggregateStats } from './game/progression/ProgressionManager';
import GameSession, { GameSessionHandle } from './game/session/GameSession';
import ScreenStartGame from './components/ui/screens/ScreenStartGame';
import ScreenLoading from './components/ui/screens/ScreenLoading';
import Prologue from './components/ui/screens/Prologue';
import Camp from './components/camp/Camp';
import GameHUD from './components/ui/hud/game/GameHUD';
import ScreenPause from './components/ui/screens/ScreenPause';
import ScreenMap from './components/ui/screens/ScreenMap';
import ScreenTeleport from './components/ui/screens/ScreenTeleport';
import ScreenSectorReport from './components/ui/screens/ScreenSectorReport';
import ScreenBossKilled from './components/ui/screens/ScreenBossKilled';
import ScreenCollectibleDiscovered from './components/ui/screens/ScreenCollectibleDiscovered';
import ScreenAdventureLog from './components/ui/screens/ScreenAdventureLog';
import ScreenStatistics from './components/ui/screens/ScreenStatistics';
import ScreenSettings from './components/ui/screens/ScreenSettings';
import ScreenTerminalArmory from './components/ui/screens/ScreenTerminalArmory';
import { ScreenTerminalSpawner } from './components/ui/screens/ScreenTerminalSpawner';
import ScreenTerminalSkill from './components/ui/screens/ScreenTerminalSkill';
import { ScreenTerminalEnvironment } from './components/ui/screens/ScreenTerminalEnvironment';
import { ScreenTerminalUI } from './components/ui/screens/ScreenTerminalUI';
import ScreenPlayerDied from './components/ui/screens/ScreenPlayerDied';
import ScreenArmory from './components/ui/screens/ScreenArmory';
import ScreenSkills from './components/ui/screens/ScreenSkills';
import ScreenSectorOverview from './components/ui/screens/ScreenSectorOverview';
import ScreenResetConfirm from './components/ui/screens/ScreenResetConfirm';
import DebugDisplay from './components/ui/core/DebugDisplay';
import CustomCursor from './components/ui/core/CustomCursor';
import { UISounds } from './utils/audio/AudioLib';
import { checkIsMobileDevice } from './utils/device';
import { AssetPreloader } from './systems/AssetPreloader';
import { WinterEngine, GameSettings } from './core/engine/WinterEngine';
import { HudStore } from './store/HudStore';
import { SectorSystem } from './systems/SectorSystem';
import { OverlayType, DiscoveryType } from './components/ui/hud/game/HudTypes';
import { StatsBridge } from './core/data/StatsBridge';
import { MAX_ENTITIES } from './content/constants';
import { useInput } from './game/session/useInput';

// ============================================================================
// ZERO-GC: Static Fallback Objects
// Prevents inline `{}` allocations that break React.memo during renders.
// ============================================================================
const EMPTY_SECTOR_STATE = {};
const EMPTY_OVERRIDES = {};

const _FALLBACK_SESSION_STATS: SectorStats = {
    kills: 0,
    damageDealt: 0,
    damageTaken: 0,
    timePlayed: 0,
    timeElapsed: 0,
    accuracy: 0,
    itemsCollected: 0,
    scrapLooted: 0,
    shotsFired: 0,
    shotsHit: 0,
    throwablesThrown: 0,
    distanceTraveled: 0,
    score: 0,
    bossDamageDealt: 0,
    bossDamageTaken: 0,
    chestsOpened: 0,
    bigChestsOpened: 0,
    maxKillstreak: 0,
    engagementDistSqKills: 0,
    dodges: 0,
    rushes: 0,
    rushDistance: 0,
    buffTime: 0,
    debuffsResisted: 0,
    crisisSaves: 0,
    deaths: 0,
    gibbedEnemies: 0,
    uniqueEnemiesHitByExplosives: 0,
    incomingDamageBuffer: new Float64Array(1),
    outgoingKillsBuffer: new Float64Array(1),
    outgoingDamageBuffer: new Float64Array(1),
    outgoingShotsFiredBuffer: new Float64Array(1),
    outgoingShotsHitBuffer: new Float64Array(1),
    outgoingTimeActiveBuffer: new Float64Array(1),
    outgoingEngagementDistSqBuffer: new Float64Array(1),
    perkTimesGained: new Float64Array(1),
    perkDamageAbsorbed: new Float64Array(1),
    perkDamageDealt: new Float64Array(1),
    perkDebuffsCleansed: new Float64Array(1),
    enemyKills: new Float64Array(1),
    enemyDeaths: new Float64Array(1),
    activePassives: new Int32Array(1),
    activePassivesCount: 0,
    activeBuffs: new Int32Array(1),
    activeBuffsCount: 0,
    activeDebuffs: new Int32Array(1),
    activeDebuffsCount: 0,
    xpGained: 0,
    spGained: 0,
    aborted: false,
    familyFound: false,
    familyRescued: false,
    isCompleted: false,
    challengeStartValues: new Float64Array(1)
};

const App: React.FC = () => {
    const [gameState, setGameState] = useState<GameState>(loadGameState());

    // Sync debugMode to HudStore immediately on boot/initialization
    // so that subcomponents that read HudStore.getState().debugMode (like DebugDisplay)
    // are correctly aligned from the very first frame.
    const isInitializedRef = useRef(false);
    if (!isInitializedRef.current) {
        HudStore.patch({ debugMode: gameState.settings.debugMode });
        isInitializedRef.current = true;
    }

    // Efficient Engine Reference: Prevent instantiation evaluation on every render frame
    const engineRef = useRef<WinterEngine | null>(null);
    if (!engineRef.current) {
        engineRef.current = WinterEngine.getInstance(gameState.settings);
        (window as any).engine = engineRef.current;
        (window as any).inputManager = engineRef.current.input;
    }

    const [isMobileDevice, setIsMobileDevice] = useState(checkIsMobileDevice());
    const [isPointerLocked, setIsPointerLocked] = useState(false);
    const [isCtrlInspect, setIsCtrlInspect] = useState(false);

    const [hasInteracted, setHasInteracted] = useState(!isMobileDevice);

    const [isInitialBoot, setIsInitialBoot] = useState(true);
    const [isLoadingSector, setIsLoadingSector] = useState(false);
    const [isSideBannerActive, setIsSideBannerActive] = useState(false);
    const [isLoadingCamp, setIsLoadingCamp] = useState(false);
    const [loadingTargetIsCamp, setLoadingTargetIsCamp] = useState(false);
    const [showLoadingOverlay, setShowLoadingOverlay] = useState(true);
    const [loadingSectorIndex, setLoadingSectorIndex] = useState<number | null>(null);

    const [activeOverlay, setActiveOverlay] = useState<OverlayType>(OverlayType.NONE);
    const [teleportInitialCoords, setTeleportInitialCoords] = useState<{ x: number, z: number } | null>(null);
    const [teleportTarget, setTeleportTarget] = useState<{ x: number, z: number, timestamp: number } | null>(null);
    const [activeCollectible, setActiveCollectible] = useState<string | null>(null);
    const [deathDetails, setDeathDetails] = useState<{ killer: string } | null>(null);
    const [sectorStats, setSectorStats] = useState<SectorStats | null>(null);
    const [cachedSectorStats, setCachedSectorStats] = useState<SectorStats>(_FALLBACK_SESSION_STATS);

    useEffect(() => {
        if (sectorStats) {
            setCachedSectorStats(sectorStats);
        }
    }, [sectorStats]);

    const [initialAdventureLogTab, setInitialAdventureLogTab] = useState<DiscoveryType>(DiscoveryType.CHALLENGE);
    const [initialAdventureLogItem, setInitialAdventureLogItem] = useState<string | null>(null);
    const [initialStatisticsTab, setInitialStatisticsTab] = useState<string>('overview');
    const [initialStatisticsItem, setInitialStatisticsItem] = useState<string | null>(null);
    const showFPS = !!gameState.settings.showFps;

    const gameCanvasRef = React.useRef<GameSessionHandle>(null);
    const transitionTaskRef = useRef(false);
    const sceneReadyRef = useRef(false);

    // --- ZERO-GC: LATEST STATE REF ---
    // Declared early (before all effects) so closures below capture the ref binding,
    // not a stale value. hasInteracted added to support the stable root pointer handler.
    const latestStateRef = useRef({ gameState, isMobileDevice, activeOverlay, hasInteracted });
    latestStateRef.current.gameState = gameState;
    latestStateRef.current.isMobileDevice = isMobileDevice;
    latestStateRef.current.activeOverlay = activeOverlay;
    latestStateRef.current.hasInteracted = hasInteracted;

    // ============================================================================
    // STATS THROTTLING SYSTEM (Vinterdöd Optimization)
    // Issue 1 Fix: Stable 300ms interval reads live stats via latestStateRef.
    // Prior closure over `gameState.stats` in dep array caused this effect to
    // re-fire on every setGameState call (loadout saves, settings, screen changes).
    // ============================================================================
    const [throttledStats, setThrottledStats] = useState(gameState.stats);

    useEffect(() => {
        const interval = setInterval(() => {
            setThrottledStats(latestStateRef.current.gameState.stats);
        }, 300);
        return () => clearInterval(interval);
    }, []); // stable — no deps, always reads latest value via ref

    const [mergedStats, setMergedStats] = useState(() => gameState.stats);

    useEffect(() => {
        if (activeOverlay === OverlayType.NONE) return;
        const updateMerged = () => {
            const currentStats = latestStateRef.current.gameState.stats;
            setMergedStats(gameCanvasRef.current ? (gameCanvasRef.current.getMergedSessionStats() || currentStats) : currentStats);
        };
        updateMerged();
        const interval = setInterval(updateMerged, 300);
        return () => clearInterval(interval);
    }, [activeOverlay]);

    useEffect(() => {
        saveGameState(gameState);
    }, [gameState]);

    useEffect(() => {
        // Zero-GC: Bind to window exactly once to prevent memory leaks
        (window as any).setGameScreen = (screen: GameScreen) => setGameState(prev => ({ ...prev, screen }));

        const checkMobile = () => setIsMobileDevice(checkIsMobileDevice());
        const handleLockChange = () => setIsPointerLocked(!!document.pointerLockElement);
        const handleCtrlInspect = (e: Event) => setIsCtrlInspect(!!(e as CustomEvent).detail?.active);

        const handleOpenAdventureLogEvent = (e: any) => {
            const tab = e.detail?.tab;
            const itemId = e.detail?.itemId;
            handleOpenAdventureLogAction(tab, itemId);
        };

        const handleOpenStatisticsEvent = (e: any) => {
            const tab = e.detail?.tab;
            const itemId = e.detail?.itemId;
            handleOpenStatisticsAction(tab, itemId);
        };

        const handleSideBannerPreviewEvent = () => {
            setIsSideBannerActive(true);
        };

        window.addEventListener('resize', checkMobile);
        document.addEventListener('pointerlockchange', handleLockChange);
        window.addEventListener('ctrl-inspect-mode', handleCtrlInspect);
        window.addEventListener('open-adventure-log', handleOpenAdventureLogEvent);
        window.addEventListener('open-statistics', handleOpenStatisticsEvent);
        window.addEventListener('trigger-side-banner-preview', handleSideBannerPreviewEvent);

        // --- IMMERSIVE PC: Disable Context Menu ---
        const handleContextMenu = (e: MouseEvent) => e.preventDefault();
        window.addEventListener('contextmenu', handleContextMenu);

        if (typeof screen !== 'undefined' && (screen as any).orientation && (screen.orientation as any).lock) {
            (screen.orientation as any).lock('landscape').catch((e: any) => {
                //console.warn("[App] Orientation lock failed (expected on some devices):", e);
            });
        }

        return () => {
            window.removeEventListener('resize', checkMobile);
            document.removeEventListener('pointerlockchange', handleLockChange);
            window.removeEventListener('ctrl-inspect-mode', handleCtrlInspect);
            window.removeEventListener('open-adventure-log', handleOpenAdventureLogEvent);
            window.removeEventListener('open-statistics', handleOpenStatisticsEvent);
            window.removeEventListener('trigger-side-banner-preview', handleSideBannerPreviewEvent);
            window.removeEventListener('contextmenu', handleContextMenu);
        };
    }, []);

    // Ensure pointer lock is released when an overlay opens
    useEffect(() => {
        if (activeOverlay !== OverlayType.NONE && document.pointerLockElement) {
            document.exitPointerLock();
        }
    }, [activeOverlay]);

    // --- LOADING & WARMUP LOGIC ---
    const tryDismissLoading = useCallback(() => {
        if (!transitionTaskRef.current && sceneReadyRef.current) {
            setIsLoadingCamp(false);
            setIsLoadingSector(false);

            // Ensure the engine is unpaused once the transition completes
            const engine = WinterEngine.getInstance();
            engine.isRenderingPaused = false;
            engine.isSimulationPaused = false;

            requestAnimationFrame(() => {
                setTimeout(() => {
                    setShowLoadingOverlay(false);
                    setLoadingSectorIndex(null);
                }, 100);

                setTimeout(() => {
                    const current = HudStore.getState();
                    if (latestStateRef.current.gameState.screen !== GameScreen.PROLOGUE) {
                        HudStore.update({ ...current, hudVisible: true });
                    }
                }, 2000);
            });
        }
    }, []);

    const triggerLoadingTransition = useCallback(async (
        type: 'CAMP' | 'SECTOR' | 'PROLOGUE',
        task: () => Promise<void> | void,
        targetSector?: number
    ) => {
        transitionTaskRef.current = true;
        sceneReadyRef.current = false;

        if (type === 'CAMP') {
            setIsLoadingCamp(true);
            setLoadingSectorIndex(null);
        } else {
            setIsLoadingSector(true);
            if (type === 'SECTOR') {
                setIsSideBannerActive(true);
            }
            if (targetSector !== undefined) {
                setLoadingSectorIndex(targetSector);
            } else {
                setLoadingSectorIndex(null);
            }
        }

        setLoadingTargetIsCamp(type === 'CAMP');
        setShowLoadingOverlay(true);

        // Suspend the engine while loading. This prevents the requestAnimationFrame loop 
        // from fighting the synchronous Shader Compilation block, ensuring a smooth loading screen.
        const engine = WinterEngine.getInstance();
        engine.isRenderingPaused = true;
        engine.isSimulationPaused = true;

        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        try {
            await task();
        } catch (e) {
            console.error("[App] triggerLoadingTransition task failed:", e);
        } finally {
            transitionTaskRef.current = false;

            tryDismissLoading();
        }
    }, [tryDismissLoading]);

    const isWarmedUpRef = useRef(false);
    useEffect(() => {
        if (!hasInteracted) return;
        if (isWarmedUpRef.current) return;
        isWarmedUpRef.current = true;

        const warmup = async () => {
            const engine = WinterEngine.getInstance();
            const isCamp = gameState.screen === GameScreen.CAMP;
            const yieldToMain = () => new Promise<void>(resolve => {
                requestAnimationFrame(() => {
                    setTimeout(resolve, 0);
                });
            });

            const sectorIndex = gameState.currentSector !== undefined ? gameState.currentSector : 0;
            await triggerLoadingTransition(isCamp ? 'CAMP' : 'SECTOR', async () => {
                try {
                    // Safety check for undefined settings on initial boot
                    const defaultSettings = { shadowQuality: 1, antialias: true, resolutionScale: 1.0, postProcessing: true, renderDistance: 1.0 };
                    engine.updateSettings(gameState.settings || defaultSettings);

                    await AssetPreloader.warmupAsync('CORE', yieldToMain);
                    if (isCamp) {
                        await AssetPreloader.warmupAsync('CAMP', yieldToMain);
                    } else {
                        await AssetPreloader.warmupAsync('SECTOR', yieldToMain, sectorIndex);
                    }
                } catch (e) {
                    console.error("[App] Warmup Error:", e);
                }

                setIsInitialBoot(false);
            }, isCamp ? undefined : sectorIndex);
        };

        if (isInitialBoot && hasInteracted) warmup();
    }, [hasInteracted]);

    // --- ZERO-GC STABLE CALLBACKS ---
    const handleDie = useCallback((stats: SectorStats, killer: string) => {
        setDeathDetails({ killer });
        setSectorStats(stats); // Store to be viewed in Recap, but DONT aggregate yet!
        setGameState(prev => ({
            ...prev,
            screen: GameScreen.DEATH // Go to Death Screen first, not Recap
        }));
    }, []);

    const handleOpenMap = useCallback(() => {
        setActiveOverlay(OverlayType.MAP);
        UISounds.playConfirm();
    }, []);

    const handleCheckpointReached = useCallback(() => { }, []);

    const handleCollectibleDiscoveredAction = useCallback((id: string) => {
        setActiveCollectible(id);
        setActiveOverlay(OverlayType.COLLECTIBLE);
    }, []);

    const handleClueDiscoveredAction = useCallback((_clue: SectorTrigger | string) => { }, []);
    const handlePOIdiscoveredAction = useCallback((_poi: SectorTrigger | string) => { }, []);
    const handleEnemyDiscoveredAction = useCallback((_type: number) => { }, []);
    const handleBossDiscoveredAction = useCallback((_id: number) => { }, []);

    const handleDialogueStateChangeAction = useCallback((active: boolean) => {
        setActiveOverlay(current => {
            if (current === OverlayType.DEATH) return current;
            return active ? OverlayType.DIALOGUE : (current === OverlayType.DIALOGUE ? OverlayType.NONE : current);
        });
    }, []);
    const handleDeathStateChangeAction = useCallback((active: boolean) => setActiveOverlay(active ? OverlayType.DEATH : OverlayType.NONE), []);
    const handleBossIntroStateChangeAction = useCallback((active: boolean) => {
        setActiveOverlay(current => {
            if (current === OverlayType.DEATH) return current;
            return active ? OverlayType.INTRO : (current === OverlayType.INTRO ? OverlayType.NONE : current);
        });
    }, []);

    const handleBossDefeatedAction = useCallback((bossId: BossID) => {
        if (gameCanvasRef.current) {
            const stats = gameCanvasRef.current.getSectorStats(true, false);
            setSectorStats(stats);
        }

        setGameState(prev => {
            if (StatsBridge.getDeadBossIndices(prev.stats).includes(prev.currentSector)) return prev;

            const newStatsBuffer = new Float32Array(StatsBridge.getStatsBuffer(prev.stats));

            return {
                ...prev,
                stats: {
                    ...prev.stats,
                    statsBuffer: newStatsBuffer,
                    totalSkillPointsEarned: newStatsBuffer[StatID.SKILL_POINTS],
                    deadBossIndices: [...StatsBridge.getDeadBossIndices(prev.stats), prev.currentSector]
                }
            };
        });
    }, []);

    const handleFamilyRescuedAction = useCallback((familyId: number) => {
        setGameState(prev => {
            if (StatsBridge.getRescuedFamilyIndices(prev.stats).includes(prev.currentSector)) return prev;

            const newStatsBuffer = new Float32Array(StatsBridge.getStatsBuffer(prev.stats));

            return {
                ...prev,
                stats: {
                    ...prev.stats,
                    statsBuffer: newStatsBuffer,
                    totalSkillPointsEarned: newStatsBuffer[StatID.SKILL_POINTS],
                    rescuedFamilyIndices: [...StatsBridge.getRescuedFamilyIndices(prev.stats), prev.currentSector]
                }
            };
        });
    }, []);

    const handleUpdateLoadoutAction = useCallback((loadout: any, levels: any) => {
        setGameState(prev => ({ ...prev, loadout, weaponLevels: levels }));
    }, []);

    const handleEnvironmentOverrideChangeAction = useCallback((overrides: any) => {
        setGameState(prev => {
            const newOverrides = { ...(prev.environmentOverrides || EMPTY_OVERRIDES) };
            newOverrides[prev.currentSector] = overrides;
            return { ...prev, environmentOverrides: newOverrides };
        });
    }, []);

    const handleTogglePauseAction = useCallback(() => {
        setActiveOverlay(OverlayType.PAUSE);
        UISounds.playClick();
    }, []);

    const handleToggleMapAction = useCallback(() => {
        setActiveOverlay(OverlayType.MAP);
        UISounds.playConfirm();
    }, []);

    const handleSelectWeaponAction = useCallback((slot: string) => {
        gameCanvasRef.current?.triggerInput(slot);
    }, []);

    const handleRotateCameraAction = useCallback((dir: number) => {
        gameCanvasRef.current?.rotateCamera(dir);
    }, []);

    const handleResumeAction = useCallback(() => {
        const { gameState: currentGameState, isMobileDevice: isMobile } = latestStateRef.current;

        setActiveOverlay(OverlayType.NONE);

        const engine = WinterEngine.getInstance();
        engine.isSimulationPaused = false;
        engine.input.enable();

        if (currentGameState.screen === GameScreen.SECTOR && !isMobile && gameCanvasRef.current) {
            gameCanvasRef.current.requestPointerLock();
        }
    }, []);

    const handleOpenSettingsAction = useCallback(() => setActiveOverlay(OverlayType.SETTINGS), []);
    const handleOpenAdventureLogAction = useCallback((tab?: DiscoveryType, itemId?: string) => {
        const resolvedTab = (tab !== undefined && tab !== null && typeof tab === 'number') ? tab : DiscoveryType.CHALLENGE;
        setInitialAdventureLogTab(resolvedTab);
        setInitialAdventureLogItem(itemId || null);
        setActiveOverlay(OverlayType.ADVENTURE_LOG);
        UISounds.playConfirm();
    }, []);

    const handleOpenStatisticsAction = useCallback((tab?: string, itemId?: string) => {
        const resolvedTab = (tab && typeof tab === 'string') ? tab : 'overview';
        setInitialStatisticsTab(resolvedTab);
        setInitialStatisticsItem(itemId || null);
        setActiveOverlay(OverlayType.TERMINAL_STATISTICS);
        UISounds.playConfirm();
    }, []);

    const handleCloseAction = useCallback(() => {
        const { gameState: currentGameState, isMobileDevice: isMobile } = latestStateRef.current;
        if (currentGameState.screen === GameScreen.SECTOR && !isMobile) {
            gameCanvasRef.current?.requestPointerLock();
        }
        setActiveOverlay(OverlayType.NONE);
    }, []);

    const handleContinueFromDeath = useCallback(() => {
        const stats = gameCanvasRef.current?.getSectorStats(false, true) || latestStateRef.current.gameState.stats;
        const finalHud = HudStore.getState();

        handleDie(stats as any, finalHud.killerName);

        UISounds.playConfirm();
        setGameState(prev => ({ ...prev, screen: GameScreen.RECAP }));
        setActiveOverlay(OverlayType.NONE);
    }, [handleDie]);

    const handleSaveArmoryAction = useCallback((s: any, l: any, wl: any) => {
        setGameState(prev => ({ ...prev, stats: s, loadout: l, weaponLevels: wl }));
        setActiveOverlay(OverlayType.NONE);
    }, []);

    const handleSaveArmoryPlaygroundAction = useCallback((newStats: any, newLoadout: any, newLevels: any, newSectorState: any) => {
        setGameState(prev => ({ ...prev, stats: newStats, loadout: newLoadout, weaponLevels: newLevels, sectorState: newSectorState }));
        setActiveOverlay(OverlayType.NONE);
    }, []);

    const handleSaveSkillsPlaygroundAction = useCallback((newStats: any, newSectorState: any) => {
        setGameState(prev => ({ ...prev, stats: newStats, sectorState: newSectorState }));
        setActiveOverlay(OverlayType.NONE);
    }, []);

    const handleWeatherChangeAction = useCallback((w: any) => setGameState(prev => ({ ...prev, weather: w })), []);

    const handleSpawnEnemiesAction = useCallback((enemies: any) => {
        gameCanvasRef.current?.spawnEnemies(enemies);
    }, []);

    const handleMapSelectCoordsAction = useCallback((x: number, z: number) => {
        setTeleportInitialCoords({ x, z });
        setActiveOverlay(OverlayType.TELEPORT);
    }, []);

    const handleJumpAction = useCallback((x: number, z: number) => {
        gameCanvasRef.current?.requestPointerLock();
        setTeleportTarget({ x, z, timestamp: Date.now() });
        setActiveOverlay(OverlayType.NONE);
    }, []);

    const handleTeleportCancelAction = useCallback(() => {
        setActiveOverlay(OverlayType.MAP);
        setTeleportInitialCoords(null);
    }, []);

    const handleBossKilledProceed = useCallback(() => {
        UISounds.playConfirm();
        setGameState(prev => ({ ...prev, screen: GameScreen.RECAP }));
    }, []);

    const handleBossKilledExplore = useCallback(() => {
        UISounds.playConfirm();
        setGameState(prev => ({ ...prev, screen: GameScreen.SECTOR }));
        const engine = WinterEngine.getInstance();
        engine.isSimulationPaused = false;
        engine.input.enable();
        if (!isMobileDevice && gameCanvasRef.current) {
            gameCanvasRef.current.requestPointerLock();
        }
    }, [isMobileDevice]);

    const handlePrologueCompleteAction = useCallback(() => {
        setGameState(prev => ({
            ...prev,
            screen: GameScreen.SECTOR,
            currentSector: 0,
            stats: { ...prev.stats, prologueSeen: true }
        }));
        HudStore.update({ ...HudStore.getState(), hudVisible: true });
        UISounds.playConfirm();
    }, []);

    const handleCancelReset = useCallback(() => setActiveOverlay(OverlayType.NONE), []);

    const handleSectorEnded = useCallback((stats: SectorStats) => {
        setDeathDetails(null);
        setSectorStats(stats);

        setGameState(prev => {
            const bossKilled = StatsBridge.isSectorBossDefeated(stats);
            const isScrapyard = prev.currentSector === SectorID.SCRAPYARD;
            return {
                ...prev,
                screen: (bossKilled && !isScrapyard) ? GameScreen.BOSS_KILLED : GameScreen.RECAP
            };
        });
    }, []);

    const handleSaveStats = useCallback((newStats: CareerStats) => {
        setGameState(prev => ({ ...prev, stats: newStats }));
    }, []);

    const handleToggleChallengeTrackingAction = useCallback((challengeId: number) => {
        setGameState(prev => {
            const tracked = StatsBridge.getTrackedChallengeIds(prev.stats);
            const isTracked = tracked.includes(challengeId);
            const newTracked = isTracked
                ? tracked.filter(id => id !== challengeId)
                : [...tracked, challengeId];

            return {
                ...prev,
                stats: {
                    ...prev.stats,
                    trackedChallengeIds: newTracked
                }
            };
        });
        UISounds.playClick();
    }, []);

    const handleSaveGraphics = useCallback((newG: GameSettings) => {
        setGameState(prev => ({ ...prev, settings: newG }));
        WinterEngine.getInstance().updateSettings(newG);
    }, []);

    const handleSaveLoadout = useCallback((loadout: any, levels: any) => {
        setGameState(prev => ({ ...prev, loadout, weaponLevels: levels }));
    }, []);

    const handleSelectSector = useCallback((sectorIndex: number) => {
        setGameState(prev => ({ ...prev, currentSector: sectorIndex }));
    }, []);

    const aggregatePendingStats = useCallback(async () => {
        if (!sectorStats) return;
        return new Promise<void>(resolve => {
            setGameState(prev => {
                const died = !sectorStats.isCompleted;
                const newStats = aggregateStats(prev.stats, sectorStats, died, !!sectorStats.aborted, prev.currentSector);
                setTimeout(resolve, 0);
                return { ...prev, stats: newStats };
            });
        });
    }, [sectorStats]);

    const handleReturnToCamp = useCallback(async () => {
        UISounds.playConfirm();
        await aggregatePendingStats();

        triggerLoadingTransition('CAMP', async () => {
            const yieldToMain = () => new Promise<void>(resolve => {
                requestAnimationFrame(() => setTimeout(resolve, 0));
            });

            await AssetPreloader.warmupAsync('CAMP', yieldToMain);

            setGameState(prev => {
                const isCleared = StatsBridge.getDeadBossIndices(prev.stats).includes(prev.currentSector);
                const nextSector = (isCleared && prev.currentSector < SectorID.SCRAPYARD) ? prev.currentSector + 1 : prev.currentSector;
                const isFinished = isCleared && prev.currentSector === SectorID.SCRAPYARD;

                const finalStats = isFinished ? { ...prev.stats, gameIsFinished: true } : prev.stats;
                return {
                    ...prev,
                    stats: finalStats,
                    screen: GameScreen.CAMP,
                    currentSector: nextSector,
                    weather: WeatherType.SNOW,
                    sectorState: nextSector === SectorID.PLAYGROUND ? prev.sectorState : undefined
                };
            });
            setSectorStats(null);
            setDeathDetails(null);
        });
    }, [triggerLoadingTransition, aggregatePendingStats]);

    const handlePerkDiscoveredAction = useCallback((perkId: number) => {
        setGameState(prev => {
            const currentMap = StatsBridge.getPerkDiscoveredMap(prev.stats);
            if (currentMap && currentMap[perkId] === 1) return prev;

            const length = currentMap ? currentMap.length : MAX_ENTITIES.DISCOVERY_MAP_SIZE;
            const newMap = new Uint8Array(length);
            if (currentMap) newMap.set(currentMap);
            newMap[perkId] = 1;

            return {
                ...prev,
                stats: {
                    ...prev.stats,
                    discoveredPerks: newMap
                }
            };
        });
    }, []);

    const handleNextSector = useCallback(async () => {
        UISounds.playConfirm();
        await aggregatePendingStats();

        const nextSector = latestStateRef.current.gameState.currentSector + 1;

        if (nextSector > SectorID.SCRAPYARD) {
            setGameState(prev => ({ ...prev, screen: GameScreen.CAMP, currentSector: SectorID.SCRAPYARD, weather: WeatherType.SNOW }));
            return;
        }

        triggerLoadingTransition('SECTOR', async () => {
            const yieldToMain = () => new Promise<void>(resolve => {
                requestAnimationFrame(() => setTimeout(resolve, 0));
            });
            await AssetPreloader.warmupAsync('SECTOR', yieldToMain, nextSector);

            setTeleportTarget(null);
            setActiveCollectible(null);
            setActiveOverlay(OverlayType.NONE);

            setGameState(prev => ({
                ...prev,
                screen: GameScreen.SECTOR,
                currentSector: nextSector,
                sectorState: nextSector === SectorID.PLAYGROUND ? prev.sectorState : undefined
            }));
            HudStore.update({ ...HudStore.getState(), hudVisible: false });
        }, nextSector);
    }, [triggerLoadingTransition, aggregatePendingStats]);

    const handleStartSector = useCallback(async () => {
        const { gameState: currentGameState } = latestStateRef.current;
        const sectorIndex = currentGameState.currentSector;

        const yieldToMain = () => new Promise<void>(resolve => {
            requestAnimationFrame(() => setTimeout(resolve, 0));
        });

        await triggerLoadingTransition('SECTOR', async () => {
            await AssetPreloader.warmupAsync('SECTOR', yieldToMain, sectorIndex);

            setTeleportTarget(null);
            setActiveCollectible(null);
            setActiveOverlay(OverlayType.NONE);

            setGameState(prev => ({
                ...prev,
                screen: GameScreen.SECTOR,
                sectorState: prev.currentSector === SectorID.PLAYGROUND
                    ? prev.sectorState : undefined
            }));
            HudStore.update({ ...HudStore.getState(), hudVisible: false });
        }, sectorIndex);
    }, [triggerLoadingTransition]);

    const handleRespawnSector = useCallback(() => {
        UISounds.playConfirm();

        if (gameCanvasRef.current) {
            gameCanvasRef.current.respawnPlayer();
        }

        setActiveOverlay(OverlayType.NONE);
        setGameState(prev => ({ ...prev, screen: GameScreen.SECTOR }));
        setSectorStats(null);
        setDeathDetails(null);
        setActiveCollectible(null);

        HudStore.update({ ...HudStore.getState(), hudVisible: true, isDead: false });
    }, []);

    const handleRestartSector = useCallback(() => {
        UISounds.playConfirm();

        gameCanvasRef.current?.restartSector();

        setActiveOverlay(OverlayType.NONE);
        setGameState(prev => ({ ...prev, screen: GameScreen.SECTOR }));
        setSectorStats(null);
        setDeathDetails(null);
        setActiveCollectible(null);

        HudStore.update({ ...HudStore.getState(), hudVisible: true, isDead: false });
    }, []);

    const handleAbortSector = useCallback(() => {
        if (!gameCanvasRef.current) return;
        setActiveOverlay(OverlayType.NONE);
        const rawStats = gameCanvasRef.current.getSectorStats(false, false);
        const bossDefeated = StatsBridge.isSectorBossDefeated(rawStats);
        const stats = gameCanvasRef.current.getSectorStats(bossDefeated, !bossDefeated);
        handleSectorEnded(stats);
        UISounds.playClick();
    }, [handleSectorEnded]);

    const handleResetGame = useCallback(() => {
        clearSave();
        window.location.reload();
    }, []);

    const handleCollectibleClose = useCallback(() => {
        const { isMobileDevice: isMobile } = latestStateRef.current;
        if (gameCanvasRef.current && !isMobile) gameCanvasRef.current.requestPointerLock();
        setActiveOverlay(OverlayType.NONE);
        setActiveCollectible(null);
    }, []);

    const handleSceneReady = useCallback(() => {
        sceneReadyRef.current = true;

        const engine = WinterEngine.getInstance();
        engine.isSimulationPaused = false;
        engine.isRenderingPaused = false;

        tryDismissLoading();
    }, [tryDismissLoading]);

    const onStationInteraction = useCallback((type: OverlayType) => setActiveOverlay(type), []);
    const handleToggleDebug = useCallback((val: boolean) => {
        setGameState(prev => ({ ...prev, settings: { ...prev.settings, debugMode: val } }));
        HudStore.patch({ debugMode: val });
    }, []);
    const handlePauseToggle = useCallback((val: boolean) => setActiveOverlay(val ? OverlayType.PAUSE : OverlayType.NONE), []);
    const handleToggleShowFps = useCallback(() => {
        setGameState(prev => ({ ...prev, settings: { ...prev.settings, showFps: !prev.settings.showFps } }));
        UISounds.playClick();
    }, []);
    const handleOverlayClose = useCallback(() => setActiveOverlay(OverlayType.NONE), []);

    // Issue 4: Stable start handler — was inline arrow on ScreenStartGame.
    const handleStart = useCallback(() => setHasInteracted(true), []);

    // Issue 5: Stable banner-complete handler — was inline arrow on GameHUD.
    const handleSideBannerComplete = useCallback(() => setIsSideBannerActive(false), []);

    // Issue 6: Stable discovery handler — was inline arrow on ScreenStatistics.
    const handleOpenDiscoveryFromStats = useCallback(() => handleOpenAdventureLogAction(DiscoveryType.CLUE), [handleOpenAdventureLogAction]);

    // Issue 2: Stable root pointer-down handler — eliminates per-render closure on the root div.
    // Reads all reactive values via latestStateRef to keep dep array empty.
    const handleRootPointerDown = useCallback(() => {
        const { hasInteracted: interacted, gameState: gs, activeOverlay: ao, isMobileDevice: mobile } = latestStateRef.current;
        if (!interacted) setHasInteracted(true);
        if (gs.screen === GameScreen.SECTOR && ao === OverlayType.NONE && !mobile && !document.pointerLockElement) {
            gameCanvasRef.current?.requestPointerLock();
        }
    }, []);

    // Issue 3: Stable respawn handlers — were long inline arrows on ScreenPlayerDied (always mounted).
    const handleRespawnPlayer = useCallback(() => {
        UISounds.playConfirm();
        gameCanvasRef.current?.respawnPlayer(false);
        setActiveOverlay(OverlayType.NONE);
        setGameState(prev => ({ ...prev, screen: GameScreen.SECTOR }));
        setSectorStats(null);
        setDeathDetails(null);
        setActiveCollectible(null);
        HudStore.update({ ...HudStore.getState(), hudVisible: true, isDead: false });
    }, []);

    const handleRespawnPlayerAtBoss = useCallback(() => {
        UISounds.playConfirm();
        gameCanvasRef.current?.respawnPlayer(true);
        setActiveOverlay(OverlayType.NONE);
        setGameState(prev => ({ ...prev, screen: GameScreen.SECTOR }));
        setSectorStats(null);
        setDeathDetails(null);
        setActiveCollectible(null);
        HudStore.update({ ...HudStore.getState(), hudVisible: true, isDead: false });
    }, []);

    // Issue 7: Memoized static refs for useInput — the engine is a singleton, refs never change.
    const _useInputStaticRefs = useMemo(() => ({
        engineRef,
        engine: engineRef.current,
        cinematicRef: { current: { active: false } },
        bossIntroTimerRef: { current: null },
        stateRef: { current: null }
    }), []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleInputPauseToggle = useCallback((pause: boolean) => {
        if (pause) {
            handleTogglePauseAction();
            if (document.pointerLockElement) document.exitPointerLock();
        } else {
            handleResumeAction();
        }
    }, [handleTogglePauseAction, handleResumeAction]);

    const handleInputRequestPointerLock = useCallback(() => {
        if (!latestStateRef.current.isMobileDevice && gameCanvasRef.current) {
            gameCanvasRef.current.requestPointerLock();
        }
    }, []);

    // ============================================================================
    // UNIFIED GAME INPUT ENGINE BRIDGE
    // Centralized Zero-GC pipeline synchronized directly to the engine frame ticks.
    // ============================================================================
    useInput(
        _useInputStaticRefs,
        {
            isPaused: activeOverlay !== OverlayType.NONE,
            isGameRunning: !isInitialBoot && !isLoadingSector && !isLoadingCamp,
            isMobileDevice: isMobileDevice,
            gameState: gameState,
            activeOverlay: activeOverlay
        } as any,
        {
            setActiveOverlay,
            setTeleportInitialCoords,
            onPauseToggle: handleInputPauseToggle,
            onCollectibleClose: handleCollectibleClose,
            requestPointerLock: handleInputRequestPointerLock
        }
    );

    const cursorHidden = !isCtrlInspect && (isMobileDevice || isPointerLocked || (hasInteracted && gameState.screen === GameScreen.SECTOR && activeOverlay === OverlayType.NONE));
    const showHUD = hasInteracted && (activeOverlay === OverlayType.NONE || activeOverlay === OverlayType.INTRO) && !isLoadingSector && !isLoadingCamp && !showLoadingOverlay && gameState.screen === GameScreen.SECTOR;

    const shouldKeepSessionAlive =
        !isInitialBoot &&
        (gameState.screen === GameScreen.SECTOR ||
            gameState.screen === GameScreen.PROLOGUE ||
            gameState.screen === GameScreen.RECAP ||
            gameState.screen === GameScreen.BOSS_KILLED ||
            gameState.screen === GameScreen.DEATH);

    return (
        <div
            className="relative w-full h-full overflow-hidden bg-black select-none cursor-none"
            onPointerDown={handleRootPointerDown}
        >
            {!hasInteracted ? (
                <ScreenStartGame
                    onStart={handleStart}
                    isMobileDevice={isMobileDevice}
                />
            ) : (
                <>
                    {gameState.screen === GameScreen.CAMP && (
                        <Camp
                            key="camp-main"
                            stats={throttledStats}
                            currentLoadout={gameState.loadout}
                            weaponLevels={gameState.weaponLevels}
                            currentSector={gameState.currentSector}
                            rescuedFamilyIndices={StatsBridge.getRescuedFamilyIndices(throttledStats)}
                            deadBossIndices={StatsBridge.getDeadBossIndices(throttledStats)}
                            debugMode={gameState.settings.debugMode}
                            onSaveStats={handleSaveStats}
                            onSaveLoadout={handleSaveLoadout}
                            onSelectSector={handleSelectSector}
                            onStartSector={handleStartSector}
                            onToggleDebug={handleToggleDebug}
                            onResetGame={handleResetGame}
                            onSaveGraphics={handleSaveGraphics}
                            settings={gameState.settings}
                            onCampLoaded={handleSceneReady}
                            isMobileDevice={isMobileDevice}
                            weather={gameState.weather}
                            isGameRunning={!isInitialBoot && !isLoadingSector && !isLoadingCamp}
                            activeOverlay={activeOverlay}
                            setActiveOverlay={setActiveOverlay}
                            onPauseToggle={handlePauseToggle}
                            onInteractionStateChange={onStationInteraction}
                        />
                    )}

                    <div
                        className={`absolute inset-0 ${gameState.screen === GameScreen.SECTOR ||
                            gameState.screen === GameScreen.PROLOGUE ||
                            gameState.screen === GameScreen.BOSS_KILLED ||
                            gameState.screen === GameScreen.DEATH ||
                            gameState.screen === GameScreen.RECAP ? 'block' : 'hidden'
                            }`}
                    >
                        {shouldKeepSessionAlive && (
                            <>
                                <GameSession
                                    ref={gameCanvasRef}
                                    isWarmup={false}
                                    gameState={gameState.screen === GameScreen.PROLOGUE ? { ...gameState, currentSector: 0 } : gameState}
                                    currentSectorData={SectorSystem.getSector(gameState.screen === GameScreen.PROLOGUE ? 0 : gameState.currentSector)}
                                    isGameRunning={gameState.screen === GameScreen.SECTOR && !activeOverlay && !isLoadingSector}
                                    isPaused={!!activeOverlay || isLoadingSector || gameState.screen === GameScreen.PROLOGUE || gameState.screen === GameScreen.RECAP || gameState.screen === GameScreen.DEATH || gameState.screen === GameScreen.BOSS_KILLED}
                                    disableInput={activeOverlay === OverlayType.COLLECTIBLE || isLoadingSector || activeOverlay === OverlayType.ADVENTURE_LOG}
                                    onDie={handleDie}
                                    onSectorEnded={handleSectorEnded}
                                    onPauseToggle={handleTogglePauseAction}
                                    onOpenMap={handleOpenMap}
                                    triggerEndSector={false}
                                    familyAlreadyRescued={StatsBridge.getRescuedFamilyIndices(throttledStats).includes(gameState.currentSector)}
                                    bossPermanentlyDefeated={StatsBridge.getDeadBossIndices(throttledStats).includes(gameState.currentSector)}
                                    onSectorLoaded={handleSceneReady}
                                    startAtCheckpoint={false}
                                    onCheckpointReached={handleCheckpointReached}
                                    teleportTarget={teleportTarget}
                                    onCollectibleDiscovered={handleCollectibleDiscoveredAction}
                                    onClueDiscovered={handleClueDiscoveredAction}
                                    onPOIdiscovered={handlePOIdiscoveredAction}
                                    onEnemyDiscovered={handleEnemyDiscoveredAction}
                                    onBossDiscovered={handleBossDiscoveredAction}
                                    isCollectibleOpen={activeOverlay === OverlayType.COLLECTIBLE}
                                    onCollectibleClose={handleCollectibleClose}
                                    onDialogueStateChange={handleDialogueStateChangeAction}
                                    onDeathStateChange={handleDeathStateChangeAction}
                                    onBossIntroStateChange={handleBossIntroStateChangeAction}
                                    onInteractionStateChange={onStationInteraction}
                                    onUpdateLoadout={handleUpdateLoadoutAction}
                                    onEnvironmentOverrideChange={handleEnvironmentOverrideChangeAction}
                                    isMobileDevice={isMobileDevice}
                                    onBossKilled={handleBossDefeatedAction}
                                    onFamilyRescued={handleFamilyRescuedAction}
                                    onPerkDiscovered={handlePerkDiscoveredAction}
                                    isSideBannerActive={isSideBannerActive}
                                />

                                {showHUD && (
                                    <GameHUD
                                        loadout={gameState.loadout}
                                        weaponLevels={gameState.weaponLevels}
                                        isBossIntro={activeOverlay === OverlayType.INTRO}
                                        isMobileDevice={isMobileDevice}
                                        onTogglePause={handleTogglePauseAction}
                                        onToggleMap={handleToggleMapAction}
                                        onSelectWeapon={handleSelectWeaponAction}
                                        onRotateCamera={handleRotateCameraAction}
                                        onOpenAdventureLog={handleOpenAdventureLogAction}
                                        isSideBannerActive={isSideBannerActive}
                                        onSideBannerComplete={handleSideBannerComplete}
                                        settings={gameState.settings}
                                    />
                                )}
                            </>
                        )}
                    </div>

                    {/* ============================================================================
                        STATICALLY MOUNTED UNIVERSAL OVERLAYS (Zero-GC Display Toggles)
                        Eliminates mounting churn and React Garbage Collection.
                        ============================================================================ */}
                    <div className={activeOverlay === OverlayType.PAUSE ? "" : "hidden"}>
                        <ScreenPause
                            onResume={handleResumeAction}
                            onAbort={handleAbortSector}
                            onOpenMap={handleToggleMapAction}
                            onOpenSettings={handleOpenSettingsAction}
                            onOpenAdventureLog={handleOpenAdventureLogAction}
                            onOpenStatistics={handleOpenStatisticsAction}
                            stats={gameState.screen === GameScreen.SECTOR ? mergedStats : throttledStats}
                            isMobileDevice={isMobileDevice}
                        />
                    </div>

                    <div className={activeOverlay === OverlayType.SETTINGS ? "" : "hidden"}>
                        <ScreenSettings
                            onClose={handleCloseAction}
                            settings={gameState.settings}
                            onUpdateGraphics={handleSaveGraphics}
                            isMobileDevice={isMobileDevice}
                        />
                    </div>

                    <div className={activeOverlay === OverlayType.ADVENTURE_LOG ? "" : "hidden"}>
                        <ScreenAdventureLog
                            stats={gameState.screen === GameScreen.SECTOR ? mergedStats : throttledStats}
                            onClose={handleCloseAction}
                            onToggleChallengeTracking={handleToggleChallengeTrackingAction}
                            isMobileDevice={isMobileDevice}
                            debugMode={gameState.settings.debugMode}
                            initialTab={initialAdventureLogTab}
                            initialItemId={initialAdventureLogItem}
                        />
                    </div>

                    <div className={activeOverlay === OverlayType.COLLECTIBLE && activeCollectible ? "" : "hidden"}>
                        <ScreenCollectibleDiscovered
                            collectibleId={activeCollectible || ""}
                            onClose={handleCollectibleClose}
                            isMobileDevice={isMobileDevice}
                        />
                    </div>

                    <div className={activeOverlay === OverlayType.TERMINAL_STATISTICS ? "" : "hidden"}>
                        <ScreenStatistics
                            stats={gameState.screen === GameScreen.SECTOR ? mergedStats : throttledStats}
                            onClose={handleCloseAction}
                            onOpenDiscovery={handleOpenDiscoveryFromStats}
                            isMobileDevice={isMobileDevice}
                            debugMode={gameState.settings.debugMode}
                            initialTab={initialStatisticsTab as any}
                            initialItemId={initialStatisticsItem}
                        />
                    </div>

                    <div className={activeOverlay === OverlayType.TERMINAL_ARMORY ? "" : "hidden"}>
                        {gameState.screen === GameScreen.CAMP ? (
                            <ScreenArmory
                                stats={throttledStats}
                                currentLoadout={gameState.loadout}
                                weaponLevels={gameState.weaponLevels}
                                onClose={handleOverlayClose}
                                onSave={handleSaveArmoryAction}
                                isMobileDevice={isMobileDevice}
                            />
                        ) : (
                            <ScreenTerminalArmory
                                currentLoadout={gameState.loadout}
                                weaponLevels={gameState.weaponLevels}
                                isMobileDevice={isMobileDevice}
                                sectorState={gameState.sectorState || EMPTY_SECTOR_STATE}
                                onClose={handleCloseAction}
                                onSave={handleSaveArmoryPlaygroundAction}
                                stats={throttledStats}
                            />
                        )}
                    </div>

                    <div className={activeOverlay === OverlayType.TERMINAL_SKILLS ? "" : "hidden"}>
                        {gameState.screen === GameScreen.CAMP ? (
                            <ScreenSkills
                                stats={throttledStats}
                                onSave={handleSaveStats}
                                onClose={handleOverlayClose}
                                isMobileDevice={isMobileDevice}
                            />
                        ) : (
                            <ScreenTerminalSkill
                                stats={throttledStats}
                                isMobileDevice={isMobileDevice}
                                sectorState={gameState.sectorState || EMPTY_SECTOR_STATE}
                                onClose={handleCloseAction}
                                onSave={handleSaveSkillsPlaygroundAction}
                            />
                        )}
                    </div>

                    <div className={activeOverlay === OverlayType.TERMINAL_ENVIRONMENT ? "" : "hidden"}>
                        <ScreenTerminalEnvironment
                            onClose={handleCloseAction}
                            isMobileDevice={isMobileDevice}
                            currentWeather={gameState.weather}
                            onWeatherChange={handleWeatherChangeAction}
                            currentOverride={gameState.environmentOverrides?.[gameState.currentSector]}
                            onOverrideChange={handleEnvironmentOverrideChangeAction}
                            transparent={true}
                        />
                    </div>

                    <div className={activeOverlay === OverlayType.TERMINAL_SPAWNER ? "" : "hidden"}>
                        <ScreenTerminalSpawner
                            onClose={handleCloseAction}
                            isMobileDevice={isMobileDevice}
                            onSpawnEnemies={handleSpawnEnemiesAction}
                        />
                    </div>

                    <div className={activeOverlay === OverlayType.TERMINAL_UI ? "" : "hidden"}>
                        <ScreenTerminalUI
                            onClose={handleCloseAction}
                            isMobileDevice={isMobileDevice}
                        />
                    </div>

                    <div className={activeOverlay === OverlayType.MAP ? "" : "hidden"}>
                        <ScreenMap
                            onClose={handleCloseAction}
                            onSelectCoords={handleMapSelectCoordsAction}
                            isMobileDevice={isMobileDevice}
                        />
                    </div>

                    <div className={activeOverlay === OverlayType.TELEPORT ? "" : "hidden"}>
                        <ScreenTeleport
                            initialCoords={teleportInitialCoords || { x: 0, z: 0 }}
                            onJump={handleJumpAction}
                            onCancel={handleTeleportCancelAction}
                            isMobileDevice={isMobileDevice}
                        />
                    </div>

                    <div className={gameState.screen === GameScreen.BOSS_KILLED ? "" : "hidden"}>
                        <ScreenBossKilled
                            sectorIndex={gameState.currentSector}
                            stats={cachedSectorStats}
                            onProceed={handleBossKilledProceed}
                            onExplore={handleBossKilledExplore}
                            isMobileDevice={isMobileDevice}
                        />
                    </div>

                    <div className={(gameState.screen === GameScreen.DEATH || activeOverlay === OverlayType.DEATH) ? "" : "hidden"}>
                        <ScreenPlayerDied
                            onRespawn={handleRespawnPlayer}
                            onRespawnAtBoss={handleRespawnPlayerAtBoss}
                            onContinue={handleContinueFromDeath}
                            isMobileDevice={isMobileDevice}
                        />
                    </div>

                    <div className={(gameState.screen === GameScreen.RECAP && sectorStats) ? "" : "hidden"}>
                        <ScreenSectorReport
                            stats={cachedSectorStats}
                            playerStats={throttledStats}
                            deathDetails={deathDetails}
                            currentSector={gameState.currentSector}
                            onReturnCamp={handleReturnToCamp}
                            onRestartSector={handleRestartSector}
                            onRespawn={handleRespawnSector}
                            onNextSector={handleNextSector}
                            isMobileDevice={isMobileDevice}
                        />
                    </div>

                    <div className={(gameState.screen === GameScreen.PROLOGUE && !isLoadingSector) ? "" : "hidden"}>
                        <Prologue onComplete={handlePrologueCompleteAction} isMobileDevice={isMobileDevice} />
                    </div>

                    <div className={activeOverlay === OverlayType.TERMINAL_SECTORS ? "" : "hidden"}>
                        <ScreenSectorOverview
                            currentSector={gameState.currentSector}
                            rescuedFamilyIndices={StatsBridge.getRescuedFamilyIndices(throttledStats)}
                            deadBossIndices={StatsBridge.getDeadBossIndices(throttledStats)}
                            debugMode={gameState.settings.debugMode}
                            stats={throttledStats}
                            onClose={handleOverlayClose}
                            onSelectSector={handleSelectSector}
                            onStartSector={handleStartSector}
                            isMobileDevice={isMobileDevice}
                        />
                    </div>

                    <div className={activeOverlay === OverlayType.RESET_CONFIRM ? "" : "hidden"}>
                        <ScreenResetConfirm
                            onConfirm={handleResetGame}
                            onCancel={handleCancelReset}
                        />
                    </div>

                    {(showFPS || gameState.settings.debugMode) && (
                        <DebugDisplay />
                    )}

                    <ScreenLoading
                        isDone={!showLoadingOverlay}
                        sectorIndex={gameState.screen === GameScreen.PROLOGUE ? 0 : (loadingSectorIndex !== null ? loadingSectorIndex : (gameState.currentSector || 0))}
                        isPrologue={gameState.screen === GameScreen.PROLOGUE}
                        isCamp={loadingTargetIsCamp}
                        isInitialBoot={isInitialBoot}
                        isMobileDevice={isMobileDevice}
                    />
                </>
            )}

            <CustomCursor hidden={cursorHidden} />
        </div>
    );
};

export default App;