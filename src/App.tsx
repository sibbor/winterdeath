import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameState, SectorStats } from './types/StateTypes';
import { GameScreen } from './types/SessionTypes';
import { PlayerStats, PlayerStatID } from './entities/player/PlayerTypes';
import { WeatherType } from './core/engine/EngineTypes';
import { SectorTrigger } from './types/TriggerTypes';
import { BossID, SectorID } from './game/session/SectorTypes';
import { loadGameState, saveGameState, clearSave } from './utils/persistence';
import { aggregateStats } from './game/progression/ProgressionManager';
import GameSession, { GameSessionHandle } from './game/session/GameSession';
import ScreenStartGame from './components/ui/screens/shared/ScreenStartGame';
import ScreenLoading from './components/ui/screens/shared/ScreenLoading';
import Prologue from './components/ui/screens/Prologue';
import Camp from './components/camp/Camp';
import GameHUD from './components/ui/hud/GameHUD';
import ScreenPause from './components/ui/screens/game/ScreenPause';
import ScreenMap from './components/ui/screens/game/ScreenMap';
import ScreenTeleport from './components/ui/screens/game/ScreenTeleport';
import ScreenSectorReport from './components/ui/screens/game/ScreenSectorReport';
import ScreenBossKilled from './components/ui/screens/game/ScreenBossKilled';
import ScreenCollectibleDiscovered from './components/ui/screens/game/ScreenCollectibleDiscovered';
import ScreenAdventureLog from './components/ui/screens/camp/ScreenAdventureLog';
import ScreenStatistics from './components/ui/screens/camp/ScreenStatistics';
import ScreenSettings from './components/ui/screens/camp/ScreenSettings';
import ScreenPlaygroundArmoryStation from './components/ui/screens/game/ScreenPlaygroundArmoryStation';
import { ScreenPlaygroundEnemyStation } from './components/ui/screens/game/ScreenPlaygroundEnemyStation';
import ScreenPlaygroundSkillStation from './components/ui/screens/game/ScreenPlaygroundSkillStation';
import { ScreenPlaygroundEnvironmentStation } from './components/ui/screens/game/ScreenPlaygroundEnvironmentStation';
import ScreenPlayerDied from './components/ui/screens/game/ScreenPlayerDied';
import ScreenArmory from './components/ui/screens/camp/ScreenArmory';
import ScreenSkills from './components/ui/screens/camp/ScreenSkills';
import ScreenSectorOverview from './components/ui/screens/camp/ScreenSectorOverview';
import ScreenResetConfirm from './components/ui/screens/camp/ScreenResetConfirm';
import DebugDisplay from './components/ui/core/DebugDisplay';
import CustomCursor from './components/ui/core/CustomCursor';
import { useGlobalInput } from './hooks/useGlobalInput';
import { UiSounds } from './utils/audio/AudioLib';
import { checkIsMobileDevice } from './utils/device';
import { AssetPreloader } from './systems/AssetPreloader';
import { WinterEngine, GameSettings } from './core/engine/WinterEngine';
import { HudStore } from './store/HudStore';
import { SectorSystem } from './systems/SectorSystem';
import { OverlayType, DiscoveryType } from './components/ui/hud/HudTypes';
import { StatsBridge } from './core/data/StatsBridge';

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
        HudStore.patch({ debugMode: gameState.debugMode });
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

    const [hasInteracted, setHasInteracted] = useState(!isMobileDevice);

    const [isInitialBoot, setIsInitialBoot] = useState(true);
    const [isLoadingSector, setIsLoadingSector] = useState(false);
    const [isLoadingCamp, setIsLoadingCamp] = useState(false);
    const [loadingTargetIsCamp, setLoadingTargetIsCamp] = useState(false);
    const [showLoadingOverlay, setShowLoadingOverlay] = useState(true);

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
    const showFPS = !!gameState.showFps;

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

        window.addEventListener('resize', checkMobile);
        document.addEventListener('pointerlockchange', handleLockChange);
        window.addEventListener('open-adventure-log', handleOpenAdventureLogEvent);
        window.addEventListener('open-statistics', handleOpenStatisticsEvent);

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
            window.removeEventListener('open-adventure-log', handleOpenAdventureLogEvent);
            window.removeEventListener('open-statistics', handleOpenStatisticsEvent);
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
        task: () => Promise<void> | void
    ) => {
        transitionTaskRef.current = true;
        sceneReadyRef.current = false;

        if (type === 'CAMP') setIsLoadingCamp(true);
        else setIsLoadingSector(true);

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

            await triggerLoadingTransition(isCamp ? 'CAMP' : 'SECTOR', async () => {
                const sectorIndex = gameState.currentSector !== undefined ? gameState.currentSector : 0;
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
            });
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
        UiSounds.playConfirm();
    }, []);

    const handleCheckpointReached = useCallback(() => { }, []);

    const handleCollectibleDiscoveredAction = useCallback((id: string) => {
        setActiveCollectible(id);
        setActiveOverlay(OverlayType.COLLECTIBLE);
        setGameState(prev => {
            if (StatsBridge.getCollectiblesDiscovered(prev.stats).includes(id)) return prev;

            const newStatsBuffer = new Float32Array(StatsBridge.getStatsBuffer(prev.stats));
            newStatsBuffer[PlayerStatID.SKILL_POINTS] += 1;

            return {
                ...prev,
                stats: {
                    ...prev.stats,
                    statsBuffer: newStatsBuffer,
                    collectiblesDiscovered: [...StatsBridge.getCollectiblesDiscovered(prev.stats), id],
                    totalSkillPointsEarned: StatsBridge.getTotalSkillPointsEarned(prev.stats) + 1
                }
            };
        });
    }, []);

    const handleClueDiscoveredAction = useCallback((clue: SectorTrigger | string) => {
        const clueId = String(typeof clue === 'string' ? clue : (clue?.id || ''));
        if (!clueId) return;
        setGameState(prev => {
            if (StatsBridge.getCluesFound(prev.stats).includes(clueId)) return prev;

            const newStatsBuffer = new Float32Array(StatsBridge.getStatsBuffer(prev.stats));
            newStatsBuffer[PlayerStatID.SKILL_POINTS] += 1;

            return {
                ...prev,
                stats: {
                    ...prev.stats,
                    statsBuffer: newStatsBuffer,
                    cluesFound: [...StatsBridge.getCluesFound(prev.stats), clueId],
                    totalSkillPointsEarned: StatsBridge.getTotalSkillPointsEarned(prev.stats) + 1
                }
            };
        });
    }, []);

    const handlePOIdiscoveredAction = useCallback((poi: SectorTrigger | string) => {
        const poiId = String(typeof poi === 'string' ? poi : (poi?.id || ''));
        if (!poiId) return;
        setGameState(prev => {
            if (StatsBridge.getDiscoveredPOIs(prev.stats).includes(poiId)) return prev;

            const newStatsBuffer = new Float32Array(StatsBridge.getStatsBuffer(prev.stats));
            newStatsBuffer[PlayerStatID.SKILL_POINTS] += 1;

            return {
                ...prev,
                stats: {
                    ...prev.stats,
                    statsBuffer: newStatsBuffer,
                    discoveredPOIs: [...StatsBridge.getDiscoveredPOIs(prev.stats), poiId],
                    totalSkillPointsEarned: StatsBridge.getTotalSkillPointsEarned(prev.stats) + 1
                }
            };
        });
    }, []);

    const handleEnemyDiscoveredAction = useCallback((type: number) => {
        if (!type && type !== 0) return;
        setGameState(prev => {
            if (StatsBridge.getSeenEnemies(prev.stats).includes(type)) return prev;
            return { ...prev, stats: { ...prev.stats, seenEnemies: [...StatsBridge.getSeenEnemies(prev.stats), type] } };
        });
    }, []);

    const handleBossDiscoveredAction = useCallback((id: number) => {
        if (!id && id !== 0) return;
        setGameState(prev => {
            if (StatsBridge.getSeenBosses(prev.stats).includes(id)) return prev;
            return { ...prev, stats: { ...prev.stats, seenBosses: [...StatsBridge.getSeenBosses(prev.stats), id] } };
        });
    }, []);

    const handleDialogueStateChangeAction = useCallback((active: boolean) => setActiveOverlay(active ? OverlayType.DIALOGUE : OverlayType.NONE), []);
    const handleDeathStateChangeAction = useCallback((active: boolean) => setActiveOverlay(active ? OverlayType.DEATH : OverlayType.NONE), []);
    const handleBossIntroStateChangeAction = useCallback((active: boolean) => setActiveOverlay(active ? OverlayType.INTRO : OverlayType.NONE), []);

    const handleBossDefeatedAction = useCallback((bossId: BossID) => {
        setGameState(prev => {
            if (prev.deadBossIndices.includes(prev.currentSector)) return prev;

            const newStatsBuffer = new Float32Array(StatsBridge.getStatsBuffer(prev.stats));
            newStatsBuffer[PlayerStatID.SKILL_POINTS] += 1;

            return {
                ...prev,
                deadBossIndices: [...prev.deadBossIndices, prev.currentSector],
                stats: {
                    ...prev.stats,
                    statsBuffer: newStatsBuffer,
                    totalSkillPointsEarned: StatsBridge.getTotalSkillPointsEarned(prev.stats) + 1,
                    deadBossIndices: [...StatsBridge.getDeadBossIndices(prev.stats), prev.currentSector]
                }
            };
        });
    }, []);

    const handleFamilyRescuedAction = useCallback((familyId: number) => {
        setGameState(prev => {
            if (prev.rescuedFamilyIndices.includes(prev.currentSector)) return prev;

            const newStatsBuffer = new Float32Array(StatsBridge.getStatsBuffer(prev.stats));
            newStatsBuffer[PlayerStatID.SKILL_POINTS] += 1;

            return {
                ...prev,
                rescuedFamilyIndices: [...prev.rescuedFamilyIndices, prev.currentSector],
                stats: {
                    ...prev.stats,
                    statsBuffer: newStatsBuffer,
                    totalSkillPointsEarned: StatsBridge.getTotalSkillPointsEarned(prev.stats) + 1
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
        UiSounds.playClick();
    }, []);

    const handleToggleMapAction = useCallback(() => {
        setActiveOverlay(OverlayType.MAP);
        UiSounds.playConfirm();
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
        UiSounds.playConfirm();
    }, []);

    const handleOpenStatisticsAction = useCallback((tab?: string, itemId?: string) => {
        // Guard against direct React event bindings passing the event object as 'tab'
        const resolvedTab = (tab && typeof tab === 'string') ? tab : 'overview';
        setInitialStatisticsTab(resolvedTab);
        setInitialStatisticsItem(itemId || null);
        setActiveOverlay(OverlayType.STATION_STATISTICS);
        UiSounds.playConfirm();
    }, []);

    const handleCloseAction = useCallback(() => {
        const { gameState: currentGameState, isMobileDevice: isMobile } = latestStateRef.current;
        if (currentGameState.screen === GameScreen.SECTOR && !isMobile) {
            gameCanvasRef.current?.requestPointerLock();
        }
        setActiveOverlay(OverlayType.NONE);
    }, []);

    const handleMarkCollectiblesViewedAction = useCallback((ids: string[]) => {
        setGameState(prev => {
            const currentViewed = StatsBridge.getViewedCollectibles(prev.stats);
            const newViewed = [...currentViewed];
            let changed = false;
            for (let i = 0; i < ids.length; i++) {
                if (!newViewed.includes(ids[i])) {
                    newViewed.push(ids[i]);
                    changed = true;
                }
            }
            if (!changed) return prev;
            return { ...prev, stats: { ...prev.stats, viewedCollectibles: newViewed } };
        });
    }, []);

    const handleContinueFromDeath = useCallback(() => {
        // Extract stats BEFORE unmounting or navigating away
        const stats = gameCanvasRef.current?.getSectorStats(false, true) || latestStateRef.current.gameState.stats;
        const finalHud = HudStore.getState();

        // 1. Process technical death (updates permanent stats)
        handleDie(stats as any, finalHud.killerName);

        UiSounds.playConfirm();
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
        UiSounds.playConfirm();
        setGameState(prev => ({ ...prev, screen: GameScreen.RECAP }));
    }, []);

    const handlePrologueCompleteAction = useCallback(() => {
        setGameState(prev => ({
            ...prev,
            screen: GameScreen.SECTOR,
            currentSector: 0,
            stats: { ...prev.stats, prologueSeen: true }
        }));
        HudStore.update({ ...HudStore.getState(), hudVisible: true });
        UiSounds.playConfirm();
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

    const handleSaveStats = useCallback((newStats: PlayerStats) => {
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
        UiSounds.playClick();
    }, []);

    const handleSaveGraphics = useCallback((newG: GameSettings) => {
        setGameState(prev => ({ ...prev, settings: newG }));
        WinterEngine.getInstance().updateSettings(newG);
    }, []);

    const handleSaveLoadout = useCallback((loadout: any, levels: any) => {
        setGameState(prev => ({ ...prev, loadout, weaponLevels: levels }));
    }, []);

    const handleSelectSector = useCallback((sectorIndex: number) => {
        setGameState(prev => ({ ...prev, currentSector: sectorIndex, sessionToken: (prev.sessionToken || 0) + 1 }));
    }, []);

    const aggregatePendingStats = useCallback(async () => {
        if (!sectorStats) return;
        return new Promise<void>(resolve => {
            setGameState(prev => {
                const newStats = aggregateStats(prev.stats, sectorStats, !!deathDetails, !!sectorStats.aborted, prev.currentSector, 0);
                setTimeout(resolve, 0);
                return { ...prev, stats: newStats };
            });
        });
    }, [sectorStats, deathDetails]);

    const handleReturnToCamp = useCallback(async () => {
        UiSounds.playConfirm();
        await aggregatePendingStats();

        triggerLoadingTransition('CAMP', async () => {
            AssetPreloader.releaseSectorAssets(latestStateRef.current.gameState.currentSector);

            const yieldToMain = () => new Promise<void>(resolve => {
                requestAnimationFrame(() => setTimeout(resolve, 0));
            });

            await AssetPreloader.warmupAsync('CAMP', yieldToMain);

            setGameState(prev => {
                const isCleared = prev.deadBossIndices.includes(prev.currentSector);
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

            const newMap = new Uint8Array(256);
            if (currentMap) newMap.set(currentMap);
            newMap[perkId] = 1;

            return {
                ...prev,
                stats: {
                    ...prev.stats,
                    discoveredPerksMap: newMap
                }
            };
        });
    }, []);

    const handleNextSector = useCallback(() => {
        UiSounds.playConfirm();
        aggregatePendingStats();

        triggerLoadingTransition('SECTOR', async () => {
            const nextSector = latestStateRef.current.gameState.currentSector + 1;

            // If it's the last sector, stay at the last story sector.
            if (nextSector > SectorID.SCRAPYARD) {
                AssetPreloader.releaseSectorAssets(latestStateRef.current.gameState.currentSector);
                setGameState(prev => ({ ...prev, screen: GameScreen.CAMP, currentSector: SectorID.SCRAPYARD, weather: WeatherType.SNOW }));
                return;
            }

            AssetPreloader.releaseSectorAssets(latestStateRef.current.gameState.currentSector);

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
                sessionToken: (prev.sessionToken || 0) + 1,
                sectorState: nextSector === SectorID.PLAYGROUND ? prev.sectorState : undefined // Only persist for playground
            }));
            HudStore.update({ ...HudStore.getState(), hudVisible: false });
        });
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
                sessionToken: (prev.sessionToken || 0) + 1,
                sectorState: prev.currentSector === SectorID.PLAYGROUND ? prev.sectorState : undefined // Clear if not playground
            }));
            HudStore.update({ ...HudStore.getState(), hudVisible: false });
        });
    }, [triggerLoadingTransition]);

    const handleRespawnSector = useCallback(() => {
        UiSounds.playConfirm();

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
        UiSounds.playConfirm();

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
        const stats = gameCanvasRef.current.getSectorStats(false, true);
        handleSectorEnded(stats);
        UiSounds.playClick();
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
        setGameState(prev => ({ ...prev, debugMode: val }));
        HudStore.patch({ debugMode: val });
    }, []);
    const handlePauseToggle = useCallback((val: boolean) => setActiveOverlay(val ? OverlayType.PAUSE : OverlayType.NONE), []);
    const handleToggleShowFps = useCallback(() => {
        setGameState(prev => ({ ...prev, showFps: !prev.showFps }));
        UiSounds.playClick();
    }, []);
    const handleOverlayClose = useCallback(() => setActiveOverlay(OverlayType.NONE), []);

    const globalInputActions = React.useMemo(() => ({
        setActiveOverlay,
        setTeleportInitialCoords,
        requestPointerLock: () => { if (!latestStateRef.current.isMobileDevice) gameCanvasRef.current?.requestPointerLock(); },
        onCollectibleClose: handleCollectibleClose
    }), [handleCollectibleClose]);

    useGlobalInput(activeOverlay, { screen: gameState.screen }, globalInputActions);

    const cursorHidden = isMobileDevice || isPointerLocked || (hasInteracted && gameState.screen === GameScreen.SECTOR && activeOverlay === OverlayType.NONE);
    const showHUD = hasInteracted && (activeOverlay === OverlayType.NONE || activeOverlay === OverlayType.INTRO) && !isLoadingSector && !isLoadingCamp && !showLoadingOverlay && gameState.screen !== GameScreen.PROLOGUE;

    // Boolean to check if we should mount/keep GameSession alive
    const shouldKeepSessionAlive =
        (gameState.screen === GameScreen.SECTOR ||
            gameState.screen === GameScreen.PROLOGUE ||
            gameState.screen === GameScreen.RECAP ||
            gameState.screen === GameScreen.BOSS_KILLED ||
            gameState.screen === GameScreen.DEATH);
    // Tog bort "&& !transitionTaskRef.current"

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
                            rescuedFamilyIndices={gameState.rescuedFamilyIndices}
                            deadBossIndices={gameState.deadBossIndices}
                            debugMode={gameState.debugMode}
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

                    {/* VINTERDÖD FIX: GameSession is wrapped in a hidden div if it's not the active screen but needs to live */}
                    <div
                        className={`absolute inset-0 ${gameState.screen === GameScreen.SECTOR ||
                            gameState.screen === GameScreen.PROLOGUE ||
                            gameState.screen === GameScreen.BOSS_KILLED ||
                            gameState.screen === GameScreen.DEATH ? 'block' : 'hidden'
                            }`}
                    >
                        {shouldKeepSessionAlive && (
                            <>
                                <GameSession
                                    ref={gameCanvasRef}
                                    isWarmup={false}
                                    stats={gameState.stats}
                                    loadout={gameState.loadout}
                                    weaponLevels={gameState.weaponLevels}
                                    currentSector={gameState.screen === GameScreen.PROLOGUE ? 0 : gameState.currentSector}
                                    currentSectorData={SectorSystem.getSector(gameState.screen === GameScreen.PROLOGUE ? 0 : gameState.currentSector)}
                                    debugMode={gameState.debugMode}
                                    isGameRunning={gameState.screen === GameScreen.SECTOR && !activeOverlay && !isLoadingSector}
                                    isPaused={!!activeOverlay || isLoadingSector || gameState.screen === GameScreen.PROLOGUE || gameState.screen === GameScreen.RECAP || gameState.screen === GameScreen.DEATH}
                                    disableInput={activeOverlay === OverlayType.COLLECTIBLE || isLoadingSector || activeOverlay === OverlayType.ADVENTURE_LOG}
                                    onDie={handleDie}
                                    onSectorEnded={handleSectorEnded}
                                    onPauseToggle={handleTogglePauseAction}
                                    onOpenMap={handleOpenMap}
                                    triggerEndSector={false}
                                    familyAlreadyRescued={gameState.rescuedFamilyIndices.includes(gameState.currentSector)}
                                    rescuedFamilyIndices={gameState.rescuedFamilyIndices}
                                    bossPermanentlyDefeated={gameState.deadBossIndices.includes(gameState.currentSector)}
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
                                    environmentOverrides={gameState.environmentOverrides}
                                    settings={gameState.settings}
                                    isMobileDevice={isMobileDevice}
                                    weather={gameState.weather}
                                    sectorState={gameState.sectorState}
                                    onBossKilled={handleBossDefeatedAction}
                                    onFamilyRescued={handleFamilyRescuedAction}
                                    onPerkDiscovered={handlePerkDiscoveredAction}
                                />

                                {showHUD && (
                                    <GameHUD
                                        loadout={gameState.loadout}
                                        weaponLevels={gameState.weaponLevels}
                                        debugMode={gameState.debugMode}
                                        isBossIntro={activeOverlay === OverlayType.INTRO}
                                        isMobileDevice={isMobileDevice}
                                        onTogglePause={handleTogglePauseAction}
                                        onToggleMap={handleToggleMapAction}
                                        onSelectWeapon={handleSelectWeaponAction}
                                        onRotateCamera={handleRotateCameraAction}
                                        onOpenAdventureLog={handleOpenAdventureLogAction}
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
                            onMarkCollectiblesViewed={handleMarkCollectiblesViewedAction}
                            onToggleChallengeTracking={handleToggleChallengeTrackingAction}
                            isMobileDevice={isMobileDevice}
                            debugMode={gameState.debugMode}
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

                    {activeOverlay === OverlayType.STATION_STATISTICS && (
                        <ScreenStatistics
                            stats={gameState.screen === GameScreen.SECTOR ? (gameCanvasRef.current?.getMergedSessionStats() || gameState.stats) : gameState.stats}
                            onClose={handleCloseAction}
                            onOpenDiscovery={() => handleOpenAdventureLogAction(DiscoveryType.CLUE)}
                            isMobileDevice={isMobileDevice}
                            debugMode={gameState.debugMode}
                            initialTab={initialStatisticsTab as any}
                            initialItemId={initialStatisticsItem}
                        />
                    )}

                    {activeOverlay === OverlayType.STATION_ARMORY && (
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
                            <ScreenPlaygroundArmoryStation
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

                    {activeOverlay === OverlayType.STATION_SKILLS && (
                        gameState.screen === GameScreen.CAMP ? (
                            <ScreenSkills
                                stats={gameState.stats}
                                onSave={handleSaveStats}
                                onClose={handleOverlayClose}
                                isMobileDevice={isMobileDevice}
                            />
                        ) : (
                            <ScreenPlaygroundSkillStation
                                stats={gameState.stats}
                                isMobileDevice={isMobileDevice}
                                sectorState={gameState.sectorState || EMPTY_SECTOR_STATE}
                                onClose={handleCloseAction}
                                onSave={handleSaveSkillsPlaygroundAction}
                            />
                        )
                    )}

                    {activeOverlay === OverlayType.STATION_ENVIRONMENT && (
                        <ScreenPlaygroundEnvironmentStation
                            onClose={handleCloseAction}
                            isMobileDevice={isMobileDevice}
                            currentWeather={gameState.weather}
                            onWeatherChange={handleWeatherChangeAction}
                            currentOverride={gameState.environmentOverrides?.[gameState.currentSector]}
                            onOverrideChange={handleEnvironmentOverrideChangeAction}
                            transparent={true}
                        />
                    )}

                    {activeOverlay === OverlayType.STATION_SPAWNER && (
                        <ScreenPlaygroundEnemyStation
                            onClose={handleCloseAction}
                            isMobileDevice={isMobileDevice}
                            onSpawnEnemies={handleSpawnEnemiesAction}
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
                            isMobileDevice={isMobileDevice}
                        />
                    )}

                    {/* VINTERDÖD FIX: Unify Death Screen logic (Overlay or Screen State) */}
                    {(gameState.screen === GameScreen.DEATH || activeOverlay === OverlayType.DEATH) && (
                        <ScreenPlayerDied
                            onRespawn={handleRespawnSector}
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

                    {activeOverlay === OverlayType.STATION_SECTORS && (
                        <ScreenSectorOverview
                            currentSector={gameState.currentSector}
                            rescuedFamilyIndices={gameState.rescuedFamilyIndices}
                            deadBossIndices={gameState.deadBossIndices}
                            debugMode={gameState.debugMode}
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

                    {(showFPS || gameState.debugMode) && (
                        <DebugDisplay />
                    )}

                    <ScreenLoading
                        isDone={!showLoadingOverlay}
                        sectorIndex={gameState.screen === GameScreen.PROLOGUE ? 0 : (gameState.currentSector || 0)}
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
