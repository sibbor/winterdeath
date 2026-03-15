import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameState, GameScreen, PlayerStats, SectorStats, SectorTrigger, MapItem } from './types';
import { loadGameState, saveGameState, clearSave } from './utils/persistence';
import { aggregateStats } from './core/ProgressionManager';
import GameSession, { GameSessionHandle } from './components/GameSession';
import Camp from './components/camp/Camp';
import GameHUD from './components/ui/hud/GameHUD';
import MobileGameHUD from './components/ui/hud/MobileGameHUD';
import ScreenPause from './components/game/ScreenPause';
import ScreenMap from './components/game/ScreenMap';
import ScreenTeleport from './components/game/ScreenTeleport';
import ScreenSectorReport from './components/game/ScreenSectorReport';
import { CAMP_SCENE } from './components/camp/CampWorld';
import ScreenBossKilled from './components/game/ScreenBossKilled';
import ScreenCollectibleDiscovered from './components/game/ScreenCollectibleDiscovered';
import ScreenAdventureLog from './components/camp/ScreenAdventureLog';
import ScreenSettings from './components/camp/ScreenSettings';
import ScreenPlaygroundArmoryStation from './components/game/ScreenPlaygroundArmoryStation';
import { ScreenPlaygroundEnemyStation } from './components/game/ScreenPlaygroundEnemyStation';
import ScreenPlaygroundSkillStation from './components/game/ScreenPlaygroundSkillStation';
import { ScreenPlaygroundEnvironmentStation } from './components/game/ScreenPlaygroundEnvironmentStation';
import ScreenPlayerDied from './components/game/ScreenPlayerDied';
import ScreenArmory from './components/camp/ScreenArmory';
import ScreenPlayerSkills from './components/camp/ScreenPlayerSkills';
import ScreenSectorOverview from './components/camp/ScreenSectorOverview';
import ScreenResetConfirm from './components/camp/ScreenResetConfirm';
import Prologue from './components/game/Prologue';
import ScreenLoading from './components/game/ScreenLoading';
import DebugDisplay from './components/ui/core/DebugDisplay';
import CustomCursor from './components/ui/core/CustomCursor';
import { useGlobalInput } from './hooks/useGlobalInput';
import { soundManager } from './utils/SoundManager';
import { getCollectibleById, getCollectiblesBySector } from './content/collectibles';
import { isMobile } from './utils/device';
import { AssetPreloader } from './core/systems/AssetPreloader';
import { WinterEngine, GraphicsSettings } from './core/engine/WinterEngine';
import { FXSystem } from './core/systems/FXSystem';
import { DEFAULT_GRAPHICS, SECTOR_THEMES } from './content/constants';

const getCursorHidden = (isMobileDevice: boolean, isOverlayActive: boolean, screen: GameScreen, hudIsDead: boolean) =>
    isMobileDevice || (screen === GameScreen.SECTOR && !isOverlayActive && !hudIsDead);

export type OverlayType =
    | 'PAUSE' | 'SETTINGS' | 'MAP' | 'TELEPORT' | 'COLLECTIBLE' | 'DIALOGUE'
    | 'ADVENTURE_LOG' | 'SECTOR_REPORT' | 'DEATH' | 'STATION_ARMORY'
    | 'STATION_SKILLS' | 'STATION_SPAWNER' | 'STATION_ENVIRONMENT'
    | 'STATION_SECTORS' | 'STATION_STATISTICS' | 'INTRO' | 'RESET_CONFIRM';

const App: React.FC = () => {
    const [gameState, setGameState] = useState<GameState>(loadGameState());
    const [activeOverlay, setActiveOverlay] = useState<OverlayType | null>(null);
    const [teleportInitialCoords, setTeleportInitialCoords] = useState<{ x: number, z: number } | null>(null);
    const [teleportTarget, setTeleportTarget] = useState<{ x: number, z: number, timestamp: number } | null>(null);
    const [isLoadingSector, setIsLoadingSector] = useState(gameState.screen === GameScreen.SECTOR || gameState.screen === GameScreen.PROLOGUE);
    const [isLoadingCamp, setIsLoadingCamp] = useState(gameState.screen === GameScreen.CAMP);
    const [showLoadingOverlay, setShowLoadingOverlay] = useState(isLoadingSector || isLoadingCamp);
    const [isInitialBoot, setIsInitialBoot] = useState(true);
    const [isMobileDevice, setIsMobileDevice] = useState(isMobile());

    // Sync references for the loading screen rendezvous
    const transitionTaskRef = useRef(false);
    const sceneReadyRef = useRef(false);

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
        task: () => Promise<void> | void,
        skipCleanup: boolean = false
    ) => {
        console.log(`[App] triggerLoadingTransition (type: ${type}, skipCleanup: ${skipCleanup})`);

        transitionTaskRef.current = true;
        sceneReadyRef.current = false;

        // 1. Instant UI Feedback
        if (type === 'CAMP') setIsLoadingCamp(true);
        else setIsLoadingSector(true);
        setShowLoadingOverlay(true);

        // 2. Double-Buffer Wait: Let the browser paint the loading screen before we block the thread
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        // 3. Global Resource Cleanup
        const engine = WinterEngine.getInstance();
        if (engine.scene && !skipCleanup) engine.clearActiveScene(false);
        if (!skipCleanup) FXSystem.reset();

        // 4. Run Task (Includes State Update + Warmup)
        try {
            await task();
        } catch (e) {
            console.error("[App] triggerLoadingTransition task failed:", e);
        } finally {
            transitionTaskRef.current = false;

            // [VINTERDÖD] Safety: Reset engine pause flags after ANY transition
            const engine = WinterEngine.getInstance();
            engine.isRenderingPaused = false;
            engine.isSimulationPaused = false;

            tryDismissLoading();
        }

    }, [tryDismissLoading]);

    // Boot Warmup: Pre-compiles shaders to prevent startup stalls
    const isWarmedUpRef = useRef(false);
    useEffect(() => {
        let isMounted = true;
        if (isWarmedUpRef.current) return;
        isWarmedUpRef.current = true;

        const warmup = async () => {
            console.log("[App] Boot Warmup Started...");
            const engine = WinterEngine.getInstance();
            const isCamp = gameState.screen === GameScreen.CAMP;
            const envConfig = isCamp ? CAMP_SCENE : (gameState.currentSector !== undefined ? SECTOR_THEMES[gameState.currentSector] : SECTOR_THEMES[0]);
            const yieldToMain = () => new Promise<void>(resolve => setTimeout(resolve, 0));

            // Use the centralized transition to show the screen first
            await triggerLoadingTransition(isCamp ? 'CAMP' : 'SECTOR', async () => {
                // Determine module to warmup
                const sectorIndex = gameState.currentSector !== undefined ? gameState.currentSector : 0;

                try {
                    // 0. Synchronize renderer with saved settings before warmup
                    engine.updateSettings(gameState.graphics);

                    // 1. Core sets the baseline
                    await AssetPreloader.warmupAsync(engine.renderer, 'CORE', envConfig, yieldToMain, engine.camera.threeCamera);

                    // 2. Module specific
                    if (isCamp) {
                        await AssetPreloader.warmupAsync(engine.renderer, 'CAMP', envConfig, yieldToMain, engine.camera.threeCamera);
                    } else {
                        await AssetPreloader.warmupAsync(engine.renderer, sectorIndex, envConfig, yieldToMain, engine.camera.threeCamera);
                    }
                } catch (e) {
                    console.error("[App] Warmup Error:", e);
                }

                // CRITICAL: We MUST set isInitialBoot to false even if the component re-rendered.
                setIsInitialBoot(false);
                console.log("[App] Boot Warmup Complete. isInitialBoot -> false");
            }, true);
        };

        if (isInitialBoot) {
            warmup();
        }

        return () => { };
    }, []);

    const [hudState, setHudState] = useState<any>({});
    const [isPointerLocked, setIsPointerLocked] = useState(false);

    useEffect(() => {
        // [VINTERDÖD] Try to lock orientation to landscape on mobile
        if (typeof screen !== 'undefined' && (screen as any).orientation && (screen.orientation as any).lock) {
            (screen.orientation as any).lock('landscape').catch((e: any) => {
                console.warn("[App] Orientation lock failed (expected on some devices):", e);
            });
        }
    }, []);

    useEffect(() => {
        const checkMobile = () => setIsMobileDevice(isMobile());
        const handleLockChange = () => setIsPointerLocked(!!document.pointerLockElement);

        window.addEventListener('resize', checkMobile);
        document.addEventListener('pointerlockchange', handleLockChange);

        return () => {
            window.removeEventListener('resize', checkMobile);
            document.removeEventListener('pointerlockchange', handleLockChange);
        };
    }, []);
    const [activeCollectible, setActiveCollectible] = useState<string | null>(null);
    const [currentMapItems, setCurrentSectorMapItems] = useState<MapItem[]>([]);
    const [fps, setFps] = useState(0);
    const [debugSystems, setDebugSystems] = useState<{ id: string; enabled: boolean }[]>([]);

    // Sector Results
    const [deathDetails, setDeathDetails] = useState<{ killer: string } | null>(null);
    const [sectorStats, setSectorStats] = useState<SectorStats | null>(null);

    // Interaction Locks
    const [isSaving, setIsSaving] = useState(false);
    const gameCanvasRef = React.useRef<GameSessionHandle>(null);

    useEffect(() => {
        // Auto-save on meaningful state changes (screens)
        saveGameState(gameState);
        (window as any).setGameScreen = (screen: GameScreen) => setGameState(prev => ({ ...prev, screen }));
    }, [gameState]);


    const handleUpdateHUD = useCallback((data: any) => {
        setHudState(data);
        if (data.fps !== undefined) setFps(data.fps);
        if (data.mapItems) setCurrentSectorMapItems(data.mapItems);
        // Refresh system list for debug panel at same cadence as HUD (10Hz)
        if (gameState.debugMode) {
            const systems = gameCanvasRef.current?.getSystems();
            if (systems) setDebugSystems(systems);
        }
    }, [gameState.debugMode]);

    const handleFPSUpdate = useCallback((val: number) => {
        setFps(val);
    }, []);

    const handleDie = useCallback((stats: SectorStats, killer: string) => {
        setDeathDetails({ killer });
        setSectorStats(stats);

        // 1. Determine new unique achievements from this run (even on death)
        let newUniqueAchievements = 0;
        const bossKilled = stats.killsByType['Boss'] > 0;
        const newBosses = [...gameState.deadBossIndices];
        if (bossKilled && !gameState.deadBossIndices.includes(gameState.currentSector)) {
            newBosses.push(gameState.currentSector);
            newUniqueAchievements++;
        }

        const newFamily = [...gameState.rescuedFamilyIndices];
        // Note: On death, if they were found earlier in the same run, we still award it
        // Or if the boss was killed, we automatically rescue the family member
        if ((stats.familyFound || bossKilled) && !gameState.rescuedFamilyIndices.includes(gameState.currentSector)) {
            newFamily.push(gameState.currentSector);
            newUniqueAchievements++;
        }

        const newStats = aggregateStats(gameState.stats, stats, true, false, newUniqueAchievements);
        setGameState(prev => ({
            ...prev,
            stats: newStats,
            deadBossIndices: newBosses,
            rescuedFamilyIndices: newFamily,
            screen: GameScreen.RECAP
        }));
    }, [gameState.stats, gameState.currentSector, gameState.deadBossIndices, gameState.rescuedFamilyIndices]);

    const handleSectorEnded = useCallback((stats: SectorStats) => {
        setDeathDetails(null);

        // 1. Basic Aggregation (Includes XP, Levels, and Collectibles SP)
        const prevSp = gameState.stats.skillPoints;

        // 2. Determine new unique achievements from this run
        let newUniqueAchievements = 0;
        const bossKilled = stats.killsByType['Boss'] > 0;
        const newBosses = [...gameState.deadBossIndices];
        if (bossKilled && !gameState.deadBossIndices.includes(gameState.currentSector)) {
            newBosses.push(gameState.currentSector);
            newUniqueAchievements++;
        }

        const newFamily = [...gameState.rescuedFamilyIndices];
        // For sector end, we check if family found in this run (and not already found globally)
        // Or if the boss was killed, we automatically rescue the family member
        if ((stats.familyFound || bossKilled) && !gameState.rescuedFamilyIndices.includes(gameState.currentSector)) {
            newFamily.push(gameState.currentSector);
            newUniqueAchievements++;
        }

        // 3. Aggregate stats and calculate SP
        const newStats = aggregateStats(gameState.stats, stats, false, !!stats.aborted, newUniqueAchievements);

        // 4. Update Sector Stats for Report Screen
        stats.spEarned = newStats.skillPoints - prevSp;

        // Filter global found list to only include those from the current sector
        const sectorCollectibles = getCollectiblesBySector(gameState.currentSector + 1).map(c => c.id);
        stats.collectiblesDiscovered = newStats.collectiblesDiscovered.filter(id => sectorCollectibles.includes(id));

        setSectorStats(stats);

        setGameState(prev => ({
            ...prev,
            stats: newStats,
            deadBossIndices: newBosses,
            rescuedFamilyIndices: newFamily,
            screen: bossKilled ? GameScreen.BOSS_KILLED : GameScreen.RECAP, // Go to Boss Killed screen first if boss died
            midRunCheckpoint: null // Clear checkpoint on success
        }));
    }, [gameState.stats, gameState.currentSector, gameState.deadBossIndices, gameState.rescuedFamilyIndices]);

    const handleTeleportJump = (x: number, z: number) => {
        gameCanvasRef.current?.requestPointerLock();
        setTeleportTarget({ x, z, timestamp: Date.now() });
        setActiveOverlay(null);
    };

    const handleMapSelectCoords = (x: number, z: number) => {
        setTeleportInitialCoords({ x, z });
        setActiveOverlay('TELEPORT');
    };

    const handleSaveStats = (newStats: PlayerStats) => {
        setGameState(prev => ({ ...prev, stats: newStats }));
    };

    const handleSaveGraphics = (newG: GraphicsSettings) => {
        const oldG = gameState.graphics;
        const needsReWarm = newG.antialias !== oldG.antialias ||
            newG.shadows !== oldG.shadows ||
            newG.shadowMapType !== oldG.shadowMapType;

        setGameState(prev => ({ ...prev, graphics: newG }));
        WinterEngine.getInstance().updateSettings(newG);

        if (needsReWarm) {
            console.log(`[App] Graphical settings changed (AA/Shadows). Screen: ${gameState.screen}. Re-warming...`);
            AssetPreloader.reset();

            const engine = WinterEngine.getInstance();
            const yieldToMain = () => new Promise<void>(resolve => setTimeout(resolve, 0));

            // Determine what to re-warm based on current screen
            const isCamp = gameState.screen === GameScreen.CAMP;
            const sectorIndex = gameState.currentSector !== undefined ? gameState.currentSector : 0;
            const envConfig = isCamp ? CAMP_SCENE : SECTOR_THEMES[sectorIndex];

            // Trigger re-warm in background
            AssetPreloader.warmupAsync(engine.renderer, 'CORE', envConfig, yieldToMain, engine.camera.threeCamera).then(() => {
                if (isCamp) {
                    AssetPreloader.warmupAsync(engine.renderer, 'CAMP', envConfig, yieldToMain, engine.camera.threeCamera);
                } else {
                    AssetPreloader.warmupAsync(engine.renderer, sectorIndex, envConfig, yieldToMain, engine.camera.threeCamera);
                }
            });
        }
    };

    const handleSaveLoadout = (loadout: any, levels: any) => {
        setGameState(prev => ({ ...prev, loadout, weaponLevels: levels }));
    };

    const handleSelectSector = useCallback((sectorIndex: number) => {
        setGameState(prev => ({ ...prev, currentSector: sectorIndex }));
    }, []);

    const handleStartSector = useCallback(async () => {
        const sectorIndex = gameState.currentSector;
        const envConfig = SECTOR_THEMES[sectorIndex];
        const engine = WinterEngine.getInstance();
        const yieldToMain = () => new Promise<void>(resolve => setTimeout(resolve, 0));

        await triggerLoadingTransition('SECTOR', async () => {
            setGameState(prev => ({ ...prev, screen: GameScreen.SECTOR }));
            setTeleportTarget(null);
            setHudState({});
            setCurrentSectorMapItems([]);
            setActiveCollectible(null);
            setActiveOverlay(null);

            // Modular Warmup: Trigger sector-specific assets (Boss, Vehicles, unique props)
            await AssetPreloader.warmupAsync(engine.renderer, sectorIndex, envConfig, yieldToMain, engine.camera.threeCamera);
        });
    }, [gameState.currentSector, triggerLoadingTransition]);

    const onStationInteraction = useCallback((type: OverlayType | null) => {
        setActiveOverlay(type);
    }, []);

    const handlePrologueComplete = () => {
        // Transition straight to SECTOR (skipping CAMP as requested)
        setGameState(prev => ({
            ...prev,
            screen: GameScreen.SECTOR,
            currentSector: 0,
            stats: {
                ...prev.stats,
                prologueSeen: true
            }
        }));
        soundManager.playUiConfirm();
    };

    const handleAbortSector = useCallback(() => {
        if (!gameCanvasRef.current) return;

        setActiveOverlay(null);

        // Get current run stats but mark as aborted
        const stats = gameCanvasRef.current.getSectorStats(false, true);
        handleSectorEnded(stats);

        soundManager.playUiClick();
    }, [handleSectorEnded]);

    const handleResetGame = () => {
        clearSave();
        window.location.reload();
    };

    const cursorHidden = isMobileDevice || isPointerLocked || (gameState.screen === GameScreen.SECTOR && !activeOverlay && !hudState.isDead);

    const handleCollectibleClose = useCallback(() => {
        // CALL Pointer Lock BEFORE setting state to null to preserve user gesture context
        if (gameCanvasRef.current && !isMobileDevice) gameCanvasRef.current.requestPointerLock();
        setActiveOverlay(null);
        setActiveCollectible(null);
    }, [isMobileDevice]);

    const handleClueDiscovered = useCallback((clue: SectorTrigger) => {
        if (!clue.id) return;
        setGameState(prev => {
            if (prev.stats.cluesFound.includes(clue.id)) return prev;
            return {
                ...prev,
                stats: {
                    ...prev.stats,
                    cluesFound: [...prev.stats.cluesFound, clue.id]
                }
            };
        });
    }, []);

    const handlePOIdiscovered = useCallback((poi: SectorTrigger) => {
        if (!poi.id) return;
        setGameState(prev => {
            if (prev.stats.discoveredPOIs.includes(poi.id)) return prev;
            return {
                ...prev,
                stats: {
                    ...prev.stats,
                    discoveredPOIs: [...prev.stats.discoveredPOIs, poi.id]
                }
            };
        });
    }, []);

    const handleCollectibleDiscovered = useCallback((id: string) => {
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

    const handleMarkCollectiblesViewed = useCallback((ids: string[]) => {
        setGameState(prev => {
            const currentViewed = prev.stats.viewedCollectibles || [];
            const newViewed = [...currentViewed];
            let changed = false;
            for (let i = 0; i < ids.length; i++) {
                const id = ids[i];
                if (!newViewed.includes(id)) {
                    newViewed.push(id);
                    changed = true;
                }
            }
            if (!changed) return prev;
            return {
                ...prev,
                stats: {
                    ...prev.stats,
                    viewedCollectibles: newViewed
                }
            };
        });
    }, []);

    // Ensure pointer lock is released when an overlay opens (for mouse visibility)
    useEffect(() => {
        if (activeOverlay && document.pointerLockElement) {
            document.exitPointerLock();
        }
    }, [activeOverlay]);

    const globalInputActions = React.useMemo(() => ({
        setActiveOverlay,
        setTeleportInitialCoords,
        requestPointerLock: () => { if (!isMobileDevice) gameCanvasRef.current?.requestPointerLock(); },
        onCollectibleClose: handleCollectibleClose
    }), [handleCollectibleClose, isMobileDevice]);

    // Global Input Hook (ESC, M)
    useGlobalInput(activeOverlay, {
        hp: hudState.hp || 100,
        screen: gameState.screen
    }, globalInputActions);

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
                    onToggleDebug={(val) => setGameState(prev => ({ ...prev, debugMode: val }))}
                    onUpdateHUD={handleUpdateHUD}
                    onResetGame={handleResetGame}
                    onSaveGraphics={handleSaveGraphics}
                    initialGraphics={gameState.graphics}
                    onCampLoaded={() => {
                        sceneReadyRef.current = true;
                        tryDismissLoading();
                    }}
                    isMobileDevice={isMobileDevice}
                    weather={gameState.weather}
                    isRunning={!isInitialBoot}
                    activeOverlay={activeOverlay}
                    setActiveOverlay={setActiveOverlay}
                    onPauseToggle={(val) => setActiveOverlay(val ? 'PAUSE' : null)}
                    onInteractionStateChange={onStationInteraction}
                />
            )}

            {(gameState.screen === GameScreen.SECTOR || gameState.screen === GameScreen.PROLOGUE) && (
                <>
                    <GameSession
                        ref={gameCanvasRef}
                        stats={gameState.stats}
                        loadout={gameState.loadout}
                        weaponLevels={gameState.weaponLevels}
                        currentSector={gameState.screen === GameScreen.PROLOGUE ? 0 : gameState.currentSector}
                        debugMode={gameState.debugMode}
                        isRunning={gameState.screen === GameScreen.SECTOR && !activeOverlay && !isLoadingSector}
                        isPaused={!!activeOverlay || isLoadingSector || gameState.screen === GameScreen.PROLOGUE}
                        disableInput={activeOverlay === 'COLLECTIBLE' || isLoadingSector || activeOverlay === 'ADVENTURE_LOG'}
                        onUpdateHUD={handleUpdateHUD}
                        onDie={handleDie}
                        onSectorEnded={handleSectorEnded}
                        onPauseToggle={(val) => setActiveOverlay(val ? 'PAUSE' : null)}
                        onOpenMap={() => { setActiveOverlay('MAP'); soundManager.playUiConfirm(); }}
                        triggerEndSector={false}
                        familyAlreadyRescued={gameState.rescuedFamilyIndices.includes(gameState.currentSector)}
                        rescuedFamilyIndices={gameState.rescuedFamilyIndices}
                        bossPermanentlyDefeated={gameState.deadBossIndices.includes(gameState.currentSector)}
                        onSectorLoaded={() => {
                            sceneReadyRef.current = true;
                            tryDismissLoading();
                        }}
                        startAtCheckpoint={false}
                        onCheckpointReached={() => { }}
                        teleportTarget={teleportTarget}
                        onCollectibleDiscovered={handleCollectibleDiscovered}
                        onClueDiscovered={handleClueDiscovered}
                        onPOIdiscovered={handlePOIdiscovered}
                        isCollectibleOpen={activeOverlay === 'COLLECTIBLE'}
                        onCollectibleClose={handleCollectibleClose}
                        onDialogueStateChange={(val) => setActiveOverlay(val ? 'DIALOGUE' : null)}
                        onDeathStateChange={(val) => setActiveOverlay(val ? 'DEATH' : null)}
                        onBossIntroStateChange={(val) => setActiveOverlay(val ? 'INTRO' : null)}
                        onInteractionStateChange={onStationInteraction}
                        onUpdateLoadout={(loadout, levels) => {
                            setGameState(prev => ({ ...prev, loadout, weaponLevels: levels }));
                        }}
                        onEnvironmentOverrideChange={(overrides) => {
                            setGameState(prev => {
                                const newOverrides = { ...(prev.environmentOverrides || {}) };
                                newOverrides[prev.currentSector] = overrides;
                                return { ...prev, environmentOverrides: newOverrides };
                            });
                        }}
                        environmentOverrides={gameState.environmentOverrides}
                        initialGraphics={gameState.graphics}
                        isMobileDevice={isMobileDevice}
                        weather={gameState.weather}
                    />

                    {(!activeOverlay || activeOverlay === 'INTRO') && !hudState.isHidden && !isLoadingSector && !isLoadingCamp && !showLoadingOverlay && (
                        isMobileDevice ? (
                            <MobileGameHUD
                                {...hudState}
                                loadout={gameState.loadout}
                                weaponLevels={gameState.weaponLevels}
                                debugMode={gameState.debugMode}
                                isBossIntro={activeOverlay === 'INTRO'}
                                isDriving={hudState.isDriving}
                                vehicleSpeed={hudState.vehicleSpeed}
                                throttleState={hudState.throttleState}
                                isMobileDevice={true}
                                onTogglePause={() => { setActiveOverlay('PAUSE'); soundManager.playUiClick(); }}
                                onToggleMap={() => { setActiveOverlay('MAP'); soundManager.playUiConfirm(); }}
                                onSelectWeapon={(slot) => { gameCanvasRef.current?.triggerInput(slot as any); }}
                                onRotateCamera={(dir) => gameCanvasRef.current?.rotateCamera(dir)}
                            />
                        ) : (
                            <GameHUD
                                {...hudState}
                                loadout={gameState.loadout}
                                weaponLevels={gameState.weaponLevels}
                                debugMode={gameState.debugMode}
                                isBossIntro={activeOverlay === 'INTRO'}
                                isDriving={hudState.isDriving}
                                vehicleSpeed={hudState.vehicleSpeed}
                                throttleState={hudState.throttleState}
                                onTogglePause={() => { setActiveOverlay('PAUSE'); soundManager.playUiClick(); }}
                                onToggleMap={() => { setActiveOverlay('MAP'); soundManager.playUiConfirm(); }}
                                onSelectWeapon={(slot) => { gameCanvasRef.current?.triggerInput(slot as any); }}
                            />
                        )
                    )}

                </>
            )}

            {/* UNIVERSAL OVERLAYS */}
            {activeOverlay === 'PAUSE' && (
                <ScreenPause
                    onResume={() => {
                        if (gameState.screen === GameScreen.SECTOR && !isMobileDevice) gameCanvasRef.current?.requestPointerLock();
                        setActiveOverlay(null);
                    }}
                    onAbort={handleAbortSector}
                    onOpenMap={() => { setActiveOverlay('MAP'); soundManager.playUiConfirm(); }}
                    onOpenSettings={() => setActiveOverlay('SETTINGS')}
                    onOpenAdventureLog={() => { setActiveOverlay('ADVENTURE_LOG'); soundManager.playUiConfirm(); }}
                    isMobileDevice={isMobileDevice}
                />
            )}

            {activeOverlay === 'SETTINGS' && (
                <ScreenSettings
                    onClose={() => {
                        if (gameState.screen === GameScreen.SECTOR && !isMobileDevice) gameCanvasRef.current?.requestPointerLock();
                        setActiveOverlay(null);
                    }}
                    graphics={gameState.graphics}
                    onUpdateGraphics={handleSaveGraphics}
                    isMobileDevice={isMobileDevice}
                />
            )}

            {activeOverlay === 'ADVENTURE_LOG' && (
                <ScreenAdventureLog
                    stats={gameState.screen === GameScreen.SECTOR ? (gameCanvasRef.current?.getMergedSessionStats() || gameState.stats) : gameState.stats}
                    onClose={() => {
                        if (gameState.screen === GameScreen.SECTOR && !isMobileDevice) gameCanvasRef.current?.requestPointerLock();
                        setActiveOverlay(null);
                    }}
                    onMarkCollectiblesViewed={handleMarkCollectiblesViewed}
                    isMobileDevice={isMobileDevice}
                />
            )}

            {activeOverlay === 'COLLECTIBLE' && activeCollectible && (
                <ScreenCollectibleDiscovered
                    collectible={getCollectibleById(activeCollectible)!}
                    onClose={handleCollectibleClose}
                    isMobileDevice={isMobileDevice}
                />
            )}

            {activeOverlay === 'STATION_STATISTICS' && (
                <ScreenAdventureLog
                    stats={gameState.stats}
                    onClose={() => setActiveOverlay(null)}
                    isMobileDevice={isMobileDevice}
                />
            )}

            {activeOverlay === 'DEATH' && (
                <ScreenPlayerDied
                    onContinue={() => {
                        const stats = gameCanvasRef.current?.getSectorStats() || sectorStats;
                        handleDie(stats, hudState.killerName);
                        setActiveOverlay(null);
                    }}
                    killerName={hudState.killerName || "UNKNOWN"}
                    attackName={hudState.killerAttackName}
                    killedByEnemy={hudState.killedByEnemy}
                    isMobileDevice={isMobileDevice}
                />
            )}

            {activeOverlay === 'STATION_ARMORY' && (
                gameState.screen === GameScreen.CAMP ? (
                    <ScreenArmory
                        stats={gameState.stats}
                        currentLoadout={gameState.loadout}
                        weaponLevels={gameState.weaponLevels}
                        onClose={() => setActiveOverlay(null)}
                        onSave={(s, l, wl) => {
                            setGameState(prev => ({ ...prev, stats: s, loadout: l, weaponLevels: wl }));
                            setActiveOverlay(null);
                        }}
                        isMobileDevice={isMobileDevice}
                    />
                ) : (
                    <ScreenPlaygroundArmoryStation
                        currentLoadout={gameState.loadout}
                        weaponLevels={gameState.weaponLevels}
                        isMobileDevice={isMobileDevice}
                        sectorState={{
                            unlimitedThrowables: gameState.loadout.throwable === 'INF_NADE', // Just a placeholder check if we had one
                            envOverride: gameState.environmentOverrides?.[gameState.currentSector]
                        }}
                        onClose={() => {
                            if (gameState.screen === GameScreen.SECTOR && !isMobileDevice) gameCanvasRef.current?.requestPointerLock();
                            setActiveOverlay(null);
                        }}
                        onSave={(newStats, newLoadout, newLevels, newSectorState) => {
                            setGameState(prev => {
                                const newOverrides = { ...(prev.environmentOverrides || {}) };
                                if (newSectorState.envOverride) {
                                    newOverrides[prev.currentSector] = newSectorState.envOverride;
                                }
                                return {
                                    ...prev,
                                    stats: newStats,
                                    loadout: newLoadout,
                                    weaponLevels: newLevels,
                                    environmentOverrides: newOverrides
                                };
                            });
                            setActiveOverlay(null);
                        }}
                        stats={gameState.stats}
                    />
                )
            )}

            {activeOverlay === 'STATION_SKILLS' && (
                gameState.screen === GameScreen.CAMP ? (
                    <ScreenPlayerSkills
                        stats={gameState.stats}
                        onSave={(s) => setGameState(prev => ({ ...prev, stats: s }))}
                        onClose={() => setActiveOverlay(null)}
                        isMobileDevice={isMobileDevice}
                    />
                ) : (
                    <ScreenPlaygroundSkillStation
                        stats={gameState.stats}
                        isMobileDevice={isMobileDevice}
                        sectorState={{ envOverride: gameState.environmentOverrides?.[gameState.currentSector] }}
                        onClose={() => {
                            if (gameState.screen === GameScreen.SECTOR && !isMobileDevice) gameCanvasRef.current?.requestPointerLock();
                            setActiveOverlay(null);
                        }}
                        onSave={(newStats, newSectorState) => {
                            setGameState(prev => {
                                const newOverrides = { ...(prev.environmentOverrides || {}) };
                                if (newSectorState.envOverride) {
                                    newOverrides[prev.currentSector] = newSectorState.envOverride;
                                }
                                return {
                                    ...prev,
                                    stats: newStats,
                                    environmentOverrides: newOverrides
                                };
                            });
                            setActiveOverlay(null);
                        }}
                    />
                )
            )}

            {activeOverlay === 'STATION_ENVIRONMENT' && (
                <ScreenPlaygroundEnvironmentStation
                    onClose={() => {
                        if (gameState.screen === GameScreen.SECTOR && !isMobileDevice) gameCanvasRef.current?.requestPointerLock();
                        setActiveOverlay(null);
                    }}
                    isMobileDevice={isMobileDevice}
                    currentWeather={gameState.weather}
                    onWeatherChange={(w) => setGameState(prev => ({ ...prev, weather: w }))}
                    currentOverride={gameState.environmentOverrides?.[gameState.currentSector]}
                    onOverrideChange={(overrides) => {
                        setGameState(prev => {
                            const newOverrides = { ...(prev.environmentOverrides || {}) };
                            newOverrides[prev.currentSector] = overrides;
                            return { ...prev, environmentOverrides: newOverrides };
                        });
                    }}
                    transparent={true}
                />
            )}

            {activeOverlay === 'STATION_SPAWNER' && (
                <ScreenPlaygroundEnemyStation
                    onClose={() => {
                        if (gameState.screen === GameScreen.SECTOR && !isMobileDevice) gameCanvasRef.current?.requestPointerLock();
                        setActiveOverlay(null);
                    }}
                    isMobileDevice={isMobileDevice}
                    playerPos={hudState.playerPos}
                    onSpawnEnemies={(enemies) => {
                        gameCanvasRef.current?.spawnEnemies(enemies);
                    }}
                />
            )}

            {activeOverlay === 'MAP' && (
                <ScreenMap
                    items={currentMapItems}
                    playerPos={hudState.playerPos}
                    familyPos={hudState.familyPos || undefined}
                    bossPos={hudState.bossPos || undefined}
                    onClose={() => {
                        if (gameState.screen === GameScreen.SECTOR && !isMobileDevice) gameCanvasRef.current?.requestPointerLock();
                        setActiveOverlay(null);
                    }}
                    onSelectCoords={handleMapSelectCoords}
                    isMobileDevice={isMobileDevice}
                />
            )}

            {activeOverlay === 'TELEPORT' && (
                <ScreenTeleport
                    initialCoords={teleportInitialCoords}
                    onJump={handleTeleportJump}
                    onCancel={() => { setActiveOverlay('MAP'); setTeleportInitialCoords(null); }}
                    isMobileDevice={isMobileDevice}
                />
            )}

            {gameState.screen === GameScreen.BOSS_KILLED && (
                <ScreenBossKilled
                    sectorIndex={gameState.currentSector}
                    stats={sectorStats || undefined}
                    onProceed={() => { soundManager.playUiConfirm(); setGameState(prev => ({ ...prev, screen: GameScreen.RECAP })); }}
                    isMobileDevice={isMobileDevice}
                />
            )}

            {gameState.screen === GameScreen.RECAP && sectorStats && (
                <ScreenSectorReport
                    stats={sectorStats}
                    deathDetails={deathDetails}
                    currentSector={gameState.currentSector}
                    onReturnCamp={() => {
                        soundManager.playUiConfirm();
                        triggerLoadingTransition('CAMP', async () => {
                            setGameState(prev => {
                                const isCleared = prev.deadBossIndices.includes(prev.currentSector);
                                const nextSector = (isCleared && prev.currentSector < 4) ? prev.currentSector + 1 : prev.currentSector;
                                return { ...prev, screen: GameScreen.CAMP, currentSector: nextSector, weather: 'snow' };
                            });

                            // Warmup Camp assets during transition
                            const engine = WinterEngine.getInstance();
                            const yieldToMain = () => new Promise<void>(resolve => setTimeout(resolve, 0));
                            await AssetPreloader.warmupAsync(engine.renderer, 'CAMP', CAMP_SCENE, yieldToMain, engine.camera.threeCamera);
                        });
                    }}
                    onRetry={() => {
                        soundManager.playUiConfirm();
                        triggerLoadingTransition('SECTOR', async () => {
                            const nextState = { screen: GameScreen.SECTOR };
                            setGameState(prev => ({ ...prev, ...nextState }));
                            setSectorStats(null);
                            setDeathDetails(null);
                            setHudState({});
                            setCurrentSectorMapItems([]);
                            setActiveCollectible(null);
                            setActiveOverlay(null);

                            // Warmup Sector assets during transition
                            const sectorIndex = gameState.currentSector;
                            const envConfig = SECTOR_THEMES[sectorIndex];
                            const engine = WinterEngine.getInstance();
                            const yieldToMain = () => new Promise<void>(resolve => setTimeout(resolve, 0));
                            await AssetPreloader.warmupAsync(engine.renderer, sectorIndex, envConfig, yieldToMain, engine.camera.threeCamera);
                        });
                    }}
                    isMobileDevice={isMobileDevice}
                />
            )}

            {gameState.screen === GameScreen.PROLOGUE && !isLoadingSector && (
                <Prologue onComplete={handlePrologueComplete} isMobileDevice={isMobileDevice} />
            )}

            <CustomCursor hidden={cursorHidden} />
            {activeOverlay === 'STATION_SECTORS' && (
                <ScreenSectorOverview
                    currentSector={gameState.currentSector}
                    rescuedFamilyIndices={gameState.rescuedFamilyIndices}
                    deadBossIndices={gameState.deadBossIndices}
                    debugMode={gameState.debugMode}
                    stats={gameState.stats}
                    onClose={() => setActiveOverlay(null)}
                    onSelectSector={handleSelectSector}
                    onStartSector={handleStartSector}
                    isMobileDevice={isMobileDevice}
                />
            )}

            {activeOverlay === 'RESET_CONFIRM' && (
                <ScreenResetConfirm
                    onConfirm={handleResetGame}
                    onCancel={() => setActiveOverlay('SETTINGS')}
                />
            )}

            {gameState.debugMode && (
                <DebugDisplay
                    fps={fps}
                    debugMode={gameState.debugMode}
                    debugInfo={hudState.debugInfo}
                    systems={debugSystems}
                    onToggleSystem={(id, enabled) => {
                        const success = gameCanvasRef.current?.setSystemEnabled(id, enabled);
                        if (success !== false) {
                            const systems = gameCanvasRef.current?.getSystems();
                            if (systems) setDebugSystems(systems);
                        }
                    }}
                />
            )}

            <ScreenLoading
                isDone={!showLoadingOverlay}
                sectorIndex={gameState.currentSector}
                isCamp={gameState.screen === GameScreen.CAMP}
                isInitialBoot={isInitialBoot}
                isMobileDevice={isMobileDevice}
            />
        </div>
    );
};

export default App;