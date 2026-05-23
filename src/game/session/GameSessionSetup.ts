import * as THREE from 'three';
import { TriggerSystem } from '../../systems/TriggerSystem';
import { GameCanvasProps } from '../../types/CanvasTypes';
import { MapItem, DiscoveryType } from '../../components/ui/hud/HudTypes';
import { DeathPhase } from '../../types/SessionTypes';
import { SectorContext, BossID, SectorID } from '../../game/session/SectorTypes';
import { WinterEngine } from '../../core/engine/WinterEngine';
import { GameSessionLogic } from './GameSessionLogic';
import { NoiseType, EnemyType } from '../../entities/enemies/EnemyTypes';
import { VehicleEngineState } from '../../entities/vehicles/VehicleTypes';
import { SectorBuilder } from '../../core/world/SectorBuilder';
import { PathGenerator } from '../../core/world/generators/PathGenerator';
import { ChunkManager } from '../../core/world/ChunkManager';
import { ProjectileSystem } from '../../systems/ProjectileSystem';
import { ParticleSystem } from '../../systems/ParticleSystem';
import { ParticleRenderer } from '../../core/renderers/ParticleRenderer';
import { SystemID } from '../../systems/System';
import { FXSystem } from '../../systems/FXSystem';
import { FXParticleType, FXDecalType } from '../../types/FXTypes';
import { DamageNumberSystem } from '../../systems/DamageNumberSystem';
import { EnemyManager } from '../../entities/enemies/EnemyManager';
import { AssetLoader } from '../../utils/assets/AssetLoader';
import { PLAYER_CHARACTER, FAMILY_MEMBERS, CAMERA_HEIGHT, LIGHT_SYSTEM, BOSSES, PLAYER_BASE_SPEED, FamilyMemberID, INITIAL_ENEMY_POOL, MAX_ENTITIES } from '../../content/constants';
import { ModelFactory, createProceduralTextures } from '../../utils/assets';
import { SubEffectType } from '../../systems/EffectManager';
import { PlayerStatID, PlayerStatusFlags } from '../../entities/player/PlayerTypes';
import { PlayerDeathState, DamageID, DamageType, EnemyAttackType } from '../../entities/player/CombatTypes';
import { StatusEffectID } from '../../types/StatusEffects';
import { SoundID, ToneType } from '../../utils/audio/AudioTypes';
import { TriggerType, TriggerActionType, TriggerStatus } from '../../types/TriggerTypes';
import { audioEngine } from '../../utils/audio/AudioEngine';
import { UiSounds } from '../../utils/audio/AudioLib';
import { WEAPONS } from '../../content/weapons';
import { PlayerMovementSystem } from '../../systems/PlayerMovementSystem';
import { VehicleMovementSystem } from '../../systems/VehicleMovementSystem';
import { PlayerCombatSystem } from '../../systems/PlayerCombatSystem';
import { PlayerStatsSystem } from '../../systems/PlayerStatsSystem';
import { LootSystem } from '../../systems/LootSystem';
import { InteractionSystem } from '../../systems/InteractionSystem';
import { EnemySystem } from '../../systems/EnemySystem';
import { SectorSystem } from '../../systems/SectorSystem';
import { FamilySystem } from '../../systems/FamilySystem';
import { CinematicSystem } from '../../systems/CinematicSystem';
import { DeathSystem } from '../../systems/DeathSystem';
import { DataResolver } from '../../core/data/DataResolver';
import { HudStore } from '../../store/HudStore';
import { DamageTrackerSystem } from '../../systems/DamageTrackerSystem';
import { EnemyDetectionSystem } from '../../systems/EnemyDetectionSystem';
import { ChallengeSystem } from '../../systems/ChallengeSystem';
import { HudSystem } from '../../systems/HudSystem';
import { RuntimeState } from '../../core/RuntimeState';
import { CLUES } from '../../content/clues';
import { POIS } from '../../content/pois';
import { COLLECTIBLES } from '../../content/collectibles';
import { GEOMETRY, MATERIALS } from '../../utils/assets';
import { PerkFX } from '../../systems/PerkFX';
import { PerkSystem } from '../../systems/PerkSystem';
import { InteractionType, InteractionSubType } from '../../systems/ui/UIEventBridge';

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
        setDeathPhase: (val: DeathPhase) => void;
        setBossIntroActive: (val: boolean) => void;
        setBubbleTailPosition: (val: any) => void;
        setCurrentLine: (val: any) => void;
        setCinematicActive: (val: boolean) => void;
        setInteractionType: (val: any) => void;
        setFoundMember?: (id: FamilyMemberID) => void;
        setOverlay: (type: number | null) => void;
    };
    callbacks: {
        t: (k: string) => string;
        setBubble: (text: string, duration?: number) => void;
        startCinematic: (mesh: any, sectorId?: number, dialogueId?: number, params?: any) => void;
        endCinematic: () => void;
        playCinematicLine: (index: number) => void;
        spawnParticle: (x: number, y: number, z: number, type: FXParticleType, count: number, customMesh?: THREE.Mesh, customVel?: THREE.Vector3, color?: number, scale?: number, life?: number) => void;
        spawnDecal: (x: number, z: number, scale: number, material?: THREE.Material, type?: FXDecalType) => void;
        showDamageText: (x: number, y: number, z: number, text: string, color?: number) => void;
        spawnZombie: (forcedType?: EnemyType, forcedPos?: THREE.Vector3) => void;
        concludeSector: (isExtraction: boolean) => void;
        onSectorLoaded?: () => void;
        onTrigger: (type: TriggerType, duration: number) => void;
        onBossKilled: (id: number) => void;
        onAction: (action: any) => void;
        spawnHorde: (count: number, type?: EnemyType, pos?: THREE.Vector3) => void;
        playSound: (id: SoundID) => void;
        setInteraction: (interaction: any) => void;
        collectedCluesRef: any;

        onDiscovery?: (type: DiscoveryType, id: string, titleKey: string, detailsKey: string, payload?: any) => void;
        gainXp: (amount: number) => void;
        gainSp: (amount: number) => void;
        gainScrap: (amount: number) => void;
    }
}

export class GameSessionSetup {

    static async runSectorSetup(ctx: SetupContext, currentSetupId: number) {
        const { engine, session, state, props, refs, callbacks } = ctx;
        const scene = engine.scene;
        const isMounted = refs.isMounted;
        const setupIdRef = refs.setupIdRef;

        if (!isMounted.current || setupIdRef.current !== currentSetupId) {
            console.warn('[GameSessionSetup] Early return: Setup aborted.');
            return;
        }

        refs.isBuildingSectorRef.current = true;
        refs.deathPhaseRef.current = DeathPhase.NONE;

        // Centralized Zero-GC Reset
        GameSessionLogic.resetState(state, props);

        // [VINTERDÖD FIX] Purge Triggers to prevent sector pollution
        if (session.triggerSystem) {
            session.triggerSystem.clear();
        }

        let sectorLoaded = false;

        try {
            // Ensure sector definition is in cache — may be cold on fresh save / first Prologue load
            let currentSector = (props as any).currentSectorData || SectorSystem.getSector(props.currentSector || 0);
            if (!currentSector) {
                console.warn(`[GameSessionSetup] Sector ${props.currentSector} not in cache — loading now.`);
                currentSector = await SectorSystem.loadSector(props.currentSector || 0);
            }
            state.sectorName = currentSector.name || DataResolver.getSectorName(currentSector.id);

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
                if (!isMounted.current || setupIdRef.current !== currentSetupId) {
                    const err = new Error("ABORT_SETUP");
                    (err as any).isAbort = true;
                    throw err;
                }
                // Mandatory yield to allow the UI to breathe and catch aborts
                await new Promise<void>(resolve => setTimeout(resolve, 0));
            };

            const mapItems: MapItem[] = [];
            const burningObjects: any[] = [];
            const flickeringLights: any[] = [];
            const textures = createProceduralTextures();

            const triggerSystem = new TriggerSystem(MAX_ENTITIES.TRIGGERS);

            // 2. Setup Player & Camera
            const playerGroup = this.setupPlayerAndCamera(engine, currentSector, refs, state);
            refs.playerGroupRef.current = playerGroup;
            (session as any).playerGroup = playerGroup;
            session.playerPos = playerGroup.position;

            // 3. Create Sector Context
            refs.activeFamilyMembers.current.length = 0;
            const sectorCtx = this.createSectorContext(ctx, currentSector, textures, flickeringLights, burningObjects, mapItems, rng, playerGroup, yielder);
            refs.sectorContextRef.current = sectorCtx;
            state.sectorState.ctx = sectorCtx;
            session.sectorCtx = sectorCtx;

            // 4. Bind State Callbacks
            this.bindStateCallbacks(ctx, sectorCtx);

            PathGenerator.resetPathLayer();
            const setupStart = performance.now();
            console.info(`[SectorBuilder] ▶ START building sector ${props.currentSector} [LIVE]`);

            performance.mark('build-start');
            await SectorBuilder.build(sectorCtx, currentSector);
            performance.mark('build-end');
            performance.measure('Sector Build', 'build-start', 'build-end');

            console.info(`[SectorBuilder] ✅ DONE building sector ${props.currentSector} [LIVE] in ${(performance.now() - setupStart).toFixed(1)}ms`);

            if (!isMounted.current || setupIdRef.current !== currentSetupId) return;
            await yielder();

            // 5. Finalize limits and parse effects
            this.finalizeStateLimits(state, mapItems, flickeringLights, scene, sectorCtx);
            await yielder();

            // 6. Setup Family Members
            this.setupFamily(currentSector, props, refs, scene);
            await yielder();

            // 7. Initialize Systems
            this.setupSystems(ctx, playerGroup, sectorCtx, triggerSystem);


            await yielder();

            // --- VINTERDÖD FIX: BYPASS INTRO TRIGGERS ---
            // If the sector is already cleared, mark the intro triggers as completed
            if (state.familyAlreadyRescued || state.bossPermanentlyDefeated) {
                const triggers = ctx.session.triggerSystem;
                const activeFlags = triggers.getActiveFlags();
                const types = triggers.getTriggerTypes();
                const metadata = triggers.metadata;

                for (let i = 0; i < triggers.capacity; i++) {
                    if (activeFlags[i] === 0) continue;

                    const type = types[i];
                    const meta = metadata[i];

                    let hasCinematic = false;
                    if (meta.actions) {
                        for (let j = 0; j < meta.actions.length; j++) {
                            if (meta.actions[j].type === TriggerActionType.START_CINEMATIC) {
                                hasCinematic = true;
                                break;
                            }
                        }
                    }

                    if (type === TriggerType.SPEAK || hasCinematic) {
                        triggers.setStatusFlag(i, TriggerStatus.TRIGGERED, true);
                    }
                }
            }

            FXSystem.preload(scene);
            await yielder();

            // VINTERDÖD FIX: Ensure static light buckets are optimized post-build
            engine.light.rebuildBuckets(sectorCtx.dynamicLights as any);

            // If we are building LIVE (not warmup), activate systems immediately.
            if (!props.isWarmup) {
                await this.activateSector(sectorCtx, currentSector);
            }

            // Handshake: Tell App.tsx to release the loading screen
            if (isMounted.current && setupIdRef.current === currentSetupId) {
                sectorLoaded = true;
                if (callbacks.onSectorLoaded) callbacks.onSectorLoaded();
            }

        } catch (e: any) {
            if (e.isAbort || e.message === "ABORT_SETUP") {
                console.log("[GameSessionSetup] Ghost setup safely killed mid-generation.");
            } else {
                console.error("[GameSessionSetup] Critical Error:", e);
            }
            return;
        } finally {
            refs.isBuildingSectorRef.current = false;

            // HARD UNPAUSE. Guarantee that the engine resumes drawing and logic 
            // even if setup fails mid-way or if it succeeded. This prevents the "frozen screen" bug.
            engine.isRenderingPaused = false;
            engine.isSimulationPaused = false;

            // Fallback to ensure loading screen drops
            if (!sectorLoaded && isMounted.current && setupIdRef.current === currentSetupId) {
                if (callbacks.onSectorLoaded) callbacks.onSectorLoaded();
            }
        }
    }

    /**
     * Activates the live portions of a sector (Zombies, Triggers, etc.)
     * This is called either at the end of runSectorSetup (if not warmup) 
     * or manually when isWarmup toggles to false.
     */
    static async activateSector(ctx: SectorContext, def: any) {
        if (!ctx || !def) return;

        const setupStart = performance.now();
        console.info(`[SectorBuilder] ▶ ACTIVATING live content for sector ${ctx.sectorId}`);

        if (def.setupZombies) {
            await def.setupZombies(ctx);
        }

        // Final world discovery - find all Ground_* meshes for the footprint system
        const { FootprintSystem } = await import('../../systems/FootprintSystem');
        FootprintSystem.init(ctx.scene);

        // Final block - initialize the Navigation FlowField grid
        const { NavigationSystem } = await import('../../systems/NavigationSystem');
        NavigationSystem.init(ctx);

        console.info(`[SectorBuilder] ✅ ACTIVATION complete in ${(performance.now() - setupStart).toFixed(1)}ms`);

        // --- VINTERDÖD FIX: RESET INITIALIZATION SPIKE ---
        // We do this last to ensure the QueryResultPool budget is 100% fresh for the first simulation tick.
        if (ctx.worldStreamer) {
            ctx.worldStreamer.resetQueryPools();
        }
    }

    // --- HELPER METHODS FOR CLEANER SETUP ---

    private static prepareScene(engine: WinterEngine, isWarmup: boolean | undefined, refs: any, env: any) {
        // Aggressively clear the scene. KEEP persistent systems alive (false).
        engine.camera.reset();
        engine.camera.set('fov', env.fov);

        // [VINTERDÖD] Orchestrate the transition via the authoritative engine pipeline.
        engine.mountScene(engine.scene, env, undefined, !!isWarmup);
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

        // --- PERFORMANCE CACHE ---
        // Purging getObjectByName from hot-paths by caching nodes during setup
        state.baseScale = bodyMesh.userData.baseScale !== undefined ? bodyMesh.userData.baseScale : 1.0;
        state.baseY = bodyMesh.userData.baseY !== undefined ? bodyMesh.userData.baseY : 0;

        // Cache Equipment Nodes for O(1) access
        state.nodes.gun = bodyMesh.getObjectByName('gun') || null;
        state.nodes.laserSight = bodyMesh.getObjectByName('laserSight') as THREE.Mesh || null;

        // Find or create barrel tip (Combat optimization)
        if (state.nodes.gun) {
            state.nodes.barrelTip = state.nodes.gun.getObjectByName('barrelTip') || null;
            if (!state.nodes.barrelTip) {
                // If not defined in geometry, we place it at the muzzle end
                const tip = new THREE.Object3D();
                tip.name = 'barrelTip';
                tip.position.set(0, 0, 0.5); // Standard forward offset for our Gun box
                state.nodes.gun.add(tip);
                state.nodes.barrelTip = tip;
            }
        }

        if (state.initialAim.active && engine.input?.state) {
            engine.input.state.aimVector.x = state.initialAim.x;
            engine.input.state.aimVector.y = state.initialAim.y;
        }

        // Prevent NaN poisoning if sector data is missing spawn coordinates
        const spawn = currentSector.playerSpawn || { x: 0, y: 0, z: 0 };
        playerGroup.position.set(spawn.x || 0, spawn.y || 0, spawn.z || 0);
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

        engine.camera.setPosition(playerGroup.position.x, envCameraY, playerGroup.position.z + envCameraZ, true);

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
            EnemyManager.spawnHorde(engine.scene, startPos, count, state.bossSpawned, state.enemies.length, type, false, (e) => {
                state.enemies.push(e);
            });
        };

        const realSpawnZombie = (forcedType?: EnemyType, forcedPos?: THREE.Vector3) => {
            const playerPos = playerGroup.position;
            const enemy = EnemyManager.spawn(engine.scene, playerPos, forcedType, forcedPos, state.bossSpawned, state.enemies.length);
            if (enemy) state.enemies.push(enemy);
            return enemy;
        };

        const spawnBoss = (bossId: BossID, pos?: THREE.Vector3) => {
            const pSpawn = currentSector.playerSpawn;
            const bossPos = pos || (currentSector.bossSpawn ? new THREE.Vector3(currentSector.bossSpawn.x, 0, currentSector.bossSpawn.z) : new THREE.Vector3(pSpawn.x || 0, 0, pSpawn.z || 0));
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
                    callbacks.onDiscovery(DiscoveryType.BOSS as any, bossId as any, 'ui.discovered_boss', DataResolver.getBossName(bossId));
                }
            }
            return boss;
        };

        return {
            scene: engine.scene, engine, obstacles: state.obstacles, chests: state.chests,
            worldStreamer: state.worldStreamer,
            flickeringLights, burningObjects, rng, mapItems, debugMode: props.debugMode,
            textures: textures, spawnZombie: realSpawnZombie, spawnHorde, spawnBoss,
            cluesFound: (props.stats.cluesFound || []) as string[], collectiblesDiscovered: (props.stats.collectiblesDiscovered || []) as string[],
            collectibles: [], dynamicLights: [], interactables: [], triggers: [], sectorId: props.currentSector, smokeEmitters: [],
            sectorState: state.sectorState, state: state, activeFamilyMembers: ctx.refs.activeFamilyMembers.current, yield: yielder,
            makeNoise: (pos: THREE.Vector3, type: NoiseType, radius: number) => ctx.session.makeNoise(pos, type, radius),
            isWarmup: props.isWarmup,

            // --- VINTERDÖD FIX: Injecting the generic bridge into the sector events API ---
            onAction: callbacks.onAction,
            spawnParticle: callbacks.spawnParticle,
            spawnDecal: callbacks.spawnDecal,
            applyDamage: state.applyDamage,
            environmentalZones: []
        };
    }

    private static bindStateCallbacks(ctx: SetupContext, sectorCtx: SectorContext) {
        const { engine, session, state, callbacks, refs, props } = ctx;

        Object.assign(state.callbacks || (state.callbacks = {} as any), {
            t: callbacks.t,
            spawnParticle: callbacks.spawnParticle,
            spawnDecal: callbacks.spawnDecal,
            showDamageText: callbacks.showDamageText,
            setBubble: callbacks.setBubble,
            onTrigger: callbacks.onTrigger,
            onAction: (action: any) => {
                if (!action) return;
                // Delegate all logic (Stats, Healing, Rewards) to the authoritative GameSession context
                callbacks.onAction(action);
            },
            playSound: (id: SoundID) => audioEngine.playSound(id),
            resolveDynamicPos: (familyId?: number, ownerId?: string) => {
                if (familyId !== undefined) {
                    const members = refs.activeFamilyMembers.current;
                    for (let i = 0; i < members.length; i++) {
                        if (members[i].id === familyId) {
                            if (members[i].following) return null; // Don't trigger if following
                            return members[i].mesh.position;
                        }
                    }
                }
                if (ownerId && engine.scene) {
                    const obj = engine.scene.getObjectByName(ownerId);
                    if (obj) return obj.position;
                }
                return null;
            },
            gainXp: (amount: number) => callbacks.gainXp(amount),
            gainSp: (amount: number) => callbacks.gainSp(amount),
            gainScrap: (amount: number) => callbacks.gainScrap(amount),
            onPlayerHit: (damage: number, attacker: any, damageType: DamageType, damageSource: DamageID, isDoT?: boolean, effectType?: StatusEffectID, duration?: number, intensity?: number, specificAttackType?: EnemyAttackType) => {
                const statsSystem = session.getSystem<any>(SystemID.PLAYER_STATS);
                if (statsSystem) {
                    statsSystem.handlePlayerHit(session, damage, attacker, damageType, damageSource, isDoT, effectType, duration, intensity, specificAttackType);
                }
            },
            onDiscovery: (type: DiscoveryType, id: string, titleKey: string, detailsKey: string, payload?: any) => {
                // O(1) Optimization: Avoid React overhead if already found in this session or prior
                const sets = state.discoverySets;
                if (!sets) return;

                const isRespawnable = payload?.respawnable || false;
                const stats = state.sessionStats;
                let alreadyFound = false;

                // Replaced .some() and .includes() with Zero-GC for-loops
                switch (type) {
                    case DiscoveryType.CLUE: {
                        const clueSmi = DataResolver.resolveClueID(id);
                        if (clueSmi !== undefined) {
                            alreadyFound = sets.clues.has(clueSmi);
                            if (!alreadyFound) {
                                if (!isRespawnable) sets.clues.add(clueSmi);

                                let foundClue = false;
                                for (let i = 0; i < stats.cluesFound.length; i++) {
                                    const c = stats.cluesFound[i];
                                    if ((typeof c === 'string' ? c : c.id) === id) { foundClue = true; break; }
                                }
                                if (!isRespawnable && !foundClue) {
                                    stats.cluesFound.push(id as string);
                                }
                            }
                        }
                        break;
                    }

                    case DiscoveryType.POI: {
                        const poiSmi = DataResolver.resolvePoiID(id);
                        if (poiSmi !== undefined) {
                            alreadyFound = sets.pois.has(poiSmi);
                            if (!alreadyFound) {
                                if (!isRespawnable) sets.pois.add(poiSmi);

                                let foundPOI = false;
                                for (let i = 0; i < stats.discoveredPOIs.length; i++) {
                                    if (stats.discoveredPOIs[i] === id) { foundPOI = true; break; }
                                }
                                if (!isRespawnable && !foundPOI) {
                                    stats.discoveredPOIs.push(id);
                                }
                            }
                        }
                        break;
                    }

                    case DiscoveryType.COLLECTIBLE: {
                        const colSmi = DataResolver.resolveCollectibleID(id);
                        if (colSmi !== undefined) {
                            alreadyFound = sets.collectibles.has(colSmi);
                            if (!alreadyFound) {
                                if (!isRespawnable) sets.collectibles.add(colSmi);

                                let foundCol = false;
                                for (let i = 0; i < stats.collectiblesDiscovered.length; i++) {
                                    if (stats.collectiblesDiscovered[i] === id) { foundCol = true; break; }
                                }
                                if (!isRespawnable && !foundCol) {
                                    stats.collectiblesDiscovered.push(id);
                                }
                            }
                        }
                        break;
                    }
                }

                // First time discovery awards SP (Plan overhaul)
                // Skip SP and persistence if it's a respawnable item, but still show the screen if it's the "first time" in this context
                // Actually, if it's respawnable, we ALWAYS want to show the screen (alreadyFound = false for UI)
                const shouldShowUI = !alreadyFound || isRespawnable;

                if (shouldShowUI) {
                    // Only award SP and save if NOT respawnable and NOT already found, and is an SP-awarding discovery
                    const awardsSp = type === DiscoveryType.CLUE || type === DiscoveryType.POI || type === DiscoveryType.COLLECTIBLE;
                    if (awardsSp && !alreadyFound && !isRespawnable) {
                        // Update live DOD buffer and telemetry via unified callback
                        callbacks.gainSp(1);

                        // Authoritative Sector-Specific Recalculation (Immune to double-registration!)
                        const currentSector = sectorCtx.sectorId;

                        if (type === DiscoveryType.CLUE) {
                            let cCount = 0;
                            if (state.discoverySets?.clues) {
                                for (const cid of state.discoverySets.clues) {
                                    const resolved = DataResolver.resolveClueID(cid);
                                    if (resolved !== undefined && CLUES[resolved]?.sector === currentSector) cCount++;
                                }
                            }
                            const thisClueSmi = DataResolver.resolveClueID(id);
                            if (thisClueSmi !== undefined && (!state.discoverySets?.clues || !state.discoverySets.clues.has(thisClueSmi))) {
                                if (CLUES[thisClueSmi]?.sector === currentSector) cCount++;
                            }
                            HudStore.patch({ cluesFoundCount: cCount });

                        } else if (type === DiscoveryType.POI) {
                            let poiCount = 0;
                            if (state.discoverySets?.pois) {
                                for (const pid of state.discoverySets.pois) {
                                    const resolved = DataResolver.resolvePoiID(pid);
                                    if (resolved !== undefined && POIS[resolved]?.sector === currentSector) poiCount++;
                                }
                            }
                            const thisPoiSmi = DataResolver.resolvePoiID(id);
                            if (thisPoiSmi !== undefined && (!state.discoverySets?.pois || !state.discoverySets.pois.has(thisPoiSmi))) {
                                if (POIS[thisPoiSmi]?.sector === currentSector) poiCount++;
                            }
                            HudStore.patch({ poisFoundCount: poiCount });

                        } else if (type === DiscoveryType.COLLECTIBLE) {
                            let colCount = 0;
                            if (state.discoverySets?.collectibles) {
                                for (const colid of state.discoverySets.collectibles) {
                                    const resolved = DataResolver.resolveCollectibleID(colid);
                                    if (resolved !== undefined && COLLECTIBLES[resolved]?.sector === currentSector) colCount++;
                                }
                            }
                            const thisColSmi = DataResolver.resolveCollectibleID(id);
                            if (thisColSmi !== undefined && (!state.discoverySets?.collectibles || !state.discoverySets.collectibles.has(thisColSmi))) {
                                if (COLLECTIBLES[thisColSmi]?.sector === currentSector) colCount++;
                            }
                            HudStore.patch({ collectiblesFoundCount: colCount });
                        }
                    }

                    if (callbacks.onDiscovery) {
                        // Pass specific payload if it's a collectible for the UI logic in App.tsx
                        callbacks.onDiscovery(type, id, titleKey, detailsKey, payload);
                    }

                    // Patch HudStore so DiscoveryPopup can pull the strings if needed
                    HudStore.patch({
                        discoveryTitle: titleKey,
                        discoveryDetails: detailsKey,
                        discoveryId: id,
                        discoveryType: type
                    });
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

                    const tracker = session.getSystem<any>(SystemID.DAMAGE_TRACKER);
                    if (tracker) {
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
        });
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
                    if (eff.type === SubEffectType.LIGHT) {
                        const light = new THREE.PointLight(eff.color, eff.intensity, eff.distance);
                        light.userData.intensity = eff.intensity;
                        light.userData.isCulled = false;
                        if (eff.offset) light.position.copy(eff.offset);
                        child.add(light);
                        if (eff.flicker) flickeringLights.push({ light, intensity: eff.intensity, flickerRate: 0.1 });
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
        // DO NOT wipe refs.activeFamilyMembers.current here! It was cleared at line 154
        // and may contain sector-specific family members added by SectorBuilder.
        const playerSpawn = currentSector.playerSpawn || { x: 0, y: 0, z: 0 };
        const fSpawn = currentSector.familySpawn;

        // Zero-GC arrays (replaced .filter)
        const rescuedIndices: number[] = [];
        const propIndices = props.rescuedFamilyIndices || [];
        for (let i = 0; i < propIndices.length; i++) {
            if (propIndices[i] < props.currentSector) {
                rescuedIndices.push(propIndices[i]);
            }
        }

        // Developer override
        if (props.debugMode && props.currentSector >= SectorID.MOUNTAIN_VAULT && rescuedIndices.length === 0) {
            for (let i = 0; i < props.currentSector; i++) {
                let found = false;
                for (let j = 0; j < rescuedIndices.length; j++) {
                    if (rescuedIndices[j] === i) { found = true; break; }
                }
                if (!found) rescuedIndices.push(i);
            }
        }

        if (rescuedIndices.length > 0) {
            for (let i = 0; i < rescuedIndices.length; i++) {
                const idx = rescuedIndices[i];
                const fmId = DataResolver.getSectorFamilyMemberId(idx);

                if (fmId !== undefined) {
                    const fmData = FAMILY_MEMBERS[fmId];
                    if (fmData) {
                        const mesh = ModelFactory.createFamilyMember(fmData);
                        mesh.position.set(playerSpawn.x + (Math.random() - 0.5) * 5, 0, playerSpawn.z + 5 + Math.random() * 5);
                        this.addFamilyMarker(mesh, fmData, scene);

                        let ring = null;
                        for (let c = 0; c < mesh.children.length; c++) {
                            if (mesh.children[c].userData.isRing) { ring = mesh.children[c]; break; }
                        }

                        // Removed .clone() on position.
                        refs.activeFamilyMembers.current.push({ mesh, found: true, following: true, rescued: true, name: fmData.name, id: fmData.id, scale: fmData.scale, seed: Math.random() * 100, ring, spawnPos: new THREE.Vector3(mesh.position.x, mesh.position.y, mesh.position.z) });
                    }
                }
            }
        }

        let hasRescuedCurrent = false;
        for (let i = 0; i < rescuedIndices.length; i++) {
            if (rescuedIndices[i] === props.currentSector) { hasRescuedCurrent = true; break; }
        }

        if (!props.familyAlreadyRescued) {
            const fmId = DataResolver.getSectorFamilyMemberId(props.currentSector);
            if (!hasRescuedCurrent && fmId !== undefined) {
                const fmData = FAMILY_MEMBERS[fmId];
                if (fmData) {
                    // Check if SectorBuilder already added them
                    let existingFM = null;
                    const fmArr = refs.activeFamilyMembers.current;
                    for (let i = 0; i < fmArr.length; i++) {
                        if (fmArr[i].id === fmId) { existingFM = fmArr[i]; break; }
                    }

                    if (existingFM) {
                        refs.familyMemberRef.current = existingFM;
                    } else {
                        const mesh = ModelFactory.createFamilyMember(fmData);
                        if (fSpawn) {
                            mesh.position.set(fSpawn.x, 0, fSpawn.z);
                            if (fSpawn.y) mesh.position.y = fSpawn.y;
                        } else {
                            mesh.position.set(0, -1000, 0); // Hide if no spawn defined
                            mesh.visible = false;
                        }
                        this.addFamilyMarker(mesh, fmData, scene);

                        let ring = null;
                        for (let c = 0; c < mesh.children.length; c++) {
                            if (mesh.children[c].userData.isRing) { ring = mesh.children[c]; break; }
                        }

                        // Removed .clone() on position.
                        const currentFM = { mesh, found: false, following: false, rescued: false, name: fmData.name, id: fmData.id, scale: fmData.scale, seed: Math.random() * 100, ring, spawnPos: new THREE.Vector3(mesh.position.x, mesh.position.y, mesh.position.z) };
                        refs.activeFamilyMembers.current.push(currentFM);
                        refs.familyMemberRef.current = currentFM;
                    }
                }
            }
        }
    }

    private static setupSystems(ctx: SetupContext, playerGroup: THREE.Group, sectorCtx: SectorContext, triggerSystem: TriggerSystem) {
        const { engine, session, state, callbacks, refs, props, ui } = ctx;

        if (engine.water) {
            engine.water.setPlayerRef(playerGroup);
            engine.water.setCallbacks({
                spawnParticle: (x, y, z, type, count) => callbacks.spawnParticle(x, y, z, type, count),
                makeNoise: (pos, type, rad) => session.makeNoise(pos, type as NoiseType, rad)
            });
        }

        session.addSystem(new DamageNumberSystem(engine.scene));
        session.addSystem(new DamageTrackerSystem());
        session.addSystem(new ChallengeSystem());
        session.addSystem(new ProjectileSystem());
        session.addSystem(new ParticleSystem());

        // --- PHASE 10: ZERO-GC PARTICLE RENDERER ---
        const particleRenderer = new ParticleRenderer(engine.scene);
        engine.onPreRender = () => {
            particleRenderer.render();
        };

        const detectionSys = new EnemyDetectionSystem();
        session.addSystem(detectionSys);
        session.detectionSystem = detectionSys;

        // Register the SoA TriggerSystem
        session.triggerSystem = triggerSystem;
        if (state.worldStreamer) {
            session.triggerSystem.setStreamer(state.worldStreamer);
        }
        session.addSystem(session.triggerSystem);

        // [VINTERDÖD] Batch register buffered triggers from construction phase
        if (sectorCtx.triggers && sectorCtx.triggers.length > 0) {
            session.triggerSystem.addTriggers(sectorCtx.triggers);
        }

        // Register passive global managers in the system registry
        engine.registerSystem(SystemID.ENEMY_MANAGER, EnemyManager);
        engine.registerSystem(SystemID.HUD, HudSystem);

        const playerStatsSystem = new PlayerStatsSystem(playerGroup, callbacks.t, refs.activeFamilyMembers);
        session.addSystem(playerStatsSystem);
        session.addSystem(new PerkSystem(playerGroup, refs.activeFamilyMembers));
        PerkFX.init(playerGroup);

        session.addSystem(new PlayerMovementSystem(playerGroup));
        session.addSystem(new VehicleMovementSystem(playerGroup));
        session.addSystem(new PlayerCombatSystem(playerGroup));
        session.addSystem(new InteractionSystem(
            playerGroup, callbacks.concludeSector, sectorCtx.collectibles, refs.activeFamilyMembers, engine.scene,
            (id, respawnable) => {
                if (callbacks.onDiscovery) {
                    const col = DataResolver.getCollectibles()[id];
                    if (col) {
                        callbacks.onDiscovery(DiscoveryType.COLLECTIBLE, col.id, 'ui.discovered_collectible', `collectibles.${col.id}.title`, { respawnable });
                    }
                }
            }
        ));

        session.addSystem(new EnemySystem({
            setBubble: callbacks.setBubble,
            gainXp: callbacks.gainXp,
            t: callbacks.t,
            onBossKilled: (id: number) => {
                let seen = false;
                for (let j = 0; j < state.bossesDefeated.length; j++) {
                    if (state.bossesDefeated[j] === id) { seen = true; break; }
                }
                if (!seen) state.bossesDefeated.push(id);
                state.bossDefeatedTime = engine.simTime;
                state.familyFound = true;

                // Immediate SP/State updates via App.tsx props
                if (props.onBossKilled) props.onBossKilled(id);

                const currentFM = refs.familyMemberRef.current;
                if (currentFM && !currentFM.rescued) {
                    currentFM.rescued = true;
                    // Trigger immediate family rescue callback
                    if (props.onFamilyRescued) props.onFamilyRescued(currentFM.id);
                }

                audioEngine.stopMusic();
                const curSector = (props as any).currentSectorData || SectorSystem.getSector(props.currentSector || 0);
                if (curSector?.ambientLoop) audioEngine.playMusic(curSector.ambientLoop);
            },
            onPlayerHit: (damage: number, attacker: any, damageType: DamageType, damageSource: DamageID, isDoT?: boolean, effectType?: StatusEffectID, duration?: number, intensity?: number, specificAttackType?: EnemyAttackType) =>
                playerStatsSystem.handlePlayerHit(session, damage, attacker, damageType, damageSource, isDoT, effectType, duration, intensity, specificAttackType),
        } as any, INITIAL_ENEMY_POOL));

        session.addSystem(new SectorSystem(playerGroup, props.currentSector, {
            setBubble: (text: string, duration?: number) => {
                callbacks.setBubble(text, duration || 3000);
            },
            t: callbacks.t,
            spawnParticle: callbacks.spawnParticle,
            startCinematic: callbacks.startCinematic,
            setInteraction: callbacks.setInteraction,

            playSound: (id: SoundID) => audioEngine.playSound(id),
            playTone: (freq: number, type: ToneType, duration: number, vol?: number) => { },
            cameraShake: (amount: number) => engine.camera.shake(amount), scene: engine.scene,
            setCameraOverride: (params: any) => { refs.cameraOverrideRef.current = params; engine.camera.setCinematic(!!params); },
            makeNoise: (pos: THREE.Vector3, type: NoiseType, radius: number) => session.makeNoise(pos, type, radius),
            spawnZombie: (type: EnemyType, pos?: THREE.Vector3) => callbacks.spawnZombie(type, pos),
            spawnHorde: (count: number, type?: EnemyType, pos?: THREE.Vector3) => sectorCtx.spawnHorde(count, type, pos),
            setOverlay: ui.setOverlay,
            onAction: (action: any) => callbacks.onAction(action),
            gainXp: (amount: number) => callbacks.gainXp(amount),
            gainSp: (amount: number) => callbacks.gainSp(amount),
            gainScrap: (amount: number) => callbacks.gainScrap(amount),
            onDiscovery: (type: any, id: string, titleKey: string, detailsKey: string, payload?: any) => {
                // Bridge to the GameSessionSetup internal onDiscovery logic if needed, 
                // or just call the props/callbacks version.
                if (callbacks.onDiscovery) {
                    callbacks.onDiscovery(type, id, titleKey, detailsKey, payload);
                    return true;
                }
                return false;
            },
            onPlayerHit: (damage: number, attacker: any, damageType: DamageType, damageSource: DamageID, isDoT?: boolean, effectType?: StatusEffectID, duration?: number, intensity?: number, specificAttackType?: EnemyAttackType) => {
                const statsSystem = session.getSystem<any>(SystemID.PLAYER_STATS);
                if (statsSystem) {
                    statsSystem.handlePlayerHit(session, damage, attacker, damageType, damageSource, isDoT, effectType, duration, intensity, specificAttackType);
                }
            },
            applyDamage: (enemy: any, amount: number, damageType: DamageType, damageSource: DamageID, isHighImpact?: boolean) => {
                return state.applyDamage(enemy, amount, damageType, damageSource, isHighImpact);
            }
        }));

        session.addSystem(new LootSystem(playerGroup, engine.scene, { gainScrap: callbacks.gainScrap }));

        session.addSystem(new FamilySystem(playerGroup, refs.activeFamilyMembers, refs.cinematicRef, {
            setFoundMember: (id: FamilyMemberID) => ctx.ui.setFoundMember && ctx.ui.setFoundMember(id)
        }));

        session.addSystem(new CinematicSystem({
            cinematicRef: refs.cinematicRef, camera: engine.camera as any, playerMeshRef: refs.playerMeshRef as any,
            bubbleRef: refs.bubbleRef, activeFamilyMembers: refs.activeFamilyMembers,
            callbacks: {
                setCurrentLine: ui.setCurrentLine,
                setCinematicActive: ui.setCinematicActive,
                endCinematic: callbacks.endCinematic,
                playCinematicLine: callbacks.playCinematicLine,
                onAction: callbacks.onAction
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
    private static resetPlayerVisuals(root: THREE.Object3D, color: number) {
        const _white = new THREE.Color(color);
        root.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
                const mesh = child as THREE.Mesh;
                if (mesh.material && (mesh.material as any).color) {
                    (mesh.material as any).color.copy(_white);
                }
            }
        });
    }

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
    static respawnPlayer(session: GameSessionLogic, engine: WinterEngine, state: RuntimeState, refs: any, props: any, setDeathPhase: (phase: DeathPhase) => void) {
        const scene = engine.scene;

        // --- 1. RESET PLAYER STATE (DOD / Zero-GC) ---
        // --- STATUS & EFFECT RESET (Zero-GC Clean Slate) ---
        state.statusFlags = PlayerStatusFlags.NONE; // Reset all flags (Dead, Airborne, etc.)
        state.hudVisible = true;
        refs.deathPhaseRef.current = DeathPhase.NONE;
        state.playerDeathState = PlayerDeathState.ALIVE;
        state.statsBuffer[PlayerStatID.HP] = state.statsBuffer[PlayerStatID.MAX_HP];
        state.statsBuffer[PlayerStatID.STAMINA] = state.statsBuffer[PlayerStatID.MAX_STAMINA];
        state.isReloading = false;
        state.isInteractionOpen = false;
        state.vehicle.active = false;
        state.vehicle.mesh = null;
        state.vehicle.speed = 0;

        // --- 1.1 RESET VISUALS (VINTERDÖD FIX) ---
        const playerGroup = refs.playerGroupRef.current;
        const playerMesh = refs.playerMeshRef.current;
        if (playerMesh) {
            playerMesh.visible = true;
            const baseScale = playerMesh.userData.baseScale || 1.0;
            playerMesh.scale.setScalar(baseScale);
            playerMesh.rotation.set(0, 0, 0);

            // Reset material colors (Reversing the "Burned" look)
            this.resetPlayerVisuals(playerMesh, PLAYER_CHARACTER.color.num);
        }

        if (playerGroup) {
            playerGroup.visible = true;
        }

        // Reset Persistent Visual Flags
        state.playerBloodSpawned = false;
        state.playerAshSpawned = false;
        state.hasLastTrailPos = false;
        state.lastBiteTime = 0;
        state.vehicle.engineState = VehicleEngineState.OFF;

        // Reset Numeric Effect Buffers (Zero-GC: Filling contiguous arrays with 0)
        state.effectDurations.fill(0);
        state.effectIntensities.fill(0);

        // Clear Dynamic Status Effect Collections
        state.activePassivesCount = 0;
        state.activeBuffsCount = 0;
        state.activeDebuffsCount = 0;
        state.fireZoneCount = 0;

        // Reset Killer Metadata
        state.killedByEnemy = false;
        state.killerType = DamageType.NONE;
        state.killerName = '';
        state.killerAttackName = '';
        state.incomingDamageBuffer.fill(0);

        // Zero-out contiguous status arrays
        state.activePassives.fill(0);
        state.activeBuffs.fill(0);
        state.activeDebuffs.fill(0);

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
        const perkSystem = engine.getSystem<any>(SystemID.PERK_SYSTEM);
        if (perkSystem) {
            // Corrected method name to match PerkSystem.ts implementation (refreshBaseStats)
            if (perkSystem.refreshBaseStats) {
                perkSystem.refreshBaseStats(session);
            }
        }

        // --- 4. SYSTEM CLEARING ---
        ProjectileSystem.clear(scene, state.projectiles, state.fireZones);
        FXSystem.reset();
        session.triggerSystem.resetTriggerStates();
        EnemyManager.clear();

        // --- 5. CLEAR DYNAMIC OBJECTS ---
        this.clearDynamicNodes(scene);

        // --- 6. SECTOR DATA ---
        const currentSectorData = (props as any).currentSectorData || SectorSystem.getSector(props.currentSector || 0);
        const currentSectorId = props.currentSector || 0;
        const currentFMId = DataResolver.getSectorFamilyMemberId(currentSectorId);

        // --- 6.1 RESET FAMILY MEMBERS (VINTERDÖD FIX) ---
        // Ensure unrescued members don't follow and previously rescued members are positioned correctly.
        const fmArr = refs.activeFamilyMembers.current;
        for (let i = 0; i < fmArr.length; i++) {
            const fm = fmArr[i];
            if (fm.id === currentFMId) {
                // Current sector's member MUST be reset to un-rescued state
                fm.following = false;
                fm.rescued = false;
                fm.found = false;
                if (fm.mesh) {
                    fm.mesh.visible = (fm.spawnPos && fm.spawnPos.y > -500);
                    if (fm.spawnPos) fm.mesh.position.copy(fm.spawnPos);
                    else fm.mesh.position.set(0, -1000, 0);
                }
            } else {
                // Previously rescued members keep following but reset position to player cluster
                fm.following = true;
                fm.rescued = true;
                if (fm.mesh) {
                    fm.mesh.visible = true;
                    fm.mesh.position.copy(playerGroup.position);
                    fm.mesh.position.x += (Math.random() - 0.5) * 4;
                    fm.mesh.position.z += 5 + Math.random() * 2;
                }
            }
        }

        // 6.2 RESPAWN ZOMBIES
        const sCtx = refs.sectorContextRef.current;
        if (sCtx && currentSectorData.setupZombies) {
            currentSectorData.setupZombies(sCtx);
        }

        // 6.2 PLAYER & FAMILY MEMBER POSITIONING
        if (refs.playerGroupRef.current) {
            const spawn = currentSectorData.playerSpawn || { x: 0, y: 0, z: 0 };
            refs.playerGroupRef.current.position.set(spawn.x || 0, spawn.y || 0, spawn.z || 0);
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

        setDeathPhase(DeathPhase.NONE);
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

        const toRemove: THREE.Object3D[] = [];
        engine.scene.traverse(obj => {
            if (obj.userData?.generated || obj.userData?.isEnemy || obj.userData?.isPlayer) {
                toRemove.push(obj);
            }
        });

        // Zero-GC Loop instead of forEach
        for (let i = 0; i < toRemove.length; i++) {
            const obj = toRemove[i];
            if (obj.parent) obj.parent.remove(obj);
        }

        // Zero-GC Arrays reset
        state.enemies.length = 0;
        state.obstacles.length = 0;
        state.chests.length = 0;
        ctx.session.triggerSystem.clear();
        state.bloodDecals.length = 0;

        state.statusFlags &= ~PlayerStatusFlags.DEAD;
        state.statsBuffer[PlayerStatID.HP] = state.statsBuffer[PlayerStatID.MAX_HP];
        state.statsBuffer[PlayerStatID.STAMINA] = state.statsBuffer[PlayerStatID.MAX_STAMINA];

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

        await this.runSectorSetup(ctx, currentSetupId);

        ui.setDeathPhase(DeathPhase.NONE);
    }

    static disposeSector(session: GameSessionLogic, state: RuntimeState) {
        EnemyManager.clear();
        ChunkManager.clear();
        AssetLoader.getInstance().clearCache();

        const engine = WinterEngine.getInstance();
        // Idempotent disablement.
        // Only disable input if this session is the one currently driving the engine.
        // This prevents a "late" cleanup from disabling input for a newly mounted sector.
        if (engine.onUpdateContext === session) {
            engine.input.disable();
        }
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