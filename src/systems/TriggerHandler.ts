import * as THREE from 'three';
import { SectorTrigger, TriggerAction, TriggerType, TriggerStatus } from '../systems/TriggerTypes';
import { RuntimeState } from '../core/RuntimeState';
import { SoundID } from '../utils/audio/AudioTypes';

export const TriggerHandler = {
    /**
     * Checks all sector triggers against player position.
     * Optimized for 60fps execution with minimal memory pressure.
     */
    checkTriggers: (
        playerPos: THREE.Vector3,
        state: RuntimeState,
        callbacks: {
            spawnBubble: (text: string, duration?: number) => void;
            removeVisual: (id: string) => void;
            onTrigger: (type: TriggerType, duration: number) => void;
            onAction: (action: TriggerAction) => void;
            t: (key: string) => string;
            resolveDynamicPos?: (familyId?: number, ownerId?: string) => THREE.Vector3 | null;
            onDiscovery?: (type: string, id: string, titleKey: string, detailsKey: string, payload?: any) => void;
            playSound?: (id: SoundID) => void;
        },
        delta: number,
        simTime: number,
        renderTime: number
    ) => {
        // OPTIMIZATION: Only fetch triggers within 40 units to save CPU cycles
        const triggers = state.collisionGrid.getNearbyTriggers(playerPos, 40.0);
        if (!triggers || triggers.length === 0) return;

        if (!callbacks || !callbacks.onAction) return;

        const tLen = triggers.length;
        for (let i = 0; i < tLen; i++) {
            const trig = triggers[i];

            // 1. QUICK EXIT: Skip if one-shot and already triggered
            const sFlags = trig.statusFlags;
            const isTriggered = (sFlags & TriggerStatus.TRIGGERED) !== 0;
            const resetOnExit = (sFlags & TriggerStatus.RESET_ON_EXIT) !== 0;

            if (isTriggered && !resetOnExit && (!trig.repeatInterval || trig.repeatInterval <= 0)) {
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

            // High-performance local primitive math (Unboxed CPU Registers)
            const dx = playerPos.x - tx;
            const dz = playerPos.z - tz;
            const distSq = dx * dx + dz * dz;

            // 2. COLLISION CHECK
            if (trig.size) {
                const maxDim = Math.max(trig.size.width, trig.size.depth) * 0.8;
                const maxDimSq = maxDim * maxDim;

                if (distSq <= maxDimSq) {
                    let locX = dx;
                    let locZ = dz;

                    if (trig.rotation) {
                        const s = Math.sin(-trig.rotation);
                        const c = Math.cos(-trig.rotation);
                        locX = dx * c - dz * s;
                        locZ = dx * s + dz * c;
                    }

                    if (Math.abs(locX) <= trig.size.width * 0.5 && Math.abs(locZ) <= trig.size.depth * 0.5) {
                        isInside = true;
                    }
                }
            } else if (trig.radius) {
                if (distSq < (trig.radius * trig.radius)) {
                    isInside = true;
                }
            }

            // 3. STATE MANAGEMENT & EXECUTION
            if (isInside) {
                if ((trig.statusFlags & TriggerStatus.TRIGGERED) === 0) {
                    // --- ON ENTER ---
                    trig.statusFlags |= TriggerStatus.TRIGGERED;
                    trig.lastTriggerTime = simTime;

                    // --- ADVENTURE LOG DISCOVERY ---
                    if (trig.id && callbacks.onDiscovery) {
                        const discType = trig.type === TriggerType.POI ? 'poi' : 'clue';
                        const titleKey = trig.type === TriggerType.POI ? 'ui.poi_discovered_title' : 'ui.clue_discovered';
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

                        if (trig.type === TriggerType.SPEAK) {
                            if (callbacks.playSound) callbacks.playSound(SoundID.VO_PLAYER_COUGH);
                            callbacks.onTrigger(TriggerType.SPEAK, duration);
                        } else if (trig.type === TriggerType.THOUGHT) {
                            if (callbacks.playSound) callbacks.playSound(SoundID.UI_HOVER);
                            callbacks.onTrigger(TriggerType.THOUGHT, duration);
                        } else {
                            if (callbacks.playSound) callbacks.playSound(SoundID.UI_HOVER);
                            callbacks.onTrigger(trig.type || TriggerType.INFO, duration);
                        }
                    }
                }
            } else {
                // --- ON EXIT / COOLDOWN ---
                if ((trig.statusFlags & TriggerStatus.TRIGGERED) !== 0) {
                    if ((trig.statusFlags & TriggerStatus.RESET_ON_EXIT) !== 0) {
                        trig.statusFlags &= ~TriggerStatus.TRIGGERED;
                    } else if (trig.repeatInterval && trig.repeatInterval > 0) {
                        if (simTime - (trig.lastTriggerTime || 0) > trig.repeatInterval) {
                            trig.statusFlags &= ~TriggerStatus.TRIGGERED;
                        }
                    }
                }
            }
        }
    }
};