import * as THREE from 'three';
import { GEOMETRY, MATERIALS, createTextSprite, ModelFactory } from '../../utils/assets';
import { SectorContext } from '../../types/SectorEnvironment';
import { ObjectGenerator } from './ObjectGenerator';
import { EnvironmentGenerator } from './EnvironmentGenerator';
import { PathGenerator } from './PathGenerator';
import { EffectManager } from '../systems/EffectManager';
import { getCollectibleById } from '../../content/collectibles';
import { VEHICLES, VehicleType } from '../../content/vehicles';
import { SectorTrigger, TriggerType, TriggerAction } from '../../types';
import { WaterBodyType, WaterStyle, WaterBody } from '../systems/WaterSystem';
import { Engine } from '../engine/Engine';

// Shared Utilities for Sector Generation
const _c1 = new THREE.Color();
const _c2 = new THREE.Color();
const _v1_sg = new THREE.Vector3();

export const SectorGenerator = {

    addObstacle: (ctx: SectorContext, obstacle: any) => {
        // Ensure it's in the legacy list
        if (!ctx.obstacles.includes(obstacle)) {
            ctx.obstacles.push(obstacle);
        }

        // Auto-calculate radius for Box colliders if missing (CRITICAL for SpatialGrid)
        if (!obstacle.radius && obstacle.collider?.type === 'box' && obstacle.collider.size) {
            // Radius needed to cover the box diagonal in XZ plane
            const s = obstacle.collider.size;
            obstacle.radius = Math.sqrt(s.x * s.x + s.z * s.z) / 2;
        }

        // Update matrixWorld if mesh exists (legacy/visual objects)
        if (obstacle.mesh) {
            obstacle.mesh.updateMatrixWorld(true);
            // Ensure position is set if not provided explicitly
            if (!obstacle.position) {
                obstacle.position = obstacle.mesh.position;
            }
        }

        if (!obstacle.position) {
            console.warn('[SectorGenerator] Attempted to add obstacle without position or mesh:', obstacle);
            return;
        }

        // Ensure it's in the spatial grid
        ctx.collisionGrid.addObstacle(obstacle);
    },

    addInteractable: (ctx: SectorContext, object: THREE.Object3D, params?: { id?: string, label?: string, type?: string, radius?: number }) => {
        if (!object) return;

        // Apply interaction data to the mesh
        object.userData.isInteractable = true;
        if (params?.id) object.userData.interactionId = params.id;
        if (params?.label) object.userData.interactionLabel = params.label;
        if (params?.type) object.userData.interactionType = params.type;
        if (params?.radius) object.userData.interactionRadius = params.radius;

        // Register in the sector context list
        if (ctx.interactables && !ctx.interactables.includes(object)) {
            ctx.interactables.push(object);
        }
    },

    generateAutomaticContent: async (ctx: SectorContext, def: any) => {
        if (def.groundType && def.groundType !== 'NONE') {
            await SectorGenerator.generateGround(ctx, def.groundType, def.groundSize || { width: 2000, depth: 2000 });
        }

        // Auto-Spawn Collectibles
        if (def.collectibles) {
            for (const c of def.collectibles) {
                const meta = getCollectibleById(c.id);
                if (meta) {
                    // Auto-resolve ID and Type from metadata
                    SectorGenerator.spawnCollectible(ctx, c.x, c.z, c.id, meta.modelType);
                }
                if (ctx.yield) await ctx.yield();
            }
        }

        if (ctx.yield) await ctx.yield();
        if (def.bounds) {
            SectorGenerator.generateBoundaries(ctx, def.bounds);
        }

        if (ctx.debugMode) {
            SectorGenerator.visualizeTriggers(ctx);
            if (def.bounds) {
                SectorGenerator.visualizeBounds(ctx, def.bounds);
            }
        }

        if (ctx.yield) await ctx.yield();
    },

    /*
    * Main Orchestrator for building a sector.
    * Uses the new structured lifecycle to standardize generation.
    */
    build: async (ctx: SectorContext, def: any) => {
        const engine = Engine.getInstance();

        // Clear any water bodies from the previous sector before building the new one
        if (engine?.water) engine.water.clearBodies();

        // 1. Automatic Content (Ground, Bounds, Collectibles)
        await SectorGenerator.generateAutomaticContent(ctx, def);

        // 2. Wind Configuration 
        const w = def.environment?.wind;
        if (engine?.wind) {
            const minStrength = w?.strengthMin ?? 0.02;
            const maxStrength = w?.strengthMax ?? 0.05;

            let baseAngle = 0;
            let angleVariance = w?.angleVariance ?? Math.PI;

            if (w?.direction && (w.direction.x !== 0 || w.direction.z !== 0)) {
                baseAngle = Math.atan2(w.direction.z, w.direction.x);
                angleVariance = w.angleVariance ?? (Math.PI / 4);
            }

            engine.wind.setRandomWind(minStrength, maxStrength, baseAngle, angleVariance);
        }

        // 3. Setup Environment (Lights, Fog, etc.)
        if (def.setupEnvironment) {
            await def.setupEnvironment(ctx);
            if (ctx.yield) await ctx.yield();
        }

        // 4. Setup Props (Static Objects)
        if (def.setupProps) {
            await def.setupProps(ctx);
            if (ctx.yield) await ctx.yield();
        }

        // 5. Setup Custom Content (POIs, Cinematics, Special Logic)
        if (def.setupContent) {
            await def.setupContent(ctx);
            if (ctx.yield) await ctx.yield();
        }

        // 6. Setup Zombies (Hordes, Spawning)
        if (def.setupZombies) {
            await def.setupZombies(ctx);
            if (ctx.yield) await ctx.yield();
        }

        // 7. Legacy Support (Escape Hatch)
        if (def.generate) {
            await def.generate(ctx);
        }
    },

    generateGround: async (ctx: SectorContext, type: 'SNOW' | 'GRAVEL' | 'DIRT', size: { width: number, depth: number }) => {
        let mat: THREE.MeshStandardMaterial;

        if (type === 'GRAVEL') {
            mat = MATERIALS.gravel.clone();
            mat.bumpScale = 0.5; // Increased bumpScale for gravel
        } else if (type === 'DIRT') {
            mat = MATERIALS.gravel.clone();
            mat.color.setHex(0x3d2b1f);
            mat.bumpScale = 0.5; // Increased bumpScale for dirt
        } else {
            mat = MATERIALS.snow.clone();
            mat.bumpScale = 0.5; // Increased bumpScale for snow
        }

        const geo = new THREE.PlaneGeometry(size.width, size.depth);

        // Use UV scaling on geometry instead of modifying shared texture objects (Safe & efficient)
        const repeatX = size.width / 10;
        const repeatY = size.depth / 10;
        const uvAttr = geo.attributes.uv;
        for (let i = 0; i < uvAttr.count; i++) {
            uvAttr.setXY(i, uvAttr.getX(i) * repeatX, uvAttr.getY(i) * repeatY);
            if (ctx.yield && i % 1000 === 0) await ctx.yield(); // Yield for large geometry updates
        }

        // Ensure shared textures have RepeatWrapping (set once globally)
        if (mat.map) {
            mat.map.wrapS = mat.map.wrapT = THREE.RepeatWrapping;
        }
        if (mat.bumpMap) {
            mat.bumpMap.wrapS = mat.bumpMap.wrapT = THREE.RepeatWrapping;
        }
        if ((mat as any).normalMap) {
            (mat as any).normalMap.wrapS = (mat as any).normalMap.wrapT = THREE.RepeatWrapping;
        }

        const mesh = new THREE.Mesh(geo, mat);
        mesh.name = `Ground_${type}`;
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = -0.05; // Standardized snow/ground base
        mesh.receiveShadow = true;
        ctx.scene.add(mesh);
        if (ctx.yield) await ctx.yield();
    },

    // NEW Helper for quick lightweight box obstacles
    spawnCollisionBox: (ctx: SectorContext, x: number, z: number, width: number, height: number, depth: number, rotation: number = 0) => {
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotation);
        SectorGenerator.addObstacle(ctx, {
            position: new THREE.Vector3(x, height / 2, z),
            quaternion: q,
            collider: { type: 'box', size: new THREE.Vector3(width, height, depth) }
        });
    },

    generateBoundaries: (ctx: SectorContext, bounds: { width: number, depth: number }) => {
        const wallMat = new THREE.MeshBasicMaterial({ visible: false });
        const h = 50;
        const w = bounds.width;
        const d = bounds.depth;

        // Sanity Check: Don't spawn walls if bounds are too small (Prevent center walls)
        if (w < 10 || d < 10) return;

        const createWall = (x: number, z: number, sx: number, sz: number) => {
            // Removed Dummy Mesh creation
            SectorGenerator.addObstacle(ctx, {
                position: new THREE.Vector3(x, h / 2, z),
                collider: {
                    type: 'box' as const,
                    size: new THREE.Vector3(sx, h, sz)
                }
            });
        };

        createWall(0, -d / 2, w, 2); // North
        createWall(0, d / 2, w, 2);  // South
        createWall(-w / 2, 0, 2, d); // West
        createWall(w / 2, 0, 2, d);  // East
    },

    visualizeBounds: (ctx: SectorContext, bounds: { width: number, depth: number }) => {
        const w = bounds.width;
        const d = bounds.depth;
        const geo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-w / 2, 0.5, -d / 2),
            new THREE.Vector3(w / 2, 0.5, -d / 2),
            new THREE.Vector3(w / 2, 0.5, d / 2),
            new THREE.Vector3(-w / 2, 0.5, d / 2),
            new THREE.Vector3(-w / 2, 0.5, -d / 2)
        ]);
        const mat = new THREE.LineBasicMaterial({ color: 0xff0000 });
        const line = new THREE.Line(geo, mat);
        ctx.scene.add(line);
    },

    visualizePolygon: (ctx: SectorContext, points: THREE.Vector3[], color: number = 0x00ff00, yOffset: number = 1) => {
        if (!ctx.debugMode) return;
        const pts = [...points, points[0]]; // Close loop
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const mat = new THREE.LineBasicMaterial({ color });
        const line = new THREE.Line(geo, mat);
        line.position.y = yOffset;
        ctx.scene.add(line);
    },

    visualizePath: (ctx: SectorContext, points: THREE.Vector3[], color: number = 0x0000ff, yOffset: number = 0) => {
        if (!ctx.debugMode) return;
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const mat = new THREE.LineBasicMaterial({ color });
        const line = new THREE.Line(geo, mat);
        line.position.y = yOffset;
        ctx.scene.add(line);
    },

    spawnChest: (ctx: SectorContext, x: number, z: number, type: 'standard' | 'big', rot: number = 0) => {
        const chest = new THREE.Group();
        chest.position.set(x, 0, z);
        chest.rotation.y = rot;
        const isBig = type === 'big';

        const body = new THREE.Mesh(GEOMETRY.chestBody, isBig ? MATERIALS.chestBig : MATERIALS.chestStandard);
        body.position.y = 0.5;
        body.castShadow = true;
        chest.add(body);
        const lid = new THREE.Mesh(GEOMETRY.chestLid, isBig ? MATERIALS.chestBig : MATERIALS.chestStandard);
        lid.position.y = 1.2;
        lid.castShadow = true;
        chest.add(lid);

        // Yellow Glow for unlooted chests
        const glow = new THREE.PointLight(0xffcc00, 4, 20);
        glow.position.set(0, 1.5, 0);
        glow.name = 'chestLight';
        chest.add(glow);

        ctx.scene.add(chest);
        const obs = { mesh: chest, position: chest.position, type, scrap: isBig ? 100 : 25, radius: 2, opened: false };
        ctx.chests.push(obs);
        SectorGenerator.addObstacle(ctx, { mesh: chest, position: chest.position, collider: { type: 'sphere', radius: 2 } });

        if (ctx.dynamicLights) ctx.dynamicLights.push(glow);

        ctx.mapItems.push({
            id: `chest_${Math.random()}`,
            x, z,
            type: 'CHEST',
            label: isBig ? 'ui.large_chest' : 'ui.chest',
            icon: '📦',
            color: isBig ? '#ffd700' : '#8b4513'
        });
    },

    spawnCollectible: (ctx: SectorContext, x: number, z: number, id: string, type: 'phone' | 'pacifier' | 'axe' | 'scarf' | 'jacket' | 'badge' | 'diary' | 'ring' | 'teddy') => {
        // Robustness: Don't spawn at exactly (0,0) if it's likely a missing coordinate
        if (Math.abs(x) < 0.001 && Math.abs(z) < 0.001) {
            console.warn(`Attempted to spawn collectible ${id} at (0,0). Skipping to avoid ghost prompts.`);
            return;
        }

        // Persistence Check: Don't spawn if already found
        const foundList = (ctx as any).collectiblesFound || [];
        if (foundList.includes(id)) {
            return;
        }

        const group = new THREE.Group();
        group.position.set(x, 0.5, z);
        group.userData = { id, type: 'collectible', collectibleId: id, isCollectible: true };
        group.name = `collectible_${id}`;

        // Use centralized ModelFactory for visual consistency
        const mesh = ModelFactory.createCollectible(type);
        group.add(mesh);

        group.rotation.y = Math.random() * Math.PI * 2;

        // Visuals: Tech-Magic Beacon
        const colorPrimary = 0x00ffff; // Cyan
        const colorSecondary = 0x0088ff; // Blue

        // 1. Ground Ring
        const ringGeo = new THREE.RingGeometry(0.6, 0.7, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color: colorPrimary, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.05;
        group.add(ring);

        // 2. Rising Beam (Transparent Cylinder)
        const beamGeo = new THREE.CylinderGeometry(0.4, 0.4, 4, 16, 1, true);
        const beamMat = new THREE.MeshBasicMaterial({
            color: colorSecondary,
            transparent: true,
            opacity: 0.1,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const beam = new THREE.Mesh(beamGeo, beamMat);
        beam.position.y = 2;
        group.add(beam);

        // 3. Inner Rotating Ring
        const innerRingGeo = new THREE.TorusGeometry(0.3, 0.02, 8, 24);
        const innerRingMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 });
        const innerRing = new THREE.Mesh(innerRingGeo, innerRingMat);
        innerRing.rotation.x = Math.PI / 2;
        innerRing.position.y = 1.0;
        group.add(innerRing);

        const light = new THREE.PointLight(colorPrimary, 3, 10);
        light.position.set(0, 1.2, 0);
        group.add(light);

        // Tech Particles (Upward floating)
        if (!group.userData.effects) group.userData.effects = [];
        group.userData.effects.push(
            {
                type: 'emitter',
                particle: 'spark',
                interval: 100,
                count: 1,
                offset: new THREE.Vector3(0, 0.2, 0),
                spread: 0.2,
                color: colorPrimary,
                velocity: new THREE.Vector3(0, 2, 0)
            }
        );

        ctx.scene.add(group);
        if (ctx.collectibles) ctx.collectibles.push(group);

        ctx.mapItems.push({
            id: `collectible_${id}`,
            x, z,
            type: 'TRIGGER',
            label: 'ui.collectible',
            icon: '🎁',
            color: '#ffd700'
        });
    },

    spawnBoxTrigger: (ctx: SectorContext, id: string, x: number, z: number, width: number, depth: number, type: TriggerType, content: string = '', actions?: TriggerAction[], resetOnExit: boolean = false, rotation: number = 0) => {
        const trigger: SectorTrigger = {
            id,
            position: { x, z },
            size: { width, depth },
            type: type,
            content: content,
            triggered: false,
            actions: actions || [],
            resetOnExit: resetOnExit,
            rotation: rotation
        };
        ctx.triggers.push(trigger);

        if (ctx.debugMode) {
            SectorGenerator.spawnDebugMarker(ctx, x, z, 2, id);
        }
    },

    spawnDebugMarker: (ctx: SectorContext, x: number, z: number, height: number, label: string) => {
        const beamGeo = new THREE.CylinderGeometry(0.1, 0.1, 400, 8);
        beamGeo.translate(0, 200, 0);
        const beamMat = new THREE.MeshBasicMaterial({
            color: 0x00ffff, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending
        });
        const beam = new THREE.Mesh(beamGeo, beamMat);
        beam.position.set(x, 0, z);
        ctx.scene.add(beam);

        const sprite = createTextSprite(label);
        sprite.scale.set(12, 3, 1);
        sprite.position.set(x, height + 4, z);
        ctx.scene.add(sprite);

        ctx.mapItems.push({
            id: `poi_${label}`,
            x, z,
            type: 'POI',
            label: label,
            icon: '📍',
            color: '#ffffff'
        });
    },

    // Effects will be automatically picked up by the engine's effect discovery
    setOnFire: (ctx: SectorContext, object: THREE.Object3D, opts?: { smoke?: boolean, color?: number, intensity?: number, distance?: number, offset?: THREE.Vector3, onRoof?: boolean, area?: THREE.Vector3 }) => {
        const finalOpts = opts ? { ...opts } : {};

        // Automatically use object size for area if available
        if (object.userData.size && !finalOpts.area) {
            finalOpts.area = object.userData.size as THREE.Vector3;
        }

        if (finalOpts.onRoof && !finalOpts.offset) {
            let height = 0;
            if (object.userData.size) {
                height = (object.userData.size as THREE.Vector3).y;
            } else {
                const box = new THREE.Box3().setFromObject(object);
                height = box.max.y - box.min.y;
            }
            // 110% height to be clearly above roof
            finalOpts.offset = new THREE.Vector3(0, height, 0);
        }

        EffectManager.attachEffect(object, 'fire', finalOpts)
        if (ctx.burningObjects) ctx.burningObjects.push(object);
    },

    spawnDeadBody: (ctx: SectorContext, x: number, z: number, type: 'WALKER' | 'RUNNER' | 'BOMBER' | 'TANK' | 'PLAYER' | 'HUMAN', rot: number = 0, blood: boolean = true) => {
        const body = ObjectGenerator.createDeadBody(type, rot, blood);
        body.position.set(x, 0, z);
        ctx.scene.add(body);
        return body;
    },

    spawnHaybale: (ctx: SectorContext, x: number, z: number, rotation: number = 0, scale: number = 1.0) => {
        const bale = ObjectGenerator.createHaybale(scale);
        bale.position.set(x, 0, z);
        bale.rotation.y = rotation;
        ctx.scene.add(bale);
        const obs = { mesh: bale, collider: { type: 'sphere' as const, radius: 1.2 * scale } };
        SectorGenerator.addObstacle(ctx, obs);
    },

    spawnTimberPile: (ctx: SectorContext, x: number, z: number, rotation: number = 0, scale: number = 1.0) => {
        const timber = ObjectGenerator.createTimberPile(scale);
        timber.position.set(x, 0, z);
        timber.rotation.y = rotation;
        ctx.scene.add(timber);

        // FIX: Use UNSCALED local dimensions + Center Offset
        // The mesh.matrixWorld handles the scale/rotation.
        // Base size: ~2.5m wide, ~1.5m high, ~6.0m long
        const baseSize = new THREE.Vector3(2.5, 1.5, 6.0);
        const baseCenter = new THREE.Vector3(0, 0.75, 0);

        const obs = {
            mesh: timber,
            collider: {
                type: 'box' as const,
                size: baseSize,
                center: baseCenter
            },
            type: 'TimberPile'
        };
        SectorGenerator.addObstacle(ctx, obs);
    },

    /**
     * Spawns a building with an optional gabled roof.
     * If createRoof is false, only the base box is generated.
     */
    spawnBuilding(
        ctx: SectorContext,
        x: number,
        z: number,
        width: number,
        height: number,
        depth: number,
        rotation: number,
        color: number,
        createRoof: boolean = true,
        withLights: boolean = false,
        lightProbability: number = 0.5
    ) {
        // Use ObjectGenerator to create the mesh with merged geometry
        const building = ObjectGenerator.createBuilding(width, height, depth, color, createRoof, withLights, lightProbability);

        building.position.set(x, 0, z);
        building.rotation.y = rotation;
        building.updateMatrixWorld(); // Ensure matrix is ready for position access

        building.castShadow = true;
        building.receiveShadow = true;

        ctx.scene.add(building);

        // Get dimensions from userData if available
        const sizeY = building.userData.size ? building.userData.size.y : (createRoof ? height * 1.5 : height);

        // Collision
        SectorGenerator.addObstacle(ctx, {
            mesh: building,
            position: building.position, // Explicitly pass position
            quaternion: building.quaternion, // Explicitly pass quaternion
            collider: {
                type: 'box' as const,
                size: (building.userData.size as THREE.Vector3).clone(),
            }
        });

        return building;
    },

    spawnVehicle: (ctx: SectorContext, x: number, z: number, rotation: number,
        type: 'station wagon' | 'sedan' | 'police' | 'ambulance' | 'suv' | 'minivan' | 'pickup' | 'bus' | 'tractor' | 'timber_truck' = 'station wagon',
        colorOverride?: number, addSnow?: boolean) => {

        const vehicle = ObjectGenerator.createVehicle(type, 1.0, colorOverride, addSnow);

        // Measure unrotated local bounds
        const box = new THREE.Box3().setFromObject(vehicle);
        const size = box.getSize(new THREE.Vector3());

        vehicle.position.set(x, 0, z);
        vehicle.rotation.y = rotation;
        ctx.scene.add(vehicle);

        // Add Collision
        SectorGenerator.addObstacle(ctx, {
            mesh: vehicle,
            position: vehicle.position,
            collider: { type: 'box', size: size },
            type: `Vehicle_${type}` // Debug Label
        });

        return vehicle;
    },

    /**
     * Spawn a driveable vehicle with full physics data from the VEHICLES database.
     * Replaces manual userData setup — just pass the VehicleType and position.
     */
    spawnDriveableVehicle: (ctx: SectorContext, x: number, z: number, rotation: number,
        vehicleType: VehicleType, colorOverride?: number, addSnow?: boolean) => {

        const def = VEHICLES[vehicleType];
        if (!def) {
            console.warn(`[VehicleSystem] Unknown vehicle type: ${vehicleType}`);
            return null;
        }

        // Use ObjectGenerator for visual mesh — boat has a separate generator
        let vehicle: THREE.Object3D;
        if (vehicleType === 'boat') {
            vehicle = ObjectGenerator.createBoat();
        } else {
            const visualType = vehicleType === 'station_wagon' ? 'station wagon' : vehicleType;
            vehicle = ObjectGenerator.createVehicle(visualType, 1.0, colorOverride, addSnow);
        }

        vehicle.position.set(x, 0.5, z);
        vehicle.rotation.y = rotation;

        // Attach physics data from database
        vehicle.userData.vehicleDef = def;
        vehicle.userData.velocity = new THREE.Vector3();
        vehicle.userData.angularVelocity = new THREE.Vector3();
        vehicle.userData.suspY = 0;
        vehicle.userData.suspVelY = 0;
        vehicle.userData.interactionRadius = Math.max(def.size.x, def.size.z) * 0.5 + 3.0;
        vehicle.userData.radius = Math.max(def.size.x, def.size.z) * 0.5;

        ctx.scene.add(vehicle);

        // Add collision obstacle
        SectorGenerator.addObstacle(ctx, {
            mesh: vehicle,
            position: vehicle.position,
            collider: { type: 'box', size: new THREE.Vector3(def.size.x, def.size.y, def.size.z) },
            type: `Vehicle_${vehicleType}`
        });

        return vehicle;
    },

    /**
     * Spawn a floatable/driveable boat with physics from the VEHICLES database.
     * Semantic wrapper for water-based vehicles.
     */
    spawnFloatableVehicle: (ctx: SectorContext, x: number, z: number, rotation: number,
        vehicleType: VehicleType = 'boat', colorOverride?: number) => {
        return SectorGenerator.spawnDriveableVehicle(ctx, x, z, rotation, vehicleType, colorOverride, false);
    },

    /**
     * Create a typed water body through the engine-owned WaterSystem.
     * Returns a WaterBody that can have floating props and splash sources registered.
     */
    addWaterBody: (ctx: SectorContext, type: WaterBodyType, x: number, z: number, width: number, depth: number, options?: {
        style?: WaterStyle; shape?: 'rect' | 'circle'; flowDirection?: THREE.Vector2; flowStrength?: number;
    }): WaterBody | null => {
        const engine = Engine.getInstance();
        if (!engine?.water) return null;
        return engine.water.addWaterBody(type, x, z, width, depth, options);
    },

    spawnContainer: (ctx: SectorContext, x: number, z: number, rotation: number, colorOverride?: number, addSnow: boolean = true) => {
        const container = ObjectGenerator.createContainer(colorOverride, addSnow);
        container.position.set(x, 0, z);
        container.rotation.y = rotation;
        ctx.scene.add(container);

        // Add Collision (default: 6.0m L x 2.6m H x 2.4m W)
        SectorGenerator.addObstacle(ctx, {
            mesh: container,
            position: container.position,
            collider: { type: 'box', size: new THREE.Vector3(6.0, 2.6, 2.4) }
        });

        return container;
    },

    spawnNeonSign: (ctx: SectorContext, x: number, z: number, rotation: number, text: string, color: number = 0x00ffff, withBacking: boolean = true) => {
        const sign = ObjectGenerator.createNeonSign(text, color, withBacking);
        sign.position.set(x, 5.5, z); // Elevated
        sign.rotation.y = rotation;
        ctx.scene.add(sign);
        return sign;
    },

    spawnStreetLight: (ctx: SectorContext, x: number, z: number, rotation: number = 0) => {
        const light = ObjectGenerator.createStreetLamp();
        light.position.set(x, 0, z);
        light.rotation.y = rotation;
        ctx.scene.add(light);

        // Add collision (Street lamps are small but should block)
        SectorGenerator.addObstacle(ctx, {
            mesh: light,
            position: light.position,
            collider: { type: 'sphere', radius: 1.0 }
        });

        const pointLight = light.getObjectByProperty('isPointLight', true) as THREE.PointLight;
        if (pointLight && ctx.dynamicLights) ctx.dynamicLights.push(pointLight);

        return light;
    },

    spawnCaveLamp: (ctx: SectorContext, x: number, y: number, z: number) => {
        const lamp = ObjectGenerator.createCaveLamp();
        lamp.position.set(x, y, z);
        ctx.scene.add(lamp);
        return lamp;
    },

    spawnStorefrontBuilding: (ctx: SectorContext, x: number, z: number, width: number, height: number, depth: number, rotation: number, opts: any = {}) => {
        const building = ObjectGenerator.createStorefrontBuilding(width, height, depth, opts);
        building.position.set(x, 0, z);
        building.rotation.y = rotation;
        ctx.scene.add(building);

        const size = building.userData.size;
        SectorGenerator.addObstacle(ctx, {
            mesh: building,
            position: building.position,
            collider: { type: 'box', size: size.clone() }
        });

        return building;
    },

    spawnNeonHeart: (ctx: SectorContext, x: number, y: number, z: number, rotation: number, color: number = 0xff0000) => {
        const heart = ObjectGenerator.createNeonHeart(color);
        heart.position.set(x, y, z);
        heart.rotation.y = rotation;
        ctx.scene.add(heart);
        return heart;
    },

    spawnGlassStaircase: (ctx: SectorContext, x: number, z: number, width: number, height: number, depth: number, rotation: number) => {
        const stairs = ObjectGenerator.createGlassStaircase(width, height, depth);
        stairs.position.set(x, 0, z);
        stairs.rotation.y = rotation;
        ctx.scene.add(stairs);

        SectorGenerator.addObstacle(ctx, {
            mesh: stairs,
            position: stairs.position,
            collider: { type: 'box', size: new THREE.Vector3(width, height, depth) }
        });

        return stairs;
    },

    spawnElectricPole: (ctx: SectorContext, x: number, z: number, rotation: number = 0) => {
        const pole = ObjectGenerator.createElectricPole();
        pole.position.set(x, 0, z);
        pole.rotation.y = rotation;
        ctx.scene.add(pole);
        SectorGenerator.addObstacle(ctx, { mesh: pole, collider: { type: 'sphere', radius: 1 } });
        return pole;
    },

    spawnCrashedCar: (ctx: SectorContext, x: number, z: number, rotation: number, color?: number) => {
        const car = ObjectGenerator.createCrashedCar(color);
        car.position.set(x, 0, z);
        car.rotation.y = rotation;
        ctx.scene.add(car);

        // Add Collision
        const box = new THREE.Box3().setFromObject(car);
        const size = box.getSize(new THREE.Vector3());
        SectorGenerator.addObstacle(ctx, {
            mesh: car,
            position: car.position,
            collider: { type: 'box', size: size }
        });

        return car;
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

        // Add Collision for the whole stack
        SectorGenerator.addObstacle(ctx, {
            mesh: group,
            position: group.position,
            collider: { type: 'box', size: new THREE.Vector3(6.0, 2.6 * stackHeight, 2.4) }
        });

        return group;
    },

    spawnVehicleStack(ctx: SectorContext, x: number, z: number, rotation: number, stackIndex: number, addSnow?: boolean) {
        const maxJitter = 15;
        const posJitter = 0.25;
        const toRad = (deg) => deg * (Math.PI / 180);

        const vehicleStack = new THREE.Group();
        vehicleStack.position.set(x, 0, z);
        vehicleStack.rotation.y = rotation;

        let currentY = 0;

        for (let i = 0; i < stackIndex; i++) {
            const vehicle = ObjectGenerator.createVehicle(undefined, 1.0, undefined);
            const box = new THREE.Box3().setFromObject(vehicle);
            const size = box.getSize(new THREE.Vector3());
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

        ctx.scene.add(vehicleStack);

        // Add Collision for the entire stack
        const box = new THREE.Box3().setFromObject(vehicleStack);
        const size = box.getSize(new THREE.Vector3());
        SectorGenerator.addObstacle(ctx, {
            mesh: vehicleStack,
            position: vehicleStack.position,
            collider: { type: 'box' as const, size: size }
        });
    },

    spawnTree: (ctx: SectorContext, type: 'spruce' | 'pine' | 'birch', x: number, z: number, scaleMultiplier: number = 1.0) => {
        // Map legacy types to new procedural types
        let genType: 'PINE' | 'OAK' | 'DEAD' | 'BIRCH' = 'PINE';
        if (type === 'birch') genType = 'BIRCH';
        // 'spruce' and 'pine' map to 'PINE'

        const tree = EnvironmentGenerator.createTree(genType, scaleMultiplier);
        tree.position.set(x, 0, z);
        tree.rotation.y = Math.random() * Math.PI * 2;
        ctx.scene.add(tree);

        // Collision (Trunk)
        const colRadius = 0.5 * scaleMultiplier;
        SectorGenerator.addObstacle(ctx, {
            mesh: tree,
            position: tree.position,
            collider: { type: 'sphere', radius: colRadius }
        });
    },

    spawnEnemy: (ctx: SectorContext, type: string, x: number, z: number) => {
        ctx.mapItems.push({
            id: `enemy_spawn_${Math.random()}`,
            x, z, type: 'ENEMY', label: type, color: '#f00', radius: 1
        });
    },

    spawnBarrel: (ctx: SectorContext, x: number, z: number, explosive: boolean = false) => {
        const barrel = ObjectGenerator.createBarrel(explosive);
        barrel.position.set(x, 0, z);
        ctx.scene.add(barrel);
        SectorGenerator.addObstacle(ctx, { mesh: barrel, position: barrel.position, collider: { type: 'sphere', radius: 0.6 } });
    },

    /**
     * Centralized Atmosphere Orchestrator.
     * Handles biome blending, weather syncing, and manual overrides.
     */
    updateAtmosphere: (
        dt: number,
        now: number,
        playerPos: THREE.Vector3,
        gameState: any,
        sectorState: any,
        events: any,
        sectorDef: any,
        zones?: any[]
    ) => {
        const weatherSystem = Engine.getInstance().weather;
        const windSystem = Engine.getInstance().wind;
        const scene = events.scene;
        if (!playerPos || !weatherSystem || !scene) return;

        const px = playerPos.x;
        const pz = playerPos.z;

        // 1. Determine Default Target Values
        const defEnv = sectorDef.environment;
        const targetFogColor = _c1.setHex(defEnv.bgColor);
        if (defEnv.fogColor !== undefined) targetFogColor.setHex(defEnv.fogColor);

        let targetFogDensity = defEnv.fogDensity;
        let targetAmbient = defEnv.ambientIntensity;
        let activeWeather: any = 'none';
        let maxWeight = 0;

        // 2. Apply Zone Blending (if not overridden)
        const override = sectorState.envOverride;
        if (!override && zones && zones.length > 0) {
            let totalWeight = 0;
            let blendedR = 0;
            let blendedG = 0;
            let blendedB = 0;
            let blendedDensity = 0;
            let blendedAmbient = 0;

            for (let i = 0; i < zones.length; i++) {
                const z = zones[i];
                const dx = px - z.x;
                const dz = pz - z.z;
                const distSq = dx * dx + dz * dz;

                const inner = z.innerRadius || 250;
                const outer = z.outerRadius || 450;
                const outerSq = outer * outer;

                if (distSq < outerSq) {
                    const dist = Math.sqrt(distSq);
                    let weight = 1.0;
                    if (dist > inner) {
                        weight = 1.0 - ((dist - inner) / (outer - inner));
                    }
                    weight = weight * weight; // Cubic falloff for smoother transitions

                    _c2.setHex(z.bgColor);
                    blendedR += _c2.r * weight;
                    blendedG += _c2.g * weight;
                    blendedB += _c2.b * weight;

                    blendedDensity += z.fogDensity * weight;
                    blendedAmbient += z.ambient * weight;
                    totalWeight += weight;

                    if (weight > maxWeight) {
                        maxWeight = weight;
                        activeWeather = z.weather;
                    }
                }
            }

            if (totalWeight > 0) {
                const lerpFactor = Math.min(1.0, totalWeight);
                const invWeight = 1 / totalWeight;
                _c2.setRGB(blendedR * invWeight, blendedG * invWeight, blendedB * invWeight);

                targetFogColor.lerp(_c2, lerpFactor);
                targetFogDensity = THREE.MathUtils.lerp(targetFogDensity, blendedDensity * invWeight, lerpFactor);
                targetAmbient = THREE.MathUtils.lerp(targetAmbient, blendedAmbient * invWeight, lerpFactor);
            }
        }

        // 3. Apply Manual Overrides (Terminal Station)
        if (override) {
            if (override.bgColor !== undefined) targetFogColor.setHex(override.bgColor);
            if (override.fogColor !== undefined) targetFogColor.setHex(override.fogColor);
            if (override.fogDensity !== undefined) targetFogDensity = override.fogDensity;
            if (override.ambientIntensity !== undefined) targetAmbient = override.ambientIntensity;

            // Lights Override
            events.setLight({
                skyLightColor: override.skyLightColor !== undefined ? _c2.setHex(override.skyLightColor) : undefined,
                skyLightIntensity: override.skyLightIntensity !== undefined ? override.skyLightIntensity : undefined,
                skyLightPosition: override.skyLightPosition,
                skyLightVisible: override.skyLightVisible
            });

            if (override.bgColor !== undefined) events.setBackgroundColor(override.bgColor);
            if (override.groundColor !== undefined) events.setGroundColor(override.groundColor);
            if (override.fov !== undefined) events.setFOV(override.fov);

            // Wind Override
            if (override.windRandomized) {
                events.setWindRandomized(true);
            } else if (override.windDirection !== undefined && override.windStrength !== undefined) {
                const rad = override.windDirection * (Math.PI / 180);
                if (windSystem) windSystem.setOverride(rad, override.windStrength);
                events.setWindRandomized(false);
            } else {
                if (windSystem) windSystem.clearOverride();
                events.setWindRandomized(false);
            }

            // Weather Override
            if (override.weather !== undefined) {
                events.setWeather(override.weather, (override.weatherDensity ?? 1.0) * 2000);
            }
        } else {
            events.resetWind();
        }

        // 4. Apply Atmosphere to Scene (Lerped for smoothness)
        if (scene.fog instanceof THREE.FogExp2) {
            scene.fog.color.lerp(targetFogColor, 0.05);
            scene.fog.density = THREE.MathUtils.lerp(scene.fog.density, targetFogDensity, 0.05);
        }

        const ambientLight = scene.getObjectByName('AMBIENT_LIGHT') as THREE.AmbientLight;
        if (ambientLight) {
            ambientLight.intensity = THREE.MathUtils.lerp(ambientLight.intensity, targetAmbient, 0.05);
        }

        // 5. Auto-Weather Sync
        if (!override) {
            if (maxWeight > 0.5) {
                events.setWeather(activeWeather, 1600);
            } else if (maxWeight < 0.2) {
                events.setWeather('none', 0);
            }
        }
    },

    // Area Fillers
    fillArea: async (ctx: SectorContext, center: { x: number, z: number }, size: { width: number, height: number } | number, count: number, type: 'tree' | 'rock' | 'debris', avoidCenterRadius: number = 0, exclusionZones: { pos: THREE.Vector3, radius: number }[] = []) => {
        if (ctx.debugMode) {
            let w = 0, d = 0;
            if (typeof size === 'number') { w = size / 2; d = size / 2; }
            else { w = size.width / 2; d = size.height / 2; }

            SectorGenerator.visualizePolygon(ctx, [
                new THREE.Vector3(center.x - w, 0, center.z - d),
                new THREE.Vector3(center.x + w, 0, center.z - d),
                new THREE.Vector3(center.x + w, 0, center.z + d),
                new THREE.Vector3(center.x - w, 0, center.z + d)
            ], 0xffff00);
        }
        await EnvironmentGenerator.fillArea(ctx, center, size, count, type, avoidCenterRadius, exclusionZones);
    },

    fillWheatField: async (ctx: SectorContext, polygon: THREE.Vector3[], density: number = 0.5) => {
        if (ctx.debugMode) {
            SectorGenerator.visualizePolygon(ctx, polygon, 0xffff00);
        }
        await EnvironmentGenerator.fillWheatField(ctx, polygon, density);
    },

    createBoundry: (ctx: SectorContext, polygon: THREE.Vector3[], name: string) => {
        if (ctx.debugMode) {
            SectorGenerator.visualizePath(ctx, polygon, 0xff0000);
        }
        PathGenerator.createBoundry(ctx, polygon, name);
    },

    // [VINTERDÖD] Facade methods pointing to EnvironmentGenerator
    createMountain: (ctx: SectorContext, points: THREE.Vector3[], opening?: THREE.Group) => {
        if (ctx.debugMode) {
            SectorGenerator.visualizePath(ctx, points, 0xffffff);
        }
        EnvironmentGenerator.createMountain(ctx, points, opening);
    },

    createMountainOpening: () => {
        return EnvironmentGenerator.createMountainOpening();
    },

    createForest: (ctx: SectorContext, polygon: THREE.Vector3[], spacing: number = 8, type: string | string[] = 'random') => {
        if (ctx.debugMode) {
            SectorGenerator.visualizePolygon(ctx, polygon, 0x00ff00);
        }

        let genType = type;
        if (typeof type === 'string') {
            const lower = type.toLowerCase();
            if (lower === 'spruce') genType = 'SPRUCE';
            else if (lower === 'pine') genType = 'PINE';
            else if (lower === 'birch') genType = 'BIRCH';
            else if (lower === 'oak') genType = 'OAK';
            else if (lower === 'dead') genType = 'DEAD';
        }

        EnvironmentGenerator.createForest(ctx, polygon, spacing, genType as any);
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

    visualizeTriggers: (ctx: SectorContext) => {
        ctx.triggers.forEach(trig => {
            SectorGenerator.spawnDebugMarker(ctx, trig.position.x, trig.position.z, 2, trig.id.toUpperCase());
            const ringGeo = new THREE.RingGeometry(trig.radius - 0.2, trig.radius, 32);
            const ringMat = new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.rotation.x = -Math.PI / 2;
            ring.position.set(trig.position.x, 0.1, trig.position.z);
            ctx.scene.add(ring);
        });
    },

    generatePlaceholder: async (ctx: SectorContext) => {
    },

    attachEffect: (ctx: SectorContext, parent: THREE.Object3D, eff: { type: string, color?: number, intensity?: number, offset?: { x: number, y: number, z: number } }) => {
        const offset = eff.offset || { x: 0, y: 0, z: 0 };
        const worldPos = new THREE.Vector3();
        parent.updateMatrixWorld();
        worldPos.setFromMatrixPosition(parent.matrixWorld).add(new THREE.Vector3(offset.x, offset.y, offset.z));

        if (eff.type === 'light') {
            const light = new THREE.PointLight(eff.color || 0xffaa00, eff.intensity || 1, 25);
            light.position.copy(worldPos);
            ctx.scene.add(light);
            if ((eff.color || 0) > 0xffaa00 || !eff.color) {
                ctx.flickeringLights.push({ light, baseInt: eff.intensity || 1, flickerRate: 0.05 + Math.random() * 0.1 });
            }
        } else if (eff.type === 'fire') {
            const light = new THREE.PointLight(0xff6600, 2, 25);
            light.position.copy(worldPos).y += 1;
            ctx.scene.add(light);
            ctx.flickeringLights.push({ light, baseInt: 2, flickerRate: 0.15 });

            parent.userData.isFire = true;
            if (parent.userData.effects === undefined) parent.userData.effects = [];

            const isLarge = (eff as any).onRoof || (eff.intensity && eff.intensity > 100);
            const firePart = isLarge ? 'large_fire' : 'flame';
            const smokePart = isLarge ? 'large_smoke' : 'smoke';

            parent.userData.effects.push(
                { type: 'emitter', particle: firePart, interval: isLarge ? 40 : 50, count: 1, offset: new THREE.Vector3(offset.x, offset.y + (isLarge ? 1.0 : 0.5), offset.z), spread: isLarge ? 1.5 : 0.3, color: 0xffaa00 },
                { type: 'emitter', particle: smokePart, interval: isLarge ? 80 : 150, count: 1, offset: new THREE.Vector3(offset.x, offset.y + (isLarge ? 2.0 : 1.0), offset.z), spread: isLarge ? 2.0 : 0.4, color: isLarge ? 0x333333 : 0xffdd00 }
            );
        }
    },

    spawnTerminal: (ctx: SectorContext, x: number, z: number, type: 'TERMINAL_ARMORY' | 'TERMINAL_SPAWNER' | 'TERMINAL_ENV') => {
        const terminalType = type === 'TERMINAL_ARMORY' ? 'ARMORY' : type === 'TERMINAL_SPAWNER' ? 'SPAWNER' : 'ENV';
        const terminal = ObjectGenerator.createTerminal(terminalType);
        terminal.position.set(x, 0, z);
        terminal.lookAt(0, 0, 0);
        terminal.name = type; // Critical for lookup if needed, though we use obj reference now

        let label = 'ui.interact';
        if (type === 'TERMINAL_ARMORY') label = 'ui.station_armory';
        else if (type === 'TERMINAL_SPAWNER') label = 'ui.station_spawner';
        else if (type === 'TERMINAL_ENV') label = 'ui.station_environment';

        // [VINTERDÖD] Standardized Interaction
        SectorGenerator.addInteractable(ctx, terminal, {
            id: type,
            label: label,
            type: 'sector_specific',
            radius: 2.5
        });

        ctx.scene.add(terminal);
        if (ctx.interactables) ctx.interactables.push(terminal);

        SectorGenerator.addObstacle(ctx, {
            mesh: terminal,
            position: terminal.position,
            collider: { type: 'box', size: new THREE.Vector3(1.2, 2, 1) }
        });

        // Visual Marker
        const icon = type === 'TERMINAL_ARMORY' ? '🔫' : type === 'TERMINAL_SPAWNER' ? '🧟' : '⛈️';
        ctx.mapItems.push({
            id: `terminal_${type}`,
            x, z,
            type: 'POI',
            label: label,
            icon: icon,
            color: '#ffffff'
        });
    }
};