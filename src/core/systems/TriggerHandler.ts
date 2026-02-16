import * as THREE from 'three';
import { SectorTrigger, TriggerAction } from '../../types';
import { soundManager } from '../../utils/sound';
import { PLAYER_CHARACTER } from '../../content/constants';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
let _localX = 0;
let _localZ = 0;
let _tx = 0;
let _tz = 0;
let _sin = 0;
let _cos = 0;

export const TriggerHandler = {
    /**
     * Checks all sector triggers against player position.
     * Optimized for 60fps execution with minimal memory pressure.
     */
    checkTriggers: (
        playerPos: THREE.Vector3,
        state: any,
        now: number,
        callbacks: {
            spawnBubble: (text: string) => void;
            removeVisual: (id: string) => void;
            onClueFound: (clue: SectorTrigger) => void;
            onTrigger: (type: string, duration: number) => void;
            onAction: (action: TriggerAction) => void;
            collectedCluesRef: any;
            t: (key: string) => string;
        }
    ) => {
        const triggers = state.triggers;
        if (!triggers) return;

        for (let i = 0; i < triggers.length; i++) {
            const trig = triggers[i];

            // 1. OPTIMIZATION: Skip if one-shot and finished (and not resetOnExit)
            if (trig.triggered && !trig.resetOnExit && (!trig.repeatInterval || trig.repeatInterval <= 0)) {
                continue;
            }

            let isInside = false;

            // 2. COLLISION CHECK
            if (trig.size) {
                // --- BOX TRIGGER (Rotated OBB) ---
                _localX = playerPos.x - trig.position.x;
                _localZ = playerPos.z - trig.position.z;

                if (trig.rotation) {
                    _sin = Math.sin(-trig.rotation);
                    _cos = Math.cos(-trig.rotation);
                    _tx = _localX * _cos - _localZ * _sin;
                    _tz = _localX * _sin + _localZ * _cos;
                } else {
                    _tx = _localX;
                    _tz = _localZ;
                }

                if (Math.abs(_tx) <= trig.size.width * 0.5 && Math.abs(_tz) <= trig.size.depth * 0.5) {
                    isInside = true;
                }
            } else if (trig.radius) {
                // --- CIRCLE TRIGGER (Fast Squared Distance) ---
                const dx = playerPos.x - trig.position.x;
                const dz = playerPos.z - trig.position.z;
                if ((dx * dx + dz * dz) < (trig.radius * trig.radius)) {
                    isInside = true;
                }
            }

            // 3. STATE MANAGEMENT
            if (trig.triggered) {
                // RESET ON EXIT
                if (trig.resetOnExit && !isInside) {
                    trig.triggered = false;
                    continue;
                }

                // REPEAT INTERVAL
                if (trig.repeatInterval && trig.repeatInterval > 0) {
                    if (trig.lastTriggerTime && now - trig.lastTriggerTime > trig.repeatInterval) {
                        trig.triggered = false; // Ready to fire again
                    } else {
                        continue; // Cooldown
                    }
                }
                // ONE-SHOT (but still inside and NO resetOnExit/repeat)
                else if (!trig.resetOnExit) {
                    continue;
                }
                // If resetOnExit=true AND isInside=true, we fall through to Execute actions (Continuous Mode)
            }

            // 4. EXECUTION
            if (isInside) {
                // Determine if we should set triggered (First entry)
                const isFirstEntry = !trig.triggered;

                // Update State
                if (isFirstEntry) {
                    trig.triggered = true;
                    trig.lastTriggerTime = now;
                }

                // Fire Actions
                if (trig.actions && trig.actions.length > 0) {
                    for (let j = 0; j < trig.actions.length; j++) {
                        const action = trig.actions[j];

                        // Execute if:
                        // A) First Entry
                        // B) It's a continuous trigger (resetOnExit) AND the action type implies UI/State (e.g. OPEN_UI interaction refresh)
                        if (isFirstEntry || (trig.resetOnExit && action.type === 'OPEN_UI')) {
                            callbacks.onAction(action);
                        }
                    }
                }

                // Fire Narrative (Only on First Entry to avoid spam)
                if (isFirstEntry && trig.content) {
                    const translatedText = callbacks.t(trig.content);
                    callbacks.spawnBubble(translatedText);

                    // Dynamic duration based on readability speed
                    const duration = 2000 + translatedText.length * 50;

                    if (trig.type === 'SPEECH') {
                        soundManager.playVoice(PLAYER_CHARACTER.name);
                        callbacks.onTrigger('SPEECH', duration);
                    } else {
                        soundManager.playUiHover();
                        callbacks.onTrigger(trig.type || 'INFO', duration);
                    }
                }
            }
        }
    }
}