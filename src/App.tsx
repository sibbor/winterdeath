
import React, { useState, useEffect, useCallback } from 'react';
import { GameState, GameScreen, PlayerStats, SectorStats, SectorTrigger, MapItem, WeaponType } from './types';
import { loadGameState, saveGameState, clearSave } from './utils/persistence';
import { aggregateStats } from './utils/gameLogic';
import GameSession, { GameSessionHandle } from './components/GameSession';
import Camp from './components/camp/Camp';
import GameHUD from './components/ui/hud/GameHUD';
import ScreenPause from './components/game/ScreenPause';
import ScreenMap from './components/game/ScreenMap';
import ScreenTeleport from './components/game/ScreenTeleport';
import ScreenSectorReport from './components/game/ScreenSectorReport';
import ScreenBossKilled from './components/game/ScreenBossKilled';
import ScreenClue from './components/game/ScreenClue';
import Prologue from './components/game/Prologue';
import ScreenLoading from './components/game/ScreenLoading';
import ScreenSettings from './components/camp/ScreenSettings';
import DebugDisplay from './components/ui/core/DebugDisplay';
import CustomCursor from './components/ui/core/CustomCursor';
import { useGlobalInput } from './hooks/useGlobalInput';
import { soundManager } from './utils/sound';

const App: React.FC = () => {
    const [gameState, setGameState] = useState<GameState>(loadGameState());
    const [isPaused, setIsPaused] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isMapOpen, setIsMapOpen] = useState(false);
    const [showTeleportMenu, setShowTeleportMenu] = useState(false);
    const [teleportInitialCoords, setTeleportInitialCoords] = useState<{ x: number, z: number } | null>(null);
    const [teleportTarget, setTeleportTarget] = useState<{ x: number, z: number, timestamp: number } | null>(null);
    const [isLoadingLevel, setIsLoadingLevel] = useState(false);
    const [isLoadingCamp, setIsLoadingCamp] = useState(false);

    // HUD & Game State tracked in App for persistence/UI overlay
    const [hudState, setHudState] = useState<any>({});
    const [activeClue, setActiveClue] = useState<SectorTrigger | null>(null);
    const [isDialogueOpen, setIsDialogueOpen] = useState(false);
    const [isBossIntroActive, setIsBossIntroActive] = useState(false);
    const [currentMapItems, setCurrentMapItems] = useState<MapItem[]>([]);
    const [fps, setFps] = useState(0);

    // Sector Results
    const [deathDetails, setDeathDetails] = useState<{ killer: string } | null>(null);
    const [sectorStats, setSectorStats] = useState<SectorStats | null>(null);

    // Interaction Locks
    const [isSaving, setIsSaving] = useState(false);
    const gameCanvasRef = React.useRef<GameSessionHandle>(null);


    useEffect(() => {
        // Auto-save on meaningful state changes (screens)
        saveGameState(gameState);
    }, [gameState]);

    // Global Input Hook (ESC, M)
    useGlobalInput(gameState.screen, {
        isPaused, isMapOpen, showTeleportMenu, activeClue, isDialogueOpen, isBossIntroActive, hp: hudState.hp || 100, isSettingsOpen
    }, {
        setIsPaused, setIsMapOpen, setShowTeleportMenu, setTeleportInitialCoords, onResume: () => setIsPaused(false), setIsSettingsOpen,
        setActiveClue,
        requestPointerLock: () => gameCanvasRef.current?.requestPointerLock()
    });

    const handleUpdateHUD = useCallback((data: any) => {
        setHudState(data);
        if (data.fps !== undefined) setFps(data.fps);
    }, []);

    const handleFPSUpdate = useCallback((val: number) => {
        setFps(val);
    }, []);

    const handleDie = useCallback((stats: SectorStats, killer: string) => {
        setDeathDetails({ killer });
        setSectorStats(stats);

        const newStats = aggregateStats(gameState.stats, stats, true, false);
        setGameState(prev => ({
            ...prev,
            stats: newStats,
            screen: GameScreen.RECAP
        }));
    }, [gameState.stats]);

    const handleSectorEnded = useCallback((stats: SectorStats) => {
        setDeathDetails(null);

        // 1. Basic Aggregation (Includes XP and Level Up SP)
        const prevSp = gameState.stats.skillPoints;
        const newStats = aggregateStats(gameState.stats, stats, false, false);

        // 2. Award SP for New Collectibles
        // aggregateStats has already merged the clues into newStats.cluesFound.
        // Comparison with gameState.stats.cluesFound tells us how many were new.
        const prevClueCount = gameState.stats.cluesFound ? gameState.stats.cluesFound.length : 0;
        const newClueCount = newStats.cluesFound ? newStats.cluesFound.length : 0;
        const cluesFoundCount = Math.max(0, newClueCount - prevClueCount);

        if (cluesFoundCount > 0) {
            newStats.skillPoints += cluesFoundCount;
            newStats.totalSkillPointsEarned += cluesFoundCount;
        }

        // 3. Award SP for Unique Map Objectives (Boss / Family)
        const newBosses = [...gameState.bossesDefeated];
        const bossKilled = stats.killsByType['Boss'] > 0;
        if (bossKilled) {
            if (!newBosses.includes(gameState.currentMap)) {
                newBosses.push(gameState.currentMap);
                newStats.skillPoints++; // Award SP for first-time Boss kill
                newStats.totalSkillPointsEarned++;
            }
        }

        const newFamily = [...gameState.familyMembersFound];
        const newFamilySP = [...gameState.familySPAwarded];

        if (stats.familyFound && stats.familyExtracted) {
            // Track "Found" status (for unlocks/story)
            if (!newFamily.includes(gameState.currentMap)) {
                newFamily.push(gameState.currentMap);
            }

            // Track SP Reward separately (Explicit prevention of duplicates)
            if (!newFamilySP.includes(gameState.currentMap)) {
                newFamilySP.push(gameState.currentMap);
                newStats.skillPoints++; // Award SP for first-time Family rescue
                newStats.totalSkillPointsEarned++;
            }
        }

        // 4. Update Sector Stats for Report Screen
        // Calculate total SP gain (Level Up + Clues + Objectives)
        stats.spEarned = newStats.skillPoints - prevSp;
        setSectorStats(stats);

        setGameState(prev => ({
            ...prev,
            stats: newStats,
            bossesDefeated: newBosses,
            familyMembersFound: newFamily,
            familySPAwarded: newFamilySP,
            screen: bossKilled ? GameScreen.BOSS_KILLED : GameScreen.RECAP, // Go to Boss Killed screen first if boss died
            midRunCheckpoint: null // Clear checkpoint on success
        }));
    }, [gameState.stats, gameState.currentMap, gameState.bossesDefeated, gameState.familyMembersFound]);

    const handleAbortSector = () => {
        setIsPaused(false);
        setDeathDetails(null);

        // Create partial stats for abort
        const abortedStats: SectorStats = {
            timeElapsed: 0, shotsFired: 0, shotsHit: 0, throwablesThrown: 0, killsByType: {},
            scrapLooted: 0, xpGained: 0, bonusXp: 0, familyFound: false, damageDealt: 0, damageTaken: 0,
            chestsOpened: 0, bigChestsOpened: 0, aborted: true, distanceTraveled: 0, cluesFound: [],
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

    const handleSelectMap = (mapIndex: number) => {
        setGameState(prev => ({ ...prev, currentMap: mapIndex }));
    };

    const handleStartSector = () => {
        setIsLoadingLevel(true);
        setGameState(prev => ({ ...prev, screen: GameScreen.SECTOR }));
        // Reset sector state variables
        setHudState({});
        setCurrentMapItems([]);
        setActiveClue(null);
        setIsPaused(false);
        setIsMapOpen(false);
    };

    const handlePrologueComplete = () => {
        // Transition straight to SECTOR (skipping CAMP as requested)
        // GameSession is already mounted in background, so switching screen makes it visible instantly
        setGameState(prev => ({
            ...prev,
            screen: GameScreen.SECTOR, // Was CAMP
            currentMap: 0, // Ensure we are on Sector 1
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

    const cursorHidden = gameState.screen === GameScreen.SECTOR && !isPaused && !isMapOpen && !activeClue && !showTeleportMenu && !isDialogueOpen && !deathDetails;

    const handleClueClose = () => {
        gameCanvasRef.current?.requestPointerLock();
        setActiveClue(null);
        setIsPaused(false);
    };

    return (
        <div className="relative w-full h-full overflow-hidden bg-black select-none cursor-none">
            <CustomCursor hidden={cursorHidden} />

            {gameState.debugMode && <DebugDisplay fps={fps} debugInfo={gameState.debugMode ? hudState.debugInfo : undefined} />}

            {gameState.screen === GameScreen.CAMP && (
                <Camp
                    stats={gameState.stats}
                    currentLoadout={gameState.loadout}
                    weaponLevels={gameState.weaponLevels}
                    currentMap={gameState.currentMap}
                    familyMembersFound={gameState.familyMembersFound}
                    bossesDefeated={gameState.bossesDefeated}
                    debugMode={gameState.debugMode}
                    onSaveStats={handleSaveStats}
                    onSaveLoadout={handleSaveLoadout}
                    onSelectMap={handleSelectMap}
                    onStartSector={handleStartSector}
                    onToggleDebug={(val) => setGameState(prev => ({ ...prev, debugMode: val }))}
                    isMapLoaded={true}
                    onUpdateHUD={handleUpdateHUD}
                    onResetGame={handleResetGame}
                    onSaveGraphics={handleSaveGraphics}
                    initialGraphics={gameState.graphics}
                    onCampLoaded={() => setIsLoadingCamp(false)}
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
                        currentMap={gameState.screen === GameScreen.PROLOGUE ? 0 : gameState.currentMap} // Force Map 0 during pre-load
                        debugMode={gameState.debugMode}
                        // Only run loop if actually playing Sector
                        isRunning={gameState.screen === GameScreen.SECTOR && !isPaused && !isMapOpen && !showTeleportMenu && !activeClue && !isLoadingLevel}
                        isPaused={isPaused || isMapOpen || showTeleportMenu || !!activeClue || isLoadingLevel || gameState.screen === GameScreen.PROLOGUE}
                        disableInput={!!activeClue || isLoadingLevel}

                        onUpdateHUD={handleUpdateHUD}
                        onDie={handleDie}
                        onSectorEnded={handleSectorEnded}
                        onPauseToggle={setIsPaused}
                        onOpenMap={() => { setIsMapOpen(true); soundManager.playUiConfirm(); }}
                        triggerEndSector={false}

                        familyAlreadyRescued={gameState.familyMembersFound.includes(gameState.currentMap)}
                        bossPermanentlyDefeated={gameState.bossesDefeated.includes(gameState.currentMap)}

                        onLevelLoaded={() => setIsLoadingLevel(false)}
                        startAtCheckpoint={false}
                        onCheckpointReached={() => { }}

                        teleportTarget={teleportTarget}
                        onClueFound={setActiveClue}
                        isClueOpen={!!activeClue}
                        onClueClose={handleClueClose}
                        onDialogueStateChange={setIsDialogueOpen}
                        onBossIntroStateChange={setIsBossIntroActive}
                        onMapInit={setCurrentMapItems}
                        onFPSUpdate={handleFPSUpdate}
                        initialGraphics={gameState.graphics}
                    />

                    {/* Hide HUD if hudState.isHidden or during dialogues/intro */}
                    {!isMapOpen && !showTeleportMenu && !activeClue && !hudState.isHidden && !isDialogueOpen && !isBossIntroActive && (
                        <GameHUD
                            {...hudState}
                            loadout={gameState.loadout}
                            weaponLevels={gameState.weaponLevels}
                            debugMode={gameState.debugMode}
                            isBossIntro={isBossIntroActive}
                        />
                    )}

                    {isPaused && !isMapOpen && !showTeleportMenu && !isSettingsOpen && (
                        <ScreenPause
                            onResume={() => { setIsPaused(false); gameCanvasRef.current?.requestPointerLock(); }}
                            onAbort={handleAbortSector}
                            onOpenMap={() => { setIsMapOpen(true); soundManager.playUiConfirm(); }}
                            onOpenSettings={() => setIsSettingsOpen(true)}
                        />
                    )}

                    {isSettingsOpen && (
                        <ScreenSettings
                            onClose={() => setIsSettingsOpen(false)}
                            graphics={gameState.graphics}
                            onUpdateGraphics={handleSaveGraphics}
                        />
                    )}

                    {activeClue && (
                        <ScreenClue clue={activeClue} onClose={handleClueClose} />
                    )}
                </>
            )}

            {(isLoadingLevel || isLoadingCamp) && (
                <ScreenLoading mapIndex={gameState.currentMap} isCamp={isLoadingCamp} />
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
                />
            )}

            {gameState.screen === GameScreen.BOSS_KILLED && (
                <ScreenBossKilled
                    mapIndex={gameState.currentMap}
                    stats={sectorStats || undefined}
                    onProceed={() => {
                        soundManager.playUiConfirm();
                        setGameState(prev => ({ ...prev, screen: GameScreen.RECAP }));
                    }}
                />
            )}

            {gameState.screen === GameScreen.RECAP && sectorStats && (
                <ScreenSectorReport
                    stats={sectorStats}
                    deathDetails={deathDetails}
                    currentMap={gameState.currentMap}
                    onReturnCamp={() => {
                        setIsLoadingCamp(true);
                        setGameState(prev => ({ ...prev, screen: GameScreen.CAMP }));
                        soundManager.playUiConfirm();
                    }}
                    onRetry={() => {
                        setIsLoadingLevel(true);
                        setGameState(prev => ({ ...prev, screen: GameScreen.SECTOR }));
                        setSectorStats(null);
                        setDeathDetails(null);
                        setHudState({});
                        setCurrentMapItems([]);
                        setActiveClue(null);
                        setIsPaused(false);
                        soundManager.playUiConfirm();
                    }}
                />
            )}

            {gameState.screen === GameScreen.PROLOGUE && (
                <Prologue onComplete={handlePrologueComplete} />
            )}
        </div>
    );
};

export default App;
