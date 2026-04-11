import { useEffect, useRef } from 'react';
import { UiSounds } from '../utils/audio/AudioLib';
import { OverlayType } from '../App';
import { GameScreen } from '../game/session/SessionTypes';;
import { HudStore } from '../store/HudStore';

interface UIActions {
    setActiveOverlay: (val: OverlayType | null) => void;
    setTeleportInitialCoords: (val: any) => void;
    requestPointerLock?: () => void;
    onCollectibleClose?: () => void;
}

/**
 * High-performance Global Input Hook.
 * Utilizes a Bind-Once listener pattern with Ref-syncing to eliminate 
 * GC overhead and prevent listener thrashing during gameplay.
 */
export const useGlobalInput = (
    activeOverlay: OverlayType | null,
    state: { screen: GameScreen },
    actions: UIActions
) => {
    // --- PERFORMANCE: Zero-GC Event Listener Pattern ---
    // Mutable refs allow the event listener to access the latest state 
    // without requiring the listener itself to be re-registered.
    const stateRef = useRef(state.screen);
    const overlayRef = useRef<OverlayType | null>(activeOverlay);
    const actionsRef = useRef(actions);
    const lastEscTimeRef = useRef<number>(0);

    // Sync state to refs quietly without triggering re-renders
    useEffect(() => {
        stateRef.current = state.screen;
        overlayRef.current = activeOverlay;
        actionsRef.current = actions;
    }, [state.screen, activeOverlay, actions]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // high-resolution monotonic timer for input throttling
            const now = performance.now();
            const current = overlayRef.current;
            const screen = stateRef.current;
            const acts = actionsRef.current;

            // ESC Logic
            if (e.key === 'Escape') {
                // Throttle ESC to prevent double-toggle on rapid presses
                if (now - lastEscTimeRef.current < 150) return;
                lastEscTimeRef.current = now;

                // Disable ESC during critical cutscenes
                if (current === 'DIALOGUE' || current === 'INTRO') return;

                e.preventDefault();
                e.stopPropagation();

                // Read death state synchronously from the store to bypass React cycle
                const isDead = HudStore.getState().isDead;

                if (current === 'TELEPORT') {
                    acts.setTeleportInitialCoords(null);
                    acts.setActiveOverlay('MAP');
                    UiSounds.playClick();
                } else if (current === 'RESET_CONFIRM') {
                    acts.setActiveOverlay('SETTINGS');
                    UiSounds.playClick();
                } else if (current === 'SETTINGS' || current === 'ADVENTURE_LOG') {
                    if (screen === GameScreen.CAMP) {
                        acts.setActiveOverlay(null);
                    } else {
                        acts.setActiveOverlay('PAUSE');
                    }
                    UiSounds.playClick();
                } else if (current === 'PAUSE' || current === 'MAP' || current === 'COLLECTIBLE' || (current && current.startsWith('STATION_'))) {
                    if (current === 'COLLECTIBLE' && acts.onCollectibleClose) {
                        acts.onCollectibleClose();
                    } else {
                        acts.setActiveOverlay(null);
                        acts.requestPointerLock?.();
                    }
                    UiSounds.playClick();
                } else if (!current && !isDead) {
                    if (screen === GameScreen.CAMP) {
                        acts.setActiveOverlay('SETTINGS');
                    } else {
                        acts.setActiveOverlay('PAUSE');
                        // Always release pointer lock when entering menu
                        if (document.pointerLockElement) document.exitPointerLock();
                    }
                    UiSounds.playClick();
                }
            }
            // Map Logic (M)
            // Manual character check avoids .toLowerCase() heap allocation
            else if (e.key === 'm' || e.key === 'M') {
                const isDead = HudStore.getState().isDead;
                if (!current && !isDead) {
                    acts.setActiveOverlay('MAP');
                    if (document.pointerLockElement) document.exitPointerLock();
                    UiSounds.playConfirm();
                } else if (current === 'MAP') {
                    acts.setActiveOverlay(null);
                    acts.requestPointerLock?.();
                    UiSounds.playClick();
                }
            }
        };

        // Standard capture: true ensures we catch input before other UI elements consume it.
        window.addEventListener('keydown', handleKeyDown, { capture: true });

        return () => {
            window.removeEventListener('keydown', handleKeyDown, { capture: true });
        };
    }, []); // Bound exactly once on mount
};