import * as THREE from 'three';
import { SectorTrigger, TriggerAction } from '../systems/TriggerTypes';;
import { soundManager } from '../utils/SoundManager';
import { PLAYER_CHARACTER } from '../content/constants';
import { RuntimeState } from '../core/RuntimeState';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
let _dx = 0;
let _dz = 0;
let _distSq = 0;
let _tx = 0;
let _tz = 0;
let _sin = 0;
let _cos = 0;
let _maxDimSq = 0;

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
            resolveDynamicPos?: (familyId?: number, ownerId?: string) => THREE.Vector3 | null;
        }
    ) => {
        // OPTIMIZATION: Only fetch triggers within 40 units to save CPU cycles
        const triggers = state.collisionGrid ? state.collisionGrid.getNearbyTriggers(playerPos, 40.0) : state.triggers;
        if (!triggers || triggers.length === 0) return;

        // Wait for GameSession runSetup to finish populating the trigger scratchpad
        if (!callbacks || !callbacks.onAction) return;

        const tLen = triggers.length;
        for (let i = 0; i < tLen; i++) {
            const trig = triggers[i];

            // 1. QUICK EXIT: Skip if one-shot and already triggered
            if (trig.triggered && !trig.resetOnExit && (!trig.repeatInterval || trig.repeatInterval <= 0)) {
                continue;
            }

            let isInside = false;

            // --- DYNAMIC POSITIONING ---
            let tx = trig.position.x;
            let tz = trig.position.z;

            if ((trig.familyId !== undefined || trig.ownerId) && callbacks.resolveDynamicPos) {
                const dPos = callbacks.resolveDynamicPos(trig.familyId, trig.ownerId);
                if (dPos) {
                    tx = dPos.x;
                    tz = dPos.z;
                }
            }

            // Calculate squared distance early
            _dx = playerPos.x - tx;
            _dz = playerPos.z - tz;
            _distSq = _dx * _dx + _dz * _dz;

            // 2. COLLISION CHECK
            if (trig.size) {
                // Broadphase: Only do heavy OBB math if within the outer bounding circle
                _maxDimSq = Math.max(trig.size.width, trig.size.depth) * 0.8;
                _maxDimSq *= _maxDimSq; // Square it to avoid Math.sqrt

                if (_distSq <= _maxDimSq) {
                    // Box Trigger (Rotated OBB)
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
                // Circle Trigger (Fast Squared Distance)
                if (_distSq < (trig.radius * trig.radius)) {
                    isInside = true;
                }
            }

            // 3. STATE MANAGEMENT & EXECUTION
            if (isInside) {
                // Player is inside. Are they just entering, or just standing here?
                if (!trig.triggered) {
                    // --- ON ENTER ---
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
                            if (!callbacks.collectedCluesRef.current.includes(trig.id)) {
                                callbacks.onClueDiscovered(trig);
                            }
                        }
                    }

                    // Fire Actions (Only once upon entering)
                    if (trig.actions && trig.actions.length > 0) {
                        const aLen = trig.actions.length;
                        for (let j = 0; j < aLen; j++) {
                            const action = trig.actions[j];
                            if (action.type === 'START_CINEMATIC' && trig.familyId !== undefined) {
                                if (!action.payload) action.payload = {};
                                if (action.payload.familyId === undefined) action.payload.familyId = trig.familyId;
                            }
                            callbacks.onAction(action);
                        }
                    }

                    // Fire Narrative (Only once upon entering)
                    if (trig.content) {
                        const translatedText = callbacks.t(trig.content);
                        const duration = 2000 + translatedText.length * 50;
                        callbacks.spawnBubble(translatedText, duration);

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
                // Note: We do nothing if they are inside and already triggered (Standing inside).
                // This prevents the 60fps OPEN_UI spam bug!

            } else {
                // Player is NOT inside.
                if (trig.triggered) {
                    // --- ON EXIT / COOLDOWN ---
                    if (trig.resetOnExit) {
                        trig.triggered = false; // Reset immediately upon leaving
                    } else if (trig.repeatInterval && trig.repeatInterval > 0) {
                        // Cooldown based reset
                        if (trig.lastTriggerTime && now - trig.lastTriggerTime > trig.repeatInterval) {
                            trig.triggered = false;
                        }
                    }
                }
            }
        }
    }
};