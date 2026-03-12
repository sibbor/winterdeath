import * as THREE from 'three';
import { GameCanvasProps, SectorStats, MapItem, SectorTrigger } from '../../../types';
import { SectorContext } from '../../../types/SectorEnvironment';
import { WinterEngine } from '../../../core/engine/WinterEngine';
import { GameSessionLogic } from '../../../core/GameSessionLogic';
import { SectorGenerator } from '../../../core/world/SectorGenerator';
import { PathGenerator } from '../../../core/world/PathGenerator';
import { ProjectileSystem } from '../../../core/weapons/ProjectileSystem';
import { FXSystem } from '../../../core/systems/FXSystem';
import { EnemyManager } from '../../../core/EnemyManager';
import { AssetPreloader } from '../../../core/systems/AssetPreloader';
import { SECTOR_THEMES, FAMILY_MEMBERS, CAMERA_HEIGHT, LEVEL_CAP, FLASHLIGHT } from '../../../content/constants';
import { GEOMETRY, MATERIALS, ModelFactory, createProceduralTextures } from '../../../utils/assets';
import { soundManager } from '../../../utils/SoundManager';
import { FootprintSystem } from '../../../core/systems/FootprintSystem';
import { PerformanceMonitor } from '../../../core/systems/PerformanceMonitor';

// Systems
import { PlayerMovementSystem } from '../../../core/systems/PlayerMovementSystem';
import { VehicleMovementSystem } from '../../../core/systems/VehicleMovementSystem';
import { PlayerCombatSystem } from '../../../core/systems/PlayerCombatSystem';
import { PlayerStatsSystem } from '@/src/core/systems/PlayerStatsSystem';
import { WorldLootSystem } from '../../../core/systems/WorldLootSystem';
import { PlayerInteractionSystem } from '../../../core/systems/PlayerInteractionSystem';
import { EnemySystem } from '../../../core/systems/EnemySystem';
import { SectorSystem } from '../../../core/systems/SectorSystem';
import { FamilySystem } from '../../../core/systems/FamilySystem';
import { LightingSystem } from '../../../core/systems/LightingSystem';
import { CinematicSystem } from '../../../core/systems/CinematicSystem';
import { DeathSystem } from '../../../core/systems/DeathSystem';
import { RuntimeState } from '../../../core/RuntimeState';

const seededRandom = (seed: number) => {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return () => { return (s = s * 16807 % 2147483647) / 2147483647; };
};

export interface SetupContext {
    engine: WinterEngine;
    session: GameSessionLogic;
    state: RuntimeState;
    props: GameCanvasProps;
    refs: any; // GameSessionState refs
    ui: {
        setIsSectorLoading: (val: boolean) => void;
        setDeathPhase: (val: any) => void;
        setBossIntroActive: (val: boolean) => void;
        setBubbleTailPosition: (val: any) => void;
        setCurrentLine: (val: any) => void;
        setCinematicActive: (val: boolean) => void;
        setInteractionType: (val: any) => void;
        setFoundMemberName?: (val: string) => void;
        setOverlay: (type: string | null) => void;
    },
    callbacks: {
        t: (k: string) => string;
        spawnBubble: (text: string, duration?: number) => void;
        startCinematic: (mesh: any, scriptId?: number, params?: any) => void;
        endCinematic: () => void;
        playCinematicLine: (index: number) => void;
        spawnPart: (x: number, y: number, z: number, type: string, count: number, customMesh?: THREE.Mesh, customVel?: THREE.Vector3, color?: number, scale?: number) => void;
        spawnDecal: (x: number, z: number, scale: number, material?: THREE.Material, type?: string) => void;
        spawnFloatingText: (x: number, y: number, z: number, text: string, color?: string) => void;
        spawnZombie: (forcedType?: string, forcedPos?: THREE.Vector3) => void;
        concludeSector: (isExtraction: boolean) => void;
        handleTriggerAction: (action: any, scene: THREE.Scene) => void;
        onSectorLoaded?: () => void;
        gainXp: (amount: number) => void;
        onCollectibleDiscovered: (collectibleId: string) => void;
        onClueDiscovered: (clue: any) => void;
        onPOIdiscovered: (poi: any) => void;
        onTrigger: (type: string, duration: number) => void;
        onBossKilled: (id: number) => void;
        onAction: (action: any) => void;
        collectedCluesRef: any;
    }
}

export class GameSessionSetup {

    static async runSectorSetup(ctx: SetupContext, currentSetupId: number) {
        const { engine, session, state, props, refs, ui, callbacks } = ctx;
        const scene = engine.scene;
        const camera = engine.camera;
        const textures = createProceduralTextures();

        const isMounted = refs.isMounted;
        const setupIdRef = refs.setupIdRef;

        if (!isMounted.current || setupIdRef.current !== currentSetupId) return;

        ui.setIsSectorLoading(true);
        refs.isBuildingSectorRef.current = true;
        engine.isRenderingPaused = true;
        state.startTime = performance.now();

        try {
            const currentSector = (props as any).currentSectorData || SectorSystem.getSector(props.currentSector || 0); // Passed directly from orchestrator
            const rng = seededRandom(props.currentSector + 4242);
            const env = currentSector.environment;

            const useInstantLoad = AssetPreloader.getLastSectorIndex() === props.currentSector && AssetPreloader.isWarmedUp();
            let lastYieldTime = performance.now();
            const yielder = useInstantLoad ? undefined : async () => {
                const now = performance.now();
                if (now - lastYieldTime > 12) {
                    await new Promise<void>(resolve => { requestAnimationFrame(() => setTimeout(resolve, 0)); });
                    lastYieldTime = performance.now();
                }
            };

            await AssetPreloader.warmupAsync(engine.renderer, props.currentSector, camera, yielder);

            if (!isMounted.current || setupIdRef.current !== currentSetupId) return;

            scene.background = new THREE.Color(env.bgColor);
            scene.fog = new THREE.FogExp2(env.fogColor || env.bgColor, env.fogDensity);

            camera.reset();
            camera.set('fov', env.fov);
            camera.setPosition(currentSector.playerSpawn.x, env.cameraHeight || CAMERA_HEIGHT, currentSector.playerSpawn.z + env.cameraOffsetZ, true);
            camera.lookAt(currentSector.playerSpawn.x, 0, currentSector.playerSpawn.z, true);

            ProjectileSystem.clear(scene, state.projectiles, state.fireZones);
            EnemyManager.init(scene);

            const ambientLight = new THREE.AmbientLight((env as any).ambientColor || 0x404050, env.ambientIntensity);
            ambientLight.name = 'AMBIENT_LIGHT';
            scene.add(ambientLight);

            if (env.skyLight && env.skyLight.visible) {
                const lightPos = env.skyLight.position || { x: 80, y: 50, z: 50 };
                const skyLight = new THREE.DirectionalLight(env.skyLight.color, env.skyLight.intensity);
                skyLight.name = 'SKY_LIGHT';
                skyLight.position.set(lightPos.x, lightPos.y, lightPos.z);
                skyLight.castShadow = true;
                skyLight.shadow.camera.left = -100; skyLight.shadow.camera.right = 100;
                skyLight.shadow.camera.top = 100; skyLight.shadow.camera.bottom = -100;
                skyLight.shadow.camera.far = 300;
                skyLight.shadow.bias = -0.0005;
                const shadowRes = engine.getSettings().shadowResolution;
                skyLight.shadow.mapSize.width = shadowRes * 2;
                skyLight.shadow.mapSize.height = shadowRes * 2;
                scene.add(skyLight);
                refs.skyLightRef.current = skyLight;
            }

            const spawnHorde = (count: number, type?: string, pos?: THREE.Vector3) => {
                const startPos = pos || (refs.playerGroupRef.current ? refs.playerGroupRef.current.position : new THREE.Vector3(0, 0, 0));
                const newEnemies = EnemyManager.spawnHorde(scene, startPos, count, state.bossSpawned, state.enemies.length);
                if (newEnemies) {
                    for (let i = 0; i < newEnemies.length; i++) {
                        state.enemies.push(newEnemies[i]);
                        if (!state.seenEnemies.includes(newEnemies[i].type)) state.seenEnemies.push(newEnemies[i].type);
                    }
                }
            };

            const mapItems: MapItem[] = [];
            const flickeringLights: any[] = [];
            const burningObjects: any[] = [];

            const spawnBoss = (type: string, pos?: THREE.Vector3) => {
                const pSpawn = currentSector.playerSpawn;
                const bossPos = pos || (currentSector.bossSpawn ? new THREE.Vector3(currentSector.bossSpawn.x, 0, currentSector.bossSpawn.z) : new THREE.Vector3(pSpawn.x, 0, pSpawn.z));
                const boss = EnemyManager.spawnBoss(scene, bossPos, type);
                if (boss) {
                    state.enemies.push(boss);
                    state.bossSpawned = true;
                    if (!state.seenBosses.includes(type)) state.seenBosses.push(type);
                }
                return boss;
            };

            const sectorCtx: SectorContext = {
                scene, engine, obstacles: state.obstacles, collisionGrid: state.collisionGrid, chests: state.chests,
                flickeringLights, burningObjects, rng, triggers: state.triggers, mapItems, debugMode: props.debugMode,
                textures: textures, spawnZombie: callbacks.spawnZombie, spawnHorde, spawnBoss,
                cluesFound: props.stats.cluesFound || [], collectiblesDiscovered: props.stats.collectiblesDiscovered || [],
                collectibles: [], dynamicLights: [], interactables: [], sectorId: props.currentSector, smokeEmitters: [],
                sectorState: state.sectorState, state: state, yield: yielder
            };
            refs.sectorContextRef.current = sectorCtx;
            state.sectorState.ctx = sectorCtx;

            // --- CALLBACK INITIALIZATION ---
            state.callbacks = {
                spawnPart: callbacks.spawnPart,
                spawnDecal: callbacks.spawnDecal,
                spawnFloatingText: callbacks.spawnFloatingText,
                spawnBubble: callbacks.spawnBubble,
                onClueDiscovered: callbacks.onClueDiscovered,
                onPOIdiscovered: callbacks.onPOIdiscovered,
                onTrigger: callbacks.onTrigger,
                onAction: (action: any) => {
                    // Logic from GameSession.tsx handleTriggerAction
                    if (action.type === 'HEAL') {
                        state.hp = Math.min(state.maxHp, state.hp + action.amount);
                        soundManager.playUiConfirm();
                    }
                    if (action.type === 'SOUND' && action.id) soundManager.playEffect(action.id);

                    // Route to GameSession handleTriggerAction for visual/UI effects
                    callbacks.handleTriggerAction(action, engine.scene);
                },
                explodeEnemy: (e: any, force: THREE.Vector3) => EnemyManager.explodeEnemy(e, sectorCtx, force),
                gainXp: callbacks.gainXp,
                trackStats: (type: 'damage' | 'hit', amt: number, isBoss?: boolean) => {
                    if (type === 'damage') {
                        state.damageDealt += amt;
                        if (isBoss) state.bossDamageDealt += amt;
                        callbacks.gainXp(Math.ceil(amt));
                    }
                    if (type === 'hit') state.shotsHit += amt;
                },
                addFireZone: (z: any) => state.fireZones.push(z),
                onBossKilled: (id: number) => {
                    if (!state.bossesDefeated.includes(id)) {
                        state.bossesDefeated.push(id);
                    }
                    state.bossDefeatedTime = performance.now();
                    callbacks.onBossKilled(id);
                },
                collectedCluesRef: refs.collectedCluesRef
            };

            PathGenerator.resetPathLayer();
            await SectorGenerator.build(sectorCtx, currentSector);

            // [VINTERDÖD] FIX: Assign generated map items to runtime state for HUD/Map system
            state.mapItems = mapItems;

            // [VINTERDÖD] FIX: Stat Safety. Ensure stats are valid numbers before starting game systems
            state.maxHp = isNaN(state.maxHp) ? 100 : Math.max(100, state.maxHp);
            state.hp = isNaN(state.hp) ? state.maxHp : Math.min(state.maxHp, state.hp);
            state.maxStamina = isNaN(state.maxStamina) ? 100 : Math.max(100, state.maxStamina);
            state.stamina = isNaN(state.stamina) ? state.maxStamina : Math.min(state.maxStamina, state.stamina);


            AssetPreloader.setLastSectorIndex(props.currentSector);


            if (!isMounted.current || setupIdRef.current !== currentSetupId) return;

            const activeEffects: any[] = [];
            scene.traverse((child) => {
                if (child.userData && child.userData.effects) {
                    const effects = child.userData.effects as any[];
                    for (let j = 0; j < effects.length; j++) {
                        const eff = effects[j];
                        if (eff.type === 'light') {
                            const light = new THREE.PointLight(eff.color, eff.intensity, eff.distance);
                            light.userData.baseIntensity = eff.intensity;
                            light.userData.isCulled = false;
                            if (eff.offset) light.position.copy(eff.offset);
                            child.add(light);
                            if (eff.flicker) {
                                flickeringLights.push({ light, baseInt: eff.intensity, flickerRate: 0.1 });
                            }
                            light.castShadow = false;
                            light.shadow.autoUpdate = false;
                            light.shadow.mapSize.set(256, 256);
                            sectorCtx.dynamicLights.push(light);
                        }
                    }
                    activeEffects.push(child);
                }
            });
            state.activeEffects = activeEffects;

            // --- Player Spawning ---
            const playerGroup = ModelFactory.createPlayer();
            refs.playerGroupRef.current = playerGroup;

            const bodyMesh = playerGroup.children.find(c => c.userData.isBody || c.userData.isPlayer) || playerGroup.children[0] as THREE.Mesh;
            refs.playerMeshRef.current = bodyMesh as THREE.Group;

            const playerSpawn = { ...currentSector.playerSpawn };
            playerGroup.position.set(playerSpawn.x, 0, playerSpawn.z);
            if (playerSpawn.y) playerGroup.position.y = playerSpawn.y;
            if (playerSpawn.rot) playerGroup.rotation.y = playerSpawn.rot;

            const flashlight = ModelFactory.createFlashlight();
            playerGroup.add(flashlight);
            playerGroup.add(flashlight.target);
            refs.flashlightRef.current = flashlight;
            state.flashlightOn = true;

            scene.add(playerGroup);

            // --- Camera Setup ---
            const sectorEnv = (refs.propsRef.current as any).currentSectorData?.environment || refs.sectorContextRef.current?.sectorState?.ctx?.environment;
            const envCameraZ = sectorEnv?.cameraOffsetZ !== undefined ? sectorEnv.cameraOffsetZ : 40;
            const envCameraY = sectorEnv?.cameraHeight || CAMERA_HEIGHT;
            const envCameraAngle = sectorEnv?.cameraAngle || 0;

            engine.camera.setCinematic(false);
            engine.camera.setAngle(envCameraAngle, true);
            engine.camera.follow(playerGroup.position, envCameraZ, envCameraY);
            engine.camera.snapToTarget();

            refs.prevPosRef.current.copy(playerGroup.position);
            refs.hasSetPrevPosRef.current = true;
            refs.activeFamilyMembers.current.length = 0;

            // --- Family Member Spawning ---
            const fSpawn = currentSector.familySpawn;
            if (props.rescuedFamilyIndices) {
                for (let i = 0; i < props.rescuedFamilyIndices.length; i++) {
                    const idx = props.rescuedFamilyIndices[i];
                    const theme = SECTOR_THEMES[idx];
                    if (theme && theme.familyMemberId !== undefined) {
                        const fmData = FAMILY_MEMBERS[theme.familyMemberId];
                        if (fmData) {
                            const mesh = ModelFactory.createFamilyMember(fmData);
                            mesh.position.set(playerSpawn.x + (Math.random() - 0.5) * 5, 0, playerSpawn.z + 5 + Math.random() * 5);
                            this.addFamilyMarker(mesh, fmData, flickeringLights, scene);
                            refs.activeFamilyMembers.current.push({ mesh, found: true, following: true, name: fmData.name, id: fmData.id, scale: fmData.scale, seed: Math.random() * 100 });
                        }
                    }
                }
            }

            if (!props.familyAlreadyRescued) {
                const theme = SECTOR_THEMES[props.currentSector];
                const fmId = theme ? theme.familyMemberId : 0;
                if (!props.rescuedFamilyIndices.includes(props.currentSector)) {
                    const fmData = FAMILY_MEMBERS[fmId];
                    if (fmData) {
                        const mesh = ModelFactory.createFamilyMember(fmData);
                        mesh.position.set(fSpawn.x, 0, fSpawn.z); if (fSpawn.y) mesh.position.y = fSpawn.y;
                        this.addFamilyMarker(mesh, fmData, flickeringLights, scene);
                        const currentFM = { mesh, found: false, following: false, name: fmData.name, id: fmData.id, scale: fmData.scale, seed: Math.random() * 100 };
                        refs.activeFamilyMembers.current.push(currentFM);
                        refs.familyMemberRef.current = currentFM;
                    }
                }
            }

            // --- Dynamic Scene Processing ---
            scene.traverse((obj) => {
                if (obj instanceof THREE.Mesh && !obj.userData.isDynamic) {
                    obj.matrixAutoUpdate = false;
                    obj.updateMatrix();
                }
            });

            // --- System Registration ---
            if (engine.water) {
                engine.water.setPlayerRef(playerGroup);
                engine.water.setCallbacks({
                    spawnPart: (x, y, z, type, count) => callbacks.spawnPart(x, y, z, type, count),
                    emitNoise: (pos, rad, type) => session.makeNoise(pos, rad, type as any)
                });
            }

            session.addSystem(new PlayerMovementSystem(playerGroup));
            session.addSystem(new VehicleMovementSystem(playerGroup));

            session.addSystem(new PlayerCombatSystem(playerGroup));
            session.addSystem(new PlayerInteractionSystem(
                playerGroup,
                callbacks.concludeSector,
                sectorCtx.collectibles,
                callbacks.onCollectibleDiscovered
            ));
            const playerStatsSystem = new PlayerStatsSystem(playerGroup, callbacks.t);
            session.addSystem(playerStatsSystem);

            session.addSystem(new EnemySystem(playerGroup, {
                spawnBubble: callbacks.spawnBubble,
                gainXp: callbacks.gainXp,
                t: callbacks.t,
                onBossKilled: (id: number) => {
                    if (!state.bossesDefeated.includes(id)) state.bossesDefeated.push(id);
                    state.bossDefeatedTime = performance.now();
                    soundManager.stopMusic();
                    if (currentSector.environment.ambientLoop) soundManager.playMusic(currentSector.environment.ambientLoop);
                },
                onPlayerHit: (damage, attacker, type) => playerStatsSystem.handlePlayerHit(session, damage, attacker, type)
            }));

            session.addSystem(new SectorSystem(playerGroup, props.currentSector, {
                setNotification: (n: any) => { if (n && n.visible && n.text) callbacks.spawnBubble(`${n.icon ? n.icon + ' ' : ''}${n.text}`, n.duration || 3000); },
                t: (key: string) => callbacks.t(key),
                spawnPart: callbacks.spawnPart, startCinematic: callbacks.startCinematic,
                setInteraction: (interaction: any) => {
                    if (interaction) { ui.setInteractionType('plant_explosive'); state.currentInteraction = interaction; }
                    else { ui.setInteractionType(null); state.currentInteraction = null; }
                },
                playSound: (id: string) => { if (id === 'explosion') soundManager.playExplosion(); else soundManager.playUiConfirm(); },
                playTone: (freq: number, type: OscillatorType, duration: number, vol?: number) => soundManager.playTone(freq, type, duration, vol || 0.1),
                cameraShake: (amount: number) => engine.camera.shake(amount),
                scene: engine.scene,
                setCameraOverride: (params: any) => {
                    refs.cameraOverrideRef.current = params;
                    engine.camera.setCinematic(!!params);
                },
                emitNoise: (pos: THREE.Vector3, radius: number, type: string) => session.makeNoise(pos, radius, type as any),
                spawnZombie: callbacks.spawnZombie,
                spawnHorde: spawnHorde,
                setOverlay: ui.setOverlay
            }));
            session.addSystem(new WorldLootSystem(playerGroup, scene));

            session.addSystem(new FamilySystem(playerGroup, refs.activeFamilyMembers, refs.cinematicRef, {
                setFoundMemberName: (n: string) => ui.setFoundMemberName && ui.setFoundMemberName(n),
                startCinematic: callbacks.startCinematic
            }));

            const lightingSystem = new LightingSystem(flickeringLights, refs.sectorContextRef, refs.playerGroupRef);
            session.addSystem(lightingSystem);

            session.addSystem(new CinematicSystem({
                cinematicRef: refs.cinematicRef, camera: engine.camera as any, playerMeshRef: refs.playerMeshRef as any,
                bubbleRef: refs.bubbleRef, activeFamilyMembers: refs.activeFamilyMembers,
                callbacks: {
                    setCurrentLine: ui.setCurrentLine, setCinematicActive: ui.setCinematicActive,
                    endCinematic: callbacks.endCinematic, playCinematicLine: callbacks.playCinematicLine,
                    setTailPosition: ui.setBubbleTailPosition
                }
            }));

            session.addSystem(new DeathSystem({
                playerGroupRef: refs.playerGroupRef as any, playerMeshRef: refs.playerMeshRef as any,
                fmMeshRef: refs.familyMemberRef, activeFamilyMembers: refs.activeFamilyMembers,
                deathPhaseRef: refs.deathPhaseRef, inputRef: () => engine.input.state,
                cameraRef: () => engine.camera.threeCamera, propsRef: refs.propsRef,
                distanceTraveledRef: refs.distanceTraveledRef, fxCallbacks: callbacks,
                setDeathPhase: ui.setDeathPhase
            }));

            // --- Static Optimization ---
            scene.traverse((obj) => {
                if (obj.userData?.isPlayer || obj.userData?.isEnemy || obj.userData?.isProjectile || obj.userData?.vehicleDef ||
                    obj.userData?.isFamilyMember || obj.userData?.isBody || obj.userData?.isCorpse || obj.userData?.dynamic) {
                    // Skip children of dynamic objects
                    obj.traverse((child) => {
                        child.matrixAutoUpdate = true;
                    });
                    return;
                }
                const mesh = obj as THREE.Mesh;
                if (mesh.isMesh || (obj as THREE.Group).isGroup) {
                    obj.updateMatrix();
                    obj.updateMatrixWorld(true);
                    obj.matrixAutoUpdate = false;
                }
            });

            // --- Final WebGL Preparation ---
            FXSystem.preload(scene);
            const monitor = PerformanceMonitor.getInstance();
            monitor.begin('render_compile');

            // Force castShadow for budget before compile
            lightingSystem.update(session as any, 16, performance.now());
            engine.renderer.compile(scene, camera.threeCamera);
            monitor.end('render_compile');

            // --- Buffer Frames ---
            let framesToWait = 10;
            const checkReady = () => {
                if (framesToWait > 0) {
                    framesToWait--;
                    requestAnimationFrame(checkReady);
                } else {
                    // LÄGG TILL setupIdRef-KOLLEN HÄR:
                    if (isMounted.current && setupIdRef.current === currentSetupId) {
                        ui.setIsSectorLoading(false);
                        if (callbacks.onSectorLoaded) callbacks.onSectorLoaded();
                    }
                }
            };
            requestAnimationFrame(checkReady);
        } catch (e) {
            console.error("[GameSessionSetup] Critical Error:", e);
        } finally {
            refs.isBuildingSectorRef.current = false;
            engine.isRenderingPaused = false;
        }
    }

    private static addFamilyMarker(mesh: THREE.Group, fmData: any, flickeringLights: any[], scene: THREE.Scene) {
        const markerGroup = new THREE.Group();
        markerGroup.position.y = 0.2;
        const darkColor = new THREE.Color(fmData.color).multiplyScalar(0.2);
        const fill = new THREE.Mesh(new THREE.CircleGeometry(5.0, 32), new THREE.MeshBasicMaterial({ color: darkColor, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }));
        fill.rotation.x = -Math.PI / 2; markerGroup.add(fill);
        const border = new THREE.Mesh(new THREE.RingGeometry(4.8, 5.0, 32), new THREE.MeshBasicMaterial({ color: fmData.color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
        border.rotation.x = -Math.PI / 2; markerGroup.add(border);
        mesh.add(markerGroup);
        const fLight = new THREE.PointLight(fmData.color, 2, 8);
        fLight.position.y = 2; fLight.userData.baseIntensity = 2; fLight.userData.isCulled = false; mesh.add(fLight);
        flickeringLights.push({ light: fLight, baseInt: 2, flickerRate: 0.1 });
        scene.add(mesh);
    }

    // THE WEBGL BLACK HOLE FIX
    static disposeSector(engine: WinterEngine, session: GameSessionLogic, state: RuntimeState) {
        const scene = engine.scene;
        EnemyManager.clear();

        // 1. Manually tear down GPU memory to avoid the WebGL Black Hole Context leak
        const sharedGeos = Object.values(GEOMETRY);
        const sharedMats = Object.values(MATERIALS);

        scene.traverse((obj: any) => {
            // DO NOT dispose if tagged as static or shared
            if (obj.userData?.isEngineStatic || obj.userData?.isSharedAsset) return;

            if (obj.isMesh && obj.geometry) {
                // DO NOT dispose shared library geometries
                if (!sharedGeos.includes(obj.geometry)) {
                    obj.geometry.dispose();
                }
            }
            if (obj.isMesh && obj.material) {
                const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                for (let i = 0; i < mats.length; i++) {
                    const m = mats[i];
                    // DO NOT dispose shared library materials
                    if (!sharedMats.includes(m)) {
                        this.disposeMaterial(m);
                    }
                }
            }
        });

        // 2. Clear out scene children manually
        while (scene.children.length > 0) {
            scene.remove(scene.children[0]);
        }

        if (engine.water) {
            engine.water.clear();
        }

        // DO NOT engine.stop() here as it halts the renderer singleton for the next scene (e.g. Camp)
        // engine.stop(); 
        engine.input.disable();

        soundManager.setReverb(0);
        soundManager.stopAll();

        ProjectileSystem.clear(scene, state.projectiles, state.fireZones);
        if (session) session.dispose();
        EnemyManager.clear();
        FXSystem.reset();

        state.sessionCollectiblesDiscovered = [];
        state.bossSpawned = false;
    }

    private static disposeMaterial(m: any) {
        m.dispose();
        if (m.map) m.map.dispose();
        if (m.normalMap) m.normalMap.dispose();
        if (m.roughnessMap) m.roughnessMap.dispose();
        if (m.metalnessMap) m.metalnessMap.dispose();
        if (m.emissiveMap) m.emissiveMap.dispose();
        if (m.envMap) m.envMap.dispose();
    }
}
