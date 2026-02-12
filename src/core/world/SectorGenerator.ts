
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GEOMETRY, MATERIALS, createTextSprite, ModelFactory } from '../../utils/assets';
import { SectorContext } from '../../types/sectors';
import { TriggerType, TriggerAction } from '../../types';
import { ObjectGenerator } from './ObjectGenerator';
import { PathGenerator } from './PathGenerator';
import { EffectManager } from '../systems/EffectManager';
import { getCollectibleById } from '../../content/collectibles';

// Shared Utilities for Sector Building
export const SectorBuilder = {

    addObstacle: (ctx: SectorContext, obstacle: any) => {
        if (!obstacle.mesh) return;

        // Ensure it's in the legacy list
        if (!ctx.obstacles.includes(obstacle)) {
            ctx.obstacles.push(obstacle);
        }

        // Always ensure matrixWorld is up to date before adding to spatial grid
        // to prevent (0,0,0) index bug if added before first render
        obstacle.mesh.updateMatrixWorld(true);

        // Ensure it's in the spatial grid
        ctx.collisionGrid.add(obstacle);
    },

    generateAutomaticContent: async (ctx: SectorContext, def: any) => {
        if (def.groundType && def.groundType !== 'NONE') {
            await SectorBuilder.generateGround(ctx, def.groundType, def.groundSize || { width: 2000, depth: 2000 });
        }

        // Auto-Spawn Collectibles
        if (def.collectibles) {
            for (const c of def.collectibles) {
                const meta = getCollectibleById(c.id);
                if (meta) {
                    // Auto-resolve ID and Type from metadata
                    SectorBuilder.spawnCollectible(ctx, c.x, c.z, c.id, meta.modelType);
                }
                if (ctx.yield) await ctx.yield();
            }
        }

        if (ctx.yield) await ctx.yield();
        if (def.bounds) {
            SectorBuilder.generateBoundaries(ctx, def.bounds);
        }

        if (ctx.debugMode) {
            SectorBuilder.visualizeTriggers(ctx);
            if (def.bounds) {
                SectorBuilder.visualizeBounds(ctx, def.bounds);
            }
        }

        if (ctx.yield) await ctx.yield();
    },

    /**
     * Main Orchestrator for building a sector.
     * Uses the new structured lifecycle to standardize generation.
     */
    build: async (ctx: SectorContext, def: any) => {
        // 1. Automatic Content (Ground, Bounds, Collectibles)
        await SectorBuilder.generateAutomaticContent(ctx, def);

        // 2. Setup Environment (Lights, Fog, etc.)
        if (def.setupEnvironment) {
            await def.setupEnvironment(ctx);
            if (ctx.yield) await ctx.yield();
        }

        // 3. Setup Props (Static Objects)
        if (def.setupProps) {
            await def.setupProps(ctx);
            if (ctx.yield) await ctx.yield();
        }

        // 4. Setup Custom Content (POIs, Cinematics, Special Logic)
        if (def.setupContent) {
            await def.setupContent(ctx);
            if (ctx.yield) await ctx.yield();
        }

        // 5. Setup Zombies (Hordes, Spawning)
        if (def.setupZombies) {
            await def.setupZombies(ctx);
            if (ctx.yield) await ctx.yield();
        }

        // 6. Legacy Support (Escape Hatch)
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

    generateBoundaries: (ctx: SectorContext, bounds: { width: number, depth: number }) => {
        const wallMat = new THREE.MeshBasicMaterial({ visible: false });
        const h = 50;
        const w = bounds.width;
        const d = bounds.depth;

        // Sanity Check: Don't spawn walls if bounds are too small (Prevent center walls)
        if (w < 10 || d < 10) return;

        const createWall = (x: number, z: number, sx: number, sz: number) => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, h, sz), wallMat);
            mesh.position.set(x, h / 2, z);
            ctx.scene.add(mesh);
            SectorBuilder.addObstacle(ctx, {
                mesh,
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
        const obs = { mesh: chest, type, scrap: isBig ? 100 : 25, radius: 2, opened: false };
        ctx.chests.push(obs);
        SectorBuilder.addObstacle(ctx, { mesh: chest, collider: { type: 'sphere', radius: 2 } });

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

        ctx.mapItems.push({
            id: `collectible_${id}`,
            x, z,
            type: 'TRIGGER',
            label: 'ui.collectible',
            icon: '🎁',
            color: '#ffd700'
        });
    },

    spawnBoxTrigger: (ctx: SectorContext, id: string, x: number, z: number, width: number, depth: number, type: TriggerType, content: string = '', actions?: TriggerAction[], rotation: number = 0) => {
        ctx.triggers.push({
            id,
            position: { x, z },
            size: { width, depth },
            rotation,
            type,
            content,
            actions,
            triggered: false
        });
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
        SectorBuilder.addObstacle(ctx, obs);
    },

    spawnTimberPile: (ctx: SectorContext, x: number, z: number, rotation: number = 0, scale: number = 1.0) => {
        const timber = ObjectGenerator.createTimberPile(scale);
        timber.position.set(x, 0, z);
        timber.rotation.y = rotation;
        ctx.scene.add(timber);
        // Box obstacle for timber pile
        const obs = { mesh: timber, collider: { type: 'box' as const, size: new THREE.Vector3(6 * scale, 3 * scale, 6 * scale) } };
        SectorBuilder.addObstacle(ctx, obs);
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
        building.castShadow = true;
        building.receiveShadow = true;

        ctx.scene.add(building);

        // Get dimensions from userData if available
        const sizeY = building.userData.size ? building.userData.size.y : (createRoof ? height * 1.5 : height);

        // 6. Collision
        SectorBuilder.addObstacle(ctx, {
            mesh: building,
            collider: {
                type: 'box' as const,
                size: (building.userData.size as THREE.Vector3).clone(),
                position: building.position.clone().add(new THREE.Vector3(0, (building.userData.size as THREE.Vector3).y / 2, 0))
            }
        });

        return building;
    },

    spawnVehicle: (ctx: SectorContext, x: number, z: number, rotation: number,
        type: 'station wagon' | 'sedan' | 'police' | 'ambulance' | 'suv' | 'minivan' | 'pickup' | 'bus' | 'tractor' | 'timber_truck' = 'station wagon',
        colorOverride?: number, addSnow?: boolean) => {

        const vehicle = ObjectGenerator.createVehicle(type, 1.0, colorOverride, addSnow);
        vehicle.position.set(x, 0, z);
        vehicle.rotation.y = rotation;
        ctx.scene.add(vehicle);

        // Add Collision
        const box = new THREE.Box3().setFromObject(vehicle);
        const size = box.getSize(new THREE.Vector3());
        SectorBuilder.addObstacle(ctx, {
            mesh: vehicle,
            collider: { type: 'box', size: size }
        });

        return vehicle;
    },

    spawnContainer: (ctx: SectorContext, x: number, z: number, rotation: number, colorOverride?: number, addSnow: boolean = true) => {
        const container = ObjectGenerator.createContainer(colorOverride, addSnow);
        container.position.set(x, 0, z);
        container.rotation.y = rotation;
        ctx.scene.add(container);

        // Add Collision (6.0m L x 2.6m H x 2.4m W)
        SectorBuilder.addObstacle(ctx, {
            mesh: container,
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
        SectorBuilder.addObstacle(ctx, {
            mesh: light,
            collider: { type: 'sphere', radius: 1.0 }
        });

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
        SectorBuilder.addObstacle(ctx, {
            mesh: building,
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

        SectorBuilder.addObstacle(ctx, {
            mesh: stairs,
            collider: { type: 'box', size: new THREE.Vector3(width, height, depth) }
        });

        return stairs;
    },

    spawnElectricPole: (ctx: SectorContext, x: number, z: number, rotation: number = 0) => {
        const pole = ObjectGenerator.createElectricPole();
        pole.position.set(x, 0, z);
        pole.rotation.y = rotation;
        ctx.scene.add(pole);
        SectorBuilder.addObstacle(ctx, { mesh: pole, collider: { type: 'sphere', radius: 1 } });
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
        SectorBuilder.addObstacle(ctx, {
            mesh: car,
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
        SectorBuilder.addObstacle(ctx, {
            mesh: group,
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
        SectorBuilder.addObstacle(ctx, {
            mesh: vehicleStack,
            collider: { type: 'box' as const, size: size }
        });
    },

    spawnTree: (ctx: SectorContext, type: 'spruce' | 'pine' | 'birch', x: number, z: number, scaleMultiplier: number = 1.0) => {
        const tree = ObjectGenerator.createTree(type, scaleMultiplier);
        tree.position.set(x, 0, z);
        tree.rotation.y = Math.random() * Math.PI * 2;
        ctx.scene.add(tree);

        // Collision (Trunk)
        const colRadius = 0.5 * scaleMultiplier;
        SectorBuilder.addObstacle(ctx, {
            mesh: tree,
            collider: { type: 'sphere', radius: colRadius }
        });
    },

    spawnBuildingPiece: (ctx: SectorContext, type: string, x: number, z: number, rotY: number = 0) => {
        const piece = ObjectGenerator.createBuildingPiece(type);
        piece.position.set(x, 0, z);
        piece.rotation.y = rotY;
        ctx.scene.add(piece);
        if (type.includes('Wall') || type.includes('Frame')) {
            SectorBuilder.addObstacle(ctx, {
                mesh: piece,
                collider: { type: 'box', size: new THREE.Vector3(4, 4, 1) }
            });
        }
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
        SectorBuilder.addObstacle(ctx, { mesh: barrel, collider: { type: 'sphere', radius: 0.6 } });
    },

    // Area Fillers
    fillArea: async (ctx: SectorContext, center: { x: number, z: number }, size: { width: number, height: number } | number, count: number, type: 'tree' | 'rock' | 'debris', avoidCenterRadius: number = 0, exclusionZones: { pos: THREE.Vector3, radius: number }[] = []) => {
        if (ctx.debugMode) {
            let w = 0, d = 0;
            if (typeof size === 'number') { w = size / 2; d = size / 2; }
            else { w = size.width / 2; d = size.height / 2; }

            SectorBuilder.visualizePolygon(ctx, [
                new THREE.Vector3(center.x - w, 0, center.z - d),
                new THREE.Vector3(center.x + w, 0, center.z - d),
                new THREE.Vector3(center.x + w, 0, center.z + d),
                new THREE.Vector3(center.x - w, 0, center.z + d)
            ], 0xffff00);
        }
        await ObjectGenerator.fillArea(ctx, center, size, count, type, avoidCenterRadius, exclusionZones);
    },

    fillWheatField: async (ctx: SectorContext, polygon: THREE.Vector3[], density: number = 0.5) => {
        if (ctx.debugMode) {
            SectorBuilder.visualizePolygon(ctx, polygon, 0xffff00);
        }
        await ObjectGenerator.fillWheatField(ctx, polygon, density);
    },

    createBoundry: (ctx: SectorContext, polygon: THREE.Vector3[], name: string) => {
        if (ctx.debugMode) {
            SectorBuilder.visualizePath(ctx, polygon, 0xff0000);
        }
        PathGenerator.createBoundry(ctx, polygon, name);
    },

    createMountain: (ctx: SectorContext, points: THREE.Vector3[], opening?: THREE.Group) => {
        if (!points || points.length < 2) return;

        if (ctx.debugMode) SectorBuilder.visualizePath(ctx, points, 0xffffff);

        const mountainWidth = 30;
        const mountainHeightPeak = 10;
        const segmentsX = 70;
        const segmentsZ = 30;
        const mountainSideBias = 1.0;

        const COLORS = {
            SNOW: new THREE.Color(0xffffff),
            ROCK_LIGHT: new THREE.Color(0x888899),
            ROCK_DARK: new THREE.Color(0x444455),
        };

        const curve = new THREE.CatmullRomCurve3(points);
        const planeGeo = new THREE.PlaneGeometry(1, 1, segmentsX, segmentsZ);
        const posAttr = planeGeo.getAttribute('position');
        const vertex = new THREE.Vector3();
        const targetPointOnCurve = new THREE.Vector3();

        for (let i = 0; i <= segmentsX; i++) {
            const t = i / segmentsX;
            curve.getPointAt(t, targetPointOnCurve);
            const tangent = curve.getTangentAt(t).normalize();
            const sideDirection = new THREE.Vector3(-tangent.z, 0, tangent.x);

            for (let j = 0; j <= segmentsZ; j++) {
                const index = i * (segmentsZ + 1) + j;
                const vFactor = j / segmentsZ;
                const vOffset = (vFactor - mountainSideBias) * mountainWidth;
                const distToRidge = Math.abs(vFactor - 0.4) * mountainWidth;

                let baseHeight = 0;
                const maxDist = mountainWidth * 0.7;
                if (distToRidge < maxDist) {
                    baseHeight = Math.cos((distToRidge / maxDist) * (Math.PI / 2)) * mountainHeightPeak;
                }

                let finalY = 0;
                let xJitter = 0;
                let zJitter = 0;

                if (baseHeight > 1.0) {
                    finalY = Math.max(0, baseHeight + (Math.random() - 0.5) * 12);
                    xJitter = (Math.random() - 0.5) * 4;
                    zJitter = (Math.random() - 0.5) * 4;
                }

                const finalX = targetPointOnCurve.x + (sideDirection.x * vOffset) + xJitter;
                const finalZ = targetPointOnCurve.z + (sideDirection.z * vOffset) + zJitter;
                const finalYPos = targetPointOnCurve.y + finalY;

                posAttr.setXYZ(index, finalX, finalYPos, finalZ);
            }
        }

        if (opening) {
            const openingPos = new THREE.Vector3();
            opening.getWorldPosition(openingPos);
            const safeZoneRadius = 14;
            const clearanceHeight = 10;

            for (let i = 0; i < posAttr.count; i++) {
                vertex.fromBufferAttribute(posAttr, i);
                const dist = Math.sqrt(Math.pow(vertex.x - openingPos.x, 2) + Math.pow(vertex.z - openingPos.z, 2));
                if (dist < safeZoneRadius && vertex.y < clearanceHeight) {
                    posAttr.setY(i, -25);
                }
            }
        }

        posAttr.needsUpdate = true;
        let mountainGeo = planeGeo.toNonIndexed();
        mountainGeo.computeVertexNormals();

        const count = mountainGeo.getAttribute('position').count;
        const colors = new Float32Array(count * 3);
        const finalPosAttr = mountainGeo.getAttribute('position');
        const normalAttr = mountainGeo.getAttribute('normal');
        const normal = new THREE.Vector3();
        const up = new THREE.Vector3(0, 1, 0);
        const color = new THREE.Color();

        for (let i = 0; i < count; i += 3) {
            const h = (finalPosAttr.getY(i) + finalPosAttr.getY(i + 1) + finalPosAttr.getY(i + 2)) / 3;
            normal.fromBufferAttribute(normalAttr, i);
            const upwardness = normal.dot(up);

            if ((h > mountainHeightPeak * 0.55 && upwardness > 0.65) || (upwardness > 0.9 && h > 10)) {
                color.copy(COLORS.SNOW);
            } else {
                color.copy(Math.random() > 0.5 ? COLORS.ROCK_LIGHT : COLORS.ROCK_DARK);
            }

            for (let j = 0; j < 3; j++) {
                const idx = (i + j) * 3;
                colors[idx] = color.r;
                colors[idx + 1] = color.g;
                colors[idx + 2] = color.b;
            }
        }

        mountainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        const mountainMat = new THREE.MeshStandardMaterial({
            vertexColors: true,
            flatShading: true,
            roughness: 0.9,
            side: THREE.DoubleSide
        });

        const mountain = new THREE.Mesh(mountainGeo, mountainMat);
        ctx.scene.add(mountain);
    },

    createMountainOpening: () => {
        const tunnelWidthOuter = 16;
        const tunnelHeightWalls = 5;
        const tunnelArchRise = 2;
        const tunnelThickness = 3;
        const tunnelDepth = 5;

        const halfWidthO = tunnelWidthOuter / 2;
        const controlPointY_O = tunnelHeightWalls + (tunnelArchRise * 2);
        const caveOpeningGroup = new THREE.Group();

        const archShape = new THREE.Shape();
        archShape.moveTo(-halfWidthO, 0);
        archShape.lineTo(-halfWidthO, tunnelHeightWalls);
        archShape.quadraticCurveTo(0, controlPointY_O, halfWidthO, tunnelHeightWalls);
        archShape.lineTo(halfWidthO, 0);
        archShape.lineTo(-halfWidthO, 0);

        const halfWidthI = halfWidthO - tunnelThickness;
        const wallHeightI = tunnelHeightWalls;
        const controlPointY_I = controlPointY_O - tunnelThickness;

        const holePath = new THREE.Path();
        holePath.moveTo(halfWidthI, 0);
        holePath.lineTo(halfWidthI, wallHeightI);
        holePath.quadraticCurveTo(0, controlPointY_I, -halfWidthI, wallHeightI);
        holePath.lineTo(-halfWidthI, 0);
        holePath.lineTo(halfWidthI, 0);

        archShape.holes.push(holePath);

        const archGeo = new THREE.ExtrudeGeometry(archShape, { depth: tunnelDepth, steps: 1, bevelEnabled: false });
        archGeo.translate(0, 0, -tunnelDepth / 2);

        const tunnelMat = MATERIALS.concrete.clone();
        tunnelMat.side = THREE.DoubleSide;
        const arch = new THREE.Mesh(archGeo, tunnelMat);
        caveOpeningGroup.add(arch);

        return caveOpeningGroup;
    },

    createForest: (ctx: SectorContext, polygon: THREE.Vector3[], spacing: number = 8, type: string | string[] = 'random') => {
        if (ctx.debugMode) {
            SectorBuilder.visualizePolygon(ctx, polygon, 0x00ff00);
        }
        ObjectGenerator.createForest(ctx, polygon, spacing, type);
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
            SectorBuilder.spawnDebugMarker(ctx, trig.position.x, trig.position.z, 2, trig.id.toUpperCase());
            const ringGeo = new THREE.RingGeometry(trig.radius - 0.2, trig.radius, 32);
            const ringMat = new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.rotation.x = -Math.PI / 2;
            ring.position.set(trig.position.x, 0.1, trig.position.z);
            ctx.scene.add(ring);
        });
    },

    generatePlaceholder: async (ctx: SectorContext) => {
        for (let i = 0; i < 50; i++) {
            const x = (Math.random() - 0.5) * 200;
            const z = (Math.random() - 0.5) * 200;
        }
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
            const firePart = isLarge ? 'large_fire' : 'campfire_flame';
            const smokePart = isLarge ? 'large_smoke' : 'campfire_spark';

            parent.userData.effects.push(
                { type: 'emitter', particle: firePart, interval: isLarge ? 40 : 50, count: 1, offset: new THREE.Vector3(offset.x, offset.y + (isLarge ? 1.0 : 0.5), offset.z), spread: isLarge ? 1.5 : 0.3, color: 0xffaa00 },
                { type: 'emitter', particle: smokePart, interval: isLarge ? 80 : 150, count: 1, offset: new THREE.Vector3(offset.x, offset.y + (isLarge ? 2.0 : 1.0), offset.z), spread: isLarge ? 2.0 : 0.4, color: isLarge ? 0x333333 : 0xffdd00 }
            );
        }
    }
};
