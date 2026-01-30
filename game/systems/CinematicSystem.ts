
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
        
        // Camera Orbit Logic
        let currentTargetPos = cinematic.cameraBasePos.clone();
        if (cinematic.rotationSpeed > 0) {
            const totalElapsedTime = (cinematic.lineIndex * 2000) + timeInLine; 
            const rotAngle = totalElapsedTime * 0.001 * cinematic.rotationSpeed;
            const rotatedOffset = cinematic.relativeOffset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), rotAngle);
            currentTargetPos = cinematic.midPoint.clone().add(rotatedOffset);
        }

        const currentPos = camera.position.clone();
        currentPos.lerp(currentTargetPos, 0.05); 
        camera.position.copy(currentPos);
        camera.lookAt(cinematic.cameraLookAt);
        
        const currentSpeakerName = activeScriptLine?.speaker || 'Unknown';
        const isPlayerSpeaking = currentSpeakerName.toLowerCase() === 'robert' || currentSpeakerName.toLowerCase() === 'player';
        
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
                    const fam = cinematic.speakers[1];
                    if (fam) {
                        const body = fam.children.find((c: any) => c.userData.isBody);
                        if (body) { body.scale.y = 1.1; body.scale.x = 0.95; body.scale.z = 0.95; }
                    }
                }
            }
        } else if (timeInLine > cinematic.lineDuration && !cinematic.fadingOut) {
            cinematic.fadingOut = true;
            callbacks.playCinematicLine(cinematic.lineIndex + 1);
        }

        // Bubble Positioning
        if (bubbleRef.current && activeScriptLine) {
            const speakerMesh = isPlayerSpeaking ? cinematic.speakers[0] : cinematic.speakers[1];
            if (speakerMesh) {
                const vec = new THREE.Vector3();
                speakerMesh.getWorldPosition(vec);
                vec.y += 2.5; 
                vec.project(camera);
                const x = (vec.x * 0.5 + 0.5) * window.innerWidth;
                const y = (-(vec.y * 0.5) + 0.5) * window.innerHeight;
                bubbleRef.current.style.left = `${x}px`;
                bubbleRef.current.style.top = `${y}px`;
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
