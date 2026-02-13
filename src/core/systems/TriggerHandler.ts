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

            // 1. QUICK DISCARD: Handle Cooling Down / One-shots
            if (trig.triggered) {
                if (trig.repeatInterval && trig.repeatInterval > 0) {
                    if (trig.lastTriggerTime && now - trig.lastTriggerTime > trig.repeatInterval) {
                        trig.triggered = false; // Reset for reuse
                    } else {
                        continue; // Still cooling down
                    }
                } else {
                    continue; // One-shot already used
                }
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

            // 3. EXECUTION
            if (isInside) {
                trig.triggered = true;
                trig.lastTriggerTime = now;

                // Fire Actions
                if (trig.actions && trig.actions.length > 0) {
                    for (let j = 0; j < trig.actions.length; j++) {
                        callbacks.onAction(trig.actions[j]);
                    }
                    // Prevent narrative fallback if only actions are intended
                    if (!trig.content) continue;
                }

                // Fire Narrative / UI
                if (trig.content) {
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
};