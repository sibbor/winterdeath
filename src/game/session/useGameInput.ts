import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GameCanvasProps } from '../../types/CanvasTypes';
import { UiSounds } from '../../utils/audio/AudioLib';
import { FLASHLIGHT } from '../../content/constants';
import { PlayerStatusFlags } from '../../types/CareerStats';
import { InputAction, INPUT_KEY_MAP } from '../../core/engine/InputManager';

export const useGameInput = (
    refs: any,
    props: GameCanvasProps,
    setUiState: any
) => {
    const p = props as any;

    // 1. Camera Directional Keys (Arrow keys)
    useEffect(() => {
        if (props.isMobileDevice) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (props.isPaused) return;

            const action = INPUT_KEY_MAP[e.key];
            const isArrowKey = action === InputAction.UP || action === InputAction.DOWN || action === InputAction.LEFT || action === InputAction.RIGHT;

            // Only trap directional keys in debug mode for camera control
            if (isArrowKey) {
                if (!props.gameState.settings.debugMode) return;
                e.preventDefault();
            }

            const engine = refs.engineRef.current;
            if (!engine) return;

            switch (action) {
                case InputAction.ARROW_LEFT: engine.camera.adjustAngle(Math.PI / 4); break;
                case InputAction.ARROW_RIGHT: engine.camera.adjustAngle(-Math.PI / 4); break;
                case InputAction.ARROW_UP: engine.camera.adjustPitch(2.0); break;
                case InputAction.ARROW_DOWN: engine.camera.adjustPitch(-2.0); break;
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [props.isMobileDevice, props.isPaused, props.gameState.settings.debugMode, refs.engineRef]);

    // 2. Gameplay actions (Flashlight, Rolling)
    useEffect(() => {
        const isInputEnabled = !props.isPaused &&
            props.isGameRunning &&
            !refs.cinematicRef.current.active &&
            !p.isClueOpen &&
            !p.disableInput &&
            !(refs.stateRef.current?.combat?.statusFlags & PlayerStatusFlags.DEAD) &&
            !refs.bossIntroTimerRef.current;

        const handleKeyDown = (e: KeyboardEvent) => {
            const state = refs.stateRef.current;
            if (!state) return;

            const action = INPUT_KEY_MAP[e.key];

            // Escape is handled by Global Hook in App.tsx
            // We just return here for Escape to avoid double-processing
            if (action === InputAction.ESCAPE) {
                return;
            }


            if (!isInputEnabled) return;

            if (state.combat.statusFlags & PlayerStatusFlags.DEAD) return;
            state.player.lastActionTime = state.simTime;
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (!isInputEnabled) return;
            const action = INPUT_KEY_MAP[e.key];

            const state = refs.stateRef.current;
            const engine = refs.engineRef.current;
            if (!state || !engine) return;

            if (state.combat.statusFlags & PlayerStatusFlags.DEAD) return;

            // Dodging / Rushing cleanup (Movement handling is moved to PlayerMovementSystem)
            if (action === InputAction.DODGE) {
                // Space released
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [
        props.isPaused, props.isGameRunning, props.isCollectibleOpen, p.disableInput,
        props.onPauseToggle, p.onClueClose, refs, props.isMobileDevice, p.isClueOpen, refs.cinematicRef, refs.stateRef, refs.bossIntroTimerRef
    ]);

    // 3. Pointer Lock tracking (Zero-GC, auto-pause if focus lost)
    const unpauseTimeRef = useRef<number>(0);
    const wasPausedRef = useRef<boolean>(props.isPaused);

    useEffect(() => {
        if (wasPausedRef.current && !props.isPaused) {
            unpauseTimeRef.current = performance.now();
        }
        wasPausedRef.current = props.isPaused;
    }, [props.isPaused]);

    useEffect(() => {
        const handleLockChange = () => {
            if (!document.pointerLockElement && props.isGameRunning && !props.isPaused) {

                // If an overlay is already active (Map, Adventure Log), ignore the lock loss.
                // This prevents the Pause Menu from opening "behind" or "over" the Map.
                if (p.activeOverlay && p.activeOverlay !== 0) {
                    return;
                }

                // Slightly reduced safety window (500->300ms) for tighter responsiveness
                if (performance.now() - unpauseTimeRef.current < 300) {
                    return;
                }

                // Ignore if CTRL is held (Quick Inspect)
                if (refs.engineRef.current?.input.state.actions[InputAction.CTRL]) {
                    return;
                }

                // Only trigger pause if we are in a state that expects input focus
                const isExpected = refs.cinematicRef.current.active ||
                    refs.bossIntroTimerRef.current ||
                    (refs.stateRef.current?.combat?.statusFlags & PlayerStatusFlags.DEAD);

                if (!isExpected && props.isGameRunning && !props.isPaused) {
                    props.onPauseToggle(true);
                }
            }
        };

        document.addEventListener('pointerlockchange', handleLockChange);
        return () => document.removeEventListener('pointerlockchange', handleLockChange);
    }, [props.isGameRunning, props.isPaused, props.onPauseToggle, refs, p.activeOverlay]);

};
