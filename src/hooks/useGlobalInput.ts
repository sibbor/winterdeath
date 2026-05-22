import { useEffect, useRef } from 'react';
import { UiSounds } from '../utils/audio/AudioLib';
import { OverlayType } from '../components/ui/hud/HudTypes';
import { GameScreen } from '../types/SessionTypes';
import { HudStore } from '../store/HudStore';
import { MetaActionId } from '../systems/ui/UIEventBridge';

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
    const previousOverlayRef = useRef<OverlayType | null>(OverlayType.NONE);
    const actionsRef = useRef(actions);
    const lastEscTimeRef = useRef<number>(0);

    // Sync state to refs quietly without triggering re-renders
    useEffect(() => {
        if (overlayRef.current !== activeOverlay) {
            previousOverlayRef.current = overlayRef.current;
        }
        stateRef.current = state.screen;
        overlayRef.current = activeOverlay;
        actionsRef.current = actions;
    }, [state.screen, activeOverlay, actions]);

    useEffect(() => {
        let lastProcessedTimestamp = 0;

        const handleSignal = (signal: MetaActionId) => {
            const current = overlayRef.current;
            const screen = stateRef.current;
            const acts = actionsRef.current;
            const isDead = HudStore.getState().isDead;

            // 1. BACK / ESCAPE Signal
            if (signal === MetaActionId.NAV_BACK) {
                if (current === 'DIALOGUE' || current === 'INTRO') return;

                if (current === OverlayType.TELEPORT) {
                    acts.setTeleportInitialCoords(null);
                    acts.setActiveOverlay(OverlayType.MAP);
                    UiSounds.playClick();
                } else if (current === OverlayType.RESET_CONFIRM) {
                    acts.setActiveOverlay(OverlayType.SETTINGS);
                    UiSounds.playClick();
                } else if (current === OverlayType.SETTINGS || current === OverlayType.ADVENTURE_LOG) {
                    if (screen === GameScreen.CAMP) {
                        acts.setActiveOverlay(OverlayType.NONE);
                    } else {
                        // Return to PAUSE only if we actually came from PAUSE, otherwise return to GAME
                        if (previousOverlayRef.current === OverlayType.PAUSE) {
                            acts.setActiveOverlay(OverlayType.PAUSE);
                        } else {
                            acts.setActiveOverlay(OverlayType.NONE);
                            acts.requestPointerLock?.();
                        }
                    }
                    UiSounds.playClick();
                } else if (
                    current === OverlayType.PAUSE ||
                    current === OverlayType.MAP ||
                    current === OverlayType.COLLECTIBLE ||
                    (current && current >= OverlayType.STATION_ARMORY && current <= OverlayType.STATION_STATISTICS)
                ) {
                    if (current === OverlayType.COLLECTIBLE && acts.onCollectibleClose) {
                        acts.onCollectibleClose();
                    } else {
                        acts.setActiveOverlay(OverlayType.NONE);
                        acts.requestPointerLock?.();
                    }
                    UiSounds.playClick();
                } else if (!current && !isDead) {
                    if (screen === GameScreen.CAMP) {
                        acts.setActiveOverlay(OverlayType.SETTINGS);
                    } else {
                        acts.setActiveOverlay(OverlayType.PAUSE);
                        if (document.pointerLockElement) document.exitPointerLock();
                    }
                    UiSounds.playClick();
                }
            }
            // 2. MAP Signal
            else if (signal === MetaActionId.NAV_MAP) {
                if (!current && !isDead) {
                    acts.setActiveOverlay(OverlayType.MAP);
                    if (document.pointerLockElement) document.exitPointerLock();
                    UiSounds.playConfirm();
                } else if (current === OverlayType.MAP) {
                    acts.setActiveOverlay(OverlayType.NONE);
                    acts.requestPointerLock?.();
                    UiSounds.playClick();
                }
            }
            // 3. LOG Signal
            else if (signal === MetaActionId.NAV_LOG) {
                if (!current && !isDead) {
                    acts.setActiveOverlay(OverlayType.ADVENTURE_LOG);
                    if (document.pointerLockElement) document.exitPointerLock();
                    UiSounds.playConfirm();
                }
            }
        };

        // --- SMI SIGNAL POLLING ---
        // We subscribe to the HudStore which is updated by the Engine.
        // This eliminates the need for 'keydown' listeners on the window.
        const unsubscribe = HudStore.subscribe((state) => {
            if (state.metaSignalTimestamp > lastProcessedTimestamp) {
                lastProcessedTimestamp = state.metaSignalTimestamp;
                handleSignal(state.lastMetaSignal);
            }
        });

        return unsubscribe;
    }, []);
};
