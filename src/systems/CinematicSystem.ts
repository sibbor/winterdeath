import React from 'react';
import * as THREE from 'three';
import { System } from './System';
import { CameraSystem } from './CameraSystem';
import { PlayerAnimator } from '../entities/player/PlayerAnimator';
import { soundManager } from '../utils/audio/SoundManager';
import { STORY_SCRIPTS } from '../content/dialogues';

// Zero-GC Vektorer för kameramatte
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();

export class CinematicSystem implements System {
    id = 'cinematic';

    public cinematicRef: React.MutableRefObject<any>;
    private camera: CameraSystem;
    private playerMeshRef: React.MutableRefObject<THREE.Group | null>;
    private bubbleRef: React.RefObject<any>;
    private activeFamilyMembers: React.MutableRefObject<any[]>;
    private callbacks: {
        setCurrentLine: (line: any) => void;
        setCinematicActive: (active: boolean) => void;
        endCinematic: () => void;
        playCinematicLine: (index: number) => void;
        setTailPosition: (pos: 'bottom' | 'top' | 'left' | 'right') => void;
        onAction: (action: any) => void;
    };

    constructor(opts: {
        cinematicRef: React.MutableRefObject<any>;
        camera: CameraSystem;
        playerMeshRef: React.MutableRefObject<THREE.Group | null>;
        bubbleRef: React.RefObject<any>;
        activeFamilyMembers: React.MutableRefObject<any[]>;
        callbacks: {
            setCurrentLine: (line: any) => void;
            setCinematicActive: (active: boolean) => void;
            endCinematic: () => void;
            playCinematicLine: (index: number) => void;
            setTailPosition: (pos: 'bottom' | 'top' | 'left' | 'right') => void;
            onAction: (action: any) => void;
        };
    }) {
        this.cinematicRef = opts.cinematicRef;
        this.camera = opts.camera;
        this.playerMeshRef = opts.playerMeshRef;
        this.bubbleRef = opts.bubbleRef;
        this.activeFamilyMembers = opts.activeFamilyMembers;
        this.callbacks = opts.callbacks;
    }

    // VINTERDÖD FIX: Tar nu emot både sectorId och dialogueId för att matcha den nästlade arrayen
    public startCinematic(target: THREE.Object3D, sectorId: number, dialogueId: number, params: any = {}) {
        const sectorScripts = STORY_SCRIPTS[sectorId];

        if (!sectorScripts) {
            console.error(`[CinematicSystem] Kritiskt fel: Hittar inget manus för Sektor ${sectorId}!`);
            this.callbacks.setCinematicActive(false);
            return;
        }

        const script = sectorScripts[dialogueId];

        if (!script || script.length === 0) {
            console.error(`[CinematicSystem] Kritiskt fel: Dialog ${dialogueId} saknas i Sektor ${sectorId}!`);
            this.callbacks.setCinematicActive(false);
            return;
        }

        const cinematic = this.cinematicRef.current;

        if (cinematic.active && cinematic.script === script) return;

        cinematic.active = true;
        cinematic.isClosing = false;
        cinematic.target = target;
        cinematic.script = script;
        cinematic.sectorId = sectorId;
        cinematic.dialogueId = dialogueId;
        cinematic.lineIndex = -1;

        const currentNow = performance.now();
        cinematic.startTime = currentNow;
        cinematic.lastFrameTime = currentNow;
        cinematic.lastVoiceTime = 0;

        cinematic.zoom = params.zoom || 0.4;
        cinematic.rotationSpeed = params.rotationSpeed || 0.00015;

        this.camera.setCinematic(true);

        cinematic.startPos = this.camera.position.clone();
        cinematic.startLookAt = this.camera.lookAtTarget ? this.camera.lookAtTarget.clone() : new THREE.Vector3();

        this.callbacks.setCinematicActive(true);

        const startLine = params.lineIndex || 0;
        this.playLine(startLine);
    }

    public playLine(index: number) {
        const cinematic = this.cinematicRef.current;
        const currentNow = performance.now();

        // 1. SKYDD: Stoppar loopen om vi når slutet
        if (index >= cinematic.script.length) {
            this.endCinematic();
            return;
        }

        // 2. RPG SKIP: Spola texten om spelaren trycker förbi
        if (index === cinematic.lineIndex + 1) {
            const timeInLine = currentNow - cinematic.lineStartTime;
            if (timeInLine < cinematic.typingDuration) {
                cinematic.lineStartTime = currentNow - cinematic.typingDuration;
                return;
            }
        }

        // Anti-spam skydd
        if (cinematic.lineIndex === index && (currentNow - cinematic.lineStartTime) < 50) return;

        // 3. TRIGGERS: Kör eventuella händelser på den FÖRRA raden
        if (cinematic.lineIndex >= 0 && cinematic.lineIndex < cinematic.script.length) {
            const prevLine = cinematic.script[cinematic.lineIndex];
            if (prevLine.trigger && !cinematic.fadingOut) {
                cinematic.fadingOut = true;
                this.callbacks.onAction(prevLine.trigger);
            }
        }

        // 4. Ladda in nästa rad
        const line = cinematic.script[index];
        cinematic.lineIndex = index;
        cinematic.lineStartTime = currentNow;
        cinematic.fadingOut = false;

        // VINTERDÖD FIX: Fast tidslängd. Längden på översättningsnyckeln fungerar inte för matte.
        cinematic.typingDuration = line.typingDuration || 2500;
        cinematic.lineDuration = line.duration || Math.max(4000, cinematic.typingDuration + 1500);

        this.callbacks.setCurrentLine(line);
        if (line.tail) this.callbacks.setTailPosition(line.tail);
    }

    public getScript(sectorId: number, dialogueId: number) {
        if (!STORY_SCRIPTS[sectorId]) return null;
        return STORY_SCRIPTS[sectorId][dialogueId] || null;
    }

    public stop() {
        const cinematic = this.cinematicRef.current;
        if (!cinematic.active) return;

        cinematic.active = false;
        cinematic.isClosing = true;
        cinematic.closeStartTime = performance.now();

        this.camera.setCinematic(false);
        this.callbacks.setCurrentLine(null);
        this.callbacks.setCinematicActive(false);

        cinematic.target = null;
        cinematic.script = [];
        cinematic.lineIndex = -1;
    }

    public endCinematic() {
        // VINTERDÖD FIX: Ingen this.stop() här. GameSession hanterar nedstängningen!
        this.callbacks.endCinematic();
    }

    public update(context: any, dt: number, engineNow: number) {
        const cinematic = this.cinematicRef.current;
        if (!cinematic.active && !cinematic.isClosing) return;

        const now = performance.now();
        const totalElapsed = now - cinematic.startTime;

        const cinematicDt = cinematic.lastFrameTime ? (now - cinematic.lastFrameTime) / 1000 : 0.016;
        cinematic.lastFrameTime = now;

        const playerPos = _v2;
        if (this.playerMeshRef.current) {
            this.playerMeshRef.current.getWorldPosition(playerPos);
        }

        // --- CAMERA ORBIT MATH ---
        if (cinematic.target) {
            const targetPos = _v3;
            cinematic.target.getWorldPosition(targetPos);

            _v1.set(
                (targetPos.x + playerPos.x) * 0.5,
                (targetPos.y + playerPos.y) * 0.5,
                (targetPos.z + playerPos.z) * 0.5
            );

            let t = 0;
            if (cinematic.active && !cinematic.isClosing) {
                t = Math.min(1.0, totalElapsed / 2000);
                t = 1.0 - Math.pow(1.0 - t, 3);
            } else if (cinematic.isClosing) {
                const elapsedSinceClose = now - cinematic.closeStartTime;
                t = 1.0 - Math.min(1.0, Math.pow(elapsedSinceClose / 1500, 2));
                if (elapsedSinceClose >= 1500) {
                    cinematic.isClosing = false;
                    return;
                }
            }

            const zoomFactor = 1.0 - (t * (cinematic.zoom || 0.4));
            const orbitRadius = 15 * zoomFactor;
            const orbitHeight = 12 * zoomFactor;
            const angle = (totalElapsed * (cinematic.rotationSpeed || 0.00015));

            const focusPosX = _v1.x + Math.sin(angle) * orbitRadius;
            const focusPosY = _v1.y + orbitHeight;
            const focusPosZ = _v1.z + Math.cos(angle) * orbitRadius;

            this.camera.setPosition(
                THREE.MathUtils.lerp(cinematic.startPos.x, focusPosX, t),
                THREE.MathUtils.lerp(cinematic.startPos.y, focusPosY, t),
                THREE.MathUtils.lerp(cinematic.startPos.z, focusPosZ, t)
            );

            _v1.y += 1.5;
            const currentLookAt = this.camera.lookAtTarget || _v1;

            this.camera.lookAt(new THREE.Vector3(
                THREE.MathUtils.lerp(currentLookAt.x, _v1.x, t),
                THREE.MathUtils.lerp(currentLookAt.y, _v1.y, t),
                THREE.MathUtils.lerp(currentLookAt.z, _v1.z, t)
            ));
        }

        if (cinematic.isClosing) return;

        const timeInLine = now - cinematic.lineStartTime;
        const activeScriptLine = cinematic.script[cinematic.lineIndex];
        const familyMembers = this.activeFamilyMembers.current;

        const currentSpeakerName = activeScriptLine?.speaker || 'Unknown';
        const isPlayerSpeaking = currentSpeakerName.toLowerCase() === 'robert' || currentSpeakerName.toLowerCase() === 'player';

        // --- VINTERDÖD FIX: Audio Sync ---
        const timeSinceLastVoice = now - (cinematic.lastVoiceTime || 0);
        if (timeInLine < cinematic.typingDuration && timeSinceLastVoice > 150) {
            cinematic.lastVoiceTime = now;
            soundManager.playVoice(currentSpeakerName);
        }

        // --- VINTERDÖD FIX: Zero-GC Animator Sync ---
        for (let i = -1; i < familyMembers.length; i++) {
            const mesh = i === -1 ? this.playerMeshRef.current : familyMembers[i]?.mesh;
            const name = i === -1 ? 'Robert' : familyMembers[i]?.name;

            if (!mesh) continue;

            const isCurrentSpeaker = (name === currentSpeakerName) || (i === -1 && isPlayerSpeaking);
            const isSpeaking = isCurrentSpeaker && timeInLine < cinematic.typingDuration;
            const isThinking = isCurrentSpeaker && activeScriptLine?.type === 'thought';

            const body = mesh.userData.isBody ? mesh : mesh.children.find((c: any) => c.userData?.isBody);

            if (body) {
                PlayerAnimator.update(body as THREE.Mesh, {
                    isMoving: false, isRushing: false, isRolling: false,
                    rollStartTime: 0, staminaRatio: 1.0,
                    isSpeaking, isThinking, isIdleLong: false,
                    isSwimming: false, isWading: false,
                    seed: mesh.userData.seed || 0
                }, now, cinematicDt);
            }
        }

        // Auto-avancera till nästa rad
        if (timeInLine > cinematic.lineDuration && !cinematic.fadingOut) {
            const nextIdx = cinematic.lineIndex + 1;
            this.playLine(nextIdx);
        }
    }
}