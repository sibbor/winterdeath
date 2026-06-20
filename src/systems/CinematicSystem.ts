import React from 'react';
import * as THREE from 'three';
import { CameraSystem } from './CameraSystem';
import { PlayerAnimator } from '../entities/player/PlayerAnimator';
import { VoiceSounds } from '../utils/audio/AudioLib';
import { STORY_SCRIPTS } from '../content/dialogues';
import { GameSessionState } from '../game/session/GameSessionState';
import { FamilyMemberID } from '../content/constants';
import { System, SystemID } from './System';
import { DialogueLineType } from '../game/session/SectorTypes';
import { DataResolver } from '../core/data/DataResolver';
import { InputAction } from '../core/engine/InputManager';
import { DialogueUIHandle } from '../components/ui/hud/game/DialogueUI';
import { GameSessionLogic } from '../game/session/GameSessionLogic';
import { PlayerStatusFlags } from '../types/CareerStats';

// Zero-GC Vectors for camera math (Allocated only at startup)
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();

// Locked V8 Hidden Class for animator data
const _animState = {
    isMoving: false, isRushing: false, isDodging: false,
    dodgeStartTime: 0, staminaRatio: 1.0,
    isSpeaking: false, isThinking: false, isIdleLong: false,
    isSwimming: false, isWading: false,
    seed: 0,
    renderTime: 0,
    simTime: 0
};

export class CinematicSystem implements System {
    readonly systemId = SystemID.CINEMATIC;
    id = 'cinematic';
    enabled = true;
    persistent = false;

    public cinematicRef: React.MutableRefObject<any>;
    private camera: CameraSystem;
    private playerMeshRef: React.MutableRefObject<THREE.Group | null>;
    private dialogueRef: React.RefObject<DialogueUIHandle>;
    private activeFamilyMembers: React.MutableRefObject<any[]>;
    private callbacks: {
        setCurrentLine: (line: any) => void;
        setCinematicActive: (active: boolean) => void;
        endCinematic: () => void;
        playCinematicLine: (index: number) => void;
        onAction: (action: any) => void;
    };
    private state: GameSessionState;

    constructor(opts: {
        cinematicRef: React.MutableRefObject<any>;
        camera: CameraSystem;
        playerMeshRef: React.MutableRefObject<THREE.Group | null>;
        dialogueRef: React.RefObject<DialogueUIHandle>;
        activeFamilyMembers: React.MutableRefObject<any[]>;
        callbacks: {
            setCurrentLine: (line: any) => void;
            setCinematicActive: (active: boolean) => void;
            endCinematic: () => void;
            playCinematicLine: (index: number) => void;
            onAction: (action: any) => void;
        };
        state: GameSessionState;
    }) {
        this.cinematicRef = opts.cinematicRef;
        this.camera = opts.camera;
        this.playerMeshRef = opts.playerMeshRef;
        this.dialogueRef = opts.dialogueRef;
        this.activeFamilyMembers = opts.activeFamilyMembers;
        this.callbacks = opts.callbacks;
        this.state = opts.state;
    }

    public startCinematic(session: GameSessionLogic, target: THREE.Object3D, sectorId: number, dialogueId?: number, params: any = {}) {
        const sectorScripts = STORY_SCRIPTS[sectorId];

        console.log(`[CinematicSystem] startCinematic called: Sector=${sectorId}, Dialogue=${dialogueId}`);

        if (!sectorScripts) {
            console.error(`[CinematicSystem] Critical error: No script found for Sector ${sectorId}!`);
            this.callbacks.setCinematicActive(false);
            return;
        }

        const safeDialogueId = Number(dialogueId || 0);
        const script = (sectorScripts as any)[safeDialogueId];

        if (!script || script.length === 0) {
            console.error(`[CinematicSystem] Critical error: Dialogue ${safeDialogueId} missing in Sector ${sectorId}!`, {
                passedDialogueId: dialogueId,
                safeDialogueId,
                sectorScriptsKeys: Object.keys(sectorScripts),
                storyScriptsKeys: Object.keys(STORY_SCRIPTS)
            });
            this.callbacks.setCinematicActive(false);
            return;
        }

        const cinematic = this.cinematicRef.current;
        if (!cinematic) {
            console.error("[CinematicSystem] Critical error: cinematicRef.current is null!");
            return;
        }

        console.log(`[CinematicSystem] Starting cinematic: Sector ${sectorId}, Dialogue ${safeDialogueId}, Script Length: ${script.length}`);

        cinematic.active = true;
        cinematic.isClosing = false;
        cinematic.target = target || null;
        cinematic.hasTarget = !!target;
        cinematic.script = script;
        cinematic.sectorId = sectorId;
        cinematic.dialogueId = safeDialogueId;
        cinematic.lineIndex = -1;
        cinematic.fadingOut = false;

        const currentNow = this.state.renderTime;
        cinematic.startTime = currentNow;
        cinematic.lastFrameTime = currentNow;
        cinematic.lastVoiceTime = 0;
        cinematic.lastSkipTime = 0;

        cinematic.zoom = params.zoom !== undefined ? params.zoom : 0.4;
        cinematic.rotationSpeed = params.rotationSpeed !== undefined ? params.rotationSpeed : 0.00015;
        cinematic.customPath = params.customPath || null;
        cinematic.pathDuration = params.pathDuration || 0;
        cinematic.lookAtPos = params.lookAtPos ? new THREE.Vector3().copy(params.lookAtPos) : null;
        cinematic.targetPos = params.targetPos ? new THREE.Vector3().copy(params.targetPos) : null;

        this.camera.setCinematic(true);

        cinematic.startPos = this.camera.position.clone();
        cinematic.startLookAt = this.camera.lookAtTarget ? this.camera.lookAtTarget.clone() : new THREE.Vector3();

        this.state.ui.cinematicActive = true;
        this.callbacks.setCinematicActive(true);

        const startLine = params.lineIndex || 0;
        if (cinematic.script && cinematic.script.length > 0) {
            console.log(`[CinematicSystem] Playing initial line: ${startLine}`);
            this.playLine(startLine);
        } else {
            console.log(`[CinematicSystem] No script found or empty script. Ending.`);
            cinematic.lineIndex = 0;
            cinematic.lineStartTime = currentNow;
            cinematic.lineDuration = cinematic.pathDuration || 5500;
        }
    }

    /**
     * Executes a specific dialogue line by index.
     * Handles typing speed, duration, voice playback, and engine-to-sector triggers.
     */
    public playLine(index: number) {
        const cinematic = this.cinematicRef.current;
        const currentNow = this.state.renderTime;

        if (!cinematic || !cinematic.active) return;

        console.log(`[CinematicSystem] playLine called: index=${index}, CurrentIndex=${cinematic.lineIndex}`);

        // 1. Debounce and bounds checking (RPG Fast-Forward Guard)
        if (cinematic.lineIndex === index && (currentNow - cinematic.lineStartTime) < 100) {
            console.log(`[CinematicSystem] playLine debounced for index=${index}`);
            return;
        }

        if (index >= cinematic.script.length) {
            console.log(`[CinematicSystem] End of script reached at index=${index}`);
            this.stop(); // End cinematic if we reach the end
            return;
        }

        const line = cinematic.script[index];
        if (!line) {
            console.warn(`[CinematicSystem] No line found at index=${index}`);
            return;
        }

        // Run triggers immediately when the line starts to ensure state changes (e.g. boss spawn, family found) execute.
        if (line.trigger) {
            const triggers = Array.isArray(line.trigger) ? line.trigger : [line.trigger];
            triggers.forEach(t => {
                if (this.callbacks.onAction) {
                    const actionObj = (typeof t === 'string' || typeof t === 'number') ? { type: t } : t;
                    this.callbacks.onAction(actionObj);
                }
            });
        }

        // --- LINE ACTIVATION ---
        console.log(`[CinematicSystem] Activating line ${index}: "${line.text}"`);

        cinematic.lineIndex = index;
        cinematic.lineStartTime = currentNow;
        cinematic.fadingOut = false;

        // 4. Calculate durations (Zero-GC word counting)
        const text = line.text || '';
        let wordCount = 0;
        let inWord = false;
        for (let idxChar = 0; idxChar < text.length; idxChar++) {
            const char = text.charCodeAt(idxChar);
            const isSp = char === 32 || char === 9 || char === 10 || char === 13; // Space, Tab, Newline
            if (isSp) {
                inWord = false;
            } else if (!inWord) {
                inWord = true;
                wordCount++;
            }
        }
        if (wordCount === 0) wordCount = 5;

        // Proportional talking duration (audio beeps & mouth movements)
        cinematic.typingDuration = line.typingDuration || Math.max(1000, wordCount * 200);
        // Dynamic auto-proceed duration based on word count (approx. 450ms per word + 2s buffer, min 3s)
        cinematic.lineDuration = line.duration || Math.max(3000, wordCount * 450 + 2000);

        // 5. Update Telemetry and UI Bridge (SMI-Safe)
        const resolvedId = DataResolver.resolveSpeaker(line.speaker);
        cinematic.currentSpeakerId = resolvedId;

        // Sync to the high-performance telemetry bridge for React/HUD
        this.state.ui.cinematicLine.currentSpeakerId = resolvedId;
        this.state.ui.cinematicLine.active = true;
        this.state.ui.cinematicLine.speaker = line.speaker !== undefined ? line.speaker : '';
        this.state.ui.cinematicLine.text = line.text || '';

        // Notify the React layer (Triggers re-render of the CinematicDialogue typewriter)
        this.callbacks.setCurrentLine(line);
    }

    public getScript(sectorId: number, dialogueId: number) {
        if (!STORY_SCRIPTS[sectorId]) return null;
        // Handle both numeric and string keys for robustness
        const scripts = STORY_SCRIPTS[sectorId];
        return (scripts as any)[dialogueId] || (scripts as any)[String(dialogueId)] || null;
    }

    public stop() {
        const cinematic = this.cinematicRef.current;
        if (!cinematic.active && !cinematic.isClosing) return;

        VoiceSounds.stopAllDialogueBeeps?.();

        console.log(`[CinematicSystem] Stopping cinematic.`);
        cinematic.active = false;
        cinematic.isClosing = true;
        cinematic.closeStartTime = this.state.renderTime;

        // Reset state & Flush pending triggers
        this.state.sectorState.pendingTrigger = null;

        this.state.ui.cinematicLine.active = false;
        this.state.ui.cinematicLine.speaker = '';
        this.state.ui.cinematicLine.text = '';

        this.state.ui.cinematicActive = false;
        this.callbacks.setCurrentLine(null);
        this.callbacks.setCinematicActive(false);

        cinematic.lineIndex = -1;
        cinematic.fadingOut = false;
        if (cinematic.script) {
            cinematic.script.length = 0;
        }
    }

    public endCinematic() {
        this.callbacks.endCinematic();
    }

    public update(session: GameSessionLogic, delta: number, simTime: number, renderTime: number) {
        const cinematic = this.cinematicRef.current;
        if (!cinematic.active && !cinematic.isClosing) return;

        const state = session.state;
        const isDead = (state.combat.statusFlags & PlayerStatusFlags.DEAD) !== 0;
        if (isDead) {
            this.stop();
            return;
        }

        const now = renderTime;
        const totalElapsed = now - cinematic.startTime;

        cinematic.lastFrameTime = now;

        const playerPos = _v2;
        if (this.playerMeshRef.current) {
            this.playerMeshRef.current.getWorldPosition(playerPos);
        }

        // --- CAMERA ORBIT MATH ---
        if (cinematic.active || cinematic.isClosing) {
            let t = 0;
            // NOTE: t is computed FIRST so all camera branches can use it.
            // There must be NO early return before the auto-advance check at the bottom.
            if (cinematic.active && !cinematic.isClosing) {
                t = Math.min(1.0, totalElapsed / 2000);
                t = 1.0 - Math.pow(1.0 - t, 3); // Cubic ease-out
            } else if (cinematic.isClosing) {
                const elapsedSinceClose = now - cinematic.closeStartTime;
                t = 1.0 - Math.min(1.0, Math.pow(elapsedSinceClose / 1500, 2));
                if (elapsedSinceClose >= 1500) {
                    cinematic.isClosing = false;
                    this.camera.setCinematic(false); // Strictly Inject here to avoid matrix fighting
                    return; // Only safe early-return: closing animation fully done
                }
            }

            if (cinematic.customPath === 'mast_flyover' && cinematic.target) {
                const targetPos = _v3;
                cinematic.target.getWorldPosition(targetPos);

                const basePos = _v1.copy(targetPos).add({ x: -15, y: 5, z: 15 } as any);
                const topPos = _v2.copy(targetPos).add({ x: -10, y: 65, z: 10 } as any);
                const lookAtTop = _v3.copy(targetPos).add({ x: 0, y: 60, z: 0 } as any);

                if (totalElapsed < 1500) {
                    const p1 = totalElapsed / 1500;
                    const smoothP = THREE.MathUtils.smoothstep(p1, 0, 1);
                    this.camera.setPosition(
                        THREE.MathUtils.lerp(cinematic.startPos.x, basePos.x, smoothP),
                        THREE.MathUtils.lerp(cinematic.startPos.y, basePos.y, smoothP),
                        THREE.MathUtils.lerp(cinematic.startPos.z, basePos.z, smoothP)
                    );
                    this.camera.lookAt(
                        THREE.MathUtils.lerp(cinematic.startLookAt.x, targetPos.x, smoothP),
                        THREE.MathUtils.lerp(cinematic.startLookAt.y, targetPos.y, smoothP),
                        THREE.MathUtils.lerp(cinematic.startLookAt.z, targetPos.z, smoothP)
                    );
                } else if (totalElapsed < 3500) {
                    const p2 = (totalElapsed - 1500) / 2000;
                    const smoothP = THREE.MathUtils.smoothstep(p2, 0, 1);
                    this.camera.setPosition(
                        THREE.MathUtils.lerp(basePos.x, topPos.x, smoothP),
                        THREE.MathUtils.lerp(basePos.y, topPos.y, smoothP),
                        THREE.MathUtils.lerp(basePos.z, topPos.z, smoothP)
                    );
                    this.camera.lookAt(
                        THREE.MathUtils.lerp(targetPos.x, lookAtTop.x, smoothP),
                        THREE.MathUtils.lerp(targetPos.y, lookAtTop.y, smoothP),
                        THREE.MathUtils.lerp(targetPos.z, lookAtTop.z, smoothP)
                    );
                } else if (totalElapsed < 9500) {
                    const circleElapsed = totalElapsed - 3500;
                    const angle = circleElapsed * 0.0005;
                    const radius = 15;
                    const focusPosX = lookAtTop.x + Math.sin(angle) * radius;
                    const focusPosY = lookAtTop.y + 5;
                    const focusPosZ = lookAtTop.z + Math.cos(angle) * radius;

                    this.camera.setPosition(focusPosX, focusPosY, focusPosZ);
                    this.camera.lookAt(lookAtTop);
                } else if (totalElapsed < 10000) {
                    const panAngle = 6000 * 0.0005;
                    const radius = 15;
                    const panPosX = lookAtTop.x + Math.sin(panAngle) * radius;
                    const panPosY = lookAtTop.y + 5;
                    const panPosZ = lookAtTop.z + Math.cos(panAngle) * radius;

                    const p4 = (totalElapsed - 9500) / 500;
                    const smoothP = THREE.MathUtils.smoothstep(p4, 0, 1);
                    this.camera.setPosition(
                        THREE.MathUtils.lerp(panPosX, basePos.x, smoothP),
                        THREE.MathUtils.lerp(panPosY, basePos.y, smoothP),
                        THREE.MathUtils.lerp(panPosZ, basePos.z, smoothP)
                    );
                    this.camera.lookAt(
                        THREE.MathUtils.lerp(lookAtTop.x, targetPos.x, smoothP),
                        THREE.MathUtils.lerp(lookAtTop.y, targetPos.y, smoothP),
                        THREE.MathUtils.lerp(lookAtTop.z, targetPos.z, smoothP)
                    );
                } else if (totalElapsed < 13000) {
                    this.camera.setPosition(basePos.x, basePos.y, basePos.z);
                    this.camera.lookAt(targetPos);
                } else {
                    if (!cinematic.script || cinematic.script.length === 0) {
                        this.endCinematic();
                    }
                }
            } else if (cinematic.hasTarget && cinematic.target) {
                if (cinematic.targetPos && cinematic.lookAtPos && cinematic.rotationSpeed === 0) {
                    this.camera.setPosition(cinematic.targetPos.x, cinematic.targetPos.y, cinematic.targetPos.z);
                    this.camera.lookAt(cinematic.lookAtPos);
                } else {
                    // Mesh orbit: smooth entry from player camera into midpoint orbit between
                    // the player and the target NPC.
                    cinematic.target.getWorldPosition(_v3);

                    _v1.set(
                        (_v3.x + playerPos.x) * 0.5,
                        (_v3.y + playerPos.y) * 0.5,
                        (_v3.z + playerPos.z) * 0.5
                    );

                    const zoomFactor = 1.0 - (t * (cinematic.zoom || 0.4));
                    const angle = totalElapsed * (cinematic.rotationSpeed || 0.00015);
                    const focusPosX = _v1.x + Math.sin(angle) * (15 * zoomFactor);
                    const focusPosY = _v1.y + (12 * zoomFactor);
                    const focusPosZ = _v1.z + Math.cos(angle) * (15 * zoomFactor);

                    this.camera.setPosition(
                        THREE.MathUtils.lerp(cinematic.startPos.x, focusPosX, t),
                        THREE.MathUtils.lerp(cinematic.startPos.y, focusPosY, t),
                        THREE.MathUtils.lerp(cinematic.startPos.z, focusPosZ, t)
                    );

                    // Lerp lookAt from startLookAt — NOT from the lagged camera.lookAtTarget,
                    // which would compound drift further every frame.
                    _v1.y += 1.5;
                    this.camera.lookAt(
                        THREE.MathUtils.lerp(cinematic.startLookAt.x, _v1.x, t),
                        THREE.MathUtils.lerp(cinematic.startLookAt.y, _v1.y, t),
                        THREE.MathUtils.lerp(cinematic.startLookAt.z, _v1.z, t)
                    );
                }
            } else if (cinematic.hasTarget && cinematic.targetPos) {
                // Mesh-less orbit: fixed world coordinate (Sector 3 path triggers).
                _v1.copy(cinematic.targetPos);
                const tFast = Math.min(1.0, t * 2); // faster entry for static positions
                const angle = totalElapsed * (cinematic.rotationSpeed || 0.00015);
                const radius = 25 * (cinematic.zoom || 0.4);

                this.camera.setPosition(
                    THREE.MathUtils.lerp(cinematic.startPos.x, _v1.x + Math.cos(angle) * radius, tFast),
                    THREE.MathUtils.lerp(cinematic.startPos.y, _v1.y + 15 * (cinematic.zoom || 0.4), tFast),
                    THREE.MathUtils.lerp(cinematic.startPos.z, _v1.z + Math.sin(angle) * radius, tFast)
                );

                const lookTarget = cinematic.lookAtPos || _v1;
                this.camera.lookAt(
                    THREE.MathUtils.lerp(cinematic.startLookAt.x, lookTarget.x, tFast),
                    THREE.MathUtils.lerp(cinematic.startLookAt.y, lookTarget.y, tFast),
                    THREE.MathUtils.lerp(cinematic.startLookAt.z, lookTarget.z, tFast)
                );
            }
        }

        if (cinematic.isClosing) return;

        const timeInLine = now - cinematic.lineStartTime;
        const activeScriptLine = cinematic.script[cinematic.lineIndex];
        const familyMembers = this.activeFamilyMembers.current;
        const speakerId = activeScriptLine?.speaker ?? FamilyMemberID.UNKNOWN;

        // --- INPUT SKIP HANDLING (RPG Fast-Forward) ---
        const input = (session as any).input || session.engine.input;
        if (input && (input.isPressed(InputAction.INTERACT) || input.isPressed(InputAction.FIRE))) {
            const skipNow = now;
            if (skipNow - (cinematic.lastSkipTime || 0) > 250) {
                cinematic.lastSkipTime = skipNow;
                this.state.ui.cinematicLine.lastSkipTime = skipNow;

                // Advance to next line (This flushes triggers of the current line)
                this.playLine(cinematic.lineIndex + 1);
            }
        }

        // --- AUDIO SYNC ---
        const timeSinceLastVoice = now - (cinematic.lastVoiceTime || 0);
        if (timeInLine < cinematic.typingDuration && timeSinceLastVoice > 150) {
            cinematic.lastVoiceTime = now;
            VoiceSounds.playDialogueBeep(speakerId);
        }

        // --- ZERO-GC ANIMATOR SYNC ---
        const currentSpeakerId = cinematic.currentSpeakerId;

        for (let i = -1; i < familyMembers.length; i++) {
            const mesh = i === -1 ? this.playerMeshRef.current : familyMembers[i]?.mesh;
            const memberId = i === -1 ? FamilyMemberID.ROBERT : familyMembers[i]?.id;

            if (!mesh) continue;

            const isCurrentSpeaker = memberId === currentSpeakerId;
            const isSpeaking = isCurrentSpeaker && timeInLine < cinematic.typingDuration;
            const isThinking = isCurrentSpeaker && activeScriptLine?.type === DialogueLineType.THOUGHT;

            const body = mesh.userData.isBody ? mesh : mesh.children.find((c: any) => c.userData?.isBody);

            if (body) {
                _animState.isSpeaking = isSpeaking;
                _animState.isThinking = isThinking;
                _animState.seed = mesh.userData.seed || 0;
                _animState.renderTime = now;
                _animState.simTime = now;

                PlayerAnimator.update(body as THREE.Mesh, _animState, now, delta);
            }
        }

        if (timeInLine > cinematic.lineDuration && !cinematic.fadingOut) {
            const nextIdx = cinematic.lineIndex + 1;
            console.log(`[CinematicSystem] Auto-advancing to index ${nextIdx} (TimeInLine: ${timeInLine}, Duration: ${cinematic.lineDuration})`);
            this.playLine(nextIdx);
        }
    }
}
