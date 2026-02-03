
import * as THREE from 'three';
import React from 'react';
import { PlayerAnimation } from '../animation/PlayerAnimation';
import { soundManager } from '../../utils/sound';
import { t } from '../../utils/i18n';

export const CinematicSystem = {
    update: (
        cinematic: any,
        camera: THREE.Camera,
        playerMesh: THREE.Mesh | null,
        bubbleRef: React.RefObject<HTMLDivElement>,
        now: number,
        delta: number,
        frame: number,
        callbacks: {
            setCurrentLine: (line: any) => void;
            setCinematicActive: (active: boolean) => void;
            endCinematic: () => void;
            playCinematicLine: (index: number) => void;
        }
    ) => {
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

        camera.lookAt(cinematic.cameraLookAt);


        // Typing Sounds & Animation Bounce
        if (timeInLine < cinematic.typingDuration) {
            if (frame % 6 === 0) {
                soundManager.playVoice(currentSpeakerName);
                if (isPlayerSpeaking) {
                    // Player speak bounce is handled via state in main loop, but we can set a flag on the mesh or similar if needed.
                    // For now, GameCanvas state tracks speakBounce, we might need to pass a setter if we want to mutate it here.
                    // Assuming local mutation of player animation state if we passed state, 
                    // but visual bounce is often enough handled by PlayerAnimation update below.
                } else {
                    // Find the correct speaker mesh (not just speakers[1])
                    let speakerMesh = cinematic.speakers[1];

                    // Dynamic speaker lookup for multi-character dialogues
                    if (currentSpeakerName !== 'Unknown' && (!speakerMesh || speakerMesh.userData.name !== currentSpeakerName)) {
                        // Search in camera parent first
                        let altSpeaker = camera.parent?.children.find(c =>
                            (c.userData.isFamilyMember || (c as any).isFamilyMember) &&
                            c.userData.name === currentSpeakerName
                        );

                        // If not found, search in the scene more thoroughly
                        if (!altSpeaker && (window as any).scene) {
                            const scene = (window as any).scene;
                            // Direct search first
                            altSpeaker = scene.children.find((c: any) =>
                                (c.userData.isFamilyMember || c.userData.type === 'family') &&
                                c.userData.name === currentSpeakerName
                            );

                            // If still not found, search by mesh name (fallback)
                            if (!altSpeaker) {
                                altSpeaker = scene.children.find((c: any) =>
                                    c.name === currentSpeakerName &&
                                    (c.userData.isFamilyMember || c.userData.type === 'family')
                                );
                            }
                        }

                        if (altSpeaker) speakerMesh = altSpeaker;
                    }

                    // Only animate if we have a valid family member mesh (not door/unknown)
                    if (speakerMesh && currentSpeakerName !== 'Unknown') {
                        const body = speakerMesh.children.find((c: any) => c.userData.isBody);
                        if (body) { body.scale.y = 1.1; body.scale.x = 0.95; body.scale.z = 0.95; }
                    }
                }
            }
        } else if (timeInLine > cinematic.lineDuration && !cinematic.fadingOut) {
            cinematic.fadingOut = true;
            if (activeScriptLine.trigger) {
                const triggers = activeScriptLine.trigger.split(',');
                triggers.forEach(t => window.dispatchEvent(new CustomEvent(t.trim())));
            }
            callbacks.playCinematicLine(cinematic.lineIndex + 1);
        }

        // Bubble Positioning with Clamping and Tail Logic
        if (bubbleRef.current && activeScriptLine) {
            let speakerMesh = isPlayerSpeaking ? cinematic.speakers[0] : cinematic.speakers[1];

            // Dynamic speaker lookup for multi-character dialogues
            if (!isPlayerSpeaking && currentSpeakerName !== 'Unknown' && (!speakerMesh || speakerMesh.userData.name !== currentSpeakerName)) {
                // Look for alternative speaker in the scene
                const altSpeaker = camera.parent?.children.find(c =>
                    (c.userData.isFamilyMember || (c as any).isFamilyMember) &&
                    c.userData.name === currentSpeakerName
                ) || (window as any).scene?.children.find((c: any) =>
                    (c.userData.isFamilyMember || c.userData.type === 'family') &&
                    c.userData.name === currentSpeakerName
                );

                if (altSpeaker) speakerMesh = altSpeaker;
            }

            if (speakerMesh) {
                const vec = new THREE.Vector3();
                speakerMesh.getWorldPosition(vec);

                // Determine if this is a door/static environmental speaker
                const isDoor = !isPlayerSpeaking && currentSpeakerName === 'Unknown' && (speakerMesh.name.toLowerCase().includes('door') || speakerMesh.name.toLowerCase().includes('frame'));

                if (isDoor) {
                    vec.y += 3.5;
                } else {
                    // Standard height for characters, adjust by scale
                    const scale = speakerMesh.scale.y || 1.0;
                    const height = (speakerMesh.userData.geometryHeight || 2.0) * scale;
                    vec.y += height + 0.5;
                }

                vec.project(camera);

                let x = (vec.x * 0.5 + 0.5) * window.innerWidth;
                let y = (-(vec.y * 0.5) + 0.5) * window.innerHeight;

                const screenW = window.innerWidth;
                const screenH = window.innerHeight;
                const marginX = 200; // Wider margin to keep bubbles centered
                const marginY = 150;

                // Determine tail position and clamp
                let tailPos: 'bottom' | 'top' | 'left' | 'right' = 'bottom';

                // Initial tail guess
                if (isDoor) tailPos = 'left';

                // Horizontal clamping
                if (x < marginX) {
                    x = marginX;
                    tailPos = 'left';
                } else if (x > screenW - marginX) {
                    x = screenW - marginX;
                    tailPos = 'right';
                }

                // Vertical clamping
                if (y < marginY) {
                    y = marginY;
                    tailPos = 'top';
                } else if (y > screenH - marginY) {
                    y = screenH - marginY;
                    tailPos = 'bottom';
                }

                bubbleRef.current.style.left = `${x}px`;
                bubbleRef.current.style.top = `${y}px`;

                // Store tailPosition on cinematic object so GameSession can pass it to the component
                cinematic.tailPosition = tailPos;
            }
        }

        // Animation Updates
        if (playerMesh) {
            // Force idle animation during cinematic
            PlayerAnimation.update(playerMesh, {
                isMoving: false, isRushing: false, isRolling: false, rollStartTime: 0,
                staminaRatio: 1.0,
                isSpeaking: isPlayerSpeaking && timeInLine < cinematic.typingDuration,
                isThinking: false, isIdleLong: false, seed: 0
            }, now, delta);
        }

        const fam = cinematic.speakers[1];
        if (fam) {
            const body = fam.children.find((c: any) => c.userData.isBody) as THREE.Mesh;
            if (body) {
                // Lerp back to normal scale after talking bounce
                body.scale.lerp(new THREE.Vector3(1, 1, 1), 0.1);
            }
        }
    }
};
