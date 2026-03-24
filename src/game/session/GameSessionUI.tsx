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

    const state = refs.stateRef.current || {} as any;

    // Zero-GC Callbacks to prevent re-allocating inline functions on every render
    const handleContainerClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (uiState.cinematicActive && uiState.currentLine) {
            e.stopPropagation();
            callbacks.triggerCinematicNext();
            return;
        }
        if (gameProps.isRunning && refs.containerRef.current && uiState.deathPhase === 'NONE') {
            callbacks.requestPointerLock();
        }
    }, [uiState.cinematicActive, uiState.currentLine, uiState.deathPhase, gameProps.isRunning, callbacks, refs]);

    const handlePauseTouch = useCallback(() => {
        callbacks.onPauseToggle(true);
    }, [callbacks]);

    const handleOpenMapTouch = useCallback(() => {
        callbacks.openMap();
    }, [callbacks]);

    return (
        <div className="absolute inset-0 w-full h-full pointer-events-none">
            <style>{STATIC_STYLES}</style>

            {/* The main click-catcher for pointer lock / cinematic advance (Disabled on mobile to avoid blocking joysticks) */}
            {!gameProps.isMobileDevice && (
                <div
                    ref={refs.containerRef}
                    className="absolute inset-0 pointer-events-auto"
                    onClick={handleContainerClick}
                />
            )}

            {/* Mobile Touch Controls */}
            {gameProps.isMobileDevice && gameProps.isRunning && !gameProps.isPaused && !uiState.cinematicActive && !uiState.bossIntroActive && refs.engineRef.current && (
                <TouchController
                    inputState={refs.engineRef.current.input.state}
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