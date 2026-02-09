
import * as THREE from 'three';
import React from 'react';
import { PlayerAnimation } from '../animation/PlayerAnimation';
import { soundManager } from '../../utils/sound';
import { t } from '../../utils/i18n';

export const CinematicSystem = {
    update: (
        cinematic: any, // Assuming CinematicState from instruction snippet, but keeping 'any' as it's not fully defined in original
        camera: THREE.Camera,
        playerMesh: THREE.Mesh | null, // Assuming THREE.Group from instruction snippet, but keeping original as it's not fully defined
        bubbleRef: React.RefObject<HTMLDivElement>,
        now: number,
        delta: number,
        frame: number,
        callbacks: {
            setCurrentLine: (line: any) => void;
            setCinematicActive: (active: boolean) => void;
            endCinematic: () => void;
            playCinematicLine: (index: number) => void;
        },
        familyMembers?: any[]
    ) => {
        // Added from instruction snippet
        if (!cinematic.active) return;

        const timeInLine = now - cinematic.lineStartTime;
        const activeScriptLine = cinematic.script[cinematic.lineIndex];

        // Camera Orbit & Zoom Logic
        // Skip zoom/rotation if custom camera override is active (keeps camera fixed)
        let currentTargetPos = cinematic.cameraBasePos.clone();
        const totalElapsed = now - cinematic.startTime;
        const hasCustomCamera = cinematic.customCameraOverride;

        // Apply Zoom (moves camera closer along the relative offset vector)
        // Only apply if no custom camera override
        if (cinematic.zoom > 0 && !hasCustomCamera) {
            const zoomProgress = Math.min(1.0, totalElapsed / 5000); // Zoom in over 5 seconds
            const zoomFactor = 1.0 - (zoomProgress * cinematic.zoom);
            currentTargetPos = cinematic.midPoint.clone().add(cinematic.relativeOffset.clone().multiplyScalar(zoomFactor));
        }

        if (cinematic.rotationSpeed > 0 && !hasCustomCamera) {
            const totalElapsedTime = (cinematic.lineIndex * 2000) + timeInLine; // Legacy calc or use totalElapsed
            const rotAngle = totalElapsedTime * 0.001 * cinematic.rotationSpeed;
            const rotatedOffset = cinematic.relativeOffset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), rotAngle);

            // Re-apply zoom if active
            if (cinematic.zoom > 0) {
                const zoomProgress = Math.min(1.0, totalElapsed / 5000);
                const zoomFactor = 1.0 - (zoomProgress * cinematic.zoom);
                currentTargetPos = cinematic.midPoint.clone().add(rotatedOffset.multiplyScalar(zoomFactor));
            } else {
                currentTargetPos = cinematic.midPoint.clone().add(rotatedOffset);
            }
        }

        const currentPos = camera.position.clone();
        currentPos.lerp(currentTargetPos, 0.05);
        camera.position.copy(currentPos);

        const currentSpeakerName = activeScriptLine?.speaker || 'Unknown';
        const isPlayerSpeaking = currentSpeakerName.toLowerCase() === 'robert' || currentSpeakerName.toLowerCase() === 'player';

        // --- 1. Identify Active Speaker Mesh ---
        let activeSpeakerMesh: THREE.Object3D | undefined;

        if (isPlayerSpeaking) {
            activeSpeakerMesh = cinematic.speakers[0]; // Player
        } else {
            // Default to the primary Quest Giver / Family Member
            activeSpeakerMesh = cinematic.speakers[1];

            // If the name doesn't match, search for the correct actor in our familyMembers array
            if (currentSpeakerName !== 'Unknown' && (!activeSpeakerMesh || activeSpeakerMesh.userData.name !== currentSpeakerName)) {
                if (familyMembers) {
                    const match = familyMembers.find(fm => fm.name === currentSpeakerName || fm.mesh.userData.name === currentSpeakerName);
                    if (match) activeSpeakerMesh = match.mesh;
                }
            }
        }

        camera.lookAt(cinematic.cameraLookAt);

        // --- 2. Animation (Bounce & Settle) ---

        // Helper to lerp scale back to 1.0 (Idle)
        const settleMesh = (mesh: THREE.Object3D) => {
            // Cache body lookup for performance
            let body = mesh.userData.cachedBody;
            if (!body) {
                body = mesh.children.find((c: any) => c.userData.isBody);
                if (body) mesh.userData.cachedBody = body;
            }

            if (body) {
                body.scale.lerp(new THREE.Vector3(1, 1, 1), 0.1);
            }
        };

        // Settle active family members only (much faster than scene traversal)
        if (familyMembers) {
            familyMembers.forEach(fm => {
                if (fm.mesh) settleMesh(fm.mesh);
            });
        }

        // Typing Sounds
        if (timeInLine < cinematic.typingDuration) {
            if (frame % 6 === 0) {
                soundManager.playVoice(currentSpeakerName);
            }
        }

        if (timeInLine > cinematic.lineDuration && !cinematic.fadingOut) {
            cinematic.fadingOut = true;
            if (activeScriptLine.trigger) {
                const triggers = activeScriptLine.trigger.split(',');
                triggers.forEach(t => window.dispatchEvent(new CustomEvent(t.trim())));
            }
            callbacks.playCinematicLine(cinematic.lineIndex + 1);
        }

        // --- 3. Bubble Positioning ---
        if (bubbleRef.current && activeScriptLine && activeSpeakerMesh) {
            const vec = new THREE.Vector3();
            activeSpeakerMesh.getWorldPosition(vec);

            // Determine if this is a door/static environmental speaker
            const isDoor = !isPlayerSpeaking && currentSpeakerName === 'Unknown' && (activeSpeakerMesh.name.toLowerCase().includes('door') || activeSpeakerMesh.name.toLowerCase().includes('frame'));

            if (isDoor) {
                vec.y += 3.5;
            } else {
                // Standard height for characters, adjust by scale
                const scale = activeSpeakerMesh.scale.y || 1.0;
                const height = (activeSpeakerMesh.userData.geometryHeight || 2.0) * scale;
                vec.y += height + 0.5;
            }

            vec.project(camera);

            let activeX = (vec.x * 0.5 + 0.5) * window.innerWidth;
            let activeY = (-(vec.y * 0.5) + 0.5) * window.innerHeight;

            const screenW = window.innerWidth;
            const screenH = window.innerHeight;
            const marginX = 200;
            const marginY = 150;

            let tailPos: 'bottom' | 'top' | 'left' | 'right' = 'bottom';
            if (isDoor) tailPos = 'left';

            if (activeX < marginX) {
                activeX = marginX;
                tailPos = 'left';
            } else if (activeX > screenW - marginX) {
                activeX = screenW - marginX;
                tailPos = 'right';
            }

            if (activeY < marginY) {
                activeY = marginY;
                tailPos = 'top';
            } else if (activeY > screenH - marginY) {
                activeY = screenH - marginY;
                tailPos = 'bottom';
            }

            bubbleRef.current.style.left = `${activeX}px`;
            bubbleRef.current.style.top = `${activeY}px`;
            cinematic.tailPosition = tailPos;
        }

        // --- 4. Animation Updates (All Actors) ---
        const allActors: THREE.Object3D[] = [];
        if (playerMesh) {
            if (!playerMesh.userData.name) playerMesh.userData.name = 'Player';
            allActors.push(playerMesh);
        }

        if (familyMembers) {
            familyMembers.forEach((fm: any) => {
                if (fm.mesh && !allActors.includes(fm.mesh)) {
                    allActors.push(fm.mesh);
                }
            });
        }

        allActors.forEach(actor => {
            const actorName = (actor.userData.name || '').toLowerCase();

            // 1. Find/Cache Body Mesh
            let body = actor.userData.cachedBody;
            if (!body) {
                if (actor.type === 'Group' || !actor.userData.isPlayer) {
                    const findBody = (obj: THREE.Object3D): THREE.Mesh | undefined => {
                        if (obj.userData.isBody) return obj as THREE.Mesh;
                        for (const child of obj.children) {
                            const found = findBody(child);
                            if (found) return found;
                        }
                        return undefined;
                    };
                    body = findBody(actor);
                } else {
                    body = actor as THREE.Mesh;
                }
                if (body) actor.userData.cachedBody = body;
            }

            if (!body) return;

            // 2. Determine if Speaking
            const currentSpeaker = (currentSpeakerName || '').toLowerCase();
            const isPlayerActor = actor.userData.isPlayer || actorName === 'player' || actorName === 'robert';
            let isSpeaking = false;

            if (isPlayerActor) {
                isSpeaking = (currentSpeaker === 'player' || currentSpeaker === 'robert');
            } else {
                isSpeaking = (actorName === currentSpeaker) && (currentSpeaker !== 'unknown');
            }

            if (timeInLine >= cinematic.typingDuration) {
                isSpeaking = false;
            }

            // 3. Animate
            PlayerAnimation.update(body, {
                isMoving: false,
                isRushing: false,
                isRolling: false,
                rollStartTime: 0,
                staminaRatio: 1.0,
                isSpeaking: isSpeaking,
                isThinking: false,
                isIdleLong: false,
                seed: actor.userData.seed || (actor.id * 0.1)
            }, now, delta);
        });
    }
};
