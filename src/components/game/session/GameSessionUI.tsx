import React from 'react';
import { GameCanvasProps } from '../../../types';
import { UIState } from './useGameSessionState';

import TouchController from '../../ui/TouchController';
import CinematicBubble from '../CinematicBubble';
import GameUI from '../GameUI';
import { t } from '../../../utils/i18n';
import { BOSSES } from '../../../content/constants';
import DebugDisplay from '../../ui/core/DebugDisplay';
import DamageVignette from '../../ui/hud/DamageVignette';
import { HEALTH_CRITICAL_THRESHOLD } from '../../../content/constants';

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

export const GameSessionUI: React.FC<GameSessionUIProps> = ({ refs, uiState, gameProps, callbacks }) => {

    const state = refs.stateRef.current || {} as any;

    return (
        <div className="absolute inset-0 w-full h-full">
            <div
                ref={refs.containerRef}
                className={`absolute inset-0`}
                onClick={(e) => {
                    if (uiState.cinematicActive && uiState.currentLine) {
                        e.stopPropagation();
                        callbacks.triggerCinematicNext();
                        return;
                    }
                    if (gameProps.isRunning && refs.containerRef.current && uiState.deathPhase === 'NONE') {
                        callbacks.requestPointerLock();
                    }
                }}
            />

            {gameProps.isMobileDevice && gameProps.isRunning && !gameProps.isPaused && !uiState.cinematicActive && !uiState.bossIntroActive && refs.engineRef.current && (
                <TouchController
                    inputState={refs.engineRef.current.input.state}
                    onPause={() => callbacks.onPauseToggle(true)}
                    onOpenMap={() => callbacks.openMap()}
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
                text={uiState.currentLine ? t(uiState.currentLine.text) : ""}
                speakerName={uiState.currentLine ? uiState.currentLine.speaker : ""}
                isVisible={uiState.cinematicActive && uiState.currentLine !== null}
                isMobileDevice={gameProps.isMobileDevice}
            />

            <DamageVignette 
                hp={state.hp || 0} 
                maxHp={state.maxHp || 100} 
                threshold={HEALTH_CRITICAL_THRESHOLD} 
                isDead={uiState.deathPhase !== 'NONE'}
            />

            {!uiState.isSectorLoading && !uiState.cinematicActive && !uiState.forceHideHUD && (
                <GameUI
                    onCloseClue={() => { }}
                    isMobileDevice={gameProps.isMobileDevice}
                    onInteract={callbacks.onInteract}
                />
            )}


            /** TODO: add UI support for zombie waves */
            {uiState.zombieWaveActive && (
                <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none">
                    <div className="relative text-center">
                        <h2 className="text-white text-6xl md:text-8xl font-black italic tracking-tighter uppercase hud-text-glow"
                            style={{
                                animation: 'slam 0.4s cubic-bezier(0.1, 0.9, 0.2, 1) forwards',
                                textShadow: '0 0 40px rgba(0,0,0,1)',
                                color: '#ff3333'
                            }}>
                            {t('zombie_wave')}
                        </h2>
                    </div>
                </div>
            )}

            <style>{`
            @keyframes slam {
                0% { transform: scale(2); opacity: 0; }
                70% { transform: scale(1); opacity: 1; }
                100% { transform: scale(1); opacity: 1; }
            }
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
            @keyframes glitch 
            {
                0% { transform: translate(0) }
                20% { transform: translate(-2px, 2px) }
                40% { transform: translate(-2px, -2px) }
                60% { transform: translate(2px, 2px) }
                80% { transform: translate(2px, -2px) }
                100% { transform: translate(0) }
            }
            `}</style>
        </div>
    );
};

export default GameSessionUI;