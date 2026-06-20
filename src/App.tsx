import React, { useState, useEffect, useCallback, useRef } from 'react';
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
    const [isSectorBannerActive, setIsSectorBannerActive] = useState(false);
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
    const [initialAdventureLogTab, setInitialAdventureLogTab] = useState<DiscoveryType>(DiscoveryType.CHALLENGE);
    const [initialAdventureLogItem, setInitialAdventureLogItem] = useState<string | null>(null);
    const [initialStatisticsTab, setInitialStatisticsTab] = useState<string>('overview');
    const [initialStatisticsItem, setInitialStatisticsItem] = useState<string | null>(null);
    const showFPS = !!gameState.settings.showFps;

    const gameCanvasRef = React.useRef<GameSessionHandle>(null);
    const transitionTaskRef = useRef(false);
    const sceneReadyRef = useRef(false);

    // --- ZERO-GC: LATEST STATE REF ---
    const latestStateRef = useRef({ gameState, isMobileDevice, activeOverlay });
    latestStateRef.current.gameState = gameState;
    latestStateRef.current.isMobileDevice = isMobileDevice;
    latestStateRef.current.activeOverlay = activeOverlay;

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

        const handleSectorBannerPreviewEvent = () => {
            setIsSectorBannerActive(true);
        };

        window.addEventListener('resize', checkMobile);
        document.addEventListener('pointerlockchange', handleLockChange);
        window.addEventListener('ctrl-inspect-mode', handleCtrlInspect);
        window.addEventListener('open-adventure-log', handleOpenAdventureLogEvent);
        window.addEventListener('open-statistics', handleOpenStatisticsEvent);
        window.addEventListener('trigger-side-banner-preview', handleSectorBannerPreviewEvent);

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
            window.removeEventListener('trigger-side-banner-preview', handleSectorBannerPreviewEvent);
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
                setIsSectorBannerActive(true);
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
        // Open the collectible modal — persistence is handled live by DiscoverySystem/GameSession
        setActiveCollectible(id);
        setActiveOverlay(OverlayType.COLLECTIBLE);
    }, []);

    // Discoveries persist live to careerStats via DiscoverySystem/GameSession.
    // These callbacks are wired to GameCanvasProps but do nothing here — persistence happens in-engine.
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
        // FIX 1: Capture sectorStats immediately so progress is persisted even if the game closes.
        if (gameCanvasRef.current) {
            const stats = gameCanvasRef.current.getSectorStats(true, false);
            setSectorStats(stats);
        }

        // Update persistent career stats (deadBossIndices, skill points) right away
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

        // Immediate engine wake-up
        const engine = WinterEngine.getInstance();
        engine.isSimulationPaused = false;
        engine.input.enable();

        // Re-request pointer lock
        if (currentGameState.screen === GameScreen.SECTOR && !isMobile && gameCanvasRef.current) {
            gameCanvasRef.current.requestPointerLock();
        }
    }, []);

    const handleOpenSettingsAction = useCallback(() => setActiveOverlay(OverlayType.SETTINGS), []);
    const handleOpenAdventureLogAction = useCallback((tab?: DiscoveryType, itemId?: string) => {
        // Guard against direct React event bindings passing the event object as 'tab'
        const resolvedTab = (tab !== undefined && tab !== null && typeof tab === 'number') ? tab : DiscoveryType.CHALLENGE;
        setInitialAdventureLogTab(resolvedTab);
        setInitialAdventureLogItem(itemId || null);
        setActiveOverlay(OverlayType.ADVENTURE_LOG);
        UISounds.playConfirm();
    }, []);

    const handleOpenStatisticsAction = useCallback((tab?: string, itemId?: string) => {
        // Guard against direct React event bindings passing the event object as 'tab'
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
        // Extract stats BEFORE unmounting or navigating away
        const stats = gameCanvasRef.current?.getSectorStats(false, true) || latestStateRef.current.gameState.stats;
        const finalHud = HudStore.getState();

        // 1. Process technical death (updates permanent stats)
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
        // Resume simulation and input
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

    // --- GLOBAL EVENT LISTENERS (For UI Bridge) ---
    useEffect(() => {
        const onOpenLog = (e: any) => handleOpenAdventureLogAction(e.detail?.tab, e.detail?.itemId);
        const onOpenStats = (e: any) => handleOpenStatisticsAction(e.detail?.tab, e.detail?.itemId);

        window.addEventListener('open-adventure-log', onOpenLog);
        window.addEventListener('open-statistics', onOpenStats);
        return () => {
            window.removeEventListener('open-adventure-log', onOpenLog);
            window.removeEventListener('open-statistics', onOpenStats);
        };
    }, [handleOpenAdventureLogAction, handleOpenStatisticsAction]);


    const handleSectorEnded = useCallback((stats: SectorStats) => {
        setDeathDetails(null);
        setSectorStats(stats); // DONT aggregate yet!

        setGameState(prev => {
            const bossKilled = StatsBridge.isSectorBossDefeated(stats);
            return {
                ...prev,
                screen: bossKilled ? GameScreen.BOSS_KILLED : GameScreen.RECAP
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
                // BUGFIX: Use sectorStats.isCompleted as the authoritative "not died" signal.
                // !!deathDetails is a stale React closure value and can be incorrect across
                // state update batches (e.g., death → recap → return to camp).
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

        // If it's the last sector, stay at the last story sector.
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
                sectorState: nextSector === SectorID.PLAYGROUND ? prev.sectorState : undefined // Only persist for playground
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

            // Clean-up
            setTeleportTarget(null);
            setActiveCollectible(null);
            setActiveOverlay(OverlayType.NONE);

            setGameState(prev => ({
                ...prev,
                screen: GameScreen.SECTOR,
                sectorState: prev.currentSector === SectorID.PLAYGROUND
                    ? prev.sectorState : undefined // Clear if not playground
            }));
            HudStore.update({ ...HudStore.getState(), hudVisible: false });
        }, sectorIndex);
    }, [triggerLoadingTransition]);

    const handleRespawnSector = useCallback(() => {
        UISounds.playConfirm();

        // Keep gameCanvasRef alive and trigger resurrection
        if (gameCanvasRef.current) {
            gameCanvasRef.current.respawnPlayer();
        } else {
            console.error("[App] VARNING: gameCanvasRef är null! GameSession har unmountats!");
        }

        // Clear UI state instantly for "blixtsnabb" feedback
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
        engine.isRenderingPaused = false;
        engine.isSimulationPaused = false;

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

    // ============================================================================
    // UNIFIED GAME INPUT ENGINE BRIDGE
    // Centralized Zero-GC pipeline synchronized directly to the engine frame ticks.
    // Prevents uninitialized cross-wiring and resolves pointer lock focus losses.
    // ============================================================================
    useInput(
        { engineRef, engine: engineRef.current, cinematicRef: { current: { active: false } }, bossIntroTimerRef: { current: null }, stateRef: { current: null } },
        {
            isPaused: activeOverlay !== OverlayType.NONE,
            isGameRunning: !isInitialBoot && !isLoadingSector && !isLoadingCamp,
            isMobileDevice: isMobileDevice,
            gameState: gameState,
            activeOverlay: activeOverlay // Secure pass-through to satisfy internal layout gates
        } as any,
        {
            setActiveOverlay,
            setTeleportInitialCoords,
            // Wired directly to your stable instance handler to prevent state duplication
            onPauseToggle: (pause: boolean) => {
                if (pause) {
                    handleTogglePauseAction();
                    if (document.pointerLockElement) document.exitPointerLock();
                } else {
                    handleResumeAction();
                }
            },
            // Wired directly to line 709's validated persistence handler
            onCollectibleClose: handleCollectibleClose,
            requestPointerLock: () => {
                if (!isMobileDevice && gameCanvasRef.current) {
                    gameCanvasRef.current.requestPointerLock();
                }
            }
        }
    );

    const cursorHidden = !isCtrlInspect && (isMobileDevice || isPointerLocked || (hasInteracted && gameState.screen === GameScreen.SECTOR && activeOverlay === OverlayType.NONE));
    const showHUD = hasInteracted && (activeOverlay === OverlayType.NONE || activeOverlay === OverlayType.INTRO) && !isLoadingSector && !isLoadingCamp && !showLoadingOverlay && gameState.screen === GameScreen.SECTOR;

    // Boolean to check if we should mount/keep GameSession alive
    const shouldKeepSessionAlive =
        (gameState.screen === GameScreen.SECTOR ||
            gameState.screen === GameScreen.PROLOGUE ||
            gameState.screen === GameScreen.RECAP ||
            gameState.screen === GameScreen.BOSS_KILLED ||
            gameState.screen === GameScreen.DEATH);

    return (
        <div
            className="relative w-full h-full overflow-hidden bg-black select-none cursor-none"
            onPointerDown={() => {
                if (!hasInteracted) setHasInteracted(true);
                if (gameState.screen === GameScreen.SECTOR && activeOverlay === OverlayType.NONE && !isMobileDevice && !document.pointerLockElement) {
                    gameCanvasRef.current?.requestPointerLock();
                }
            }}
        >
            {!hasInteracted ? (
                <ScreenStartGame
                    onStart={() => setHasInteracted(true)}
                    isMobileDevice={isMobileDevice}
                />
            ) : (
                <>
                    {gameState.screen === GameScreen.CAMP && (
                        <Camp
                            key="camp-main"
                            stats={gameState.stats}
                            currentLoadout={gameState.loadout}
                            weaponLevels={gameState.weaponLevels}
                            currentSector={gameState.currentSector}
                            rescuedFamilyIndices={StatsBridge.getRescuedFamilyIndices(gameState.stats)}
                            deadBossIndices={StatsBridge.getDeadBossIndices(gameState.stats)}
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

                    {/* GameSession is wrapped in a hidden div if it's not the active screen but needs to live */}
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
                                    familyAlreadyRescued={StatsBridge.getRescuedFamilyIndices(gameState.stats).includes(gameState.currentSector)}
                                    bossPermanentlyDefeated={StatsBridge.getDeadBossIndices(gameState.stats).includes(gameState.currentSector)}
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
                                    isSectorBannerActive={isSectorBannerActive}
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
                                        isSectorBannerActive={isSectorBannerActive}
                                        onSectorBannerComplete={() => setIsSectorBannerActive(false)}
                                    />
                                )}
                            </>
                        )}
                    </div>

                    {/* UNIVERSAL OVERLAYS */}
                    {activeOverlay === OverlayType.PAUSE && (
                        <ScreenPause
                            onResume={handleResumeAction}
                            onAbort={handleAbortSector}
                            onOpenMap={handleToggleMapAction}
                            onOpenSettings={handleOpenSettingsAction}
                            onOpenAdventureLog={handleOpenAdventureLogAction}
                            onOpenStatistics={handleOpenStatisticsAction}
                            stats={gameState.screen === GameScreen.SECTOR ? (gameCanvasRef.current?.getMergedSessionStats() || gameState.stats) : gameState.stats}
                            isMobileDevice={isMobileDevice}
                        />
                    )}

                    {activeOverlay === OverlayType.SETTINGS && (
                        <ScreenSettings
                            onClose={handleCloseAction}
                            settings={gameState.settings}
                            onUpdateGraphics={handleSaveGraphics}
                            showFps={showFPS}
                            onToggleShowFps={handleToggleShowFps}
                            isMobileDevice={isMobileDevice}
                        />
                    )}

                    {activeOverlay === OverlayType.ADVENTURE_LOG && (
                        <ScreenAdventureLog
                            stats={gameState.screen === GameScreen.SECTOR ? (gameCanvasRef.current?.getMergedSessionStats() || gameState.stats) : gameState.stats}
                            onClose={handleCloseAction}
                            onToggleChallengeTracking={handleToggleChallengeTrackingAction}
                            isMobileDevice={isMobileDevice}
                            debugMode={gameState.settings.debugMode}
                            initialTab={initialAdventureLogTab}
                            initialItemId={initialAdventureLogItem}
                        />
                    )}

                    {activeOverlay === OverlayType.COLLECTIBLE && activeCollectible && (
                        <ScreenCollectibleDiscovered
                            collectibleId={activeCollectible}
                            onClose={handleCollectibleClose}
                            isMobileDevice={isMobileDevice}
                        />
                    )}

                    {activeOverlay === OverlayType.TERMINAL_STATISTICS && (
                        <ScreenStatistics
                            stats={gameState.screen === GameScreen.SECTOR ? (gameCanvasRef.current?.getMergedSessionStats() || gameState.stats) : gameState.stats}
                            onClose={handleCloseAction}
                            onOpenDiscovery={() => handleOpenAdventureLogAction(DiscoveryType.CLUE)}
                            isMobileDevice={isMobileDevice}
                            debugMode={gameState.settings.debugMode}
                            initialTab={initialStatisticsTab as any}
                            initialItemId={initialStatisticsItem}
                        />
                    )}

                    {activeOverlay === OverlayType.TERMINAL_ARMORY && (
                        gameState.screen === GameScreen.CAMP ? (
                            <ScreenArmory
                                stats={gameState.stats}
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
                                stats={gameState.stats}
                            />
                        )
                    )}

                    {activeOverlay === OverlayType.TERMINAL_SKILLS && (
                        gameState.screen === GameScreen.CAMP ? (
                            <ScreenSkills
                                stats={gameState.stats}
                                onSave={handleSaveStats}
                                onClose={handleOverlayClose}
                                isMobileDevice={isMobileDevice}
                            />
                        ) : (
                            <ScreenTerminalSkill
                                stats={gameState.stats}
                                isMobileDevice={isMobileDevice}
                                sectorState={gameState.sectorState || EMPTY_SECTOR_STATE}
                                onClose={handleCloseAction}
                                onSave={handleSaveSkillsPlaygroundAction}
                            />
                        )
                    )}

                    {activeOverlay === OverlayType.TERMINAL_ENVIRONMENT && (
                        <ScreenTerminalEnvironment
                            onClose={handleCloseAction}
                            isMobileDevice={isMobileDevice}
                            currentWeather={gameState.weather}
                            onWeatherChange={handleWeatherChangeAction}
                            currentOverride={gameState.environmentOverrides?.[gameState.currentSector]}
                            onOverrideChange={handleEnvironmentOverrideChangeAction}
                            transparent={true}
                        />
                    )}

                    {activeOverlay === OverlayType.TERMINAL_SPAWNER && (
                        <ScreenTerminalSpawner
                            onClose={handleCloseAction}
                            isMobileDevice={isMobileDevice}
                            onSpawnEnemies={handleSpawnEnemiesAction}
                        />
                    )}

                    {activeOverlay === OverlayType.TERMINAL_UI && (
                        <ScreenTerminalUI
                            onClose={handleCloseAction}
                            isMobileDevice={isMobileDevice}
                        />
                    )}

                    {activeOverlay === OverlayType.MAP && (
                        <ScreenMap
                            onClose={handleCloseAction}
                            onSelectCoords={handleMapSelectCoordsAction}
                            isMobileDevice={isMobileDevice}
                        />
                    )}

                    {activeOverlay === OverlayType.TELEPORT && (
                        <ScreenTeleport
                            initialCoords={teleportInitialCoords}
                            onJump={handleJumpAction}
                            onCancel={handleTeleportCancelAction}
                            isMobileDevice={isMobileDevice}
                        />
                    )}

                    {gameState.screen === GameScreen.BOSS_KILLED && (
                        <ScreenBossKilled
                            sectorIndex={gameState.currentSector}
                            stats={sectorStats || undefined}
                            onProceed={handleBossKilledProceed}
                            onExplore={handleBossKilledExplore}
                            isMobileDevice={isMobileDevice}
                        />
                    )}

                    {/* VINTERDÖD FIX: Unify Death Screen logic (Overlay or Screen State) */}
                    {(gameState.screen === GameScreen.DEATH || activeOverlay === OverlayType.DEATH) && (
                        <ScreenPlayerDied
                            onRespawn={() => {
                                UISounds.playConfirm();
                                gameCanvasRef.current?.respawnPlayer(false);
                                setActiveOverlay(OverlayType.NONE);
                                setGameState(prev => ({ ...prev, screen: GameScreen.SECTOR }));
                                setSectorStats(null);
                                setDeathDetails(null);
                                setActiveCollectible(null);
                                HudStore.update({ ...HudStore.getState(), hudVisible: true, isDead: false });
                            }}
                            onRespawnAtBoss={() => {
                                UISounds.playConfirm();
                                gameCanvasRef.current?.respawnPlayer(true);
                                setActiveOverlay(OverlayType.NONE);
                                setGameState(prev => ({ ...prev, screen: GameScreen.SECTOR }));
                                setSectorStats(null);
                                setDeathDetails(null);
                                setActiveCollectible(null);
                                HudStore.update({ ...HudStore.getState(), hudVisible: true, isDead: false });
                            }}
                            onContinue={handleContinueFromDeath}
                            isMobileDevice={isMobileDevice}
                        />
                    )}

                    {gameState.screen === GameScreen.RECAP && sectorStats && (
                        <ScreenSectorReport
                            stats={sectorStats}
                            playerStats={gameState.stats}
                            deathDetails={deathDetails}
                            currentSector={gameState.currentSector}
                            onReturnCamp={handleReturnToCamp}
                            onRestartSector={handleRestartSector}
                            onRespawn={handleRespawnSector}
                            onNextSector={handleNextSector}
                            isMobileDevice={isMobileDevice}
                        />
                    )}

                    {gameState.screen === GameScreen.PROLOGUE && !isLoadingSector && (
                        <Prologue onComplete={handlePrologueCompleteAction} isMobileDevice={isMobileDevice} />
                    )}

                    {activeOverlay === OverlayType.TERMINAL_SECTORS && (
                        <ScreenSectorOverview
                            currentSector={gameState.currentSector}
                            rescuedFamilyIndices={StatsBridge.getRescuedFamilyIndices(gameState.stats)}
                            deadBossIndices={StatsBridge.getDeadBossIndices(gameState.stats)}
                            debugMode={gameState.settings.debugMode}
                            stats={gameState.stats}
                            onClose={handleOverlayClose}
                            onSelectSector={handleSelectSector}
                            onStartSector={handleStartSector}
                            isMobileDevice={isMobileDevice}
                        />
                    )}

                    {activeOverlay === OverlayType.RESET_CONFIRM && (
                        <ScreenResetConfirm
                            onConfirm={handleResetGame}
                            onCancel={handleCancelReset}
                        />
                    )}

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
