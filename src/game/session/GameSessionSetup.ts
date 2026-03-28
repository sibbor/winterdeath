import * as THREE from 'three';
import { GameCanvasProps } from '../../game/session/SessionTypes';
import { MapItem } from '../../components/ui/hud/HudTypes';
import { SectorContext } from '../../game/session/SectorTypes';
import { WinterEngine } from '../../core/engine/WinterEngine';
import { GameSessionLogic } from './GameSessionLogic';
import { NoiseType } from '../../entities/enemies/EnemyTypes';
import { SectorBuilder } from '../../core/world/SectorBuilder';
import { PathGenerator } from '../../core/world/generators/PathGenerator';
import { ProjectileSystem } from '../../systems/ProjectileSystem';
import { FXSystem } from '../../systems/FXSystem';
import { DamageNumberSystem } from '../../systems/DamageNumberSystem';
import { EnemyManager } from '../../entities/enemies/EnemyManager';
import { AssetLoader } from '../../utils/assets/AssetLoader';
import { SECTOR_THEMES, FAMILY_MEMBERS, CAMERA_HEIGHT, LIGHT_SYSTEM } from '../../content/constants';
import { ModelFactory, createProceduralTextures } from '../../utils/assets';
import { soundManager } from '../../utils/audio/SoundManager';
import { PlayerDeathState } from '../../entities/player/CombatTypes';
import { WEAPONS } from '../../content/weapons';
import { PlayerMovementSystem } from '../../systems/PlayerMovementSystem';
import { VehicleMovementSystem } from '../../systems/VehicleMovementSystem';
import { PlayerCombatSystem } from '../../systems/PlayerCombatSystem';
import { PlayerStatsSystem } from '../../systems/PlayerStatsSystem';
import { WorldLootSystem } from '../../systems/WorldLootSystem';
import { PlayerInteractionSystem } from '../../systems/PlayerInteractionSystem';
import { EnemySystem } from '../../entities/enemies/EnemySystem';
import { SectorSystem } from '../../systems/SectorSystem';
import { FamilySystem } from '../../systems/FamilySystem';
import { CinematicSystem } from '../../systems/CinematicSystem';
import { DeathSystem } from '../../systems/DeathSystem';
import { HudStore } from '../../store/HudStore';
import { DamageTrackerSystem } from '../../systems/DamageTrackerSystem';
import { EnemyDetectionSystem } from '../../systems/EnemyDetectionSystem';
import { RuntimeState } from '../../core/RuntimeState';

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
    refs: any;
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
    };
    callbacks: {
        t: (k: string) => string;
        spawnBubble: (text: string, duration?: number) => void;
        startCinematic: (mesh: any, scriptId?: number, params?: any) => void;
        endCinematic: () => void;
        playCinematicLine: (index: number) => void;
        spawnPart: (x: number, y: number, z: number, type: string, count: number, customMesh?: THREE.Mesh, customVel?: THREE.Vector3, color?: number, scale?: number) => void;
        spawnDecal: (x: number, z: number, scale: number, material?: THREE.Material, type?: string) => void;
        showDamageText: (x: number, y: number, z: number, text: string, color?: string) => void;
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

        if (!isMounted.current || setupIdRef.current !== currentSetupId) {
            console.warn('[GameSessionSetup] Early return: isMounted=' + isMounted.current + ' setupId=' + setupIdRef.current + ' expected=' + currentSetupId);
            return;
        }

        refs.isBuildingSectorRef.current = true;
        state.startTime = performance.now();
        let sectorLoaded = false;

        try {
            const currentSector = (props as any).currentSectorData || SectorSystem.getSector(props.currentSector || 0);
            state.sectorName = currentSector.name;
            state.initialAim = currentSector.initialAim || null;
            const rng = seededRandom(props.currentSector + 4242);
            const env = currentSector.environment;

            // 0. VINTERDÖD FIX: Aggressively clear the scene from previous session objects.
            // true = KEEP persistent systems (Fog, Water, Light Pool) alive for performance.
            engine.clearActiveScene(true);

            // Unregister any non-persistent systems that might have been added by Camp or previous sector ghosts
            const engineSystems = engine.getSystems();
            for (let i = engineSystems.length - 1; i >= 0; i--) {
                const sys = engineSystems[i];
                if (!sys.persistent &&
                    sys.id !== 'light_system' && sys.id !== 'wind_system' &&
                    sys.id !== 'weather_system' && sys.id !== 'fog_system' &&
                    sys.id !== 'water_system') {
                    engine.unregisterSystem(sys.id);
                }
            }

            // The Poisoned Yielder
            const yielder = async () => {
                if (!isMounted.current || setupIdRef.current !== currentSetupId) {
                    throw new Error("ABORT_SETUP");
                }
                await new Promise<void>(resolve => setTimeout(resolve, 0));
            };

            camera.reset();
            camera.set('fov', env.fov);
            camera.setPosition(currentSector.playerSpawn.x, env.cameraHeight || CAMERA_HEIGHT, currentSector.playerSpawn.z + env.cameraOffsetZ, true);

            if (!props.isWarmup) {
                engine.syncEnvironment(env);
                const skyLight = scene.getObjectByName(LIGHT_SYSTEM.SKY_LIGHT) as THREE.DirectionalLight;
                if (skyLight) {
                    refs.skyLightRef.current = skyLight;
                    if (!refs.skyLightOffsetRef.current) refs.skyLightOffsetRef.current = new THREE.Vector3();
                    refs.skyLightOffsetRef.current.copy(skyLight.position);
                }
            }

            const spawnHorde = (count: number, type?: string, pos?: THREE.Vector3) => {
                const startPos = pos || (refs.playerGroupRef.current ? refs.playerGroupRef.current.position : new THREE.Vector3(0, 0, 0));
                const newEnemies = EnemyManager.spawnHorde(scene, startPos, count, state.bossSpawned, state.enemies.length);
                if (newEnemies) {
                    for (let i = 0; i < newEnemies.length; i++) {
                        state.enemies.push(newEnemies[i]);
                    }
                }
            };

            const mapItems: MapItem[] = [];
            const burningObjects: any[] = [];
            const flickeringLights: any[] = [];

            const realSpawnZombie = (forcedType?: string, forcedPos?: THREE.Vector3) => {
                const playerPos = refs.playerGroupRef.current ? refs.playerGroupRef.current.position : new THREE.Vector3(currentSector.playerSpawn.x, 0, currentSector.playerSpawn.z);
                const enemy = EnemyManager.spawn(scene, playerPos, forcedType, forcedPos, state.bossSpawned, state.enemies.length);
                if (enemy) {
                    state.enemies.push(enemy);
                }
                return enemy;
            };

            const spawnBoss = (type: string, pos?: THREE.Vector3) => {
                const pSpawn = currentSector.playerSpawn;
                const bossPos = pos || (currentSector.bossSpawn ? new THREE.Vector3(currentSector.bossSpawn.x, 0, currentSector.bossSpawn.z) : new THREE.Vector3(pSpawn.x, 0, pSpawn.z));
                const boss = EnemyManager.spawnBoss(scene, bossPos, type);
                if (boss) {
                    state.enemies.push(boss);
                    state.bossSpawned = true;
                }
                return boss;
            };

            const sectorCtx: SectorContext = {
                scene, engine, obstacles: state.obstacles, collisionGrid: state.collisionGrid, chests: state.chests,
                flickeringLights, burningObjects, rng, triggers: state.triggers, mapItems, debugMode: props.debugMode,
                textures: textures, spawnZombie: realSpawnZombie, spawnHorde, spawnBoss,
                cluesFound: props.stats.cluesFound || [], collectiblesDiscovered: props.stats.collectiblesDiscovered || [],
                collectibles: [], dynamicLights: [], interactables: [], sectorId: props.currentSector, smokeEmitters: [],
                sectorState: state.sectorState, state: state, yield: yielder,
                makeNoise: (pos: THREE.Vector3, type: NoiseType, radius: number) => session.makeNoise(pos, type, radius),
            };
            refs.sectorContextRef.current = sectorCtx;
            state.sectorState.ctx = sectorCtx;

            state.callbacks = {
                spawnPart: callbacks.spawnPart, spawnDecal: callbacks.spawnDecal, showDamageText: callbacks.showDamageText,
                spawnBubble: callbacks.spawnBubble, onClueDiscovered: callbacks.onClueDiscovered, onPOIdiscovered: callbacks.onPOIdiscovered,
                onTrigger: callbacks.onTrigger,
                onAction: (action: any) => {
                    if (action.type === 'HEAL') {
                        state.hp = Math.min(state.maxHp, state.hp + action.amount);
                        soundManager.playUiConfirm();
                    }
                    if (action.type === 'SOUND' && action.id) soundManager.playEffect(action.id);
                    callbacks.handleTriggerAction(action, engine.scene);
                },
                explodeEnemy: (e: any, force: THREE.Vector3) => EnemyManager.explodeEnemy(e, sectorCtx, force),
                gainXp: callbacks.gainXp,
                trackStats: (type: 'damage' | 'hit', amt: number, isBoss?: boolean) => {
                    if (type === 'damage') {
                        const tracker = session.getSystem('damage_tracker_system') as any;
                        if (tracker) tracker.recordOutgoingDamage(session, amt, 'Generic', isBoss);
                    }
                    if (type === 'hit') state.shotsHit += amt;
                },
                addFireZone: (z: any) => state.fireZones.push(z),
                onBossKilled: (id: number) => {
                    let seen = false;
                    for (let j = 0; j < state.bossesDefeated.length; j++) {
                        if (state.bossesDefeated[j] === id) { seen = true; break; }
                    }
                    if (!seen) state.bossesDefeated.push(id);
                    state.bossDefeatedTime = performance.now();
                    callbacks.onBossKilled(id);
                },
                makeNoise: (pos: THREE.Vector3, type: NoiseType, radius: number) => session.makeNoise(pos, type, radius),
                collectedCluesRef: refs.collectedCluesRef
            };

            PathGenerator.resetPathLayer();

            await SectorBuilder.build(sectorCtx, currentSector);

            if (!isMounted.current || setupIdRef.current !== currentSetupId) return;

            state.mapItems = mapItems;
            state.maxHp = isNaN(state.maxHp) ? 100 : Math.max(100, state.maxHp);
            state.hp = isNaN(state.hp) ? state.maxHp : Math.min(state.maxHp, state.hp);
            state.maxStamina = isNaN(state.maxStamina) ? 100 : Math.max(100, state.maxStamina);
            state.stamina = isNaN(state.stamina) ? state.maxStamina : Math.min(state.maxStamina, state.stamina);

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
                            if (eff.flicker) flickeringLights.push({ light, baseInt: eff.intensity, flickerRate: 0.1 });
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

            const playerGroup = ModelFactory.createPlayer();
            refs.playerGroupRef.current = playerGroup;

            let bodyMesh = playerGroup.children[0];
            for (let i = 0; i < playerGroup.children.length; i++) {
                if (playerGroup.children[i].userData.isBody || playerGroup.children[i].userData.isPlayer) {
                    bodyMesh = playerGroup.children[i];
                    break;
                }
            }
            refs.playerMeshRef.current = bodyMesh as THREE.Group;

            if (state.initialAim && engine.input?.state) {
                engine.input.state.aimVector.x = state.initialAim.x;
                engine.input.state.aimVector.y = state.initialAim.y;
            }

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

            const sectorEnv = (refs.propsRef.current as any).currentSectorData?.environment || refs.sectorContextRef.current?.sectorState?.ctx?.environment;
            const envCameraZ = sectorEnv?.cameraOffsetZ !== undefined ? sectorEnv.cameraOffsetZ : 40;
            const envCameraY = sectorEnv?.cameraHeight || CAMERA_HEIGHT;
            const envCameraAngle = sectorEnv?.cameraAngle || 0;

            if (currentSector.cinematic) {
                const c = currentSector.cinematic;
                engine.camera.setCinematic(true);
                engine.camera.setPosition(
                    playerGroup.position.x + c.offset.x,
                    (c.offset.y !== undefined ? c.offset.y : envCameraY),
                    playerGroup.position.z + c.offset.z,
                    true
                );
                engine.camera.lookAt(
                    playerGroup.position.x + c.lookAtOffset.x,
                    playerGroup.position.y + c.lookAtOffset.y,
                    playerGroup.position.z + c.lookAtOffset.z,
                    true
                );
            } else {
                engine.camera.setCinematic(false);
                engine.camera.setAngle(envCameraAngle, true);
                engine.camera.follow(playerGroup.position, envCameraZ, envCameraY);
                engine.camera.snapToTarget();
            }

            refs.prevPosRef.current.copy(playerGroup.position);
            refs.hasSetPrevPosRef.current = true;
            refs.activeFamilyMembers.current.length = 0;

            const fSpawn = currentSector.familySpawn;
            const rescuedIndices = [...(props.rescuedFamilyIndices || [])];

            if (props.debugMode && props.currentSector >= 1 && rescuedIndices.length === 0) {
                for (let i = 0; i < props.currentSector; i++) {
                    let hasI = false;
                    for (let r = 0; r < rescuedIndices.length; r++) { if (rescuedIndices[r] === i) { hasI = true; break; } }
                    if (!hasI) rescuedIndices.push(i);
                }
            }

            if (rescuedIndices.length > 0) {
                for (let i = 0; i < rescuedIndices.length; i++) {
                    const idx = rescuedIndices[i];
                    const theme = SECTOR_THEMES[idx];
                    if (theme && theme.familyMemberId !== undefined) {
                        const fmData = FAMILY_MEMBERS[theme.familyMemberId];
                        if (fmData) {
                            const mesh = ModelFactory.createFamilyMember(fmData);
                            mesh.position.set(playerSpawn.x + (Math.random() - 0.5) * 5, 0, playerSpawn.z + 5 + Math.random() * 5);
                            this.addFamilyMarker(mesh, fmData, scene);

                            let ring = null;
                            for (let c = 0; c < mesh.children.length; c++) {
                                if (mesh.children[c].userData.isRing) { ring = mesh.children[c]; break; }
                            }
                            refs.activeFamilyMembers.current.push({ mesh, found: true, following: true, name: fmData.name, id: fmData.id, scale: fmData.scale, seed: Math.random() * 100, ring });
                        }
                    }
                }
            }

            let hasRescuedCurrent = false;
            for (let r = 0; r < rescuedIndices.length; r++) { if (rescuedIndices[r] === props.currentSector) { hasRescuedCurrent = true; break; } }

            if (!props.familyAlreadyRescued) {
                const theme = SECTOR_THEMES[props.currentSector];
                const fmId = theme ? theme.familyMemberId : 0;
                if (!hasRescuedCurrent) {
                    const fmData = FAMILY_MEMBERS[fmId];
                    if (fmData) {
                        const mesh = ModelFactory.createFamilyMember(fmData);
                        mesh.position.set(fSpawn.x, 0, fSpawn.z); if (fSpawn.y) mesh.position.y = fSpawn.y;
                        this.addFamilyMarker(mesh, fmData, scene);

                        let ring = null;
                        for (let c = 0; c < mesh.children.length; c++) {
                            if (mesh.children[c].userData.isRing) { ring = mesh.children[c]; break; }
                        }
                        const currentFM = { mesh, found: false, following: false, name: fmData.name, id: fmData.id, scale: fmData.scale, seed: Math.random() * 100, ring };
                        refs.activeFamilyMembers.current.push(currentFM);
                        refs.familyMemberRef.current = currentFM;
                    }
                }
            }

            scene.traverse((obj) => {
                if (obj instanceof THREE.Mesh && !obj.userData.isDynamic) {
                    obj.matrixAutoUpdate = false;
                    obj.updateMatrix();
                }
            });

            if (engine.water) {
                engine.water.setPlayerRef(playerGroup);
                engine.water.setCallbacks({
                    spawnPart: (x, y, z, type, count) => callbacks.spawnPart(x, y, z, type, count),
                    makeNoise: (pos, type, rad) => session.makeNoise(pos, type as NoiseType, rad)
                });
            }

            session.addSystem(new DamageNumberSystem(scene));
            session.addSystem(new DamageTrackerSystem());

            const detectionSys = new EnemyDetectionSystem();
            session.addSystem(detectionSys);
            session.detectionSystem = detectionSys;

            session.addSystem(new PlayerMovementSystem(playerGroup));
            session.addSystem(new VehicleMovementSystem(playerGroup));
            session.addSystem(new PlayerCombatSystem(playerGroup));
            session.addSystem(new PlayerInteractionSystem(
                playerGroup, callbacks.concludeSector, sectorCtx.collectibles, refs.activeFamilyMembers, scene, callbacks.onCollectibleDiscovered
            ));

            const playerStatsSystem = new PlayerStatsSystem(playerGroup, callbacks.t, refs.activeFamilyMembers);
            session.addSystem(playerStatsSystem);

            session.addSystem(new EnemySystem(playerGroup, {
                spawnBubble: callbacks.spawnBubble, gainXp: callbacks.gainXp, t: callbacks.t,
                onBossKilled: (id: number) => {
                    let seen = false;
                    for (let j = 0; j < state.bossesDefeated.length; j++) {
                        if (state.bossesDefeated[j] === id) { seen = true; break; }
                    }
                    if (!seen) state.bossesDefeated.push(id);
                    state.bossDefeatedTime = performance.now();
                    soundManager.stopMusic();
                    if (currentSector.ambientLoop) soundManager.playMusic(currentSector.ambientLoop);
                },
                onPlayerHit: (damage, attacker, type, isDoT, effect, dur, intense, attackName) => playerStatsSystem.handlePlayerHit(session, damage, attacker, type, isDoT, effect, dur, intense, attackName),
                triggerDiscovery: (event: any) => {
                    if (state.discovery && state.discovery.timestamp > Date.now() - 500) return; // Throttling
                    state.discovery = {
                        ...event,
                        timestamp: Date.now()
                    };
                }
            }));

            session.addSystem(new SectorSystem(playerGroup, props.currentSector, {
                setNotification: (n: any) => { if (n && n.visible && n.text) callbacks.spawnBubble(`${n.icon ? n.icon + ' ' : ''}${n.text}`, n.duration || 3000); },
                t: (key: string) => callbacks.t(key), spawnPart: callbacks.spawnPart, startCinematic: callbacks.startCinematic,
                setInteraction: (interaction: any) => {
                    if (interaction) { ui.setInteractionType('plant_explosive'); state.currentInteraction = interaction; }
                    else { ui.setInteractionType(null); state.currentInteraction = null; }
                },
                playSound: (id: string) => { if (id === 'explosion') soundManager.playExplosion(); else soundManager.playUiConfirm(); },
                playTone: (freq: number, type: OscillatorType, duration: number, vol?: number) => soundManager.playTone(freq, type, duration, vol || 0.1),
                cameraShake: (amount: number) => engine.camera.shake(amount), scene: engine.scene,
                setCameraOverride: (params: any) => { refs.cameraOverrideRef.current = params; engine.camera.setCinematic(!!params); },
                makeNoise: (pos: THREE.Vector3, type: NoiseType, radius: number) => session.makeNoise(pos, type, radius),
                spawnZombie: callbacks.spawnZombie, spawnHorde: spawnHorde, setOverlay: ui.setOverlay
            }));
            session.addSystem(new WorldLootSystem(playerGroup, scene));

            session.addSystem(new FamilySystem(playerGroup, refs.activeFamilyMembers, refs.cinematicRef, {
                setFoundMemberName: (n: string) => ui.setFoundMemberName && ui.setFoundMemberName(n),
                startCinematic: callbacks.startCinematic
            }));

            session.addSystem(new CinematicSystem({
                cinematicRef: refs.cinematicRef, camera: engine.camera as any, playerMeshRef: refs.playerMeshRef as any,
                bubbleRef: refs.bubbleRef, activeFamilyMembers: refs.activeFamilyMembers,
                callbacks: {
                    setCurrentLine: ui.setCurrentLine, setCinematicActive: ui.setCinematicActive, endCinematic: callbacks.endCinematic,
                    playCinematicLine: callbacks.playCinematicLine, setTailPosition: ui.setBubbleTailPosition
                }
            }));

            session.addSystem(new DeathSystem({
                playerGroupRef: refs.playerGroupRef as any, playerMeshRef: refs.playerMeshRef as any, fmMeshRef: refs.familyMemberRef, activeFamilyMembers: refs.activeFamilyMembers,
                deathPhaseRef: refs.deathPhaseRef, inputRef: () => engine.input.state, cameraRef: () => engine.camera.threeCamera, propsRef: refs.propsRef,
                distanceTraveledRef: refs.distanceTraveledRef, fxCallbacks: callbacks, setDeathPhase: ui.setDeathPhase
            }));

            scene.traverse((obj) => {
                if (obj.userData?.isPlayer || obj.userData?.isEnemy || obj.userData?.isProjectile || obj.userData?.vehicleDef ||
                    obj.userData?.isFamilyMember || obj.userData?.isBody || obj.userData?.isCorpse || obj.userData?.dynamic) {
                    obj.traverse((child) => child.matrixAutoUpdate = true);
                    return;
                }
                const mesh = obj as THREE.Mesh;
                if (mesh.isMesh || (obj as THREE.Group).isGroup) {
                    obj.updateMatrix();
                    obj.updateMatrixWorld(true);
                    obj.matrixAutoUpdate = false;
                }
            });

            FXSystem.preload(scene);

            // Handshake: Tell App.tsx to release the loading screen
            if (isMounted.current && setupIdRef.current === currentSetupId) {
                sectorLoaded = true;
                if (callbacks.onSectorLoaded) callbacks.onSectorLoaded();
            }

        } catch (e: any) {
            // VINTERDÖD FIX: Om det var vi som dödade spöket, ignorera felet.
            if (e.message === "ABORT_SETUP") {
                console.log("[GameSessionSetup] Ghost setup safely killed mid-generation.");
                return;
            } else {
                console.error("[GameSessionSetup] Critical Error:", e);
            }
            return;
        } finally {
            refs.isBuildingSectorRef.current = false;
            // FALLBACK: If setup crashed before firing onSectorLoaded, do it now.
            // This ensures the loading screen always dismisses even on iOS errors.
            if (!sectorLoaded && isMounted.current && setupIdRef.current === currentSetupId) {
                if (callbacks.onSectorLoaded) callbacks.onSectorLoaded();
            }
        }
    }

    private static addFamilyMarker(mesh: THREE.Group, fmData: any, scene: THREE.Scene) {
        const markerGroup = new THREE.Group();
        markerGroup.userData.isRing = true;
        markerGroup.position.y = 0.2;

        const darkColor = new THREE.Color(fmData.color).multiplyScalar(0.2);
        const fill = new THREE.Mesh(new THREE.CircleGeometry(5.0, 32), new THREE.MeshBasicMaterial({ color: darkColor, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }));

        fill.rotation.x = -Math.PI / 2; markerGroup.add(fill);
        const border = new THREE.Mesh(new THREE.RingGeometry(4.8, 5.0, 32), new THREE.MeshBasicMaterial({ color: fmData.color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
        border.rotation.x = -Math.PI / 2; markerGroup.add(border);
        mesh.add(markerGroup);

        scene.add(mesh);
    }

    /** * Resurrects player with full HP, stamina, ammo etc.
     * Enemies are respawned. Chests already opened remain open.
     */
    static respawnPlayer(engine: WinterEngine, state: RuntimeState, refs: any, props: any, setDeathPhase: (phase: string) => void) {
        console.log('[GameSessionSetup] Instant Resurrection Triggered.');
        const scene = engine.scene;

        // 1. Reset player state
        console.log(`[GameSessionSetup] Respawning player`);
        state.isDead = false;
        state.playerDeathState = PlayerDeathState.ALIVE;
        state.hp = state.maxHp;
        state.stamina = state.maxStamina;
        state.isReloading = false;
        state.isInteractionOpen = false;
        state.activeVehicle = null;
        state.activeVehicleType = null;
        state.vehicleSpeed = 0;
        state.vehicleEngineState = 'OFF';

        // Reset buffs/debuffs
        state.activeBuffs.length = 0;
        state.activeDebuffs.length = 0;
        state.statusEffects = {};

        // Recalculate passives (keeps family modifiers if they are following)
        const statsSystem = engine.getSystem('player_stats_system') as any; // Cast to avoid circular import loops if it's strict
        if (statsSystem && statsSystem.updatePassives) {
            statsSystem.updatePassives();
        }

        HudStore.update({ ...HudStore.getState(), isDead: false, hp: state.maxHp });

        // Reset ammo
        for (const key in state.weaponAmmo) {
            const wepType = key as any;
            if (state.weaponAmmo[wepType] !== undefined) {
                state.weaponAmmo[wepType] = WEAPONS[wepType]?.magSize || 0;
            }
        }

        // 2. Move player to spawn point
        const currentSectorData = (props as any).currentSectorData || SectorSystem.getSector(props.currentSector || 0);
        if (refs.playerGroupRef.current) {
            const spawn = currentSectorData.playerSpawn;
            refs.playerGroupRef.current.position.set(spawn.x, spawn.y || 0, spawn.z);

            // Fetch camera directly and snap to player
            engine.camera.snapToTarget();

            // Move family members: Keep saved/tracking members close to the player, 
            // Return undiscovered members to their original sector location.
            const members = refs.activeFamilyMembers.current || [];
            const fSpawn = currentSectorData.familySpawn;
            
            for (let i = 0; i < members.length; i++) {
                const fm = members[i];
                if (fm.mesh) {
                    if (fm.found || fm.following) {
                        fm.mesh.position.set(
                            spawn.x + (Math.random() - 0.5) * 5, 
                            spawn.y || 0, 
                            spawn.z + 5 + Math.random() * 5
                        );
                    } else if (fSpawn) {
                        fm.mesh.position.set(fSpawn.x, fSpawn.y || 0, fSpawn.z);
                    }
                }
            }
        }

        // 3. Clear projectiles and fire
        ProjectileSystem.clear(scene, state.projectiles, state.fireZones);
        FXSystem.reset();

        // 4. Clear dynamic objects and enemies from the scene
        const toRemove: THREE.Object3D[] = [];
        scene.traverse(obj => {
            if (obj.userData?.isDynamic || obj.userData?.isEnemy || obj.userData?.isCorpse) {
                toRemove.push(obj);
            }
        });
        for (let i = 0; i < toRemove.length; i++) {
            if (toRemove[i].parent) toRemove[i].parent.remove(toRemove[i]);
        }

        EnemyManager.clear();
        state.enemies.length = 0;
        state.bloodDecals.length = 0;

        // 5. Respawn zombies
        const sCtx = refs.sectorContextRef.current;
        if (sCtx && currentSectorData.setupZombies) {
            currentSectorData.setupZombies(sCtx);
        }

        // 6. Fix UI via callback
        setDeathPhase('NONE');
    }

    /** * Restarts the sector completely.
     * Everything is reset (including chests, world loot and layout).
     */
    static async restartSector(ctx: SetupContext, currentSetupId: number) {
        const { engine, state, ui } = ctx;

        console.log('[GameSessionSetup] Restarting Sector (Full Build)...');

        // Ensure UI knows we are loading if it takes a moment
        ui.setIsSectorLoading(true);

        // 1. Clean up ALL dynamic entities (including chests and obstacles)
        EnemyManager.clear();
        ProjectileSystem.clear(engine.scene, state.projectiles, state.fireZones);
        FXSystem.reset();

        // Remove everything generated
        const toRemove: THREE.Object3D[] = [];
        engine.scene.traverse(obj => {
            if (obj.userData?.generated || obj.userData?.isEnemy || obj.userData?.isPlayer) {
                toRemove.push(obj);
            }
        });
        toRemove.forEach(obj => { if (obj.parent) obj.parent.remove(obj); });

        // 2. Reset state arrays
        state.enemies.length = 0;
        state.obstacles.length = 0;
        state.chests.length = 0;
        state.triggers.length = 0;
        state.bloodDecals.length = 0;
        state.isDead = false;
        state.hp = state.maxHp; // VINTERDÖD FIX: Force health to 100% on restart
        state.stamina = state.maxStamina;

        // 3. RUN SETUP AGAIN! (In the same React mount)
        await this.runSectorSetup(ctx, currentSetupId);

        ui.setDeathPhase('NONE');
    }

    static disposeSector(session: GameSessionLogic, state: RuntimeState) {
        EnemyManager.clear();
        AssetLoader.getInstance().clearCache();

        // 1. Turn off hardware/engine connections
        const engine = WinterEngine.getInstance();
        engine.input.disable();
        soundManager.setReverb(0);
        soundManager.stopAll();

        // 2. Clear specific rendering systems
        ProjectileSystem.clear(engine.scene, state.projectiles, state.fireZones);
        FXSystem.reset();

        // 3. Delegate all graphics and logic cleanup to the session!
        if (session) {
            session.dispose();
        }

        // Reset last flags for this setup step
        state.sessionCollectiblesDiscovered = [];
        state.bossSpawned = false;
    }

}