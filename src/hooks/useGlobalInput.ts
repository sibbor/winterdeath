import { useEffect, useRef } from 'react';
import { soundManager } from '../utils/sound';
import { OverlayType } from '../App';
import { GameScreen } from '../types';

interface UIActions {
    setActiveOverlay: (val: OverlayType | null) => void;
    setTeleportInitialCoords: (val: any) => void;
    requestPointerLock?: () => void;
    onCollectibleClose?: () => void;
}

export const useGlobalInput = (
    activeOverlay: OverlayType | null,
    state: { hp: number, screen: GameScreen },
    actions: UIActions
) => {
    // Stable ref to prevent listener re-registration on every toggle.
    const overlayRef = useRef<OverlayType | null>(activeOverlay);
    overlayRef.current = activeOverlay;
    const lastEscTimeRef = useRef<number>(0);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const now = Date.now();
            const current = overlayRef.current;

            // ESC Logic
            if (e.key === 'Escape') {
                if (now - lastEscTimeRef.current < 150) return;
                lastEscTimeRef.current = now;

                if (current === 'DIALOGUE' || current === 'INTRO') return;

                e.preventDefault();
                e.stopPropagation();

                if (current === 'TELEPORT') {
                    actions.setTeleportInitialCoords(null);
                    actions.setActiveOverlay('MAP');
                    soundManager.playUiClick();
                } else if (current === 'RESET_CONFIRM') {
                    actions.setActiveOverlay('SETTINGS');
                    soundManager.playUiClick();
                } else if (current === 'SETTINGS' || current === 'ADVENTURE_LOG') {
                    if (state.screen === GameScreen.CAMP) {
                        actions.setActiveOverlay(null);
                    } else {
                        actions.setActiveOverlay('PAUSE');
                    }
                    soundManager.playUiClick();
                } else if (current === 'PAUSE' || current === 'MAP' || current === 'COLLECTIBLE' || current?.startsWith('STATION_')) {
                    if (current === 'COLLECTIBLE' && actions.onCollectibleClose) {
                        actions.onCollectibleClose();
                    } else {
                        actions.setActiveOverlay(null);
                        actions.requestPointerLock?.();
                    }
                    soundManager.playUiClick();
                } else if (!current && state.hp > 0) {
                    if (state.screen === GameScreen.CAMP) {
                        actions.setActiveOverlay('SETTINGS');
                    } else {
                        actions.setActiveOverlay('PAUSE');
                        if (document.pointerLockElement) document.exitPointerLock();
                    }
                    soundManager.playUiClick();
                }
            } 
            // Map Logic (M)
            else if (e.key.toLowerCase() === 'm') {
                if (!current && state.hp > 0) {
                    actions.setActiveOverlay('MAP');
                    if (document.pointerLockElement) document.exitPointerLock();
                    soundManager.playUiConfirm();
                } else if (current === 'MAP') {
                    actions.setActiveOverlay(null);
                    actions.requestPointerLock?.();
                    soundManager.playUiClick();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown, { capture: true });
        return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
    }, [actions, state.hp, state.screen]);
};