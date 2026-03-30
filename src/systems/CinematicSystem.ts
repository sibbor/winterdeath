import React from 'react';
import * as THREE from 'three';
import { System } from './System';
import { CameraSystem } from './CameraSystem';
import { PlayerAnimator } from '../entities/player/PlayerAnimator';
import { soundManager } from '../utils/audio/SoundManager';
import { STORY_SCRIPTS } from '../content/dialogues';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();

export class CinematicSystem implements System {
    id = 'cinematic';

    public cinematicRef: React.MutableRefObject<any>;
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
        onAction: (action: any) => void;
    };

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

    public startCinematic(target: THREE.Object3D, scriptId: number, params: any = {}) {
        const script = STORY_SCRIPTS[scriptId];

        // --- VINTERDÖD FIX: ANTI-CRASH SKÖLD ---
        // Om scriptet inte finns (t.ex. om Sector 2 skickar fel ID), 
        // avbryt omedelbart. Skapa INGEN endless loop!
        if (!script || script.length === 0) {
            console.error(`[CinematicSystem] Kritiskt fel: Script ID ${scriptId} saknas eller är tomt! Avbryter.`);
            this.callbacks.setCinematicActive(false); // Frigör UI
            return;
        }

        const cinematic = this.cinematicRef.current;

        // Anti-Spam: Ignorera om vi redan spelar detta exakta manus
        if (cinematic.active && cinematic.script === script) return;

        cinematic.active = true;
        cinematic.isClosing = false;
        cinematic.target = target;
        cinematic.script = script;
        cinematic.lineIndex = -1;

        const currentNow = performance.now();
        cinematic.startTime = currentNow;
        cinematic.lastFrameTime = currentNow;

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

        // Spärr mot dubbelklick och stamning
        if (cinematic.lineIndex === index && (currentNow - cinematic.lineStartTime) < 100) return;

        // VINTERDÖD FIX: GARANTI ATT TRIGGERS ALLTID KÖRS, ÄVEN OM MAN SPOLAR FÖRBI TEXTEN!
        if (cinematic.lineIndex >= 0 && cinematic.lineIndex < cinematic.script.length) {
            const prevLine = cinematic.script[cinematic.lineIndex];
            if (prevLine.trigger && !cinematic.fadingOut) {
                cinematic.fadingOut = true;
                this.callbacks.onAction(prevLine.trigger);
            }
        }

        if (index >= cinematic.script.length) {
            this.endCinematic();
            return;
        }

        const line = cinematic.script[index];
        cinematic.lineIndex = index;
        cinematic.lineStartTime = currentNow;
        cinematic.fadingOut = false;

        const textToDisplay = line.text || "";
        cinematic.typingDuration = textToDisplay.length * 30;
        cinematic.lineDuration = Math.max(2000, cinematic.typingDuration + 1500);

        this.callbacks.setCurrentLine(line);
    }

    public getScript(scriptId: number) {
        return STORY_SCRIPTS[scriptId];
    }

    public stop() {
        const cinematic = this.cinematicRef.current;
        if (!cinematic.active && !cinematic.isClosing) return;

        cinematic.active = false;
        cinematic.isClosing = true;
        cinematic.closeStartTime = performance.now();

        // VINTERDÖD FIX: Lämna tillbaka kontrollen till spelkameran när vi är klara
        this.camera.setCinematic(false);

        this.callbacks.setCurrentLine(null);
        this.callbacks.setCinematicActive(false);

        // SYNC CLEAR: Prevent "ghost" data from being accessed in the next sector
        cinematic.target = null;
        cinematic.script = [];
        cinematic.lineIndex = -1;
    }

    public endCinematic() {
        this.callbacks.endCinematic();
    }

    public update(context: any, dt: number, engineNow: number) {
        const cinematic = this.cinematicRef.current;
        if (!cinematic.active && !cinematic.isClosing) return;

        const now = performance.now();
        const totalElapsed = now - cinematic.startTime;

        // VINTERDÖD FIX: Vår egen delta-tid! Detta gör att karaktärerna andas och pratar 
        // ÄVEN OM spelets huvudsakliga 'dt' är fryst på 0 under dialogen!
        const cinematicDt = cinematic.lastFrameTime ? (now - cinematic.lastFrameTime) / 1000 : 0.016;
        cinematic.lastFrameTime = now;

        const playerPos = _v2;
        if (this.playerMeshRef.current) {
            this.playerMeshRef.current.getWorldPosition(playerPos);
        }

        // --- 1. CAMERA INTERPOLATION ---
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
                    cinematic.target = null;
                    return;
                }
            }

            // OMLOPPSBANA RUNT SPELAREN
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

        if (timeInLine < cinematic.typingDuration && (now % 200 < 32)) {
            soundManager.playVoice(currentSpeakerName);
        }

        // Animator Sync (Nu med CinematicDt så de rör sig under paus!)
        for (let i = -1; i < familyMembers.length; i++) {
            const fm = i === -1 ? { mesh: this.playerMeshRef.current, name: 'Robert' } : familyMembers[i];
            const mesh = fm.mesh;
            if (!mesh) continue;

            const isCurrentSpeaker = (fm.name === currentSpeakerName) || (i === -1 && isPlayerSpeaking);
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

        // Autoamtic ending (if the player does not skip)
        if (timeInLine > cinematic.lineDuration && !cinematic.fadingOut) {
            const nextIdx = cinematic.lineIndex + 1;
            this.playLine(nextIdx);
        }
    }
}