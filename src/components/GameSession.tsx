import React, { useEffect, useRef, useMemo, useState, useImperativeHandle, useCallback } from 'react';
import * as THREE from 'three';
import TouchController from './ui/TouchController';
import { Engine } from '../core/engine/Engine';
import { GameSessionLogic } from '../core/GameSessionLogic';
import { PlayerStats, CinematicLine, NotificationState, SectorTrigger, MapItem, SectorState, SectorStats, TriggerAction, Obstacle, GameCanvasProps, DeathPhase, GraphicsSettings, GameScreen } from '../types';
import { SectorContext } from '../types/SectorEnvironment';
import { BOSSES, SECTOR_THEMES, FAMILY_MEMBERS, LEVEL_CAP, CAMERA_HEIGHT } from '../content/constants';
import { STORY_SCRIPTS } from '../content/dialogues';
import { soundManager } from '../utils/sound';
import { haptic } from '../utils/HapticManager';
import { t } from '../utils/i18n';
import { createProceduralTextures, ModelFactory } from '../utils/assets';
import { SectorGenerator } from '../core/world/SectorGenerator';
import { PathGenerator } from '../core/world/PathGenerator';
import { ProjectileSystem } from '../core/weapons/ProjectileSystem';
import { FXSystem } from '../core/systems/FXSystem';
import { EnemyManager, Enemy } from '../core/EnemyManager';
import { HudSystem } from '../core/systems/HudSystem';
import { PlayerAnimation } from '../core/animation/PlayerAnimation';
import { CinematicSystem } from '../core/systems/CinematicSystem';
import { FamilySystem } from '../core/systems/FamilySystem';
import { CameraSystem } from '../core/systems/CameraSystem';
import { TriggerHandler } from '../core/systems/TriggerHandler';
import { LightingSystem } from '../core/systems/LightingSystem';
import { DeathSystem } from '../core/systems/DeathSystem';
import { AssetPreloader } from '../core/systems/AssetPreloader';
import { PlayerMovementSystem } from '../core/systems/PlayerMovementSystem';
import { VehicleMovementSystem } from '../core/systems/VehicleMovementSystem';
import { PlayerCombatSystem } from '../core/systems/PlayerCombatSystem';
import { WorldLootSystem } from '../core/systems/WorldLootSystem';
import { PlayerInteractionSystem } from '../core/systems/PlayerInteractionSystem';
import { EnemySystem } from '../core/systems/EnemySystem';
import { SectorSystem } from '../core/systems/SectorSystem';
import { FootprintSystem } from '../core/systems/FootprintSystem';
import ScreenPlayerDied from './game/ScreenPlayerDied';
import { ScreenPlaygroundEnemyStation } from './game/ScreenPlaygroundEnemyStation';
import { ScreenPlaygroundEnvironmentStation } from './game/ScreenPlaygroundEnvironmentStation';
import ScreenArmory from './camp/ScreenArmory';
import ScreenPlaygroundArmoryStation from './game/ScreenPlaygroundArmoryStation';
import CinematicBubble from './game/CinematicBubble';
import GameUI from './game/GameUI';
import { requestWakeLock, releaseWakeLock } from '../utils/device';

// --- ZERO-GC Scratchpads ---
const _vCamera = new THREE.Vector3();
const _vInteraction = new THREE.Vector3();
const _fxCallbacks: any = { spawnPart: null, spawnDecal: null };
const _animStateScratch: any = { isMoving: false, isRushing: false, isRolling: false, rollStartTime: 0, staminaRatio: 1.0, isSpeaking: false, isThinking: false, isIdleLong: false, seed: 0 };
const _interactionScreenPosScratch = { x: 0, y: 0 };

// Pre-allocated array for lights sorting to avoid GC
const _sortableLightsScratch: { light: THREE.PointLight, distSq: number }[] = [];
for (let i = 0; i < 64; i++) {
    _sortableLightsScratch.push({ light: null as any, distSq: 0 });
}

// Pre-allocated object for TriggerHandler callbacks
const _triggerOptionsScratch: any = {
    spawnBubble: null,
    removeVisual: null,
    onClueFound: null,
    onTrigger: null,
    onAction: null,
    collectedCluesRef: null,
    t: null
};

const seededRandom = (seed: number) => {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return () => {
        return (s = s * 16807 % 2147483647) / 2147483647;
    };
};

export interface GameSessionHandle {
    requestPointerLock: () => void;
    getSectorStats: (isExtraction?: boolean, aborted?: boolean) => SectorStats;
    triggerInput: (key: string) => void;
    rotateCamera: (dir: number) => void;
}

const GameSession = React.forwardRef<GameSessionHandle, GameCanvasProps>((props, ref) => {
    const propsRef = useRef(props);
    const engineRef = useRef<Engine | null>(null);
    const gameSessionRef = useRef<GameSessionLogic | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const chatOverlayRef = useRef<HTMLDivElement>(null);
    const sectorContextRef = useRef<SectorContext | null>(null);

    const stateRef = useRef<ReturnType<typeof GameSessionLogic.createInitialState>>(null!);
    if (!stateRef.current) {
        stateRef.current = GameSessionLogic.createInitialState(props);
    }

    useEffect(() => {
        if (props.onUpdateHUD) props.onUpdateHUD({});

        requestWakeLock();

        const handleOpenStation = (e: any) => {
            const type = e.detail?.type;
            if (type) {
                setActiveModal(type);
                activeModalRef.current = type;
                if (document.pointerLockElement) document.exitPointerLock();
            }
        };
        window.addEventListener('open_station', handleOpenStation);

        return () => {
            releaseWakeLock();
            window.removeEventListener('open_station', handleOpenStation);
        };
    }, []);

    useEffect(() => { propsRef.current = props; }, [props]);

    const lastSectorIndex = AssetPreloader.getLastSectorIndex();
    const isSameSector = lastSectorIndex === props.currentSector;
    const isWarmedUp = AssetPreloader.isWarmedUp();
    const useInstantLoad = isSameSector && isWarmedUp;

    const [isSectorLoading, setIsSectorLoading] = useState(!useInstantLoad);
    const [deathPhase, setDeathPhase] = useState<DeathPhase>('NONE');
    const deathPhaseRef = useRef<DeathPhase>('NONE');
    useEffect(() => { deathPhaseRef.current = deathPhase; }, [deathPhase]);

    const activeBubbles = useRef<any[]>([]);
    const hasEndedSector = useRef(false);
    const collectedCluesRef = useRef<SectorTrigger[]>([]);
    const distanceTraveledRef = useRef(0);
    const lastTeleportRef = useRef<number>(0);
    const lastDrawCallsRef = useRef(0);
    const cameraAngleRef = useRef(0);
    const cameraAngleTargetRef = useRef(0);
    const cameraHeightModifierRef = useRef(0);

    // Zero-GC prevPos tracker
    const prevPosRef = useRef<THREE.Vector3>(new THREE.Vector3());
    const hasSetPrevPosRef = useRef<boolean>(false);

    const [cinematicActive, setCinematicActive] = useState(false);
    const [currentLine, setCurrentLine] = useState<any>(null);
    const bubbleRef = useRef<HTMLDivElement>(null);
    const [bossIntroActive, setBossIntroActive] = useState(false);

    useEffect(() => {
        if (props.onBossIntroStateChange) props.onBossIntroStateChange(bossIntroActive);
    }, [bossIntroActive]);

    const textures = useMemo(() => createProceduralTextures(), []);
    const currentSector = useMemo(() => SectorSystem.getSector(props.currentSector), [props.currentSector]);
    const currentScript = useMemo(() => STORY_SCRIPTS[props.currentSector] || [], [props.currentSector]);

    // --- Övergångshanterare från PROLOGUE till SECTOR ---
    const hasPlayedIntroRef = useRef(false);

    // Återställ flaggan om sektorn byts
    useEffect(() => {
        hasPlayedIntroRef.current = false;
    }, [props.currentSector]);

    // Hantera att musiken och introbubblan triggas ENDAST när Prologen är förbi och spelet börjar
    useEffect(() => {
        if (props.screen === GameScreen.SECTOR && !props.isPaused && isMounted.current && !isSectorLoading) {

            // Starta musiken om den inte redan är igång
            if (currentSector.ambientLoop && !soundManager.isMusicPlaying()) {
                soundManager.playMusic(currentSector.ambientLoop);
            }

            // Starta Introbubblan EN gång
            if (currentSector.intro && !hasPlayedIntroRef.current) {
                hasPlayedIntroRef.current = true;
                setTimeout(() => {
                    if (isMounted.current) {
                        spawnBubble(`🧠 ${t(currentSector.intro!.text)}`);
                        if (currentSector.intro!.sound) soundManager.playEffect(currentSector.intro!.sound);
                    }
                }, currentSector.intro.delay || 1500);
            }
        }
    }, [props.screen, props.isPaused, isSectorLoading, currentSector]);


    useEffect(() => {
        if (props.isMobileDevice) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (propsRef.current.isPaused) return;
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
                if (!propsRef.current.debugMode) return;
                e.preventDefault();
            }
            switch (e.key) {
                case 'ArrowLeft': cameraAngleTargetRef.current += Math.PI / 4; break;
                case 'ArrowRight': cameraAngleTargetRef.current -= Math.PI / 4; break;
                case 'ArrowUp': cameraHeightModifierRef.current = Math.min(20, cameraHeightModifierRef.current + 2.5); break;
                case 'ArrowDown': cameraHeightModifierRef.current = Math.max(-5, cameraHeightModifierRef.current - 2.5); break;
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [props.isMobileDevice]);

    const lastHeartbeatRef = useRef<number>(0);

    const bossIntroTimerRef = useRef<NodeJS.Timeout | null>(null);
    const gameContextRef = useRef<any>(null);
    const setupIdRef = useRef(0);
    const [foundMemberName, setFoundMemberName] = useState('');
    const [interactionType, setInteractionType] = useState<'chest' | 'vehicle' | 'plant_explosive' | 'collectible' | 'knock_on_port' | null>(null);
    const [activeModal, setActiveModal] = useState<'armory' | 'spawner' | 'environment' | null>(null);

    const [interactionScreenPos, setInteractionScreenPos] = useState<{ x: number, y: number } | null>(null);
    const lastInteractionPosRef = useRef<{ x: number, y: number } | null>(null);

    const [forceHideHUD, setForceHideHUD] = useState(false);

    useEffect(() => {
        const h = () => setForceHideHUD(true);
        const s = () => setForceHideHUD(false);
        window.addEventListener('hide_hud', h);
        window.addEventListener('show_hud', s);
        return () => { window.removeEventListener('hide_hud', h); window.removeEventListener('show_hud', s); };
    }, []);

    const interactionTypeRef = useRef<string | null>('NONE');
    useEffect(() => { interactionTypeRef.current = interactionType; }, [interactionType]);

    const cinematicRef = useRef({ active: false, startCamPos: new THREE.Vector3(), endCamPos: new THREE.Vector3(), startTime: 0, duration: 0, script: [] as any[], lineIndex: 0, speakers: [] as any[], cameraBasePos: new THREE.Vector3(), cameraLookAt: new THREE.Vector3(), lineStartTime: 0, lineDuration: 0, typingDuration: 0, fadingOut: false, rotationSpeed: 0, zoom: 0, midPoint: new THREE.Vector3(), relativeOffset: new THREE.Vector3(), customCameraOverride: false, tailPosition: { x: 0, y: 0 } });
    const prevInputRef = useRef(false);
    const bossIntroRef = useRef({ active: false, startTime: 0, bossMesh: null as THREE.Group | null });
    const cameraOverrideRef = useRef<{ active: boolean, targetPos: THREE.Vector3, lookAtPos: THREE.Vector3, endTime: number } | null>(null);
    const isMounted = useRef(true);
    useEffect(() => { isMounted.current = true; return () => { isMounted.current = false; }; }, []);

    const playerGroupRef = useRef<THREE.Group>(new THREE.Group());
    const playerMeshRef = useRef<THREE.Group>(new THREE.Group());
    const familyMemberRef = useRef<any>(null);
    const flashlightRef = useRef<THREE.SpotLight>(null);
    const lockRequestTime = useRef(0);

    const triggerContinue = useCallback(() => {
        if (!hasEndedSector.current) {
            const state = stateRef.current;
            const now = performance.now();
            hasEndedSector.current = true;
            propsRef.current.onDie({
                timeElapsed: now - state.startTime, shotsFired: state.shotsFired, shotsHit: state.shotsHit, throwablesThrown: state.throwablesThrown,
                killsByType: state.killsByType, scrapLooted: state.collectedScrap, xpGained: state.score, bonusXp: 0,
                familyFound: state.familyFound, familyExtracted: state.familyExtracted, damageDealt: state.damageDealt, damageTaken: state.damageTaken,
                bossDamageDealt: state.bossDamageDealt, bossDamageTaken: state.bossDamageTaken,
                distanceTraveled: distanceTraveledRef.current, cluesFound: collectedCluesRef.current,
                collectiblesFound: state.sessionCollectiblesFound,
                collectibles: [],
                dynamicLights: [],
                interactables: [],
                chestsOpened: state.chestsOpened, bigChestsOpened: state.bigChestsOpened,
                isExtraction: false,
                spEarned: (state.level - propsRef.current.stats.level) + state.sessionCollectiblesFound.length + (state.bossesDefeated.length > 0 ? 1 : 0) + (state.familyFound ? 1 : 0),
                seenEnemies: state.seenEnemies, seenBosses: (state.seenBosses || []).concat(stateRef.current.bossesDefeated || []), visitedPOIs: state.visitedPOIs
            }, state.killerType || "Unknown");
        }
    }, []);

    useEffect(() => {
        if (deathPhase === 'NONE' || deathPhase === 'ANIMATION') return;
        const handleContinue = (e: Event) => {
            if (e.type === 'keydown' && (e as KeyboardEvent).key === 'Escape') return;
            triggerContinue();
        };
        window.addEventListener('keydown', handleContinue);
        window.addEventListener('mousedown', handleContinue);
        window.addEventListener('touchstart', handleContinue);
        return () => {
            window.removeEventListener('keydown', handleContinue);
            window.removeEventListener('mousedown', handleContinue);
            window.removeEventListener('touchstart', handleContinue);
        };
    }, [deathPhase]);

    useEffect(() => {
        const isDeathScreenActive = deathPhase === 'MESSAGE' || deathPhase === 'CONTINUE';
        if (propsRef.current.onDeathStateChange) propsRef.current.onDeathStateChange(isDeathScreenActive);
    }, [deathPhase]);

    useEffect(() => {
        const shouldRelease = deathPhase !== 'NONE' || props.isPaused || props.isClueOpen || cinematicActive || bossIntroActive;
        if (shouldRelease) {
            if (document.pointerLockElement) document.exitPointerLock();
        }
    }, [deathPhase, props.isPaused, props.isClueOpen, cinematicActive, bossIntroActive]);

    const activeModalRef = useRef<'armory' | 'spawner' | 'environment' | null>(null);

    useEffect(() => {
        activeModalRef.current = activeModal;
        if (props.onInteractionStateChange) {
            props.onInteractionStateChange(!!activeModal);
        }
        if (activeModal) {
            document.exitPointerLock();
            document.body.style.cursor = 'default';
        } else {
            document.body.style.cursor = '';
        }
    }, [activeModal]);

    useEffect(() => {
        const handleLockChange = () => {
            if (performance.now() - lockRequestTime.current < 1500) return;
            const isExpectedUnlock = stateRef.current.isDead ||
                cinematicRef.current.active ||
                bossIntroRef.current.active ||
                propsRef.current.isPaused ||
                propsRef.current.isClueOpen ||
                activeModalRef.current;

            if (!document.pointerLockElement && props.isRunning && !props.isPaused && !isExpectedUnlock) {
                propsRef.current.onPauseToggle(true);
            }
        };
        document.addEventListener('pointerlockchange', handleLockChange);
        return () => document.removeEventListener('pointerlockchange', handleLockChange);
    }, [props.isRunning, props.isPaused]);

    useEffect(() => {
        if (props.onDialogueStateChange) props.onDialogueStateChange(cinematicActive);
    }, [cinematicActive]);

    useEffect(() => {
        if (engineRef.current && props.initialGraphics) {
            engineRef.current.updateSettings(props.initialGraphics);
        }
    }, [props.initialGraphics]);

    useEffect(() => {
        if (!props.isClueOpen && stateRef.current.clueActive) {
            stateRef.current.isInteractionOpen = false;
            stateRef.current.clueActive = false;
        }
    }, [props.isClueOpen]);

    const isInputEnabled = !props.isPaused && props.isRunning && !cinematicActive && !props.isClueOpen && !props.disableInput && !stateRef.current.isDead && !bossIntroActive && (!cameraOverrideRef.current?.active) && !activeModal;

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (activeModal) return;

                if (bossIntroActive) {
                    setBossIntroActive(false); bossIntroRef.current.active = false; e.stopPropagation(); return;
                }
                if (cinematicActive) { e.stopPropagation(); return; }
                if (propsRef.current.isClueOpen && propsRef.current.onClueClose) {
                    propsRef.current.onClueClose(); e.stopPropagation(); return;
                }

                if (isInputEnabled) {
                    propsRef.current.onPauseToggle(true);
                } else if (propsRef.current.isPaused) {
                    propsRef.current.onPauseToggle(false);
                }
                return;
            }

            if (!isInputEnabled) return;
            const key = e.key;

            if (key.toLowerCase() === 'f') {
                if (flashlightRef.current) {
                    const isOn = flashlightRef.current.intensity > 0;
                    flashlightRef.current.intensity = isOn ? 0 : 400;
                    soundManager.playUiClick();
                }
            }

            if (stateRef.current.isDead) return;
            stateRef.current.lastActionTime = performance.now();
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            if (!isInputEnabled) return;
            const key = e.key;
            if (stateRef.current.isDead) return;
            if (key === ' ') {
                const s = stateRef.current;
                const inp = engineRef.current?.input.state || { w: false, a: false, s: false, d: false };
                if (!s.isRushing && !s.isRolling && s.spaceDepressed) {
                    if (s.stamina >= 5) {
                        s.stamina -= 5; s.lastStaminaUseTime = performance.now();
                        s.isRolling = true;
                        s.rollStartTime = performance.now();
                        s.invulnerableUntil = performance.now() + 400;
                        let dx = 0; let dz = 0;
                        if (inp.w) dz -= 1;
                        if (inp.s) dz += 1;
                        if (inp.a) dx -= 1;
                        if (inp.d) dx += 1;
                        if (dx !== 0 || dz !== 0) s.rollDir.set(dx, 0, dz).normalize();
                        else if (playerGroupRef.current) s.rollDir.copy(new THREE.Vector3(0, 0, 1).applyQuaternion(playerGroupRef.current.quaternion).normalize());
                    }
                }
                s.spaceDepressed = false; s.isRushing = false;
            }
        };
        window.addEventListener('keydown', handleKeyDown); window.addEventListener('keyup', handleKeyUp);
        return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
    }, [isInputEnabled]);


    const spawnNotification = (text: string, duration: number = 3000) => {
        if (!chatOverlayRef.current) return;
        const el = document.createElement('div');
        el.className = 'absolute bg-red-500 border-2 border-black text-white px-4 py-2 text-sm font-bold rounded-lg pointer-events-none transition-opacity duration-300 whitespace-normal z-40 w-max max-w-[280px] text-center shadow-lg';
        el.innerText = text;
        chatOverlayRef.current.appendChild(el);
        activeBubbles.current.push({ element: el, startTime: performance.now(), duration: duration, text: text });
    };

    const spawnBubble = (text: string, duration: number = 3000) => {
        if (!chatOverlayRef.current) return;
        const el = document.createElement('div');
        el.className = 'absolute bg-black/80 border-2 border-black text-white px-4 py-2 text-sm font-bold rounded-lg pointer-events-none transition-opacity duration-300 whitespace-normal z-40 w-max max-w-[280px] text-center shadow-lg';
        el.innerText = text;
        chatOverlayRef.current.appendChild(el);
        activeBubbles.current.push({ element: el, startTime: performance.now(), duration: duration, text: text });
    };

    const activeFamilyMembers = useRef<any[]>([]);

    const startCinematic = (familyMesh: THREE.Group, scriptId?: number, customParams?: { targetPos?: THREE.Vector3, lookAtPos?: THREE.Vector3 }) => {
        if (cinematicRef.current.active) return;
        cinematicRef.current.active = true;

        if (document.pointerLockElement) document.exitPointerLock();
        if (familyMemberRef.current) setFoundMemberName(familyMemberRef.current.name);

        setCinematicActive(true);
        stateRef.current.isInteractionOpen = true;
        stateRef.current.familyFound = true;

        const pPos = new THREE.Vector3();
        playerGroupRef.current!.getWorldPosition(pPos);
        const fPos = new THREE.Vector3();
        familyMesh.getWorldPosition(fPos);

        const midPoint = new THREE.Vector3().lerpVectors(pPos, fPos, 0.15);

        let camOffset = new THREE.Vector3(0, 20, 15);
        let camLookAtOffset = new THREE.Vector3(0, 0, 0);
        let rotationSpeed = 0;
        let zoom = 0;

        if (currentSector.cinematic) {
            const c = currentSector.cinematic;
            if (c.offset) camOffset.set(c.offset.x, c.offset.y, c.offset.z);
            if (c.lookAtOffset) camLookAtOffset.set(c.lookAtOffset.x, c.lookAtOffset.y, c.lookAtOffset.z);
            if (c.rotationSpeed) rotationSpeed = c.rotationSpeed;
            if (c.zoom) zoom = c.zoom;
        }

        const targetLookAt = customParams?.lookAtPos || midPoint.clone().add(camLookAtOffset);
        const targetPos = customParams?.targetPos || midPoint.clone().add(camOffset);
        const selectedScript = scriptId !== undefined ? (STORY_SCRIPTS[scriptId] || []) : currentScript;

        cinematicRef.current = {
            active: true,
            startTime: performance.now(),
            cameraBasePos: targetPos,
            cameraLookAt: targetLookAt,
            speakers: [playerGroupRef.current!, familyMesh],
            script: selectedScript,
            lineIndex: 0,
            lineStartTime: performance.now(),
            lineDuration: 0,
            typingDuration: 0,
            fadingOut: false,
            rotationSpeed,
            zoom,
            midPoint,
            relativeOffset: camOffset,
            customCameraOverride: !!(customParams?.targetPos || customParams?.lookAtPos),
            startCamPos: new THREE.Vector3(), endCamPos: new THREE.Vector3(),
            tailPosition: { x: 0, y: 0 }
        };
        playCinematicLine(0);
    };

    const playCinematicLine = (index: number) => {
        const script = cinematicRef.current.script;
        if (index >= script.length) { endCinematic(); return; }
        const line = script[index];
        setCurrentLine(line);
        const translatedText = t(line.text);
        const typingTime = translatedText.length * 30;
        const totalDuration = typingTime + 2000;
        cinematicRef.current.lineIndex = index;
        cinematicRef.current.lineStartTime = performance.now();
        cinematicRef.current.lineDuration = totalDuration;
        cinematicRef.current.typingDuration = typingTime;
        cinematicRef.current.fadingOut = false;
    };

    const endCinematic = () => {
        setCinematicActive(false);
        setCurrentLine(null);
        stateRef.current.isInteractionOpen = false;
        stateRef.current.familyFound = true;
        cinematicRef.current.active = false;

        if (containerRef.current) {
            engineRef.current?.input.requestPointerLock(containerRef.current);
        }

        const finishedScript = cinematicRef.current.script;
        const lastLine = finishedScript[finishedScript.length - 1];

        if (lastLine && lastLine.trigger) {
            const triggers = lastLine.trigger.split(',');
            for (let i = 0; i < triggers.length; i++) {
                const trimmed = triggers[i].trim();
                if (trimmed === 'boss_start') {
                    setTimeout(() => window.dispatchEvent(new CustomEvent('boss-spawn-trigger')), 1000);
                } else if (trimmed === 'family_follow' || trimmed === 'family-follow') {
                    window.dispatchEvent(new CustomEvent('family-follow'));
                } else {
                    window.dispatchEvent(new CustomEvent(trimmed));
                }
            }
        }
    };

    const gainXp = (amount: number) => {
        const state = stateRef.current;
        state.currentXp += amount; state.score += amount;
        while (state.currentXp >= state.nextLevelXp && state.level < 20) {
            state.currentXp -= state.nextLevelXp;
            state.level++;
            state.nextLevelXp = Math.floor(state.nextLevelXp * 1.2);
            soundManager.playLevelUp();
        }
    };

    const handleTriggerAction = (action: TriggerAction, scene: THREE.Scene) => {
        const { type, payload, delay } = action;
        const execute = () => {
            switch (type) {
                case 'SHOW_TEXT':
                    if (payload && payload.text) spawnBubble(t(payload.text), payload.duration || 3000);
                    break;
                case 'OPEN_UI':
                    if (payload && payload.ui) {
                        let newModal: 'armory' | 'spawner' | 'environment' | null = null;
                        if (payload.ui === 'armory') newModal = 'armory';
                        if (payload.ui === 'spawner') newModal = 'spawner';
                        if (payload.ui === 'environment') newModal = 'environment';

                        setActiveModal(newModal);
                        activeModalRef.current = newModal;

                        stateRef.current.isInteractionOpen = false;
                        if (document.pointerLockElement) document.exitPointerLock();
                    }
                    break;
                case 'PLAY_SOUND':
                    if (payload && payload.id) {
                        if (payload.id === 'explosion') {
                            soundManager.playExplosion();
                            haptic.explosion();
                        }
                        else {
                            soundManager.playUiHover();
                        }
                    }
                    break;
                case 'SPAWN_ENEMY':
                    if (payload) {
                        const count = payload.count || 1;
                        for (let i = 0; i < count; i++) {
                            const spread = payload.spread || 0;
                            const spawnPos = payload.pos ? new THREE.Vector3(payload.pos.x, 0, payload.pos.z) : playerGroupRef.current?.position.clone();
                            if (spawnPos && spread > 0) {
                                spawnPos.x += (Math.random() - 0.5) * spread;
                                spawnPos.z += (Math.random() - 0.5) * spread;
                            }
                            const newEnemy = EnemyManager.spawn(scene, playerGroupRef.current?.position || new THREE.Vector3(), payload.type, spawnPos, stateRef.current.bossSpawned, stateRef.current.enemies.length);
                            if (newEnemy) stateRef.current.enemies.push(newEnemy);
                        }
                    }
                    break;
                case 'UNLOCK_OBJECT':
                    if (payload && payload.id === 'bus') {
                        stateRef.current.busUnlocked = true;
                        stateRef.current.sectorState.busUnlocked = true;
                        spawnBubble(`${t('clues.bus_clear')}`);
                        soundManager.playUiConfirm();
                    }
                    break;
                case 'GIVE_REWARD':
                    if (payload) {
                        if (payload.scrap) stateRef.current.collectedScrap += payload.scrap;
                        if (payload.xp) gainXp(payload.xp);
                        soundManager.playUiConfirm();
                    }
                    break;
                case 'CAMERA_SHAKE':
                    if (payload && payload.amount) stateRef.current.cameraShake = payload.amount;
                    break;
                case 'CAMERA_PAN':
                    if (payload && payload.target && payload.duration) {
                        cameraOverrideRef.current = {
                            active: true,
                            targetPos: new THREE.Vector3(payload.target.x, 30, payload.target.z + 20),
                            lookAtPos: new THREE.Vector3(payload.target.x, 0, payload.target.z),
                            endTime: performance.now() + payload.duration
                        };
                    }
                    break;
                case 'START_WAVE':
                    if (payload && payload.count) {
                        stateRef.current.sectorState.hordeKilled = 0;
                        stateRef.current.sectorState.hordeTarget = payload.count;
                        stateRef.current.sectorState.waveActive = true;
                        spawnNotification(`${t('ui.zombie_wave')}`);
                    }
                    break;
                case 'START_CINEMATIC':
                    if (familyMemberRef.current?.mesh) startCinematic(familyMemberRef.current.mesh);
                    break;
                case 'TRIGGER_FAMILY_FOLLOW':
                    window.dispatchEvent(new Event('family-follow'));
                    break;
            }
        };

        if (delay && delay > 0) setTimeout(execute, delay);
        else execute();
    };

    useImperativeHandle(ref, () => ({
        requestPointerLock: () => {
            if (containerRef.current) {
                lockRequestTime.current = performance.now();
                engineRef.current?.input.requestPointerLock(containerRef.current);
            }
        },
        getSectorStats: (isExtraction: boolean = false, aborted: boolean = false): SectorStats => {
            const state = gameSessionRef.current?.state || {} as any;
            const now = performance.now();
            return {
                timeElapsed: now - (state.startTime || now),
                shotsFired: state.shotsFired || 0,
                shotsHit: state.shotsHit || 0,
                throwablesThrown: state.throwablesThrown || 0,
                killsByType: state.killsByType || {},
                scrapLooted: state.collectedScrap || 0,
                xpGained: state.score || 0,
                familyFound: state.familyFound || stateRef.current.familyFound,
                familyExtracted: isExtraction && (state.familyFound || stateRef.current.familyFound),
                damageDealt: state.damageDealt || 0,
                damageTaken: state.damageTaken || 0,
                bossDamageDealt: state.bossDamageDealt || 0,
                bossDamageTaken: state.bossDamageTaken || 0,
                chestsOpened: state.chestsOpened || 0,
                bigChestsOpened: state.bigChestsOpened || 0,
                distanceTraveled: distanceTraveledRef.current,
                cluesFound: collectedCluesRef.current,
                collectiblesFound: state.sessionCollectiblesFound,
                isExtraction,
                aborted,
                spEarned: (state.level - propsRef.current.stats.level) + (state.sessionCollectiblesFound?.length || 0) + ((state.bossesDefeated?.length || 0) > 0 ? 1 : 0) + (state.familyFound ? 1 : 0),
                seenEnemies: state.seenEnemies || [],
                seenBosses: (state.seenBosses || []).concat(stateRef.current.bossesDefeated || []),
                visitedPOIs: state.visitedPOIs || []
            };
        },
        triggerInput: (key: string) => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: key, bubbles: true }));
            setTimeout(() => {
                window.dispatchEvent(new KeyboardEvent('keyup', { key: key, bubbles: true }));
            }, 50);
        },
        rotateCamera: (dir: number) => {
            cameraAngleTargetRef.current += dir * (Math.PI / 4);
        },
        adjustPitch: (dir: number) => {
            cameraHeightModifierRef.current = Math.max(-10, Math.min(20, cameraHeightModifierRef.current + (dir * 5)));
        }
    }));

    useEffect(() => {
        if (!containerRef.current) return;

        const engine = Engine.getInstance();
        const currentSetupId = ++setupIdRef.current;

        if (playerGroupRef.current) {
            engine.scene.remove(playerGroupRef.current);
            playerGroupRef.current = null as any;
        }

        for (let i = engine.scene.children.length - 1; i >= 0; i--) {
            const child = engine.scene.children[i];
            if (child.name !== 'MainCamera' && !child.userData.isEngineStatic) {
                engine.scene.remove(child);
            }
        }

        if (propsRef.current.initialGraphics) {
            engine.updateSettings(propsRef.current.initialGraphics);
        }
        engine.mount(containerRef.current);
        engineRef.current = engine;
        engine.input.enable();

        const session = new GameSessionLogic(engine);
        if (stateRef.current) session.init(stateRef.current);
        gameSessionRef.current = session;

        const scene = engine.scene;
        const camera = engine.camera;
        FootprintSystem.init(scene);
        EnemyManager.init(scene);

        const spawnDecal = (x: number, z: number, scale: number, material?: THREE.Material) => {
            FXSystem.spawnDecal(scene, stateRef.current.bloodDecals, x, z, scale, material);
        };
        const spawnPart = (x: number, y: number, z: number, type: any, count: number, customMesh?: THREE.Mesh, customVel?: THREE.Vector3, color?: number, scale?: number) => {
            FXSystem.spawnPart(scene, stateRef.current.particles, x, y, z, type, count, customMesh, customVel, color, scale);
        };
        const spawnFloatingText = (x: number, y: number, z: number, text: string, color?: string) => {
            FXSystem.spawnFloatingText(scene, x, y, z, text, color);
        };

        const spawnZombie = (forcedType?: string, forcedPos?: THREE.Vector3) => {
            const origin = (playerGroupRef.current && playerGroupRef.current.children.length > 0)
                ? playerGroupRef.current.position
                : new THREE.Vector3(currentSector.playerSpawn.x, currentSector.playerSpawn.y || 0, currentSector.playerSpawn.z);

            const newEnemy = EnemyManager.spawn(scene, origin, forcedType, forcedPos, stateRef.current.bossSpawned, stateRef.current.enemies.length);
            if (newEnemy) {
                stateRef.current.enemies.push(newEnemy);
                const type = newEnemy.type;
                if (!stateRef.current.seenEnemies.includes(type)) {
                    stateRef.current.seenEnemies.push(type);
                }
            }
        };

        const onCollectibleFoundInternal = (collectibleId: string) => {
            if (!stateRef.current.sessionCollectiblesFound.includes(collectibleId)) {
                stateRef.current.sessionCollectiblesFound.push(collectibleId);
            }
            if (propsRef.current.onCollectibleFound) {
                propsRef.current.onCollectibleFound(collectibleId);
            }
        };

        const _gainXpInternal = (amount: number) => {
            const state = stateRef.current;
            state.score += amount;
            state.currentXp += amount;
            while (state.currentXp >= state.nextLevelXp && state.level < LEVEL_CAP) {
                state.currentXp -= state.nextLevelXp;
                state.level++;
                state.nextLevelXp = Math.floor(state.nextLevelXp * 1.2);
                soundManager.playUiConfirm();
            }
        };

        _fxCallbacks.spawnPart = spawnPart;
        _fxCallbacks.spawnDecal = spawnDecal;

        (stateRef.current as any).callbacks = {
            spawnPart, spawnDecal, spawnFloatingText, spawnZombie, gainXp: _gainXpInternal,
            playSound: (id: string) => soundManager.playEffect(id),
            trackStats: (type: 'damage' | 'hit', amt: number, isBoss: boolean = false) => {
                const s = stateRef.current;
                if (type === 'damage') {
                    s.damageDealt += amt;
                    if (isBoss) s.bossDamageDealt += amt;
                } else if (type === 'hit') {
                    s.shotsHit += amt;
                }
            },
            addScore: _gainXpInternal,
            addFireZone: (z: any) => stateRef.current.fireZones.push(z),
            onDamageDealt: (amt: number, isBoss: boolean) => {
                stateRef.current.damageDealt += amt;
                if (isBoss) stateRef.current.bossDamageDealt += amt;
            },
            makeNoise: (pos: THREE.Vector3, radius: number, type: string) => {
                session.makeNoise(pos, radius, type as any);
            }
        };

        soundManager.resume();
        isMounted.current = true;
        hasEndedSector.current = false;

        for (let i = scene.children.length - 1; i >= 0; i--) {
            const child = scene.children[i];
            if (child.type === 'Group' || child.type === 'Mesh' || child.type === 'Sprite' || child.type === 'PointLight' || child.type === 'SpotLight' || child.type === 'DirectionalLight') {
                if (child.name !== 'MainCamera' && !child.userData.isEngineStatic) {
                    scene.remove(child);
                }
            }
        }

        setDeathPhase('NONE');
        deathPhaseRef.current = 'NONE';
        setBossIntroActive(false);
        bossIntroRef.current.active = false;
        cameraOverrideRef.current = null;
        if (bossIntroTimerRef.current) { clearTimeout(bossIntroTimerRef.current); bossIntroTimerRef.current = null; }

        stateRef.current.startTime = performance.now();
        stateRef.current.isDead = false;
        stateRef.current.bossDefeatedTime = 0;
        stateRef.current.hp = propsRef.current.stats.maxHp;
        stateRef.current.maxHp = propsRef.current.stats.maxHp;
        stateRef.current.stamina = propsRef.current.stats.maxStamina;
        stateRef.current.maxStamina = propsRef.current.stats.maxStamina;
        stateRef.current.score = 0;
        stateRef.current.collectedScrap = 0;
        stateRef.current.killsInRun = 0;
        stateRef.current.killsByType = {};
        stateRef.current.damageDealt = 0;
        stateRef.current.damageTaken = 0;
        stateRef.current.shotsFired = 0;
        stateRef.current.shotsHit = 0;
        stateRef.current.throwablesThrown = 0;
        stateRef.current.familyFound = !!propsRef.current.familyAlreadyRescued;
        stateRef.current.familyExtracted = false;
        stateRef.current.sectorState = {};
        stateRef.current.enemies.length = 0;
        stateRef.current.particles.length = 0;
        stateRef.current.bloodDecals.length = 0;
        stateRef.current.scrapItems.length = 0;
        stateRef.current.chests.length = 0;
        stateRef.current.obstacles.length = 0;
        stateRef.current.triggers.length = 0;
        stateRef.current.bossesDefeated.length = 0;
        stateRef.current.bossSpawned = false;
        stateRef.current.thinkingUntil = 0;
        stateRef.current.speakingUntil = 0;
        stateRef.current.lastActionTime = performance.now();
        stateRef.current.framesSinceHudUpdate = 0;
        stateRef.current.sessionCollectiblesFound.length = 0;

        collectedCluesRef.current = [];
        distanceTraveledRef.current = 0;

        hasSetPrevPosRef.current = false;

        for (let i = 0; i < activeBubbles.current.length; i++) {
            const b = activeBubbles.current[i];
            if (b.element.parentNode) b.element.parentNode.removeChild(b.element);
        }
        activeBubbles.current.length = 0;

        const flickeringLights: any[] = [];
        const burningObjects: any[] = [];
        const mapItems: MapItem[] = [];
        const fSpawn = currentSector.familySpawn;

        const concludeSector = (isExtraction: boolean) => {
            const state = session.state;
            const now = performance.now();
            if (!hasEndedSector.current) {
                hasEndedSector.current = true;
                if (isExtraction) {
                    state.familyExtracted = true;
                    soundManager.stopRadioStatic();
                    soundManager.setReverb(0);
                }

                propsRef.current.onSectorEnded({
                    timeElapsed: now - state.startTime,
                    shotsFired: state.shotsFired,
                    shotsHit: state.shotsHit,
                    throwablesThrown: state.throwablesThrown,
                    killsByType: state.killsByType,
                    scrapLooted: state.collectedScrap,
                    xpGained: state.score,
                    bonusXp: isExtraction ? 500 : 0,
                    familyFound: state.familyFound || stateRef.current.familyFound,
                    familyExtracted: isExtraction && (state.familyFound || stateRef.current.familyFound),
                    damageDealt: state.damageDealt,
                    damageTaken: state.damageTaken,
                    bossDamageDealt: state.bossDamageDealt,
                    bossDamageTaken: state.bossDamageTaken,
                    chestsOpened: state.chestsOpened,
                    bigChestsOpened: state.bigChestsOpened,
                    distanceTraveled: distanceTraveledRef.current,
                    cluesFound: collectedCluesRef.current,
                    collectiblesFound: state.sessionCollectiblesFound,
                    isExtraction,
                    spEarned: (state.level - propsRef.current.stats.level) + (state.sessionCollectiblesFound?.length || 0) + ((state.bossesDefeated?.length || 0) > 0 ? 1 : 0) + (state.familyFound ? 1 : 0),
                    seenEnemies: state.seenEnemies,
                    seenBosses: (state.seenBosses || []).concat(stateRef.current.bossesDefeated || []),
                    visitedPOIs: state.visitedPOIs
                });
            }
        };

        let lastYieldTime = performance.now();
        const yieldToMain = async () => {
            const now = performance.now();
            if (now - lastYieldTime > 12) {
                await new Promise<void>(resolve => {
                    requestAnimationFrame(() => setTimeout(resolve, 0));
                });
                lastYieldTime = performance.now();
            }
        };

        const runSetup = async () => {
            if (!isMounted.current || setupIdRef.current !== currentSetupId) return;

            setIsSectorLoading(true);

            const rng = seededRandom(propsRef.current.currentSector + 4242);
            const env = currentSector.environment;

            const yielder = useInstantLoad ? undefined : yieldToMain;
            await AssetPreloader.warmupAsync(engine.renderer, env, yielder);

            if (!isMounted.current || setupIdRef.current !== currentSetupId) return;

            scene.background = new THREE.Color(env.bgColor);
            scene.fog = new THREE.FogExp2(env.fogColor || env.bgColor, env.fogDensity);

            camera.fov = env.fov;
            camera.updateProjectionMatrix();
            camera.position.set(currentSector.playerSpawn.x, env.cameraHeight || CAMERA_HEIGHT, currentSector.playerSpawn.z + env.cameraOffsetZ);
            camera.lookAt(currentSector.playerSpawn.x, 0, currentSector.playerSpawn.z);

            ProjectileSystem.clear(scene, stateRef.current.projectiles, stateRef.current.fireZones);

            const ambientLight = new THREE.AmbientLight(0x404050, env.ambientIntensity);
            ambientLight.name = 'AMBIENT_LIGHT';
            scene.add(ambientLight);

            if (env.skyLight && env.skyLight.visible) {
                const lightPos = env.skyLight.position || { x: 80, y: 50, z: 50 };
                const skyLight = new THREE.DirectionalLight(env.skyLight.color, env.skyLight.intensity);
                skyLight.name = 'SKY_LIGHT';
                skyLight.position.set(lightPos.x, lightPos.y, lightPos.z);
                skyLight.castShadow = true;
                skyLight.shadow.camera.left = -100;
                skyLight.shadow.camera.right = 100;
                skyLight.shadow.camera.top = 100;
                skyLight.shadow.camera.bottom = -100;
                const shadowRes = engine.getSettings().shadowResolution;
                skyLight.shadow.mapSize.width = shadowRes;
                skyLight.shadow.mapSize.height = shadowRes;
                scene.add(skyLight);
            }

            const spawnHorde = (count: number, type?: string, pos?: THREE.Vector3) => {
                const startPos = pos || (playerGroupRef.current ? playerGroupRef.current.position : new THREE.Vector3(0, 0, 0));
                const newEnemies = EnemyManager.spawnHorde(scene, startPos, count, stateRef.current.bossSpawned, stateRef.current.enemies.length);
                if (newEnemies) {
                    for (let i = 0; i < newEnemies.length; i++) {
                        stateRef.current.enemies.push(newEnemies[i]);
                        if (!stateRef.current.seenEnemies.includes(newEnemies[i].type)) {
                            stateRef.current.seenEnemies.push(newEnemies[i].type);
                        }
                    }
                }
            };

            const ctx: SectorContext = {
                scene, obstacles: stateRef.current.obstacles, collisionGrid: stateRef.current.collisionGrid, chests: stateRef.current.chests,
                flickeringLights, burningObjects, rng, triggers: stateRef.current.triggers, mapItems, debugMode: propsRef.current.debugMode,
                textures: textures, spawnZombie,
                spawnHorde,
                cluesFound: propsRef.current.stats.cluesFound || [], collectiblesFound: propsRef.current.stats.collectiblesFound || [],
                collectibles: [], dynamicLights: [], interactables: [], sectorId: propsRef.current.currentSector, smokeEmitters: [],
                sectorState: stateRef.current.sectorState, state: stateRef.current, yield: yielder
            };
            sectorContextRef.current = ctx;
            stateRef.current.sectorState.ctx = ctx;

            PathGenerator.resetPathLayer();
            await SectorGenerator.build(ctx, currentSector);

            AssetPreloader.setLastSectorIndex(propsRef.current.currentSector);

            if (!useInstantLoad) setIsSectorLoading(false);
            if (propsRef.current.onSectorLoaded) propsRef.current.onSectorLoaded();

            if (!isMounted.current || setupIdRef.current !== currentSetupId) return;

            const activeEffects: any[] = [];
            scene.traverse((child) => {
                if (child.userData && child.userData.effects) {
                    const effects = child.userData.effects as any[];
                    for (let i = 0; i < effects.length; i++) {
                        const eff = effects[i];
                        if (eff.type === 'light') {
                            const light = new THREE.PointLight(eff.color, eff.intensity, eff.distance);
                            light.userData.baseIntensity = eff.intensity; // [VINTERDÖD] Spara originalstyrkan
                            light.userData.isCulled = false;
                            if (eff.offset) light.position.copy(eff.offset);
                            child.add(light);
                            if (eff.flicker) flickeringLights.push({ light, baseIntensity: eff.intensity });
                        }
                    }
                    activeEffects.push(child);
                }
            });
            stateRef.current.activeEffects = activeEffects;

            const playerGroup = ModelFactory.createPlayer();
            playerGroupRef.current = playerGroup;

            const bodyMesh = playerGroup.children.find(c => c.userData.isPlayer) || playerGroup.children[0] as THREE.Mesh;
            playerMeshRef.current = bodyMesh as THREE.Group;

            const pSpawn = { ...currentSector.playerSpawn };
            playerGroup.position.set(pSpawn.x, 0, pSpawn.z);
            if (pSpawn.y) playerGroup.position.y = pSpawn.y;
            if (pSpawn.rot) playerGroup.rotation.y = pSpawn.rot;

            const flashlight = new THREE.SpotLight(0xffffee, 400, 60, Math.PI / 3, 0.6, 1);
            flashlight.name = 'flashlight';
            flashlight.position.set(0, 3.5, 0.5);
            flashlight.target.position.set(0, 0, 10);
            flashlight.castShadow = true;
            flashlight.shadow.camera.near = 1;
            flashlight.shadow.camera.far = 40;
            flashlight.shadow.bias = -0.0001;
            playerGroup.add(flashlight);
            playerGroup.add(flashlight.target);
            flashlightRef.current = flashlight;

            scene.add(playerGroup);

            prevPosRef.current.copy(playerGroup.position);
            hasSetPrevPosRef.current = true;

            activeFamilyMembers.current.length = 0;

            if (propsRef.current.rescuedFamilyIndices) {
                for (let i = 0; i < propsRef.current.rescuedFamilyIndices.length; i++) {
                    const sectorIdx = propsRef.current.rescuedFamilyIndices[i];
                    const theme = SECTOR_THEMES[sectorIdx];
                    if (theme && theme.familyMemberId !== undefined) {
                        const fmData = FAMILY_MEMBERS[theme.familyMemberId];
                        if (fmData) {
                            const mesh = ModelFactory.createFamilyMember(fmData);
                            mesh.position.set(pSpawn.x + (Math.random() - 0.5) * 5, 0, pSpawn.z + 5 + Math.random() * 5);

                            const markerGroup = new THREE.Group();
                            markerGroup.position.y = 0.2;
                            const darkColor = new THREE.Color(fmData.color).multiplyScalar(0.2);
                            const fill = new THREE.Mesh(new THREE.CircleGeometry(5.0, 32), new THREE.MeshBasicMaterial({ color: darkColor, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }));
                            fill.rotation.x = -Math.PI / 2; markerGroup.add(fill);
                            const border = new THREE.Mesh(new THREE.RingGeometry(4.8, 5.0, 32), new THREE.MeshBasicMaterial({ color: fmData.color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
                            border.rotation.x = -Math.PI / 2; markerGroup.add(border);
                            mesh.add(markerGroup);

                            const fLight = new THREE.PointLight(fmData.color, 2, 8);
                            fLight.position.y = 2;
                            fLight.userData.baseIntensity = 2; // [VINTERDÖD] Spara originalstyrkan
                            fLight.userData.isCulled = false;
                            mesh.add(fLight);

                            flickeringLights.push({ light: fLight, baseInt: 2, flickerRate: 0.1 });

                            scene.add(mesh);
                            activeFamilyMembers.current.push({
                                mesh, ring: markerGroup, found: true, following: true, name: fmData.name, id: fmData.id, scale: fmData.scale, seed: Math.random() * 100
                            });
                        }
                    }
                }
            }

            if (!propsRef.current.familyAlreadyRescued) {
                const theme = SECTOR_THEMES[propsRef.current.currentSector];
                const fmId = theme ? theme.familyMemberId : 0;
                if (!propsRef.current.rescuedFamilyIndices.includes(propsRef.current.currentSector)) {
                    const fmData = FAMILY_MEMBERS[fmId];
                    if (fmData) {
                        const mesh = ModelFactory.createFamilyMember(fmData);
                        mesh.position.set(fSpawn.x, 0, fSpawn.z);
                        if (fSpawn.y) mesh.position.y = fSpawn.y;

                        const markerGroup = new THREE.Group();
                        markerGroup.position.y = 0.2;
                        const darkColor = new THREE.Color(fmData.color).multiplyScalar(0.2);
                        const fill = new THREE.Mesh(new THREE.CircleGeometry(5.0, 32), new THREE.MeshBasicMaterial({ color: darkColor, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }));
                        fill.rotation.x = -Math.PI / 2; markerGroup.add(fill);
                        const border = new THREE.Mesh(new THREE.RingGeometry(4.8, 5.0, 32), new THREE.MeshBasicMaterial({ color: fmData.color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
                        border.rotation.x = -Math.PI / 2; markerGroup.add(border);
                        mesh.add(markerGroup);

                        const fLight = new THREE.PointLight(fmData.color, 2, 8);
                        fLight.position.y = 2;
                        fLight.userData.baseIntensity = 2; // [VINTERDÖD] Spara originalstyrkan
                        fLight.userData.isCulled = false;
                        mesh.add(fLight);

                        flickeringLights.push({ light: fLight, baseInt: 2, flickerRate: 0.1 });

                        scene.add(mesh);
                        const currentFM = { mesh, ring: markerGroup, found: false, following: false, name: fmData.name, id: fmData.id, scale: fmData.scale, seed: Math.random() * 100 };
                        activeFamilyMembers.current.push(currentFM);
                        familyMemberRef.current = currentFM;
                    }
                }
            }

            session.addSystem(new PlayerMovementSystem(playerGroup));
            session.addSystem(new VehicleMovementSystem(playerGroup));

            if (engine.water) {
                engine.water.setPlayerRef(playerGroup);
                engine.water.setCallbacks({
                    spawnPart: (x: number, y: number, z: number, type: string, count: number) => spawnPart(x, y, z, type, count),
                    emitNoise: (pos: THREE.Vector3, radius: number, type: string) => session.makeNoise(pos, radius, type as any)
                });
            }
            session.addSystem(new PlayerCombatSystem(playerGroup));
            session.addSystem(new WorldLootSystem(playerGroup, scene));
            const interactionSystem = new PlayerInteractionSystem(playerGroup, concludeSector, ctx.collectibles, onCollectibleFoundInternal);
            session.addSystem(interactionSystem);
            session.addSystem(new SectorSystem(playerGroup, props.currentSector, {
                setNotification: (n: any) => { if (n && n.visible && n.text) spawnBubble(`${n.icon ? n.icon + ' ' : ''}${n.text}`, n.duration || 3000); },
                t: (key: string) => t(key),
                spawnPart, startCinematic,
                setInteraction: (interaction: any) => {
                    if (interaction) { setInteractionType('plant_explosive'); stateRef.current.currentInteraction = interaction; }
                    else { setInteractionType(null); stateRef.current.currentInteraction = null; }
                },
                playSound: (id: string) => { if (id === 'explosion') soundManager.playExplosion(); else soundManager.playUiConfirm(); },
                playTone: (freq: number, type: OscillatorType, duration: number, vol?: number) => soundManager.playTone(freq, type, duration, vol || 0.1),
                cameraShake: (amount: number) => stateRef.current.cameraShake = amount,
                scene: engine.scene,
                setCameraOverride: (params: any) => cameraOverrideRef.current = params,
                emitNoise: (pos: THREE.Vector3, radius: number, type: string) => session.makeNoise(pos, radius, type as any),
                spawnZombie, spawnHorde
            }));
            session.addSystem(new EnemySystem(playerGroup, {
                spawnBubble, gainXp, t, onClueFound: propsRef.current.onClueFound,
                onBossKilled: (id: number) => {
                    if (!stateRef.current.bossesDefeated.includes(id)) stateRef.current.bossesDefeated.push(id);
                    stateRef.current.bossDefeatedTime = performance.now();
                    soundManager.stopMusic();
                    if (currentSector.ambientLoop) soundManager.playMusic(currentSector.ambientLoop);
                }
            }));

            if (currentSector.initialAim) {
                engine.input.state.aimVector = new THREE.Vector2(currentSector.initialAim.x, currentSector.initialAim.y);
            }

            prevInputRef.current = false;
            camera.position.set(playerGroup.position.x, currentSector.environment.cameraHeight || CAMERA_HEIGHT, playerGroup.position.z + currentSector.environment.cameraOffsetZ);
            camera.lookAt(playerGroup.position);

            if (isMounted.current) setIsSectorLoading(false);
            stateRef.current.mapItems = mapItems;
            EnemyManager.init(engine.scene);

            if (propsRef.current.onMapInit) propsRef.current.onMapInit(mapItems);
            if (propsRef.current.onSectorLoaded) propsRef.current.onSectorLoaded();

            // Setup static scratchpad for TriggerHandler
            _triggerOptionsScratch.spawnBubble = spawnBubble;
            _triggerOptionsScratch.removeVisual = (id: string) => {
                const visual = scene.getObjectByName(`clue_visual_${id}`) || scene.children.find(o => o.userData.id === id && o.userData.type === 'clue_visual');
                if (visual) {
                    // ZERO-RECOMPILE SHADER SKYDD
                    visual.traverse((child) => {
                        if (child instanceof THREE.PointLight || child instanceof THREE.SpotLight || child instanceof THREE.DirectionalLight) {
                            child.intensity = 0;
                        } else if (child instanceof THREE.Mesh) {
                            child.visible = false;
                        }
                    });
                }
            };
            _triggerOptionsScratch.onClueFound = (clue: any) => { if (clue.id) propsRef.current.onClueFound(clue); };
            _triggerOptionsScratch.onTrigger = (type: string, duration: number) => {
                if (type === 'THOUGHTS') stateRef.current.thinkingUntil = performance.now() + duration;
                else if (type === 'SPEECH') stateRef.current.speakingUntil = performance.now() + duration;
            };
            _triggerOptionsScratch.onAction = (action: any) => handleTriggerAction(action, scene);
            _triggerOptionsScratch.collectedCluesRef = collectedCluesRef;
            _triggerOptionsScratch.t = t;
        };

        runSetup();

        const spawnBoss = () => {
            if (stateRef.current.bossSpawned) return;
            const bossData = BOSSES[propsRef.current.currentSector] || BOSSES[0];
            const bSpawn = currentSector.bossSpawn;
            const newBoss = EnemyManager.spawnBoss(scene, { x: bSpawn.x, z: bSpawn.z }, bossData);
            newBoss.bossId = bossData.id;
            stateRef.current.enemies.push(newBoss);
            stateRef.current.bossSpawned = true;
            if (!stateRef.current.seenBosses.includes(bossData.id)) stateRef.current.seenBosses.push(bossData.id);

            bossIntroRef.current = { active: true, startTime: performance.now(), bossMesh: newBoss.mesh };
            setBossIntroActive(true);

            if (bossIntroTimerRef.current) clearTimeout(bossIntroTimerRef.current);
            soundManager.playBossSpawn(bossData.id);
            soundManager.playMusic('boss_metal');

            bossIntroTimerRef.current = window.setTimeout(() => {
                if (isMounted.current) { setBossIntroActive(false); bossIntroRef.current.active = false; }
            }, 4000);
        };

        window.addEventListener('boss-spawn-trigger', spawnBoss);
        const onFamilyFollow = () => {
            if (familyMemberRef.current) {
                familyMemberRef.current.following = true;
                stateRef.current.isInteractionOpen = false;
                stateRef.current.familyFound = true;
            }
        };
        window.addEventListener('family-follow', onFamilyFollow);
        window.addEventListener('family_follow', onFamilyFollow);

        (window as any).setCameraOverride = (params: { active: boolean, targetPos: THREE.Vector3, lookAtPos: THREE.Vector3, endTime: number } | null) => {
            cameraOverrideRef.current = params;
        };

        window.addEventListener('keep_camera', () => {
            if (cinematicRef.current.active || cinematicActive) {
                cameraOverrideRef.current = {
                    active: true,
                    targetPos: (cinematicRef.current.cameraBasePos || new THREE.Vector3()).clone(),
                    lookAtPos: (cinematicRef.current.cameraLookAt || new THREE.Vector3()).clone(),
                    endTime: performance.now() + 30000
                };
            }
        });

        (window as any).clearCameraOverride = () => cameraOverrideRef.current = null;

        let lastTime = performance.now();
        let frame = 0;

        engine.onUpdate = (dt: number) => {
            if (!isMounted.current || propsRef.current.isPaused) return;

            const now = performance.now();
            const input = engine.input.state;
            const delta = dt;

            if (input.e && !prevInputRef.current) {
                if (stateRef.current.currentInteraction && stateRef.current.currentInteraction.action) {
                    stateRef.current.currentInteraction.action();
                }
            }
            prevInputRef.current = input.e;

            const state = stateRef.current;
            const isCinematic = cinematicRef.current.active;
            const isBossIntro = bossIntroRef.current.active;
            const isInteractionPaused = state.isInteractionOpen && !isCinematic;

            if (isInteractionPaused) {
                lastDrawCallsRef.current = engine.renderer.info.render.calls;
                engine.isRenderingPaused = true;
                lastTime = now;
                return;
            } else {
                engine.isRenderingPaused = false;
            }

            const playerGroup = playerGroupRef.current;
            if (!playerGroup || playerGroup.children.length === 0) return;

            lastDrawCallsRef.current = engine.renderer.info.render.calls;
            state.framesSinceHudUpdate++;
            if (now - state.lastHudUpdate > 100) {
                const frames = state.framesSinceHudUpdate;
                const timeDiff = now - state.lastHudUpdate;
                const fps = Math.round((frames * 1000) / timeDiff);
                state.framesSinceHudUpdate = 0;
                state.lastHudUpdate = now;

                if (now - state.lastFpsUpdate > 500) {
                    if (propsRef.current.onFPSUpdate) propsRef.current.onFPSUpdate(fps);
                    state.lastFpsUpdate = now;
                }

                const hudMesh = familyMemberRef.current?.mesh || null;

                if (!isBossIntro) {
                    const hudData = HudSystem.getHudData(state, playerGroupRef.current.position, hudMesh, engineRef.current.input.state, now, propsRef.current, distanceTraveledRef.current, engineRef.current.camera);
                    hudData.debugInfo.drawCalls = lastDrawCallsRef.current;
                    propsRef.current.onUpdateHUD({ ...hudData, fps, debugMode: propsRef.current.debugMode });
                } else {
                    if (propsRef.current.onUpdateHUD && engineRef.current) {
                        const now = performance.now();
                        const cam = engineRef.current.camera;
                        const hudData = HudSystem.getHudData(stateRef.current, playerGroupRef.current!.position, familyMemberRef.current?.mesh || null, engineRef.current.input.state, now, propsRef.current, distanceTraveledRef.current, cam);
                        propsRef.current.onUpdateHUD({ ...hudData, fps: 60, debugMode: propsRef.current.debugMode });
                    }
                    if (propsRef.current.onUpdateHUD && now % 5 === 0) {
                        const hudData = HudSystem.getHudData(state, playerGroupRef.current.position, hudMesh, engineRef.current.input.state, now, propsRef.current, distanceTraveledRef.current, engineRef.current.camera);
                        hudData.debugInfo.drawCalls = lastDrawCallsRef.current;
                        propsRef.current.onUpdateHUD({ ...hudData, fps: Math.round(1000 / delta) });
                    }
                }
            }

            if (isBossIntro && bossIntroRef.current.bossMesh) {
                const bossMesh = bossIntroRef.current.bossMesh;
                const bossPos = bossMesh.position;
                const introTime = now - bossIntroRef.current.startTime;

                _vCamera.set(bossPos.x, 12, bossPos.z + 20);
                camera.position.lerp(_vCamera, 0.05);
                camera.lookAt(bossPos.x, bossPos.y + 3, bossPos.z);

                if (frame % 5 === 0 && introTime < 3000) {
                    bossMesh.rotation.y += (Math.random() - 0.5) * 0.2;
                    bossMesh.scale.setScalar(3.0 + Math.sin(now * 0.02) * 0.1);
                }
                if (playerMeshRef.current) {
                    _animStateScratch.isMoving = false; _animStateScratch.isRushing = false; _animStateScratch.isRolling = false; _animStateScratch.rollStartTime = 0; _animStateScratch.staminaRatio = 1.0; _animStateScratch.isSpeaking = false; _animStateScratch.isThinking = false; _animStateScratch.isIdleLong = false;
                    PlayerAnimation.update(playerMeshRef.current, _animStateScratch, now, delta);
                }
                lastDrawCallsRef.current = engine.renderer.info.render.calls;
                lastTime = now;
                return;
            }

            if (frame % 5 === 0) {
                if (state.health < state.maxHealth * 0.3 && !state.isDead) {
                    if (now - (state.lastHeartbeat || 0) > 800) {
                        state.lastHeartbeat = now;
                        soundManager.playHeartbeat();
                    }
                }

                for (let i = 0; i < burningObjects.length; i++) {
                    const mesh = burningObjects[i];
                    if (!mesh.userData.effects) continue;
                    const effs = mesh.userData.effects;
                    for (let j = 0; j < effs.length; j++) {
                        const eff = effs[j];
                        if (eff.type === 'emitter') {
                            if (Math.random() < 0.8) {
                                _vInteraction.copy(mesh.position);
                                if (eff.offset) _vInteraction.add(eff.offset);
                                if (eff.area) {
                                    _vInteraction.x += (Math.random() - 0.5) * eff.area.x;
                                    _vInteraction.z += (Math.random() - 0.5) * eff.area.z;
                                } else {
                                    _vInteraction.x += (Math.random() - 0.5) * (eff.spread || 0.4);
                                    _vInteraction.z += (Math.random() - 0.5) * (eff.spread || 0.4);
                                }
                                let count = eff.particle === 'flame' ? 2 : (eff.count || 1);
                                if (eff.area && (eff.area.x * eff.area.z > 50)) count = Math.max(count, 3);
                                spawnPart(_vInteraction.x, _vInteraction.y, _vInteraction.z, eff.particle, count, undefined, undefined, eff.color);
                            }
                        }
                    }
                }
            }

            if (state.isDead) {
                DeathSystem.update(state, { deathPhase: deathPhaseRef, playerGroup: playerGroupRef.current, playerMesh: playerMeshRef.current, fmMesh: familyMemberRef.current?.mesh || null, familyMembers: activeFamilyMembers.current, input: engine.input.state, camera: camera }, setDeathPhase, propsRef.current, now, delta, distanceTraveledRef.current, _fxCallbacks);
                if (playerGroupRef.current) FXSystem.update(scene, state.particles, state.bloodDecals, delta, frame, now, playerGroupRef.current.position, _fxCallbacks);
                lastDrawCallsRef.current = engine.renderer.info.render.calls;
                lastTime = now;
                return;
            }

            if (state.bossDefeatedTime > 0) {
                if (now - state.bossDefeatedTime < 10000) {
                    state.invulnerableUntil = now + 10000;
                    if (now - state.bossDefeatedTime > 4000) {
                        concludeSector(state.familyFound);
                        return;
                    }
                } else {
                    state.bossDefeatedTime = 0;
                }
            }

            if (propsRef.current.triggerEndSector) {
                concludeSector(false);
                return;
            }

            if (!propsRef.current.isRunning || propsRef.current.isPaused) {
                soundManager.stopRadioStatic(); lastTime = now;
                return;
            }

            frame++;

            if (frame % 15 === 0 && playerGroupRef.current && sectorContextRef.current?.dynamicLights) {
                const dynamicLights = sectorContextRef.current.dynamicLights;
                const pPos = playerGroupRef.current.position;

                let lightCount = 0;
                for (let i = 0; i < dynamicLights.length; i++) {
                    const light = dynamicLights[i];
                    if (light.name === 'flashlight') { continue; } // [VINTERDÖD] Låt ficklampan styra sin egen styrka

                    if (!_sortableLightsScratch[lightCount]) {
                        _sortableLightsScratch.push({ light: null as any, distSq: 0 });
                    }
                    _sortableLightsScratch[lightCount].light = light;
                    _sortableLightsScratch[lightCount].distSq = light.position.distanceToSquared(pPos);
                    lightCount++;
                }

                // Fast insertion sort to avoid .sort() GC allocation
                for (let i = 1; i < lightCount; i++) {
                    let key = _sortableLightsScratch[i];
                    let j = i - 1;
                    while (j >= 0 && _sortableLightsScratch[j].distSq > key.distSq) {
                        _sortableLightsScratch[j + 1] = _sortableLightsScratch[j];
                        j = j - 1;
                    }
                    _sortableLightsScratch[j + 1] = key;
                }

                for (let i = 0; i < lightCount; i++) {
                    const lightInfo = _sortableLightsScratch[i];
                    const light = lightInfo.light;
                    const isActive = (i < 32 || lightInfo.distSq < 3600);

                    if (isActive) {
                        if (light.userData.isCulled) {
                            // Återställ till sparad styrka
                            light.intensity = light.userData.baseIntensity !== undefined ? light.userData.baseIntensity : 1;
                            light.userData.isCulled = false;
                        }
                    } else {
                        if (!light.userData.isCulled) {
                            // Spara undan aktuell styrka om den förändrats (t.ex av EnvironmentSystem)
                            if (light.intensity > 0) light.userData.baseIntensity = light.intensity;
                            light.intensity = 0; // Stäng av via matematik istället för omkompilering
                            light.userData.isCulled = true;
                        }
                    }
                }
            }

            if (!isCinematic && !isBossIntro) {
                const currentInput = engine.input.state;

                if (propsRef.current.teleportTarget && propsRef.current.teleportTarget.timestamp > lastTeleportRef.current) {
                    const tgt = propsRef.current.teleportTarget;
                    playerGroupRef.current.position.set(tgt.x, 0, tgt.z);
                    spawnPart(tgt.x, 1, tgt.z, 'smoke', 20); soundManager.playTone(800, 'sine', 0.2, 0.1);

                    for (let i = 0; i < activeFamilyMembers.current.length; i++) {
                        const fm = activeFamilyMembers.current[i];
                        if (fm.mesh && fm.following) {
                            const offX = (Math.random() - 0.5) * 3;
                            const offZ = (Math.random() - 0.5) * 3;
                            fm.mesh.position.set(tgt.x + offX, 0, tgt.z + offZ);
                            spawnPart(tgt.x + offX, 1, tgt.z + offZ, 'smoke', 10);
                        }
                    }

                    lastTeleportRef.current = tgt.timestamp; camera.position.set(tgt.x, 50, tgt.z + currentSector.environment.cameraOffsetZ); camera.lookAt(playerGroupRef.current.position);
                    prevPosRef.current.copy(playerGroupRef.current.position);
                }

                gameSessionRef.current!.inputDisabled = !!propsRef.current.disableInput || (!!cameraOverrideRef.current?.active);
                gameSessionRef.current!.isMobile = !!propsRef.current.isMobileDevice;
                gameSessionRef.current!.debugMode = propsRef.current.debugMode;
                gameSessionRef.current!.cameraAngle = cameraAngleRef.current;
                gameSessionRef.current!.update(delta, propsRef.current.mapId || 0);

                if (state.hp / state.maxHp <= 0.1 && !state.isDead) {
                    if (now > (lastHeartbeatRef.current || 0) + 800) {
                        soundManager.playHeartbeat();
                        lastHeartbeatRef.current = now;
                    }
                }

                const isMoving = state.isMoving;
                if (hasSetPrevPosRef.current && playerGroupRef.current) {
                    distanceTraveledRef.current += playerGroupRef.current.position.distanceTo(prevPosRef.current);
                }

                if (playerGroupRef.current) {
                    prevPosRef.current.copy(playerGroupRef.current.position);
                    hasSetPrevPosRef.current = true;
                }

                if (playerMeshRef.current) {
                    _animStateScratch.isMoving = isMoving; _animStateScratch.isRushing = state.isRushing; _animStateScratch.isRolling = state.isRolling; _animStateScratch.rollStartTime = state.rollStartTime; _animStateScratch.staminaRatio = state.stamina / state.maxStamina; _animStateScratch.isSpeaking = state.speakBounce > 0 || now < state.speakingUntil; _animStateScratch.isThinking = now < state.thinkingUntil; _animStateScratch.isIdleLong = (now - state.lastActionTime > 20000);
                    PlayerAnimation.update(playerMeshRef.current, _animStateScratch, now, delta);
                }
            }

            for (let i = 0; i < activeFamilyMembers.current.length; i++) {
                const fm = activeFamilyMembers.current[i];
                if (fm.mesh) {
                    FamilySystem.update(fm, playerGroupRef.current, state, cinematicRef.current.active, now, delta, { setFoundMemberName, startCinematic }, i);
                }
            }

            if (state.windSystem) state.windSystem.update(delta);
            if (engine.water) engine.water.update(delta, now);
            FootprintSystem.update(delta);

            if (playerGroupRef.current) {
                FXSystem.update(scene, state.particles, state.bloodDecals, delta, frame, now, playerGroupRef.current.position, _fxCallbacks);
            }

            if (isCinematic) {
                CinematicSystem.update(cinematicRef.current, camera, playerMeshRef.current, bubbleRef, now, delta, frame, { setCurrentLine, setCinematicActive, endCinematic, playCinematicLine }, activeFamilyMembers.current);
            }

            if (!isCinematic && !isBossIntro) {
                if (cameraOverrideRef.current && cameraOverrideRef.current.active) {
                    const override = cameraOverrideRef.current;
                    if (now > override.endTime) {
                        cameraOverrideRef.current = null;
                    } else {
                        _vCamera.copy(camera.position).lerp(override.targetPos, 0.05);
                        camera.position.copy(_vCamera);
                        camera.lookAt(override.lookAtPos);
                    }
                } else {
                    cameraAngleRef.current += (cameraAngleTargetRef.current - cameraAngleRef.current) * 0.1;
                    CameraSystem.update(camera, playerGroupRef.current.position, currentSector.environment.cameraOffsetZ, state, false, delta, cameraAngleRef.current, cameraHeightModifierRef.current);
                }
            }

            lastDrawCallsRef.current = engine.renderer.info.render.calls;
            lastTime = now;

            const currentInter = state.interactionType;
            if (currentInter !== interactionTypeRef.current) {
                interactionTypeRef.current = currentInter;
                setInteractionType(currentInter);
            }

            if (currentInter && state.currentInteraction) {
                if (state.currentInteraction.position) {
                    _vInteraction.copy(state.currentInteraction.position);
                    _vInteraction.y += 1.5;
                } else {
                    _vInteraction.copy(playerGroupRef.current.position);
                    _vInteraction.y += 2.5;
                }

                const vector = _vInteraction.project(camera);
                const screenX = Math.round((vector.x + 1) / 2 * 100);
                const screenY = Math.round((1 - vector.y) / 2 * 100);

                const lastPos = lastInteractionPosRef.current;
                if (!lastPos || Math.abs(lastPos.x - screenX) > 0.5 || Math.abs(lastPos.y - screenY) > 0.5) {
                    _interactionScreenPosScratch.x = screenX;
                    _interactionScreenPosScratch.y = screenY;
                    lastInteractionPosRef.current = _interactionScreenPosScratch;
                    setInteractionScreenPos({ x: screenX, y: screenY }); // React state update needs a new obj but scratch saves ref creation spam
                }
            } else {
                if (lastInteractionPosRef.current !== null) {
                    lastInteractionPosRef.current = null;
                    setInteractionScreenPos(null);
                }
            }

            if (!gameContextRef.current) {
                gameContextRef.current = {
                    scene, enemies: state.enemies, obstacles: state.obstacles, collisionGrid: state.collisionGrid,
                    spawnPart, spawnDecal, spawnFloatingText,
                    explodeEnemy: (e: Enemy, force: THREE.Vector3) => EnemyManager.explodeEnemy(e, force, _fxCallbacks),
                    addScore: (amt: number) => _gainXpInternal(amt),
                    trackStats: (type: 'damage' | 'hit', amt: number, isBoss?: boolean) => {
                        const s = stateRef.current;
                        if (type === 'damage') { s.damageDealt += amt; if (isBoss) s.bossDamageDealt += amt; _gainXpInternal(Math.ceil(amt)); }
                        if (type === 'hit') s.shotsHit += amt;
                    },
                    addFireZone: (z: any) => stateRef.current.fireZones.push(z),
                    now: now
                };
            } else {
                const ctx = gameContextRef.current;
                ctx.now = now; ctx.enemies = state.enemies; ctx.obstacles = state.obstacles; ctx.collisionGrid = state.collisionGrid;
            }

            if (state.isMoving && playerGroupRef.current) {
                const noiseRadius = (state.isRushing || state.isRolling) ? 20 : 15;
                session.makeNoise(playerGroupRef.current.position, noiseRadius, 'footstep');
            }

            ProjectileSystem.update(delta, now, gameContextRef.current, state.projectiles, state.fireZones);

            TriggerHandler.checkTriggers(playerGroupRef.current.position, state, now, _triggerOptionsScratch);

            for (let i = activeBubbles.current.length - 1; i >= 0; i--) {
                const b = activeBubbles.current[i];
                const age = now - b.startTime;
                if (age > b.duration) {
                    if (b.element.parentNode) b.element.parentNode.removeChild(b.element);
                    activeBubbles.current[i] = activeBubbles.current[activeBubbles.current.length - 1];
                    activeBubbles.current.pop();
                    continue;
                }

                const stackIndex = (activeBubbles.current.length - 1) - i;
                const baseX = window.innerWidth * 0.5;
                const baseY = window.innerHeight * 0.45;
                const bubbleHeight = 45;
                const x = baseX;
                const y = baseY - (stackIndex * bubbleHeight);

                b.element.style.left = `${x}px`;
                b.element.style.top = `${y}px`;

                let opacity = '1';
                if (age < 200) opacity = `${age / 200}`;
                else if (age > b.duration - 500) opacity = `${(b.duration - age) / 500}`;

                let transform = `translate(-50%, -100%)`;
                if (age < 200) {
                    const slide = (1 - (age / 200)) * 20;
                    transform += ` translateY(${slide}px)`;
                }

                b.element.style.transform = transform;
                b.element.style.opacity = opacity;
                b.element.style.zIndex = `${1000 - stackIndex}`;
                b.element.style.transition = 'top 0.3s ease-out';
            }

            LightingSystem.update(flickeringLights);

            if (state.activeEffects) {
                for (let i = 0; i < state.activeEffects.length; i++) {
                    const obj = state.activeEffects[i];
                    if (!obj.userData.effects) continue;
                    const effects = obj.userData.effects;
                    for (let j = 0; j < effects.length; j++) {
                        const eff = effects[j];
                        if (eff.type === 'emitter') {
                            if (!eff.lastEmit) eff.lastEmit = 0;
                            if (now - eff.lastEmit > eff.interval) {
                                eff.lastEmit = now;
                                if (eff.offset) {
                                    _vInteraction.copy(eff.offset);
                                    obj.localToWorld(_vInteraction);
                                } else {
                                    obj.getWorldPosition(_vInteraction);
                                }

                                if (eff.spread) {
                                    _vInteraction.x += (Math.random() - 0.5) * eff.spread;
                                    _vInteraction.z += (Math.random() - 0.5) * eff.spread;
                                }

                                spawnPart(_vInteraction.x, _vInteraction.y, _vInteraction.z, eff.particle, eff.count || 1, undefined, undefined, eff.color);
                            }
                        }
                    }
                }
            }
        };

        return () => {
            isMounted.current = false;
            window.removeEventListener('boss-spawn-trigger', spawnBoss);
            window.removeEventListener('family-follow', onFamilyFollow);
            window.removeEventListener('family_follow', onFamilyFollow);

            if (bossIntroTimerRef.current) clearTimeout(bossIntroTimerRef.current);

            engine.stop();
            engine.input.disable();
            engineRef.current = null;

            for (let i = scene.children.length - 1; i >= 0; i--) {
                const child = scene.children[i];
                if (child.userData?.isPlayer || child.userData?.isLaserSight) {
                    scene.remove(child);
                }
            }

            if (playerGroupRef.current) {
                scene.remove(playerGroupRef.current);
            }

            soundManager.setReverb(0);
            soundManager.stopRadioStatic();

            ProjectileSystem.clear(scene, stateRef.current.projectiles, stateRef.current.fireZones);
            session.dispose();
            EnemyManager.cleanup();
        };
    }, [props.currentSector, props.startAtCheckpoint, textures]);

    const getKillerName = () => {
        if (stateRef.current.killerName) return stateRef.current.killerName.toUpperCase();
        if (!stateRef.current.killerType) return "UNKNOWN";

        const type = stateRef.current.killerType;
        if (type === 'Boss') {
            return t(BOSSES[props.currentSector]?.name || "ui.boss").toUpperCase();
        }

        const baseType = type.split('_')[0];
        const key = `enemies.${baseType}.name`;
        const localized = t(key);
        if (localized && localized !== key) return localized.toUpperCase();
        return type.replace(/_/g, ' ').toUpperCase();
    };

    return (
        <div className="absolute inset-0 w-full h-full">
            <div
                ref={containerRef}
                className={`absolute inset-0`}
                onClick={(e) => {
                    if (cinematicActive && currentLine) {
                        playCinematicLine(cinematicRef.current.lineIndex + 1);
                        e.stopPropagation();
                        return;
                    }
                    if (props.isRunning && containerRef.current && deathPhase === 'NONE') {
                        engineRef.current?.input.requestPointerLock(containerRef.current);
                    }
                }}
            />

            {props.isMobileDevice && props.isRunning && !props.isPaused && !cinematicActive && !bossIntroActive && engineRef.current && (
                <TouchController
                    inputState={engineRef.current.input.state}
                    onPause={() => propsRef.current.onPauseToggle(true)}
                    onOpenMap={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', code: 'KeyM', bubbles: true }))}
                />
            )}

            <div ref={chatOverlayRef} className="absolute inset-0 pointer-events-none overflow-hidden z-50" />

            <CinematicBubble
                text={currentLine ? t(currentLine.text) : ""}
                speakerName={currentLine ? currentLine.speaker : ""}
                isVisible={cinematicActive && currentLine !== null}
                domRef={bubbleRef}
                tailPosition={cinematicRef.current.tailPosition}
                isMobileDevice={props.isMobileDevice}
            />

            {cinematicActive && (
                <div className={`absolute ${props.isMobileDevice ? 'bottom-8' : 'bottom-40'} left-1/2 -translate-x-1/2 pointer-events-auto z-50`}>
                    <button
                        onClick={(e) => { soundManager.playUiClick(); endCinematic(); e.stopPropagation(); }}
                        className="bg-black/80 border-2 border-white/50 text-white/70 hover:text-white hover:border-white px-6 py-2 font-bold uppercase text-xs tracking-widest transition-all skew-x-[-10deg]"
                    >
                        <span className="block skew-x-[10deg]">{t('ui.end_dialogue')}</span>
                    </button>
                </div>
            )}

            {(deathPhase === 'MESSAGE' || deathPhase === 'CONTINUE') && (
                <ScreenPlayerDied onContinue={triggerContinue} killerName={getKillerName()} isMobileDevice={props.isMobileDevice} />
            )}

            {activeModal === 'armory' && (
                <ScreenPlaygroundArmoryStation
                    stats={stateRef.current}
                    currentLoadout={stateRef.current.loadout}
                    weaponLevels={stateRef.current.weaponLevels || {}}
                    onClose={() => {
                        setActiveModal(null);
                        activeModalRef.current = null;
                        if (containerRef.current) engineRef.current?.input.requestPointerLock(containerRef.current);
                    }}
                    onSave={(newStats, newLoadout, newLevels) => {
                        stateRef.current.stats = newStats;
                        stateRef.current.loadout = newLoadout;
                        stateRef.current.weaponLevels = newLevels;
                        if (props.onUpdateLoadout) props.onUpdateLoadout(newLoadout, newLevels);
                        setActiveModal(null);
                        activeModalRef.current = null;
                        if (containerRef.current) engineRef.current?.input.requestPointerLock(containerRef.current);
                        soundManager.playUiConfirm();
                    }}
                    isMobileDevice={props.isMobileDevice}
                />
            )}
            {activeModal === 'spawner' && (
                <div className="absolute inset-0 flex items-center justify-center z-[100] pointer-events-auto">
                    <ScreenPlaygroundEnemyStation
                        onClose={() => setActiveModal(null)}
                        playerPos={{
                            x: playerGroupRef.current?.position.x || 0,
                            z: playerGroupRef.current?.position.z || 0
                        }}
                        onSpawnEnemies={(newEnemies) => {
                            newEnemies.forEach(e => {
                                stateRef.current.enemies.push(e);
                                if (e.type && !stateRef.current.seenEnemies.includes(e.type)) {
                                    stateRef.current.seenEnemies.push(e.type);
                                }
                            });
                        }}
                    />
                </div>
            )}

            {activeModal === 'environment' && (
                <div className="absolute inset-0 flex items-center justify-center z-[100] pointer-events-auto">
                    <ScreenPlaygroundEnvironmentStation
                        onClose={() => setActiveModal(null)}
                        currentWeather={stateRef.current.weather}
                        onWeatherChange={(w) => {
                            stateRef.current.weather = w;
                            if (engineRef.current) {
                                engineRef.current.weather.sync(w, 1000);
                            }
                            if (props.onEnvironmentOverrideChange) {
                                props.onEnvironmentOverrideChange(stateRef.current.sectorState.envOverride || {}, w);
                            }
                        }}
                        currentOverride={stateRef.current.sectorState.envOverride}
                        onOverrideChange={(overrides) => {
                            stateRef.current.sectorState.envOverride = overrides;
                            if (props.onEnvironmentOverrideChange) {
                                props.onEnvironmentOverrideChange(overrides, stateRef.current.weather);
                            }
                        }}
                        transparent={true}
                    />
                </div>
            )}

            {!isSectorLoading && !bossIntroActive && !cinematicActive && !forceHideHUD && (
                <GameUI
                    onCloseClue={() => { }}
                    interactionType={interactionType}
                    interactionLabel={stateRef.current.interactionLabel || undefined}
                    interactionScreenPos={interactionScreenPos}
                    isMobileDevice={props.isMobileDevice}
                    onInteract={() => {
                        if (engineRef.current) {
                            engineRef.current.input.state.e = true;
                            setTimeout(() => {
                                if (engineRef.current) engineRef.current.input.state.e = false;
                            }, 100);
                        }
                    }}
                    dialogueOpen={false}
                    dialogueLine={null}
                    foundMemberName={foundMemberName}
                    isLastLine={false}
                    onNextDialogue={() => { }}
                    onPrevDialogue={() => { }}
                    onCloseDialogue={() => { }}
                />
            )}

            <style>{`
            @keyframes slam {
                0% { transform: scale(2) skewX(-5deg); opacity: 0; }
                70% { transform: scale(1) skewX(-5deg); opacity: 1; }
                100% { transform: scale(1) skewX(-5deg); opacity: 1; }
            }
            @keyframes fadeIn {
                0% { opacity: 0; }
                100% { opacity: 1; }
            }
            @keyframes narrative-fade {
                0% { 
                    opacity: 0; 
                    transform: translateY(10px);
                    filter: blur(8px);
                }
                100% { 
                    opacity: 1; 
                    transform: translateY(0);
                    filter: blur(0);
                }
            }
        `}</style>
        </div>
    );
});

export default GameSession;