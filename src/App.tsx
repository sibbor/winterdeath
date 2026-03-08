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
import { CAMP_ENV } from './components/camp/CampEnvironment';
import ScreenBossKilled from './components/game/ScreenBossKilled';
import ScreenCollectibleFound from './components/game/ScreenCollectibleFound';
import ScreenAdventureLog from './components/camp/ScreenAdventureLog';
import Prologue from './components/game/Prologue';
import ScreenLoading from './components/game/ScreenLoading';
import ScreenSettings from './components/camp/ScreenSettings';
import DebugDisplay from './components/ui/core/DebugDisplay';
import CustomCursor from './components/ui/core/CustomCursor';
import { useGlobalInput } from './hooks/useGlobalInput';
import { soundManager } from './utils/sound';
import { getCollectibleById, getCollectiblesBySector } from './content/collectibles';
import { isMobile } from './utils/device';
import { AssetPreloader } from './core/systems/AssetPreloader';
import { WinterEngine, GraphicsSettings } from './core/engine/WinterEngine';
import { FXSystem } from './core/systems/FXSystem';
import { DEFAULT_GRAPHICS, SECTOR_THEMES } from './content/constants';

const App: React.FC = () => {
    const [gameState, setGameState] = useState<GameState>(loadGameState());
    const [isPaused, setIsPaused] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isMapOpen, setIsMapOpen] = useState(false);
    const [showTeleportMenu, setShowTeleportMenu] = useState(false);
    const [teleportInitialCoords, setTeleportInitialCoords] = useState<{ x: number, z: number } | null>(null);
    const [teleportTarget, setTeleportTarget] = useState<{ x: number, z: number, timestamp: number } | null>(null);
    const [isLoadingSector, setIsLoadingSector] = useState(gameState.screen === GameScreen.SECTOR || gameState.screen === GameScreen.PROLOGUE);
    const [isLoadingCamp, setIsLoadingCamp] = useState(gameState.screen === GameScreen.CAMP);
    const [showLoadingOverlay, setShowLoadingOverlay] = useState(isLoadingSector || isLoadingCamp);
    const [isInitialBoot, setIsInitialBoot] = useState(true);
    const [isMobileDevice, setIsMobileDevice] = useState(isMobile());

    const triggerLoadingTransition = useCallback(async (
        type: 'CAMP' | 'SECTOR' | 'PROLOGUE',
        task: () => Promise<void> | void,
        skipCleanup: boolean = false
    ) => {
        console.log(`[App] triggerLoadingTransition (type: ${type}, skipCleanup: ${skipCleanup})`);

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
        // This is awaited to ensure the "Loaded" signal from the component 
        // respects the full transition duration.
        await task();
    }, []);

    // [VINTERDÖD] Boot Warmup: Pre-compiles shaders to prevent startup stalls
    const isWarmedUpRef = useRef(false);
    useEffect(() => {
        let isMounted = true;
        if (isWarmedUpRef.current) return;
        isWarmedUpRef.current = true;

        const warmup = async () => {
            console.log("[App] Boot Warmup Started...");
            const engine = WinterEngine.getInstance();
            const isCamp = gameState.screen === GameScreen.CAMP;
            const envConfig = isCamp ? CAMP_ENV : (gameState.currentSector !== undefined ? SECTOR_THEMES[gameState.currentSector] : SECTOR_THEMES[0]);
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

                // [VINTERDÖD] CRITICAL: We MUST set isInitialBoot to false even if the component re-rendered.
                // Re-rendering during warmup (due to setIsLoadingCamp in triggerLoadingTransition) 
                // was causing the 'isMounted' check in the previous closure to fail, leaving 
                // the game stuck in 'InitialBoot' mode (no interaction, no debug overlay).
                setIsInitialBoot(false);
                setGameState(prev => ({ ...prev }));
                console.log("[App] Boot Warmup Complete. isInitialBoot -> false");
            }, true);
        };

        if (isInitialBoot) {
            warmup();
        }

        return () => { };
    }, []);

    useEffect(() => {
        const checkMobile = () => {
            setIsMobileDevice(isMobile());
        };
        // Initial check is already done by useState(isMobile())
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // HUD & Game State tracked in App for persistence/UI overlay
    const [hudState, setHudState] = useState<any>({});
    const [activeCollectible, setActiveCollectible] = useState<string | null>(null);
    const [isDialogueOpen, setIsDialogueOpen] = useState(false);
    const [isInteractionOpen, setIsInteractionOpen] = useState(false);
    const [isAdventureLogOpen, setIsAdventureLogOpen] = useState(false);
    const [isBossIntroActive, setIsBossIntroActive] = useState(false);
    const [currentMapItems, setCurrentSectorMapItems] = useState<MapItem[]>([]);
    const [fps, setFps] = useState(0);
    const [debugSystems, setDebugSystems] = useState<{ id: string; enabled: boolean }[]>([]);

    // Sector Results
    const [deathDetails, setDeathDetails] = useState<{ killer: string } | null>(null);
    const [isDeathScreenActive, setIsDeathScreenActive] = useState(false);
    const [sectorStats, setSectorStats] = useState<SectorStats | null>(null);

    // Interaction Locks
    const [isSaving, setIsSaving] = useState(false);
    const gameCanvasRef = React.useRef<GameSessionHandle>(null);


    useEffect(() => {
        // Auto-save on meaningful state changes (screens)
        saveGameState(gameState);
        (window as any).setGameScreen = (screen: GameScreen) => setGameState(prev => ({ ...prev, screen }));
    }, [gameState]);

    // Global Input Hook (ESC, M)
    useGlobalInput(gameState.screen, {
        isPaused, isMapOpen, showTeleportMenu, activeCollectible, isDialogueOpen, isInteractionOpen, isBossIntroActive, hp: hudState.hp || 100, isSettingsOpen, isAdventureLogOpen
    }, {
        setIsPaused, setIsMapOpen, setShowTeleportMenu, setTeleportInitialCoords, onResume: () => setIsPaused(false), setIsSettingsOpen,
        setIsAdventureLogOpen,
        setActiveCollectible,
        requestPointerLock: () => gameCanvasRef.current?.requestPointerLock()
    });


    const handleUpdateHUD = useCallback((data: any) => {
        setHudState(data);
        if (data.fps !== undefined) setFps(data.fps);
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
        const newStats = aggregateStats(gameState.stats, stats, false, false, newUniqueAchievements);

        // 4. Update Sector Stats for Report Screen
        stats.spEarned = newStats.skillPoints - prevSp;

        // Filter global found list to only include those from the current sector
        const sectorCollectibles = getCollectiblesBySector(gameState.currentSector + 1).map(c => c.id);
        stats.collectiblesFound = newStats.collectiblesFound.filter(id => sectorCollectibles.includes(id));

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

    const handleAbortSector = () => {
        setIsPaused(false);
        setDeathDetails(null);

        // Get actual stats from the game session
        const abortedStats = gameCanvasRef.current?.getSectorStats(false, true) || {
            timeElapsed: 0, shotsFired: 0, shotsHit: 0, throwablesThrown: 0, killsByType: {},
            scrapLooted: 0, xpGained: 0, familyFound: false, damageDealt: 0, damageTaken: 0,
            chestsOpened: 0, bigChestsOpened: 0, aborted: true, distanceTraveled: 0, cluesFound: [], collectiblesFound: [],
            seenEnemies: [], seenBosses: [], visitedPOIs: []
        };

        setSectorStats(abortedStats);

        const newStats = aggregateStats(gameState.stats, abortedStats, false, true);
        setGameState(prev => ({
            ...prev,
            stats: newStats,
            screen: GameScreen.RECAP
        }));
    };

    const handleTeleportJump = (x: number, z: number) => {
        gameCanvasRef.current?.requestPointerLock();
        setTeleportTarget({ x, z, timestamp: Date.now() });
        setShowTeleportMenu(false);
        setIsPaused(false);
    };

    const handleMapSelectCoords = (x: number, z: number) => {
        setTeleportInitialCoords({ x, z });
        setShowTeleportMenu(true);
        setIsMapOpen(false);
        // Keep paused while in Teleport menu is implied by showTeleportMenu not unpausing immediately
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
            const envConfig = isCamp ? CAMP_ENV : SECTOR_THEMES[sectorIndex];

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
            setIsPaused(false);
            setIsMapOpen(false);

            // [VINTERDÖD] Modular Warmup: Trigger sector-specific assets (Boss, Vehicles, unique props)
            // MUST be inside the transition task to block the loading overlay fade-out.
            await AssetPreloader.warmupAsync(engine.renderer, sectorIndex, envConfig, yieldToMain, engine.camera.threeCamera);
        });
    }, [gameState.currentSector, triggerLoadingTransition]);

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

    const handleResetGame = () => {
        clearSave();
        window.location.reload();
    };

    const cursorHidden = isMobileDevice || (gameState.screen === GameScreen.SECTOR && !isPaused && !isMapOpen && !activeCollectible && !showTeleportMenu && !isDialogueOpen && !isInteractionOpen && !deathDetails && !hudState.isDead && !isDeathScreenActive && !isAdventureLogOpen);

    const handleCollectibleClose = useCallback(() => {
        if (gameCanvasRef.current) gameCanvasRef.current.requestPointerLock();
        if (activeCollectible) {
            setGameState(prev => {
                const collId = activeCollectible as string;
                if (!prev.stats.collectiblesFound) return prev; // Safety check
                if (collId === 'dummy_badge_test') return prev;
                if (prev.stats.collectiblesFound.includes(collId)) return prev;
                return {
                    ...prev,
                    stats: {
                        ...prev.stats,
                        collectiblesFound: [...prev.stats.collectiblesFound, collId],
                        skillPoints: prev.stats.skillPoints + 1,
                        totalSkillPointsEarned: prev.stats.totalSkillPointsEarned + 1
                    }
                };
            });
        }
        setActiveCollectible(null);
        setIsPaused(false);
    }, [activeCollectible]);

    const handleClueFound = useCallback((clue: SectorTrigger) => {
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
                        setIsLoadingCamp(false);
                        requestAnimationFrame(() => {
                            setTimeout(() => setShowLoadingOverlay(false), 500);
                        });
                    }}
                    isMobileDevice={isMobileDevice}
                    weather={gameState.weather}
                    isRunning={!isInitialBoot}
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
                        isRunning={gameState.screen === GameScreen.SECTOR && !isPaused && !isMapOpen && !showTeleportMenu && !activeCollectible && !isLoadingSector && !isAdventureLogOpen}
                        isPaused={isPaused || isMapOpen || showTeleportMenu || !!activeCollectible || isLoadingSector || gameState.screen === GameScreen.PROLOGUE || isAdventureLogOpen}
                        disableInput={!!activeCollectible || isLoadingSector || isAdventureLogOpen}
                        onUpdateHUD={handleUpdateHUD}
                        onDie={handleDie}
                        onSectorEnded={handleSectorEnded}
                        onPauseToggle={setIsPaused}
                        onOpenMap={() => { setIsMapOpen(true); soundManager.playUiConfirm(); }}
                        triggerEndSector={false}
                        familyAlreadyRescued={gameState.rescuedFamilyIndices.includes(gameState.currentSector)}
                        rescuedFamilyIndices={gameState.rescuedFamilyIndices}
                        bossPermanentlyDefeated={gameState.deadBossIndices.includes(gameState.currentSector)}
                        onSectorLoaded={() => {
                            setIsLoadingSector(false);
                            requestAnimationFrame(() => {
                                setTimeout(() => setShowLoadingOverlay(false), 500);
                            });
                        }}
                        startAtCheckpoint={false}
                        onCheckpointReached={() => { }}
                        teleportTarget={teleportTarget}
                        onCollectibleFound={setActiveCollectible}
                        onClueFound={handleClueFound}
                        isCollectibleOpen={!!activeCollectible}
                        onCollectibleClose={handleCollectibleClose}
                        onDialogueStateChange={setIsDialogueOpen}
                        onInteractionStateChange={setIsInteractionOpen}
                        onDeathStateChange={setIsDeathScreenActive}
                        onBossIntroStateChange={setIsBossIntroActive}
                        onMapInit={setCurrentSectorMapItems}
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

                    {!isMapOpen && !showTeleportMenu && !activeCollectible && !hudState.isHidden && !isDialogueOpen && (
                        isMobileDevice ? (
                            <MobileGameHUD
                                {...hudState}
                                loadout={gameState.loadout}
                                weaponLevels={gameState.weaponLevels}
                                debugMode={gameState.debugMode}
                                isBossIntro={isBossIntroActive}
                                isDriving={hudState.isDriving}
                                vehicleSpeed={hudState.vehicleSpeed}
                                throttleState={hudState.throttleState}
                                isMobileDevice={true}
                                onTogglePause={() => { setIsPaused(true); soundManager.playUiClick(); }}
                                onToggleMap={() => { setIsMapOpen(true); setIsPaused(true); soundManager.playUiConfirm(); }}
                                onSelectWeapon={(slot) => { gameCanvasRef.current?.triggerInput(slot as any); }}
                                onRotateCamera={(dir) => gameCanvasRef.current?.rotateCamera(dir)}
                            />
                        ) : (
                            <GameHUD
                                {...hudState}
                                loadout={gameState.loadout}
                                weaponLevels={gameState.weaponLevels}
                                debugMode={gameState.debugMode}
                                isBossIntro={isBossIntroActive}
                                isDriving={hudState.isDriving}
                                vehicleSpeed={hudState.vehicleSpeed}
                                throttleState={hudState.throttleState}
                                onTogglePause={() => { setIsPaused(true); soundManager.playUiClick(); }}
                                onToggleMap={() => { setIsMapOpen(true); setIsPaused(true); soundManager.playUiConfirm(); }}
                                onSelectWeapon={(slot) => { gameCanvasRef.current?.triggerInput(slot as any); }}
                            />
                        )
                    )}

                    {isPaused && !isMapOpen && !showTeleportMenu && !isSettingsOpen && !isAdventureLogOpen && !activeCollectible && (
                        <ScreenPause
                            onResume={() => { setIsPaused(false); gameCanvasRef.current?.requestPointerLock(); }}
                            onAbort={handleAbortSector}
                            onOpenMap={() => { setIsMapOpen(true); soundManager.playUiConfirm(); }}
                            onOpenSettings={() => setIsSettingsOpen(true)}
                            onOpenAdventureLog={() => { setIsAdventureLogOpen(true); soundManager.playUiConfirm(); }}
                            isMobileDevice={isMobileDevice}
                        />
                    )}

                    {isSettingsOpen && (
                        <ScreenSettings
                            onClose={() => { setIsSettingsOpen(false); setIsPaused(false); gameCanvasRef.current?.requestPointerLock(); }}
                            graphics={gameState.graphics}
                            onUpdateGraphics={handleSaveGraphics}
                            isMobileDevice={isMobileDevice}
                        />
                    )}

                    {activeCollectible && (
                        <ScreenCollectibleFound
                            collectible={getCollectibleById(activeCollectible)!}
                            onClose={handleCollectibleClose}
                            isMobileDevice={isMobileDevice}
                        />
                    )}

                    {isAdventureLogOpen && (
                        <ScreenAdventureLog
                            stats={gameState.stats}
                            onClose={() => { setIsAdventureLogOpen(false); setIsPaused(false); gameCanvasRef.current?.requestPointerLock(); }}
                            onMarkCollectiblesViewed={handleMarkCollectiblesViewed}
                            isMobileDevice={isMobileDevice}
                        />
                    )}
                </>
            )}

            {!isInitialBoot && <DebugDisplay
                debugMode={gameState.debugMode}
                debugInfo={gameState.debugMode ? hudState.debugInfo : undefined}
                systems={gameState.debugMode ? debugSystems : undefined}
                onToggleSystem={gameState.debugMode ? (id, enabled) => {
                    gameCanvasRef.current?.setSystemEnabled(id, enabled);
                    setDebugSystems(prev => prev.map(s => s.id === id ? { ...s, enabled } : s));
                } : undefined}
            />}

            {showLoadingOverlay && (
                <ScreenLoading
                    sectorIndex={gameState.currentSector}
                    isCamp={isLoadingCamp}
                    isInitialBoot={isInitialBoot}
                    isMobileDevice={isMobileDevice}
                    isDone={!isLoadingCamp && !isLoadingSector}
                    debugInfo={{
                        fps,
                        sceneChildren: hudState.debugInfo?.sceneChildren,
                        obstacles: hudState.debugInfo?.obstacles
                    }}
                />
            )}

            {isMapOpen && (
                <ScreenMap
                    items={currentMapItems}
                    playerPos={hudState.playerPos}
                    familyPos={hudState.familyPos || undefined}
                    bossPos={hudState.bossPos || undefined}
                    onClose={() => { gameCanvasRef.current?.requestPointerLock(); setIsMapOpen(false); setIsPaused(false); }}
                    onSelectCoords={handleMapSelectCoords}
                    isMobileDevice={isMobileDevice}
                />
            )}

            {showTeleportMenu && (
                <ScreenTeleport
                    initialCoords={teleportInitialCoords}
                    onJump={handleTeleportJump}
                    onCancel={() => { setShowTeleportMenu(false); setTeleportInitialCoords(null); setIsMapOpen(true); }}
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
                            setIsDeathScreenActive(false);
                            setGameState(prev => {
                                const isCleared = prev.deadBossIndices.includes(prev.currentSector);
                                const nextSector = (isCleared && prev.currentSector < 4) ? prev.currentSector + 1 : prev.currentSector;
                                return { ...prev, screen: GameScreen.CAMP, currentSector: nextSector, weather: 'snow' };
                            });

                            // [VINTERDÖD] Warmup Camp assets during transition
                            const engine = WinterEngine.getInstance();
                            const yieldToMain = () => new Promise<void>(resolve => setTimeout(resolve, 0));
                            await AssetPreloader.warmupAsync(engine.renderer, 'CAMP', CAMP_ENV, yieldToMain, engine.camera.threeCamera);
                        });
                    }}
                    onRetry={() => {
                        soundManager.playUiConfirm();
                        triggerLoadingTransition('SECTOR', async () => {
                            setIsDeathScreenActive(false);
                            const nextState = { screen: GameScreen.SECTOR };
                            setGameState(prev => ({ ...prev, ...nextState }));
                            setSectorStats(null);
                            setDeathDetails(null);
                            setHudState({});
                            setCurrentSectorMapItems([]);
                            setActiveCollectible(null);
                            setIsPaused(false);

                            // [VINTERDÖD] Warmup Sector assets during transition
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
        </div>
    );
};

export default App;
