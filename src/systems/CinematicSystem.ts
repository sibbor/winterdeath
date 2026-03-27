import * as THREE from 'three';
import { GameSessionLogic } from '../game/session/GameSessionLogic';
import { System } from './System';
import { CameraSystem } from './CameraSystem';
import { PlayerAnimator } from '../entities/player/PlayerAnimator';
import { soundManager } from '../utils/audio/SoundManager';
import { STORY_SCRIPTS } from '../content/dialogues';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _UP = new THREE.Vector3(0, 1, 0);

export class CinematicSystem implements System {
    id = 'cinematic';

    private cinematicRef: React.MutableRefObject<any>;
    private camera: CameraSystem;
    private playerMeshRef: React.MutableRefObject<THREE.Group | null>;
    private bubbleRef: React.RefObject<HTMLDivElement>;
    private activeFamilyMembers: React.MutableRefObject<any[]>;
    private callbacks: {
        setCurrentLine: (line: any) => void;
        setCinematicActive: (active: boolean) => void;
        endCinematic: () => void;
        playCinematicLine: (index: number) => void;
        setTailPosition: (pos: 'bottom' | 'top' | 'left' | 'right') => void;
    };
    private frame: number = 0;

    constructor(opts: {
        cinematicRef: React.MutableRefObject<any>;
        camera: CameraSystem;
        playerMeshRef: React.MutableRefObject<THREE.Group | null>;
        bubbleRef: React.RefObject<HTMLDivElement>;
        activeFamilyMembers: React.MutableRefObject<any[]>;
        callbacks: {
            setCurrentLine: (line: any) => void;
            setCinematicActive: (active: boolean) => void;
            endCinematic: () => void;
            playCinematicLine: (index: number) => void;
            setTailPosition: (pos: 'bottom' | 'top' | 'left' | 'right') => void;
        };
    }) {
        this.cinematicRef = opts.cinematicRef;
        this.camera = opts.camera;
        this.playerMeshRef = opts.playerMeshRef;
        this.bubbleRef = opts.bubbleRef;
        this.activeFamilyMembers = opts.activeFamilyMembers;
        this.callbacks = opts.callbacks;
    }

    public startCinematic(target: THREE.Object3D, scriptId: number, params: any = {}) {
        const script = STORY_SCRIPTS[scriptId];
        if (!script) return;

        const cinematic = this.cinematicRef.current;
        cinematic.active = true;
        cinematic.isClosing = false;
        cinematic.target = target;
        cinematic.script = script;
        cinematic.lineIndex = -1;
        cinematic.startTime = performance.now();
        cinematic.zoom = params.zoom || 0.4; // Default zoom slightly stronger

        // Capture Start State for smooth transition
        cinematic.startPos = this.camera.position.clone();
        cinematic.startLookAt = this.camera.lookAtTarget ? this.camera.lookAtTarget.clone() : new THREE.Vector3(cinematic.target.position.x, 0, cinematic.target.position.z);

        this.callbacks.setCinematicActive(true);
        this.playLine(0);
    }

    public playLine(index: number) {
        const cinematic = this.cinematicRef.current;
        if (index >= cinematic.script.length) {
            this.endCinematic();
            return;
        }

        const line = cinematic.script[index];
        cinematic.lineIndex = index;
        cinematic.lineStartTime = performance.now();
        cinematic.fadingOut = false;

        // Auto-calculate durations based on text length
        // approx 15 chars per second + 1.5s padding
        const textToDisplay = line.text || "";
        cinematic.typingDuration = textToDisplay.length * 30; // 30ms per char
        cinematic.lineDuration = Math.max(2000, cinematic.typingDuration + 1500);

        this.callbacks.setCurrentLine(line);
    }

    public endCinematic() {
        const cinematic = this.cinematicRef.current;

        // Start Zoom-Out Phase
        cinematic.active = false;
        cinematic.isClosing = true;
        cinematic.closeStartTime = performance.now();

        this.callbacks.setCurrentLine(null);
        this.callbacks.setCinematicActive(false);
        this.callbacks.endCinematic();
    }

    /**
     * Primary update loop for the Cinematic System.
     * PERFORMANCE: High-frequency logic executed by the engine loop.
     * [VINTERDÖD FIX]: Correct signature to match System update call (context, dt, now).
     */
    public update(context: any, dt: number, now: number) {
        const cinematic = this.cinematicRef.current;
        if (!cinematic.active && !cinematic.isClosing) return;

        const totalElapsed = now - cinematic.startTime;
        const playerPos = this.playerMeshRef.current?.position || _v2;

        // --- 1. CAMERA INTERPOLATION (Zero-GC) ---
        if (cinematic.target) {
            const targetPos = cinematic.target.position;

            // Focused Midpoint Target (Always updated to follow moving characters)
            _v1.set(
                (targetPos.x + playerPos.x) * 0.5,
                (targetPos.y + playerPos.y) * 0.5 + 1.0,
                (targetPos.z + playerPos.z) * 0.5
            );

            const envCameraZ = 20;
            const envCameraY = 22;

            // Smooth Interpolation Phases
            let t = 0;
            if (cinematic.active && !cinematic.isClosing) {
                // IN-PHASE: Slide from start position to focused view
                t = Math.min(1.0, totalElapsed / 1500);
                t = 1.0 - Math.pow(1.0 - t, 3); // Ease out cubic
            } else if (cinematic.isClosing) {
                // OUT-PHASE: Slide back to player view
                const elapsedSinceClose = now - cinematic.closeStartTime;
                t = 1.0 - Math.min(1.0, elapsedSinceClose / 1000);
                t = Math.pow(t, 2); // Ease in quadratic

                if (elapsedSinceClose >= 1000) {
                    cinematic.isClosing = false;
                    return;
                }
            }

            // Focused position for the camera
            const zoomFactor = 1.0 - (t * (cinematic.zoom || 0.4));
            const focusPosX = _v1.x;
            const focusPosY = envCameraY * zoomFactor;
            const focusPosZ = _v1.z + (envCameraZ * zoomFactor);

            // Blended Camera Position
            this.camera.setPosition(
                THREE.MathUtils.lerp(cinematic.startPos.x, focusPosX, t),
                THREE.MathUtils.lerp(cinematic.startPos.y, focusPosY, t),
                THREE.MathUtils.lerp(cinematic.startPos.z, focusPosZ, t)
            );

            // Blended LookAt
            _v1.set(
                THREE.MathUtils.lerp(cinematic.startLookAt.x, _v1.x, t),
                THREE.MathUtils.lerp(cinematic.startLookAt.y, _v1.y, t),
                THREE.MathUtils.lerp(cinematic.startLookAt.z, _v1.z, t)
            );
            this.camera.lookAt(_v1);
        }

        if (cinematic.isClosing) return;

        const timeInLine = now - cinematic.lineStartTime;

        // --- 3. ANIMATION & TRIGGERS ---
        const activeScriptLine = cinematic.script[cinematic.lineIndex];
        const familyMembers = this.activeFamilyMembers.current;

        // Speaker Identification
        const currentSpeakerName = activeScriptLine?.speaker || 'Unknown';
        const isPlayerSpeaking = currentSpeakerName.toLowerCase() === 'robert' || currentSpeakerName.toLowerCase() === 'player';

        // Voice sound (Zero-GC Throttled)
        if (timeInLine < cinematic.typingDuration && (now % 200 < 32)) {
            soundManager.playVoice(currentSpeakerName);
        }

        // Animator Sync (Zero-GC iterative loop)
        for (let i = -1; i < familyMembers.length; i++) {
            const fm = i === -1 ? { mesh: this.playerMeshRef.current, name: 'Robert' } : familyMembers[i];
            const mesh = fm.mesh;
            if (!mesh) continue;

            const isCurrentSpeaker = (fm.name === currentSpeakerName) || (i === -1 && isPlayerSpeaking);
            const isSpeaking = isCurrentSpeaker && timeInLine < cinematic.typingDuration;
            const isThinking = isCurrentSpeaker && activeScriptLine?.type === 'thought';

            // Find body for animator
            const body = mesh.userData.isBody ? mesh : mesh.children.find((c: any) => c.userData?.isBody);
            if (body) {
                PlayerAnimator.update(body as THREE.Mesh, {
                    isMoving: false, isRushing: false, isRolling: false,
                    rollStartTime: 0, staminaRatio: 1.0,
                    isSpeaking, isThinking, isIdleLong: false,
                    isSwimming: false, isWading: false,
                    seed: mesh.userData.seed || 0
                }, now, dt);
            }
        }

        // Line Conclusion (Triggers)
        if (timeInLine > cinematic.lineDuration && !cinematic.fadingOut) {
            cinematic.fadingOut = true;

            // Fire Script Triggers
            if (activeScriptLine.trigger) {
                const triggers = activeScriptLine.trigger.split(',');
                for (let j = 0; j < triggers.length; j++) {
                    const rawTrigger = triggers[j].trim();
                    let finalTrigger = rawTrigger;
                    let payload: any = null;

                    if (rawTrigger === 'boss_start') {
                        finalTrigger = 'boss-spawn-trigger';
                        payload = { type: 'BIG_ZOMBIE' };
                    } else if (rawTrigger === 'family_follow') {
                        finalTrigger = 'family-follow';
                        payload = { active: true };
                    }
                    window.dispatchEvent(new CustomEvent(finalTrigger, { detail: payload }));
                }
            }

            // Advance Line
            const nextIdx = cinematic.lineIndex + 1;
            if (nextIdx >= cinematic.script.length) {
                this.endCinematic();
            } else {
                this.playLine(nextIdx);
            }
        }
    }
}

import type React from 'react';