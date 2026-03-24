import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameState, GameScreen, SectorStats } from './game/session/SessionTypes';
import { PlayerStats } from './entities/player/PlayerTypes';
import { SectorTrigger } from './systems/TriggerTypes';;
import { loadGameState, saveGameState, clearSave } from './utils/persistence';
import { aggregateStats } from './game/progression/ProgressionManager';
import GameSession, { GameSessionHandle } from './game/session/GameSession';
import Camp from './components/camp/Camp';
import GameHUD from './components/ui/hud/GameHUD';
import ScreenPause from './components/ui/screens/game/ScreenPause';
import ScreenMap from './components/ui/screens/game/ScreenMap';
import ScreenTeleport from './components/ui/screens/game/ScreenTeleport';
import ScreenSectorReport from './components/ui/screens/game/ScreenSectorReport';
import { CAMP_SCENE } from './components/camp/CampWorld';
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
import Prologue from './components/ui/screens/Prologue';
import ScreenLoading from './components/ui/screens/shared/ScreenLoading';
import DebugDisplay from './components/ui/core/DebugDisplay';
import CustomCursor from './components/ui/core/CustomCursor';
import { useGlobalInput } from './hooks/useGlobalInput';
import { soundManager } from './utils/SoundManager';
import { getCollectiblesBySector } from './content/collectibles';
import { checkIsMobileDevice } from './utils/device';
import { AssetPreloader } from './systems/AssetPreloader';
import { WinterEngine, GraphicsSettings } from './core/engine/WinterEngine';
import { SECTOR_THEMES } from './content/constants';
import { HudStore } from './store/HudStore';

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
    useRef(WinterEngine.getInstance(gameState.graphics));
    const [activeOverlay, setActiveOverlay] = useState<OverlayType | null>(null);
    const [teleportInitialCoords, setTeleportInitialCoords] = useState<{ x: number, z: number } | null>(null);
    const [teleportTarget, setTeleportTarget] = useState<{ x: number, z: number, timestamp: number } | null>(null);
    const [isLoadingSector, setIsLoadingSector] = useState(gameState.screen === GameScreen.SECTOR || gameState.screen === GameScreen.PROLOGUE);
    const [isLoadingCamp, setIsLoadingCamp] = useState(gameState.screen === GameScreen.CAMP);
    const [showLoadingOverlay, setShowLoadingOverlay] = useState(isLoadingSector || isLoadingCamp);
    const [loadingTargetIsCamp, setLoadingTargetIsCamp] = useState(gameState.screen === GameScreen.CAMP);
    const [isInitialBoot, setIsInitialBoot] = useState(true);
    const [isMobileDevice, setIsMobileDevice] = useState(checkIsMobileDevice());

    const [activeCollectible, setActiveCollectible] = useState<string | null>(null);
    const [deathDetails, setDeathDetails] = useState<{ killer: string } | null>(null);
    const [sectorStats, setSectorStats] = useState<SectorStats | null>(null);
    const [isPointerLocked, setIsPointerLocked] = useState(false);
    const showFPS = !!gameState.showFps;

    const gameCanvasRef = React.useRef<GameSessionHandle>(null);
    const transitionTaskRef = useRef(false);
    const sceneReadyRef = useRef(false);

    // --- ZERO-GC: LATEST STATE REF ---
    const latestStateRef = useRef({ gameState, isMobileDevice, activeOverlay });
    useEffect(() => {
        latestStateRef.current = { gameState, isMobileDevice, activeOverlay };
    });

    // --- PERSISTENCE & GLOBAL HOOKS ---
    useEffect(() => {
        saveGameState(gameState);
    }, [gameState]);

    useEffect(() => {
        // Zero-GC: Bind to window exactly once to prevent memory leaks
        (window as any).setGameScreen = (screen: GameScreen) => setGameState(prev => ({ ...prev, screen }));

        const checkMobile = () => setIsMobileDevice(checkIsMobileDevice());
        const handleLockChange = () => setIsPointerLocked(!!document.pointerLockElement);

        window.addEventListener('resize', checkMobile);
        document.addEventListener('pointerlockchange', handleLockChange);

        if (typeof screen !== 'undefined' && (screen as any).orientation && (screen.orientation as any).lock) {
            (screen.orientation as any).lock('landscape').catch((e: any) => {
                console.warn("[App] Orientation lock failed (expected on some devices):", e);
            });
        }

        return () => {
            window.removeEventListener('resize', checkMobile);
            document.removeEventListener('pointerlockchange', handleLockChange);
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
                setTimeout(() => setShowLoadingOverlay(false), 500);
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

        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        try {
            await task();
        } catch (e) {
            console.error("[App] triggerLoadingTransition task failed:", e);
        } finally {
            transitionTaskRef.current = false;
            const engine = WinterEngine.getInstance();
            engine.isRenderingPaused = false;
            engine.isSimulationPaused = false;
            tryDismissLoading();
        }
    }, [tryDismissLoading]);

    const isWarmedUpRef = useRef(false);
    useEffect(() => {
        if (isWarmedUpRef.current) return;
        isWarmedUpRef.current = true;

        const warmup = async () => {
            const engine = WinterEngine.getInstance();
            const isCamp = gameState.screen === GameScreen.CAMP;
            const envConfig = isCamp ? CAMP_SCENE : (gameState.currentSector !== undefined ? SECTOR_THEMES[gameState.currentSector] : SECTOR_THEMES[0]);
            const yieldToMain = () => new Promise<void>(resolve => setTimeout(resolve, 0));

            await triggerLoadingTransition(isCamp ? 'CAMP' : 'SECTOR', async () => {
                const sectorIndex = gameState.currentSector !== undefined ? gameState.currentSector : 0;
                try {
                    engine.updateSettings(gameState.graphics);
                    await AssetPreloader.warmupAsync('CORE', envConfig, yieldToMain);
                    if (isCamp) {
                        await AssetPreloader.warmupAsync('CAMP', envConfig, yieldToMain);
                    } else {
                        await AssetPreloader.warmupAsync('SECTOR', envConfig, yieldToMain, sectorIndex);
                    }
                } catch (e) {
                    console.error("[App] Warmup Error:", e);
                }

                setIsInitialBoot(false);
            });
        };

        if (isInitialBoot) warmup();
    }, []);

    // --- ZERO-GC STABLE CALLBACKS ---

    const handleDie = useCallback((stats: SectorStats, killer: string) => {
        setDeathDetails({ killer });
        setGameState(prev => {
            let newUniqueAchievements = 0;
            const bossKilled = stats.killsByType['Boss'] > 0;
            const newBosses = [...prev.deadBossIndices];

            if (bossKilled && !prev.deadBossIndices.includes(prev.currentSector)) {
                newBosses.push(prev.currentSector);
                newUniqueAchievements++;
            }

            const newFamily = [...prev.rescuedFamilyIndices];
            if ((stats.familyFound || bossKilled) && !prev.rescuedFamilyIndices.includes(prev.currentSector)) {
                newFamily.push(prev.currentSector);
                newUniqueAchievements++;
            }

            const newStats = aggregateStats(prev.stats, stats, true, false, newUniqueAchievements);
            return {
                ...prev,
                stats: newStats,
                deadBossIndices: newBosses,
                rescuedFamilyIndices: newFamily,
                screen: GameScreen.RECAP
            };
        });
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
            return { ...prev, stats: { ...prev.stats, cluesFound: [...prev.stats.cluesFound, clue.id as string] } };
        });
    }, []);

    const handlePOIdiscoveredAction = useCallback((poi: SectorTrigger) => {
        if (!poi.id) return;
        setGameState(prev => {
            if (prev.stats.discoveredPOIs.includes(poi.id as string)) return prev;
            return { ...prev, stats: { ...prev.stats, discoveredPOIs: [...prev.stats.discoveredPOIs, poi.id as string] } };
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
    const handleOpenAdventureLogAction = useCallback(() => {
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
        const stats = gameCanvasRef.current?.getSectorStats() || latestStateRef.current.gameState.stats;
        const finalHud = HudStore.getState();
        handleDie(stats as any, finalHud.killerName);
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
        setGameState(prev => ({ ...prev, screen: GameScreen.SECTOR, currentSector: 0, stats: { ...prev.stats, prologueSeen: true } }));
        soundManager.playUiConfirm();
    }, []);

    const handleCancelReset = useCallback(() => setActiveOverlay('SETTINGS'), []);


    const handleSectorEnded = useCallback((stats: SectorStats) => {
        setDeathDetails(null);

        setGameState(prev => {
            const prevSp = prev.stats.skillPoints;
            let newUniqueAchievements = 0;
            const bossKilled = stats.killsByType['Boss'] > 0;
            const newBosses = [...prev.deadBossIndices];

            if (bossKilled && !prev.deadBossIndices.includes(prev.currentSector)) {
                newBosses.push(prev.currentSector);
                newUniqueAchievements++;
            }

            const newFamily = [...prev.rescuedFamilyIndices];
            if ((stats.familyFound || bossKilled) && !prev.rescuedFamilyIndices.includes(prev.currentSector)) {
                newFamily.push(prev.currentSector);
                newUniqueAchievements++;
            }

            const newStats = aggregateStats(prev.stats, stats, false, !!stats.aborted, newUniqueAchievements);
            stats.spEarned = newStats.skillPoints - prevSp;

            const sectorCollectibles = getCollectiblesBySector(prev.currentSector + 1).map(c => c.id);
            stats.collectiblesDiscovered = newStats.collectiblesDiscovered.filter(id => sectorCollectibles.includes(id));

            setSectorStats(stats);

            return {
                ...prev,
                stats: newStats,
                deadBossIndices: newBosses,
                rescuedFamilyIndices: newFamily,
                screen: bossKilled ? GameScreen.BOSS_KILLED : GameScreen.RECAP,
                midRunCheckpoint: null
            };
        });
    }, []);

    const handleSaveStats = useCallback((newStats: PlayerStats) => {
        setGameState(prev => ({ ...prev, stats: newStats }));
    }, []);

    const handleSaveGraphics = useCallback((newG: GraphicsSettings) => {
        setGameState(prev => {
            const oldG = prev.graphics;
            const needsReWarm = newG.antialias !== oldG.antialias ||
                newG.shadows !== oldG.shadows ||
                newG.shadowMapType !== oldG.shadowMapType;

            WinterEngine.getInstance().updateSettings(newG);

            if (needsReWarm) {
                // IMPORTANT: Don't run reset()! It deletes all sounds and JS data.
                AssetPreloader.resetCompilationOnly();

                const engine = WinterEngine.getInstance();
                const yieldToMain = () => new Promise<void>(resolve => setTimeout(resolve, 0));
                const isCamp = prev.screen === GameScreen.CAMP;
                const sectorIndex = prev.currentSector !== undefined ? prev.currentSector : 0;
                const envConfig = isCamp ? CAMP_SCENE : SECTOR_THEMES[sectorIndex];

                // We never have to warm up CORE again, because the data is already in sharedPool.
                // We just send the scene compilation directly!
                triggerLoadingTransition(isCamp ? 'CAMP' : 'SECTOR', async () => {
                    if (isCamp) {
                        await AssetPreloader.warmupAsync('CAMP', envConfig, yieldToMain);
                    } else {
                        await AssetPreloader.warmupAsync('SECTOR', envConfig, yieldToMain, sectorIndex);
                    }
                });
            }
            return { ...prev, graphics: newG };
        });
    }, [triggerLoadingTransition]);

    const handleSaveLoadout = useCallback((loadout: any, levels: any) => {
        setGameState(prev => ({ ...prev, loadout, weaponLevels: levels }));
    }, []);

    const handleSelectSector = useCallback((sectorIndex: number) => {
        setGameState(prev => ({ ...prev, currentSector: sectorIndex }));
    }, []);

    const handleStartSector = useCallback(async () => {
        const { gameState: currentGameState } = latestStateRef.current;
        const sectorIndex = currentGameState.currentSector;
        const envConfig = SECTOR_THEMES[sectorIndex];
        const yieldToMain = () => new Promise<void>(resolve => setTimeout(resolve, 0));

        await triggerLoadingTransition('SECTOR', async () => {
            setGameState(prev => ({ ...prev, screen: GameScreen.SECTOR }));
            setTeleportTarget(null);
            setActiveCollectible(null);
            setActiveOverlay(null);
            await AssetPreloader.warmupAsync('SECTOR', envConfig, yieldToMain, sectorIndex);
        });
    }, [triggerLoadingTransition]);

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

    // Memoized Actions for Report Screen
    const handleReturnToCamp = useCallback(() => {
        soundManager.playUiConfirm();
        triggerLoadingTransition('CAMP', async () => {
            setGameState(prev => {
                const isCleared = prev.deadBossIndices.includes(prev.currentSector);
                const nextSector = (isCleared && prev.currentSector < 4) ? prev.currentSector + 1 : prev.currentSector;
                return { ...prev, screen: GameScreen.CAMP, currentSector: nextSector, weather: 'snow' };
            });
            const yieldToMain = () => new Promise<void>(resolve => setTimeout(resolve, 0));
            await AssetPreloader.warmupAsync('CAMP', CAMP_SCENE, yieldToMain);
        });
    }, [triggerLoadingTransition]);

    const handleRespawnSector = useCallback(() => {
        soundManager.playUiConfirm();

        // Respawn is instant. Since the sector has already been played, all 
        // shaders and models are already in memory. No AssetPreloader or loading screen is needed.
        setGameState(prev => ({ ...prev, screen: GameScreen.SECTOR }));
        setSectorStats(null);
        setDeathDetails(null);
        setActiveCollectible(null);
        setActiveOverlay(null);
    }, []);

    const globalInputActions = React.useMemo(() => ({
        setActiveOverlay,
        setTeleportInitialCoords,
        requestPointerLock: () => { if (!latestStateRef.current.isMobileDevice) gameCanvasRef.current?.requestPointerLock(); },
        onCollectibleClose: handleCollectibleClose
    }), [handleCollectibleClose]);

    useGlobalInput(activeOverlay, { screen: gameState.screen }, globalInputActions);

    const cursorHidden = isMobileDevice || isPointerLocked || (gameState.screen === GameScreen.SECTOR && !activeOverlay);

    return (
        <div className="relative w-full h-full overflow-hidden bg-black select-none cursor-none">
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
                    initialGraphics={gameState.graphics}
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

            {(gameState.screen === GameScreen.SECTOR || gameState.screen === GameScreen.PROLOGUE) && (
                <>
                    <GameSession
                        ref={gameCanvasRef}
                        isWarmup={isLoadingSector}
                        stats={gameState.stats}
                        loadout={gameState.loadout}
                        weaponLevels={gameState.weaponLevels}
                        currentSector={gameState.screen === GameScreen.PROLOGUE ? 0 : gameState.currentSector}
                        debugMode={gameState.debugMode}
                        isRunning={gameState.screen === GameScreen.SECTOR && !activeOverlay && !isLoadingSector}
                        isPaused={!!activeOverlay || isLoadingSector || gameState.screen === GameScreen.PROLOGUE}
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
                        isCollectibleOpen={activeOverlay === 'COLLECTIBLE'}
                        onCollectibleClose={handleCollectibleClose}
                        onDialogueStateChange={handleDialogueStateChangeAction}
                        onDeathStateChange={handleDeathStateChangeAction}
                        onBossIntroStateChange={handleBossIntroStateChangeAction}
                        onInteractionStateChange={onStationInteraction}
                        onUpdateLoadout={handleUpdateLoadoutAction}
                        onEnvironmentOverrideChange={handleEnvironmentOverrideChangeAction}
                        environmentOverrides={gameState.environmentOverrides}
                        initialGraphics={gameState.graphics}
                        isMobileDevice={isMobileDevice}
                        weather={gameState.weather}
                    />

                    {(!activeOverlay || activeOverlay === 'INTRO') && !isLoadingSector && !isLoadingCamp && !showLoadingOverlay && (
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
                    graphics={gameState.graphics}
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

            {activeOverlay === 'DEATH' && (
                <ScreenPlayerDied
                    onContinue={handleContinueFromDeath}
                    isMobileDevice={isMobileDevice}
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

            {gameState.screen === GameScreen.RECAP && sectorStats && (
                <ScreenSectorReport
                    stats={sectorStats}
                    deathDetails={deathDetails}
                    currentSector={gameState.currentSector}
                    onReturnCamp={handleReturnToCamp}
                    onRetry={handleRespawnSector}
                    isMobileDevice={isMobileDevice}
                />
            )}

            {gameState.screen === GameScreen.PROLOGUE && !isLoadingSector && (
                <Prologue onComplete={handlePrologueCompleteAction} isMobileDevice={isMobileDevice} />
            )}

            <CustomCursor hidden={cursorHidden} />

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
                sectorIndex={gameState.currentSector}
                isCamp={loadingTargetIsCamp}
                isInitialBoot={isInitialBoot}
                isMobileDevice={isMobileDevice}
            />
        </div>
    );
};

export default App;