import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameState, GameScreen, SectorStats } from './game/session/SessionTypes';
import { PlayerStats } from './entities/player/PlayerTypes';
import { SectorTrigger } from './systems/TriggerTypes';
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
import ScreenSettings from './components/ui/screens/camp/ScreenSettings';
import ScreenPlaygroundArmoryStation from './components/ui/screens/game/ScreenPlaygroundArmoryStation';
import { ScreenPlaygroundEnemyStation } from './components/ui/screens/game/ScreenPlaygroundEnemyStation';
import ScreenPlaygroundSkillStation from './components/ui/screens/game/ScreenPlaygroundSkillStation';
import { ScreenPlaygroundEnvironmentStation } from './components/ui/screens/game/ScreenPlaygroundEnvironmentStation';
import ScreenPlayerDied from './components/ui/screens/game/ScreenPlayerDied';
import ScreenArmory from './components/ui/screens/camp/ScreenArmory';
import ScreenPlayerSkills from './components/ui/screens/camp/ScreenPlayerSkills';
import ScreenSectorOverview from './components/ui/screens/camp/ScreenSectorOverview';
import ScreenResetConfirm from './components/ui/screens/camp/ScreenResetConfirm';
import DebugDisplay from './components/ui/core/DebugDisplay';
import CustomCursor from './components/ui/core/CustomCursor';
import { useGlobalInput } from './hooks/useGlobalInput';
import { soundManager } from './utils/audio/SoundManager';
import { getCollectiblesBySector } from './content/collectibles';
import { checkIsMobileDevice } from './utils/device';
import { AssetPreloader } from './systems/AssetPreloader';
import { WinterEngine, GameSettings } from './core/engine/WinterEngine';
import { HudStore } from './store/HudStore';
import { SectorSystem } from './systems/SectorSystem';

export type OverlayType =
    | 'PAUSE' | 'SETTINGS' | 'MAP' | 'TELEPORT' | 'COLLECTIBLE' | 'DIALOGUE'
    | 'ADVENTURE_LOG' | 'SECTOR_REPORT' | 'DEATH' | 'STATION_ARMORY'
    | 'STATION_SKILLS' | 'STATION_SPAWNER' | 'STATION_ENVIRONMENT'
    | 'STATION_SECTORS' | 'STATION_STATISTICS' | 'INTRO' | 'RESET_CONFIRM';

// ============================================================================
// ZERO-GC: Static Fallback Objects
// Prevents inline `{}` allocations that break React.memo during renders.
// ============================================================================
const EMPTY_SECTOR_STATE = {};
const EMPTY_OVERRIDES = {};

const App: React.FC = () => {
    const [gameState, setGameState] = useState<GameState>(loadGameState());

    // Efficient Engine Reference: Prevent instantiation evaluation on every render frame
    const engineRef = useRef<WinterEngine | null>(null);
    if (!engineRef.current) {
        engineRef.current = WinterEngine.getInstance(gameState.settings);
    }

    const [isMobileDevice, setIsMobileDevice] = useState(checkIsMobileDevice());
    const [isPointerLocked, setIsPointerLocked] = useState(false);

    const [hasInteracted, setHasInteracted] = useState(!isMobileDevice);

    const [isInitialBoot, setIsInitialBoot] = useState(true);
    const [isLoadingSector, setIsLoadingSector] = useState(false);
    const [isLoadingCamp, setIsLoadingCamp] = useState(false);
    const [loadingTargetIsCamp, setLoadingTargetIsCamp] = useState(false);
    const [showLoadingOverlay, setShowLoadingOverlay] = useState(true);

    const [activeOverlay, setActiveOverlay] = useState<OverlayType | null>(null);
    const [teleportInitialCoords, setTeleportInitialCoords] = useState<{ x: number, z: number } | null>(null);
    const [teleportTarget, setTeleportTarget] = useState<{ x: number, z: number, timestamp: number } | null>(null);
    const [activeCollectible, setActiveCollectible] = useState<string | null>(null);
    const [deathDetails, setDeathDetails] = useState<{ killer: string } | null>(null);
    const [sectorStats, setSectorStats] = useState<SectorStats | null>(null);
    const [initialAdventureLogTab, setInitialAdventureLogTab] = useState<any>(null);
    const [initialAdventureLogItem, setInitialAdventureLogItem] = useState<string | null>(null);
    const showFPS = !!gameState.showFps;

    const gameCanvasRef = React.useRef<GameSessionHandle>(null);
    const transitionTaskRef = useRef(false);
    const sceneReadyRef = useRef(false);

    // --- ZERO-GC: LATEST STATE REF ---
    const latestStateRef = useRef({ gameState, isMobileDevice, activeOverlay });
    useEffect(() => {
        latestStateRef.current = { gameState, isMobileDevice, activeOverlay };
    });

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
            setInitialAdventureLogTab(tab || null);
            setInitialAdventureLogItem(itemId || null);
            setActiveOverlay('ADVENTURE_LOG');
            soundManager.playUiConfirm();
        };

        window.addEventListener('resize', checkMobile);
        document.addEventListener('pointerlockchange', handleLockChange);
        window.addEventListener('open-adventure-log', handleOpenAdventureLogEvent);

        if (typeof screen !== 'undefined' && (screen as any).orientation && (screen.orientation as any).lock) {
            (screen.orientation as any).lock('landscape').catch((e: any) => {
                //console.warn("[App] Orientation lock failed (expected on some devices):", e);
            });
        }

        return () => {
            window.removeEventListener('resize', checkMobile);
            document.removeEventListener('pointerlockchange', handleLockChange);
            window.removeEventListener('open-adventure-log', handleOpenAdventureLogEvent);
        };
    }, []);

    // Ensure pointer lock is released when an overlay opens
    useEffect(() => {
        if (activeOverlay && document.pointerLockElement) {
            document.exitPointerLock();
        }
    }, [activeOverlay]);

    // --- LOADING & WARMUP LOGIC ---
    const tryDismissLoading = useCallback(() => {
        if (!transitionTaskRef.current && sceneReadyRef.current) {
            setIsLoadingCamp(false);
            setIsLoadingSector(false);
            requestAnimationFrame(() => {
                setTimeout(() => {
                    setShowLoadingOverlay(false);
                    // Sync HUD visibility with loading screen fade-out
                    const current = HudStore.getState();
                    if (latestStateRef.current.gameState.screen !== GameScreen.PROLOGUE) {
                        HudStore.update({ ...current, hudVisible: true });
                    }
                }, 500);
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
            screen: GameScreen.DEATH // VINTERDÖD FIX: Go to Death Screen first, not Recap
        }));
    }, []);

    const handleOpenMap = useCallback(() => {
        setActiveOverlay('MAP');
        soundManager.playUiConfirm();
    }, []);

    const handleCheckpointReached = useCallback(() => { }, []);

    const handleCollectibleDiscoveredAction = useCallback((id: string) => {
        setActiveCollectible(id);
        setActiveOverlay('COLLECTIBLE');
        setGameState(prev => {
            if (prev.stats.collectiblesDiscovered.includes(id)) return prev;
            return {
                ...prev,
                stats: {
                    ...prev.stats,
                    collectiblesDiscovered: [...prev.stats.collectiblesDiscovered, id],
                    skillPoints: prev.stats.skillPoints + 1,
                    totalSkillPointsEarned: prev.stats.totalSkillPointsEarned + 1
                }
            };
        });
    }, []);

    const handleClueDiscoveredAction = useCallback((clue: SectorTrigger) => {
        if (!clue.id) return;
        setGameState(prev => {
            if (prev.stats.cluesFound.includes(clue.id as string)) return prev;
            return {
                ...prev,
                stats: {
                    ...prev.stats,
                    cluesFound: [...prev.stats.cluesFound, clue.id as string]
                }
            };
        });
    }, []);

    const handlePOIdiscoveredAction = useCallback((poi: SectorTrigger) => {
        if (!poi.id) return;
        setGameState(prev => {
            if (prev.stats.discoveredPOIs.includes(poi.id as string)) return prev;
            return {
                ...prev,
                stats: {
                    ...prev.stats,
                    discoveredPOIs: [...prev.stats.discoveredPOIs, poi.id as string]
                }
            };
        });
    }, []);

    const handleEnemyDiscoveredAction = useCallback((type: string) => {
        if (!type) return;
        setGameState(prev => {
            if (prev.stats.seenEnemies.includes(type)) return prev;
            return { ...prev, stats: { ...prev.stats, seenEnemies: [...prev.stats.seenEnemies, type] } };
        });
    }, []);

    const handleBossDiscoveredAction = useCallback((id: string) => {
        if (!id) return;
        setGameState(prev => {
            if (prev.stats.seenBosses.includes(id)) return prev;
            return { ...prev, stats: { ...prev.stats, seenBosses: [...prev.stats.seenBosses, id] } };
        });
    }, []);

    const handleDialogueStateChangeAction = useCallback((val: boolean) => setActiveOverlay(val ? 'DIALOGUE' : null), []);
    const handleDeathStateChangeAction = useCallback((val: boolean) => setActiveOverlay(val ? 'DEATH' : null), []);
    const handleBossIntroStateChangeAction = useCallback((val: boolean) => setActiveOverlay(val ? 'INTRO' : null), []);

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
        setActiveOverlay('PAUSE');
        soundManager.playUiClick();
    }, []);

    const handleToggleMapAction = useCallback(() => {
        setActiveOverlay('MAP');
        soundManager.playUiConfirm();
    }, []);

    const handleSelectWeaponAction = useCallback((slot: string) => {
        gameCanvasRef.current?.triggerInput(slot);
    }, []);

    const handleRotateCameraAction = useCallback((dir: number) => {
        gameCanvasRef.current?.rotateCamera(dir);
    }, []);

    const handleResumeAction = useCallback(() => {
        const { gameState: currentGameState, isMobileDevice: isMobile } = latestStateRef.current;
        if (currentGameState.screen === GameScreen.SECTOR && !isMobile) {
            gameCanvasRef.current?.requestPointerLock();
        }
        setActiveOverlay(null);
    }, []);

    const handleOpenSettingsAction = useCallback(() => setActiveOverlay('SETTINGS'), []);
    const handleOpenAdventureLogAction = useCallback((tab?: string, itemId?: string) => {
        if (tab) setInitialAdventureLogTab(tab);
        if (itemId) setInitialAdventureLogItem(itemId);
        setActiveOverlay('ADVENTURE_LOG');
        soundManager.playUiConfirm();
    }, []);

    const handleCloseAction = useCallback(() => {
        const { gameState: currentGameState, isMobileDevice: isMobile } = latestStateRef.current;
        if (currentGameState.screen === GameScreen.SECTOR && !isMobile) {
            gameCanvasRef.current?.requestPointerLock();
        }
        setActiveOverlay(null);
    }, []);

    const handleMarkCollectiblesViewedAction = useCallback((ids: string[]) => {
        setGameState(prev => {
            const currentViewed = prev.stats.viewedCollectibles || [];
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
        // VINTERDÖD FIX: Extract stats BEFORE unmounting or navigating away
        const stats = gameCanvasRef.current?.getSectorStats(false, true) || latestStateRef.current.gameState.stats;
        const finalHud = HudStore.getState();

        // 1. Process technical death (updates permanent stats)
        handleDie(stats as any, finalHud.killerName);

        soundManager.playUiConfirm();
        setGameState(prev => ({ ...prev, screen: GameScreen.RECAP }));
        setActiveOverlay(null);
    }, [handleDie]);

    const handleSaveArmoryAction = useCallback((s: any, l: any, wl: any) => {
        setGameState(prev => ({ ...prev, stats: s, loadout: l, weaponLevels: wl }));
        setActiveOverlay(null);
    }, []);

    const handleSaveArmoryPlaygroundAction = useCallback((newStats: any, newLoadout: any, newLevels: any, newSectorState: any) => {
        setGameState(prev => ({ ...prev, stats: newStats, loadout: newLoadout, weaponLevels: newLevels, sectorState: newSectorState }));
        setActiveOverlay(null);
    }, []);

    const handleSaveSkillsPlaygroundAction = useCallback((newStats: any, newSectorState: any) => {
        setGameState(prev => ({ ...prev, stats: newStats, sectorState: newSectorState }));
        setActiveOverlay(null);
    }, []);

    const handleWeatherChangeAction = useCallback((w: any) => setGameState(prev => ({ ...prev, weather: w })), []);

    const handleSpawnEnemiesAction = useCallback((enemies: any) => {
        gameCanvasRef.current?.spawnEnemies(enemies);
    }, []);

    const handleMapSelectCoordsAction = useCallback((x: number, z: number) => {
        setTeleportInitialCoords({ x, z });
        setActiveOverlay('TELEPORT');
    }, []);

    const handleJumpAction = useCallback((x: number, z: number) => {
        gameCanvasRef.current?.requestPointerLock();
        setTeleportTarget({ x, z, timestamp: Date.now() });
        setActiveOverlay(null);
    }, []);

    const handleTeleportCancelAction = useCallback(() => {
        setActiveOverlay('MAP');
        setTeleportInitialCoords(null);
    }, []);

    const handleBossKilledProceed = useCallback(() => {
        soundManager.playUiConfirm();
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
        soundManager.playUiConfirm();
    }, []);

    const handleCancelReset = useCallback(() => setActiveOverlay('SETTINGS'), []);


    const handleSectorEnded = useCallback((stats: SectorStats) => {
        setDeathDetails(null);
        setSectorStats(stats); // DONT aggregate yet!

        setGameState(prev => {
            const bossKilled = stats.killsByType['Boss'] > 0;
            return {
                ...prev,
                screen: bossKilled ? GameScreen.BOSS_KILLED : GameScreen.RECAP,
                midRunCheckpoint: null
            };
        });
    }, []);

    const handleSaveStats = useCallback((newStats: PlayerStats) => {
        setGameState(prev => ({ ...prev, stats: newStats }));
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

    const aggregatePendingStats = useCallback(() => {
        if (!sectorStats) return;
        setGameState(prev => {
            let newUniqueAchievements = 0;
            const bossKilled = sectorStats.killsByType['Boss'] > 0;
            const newBosses = [...prev.deadBossIndices];

            if (bossKilled && !prev.deadBossIndices.includes(prev.currentSector)) {
                newBosses.push(prev.currentSector);
                newUniqueAchievements++;
            }

            const newFamily = [...prev.rescuedFamilyIndices];
            if ((sectorStats.familyFound || bossKilled) && !prev.rescuedFamilyIndices.includes(prev.currentSector)) {
                newFamily.push(prev.currentSector);
                newUniqueAchievements++;
            }

            const newStats = aggregateStats(prev.stats, sectorStats, !!deathDetails, !!sectorStats.aborted, newUniqueAchievements);

            return {
                ...prev,
                stats: newStats,
                deadBossIndices: newBosses,
                rescuedFamilyIndices: newFamily
            };
        });
        setSectorStats(null);
    }, [sectorStats, deathDetails]);

    const handleReturnToCamp = useCallback(() => {
        soundManager.playUiConfirm();
        aggregatePendingStats();

        triggerLoadingTransition('CAMP', async () => {
            AssetPreloader.releaseSectorAssets(latestStateRef.current.gameState.currentSector);

            const yieldToMain = () => new Promise<void>(resolve => {
                requestAnimationFrame(() => setTimeout(resolve, 0));
            });

            await AssetPreloader.warmupAsync('CAMP', yieldToMain);

            setGameState(prev => {
                const isCleared = prev.deadBossIndices.includes(prev.currentSector);
                const nextSector = (isCleared && prev.currentSector < 4) ? prev.currentSector + 1 : prev.currentSector;
                const isFinished = isCleared && prev.currentSector === 4;

                const finalStats = isFinished ? { ...prev.stats, gameIsFinished: true } : prev.stats;
                return { ...prev, stats: finalStats, screen: GameScreen.CAMP, currentSector: nextSector, weather: 'snow' };
            });
        });
    }, [triggerLoadingTransition, aggregatePendingStats]);

    const handleNextSector = useCallback(() => {
        soundManager.playUiConfirm();
        aggregatePendingStats();

        triggerLoadingTransition('SECTOR', async () => {
            const nextSector = latestStateRef.current.gameState.currentSector + 1;

            // If it's the last sector (#4 = id 3), theoretically the handleNextSector button won't exist.
            // But if it slips through, fallback to camp.
            if (nextSector > 3) {
                AssetPreloader.releaseSectorAssets(latestStateRef.current.gameState.currentSector);
                setGameState(prev => ({ ...prev, screen: GameScreen.CAMP, currentSector: 3, weather: 'snow' }));
                return;
            }

            AssetPreloader.releaseSectorAssets(latestStateRef.current.gameState.currentSector);

            const yieldToMain = () => new Promise<void>(resolve => {
                requestAnimationFrame(() => setTimeout(resolve, 0));
            });
            await AssetPreloader.warmupAsync('SECTOR', yieldToMain, nextSector);

            setTeleportTarget(null);
            setActiveCollectible(null);
            setActiveOverlay(null);

            setGameState(prev => ({ ...prev, screen: GameScreen.SECTOR, currentSector: nextSector, sessionToken: (prev.sessionToken || 0) + 1 }));
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
            setActiveOverlay(null);

            setGameState(prev => ({ ...prev, screen: GameScreen.SECTOR, sessionToken: (prev.sessionToken || 0) + 1 }));
            HudStore.update({ ...HudStore.getState(), hudVisible: false });
        });
    }, [triggerLoadingTransition]);

    const handleRespawnSector = useCallback(() => {
        soundManager.playUiConfirm();

        // VINTERDÖD FIX: Keep gameCanvasRef alive and trigger resurrection
        if (gameCanvasRef.current) {
            gameCanvasRef.current.respawnPlayer();
        } else {
            console.error("[App] VARNING: gameCanvasRef är null! GameSession har unmountats!");
        }

        // VINTERDÖD FIX: Clear UI state instantly for "blixtsnabb" feedback
        setActiveOverlay(null);
        setGameState(prev => ({ ...prev, screen: GameScreen.SECTOR }));
        setSectorStats(null);
        setDeathDetails(null);
        setActiveCollectible(null);

        HudStore.update({ ...HudStore.getState(), hudVisible: true, isDead: false });
    }, []);

    const handleRestartSector = useCallback(() => {
        soundManager.playUiConfirm();

        gameCanvasRef.current?.restartSector();

        setActiveOverlay(null);
        setGameState(prev => ({ ...prev, screen: GameScreen.SECTOR }));
        setSectorStats(null);
        setDeathDetails(null);
        setActiveCollectible(null);

        HudStore.update({ ...HudStore.getState(), hudVisible: true, isDead: false });
    }, []);

    const handleAbortSector = useCallback(() => {
        if (!gameCanvasRef.current) return;
        setActiveOverlay(null);
        const stats = gameCanvasRef.current.getSectorStats(false, true);
        handleSectorEnded(stats);
        soundManager.playUiClick();
    }, [handleSectorEnded]);

    const handleResetGame = useCallback(() => {
        clearSave();
        window.location.reload();
    }, []);


    const handleCollectibleClose = useCallback(() => {
        const { isMobileDevice: isMobile } = latestStateRef.current;
        if (gameCanvasRef.current && !isMobile) gameCanvasRef.current.requestPointerLock();
        setActiveOverlay(null);
        setActiveCollectible(null);
    }, []);

    const handleSceneReady = useCallback(() => {
        sceneReadyRef.current = true;

        const engine = WinterEngine.getInstance();
        engine.isRenderingPaused = false;
        engine.isSimulationPaused = false;

        tryDismissLoading();
    }, [tryDismissLoading]);

    const onStationInteraction = useCallback((type: OverlayType | null) => setActiveOverlay(type), []);
    const handleToggleDebug = useCallback((val: boolean) => {
        setGameState(prev => ({ ...prev, debugMode: val }));
    }, []);
    const handlePauseToggle = useCallback((val: boolean) => setActiveOverlay(val ? 'PAUSE' : null), []);
    const handleToggleShowFps = useCallback(() => {
        setGameState(prev => ({ ...prev, showFps: !prev.showFps }));
        soundManager.playUiClick();
    }, []);
    const handleOverlayClose = useCallback(() => setActiveOverlay(null), []);

    const globalInputActions = React.useMemo(() => ({
        setActiveOverlay,
        setTeleportInitialCoords,
        requestPointerLock: () => { if (!latestStateRef.current.isMobileDevice) gameCanvasRef.current?.requestPointerLock(); },
        onCollectibleClose: handleCollectibleClose
    }), [handleCollectibleClose]);

    useGlobalInput(activeOverlay, { screen: gameState.screen }, globalInputActions);

    const cursorHidden = isMobileDevice || isPointerLocked || (hasInteracted && gameState.screen === GameScreen.SECTOR && !activeOverlay);
    const showHUD = hasInteracted && (!activeOverlay || activeOverlay === 'INTRO') && !isLoadingSector && !isLoadingCamp && !showLoadingOverlay && gameState.screen !== GameScreen.PROLOGUE;

    // VINTERDÖD FIX: Boolean to check if we should mount/keep GameSession alive
    const shouldKeepSessionAlive =
        (gameState.screen === GameScreen.SECTOR ||
            gameState.screen === GameScreen.PROLOGUE ||
            gameState.screen === GameScreen.RECAP ||
            gameState.screen === GameScreen.DEATH) // VINTERDÖD FIX: Keep canvas alive during death!
        && !transitionTaskRef.current;

    return (
        <div className="relative w-full h-full overflow-hidden bg-black select-none cursor-none">
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
                            isRunning={!isInitialBoot}
                            activeOverlay={activeOverlay}
                            setActiveOverlay={setActiveOverlay}
                            onPauseToggle={handlePauseToggle}
                            onInteractionStateChange={onStationInteraction}
                        />
                    )}

                    {/* VINTERDÖD FIX: GameSession is wrapped in a hidden div if it's not the active screen but needs to live */}
                    <div
                        className="absolute inset-0"
                        style={{ display: gameState.screen === GameScreen.SECTOR || gameState.screen === GameScreen.PROLOGUE || gameState.screen === GameScreen.DEATH ? 'block' : 'none' }}
                    >
                        {shouldKeepSessionAlive && (
                            <>
                                <GameSession
                                    key={`gs-${gameState.currentSector}`}
                                    ref={gameCanvasRef}
                                    isWarmup={isLoadingSector}
                                    stats={gameState.stats}
                                    loadout={gameState.loadout}
                                    weaponLevels={gameState.weaponLevels}
                                    currentSector={gameState.screen === GameScreen.PROLOGUE ? 0 : gameState.currentSector}
                                    currentSectorData={SectorSystem.getSector(gameState.screen === GameScreen.PROLOGUE ? 0 : gameState.currentSector)}
                                    debugMode={gameState.debugMode}
                                    isRunning={gameState.screen === GameScreen.SECTOR && !activeOverlay && !isLoadingSector}
                                    isPaused={!!activeOverlay || isLoadingSector || gameState.screen === GameScreen.PROLOGUE || gameState.screen === GameScreen.RECAP || gameState.screen === GameScreen.DEATH}
                                    disableInput={activeOverlay === 'COLLECTIBLE' || isLoadingSector || activeOverlay === 'ADVENTURE_LOG'}
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
                                    isCollectibleOpen={activeOverlay === 'COLLECTIBLE'}
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
                                />

                                {showHUD && (
                                    <GameHUD
                                        loadout={gameState.loadout}
                                        weaponLevels={gameState.weaponLevels}
                                        debugMode={gameState.debugMode}
                                        isBossIntro={activeOverlay === 'INTRO'}
                                        isMobileDevice={isMobileDevice}
                                        onTogglePause={handleTogglePauseAction}
                                        onToggleMap={handleToggleMapAction}
                                        onSelectWeapon={handleSelectWeaponAction}
                                        onRotateCamera={handleRotateCameraAction}
                                    />
                                )}
                            </>
                        )}
                    </div>

                    {/* UNIVERSAL OVERLAYS */}
                    {activeOverlay === 'PAUSE' && (
                        <ScreenPause
                            onResume={handleResumeAction}
                            onAbort={handleAbortSector}
                            onOpenMap={handleToggleMapAction}
                            onOpenSettings={handleOpenSettingsAction}
                            onOpenAdventureLog={handleOpenAdventureLogAction}
                            isMobileDevice={isMobileDevice}
                        />
                    )}

                    {activeOverlay === 'SETTINGS' && (
                        <ScreenSettings
                            onClose={handleCloseAction}
                            settings={gameState.settings}
                            onUpdateGraphics={handleSaveGraphics}
                            showFps={showFPS}
                            onToggleShowFps={handleToggleShowFps}
                            isMobileDevice={isMobileDevice}
                        />
                    )}

                    {activeOverlay === 'ADVENTURE_LOG' && (
                        <ScreenAdventureLog
                            stats={gameState.screen === GameScreen.SECTOR ? (gameCanvasRef.current?.getMergedSessionStats() || gameState.stats) : gameState.stats}
                            onClose={handleCloseAction}
                            onMarkCollectiblesViewed={handleMarkCollectiblesViewedAction}
                            isMobileDevice={isMobileDevice}
                            debugMode={gameState.debugMode}
                            initialTab={initialAdventureLogTab}
                            initialItemId={initialAdventureLogItem}
                        />
                    )}

                    {activeOverlay === 'COLLECTIBLE' && activeCollectible && (
                        <ScreenCollectibleDiscovered
                            collectibleId={activeCollectible}
                            onClose={handleCollectibleClose}
                            isMobileDevice={isMobileDevice}
                        />
                    )}

                    {activeOverlay === 'STATION_STATISTICS' && (
                        <ScreenAdventureLog
                            stats={gameState.stats}
                            onClose={handleOverlayClose}
                            isMobileDevice={isMobileDevice}
                            debugMode={gameState.debugMode}
                        />
                    )}

                    {activeOverlay === 'STATION_ARMORY' && (
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

                    {activeOverlay === 'STATION_SKILLS' && (
                        gameState.screen === GameScreen.CAMP ? (
                            <ScreenPlayerSkills
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

                    {activeOverlay === 'STATION_ENVIRONMENT' && (
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

                    {activeOverlay === 'STATION_SPAWNER' && (
                        <ScreenPlaygroundEnemyStation
                            onClose={handleCloseAction}
                            isMobileDevice={isMobileDevice}
                            onSpawnEnemies={handleSpawnEnemiesAction}
                        />
                    )}

                    {activeOverlay === 'MAP' && (
                        <ScreenMap
                            onClose={handleCloseAction}
                            onSelectCoords={handleMapSelectCoordsAction}
                            isMobileDevice={isMobileDevice}
                        />
                    )}

                    {activeOverlay === 'TELEPORT' && (
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
                    {(gameState.screen === GameScreen.DEATH || activeOverlay === 'DEATH') && (
                        <ScreenPlayerDied
                            onRespawn={handleRespawnSector}
                            onContinue={handleContinueFromDeath}
                            isMobileDevice={isMobileDevice}
                        />
                    )}

                    {gameState.screen === GameScreen.RECAP && sectorStats && (
                        <ScreenSectorReport
                            stats={sectorStats}
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

                    {activeOverlay === 'STATION_SECTORS' && (
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

                    {activeOverlay === 'RESET_CONFIRM' && (
                        <ScreenResetConfirm
                            onConfirm={handleResetGame}
                            onCancel={handleCancelReset}
                        />
                    )}

                    {(showFPS || gameState.debugMode) && (
                        <DebugDisplay
                            debugMode={gameState.debugMode}
                        />
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