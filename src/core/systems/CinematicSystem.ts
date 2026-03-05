import * as THREE from 'three';
import { GameSessionLogic } from '../GameSessionLogic';
import { System } from './System';
import { CameraSystem } from './CameraSystem';
import { PlayerAnimation } from '../animation/PlayerAnimation';
import { soundManager } from '../../utils/sound';

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

        camera.setPosition(_v1.x, _v1.y, _v1.z);
        camera.lookAt(cinematic.cameraLookAt.x, cinematic.cameraLookAt.y, cinematic.cameraLookAt.z);

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
                    window.dispatchEvent(new CustomEvent(triggers[i].trim()));
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

        for (let i = 0; i < actors.length; i++) {
            const actor = actors[i];
            if (!actor) continue;

            if (!actor.userData.cachedBody) {
                actor.userData.cachedBody = actor.userData.isBody ? actor : actor.children.find((c: any) => c.userData.isBody);
            }

            const body = actor.userData.cachedBody;
            if (!body) continue;

            const actorName = (actor.userData.name || '').toLowerCase();
            const isSpeaking = (actorName === currentSpeakerLower || (actorName === 'player' && isPlayerSpeaking))
                && timeInLine < cinematic.typingDuration;

            PlayerAnimation.update(body as THREE.Mesh, {
                isMoving: false, isRushing: false, isRolling: false,
                rollStartTime: 0, staminaRatio: 1.0,
                isSpeaking, isThinking: false, isIdleLong: false,
                isSwimming: false, isWading: false,
                seed: actor.userData.seed || 0
            }, now, delta);
        }
    }
}

import type React from 'react';