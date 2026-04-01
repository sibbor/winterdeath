import React, { useCallback, memo } from 'react';
import { GameCanvasProps } from '../../game/session/SessionTypes';
import { UIState } from './useGameSessionState';
import TouchController from '../../components/ui/hud/TouchController';
import CinematicBubble from '../../components/ui/hud/CinematicBubble';
import GameUI from '../../components/ui/hud/GameUI';

// Zero-GC: Static empty function to prevent allocation and VDOM thrashing on every render
const _NOOP = () => { };

// Zero-GC: Static styles extracted from the render loop to prevent VDOM diffing overhead
const STATIC_STYLES = `
@keyframes fadeIn {
    0% { opacity: 0; }
    100% { opacity: 1; }
}
@keyframes narrative-fade {
    0% { opacity: 0; }
    20% { opacity: 1; }
    80% { opacity: 1; }
    100% { opacity: 0; }
}
@keyframes glitch {
    0% { transform: translate(0) }
    20% { transform: translate(-2px, 2px) }
    40% { transform: translate(-2px, -2px) }
    60% { transform: translate(2px, 2px) }
    80% { transform: translate(2px, -2px) }
    100% { transform: translate(0) }
}
`;

interface GameSessionUIProps {
    refs: any;
    uiState: UIState;
    gameProps: GameCanvasProps;
    callbacks: {
        onContinue: () => void;
        onInteract: () => void;
        closeModal: () => void;
        requestPointerLock: () => void;
        triggerCinematicNext: () => void;
        openMap: () => void;
        onPauseToggle: (val: boolean) => void;
        saveArmory: (newLoadout: any, newLevels: any, newSectorState: any) => void;
        spawnEnemies: (newEnemies: any[]) => void;
        saveSkills: (newStats: any, newSectorState: any) => void;
        changeEnvironment: (weather: any, overrides: any) => void;
    }
}

export const GameSessionUI: React.FC<GameSessionUIProps> = memo(({ refs, uiState, gameProps, callbacks }) => {

    // VINTERDÖD FIX: Zero-GC callback that reads from refs instead of reactive state dependencies
    // This function is only allocated ONCE during the component's lifetime.
    const handleContainerClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        // Read directly from the mutable ref to avoid dependency re-renders
        const state = refs.stateRef.current;

        if (state?.cinematicActive && (uiState.currentLine || state.dialogueLine)) {
            e.stopPropagation();
            callbacks.triggerCinematicNext();
            return;
        }
        if (gameProps.isRunning && refs.containerRef.current && state && !state.isDead) {
            callbacks.requestPointerLock();
        }
    }, [gameProps.isRunning, callbacks, refs, uiState.currentLine]);

    const handlePauseTouch = useCallback(() => {
        callbacks.onPauseToggle(true);
    }, [callbacks]);

    const handleOpenMapTouch = useCallback(() => {
        callbacks.openMap();
    }, [callbacks]);

    return (
        <div className="absolute inset-0 w-full h-full pointer-events-none">
            <style>{STATIC_STYLES}</style>

            {/* Engine canvas mount target + desktop pointer-lock click catcher.
                CRITICAL: containerRef must ALWAYS be rendered — even on mobile.
                If this is inside a mobile conditional, containerRef.current is null
                and initSector() never runs (black screen on iPhone). */}
            <div
                ref={refs.containerRef}
                className={`absolute inset-0 ${gameProps.isMobileDevice ? 'pointer-events-none' : 'pointer-events-auto'}`}
                onClick={!gameProps.isMobileDevice ? handleContainerClick : undefined}
            />

            {/* Mobile Touch Controls 
                VINTERDÖD FIX: Removed strict refs.engineRef.current check to prevent React Ref-Render trap. 
                Assuming engine inputs are initialized safely before isRunning is set to true. */}
            {gameProps.isMobileDevice && gameProps.isRunning && !gameProps.isPaused && !uiState.cinematicActive && !uiState.bossIntroActive && (
                <TouchController
                    inputState={refs.engineRef.current?.input?.state || {}}
                    onPause={handlePauseTouch}
                    onOpenMap={handleOpenMapTouch}
                />
            )}

            <div ref={refs.chatOverlayRef} className="absolute inset-0 pointer-events-none overflow-hidden z-50" />

            {/* Cinematic Letterboxing */}
            <div
                className="absolute top-0 left-0 right-0 bg-black z-40 transition-all duration-700 ease-in-out pointer-events-none"
                style={{ height: uiState.cinematicActive ? '12%' : '0%' }}
            />
            <div
                className="absolute bottom-0 left-0 right-0 bg-black z-40 transition-all duration-700 ease-in-out pointer-events-none"
                style={{ height: uiState.cinematicActive ? '12%' : '0%' }}
            />

            <CinematicBubble
                ref={refs.bubbleRef}
                isMobileDevice={gameProps.isMobileDevice}
            />

            {!uiState.isSectorLoading && !uiState.cinematicActive && !uiState.forceHideHUD && (
                <GameUI
                    onCloseClue={_NOOP}
                    isMobileDevice={gameProps.isMobileDevice}
                    onInteract={callbacks.onInteract}
                />
            )}
        </div>
    );
});

export default GameSessionUI;