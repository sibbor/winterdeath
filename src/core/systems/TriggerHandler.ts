import * as THREE from 'three';
import { SectorTrigger, TriggerAction } from '../../types';
import { soundManager } from '../../utils/sound';
import { PLAYER_CHARACTER } from '../../content/constants';
import { RuntimeState } from '../RuntimeState';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
let _dx = 0;
let _dz = 0;
let _distSq = 0;
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
        state: RuntimeState,
        now: number,
        callbacks: {
            spawnBubble: (text: string, duration?: number) => void;
            removeVisual: (id: string) => void;
            onClueDiscovered: (clue: SectorTrigger) => void;
            onPOIdiscovered: (poi: SectorTrigger) => void;
            onTrigger: (type: string, duration: number) => void;
            onAction: (action: TriggerAction) => void;
            collectedCluesRef: any;
            t: (key: string) => string;
        }
    ) => {
        const triggers = state.triggers;
        if (!triggers) return;

        // Wait for GameSession runSetup to finish populating the trigger scratchpad
        if (!callbacks || !callbacks.onAction) return;

        const tLen = triggers.length;
        for (let i = 0; i < tLen; i++) {
            const trig = triggers[i];

            // 1. OPTIMIZATION: Skip if one-shot and finished (and not resetOnExit)
            if (trig.triggered && !trig.resetOnExit && (!trig.repeatInterval || trig.repeatInterval <= 0)) {
                continue;
            }

            let isInside = false;

            // Kalkylera avstånd tidigt (används av både cirklar och broadphase-boxar)
            _dx = playerPos.x - trig.position.x;
            _dz = playerPos.z - trig.position.z;
            _distSq = _dx * _dx + _dz * _dz;

            // 2. COLLISION CHECK
            if (trig.size) {
                // --- BROADPHASE OPTIMIZATION ---
                // Kör endast tung OBB-matematik om vi är tillräckligt nära centrum
                const maxDim = Math.max(trig.size.width, trig.size.depth) * 0.8;
                if (_distSq <= maxDim * maxDim) {

                    // --- BOX TRIGGER (Rotated OBB) ---
                    if (trig.rotation) {
                        _sin = Math.sin(-trig.rotation);
                        _cos = Math.cos(-trig.rotation);
                        _tx = _dx * _cos - _dz * _sin;
                        _tz = _dx * _sin + _dz * _cos;
                    } else {
                        _tx = _dx;
                        _tz = _dz;
                    }

                    if (Math.abs(_tx) <= trig.size.width * 0.5 && Math.abs(_tz) <= trig.size.depth * 0.5) {
                        isInside = true;
                    }
                }
            } else if (trig.radius) {
                // --- CIRCLE TRIGGER (Fast Squared Distance) ---
                if (_distSq < (trig.radius * trig.radius)) {
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
            }

            // 4. EXECUTION
            if (isInside) {
                // Determine if we should set triggered (First entry)
                const isFirstEntry = !trig.triggered;

                // Update State
                if (isFirstEntry) {
                    trig.triggered = true;
                    trig.lastTriggerTime = now;

                    // Log discovery for Adventure Log
                    if (trig.id) {
                        if (trig.type === 'POI') {
                            if (!state.discoveredPOIs) state.discoveredPOIs = [];
                            if (!state.discoveredPOIs.includes(trig.id)) {
                                callbacks.onPOIdiscovered(trig);
                            }
                        } else {
                            // Any THOUGHT/SPEAK/INFO trigger can be a clue if not POI
                            if (!callbacks.collectedCluesRef.current.includes(trig.id)) {
                                callbacks.onClueDiscovered(trig);
                            }
                        }
                    }
                }

                // Fire Actions
                if (trig.actions && trig.actions.length > 0) {
                    const aLen = trig.actions.length;
                    for (let j = 0; j < aLen; j++) {
                        const action = trig.actions[j];

                        if (isFirstEntry || (trig.resetOnExit && action.type === 'OPEN_UI')) {
                            callbacks.onAction(action);
                        }
                    }
                }

                // Fire Narrative (Only on First Entry to avoid spam)
                if (isFirstEntry && trig.content) {
                    const translatedText = callbacks.t(trig.content);
                    const duration = 2000 + translatedText.length * 50;
                    callbacks.spawnBubble(translatedText, duration);

                    // Dynamic duration based on readability speed

                    if (trig.type === 'SPEAK') {
                        soundManager.playVoice(PLAYER_CHARACTER.name);
                        callbacks.onTrigger('SPEAK', duration);
                    } else if (trig.type === 'THOUGHT') {
                        soundManager.playUiHover();
                        callbacks.onTrigger('THOUGHT', duration);
                    } else {
                        soundManager.playUiHover();
                        callbacks.onTrigger(trig.type || 'INFO', duration);
                    }
                }
            }
        }
    }
};