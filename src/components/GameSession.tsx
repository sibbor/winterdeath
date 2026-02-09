import React, { useEffect, useRef, useMemo, useState, useImperativeHandle, useCallback } from 'react';
import * as THREE from 'three';
import TouchController from './ui/TouchController';
import { Engine } from '../core/engine/Engine';
import { GameSessionLogic } from '../core/GameSessionLogic';
import { PlayerStats, WeaponType, CinematicLine, NotificationState, SectorTrigger, MapItem, SectorState, SectorStats, TriggerAction, Obstacle, GameCanvasProps, DeathPhase } from '../types';
import { SectorContext } from '../types/sectors';
import { WEAPONS, BOSSES, SECTOR_THEMES, FAMILY_MEMBERS, PLAYER_CHARACTER, LEVEL_CAP, CAMERA_HEIGHT } from '../content/constants';
import { STORY_SCRIPTS } from '../content/dialogues';
import { soundManager } from '../utils/sound';
import { t } from '../utils/i18n';
import { createProceduralTextures, createTextSprite, GEOMETRY, MATERIALS, ModelFactory } from '../utils/assets';
import { SectorManager } from '../core/SectorManager';
import { SectorBuilder } from '../core/world/SectorGenerator';
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
import { EnvironmentSystem } from '../core/systems/EnvironmentSystem';
import { DeathSystem } from '../core/systems/DeathSystem';
import { AssetPreloader } from '../core/systems/AssetPreloader';
import { PlayerMovementSystem } from '../core/systems/PlayerMovementSystem';
import { PlayerCombatSystem } from '../core/systems/PlayerCombatSystem';
import { WorldLootSystem } from '../core/systems/WorldLootSystem';
import { PlayerInteractionSystem } from '../core/systems/PlayerInteractionSystem';
import { EnemySystem } from '../core/systems/EnemySystem';
import { SectorSystem } from '../core/systems/SectorSystem';
import { FootprintSystem } from '../core/systems/FootprintSystem';
import ScreenPlayerDied from './game/ScreenPlayerDied';
import ScreenCollectibleFound from './game/ScreenCollectibleFound';
import { COLLECTIBLES } from '../content/collectibles';
import CinematicBubble from './game/CinematicBubble';
import GameUI from './game/GameUI';
import { WEATHER } from '../content/constants';
import { WeatherSystem } from '../core/systems/WeatherSystem';
import { WindSystem } from '../utils/physics';
import { WeatherType } from '../types';

const seededRandom = (seed: number) => {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return () => {
        return (s = s * 16807 % 2147483647) / 2147483647;
    };
};

// Define handle for parent access
export interface GameSessionHandle {
    requestPointerLock: () => void;
    getSectorStats: (isExtraction?: boolean, aborted?: boolean) => SectorStats;
    triggerInput: (key: string) => void;
    rotateCamera: (dir: number) => void;
}

const GameSession = React.forwardRef<GameSessionHandle, GameCanvasProps>((props, ref) => {
    const propsRef = useRef(props);
    // Engine Ref instead of individual Three refs
    const engineRef = useRef<Engine | null>(null);
    const gameSessionRef = useRef<GameSessionLogic | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    // Remove chatOverlayRef unused here? Or keep if needed.
    const chatOverlayRef = useRef<HTMLDivElement>(null);

    // Keep GameState Refs (Rules, Stats)
    const stateRef = useRef<ReturnType<typeof GameSessionLogic.createInitialState>>(null!);
    if (!stateRef.current) {
        stateRef.current = GameSessionLogic.createInitialState(props);
    }

    // Clear HUD on mount to prevent ghost icons from previous session
    useEffect(() => {
        if (props.onUpdateHUD) props.onUpdateHUD({});
    }, []);

    useEffect(() => { propsRef.current = props; }, [props]);

    // Determine if we can do an "Instant Load" (Respawn on same map + Assets warm)
    // Use persistent store from AssetPreloader to survive heavy reloads/unmounts
    const lastMapIndex = AssetPreloader.getLastMapIndex();
    const isSameMap = lastMapIndex === props.currentMap;
    const isWarmedUp = AssetPreloader.isWarmedUp();

    // Debug logic for mobile performance tuning
    // If we expect instant load but don't get it, we need to know why.
    if (!isSameMap && isWarmedUp && props.currentMap === 0 && lastMapIndex === -1) {
        // First load logic - expected
    }

    const useInstantLoad = isSameMap && isWarmedUp;

    // Start with loading screen ONLY if not instant loading
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
    const windSystemRef = useRef(new WindSystem());
    const weatherSystemRef = useRef<WeatherSystem | null>(null);
    const lastWeatherTypeRef = useRef<WeatherType>('none');
    const cameraAngleRef = useRef(0);
    const cameraAngleTargetRef = useRef(0);
    const cameraHeightModifierRef = useRef(0); // For Arrow Up/Down pitch/height adjustment

    // Refs for callbacks to avoid closure issues if defined outside
    // Actually, passing them to systems requires them to be stable or updated.
    // Let's define them inside the useEffect before onUpdate, BUT before system instantiation.
    // The issue is system instantiation happens ONCE.
    // So `concludeSector` must capture `propsRef` and `gameSessionRef.current.state`.

    const prevPosRef = useRef<THREE.Vector3 | null>(null);

    // -- RESTORED HOOKS --
    const [cinematicActive, setCinematicActive] = useState(false);
    const [currentLine, setCurrentLine] = useState(0);
    const bubbleRef = useRef<HTMLDivElement>(null);
    const [bossIntroActive, setBossIntroActive] = useState(false);
    useEffect(() => {
        if (props.onBossIntroStateChange) props.onBossIntroStateChange(bossIntroActive);
    }, [bossIntroActive]);

    // PC Camera Controls (Arrow Keys)
    useEffect(() => {
        if (props.isMobileDevice) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (stateRef.current.isPaused) return;
            // Prevent default scrolling
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
                // ONLY ALLOW IN DEBUG MODE
                if (!stateRef.current.debugMode) return;
                e.preventDefault();
            }

            switch (e.key) {
                case 'ArrowLeft':
                    cameraAngleTargetRef.current += Math.PI / 4;
                    break;
                case 'ArrowRight':
                    cameraAngleTargetRef.current -= Math.PI / 4;
                    break;
                case 'ArrowUp':
                    // Increase height (Steeper angle)
                    cameraHeightModifierRef.current = Math.min(20, cameraHeightModifierRef.current + 2.5);
                    break;
                case 'ArrowDown':
                    // Decrease height (Lower angle)
                    cameraHeightModifierRef.current = Math.max(-5, cameraHeightModifierRef.current - 2.5);
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [props.isMobileDevice]);

    const bossIntroTimerRef = useRef<NodeJS.Timeout | null>(null);
    const setupTimerRef = useRef<NodeJS.Timeout | null>(null);
    const [foundMemberName, setFoundMemberName] = useState('');
    const [interactionType, setInteractionType] = useState<'chest' | 'plant_explosive' | 'collectible' | 'knock_on_port' | null>(null);
    const [interactionScreenPos, setInteractionScreenPos] = useState<{ x: number, y: number } | null>(null);
    const [forceHideHUD, setForceHideHUD] = useState(false);

    useEffect(() => {
        const h = () => setForceHideHUD(true);
        const s = () => setForceHideHUD(false);
        window.addEventListener('hide_hud', h);
        window.addEventListener('show_hud', s);
        return () => {
            window.removeEventListener('hide_hud', h);
            window.removeEventListener('show_hud', s);
        };
    }, []);
    const interactionTypeRef = useRef<string>('NONE');
    // Sync interaction type
    useEffect(() => { interactionTypeRef.current = interactionType; }, [interactionType]);

    const cinematicRef = useRef({ active: false, startCamPos: new THREE.Vector3(), endCamPos: new THREE.Vector3(), startTime: 0, duration: 0, script: [] as any[], lineIndex: 0, speakers: [] as any[], cameraBasePos: new THREE.Vector3(), cameraLookAt: new THREE.Vector3(), lineStartTime: 0, lineDuration: 0, typingDuration: 0 });
    const prevInputRef = useRef(false);
    const bossIntroRef = useRef({ active: false, startTime: 0, bossMesh: null as THREE.Group | null });
    const cameraOverrideRef = useRef<{ active: boolean, targetPos: THREE.Vector3, lookAtPos: THREE.Vector3, endTime: number } | null>(null);
    const requestRef = useRef<number>();
    const isMounted = useRef(true);
    const setupIdRef = useRef(0);
    // prevMapRef removed as AssetPreloader handles warmup logic globally
    useEffect(() => { isMounted.current = true; return () => { isMounted.current = false; }; }, []);

    const playerGroupRef = useRef<THREE.Group>(new THREE.Group());
    const playerMeshRef = useRef<THREE.Group>(new THREE.Group());
    const familyMemberRef = useRef<any>(null);
    const reloadBarRef = useRef<HTMLDivElement>(null);
    const aimCrossRef = useRef<HTMLDivElement>(null);
    const flashlightRef = useRef<THREE.SpotLight>(null);
    const lockRequestTime = useRef(0);

    // ... Keep hooks for Cinematic/Intro


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
                chestsOpened: state.chestsOpened, bigChestsOpened: state.bigChestsOpened,
                isExtraction: false,
                spEarned: (state.level - propsRef.current.stats.level) + state.sessionCollectiblesFound.length + (state.bossesDefeated.length > 0 ? 1 : 0) + (state.familyFound ? 1 : 0),
                seenEnemies: state.seenEnemies, seenBosses: (state.seenBosses || []).concat(stateRef.current.bossesDefeated || []), visitedPOIs: state.visitedPOIs
            }, state.killerType || "Unknown");
        }
    }, []);

    // ... (EventListeners for death phase continue)
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

    // Notify parent of death screen state
    useEffect(() => {
        const isDeathScreenActive = deathPhase === 'MESSAGE' || deathPhase === 'CONTINUE';
        if (propsRef.current.onDeathStateChange) {
            propsRef.current.onDeathStateChange(isDeathScreenActive);
        }
    }, [deathPhase]);

    // Ensure cursor is visible on death, pause, dialogue or boss intro
    useEffect(() => {
        const shouldRelease = deathPhase !== 'NONE' || props.isPaused || props.isClueOpen || cinematicActive || bossIntroActive;
        if (shouldRelease) {
            if (document.pointerLockElement) {
                document.exitPointerLock();
            }
        }
    }, [deathPhase, props.isPaused, props.isClueOpen, cinematicActive, bossIntroActive]);
    // Auto-pause on pointer unlock (e.g. user hits ESC, or Alt-Tab)
    useEffect(() => {
        const handleLockChange = () => {
            // Ignore unlock if we just requested a lock (grace period for async lock)
            if (performance.now() - lockRequestTime.current < 1500) {
                return;
            }

            // Use refs to check current state reliably inside the listener (avoids stale closures)
            const isExpectedUnlock = stateRef.current.isDead || cinematicRef.current.active || bossIntroRef.current.active || propsRef.current.isPaused || propsRef.current.isClueOpen;

            if (!document.pointerLockElement && props.isRunning && !props.isPaused && !isExpectedUnlock) {
                // Only pause if we expected to be running AND it's not an expected UI unlock
                propsRef.current.onPauseToggle(true);
            }
        };
        document.addEventListener('pointerlockchange', handleLockChange);
        return () => document.removeEventListener('pointerlockchange', handleLockChange);
    }, [props.isRunning, props.isPaused]);

    useEffect(() => {
        if (props.onDialogueStateChange) props.onDialogueStateChange(cinematicActive);
    }, [cinematicActive]);

    // Update Graphics Settings dynamically
    useEffect(() => {
        if (engineRef.current && props.initialGraphics) {
            // "initialGraphics" name is a bit misleading if updated dynamically, but it works as the conduit.
            engineRef.current.updateSettings(props.initialGraphics);
        }
    }, [props.initialGraphics]);

    useEffect(() => {
        if (!props.isClueOpen && stateRef.current.clueActive) {
            stateRef.current.isInteractionOpen = false;
            stateRef.current.clueActive = false;
        }
    }, [props.isClueOpen]);

    const isInputEnabled = !props.isPaused && props.isRunning && !cinematicActive && !props.isClueOpen && !props.disableInput && !stateRef.current.isDead && !bossIntroActive && (!cameraOverrideRef.current?.active);

    // --- INPUT EVENT LISTENERS (Replaces useGameInput callbacks) ---
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Priority Checks (ESC handling)
            if (e.key === 'Escape') {
                if (bossIntroActive) {
                    setBossIntroActive(false);
                    bossIntroRef.current.active = false;
                    e.stopPropagation();
                    return;
                }
                if (cinematicActive) {
                    // endCinematic(); // DISABLED: ESC no longer skips dialogues
                    e.stopPropagation();
                    return;
                }
                // Fix: Close Clue on ESC
                if (propsRef.current.isClueOpen && propsRef.current.onClueClose) {
                    propsRef.current.onClueClose();
                    e.stopPropagation();
                    return;
                }

                if (isInputEnabled) {
                    propsRef.current.onPauseToggle(true);
                } else if (propsRef.current.isPaused) {
                    // Fix: Unpause if already paused (and input was disabled due to pause)
                    propsRef.current.onPauseToggle(false);
                }
                return;
            }

            if (!isInputEnabled) return;
            const key = e.key;

            // 'M' Map toggle is handled by useGlobalInput hook to support Opening/Closing during pause.
            // GameSession only handles gameplay inputs.

            // Flashlight Toggle (F)
            if (key.toLowerCase() === 'f') {
                if (flashlightRef.current) {
                    // Toggle intensity between 0 and 2.5
                    const isOn = flashlightRef.current.intensity > 0;
                    flashlightRef.current.intensity = isOn ? 0 : 400;
                    soundManager.playUiClick(); // Or a specific click/switch sound if available
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
                    if (s.stamina >= 25) {
                        s.stamina -= 25; s.lastStaminaUseTime = performance.now();
                        s.isRolling = true; s.rollStartTime = performance.now(); s.invulnerableUntil = performance.now() + 400;
                        let dx = 0; let dz = 0;
                        if (inp.w) dz -= 1; if (inp.s) dz += 1; if (inp.a) dx -= 1; if (inp.d) dx += 1;
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

    // Pointer Lock removed from useEffect to avoid NotAllowedError. 
    // It is now handled via ref.requestPointerLock() called from user gestures in App.tsx.


    const textures = useMemo(() => createProceduralTextures(), []);
    const { groundTex, laserTex } = textures;

    const currentSector = useMemo(() => SectorManager.getSector(props.currentMap), [props.currentMap]);
    const currentScript = useMemo(() => STORY_SCRIPTS[props.currentMap] || [], [props.currentMap]);

    // ... (rest of methods: spawnBubble, startCinematic, endCinematic, handleTriggerAction)
    const spawnBubble = (text: string, duration: number = 3000) => {
        if (!chatOverlayRef.current) return;
        const el = document.createElement('div');
        el.className = 'absolute bg-black/80 border-2 border-black text-white px-4 py-2 text-sm font-bold rounded-lg pointer-events-none transition-opacity duration-300 whitespace-normal z-40 w-max max-w-[280px] text-center shadow-lg';
        el.innerText = text;
        chatOverlayRef.current.appendChild(el);

        activeBubbles.current.push({
            element: el,
            startTime: performance.now(),
            duration: duration,
            text: text
        });
    };

    let fmMesh: THREE.Group | undefined;
    const activeFamilyMembers = useRef<any[]>([]);

    const startCinematic = (familyMesh: THREE.Group, scriptId?: number, customParams?: { targetPos?: THREE.Vector3, lookAtPos?: THREE.Vector3 }) => {
        if (cinematicRef.current.active) return;

        // IMPORTANT: Set ref state BEFORE releasing lock so the lock change listener knows it's intentional
        cinematicRef.current.active = true;

        // Release pointer lock so user can use mouse for dialogue buttons
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }

        if (familyMemberRef.current) setFoundMemberName(familyMemberRef.current.name);
        setCinematicActive(true);
        stateRef.current.isInteractionOpen = true;
        stateRef.current.familyFound = true;

        const pPos = new THREE.Vector3();
        playerGroupRef.current!.getWorldPosition(pPos);

        const fPos = new THREE.Vector3();
        familyMesh.getWorldPosition(fPos);

        // Zoom on player/door: Focal point biased towards player (0.15 weight towards Jordan = approx Door Frame)
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
            midPoint: midPoint,
            relativeOffset: camOffset,
            customCameraOverride: !!(customParams?.targetPos || customParams?.lookAtPos)
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

        // Re-request lock for gameplay (will only work if called from a user gesture)
        if (containerRef.current) {
            engineRef.current?.input.requestPointerLock(containerRef.current);
        }

        // Triggers are handled mid-script in CinematicSystem.update, 
        // but we also check the last line here just in case or for cleanup.
        const finishedScript = cinematicRef.current.script;
        const lastLine = finishedScript[finishedScript.length - 1];

        if (lastLine && lastLine.trigger) {
            const triggers = lastLine.trigger.split(',');
            triggers.forEach(t => {
                const trimmed = t.trim();
                if (trimmed === 'boss_start') {
                    setTimeout(() => window.dispatchEvent(new CustomEvent('boss-spawn-trigger')), 1000);
                } else if (trimmed === 'family_follow' || trimmed === 'family-follow') {
                    window.dispatchEvent(new CustomEvent('family-follow'));
                } else {
                    window.dispatchEvent(new CustomEvent(trimmed));
                }
            });
        }
    };

    const gainXp = (amount: number) => {
        const state = stateRef.current;
        state.currentXp += amount; state.score += amount;
        while (state.currentXp >= state.nextLevelXp && state.level < 20) { // LEVEL_CAP is 20
            state.currentXp -= state.nextLevelXp;
            state.level++;
            state.nextLevelXp = Math.floor(state.nextLevelXp * 1.2);
            soundManager.playUiConfirm();
        }
    };

    const handleTriggerAction = (action: TriggerAction, scene: THREE.Scene) => {
        const { type, payload, delay } = action;

        const execute = () => {
            switch (type) {
                case 'SHOW_TEXT':
                    if (payload && payload.text) {
                        spawnBubble(t(payload.text), payload.duration || 3000);
                    }
                    break;
                case 'PLAY_SOUND':
                    if (payload && payload.id) {
                        if (payload.id === 'explosion') soundManager.playExplosion();
                        else soundManager.playUiHover();
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
                        spawnBubble(`🚌 ${t('clues.bus_clear')}`);
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
                    if (payload && payload.amount) {
                        stateRef.current.cameraShake = payload.amount;
                    }
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
                        spawnBubble(`⚠️ ${t('ui.threat_neutralized')}`);
                    }
                    break;
                case 'START_CINEMATIC':
                    if (familyMemberRef.current?.mesh) {
                        startCinematic(familyMemberRef.current.mesh);
                    }
                    break;
                case 'TRIGGER_FAMILY_FOLLOW':
                    window.dispatchEvent(new Event('family-follow'));
                    break;
            }
        };

        if (delay && delay > 0) {
            setTimeout(execute, delay);
        } else {
            execute();
        }
    };

    // Expose methods to parent
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
            // Dispatch key events to be picked up by InputManager
            window.dispatchEvent(new KeyboardEvent('keydown', { key: key, bubbles: true }));
            setTimeout(() => {
                window.dispatchEvent(new KeyboardEvent('keyup', { key: key, bubbles: true }));
            }, 50);
        },
        rotateCamera: (dir: number) => {
            cameraAngleTargetRef.current += dir * (Math.PI / 4); // 45 degrees
        },
        adjustPitch: (dir: number) => {
            // 5 unit increments, clamped between -10 (low) and 20 (high)
            cameraHeightModifierRef.current = Math.max(-10, Math.min(20, cameraHeightModifierRef.current + (dir * 5)));
        }
    }));

    useEffect(() => {
        if (!containerRef.current) return;



        // --- ENGINE INIT ---
        // Use shared Engine instance

        const engine = Engine.getInstance();

        // Increment setup ID for this run to invalidate previous async operations
        const currentSetupId = ++setupIdRef.current;

        // Cleanup pre-existing state immediately on effect run
        if (playerGroupRef.current) {
            engine.scene.remove(playerGroupRef.current);
            playerGroupRef.current = null;
        }

        // Comprehensive scene scrub (Remove everything except camera/static)
        // This ensures no duplicate trees/enemies on respawn.
        engine.scene.children.slice().forEach(child => {
            if (child.name !== 'MainCamera' && !child.userData.isEngineStatic) {
                engine.scene.remove(child);
            }
        });

        if (propsRef.current.initialGraphics) {
            engine.updateSettings(propsRef.current.initialGraphics);
        }
        engine.mount(containerRef.current);
        engineRef.current = engine;
        engine.input.enable();

        // Init GameSession
        const session = new GameSessionLogic(engine);
        if (stateRef.current) {
            session.init(stateRef.current);
        }
        gameSessionRef.current = session;
        weatherSystemRef.current = new WeatherSystem(engine.scene, windSystemRef.current);

        // Extract Engine Components for local usage
        const scene = engine.scene;
        const camera = engine.camera;
        FootprintSystem.init(scene);

        // --- HELPER WRAPPERS (Defined early for TDZ safety) ---
        const spawnDecal = (x: number, z: number, scale: number, material?: THREE.Material) => {
            FXSystem.spawnDecal(scene, stateRef.current.bloodDecals, x, z, scale, material);
        };

        const spawnPart = (x: number, y: number, z: number, type: any, count: number, customMesh?: THREE.Mesh, customVel?: THREE.Vector3, color?: number) => {
            FXSystem.spawnPart(scene, stateRef.current.particles, x, y, z, type, count, customMesh, customVel, color);
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

        const gainXp = (amount: number) => {
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

        soundManager.resume();


        isMounted.current = true;
        hasEndedSector.current = false;

        // Fully Clear Scene of Game Objects
        scene.children.slice().forEach(child => {
            // Keep critical engine objects if any, but usually we clear all game-spawned ones
            if (child.type === 'Group' || child.type === 'Mesh' || child.type === 'Sprite' || child.type === 'PointLight' || child.type === 'SpotLight' || child.type === 'DirectionalLight') {
                if (child.name !== 'MainCamera' && !child.userData.isEngineStatic) {
                    scene.remove(child);
                }
            }
        });

        // Reset State
        setDeathPhase('NONE');
        deathPhaseRef.current = 'NONE';
        setBossIntroActive(false);
        bossIntroRef.current.active = false;
        cameraOverrideRef.current = null;
        if (bossIntroTimerRef.current) { clearTimeout(bossIntroTimerRef.current); bossIntroTimerRef.current = null; }

        // Reset Runtime State to Fresh Defaults
        stateRef.current.startTime = performance.now();
        stateRef.current.isDead = false;
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
        stateRef.current.enemies = [];
        stateRef.current.particles = [];
        stateRef.current.bloodDecals = [];
        stateRef.current.scrapItems = [];
        stateRef.current.chests = [];
        stateRef.current.obstacles = [];
        stateRef.current.triggers = [];
        stateRef.current.bossesDefeated = [];
        stateRef.current.bossSpawned = false;
        stateRef.current.bossDefeatedTime = 0;
        stateRef.current.thinkingUntil = 0;
        stateRef.current.speakingUntil = 0;
        stateRef.current.lastActionTime = performance.now();
        stateRef.current.framesSinceHudUpdate = 0;
        stateRef.current.sessionCollectiblesFound = [];

        collectedCluesRef.current = [];
        distanceTraveledRef.current = 0;
        prevPosRef.current = null;
        activeBubbles.current.forEach(b => { if (b.element.parentNode) b.element.parentNode.removeChild(b.element); });
        activeBubbles.current = [];

        // --- PRE-INIT VARIABLES (Moved out of setTimeout for scope access) ---
        const flickeringLights: any[] = [];
        const burningObjects: any[] = [];
        stateRef.current.chests = [];
        const chests = stateRef.current.chests;
        const mapItems: MapItem[] = [];

        // Constants/Setup (Moved out of setTimeout)
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

        const yieldToMain = () => new Promise<void>(resolve => {
            requestAnimationFrame(() => {
                setTimeout(resolve, 0);
            });
        });

        // --- ENVIRONMENT SETUP (Async) ---
        const runSetup = async () => {
            if (!isMounted.current || setupIdRef.current !== currentSetupId) return;

            setIsSectorLoading(true);

            const rng = seededRandom(propsRef.current.currentMap + 4242);
            const env = currentSector.environment;

            // 1. Asynchronous Warmup (Internal flag ensures it only runs once per session)
            // If instant load, we pass undefined to yieldToMain to force synchronous execution
            const yielder = useInstantLoad ? undefined : yieldToMain;

            await AssetPreloader.warmupAsync(engine.renderer, env, yielder);

            if (!isMounted.current || setupIdRef.current !== currentSetupId) return;

            scene.background = new THREE.Color(env.bgColor);
            scene.fog = new THREE.FogExp2(env.fogColor || env.bgColor, env.fogDensity);

            // Update Camera
            camera.fov = env.fov;
            camera.updateProjectionMatrix();
            camera.position.set(currentSector.playerSpawn.x, env.cameraHeight || CAMERA_HEIGHT, currentSector.playerSpawn.z + env.cameraOffsetZ);
            camera.lookAt(currentSector.playerSpawn.x, 0, currentSector.playerSpawn.z);

            ProjectileSystem.clear(scene, stateRef.current.projectiles, stateRef.current.fireZones);

            const ambientLight = new THREE.AmbientLight(0x404050, env.ambientIntensity);
            scene.add(ambientLight);

            if (env.moon && env.moon.visible) {
                const lightPos = env.moon.position || { x: 80, y: 50, z: 50 };
                const moonLight = new THREE.DirectionalLight(env.moon.color, env.moon.intensity);
                moonLight.position.set(lightPos.x, lightPos.y, lightPos.z);
                moonLight.castShadow = true;
                moonLight.shadow.camera.left = -100;
                moonLight.shadow.camera.right = 100;
                moonLight.shadow.camera.top = 100;
                moonLight.shadow.camera.bottom = -100;
                const shadowRes = engine.getSettings().shadowResolution;
                moonLight.shadow.mapSize.width = shadowRes;
                moonLight.shadow.mapSize.height = shadowRes;
                scene.add(moonLight);
            }

            if (env.sunPosition) {
                const sun = new THREE.DirectionalLight(0xffffee, 0.5);
                sun.position.set(env.sunPosition.x, env.sunPosition.y, env.sunPosition.z);
                sun.castShadow = true;
                const shadowRes = engine.getSettings().shadowResolution;
                sun.shadow.mapSize.width = shadowRes;
                sun.shadow.mapSize.height = shadowRes;
                scene.add(sun);
            }

            // Generate Sector Content
            const ctx: SectorContext = {
                scene,
                obstacles: stateRef.current.obstacles,
                chests,
                flickeringLights,
                burningObjects,
                rng,
                triggers: stateRef.current.triggers,
                mapItems,
                debugMode: propsRef.current.debugMode,
                textures: textures,
                spawnZombie,
                spawnHorde: (count: number, type?: string, pos?: THREE.Vector3) => {
                    const startPos = pos || (playerGroupRef.current ? playerGroupRef.current.position : new THREE.Vector3(0, 0, 0));
                    // If no pos provided, spawn near player (dangerous?) or rely on EnemySpawner default logic?
                    // EnemySpawner.spawnHorde takes startPos.
                    // We should probably ensure pos is provided or default to something safe.
                    // But for now, just pass it.
                    const newEnemies = EnemyManager.spawnHorde(scene, startPos, count, stateRef.current.bossSpawned, stateRef.current.enemies.length);
                    if (newEnemies) {
                        newEnemies.forEach(e => {
                            stateRef.current.enemies.push(e);
                            if (!stateRef.current.seenEnemies.includes(e.type)) {
                                stateRef.current.seenEnemies.push(e.type);
                            }
                        });
                    }
                },
                cluesFound: propsRef.current.stats.cluesFound || [],
                collectiblesFound: propsRef.current.stats.collectiblesFound || [],
                sectorId: propsRef.current.currentMap,
                smokeEmitters: [],
                sectorState: stateRef.current.sectorState,
                yield: yielder
            };

            // 2. Asynchronous Sector Generation (Preceded by automatic content)
            await SectorBuilder.generateAutomaticContent(ctx, currentSector);

            PathGenerator.resetPathLayer();
            await currentSector.generate(ctx);

            // Update global tracker for next time
            AssetPreloader.setLastMapIndex(propsRef.current.currentMap);

            // If we weren't instant loading (and thus showed loading screen), hide it now.
            if (!useInstantLoad) {
                setIsSectorLoading(false);
            }

            // Notify parent that level is loaded (Clean up global loading screen if any)
            if (propsRef.current.onLevelLoaded) {
                propsRef.current.onLevelLoaded();
            }

            if (!isMounted.current || setupIdRef.current !== currentSetupId) return;

            // NEW: Automated Intro Message
            if (currentSector.intro) {
                setTimeout(() => {
                    if (isMounted.current && setupIdRef.current === currentSetupId) {
                        spawnBubble(`🧠 ${t(currentSector.intro!.text)}`);
                        if (currentSector.intro!.sound) {
                            soundManager.playEffect(currentSector.intro!.sound);
                        }
                    }
                }, currentSector.intro.delay || 1500);
            }

            // NEW: Automated Ambient Loop
            if (currentSector.ambientLoop) {
                soundManager.playMusic(currentSector.ambientLoop);
            }

            // --- ASSET-DRIVEN EFFECT DISCOVERY ---
            // Scan scene for objects with `userData.effects`
            const activeEffects: any[] = [];
            scene.traverse((child) => {
                if (child.userData && child.userData.effects) {
                    const effects = child.userData.effects as any[];

                    // Initialize Lights immediately
                    effects.forEach(eff => {
                        if (eff.type === 'light') {
                            const light = new THREE.PointLight(eff.color, eff.intensity, eff.distance);
                            if (eff.offset) light.position.copy(eff.offset);
                            child.add(light);
                            if (eff.flicker) {
                                flickeringLights.push({ light, baseIntensity: eff.intensity });
                            }
                        }
                    });

                    // Store for periodic updates (Particles)
                    activeEffects.push(child);
                }
            });
            stateRef.current.activeEffects = activeEffects;

            // Weather particles and ground fog are now handled by WeatherSystem.ts using InstancedMesh

            // --- PLAYER GROUP SETUP ---
            const playerGroup = ModelFactory.createPlayer();
            playerGroupRef.current = playerGroup;

            const bodyMesh = playerGroup.children.find(c => c.userData.isPlayer) || playerGroup.children[0] as THREE.Mesh;
            playerMeshRef.current = bodyMesh as THREE.Mesh;

            const pSpawn = { ...currentSector.playerSpawn };
            const fSpawn = { ...currentSector.familySpawn };

            playerGroup.position.set(pSpawn.x, 0, pSpawn.z); if (pSpawn.y) playerGroup.position.y = pSpawn.y;
            if (pSpawn.rot) playerGroup.rotation.y = pSpawn.rot;

            // Flashlight
            const fl = new THREE.SpotLight(0xffffee, 400, 60, Math.PI / 3, 0.6, 1);
            fl.position.set(0, 3.5, 0.5); fl.target.position.set(0, 0, 10); fl.castShadow = true;
            fl.shadow.camera.near = 1; fl.shadow.camera.far = 40; fl.shadow.bias = -0.0001;
            playerGroup.add(fl); playerGroup.add(fl.target);
            flashlightRef.current = fl;

            scene.add(playerGroup);
            prevPosRef.current = playerGroup.position.clone();

            // --- FAMILY MEMBERS SPAWNING ---
            activeFamilyMembers.current = [];

            // 1. Spawn already rescued family members (from persistent indices)
            if (propsRef.current.rescuedFamilyIndices) {
                propsRef.current.rescuedFamilyIndices.forEach(mapIdx => {
                    const theme = SECTOR_THEMES[mapIdx];
                    if (theme && theme.familyMemberId !== undefined) {
                        const fmData = FAMILY_MEMBERS[theme.familyMemberId];
                        if (fmData) {
                            const mesh = ModelFactory.createFamilyMember(fmData);
                            // Spawn them slightly behind the player
                            mesh.position.set(pSpawn.x + (Math.random() - 0.5) * 5, 0, pSpawn.z + 5 + Math.random() * 5);

                            const nameParams = createTextSprite(fmData.name);
                            nameParams.scale.set(12, 3, 1);
                            nameParams.position.y = 3.5;
                            mesh.add(nameParams);

                            const markerGroup = new THREE.Group();
                            markerGroup.position.y = 0.2;
                            const darkColor = new THREE.Color(fmData.color).multiplyScalar(0.2);
                            const fill = new THREE.Mesh(new THREE.CircleGeometry(5.0, 32), new THREE.MeshBasicMaterial({ color: darkColor, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }));
                            fill.rotation.x = -Math.PI / 2; markerGroup.add(fill);
                            const border = new THREE.Mesh(new THREE.RingGeometry(4.8, 5.0, 32), new THREE.MeshBasicMaterial({ color: fmData.color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
                            border.rotation.x = -Math.PI / 2; markerGroup.add(border);
                            mesh.add(markerGroup);

                            const fLight = new THREE.PointLight(fmData.color, 2, 8); fLight.position.y = 2; mesh.add(fLight);
                            flickeringLights.push({ light: fLight, baseInt: 2, flickerRate: 0.1 });

                            scene.add(mesh);
                            activeFamilyMembers.current.push({
                                mesh,
                                ring: markerGroup,
                                found: true,
                                following: true,
                                name: fmData.name,
                                id: fmData.id,
                                scale: fmData.scale,
                                seed: Math.random() * 100
                            });
                        }
                    }
                });
            }

            // 2. Spawn the current sector's target family member
            if (!propsRef.current.familyAlreadyRescued) {
                const theme = SECTOR_THEMES[propsRef.current.currentMap];
                const fmId = theme ? theme.familyMemberId : 0;

                // Only spawn if not already in the party
                if (!propsRef.current.rescuedFamilyIndices.includes(propsRef.current.currentMap)) {
                    const fmData = FAMILY_MEMBERS[fmId];
                    if (fmData) {
                        const mesh = ModelFactory.createFamilyMember(fmData);
                        mesh.position.set(fSpawn.x, 0, fSpawn.z);
                        if (fSpawn.y) mesh.position.y = fSpawn.y;

                        const nameParams = createTextSprite(fmData.name);
                        nameParams.scale.set(12, 3, 1);
                        nameParams.position.y = 3.5;
                        mesh.add(nameParams);

                        const markerGroup = new THREE.Group();
                        markerGroup.position.y = 0.2;
                        const darkColor = new THREE.Color(fmData.color).multiplyScalar(0.2);
                        const fill = new THREE.Mesh(new THREE.CircleGeometry(5.0, 32), new THREE.MeshBasicMaterial({ color: darkColor, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }));
                        fill.rotation.x = -Math.PI / 2; markerGroup.add(fill);
                        const border = new THREE.Mesh(new THREE.RingGeometry(4.8, 5.0, 32), new THREE.MeshBasicMaterial({ color: fmData.color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
                        border.rotation.x = -Math.PI / 2; markerGroup.add(border);
                        mesh.add(markerGroup);

                        const fLight = new THREE.PointLight(fmData.color, 2, 8); fLight.position.y = 2; mesh.add(fLight);
                        flickeringLights.push({ light: fLight, baseInt: 2, flickerRate: 0.1 });

                        scene.add(mesh);
                        const currentFM = {
                            mesh,
                            ring: markerGroup,
                            found: false,
                            following: false,
                            name: fmData.name,
                            id: fmData.id,
                            scale: fmData.scale,
                            seed: Math.random() * 100
                        };
                        activeFamilyMembers.current.push(currentFM);
                        familyMemberRef.current = currentFM;
                    }
                }
            }

            // --- SYSTEMS INITIALIZATION ---
            session.addSystem(new PlayerMovementSystem(playerGroup));
            session.addSystem(new PlayerCombatSystem(playerGroup));
            session.addSystem(new WorldLootSystem(playerGroup, scene));

            const interactionSystem = new PlayerInteractionSystem(playerGroup, concludeSector, onCollectibleFoundInternal);
            session.addSystem(interactionSystem);

            session.addSystem(new SectorSystem(playerGroup, props.currentMap, {
                setNotification: (n: any) => {
                    if (n && n.visible && n.text) {
                        spawnBubble(`${n.icon ? n.icon + ' ' : ''}${n.text}`, n.duration || 3000);
                    }
                },
                t: (key: string) => t(key),
                spawnPart,
                startCinematic,
                setInteraction: (interaction: any) => {
                    if (interaction) {
                        setInteractionType('plant_explosive');
                        stateRef.current.currentInteraction = interaction;
                    } else {
                        setInteractionType(null);
                        stateRef.current.currentInteraction = null;
                    }
                },
                playSound: (id: string) => {
                    if (id === 'explosion') soundManager.playExplosion();
                    else soundManager.playUiConfirm();
                },
                playTone: (freq: number, type: OscillatorType, duration: number, vol?: number) => {
                    soundManager.playTone(freq, type, duration, vol || 0.1);
                },
                cameraShake: (amount: number) => {
                    stateRef.current.cameraShake = amount;
                },
                scene: engine.scene,
                setCameraOverride: (params: any) => {
                    cameraOverrideRef.current = params;
                },
                emitNoise: (pos: THREE.Vector3, radius: number, type: string) => {
                    session.noiseEvents.push({ pos: pos.clone(), radius, type: type as any, time: performance.now() });
                }
            }));

            session.addSystem(new EnemySystem(playerGroup, {
                spawnBubble,
                gainXp,
                t,
                onClueFound: propsRef.current.onClueFound,
                onBossKilled: (id: number) => {
                    if (!stateRef.current.bossesDefeated.includes(id)) {
                        stateRef.current.bossesDefeated.push(id);
                    }
                }
            }));

            // Set initial aim direction if specified in sector
            if (currentSector.initialAim) {
                engine.input.state.aimVector = new THREE.Vector2(currentSector.initialAim.x, currentSector.initialAim.y);
            }

            prevInputRef.current = false;

            // SNAP CAMERA (Prevent lerp jump on load)
            camera.position.set(playerGroup.position.x, currentSector.environment.cameraHeight || CAMERA_HEIGHT, playerGroup.position.z + currentSector.environment.cameraOffsetZ);
            camera.lookAt(playerGroup.position);

            // Call Loaded Callbacks
            if (isMounted.current) setIsSectorLoading(false);

            // Store Map Items in State for Runtime Access (e.g. SectorSystem)
            stateRef.current.mapItems = mapItems;

            if (propsRef.current.onMapInit) propsRef.current.onMapInit(mapItems);
            if (propsRef.current.onLevelLoaded) propsRef.current.onLevelLoaded();
        };

        runSetup();








        const spawnBoss = () => {
            if (stateRef.current.bossSpawned) return;
            const bossData = BOSSES[propsRef.current.currentMap] || BOSSES[0];
            const bSpawn = currentSector.bossSpawn;
            const newBoss = EnemyManager.spawnBoss(scene, { x: bSpawn.x, z: bSpawn.z }, bossData);
            newBoss.bossId = bossData.id;
            stateRef.current.enemies.push(newBoss);
            stateRef.current.bossSpawned = true;
            if (!stateRef.current.seenBosses.includes(bossData.id)) {
                stateRef.current.seenBosses.push(bossData.id);
            }

            // BOSS INTRO SEQUENCE
            bossIntroRef.current = { active: true, startTime: performance.now(), bossMesh: newBoss.mesh };
            setBossIntroActive(true);

            // Clear any previous timer
            if (bossIntroTimerRef.current) clearTimeout(bossIntroTimerRef.current);

            // Trigger Boss Spawn Sound
            soundManager.playBossSpawn(bossData.id);

            // Hide HUD during intro
            bossIntroTimerRef.current = window.setTimeout(() => {
                if (isMounted.current) {
                    setBossIntroActive(false);
                    bossIntroRef.current.active = false;
                }
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
                    endTime: performance.now() + 30000 // Long timeout, cleared by next cinematic or interaction
                };
            }
        });

        (window as any).clearCameraOverride = () => {
            cameraOverrideRef.current = null;
        };

        let lastTime = performance.now();
        let frame = 0;

        engine.onUpdate = (dt: number) => {
            if (!isMounted.current || propsRef.current.isPaused) return;

            const now = performance.now();
            windSystemRef.current.update(now);

            if (weatherSystemRef.current) {
                const currentWeather = propsRef.current.weather || 'none';
                weatherSystemRef.current.sync(currentWeather, engine.getSettings().weatherCount, 200);
                weatherSystemRef.current.update(dt, now);
            }

            // Wait for Init
            const playerGroup = playerGroupRef.current;
            if (!playerGroup || playerGroup.children.length === 0) return;

            const state = stateRef.current;
            lastDrawCallsRef.current = engine.renderer.info.render.calls;
            const input = engine.input.state;

            const delta = dt;

            // ... (rest of animation loop)
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

                if (!bossIntroActive) {
                    const hudData = HudSystem.getHudData(
                        state,
                        playerGroupRef.current.position,
                        hudMesh,
                        input,
                        now,
                        propsRef.current,
                        distanceTraveledRef.current,
                        camera
                    );
                    hudData.debugInfo.drawCalls = lastDrawCallsRef.current;
                    propsRef.current.onUpdateHUD({ ...hudData, fps, debugMode: propsRef.current.debugMode });
                } else {
                    if (propsRef.current.onUpdateHUD && now % 5 === 0) { // Throttled HUD update
                        const hudData = HudSystem.getHudData(state, playerGroupRef.current.position, hudMesh, input, now, propsRef.current, distanceTraveledRef.current, camera);
                        hudData.debugInfo.drawCalls = lastDrawCallsRef.current;
                        propsRef.current.onUpdateHUD({ ...hudData, fps: Math.round(1000 / delta) });
                    }
                }
            }

            if (bossIntroRef.current.active && bossIntroRef.current.bossMesh) {
                const bossMesh = bossIntroRef.current.bossMesh;
                const bossPos = bossMesh.position;
                const introTime = now - bossIntroRef.current.startTime;
                const targetPos = new THREE.Vector3(bossPos.x, 12, bossPos.z + 20);
                camera.position.lerp(targetPos, 0.05);
                camera.lookAt(bossPos.x, bossPos.y + 3, bossPos.z);
                if (frame % 5 === 0 && introTime < 3000) {
                    bossMesh.rotation.y += (Math.random() - 0.5) * 0.2;
                    bossMesh.scale.setScalar(3.0 + Math.sin(now * 0.02) * 0.1);
                }
                if (playerMeshRef.current) {
                    PlayerAnimation.update(playerMeshRef.current, { isMoving: false, isRushing: false, isRolling: false, rollStartTime: 0, staminaRatio: 1.0, isSpeaking: false, isThinking: false, isIdleLong: false, seed: 0 }, now, delta);
                }
                lastDrawCallsRef.current = engine.renderer.info.render.calls;
                lastTime = now;
                return;
            }

            if (state.isDead) {
                DeathSystem.update(state, { deathPhase: deathPhaseRef, playerGroup: playerGroupRef.current, playerMesh: playerMeshRef.current, fmMesh: familyMemberRef.current?.mesh || null, familyMembers: activeFamilyMembers.current, input: engine.input.state, camera: camera }, setDeathPhase, propsRef.current, now, delta, distanceTraveledRef.current, { spawnDecal, spawnPart });
                if (playerGroupRef.current) {
                    FXSystem.update(scene, state.particles, state.bloodDecals, delta, frame, now, playerGroupRef.current.position, { spawnPart, spawnDecal });
                }
                lastDrawCallsRef.current = engine.renderer.info.render.calls;
                lastTime = now;
                return;
            }

            if (state.bossDefeatedTime > 0) {
                // Fix: Only apply invulnerability if the boss was defeated RECENTLY (within last 10s)
                // This prevents permanent invulnerability if bossDefeatedTime persists from previous runs.
                if (now - state.bossDefeatedTime < 10000) {
                    state.invulnerableUntil = now + 10000;
                    if (now - state.bossDefeatedTime > 4000) {
                        concludeSector(state.familyFound);
                        return;
                    }
                } else {
                    // Timer is old/stale, clear it to prevent issues
                    state.bossDefeatedTime = 0;
                }
            }

            if (propsRef.current.triggerEndSector) {
                concludeSector(false);
                return;
            }

            if (!propsRef.current.isRunning || propsRef.current.isPaused) { soundManager.stopRadioStatic(); lastTime = now; return; }

            frame++;

            if (state.isInteractionOpen && !cinematicRef.current.active) {
                lastDrawCallsRef.current = engine.renderer.info.render.calls;
                lastTime = now;
                return;
            }

            const currentInput = engine.input.state;
            let speed = 15 * propsRef.current.stats.speed;

            const isCinematic = cinematicRef.current.active;
            const isBossIntro = bossIntroRef.current.active;

            // --- GAMEPLAY UPDATES (Gated) ---
            if (!isCinematic && !isBossIntro) {
                if (propsRef.current.teleportTarget && propsRef.current.teleportTarget.timestamp > lastTeleportRef.current) {
                    const tgt = propsRef.current.teleportTarget;
                    playerGroupRef.current.position.set(tgt.x, 0, tgt.z);
                    spawnPart(tgt.x, 1, tgt.z, 'smoke', 20); soundManager.playTone(800, 'sine', 0.2, 0.1);

                    // Teleport Family Members
                    if (activeFamilyMembers.current) {
                        activeFamilyMembers.current.forEach(fm => {
                            if (fm.mesh && fm.following) {
                                const offX = (Math.random() - 0.5) * 3;
                                const offZ = (Math.random() - 0.5) * 3;
                                fm.mesh.position.set(tgt.x + offX, 0, tgt.z + offZ);
                                spawnPart(tgt.x + offX, 1, tgt.z + offZ, 'smoke', 10);
                            }
                        });
                    }

                    lastTeleportRef.current = tgt.timestamp; camera.position.set(tgt.x, 50, tgt.z + currentSector.environment.cameraOffsetZ); camera.lookAt(playerGroupRef.current.position);
                    prevPosRef.current = playerGroupRef.current.position.clone();
                }

                // Sync input state
                gameSessionRef.current!.inputDisabled = !!propsRef.current.disableInput || (!!cameraOverrideRef.current?.active);
                gameSessionRef.current!.isMobile = !!propsRef.current.isMobileDevice;
                gameSessionRef.current!.debugMode = propsRef.current.debugMode;

                // Update Game Session (Systems)
                gameSessionRef.current!.cameraAngle = cameraAngleRef.current;
                gameSessionRef.current!.update(delta);
                const isMoving = state.isMoving;

                if (prevPosRef.current && playerGroupRef.current) { const d = playerGroupRef.current.position.distanceTo(prevPosRef.current); distanceTraveledRef.current += d; }
                if (playerGroupRef.current) prevPosRef.current = playerGroupRef.current.position.clone();

                if (playerMeshRef.current) {
                    PlayerAnimation.update(playerMeshRef.current, { isMoving, isRushing: state.isRushing, isRolling: state.isRolling, rollStartTime: state.rollStartTime, staminaRatio: state.stamina / state.maxStamina, isSpeaking: state.speakBounce > 0 || now < state.speakingUntil, isThinking: now < state.thinkingUntil, isIdleLong: (now - state.lastActionTime > 20000), seed: 0 }, now, delta);
                }
            }

            // --- ANIMATION UPDATES (Global) ---

            // Update all active family members (Always runs, movement restricted internally during cinematic)
            activeFamilyMembers.current.forEach((fm, index) => {
                if (fm.mesh) {
                    FamilySystem.update(fm, playerGroupRef.current, state, cinematicRef.current.active, now, delta, {
                        setFoundMemberName,
                        startCinematic
                    }, index);
                }
            });

            // Update Footprints
            FootprintSystem.update(delta);

            // Cinematic Update (Overrides)
            if (isCinematic) {
                // Pass familyMembers as undefined since we handle them globally now, or keep it if needed for specific logic?
                // We removed the ring pulse hack, so the arg is unused in CinematicSystem.
                CinematicSystem.update(cinematicRef.current, camera, playerMeshRef.current, bubbleRef, now, delta, frame, { setCurrentLine, setCinematicActive, endCinematic, playCinematicLine }, activeFamilyMembers.current);
            }

            if (!isCinematic && !isBossIntro) {
                if (cameraOverrideRef.current && cameraOverrideRef.current.active) {
                    const override = cameraOverrideRef.current;
                    if (now > override.endTime) {
                        cameraOverrideRef.current = null;
                    } else {
                        const currentPos = camera.position.clone();
                        currentPos.lerp(override.targetPos, 0.05);
                        camera.position.copy(currentPos);
                        camera.lookAt(override.lookAtPos);
                    }
                } else {
                    // Camera Rotation Lerp
                    cameraAngleRef.current += (cameraAngleTargetRef.current - cameraAngleRef.current) * 0.1;
                    CameraSystem.update(camera, playerGroupRef.current.position, currentSector.environment.cameraOffsetZ, state, false, delta, cameraAngleRef.current, cameraHeightModifierRef.current);
                }
            }

            // Render
            lastDrawCallsRef.current = engine.renderer.info.render.calls;
            lastTime = now;


            // WeaponHandler Inputs removed (Moved to PlayerCombatSystem)

            // InteractionSystem moved to PlayerInteractionSystem
            // Interaction logic: Sync Type & Project position to HUD
            const currentInter = state.interactionType;
            if (currentInter !== interactionTypeRef.current) {
                interactionTypeRef.current = currentInter;
                setInteractionType(currentInter);
            }

            // Fixed Input Handling for Interactions
            if (currentInput.e && !prevInputRef.current) {
                if (state.currentInteraction && state.currentInteraction.action) {
                    state.currentInteraction.action();
                    // Clear after action? Depends on the action. 
                    // Usually the action will update state that disables the interaction condition next frame.
                }
            }
            prevInputRef.current = currentInput.e;

            if (currentInter && state.currentInteraction) {
                // Use specific interaction position if available, otherwise default to Player
                let projectPos: THREE.Vector3;

                if (state.currentInteraction.position) {
                    projectPos = state.currentInteraction.position.clone();
                    // Add fixed offset for visual clearance above the object
                    projectPos.y += 1.5;
                } else {
                    projectPos = playerGroupRef.current.position.clone();
                    projectPos.y += 2.5; // Same height as reload bar
                }

                const vector = projectPos.project(camera);
                const screenX = (vector.x + 1) / 2 * 100;
                const screenY = (1 - vector.y) / 2 * 100;
                setInteractionScreenPos({ x: screenX, y: screenY });
            } else {
                setInteractionScreenPos(null);
            }

            const gameContext = {
                scene, enemies: state.enemies, obstacles: state.obstacles, spawnPart, spawnDecal,
                explodeEnemy: (e: Enemy, force: THREE.Vector3) => EnemyManager.explodeEnemy(e, force, { spawnPart, spawnDecal }),
                addScore: (amt: number) => gainXp(amt),
                trackStats: (type: 'damage' | 'hit', amt: number, isBoss?: boolean) => {
                    if (type === 'damage') { state.damageDealt += amt; if (isBoss) state.bossDamageDealt += amt; gainXp(Math.ceil(amt)); }
                    if (type === 'hit') state.shotsHit += amt;
                },
                now
            };

            // Noise System (Player)
            if (state.isMoving) {
                const noiseType = state.isRushing || state.isRolling ? 'run' : 'walk';
                const noiseRadius = state.isRushing || state.isRolling ? 20 : 15;
                // Throttle: Only every 500ms? Or every frame?
                // AI checks every frame, so persistent noise is fine, but maybe spammy?
                // Actually, let's just emit it. The AI Loop clears events.
                session.noiseEvents.push({ pos: playerGroupRef.current.position.clone(), radius: noiseRadius, type: 'footstep', time: now });
            }

            ProjectileSystem.update(delta, now, gameContext, state.projectiles, state.fireZones);

            // EnemyManager.update moved to EnemySystem
            // TriggerHandler moved to TriggerSystem (Future) or kept here if needed
            TriggerHandler.checkTriggers(playerGroupRef.current.position, state, now, {
                spawnBubble,
                removeVisual: (id: string) => {
                    const visual = scene.getObjectByName(`clue_visual_${id}`) || scene.children.find(o => o.userData.id === id && o.userData.type === 'clue_visual');
                    if (visual) scene.remove(visual);
                },
                onClueFound: (clue) => {
                    // Only narrative clues here
                    if (clue.id) {
                        propsRef.current.onClueFound(clue);
                    }
                },
                onTrigger: (type: string, duration: number) => {
                    if (type === 'THOUGHTS') state.thinkingUntil = now + duration;
                    else if (type === 'SPEECH') state.speakingUntil = now + duration;
                },
                onAction: (action) => handleTriggerAction(action, scene),
                collectedCluesRef, t
            });

            for (let i = activeBubbles.current.length - 1; i >= 0; i--) {
                const b = activeBubbles.current[i];
                const age = now - b.startTime;
                if (age > b.duration) { if (b.element.parentNode) b.element.parentNode.removeChild(b.element); activeBubbles.current.splice(i, 1); continue; }

                // Stack Logic: Oldest on Top
                // i=0 is oldest. i=length-1 is newest.
                // We want oldest at the top of the stack.
                // Base Y is the bottom-most position for the NEWEST bubble.
                // If we iterate 0..N, 0 should be highest.

                const stackIndex = (activeBubbles.current.length - 1) - i; // 0 for newest, increasing for older
                // Wait, user said "Oldest (first message) on top". 
                // So the queue grows DOWNWARDS? Or it grows UPWARDS?
                // Standard chat: Newest at bottom. Oldest scrolls up.
                // Let's position Newest at Base Y. Oldest at Base Y - (Index * Height).

                const baseX = window.innerWidth * 0.5;
                const baseY = window.innerHeight * 0.45;
                const bubbleHeight = 45; // Approx height + gap

                const x = baseX;
                const y = baseY - (stackIndex * bubbleHeight);

                b.element.style.left = `${x}px`;
                b.element.style.top = `${y}px`;

                // Animation
                // Fade In (0-200ms) | Sustain | Fade Out (End)
                let opacity = '1';
                if (age < 200) opacity = `${age / 200}`;
                else if (age > b.duration - 500) opacity = `${(b.duration - age) / 500}`;

                // Update tail position for active dialogue bubbles if they belong to a family member
                // (Logic could be added here if needed to sync bubbles to world positions)

                // Slide In Effect for Newest
                let transform = `translate(-50%, -100%)`; // Centered and above the point
                if (age < 200) {
                    const slide = (1 - (age / 200)) * 20;
                    transform += ` translateY(${slide}px)`;
                }

                b.element.style.transform = transform;
                b.element.style.opacity = opacity;
                b.element.style.zIndex = `${1000 - stackIndex}`; // Newest on top if overlapping? No, preventing overlap.
                b.element.style.transition = 'top 0.3s ease-out'; // Smooth sorting
            }

            EnvironmentSystem.update(flickeringLights);

            // --- ACTIVE EFFECTS (ASSET DRIVEN) ---
            if (state.activeEffects) {
                state.activeEffects.forEach((obj: any) => {
                    if (!obj.userData.effects) return;
                    const effects = obj.userData.effects;

                    effects.forEach((eff: any) => {
                        if (eff.type === 'emitter') {
                            if (!eff.lastEmit) eff.lastEmit = 0;
                            if (now - eff.lastEmit > eff.interval) {
                                eff.lastEmit = now;

                                const pos = new THREE.Vector3();
                                if (eff.offset) {
                                    pos.copy(eff.offset);
                                    obj.localToWorld(pos);
                                } else {
                                    obj.getWorldPosition(pos);
                                }

                                if (eff.spread) {
                                    pos.x += (Math.random() - 0.5) * eff.spread;
                                    pos.z += (Math.random() - 0.5) * eff.spread;
                                }

                                spawnPart(pos.x, pos.y, pos.z, eff.particle, eff.count || 1, undefined, undefined, eff.color);
                            }
                        }
                    });
                });
            }

            // --- BURNING OBJECTS FX (LEGACY) ---
            burningObjects.forEach(b => {
                if (frame % 3 === 0) {
                    const rx = (Math.random() - 0.5) * 3;
                    const rz = (Math.random() - 0.5) * 2;
                    spawnPart(b.position.x + rx, b.position.y, b.position.z + rz, 'campfire_flame', 1, undefined, undefined, 0xff7700);
                }
                if (frame % 8 === 0) {
                    spawnPart(b.position.x + (Math.random() - 0.5) * 2, b.position.y + 0.5, b.position.z + (Math.random() - 0.5) * 2, 'campfire_spark', 1);
                }
            });

            if (playerGroupRef.current) {
                FXSystem.update(scene, state.particles, state.bloodDecals, delta, frame, now, playerGroupRef.current.position, { spawnPart, spawnDecal });
            }
        };

        return () => {
            isMounted.current = false;
            window.removeEventListener('boss-spawn-trigger', spawnBoss);
            window.removeEventListener('family-follow', onFamilyFollow);
            window.removeEventListener('family_follow', onFamilyFollow);

            if (setupTimerRef.current) clearTimeout(setupTimerRef.current);
            if (bossIntroTimerRef.current) clearTimeout(bossIntroTimerRef.current);

            // Stop loop and disable input, but DO NOT dispose the singleton engine
            engine.stop();
            engine.input.disable();
            engineRef.current = null;

            // Aggressive scene scrub for players
            scene.children.slice().forEach(child => {
                if (child.userData?.isPlayer || child.userData?.isLaserSight) {
                    scene.remove(child);
                }
            });

            if (playerGroupRef.current) {
                scene.remove(playerGroupRef.current);
            }

            // Reset sound parameters
            soundManager.setReverb(0);
            soundManager.stopRadioStatic();

            ProjectileSystem.clear(scene, stateRef.current.projectiles, stateRef.current.fireZones);
            session.dispose();
        };
    }, [props.currentMap, props.startAtCheckpoint, textures]);

    // Helper to get Boss Name or Killer Name
    // Helper to get Boss Name or Killer Name
    const getKillerName = () => {
        if (!stateRef.current.killerType) return "UNKNOWN";

        const type = stateRef.current.killerType;

        // 1. Boss Special Case
        if (type === 'Boss') {
            return t(BOSSES[props.currentMap]?.name || "ui.boss").toUpperCase();
        }

        // 2. Standard Enemy Mapping (e.g. TANK_SMASH -> TANK -> "Tank")
        const baseType = type.split('_')[0];
        const key = `enemies.${baseType}.name`;
        const localized = t(key);

        // If translation exists (doesn't return key), use it
        if (localized && localized !== key) {
            return localized.toUpperCase();
        }

        // 3. Fallback: Prettify the raw string (e.g. "EXPLOSION_DAMAGE" -> "EXPLOSION DAMAGE")
        return type.replace(/_/g, ' ').toUpperCase();
    };

    return (
        <div className="absolute inset-0 w-full h-full">

            <div
                ref={containerRef}
                className={`absolute inset-0`}
                onClick={() => {
                    if (cinematicActive && currentLine) {
                        // Skip bubble
                        playCinematicLine(cinematicRef.current.lineIndex + 1);
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
            {
                cinematicActive && (
                    <div className={`absolute ${props.isMobileDevice ? 'bottom-8' : 'bottom-40'} left-1/2 -translate-x-1/2 pointer-events-auto z-50`}>
                        <button
                            onClick={() => { soundManager.playUiClick(); endCinematic(); }}
                            className="bg-black/80 border-2 border-white/50 text-white/70 hover:text-white hover:border-white px-6 py-2 font-bold uppercase text-xs tracking-widest transition-all skew-x-[-10deg]"
                        >
                            <span className="block skew-x-[10deg]">{t('ui.end_dialogue')}</span>
                        </button>
                    </div>
                )
            }

            {
                (deathPhase === 'MESSAGE' || deathPhase === 'CONTINUE') && (
                    <ScreenPlayerDied onContinue={triggerContinue} killerName={getKillerName()} isMobileDevice={props.isMobileDevice} />
                )
            }

            {
                !isSectorLoading && !bossIntroActive && !cinematicActive && !forceHideHUD && (
                    <GameUI
                        onCloseClue={() => { }}
                        interactionType={interactionType}
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
                )
            }

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
