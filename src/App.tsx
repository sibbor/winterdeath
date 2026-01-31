
import React, { useState, useEffect, useCallback } from 'react';
import { GameState, GameScreen, PlayerStats, MissionStats, SectorTrigger, MapItem, WeaponType } from './types';
import { loadGameState, saveGameState } from './utils/persistence';
import { aggregateStats } from './utils/gameLogic';
import GameCanvas, { GameCanvasHandle } from './components/GameCanvas';
import Camp from './components/camp/Camp';
import GameHUD from './components/ui/hud/GameHUD';
import ScreenPause from './components/game/ScreenPause';
import ScreenMap from './components/game/ScreenMap';
import ScreenTeleport from './components/game/ScreenTeleport';
import ScreenSectorReport from './components/game/ScreenSectorReport';
import ScreenBossKilled from './components/game/ScreenBossKilled';
import ScreenClue from './components/game/ScreenClue';
import ScreenSettings from './components/camp/ScreenSettings';
import FPSDisplay from './components/ui/core/FPSDisplay';
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

    // HUD & Game State tracked in App for persistence/UI overlay
    const [hudState, setHudState] = useState<any>({});
    const [activeClue, setActiveClue] = useState<SectorTrigger | null>(null);
    const [isDialogueOpen, setIsDialogueOpen] = useState(false);
    const [currentMapItems, setCurrentMapItems] = useState<MapItem[]>([]);
    const [fps, setFps] = useState(0);

    // Mission Results
    const [deathDetails, setDeathDetails] = useState<{ killer: string } | null>(null);
    const [missionStats, setMissionStats] = useState<MissionStats | null>(null);

    // Interaction Locks
    const [isSaving, setIsSaving] = useState(false);
    const gameCanvasRef = React.useRef<GameCanvasHandle>(null);


    useEffect(() => {
        // Auto-save on meaningful state changes (screens)
        saveGameState(gameState);
    }, [gameState]);

    // Global Input Hook (ESC, M)
    useGlobalInput(gameState.screen, {
        isPaused, isMapOpen, showTeleportMenu, activeClue, isDialogueOpen, hp: hudState.hp || 100, isSettingsOpen
    }, {
        setIsPaused, setIsMapOpen, setShowTeleportMenu, setTeleportInitialCoords, onResume: () => setIsPaused(false), setIsSettingsOpen,
        requestPointerLock: () => gameCanvasRef.current?.requestPointerLock()
    });

    const handleUpdateHUD = useCallback((data: any) => {
        setHudState(data);
        if (data.fps !== undefined) setFps(data.fps);
    }, []);

    const handleFPSUpdate = useCallback((val: number) => {
        setFps(val);
    }, []);

    const handleDie = useCallback((stats: MissionStats, killer: string) => {
        setDeathDetails({ killer });
        setMissionStats(stats);

        const newStats = aggregateStats(gameState.stats, stats, true, false);
        setGameState(prev => ({
            ...prev,
            stats: newStats,
            screen: GameScreen.RECAP
        }));
    }, [gameState.stats]);

    const handleMissionEnded = useCallback((stats: MissionStats) => {
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
        if (stats.familyFound && stats.familyExtracted) {
            if (!newFamily.includes(gameState.currentMap)) {
                newFamily.push(gameState.currentMap);
                newStats.skillPoints++; // Award SP for first-time Family rescue
                newStats.totalSkillPointsEarned++;
            }
        }

        // 4. Update Mission Stats for Report Screen
        // Calculate total SP gain (Level Up + Clues + Objectives)
        stats.spEarned = newStats.skillPoints - prevSp;
        setMissionStats(stats);

        setGameState(prev => ({
            ...prev,
            stats: newStats,
            bossesDefeated: newBosses,
            familyMembersFound: newFamily,
            screen: bossKilled ? GameScreen.BOSS_KILLED : GameScreen.RECAP, // Go to Boss Killed screen first if boss died
            midRunCheckpoint: null // Clear checkpoint on success
        }));
    }, [gameState.stats, gameState.currentMap, gameState.bossesDefeated, gameState.familyMembersFound]);

    const handleAbortMission = () => {
        setIsPaused(false);
        // Create partial stats for abort
        const abortedStats: MissionStats = {
            timeElapsed: 0, shotsFired: 0, shotsHit: 0, throwablesThrown: 0, killsByType: {},
            scrapLooted: 0, xpGained: 0, bonusXp: 0, familyFound: false, damageDealt: 0, damageTaken: 0,
            chestsOpened: 0, bigChestsOpened: 0, aborted: true, distanceTraveled: 0, cluesFound: []
        };
        setMissionStats(abortedStats);
        setDeathDetails(null);

        const newStats = aggregateStats(gameState.stats, abortedStats, false, true);

        setGameState(prev => ({
            ...prev,
            stats: newStats,
            screen: GameScreen.RECAP
        }));
    };

    const handleTeleportJump = (x: number, z: number) => {
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

    const handleStartMission = () => {
        setGameState(prev => ({ ...prev, screen: GameScreen.MISSION }));
        // Reset mission state variables
        setHudState({});
        setCurrentMapItems([]);
        setActiveClue(null);
        setIsPaused(false);
        setIsMapOpen(false);
    };

    const handleResetGame = () => {
        localStorage.removeItem('slaughterNationSave_v10');
        window.location.reload();
    };

    const cursorHidden = gameState.screen === GameScreen.MISSION && !isPaused && !isMapOpen && !activeClue && !showTeleportMenu && !isDialogueOpen && !deathDetails;

    return (
        <div className="relative w-full h-full overflow-hidden bg-black select-none cursor-none">
            <CustomCursor hidden={cursorHidden} />

            {gameState.showFps && <FPSDisplay fps={fps} />}

            {gameState.screen === GameScreen.CAMP && (
                <Camp
                    stats={gameState.stats}
                    currentLoadout={gameState.loadout}
                    weaponLevels={gameState.weaponLevels}
                    currentMap={gameState.currentMap}
                    familyMembersFound={gameState.familyMembersFound}
                    bossesDefeated={gameState.bossesDefeated}
                    debugMode={gameState.debugMode}
                    showFps={gameState.showFps}
                    onSaveStats={handleSaveStats}
                    onSaveLoadout={handleSaveLoadout}
                    onSelectMap={handleSelectMap}
                    onStartMission={handleStartMission}
                    onToggleDebug={(val) => setGameState(prev => ({ ...prev, debugMode: val }))}
                    onToggleFps={(val) => setGameState(prev => ({ ...prev, showFps: val }))}
                    isMapLoaded={true}
                    onResetGame={handleResetGame}
                    onFPSUpdate={handleFPSUpdate}
                    onSaveGraphics={handleSaveGraphics}
                    initialGraphics={gameState.graphics}
                />
            )}

            {gameState.screen === GameScreen.MISSION && (
                <>
                    <GameCanvas
                        ref={gameCanvasRef}
                        stats={gameState.stats}
                        loadout={gameState.loadout}
                        weaponLevels={gameState.weaponLevels}
                        currentMap={gameState.currentMap}
                        debugMode={gameState.debugMode}
                        isRunning={!isPaused && !isMapOpen && !showTeleportMenu && !activeClue}
                        isPaused={isPaused || isMapOpen || showTeleportMenu || !!activeClue}
                        disableInput={!!activeClue}

                        onUpdateHUD={handleUpdateHUD}
                        onDie={handleDie}
                        onMissionEnded={handleMissionEnded}
                        onPauseToggle={setIsPaused}
                        triggerEndMission={false}

                        familyAlreadyRescued={gameState.familyMembersFound.includes(gameState.currentMap)}
                        bossPermanentlyDefeated={gameState.bossesDefeated.includes(gameState.currentMap)}

                        onLevelLoaded={() => { }}
                        startAtCheckpoint={false}
                        onCheckpointReached={() => { }}

                        teleportTarget={teleportTarget}
                        onClueFound={setActiveClue}
                        isClueOpen={!!activeClue}
                        onDialogueStateChange={setIsDialogueOpen}
                        onMapInit={setCurrentMapItems}
                        onFPSUpdate={handleFPSUpdate}
                        initialGraphics={gameState.graphics}
                    />

                    {/* Hide HUD if hudState.isHidden (triggered during Boss Intro) */}
                    {!isMapOpen && !showTeleportMenu && !activeClue && !hudState.isHidden && (
                        <GameHUD
                            {...hudState}
                            loadout={gameState.loadout}
                            weaponLevels={gameState.weaponLevels}
                            debugMode={gameState.debugMode}
                        />
                    )}

                    {isPaused && !isMapOpen && !showTeleportMenu && !isSettingsOpen && (
                        <ScreenPause
                            onResume={() => { setIsPaused(false); gameCanvasRef.current?.requestPointerLock(); }}
                            onAbort={handleAbortMission}
                            onOpenMap={() => { setIsMapOpen(true); soundManager.playUiConfirm(); }}
                            onOpenSettings={() => setIsSettingsOpen(true)}
                        />
                    )}

                    {isSettingsOpen && (
                        <ScreenSettings
                            onClose={() => setIsSettingsOpen(false)}
                            showFps={gameState.showFps}
                            onToggleFps={(val) => setGameState(prev => ({ ...prev, showFps: val }))}
                            graphics={gameState.graphics}
                            onUpdateGraphics={handleSaveGraphics}
                        />
                    )}

                    {activeClue && (
                        <ScreenClue clue={activeClue} onClose={() => { setActiveClue(null); setIsPaused(false); gameCanvasRef.current?.requestPointerLock(); }} />
                    )}
                </>
            )}

            {/* Map Screen (Overlay for Mission) */}
            {isMapOpen && (
                <ScreenMap
                    items={currentMapItems}
                    playerPos={hudState.playerPos}
                    familyPos={hudState.familyPos || undefined}
                    bossPos={hudState.bossPos || undefined}
                    onClose={() => { setIsMapOpen(false); setIsPaused(false); gameCanvasRef.current?.requestPointerLock(); }}
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
                    stats={missionStats || undefined}
                    onProceed={() => {
                        soundManager.playUiConfirm();
                        setGameState(prev => ({ ...prev, screen: GameScreen.RECAP }));
                    }}
                />
            )}

            {gameState.screen === GameScreen.RECAP && missionStats && (
                <ScreenSectorReport
                    stats={missionStats}
                    deathDetails={deathDetails}
                    currentMap={gameState.currentMap}
                    onReturnCamp={() => {
                        setGameState(prev => ({ ...prev, screen: GameScreen.CAMP }));
                        soundManager.playUiConfirm();
                    }}
                    onRetry={() => {
                        setGameState(prev => ({ ...prev, screen: GameScreen.MISSION }));
                        setMissionStats(null);
                        setDeathDetails(null);
                        setHudState({});
                        setCurrentMapItems([]);
                        setActiveClue(null);
                        setIsPaused(false);
                        soundManager.playUiConfirm();
                    }}
                />
            )}
        </div>
    );
};

export default App;
