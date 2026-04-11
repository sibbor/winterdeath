import React, { useEffect, useImperativeHandle, useCallback, useRef } from 'react';
import * as THREE from 'three';
import { GameCanvasProps } from '../../game/session/SessionTypes';
import { MapItem, DiscoveryType } from '../../components/ui/hud/HudTypes';
import { SectorContext } from '../../game/session/SectorTypes';
import { WinterEngine } from '../../core/engine/WinterEngine';
import { GameSessionLogic } from './GameSessionLogic';
import { NoiseType, EnemyType } from '../../entities/enemies/EnemyTypes';
import { SectorBuilder } from '../../core/world/SectorBuilder';
import { PathGenerator } from '../../core/world/generators/PathGenerator';
import { ProjectileSystem } from '../../systems/ProjectileSystem';
import { FXSystem } from '../../systems/FXSystem';
import { DamageNumberSystem } from '../../systems/DamageNumberSystem';
import { EnemyManager } from '../../entities/enemies/EnemyManager';
import { AssetLoader } from '../../utils/assets/AssetLoader';
import { FAMILY_MEMBERS, CAMERA_HEIGHT, LIGHT_SYSTEM, BOSSES, PLAYER_BASE_SPEED } from '../../content/constants';
import { SECTOR_THEMES } from '../../content/sectors/sector_themes';
import { ModelFactory, createProceduralTextures } from '../../utils/assets';
import { PlayerStatID, PlayerStatusFlags } from '../../entities/player/PlayerTypes';
import { PlayerDeathState, DamageID } from '../../entities/player/CombatTypes';
import { SoundID } from '../../utils/audio/AudioTypes';
import { TriggerType, TriggerActionType, TriggerStatus } from '../../systems/TriggerTypes';
import { audioEngine } from '../../utils/audio/AudioEngine';
import { UiSounds } from '../../utils/audio/AudioLib';
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
import { GEOMETRY, MATERIALS } from '../../utils/assets';
import { DataResolver } from '../../utils/ui/DataResolver';

import { InteractionType } from '../../systems/InteractionTypes';


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
        spawnPart: (x: number, y: number, z: number, type: string, count: number, customMesh?: THREE.Mesh, customVel?: THREE.Vector3, color?: number, scale?: number, life?: number) => void;
        spawnDecal: (x: number, z: number, scale: number, material?: THREE.Material, type?: string) => void;
        showDamageText: (x: number, y: number, z: number, text: string, color?: string) => void;
        spawnZombie: (forcedType?: EnemyType, forcedPos?: THREE.Vector3) => void;
        concludeSector: (isExtraction: boolean) => void;
        handleTriggerAction: (action: any, scene: THREE.Scene) => void;
        onSectorLoaded?: () => void;
        gainXp: (amount: number) => void;
        onTrigger: (type: string, duration: number) => void;
        onBossKilled: (id: number) => void;
        onAction: (action: any) => void;
        collectedCluesRef: any;

        onDiscovery?: (type: DiscoveryType, id: string, titleKey: string, detailsKey: string, payload?: any) => void;
        gainSp: (amount: number) => void;
        gainScrap: (amount: number) => void;
    }
}

export class GameSessionSetup {

    static async runSectorSetup(ctx: SetupContext, currentSetupId: number) {
        const { engine, state, props, refs, callbacks } = ctx;
        const scene = engine.scene;
        const isMounted = refs.isMounted;
        const setupIdRef = refs.setupIdRef;

        if (!isMounted.current || setupIdRef.current !== currentSetupId) {
            console.warn('[GameSessionSetup] Early return: Setup aborted.');
            return;
        }

        refs.isBuildingSectorRef.current = true;
        refs.deathPhaseRef.current = 'NONE';

        // VINTERDÖD FIX: Robust telemetry recovery
        if (!state.sessionStats) {
            console.warn('[GameSessionSetup] state.sessionStats was null. Re-initializing.');
            state.sessionStats = GameSessionLogic.createDefaultSessionStats(props);
        }

        state.sessionStats.timePlayed = 0; // Reset session timer
        let sectorLoaded = false;

        try {
            const currentSector = (props as any).currentSectorData || SectorSystem.getSector(props.currentSector || 0);
            state.sectorName = currentSector.name || '';

            if (currentSector.initialAim) {
                state.initialAim.active = true;
                state.initialAim.x = currentSector.initialAim.x;
                state.initialAim.y = currentSector.initialAim.y;
            } else {
                state.initialAim.active = false;
            }

            const rng = seededRandom(props.currentSector + 4242);


            // 1. Prepare Scene
            this.prepareScene(engine, props.isWarmup, refs, currentSector.environment);

            const yielder = async () => {
                if (!isMounted.current || setupIdRef.current !== currentSetupId) throw new Error("ABORT_SETUP");
                await new Promise<void>(resolve => setTimeout(resolve, 0));
            };

            const mapItems: MapItem[] = [];
            const burningObjects: any[] = [];
            const flickeringLights: any[] = [];
            const textures = createProceduralTextures();

            // 2. Setup Player & Camera
            const playerGroup = this.setupPlayerAndCamera(engine, currentSector, refs, state);

            // 3. Create Sector Context
            const sectorCtx = this.createSectorContext(ctx, currentSector, textures, flickeringLights, burningObjects, mapItems, rng, playerGroup, yielder);
            refs.sectorContextRef.current = sectorCtx;
            state.sectorState.ctx = sectorCtx;

            // 4. Bind State Callbacks
            this.bindStateCallbacks(ctx, sectorCtx);

            PathGenerator.resetPathLayer();
            await SectorBuilder.build(sectorCtx, currentSector);

            if (!isMounted.current || setupIdRef.current !== currentSetupId) return;

            // 5. Finalize limits and parse effects
            this.finalizeStateLimits(state, mapItems, flickeringLights, scene, sectorCtx);

            // 6. Setup Family Members
            this.setupFamily(currentSector, props, refs, scene);

            // 7. Initialize Systems
            this.setupSystems(ctx, playerGroup, sectorCtx);

            // --- VINTERDÖD FIX: BYPASS INTRO TRIGGERS ---
            // If the sector is already cleared, mark the intro triggers as completed
            if (state.familyAlreadyRescued || state.bossPermanentlyDefeated) {
                const triggers = state.triggers;
                for (let i = 0; i < triggers.length; i++) {
                    const trig = triggers[i];
                    // Intro triggers usually carry a scriptId or are of type SPEAK/INTERACTION at the family spawn
                    if (trig.type === TriggerType.SPEAK || (trig.actions && trig.actions.some((a: any) => a.type === TriggerActionType.START_CINEMATIC))) {
                        trig.statusFlags |= TriggerStatus.TRIGGERED;
                    }

                }
            }

            FXSystem.preload(scene);

            // Handshake: Tell App.tsx to release the loading screen
            if (isMounted.current && setupIdRef.current === currentSetupId) {
                sectorLoaded = true;
                if (callbacks.onSectorLoaded) callbacks.onSectorLoaded();
            }

        } catch (e: any) {
            if (e.message === "ABORT_SETUP") {
                console.log("[GameSessionSetup] Ghost setup safely killed mid-generation.");
            } else {
                console.error("[GameSessionSetup] Critical Error:", e);
            }
            return;
        } finally {
            refs.isBuildingSectorRef.current = false;
            // Fallback to ensure loading screen drops
            if (!sectorLoaded && isMounted.current && setupIdRef.current === currentSetupId) {
                if (callbacks.onSectorLoaded) callbacks.onSectorLoaded();
            }
        }
    }

    // --- HELPER METHODS FOR CLEANER SETUP ---

    private static prepareScene(engine: WinterEngine, isWarmup: boolean | undefined, refs: any, env: any) {
        // Aggressively clear the scene. KEEP persistent systems alive (false).
        engine.clearActiveScene(false);

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

        engine.camera.reset();
        engine.camera.set('fov', env.fov);

        if (!isWarmup) {
            engine.syncEnvironment(env);
            const skyLight = engine.scene.getObjectByName(LIGHT_SYSTEM.SKY_LIGHT) as THREE.DirectionalLight;
            if (skyLight) {
                refs.skyLightRef.current = skyLight;
                if (!refs.skyLightOffsetRef.current) refs.skyLightOffsetRef.current = new THREE.Vector3();
                refs.skyLightOffsetRef.current.copy(skyLight.position);
            }
        }
    }

    private static setupPlayerAndCamera(engine: WinterEngine, currentSector: any, refs: any, state: RuntimeState) {
        const playerGroup = ModelFactory.createPlayer();
        refs.playerGroupRef.current = playerGroup;

        let bodyMesh = playerGroup.children[0];
        const pLen = playerGroup.children.length;
        for (let i = 0; i < pLen; i++) {
            if (playerGroup.children[i].userData.isBody || playerGroup.children[i].userData.isPlayer) {
                bodyMesh = playerGroup.children[i];
                break;
            }
        }
        refs.playerMeshRef.current = bodyMesh as THREE.Group;

        if (state.initialAim.active && engine.input?.state) {
            engine.input.state.aimVector.x = state.initialAim.x;
            engine.input.state.aimVector.y = state.initialAim.y;
        }


        const spawn = currentSector.playerSpawn;
        playerGroup.position.set(spawn.x, spawn.y || 0, spawn.z);
        if (spawn.rot) playerGroup.rotation.y = spawn.rot;

        const flashlight = ModelFactory.createFlashlight();
        playerGroup.add(flashlight);
        playerGroup.add(flashlight.target);
        refs.flashlightRef.current = flashlight;
        state.flashlightOn = true;

        engine.scene.add(playerGroup);

        const env = currentSector.environment;
        const envCameraZ = env?.cameraOffsetZ !== undefined ? env.cameraOffsetZ : 40;
        const envCameraY = env?.cameraHeight || CAMERA_HEIGHT;
        const envCameraAngle = env?.cameraAngle || 0;

        engine.camera.setPosition(spawn.x, envCameraY, spawn.z + envCameraZ, true);

        if (currentSector.cinematic) {
            const c = currentSector.cinematic;
            engine.camera.setCinematic(true);
            engine.camera.setPosition(playerGroup.position.x + c.offset.x, (c.offset.y !== undefined ? c.offset.y : envCameraY), playerGroup.position.z + c.offset.z, true);
            engine.camera.lookAt(playerGroup.position.x + c.lookAtOffset.x, playerGroup.position.y + c.lookAtOffset.y, playerGroup.position.z + c.lookAtOffset.z, true);
        } else {
            engine.camera.setCinematic(false);
            engine.camera.setAngle(envCameraAngle, true);
            engine.camera.follow(playerGroup.position, envCameraZ, envCameraY);
            engine.camera.snapToTarget();
        }

        refs.prevPosRef.current.copy(playerGroup.position);
        refs.hasSetPrevPosRef.current = true;

        return playerGroup;
    }

    private static createSectorContext(ctx: SetupContext, currentSector: any, textures: any, flickeringLights: any[], burningObjects: any[], mapItems: MapItem[], rng: () => number, playerGroup: THREE.Group, yielder: () => Promise<void>): SectorContext {
        const { engine, state, props, callbacks } = ctx;

        const spawnHorde = (count: number, type?: EnemyType, pos?: THREE.Vector3) => {
            const startPos = pos || playerGroup.position;
            const newEnemies = EnemyManager.spawnHorde(engine.scene, startPos, count, state.bossSpawned, state.enemies.length, type);
            if (newEnemies) {
                const len = newEnemies.length;
                for (let i = 0; i < len; i++) state.enemies.push(newEnemies[i]);
            }
        };

        const realSpawnZombie = (forcedType?: EnemyType, forcedPos?: THREE.Vector3) => {
            const playerPos = playerGroup.position;
            const enemy = EnemyManager.spawn(engine.scene, playerPos, forcedType, forcedPos, state.bossSpawned, state.enemies.length);
            if (enemy) state.enemies.push(enemy);
            return enemy;
        };

        const spawnBoss = (type: string, pos?: THREE.Vector3) => {
            const pSpawn = currentSector.playerSpawn;
            const bossPos = pos || (currentSector.bossSpawn ? new THREE.Vector3(currentSector.bossSpawn.x, 0, currentSector.bossSpawn.z) : new THREE.Vector3(pSpawn.x, 0, pSpawn.z));
            const bossId = !isNaN(parseInt(type)) ? parseInt(type) : props.currentSector;
            const bossData = (BOSSES as any)[bossId];

            const boss = EnemyManager.spawnBoss(engine.scene, bossPos, bossData);
            if (boss) {
                state.enemies.push(boss);
                state.bossSpawned = true;

                const idStr = String(bossId);
                let seen = false;
                for (let j = 0; j < props.stats.seenBosses.length; j++) {
                    if (props.stats.seenBosses[j] === bossId) {
                        seen = true;
                        break;
                    }
                }

                if (!seen && callbacks.onDiscovery) {
                    callbacks.onDiscovery(DiscoveryType.BOSS as any, String(bossId), 'ui.boss_encountered', DataResolver.getBossName(bossId));
                }
            }
            return boss;
        };

        return {
            scene: engine.scene, engine, obstacles: state.obstacles, collisionGrid: state.collisionGrid, chests: state.chests,
            flickeringLights, burningObjects, rng, triggers: state.triggers, mapItems, debugMode: props.debugMode,
            textures: textures, spawnZombie: realSpawnZombie, spawnHorde, spawnBoss,
            cluesFound: (props.stats.cluesFound || []) as string[], collectiblesDiscovered: (props.stats.collectiblesDiscovered || []) as string[],
            collectibles: [], dynamicLights: [], interactables: [], sectorId: props.currentSector, smokeEmitters: [],
            sectorState: state.sectorState, state: state, yield: yielder,
            makeNoise: (pos: THREE.Vector3, type: NoiseType, radius: number) => ctx.session.makeNoise(pos, type, radius),

            // --- VINTERDÖD FIX: Injecting the generic bridge into the sector events API ---
            onAction: callbacks.onAction
        };
    }

    private static bindStateCallbacks(ctx: SetupContext, sectorCtx: SectorContext) {
        const { engine, session, state, callbacks, refs, props } = ctx;

        state.callbacks = {
            spawnPart: callbacks.spawnPart,
            spawnDecal: callbacks.spawnDecal,
            showDamageText: callbacks.showDamageText,
            spawnBubble: callbacks.spawnBubble,
            onTrigger: callbacks.onTrigger,
            onAction: (action: any) => {
                if (action.type === 'HEAL') {
                    const hp = state.statsBuffer[PlayerStatID.HP];
                    const maxHp = state.statsBuffer[PlayerStatID.MAX_HP];
                    state.statsBuffer[PlayerStatID.HP] = Math.min(maxHp, hp + action.amount);
                    UiSounds.playConfirm();
                }
                if (action.type === 'SOUND' && action.id) audioEngine.playSound(action.id);
                callbacks.handleTriggerAction(action, engine.scene);
            },
            explodeEnemy: (e: any, force: THREE.Vector3) => EnemyManager.explodeEnemy(e, sectorCtx, force),
            gainXp: (amount: number) => {
                const tracker = session.getSystem('damage_tracker_system') as any;
                if (tracker) tracker.recordXp(session, amount);
            },
            gainSp: (amount: number) => {
                const tracker = session.getSystem('damage_tracker_system') as any;
                if (tracker) tracker.recordSp(session, amount);
            },
            onPlayerHit: (damage: number, attacker: any, type: string, isDoT?: boolean, effect?: any, dur?: number, intense?: number, attackName?: string) => {
                const statsSystem = session.getSystem('player_stats_system') as any;
                if (statsSystem) {
                    statsSystem.handlePlayerHit(session, damage, attacker, type, isDoT, effect, dur, intense, attackName);
                }
            },
            onDiscovery: (type: DiscoveryType, id: string, titleKey: string, detailsKey: string, payload?: any) => {
                // O(1) Optimization: Avoid React overhead if already found in this session or prior
                const sets = state.discoverySets;
                if (!sets) return;

                const stats = state.sessionStats;
                let alreadyFound = false;

                if (type === DiscoveryType.CLUE) {
                    alreadyFound = sets.clues.has(id);
                    if (!alreadyFound) {
                        sets.clues.add(id);
                        stats.cluesFound.push(payload || { id });
                    }
                } else if (type === DiscoveryType.POI) {
                    alreadyFound = sets.pois.has(id);
                    if (!alreadyFound) {
                        sets.pois.add(id);
                        stats.discoveredPOIs.push(id);
                    }
                } else if (type === DiscoveryType.COLLECTIBLE) {
                    alreadyFound = sets.collectibles.has(id);
                    if (!alreadyFound) {
                        sets.collectibles.add(id);
                        stats.collectiblesDiscovered.push(id);
                        // Add payload info if available for the UI
                        if (payload) {
                            // Enrich for the discovery screen
                        }
                    }
                }

                // First time discovery awards SP (Plan overhaul)
                if (!alreadyFound) {
                    // Update session stats (for end-of-sector report)
                    const tracker = session.getSystem('damage_tracker_system') as any;
                    if (tracker) tracker.recordSp(session, 1);

                    // Update live DOD buffer (for HUD)
                    callbacks.gainSp(1);

                    if (callbacks.onDiscovery) {
                        // Pass specific payload if it's a collectible for the UI logic in App.tsx
                        callbacks.onDiscovery(type, id, titleKey, detailsKey, payload);
                    }
                }
            },
            onBossKilled: (idStr: string) => {
                const id = parseInt(idStr);
                const stats = state.sessionStats;

                let alreadyDefeated = false;
                const bdLen = state.bossesDefeated.length;
                for (let j = 0; j < bdLen; j++) {
                    if (state.bossesDefeated[j] === id) {
                        alreadyDefeated = true;
                        break;
                    }
                }

                if (!alreadyDefeated) {
                    state.bossesDefeated.push(id);
                    state.bossDefeatedTime = engine.simTime;

                    const tracker = session.getSystem('damage_tracker_system') as any;
                    if (tracker) {
                        tracker.recordKill(session, idStr, true);
                        tracker.recordSp(session, 2); // Boss Kill = +2 SP
                    }

                    const currentFM = refs.familyMemberRef.current;
                    if (currentFM && !currentFM.rescued) {
                        currentFM.rescued = true;
                        // SP for family rescue (+2 SP)
                        if (tracker) tracker.recordSp(session, 2);
                    }
                    callbacks.onBossKilled(id);
                }
            },
            makeNoise: (pos: THREE.Vector3, type: NoiseType, radius: number) => session.makeNoise(pos, type, radius),
            collectedCluesRef: refs.collectedCluesRef
        };
    }

    private static finalizeStateLimits(state: RuntimeState, mapItems: MapItem[], flickeringLights: any[], scene: THREE.Scene, sectorCtx: SectorContext) {
        state.mapItems = mapItems;

        const sb = state.statsBuffer;
        sb[PlayerStatID.MAX_HP] = (sb[PlayerStatID.MAX_HP] <= 0) ? 100 : Math.max(100, sb[PlayerStatID.MAX_HP]);
        sb[PlayerStatID.HP] = sb[PlayerStatID.MAX_HP];
        sb[PlayerStatID.MAX_STAMINA] = (sb[PlayerStatID.MAX_STAMINA] <= 0) ? 100 : Math.max(100, sb[PlayerStatID.MAX_STAMINA]);
        sb[PlayerStatID.STAMINA] = sb[PlayerStatID.MAX_STAMINA];
        sb[PlayerStatID.SPEED] = (sb[PlayerStatID.SPEED] <= 0) ? PLAYER_BASE_SPEED : Math.max(10.0, sb[PlayerStatID.SPEED]);

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
    }

    private static setupFamily(currentSector: any, props: GameCanvasProps, refs: any, scene: THREE.Scene) {
        refs.activeFamilyMembers.current.length = 0;
        const playerSpawn = currentSector.playerSpawn;
        const fSpawn = currentSector.familySpawn;
        const rescuedIndices = [...(props.rescuedFamilyIndices || [])];

        // Developer override
        if (props.debugMode && props.currentSector >= 1 && rescuedIndices.length === 0) {
            for (let i = 0; i < props.currentSector; i++) {
                if (rescuedIndices.indexOf(i) === -1) rescuedIndices.push(i);
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
                        refs.activeFamilyMembers.current.push({ mesh, found: true, following: true, rescued: true, name: fmData.name, id: fmData.id, scale: fmData.scale, seed: Math.random() * 100, ring, spawnPos: mesh.position.clone() });
                    }
                }
            }
        }

        let hasRescuedCurrent = rescuedIndices.indexOf(props.currentSector) !== -1;

        if (!props.familyAlreadyRescued) {
            const theme = SECTOR_THEMES[props.currentSector];
            const fmId = theme ? theme.familyMemberId : 0;
            if (!hasRescuedCurrent) {
                const fmData = FAMILY_MEMBERS[fmId];
                if (fmData) {
                    const mesh = ModelFactory.createFamilyMember(fmData);
                    mesh.position.set(fSpawn.x, 0, fSpawn.z);
                    if (fSpawn.y) mesh.position.y = fSpawn.y;
                    this.addFamilyMarker(mesh, fmData, scene);

                    let ring = null;
                    for (let c = 0; c < mesh.children.length; c++) {
                        if (mesh.children[c].userData.isRing) { ring = mesh.children[c]; break; }
                    }
                    const currentFM = { mesh, found: false, following: false, rescued: false, name: fmData.name, id: fmData.id, scale: fmData.scale, seed: Math.random() * 100, ring, spawnPos: new THREE.Vector3(fSpawn.x, fSpawn.y || 0, fSpawn.z) };
                    refs.activeFamilyMembers.current.push(currentFM);
                    refs.familyMemberRef.current = currentFM;
                }
            }
        }
    }

    private static setupSystems(ctx: SetupContext, playerGroup: THREE.Group, sectorCtx: SectorContext) {
        const { engine, session, state, callbacks, refs, props, ui } = ctx;

        if (engine.water) {
            engine.water.setPlayerRef(playerGroup);
            engine.water.setCallbacks({
                spawnPart: (x, y, z, type, count) => callbacks.spawnPart(x, y, z, type, count),
                makeNoise: (pos, type, rad) => session.makeNoise(pos, type as NoiseType, rad)
            });
        }

        session.addSystem(new DamageNumberSystem(engine.scene));
        session.addSystem(new DamageTrackerSystem());

        const detectionSys = new EnemyDetectionSystem();
        session.addSystem(detectionSys);
        session.detectionSystem = detectionSys;

        session.addSystem(new PlayerMovementSystem(playerGroup));
        session.addSystem(new VehicleMovementSystem(playerGroup));
        session.addSystem(new PlayerCombatSystem(playerGroup));
        session.addSystem(new PlayerInteractionSystem(
            playerGroup, callbacks.concludeSector, sectorCtx.collectibles, refs.activeFamilyMembers, engine.scene,
            (id) => callbacks.onDiscovery && callbacks.onDiscovery(DiscoveryType.COLLECTIBLE, id, 'ui.collectible_discovered', `collectibles.${id}.title`)
        ));

        const playerStatsSystem = new PlayerStatsSystem(playerGroup, callbacks.t, refs.activeFamilyMembers);
        session.addSystem(playerStatsSystem);

        session.addSystem(new EnemySystem(playerGroup, {
            spawnBubble: callbacks.spawnBubble,
            gainXp: callbacks.gainXp,
            t: callbacks.t,
            onDiscovery: callbacks.onDiscovery,
            onBossKilled: (id: number) => {
                let seen = false;
                for (let j = 0; j < state.bossesDefeated.length; j++) {
                    if (state.bossesDefeated[j] === id) { seen = true; break; }
                }
                if (!seen) state.bossesDefeated.push(id);
                state.bossDefeatedTime = engine.simTime;
                state.familyFound = true;

                const tracker = session.getSystem('damage_tracker_system') as any;
                if (tracker) tracker.recordKill(session, String(id), true);

                const currentFM = refs.familyMemberRef.current;
                if (currentFM && !currentFM.rescued) {
                    currentFM.rescued = true;
                    if (!props.stats.rescuedFamilyIds.includes(currentFM.id)) props.stats.rescuedFamilyIds.push(currentFM.id);
                }

                audioEngine.stopMusic();
                const curSector = (props as any).currentSectorData || SectorSystem.getSector(props.currentSector || 0);
                if (curSector?.ambientLoop) audioEngine.playMusic(curSector.ambientLoop);
            },
            onPlayerHit: (damage, attacker, type, isDoT, effect, dur, intense, attackName) =>
                playerStatsSystem.handlePlayerHit(session, damage, attacker, type, isDoT, effect, dur, intense, attackName),
        } as any));

        session.addSystem(new SectorSystem(playerGroup, props.currentSector, {
            setNotification: (n: any) => { if (n && n.visible && n.text) callbacks.spawnBubble(`${n.icon ? n.icon + ' ' : ''}${n.text}`, n.duration || 3000); },
            t: callbacks.t, spawnPart: callbacks.spawnPart, startCinematic: callbacks.startCinematic,
            setInteraction: (interaction: any) => {
                if (interaction) {
                    state.interaction.active = true;
                    state.interaction.type = InteractionType.PLANT_EXPLOSIVE;
                    state.hasCurrentInteraction = true;
                    state.currentInteractionPayload = interaction;
                } else {
                    state.interaction.active = false;
                    state.interaction.type = InteractionType.NONE;
                    state.hasCurrentInteraction = false;
                }
            },

            playSound: (id: SoundID) => audioEngine.playSound(id),
            playTone: (freq: number, type: OscillatorType, duration: number, vol?: number) => {},
            cameraShake: (amount: number) => engine.camera.shake(amount), scene: engine.scene,
            setCameraOverride: (params: any) => { refs.cameraOverrideRef.current = params; engine.camera.setCinematic(!!params); },
            makeNoise: (pos: THREE.Vector3, type: NoiseType, radius: number) => session.makeNoise(pos, type, radius),
            spawnZombie: (type: EnemyType, pos?: THREE.Vector3) => callbacks.spawnZombie(type, pos),
            spawnHorde: (count: number, type?: EnemyType, pos?: THREE.Vector3) => sectorCtx.spawnHorde(count, type, pos),
            setOverlay: ui.setOverlay
        }));

        session.addSystem(new WorldLootSystem(playerGroup, engine.scene, { gainScrap: callbacks.gainScrap }));

        session.addSystem(new FamilySystem(playerGroup, refs.activeFamilyMembers, refs.cinematicRef, {
            setFoundMemberName: (n: string) => ui.setFoundMemberName && ui.setFoundMemberName(n),
            startCinematic: callbacks.startCinematic
        }));

        session.addSystem(new CinematicSystem({
            cinematicRef: refs.cinematicRef, camera: engine.camera as any, playerMeshRef: refs.playerMeshRef as any,
            bubbleRef: refs.bubbleRef, activeFamilyMembers: refs.activeFamilyMembers,
            callbacks: {
                setCurrentLine: ui.setCurrentLine, setCinematicActive: ui.setCinematicActive, endCinematic: callbacks.endCinematic,
                playCinematicLine: callbacks.playCinematicLine, setTailPosition: ui.setBubbleTailPosition,
                onAction: callbacks.onAction // Hooked up!
            },
            state: state
        }));

        session.addSystem(new DeathSystem({
            playerGroupRef: refs.playerGroupRef as any, playerMeshRef: refs.playerMeshRef as any, fmMeshRef: refs.familyMemberRef, activeFamilyMembers: refs.activeFamilyMembers,
            deathPhaseRef: refs.deathPhaseRef, inputRef: () => engine.input.state, cameraRef: () => engine.camera.threeCamera, propsRef: refs.propsRef,
            distanceTraveledRef: refs.distanceTraveledRef, fxCallbacks: callbacks, setDeathPhase: ui.setDeathPhase
        }));

        // Optimize static meshes
        engine.scene.traverse((obj) => {
            const ud = obj.userData;
            if (ud?.isPlayer || ud?.isEnemy || ud?.isProjectile || ud?.vehicleDef ||
                ud?.isFamilyMember || ud?.isBody || ud?.isCorpse || ud?.dynamic || ud?.isInteractable) {
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
    }

    private static addFamilyMarker(mesh: THREE.Group, fmData: any, scene: THREE.Scene) {
        const markerGroup = new THREE.Group();
        markerGroup.userData.isRing = true;
        markerGroup.position.y = 0.2;

        const darkColor = new THREE.Color(fmData.color).multiplyScalar(0.2);
        const fillMat = MATERIALS.familyRingFill.clone();
        fillMat.color.set(darkColor);
        const fill = new THREE.Mesh(GEOMETRY.familyRingFill, fillMat);
        markerGroup.add(fill);

        const borderMat = MATERIALS.familyRingBorder.clone();
        borderMat.color.set(fmData.color);
        const border = new THREE.Mesh(GEOMETRY.familyRingBorder, borderMat);
        markerGroup.add(border);
        mesh.add(markerGroup);
        scene.add(mesh);
    }

    // --- HELPER METHOD: Define this in the same class ---
    private static clearDynamicNodes(parent: THREE.Object3D) {
        const children = parent.children;
        for (let i = children.length - 1; i >= 0; i--) {
            const child = children[i];
            const ud = child.userData;
            if (ud && (ud.isDynamic || ud.isEnemy || ud.isCorpse)) {
                parent.remove(child);
            } else {
                this.clearDynamicNodes(child);
            }
        }
    }

    /**
     * Respawns the player with full HP, stamina, ammo etc.
     * Enemies are respawned. Chests already opened remain open.
     * */
    static respawnPlayer(session: GameSessionLogic, engine: WinterEngine, state: RuntimeState, refs: any, props: any, setDeathPhase: (phase: string) => void) {
        const scene = engine.scene;

        // --- 1. RESET PLAYER STATE (DOD / Zero-GC) ---
        // --- STATUS & EFFECT RESET (Zero-GC Clean Slate) ---
        state.statusFlags = 0; // Reset all flags (Dead, Airborne, etc.)
        refs.deathPhaseRef.current = 'NONE';
        state.playerDeathState = PlayerDeathState.ALIVE;
        state.statsBuffer[PlayerStatID.HP] = state.statsBuffer[PlayerStatID.MAX_HP];
        state.statsBuffer[PlayerStatID.STAMINA] = state.statsBuffer[PlayerStatID.MAX_STAMINA];
        state.isReloading = false;
        state.isInteractionOpen = false;
        state.vehicle.active = false;
        state.vehicle.mesh = null;
        state.vehicle.speed = 0;
        state.vehicle.engineState = 'OFF';

        // Reset Numeric Effect Buffers (Zero-GC: Filling contiguous arrays with 0)
        state.effectDurations.fill(0);
        state.effectIntensities.fill(0);

        // Clear Dynamic Status Effect Collections
        state.activePassives.length = 0;
        state.activeBuffs.length = 0;
        state.activeDebuffs.length = 0;

        // Reset Killer Metadata
        state.killedByEnemy = false;
        state.killerType = DamageID.NONE;
        state.killerName = '';
        state.killerAttackName = '';

        // Reset simulation timers to prevent lockout
        state.simTime = 0;
        state.lastShotTime = 0;
        state.reloadEndTime = 0;
        state.throwChargeStart = 0;
        state.lastDamageTime = 0;
        state.lastStaminaUseTime = 0;
        state.lastBiteTime = 0;
        state.lastActionTime = 0;
        state.bossDefeatedTime = 0;
        state.lastDrownTick = 0;
        state.isInteractionOpen = false;
        state.eDepressed = false;
        state.interaction.active = false;
        state.discovery.active = false;

        // Empty pools:
        state.enemies.length = 0;
        state.bloodDecals.length = 0;

        // Purge ghost cells to prevent immediate collision conflicts with new spawns
        if (state.collisionGrid) {
            state.collisionGrid.clearEnemies();
        }

        // Weapons:
        for (const key in state.weaponAmmo) {
            state.weaponAmmo[key as any] = WEAPONS[key as any]?.magSize || 0;
        }

        // --- 2. SECTOR SPECIFC RESET ---
        // Clear stale grid state and reset sector spawns 
        // Note: Do not entirely clear the collision grid to retain static world obstacles/chests
        if (state.sectorState) {
            for (const key in state.sectorState.spawns) {
                state.sectorState.spawns[key] = false;
            }
            state.sectorState.zombiesKilled = 0;
            state.sectorState.zombiesKillTarget = 0;
            state.sectorState.busEventState = 0; // Reset Sector 1 pincer
        }

        // --- 3. PASSIVES, BUFFS & DEBUFFS ---
        const statsSystem = engine.getSystem('player_stats_system') as any;
        if (statsSystem && statsSystem.updatePassives) {
            statsSystem.updatePassives(session);
        }

        // --- 4. SYSTEM CLEARING ---
        ProjectileSystem.clear(scene, state.projectiles, state.fireZones);
        FXSystem.reset();
        //EnemyManager.clear();

        // --- 5. CLEAR DYNAMIC OBJECTS ---
        this.clearDynamicNodes(scene);

        // --- 6. SECTOR DATA ---
        const currentSectorData = (props as any).currentSectorData || SectorSystem.getSector(props.currentSector || 0);

        // 6.1 RESPAWN ZOMBIES
        const sCtx = refs.sectorContextRef.current;
        if (sCtx && currentSectorData.setupZombies) {
            currentSectorData.setupZombies(sCtx);
        }

        // 6.2 PLAYER & FAMILY MEMBER POSITIONING
        if (refs.playerGroupRef.current) {
            const spawn = currentSectorData.playerSpawn;
            refs.playerGroupRef.current.position.set(spawn.x, spawn.y || 0, spawn.z);
            engine.camera.snapToTarget();

            // Family members:  
            const members = refs.activeFamilyMembers.current || [];
            const fSpawn = currentSectorData.familySpawn;

            for (let i = 0; i < members.length; i++) {
                const fm = members[i];
                if (fm.mesh) {
                    if (!fm.rescued && fm.following) {
                        fm.following = false;
                        fm.found = false;
                    } else if (fm.rescued) {
                        fm.following = true;
                        fm.found = true;
                    }

                    if (fm.rescued || fm.following) {
                        fm.mesh.position.set(
                            spawn.x + (Math.random() - 0.5) * 5,
                            spawn.y || 0,
                            spawn.z + 5 + Math.random() * 5
                        );
                    } else if (fm.spawnPos) {
                        fm.mesh.position.copy(fm.spawnPos);
                    } else if (fSpawn) {
                        fm.mesh.position.set(fSpawn.x, fSpawn.y || 0, fSpawn.z);
                    }
                }
            }
        }

        // --- 7. FIX THE UI ---
        HudStore.patch({ isDead: false, hp: state.statsBuffer[PlayerStatID.MAX_HP] });

        setDeathPhase('NONE');
    }

    /**
     * Restarts the sector completely.
     */
    static async restartSector(ctx: SetupContext, currentSetupId: number) {
        const { engine, state, ui } = ctx;

        ui.setIsSectorLoading(true);

        EnemyManager.clear();
        ProjectileSystem.clear(engine.scene, state.projectiles, state.fireZones);
        FXSystem.reset();

        // --- VINTERDÖD FIX: PURGE STALE GRID STATE ---
        if (state.collisionGrid) {
            state.collisionGrid.clear();
        }

        const toRemove: THREE.Object3D[] = [];
        engine.scene.traverse(obj => {
            if (obj.userData?.generated || obj.userData?.isEnemy || obj.userData?.isPlayer) {
                toRemove.push(obj);
            }
        });
        toRemove.forEach(obj => { if (obj.parent) obj.parent.remove(obj); });

        // Zero-GC Arrays reset
        state.enemies.length = 0;
        state.obstacles.length = 0;
        state.chests.length = 0;
        state.triggers.length = 0;
        state.bloodDecals.length = 0;

        state.statusFlags &= ~PlayerStatusFlags.DEAD;
        state.statsBuffer[PlayerStatID.HP] = state.statsBuffer[PlayerStatID.MAX_HP];
        state.statsBuffer[PlayerStatID.STAMINA] = state.statsBuffer[PlayerStatID.MAX_STAMINA];


        // VINTERDÖD FIX: Reset simulation timers to prevent lockout
        state.simTime = 0;
        state.lastShotTime = 0;
        state.reloadEndTime = 0;
        state.throwChargeStart = 0;
        state.lastDamageTime = 0;
        state.lastStaminaUseTime = 0;
        state.lastBiteTime = 0;
        state.lastActionTime = 0;
        state.bossDefeatedTime = 0;
        state.lastDrownTick = 0;

        await this.runSectorSetup(ctx, currentSetupId);

        ui.setDeathPhase('NONE');
    }

    static disposeSector(session: GameSessionLogic, state: RuntimeState) {
        EnemyManager.clear();
        AssetLoader.getInstance().clearCache();

        const engine = WinterEngine.getInstance();
        engine.input.disable();
        audioEngine.setReverb(0);
        audioEngine.stopAll();

        ProjectileSystem.clear(engine.scene, state.projectiles, state.fireZones);
        FXSystem.reset();

        if (session) {
            session.dispose();
        }

        state.sessionCollectiblesDiscovered.length = 0;
        state.bossSpawned = false;
    }
}
