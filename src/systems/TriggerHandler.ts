import * as THREE from 'three';
import { SectorTrigger, TriggerAction } from '../systems/TriggerTypes';
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
            onTrigger: (type: string, duration: number) => void;
            onAction: (action: TriggerAction | string) => void; // Stöder nu även strängar!
            t: (key: string) => string;
            resolveDynamicPos?: (familyId?: number, ownerId?: string) => THREE.Vector3 | null;
            onDiscovery?: (type: string, id: string, titleKey: string, detailsKey: string, payload?: any) => void;
            playSound?: (id: string) => void; // VINTERDÖD: Audio bridge
        }
    ) => {
        // OPTIMIZATION: Only fetch triggers within 40 units to save CPU cycles
        const triggers = state.collisionGrid ? state.collisionGrid.getNearbyTriggers(playerPos, 40.0) : state.triggers;
        if (!triggers || triggers.length === 0) return;

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
                _maxDimSq = Math.max(trig.size.width, trig.size.depth) * 0.8;
                _maxDimSq *= _maxDimSq;

                if (_distSq <= _maxDimSq) {
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
                if (_distSq < (trig.radius * trig.radius)) {
                    isInside = true;
                }
            }

            // 3. STATE MANAGEMENT & EXECUTION
            if (isInside) {
                if (!trig.triggered) {
                    // --- ON ENTER ---
                    trig.triggered = true;
                    trig.lastTriggerTime = now;

                    // --- O(1) ADVENTURE LOG DISCOVERY ---
                    if (trig.id && callbacks.onDiscovery) {
                        const discType = trig.type === 'POI' ? 'poi' : 'clue';
                        const titleKey = trig.type === 'POI' ? 'ui.poi_discovered_title' : 'ui.clue_discovered';
                        callbacks.onDiscovery(discType, trig.id, titleKey, trig.content || '', trig);
                    }

                    // --- FIRE ACTIONS ---
                    if (trig.actions && trig.actions.length > 0) {
                        const aLen = trig.actions.length;
                        for (let j = 0; j < aLen; j++) {
                            callbacks.onAction(trig.actions[j]);
                        }
                    }

                    // --- FIRE NARRATIVE ---
                    if (trig.content) {
                        const translatedText = callbacks.t(trig.content);
                        const duration = 2000 + translatedText.length * 50;
                        callbacks.spawnBubble(translatedText, duration);

                        // VINTERDÖD FIX: Removed direct SoundManager/Constant imports
                        if (trig.type === 'SPEAK') {
                            if (callbacks.playSound) callbacks.playSound('voice');
                            callbacks.onTrigger('SPEAK', duration);
                        } else if (trig.type === 'THOUGHT') {
                            if (callbacks.playSound) callbacks.playSound('ui_hover');
                            callbacks.onTrigger('THOUGHT', duration);
                        } else {
                            if (callbacks.playSound) callbacks.playSound('ui_hover');
                            callbacks.onTrigger(trig.type || 'INFO', duration);
                        }
                    }
                }
            } else {
                // --- ON EXIT / COOLDOWN ---
                if (trig.triggered) {
                    if (trig.resetOnExit) {
                        trig.triggered = false;
                    } else if (trig.repeatInterval && trig.repeatInterval > 0) {
                        if (trig.lastTriggerTime && now - trig.lastTriggerTime > trig.repeatInterval) {
                            trig.triggered = false;
                        }
                    }
                }
            }
        }
    }
};