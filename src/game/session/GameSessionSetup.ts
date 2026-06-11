import * as THREE from 'three';
import { TriggerSystem } from '../../systems/TriggerSystem';
import { GameCanvasProps } from '../../types/CanvasTypes';
import { MapItem, DiscoveryType } from '../../components/ui/hud/HudTypes';
import { DeathPhase } from '../../types/SessionTypes';
import { SectorBuildContext, BossID, SectorID } from '../../game/session/SectorTypes';
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
import { FAMILY_MEMBERS, CAMERA_HEIGHT, BOSSES, PLAYER, FamilyMemberID, INITIAL_ENEMY_POOL, MAX_ENTITIES } from '../../content/constants';
import { ModelFactory, createProceduralTextures } from '../../utils/assets';
import { SubEffectType } from '../../systems/EffectManager';
import { StatID, PlayerStatusFlags } from '../../types/CareerStats';
import { PlayerDeathState, DamageID, DamageType, EnemyAttackType } from '../../entities/player/CombatTypes';
import { StatusEffectID } from '../../types/StatusEffects';
import { SoundID, ToneType, MusicID } from '../../utils/audio/AudioTypes';
import { TriggerType, TriggerActionType, TriggerStatus } from '../../types/TriggerTypes';
import { audioEngine } from '../../utils/audio/AudioEngine';
import { WEAPONS } from '../../content/weapons';
import { PlayerMovementSystem } from '../../systems/PlayerMovementSystem';
import { VehicleMovementSystem } from '../../systems/VehicleMovementSystem';
import { PlayerCombatSystem } from '../../systems/PlayerCombatSystem';
import { PlayerStatsSystem } from '../../systems/PlayerStatsSystem';
import { PlayerManager } from '../../systems/PlayerManager';
import { LootSystem } from '../../systems/LootSystem';
import { InteractionSystem } from '../../systems/InteractionSystem';
import { EnemySystem } from '../../systems/EnemySystem';
import { SectorSystem } from '../../systems/SectorSystem';
import { FamilySystem } from '../../systems/FamilySystem';
import { CinematicSystem } from '../../systems/CinematicSystem';
import { DeathSystem } from '../../systems/DeathSystem';
import { DataResolver } from '../../core/data/DataResolver';
import { CombatEngine } from './CombatEngine';
import { HudStore } from '../../store/HudStore';
import { CareerStatsSystem } from '../../systems/CareerStatsSystem';
import { EnemyWaveSystem } from '../../systems/EnemyWaveSystem';
import { EnemyDetectionSystem } from '../../systems/EnemyDetectionSystem';
import { ChallengeSystem } from '../../systems/ChallengeSystem';
import { HudSystem } from '../../systems/HudSystem';
import { GameSessionState } from './GameSessionState';
import { CLUES } from '../../content/clues';
import { POIS } from '../../content/pois';
import { COLLECTIBLES } from '../../content/collectibles';
import { GEOMETRY, MATERIALS } from '../../utils/assets';
import { PerkFX } from '../../systems/PerkFX';
import { PerkSystem } from '../../systems/PerkSystem';
import { DiscoverySystem } from '../../systems/DiscoverySystem';
import { WorldStreamer } from '../../core/world/WorldStreamer';

const seededRandom = (seed: number) => {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return () => { return (s = s * 16807 % 2147483647) / 2147483647; };
};

export interface SetupContext {
    engine: WinterEngine;
    session: GameSessionLogic;
    state: GameSessionState;
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
        endSector: (isCompleted: boolean) => void;
        onSectorLoaded?: () => void;
        onTrigger: (type: TriggerType, duration: number) => void;
        onBossKilled: (id: number) => void;
        onAction: (action: any) => void;
        spawnHorde: (count: number, type?: EnemyType, pos?: THREE.Vector3) => void;
        playSound: (id: SoundID) => void;
        setInteraction: (interaction: any) => void;
        collectedCluesRef: any;

        onDiscovery?: (type: DiscoveryType, id: string, titleKey: string, detailsKey: string, payload?: any) => void;
        rewardXP: (amount: number) => void;
        rewardSP: (amount: number) => void;
        rewardScrap: (amount: number) => void;
        handlePlayerHit?: (damage: number, attacker: any, damageType: DamageType, damageSource: DamageID, isDoT?: boolean, effectType?: StatusEffectID, duration?: number, intensity?: number, specificAttackType?: EnemyAttackType) => boolean;
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

        // Purge Triggers to prevent sector pollution
        if (session.systems.triggerSystem) {
            session.systems.triggerSystem.clear();
        }

        let sectorLoaded = false;

        try {
            // Ensure sector definition is in cache — may be cold on fresh save / first Prologue load
            let currentSector = (props as any).currentSectorData || SectorSystem.getSector(props.gameState.currentSector || 0);
            if (!currentSector) {
                console.warn(`[GameSessionSetup] Sector ${props.gameState.currentSector} not in cache — loading now.`);
                currentSector = await SectorSystem.loadSector(props.gameState.currentSector || 0);
            }
            state.world.sectorName = currentSector.name || DataResolver.getSectorName(currentSector.id);

            if (currentSector.aimDirection) {
                state.player.aimDirection.x = currentSector.aimDirection.x;
                state.player.aimDirection.y = currentSector.aimDirection.y;
            }

            const rng = seededRandom(props.gameState.currentSector + 4242);

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
            const dynamicLights: any[] = [];
            const textures = createProceduralTextures();

            const triggerSystem = new TriggerSystem(MAX_ENTITIES.TRIGGERS);
            session.systems.triggerSystem = triggerSystem;

            const worldStreamer = new WorldStreamer();
            session.systems.worldStreamer = worldStreamer;

            // Attach the streamer to the TriggerSystem so generation can add triggers to it
            triggerSystem.setStreamer(worldStreamer);

            // 2. Setup Player & Camera
            const playerGroup = this.setupPlayerAndCamera(engine, currentSector, refs, state);
            refs.playerGroupRef.current = playerGroup;
            (session as any).playerGroup = playerGroup;

            // 3. Create Sector Context
            refs.activeFamilyMembers.current.length = 0;
            const sectorBuildContext = this.createSectorBuildContext(ctx, currentSector, textures, dynamicLights, burningObjects, mapItems, rng, playerGroup, yielder);
            refs.SectorBuildContextRef.current = sectorBuildContext;
            session.sectorCtx = sectorBuildContext;

            // 4. Bind State Callbacks
            this.bindStateCallbacks(ctx, sectorBuildContext);

            PathGenerator.resetPathLayer();
            const setupStart = performance.now();
            console.info(`[SectorBuilder] ▶ START building sector ${props.gameState.currentSector} [LIVE]`);

            performance.mark('build-start');
            await SectorBuilder.build(sectorBuildContext, currentSector);
            performance.mark('build-end');
            performance.measure('Sector Build', 'build-start', 'build-end');

            console.info(`[SectorBuilder] ✅ DONE building sector ${props.gameState.currentSector} [LIVE] in ${(performance.now() - setupStart).toFixed(1)}ms`);

            if (!isMounted.current || setupIdRef.current !== currentSetupId) return;
            await yielder();

            // 5. Finalize limits and parse effects
            this.finalizeStateLimits(state, mapItems, dynamicLights, scene, sectorBuildContext);
            await yielder();

            // 6. Setup Family Members
            this.setupFamily(currentSector, props, refs, scene);
            await yielder();

            // 7. Initialize Systems
            this.setupSystems(ctx, playerGroup, sectorBuildContext, triggerSystem);


            await yielder();

            // --- VINTERDÖD FIX: BYPASS INTRO TRIGGERS ---
            // If the sector is already cleared, mark the intro triggers as completed
            if (state.world.familyAlreadyRescued || state.enemies.bossPermanentlyDefeated) {
                const triggers = ctx.session.systems.triggerSystem;
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
            engine.light.rebuildBuckets(sectorBuildContext.dynamicLights);
            state.world.lights.push(...sectorBuildContext.dynamicLights);

            // If we are building LIVE (not warmup), activate systems immediately.
            if (!props.isWarmup) {
                await this.activateSector(sectorBuildContext, currentSector);
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
    static async activateSector(ctx: SectorBuildContext, def: any) {
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

        // Orchestrate the transition via the authoritative engine pipeline.
        engine.mountScene(engine.scene, env, undefined, !!isWarmup);
    }

    private static setupPlayerAndCamera(engine: WinterEngine, currentSector: any, refs: any, state: GameSessionState) {
        const playerGroup = ModelFactory.createPlayer();
        refs.playerGroupRef.current = playerGroup;

        // Single source of truth link: make the state's position vector refer directly to the 3D group's position vector
        state.player.position = playerGroup.position;

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
        state.player.baseScale = bodyMesh.userData.baseScale !== undefined ? bodyMesh.userData.baseScale : 1.0;
        state.player.baseY = bodyMesh.userData.baseY !== undefined ? bodyMesh.userData.baseY : 0;

        // Cache Equipment Nodes for O(1) access
        state.player.nodes.gun = bodyMesh.getObjectByName('gun') || null;
        state.player.nodes.laserSight = bodyMesh.getObjectByName('laserSight') as THREE.Mesh || null;

        // Find or create barrel tip (Combat optimization)
        if (state.player.nodes.gun) {
            state.player.nodes.barrelTip = state.player.nodes.gun.getObjectByName('barrelTip') || null;
            if (!state.player.nodes.barrelTip) {
                // If not defined in geometry, we place it at the muzzle end
                const tip = new THREE.Object3D();
                tip.name = 'barrelTip';
                tip.position.set(0, 0, 0.5); // Standard forward offset for our Gun box
                state.player.nodes.gun.add(tip);
                state.player.nodes.barrelTip = tip;
            }
        }

        if (engine.input?.state) {
            engine.input.state.aimVector.copy(state.player.aimDirection);
        }

        // Prevent NaN poisoning if sector data is missing spawn coordinates
        const spawn = currentSector.playerSpawn || { x: 0, y: 0, z: 0 };
        playerGroup.position.set(spawn.x || 0, spawn.y || 0, spawn.z || 0);
        if (spawn.rot) playerGroup.rotation.y = spawn.rot;

        const flashlight = ModelFactory.createFlashlight();
        playerGroup.add(flashlight);
        playerGroup.add(flashlight.target);
        refs.flashlightRef.current = flashlight;
        state.ui.flashlightOn = true;

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

    private static createSectorBuildContext(ctx: SetupContext, currentSector: any, textures: any, dynamicLights: any[], burningObjects: any[], mapItems: MapItem[], rng: () => number, playerGroup: THREE.Group, yielder: () => Promise<void>): SectorBuildContext {
        const { engine, state, props, callbacks } = ctx;

        const spawnHorde = (count: number, type?: EnemyType, pos?: THREE.Vector3) => {
            const startPos = pos || playerGroup.position;
            EnemyManager.spawnHorde(engine.scene, startPos, count, state.enemies.bossSpawned, state.enemies.pool.length, type, false, (e) => {
                state.enemies.pool.push(e);
            });
        };

        const realSpawnZombie = (forcedType?: EnemyType, forcedPos?: THREE.Vector3) => {
            const playerPos = playerGroup.position;
            const enemy = EnemyManager.spawn(engine.scene, playerPos, forcedType, forcedPos, state.enemies.bossSpawned, state.enemies.pool.length);
            if (enemy) state.enemies.pool.push(enemy);
            return enemy;
        };

        const spawnBoss = (bossId: BossID, pos?: THREE.Vector3) => {
            const pSpawn = currentSector.playerSpawn;
            const bossPos = pos || (currentSector.bossSpawn ? new THREE.Vector3(currentSector.bossSpawn.x, 0, currentSector.bossSpawn.z) : new THREE.Vector3(pSpawn.x || 0, 0, pSpawn.z || 0));
            const bossData = (BOSSES as any)[bossId];

            const boss = EnemyManager.spawnBoss(engine.scene, bossPos, bossData);
            if (boss) {
                state.enemies.pool.push(boss);
                state.enemies.bossSpawned = true;

                const seen = props.gameState.stats.discoveredBosses[bossId] === 1;
                if (!seen && callbacks.onDiscovery) {
                    callbacks.onDiscovery(DiscoveryType.BOSS as any, bossId as any, 'ui.discovered_boss', DataResolver.getBossName(bossId));
                }
            }
            return boss;
        };
        return {
            scene: engine.scene, engine, obstacles: state.world.obstacles, chests: state.world.chests,
            worldStreamer: ctx.session.systems.worldStreamer,
            dynamicLights, burningObjects, rng, mapItems, debugMode: props.gameState.settings.debugMode,
            interactables: [], triggers: [], sectorId: props.gameState.currentSector, smokeEmitters: [],
            sectorState: state.sectorState, state: state, activeFamilyMembers: ctx.refs.activeFamilyMembers.current, yield: yielder,
            textures, spawnZombie: realSpawnZombie, spawnHorde, spawnBoss, collectibles: [],
            makeNoise: (pos: THREE.Vector3, type: NoiseType, radius: number) => ctx.session.makeNoise(pos, type, radius),
            isWarmup: props.isWarmup,

            // --- VINTERDÖD FIX: Injecting the generic bridge into the sector events API ---
            onAction: callbacks.onAction,
            spawnParticle: callbacks.spawnParticle,
            spawnDecal: callbacks.spawnDecal,
            handleEnemyHit: state.handleEnemyHit,
            handlePlayerHit: callbacks.handlePlayerHit,
            environmentalZones: []
        };
    }

    private static bindStateCallbacks(ctx: SetupContext, sectorCtx: SectorBuildContext) {
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
            rewardXP: (amount: number) => callbacks.rewardXP(amount),
            rewardSP: (amount: number) => callbacks.rewardSP(amount),
            rewardScrap: (amount: number) => callbacks.rewardScrap(amount),
            handlePlayerHit: (damage: number, attacker: any, damageType: DamageType, damageSource: DamageID, isDoT?: boolean, effectType?: StatusEffectID, duration?: number, intensity?: number, specificAttackType?: EnemyAttackType) => {
                return CombatEngine.handlePlayerHit(session, damage, attacker, damageType, damageSource, isDoT, effectType, duration, intensity, specificAttackType);
            },
            onDiscovery: (type: DiscoveryType, id: string, titleKey: string, detailsKey: string, payload?: any) => {
                // O(1) Optimization: Avoid React overhead if already found in this session or prior
                const careerStats = state.careerStats;
                if (!careerStats) return;

                const isRespawnable = payload?.respawnable || false;
                let alreadyFound = false;

                // Replaced .some() and .includes() with Zero-GC for-loops
                switch (type) {
                    case DiscoveryType.CLUE: {
                        const clueSmi = DataResolver.resolveClueID(id);
                        if (clueSmi !== undefined && careerStats.discoveredClues) {
                            alreadyFound = careerStats.discoveredClues[clueSmi] === 1;
                            if (!alreadyFound && !isRespawnable) {
                                careerStats.discoveredClues[clueSmi] = 1;
                            }
                        }
                        break;
                    }

                    case DiscoveryType.POI: {
                        const poiSmi = DataResolver.resolvePoiID(id);
                        if (poiSmi !== undefined && careerStats.discoveredPois) {
                            alreadyFound = careerStats.discoveredPois[poiSmi] === 1;
                            if (!alreadyFound && !isRespawnable) {
                                careerStats.discoveredPois[poiSmi] = 1;
                            }
                        }
                        break;
                    }

                    case DiscoveryType.COLLECTIBLE: {
                        const colSmi = DataResolver.resolveCollectibleID(id);
                        if (colSmi !== undefined && careerStats.discoveredCollectibles) {
                            alreadyFound = careerStats.discoveredCollectibles[colSmi] === 1;
                            if (!alreadyFound && !isRespawnable) {
                                careerStats.discoveredCollectibles[colSmi] = 1;
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
                        callbacks.rewardSP(1);

                        // Authoritative Sector-Specific Recalculation (Immune to double-registration!)
                        const currentSector = sectorCtx.sectorId;

                        if (type === DiscoveryType.CLUE) {
                            let cCount = 0;
                            const clues = careerStats.discoveredClues;
                            if (clues) {
                                for (let i = 0; i < clues.length; i++) {
                                    if (clues[i] === 1) {
                                        const resolved = DataResolver.resolveClueID(i);
                                        if (resolved !== undefined && CLUES[resolved]?.sector === currentSector) cCount++;
                                    }
                                }
                            }
                            const thisClueSmi = DataResolver.resolveClueID(id);
                            if (thisClueSmi !== undefined && (!clues || clues[thisClueSmi] !== 1)) {
                                if (CLUES[thisClueSmi]?.sector === currentSector) cCount++;
                            }
                            HudStore.patch({ discoveredCluesCount: cCount });

                        } else if (type === DiscoveryType.POI) {
                            let poiCount = 0;
                            const pois = careerStats.discoveredPois;
                            if (pois) {
                                for (let i = 0; i < pois.length; i++) {
                                    if (pois[i] === 1) {
                                        const resolved = DataResolver.resolvePoiID(i);
                                        if (resolved !== undefined && POIS[resolved]?.sector === currentSector) poiCount++;
                                    }
                                }
                            }
                            const thisPoiSmi = DataResolver.resolvePoiID(id);
                            if (thisPoiSmi !== undefined && (!pois || pois[thisPoiSmi] !== 1)) {
                                if (POIS[thisPoiSmi]?.sector === currentSector) poiCount++;
                            }
                            HudStore.patch({ discoveredPoisCount: poiCount });

                        } else if (type === DiscoveryType.COLLECTIBLE) {
                            let colCount = 0;
                            const cols = careerStats.discoveredCollectibles;
                            if (cols) {
                                for (let i = 0; i < cols.length; i++) {
                                    if (cols[i] === 1) {
                                        const resolved = DataResolver.resolveCollectibleID(i);
                                        if (resolved !== undefined && COLLECTIBLES[resolved]?.sector === currentSector) colCount++;
                                    }
                                }
                            }
                            const thisColSmi = DataResolver.resolveCollectibleID(id);
                            if (thisColSmi !== undefined && (!cols || cols[thisColSmi] !== 1)) {
                                if (COLLECTIBLES[thisColSmi]?.sector === currentSector) colCount++;
                            }
                            HudStore.patch({ discoveredCollectiblesCount: colCount });
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
                const bdLen = state.enemies.bossesDefeated.length;
                for (let j = 0; j < bdLen; j++) {
                    if (state.enemies.bossesDefeated[j] === id) {
                        alreadyDefeated = true;
                        break;
                    }
                }

                if (!alreadyDefeated) {
                    state.enemies.bossesDefeated.push(id);
                    state.enemies.bossDefeatedTime = engine.simTime;

                    callbacks.onBossKilled(id);
                }
            },
            makeNoise: (pos: THREE.Vector3, type: NoiseType, radius: number) => session.makeNoise(pos, type, radius),
            collectedCluesRef: refs.collectedCluesRef
        });
    }

    private static finalizeStateLimits(state: GameSessionState, mapItems: MapItem[], dynamicLights: any[], scene: THREE.Scene, sectorCtx: SectorBuildContext) {
        state.world.mapItems = mapItems;

        const sb = state.player.statsBuffer;
        sb[StatID.MAX_HP] = (sb[StatID.MAX_HP] <= 0) ? 100 : Math.max(100, sb[StatID.MAX_HP]);
        sb[StatID.HP] = sb[StatID.MAX_HP];
        sb[StatID.MAX_STAMINA] = (sb[StatID.MAX_STAMINA] <= 0) ? 100 : Math.max(100, sb[StatID.MAX_STAMINA]);
        sb[StatID.STAMINA] = sb[StatID.MAX_STAMINA];
        sb[StatID.SPEED] = (sb[StatID.SPEED] <= 0) ? PLAYER.BASE_SPEED : Math.max(10.0, sb[StatID.SPEED]);

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
                        if (eff.flicker) dynamicLights.push({ light, intensity: eff.intensity, flickerRate: 0.1 });
                        light.castShadow = false;
                        light.shadow.autoUpdate = false;
                        light.shadow.mapSize.set(256, 256);
                        sectorCtx.dynamicLights.push(light);
                    }
                }
                activeEffects.push(child);
            }
        });
        state.world.activeEffects = activeEffects;
    }

    private static setupFamily(currentSector: any, props: GameCanvasProps, refs: any, scene: THREE.Scene) {
        // DO NOT wipe refs.activeFamilyMembers.current here! It was cleared at line 154
        // and may contain sector-specific family members added by SectorBuilder.
        const playerSpawn = currentSector.playerSpawn || { x: 0, y: 0, z: 0 };
        const fSpawn = currentSector.familySpawn;

        // Zero-GC arrays (replaced .filter)
        const propIndices = props.gameState.stats.rescuedFamilyIndices || [];
        const rescuedIndices = [...propIndices];
        for (let i = 0; i < propIndices.length; i++) {
            if (propIndices[i] >= props.gameState.currentSector) {
                const fmId = DataResolver.getSectorFamilyMemberId(propIndices[i]);
                if (fmId !== undefined) {
                    const idx = rescuedIndices.indexOf(propIndices[i]);
                    if (idx !== -1) rescuedIndices.splice(idx, 1);
                }
            }
        }

        // Developer override
        if (props.gameState.settings.debugMode && props.gameState.currentSector >= SectorID.MOUNTAIN_VAULT && rescuedIndices.length === 0) {
            for (let i = 0; i < props.gameState.currentSector; i++) {
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
            if (rescuedIndices[i] === props.gameState.currentSector) { hasRescuedCurrent = true; break; }
        }

        if (!props.familyAlreadyRescued) {
            const fmId = DataResolver.getSectorFamilyMemberId(props.gameState.currentSector);
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

    private static setupSystems(ctx: SetupContext, playerGroup: THREE.Group, sectorCtx: SectorBuildContext, triggerSystem: TriggerSystem) {
        const { engine, session, state, callbacks, refs, props, ui } = ctx;

        if (engine.water) {
            engine.water.setPlayerRef(playerGroup);
            engine.water.setCallbacks({
                spawnParticle: (x, y, z, type, count) => callbacks.spawnParticle(x, y, z, type, count),
                makeNoise: (pos, type, rad) => session.makeNoise(pos, type as NoiseType, rad)
            });
        }

        session.attachSystem(new CareerStatsSystem());
        session.attachSystem(new ChallengeSystem());
        session.attachSystem(new DiscoverySystem());
        session.attachSystem(new ParticleSystem());
        session.attachSystem(new EnemyWaveSystem());
        session.attachSystem(new DamageNumberSystem(engine.scene));

        // --- ZERO-GC PARTICLE RENDERER ---
        const particleRenderer = new ParticleRenderer(engine.scene);
        engine.onPreRender = () => {
            particleRenderer.render();
        };

        // TODO: should attachSystem not handle this automatically?
        // so it's enough with session.attachSystem(new EnemyDetectionSystem());
        const detectionSys = new EnemyDetectionSystem();
        session.detectionSystem = detectionSys;
        session.attachSystem(detectionSys);

        // TriggerSystem and WorldStreamer are already instantiated in runSectorSetup
        // so that SectorBuilder can populate them during generation.
        if (session.systems.worldStreamer) {
            session.attachSystem(session.systems.worldStreamer);
        }
        if (session.systems.triggerSystem) {
            session.attachSystem(session.systems.triggerSystem);
        }

        // Batch register buffered triggers from construction phase
        if (sectorCtx.triggers && sectorCtx.triggers.length > 0) {
            session.systems.triggerSystem.addTriggers(sectorCtx.triggers);
        }

        // Register passive global managers in the system registry
        engine.registerSystem(SystemID.ENEMY_MANAGER, EnemyManager);
        engine.registerSystem(SystemID.HUD, HudSystem);

        session.attachSystem(new PlayerStatsSystem(playerGroup, refs.distanceTraveledRef));
        session.attachSystem(new PlayerManager(playerGroup, refs.playerMeshRef, refs, refs.propsRef));
        session.attachSystem(new PerkSystem(playerGroup, refs.activeFamilyMembers));
        session.attachSystem(new ProjectileSystem());
        PerkFX.init(playerGroup);

        session.attachSystem(new PlayerMovementSystem(playerGroup));
        session.attachSystem(new VehicleMovementSystem(playerGroup));
        session.attachSystem(new PlayerCombatSystem(playerGroup));
        session.attachSystem(new InteractionSystem(
            playerGroup, callbacks.endSector, sectorCtx.collectibles, refs.activeFamilyMembers, engine.scene,
            (id, respawnable) => {
                if (callbacks.onDiscovery) {
                    const col = DataResolver.getCollectibles()[id];
                    if (col) {
                        callbacks.onDiscovery(DiscoveryType.COLLECTIBLE, col.id, 'ui.discovered_collectible', `collectibles.${col.id}.title`, { respawnable });
                    }
                }
            }
        ));

        session.attachSystem(new EnemySystem({
            setBubble: callbacks.setBubble,
            rewardXP: callbacks.rewardXP,
            t: callbacks.t,
            onBossKilled: (id: number) => {
                let seen = false;
                for (let j = 0; j < state.enemies.bossesDefeated.length; j++) {
                    if (state.enemies.bossesDefeated[j] === id) { seen = true; break; }
                }
                if (!seen) state.enemies.bossesDefeated.push(id);
                state.enemies.bossDefeatedTime = engine.simTime;
                state.world.familyFound = true;

                // Immediate SP/State updates via App.tsx props
                if (props.onBossKilled) props.onBossKilled(id);

                const currentFM = refs.familyMemberRef.current;
                if (currentFM && !currentFM.rescued) {
                    currentFM.rescued = true;
                    // Trigger immediate family rescue callback
                    if (props.onFamilyRescued) props.onFamilyRescued(currentFM.id);
                }

                // Stop boss growl loop if active
                if (refs.bossGrowlLoopIndexRef && refs.bossGrowlLoopIndexRef.current !== -1) {
                    audioEngine.stopVoice(refs.bossGrowlLoopIndexRef.current);
                    refs.bossGrowlLoopIndexRef.current = -1;
                }

                audioEngine.stopMusic();
                const curSector = (props as any).currentSectorData || SectorSystem.getSector(props.gameState.currentSector || 0);
                const loopId = curSector.ambientLoop || MusicID.GAMEPLAY_TENSE;
                audioEngine.playMusic(loopId);
            },
            handlePlayerHit: (damage: number, attacker: any, damageType: DamageType, damageSource: DamageID, isDoT?: boolean, effectType?: StatusEffectID, duration?: number, intensity?: number, specificAttackType?: EnemyAttackType) =>
                CombatEngine.handlePlayerHit(session, damage, attacker, damageType, damageSource, isDoT, effectType, duration, intensity, specificAttackType),
        } as any, INITIAL_ENEMY_POOL));

        session.attachSystem(new SectorSystem(playerGroup, props.gameState.currentSector, {
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
            rewardXP: (amount: number) => callbacks.rewardXP(amount),
            rewardSP: (amount: number) => callbacks.rewardSP(amount),
            rewardScrap: (amount: number) => callbacks.rewardScrap(amount),
            onDiscovery: (type: any, id: string, titleKey: string, detailsKey: string, payload?: any) => {
                // Bridge to the GameSessionSetup internal onDiscovery logic if needed, 
                // or just call the props/callbacks version.
                if (callbacks.onDiscovery) {
                    callbacks.onDiscovery(type, id, titleKey, detailsKey, payload);
                    return true;
                }
                return false;
            },
            handlePlayerHit: (damage: number, attacker: any, damageType: DamageType, damageSource: DamageID, isDoT?: boolean, effectType?: StatusEffectID, duration?: number, intensity?: number, specificAttackType?: EnemyAttackType) => {
                return CombatEngine.handlePlayerHit(session, damage, attacker, damageType, damageSource, isDoT, effectType, duration, intensity, specificAttackType);
            },
            handleEnemyHit: (enemy: any, amount: number, damageType: DamageType, damageSource: DamageID, isHighImpact?: boolean) => {
                return CombatEngine.handleEnemyHit(session, enemy, amount, damageType, damageSource, isHighImpact);
            }
        }));

        session.attachSystem(new LootSystem(playerGroup, engine.scene, { rewardScrap: callbacks.rewardScrap }));

        session.attachSystem(new FamilySystem(playerGroup, refs.activeFamilyMembers, refs.cinematicRef, {
            setFoundMember: (id: FamilyMemberID) => ctx.ui.setFoundMember && ctx.ui.setFoundMember(id)
        }));

        session.attachSystem(new CinematicSystem({
            cinematicRef: refs.cinematicRef, camera: engine.camera as any, playerMeshRef: refs.playerMeshRef as any,
            dialogueRef: refs.dialogueRef, activeFamilyMembers: refs.activeFamilyMembers,
            callbacks: {
                setCurrentLine: ui.setCurrentLine,
                setCinematicActive: ui.setCinematicActive,
                endCinematic: callbacks.endCinematic,
                playCinematicLine: callbacks.playCinematicLine,
                onAction: callbacks.onAction
            },
            state: state
        }));

        session.attachSystem(new DeathSystem({
            playerGroupRef: refs.playerGroupRef as any, playerMeshRef: refs.playerMeshRef as any, fmMeshRef: refs.familyMemberRef, activeFamilyMembers: refs.activeFamilyMembers,
            deathPhaseRef: refs.deathPhaseRef, inputRef: () => engine.input.state, cameraRef: () => engine.camera.threeCamera, propsRef: refs.propsRef,
            distanceTraveledRef: refs.distanceTraveledRef, fxCallbacks: callbacks, setDeathPhase: ui.setDeathPhase
        }));

        // Unified 2-Pass Boot Pipeline: Initialize all systems after registration to eliminate race conditions
        session.initSystems();

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
    static respawnPlayer(session: GameSessionLogic, engine: WinterEngine, state: GameSessionState, refs: any, props: any, setDeathPhase: (phase: DeathPhase) => void) {
        const scene = engine.scene;

        // --- 1. RESET PLAYER STATE (DOD / Zero-GC) ---
        // --- STATUS & EFFECT RESET (Zero-GC Clean Slate) ---
        engine.input.clearActions();
        state.combat.statusFlags = PlayerStatusFlags.NONE; // Reset all flags (Dead, Airborne, etc.)
        state.ui.hudVisible = true;
        refs.deathPhaseRef.current = DeathPhase.NONE;
        state.player.deathState = PlayerDeathState.ALIVE;
        state.player.statsBuffer[StatID.HP] = state.player.statsBuffer[StatID.MAX_HP];
        state.player.statsBuffer[StatID.STAMINA] = state.player.statsBuffer[StatID.MAX_STAMINA];
        state.combat.isReloading = false;
        state.triggers.isInteractionOpen = false;
        state.vehicle.active = false;
        state.vehicle.mesh = null;
        state.vehicle.speed = 0;

        // --- 1.1 RESET VISUALS ---
        const playerGroup = refs.playerGroupRef.current;
        const playerMesh = refs.playerMeshRef.current;
        if (playerMesh) {
            playerMesh.visible = true;
            const baseScale = playerMesh.userData.baseScale || 1.0;
            playerMesh.scale.setScalar(baseScale);
            playerMesh.rotation.set(0, 0, 0);
        }

        if (playerGroup) {
            playerGroup.visible = true;
            // Restore laser sight — it's hidden by PlayerCombatSystem on death lock and
            // won't be shown again until the next update cycle clears _wasLocked.
            // Force it visible here so it appears the instant the player respawns.
            const laserSight = playerGroup.getObjectByName('laserSight');
            if (laserSight) laserSight.visible = true;
        }

        // Reset Persistent Visual Flags
        state.player.playerBloodSpawned = false;
        state.player.playerAshSpawned = false;
        state.player.hasLastTrailPos = false;
        state.combat.lastBiteTime = 0;
        state.vehicle.engineState = VehicleEngineState.OFF;

        // Reset Numeric Effect Buffers (Zero-GC: Filling contiguous arrays with 0)
        state.combat.effectDurations.fill(0);
        state.combat.effectIntensities.fill(0);

        // Clear Dynamic Status Effect Collections
        state.combat.activePassivesCount = 0;
        state.combat.activeBuffsCount = 0;
        state.combat.activeDebuffsCount = 0;
        state.combat.fireZoneCount = 0;

        // Reset Killer Metadata
        state.player.killedByEnemy = false;
        state.player.killerType = DamageType.NONE;
        state.player.killerName = '';
        state.player.killerAttackName = '';

        // Zero-out contiguous status arrays
        state.combat.activePassives.fill(0);
        state.combat.activeBuffs.fill(0);
        state.combat.activeDebuffs.fill(0);

        // Reset simulation timers to prevent lockout
        state.simTime = 0;
        state.combat.lastShotTime = 0;
        state.combat.reloadEndTime = 0;
        state.combat.throwChargeStart = 0;
        state.player.lastDamageTime = 0;
        state.player.lastStaminaUseTime = 0;
        state.combat.lastBiteTime = 0;
        state.player.lastActionTime = 0;
        state.enemies.bossDefeatedTime = 0;
        state.player.lastDrownTick = 0;
        state.triggers.isInteractionOpen = false;
        state.inputState.eDepressed = false;
        state.triggers.interaction.active = false;

        // Empty pools:
        state.enemies.pool.length = 0;
        state.world.bloodDecals.length = 0;

        // Weapons:
        for (const key in state.combat.weaponAmmo) {
            state.combat.weaponAmmo[key as any] = WEAPONS[key as any]?.magSize || 0;
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
        const perkSystem = engine.systems.perkSystem;
        if (perkSystem) {
            // Corrected method name to match PerkSystem.ts implementation (refreshBaseStats)
            if (perkSystem.refreshBaseStats) {
                perkSystem.refreshBaseStats(session);
            }
        }

        // --- 4. SYSTEM CLEARING ---
        ProjectileSystem.clear(scene, state.combat.projectiles, state.combat.fireZones);
        FXSystem.reset();
        session.systems.triggerSystem.resetTriggerStates();
        EnemyManager.clear();

        // --- 4.1 BOSS TEARDOWN ---
        // EnemyManager.clear() removes boss mesh from scene but does NOT reset
        // bossSpawned or the HUD. Do a full state wipe so the sector can re-spawn
        // the boss on respawn as if it was never triggered.
        if (state.enemies.bossSpawned || state.enemies.activeBoss) {
            state.enemies.bossSpawned = false;
            state.enemies.activeBoss = null;
            state.enemies.bossDefeatedTime = 0;

            // Stop boss music and restore the sector's ambient loop.
            audioEngine.stopMusic();
            const currentSectorDataForAudio = (props as any).currentSectorData || SectorSystem.getSector(props.gameState.currentSector || 0);
            if (currentSectorDataForAudio?.ambientLoop) {
                audioEngine.playMusic(currentSectorDataForAudio.ambientLoop);
            }

            // Force HUD to reflect the cleared boss state immediately.
            HudStore.patch({ bossSpawned: false });
        }

        // --- 5. CLEAR DYNAMIC OBJECTS ---
        this.clearDynamicNodes(scene);

        // --- 6. SECTOR DATA ---
        const currentSectorData = (props as any).currentSectorData || SectorSystem.getSector(props.gameState.currentSector || 0);
        const currentSectorId = props.gameState.currentSector || 0;
        const currentFMId = DataResolver.getSectorFamilyMemberId(currentSectorId);

        // --- 6.1 RESET FAMILY MEMBERS (VINTERDÖD FIX) ---
        // Ensure unrescued members don't follow and previously rescued members are positioned correctly.
        const fmArr = refs.activeFamilyMembers.current;
        for (let i = 0; i < fmArr.length; i++) {
            const fm = fmArr[i];
            if (fm.id === currentFMId) {
                if (state.checkpoint && state.checkpoint.active && state.checkpoint.familyMemberId === currentFMId) {
                    // Checkpoint is active: keep them rescued and following!
                    fm.following = true;
                    fm.rescued = true;
                    fm.found = true;
                    if (fm.mesh) {
                        fm.mesh.visible = true;
                    }
                } else {
                    // Current sector's member MUST be reset to un-rescued state
                    fm.following = false;
                    fm.rescued = false;
                    fm.found = false;
                    if (fm.mesh) {
                        fm.mesh.visible = (fm.spawnPos && fm.spawnPos.y > -500);
                        if (fm.spawnPos) fm.mesh.position.copy(fm.spawnPos);
                        else fm.mesh.position.set(0, -1000, 0);
                    }
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
        const sCtx = refs.SectorBuildContextRef.current;
        if (sCtx && currentSectorData.setupZombies) {
            currentSectorData.setupZombies(sCtx);
        }

        // 6.2.1 SECTOR-SPECIFIC PLAYER RESPAWN HOOK (VINTERDÖD HARDENING)
        if (sCtx && currentSectorData.onPlayerRespawn) {
            currentSectorData.onPlayerRespawn(sCtx, state, engine);
        }

        // 6.2 PLAYER & FAMILY MEMBER POSITIONING
        if (refs.playerGroupRef.current) {
            let spawnX = 0;
            let spawnY = 0;
            let spawnZ = 0;

            if (state.checkpoint && state.checkpoint.active) {
                spawnX = state.checkpoint.x;
                spawnY = state.checkpoint.y;
                spawnZ = state.checkpoint.z;
            } else {
                const spawn = currentSectorData.playerSpawn || { x: 0, y: 0, z: 0 };
                spawnX = spawn.x || 0;
                spawnY = spawn.y || 0;
                spawnZ = spawn.z || 0;
            }

            refs.playerGroupRef.current.position.set(spawnX, spawnY, spawnZ);
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
                            spawnX + (Math.random() - 0.5) * 5,
                            spawnY || 0,
                            spawnZ + 5 + Math.random() * 5
                        );
                    } else if (fm.spawnPos) {
                        fm.mesh.position.copy(fm.spawnPos);
                    } else if (fSpawn) {
                        fm.mesh.position.set(fSpawn.x, fSpawn.y || 0, fSpawn.z);
                    }
                }
            }
        }

        // Spawn boss if respawning at checkpoint
        if (state.checkpoint && state.checkpoint.active) {
            const bossPos = currentSectorData.bossSpawn;
            if (bossPos) {
                session.onAction({ type: TriggerActionType.SPAWN_BOSS, payload: { pos: bossPos } });
            }
        }

        // --- 7. FIX THE UI ---
        HudStore.patch({ isDead: false, hp: state.player.statsBuffer[StatID.MAX_HP] });

        setDeathPhase(DeathPhase.NONE);
    }

    /**
     * Restarts the sector completely.
     */
    static async restartSector(ctx: SetupContext, currentSetupId: number) {
        const { engine, state, ui } = ctx;

        ui.setIsSectorLoading(true);

        EnemyManager.clear();
        ProjectileSystem.clear(engine.scene, state.combat.projectiles, state.combat.fireZones);
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
        state.enemies.pool.length = 0;
        state.world.obstacles.length = 0;
        state.world.chests.length = 0;
        ctx.session.systems.triggerSystem.clear();
        state.world.bloodDecals.length = 0;

        state.combat.statusFlags &= ~PlayerStatusFlags.DEAD;
        state.player.statsBuffer[StatID.HP] = state.player.statsBuffer[StatID.MAX_HP];
        state.player.statsBuffer[StatID.STAMINA] = state.player.statsBuffer[StatID.MAX_STAMINA];

        // Reset simulation timers to prevent lockout
        state.simTime = 0;
        state.combat.lastShotTime = 0;
        state.combat.reloadEndTime = 0;
        state.combat.throwChargeStart = 0;
        state.player.lastDamageTime = 0;
        state.player.lastStaminaUseTime = 0;
        state.combat.lastBiteTime = 0;
        state.player.lastActionTime = 0;
        state.enemies.bossDefeatedTime = 0;
        state.player.lastDrownTick = 0;

        await this.runSectorSetup(ctx, currentSetupId);

        ui.setDeathPhase(DeathPhase.NONE);
    }

    static disposeSector(session: GameSessionLogic, state: GameSessionState) {
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

        ProjectileSystem.clear(engine.scene, state.combat.projectiles, state.combat.fireZones);
        FXSystem.reset();

        if (session) {
            session.dispose();
        }

        state.enemies.bossSpawned = false;
    }
}
