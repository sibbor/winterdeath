
import React, { useState, useEffect, useCallback } from 'react';
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
import { WinterEngine } from './core/engine/WinterEngine';
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

    // [VINTERDÖD] Boot Warmup: Pre-compiles shaders to prevent startup stalls
    useEffect(() => {
        let isMounted = true;
        const warmup = async () => {
            const engine = WinterEngine.getInstance();
            // Start renderer for compilation if not already alive
            if (!engine.renderer) {
                // Temporary minimal mount for compilation context if needed, 
                // but Engine.getInstance() usually initializes it.
            }

            const isCamp = gameState.screen === GameScreen.CAMP;
            const envConfig = isCamp ? CAMP_ENV : (gameState.currentSector !== undefined ? SECTOR_THEMES[gameState.currentSector] : SECTOR_THEMES[0]);

            // [VINTERDÖD] Yield function to prevent "Violation: handler took X ms" 
            const yieldToMain = () => new Promise<void>(resolve => setTimeout(resolve, 0));

            // [VINTERDÖD] MODULAR WARMUP: Load CORE basics first, then active scene requirements.
            // This saves VRAM and speeds up boot into Camp.
            // We pass the active camera to ensure accurate shader permutation matching.
            if (isCamp) {
                await AssetPreloader.warmupAsync(engine.renderer, 'CORE', envConfig, yieldToMain, engine.camera.threeCamera);
                await AssetPreloader.warmupAsync(engine.renderer, 'CAMP', envConfig, yieldToMain, engine.camera.threeCamera);
            } else if (gameState.screen === GameScreen.PROLOGUE) {
                await AssetPreloader.warmupAsync(engine.renderer, 'CORE', SECTOR_THEMES[0], yieldToMain, engine.camera.threeCamera);
                await AssetPreloader.warmupAsync(engine.renderer, 0, SECTOR_THEMES[0], yieldToMain, engine.camera.threeCamera);
            } else if (gameState.currentSector !== undefined) {
                await AssetPreloader.warmupAsync(engine.renderer, 'CORE', envConfig, yieldToMain, engine.camera.threeCamera);
                await AssetPreloader.warmupAsync(engine.renderer, gameState.currentSector, envConfig, yieldToMain, engine.camera.threeCamera);
            } else {
                await AssetPreloader.warmupAsync(engine.renderer, 'CORE', envConfig, yieldToMain, engine.camera.threeCamera);
            }

            if (isMounted) {
                setIsInitialBoot(false);
                setIsLoadingCamp(false);
                setIsLoadingSector(false);
                setTimeout(() => { if (isMounted) setShowLoadingOverlay(false); }, 500);
            }
        };

        if (isInitialBoot) {
            warmup();
        }

        return () => { isMounted = false; };
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

        // Fix: Ensure we show ALL found collectibles (current + previous), filtered by current sector
        // We actually want to show the specific collectibles found in this sector (Total).
        // Since `aggregateStats` already merged them into `newStats`, we can just use `newStats` for the report's knowledge
        // BUT `ScreenSectorReport` expects `SectorStats`.
        // Let's override `collectiblesFound` in the `stats` object passed to the report with the GLOBAL list for this sector.
        // ScreenSectorReport filters them by sector anyway? No, it takes the list as is.

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

    const handleSaveGraphics = (graphics: any) => {
        setGameState(prev => ({ ...prev, graphics }));
    };

    const handleSaveLoadout = (loadout: any, levels: any) => {
        setGameState(prev => ({ ...prev, loadout, weaponLevels: levels }));
    };

    const handleSelectSector = useCallback((sectorIndex: number) => {
        setGameState(prev => ({ ...prev, currentSector: sectorIndex }));
    }, []);

    const handleStartSector = useCallback(async () => {
        setIsLoadingSector(true);
        setShowLoadingOverlay(true);
        setGameState(prev => ({ ...prev, screen: GameScreen.SECTOR }));
        setTeleportTarget(null);

        // [VINTERDÖD] Clear FX baggage before entering new sector
        FXSystem.reset();

        // [VINTERDÖD] Modular Warmup: Trigger sector-specific assets (Boss, Vehicles, unique props)
        // while the loading screen is visible.
        const engine = WinterEngine.getInstance();
        const envConfig = SECTOR_THEMES[gameState.currentSector];
        const yieldToMain = () => new Promise<void>(resolve => setTimeout(resolve, 0));
        await AssetPreloader.warmupAsync(engine.renderer, gameState.currentSector, envConfig, yieldToMain, engine.camera.threeCamera);

        setHudState({});
        setCurrentSectorMapItems([]);
        setActiveCollectible(null);
        setIsPaused(false);
        setIsMapOpen(false);
    }, [gameState.currentSector]);

    const handlePrologueComplete = () => {
        // Transition straight to SECTOR (skipping CAMP as requested)
        // GameSession is already mounted in background, so switching screen makes it visible instantly
        setGameState(prev => ({
            ...prev,
            screen: GameScreen.SECTOR, // Was CAMP
            currentSector: 0, // Ensure we are on Sector 1
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
        // Removed .catch() as requestPointerLock might be void or we don't care about the promise result here safely
        if (activeCollectible) {
            setGameState(prev => {
                const collId = activeCollectible as string;
                if (!prev.stats.collectiblesFound) return prev; // Safety check

                // [VINTERDÖD] Prevent saving dummy test collectibles
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
            {!isInitialBoot && <DebugDisplay
                debugMode={gameState.debugMode}
                debugInfo={gameState.debugMode ? hudState.debugInfo : undefined}
                systems={gameState.debugMode ? debugSystems : undefined}
                onToggleSystem={gameState.debugMode ? (id, enabled) => {
                    gameCanvasRef.current?.setSystemEnabled(id, enabled);
                    setDebugSystems(prev => prev.map(s => s.id === id ? { ...s, enabled } : s));
                } : undefined}
            />}

            {gameState.screen === GameScreen.CAMP && (
                <Camp
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
                        setTimeout(() => setShowLoadingOverlay(false), 500);
                    }}
                    isMobileDevice={isMobileDevice}
                    weather={gameState.weather}
                    // [VINTERDÖD] Allow simulation to run behind the loading screen so particles are moving on Frame 1
                    isRunning={!isInitialBoot}
                />
            )}

            {/* 
                Use Concurrent Rendering:
                Render GameSession if screen IS SECTOR OR PROLOGUE.
                If Prologue, isRunning is FALSE (paused loop), but Mount effect still runs (Generation).
                This preloads the world behind the Prologue screen.
            */}
            {(gameState.screen === GameScreen.SECTOR || gameState.screen === GameScreen.PROLOGUE) && (
                <>
                    <GameSession
                        ref={gameCanvasRef}
                        stats={gameState.stats}
                        loadout={gameState.loadout}
                        weaponLevels={gameState.weaponLevels}
                        currentSector={gameState.screen === GameScreen.PROLOGUE ? 0 : gameState.currentSector} // Force Map 0 during pre-load
                        debugMode={gameState.debugMode}
                        // Only run loop if actually playing Sector
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

                        onSectorLoaded={() => setIsLoadingSector(false)}
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
                                return {
                                    ...prev,
                                    environmentOverrides: newOverrides
                                };
                            });
                        }}
                        environmentOverrides={gameState.environmentOverrides}
                        initialGraphics={gameState.graphics}
                        isMobileDevice={isMobileDevice}
                        weather={gameState.weather}
                    />

                    {/* Hide HUD if hudState.isHidden or during dialogues/intro (but allow GameHUD to handle its own visibility for Boss Intro) */}
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
                                onSelectWeapon={(slot) => {
                                    gameCanvasRef.current?.triggerInput(slot as any);
                                }}
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
                                onSelectWeapon={(slot) => {
                                    gameCanvasRef.current?.triggerInput(slot as any);
                                }}
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

            {(showLoadingOverlay) && (
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

            {/* Map Screen (Overlay for Sector) */}
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

            {/* Teleport Menu (Overlay) */}
            {showTeleportMenu && (
                <ScreenTeleport
                    initialCoords={teleportInitialCoords}
                    onJump={handleTeleportJump}
                    onCancel={() => {
                        // Return to Map Screen
                        setShowTeleportMenu(false);
                        setTeleportInitialCoords(null);
                        setIsMapOpen(true);
                    }}
                    isMobileDevice={isMobileDevice}
                />
            )}

            {gameState.screen === GameScreen.BOSS_KILLED && (
                <ScreenBossKilled
                    sectorIndex={gameState.currentSector}
                    stats={sectorStats || undefined}
                    onProceed={() => {
                        soundManager.playUiConfirm();
                        setGameState(prev => ({ ...prev, screen: GameScreen.RECAP }));
                    }}
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
                        setIsLoadingCamp(true);
                        setShowLoadingOverlay(true);
                        setIsDeathScreenActive(false);

                        // [VINTERDÖD] Purge FX queues to prevent sector-blood appearing in Camp
                        FXSystem.reset();

                        // Yield to browser so it can render the loading screen before we block the thread
                        // Increased to 150ms to ensure the loading screen is painted on slower machines
                        setTimeout(() => {
                            setGameState(prev => {
                                const isCleared = prev.deadBossIndices.includes(prev.currentSector);
                                // Advance to next sector if cleared and not already at the last one
                                const nextSector = (isCleared && prev.currentSector < 4) ? prev.currentSector + 1 : prev.currentSector;
                                return { ...prev, screen: GameScreen.CAMP, currentSector: nextSector, weather: 'snow' };
                            });
                        }, 150);
                    }}

                    onRetry={() => {
                        setIsDeathScreenActive(false);
                        setIsLoadingSector(true);
                        setShowLoadingOverlay(true);

                        FXSystem.reset();

                        setGameState(prev => ({ ...prev, screen: GameScreen.SECTOR }));
                        setSectorStats(null);
                        setDeathDetails(null);
                        setHudState({});
                        setCurrentSectorMapItems([]);
                        setActiveCollectible(null);
                        setIsPaused(false);
                        soundManager.playUiConfirm();
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
