import React, { useEffect, useRef, useMemo, useState } from 'react';
import * as THREE from 'three';
import { Engine } from '../core/engine/Engine';
import { GameSession } from '../core/GameSession';
import { PlayerStats, WeaponType, CinematicLine, NotificationState, SectorTrigger, MapItem, SectorState, MissionStats, TriggerAction, Obstacle, GameCanvasProps, DeathPhase } from '../types';

import { WEAPONS, BOSSES, MAP_THEMES, FAMILY_MEMBERS, PLAYER_CHARACTER, LEVEL_CAP } from '../content/constants';


import { STORY_SCRIPTS } from '../content/dialogues';
import { soundManager } from '../utils/sound';
import { t } from '../utils/i18n';
import { createProceduralTextures, createTextSprite, GEOMETRY, MATERIALS, ModelFactory } from '../utils/assets';
import { SectorManager } from '../core/SectorManager';
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
import { WorldLootSystem } from '../core/systems/WorldLootSystem'; // New
import { PlayerInteractionSystem } from '../core/systems/PlayerInteractionSystem';
import { EnemySystem } from '../core/systems/EnemySystem';
import { SectorSystem } from '../core/systems/SectorSystem'; // New
import CinematicBubble from './game/CinematicBubble';
import GameUI from './game/GameUI';
// ... (Interfaces remain same)


const seededRandom = (seed: number) => {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return () => {
        return (s = s * 16807 % 2147483647) / 2147483647;
    };
};
const GameCanvas: React.FC<GameCanvasProps> = React.memo((props) => {
    // Engine Ref instead of individual Three refs
    const engineRef = useRef<Engine | null>(null);
    const gameSessionRef = useRef<GameSession | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    // Remove chatOverlayRef unused here? Or keep if needed.
    const chatOverlayRef = useRef<HTMLDivElement>(null);

    // Keep GameState Refs (Rules, Stats)
    const stateRef = useRef<ReturnType<typeof GameSession.createInitialState>>(null!);
    if (!stateRef.current) {
        stateRef.current = GameSession.createInitialState(props);
    }

    const propsRef = useRef(props);
    useEffect(() => { propsRef.current = props; }, [props]);

    const [deathPhase, setDeathPhase] = useState<DeathPhase>('NONE');
    const deathPhaseRef = useRef<DeathPhase>('NONE');
    useEffect(() => { deathPhaseRef.current = deathPhase; }, [deathPhase]);

    const activeBubbles = useRef<any[]>([]);
    const hasEndedMission = useRef(false);
    const collectedCluesRef = useRef<SectorTrigger[]>([]);
    const distanceTraveledRef = useRef(0);
    const lastTeleportRef = useRef<number>(0);

    // Refs for callbacks to avoid closure issues if defined outside
    // Actually, passing them to systems requires them to be stable or updated.
    // Let's define them inside the useEffect before onUpdate, BUT before system instantiation.
    // The issue is system instantiation happens ONCE.
    // So `concludeMission` must capture `propsRef` and `gameSessionRef.current.state`.

    const prevPosRef = useRef<THREE.Vector3 | null>(null);

    // -- RESTORED HOOKS --
    const [cinematicActive, setCinematicActive] = useState(false);
    const [currentLine, setCurrentLine] = useState(0);
    const bubbleRef = useRef<HTMLDivElement>(null);
    const [bossIntroActive, setBossIntroActive] = useState(false);
    const bossIntroTimerRef = useRef<NodeJS.Timeout | null>(null);
    const [foundMemberName, setFoundMemberName] = useState('');
    const [interactionType, setInteractionType] = useState<'NONE' | 'LADDER' | 'BUS' | 'SHOP' | 'CLUE'>('NONE');
    const interactionTypeRef = useRef<string>('NONE');
    // Sync interaction type
    useEffect(() => { interactionTypeRef.current = interactionType; }, [interactionType]);

    const cinematicRef = useRef({ active: false, startCamPos: new THREE.Vector3(), endCamPos: new THREE.Vector3(), startTime: 0, duration: 0, script: [] as any[], lineIndex: 0, speakers: [] as any[], cameraBasePos: new THREE.Vector3(), cameraLookAt: new THREE.Vector3(), lineStartTime: 0, lineDuration: 0, typingDuration: 0 });
    const bossIntroRef = useRef({ active: false, startTime: 0, bossMesh: null as THREE.Group | null });
    const cameraOverrideRef = useRef<{ active: boolean, targetPos: THREE.Vector3, lookAtPos: THREE.Vector3, endTime: number } | null>(null);
    const [notification, setNotification] = useState<{ visible: boolean, text: string, icon: string, timestamp: number }>({ visible: false, text: '', icon: '', timestamp: 0 });

    const requestRef = useRef<number>();
    const isMounted = useRef(true);
    useEffect(() => { isMounted.current = true; return () => { isMounted.current = false; }; }, []);

    const playerGroupRef = useRef<THREE.Group>(new THREE.Group());
    const playerMeshRef = useRef<THREE.Group>(new THREE.Group());
    const reloadBarRef = useRef<HTMLDivElement>(null);
    const aimCrossRef = useRef<HTMLDivElement>(null);

    // ... Keep hooks for Cinematic/Intro


    // ... (EventListeners for death phase continue)
    useEffect(() => {
        if (deathPhase !== 'CONTINUE') return;
        const handleContinue = (e: Event) => {
            if (e.type === 'keydown' && (e as KeyboardEvent).key === 'Escape') return;
            if (!hasEndedMission.current) {
                const state = stateRef.current;
                const now = performance.now();
                hasEndedMission.current = true;
                propsRef.current.onDie({
                    timeElapsed: now - state.startTime, shotsFired: state.shotsFired, shotsHit: state.shotsHit, throwablesThrown: state.throwablesThrown,
                    killsByType: state.killsByType, scrapLooted: state.collectedScrap, xpGained: state.score, bonusXp: 0,
                    familyFound: state.familyFound, familyExtracted: state.familyExtracted, damageDealt: state.damageDealt, damageTaken: state.damageTaken,
                    bossDamageDealt: state.bossDamageDealt, bossDamageTaken: state.bossDamageTaken,
                    distanceTraveled: distanceTraveledRef.current, cluesFound: collectedCluesRef.current, chestsOpened: state.chestsOpened, bigChestsOpened: state.bigChestsOpened
                }, state.killerType || "Unknown");
            }
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
        if (props.onDialogueStateChange) props.onDialogueStateChange(cinematicActive);
    }, [cinematicActive]);

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
            if (!isInputEnabled) return;
            const key = e.key;
            if (key === 'Escape') propsRef.current.onPauseToggle(true);
            if (stateRef.current.isDead) return;
            stateRef.current.lastActionTime = performance.now();
            // Weapon switching handled by PlayerCombatSystem
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
    const familyMember = useRef({ mesh: null as any, ring: null as any, found: false, following: false, name: '', cooldown: 0, scale: 1.0, seed: Math.random() * 100 }).current;

    const startCinematic = (familyMesh: THREE.Group) => {
        if (cinematicRef.current.active) return;
        setFoundMemberName(familyMember.name);
        setCinematicActive(true);
        stateRef.current.isInteractionOpen = true;
        stateRef.current.familyFound = true;

        const pPos = playerGroupRef.current!.position.clone();
        const fPos = familyMesh.position.clone();
        const midPoint = new THREE.Vector3().addVectors(pPos, fPos).multiplyScalar(0.5);

        let camOffset = new THREE.Vector3(0, 20, 15);
        let camLookAtOffset = new THREE.Vector3(0, 0, 0);
        let rotationSpeed = 0;

        if (currentSector.cinematic) {
            const c = currentSector.cinematic;
            if (c.offset) camOffset.set(c.offset.x, c.offset.y, c.offset.z);
            if (c.lookAtOffset) camLookAtOffset.set(c.lookAtOffset.x, c.lookAtOffset.y, c.lookAtOffset.z);
            if (c.rotationSpeed) rotationSpeed = c.rotationSpeed;
        }

        const targetLookAt = midPoint.clone().add(camLookAtOffset);
        const targetPos = midPoint.clone().add(camOffset);

        cinematicRef.current = {
            active: true,
            cameraBasePos: targetPos,
            cameraLookAt: targetLookAt,
            speakers: [playerGroupRef.current!, familyMesh],
            script: currentScript,
            lineIndex: 0,
            lineStartTime: performance.now(),
            lineDuration: 0,
            typingDuration: 0,
            fadingOut: false,
            rotationSpeed,
            midPoint: midPoint,
            relativeOffset: camOffset
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
        window.dispatchEvent(new CustomEvent('family-follow'));
        const lastLine = currentScript[currentScript.length - 1];
        if (lastLine && lastLine.trigger === 'boss_start') {
            setTimeout(() => window.dispatchEvent(new CustomEvent('boss-spawn-trigger')), 1000);
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
                        setNotification({ visible: true, text: t('clues.bus_clear'), icon: '🚌', timestamp: performance.now() });
                        soundManager.playUiConfirm();
                    }
                    break;
                case 'GIVE_REWARD':
                    if (payload) {
                        if (payload.scrap) stateRef.current.collectedScrap += payload.scrap;
                        if (payload.xp) stateRef.current.score += payload.xp;
                        if (payload.sp) stateRef.current.spFromCollectibles += payload.sp;
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
                        setNotification({ visible: true, text: t('ui.threat_neutralized'), icon: '⚠️', timestamp: performance.now() });
                    }
                    break;
                case 'START_CINEMATIC':
                    if (familyMember.mesh) {
                        startCinematic(familyMember.mesh);
                    }
                    break;
            }
        };

        if (delay && delay > 0) {
            setTimeout(execute, delay);
        } else {
            execute();
        }
    };

    useEffect(() => {
        if (!containerRef.current) return;

        // --- ENGINE INIT ---



        // Init Engine
        const engine = new Engine();
        engine.mount(containerRef.current);
        engineRef.current = engine;
        engine.input.enable();

        // Init GameSession
        const session = new GameSession(engine);
        if (stateRef.current) {
            session.init(stateRef.current);
        }
        gameSessionRef.current = session;

        // Extract Engine Components for local usage
        const scene = engine.scene;
        const camera = engine.camera;
        const renderer = engine.renderer;

        soundManager.resume();


        isMounted.current = true;
        hasEndedMission.current = false;

        // Reset State
        setDeathPhase('NONE');
        deathPhaseRef.current = 'NONE';
        setBossIntroActive(false);
        bossIntroRef.current.active = false;
        cameraOverrideRef.current = null;
        if (bossIntroTimerRef.current) { clearTimeout(bossIntroTimerRef.current); bossIntroTimerRef.current = null; }

        stateRef.current.startTime = performance.now();
        stateRef.current.isDead = false;
        stateRef.current.sectorState = {};
        collectedCluesRef.current = [];
        distanceTraveledRef.current = 0;
        prevPosRef.current = null;
        stateRef.current.bossDefeatedTime = 0;
        stateRef.current.thinkingUntil = 0;
        stateRef.current.speakingUntil = 0;
        stateRef.current.lastActionTime = performance.now();
        stateRef.current.framesSinceHudUpdate = 0;
        stateRef.current.spFromLevelUp = 0;
        stateRef.current.spFromCollectibles = 0;

        stateRef.current.obstacles = [];
        stateRef.current.triggers = [];
        activeBubbles.current.forEach(b => { if (b.element.parentNode) b.element.parentNode.removeChild(b.element); });
        activeBubbles.current = [];

        // --- ENVIRONMENT SETUP ---
        const rng = seededRandom(propsRef.current.currentMap + 4242);
        const env = currentSector.environment;
        const textures = createProceduralTextures(); // Re-create or pass from props if needed

        AssetPreloader.warmup(renderer, env);

        scene.background = new THREE.Color(env.bgColor);
        scene.fog = new THREE.FogExp2(env.fogColor || env.bgColor, env.fogDensity);

        // Update Camera
        camera.fov = env.fov;
        camera.updateProjectionMatrix();
        camera.position.set(0, 50, env.cameraOffsetZ);

        ProjectileSystem.clear(scene);

        const ambientLight = new THREE.AmbientLight(0x404050, env.ambientIntensity);
        scene.add(ambientLight);

        if (env.moon && env.moon.visible) {
            const lightPos = env.moon.position || { x: 50, y: 100, z: 50 };
            const moonLight = new THREE.DirectionalLight(env.moon.color, env.moon.intensity);
            moonLight.position.set(lightPos.x, lightPos.y, lightPos.z);
            moonLight.castShadow = true;
            moonLight.shadow.camera.left = -100;
            moonLight.shadow.camera.right = 100;
            moonLight.shadow.camera.top = 100;
            moonLight.shadow.camera.bottom = -100;
            moonLight.shadow.mapSize.width = 2048;
            moonLight.shadow.mapSize.height = 2048;
            scene.add(moonLight);
        }

        if (env.sunPosition) {
            const sun = new THREE.DirectionalLight(0xffffee, 0.5);
            sun.position.set(env.sunPosition.x, env.sunPosition.y, env.sunPosition.z);
            sun.castShadow = true;
            scene.add(sun);
        }

        const groundMat = new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1.0, metalness: 0.0, color: env.groundColor });
        const tileSize = 500;
        const tileGeo = new THREE.PlaneGeometry(tileSize, tileSize);

        for (let gx = -2; gx <= 2; gx++) {
            for (let gz = -2; gz <= 2; gz++) {
                const tile = new THREE.Mesh(tileGeo, groundMat);
                tile.rotation.x = -Math.PI / 2;
                tile.position.set(gx * tileSize, 0, gz * tileSize);
                tile.receiveShadow = true;
                scene.add(tile);
            }
        }

        stateRef.current.chests = [];
        const chests = stateRef.current.chests;
        const flickeringLights: any[] = []; const burningBarrels: any[] = [];
        const mapItems: MapItem[] = [];

        // PASS TEXTURES TO CONTEXT
        const ctx = {
            scene,
            obstacles: stateRef.current.obstacles,
            chests,
            flickeringLights,
            burningBarrels,
            rng,
            triggers: stateRef.current.triggers,
            mapItems,
            debugMode: propsRef.current.debugMode,
            textures: textures // Passed from GameCanvas useMemo
        };
        currentSector.generate(ctx);

        // ... rest of setup
        if (propsRef.current.onLevelLoaded) propsRef.current.onLevelLoaded();
        if (propsRef.current.onMapInit) propsRef.current.onMapInit(mapItems);

        const weatherParticles: any[] = [];

        if (env.weather !== 'none') {
            const count = 100; // Force low count for performance (was env.weatherDensity || 4000)
            const geo = GEOMETRY.snowParticle;

            let color = 0xffffff;
            let opacity = 0.8;
            let velBase = new THREE.Vector3(0, -0.2, 0);

            if (env.weather === 'rain') {
                color = 0x8899ff; opacity = 0.6; velBase.set(0, -0.8, 0);
            } else if (env.weather === 'ash') {
                color = 0x555555; opacity = 0.8; velBase.set(0, -0.05, 0);
            } else if (env.weather === 'embers') {
                color = 0xff5500; opacity = 1.0; velBase.set(0, 0.05, 0);
            }

            const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity });

            for (let i = 0; i < count; i++) {
                const s = new THREE.Mesh(geo, mat);
                s.position.set((Math.random() - 0.5) * 300, Math.random() * 40, (Math.random() - 0.5) * 300);
                if (env.weather === 'rain') s.scale.set(0.5, 5, 1);
                scene.add(s);

                const v = velBase.clone();
                v.x += (Math.random() - 0.5) * 0.1;
                if (env.weather === 'embers') v.y += Math.random() * 0.05;
                else v.y -= Math.random() * 0.1;
                v.z += (Math.random() - 0.5) * 0.1;

                weatherParticles.push({ mesh: s, vel: v, resetY: 40 });
            }
        } else {
            for (let i = 0; i < 30; i++) {
                const m = new THREE.Mesh(GEOMETRY.fogParticle, MATERIALS.fog);
                m.position.set((Math.random() - 0.5) * 200, 2, (Math.random() - 0.5) * 200);
                m.rotation.x = -Math.PI / 2; m.rotation.z = Math.random() * Math.PI;
                scene.add(m); weatherParticles.push({ mesh: m, type: 'ground_fog', speed: (Math.random() - 0.5) * 0.5 });
            }
        }

        const fSpawn = currentSector.familySpawn;

        if (!propsRef.current.familyAlreadyRescued) {
            const theme = MAP_THEMES[propsRef.current.currentMap];
            const fmData = FAMILY_MEMBERS[theme ? theme.familyMemberId : 0];
            fmMesh = ModelFactory.createFamilyMember(fmData);
            fmMesh.position.set(fSpawn.x, 0, fSpawn.z);
            if (fSpawn.y) fmMesh.position.y = fSpawn.y;
            const nameParams = createTextSprite(fmData.name); nameParams.scale.set(12, 3, 1); nameParams.position.y = 3.5; fmMesh.add(nameParams);

            const markerGroup = new THREE.Group();
            markerGroup.position.y = 0.2;

            const darkColor = new THREE.Color(fmData.color).multiplyScalar(0.2);
            const fillGeo = new THREE.CircleGeometry(5.0, 32);
            const fillMat = new THREE.MeshBasicMaterial({ color: darkColor, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false });
            const fill = new THREE.Mesh(fillGeo, fillMat);
            fill.rotation.x = -Math.PI / 2;
            markerGroup.add(fill);

            const borderGeo = new THREE.RingGeometry(4.8, 5.0, 32);
            const borderMat = new THREE.MeshBasicMaterial({ color: fmData.color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
            const border = new THREE.Mesh(borderGeo, borderMat);
            border.rotation.x = -Math.PI / 2;
            markerGroup.add(border);

            fmMesh.add(markerGroup);
            familyMember.ring = markerGroup;

            const fLight = new THREE.PointLight(fmData.color, 2, 8);
            fLight.position.y = 2;
            fmMesh.add(fLight);
            flickeringLights.push({ light: fLight, baseInt: 2, flickerRate: 0.1 });

            scene.add(fmMesh); familyMember.mesh = fmMesh; familyMember.name = fmData.name; familyMember.scale = fmData.scale;
        } else familyMember.found = true;

        // Helper functions for Systems
        const gainXp = (amount: number) => {
            const state = session.state;
            state.currentXp += amount; state.score += amount;
            while (state.currentXp >= state.nextLevelXp && state.level < LEVEL_CAP) {
                state.currentXp -= state.nextLevelXp;
                state.level++;
                state.spFromLevelUp++;
                state.nextLevelXp = Math.floor(state.nextLevelXp * 1.2);
                soundManager.playUiConfirm();
            }
        };

        const concludeMission = (isExtraction: boolean) => {
            const state = session.state;
            const now = performance.now();
            if (!hasEndedMission.current) {
                hasEndedMission.current = true;
                if (isExtraction) { state.familyExtracted = true; soundManager.stopRadioStatic(); }

                propsRef.current.onMissionEnded({
                    timeElapsed: now - state.startTime, shotsFired: state.shotsFired, shotsHit: state.shotsHit, throwablesThrown: state.throwablesThrown,
                    killsByType: state.killsByType, scrapLooted: state.collectedScrap, xpGained: state.score, bonusXp: isExtraction ? 500 : 0,
                    familyFound: state.familyFound, familyExtracted: state.familyExtracted, damageDealt: state.damageDealt, damageTaken: state.damageTaken,
                    bossDamageDealt: state.bossDamageDealt, bossDamageTaken: state.bossDamageTaken,
                    chestsOpened: state.chestsOpened, bigChestsOpened: state.bigChestsOpened, distanceTraveled: distanceTraveledRef.current, cluesFound: collectedCluesRef.current, isExtraction
                });
            }
        };


        // ...



        // ...

        const playerGroup = ModelFactory.createPlayer();
        session.addSystem(new PlayerMovementSystem(playerGroup));
        session.addSystem(new PlayerCombatSystem(playerGroup));
        session.addSystem(new WorldLootSystem(playerGroup));
        session.addSystem(new PlayerInteractionSystem(playerGroup, concludeMission));
        session.addSystem(new EnemySystem(playerGroup, { spawnBubble, gainXp, t, onClueFound: propsRef.current.onClueFound }));
        session.addSystem(new SectorSystem(playerGroup, props.currentMap, { setNotification, t }));
        playerGroupRef.current = playerGroup;
        const bodyMesh = playerGroup.children.find(c => c.userData.isPlayer) || playerGroup.children[0] as THREE.Mesh;
        playerMeshRef.current = bodyMesh as THREE.Mesh;
        const pSpawn = currentSector.playerSpawn;
        playerGroup.position.set(pSpawn.x, 0, pSpawn.z); if (pSpawn.y) playerGroup.position.y = pSpawn.y;
        prevPosRef.current = playerGroup.position.clone();
        const laserGeo = new THREE.PlaneGeometry(0.1, 20); laserGeo.translate(0, 10, 0); laserGeo.rotateX(Math.PI / 2);
        const laserMat = new THREE.MeshBasicMaterial({ map: laserTex, color: 0x00ffff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
        const laserMesh = new THREE.Mesh(laserGeo, laserMat); laserMesh.position.y = 1.3; playerGroup.add(laserMesh);


        scene.add(playerGroup);

        if (propsRef.current.startAtCheckpoint && fmMesh) { playerGroup.position.copy(fmMesh.position).add(new THREE.Vector3(0, 0, 5)); if (fSpawn && fSpawn.y) playerGroup.position.y = 0; prevPosRef.current = playerGroup.position.clone(); }

        const spawnDecal = (x: number, z: number, scale: number, material?: THREE.Material) => {
            FXSystem.spawnDecal(scene, stateRef.current.bloodDecals, x, z, scale, material);
        };

        const spawnPart = (x: number, y: number, z: number, type: any, count: number, customMesh?: THREE.Mesh, customVel?: THREE.Vector3, color?: number) => {
            FXSystem.spawnPart(scene, stateRef.current.particles, x, y, z, type, count, customMesh, customVel, color);
        };



        const spawnZombie = (forcedType?: string, forcedPos?: THREE.Vector3) => {
            const newEnemy = EnemyManager.spawn(scene, playerGroup.position, forcedType, forcedPos, stateRef.current.bossSpawned, stateRef.current.enemies.length);
            if (newEnemy) stateRef.current.enemies.push(newEnemy);
        };

        if (propsRef.current.currentMap === 0) {
            for (let i = 0; i < 5; i++) {
                const jitterX = (Math.random() - 0.5) * 2; const jitterZ = (Math.random() - 0.5) * 2;
                spawnZombie('RUNNER', new THREE.Vector3(-18 + jitterX, 0, -5 + jitterZ));
            }
        } else for (let i = 0; i < 5; i++) spawnZombie('WALKER');

        const spawnBoss = () => {
            if (stateRef.current.bossSpawned) return;
            const bossData = BOSSES[propsRef.current.currentMap] || BOSSES[0];
            const bSpawn = currentSector.bossSpawn;
            const newBoss = EnemyManager.spawnBoss(scene, { x: bSpawn.x, z: bSpawn.z }, bossData);
            stateRef.current.enemies.push(newBoss);
            stateRef.current.bossSpawned = true;

            // BOSS INTRO SEQUENCE
            setBossIntroActive(true);
            bossIntroRef.current = { active: true, startTime: performance.now(), bossMesh: newBoss.mesh };

            // Clear any previous timer
            if (bossIntroTimerRef.current) clearTimeout(bossIntroTimerRef.current);

            // 4 Seconds Intro
            bossIntroTimerRef.current = window.setTimeout(() => {
                if (isMounted.current) {
                    setBossIntroActive(false);
                    bossIntroRef.current.active = false;
                }
            }, 4000);
        };

        window.addEventListener('boss-spawn-trigger', spawnBoss);
        const onFamilyFollow = () => { familyMember.following = true; stateRef.current.isInteractionOpen = false; stateRef.current.familyFound = true; if (!stateRef.current.bossSpawned) spawnBoss(); };
        window.addEventListener('family-follow', onFamilyFollow);

        let lastTime = performance.now();
        let frame = 0;

        engine.onUpdate = (dt: number) => {
            if (!isMounted.current || propsRef.current.isPaused) return;

            const state = stateRef.current;
            const now = performance.now();
            const input = engine.input.state;

            if (frame % 60 === 0 && propsRef.current.debugMode) {
                // Keep minimal debug info if debug mode is on, or just remove it.
                // Removing for now to clean up console.
            }



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

                if (!bossIntroActive) {
                    const hudData = HudSystem.getHudData(
                        state,
                        playerGroup.position,
                        fmMesh || null,
                        engine.input.state,
                        now,
                        propsRef.current,
                        distanceTraveledRef.current
                    );
                    propsRef.current.onUpdateHUD({ ...hudData, fps, debugMode: propsRef.current.debugMode });
                } else {
                    propsRef.current.onUpdateHUD({ ...HudSystem.getHudData(state, playerGroup.position, fmMesh || null, engine.input.state, now, propsRef.current, distanceTraveledRef.current), fps, isHidden: true });
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
                renderer.render(scene, camera);
                lastTime = now;
                return;
            }

            if (state.isDead) {
                DeathSystem.update(state, { deathPhase: deathPhaseRef, playerGroup: playerGroupRef.current, playerMesh: playerMeshRef.current, fmMesh: familyMember.mesh || null, input: engine.input.state }, setDeathPhase, propsRef.current, now, delta, distanceTraveledRef.current, { spawnDecal, spawnPart });
                FXSystem.update(scene, state.particles, weatherParticles, state.bloodDecals, delta, frame, now, playerGroup.position, { spawnPart, spawnDecal });
                renderer.render(scene, camera);
                lastTime = now;
                return;
            }

            if (state.bossDefeatedTime > 0) {
                state.invulnerableUntil = now + 10000;
                if (now - state.bossDefeatedTime > 4000) {
                    concludeMission(false);
                    return;
                }
            }

            if (propsRef.current.triggerEndMission) {
                concludeMission(false);
                return;
            }

            if (!propsRef.current.isRunning || propsRef.current.isPaused) { soundManager.stopRadioStatic(); lastTime = now; return; }

            frame++;

            if (cinematicRef.current.active) {
                CinematicSystem.update(cinematicRef.current, camera, playerMeshRef.current, bubbleRef, now, delta, frame, { setCurrentLine, setCinematicActive, endCinematic, playCinematicLine });
                renderer.render(scene, camera);
                lastTime = now;
                return;
            }

            if (state.isInteractionOpen) { renderer.render(scene, camera); lastTime = now; return; }

            const currentInput = engine.input.state;
            let speed = 15 * propsRef.current.stats.speed;

            if (propsRef.current.teleportTarget && propsRef.current.teleportTarget.timestamp > lastTeleportRef.current) {
                const tgt = propsRef.current.teleportTarget;
                playerGroup.position.set(tgt.x, 0, tgt.z);
                spawnPart(tgt.x, 1, tgt.z, 'smoke', 20); soundManager.playTone(800, 'sine', 0.2, 0.1);
                lastTeleportRef.current = tgt.timestamp; camera.position.set(tgt.x, 50, tgt.z + env.cameraOffsetZ); camera.lookAt(playerGroup.position);
                prevPosRef.current = playerGroup.position.clone();
            }

            // Sync input state
            gameSessionRef.current!.inputDisabled = !!propsRef.current.disableInput || (!!cameraOverrideRef.current?.active);
            gameSessionRef.current!.debugMode = propsRef.current.debugMode;

            // Update Game Session (Systems)
            gameSessionRef.current!.update(delta);
            const isMoving = state.isMoving;

            const aim = currentInput.aimVector;
            if (aim.lengthSq() > 1 && !propsRef.current.disableInput && !cameraOverrideRef.current?.active) {
                const targetX = playerGroup.position.x + aim.x; const targetZ = playerGroup.position.z + aim.y;
                playerGroup.lookAt(targetX, playerGroup.position.y, targetZ);
            }

            if (prevPosRef.current) { const d = playerGroup.position.distanceTo(prevPosRef.current); distanceTraveledRef.current += d; }
            prevPosRef.current = playerGroup.position.clone();

            if (playerMeshRef.current) {
                PlayerAnimation.update(playerMeshRef.current, { isMoving, isRushing: state.isRushing, isRolling: state.isRolling, rollStartTime: state.rollStartTime, staminaRatio: state.stamina / state.maxStamina, isSpeaking: state.speakBounce > 0 || now < state.speakingUntil, isThinking: now < state.thinkingUntil, isIdleLong: (now - state.lastActionTime > 20000), seed: 0 }, now, delta);
            }

            if (familyMember.mesh) {
                FamilySystem.update(familyMember, playerGroup, state, cinematicRef.current.active, now, delta, { setFoundMemberName, startCinematic });
            }

            if (!cinematicRef.current.active && !bossIntroRef.current.active) {
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
                    CameraSystem.update(camera, playerGroup.position, env.cameraOffsetZ, state, false, delta);
                }
            }

            // WeaponHandler Inputs removed (Moved to PlayerCombatSystem)

            // InteractionSystem moved to PlayerInteractionSystem
            const currentInter = state.interactionType;
            if (currentInter !== interactionTypeRef.current) { interactionTypeRef.current = currentInter; setInteractionType(currentInter); }

            // Interaction Key Press moved to PlayerInteractionSystem

            // WeaponHandler Firing removed (Moved to PlayerCombatSystem)

            const gameContext = {
                scene, enemies: state.enemies, obstacles: state.obstacles, spawnPart, spawnDecal,
                explodeEnemy: (e: Enemy, force: THREE.Vector3) => EnemyManager.explodeEnemy(e, force, scene, state.particles),
                addScore: (amt: number) => gainXp(amt),
                trackStats: (type: 'damage' | 'hit', amt: number, isBoss?: boolean) => {
                    if (type === 'damage') { state.damageDealt += amt; if (isBoss) state.bossDamageDealt += amt; }
                    if (type === 'hit') state.shotsHit += amt;
                },
                addFireZone: (z: any) => ProjectileSystem.fireZones.push(z)
            };

            ProjectileSystem.update(delta, now, gameContext);

            // LootSystem update moved to WorldLootSystem within GameSession

            if (!bossIntroRef.current.active) {
                EnemyManager.update(delta, now, playerGroup.position, state.enemies, state.obstacles,
                    (damage: number, type: string, enemyPos: THREE.Vector3) => {
                        if (now < state.invulnerableUntil) return;
                        state.damageTaken += damage; state.hp -= damage; soundManager.playDamageGrunt(); state.hurtShake = 1.0; state.lastDamageTime = now; if (type === 'Boss') state.bossDamageTaken += damage;
                        spawnPart(playerGroup.position.x, 1.2, playerGroup.position.z, 'blood', 80);
                        if (state.hp <= 0 && !state.isDead) {
                            state.isDead = true;
                            state.deathStartTime = now;
                            state.killerType = type;
                            const playerMoveDir = new THREE.Vector3(0, 0, 0);
                            if (input.w) playerMoveDir.z -= 1; if (input.s) playerMoveDir.z += 1; if (input.a) playerMoveDir.x -= 1; if (input.d) playerMoveDir.x += 1;
                            if (playerMoveDir.lengthSq() > 0) state.deathVel = playerMoveDir.normalize().multiplyScalar(15);
                            else state.deathVel = new THREE.Vector3().subVectors(playerGroup.position, enemyPos).normalize().multiplyScalar(12);
                            state.deathVel.y = 4;
                        }
                    },
                    spawnPart, spawnDecal,
                    (dotDamage: number, isBoss?: boolean) => { state.damageDealt += dotDamage; if (isBoss) state.bossDamageDealt += dotDamage; gainXp(Math.ceil(dotDamage)); }
                );
            }

            TriggerHandler.checkTriggers(playerGroup.position, state, now, {
                spawnBubble,
                removeVisual: (id: string) => { const visual = scene.children.find(o => o.userData.id === id && o.userData.type === 'clue_visual'); if (visual) scene.remove(visual); },
                onClueFound: (clue) => {
                    propsRef.current.onClueFound(clue);
                    if (clue.type === 'COLLECTIBLE') {
                        const alreadyFound = propsRef.current.stats.cluesFound.includes(clue.content);
                        if (!alreadyFound) state.spFromCollectibles++;
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
                const vec = playerGroup.position.clone(); vec.y += 2.5; vec.project(camera);
                const x = (vec.x * 0.5 + 0.5) * window.innerWidth; const y = (-(vec.y * 0.5) + 0.5) * window.innerHeight;
                b.element.style.left = `${x}px`; b.element.style.top = `${y}px`; b.element.style.transform = `translate(-50%, -100%) translateY(-${(age / b.duration) * 20}px)`; b.element.style.opacity = age < 200 ? `${age / 200}` : (age > b.duration - 500 ? `${(b.duration - age) / 500}` : '1');
            }

            EnvironmentSystem.update(flickeringLights);

            // EnemyManager.cleanupDeadEnemies moved to EnemySystem

            FXSystem.update(scene, state.particles, weatherParticles, state.bloodDecals, delta, frame, now, playerGroup.position, { spawnPart, spawnDecal });

            // currentSector.onUpdate moved to SectorSystem
            // Verify Debug Update
            const dbg = document.getElementById('debug-stats');
            if (dbg) {
                dbg.innerHTML = `
                    FPS: ${Math.round(1 / delta)} <br/>
                    Frame: ${frame} <br/>
                    Pos: ${playerGroup.position.x.toFixed(1)}, ${playerGroup.position.z.toFixed(1)} <br/>
                    Inp: W:${input.w} S:${input.s} Fire:${input.fire} <br/>
                    Cam: ${camera.position.x.toFixed(1)}, ${camera.position.z.toFixed(1)} <br/>
                    Enemies: ${state.enemies.length} <br/>
                    HP: ${state.hp.toFixed(0)} <br/>
                    Render: ${renderer.info.render.calls} <br/>
                    Objs: ${scene.children.length} <br/>
                    Modes: Cin:${cinematicRef.current.active} Boss:${bossIntroRef.current.active} Cut:${cameraOverrideRef.current?.active}
                `;
            }

            // Render handled by Engine
        };

        return () => {
            isMounted.current = false;
            window.removeEventListener('boss-spawn-trigger', spawnBoss); window.removeEventListener('family-follow', onFamilyFollow);
            if (bossIntroTimerRef.current) clearTimeout(bossIntroTimerRef.current);
            engine.dispose();
            engineRef.current = null;
        };
    }, [props.currentMap, props.startAtCheckpoint, textures]);

    // Helper to get Boss Name or Killer Name
    const getKillerName = () => {
        if (!stateRef.current.killerType) return "UNKNOWN";
        if (stateRef.current.killerType === 'Boss') {
            return t(BOSSES[props.currentMap]?.name || "ui.boss").toUpperCase();
        }
        return stateRef.current.killerType.toUpperCase();
    };

    return (
        <div className="absolute inset-0 w-full h-full">
            {/* DEBUG OVERLAY */}
            <div className="absolute top-1/2 right-0 -translate-y-1/2 p-2 bg-black/50 text-green-400 font-mono text-xs z-[200] pointer-events-none text-right">
                <div id="debug-stats">Initializing Debug...</div>
            </div>

            {/* STATIC CROSSHAIR (Visible when Running) */}
            {!props.isPaused && !props.isClueOpen && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 pointer-events-none z-[100] flex items-center justify-center opacity-80">
                    <div className="w-1 h-1 bg-red-500 rounded-full shadow-[0_0_5px_red]"></div>
                    <div className="absolute w-8 h-[1px] bg-white/30"></div>
                    <div className="absolute h-8 w-[1px] bg-white/30"></div>
                </div>
            )}

            <div
                ref={containerRef}
                className="absolute inset-0 cursor-none"
                onClick={() => {
                    if (props.isRunning && containerRef.current) {
                        try {
                            containerRef.current.requestPointerLock();
                        } catch (e) {
                            console.warn("Pointer lock failed", e);
                        }
                    }
                }}
            />
            <div ref={chatOverlayRef} className="absolute inset-0 pointer-events-none" />
            <CinematicBubble
                text={currentLine ? t(currentLine.text) : ""}
                speakerName={currentLine ? currentLine.speaker : ""}
                isVisible={cinematicActive && currentLine !== null}
                domRef={bubbleRef}
            />
            {
                cinematicActive && (
                    <div className="absolute bottom-40 left-1/2 -translate-x-1/2 pointer-events-auto z-50">
                        <button
                            onClick={() => { soundManager.playUiClick(); endCinematic(); }}
                            className="bg-black/80 border-2 border-white/50 text-white/70 hover:text-white hover:border-white px-6 py-2 font-bold uppercase text-xs tracking-widest transition-all skew-x-[-10deg]"
                        >
                            <span className="block skew-x-[10deg]">{t('ui.end_conversation')}</span>
                        </button>
                    </div>
                )
            }

            {
                (deathPhase === 'MESSAGE' || deathPhase === 'CONTINUE') && (
                    <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center pointer-events-none">

                        <div className="absolute inset-0 bg-red-950/40 backdrop-blur-md opacity-0 animate-[fadeIn_1.5s_ease-out_0.3s_forwards]"></div>
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(50,0,0,0.9)_100%)] opacity-0 animate-[fadeIn_1.5s_ease-out_0.3s_forwards]"></div>

                        <div className="mb-6 w-auto min-w-[500px] border-y-8 border-red-800 bg-gradient-to-b from-red-950/90 to-black/90 p-12 skew-x-[-5deg] text-center shadow-[0_0_50px_rgba(220,38,38,0.6)] animate-[slam_0.3s_cubic-bezier(0.25,0.46,0.45,0.94)_forwards] relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-full h-full opacity-30 pointer-events-none mix-blend-overlay bg-[url('https://www.transparenttextures.com/patterns/blood-splatter.png')]"></div>

                            <h3 className="text-2xl font-black text-red-500 uppercase tracking-[0.3em] mb-4 drop-shadow-md">
                                {PLAYER_CHARACTER.name} {t('ui.killed_by')}
                            </h3>
                            <p className="text-6xl md:text-8xl font-black text-red-600 uppercase tracking-tighter drop-shadow-[0_5px_5px_rgba(0,0,0,1)] stroke-black leading-none" style={{ WebkitTextStroke: '2px black' }}>
                                {getKillerName()}
                            </p>
                        </div>

                        {deathPhase === 'CONTINUE' && (
                            <div className="absolute bottom-[15%] animate-pulse">
                                <span className="text-xl md:text-2xl font-bold text-gray-300 uppercase tracking-[0.2em] bg-black/80 px-8 py-2 border-y border-red-900/50">
                                    {t('ui.continue')} <span className="animate-bounce inline-block">_</span>
                                </span>
                            </div>
                        )}
                    </div>
                )
            }

            {
                !bossIntroActive && (
                    <GameUI
                        onCloseClue={() => { }} interactionType={interactionType} dialogueOpen={false} dialogueLine={null}
                        foundMemberName={foundMemberName} isLastLine={false} onNextDialogue={() => { }} onPrevDialogue={() => { }} onCloseDialogue={() => { }}
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
        `}</style>
        </div >
    );
});

export default GameCanvas;
