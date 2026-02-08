
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
            if (ctx.debugMode) {
                SectorBuilder.visualizeBounds(ctx, def.bounds);
            }
        }

        if (ctx.debugMode) {
            SectorBuilder.visualizeTriggers(ctx);
        }

        if (ctx.yield) await ctx.yield();
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
            ctx.obstacles.push({
                mesh,
                collider: {
                    type: 'box',
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

    visualizeForests: (ctx: SectorContext) => {
        // We don't track forests explicitly in context, but they are often added to obstacles or just scene.
        // However, if the user wants to visualize the polygon used for creation, that polygon is lost unless stored.
        // The user mentioned "Sector2.ts (line 273-292) to draw lines for forrests and invisible walls".
        // In Sector2, the polygons are local variables.
        // To visualize them universally, we'd need to change createForest to store the debug info in ctx.debugShapes or similar?
        // OR we just provide a helper "SectorBuilder.visualizePolygon(points, color)" that the Sector script calls?
        // The user asked "Is it also possible to use the special code from Sector2.ts... Then we have to store forests in the SectorManager or so?"
        // So yes, we need to store them.
        // Let's verify if 'obstacles' has enough info? No, it has meshes.
        // We'll add 'debugShapes' to SectorContext? Or just rely on Sector scripts calling a visualization helper.
        // The user's request implies automatic visualization if possible, or "store forests in SectorManager".
        // Let's add a `SectorBuilder.debugPolygon(ctx, points, color)` helper and call it inside `createForest` if debugMode is on.

        // Actually, let's update createForest to auto-visualize if debugMode.
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

    visualizePath: (ctx: SectorContext, points: THREE.Vector3[], color: number = 0x0000ff) => {
        if (!ctx.debugMode) return;
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const mat = new THREE.LineBasicMaterial({ color });
        const line = new THREE.Line(geo, mat);
        line.position.y = 2;
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
        ctx.chests.push({ mesh: chest, type, scrap: isBig ? 100 : 25, radius: 2, opened: false });

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
        // Persistence Check: Don't spawn if already found
        const foundList = (ctx as any).collectiblesFound || []; // Fallback if type not updated yet
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

        // Animation Hook (using userData to rotate rings in game loop if possible, or just static for now)
        // We'll trust the engine or add a simple rotation effect if we can.
        // For now, let's just add the light and particles.

        const light = new THREE.PointLight(colorPrimary, 3, 10);
        light.position.set(0, 1.2, 0);
        group.add(light);

        // Tech Particles (Upward floating)
        if (!group.userData.effects) group.userData.effects = [];
        group.userData.effects.push(
            {
                type: 'emitter',
                particle: 'spark', // Generic spark, assuming texture exists
                interval: 100,
                count: 1,
                offset: new THREE.Vector3(0, 0.2, 0),
                spread: 0.2,
                color: colorPrimary,
                velocity: new THREE.Vector3(0, 2, 0) // Upward velocity
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
    setOnFire: (ctx: SectorContext, object: THREE.Object3D, opts?: { smoke?: boolean, color?: number, intensity?: number, distance?: number, offset?: THREE.Vector3, onRoof?: boolean }) => {
        if (opts?.onRoof && !opts.offset) {
            let height = 0;
            if (object.userData.size) {
                height = (object.userData.size as THREE.Vector3).y;
            } else {
                const box = new THREE.Box3().setFromObject(object);
                height = box.max.y - box.min.y;
            }
            opts.offset = new THREE.Vector3(0, height * 1.3, 0); // 110% height to be clearly above roof
        }
        EffectManager.attachEffect(object, 'fire', opts);
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
        ctx.obstacles.push({ mesh: bale, collider: { type: 'sphere', radius: 1.2 * scale } });
    },

    spawnTimberPile: (ctx: SectorContext, x: number, z: number, rotation: number = 0, scale: number = 1.0) => {
        const timber = ObjectGenerator.createTimberPile(scale);
        timber.position.set(x, 0, z);
        timber.rotation.y = rotation;
        ctx.scene.add(timber);
        // Box obstacle for timber pile
        ctx.obstacles.push({ mesh: timber, collider: { type: 'box', size: new THREE.Vector3(6 * scale, 3 * scale, 6 * scale) } });
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
        createRoof: boolean = true
    ) {
        // Use ObjectGenerator to create the mesh with merged geometry
        const building = ObjectGenerator.createBuilding(width, height, depth, color, createRoof);

        building.position.set(x, 0, z);
        building.rotation.y = rotation;
        // Shadow properties are set in createBuilding, but we verify here if needed or if createBuilding changes
        building.castShadow = true;
        building.receiveShadow = true;

        ctx.scene.add(building);

        // Get dimensions from userData if available (ObjectGenerator should set this)
        // If not, calculate from params.
        const sizeY = building.userData.size ? building.userData.size.y : (createRoof ? height * 1.5 : height);

        // 6. Collision
        if (ctx.obstacles) {
            ctx.obstacles.push({
                mesh: building,
                collider: {
                    type: 'box',
                    size: new THREE.Vector3(width, sizeY, depth)
                }
            });
        }

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
        ctx.obstacles.push({
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
        ctx.obstacles.push({
            mesh: container,
            collider: { type: 'box', size: new THREE.Vector3(6.0, 2.6, 2.4) }
        });

        return container;
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
        ctx.obstacles.push({
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

            // 1. Mät bilens höjd för exakt stapling
            const box = new THREE.Box3().setFromObject(vehicle);
            const size = box.getSize(new THREE.Vector3());
            const vehicleHeight = size.y;

            // 2. Positionera fordonet plant
            // Vi lägger till en minimal slumpmässig förskjutning i X och Z 
            // så att bilarna inte står exakt centrerat ovanpå varandra.
            const offsetX = (Math.random() - 0.5) * posJitter;
            const offsetZ = (Math.random() - 0.5) * posJitter;

            vehicle.position.set(offsetX, currentY + (vehicleHeight / 2), offsetZ);

            // 3. Endast Y-rotation med ditt önskade låga jitter
            vehicle.rotation.y = (Math.random() - 0.5) * toRad(maxJitter);

            // Säkerställ att X och Z är nollade (ingen lutning)
            vehicle.rotation.x = 0;
            vehicle.rotation.z = 0;

            vehicleStack.add(vehicle);

            // 4. Öka höjden inför nästa bil
            currentY += vehicleHeight;
        }

        ctx.scene.add(vehicleStack);

        // Add Collision for the entire stack
        const box = new THREE.Box3().setFromObject(vehicleStack);
        const size = box.getSize(new THREE.Vector3());
        ctx.obstacles.push({
            mesh: vehicleStack,
            collider: { type: 'box', size: size }
        });
    },

    spawnTree: (ctx: SectorContext, type: 'spruce' | 'pine' | 'birch', x: number, z: number, scaleMultiplier: number = 1.0) => {
        const tree = ObjectGenerator.createTree(type, scaleMultiplier);
        tree.position.set(x, 0, z);
        tree.rotation.y = Math.random() * Math.PI * 2;
        ctx.scene.add(tree);

        // Collision (Trunk)
        const colRadius = 0.5 * scaleMultiplier;
        ctx.obstacles.push({
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
            ctx.obstacles.push({
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
        ctx.obstacles.push({ mesh: barrel, collider: { type: 'sphere', radius: 0.6 } });
    },

    // Area Fillers
    fillArea: async (ctx: SectorContext, center: { x: number, z: number }, size: { width: number, height: number } | number, count: number, type: 'tree' | 'rock' | 'debris', avoidCenterRadius: number = 0, exclusionZones: { pos: THREE.Vector3, radius: number }[] = []) => {
        await ObjectGenerator.fillArea(ctx, center, size, count, type, avoidCenterRadius, exclusionZones);
    },

    fillWheatField: async (ctx: SectorContext, polygon: THREE.Vector3[], density: number = 0.5) => {
        await ObjectGenerator.fillWheatField(ctx, polygon, density);
    },

    createForest: async (ctx: SectorContext, polygon: THREE.Vector3[], spacing: number = 8, type: string | string[] = 'random') => {
        if (ctx.debugMode) {
            SectorBuilder.visualizePolygon(ctx, polygon, 0x00ff00);
        }
        await ObjectGenerator.createForest(ctx, polygon, spacing, type);
    },

    // Linear Paths (Routed to PathGenerator)
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
        if (eff.type === 'light') {
            const light = new THREE.PointLight(eff.color || 0xffaa00, eff.intensity || 1, 15);
            light.position.set(offset.x, offset.y, offset.z);
            parent.add(light);
            // Auto-enable flickering for atmosphere if it's a "warm" light
            if ((eff.color || 0) > 0xffaa00 || !eff.color) {
                ctx.flickeringLights.push({ light, baseInt: eff.intensity || 1, flickerRate: 0.05 + Math.random() * 0.1 });
            }
        } else if (eff.type === 'fire') {
            // We'll use a direct point light for the glow and assume the fire asset handles its own particle effects
            // if we actually spawned a full fire object.
            const light = new THREE.PointLight(0xff6600, 2, 10);
            light.position.set(offset.x, offset.y + 1, offset.z);
            parent.add(light);
            ctx.flickeringLights.push({ light, baseInt: 2, flickerRate: 0.15 });

            // Tag for GameSession to pick up
            parent.userData.isFire = true;
            if (parent.userData.effects === undefined) parent.userData.effects = [];
            parent.userData.effects.push(
                { type: 'emitter', particle: 'campfire_flame', interval: 50, count: 1, offset: new THREE.Vector3(offset.x, offset.y + 0.5, offset.z), spread: 0.3, color: 0xffaa00 },
                { type: 'emitter', particle: 'campfire_spark', interval: 150, count: 1, offset: new THREE.Vector3(offset.x, offset.y + 1.0, offset.z), spread: 0.4, color: 0xffdd00 }
            );
        }
    }
};
