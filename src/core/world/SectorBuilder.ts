import * as THREE from 'three';
import { MATERIALS, ModelFactory } from '../../utils/assets';
import { SectorContext } from '../../game/session/SectorTypes';
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
import { SectorTrigger, TriggerType, TriggerAction, TriggerStatus } from '../../systems/TriggerTypes';
import { WaterBodyType, WaterBody } from '../../systems/WaterSystem';
import { GEOMETRY } from '../../utils/assets';
import { WinterEngine } from '../engine/WinterEngine';
import { LIGHT_SYSTEM, FAMILY_MEMBERS, FamilyMemberID } from '../../content/constants';
import { EnemyType } from '../../entities/enemies/EnemyTypes';
import { MaterialType, VEGETATION_TYPE } from '../../content/environment';
import { POI_TYPE } from '../../content/pois';
import { FootprintSystem } from '../../systems/FootprintSystem';
import { PoiGenerator } from './generators/PoiGenerator';
import { InteractionType } from '../../systems/InteractionTypes';
import { NavigationSystem } from '../../systems/NavigationSystem';
import { PhysicsGroup } from './CollisionResolution';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1_sg = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _q1_sg = new THREE.Quaternion();
const _box_sg = new THREE.Box3();
const _axisY = new THREE.Vector3(0, 1, 0);

// VINTERDÖD: Nya gränssnitt för den datadrivna interaktionen
export interface InteractionCollider {
    type: 'sphere' | 'box';
    radius?: number;       // For sphere
    size?: THREE.Vector3;  // For box
    margin?: number;       // Extra reach padding (default: 2.0)
}

export interface InteractableParams {
    id?: string;
    label?: string;
    type?: InteractionType;
    collider?: InteractionCollider;

    // Legacy support (Converted to collider automatically)
    radius?: number;
}

export const SectorBuilder = {

    addObstacle: (ctx: SectorContext, obstacle: any) => {
        // Zero-GC check instead of .includes()
        let exists = false;
        for (let i = 0; i < ctx.obstacles.length; i++) {
            if (ctx.obstacles[i] === obstacle) {
                exists = true;
                break;
            }
        }
        if (!exists) ctx.obstacles.push(obstacle);

        // Auto-calculate radius for Box colliders if missing
        if (!obstacle.radius && obstacle.collider?.type === 'box' && obstacle.collider.size) {
            const s = obstacle.collider.size;
            obstacle.radius = Math.sqrt(s.x * s.x + s.z * s.z) * 0.5;
        }

        // VINTERDÖD: Mandatory material identifier propagation from mesh to obstacle
        if (!obstacle.materialId && obstacle.mesh?.userData?.materialId) {
            obstacle.materialId = obstacle.mesh.userData.materialId;
        }

        // VINTERDÖD: PhysicsGroup propagation
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

        ctx.collisionGrid.addObstacle(obstacle);
    },

    addInteractable: (ctx: SectorContext, object: THREE.Object3D, params?: InteractableParams) => {
        if (!object) return;

        object.userData.isInteractable = true;
        if (params?.id) object.userData.interactionId = params.id;
        if (params?.label) object.userData.interactionLabel = params.label;
        if (params?.type !== undefined) object.userData.interactionType = params.type;

        // Data-Driven Interaction Shapes
        if (params?.collider) {
            object.userData.interactionShape = params.collider.type;
            if (params.collider.type === 'box' && params.collider.size) {
                object.userData.interactionSize = params.collider.size;
            } else if (params.collider.type === 'sphere' && params.collider.radius) {
                object.userData.interactionRadius = params.collider.radius;
            }
            if (params.collider.margin !== undefined) {
                object.userData.interactionMargin = params.collider.margin;

                // VINTERDÖD FIX: Propagate to nested structure for consistency
                if (!object.userData.interactable) object.userData.interactable = {};
                if (!object.userData.interactable.collider) object.userData.interactable.collider = {};
                object.userData.interactable.collider.margin = params.collider.margin;
            }
        }
        // Legacy fallback
        else if (params?.radius) {
            object.userData.interactionShape = 'sphere';
            object.userData.interactionRadius = params.radius;
        }

        if (!ctx.interactables) {
            ctx.interactables = [];
        }

        // Zero-GC array inclusion check
        let exists = false;
        for (let i = 0; i < ctx.interactables.length; i++) {
            if (ctx.interactables[i] === object) {
                exists = true;
                break;
            }
        }
        if (!exists) ctx.interactables.push(object);

        ctx.collisionGrid.addInteractable(object);
    },

    generateAutomaticContent: async (ctx: SectorContext, def: any) => {
        if (def.groundType && def.groundType !== 'NONE') {
            await SectorBuilder.generateGround(ctx, def.groundType, def.groundSize || { width: 2000, depth: 2000 });
        }

        if (def.collectibles) {
            for (let i = 0; i < def.collectibles.length; i++) {
                const c = def.collectibles[i];
                const meta = getCollectibleById(c.id);
                if (meta) {
                    SectorBuilder.spawnCollectible(ctx, c.x, c.z, c.id, meta.modelType as any);
                }
                if (ctx.yield) await ctx.yield();
            }
        }

        if (ctx.yield) await ctx.yield();

        if (def.bounds) {
            SectorBuilder.generateBoundaries(ctx, def.bounds);
        }

        if (ctx.yield) await ctx.yield();
    },

    createWarmupContext: (scene: THREE.Scene, sectorId: number, yieldFn?: () => Promise<void>): SectorContext => {
        const NOOP = () => { };
        const NOOP_ARRAY = () => [] as any[];
        const STUB_GRID: any = {
            addObstacle: NOOP, removeObstacle: NOOP,
            addInteractable: NOOP, removeInteractable: NOOP,
            addTrigger: NOOP, removeTrigger: NOOP,
            updateObstacle: NOOP, updateInteractable: NOOP, clear: NOOP, update: NOOP,
            updateEnemyGrid: NOOP, clearEnemies: NOOP, fillGroundMaterial: NOOP,
            getNearbyEnemies: NOOP_ARRAY, getNearbyObstacles: NOOP_ARRAY,
            getNearbyInteractables: NOOP_ARRAY, getNearbyTriggers: NOOP_ARRAY,
        };
        return {
            scene,
            engine: null as any,
            sectorId,
            isWarmup: true,
            collisionGrid: STUB_GRID,
            obstacles: [], chests: [], triggers: [], mapItems: [],
            interactables: [], collectibles: [], dynamicLights: [],
            flickeringLights: [], burningObjects: [], smokeEmitters: [],
            cluesFound: [], collectiblesDiscovered: [],
            rng: Math.random,
            debugMode: false,
            textures: {} as any,
            sectorState: {} as any,
            state: {} as any,
            activeFamilyMembers: [],
            yield: yieldFn ?? (() => new Promise<void>(resolve => setTimeout(resolve, 0))),
            spawnZombie: NOOP as any,
            spawnHorde: NOOP as any,
            spawnBoss: NOOP as any,
            makeNoise: NOOP as any,
            onAction: NOOP as any,
        };
    },

    build: async (ctx: SectorContext, def: any) => {
        const engine = WinterEngine.getInstance();

        // Idempotency check: Clear state arrays to prevent duplication on re-renders
        if (ctx.obstacles) ctx.obstacles.length = 0;
        if (ctx.chests) ctx.chests.length = 0;
        if (ctx.interactables) ctx.interactables.length = 0;
        if (ctx.triggers) ctx.triggers.length = 0;
        if (ctx.mapItems) ctx.mapItems.length = 0;

        if (engine?.water) engine.water.clear();

        await SectorBuilder.generateAutomaticContent(ctx, def);

        const env = def.environment;
        if (env) {
            engine.syncEnvironment(env, ctx.scene);
        }

        if (def.setupEnvironment) {
            await def.setupEnvironment(ctx);
            if (ctx.yield) await ctx.yield();
        }

        const skyLight = def.environment?.skyLight;
        if (skyLight?.visible && skyLight.position && engine?.water) {
            skyLight.name = LIGHT_SYSTEM.SKY_LIGHT;
            _v1_sg.set(skyLight.position.x, skyLight.position.y || 100, skyLight.position.z);
            engine.water.setLightPosition(_v1_sg);
        }

        if (def.setupProps) await def.setupProps(ctx);
        if (def.setupContent) await def.setupContent(ctx);
        
        // VINTERDÖD: Skip expensive entity and system initialization during asset warmup
        if (!ctx.isWarmup) {
            if (def.setupZombies) await def.setupZombies(ctx);
            if (def.generate) await def.generate(ctx); // Legacy fallback

            // VINTERDÖD: Final world discovery - find all Ground_* meshes for the footprint system
            FootprintSystem.init(ctx.scene);

            // VINTERDÖD: Final block - initialize the Navigation FlowField grid
            NavigationSystem.init(ctx);
        }

        // ========================================================
        // VINTERDÖD AUTOMAGIC DEBUGGER (Zero memory overhead in production)
        // ========================================================
        if (ctx.debugMode) {
            const { DebugVisualizer } = await import('../../utils/DebugVisualizer');
            DebugVisualizer.visualizeSector(ctx, def);
        }
    },

    generateGround: async (ctx: SectorContext, type: 'SNOW' | 'GRAVEL' | 'DIRT', size: { width: number, depth: number }) => {
        const ground = TerrainGenerator.createGroundLayer(type, size.width, size.depth);
        ctx.scene.add(ground);

        // VINTERDÖD: Sync the DOD material grid
        let mat = MaterialType.SNOW;
        if (type === 'DIRT') mat = MaterialType.DIRT;
        else if (type === 'GRAVEL') mat = MaterialType.GRAVEL;
        ctx.collisionGrid.fillGroundMaterial(mat);

        const engine = WinterEngine.getInstance();
        if (engine && engine.water) {
            engine.water.registerGround(ground);
        }

        if (ctx.yield) await ctx.yield();
        return ground;
    },

    spawnCollisionBox: (ctx: SectorContext, x: number, z: number, width: number, height: number, depth: number, rotation: number = 0) => {
        _q1_sg.setFromAxisAngle(_axisY, rotation);
        SectorBuilder.addObstacle(ctx, {
            position: new THREE.Vector3(x, height / 2, z),
            quaternion: _q1_sg.clone(), // Must clone since obstacle struct needs its own reference
            collider: { type: 'box', size: new THREE.Vector3(width, height, depth) },
            physicsGroup: PhysicsGroup.WALL
        });
    },

    generateBoundaries: (ctx: SectorContext, bounds: { width: number, depth: number }) => {
        const h = 50;
        const w = bounds.width;
        const d = bounds.depth;

        if (w < 10 || d < 10) return;

        const createWall = (x: number, z: number, sx: number, sz: number) => {
            SectorBuilder.addObstacle(ctx, {
                position: new THREE.Vector3(x, h / 2, z),
                collider: { type: 'box' as const, size: new THREE.Vector3(sx, h, sz) },
                physicsGroup: PhysicsGroup.WALL
            });
        };

        createWall(0, -d / 2, w, 2);
        createWall(0, d / 2, w, 2);
        createWall(-w / 2, 0, 2, d);
        createWall(w / 2, 0, 2, d);
    },

    spawnChest: (ctx: SectorContext, x: number, z: number, type: 'standard' | 'big', rot: number = 0) => {
        const chest = ObjectGenerator.createChest(type);
        chest.position.set(x, 0, z);
        chest.rotation.y = rot;
        chest.updateMatrixWorld();
        // VINTERDÖD FIX: Manual sync for frozen objects
        chest.updateMatrix();
        chest.updateMatrixWorld();

        ctx.scene.add(chest);

        const isBig = type === 'big';
        const scale = isBig ? 1.5 : 1.0;
        const boxSize = new THREE.Vector3(1.5 * scale, 1.0 * scale, 1.0 * scale);

        // Gameplay logic & Collision
        const obs = {
            mesh: chest,
            position: chest.position,
            type: type,
            scrap: isBig ? 100 : 25,
            opened: false,
            collider: {
                type: 'box',
                size: boxSize.clone()
            },
            physicsGroup: PhysicsGroup.OBJECT
        };

        ctx.chests.push(obs);
        SectorBuilder.addObstacle(ctx, obs);
        chest.userData.chestData = obs;

        // VINTERDÖD FIX: Chests explicitly use InteractionType enum
        SectorBuilder.addInteractable(ctx, chest, {
            id: `chest_${x}_${z}`,
            type: InteractionType.CHEST,
            label: isBig ? 'ui.open_large_chest' : 'ui.open_chest',
            collider: {
                type: 'box',
                size: boxSize.clone(),
                margin: 3.5
            }
        });

        ctx.mapItems.push({
            id: `chest_${x}_${z}`,
            x, z,
            type: 'CHEST',
            label: isBig ? 'ui.large_chest' : 'ui.chest',
            icon: '📦',
            color: isBig ? '#ffd700' : '#8b4513',
            radius: null
        });
    },

    spawnCollectible: (ctx: SectorContext, x: number, z: number, id: string, type: 'phone' | 'pacifier' | 'axe' | 'scarf' | 'jacket' | 'badge' | 'diary' | 'ring' | 'teddy') => {
        if (Math.abs(x) < 0.001 && Math.abs(z) < 0.001) return;

        // Persistence Check
        const foundList = (ctx as any).collectiblesDiscovered || [];
        for (let i = 0; i < foundList.length; i++) {
            if (foundList[i] === id) return;
        }

        const group = new THREE.Group();
        group.position.set(x, 0.5, z);
        group.userData = { id, type: InteractionType.COLLECTIBLE, collectibleId: id, isCollectible: true };
        group.name = `collectible_${id}`;

        const mesh = ModelFactory.createCollectible(type);
        group.add(mesh);
        group.rotation.y = Math.random() * Math.PI * 2;

        const colorPrimary = 0x00ffff;
        const colorSecondary = 0x0088ff;

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

        // Logical light - handled by LightSystem
        const lightWorldPos = new THREE.Vector3(x, 1.7, z);
        if (ctx.dynamicLights) {
            ctx.dynamicLights.push({
                isLogicalLight: true,
                position: lightWorldPos,
                color: colorPrimary,
                baseIntensity: 3.0,
                distance: 10.0,
                flickerRate: 0.0
            } as any);
        }

        if (!group.userData.effects) group.userData.effects = [];
        group.userData.effects.push({
            type: 'emitter', particle: 'spark', interval: 100, count: 1,
            offset: new THREE.Vector3(0, 0.2, 0), spread: 0.2, color: colorPrimary, velocity: new THREE.Vector3(0, 2, 0)
        });

        ctx.scene.add(group);
        if (ctx.collectibles) ctx.collectibles.push(group);

        ctx.mapItems.push({
            id: `collectible_${id}`,
            x, z, type: 'TRIGGER', label: 'ui.collectible', icon: '🎁', color: '#ffd700', radius: null
        });

        SectorBuilder.addInteractable(ctx, group, {
            id: id,
            type: InteractionType.COLLECTIBLE,
            label: 'ui.interact_pickup_collectible',
            collider: { type: 'sphere', radius: 4.0 }
        });
    },

    spawnBoxTrigger: (ctx: SectorContext, id: string, x: number, z: number, width: number, depth: number, type: TriggerType, content: string = '', actions?: TriggerAction[], resetOnExit: boolean = false, rotation: number = 0) => {
        const trigger: SectorTrigger = {
            id,
            position: { x, z },
            size: { width, depth },
            type: type,
            content: content,
            statusFlags: TriggerStatus.ACTIVE | (resetOnExit ? TriggerStatus.RESET_ON_EXIT : TriggerStatus.NONE),
            actions: actions || [],
            rotation: rotation
        };
        ctx.triggers.push(trigger);
        ctx.collisionGrid.addTrigger(trigger);
    },

    setOnFire: (ctx: SectorContext, object: THREE.Object3D, opts?: { smoke?: boolean, color?: number, intensity?: number, distance?: number, offset?: THREE.Vector3, onRoof?: boolean, area?: THREE.Vector3 }) => {
        const finalOpts = opts ? { ...opts } : {};

        if (object.userData.size && !finalOpts.area) {
            finalOpts.area = object.userData.size as THREE.Vector3;
        }

        if (finalOpts.onRoof && !finalOpts.offset) {
            let height = 0;
            if (object.userData.size) {
                height = (object.userData.size as THREE.Vector3).y;
            } else {
                _box_sg.setFromObject(object);
                height = _box_sg.max.y - _box_sg.min.y;
            }
            finalOpts.offset = new THREE.Vector3(0, height, 0);
        }

        EffectManager.attachEffect(object, 'fire', finalOpts);

        if (ctx.burningObjects) {
            let exists = false;
            for (let i = 0; i < ctx.burningObjects.length; i++) {
                if (ctx.burningObjects[i] === object) {
                    exists = true; break;
                }
            }
            if (!exists) ctx.burningObjects.push(object);
        }
    },

    extinguishFire: (ctx: SectorContext, object: THREE.Object3D) => {
        object.userData.isFire = false;
        object.userData.effects = [];

        if (ctx.burningObjects) {
            const idx = ctx.burningObjects.indexOf(object);
            if (idx > -1) {
                ctx.burningObjects[idx] = ctx.burningObjects[ctx.burningObjects.length - 1];
                ctx.burningObjects.pop();
            }
        }

        if (ctx.flickeringLights) {
            for (let i = ctx.flickeringLights.length - 1; i >= 0; i--) {
                const fl = ctx.flickeringLights[i];
                const distSq = fl.light.position.distanceToSquared(object.position);
                if (distSq < 400) {
                    ctx.scene.remove(fl.light);
                    ctx.flickeringLights.splice(i, 1);
                }
            }
        }
    },

    spawnDeadBody: (ctx: SectorContext, x: number, z: number, type: EnemyType | 'PLAYER' | 'HUMAN', rot: number = 0, blood: boolean = true) => {
        const body = ObjectGenerator.createDeadBody(type, rot, blood);
        body.position.set(x, 0, z);
        GeneratorUtils.freezeStatic(body);
        ctx.scene.add(body);
        return body;
    },

    spawnHaybale: (ctx: SectorContext, x: number, z: number, rotation: number = 0, scale: number = 1.0) => {
        const bale = ObjectGenerator.createHaybale(scale);
        bale.position.set(x, 0, z);
        bale.rotation.y = rotation;
        GeneratorUtils.freezeStatic(bale);
        ctx.scene.add(bale);
        
        SectorBuilder.addObstacle(ctx, { 
            mesh: bale, 
            collider: { type: 'sphere' as const, radius: 1.2 * scale },
            physicsGroup: PhysicsGroup.OBJECT
        });
    },

    spawnTimberPile: (ctx: SectorContext, x: number, z: number, rotation: number = 0, scale: number = 1.0) => {
        const timber = ObjectGenerator.createTimberPile(scale);
        timber.position.set(x, 0, z);
        timber.rotation.y = rotation;
        GeneratorUtils.freezeStatic(timber);
        ctx.scene.add(timber);

        const baseSize = new THREE.Vector3(2.5, 1.5, 6.0);
        const baseCenter = new THREE.Vector3(0, 0.75, 0);

        SectorBuilder.addObstacle(ctx, {
            mesh: timber,
            position: timber.position,
            quaternion: timber.quaternion,
            collider: { type: 'box' as const, size: baseSize, center: baseCenter },
            type: 'TimberPile',
            physicsGroup: PhysicsGroup.DEBRIS
        });
    },

    spawnBuilding(ctx: SectorContext, x: number, z: number, width: number, height: number, depth: number, rotation: number, color: number, createRoof: boolean = true, withLights: boolean = false, lightProbability: number = 0.5) {
        const building = ObjectGenerator.createBuilding(width, height, depth, color, createRoof, withLights, lightProbability);

        building.position.set(x, 0, z);
        building.rotation.y = rotation;
        building.castShadow = true;
        building.receiveShadow = true;
        GeneratorUtils.freezeStatic(building);

        // VINTERDÖD FIX: Manual sync for frozen objects
        building.updateMatrix();
        building.updateMatrixWorld();

        ctx.scene.add(building);

        const hw = width / 2;
        const hd = depth / 2;
        const cos = Math.cos(rotation);
        const sin = Math.sin(rotation);

        ctx.mapItems.push({
            id: `building_${x}_${z}`,
            x, z, type: 'BUILDING', label: 'ui.building', icon: null, color: '#1e293b', radius: null,
            points: [
                { x: x + (-hw * cos - -hd * sin), z: z + (-hw * sin + -hd * cos) },
                { x: x + (hw * cos - -hd * sin), z: z + (hw * sin + -hd * cos) },
                { x: x + (hw * cos - hd * sin), z: z + (hw * sin + hd * cos) },
                { x: x + (-hw * cos - hd * sin), z: z + (-hw * sin + hd * cos) }
            ]
        });

        SectorBuilder.addObstacle(ctx, {
            mesh: building,
            position: building.position,
            quaternion: building.quaternion,
            collider: {
                type: 'box',
                size: (building.userData.size as THREE.Vector3).clone(),
            },
            physicsGroup: PhysicsGroup.WALL
        });

        return building;
    },

    createScarecrow(ctx: SectorContext, x: number, y: number) {
        const scarecrow = ObjectGenerator.createScarecrow(x, y);
        ctx.scene.add(scarecrow);
        SectorBuilder.addObstacle(ctx, { 
            mesh: scarecrow, 
            collider: { type: 'sphere', radius: 0.5 },
            physicsGroup: PhysicsGroup.OBJECT
        });
    },

    spawnVehicle: (ctx: SectorContext, x: number, z: number, rotation: number, type: 'station wagon' | 'sedan' | 'police' | 'ambulance' | 'suv' | 'minivan' | 'pickup' | 'bus' | 'tractor' | 'timber_truck' = 'station wagon', colorOverride?: number, addSnow?: boolean) => {
        const vehicle = VehicleGenerator.createVehicle(type, colorOverride, addSnow);

        _box_sg.setFromObject(vehicle);
        const size = _box_sg.getSize(new THREE.Vector3());

        vehicle.position.set(x, 0, z);
        vehicle.rotation.y = rotation;
        GeneratorUtils.freezeStatic(vehicle);

        ctx.scene.add(vehicle);

        SectorBuilder.addObstacle(ctx, {
            mesh: vehicle,
            position: vehicle.position,
            quaternion: vehicle.quaternion,
            collider: {
                type: 'box',
                size: size,
                center: new THREE.Vector3(0, size.y / 2, 0)
            },
            type: `Vehicle_${type}`,
            physicsGroup: PhysicsGroup.OBJECT
        });

        return vehicle;
    },

    spawnDriveableVehicle: (ctx: SectorContext, x: number, z: number, rotation: number, vehicleType: VehicleType, colorOverride?: number, addSnow?: boolean) => {
        const def = VEHICLES[vehicleType];
        if (!def) return null;

        const vehicleRoot = new THREE.Group();
        let visualMesh: THREE.Object3D;
        if (vehicleType === 'boat') {
            visualMesh = VehicleGenerator.createBoat();
        } else {
            const visualType = vehicleType === 'station_wagon' ? 'station wagon' : vehicleType;
            visualMesh = VehicleGenerator.createVehicle(visualType as any, colorOverride, addSnow);
        }

        vehicleRoot.add(visualMesh);

        if (visualMesh.userData.lights) vehicleRoot.userData.lights = visualMesh.userData.lights;
        if (visualMesh.userData.sirenOn !== undefined) vehicleRoot.userData.sirenOn = visualMesh.userData.sirenOn;
        if (visualMesh.userData.material) vehicleRoot.userData.material = visualMesh.userData.material;

        const spawnY = vehicleType === 'boat' ? 1.5 : 0.0;
        vehicleRoot.position.set(x, spawnY, z);
        vehicleRoot.rotation.y = rotation;

        if (vehicleType === 'boat') vehicleRoot.userData.floatOffset = 1.5;

        vehicleRoot.userData.vehicleDef = def;
        vehicleRoot.userData.velocity = new THREE.Vector3();
        vehicleRoot.userData.angularVelocity = new THREE.Vector3();
        vehicleRoot.userData.suspY = 0;
        vehicleRoot.userData.suspVelY = 0;
        vehicleRoot.userData.prevFwdSpeed = 0;
        vehicleRoot.userData._lastNoiseTime = 0;

        const boxSize = new THREE.Vector3(def.size.x, def.size.y, def.size.z);

        const obs = {
            mesh: vehicleRoot,
            position: vehicleRoot.position,
            quaternion: vehicleRoot.quaternion,
            collider: {
                type: 'box' as const,
                size: boxSize.clone(),
            },
            type: `Vehicle_${vehicleType}`,
            physicsGroup: PhysicsGroup.OBJECT
        };

        SectorBuilder.addObstacle(ctx, obs);
        vehicleRoot.userData.obstacleRef = obs;
        ctx.scene.add(vehicleRoot);

        // Driveable vehicles explicitly use InteractionType enum
        SectorBuilder.addInteractable(ctx, vehicleRoot, {
            id: `vehicle_${vehicleType}_${x}_${z}`,
            type: InteractionType.VEHICLE,
            label: 'ui.enter_vehicle',
            collider: {
                type: 'box',
                size: boxSize.clone(),
                margin: 3.0
            }
        });

        return vehicleRoot;
    },

    spawnFloatableVehicle: (ctx: SectorContext, x: number, z: number, rotation: number, vehicleType: VehicleType = 'boat', colorOverride?: number) => {
        return SectorBuilder.spawnDriveableVehicle(ctx, x, z, rotation, vehicleType, colorOverride, false);
    },

    addWaterBody: (ctx: SectorContext, type: WaterBodyType, x: number, z: number, width: number, depth: number, options?: { shape?: 'rect' | 'circle'; flowDirection?: THREE.Vector2; flowStrength?: number; maxDepth?: number; }): WaterBody | null => {
        const engine = WinterEngine.getInstance();
        if (!engine?.water) return null;
        return engine.water.addWaterBody(type, x, z, width, depth, options);
    },

    spawnLakeBed: (ctx: SectorContext, x: number, z: number, width: number, depth: number, floorDepth: number = 4.0, shape: 'rect' | 'circle' = 'rect') => {
        const lake = TerrainGenerator.createLakeBed(width, depth, floorDepth, shape);
        lake.position.set(x, -0.1, z);
        ctx.scene.add(lake);
        return lake;
    },

    addLake: (ctx: SectorContext, x: number, z: number, radius: number, floorDepth: number = 5.0) => {
        const water = SectorBuilder.addWaterBody(ctx, 'lake', x, z, radius * 2, radius * 2, { shape: 'circle', maxDepth: floorDepth });
        SectorBuilder.spawnLakeBed(ctx, x, z, radius * 2, radius * 2, floorDepth, 'circle');

        ctx.mapItems.push({
            id: `lake_${x}_${z}`,
            x, z, type: 'LAKE', label: 'ui.lake', icon: null, color: '#3b82f6', radius, points: null
        });

        const numProps = Math.floor(radius * radius * 0.05);
        const floraInstances: any[] = [];

        for (let i = 0; i < numProps; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = Math.random() * radius * 0.9;
            const pX = x + Math.cos(angle) * r;
            const pZ = z + Math.sin(angle) * r;

            const rand = Math.random();
            const distSq = (pX - x) * (pX - x) + (pZ - z) * (pZ - z);
            const distFromCenter = Math.sqrt(distSq);

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
                    type: 'seaweed',
                    position: new THREE.Vector3(pX, -currentDepth + 0.1, pZ),
                    rotationY: Math.random() * Math.PI,
                    scale: { x: 1.0 + Math.random() * 0.5, y: 1.5 + Math.random() * 2, z: 1.0 }
                });
            } else {
                const lilyScale = 0.8 + Math.random() * 0.4;
                floraInstances.push({
                    type: 'lily',
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

    spawnContainer: (ctx: SectorContext, x: number, z: number, rotation: number, colorOverride?: number, addSnow: boolean = true) => {
        const container = ObjectGenerator.createContainer(colorOverride, addSnow);
        container.position.set(x, 0, z);
        container.rotation.y = rotation;
        GeneratorUtils.freezeStatic(container);
        ctx.scene.add(container);

        SectorBuilder.addObstacle(ctx, {
            mesh: container,
            position: container.position,
            quaternion: container.quaternion,
            collider: {
                type: 'box',
                size: new THREE.Vector3(8.0, 3.0, 2.5),
                center: new THREE.Vector3(0, 1.5, 0)
            },
            physicsGroup: PhysicsGroup.OBJECT
        });

        return container;
    },

    spawnNeonSign: (ctx: SectorContext, x: number, z: number, rotation: number, text: string, color: number = 0x00ffff, withBacking: boolean = true, scale: number = 1.0, backgroundColor: number = 0x050505) => {
        const sign = ObjectGenerator.createNeonSign(text, color, withBacking, scale, backgroundColor);

        sign.position.set(x, 5.5, z);
        sign.rotation.y = rotation;
        GeneratorUtils.freezeStatic(sign);
        ctx.scene.add(sign);

        return sign;
    },

    spawnStreetLight: (ctx: SectorContext, x: number, z: number, rotation: number = 0) => {
        const lightGroup = ObjectGenerator.createStreetLamp();
        lightGroup.position.set(x, 0, z);
        lightGroup.rotation.y = rotation;
        GeneratorUtils.freezeStatic(lightGroup);
        ctx.scene.add(lightGroup);
        
        SectorBuilder.addObstacle(ctx, { 
            mesh: lightGroup, 
            position: lightGroup.position, 
            collider: { type: 'sphere', radius: 1.0 },
            physicsGroup: PhysicsGroup.OBJECT
        });

        return lightGroup;
    },

    spawnCaveLamp: (ctx: SectorContext, x: number, y: number, z: number) => {
        const lamp = ObjectGenerator.createCaveLamp();
        lamp.position.set(x, y, z);
        GeneratorUtils.freezeStatic(lamp);
        ctx.scene.add(lamp);

        if (lamp.userData.logicalLights && ctx.dynamicLights) {
            for (let i = 0; i < lamp.userData.logicalLights.length; i++) {
                const lData = lamp.userData.logicalLights[i];
                const worldPos = new THREE.Vector3().copy(lData.offset);
                worldPos.applyQuaternion(lamp.quaternion);
                worldPos.add(lamp.position);

                ctx.dynamicLights.push({
                    isLogicalLight: true,
                    position: worldPos,
                    color: lData.color,
                    baseIntensity: lData.baseIntensity,
                    distance: lData.distance,
                    flickerRate: lData.flickerRate
                } as any);
            }
            lamp.userData.logicalLights = null;
        }

        return lamp;
    },

    spawnStorefrontBuilding: (ctx: SectorContext, x: number, z: number, width: number, height: number, depth: number, rotation: number, opts: any = {}) => {
        const building = ObjectGenerator.createStorefrontBuilding(width, height, depth, opts);
        building.position.set(x, 0, z);
        building.rotation.y = rotation;
        GeneratorUtils.freezeStatic(building);
        ctx.scene.add(building);

        const size = building.userData.size;
        SectorBuilder.addObstacle(ctx, {
            mesh: building,
            position: building.position,
            quaternion: building.quaternion,
            collider: { type: 'box', size: size.clone() }
        });

        if (building.userData.logicalLights && ctx.dynamicLights) {
            for (let i = 0; i < building.userData.logicalLights.length; i++) {
                const lData = building.userData.logicalLights[i];
                const worldPos = new THREE.Vector3().copy(lData.offset);
                worldPos.applyQuaternion(building.quaternion);
                worldPos.add(building.position);

                ctx.dynamicLights.push({
                    isLogicalLight: true,
                    position: worldPos,
                    color: lData.color,
                    baseIntensity: lData.baseIntensity,
                    distance: lData.distance,
                    flickerRate: lData.flickerRate || 0.0
                } as any);
            }
            building.userData.logicalLights = null;
        }

        return building;
    },

    spawnNeonHeart: (ctx: SectorContext, x: number, y: number, z: number, rotation: number, color: number = 0xff0000, scale: number = 1.0) => {
        const heart = ObjectGenerator.createNeonHeart(color, scale);
        heart.position.set(x, y, z);
        heart.rotation.y = rotation;
        GeneratorUtils.freezeStatic(heart);
        ctx.scene.add(heart);
        return heart;
    },

    spawnGlassStaircase: (ctx: SectorContext, x: number, z: number, width: number, height: number, depth: number, rotation: number) => {
        const stairs = ObjectGenerator.createGlassStaircase(width, height, depth);

        stairs.position.set(x, 0, z);
        stairs.rotation.y = rotation;
        GeneratorUtils.freezeStatic(stairs);
        ctx.scene.add(stairs);

        SectorBuilder.addObstacle(ctx, {
            mesh: stairs,
            position: stairs.position,
            quaternion: stairs.quaternion,
            collider: { type: 'box', size: new THREE.Vector3(width, height, depth) }
        });

        return stairs;
    },

    spawnElectricPole: (ctx: SectorContext, x: number, z: number, rotation: number = 0) => {
        const pole = ObjectGenerator.createElectricPole();
        pole.position.set(x, 0, z);
        pole.rotation.y = rotation;
        GeneratorUtils.freezeStatic(pole);
        ctx.scene.add(pole);

        SectorBuilder.addObstacle(ctx, { mesh: pole, collider: { type: 'sphere', radius: 1 } });

        return pole;
    },

    spawnContainerStack: (ctx: SectorContext, x: number, z: number, rotation: number, stackHeight: number = 2, colorOverride?: number, addSnow: boolean = true) => {
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

        SectorBuilder.addObstacle(ctx, {
            mesh: group,
            position: group.position,
            quaternion: group.quaternion,
            collider: { type: 'box', size: new THREE.Vector3(6.0, 2.6 * stackHeight, 2.4) }
        });

        return group;
    },

    spawnVehicleStack(ctx: SectorContext, x: number, z: number, rotation: number, stackIndex: number, addSnow?: boolean) {
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
            const size = _box_sg.getSize(new THREE.Vector3());
            const vehicleHeight = size.y;

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
        const stackSize = _box_sg.getSize(new THREE.Vector3());
        SectorBuilder.addObstacle(ctx, {
            mesh: vehicleStack,
            position: vehicleStack.position,
            quaternion: vehicleStack.quaternion,
            collider: { type: 'box' as const, size: stackSize }
        });
    },

    spawnTree: (ctx: SectorContext, type: 'spruce' | 'pine' | 'birch', x: number, z: number, scaleMultiplier: number = 1.0) => {
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
            collider: { type: 'sphere', radius: 0.5 * scaleMultiplier }
        });
    },

    spawnEnemy: (ctx: SectorContext, type: string, x: number, z: number) => {
        ctx.mapItems.push({
            id: `enemy_spawn_${x}_${z}`,
            x, z, type: 'ENEMY', label: type, color: '#f00', radius: 1, icon: null
        });
    },

    spawnBarrel: (ctx: SectorContext, x: number, z: number, explosive: boolean = false) => {
        const barrel = ObjectGenerator.createBarrel(explosive);
        barrel.position.set(x, 0, z);
        GeneratorUtils.freezeStatic(barrel);
        ctx.scene.add(barrel);
        SectorBuilder.addObstacle(ctx, { mesh: barrel, position: barrel.position, collider: { type: 'sphere', radius: 0.6 } });
    },

    updateAtmosphere: (dt: number, now: number, playerPos: THREE.Vector3, gameState: any, sectorState: any, events: any, sectorDef: any, zones?: any[]) => {
        const engine = WinterEngine.getInstance();
        if (engine && playerPos) {
            engine.updateAtmosphere(playerPos, sectorDef.environment, zones, sectorState, dt);
        }
    },

    fillArea: async (ctx: SectorContext, center: { x: number, z: number }, size: { width: number, height: number } | number, count: number, type: 'tree' | 'rock' | 'debris', avoidCenterRadius: number = 0, exclusionZones: { pos: THREE.Vector3, radius: number }[] = []) => {
        await NaturePropGenerator.fillArea(ctx, center, size, count, type, avoidCenterRadius);
    },

    fillVegetation: (ctx: SectorContext, type: VEGETATION_TYPE | VEGETATION_TYPE[], region: THREE.Vector3[] | { x: number, z: number, w: number, d: number }, density: number = 1.0) => {
        // Register polygon-based regions on the minimap
        if (Array.isArray(region) && region.length >= 3) {
            const isTree = [VEGETATION_TYPE.PINE, VEGETATION_TYPE.SPRUCE, VEGETATION_TYPE.OAK, VEGETATION_TYPE.BIRCH, VEGETATION_TYPE.DEAD_TREE]
                .includes(Array.isArray(type) ? type[0] : type);
            const isWheat = (Array.isArray(type) ? type[0] : type) === VEGETATION_TYPE.WHEAT;

            if (isTree || isWheat) {
                const pts = new Array(region.length);
                for (let i = 0; i < region.length; i++) pts[i] = { x: (region as THREE.Vector3[])[i].x, z: (region as THREE.Vector3[])[i].z };
                ctx.mapItems.push({
                    id: `veg_${(region as THREE.Vector3[])[0].x}_${(region as THREE.Vector3[])[0].z}`,
                    x: (region as THREE.Vector3[])[0].x, z: (region as THREE.Vector3[])[0].z,
                    type: isWheat ? 'WHEAT' : 'FOREST',
                    label: isWheat ? 'ui.field' : 'ui.forest',
                    icon: null,
                    color: isWheat ? '#eab308' : '#16a34a',
                    radius: null, points: pts
                });
            }
        }
        VegetationGenerator.fillArea(ctx, type, region, density);
    },


    createBoundry: (ctx: SectorContext, polygon: THREE.Vector3[], name: string) => {
        PathGenerator.createBoundry(ctx, polygon, name);
    },

    createMountain: (ctx: SectorContext, points: THREE.Vector3[], depth: number = 20, height: number = 15, caveConfig?: { position: THREE.Vector3, rotation?: number }) => {
        const pts = new Array(points.length);
        for (let i = 0; i < points.length; i++) pts[i] = { x: points[i].x, z: points[i].z };

        ctx.mapItems.push({
            id: `mountain_${points[0].x}_${points[0].z}`,
            x: points[0].x, z: points[0].z,
            type: 'MOUNTAIN', label: 'ui.mountain', icon: null, color: '#64748b', radius: null, points: pts
        });

        TerrainGenerator.createMountain(ctx, points, depth, height, caveConfig);
    },

    createMountainOpening: (tunnelDepth: number = 10) => {
        return TerrainGenerator.createMountainOpening(tunnelDepth);
    },

    createForest: (ctx: SectorContext, polygon: THREE.Vector3[], spacing: number = 8, type: string | string[] = 'random') => {
        const pts = new Array(polygon.length);
        for (let i = 0; i < polygon.length; i++) pts[i] = { x: polygon[i].x, z: polygon[i].z };

        ctx.mapItems.push({
            id: `forest_${polygon[0].x}_${polygon[0].z}`,
            x: polygon[0].x, z: polygon[0].z,
            type: 'FOREST', label: 'ui.forest', icon: null, color: '#16a34a', radius: null, points: pts
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

        VegetationGenerator.createForest(ctx, polygon, spacing, genType as any);
    },

    createFence: (ctx: SectorContext, points: THREE.Vector3[], color: 'white' | 'wood' | 'black' | 'mesh' = 'wood', height: number = 1.2, strict: boolean = false) => {
        PathGenerator.createFence(ctx, points, color as any, height, strict);
    },

    createHedge: (ctx: SectorContext, points: THREE.Vector3[], height: number = 4, thickness: number = 1.5) => {
        PathGenerator.createHedge(ctx, points, height, thickness);
    },

    createStoneWall: (ctx: SectorContext, points: THREE.Vector3[], height: number = 1.5, thickness: number = 0.8) => {
        PathGenerator.createStoneWall(ctx, points, height, thickness);
    },

    createEmbankment: (ctx: SectorContext, points: THREE.Vector3[], width: number = 20, height: number = 5, material: THREE.Material = MATERIALS.dirt) => {
        return PathGenerator.createEmbankment(ctx, points, width, height, material);
    },

    createGuardrail: (ctx: SectorContext, points: THREE.Vector3[], floating: boolean = false) => {
        return PathGenerator.createGuardrail(ctx, points, floating);
    },

    spawnPoi: (ctx: SectorContext, type: POI_TYPE, x: number, z: number, rotation: number = 0, opts?: any): THREE.Group => {
        let poi: THREE.Group | null = null;
        switch (type) {
            case POI_TYPE.CHURCH: poi = PoiGenerator.createChurch(); break;
            case POI_TYPE.CAFE: poi = PoiGenerator.createCafe(); break;
            case POI_TYPE.GROCERY_STORE: poi = PoiGenerator.createGroceryStore(); break;
            case POI_TYPE.GYM: poi = PoiGenerator.createGym(); break;
            case POI_TYPE.PIZZERIA: poi = PoiGenerator.createPizzeria(); break;
            case POI_TYPE.FARM: poi = PoiGenerator.createFarm(); break;
            case POI_TYPE.EGG_FARM: poi = PoiGenerator.createEggFarm(); break;
            case POI_TYPE.BARN: poi = PoiGenerator.createBarn(); break;
            case POI_TYPE.DEALERSHIP: poi = PoiGenerator.createDealership(); break;
            case POI_TYPE.MAST: poi = PoiGenerator.createMast(); break;
            case POI_TYPE.SMU: poi = PoiGenerator.createSmu(); break;
            case POI_TYPE.CAMPFIRE:
                poi = PoiGenerator.createCampfire(opts?.scale ?? 1.0);
                if (opts?.y !== undefined) poi.position.y = opts.y;
                break;
            case POI_TYPE.TRAIN_TUNNEL:
                if (opts?.points) poi = PoiGenerator.createTrainTunnel(opts.points);
                break;
        }

        if (!poi) return new THREE.Group();

        poi.position.set(x, 0, z);
        poi.rotation.y = rotation;
        poi.updateMatrixWorld(true);

        const ud = poi.userData;

        // VINTERDÖD FIX: Manual sync for frozen objects
        poi.updateMatrix();
        poi.updateMatrixWorld();

        ctx.scene.add(poi);

        // Auto-register Colliders
        if (ud.colliders && Array.isArray(ud.colliders)) {
            for (let i = 0; i < ud.colliders.length; i++) {
                const c = ud.colliders[i];
                const wPos = new THREE.Vector3(x, 0, z);
                if (c.offset) {
                    _v3.copy(c.offset).applyAxisAngle(_up, rotation);
                    wPos.add(_v3);
                }

                SectorBuilder.addObstacle(ctx, {
                    position: wPos,
                    quaternion: new THREE.Quaternion().setFromAxisAngle(_up, rotation),
                    collider: { type: c.type, size: c.size, radius: c.radius }
                });
            }
        } else if (ud.size) {
            SectorBuilder.addObstacle(ctx, {
                position: new THREE.Vector3(x, 0, z),
                quaternion: new THREE.Quaternion().setFromAxisAngle(_up, rotation),
                collider: { type: 'box', size: ud.size }
            });
        }

        // Auto-register FX
        if (ud.effects && Array.isArray(ud.effects)) {
            for (let i = 0; i < ud.effects.length; i++) {
                const fx = ud.effects[i];
                if (fx.type === 'fire') {
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
                        baseIntensity: child.userData.lightIntensity,
                        distance: child.userData.lightDistance,
                        flickerRate: child.userData.flickerRate || 0.0
                    } as any);
                }
            });
        }

        // Neon Signs & Hearts
        if (ud.neonSign) {
            const rot = (ud.neonSign.rot || 0) + rotation;
            const wPos = new THREE.Vector3(x, 0, z);
            if (ud.neonSign.offset) {
                _v3.copy(ud.neonSign.offset).applyAxisAngle(_up, rotation);
                wPos.add(_v3);
            }
            const backing = ud.neonSign.backingColor !== undefined;
            const bg = ud.neonSign.backingColor || 0x050505;
            const sign = ObjectGenerator.createNeonSign(ud.neonSign.text, ud.neonSign.color, backing, 1.0, bg);
            sign.position.copy(wPos);
            sign.rotation.y = rot;
            ctx.scene.add(sign);
        }

        if (ud.neonHeart) {
            const rot = (ud.neonHeart.rot || 0) + rotation;
            const wPos = new THREE.Vector3(x, 0, z);
            if (ud.neonHeart.offset) {
                _v3.copy(ud.neonHeart.offset).applyAxisAngle(_up, rotation);
                wPos.add(_v3);
            }
            // Spawn neon heart via ObjectGenerator.createNeonHeart ? wait there's one in SectorBuilder.
            SectorBuilder.spawnNeonHeart(ctx, wPos.x, wPos.y, wPos.z, rot, 0xff0000, 2.0);
        }

        // Add staircase flicker
        if (ud.staircase) {
            const stairPos = new THREE.Vector3(x, 0, z);
            if (ud.staircase.offset) {
                _v3.copy(ud.staircase.offset).applyAxisAngle(_up, rotation);
                stairPos.add(_v3);
            }
            const stairs = ObjectGenerator.createGlassStaircase(ud.staircase.width, ud.staircase.height, ud.staircase.depth);
            stairs.position.copy(stairPos);
            stairs.rotation.y = rotation;
            poi.add(stairs); // adding directly to poi instead to keep it encapsulated
        }

        return poi;
    },

    addTriggers: (ctx: SectorContext, triggers: SectorTrigger[]) => {
        for (let i = 0; i < triggers.length; i++) {
            const trigger = triggers[i];

            // Re-initialize statusFlags if they are missing or still in boolean format
            if (trigger.statusFlags === undefined) {
                let flags = TriggerStatus.ACTIVE;
                if ((trigger as any).triggered) flags |= TriggerStatus.TRIGGERED;
                if ((trigger as any).resetOnExit) flags |= TriggerStatus.RESET_ON_EXIT;
                trigger.statusFlags = flags;
            }

            ctx.triggers.push(trigger);
            ctx.collisionGrid.addTrigger(trigger);

            if (trigger.type === TriggerType.POI) {
                ctx.mapItems.push({
                    id: trigger.id || `poi_${trigger.position.x}_${trigger.position.z}`,
                    x: trigger.position.x, z: trigger.position.z,
                    type: 'POI', label: trigger.content || trigger.id, icon: '📍', color: '#f59e0b',
                    radius: trigger.radius || 10
                });
            }

            if (trigger.type === TriggerType.EVENT && trigger.familyId !== undefined) {
                ctx.mapItems.push({
                    id: trigger.id || `family_${trigger.familyId}`,
                    x: trigger.position.x, z: trigger.position.z,
                    type: 'FAMILY', label: 'ui.family_hint', icon: '❤️', color: '#ef4444',
                    radius: 12
                });
            }
        }
    },

    attachEffect: (ctx: SectorContext, parent: THREE.Object3D, eff: { type: string, color?: number, intensity?: number, offset?: { x: number, y: number, z: number } }) => {
        const oX = eff.offset?.x || 0;
        const oY = eff.offset?.y || 0;
        const oZ = eff.offset?.z || 0;

        if (eff.type === 'light' || eff.type === 'fire') {
            const isFire = eff.type === 'fire';
            const baseColor = isFire ? 0xff6600 : (eff.color || 0xffaa00);
            const baseIntensity = isFire ? 2.0 : (eff.intensity || 1.0);
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
                    baseIntensity: baseIntensity,
                    distance: 25.0,
                    flickerRate: flicker
                } as any);
            }
        }

        if (eff.type === 'fire') {
            parent.userData.isFire = true;
            if (parent.userData.effects === undefined) parent.userData.effects = [];

            const isLarge = (eff as any).onRoof || (eff.intensity && eff.intensity > 100);
            const firePart = isLarge ? 'large_fire' : 'flame';
            const smokePart = isLarge ? 'large_smoke' : 'smoke';

            parent.userData.effects.push(
                { type: 'emitter', particle: firePart, interval: isLarge ? 40 : 50, count: 1, offset: new THREE.Vector3(oX, oY + (isLarge ? 1.0 : 0.5), oZ), spread: isLarge ? 1.5 : 0.3, color: 0xffaa00 },
                { type: 'emitter', particle: smokePart, interval: isLarge ? 80 : 150, count: 1, offset: new THREE.Vector3(oX, oY + (isLarge ? 2.0 : 1.0), oZ), spread: isLarge ? 2.0 : 0.4, color: isLarge ? 0x333333 : 0xffdd00 }
            );
        }
    },

    spawnRubble: (ctx: SectorContext, x: number, z: number, count: number, material?: THREE.Material, directionBias?: number) => {
        const mesh = NaturePropGenerator.spawnRubble(ctx, x, z, count, material, directionBias);
        return mesh;
    },

    spawnTerminal: (ctx: SectorContext, x: number, z: number, type: 'TERMINAL_ARMORY' | 'TERMINAL_SPAWNER' | 'TERMINAL_ENV' | 'TERMINAL_SKILLS', scale: number = 1.0) => {
        const terminal = ObjectGenerator.createTerminal(type.replace('TERMINAL_', '') as any, scale);
        terminal.position.set(x, 0, z);
        ctx.scene.add(terminal);

        const boxSize = new THREE.Vector3(1.2 * scale, 2.0 * scale, 1.2 * scale);

        SectorBuilder.addInteractable(ctx, terminal, {
            id: type,
            type: InteractionType.SECTOR_SPECIFIC,
            label: 'ui.interact',
            collider: {
                type: 'box',
                size: boxSize,
                margin: 2.0
            }
        });

        SectorBuilder.addObstacle(ctx, {
            mesh: terminal,
            position: terminal.position,
            collider: { type: 'box', size: boxSize }
        });

        return terminal;
    },

    spawnFamily: (ctx: SectorContext, id: FamilyMemberID, x: number, z: number, rotation: number = 0, opts?: { following?: boolean, found?: boolean, visible?: boolean }) => {
        const fmData = FAMILY_MEMBERS.find(f => f.id === id);
        if (!fmData) return null;

        const mesh = ModelFactory.createFamilyMember(fmData);
        mesh.position.set(x, 0, z);
        mesh.rotation.y = rotation;
        mesh.userData.id = id;
        mesh.userData.name = fmData.name;
        mesh.userData.isFamilyMember = true;
        mesh.visible = opts?.visible !== false;

        // VINTERDÖD: Pulsing marker ring
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

        ctx.scene.add(mesh);

        const memberObj = {
            mesh,
            found: opts?.found !== false, 
            following: opts?.following === true,
            rescued: opts?.found !== false, 
            name: fmData.name,
            id: fmData.id,
            scale: fmData.scale,
            seed: Math.random() * 100,
            ring: markerGroup,
            spawnPos: mesh.position.clone()
        };

        if (ctx.activeFamilyMembers) {
            ctx.activeFamilyMembers.push(memberObj);
        }

        return mesh;
    }

};