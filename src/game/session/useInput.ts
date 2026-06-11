import { useEffect, useRef } from 'react';
import { GameCanvasProps } from '../../types/CanvasTypes';
import { PlayerStatusFlags } from '../../types/CareerStats';
import { InputAction, INPUT_KEY_MAP } from '../../core/engine/InputManager';
import { MetaActionId } from '../../systems/ui/UIEventBridge';
import { OverlayType } from '../../components/ui/hud/HudTypes';
import { GameScreen } from '../../types/SessionTypes';
import { HudStore } from '../../store/HudStore';
import { UISounds } from '../../utils/audio/AudioLib';

interface UIActions {
    setActiveOverlay: (val: OverlayType | null) => void;
    setTeleportInitialCoords: (val: any) => void;
    requestPointerLock?: () => void;
    onCollectibleClose?: () => void;
    onPauseToggle: (pause: boolean) => void;
}

const requestPointerLockForCanvas = (refs: any) => {
    const canvas = refs?.engineRef?.current?.renderer?.domElement || document.querySelector('canvas');
    if (canvas) {
        (window as any).inputManager?.requestPointerLock(canvas);
    }
};

/**
 * Consolidated React UI Input Listener interface.
 * Synchronized directly to the central InputManager callback layer on every render pass
 * to eliminate stale closure environments across screen transitions (Camp/Sector).
 */
export const useInput = (
    refs: any,
    props: GameCanvasProps,
    actions: UIActions
) => {
    const p = props as any;

    const unpauseTimeRef = useRef<number>(0);
    const wasPausedRef = useRef<boolean>(props.isPaused);

    const overlayRef = useRef<OverlayType | null>(p.activeOverlay || null);
    const previousOverlayRef = useRef<OverlayType | null>(OverlayType.NONE);
    const screenRef = useRef<GameScreen>(props.gameState.screen);
    const actionsRef = useRef<UIActions>(actions);

    // Dynamic reference flushing executed on every single render layout sequence
    useEffect(() => {
        if (p.activeOverlay !== undefined && overlayRef.current !== p.activeOverlay) {
            previousOverlayRef.current = overlayRef.current;
            overlayRef.current = p.activeOverlay;
        }
        screenRef.current = props.gameState.screen;
        actionsRef.current = actions;

        if (wasPausedRef.current && !props.isPaused) {
            unpauseTimeRef.current = performance.now();
        }
        wasPausedRef.current = props.isPaused;
    });

    // 1. Camera Directional Keys (Debug controls layer layout boundary)
    useEffect(() => {
        if (props.isMobileDevice) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (props.isPaused) return;

            const action = INPUT_KEY_MAP[e.key];
            const isArrowKey = action === InputAction.ARROW_UP || action === InputAction.ARROW_DOWN || action === InputAction.ARROW_LEFT || action === InputAction.ARROW_RIGHT;

            if (isArrowKey) {
                //if (!props.gameState.settings.debugMode) return;
                e.preventDefault();
            }

            const engine = (window as any).inputManager;
            if (!engine || !refs?.engineRef?.current) return;

            const camEngine = refs.engineRef.current;
            switch (action) {
                case InputAction.ARROW_LEFT: camEngine.camera.adjustAngle(Math.PI / 4); break;
                case InputAction.ARROW_RIGHT: camEngine.camera.adjustAngle(-Math.PI / 4); break;
                case InputAction.ARROW_UP: camEngine.camera.adjustPitch(2.0); break;
                case InputAction.ARROW_DOWN: camEngine.camera.adjustPitch(-2.0); break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [props.isMobileDevice, props.isPaused, props.gameState.settings.debugMode, refs]);

    // 2. Direct Event Injection Hook (Re-binds dynamically on state mutations)
    useEffect(() => {
        const handleSignal = (signal: MetaActionId) => {
            if (signal === MetaActionId.NONE) return;

            const current = overlayRef.current;
            const screen = screenRef.current;
            const acts = actionsRef.current;
            const isDead = HudStore.getState().isDead;

            // Highly optimized jump-table evaluation utilizing contiguous SMI mappings
            switch (signal) {
                case MetaActionId.NAV_BACK: {
                    // Lock input if specific modal text rendering loops are present
                    if (current === OverlayType.DIALOGUE || current === OverlayType.INTRO) return;

                    switch (current) {
                        case OverlayType.TELEPORT: {
                            acts.setTeleportInitialCoords(null);
                            acts.setActiveOverlay(OverlayType.MAP);
                            UISounds.playOpenScreen();
                            break;
                        }

                        case OverlayType.RESET_CONFIRM: {
                            acts.setActiveOverlay(OverlayType.SETTINGS);
                            UISounds.playOpenScreen();
                            break;
                        }

                        case OverlayType.SETTINGS: {
                            if (screen === GameScreen.CAMP) {
                                acts.setActiveOverlay(OverlayType.NONE);
                            } else {
                                acts.setActiveOverlay(OverlayType.NONE);
                                requestPointerLockForCanvas(refs);
                            }
                            UISounds.playCloseScreen();
                            break;
                        }

                        // Unified close behavior: Closing menus during active gameplay sectors
                        // now forcefully tells the App-layer to unpause the engine entirely.
                        case OverlayType.PAUSE:
                        case OverlayType.MAP:
                        case OverlayType.ADVENTURE_LOG:
                        case OverlayType.STATION_ARMORY:
                        case OverlayType.STATION_STATISTICS: {
                            // Tell App.tsx to unpause WebGL tracking loops instantly
                            acts.onPauseToggle(false);
                            acts.setActiveOverlay(OverlayType.NONE);

                            // Re-request raw mouse tracking lock on the drawing canvas
                            requestPointerLockForCanvas(refs);

                            UISounds.playCloseScreen();
                            break;
                        }

                        case OverlayType.COLLECTIBLE: {
                            if (acts.onCollectibleClose) {
                                acts.onCollectibleClose();
                            } else {
                                acts.setActiveOverlay(OverlayType.NONE);
                                requestPointerLockForCanvas(refs);
                            }
                            UISounds.playCloseScreen();
                            break;
                        }

                        default: {
                            if (!current && !isDead) {
                                if (screen === GameScreen.CAMP) {
                                    acts.setActiveOverlay(OverlayType.SETTINGS);
                                } else {
                                    acts.onPauseToggle(true);
                                }
                                UISounds.playOpenScreen();
                            }
                            break;
                        }
                    }
                    break;
                }

                case MetaActionId.TOGGLE_PAUSE: {
                    if (!current && !isDead) {
                        if (screen === GameScreen.CAMP) {
                            acts.setActiveOverlay(OverlayType.SETTINGS);
                        } else {
                            acts.onPauseToggle(true);
                        }
                        UISounds.playOpenScreen();
                    }
                    break;
                }

                case MetaActionId.NAV_MAP: {
                    if (!current && !isDead) {
                        if (document.pointerLockElement) {
                            document.exitPointerLock();
                        }
                        setTimeout(() => {
                            acts.setActiveOverlay(OverlayType.MAP);
                            UISounds.playOpenScreen();
                        }, 0);
                    } else if (current === OverlayType.MAP) {
                        acts.setActiveOverlay(OverlayType.NONE);
                        requestPointerLockForCanvas(refs);
                        UISounds.playCloseScreen();
                    }
                    break;
                }

                case MetaActionId.NAV_LOG: {
                    if (!current && !isDead) {
                        if (document.pointerLockElement) {
                            document.exitPointerLock();
                        }
                        setTimeout(() => {
                            acts.setActiveOverlay(OverlayType.ADVENTURE_LOG);
                            UISounds.playOpenScreen();
                        }, 0);
                    } else if (current === OverlayType.ADVENTURE_LOG) {
                        acts.setActiveOverlay(OverlayType.NONE);
                        requestPointerLockForCanvas(refs);
                        UISounds.playCloseScreen();
                    }
                    break;
                }

                default: {
                    break;
                }
            }
        };

        const manager = (window as any).inputManager;
        if (manager) {
            manager.onMetaAction = handleSignal;
        }

        return () => {
            if (manager && manager.onMetaAction === handleSignal) {
                manager.onMetaAction = undefined;
            }
        };
    }, [props.gameState.screen, p.activeOverlay, props.isPaused]);

    // 3. Pointer Lock Auto-Pause Sync Layer
    useEffect(() => {
        const handleLockChange = () => {
            const manager = (window as any).inputManager;
            if (!manager || !props.isGameRunning) return;

            if (!document.pointerLockElement && !props.isPaused) {
                if (overlayRef.current && overlayRef.current !== OverlayType.NONE) return;
                if (performance.now() - unpauseTimeRef.current < 300) return;
                if (manager.state.actions[InputAction.CTRL]) return;

                const isExpectedState = refs?.cinematicRef?.current?.active ||
                    refs?.bossIntroTimerRef?.current ||
                    (refs?.stateRef?.current?.combat?.statusFlags & PlayerStatusFlags.DEAD);

                if (!isExpectedState) {
                    actionsRef.current.onPauseToggle(true);
                }
            }
        };

        document.addEventListener('pointerlockchange', handleLockChange);
        return () => document.removeEventListener('pointerlockchange', handleLockChange);
    }, [props.isGameRunning, props.isPaused, refs]);
};