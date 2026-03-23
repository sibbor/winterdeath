import * as THREE from 'three';
import { GameSessionLogic } from '../game/session/GameSessionLogic';
import { System } from './System';
import { CameraSystem } from './CameraSystem';
import { PlayerAnimator } from '../entities/player/PlayerAnimator';
import { soundManager } from '../utils/SoundManager';
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
        if (!script) {
            console.warn(`[CinematicSystem] No script found for id ${scriptId}`);
            return;
        }

        const cinematic = this.cinematicRef.current;
        const camera = this.camera;

        cinematic.active = true;
        cinematic.startTime = performance.now();
        cinematic.script = script;
        cinematic.lineIndex = 0;
        cinematic.speakers = [this.playerMeshRef.current, target]; // [Robert, Subject]

        // Camera setup
        cinematic.cameraBasePos.copy(camera.position);
        cinematic.cameraLookAt.copy(target.position);

        // Midpoint and Relative Offset for zooming/rotating
        const playerPos = this.playerMeshRef.current?.position || new THREE.Vector3();
        cinematic.midPoint.copy(playerPos).lerp(target.position, 0.5);
        cinematic.midPoint.y += 1.5; // Look at head level

        if (params.targetPos) {
            cinematic.cameraBasePos.copy(params.targetPos);
            cinematic.customCameraOverride = true;
        } else {
            // Calculate a nice cinematic angle if not specified
            _v1.copy(playerPos).sub(target.position).normalize();
            _v2.set(_v1.z, 0, -_v1.x).normalize().multiplyScalar(10); // Perpendicular
            _v2.y = 5;
            cinematic.relativeOffset.copy(_v2);
            cinematic.customCameraOverride = false;
        }

        if (params.lookAtPos) {
            cinematic.cameraLookAt.copy(params.lookAtPos);
        }

        cinematic.rotationSpeed = params.rotationSpeed || 0;
        cinematic.zoom = params.zoom || 0.2;
        cinematic.fadingOut = false;

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
        if (!this.cinematicRef.current.active) return;
        this.cinematicRef.current.active = false;
        this.callbacks.setCinematicActive(false);
        this.callbacks.setCurrentLine(null);
        this.callbacks.endCinematic();
    }

    update(_session: GameSessionLogic, delta: number, now: number) {
        const cinematic = this.cinematicRef.current;
        if (!cinematic.active) return; // Skip immediately when not in a cinematic

        this.frame++;
        const frame = this.frame;
        const camera = this.camera;
        const playerMesh = this.playerMeshRef.current;
        const familyMembers = this.activeFamilyMembers.current;

        const timeInLine = now - cinematic.lineStartTime;
        const activeScriptLine = cinematic.script[cinematic.lineIndex];
        const totalElapsed = now - cinematic.startTime;
        const hasCustomCamera = cinematic.customCameraOverride;

        // 1. Camera
        _v1.copy(cinematic.cameraBasePos);

        if (!hasCustomCamera) {
            if (cinematic.rotationSpeed > 0) {
                const rotAngle = totalElapsed * 0.001 * cinematic.rotationSpeed;
                _v2.copy(cinematic.relativeOffset).applyAxisAngle(_UP, rotAngle);
            } else {
                _v2.copy(cinematic.relativeOffset);
            }

            const zoomProgress = Math.min(1.0, totalElapsed / 5000);
            const zoomFactor = 1.0 - (zoomProgress * (cinematic.zoom || 0));
            _v1.copy(cinematic.midPoint).addScaledVector(_v2, zoomFactor);
        }

        camera.setPosition(_v1);
        camera.lookAt(cinematic.cameraLookAt);

        // 2. Speaker Identification
        const currentSpeakerName = activeScriptLine?.speaker || 'Unknown';
        const isPlayerSpeaking = currentSpeakerName.toLowerCase() === 'robert' || currentSpeakerName.toLowerCase() === 'player';
        let activeSpeakerMesh: THREE.Object3D | undefined = isPlayerSpeaking ? cinematic.speakers[0] : cinematic.speakers[1];

        if (!isPlayerSpeaking && currentSpeakerName !== 'Unknown' && familyMembers) {
            for (let i = 0; i < familyMembers.length; i++) {
                const fm = familyMembers[i];
                if (fm.name === currentSpeakerName || fm.mesh?.userData?.name === currentSpeakerName) {
                    activeSpeakerMesh = fm.mesh;
                    break;
                }
            }
        }

        // 3. Bubble Positioning (3D → 2D) [REMOVED - Handled statically by UI]

        // 4. Animation & Sound
        if (timeInLine < cinematic.typingDuration && frame % 6 === 0) {
            soundManager.playVoice(currentSpeakerName);
        }

        if (timeInLine > cinematic.lineDuration && !cinematic.fadingOut) {
            cinematic.fadingOut = true;
            if (activeScriptLine.trigger) {
                const triggers = activeScriptLine.trigger.split(',');
                for (let i = 0; i < triggers.length; i++) {
                    const rawTrigger = triggers[i].trim();
                    let finalTrigger = rawTrigger;
                    let payload: any = null;

                    // Normalize shorthand triggers to engine events
                    if (rawTrigger === 'boss_start') {
                        finalTrigger = 'boss-spawn-trigger';
                        payload = { type: 'BIG_ZOMBIE' }; // Default boss type
                    } else if (rawTrigger === 'family_follow') {
                        finalTrigger = 'family-follow';
                        payload = { active: true };
                    }

                    window.dispatchEvent(new CustomEvent(finalTrigger, { detail: payload }));
                }
            }
            this.callbacks.playCinematicLine(cinematic.lineIndex + 1);
        }

        // 5. Actor Animations (pre-allocated scratchpad per actor)
        const currentSpeakerLower = currentSpeakerName.toLowerCase();

        // Build actor list into reusable array (avoid spread+map allocation)
        const actors: (THREE.Object3D | null)[] = [];
        for (let i = 0; i < familyMembers.length; i++) actors.push(familyMembers[i].mesh);
        actors.push(playerMesh);
        if (cinematic.speakers[1] && !actors.includes(cinematic.speakers[1])) {
            actors.push(cinematic.speakers[1]);
        }

        for (let i = 0; i < actors.length; i++) {
            const actor = actors[i];
            if (!actor) continue;

            const actorName = (actor.userData.name || '').toLowerCase();
            const isSpeaking = (actorName === currentSpeakerLower || (actorName === 'player' && isPlayerSpeaking) || (actor === cinematic.speakers[1] && !isPlayerSpeaking))
                && timeInLine < cinematic.typingDuration;

            const isThinking = (actorName === currentSpeakerLower || (actorName === 'player' && isPlayerSpeaking))
                && activeScriptLine?.type === 'thought';

            // Named Animation Clip Support (e.g. for Bosses or custom GLTFs)
            if (actor.userData.mixer && isSpeaking) {
                const action = actor.userData.mixer.clipAction('speak');
                if (action) {
                    action.play();
                }
            } else if (actor.userData.mixer && !isSpeaking) {
                const action = actor.userData.mixer.clipAction('speak');
                if (action) action.stop();
            }

            if (!actor.userData.cachedBody) {
                actor.userData.cachedBody = actor.userData.isBody ? actor : actor.children.find((c: any) => c.userData.isBody);
            }

            const body = actor.userData.cachedBody;
            if (!body) continue;

            PlayerAnimator.update(body as THREE.Mesh, {
                isMoving: false, isRushing: false, isRolling: false,
                rollStartTime: 0, staminaRatio: 1.0,
                isSpeaking, isThinking, isIdleLong: false,
                isSwimming: false, isWading: false,
                seed: actor.userData.seed || 0
            }, now, delta);
        }
    }
}

import type React from 'react';