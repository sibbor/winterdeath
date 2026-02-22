import * as THREE from 'three';
import React from 'react';
import { PlayerAnimation } from '../animation/PlayerAnimation';
import { soundManager } from '../../utils/sound';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1 = new THREE.Vector3(); // Target position
const _v2 = new THREE.Vector3(); // Rotated offset
const _v3 = new THREE.Vector3(); // Current position
const _v4 = new THREE.Vector3(); // Bubble world position
const _UP = new THREE.Vector3(0, 1, 0);

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
        },
        familyMembers?: any[]
    ) => {
        if (!cinematic.active) return;

        const timeInLine = now - cinematic.lineStartTime;
        const activeScriptLine = cinematic.script[cinematic.lineIndex];
        const totalElapsed = now - cinematic.startTime;
        const hasCustomCamera = cinematic.customCameraOverride;

        // --- 1. OPTIMIZED CAMERA LOGIC ---
        // Default target is the base position
        _v1.copy(cinematic.cameraBasePos);

        if (!hasCustomCamera) {
            // Apply Orbit Rotation
            if (cinematic.rotationSpeed > 0) {
                const rotAngle = totalElapsed * 0.001 * cinematic.rotationSpeed;
                _v2.copy(cinematic.relativeOffset).applyAxisAngle(_UP, rotAngle);
            } else {
                _v2.copy(cinematic.relativeOffset);
            }

            // Apply Zoom
            const zoomProgress = Math.min(1.0, totalElapsed / 5000);
            const zoomFactor = 1.0 - (zoomProgress * (cinematic.zoom || 0));

            // Final target = midPoint + (rotatedOffset * zoomFactor)
            _v1.copy(cinematic.midPoint).addScaledVector(_v2, zoomFactor);
        }

        // Smooth camera movement (Lerp)
        camera.position.lerp(_v1, 0.05);
        camera.lookAt(cinematic.cameraLookAt);

        // --- 2. SPEAKER IDENTIFICATION ---
        const currentSpeakerName = activeScriptLine?.speaker || 'Unknown';
        const isPlayerSpeaking = currentSpeakerName.toLowerCase() === 'robert' || currentSpeakerName.toLowerCase() === 'player';

        let activeSpeakerMesh: THREE.Object3D | undefined;

        if (isPlayerSpeaking) {
            activeSpeakerMesh = cinematic.speakers[0];
        } else {
            activeSpeakerMesh = cinematic.speakers[1];
            // Name mismatch fallback: Search family members
            if (currentSpeakerName !== 'Unknown' && (!activeSpeakerMesh || activeSpeakerMesh.userData.name !== currentSpeakerName)) {
                if (familyMembers) {
                    const match = familyMembers.find(fm => fm.name === currentSpeakerName || fm.mesh.userData.name === currentSpeakerName);
                    if (match) activeSpeakerMesh = match.mesh;
                }
            }
        }

        // --- 3. BUBBLE POSITIONING (3D -> 2D) ---
        if (bubbleRef.current && activeScriptLine && activeSpeakerMesh) {
            activeSpeakerMesh.getWorldPosition(_v4);

            const isDoor = !isPlayerSpeaking && currentSpeakerName === 'Unknown' &&
                (activeSpeakerMesh.name.toLowerCase().includes('door') || activeSpeakerMesh.name.toLowerCase().includes('frame'));

            if (isDoor) {
                _v4.y += 3.5;
            } else {
                const scale = activeSpeakerMesh.scale.y || 1.0;
                const height = (activeSpeakerMesh.userData.geometryHeight || 2.0) * scale;
                _v4.y += height + 0.5;
            }

            // Project 3D to Normalized Screen Space
            _v4.project(camera);

            const screenW = window.innerWidth;
            const screenH = window.innerHeight;
            let activeX = (_v4.x * 0.5 + 0.5) * screenW;
            let activeY = (-(_v4.y * 0.5) + 0.5) * screenH;

            // Clamping & Tail Logic
            const marginX = 200;
            const marginY = 150;
            let tailPos: 'bottom' | 'top' | 'left' | 'right' = 'bottom';

            if (isDoor) tailPos = 'left';
            if (activeX < marginX) { activeX = marginX; tailPos = 'left'; }
            else if (activeX > screenW - marginX) { activeX = screenW - marginX; tailPos = 'right'; }

            if (activeY < marginY) { activeY = marginY; tailPos = 'top'; }
            else if (activeY > screenH - marginY) { activeY = screenH - marginY; tailPos = 'bottom'; }

            bubbleRef.current.style.transform = `translate3d(${activeX}px, ${activeY}px, 0)`; // translate3d is faster than left/top
            cinematic.tailPosition = tailPos;
        }

        // --- 4. ANIMATION & SOUND ---
        if (timeInLine < cinematic.typingDuration && frame % 6 === 0) {
            soundManager.playVoice(currentSpeakerName);
        }

        // Progress line
        if (timeInLine > cinematic.lineDuration && !cinematic.fadingOut) {
            cinematic.fadingOut = true;
            if (activeScriptLine.trigger) {
                activeScriptLine.trigger.split(',').forEach((t: string) => window.dispatchEvent(new CustomEvent(t.trim())));
            }
            callbacks.playCinematicLine(cinematic.lineIndex + 1);
        }

        // Update Animations for all involved actors
        const currentSpeakerLower = currentSpeakerName.toLowerCase();
        const actors = familyMembers ? [...familyMembers.map(f => f.mesh), playerMesh] : [playerMesh];

        for (let i = 0; i < actors.length; i++) {
            const actor = actors[i];
            if (!actor) continue;

            // Cache body lookup once
            if (!actor.userData.cachedBody) {
                actor.userData.cachedBody = actor.userData.isBody ? actor : actor.children.find((c: any) => c.userData.isBody);
            }

            const body = actor.userData.cachedBody;
            if (!body) continue;

            const actorName = (actor.userData.name || '').toLowerCase();
            const isSpeaking = (actorName === currentSpeakerLower || (actorName === 'player' && isPlayerSpeaking))
                && timeInLine < cinematic.typingDuration;

            PlayerAnimation.update(body as THREE.Mesh, {
                isMoving: false,
                isRushing: false,
                isRolling: false,
                rollStartTime: 0,
                staminaRatio: 1.0,
                isSpeaking: isSpeaking,
                isThinking: false,
                isIdleLong: false,
                isSwimming: false,
                isWading: false,
                seed: actor.userData.seed || 0
            }, now, delta);
        }
    }
};