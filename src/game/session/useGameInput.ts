import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GameCanvasProps } from '../../game/session/SessionTypes';
import { soundManager } from '../../utils/audio/SoundManager';
import { FLASHLIGHT } from '../../content/constants';

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

            // Only trap arrow keys in debug mode
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
                if (!props.debugMode) return;
                e.preventDefault();
            }

            const engine = refs.engineRef.current;
            if (!engine) return;

            switch (e.key) {
                case 'ArrowLeft': engine.camera.adjustAngle(Math.PI / 4); break;
                case 'ArrowRight': engine.camera.adjustAngle(-Math.PI / 4); break;
                case 'ArrowUp': engine.camera.adjustPitch(2.0); break;
                case 'ArrowDown': engine.camera.adjustPitch(-2.0); break;
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [props.isMobileDevice, props.isPaused, props.debugMode, refs.engineRef]);

    // 2. Gameplay actions (Flashlight, Rolling)
    useEffect(() => {
        const isInputEnabled = !props.isPaused &&
            props.isRunning &&
            !refs.cinematicRef.current.active &&
            !p.isClueOpen &&
            !p.disableInput &&
            !refs.stateRef.current?.isDead &&
            !refs.bossIntroTimerRef.current;

        const handleKeyDown = (e: KeyboardEvent) => {
            const state = refs.stateRef.current;
            if (!state) return;

            // Escape is handled by Global Hook in App.tsx
            // We just return here for Escape to avoid double-processing
            if (e.key === 'Escape') {
                return;
            }

            if (!isInputEnabled) return;

            const key = e.key.toLowerCase();

            // Flashlight Toggle
            if (key === 'f') {
                if (state.flashlightOn === undefined) state.flashlightOn = true;
                state.flashlightOn = !state.flashlightOn;

                const flashlight = refs.flashlightRef.current as THREE.SpotLight;
                if (flashlight) {
                    const intensity = state.activeVehicle ? FLASHLIGHT.intensity * 2 : FLASHLIGHT.intensity;
                    flashlight.intensity = state.flashlightOn ? intensity : 0;
                }
                soundManager.playUiClick();
            }

            if (state.isDead) return;
            state.lastActionTime = performance.now();
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (!isInputEnabled) return;
            const key = e.key;

            const state = refs.stateRef.current;
            const engine = refs.engineRef.current;
            if (!state || !engine) return;

            if (state.isDead) return;

            // Rolling (Space)
            if (key === ' ') {
                const inp = engine.input.state;
                if (!state.isRushing && !state.isRolling && state.spaceDepressed) {
                    if (state.stamina >= 5) {
                        state.stamina -= 5;
                        state.lastStaminaUseTime = performance.now();
                        state.isRolling = true;
                        state.rollStartTime = performance.now();
                        state.invulnerableUntil = performance.now() + 400;

                        let dx = 0; let dz = 0;
                        if (inp.w) dz -= 1;
                        if (inp.s) dz += 1;
                        if (inp.a) dx -= 1;
                        if (inp.d) dx += 1;

                        if (dx !== 0 || dz !== 0) {
                            state.rollDir.set(dx, 0, dz).normalize();
                        } else if (refs.playerGroupRef.current) {
                            state.rollDir.copy(new THREE.Vector3(0, 0, 1).applyQuaternion(refs.playerGroupRef.current.quaternion).normalize());
                        }

                        soundManager.playDash();
                    }
                }
                state.spaceDepressed = false;
                state.isRushing = false;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [
        props.isPaused, props.isRunning, props.isCollectibleOpen, p.disableInput,
        props.onPauseToggle, p.onClueClose, refs
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
            if (!document.pointerLockElement && props.isRunning && !props.isPaused) {

                // Ignore if we JUST unpaused (lock takes a frame or two to acquire)
                if (performance.now() - unpauseTimeRef.current < 500) {
                    return;
                }

                const isExpected = refs.cinematicRef.current.active || refs.bossIntroTimerRef.current || refs.stateRef.current?.isDead;
                if (!isExpected) {
                    props.onPauseToggle(true);
                }
            }
        };

        document.addEventListener('pointerlockchange', handleLockChange);
        return () => document.removeEventListener('pointerlockchange', handleLockChange);
    }, [props.isRunning, props.isPaused, props.onPauseToggle, refs]);

};