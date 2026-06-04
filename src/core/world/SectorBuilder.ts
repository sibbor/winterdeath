import * as THREE from 'three';
import { MATERIALS, ModelFactory } from '../../utils/assets';
import { EffectType, SubEffectType } from '../../systems/EffectManager';
import { FXParticleType } from '../../types/FXTypes';
import { SectorBuildContext, ChestType, NatureFillType, EnvironmentalZone, TerminalType } from '../../game/session/SectorTypes';
import { ObjectGenerator } from './generators/ObjectGenerator';
import { VehicleGenerator } from './generators/VehicleGenerator';
import { TerrainGenerator } from './generators/TerrainGenerator';
import { VegetationGenerator } from './generators/VegetationGenerator';
import { NaturePropGenerator } from './generators/NaturePropGenerator';
import { PathGenerator } from './generators/PathGenerator';
import { GeneratorUtils } from './generators/GeneratorUtils';
import { EffectManager } from '../../systems/EffectManager';
import { getCollectibleById } from '../../content/collectibles';
import { VEHICLES, VehicleType } from '../../content/vehicles';
import { SectorTrigger, TriggerType, TriggerAction, TriggerStatus } from '../../types/TriggerTypes';
import { WaterBodyType, WaterShape, WaterFloraType } from '../../types/WaterTypes';
import { WaterBody } from '../../systems/WaterSystem';
import { GEOMETRY } from '../../utils/assets';
import { WinterEngine } from '../engine/WinterEngine';
import { FAMILY_MEMBERS, FamilyMemberID } from '../../content/constants';
import { EnemyType } from '../../entities/enemies/EnemyTypes';
import { MaterialType, VEGETATION_TYPE } from '../../content/environment';
import { DamageType, DamageID } from '../../entities/player/CombatTypes';
import { PoiType } from '../../content/pois';
import { worldStateRegistry } from './WorldStateRegistry';
import { ChunkManager } from './ChunkManager';
import { PoiGenerator } from './generators/PoiGenerator';
import { InteractionType, InteractionSubType, InteractionShape } from '../../systems/ui/UIEventBridge';
import { MapItemType } from '../../components/ui/hud/HudTypes';
import { VehicleID } from '../../entities/vehicles/VehicleTypes';
import { PhysicsGroup, ColliderType } from './CollisionResolution';
import { warmupProceduralTextures, isProceduralTexturesReady } from '../../utils/assets/procedural';
import { GroundType } from '../engine/EnvironmentalTypes';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1_sg = new THREE.Vector3();
const _v2_sg = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _q1_sg = new THREE.Quaternion();
const _box_sg = new THREE.Box3();
const _axisY = new THREE.Vector3(0, 1, 0);

export interface InteractionCollider {
    type: InteractionShape;
    radius?: number;       // For sphere
    size?: THREE.Vector3;  // For box
    margin?: number;       // Extra reach padding (default: 2.0)
}

export interface InteractableParams {
    id?: string;
    label?: string;
    type?: InteractionType;
    subType?: InteractionSubType;
    collider?: InteractionCollider;
}

export const SectorBuilder = {

    addObstacle: (ctx: SectorBuildContext, obstacle: any) => {
        // Zero-GC check instead of .includes()
        let exists = false;
        const len = ctx.obstacles.length;
        for (let i = 0; i < len; i++) {
            if (ctx.obstacles[i] === obstacle) {
                exists = true;
                break;
            }
        }
        if (!exists) ctx.obstacles.push(obstacle);

        // Auto-calculate radius for colliders if missing
        if (!obstacle.radius) {
            if (obstacle.collider?.type === ColliderType.BOX && obstacle.collider.size) {
                const s = obstacle.collider.size;
                obstacle.radius = Math.sqrt(s.x * s.x + s.z * s.z) * 0.5;
            } else if (obstacle.collider?.type === ColliderType.SPHERE && obstacle.collider.radius) {
                obstacle.radius = obstacle.collider.radius;
            } else if (obstacle.mesh?.userData?.radius) {
                obstacle.radius = obstacle.mesh.userData.radius;
            }
        }

        // Mandatory material identifier propagation from mesh to obstacle
        if (!obstacle.materialId && obstacle.mesh?.userData?.materialId) {
            obstacle.materialId = obstacle.mesh.userData.materialId;
        }

        // PhysicsGroup propagation
        if (obstacle.physicsGroup === undefined) {
            if (obstacle.mesh?.userData?.physicsGroup !== undefined) {
                obstacle.physicsGroup = obstacle.mesh.userData.physicsGroup;
            } else {
                obstacle.physicsGroup = PhysicsGroup.OBJECT; // Safe default
            }
        }

        if (obstacle.mesh) {
            obstacle.mesh.updateMatrixWorld(true);
            if (!obstacle.position) {
                obstacle.position = obstacle.mesh.position;
            }
        }

        if (!obstacle.position) {
            console.warn('SectorBuilder: Attempted to add obstacle without position or mesh:', obstacle);
            return;
        }

        ctx.worldStreamer.registerObstacle(obstacle);
    },

    addInteractable: (ctx: SectorBuildContext, object: THREE.Object3D, params?: InteractableParams) => {
        if (!object) return;

        object.userData.isInteractable = true;
        if (params?.id) object.userData.interactionId = params.id;
        if (params?.label) object.userData.interactionLabel = params.label;
        if (params?.type !== undefined) object.userData.interactionType = params.type;
        if (params?.subType !== undefined) object.userData.interactionSubType = params.subType;

        // Data-Driven Interaction Shapes
        if (params?.collider) {
            object.userData.interactionShape = params.collider.type;
            if (params.collider.type === InteractionShape.BOX && params.collider.size) {
                object.userData.interactionSize = params.collider.size;
            } else if (params.collider.type === InteractionShape.SPHERE && params.collider.radius) {
                object.userData.interactionRadius = params.collider.radius;
            }
            if (params.collider.margin !== undefined) {
                object.userData.interactionMargin = params.collider.margin;

                // Propagate to nested structure for consistency
                if (!object.userData.interactable) object.userData.interactable = {};
                if (!object.userData.interactable.collider) object.userData.interactable.collider = {};
                object.userData.interactable.collider.margin = params.collider.margin;
            }
        }

        if (!ctx.interactables) {
            ctx.interactables = [];
        }

        // Zero-GC array inclusion check
        let exists = false;
        const len = ctx.interactables.length;
        for (let i = 0; i < len; i++) {
            if (ctx.interactables[i] === object) {
                exists = true;
                break;
            }
        }
        if (!exists) ctx.interactables.push(object);

        const radius = object.userData.interactionRadius || 2.5;
        ctx.worldStreamer.registerInteractable(object, object.position.x, object.position.z, radius);
    },

    generateAutomaticContent: async (ctx: SectorBuildContext, def: any) => {
        if (def.ground !== undefined && def.ground !== null) {
            // During warmup, we only need a 1x1 plane to compile the ground material.
            const size = ctx.isWarmup ? { width: 1, depth: 1 } : (def.groundSize || { width: 2000, depth: 2000 });
            await SectorBuilder.generateGround(ctx, def.ground as GroundType, size);
        }

        if (def.collectibles) {
            const spawnedTypes = new Set<any>();
            const len = def.collectibles.length;
            for (let i = 0; i < len; i++) {
                const c = def.collectibles[i];
                const meta = getCollectibleById(c.id);
                if (meta) {
                    // During warmup, only spawn one instance per model type to avoid scene bloat
                    if (ctx.isWarmup) {
                        if (spawnedTypes.has(meta.modelType)) continue;
                        spawnedTypes.add(meta.modelType);
                    }
                    SectorBuilder.spawnCollectible(ctx, c.x, c.z, c.id, meta.modelType as any);
                }
                if (ctx.yield) await ctx.yield();
            }
        }

        if (ctx.yield) await ctx.yield();

        if (def.bounds && !ctx.isWarmup) {
            SectorBuilder.generateBoundaries(ctx, def.bounds);
        }

        if (ctx.yield) await ctx.yield();
    },

    createWarmupContext: (scene: THREE.Scene, sectorId: number, yieldFn?: () => Promise<void>): SectorBuildContext => {
        const NOOP = () => { };
        const NOOP_ARRAY = () => [] as any[];
        const STUB_STREAMER: any = {
            clear: NOOP, update: NOOP, setTerrainProvider: NOOP, getGroundHeight: () => 0,
            getGroundMaterial: () => 0, getVegetationAt: () => 0, getOrCreateGrid: () => ({ ground: new Uint8Array(1), vegetation: new Uint8Array(1), enemyBuckets: [], obstacleBuckets: [] }),
            getNearbyEnemies: NOOP_ARRAY, getNearbyObstacles: NOOP_ARRAY, registerObstacle: NOOP, registerInteractable: NOOP,
            registerTrigger: NOOP, registerGroundMaterial: NOOP, registerVegetation: NOOP, fillGroundMaterial: NOOP,
            registerEnvironmentalZone: NOOP,
            getNearbyTriggers: NOOP_ARRAY
        };
        const MOCK_ENGINE: any = {
            scene,
            water: { clear: NOOP, setLightPosition: NOOP, registerGround: NOOP, populateFlora: NOOP, setPlayerRef: NOOP, setCallbacks: NOOP },
            wind: { sync: NOOP, setOverride: NOOP, clearOverride: NOOP, setRandomWind: NOOP },
            weather: { sync: NOOP }, fog: { sync: NOOP },
            syncEnvironment: (env: any, ground?: any, targetScene?: THREE.Scene) => {
                // Procedural Sky handles lighting in SectorBuildContext
            },
            renderer: { setClearColor: NOOP },
            updateAtmosphere: NOOP
        };
        return {
            scene, engine: MOCK_ENGINE, sectorId, isWarmup: true, worldStreamer: STUB_STREAMER,
            obstacles: [], chests: [], triggers: [], mapItems: [],
            interactables: [], collectibles: [], dynamicLights: [], burningObjects: [], smokeEmitters: [],
            environmentalZones: [],
            rng: Math.random, debugMode: false,
            textures: {} as any, sectorState: {} as any, state: { sectorState: {} } as any, activeFamilyMembers: [],
            yield: yieldFn ?? (() => new Promise<void>(resolve => setTimeout(resolve, 0))),
            spawnZombie: NOOP as any, spawnHorde: NOOP as any, spawnBoss: NOOP as any, makeNoise: NOOP as any, onAction: NOOP as any,
            spawnParticle: NOOP, spawnDecal: NOOP,
            applyDamage: (enemy: any, amount: number, damageType: DamageType, damageSource: DamageID, isHighImpact?: boolean) => false
        };
    },

    build: async (ctx: SectorBuildContext, def: any) => {
        const engine = ctx.engine || WinterEngine.getInstance();

        // Idempotency check: Clear state arrays to prevent duplication on re-renders
        if (ctx.obstacles) ctx.obstacles.length = 0;
        if (ctx.chests) ctx.chests.length = 0;
        if (ctx.interactables) ctx.interactables.length = 0;
        if (ctx.triggers) ctx.triggers.length = 0;
        else ctx.triggers = [];
        if (ctx.mapItems) ctx.mapItems.length = 0;
        if (!ctx.environmentalZones) ctx.environmentalZones = [];
        ctx.environmentalZones.length = 0;

        if (engine?.water) engine.water.clear();

        // --- ATMOSPHERE REGISTRATION (Optimized via WorldStreamer) ---
        if (ctx.worldStreamer) {
            const staticZones = def.environmentalZones;
            if (staticZones) {
                for (let i = 0; i < staticZones.length; i++) {
                    const aabb = SectorBuilder.getZoneAABB(staticZones[i]);
                    // Static indices are 0-999
                    ctx.worldStreamer.registerEnvironmentalZone(i, aabb.minX, aabb.minZ, aabb.maxX, aabb.maxZ);
                }
            }
        }

        // TextureReady Semaphore: Gate initialization until GPU buffers are committed
        if (!isProceduralTexturesReady()) {
            await warmupProceduralTextures();
        }
        ctx.texturesReady = true;

        try {
            console.time(`[SectorBuilder] Build Time (Sector ${ctx.sectorId})`);

            await SectorBuilder.generateAutomaticContent(ctx, def);

            console.timeEnd(`[SectorBuilder] Build Time (Sector ${ctx.sectorId})`);
        } catch (e) {
            console.error(`[SectorBuilder] ❌ FATAL Build Error (Sector ${ctx.sectorId}):`, e);
            throw e;
        }

        const env = def.environment;
        if (env) {
            engine.syncEnvironment(env, def.ground, ctx.scene);
        }

        if (def.setupEnvironment) {
            await def.setupEnvironment(ctx);
            if (ctx.yield) await ctx.yield();
        }

        if (def.setupProps) {
            await def.setupProps(ctx);
        }
        if (ctx.yield) await ctx.yield();

        if (def.setupContent) await def.setupContent(ctx);
        if (ctx.yield) await ctx.yield();

        // Skip expensive entity and system initialization during asset warmup
        // These are handled by GameSessionSetup.activateSector(ctx) when the sector goes LIVE.
        // Dynamic population (zombies, actors) is now deferred to activateSector 
        // to ensure static world baking completes first.
        if (!ctx.isWarmup && ctx.yield) {
            await ctx.yield();
        }

        if (ctx.debugMode) {
            const { DebugVisualizer } = await import('../../utils/DebugVisualizer');
            DebugVisualizer.visualizeSector(ctx, def);
        }
    },

    generateGround: async (ctx: SectorBuildContext, type: GroundType, size: { width: number, depth: number }) => {
        const ground = TerrainGenerator.createGroundLayer(type, size.width, size.depth);
        ctx.scene.add(ground);

        // Sync the DOD material grid
        let mat = MaterialType.SNOW;
        if (type === GroundType.DIRT) mat = MaterialType.DIRT;
        else if (type === GroundType.GRAVEL) mat = MaterialType.GRAVEL;
        ctx.worldStreamer.fillGroundMaterial(mat);

        const engine = WinterEngine.getInstance();
        if (engine && engine.water) {
            engine.water.registerGround(ground);
        }

        if (ctx.yield) await ctx.yield();
        return ground;
    },

    spawnCollisionBox: (ctx: SectorBuildContext, x: number, z: number, width: number, height: number, depth: number, rotation: number = 0) => {
        _q1_sg.setFromAxisAngle(_axisY, rotation);
        _v1_sg.set(x, height / 2, z);
        _v2_sg.set(width, height, depth);

        SectorBuilder.addObstacle(ctx, {
            position: new THREE.Vector3(_v1_sg.x, _v1_sg.y, _v1_sg.z), // Avoid .clone() prototype overhead
            quaternion: new THREE.Quaternion(_q1_sg.x, _q1_sg.y, _q1_sg.z, _q1_sg.w),
            collider: { type: ColliderType.BOX, size: new THREE.Vector3(_v2_sg.x, _v2_sg.y, _v2_sg.z) },
            physicsGroup: PhysicsGroup.WALL
        });
    },

    generateBoundaries: (ctx: SectorBuildContext, bounds: { width: number, depth: number }) => {
        const h = 50;
        const w = bounds.width;
        const d = bounds.depth;

        if (w < 10 || d < 10) return;

        const createWall = (x: number, z: number, sx: number, sz: number) => {
            _v1_sg.set(x, h / 2, z);
            _v2_sg.set(sx, h, sz);
            SectorBuilder.addObstacle(ctx, {
                position: new THREE.Vector3(_v1_sg.x, _v1_sg.y, _v1_sg.z),
                collider: { type: ColliderType.BOX, size: new THREE.Vector3(_v2_sg.x, _v2_sg.y, _v2_sg.z) },
                physicsGroup: PhysicsGroup.WALL
            });
        };

        createWall(0, -d / 2, w, 2);
        createWall(0, d / 2, w, 2);
        createWall(-w / 2, 0, 2, d);
        createWall(w / 2, 0, 2, d);
    },

    spawnChest: (ctx: SectorBuildContext, x: number, z: number, type: ChestType = ChestType.STANDARD, rot: number = 0, logicId?: number) => {
        const chest = ObjectGenerator.createChest(type);
        chest.position.set(x, 0, z);
        chest.rotation.y = rot;
        chest.updateMatrixWorld();
        // Manual sync for frozen objects
        chest.updateMatrix();
        chest.updateMatrixWorld();

        ctx.scene.add(chest);

        const isBig = type === ChestType.BIG;
        const scale = isBig ? 1.5 : 1.0;
        _v1_sg.set(1.5 * scale, 1.0 * scale, 1.0 * scale);

        // Gameplay logic & Collision
        const obs = {
            mesh: chest,
            position: chest.position,
            type: type,
            scrap: isBig ? 100 : 25,
            opened: false,
            logicId: logicId,
            collider: {
                type: ColliderType.BOX,
                size: new THREE.Vector3(_v1_sg.x, _v1_sg.y, _v1_sg.z)
            },
            physicsGroup: PhysicsGroup.OBJECT
        };

        // --- HYDRATION CHECK (Phase 5) ---
        if (logicId !== undefined) {
            const key = ChunkManager.getSmiKey(ChunkManager.getCoordIndex(x), ChunkManager.getCoordIndex(z));
            if (worldStateRegistry.isMutated(key, logicId)) {
                obs.opened = true;
                const lid = chest.getObjectByName("chestLid");
                if (lid) lid.rotation.x = -Math.PI / 2.5;
                const glow = chest.getObjectByName("chestGlow");
                if (glow) glow.visible = false;
            }
        }

        ctx.chests.push(obs);
        SectorBuilder.addObstacle(ctx, obs);
        chest.userData.chestData = obs;

        SectorBuilder.addInteractable(ctx, chest, {
            id: `chest_${x}_${z}`,
            type: InteractionType.CHEST,
            subType: isBig ? InteractionSubType.BIG_CHEST : InteractionSubType.CHEST,
            label: isBig ? 'ui.open_large_chest' : 'ui.open_chest',
            collider: {
                type: InteractionShape.BOX,
                size: new THREE.Vector3(_v1_sg.x, _v1_sg.y, _v1_sg.z),
                margin: 3.5
            }
        });

        ctx.mapItems.push({
            id: `chest_${x}_${z}`,
            x, z,
            type: MapItemType.CHEST,
            label: isBig ? 'ui.large_chest' : 'ui.chest',
            icon: '📦',
            color: isBig ? '#ffd700' : '#8b4513',
            radius: null
        });
    },

    spawnCollectible: (ctx: SectorBuildContext, x: number, z: number, id: string, type: 'phone' | 'pacifier' | 'axe' | 'scarf' | 'jacket' | 'badge' | 'diary' | 'ring' | 'teddy', respawnable: boolean = false) => {
        if (Math.abs(x) < 0.001 && Math.abs(z) < 0.001) return;

        // Persistence Check
        if (!respawnable) {
            const foundList = (ctx as any).discoveredCollectibles || [];
            const len = foundList.length;
            for (let i = 0; i < len; i++) {
                if (foundList[i] === id) return;
            }
        }

        const group = new THREE.Group();
        group.position.set(x, 0.5, z);
        group.userData = { id, type: InteractionType.COLLECTIBLE, collectibleId: id, isCollectible: true, respawnable };
        group.name = `collectible_${id}`;

        const mesh = ModelFactory.createCollectible(type);
        group.add(mesh);
        group.rotation.y = Math.random() * Math.PI * 2;

        const colorPrimary = 0x00ffff;
        const colorSecondary = 0x0088ff;

        // Note: Sharing material instances is preferred over cloning.
        const collectibleRing = new THREE.Mesh(GEOMETRY.collectibleRing, MATERIALS.collectibleRing);
        collectibleRing.name = 'collectibleRing';
        collectibleRing.rotation.x = -Math.PI / 2;
        collectibleRing.position.y = 0.05;
        group.add(collectibleRing);

        const collectibleBeam = new THREE.Mesh(GEOMETRY.collectibleBeam, MATERIALS.collectibleBeam);
        collectibleBeam.name = 'collectibleBeam';
        collectibleBeam.position.y = 2;
        group.add(collectibleBeam);

        const collectibleInnerRing = new THREE.Mesh(GEOMETRY.collectibleInnerRing, MATERIALS.collectibleInnerRing);
        collectibleInnerRing.name = 'collectibleInnerRing';
        collectibleInnerRing.rotation.x = Math.PI / 2;
        collectibleInnerRing.position.y = 1.0;
        group.add(collectibleInnerRing);

        // Logical light
        _v1_sg.set(x, 1.7, z);
        if (ctx.dynamicLights) {
            ctx.dynamicLights.push({
                isLogicalLight: true,
                position: new THREE.Vector3(_v1_sg.x, _v1_sg.y, _v1_sg.z),
                color: colorPrimary,
                intensity: 10.0,
                distance: 10.0,
                flickerRate: 0.0
            } as any);
        }

        if (!group.userData.effects) group.userData.effects = [];
        group.userData.effects.push({
            type: SubEffectType.EMITTER, particle: FXParticleType.SPARK, interval: 100, count: 1,
            offset: new THREE.Vector3(0, 0.2, 0), spread: 0.2, color: colorPrimary, velocity: new THREE.Vector3(0, 2, 0)
        });

        ctx.scene.add(group);
        if (ctx.collectibles) ctx.collectibles.push(group);

        ctx.mapItems.push({
            id: `collectible_${id}`,
            x, z, type: MapItemType.TRIGGER, label: 'ui.collectible', icon: '🎁', color: '#ffd700', radius: null
        });

        SectorBuilder.addInteractable(ctx, group, {
            id: id,
            type: InteractionType.COLLECTIBLE,
            label: 'ui.interact_pickup_collectible',
            collider: { type: InteractionShape.SPHERE, radius: 4.0 }
        });
    },

    spawnBoxTrigger: (ctx: SectorBuildContext, id: SectorTrigger['id'], x: number, z: number, width: number, depth: number, type: TriggerType, content: string = '', actions?: TriggerAction[], resetOnExit: boolean = false, rotation: number = 0) => {
        ctx.triggers.push({
            id,
            type,
            position: { x, z },
            size: { width, depth },
            rotation,
            statusFlags: TriggerStatus.ACTIVE | (resetOnExit ? TriggerStatus.RESET_ON_EXIT : TriggerStatus.NONE),
            content,
            actions: actions || []
        });
    },

    setOnFire: (ctx: SectorBuildContext, object: THREE.Object3D, opts?: { smoke?: boolean, color?: number, intensity?: number, distance?: number, offset?: THREE.Vector3, onRoof?: boolean, area?: THREE.Vector3 }) => {
        // Direct assignment avoiding Object Spread GC allocation
        const targetArea = opts?.area || object.userData.size as THREE.Vector3;
        let targetOffset = opts?.offset;

        if (opts?.onRoof && !targetOffset) {
            let height = 0;
            if (object.userData.size) {
                height = (object.userData.size as THREE.Vector3).y;
            } else {
                _box_sg.setFromObject(object);
                height = _box_sg.max.y - _box_sg.min.y;
            }
            targetOffset = new THREE.Vector3(0, height, 0);
        }

        EffectManager.attachEffect(object, EffectType.FIRE, {
            smoke: opts?.smoke,
            color: opts?.color,
            intensity: opts?.intensity,
            distance: opts?.distance,
            offset: targetOffset,
            onRoof: opts?.onRoof,
            area: targetArea
        });

        if (ctx.burningObjects) {
            let exists = false;
            const len = ctx.burningObjects.length;
            for (let i = 0; i < len; i++) {
                if (ctx.burningObjects[i] === object) {
                    exists = true; break;
                }
            }
            if (!exists) ctx.burningObjects.push(object);
        }
    },

    extinguishFire: (ctx: SectorBuildContext, object: THREE.Object3D) => {
        object.userData.isFire = false;
        object.userData.effects = [];

        if (ctx.burningObjects) {
            const idx = ctx.burningObjects.indexOf(object);
            if (idx > -1) {
                ctx.burningObjects[idx] = ctx.burningObjects[ctx.burningObjects.length - 1];
                ctx.burningObjects.pop();
            }
        }

        if (ctx.dynamicLights) {
            for (let i = ctx.dynamicLights.length - 1; i >= 0; i--) {
                const fl = ctx.dynamicLights[i] as any;
                const lightObj = fl.isLogicalLight ? null : fl.light;
                const pos = fl.isLogicalLight ? fl.position : (lightObj ? lightObj.position : null);
                if (!pos) continue;

                const distSq = pos.distanceToSquared(object.position);
                if (distSq < 400) {
                    if (lightObj) {
                        // Dispose shadow map to prevent memory creep during long sessions
                        if (lightObj.shadow && (lightObj.shadow as any).map) {
                            (lightObj.shadow as any).map.dispose();
                        }
                        ctx.scene.remove(lightObj);
                    }
                    ctx.dynamicLights[i] = ctx.dynamicLights[ctx.dynamicLights.length - 1];
                    ctx.dynamicLights.pop();
                }
            }
        }
    },

    spawnDeadBody: (ctx: SectorBuildContext, x: number, z: number, type: EnemyType | 'PLAYER' | 'HUMAN', rot: number = 0, blood: boolean = true) => {
        const body = ObjectGenerator.createDeadBody(type, rot, blood);
        body.position.set(x, 0, z);
        GeneratorUtils.freezeStatic(body);
        ctx.scene.add(body);
        return body;
    },

    spawnHaybale: (ctx: SectorBuildContext, x: number, z: number, rotation: number = 0, scale: number = 1.0) => {
        const bale = ObjectGenerator.createHaybale(scale);
        bale.position.set(x, 0, z);
        bale.rotation.y = rotation;
        GeneratorUtils.freezeStatic(bale);
        ctx.scene.add(bale);

        SectorBuilder.addObstacle(ctx, {
            mesh: bale,
            collider: { type: ColliderType.SPHERE, radius: 1.2 * scale },
            physicsGroup: PhysicsGroup.OBJECT
        });
    },

    spawnTimberPile: (ctx: SectorBuildContext, x: number, z: number, rotation: number = 0, scale: number = 1.0) => {
        const timber = ObjectGenerator.createTimberPile(scale);
        timber.position.set(x, 0, z);
        timber.rotation.y = rotation;
        GeneratorUtils.freezeStatic(timber);
        ctx.scene.add(timber);

        _v1_sg.set(2.5, 1.5, 6.0); // baseSize
        _v2_sg.set(0, 0.75, 0); // baseCenter

        SectorBuilder.addObstacle(ctx, {
            mesh: timber,
            position: timber.position,
            quaternion: timber.quaternion,
            collider: { type: ColliderType.BOX, size: new THREE.Vector3(_v1_sg.x, _v1_sg.y, _v1_sg.z), center: new THREE.Vector3(_v2_sg.x, _v2_sg.y, _v2_sg.z) },
            type: 'TimberPile',
            physicsGroup: PhysicsGroup.DEBRIS
        });
    },

    spawnBuilding(ctx: SectorBuildContext, x: number, z: number, width: number, height: number, depth: number, rotation: number, color: number, createRoof: boolean = true, withLights: boolean = false, lightProbability: number = 0.5) {
        const building = ObjectGenerator.createBuilding(width, height, depth, color, createRoof, withLights, lightProbability);

        building.position.set(x, 0, z);
        building.rotation.y = rotation;
        building.castShadow = true;
        building.receiveShadow = true;
        GeneratorUtils.freezeStatic(building);

        // Manual sync for frozen objects
        building.updateMatrix();
        building.updateMatrixWorld();

        if (ctx.isWarmup) {
            const warmedSet = (ctx as any)._warmedBuildings || (new Set<string>());
            (ctx as any)._warmedBuildings = warmedSet;

            const sig = `${color}_${createRoof}_${withLights}`;
            if (warmedSet.has(sig)) return building;
            warmedSet.add(sig);
        }

        ctx.scene.add(building);

        const hw = width / 2;
        const hd = depth / 2;
        const cos = Math.cos(rotation);
        const sin = Math.sin(rotation);

        ctx.mapItems.push({
            id: `building_${x}_${z}`,
            x, z, type: MapItemType.BUILDING, label: 'ui.building', icon: null, color: '#1e293b', radius: null,
            points: [
                { x: x + (-hw * cos - -hd * sin), z: z + (-hw * sin + -hd * cos) },
                { x: x + (hw * cos - -hd * sin), z: z + (hw * sin + -hd * cos) },
                { x: x + (hw * cos - hd * sin), z: z + (hw * sin + hd * cos) },
                { x: x + (-hw * cos - hd * sin), z: z + (-hw * sin + hd * cos) }
            ]
        });

        const bSize = building.userData.size as THREE.Vector3;
        SectorBuilder.addObstacle(ctx, {
            mesh: building,
            position: building.position,
            quaternion: building.quaternion,
            collider: {
                type: ColliderType.BOX,
                size: new THREE.Vector3(bSize.x, bSize.y, bSize.z),
            },
            physicsGroup: PhysicsGroup.WALL
        });

        return building;
    },

    createScarecrow(ctx: SectorBuildContext, x: number, y: number) {
        const scarecrow = ObjectGenerator.createScarecrow(x, y);
        ctx.scene.add(scarecrow);
        SectorBuilder.addObstacle(ctx, {
            mesh: scarecrow,
            collider: { type: ColliderType.SPHERE, radius: 0.5 },
            physicsGroup: PhysicsGroup.OBJECT
        });
    },

    spawnVehicle: (ctx: SectorBuildContext, x: number, z: number, rotation: number, type: VehicleID = VehicleID.STATION_WAGON, colorOverride?: number, addSnow?: boolean) => {
        const vId = type;

        const vehicle = VehicleGenerator.createVehicle(vId, colorOverride, addSnow);

        _box_sg.setFromObject(vehicle);
        const size = _box_sg.getSize(new THREE.Vector3());

        vehicle.position.set(x, 0, z);
        vehicle.rotation.y = rotation;
        GeneratorUtils.freezeStatic(vehicle);

        if (ctx.isWarmup) {
            const warmedSet = (ctx as any)._warmedVehicles || (new Set<number>());
            (ctx as any)._warmedVehicles = warmedSet;
            if (warmedSet.has(type)) return vehicle;
            warmedSet.add(type);
        }

        ctx.scene.add(vehicle);

        SectorBuilder.addObstacle(ctx, {
            mesh: vehicle,
            position: vehicle.position,
            quaternion: vehicle.quaternion,
            collider: {
                type: ColliderType.BOX,
                size: new THREE.Vector3(size.x, size.y, size.z),
                center: new THREE.Vector3(0, size.y / 2, 0)
            },
            type: `Vehicle_${vId}`,
            physicsGroup: PhysicsGroup.OBJECT
        });

        return vehicle;
    },

    spawnDriveableVehicle: (ctx: SectorBuildContext, x: number, z: number, rotation: number, vehicleType: VehicleID, colorOverride?: number, addSnow?: boolean) => {
        const def = VEHICLES[vehicleType];
        if (!def) return null;

        const vehicleRoot = new THREE.Group();
        let visualMesh: THREE.Object3D;
        if (vehicleType === VehicleID.BOAT) {
            visualMesh = VehicleGenerator.createBoat();
        } else {
            visualMesh = VehicleGenerator.createVehicle(vehicleType, colorOverride, addSnow);
        }

        vehicleRoot.add(visualMesh);

        if (visualMesh.userData.lights) vehicleRoot.userData.lights = visualMesh.userData.lights;
        if (visualMesh.userData.sirenOn !== undefined) vehicleRoot.userData.sirenOn = visualMesh.userData.sirenOn;
        if (visualMesh.userData.material) vehicleRoot.userData.material = visualMesh.userData.material;

        const spawnY = vehicleType === VehicleID.BOAT ? 1.5 : 0.0;
        vehicleRoot.position.set(x, spawnY, z);
        vehicleRoot.rotation.y = rotation;

        if (vehicleType === VehicleID.BOAT) vehicleRoot.userData.floatOffset = 1.5;

        vehicleRoot.userData.vehicleDef = def;
        vehicleRoot.userData.velocity = new THREE.Vector3();
        vehicleRoot.userData.angularVelocity = new THREE.Vector3();
        vehicleRoot.userData.suspY = 0;
        vehicleRoot.userData.suspVelY = 0;
        vehicleRoot.userData.prevFwdSpeed = 0;
        vehicleRoot.userData._lastNoiseTime = 0;

        _v1_sg.set(def.size.x, def.size.y, def.size.z);

        const obs = {
            mesh: vehicleRoot,
            position: vehicleRoot.position,
            quaternion: vehicleRoot.quaternion,
            collider: {
                type: ColliderType.BOX,
                size: new THREE.Vector3(_v1_sg.x, _v1_sg.y, _v1_sg.z),
            },
            type: `Vehicle_${vehicleType}`,
            physicsGroup: PhysicsGroup.OBJECT
        };

        SectorBuilder.addObstacle(ctx, obs);
        vehicleRoot.userData.obstacleRef = obs;
        ctx.scene.add(vehicleRoot);

        SectorBuilder.addInteractable(ctx, vehicleRoot, {
            id: `vehicle_${vehicleType}_${x}_${z}`,
            type: InteractionType.VEHICLE,
            label: 'ui.enter_vehicle',
            collider: {
                type: InteractionShape.BOX,
                size: new THREE.Vector3(_v1_sg.x, _v1_sg.y, _v1_sg.z),
                margin: 3.0
            }
        });

        return vehicleRoot;
    },

    spawnFloatableVehicle: (ctx: SectorBuildContext, x: number, z: number, rotation: number, vehicleType: VehicleType = VehicleID.BOAT, colorOverride?: number) => {
        return SectorBuilder.spawnDriveableVehicle(ctx, x, z, rotation, vehicleType, colorOverride, false);
    },

    addWaterBody: (ctx: SectorBuildContext, type: WaterBodyType, x: number, z: number, width: number, depth: number, options?: { shape?: WaterShape; flowDirection?: THREE.Vector2; flowStrength?: number; maxDepth?: number; }): WaterBody | null => {
        const engine = WinterEngine.getInstance();
        if (!engine?.water) return null;
        return engine.water.addWaterBody(type, x, z, width, depth, options);
    },

    spawnLakeBed: (ctx: SectorBuildContext, x: number, z: number, width: number, depth: number, floorDepth: number = 4.0, shape: WaterShape = WaterShape.RECT) => {
        const lake = TerrainGenerator.createLakeBed(width, depth, floorDepth, shape);
        lake.position.set(x, -0.1, z);
        ctx.scene.add(lake);
        return lake;
    },

    /**
     * Registers a dynamic environmental zone. 
     * These zones override the sector's default environment when the player is inside.
     */
    addEnvironmentalZone: (ctx: SectorBuildContext, zone: EnvironmentalZone) => {
        if (!ctx.environmentalZones) ctx.environmentalZones = [];
        const idx = ctx.environmentalZones.length;
        ctx.environmentalZones.push(zone);

        if (ctx.worldStreamer) {
            const aabb = SectorBuilder.getZoneAABB(zone);
            // Dynamic indices are 1000+
            ctx.worldStreamer.registerEnvironmentalZone(1000 + idx, aabb.minX, aabb.minZ, aabb.maxX, aabb.maxZ);
        }
    },

    getZoneAABB: (zone: EnvironmentalZone) => {
        if (zone.polygon) {
            let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
            const len = zone.polygon.length;
            for (let i = 0; i < len; i++) {
                const p = zone.polygon[i];
                if (p.x < minX) minX = p.x;
                if (p.x > maxX) maxX = p.x;
                if (p.z < minZ) minZ = p.z;
                if (p.z > maxZ) maxZ = p.z;
            }
            return { minX, minZ, maxX, maxZ };
        } else {
            const r = zone.outerRadius || 250;
            const x = zone.x || 0;
            const z = zone.z || 0;
            return { minX: x - r, minZ: z - r, maxX: x + r, maxZ: z + r };
        }
    },

    addLake: (ctx: SectorBuildContext, x: number, z: number, radius: number, floorDepth: number = 5.0) => {
        const water = SectorBuilder.addWaterBody(ctx, WaterBodyType.LAKE, x, z, radius * 2, radius * 2, { shape: WaterShape.CIRCLE, maxDepth: floorDepth });
        SectorBuilder.spawnLakeBed(ctx, x, z, radius * 2, radius * 2, floorDepth, WaterShape.CIRCLE);

        ctx.mapItems.push({
            id: `lake_${x}_${z}`,
            x, z, type: MapItemType.LAKE, label: 'ui.lake', icon: null, color: '#3b82f6', radius, points: null
        });

        const numProps = Math.floor(radius * radius * 0.05);
        const floraInstances: any[] = [];

        for (let i = 0; i < numProps; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = Math.random() * radius * 0.9;
            const pX = x + Math.cos(angle) * r;
            const pZ = z + Math.sin(angle) * r;

            const rand = Math.random();
            const dX = pX - x;
            const dZ = pZ - z;
            const distSq = dX * dX + dZ * dZ;
            const distFromCenter = Math.sqrt(distSq); // Needed for depth blending

            const edgeDistMeters = radius - distFromCenter;
            let currentDepth = floorDepth;
            if (edgeDistMeters < 2.0) {
                const f = edgeDistMeters / 2.0;
                currentDepth = floorDepth * (f * f * (3 - 2 * f));
            }

            if (rand < 0.3) {
                const rock = NaturePropGenerator.createRock(1.5 + Math.random() * 2, 1 + Math.random() * 1.5);
                rock.position.set(pX, -currentDepth + 0.2, pZ);
                GeneratorUtils.freezeStatic(rock);
                ctx.scene.add(rock);
            } else if (rand < 0.7) {
                floraInstances.push({
                    type: WaterFloraType.SEAWEED,
                    position: new THREE.Vector3(pX, -currentDepth + 0.1, pZ),
                    rotationY: Math.random() * Math.PI,
                    scale: { x: 1.0 + Math.random() * 0.5, y: 1.5 + Math.random() * 2, z: 1.0 }
                });
            } else {
                const lilyScale = 0.8 + Math.random() * 0.4;
                floraInstances.push({
                    type: WaterFloraType.LILY,
                    position: new THREE.Vector3(pX, 0, pZ),
                    rotationY: Math.random() * Math.PI,
                    scale: { x: lilyScale, y: lilyScale, z: lilyScale }
                });
            }
        }

        const engine = WinterEngine.getInstance();
        if (engine?.water) {
            engine.water.populateFlora(floraInstances);
        }

        return water;
    },

    spawnContainer: (ctx: SectorBuildContext, x: number, z: number, rotation: number, colorOverride?: number, addSnow: boolean = true) => {
        const container = ObjectGenerator.createContainer(colorOverride, addSnow);
        container.position.set(x, 0, z);
        container.rotation.y = rotation;
        GeneratorUtils.freezeStatic(container);
        ctx.scene.add(container);

        _v1_sg.set(8.0, 3.0, 2.5);
        _v2_sg.set(0, 1.5, 0);
        SectorBuilder.addObstacle(ctx, {
            mesh: container,
            position: container.position,
            quaternion: container.quaternion,
            collider: {
                type: InteractionShape.BOX,
                size: new THREE.Vector3(_v1_sg.x, _v1_sg.y, _v1_sg.z),
                center: new THREE.Vector3(_v2_sg.x, _v2_sg.y, _v2_sg.z)
            },
            physicsGroup: PhysicsGroup.OBJECT
        });

        return container;
    },

    spawnNeonSign: (ctx: SectorBuildContext, x: number, z: number, rotation: number, text: string, color: number = 0x00ffff, withBacking: boolean = true, scale: number = 1.0, backgroundColor: number = 0x050505) => {
        const sign = ObjectGenerator.createNeonSign(text, color, withBacking, scale, backgroundColor);

        sign.position.set(x, 5.5, z);
        sign.rotation.y = rotation;
        GeneratorUtils.freezeStatic(sign);
        ctx.scene.add(sign);

        return sign;
    },

    spawnStreetLight: (ctx: SectorBuildContext, x: number, z: number, rotation: number = 0) => {
        const lightGroup = ObjectGenerator.createStreetLamp();
        lightGroup.position.set(x, 0, z);
        lightGroup.rotation.y = rotation;
        GeneratorUtils.freezeStatic(lightGroup);
        ctx.scene.add(lightGroup);

        SectorBuilder.addObstacle(ctx, {
            mesh: lightGroup,
            position: lightGroup.position,
            collider: { type: InteractionShape.SPHERE, radius: 1.0 },
            physicsGroup: PhysicsGroup.OBJECT
        });

        return lightGroup;
    },

    spawnCaveLamp: (ctx: SectorBuildContext, x: number, y: number, z: number) => {
        const lamp = ObjectGenerator.createCaveLamp();
        lamp.position.set(x, y, z);
        GeneratorUtils.freezeStatic(lamp);
        ctx.scene.add(lamp);

        if (lamp.userData.logicalLights && ctx.dynamicLights) {
            const len = lamp.userData.logicalLights.length;
            for (let i = 0; i < len; i++) {
                const lData = lamp.userData.logicalLights[i];
                _v1_sg.copy(lData.offset);
                _v1_sg.applyQuaternion(lamp.quaternion);
                _v1_sg.add(lamp.position);

                ctx.dynamicLights.push({
                    isLogicalLight: true,
                    position: new THREE.Vector3(_v1_sg.x, _v1_sg.y, _v1_sg.z),
                    color: lData.color,
                    intensity: lData.intensity,
                    distance: lData.distance,
                    flickerRate: lData.flickerRate
                } as any);
            }
            lamp.userData.logicalLights = null;
        }

        return lamp;
    },

    spawnStorefrontBuilding: (ctx: SectorBuildContext, x: number, z: number, width: number, height: number, depth: number, rotation: number, opts: any = {}) => {
        const building = ObjectGenerator.createStorefrontBuilding(width, height, depth, opts);
        building.position.set(x, 0, z);
        building.rotation.y = rotation;
        GeneratorUtils.freezeStatic(building);
        ctx.scene.add(building);

        const size = building.userData.size as THREE.Vector3;
        SectorBuilder.addObstacle(ctx, {
            mesh: building,
            position: building.position,
            quaternion: building.quaternion,
            collider: { type: ColliderType.BOX, size: new THREE.Vector3(size.x, size.y, size.z) }
        });

        if (building.userData.logicalLights && ctx.dynamicLights) {
            const len = building.userData.logicalLights.length;
            for (let i = 0; i < len; i++) {
                const lData = building.userData.logicalLights[i];
                _v1_sg.copy(lData.offset);
                _v1_sg.applyQuaternion(building.quaternion);
                _v1_sg.add(building.position);

                ctx.dynamicLights.push({
                    isLogicalLight: true,
                    position: new THREE.Vector3(_v1_sg.x, _v1_sg.y, _v1_sg.z),
                    color: lData.color,
                    intensity: lData.intensity,
                    distance: lData.distance,
                    flickerRate: lData.flickerRate || 0.0
                } as any);
            }
            building.userData.logicalLights = null;
        }

        return building;
    },

    spawnNeonHeart: (ctx: SectorBuildContext, x: number, y: number, z: number, rotation: number, color: number = 0xff0000, scale: number = 1.0) => {
        const heart = ObjectGenerator.createNeonHeart(color, scale);
        heart.position.set(x, y, z);
        heart.rotation.y = rotation;
        GeneratorUtils.freezeStatic(heart);
        ctx.scene.add(heart);
        return heart;
    },

    spawnGlassStaircase: (ctx: SectorBuildContext, x: number, z: number, width: number, height: number, depth: number, rotation: number) => {
        const stairs = ObjectGenerator.createGlassStaircase(width, height, depth);

        stairs.position.set(x, 0, z);
        stairs.rotation.y = rotation;
        GeneratorUtils.freezeStatic(stairs);
        ctx.scene.add(stairs);

        _v1_sg.set(width, height, depth);
        SectorBuilder.addObstacle(ctx, {
            mesh: stairs,
            position: stairs.position,
            quaternion: stairs.quaternion,
            collider: { type: ColliderType.BOX, size: new THREE.Vector3(_v1_sg.x, _v1_sg.y, _v1_sg.z) }
        });

        return stairs;
    },

    spawnElectricPole: (ctx: SectorBuildContext, x: number, z: number, rotation: number = 0) => {
        const pole = ObjectGenerator.createElectricPole();
        pole.position.set(x, 0, z);
        pole.rotation.y = rotation;
        GeneratorUtils.freezeStatic(pole);
        ctx.scene.add(pole);

        SectorBuilder.addObstacle(ctx, { mesh: pole, collider: { type: ColliderType.SPHERE, radius: 1 } });

        return pole;
    },

    spawnContainerStack: (ctx: SectorBuildContext, x: number, z: number, rotation: number, stackHeight: number = 2, colorOverride?: number, addSnow: boolean = true) => {
        const group = new THREE.Group();
        group.position.set(x, 0, z);
        group.rotation.y = rotation;
        ctx.scene.add(group);

        for (let i = 0; i < stackHeight; i++) {
            const container = ObjectGenerator.createContainer(colorOverride, addSnow && i === stackHeight - 1);
            container.position.y = i * 2.6;
            group.add(container);
        }

        GeneratorUtils.freezeStatic(group);

        _v1_sg.set(6.0, 2.6 * stackHeight, 2.4);
        SectorBuilder.addObstacle(ctx, {
            mesh: group,
            position: group.position,
            quaternion: group.quaternion,
            collider: { type: ColliderType.BOX, size: new THREE.Vector3(_v1_sg.x, _v1_sg.y, _v1_sg.z) }
        });

        return group;
    },

    spawnVehicleStack(ctx: SectorBuildContext, x: number, z: number, rotation: number, stackIndex: number, addSnow?: boolean) {
        const maxJitter = 15;
        const posJitter = 0.25;
        const toRad = (deg: number) => deg * (Math.PI / 180);

        const vehicleStack = new THREE.Group();
        vehicleStack.position.set(x, 0, z);
        vehicleStack.rotation.y = rotation;

        let currentY = 0;

        for (let i = 0; i < stackIndex; i++) {
            const vehicle = VehicleGenerator.createVehicle(undefined, 1.0, undefined);

            _box_sg.setFromObject(vehicle);
            _v1_sg.set(0, 0, 0);
            _box_sg.getSize(_v1_sg);
            const vehicleHeight = _v1_sg.y;

            const offsetX = (Math.random() - 0.5) * posJitter;
            const offsetZ = (Math.random() - 0.5) * posJitter;

            vehicle.position.set(offsetX, currentY + (vehicleHeight / 2), offsetZ);
            vehicle.rotation.y = (Math.random() - 0.5) * toRad(maxJitter);
            vehicle.rotation.x = 0;
            vehicle.rotation.z = 0;

            vehicleStack.add(vehicle);
            currentY += vehicleHeight;
        }

        GeneratorUtils.freezeStatic(vehicleStack);
        ctx.scene.add(vehicleStack);

        _box_sg.setFromObject(vehicleStack);
        const stackSize = _box_sg.getSize(_v1_sg);
        SectorBuilder.addObstacle(ctx, {
            mesh: vehicleStack,
            position: vehicleStack.position,
            quaternion: vehicleStack.quaternion,
            collider: { type: ColliderType.BOX, size: new THREE.Vector3(stackSize.x, stackSize.y, stackSize.z) }
        });
    },

    spawnTree: (ctx: SectorBuildContext, type: 'spruce' | 'pine' | 'birch', x: number, z: number, scaleMultiplier: number = 1.0) => {
        let genType: VEGETATION_TYPE = VEGETATION_TYPE.PINE;
        if (type === 'birch') genType = VEGETATION_TYPE.BIRCH;
        if (type === 'spruce') genType = VEGETATION_TYPE.SPRUCE;

        const tree = VegetationGenerator.createTree(genType, scaleMultiplier);
        tree.position.set(x, 0, z);
        tree.rotation.y = Math.random() * Math.PI * 2;
        GeneratorUtils.freezeStatic(tree);
        ctx.scene.add(tree);

        SectorBuilder.addObstacle(ctx, {
            mesh: tree,
            position: tree.position,
            collider: { type: ColliderType.SPHERE, radius: 0.5 * scaleMultiplier }
        });
    },

    spawnEnemy: (ctx: SectorBuildContext, type: string, x: number, z: number) => {
        ctx.mapItems.push({
            id: `enemy_spawn_${x}_${z}`,
            x, z, type: MapItemType.ENEMY, label: type, color: '#f00', radius: 1, icon: null
        });
    },

    spawnBarrel: (ctx: SectorBuildContext, x: number, z: number, explosive: boolean = false, logicId?: number) => {
        const barrel = ObjectGenerator.createBarrel(explosive);
        barrel.position.set(x, 0, z);
        GeneratorUtils.freezeStatic(barrel);
        ctx.scene.add(barrel);
        SectorBuilder.addObstacle(ctx, {
            mesh: barrel,
            position: barrel.position,
            collider: { type: ColliderType.SPHERE, radius: 0.6 },
            logicId: logicId
        });
    },


    fillArea: async (ctx: SectorBuildContext, center: { x: number, z: number }, size: { width: number, height: number } | number, count: number, type: NatureFillType, avoidCenterRadius: number = 0, exclusionZones: { pos: THREE.Vector3, radius: number }[] = []) => {
        await NaturePropGenerator.fillArea(ctx, center, size, count, type, avoidCenterRadius);
    },

    fillVegetation: async (ctx: SectorBuildContext, type: VEGETATION_TYPE | VEGETATION_TYPE[], region: THREE.Vector3[] | { x: number, z: number, w: number, d: number }, density: number = 1.0) => {
        if (Array.isArray(region) && region.length >= 3) {
            const isTree = [VEGETATION_TYPE.PINE, VEGETATION_TYPE.SPRUCE, VEGETATION_TYPE.OAK, VEGETATION_TYPE.BIRCH, VEGETATION_TYPE.DEAD_TREE]
                .includes(Array.isArray(type) ? type[0] : type);
            const isWheat = (Array.isArray(type) ? type[0] : type) === VEGETATION_TYPE.WHEAT;

            if (isTree || isWheat) {
                const len = region.length;
                const pts = new Array(len);
                for (let i = 0; i < len; i++) pts[i] = { x: region[i].x, z: region[i].z };
                ctx.mapItems.push({
                    id: `veg_${region[0].x}_${region[0].z}`,
                    x: region[0].x, z: region[0].z,
                    type: isWheat ? MapItemType.WHEAT : MapItemType.FOREST,
                    label: isWheat ? 'ui.field' : 'ui.forest',
                    icon: null,
                    color: isWheat ? '#eab308' : '#16a34a',
                    radius: null, points: pts
                });
            }
        }
        await VegetationGenerator.fillArea(ctx, type, region, density);
    },

    createBoundry: (ctx: SectorBuildContext, polygon: THREE.Vector3[], name: string, isClosed: boolean = false) => {
        PathGenerator.createBoundry(ctx, polygon, name, isClosed);
    },

    createMountain: (ctx: SectorBuildContext, points: THREE.Vector3[], depth: number = 20, height: number = 15, caveConfig?: { position: THREE.Vector3, rotation?: number }) => {
        const len = points.length;
        const pts = new Array(len);
        for (let i = 0; i < len; i++) pts[i] = { x: points[i].x, z: points[i].z };

        ctx.mapItems.push({
            id: `mountain_${points[0].x}_${points[0].z}`,
            x: points[0].x, z: points[0].z,
            type: MapItemType.MOUNTAIN, label: 'ui.mountain', icon: null, color: '#64748b', radius: null, points: pts
        });

        TerrainGenerator.createMountain(ctx, points, depth, height, caveConfig);
    },

    createMountainOpening: (tunnelDepth: number = 10) => {
        return TerrainGenerator.createMountainOpening(tunnelDepth);
    },

    createForest: async (ctx: SectorBuildContext, polygon: THREE.Vector3[], spacing: number = 8, type: string | string[] = 'random') => {
        const len = polygon.length;
        const pts = new Array(len);
        for (let i = 0; i < len; i++) pts[i] = { x: polygon[i].x, z: polygon[i].z };

        ctx.mapItems.push({
            id: `forest_${polygon[0].x}_${polygon[0].z}`,
            x: polygon[0].x, z: polygon[0].z,
            type: MapItemType.FOREST, label: 'ui.forest', icon: null, color: '#16a34a', radius: null, points: pts
        });

        let genType = type;
        if (typeof type === 'string') {
            const lower = type.toLowerCase();
            if (lower === 'spruce') genType = 'SPRUCE';
            else if (lower === 'pine') genType = 'PINE';
            else if (lower === 'birch') genType = 'BIRCH';
            else if (lower === 'oak') genType = 'OAK';
            else if (lower === 'dead') genType = 'DEAD';
        }

        await VegetationGenerator.createForest(ctx, polygon, spacing, genType as any);
    },

    createFence: async (ctx: SectorBuildContext, points: THREE.Vector3[], color: 'white' | 'wood' | 'black' | 'mesh' = 'wood', height: number = 1.2, strict: boolean = false) => {
        await PathGenerator.createFence(ctx, points, color as any, height, strict);
    },

    createHedge: async (ctx: SectorBuildContext, length: number, height: number = 4, thickness: number = 1.5) => {
        const mesh = VegetationGenerator.createHedge(length, height, thickness);
        ctx.scene.add(mesh);
    },

    createHedgePath: async (ctx: SectorBuildContext, points: THREE.Vector3[], height: number = 4, thickness: number = 1.5) => {
        await VegetationGenerator.createHedgePath(ctx, points, height, thickness);
    },

    createStoneWall: async (ctx: SectorBuildContext, length: number, height: number = 1.5, thickness: number = 0.8) => {
        const mesh = VegetationGenerator.createStoneWall(length, height, thickness);
        ctx.scene.add(mesh);
    },

    createStoneWallPath: async (ctx: SectorBuildContext, points: THREE.Vector3[], height: number = 1.5, thickness: number = 0.8) => {
        await VegetationGenerator.createStoneWallPath(ctx, points, height, thickness);
    },

    createEmbankment: async (ctx: SectorBuildContext, points: THREE.Vector3[], width: number = 20, height: number = 5, material: THREE.Material = MATERIALS.dirt) => {
        await PathGenerator.createEmbankment(ctx, points, width, height, material);
    },

    createGuardrail: async (ctx: SectorBuildContext, points: THREE.Vector3[], floating: boolean = false) => {
        await PathGenerator.createGuardrail(ctx, points, floating);
    },

    spawnPoi: (ctx: SectorBuildContext, type: PoiType, x: number, z: number, rotation: number = 0, opts?: any): THREE.Group => {
        let poi: THREE.Group | null = null;
        switch (type) {
            case PoiType.CHURCH: poi = PoiGenerator.createChurch(); break;
            case PoiType.CAFE: poi = PoiGenerator.createCafe(); break;
            case PoiType.GROCERY_STORE: poi = PoiGenerator.createGroceryStore(); break;
            case PoiType.GYM: poi = PoiGenerator.createGym(); break;
            case PoiType.PIZZERIA: poi = PoiGenerator.createPizzeria(); break;
            case PoiType.FARM: poi = PoiGenerator.createFarm(); break;
            case PoiType.EGG_FARM: poi = PoiGenerator.createEggFarm(); break;
            case PoiType.BARN: poi = PoiGenerator.createBarn(); break;
            case PoiType.DEALERSHIP: poi = PoiGenerator.createDealership(); break;
            case PoiType.MAST: poi = PoiGenerator.createMast(); break;
            case PoiType.SMU: poi = PoiGenerator.createSmu(); break;
            case PoiType.CAMPFIRE:
                poi = PoiGenerator.createCampfire(opts?.scale ?? 1.0);
                if (opts?.y !== undefined) poi.position.y = opts.y;
                break;
            case PoiType.TRAIN_TUNNEL:
                if (opts?.points) poi = PoiGenerator.createTrainTunnel(opts.points);
                break;
        }

        if (!poi) return new THREE.Group();

        poi.position.set(x, 0, z);
        poi.rotation.y = rotation;
        poi.updateMatrixWorld(true);

        const ud = poi.userData;

        // Manual sync for frozen objects
        poi.updateMatrix();
        poi.updateMatrixWorld();

        ctx.scene.add(poi);

        // Auto-register Colliders
        if (ud.colliders && Array.isArray(ud.colliders)) {
            const len = ud.colliders.length;
            for (let i = 0; i < len; i++) {
                const c = ud.colliders[i];
                _v1_sg.set(x, 0, z);
                if (c.offset) {
                    _v3.copy(c.offset).applyAxisAngle(_up, rotation);
                    _v1_sg.add(_v3);
                }

                SectorBuilder.addObstacle(ctx, {
                    position: new THREE.Vector3(_v1_sg.x, _v1_sg.y, _v1_sg.z),
                    quaternion: new THREE.Quaternion().setFromAxisAngle(_up, rotation),
                    collider: { type: c.type, size: c.size, radius: c.radius }
                });
            }
        } else if (ud.size) {
            SectorBuilder.addObstacle(ctx, {
                position: new THREE.Vector3(x, 0, z),
                quaternion: new THREE.Quaternion().setFromAxisAngle(_up, rotation),
                collider: { type: ColliderType.BOX, size: ud.size }
            });
        }

        // Auto-register FX
        if (ud.effects && Array.isArray(ud.effects)) {
            const len = ud.effects.length;
            for (let i = 0; i < len; i++) {
                const fx = ud.effects[i];
                if (fx.type === EffectType.FIRE) {
                    const target = fx.target ? poi.getObjectByName(fx.target) || poi : poi;
                    SectorBuilder.setOnFire(ctx, target, { smoke: fx.smoke, intensity: fx.intensity, distance: fx.distance, onRoof: fx.onRoof });
                }
            }
        }

        // Auto-register Lights
        if (ctx.dynamicLights) {
            poi.traverse((child) => {
                if (child.userData.needsLogicalLight) {
                    ctx.dynamicLights.push({
                        isLogicalLight: true,
                        targetObject: child,
                        color: child.userData.lightColor,
                        intensity: child.userData.lightIntensity,
                        distance: child.userData.lightDistance,
                        flickerRate: child.userData.flickerRate || 0.0
                    } as any);
                }
            });
        }

        // Neon Signs & Hearts
        if (ud.neonSign) {
            const rot = (ud.neonSign.rot || 0) + rotation;
            _v1_sg.set(x, 0, z);
            if (ud.neonSign.offset) {
                _v3.copy(ud.neonSign.offset).applyAxisAngle(_up, rotation);
                _v1_sg.add(_v3);
            }
            const backing = ud.neonSign.backingColor !== undefined;
            const bg = ud.neonSign.backingColor || 0x050505;
            const sign = ObjectGenerator.createNeonSign(ud.neonSign.text, ud.neonSign.color, backing, 1.0, bg);
            sign.position.copy(_v1_sg);
            sign.rotation.y = rot;
            ctx.scene.add(sign);
        }

        if (ud.neonHeart) {
            const rot = (ud.neonHeart.rot || 0) + rotation;
            _v1_sg.set(x, 0, z);
            if (ud.neonHeart.offset) {
                _v3.copy(ud.neonHeart.offset).applyAxisAngle(_up, rotation);
                _v1_sg.add(_v3);
            }
            SectorBuilder.spawnNeonHeart(ctx, _v1_sg.x, _v1_sg.y, _v1_sg.z, rot, 0xff0000, 2.0);
        }

        // Add staircase flicker
        if (ud.staircase) {
            _v1_sg.set(x, 0, z);
            if (ud.staircase.offset) {
                _v3.copy(ud.staircase.offset).applyAxisAngle(_up, rotation);
                _v1_sg.add(_v3);
            }
            const stairs = ObjectGenerator.createGlassStaircase(ud.staircase.width, ud.staircase.height, ud.staircase.depth);
            stairs.position.copy(_v1_sg);
            stairs.rotation.y = rotation;
            if (poi) poi.add(stairs);
        }

        return poi;
    },

    addTriggers: (ctx: SectorBuildContext, triggers: SectorTrigger[]) => {
        const len = triggers.length;
        for (let i = 0; i < len; i++) {
            const trigger = triggers[i];

            // Re-initialize statusFlags if they are missing or still in boolean format
            if (trigger.statusFlags === undefined) {
                let flags = TriggerStatus.ACTIVE;
                if ((trigger as any).triggered) flags |= TriggerStatus.TRIGGERED;
                if ((trigger as any).resetOnExit) flags |= TriggerStatus.RESET_ON_EXIT;
                trigger.statusFlags = flags;
            }

            // Buffer trigger for batch registration
            ctx.triggers.push(trigger);

            if (trigger.type === TriggerType.POI) {
                ctx.mapItems.push({
                    id: String(trigger.id || `poi_${trigger.position.x}_${trigger.position.z}`),
                    x: trigger.position.x, z: trigger.position.z,
                    type: MapItemType.POI, label: trigger.content || String(trigger.id), icon: '📍', color: '#f59e0b',
                    radius: trigger.radius || 10
                });
            }

            if (trigger.type === TriggerType.EVENT && trigger.familyId !== undefined) {
                ctx.mapItems.push({
                    id: String(trigger.id || `family_${trigger.familyId}`),
                    x: trigger.position.x, z: trigger.position.z,
                    type: MapItemType.FAMILY, label: 'ui.family_hint', icon: '❤️', color: '#ef4444',
                    radius: 12
                });
            }
        }
    },

    attachEffect: (ctx: SectorBuildContext, parent: THREE.Object3D, eff: { type: EffectType, color?: number, intensity?: number, offset?: { x: number, y: number, z: number }, onRoof?: boolean }) => {
        const oX = eff.offset?.x || 0;
        const oY = eff.offset?.y || 0;
        const oZ = eff.offset?.z || 0;

        if (eff.type === EffectType.NEON_SIGN || eff.type === EffectType.FLICKER_LIGHT || eff.type === EffectType.FIRE) {
            const isFire = eff.type === EffectType.FIRE;
            const baseColor = isFire ? 0xff6600 : (eff.color || 0xffaa00);
            const lightIntensity = isFire ? 2.0 : (eff.intensity || 1.0);
            const yOffset = isFire ? oY + 1.0 : oY;

            let flicker = 0;
            if (isFire) {
                flicker = 0.15;
            } else if ((eff.color || 0) > 0xffaa00 || !eff.color) {
                flicker = 0.05 + Math.random() * 0.1;
            }

            if (ctx.dynamicLights) {
                ctx.dynamicLights.push({
                    isLogicalLight: true,
                    targetObject: parent,
                    offset: new THREE.Vector3(oX, yOffset, oZ),
                    color: baseColor,
                    intensity: lightIntensity,
                    distance: 25.0,
                    flickerRate: flicker
                } as any);
            }
        }

        if (eff.type === EffectType.FIRE) {
            parent.userData.isFire = true;
            if (parent.userData.effects === undefined) parent.userData.effects = [];

            const isLarge = (eff as any).onRoof || (eff.intensity && eff.intensity > 100);
            const firePart = isLarge ? FXParticleType.LARGE_FIRE : FXParticleType.FLAME;
            const smokePart = isLarge ? FXParticleType.LARGE_SMOKE : FXParticleType.SMOKE;

            parent.userData.effects.push(
                { type: SubEffectType.EMITTER, particle: firePart, interval: isLarge ? 40 : 50, count: 1, offset: new THREE.Vector3(oX, oY + (isLarge ? 1.0 : 0.5), oZ), spread: isLarge ? 1.5 : 0.3, color: 0xffaa00 },
                { type: SubEffectType.EMITTER, particle: smokePart, interval: isLarge ? 80 : 150, count: 1, offset: new THREE.Vector3(oX, oY + (isLarge ? 2.0 : 1.0), oZ), spread: isLarge ? 2.0 : 0.4, color: isLarge ? 0x333333 : 0xffdd00 }
            );
        }
    },

    spawnRubble: (ctx: SectorBuildContext, x: number, z: number, count: number, material?: THREE.Material, directionBias?: number) => {
        const mesh = NaturePropGenerator.spawnRubble(ctx, x, z, count, material, directionBias);
        return mesh;
    },

    spawnTerminal: (ctx: SectorBuildContext, x: number, z: number, type: TerminalType, scale: number = 1.0) => {
        const terminal = ObjectGenerator.createTerminal(type, scale);
        terminal.position.set(x, 0, z);
        ctx.scene.add(terminal);

        _v1_sg.set(1.2 * scale, 2.0 * scale, 1.2 * scale);

        SectorBuilder.addInteractable(ctx, terminal, {
            id: 'terminal_' + type,
            type: InteractionType.SECTOR_SPECIFIC,
            subType: InteractionSubType.TERMINAL,
            label: 'ui.interact',
            collider: {
                type: InteractionShape.BOX,
                size: new THREE.Vector3(_v1_sg.x, _v1_sg.y, _v1_sg.z),
                margin: 2.0
            }
        });

        SectorBuilder.addObstacle(ctx, {
            mesh: terminal,
            position: terminal.position,
            collider: { type: ColliderType.BOX, size: new THREE.Vector3(_v1_sg.x, _v1_sg.y, _v1_sg.z) }
        });

        return terminal;
    },

    spawnFamily: (ctx: SectorBuildContext, id: FamilyMemberID, x: number, z: number, rotation: number = 0, opts?: { following?: boolean, found?: boolean, visible?: boolean }) => {
        const fmData = FAMILY_MEMBERS.find(f => f.id === id);
        if (!fmData) return null;

        // Model
        const familyMemberMesh = ModelFactory.createFamilyMember(fmData);
        familyMemberMesh.position.set(x, 0, z);
        familyMemberMesh.rotation.y = rotation;
        familyMemberMesh.userData.id = id;
        familyMemberMesh.userData.name = fmData.name;
        familyMemberMesh.userData.isFamilyMember = true;
        familyMemberMesh.visible = opts?.visible !== false;

        // Family ring
        const familyRing = new THREE.Group();
        familyRing.userData.isRing = true;
        familyRing.rotation.x = -Math.PI / 2;
        familyRing.position.y = 0.2;

        const darkColor = new THREE.Color(fmData.color.num).multiplyScalar(0.2);
        const familyRingFill = MATERIALS.familyRingFill.clone();
        familyRingFill.color.set(darkColor);
        const fill = new THREE.Mesh(GEOMETRY.familyRingFill, familyRingFill);
        familyRing.add(fill);

        const familyRingBorder = MATERIALS.familyRingBorder.clone();
        familyRingBorder.color.set(fmData.color.num);
        const border = new THREE.Mesh(GEOMETRY.familyRingBorder, familyRingBorder);
        familyRing.add(border);

        familyMemberMesh.add(familyRing);

        ctx.scene.add(familyMemberMesh);

        const memberObj = {
            mesh: familyMemberMesh,
            found: opts?.found !== false,
            following: opts?.following === true,
            rescued: opts?.found !== false,
            name: fmData.name,
            id: fmData.id,
            scale: fmData.scale,
            seed: Math.random() * 100,
            ring: familyRing,
            spawnPos: new THREE.Vector3(familyMemberMesh.position.x, familyMemberMesh.position.y, familyMemberMesh.position.z)
        };

        if (ctx.activeFamilyMembers) {
            ctx.activeFamilyMembers.push(memberObj);
        }

        return familyMemberMesh;
    }

};
