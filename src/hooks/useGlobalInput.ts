import { useEffect, useRef } from 'react';
import { soundManager } from '../utils/SoundManager';
import { OverlayType } from '../App';
import { GameScreen } from '../types';
import { HudStore } from '../core/systems/HudStore';

interface UIActions {
    setActiveOverlay: (val: OverlayType | null) => void;
    setTeleportInitialCoords: (val: any) => void;
    requestPointerLock?: () => void;
    onCollectibleClose?: () => void;
}

export const useGlobalInput = (
    activeOverlay: OverlayType | null,
    state: { screen: GameScreen },
    actions: UIActions
) => {
    // Stable ref to prevent listener re-registration on every toggle.
    const overlayRef = useRef<OverlayType | null>(activeOverlay);
    const lastEscTimeRef = useRef<number>(0);

    // Safely update the ref without triggering re-renders or mutating during render phase
    useEffect(() => {
        overlayRef.current = activeOverlay;
    }, [activeOverlay]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const now = Date.now();
            const current = overlayRef.current;

            // Read death state synchronously from the store to avoid dependency triggers
            const isDead = HudStore.getData().isDead;

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
                } else if (!current && !isDead) {
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
                if (!current && !isDead) {
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
    }, [actions, state.screen]);
};