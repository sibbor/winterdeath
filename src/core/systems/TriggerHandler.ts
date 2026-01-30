
import * as THREE from 'three';
import { SectorTrigger, PlayerStats, TriggerAction } from '../../types';
import { soundManager } from '../../utils/sound';
import { PLAYER_CHARACTER } from '../../content/constants';

export const TriggerHandler = {
    checkTriggers: (
        playerPos: THREE.Vector3,
        state: any,
        now: number,
        callbacks: {
            spawnBubble: (text: string) => void;
            removeVisual: (id: string) => void;
            onClueFound: (clue: SectorTrigger) => void;
            onTrigger: (type: string, duration: number) => void;
            onAction: (action: TriggerAction) => void; // New generic callback
            collectedCluesRef: any;
            t: (key: string) => string;
        }
    ) => {
        state.triggers.forEach((trig: SectorTrigger) => {
            // Handle Repeating Triggers
            if (trig.triggered) {
                if (trig.repeatInterval && trig.repeatInterval > 0) {
                    if (trig.lastTriggerTime && now - trig.lastTriggerTime > trig.repeatInterval) {
                        trig.triggered = false; // Reset
                    } else {
                        return; // Still cooling down
                    }
                } else {
                    return; // One-shot and already triggered
                }
            }

            const dx = playerPos.x - trig.position.x;
            const dz = playerPos.z - trig.position.z;
            const distSq = dx * dx + dz * dz;

            if (distSq < trig.radius * trig.radius) {
                trig.triggered = true;
                trig.lastTriggerTime = now;

                // --- NEW ACTION SYSTEM ---
                if (trig.actions && trig.actions.length > 0) {
                    trig.actions.forEach(action => {
                        callbacks.onAction(action);
                    });

                    // Allow legacy text fallback if 'content' exists alongside actions, 
                    // otherwise return to prevent default behavior.
                    if (!trig.content) return;
                }

                // --- LEGACY / STANDARD BEHAVIOR ---
                if (trig.type === 'COLLECTIBLE') {
                    // Remove the 3D marker
                    callbacks.removeVisual(trig.id);

                    // Track it
                    if (!callbacks.collectedCluesRef.current.includes(trig.content)) {
                        callbacks.collectedCluesRef.current.push(trig.content);
                    }

                    // Trigger UI Modal
                    callbacks.onClueFound(trig);
                    callbacks.onTrigger('THOUGHTS', 2000); // Collectibles trigger thinking
                } else if (trig.content) {
                    // Narrative / Flavor Triggers
                    const text = callbacks.t(trig.content);
                    callbacks.spawnBubble(text);

                    // Estimate duration based on text length
                    const duration = 2000 + text.length * 50;

                    if (trig.type === 'SPEECH') {
                        soundManager.playVoice(PLAYER_CHARACTER.name);
                        callbacks.onTrigger('SPEECH', duration);
                    } else {
                        soundManager.playUiHover();
                        callbacks.onTrigger(trig.type, duration);
                    }
                }
            }
        });
    }
};
