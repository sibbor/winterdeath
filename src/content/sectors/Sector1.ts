import * as THREE from 'three';
import { SectorDef, SectorContext } from '../../types/SectorEnvironment';
import { MATERIALS, GEOMETRY, createTextSprite, ModelFactory } from '../../utils/assets';
import { SectorGenerator } from '../../core/world/SectorGenerator';
import { PathGenerator } from '../../core/world/PathGenerator';
import { ObjectGenerator } from '../../core/world/ObjectGenerator';
import { EnvironmentGenerator } from '../../core/world/EnvironmentGenerator';
import { t } from '../../utils/i18n';
import { CAMERA_HEIGHT } from '../constants';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';


const LOCATIONS = {
    SPAWN: {
        PLAYER: { x: -21, z: 15, rot: Math.PI / 1.25 },
        FAMILY: { x: 144, z: 400, y: 4 },
        BOSS: { x: 174, z: 380 }
    },
    CINEMATIC: {
        OFFSET: { x: 15, y: 12, z: 15 },
        LOOK_AT: { x: 0, y: 1.5, z: 0 }
    },
    VEHICLES: {
        POLICE_CAR: { x: -23, z: -1, rotation: Math.PI / 1.25 },
        FAMILY_CAR: { x: -18, z: 4 },
    },
    BUILDINGS: {
        HOME: { x: 0, z: 0 },
        KINDGARTEN: { x: 150, z: 20 },
    },
    POIS: {
        SMU: { x: 150, z: 110 },
        CHURCH: { x: 165, z: 240 },
        CAFE: { x: 110, z: 250 },
        GROCERY: { x: 170, z: 300 },
        GYM: { x: 105, z: 295 },
        PIZZERIA: { x: 200, z: 250 },
        TRAIN_YARD: { x: 150, z: 400 },
    },
    COLLECTIBLES: {
        C1: { x: 190, z: 90 },
        C2: { x: 142, z: 298 }
    },
    TRIGGERS: {
        START_TRACKS: { x: 6, z: 30 },
        CHAOS_HERE: { x: 204, z: 157 },
        BLOOD_STAINS: { x: 34, z: 47 },
        STILL_TRACKING: { x: 87, z: 60 },
        TOWN_CENTER: { x: 145, z: 260 },
        BUS: { x: 138, z: 331 },
        TUNNEL: { x: 138, z: 344 }
    },
    OVERPASS: [
        new THREE.Vector3(264, 5, 345),
        new THREE.Vector3(135, 5, 345),
        new THREE.Vector3(84, 5, 350),
        new THREE.Vector3(20, 5, 364)
    ]
} as const;

export const Sector1: SectorDef = {
    id: 0,
    name: "sectors.sector_1_name",
    environment: {
        bgColor: 0x020208,
        fogDensity: 0.02,
        ambientIntensity: 0.4, // Increased from 0.2 for better general visibility
        groundColor: 0xddddff,
        fov: 50,
        skyLight: { visible: true, color: 0x6688ff, intensity: 1.0, position: { x: 50, y: 35, z: 50 } },
        cameraOffsetZ: 40,
        cameraHeight: CAMERA_HEIGHT,
        weather: 'snow'
    },
    // Automatic Content
    groundType: 'SNOW',
    //bounds: { width: 500, depth: 900 },
    ambientLoop: 'ambient_wind_loop',

    // --- ADJUST SPAWN POINTS HERE ---
    playerSpawn: LOCATIONS.SPAWN.PLAYER,
    familySpawn: LOCATIONS.SPAWN.FAMILY,
    bossSpawn: LOCATIONS.SPAWN.BOSS,

    // Auto-Spawn Collectibles
    collectibles: [
        { id: 's1_collectible_1', x: LOCATIONS.COLLECTIBLES.C1.x, z: LOCATIONS.COLLECTIBLES.C1.z },
        { id: 's1_collectible_2', x: LOCATIONS.COLLECTIBLES.C2.x, z: LOCATIONS.COLLECTIBLES.C2.z }
    ],

    // Cinematic Camera Setup
    cinematic: {
        offset: LOCATIONS.CINEMATIC.OFFSET,
        lookAtOffset: LOCATIONS.CINEMATIC.LOOK_AT,
    },

    setupProps: (ctx: SectorContext) => {
        const { scene, obstacles } = ctx;
        (ctx as any).sectorState.ctx = ctx;

        // Reward Chest at boss spawn
        SectorGenerator.spawnChest(ctx, LOCATIONS.SPAWN.BOSS.x, LOCATIONS.SPAWN.BOSS.z, 'big');

        // Road: Vargstigen -> Drive Way
        PathGenerator.createRoad(ctx, [
            new THREE.Vector3(-10, 0, 2),
            new THREE.Vector3(-42, 0, 2),
        ], 10);

        // Road: Vargstigen
        PathGenerator.createRoad(ctx, [
            new THREE.Vector3(-42, 0, 2),
            new THREE.Vector3(-42, 0, 35),
            new THREE.Vector3(-42, 0, -48)
        ], 16);

        // Path: Home -> SMU
        PathGenerator.createDirtPath(ctx, [
            new THREE.Vector3(25, 0, 28),
            new THREE.Vector3(35, 0, 48),
            new THREE.Vector3(79, 0, 49),
            new THREE.Vector3(103, 0, 74),
            new THREE.Vector3(203, 0, 78),
        ], 4, undefined, false, true);

        // Road: SMU -> Main Road
        PathGenerator.createRoad(ctx, [
            new THREE.Vector3(210, 0, 30),
            new THREE.Vector3(210, 0, 150),
            new THREE.Vector3(188, 0, 164),
            new THREE.Vector3(35, 0, 225)
        ], 16, undefined, false, true);

        // Road: Church -> Grocery Store
        PathGenerator.createRoad(ctx, [
            new THREE.Vector3(135, 0, 193),
            new THREE.Vector3(147, 0, 270)
        ], 8);

        // Road: Town Center, main road
        PathGenerator.createRoad(ctx, [
            new THREE.Vector3(236, 0, 271),
            new THREE.Vector3(63, 0, 271),
        ], 16);

        // Street Lights along Main Road
        for (let x = 70; x <= 230; x += 40) {
            SectorGenerator.spawnStreetLight(ctx, x, 280, Math.PI / 2);
        }

        // Street Lights along Vargstigen
        for (let z = -40; z <= 30; z += 35) {
            SectorGenerator.spawnStreetLight(ctx, -50, z, Math.PI / 2);
        }

        // Path: Home -> Forest Path (Footprints)
        PathGenerator.createDecalPath(ctx, [
            new THREE.Vector3(9, 0, 4),
            new THREE.Vector3(14, 0, 10),
            new THREE.Vector3(22, 0, 26),
            new THREE.Vector3(27, 0, 31)
        ], { spacing: 0.6, size: 0.4, material: MATERIALS.footprintDecal, variance: 0.2 });

        // Path: SMU -> Collectible 1 -> Main Road (Footprints)
        PathGenerator.createDecalPath(ctx, [
            new THREE.Vector3(181, 0, 81),
            new THREE.Vector3(189, 0, 89),
            new THREE.Vector3(192, 0, 99),
            new THREE.Vector3(192, 0, 112),
            new THREE.Vector3(186, 0, 117),
            new THREE.Vector3(180, 0, 121),
            new THREE.Vector3(181, 0, 128),
            new THREE.Vector3(201, 0, 148)
        ], { spacing: 0.6, size: 0.4, material: MATERIALS.footprintDecal, variance: 0.2 });

        // Home: House:
        SectorGenerator.spawnBuilding(ctx, LOCATIONS.BUILDINGS.HOME.x - 2, LOCATIONS.BUILDINGS.HOME.z + 10, 20, 7, 25, 0, 0xffffff, true, true, 1.0);

        // Home: Police car and family's car
        SectorGenerator.spawnVehicle(ctx, LOCATIONS.VEHICLES.POLICE_CAR.x, LOCATIONS.VEHICLES.POLICE_CAR.z, LOCATIONS.VEHICLES.POLICE_CAR.rotation, 'police');
        const familyCar = SectorGenerator.spawnVehicle(ctx, LOCATIONS.VEHICLES.FAMILY_CAR.x, LOCATIONS.VEHICLES.FAMILY_CAR.z, 0.3, 'station wagon', 0x333333, false);
        SectorGenerator.setOnFire(ctx, familyCar, { smoke: true, intensity: 200, distance: 50, onRoof: true });

        // Home: Hedges
        SectorGenerator.createHedge(ctx, [new THREE.Vector3(-19, 0, 8), new THREE.Vector3(-29, 0, 8), new THREE.Vector3(-29, 0, 32), new THREE.Vector3(-17, 0, 40), new THREE.Vector3(11, 0, 40), new THREE.Vector3(23, 0, 33)]);
        SectorGenerator.createHedge(ctx, [new THREE.Vector3(-6, 0, 0), new THREE.Vector3(31, 0, 0), new THREE.Vector3(31, 0, 31)]);

        // Kindergarten
        const kindergarten = new THREE.Mesh(new THREE.BoxGeometry(60, 10, 50), MATERIALS.building);
        kindergarten.position.set(LOCATIONS.BUILDINGS.KINDGARTEN.x, 0, LOCATIONS.BUILDINGS.KINDGARTEN.z);
        kindergarten.castShadow = true;
        scene.add(kindergarten);
        SectorGenerator.addObstacle(ctx, {
            mesh: kindergarten,
            collider: { type: 'box', size: new THREE.Vector3(60, 20, 50) }
        });

        // Fence between SMU/Kindergarten
        SectorGenerator.createFence(ctx, [
            new THREE.Vector3(104, 0, 19),
            new THREE.Vector3(104, 0, 67),
            new THREE.Vector3(203, 0, 73)
        ], 'mesh', 2.5, false);

        // Random Buildings
        const randomBuildings = [
            { x: 54, z: 15, s: [15, 12, 15], rotation: 0, color: 0x776655 },
            { x: 237, z: 92, s: [18, 15, 20], rotation: 1.55, color: 0x555566 },
            { x: 235, z: 117, s: [12, 10, 12], rotation: 1.5, color: 0x665555 },
            { x: 224, z: 168, s: [20, 8, 20], rotation: Math.PI / 3, color: 0x444444 },
            { x: 117, z: 170, s: [16, 14, 16], rotation: Math.PI / 6, color: 0x777777 }
        ];
        randomBuildings.forEach((b) => {
            SectorGenerator.spawnBuilding(ctx, b.x, b.z, b.s[0], b.s[1], b.s[2], b.rotation, b.color, true, true);
        });

        // SMU: stone wall
        SectorGenerator.createStoneWall(ctx, [
            new THREE.Vector3(203, 0, 71),
            new THREE.Vector3(206, 0, 112),
            new THREE.Vector3(205, 0, 134),
            new THREE.Vector3(203, 0, 146)
        ], 1.5, 1.5);

        // POI: SMU
        const smu = new THREE.Mesh(new THREE.BoxGeometry(50, 10, 50), MATERIALS.brownBrick);
        smu.position.set(LOCATIONS.POIS.SMU.x, 5, LOCATIONS.POIS.SMU.z);
        smu.castShadow = true;
        scene.add(smu);
        SectorGenerator.addObstacle(ctx, {
            mesh: smu,
            collider: { type: 'box', size: new THREE.Vector3(50, 20, 50) }
        });
        SectorGenerator.setOnFire(ctx, smu, { smoke: true, intensity: 200, distance: 50, onRoof: true });

        // 2 blue colored containers behind (west of) the building
        SectorGenerator.spawnContainer(ctx, LOCATIONS.POIS.SMU.x - 35, LOCATIONS.POIS.SMU.z - 5, 0, 0x0044cc);
        SectorGenerator.spawnContainer(ctx, LOCATIONS.POIS.SMU.x - 35, LOCATIONS.POIS.SMU.z + 5, 0, 0x0044cc);

        // Burning Cars
        const carColors = [0x3355ff, 0xcccccc, 0xcc2222]; // Blue, Silver, Red
        const carType = ['suv', 'station wagon', 'sedan'] as const;
        for (let i = 0; i < 3; i++) {
            const rotation = Math.random() * Math.PI;
            const carPos = { x: LOCATIONS.POIS.SMU.x + 35, z: LOCATIONS.POIS.SMU.z + (i * 12) - 10 };
            const car = SectorGenerator.spawnVehicle(ctx, carPos.x, carPos.z, rotation, carType[i], carColors[i]);
            SectorGenerator.setOnFire(ctx, car, { smoke: true, intensity: 200, distance: 50, onRoof: true });
        }

        // Hedges:
        SectorGenerator.createHedge(ctx, [new THREE.Vector3(141, 0, 190), new THREE.Vector3(146, 0, 230)]);
        SectorGenerator.createHedge(ctx, [new THREE.Vector3(130, 0, 193), new THREE.Vector3(136, 0, 231)]);

        // POI: Church 
        const churchGroup = new THREE.Group();
        churchGroup.position.set(LOCATIONS.POIS.CHURCH.x, 0, LOCATIONS.POIS.CHURCH.z);

        // Merge body and tower parts
        const churchBodyGeo = new THREE.BoxGeometry(15, 12, 15);
        churchBodyGeo.translate(0, 6, 0);
        const churchBody = new THREE.Mesh(churchBodyGeo, MATERIALS.brownBrick);
        churchGroup.add(churchBody);

        // Cross (Merged)
        const crossVGeo = new THREE.BoxGeometry(0.5, 4, 0.2);
        crossVGeo.translate(0, 8, 7.6);
        const crossHGeo = new THREE.BoxGeometry(2.5, 0.5, 0.2);
        crossHGeo.translate(0, 8.5, 7.6);
        const mergedCrossGeo = BufferGeometryUtils.mergeGeometries([crossVGeo, crossHGeo]);
        const cross = new THREE.Mesh(mergedCrossGeo, MATERIALS.crossEmissive);
        churchGroup.add(cross);

        // Tower (Merged)
        const towerGeo = new THREE.BoxGeometry(4, 12, 4);
        towerGeo.translate(-10, 6, -15);
        const towerTopGeo = new THREE.ConeGeometry(6, 2, 6);
        towerTopGeo.translate(-10, 12, -15);
        const mergedTowerGeo = BufferGeometryUtils.mergeGeometries([towerGeo, towerTopGeo]);
        const tower = new THREE.Mesh(mergedTowerGeo, MATERIALS.blackMetal);
        churchGroup.add(tower);

        scene.add(churchGroup);
        SectorGenerator.addObstacle(ctx, {
            mesh: churchGroup,
            collider: { type: 'box', size: new THREE.Vector3(15, 20, 25) }
        });
        // Add separate collider for the Tower which is offset
        SectorGenerator.addObstacle(ctx, {
            position: new THREE.Vector3(LOCATIONS.POIS.CHURCH.x - 10, 0, LOCATIONS.POIS.CHURCH.z - 15),
            collider: { type: 'box', size: new THREE.Vector3(6, 20, 6) }
        });
        // Church burning on roof
        SectorGenerator.setOnFire(ctx, churchGroup, { smoke: true, intensity: 25, distance: 50, onRoof: true });

        // Café 
        const cafeGroup = new THREE.Group();
        cafeGroup.position.set(LOCATIONS.POIS.CAFE.x, 6, LOCATIONS.POIS.CAFE.z);

        const cafeLeftGeo = new THREE.BoxGeometry(5, 12, 12);
        cafeLeftGeo.translate(-6, 0, 0);
        const cafeRightGeo = new THREE.BoxGeometry(5, 12, 12);
        cafeRightGeo.translate(6, 0, 0);
        const cafeCenterGeo = new THREE.BoxGeometry(12, 12, 5);
        cafeCenterGeo.translate(0, 0, -3);

        const mergedCafeGeo = BufferGeometryUtils.mergeGeometries([cafeLeftGeo, cafeRightGeo, cafeCenterGeo]);
        const cafeBody = new THREE.Mesh(mergedCafeGeo, MATERIALS.yellowBrick);
        cafeGroup.add(cafeBody);
        cafeGroup.castShadow = true;

        // Cafe mesh is approx 17m wide (5+5+12 - overlaps), 12m deep.
        const obstacle_cafe = { mesh: cafeGroup, collider: { type: 'box' as const, size: new THREE.Vector3(18, 20, 12) } };
        SectorGenerator.addObstacle(ctx, obstacle_cafe);

        const cafeSign = createTextSprite(t('clues.s1_poi_cafe'));
        cafeSign.position.set(0, 3, 6.5);
        cafeGroup.add(cafeSign);

        scene.add(cafeGroup);
        // Neon Sign for Cafe
        SectorGenerator.spawnNeonSign(ctx, LOCATIONS.POIS.CAFE.x, LOCATIONS.POIS.CAFE.z - 6, 0, "CAFÉ", 0xffaa00);

        // Grocery Store (Mataffär)
        const grocery = SectorGenerator.spawnStorefrontBuilding(ctx, LOCATIONS.POIS.GROCERY.x, LOCATIONS.POIS.GROCERY.z, 15, 10, 30, 0, {
            lowerMat: MATERIALS.whiteBrick,
            upperMat: MATERIALS.wooden_fasade,
            shopWindows: false,
            upperWindows: true,
            withRoof: false
        });

        // West side shop windows
        const grocWinMat = MATERIALS.glass;
        const grocWinGeo = new THREE.PlaneGeometry(3.5, 3.5);
        for (let z = -10; z <= 10; z += 5) {
            const win = new THREE.Mesh(grocWinGeo, grocWinMat);
            win.position.set(LOCATIONS.POIS.GROCERY.x - 7.6, 2.5, LOCATIONS.POIS.GROCERY.z + z);
            win.rotation.y = -Math.PI / 2;
            scene.add(win);
        }

        // North side glass entrance
        const grocEntrance = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), MATERIALS.glass);
        grocEntrance.position.set(LOCATIONS.POIS.GROCERY.x, 3, LOCATIONS.POIS.GROCERY.z - 15.1);
        scene.add(grocEntrance);

        // Signage
        SectorGenerator.spawnNeonSign(ctx, LOCATIONS.POIS.GROCERY.x - 7.7, LOCATIONS.POIS.GROCERY.z - 2, -Math.PI / 2, "Mataffär", 0xff0000, true);
        SectorGenerator.spawnNeonHeart(ctx, LOCATIONS.POIS.GROCERY.x - 7.7, 3.5, LOCATIONS.POIS.GROCERY.z + 6, -Math.PI / 2, 0xff0000);

        // 2 black colored containers behind the building
        SectorGenerator.spawnContainer(ctx, LOCATIONS.POIS.GROCERY.x - 5, LOCATIONS.POIS.GROCERY.z + 20, Math.PI / 2.5, 0x111111);
        SectorGenerator.spawnContainer(ctx, LOCATIONS.POIS.GROCERY.x + 5, LOCATIONS.POIS.GROCERY.z + 20, Math.PI / 2.5, 0x111111);

        // Gym 
        const gym = SectorGenerator.spawnStorefrontBuilding(ctx, LOCATIONS.POIS.GYM.x, LOCATIONS.POIS.GYM.z, 40, 12, 20, 0, {
            lowerMat: MATERIALS.sheet_metal,
            upperMat: MATERIALS.sheet_metal,
            shopWindows: false,
            upperWindows: true,
            withRoof: false
        });

        // West side glass staircase
        SectorGenerator.spawnGlassStaircase(ctx, LOCATIONS.POIS.GYM.x - 23, LOCATIONS.POIS.GYM.z, 6, 12, 8, 0);

        const gymSign = createTextSprite(t('clues.s1_poi_gym'));
        gymSign.position.set(0, 5, 10.1);
        gym.add(gymSign);

        // Pizzeria
        SectorGenerator.spawnStorefrontBuilding(ctx, LOCATIONS.POIS.PIZZERIA.x, LOCATIONS.POIS.PIZZERIA.z, 20, 8, 15, 0, {
            lowerMat: MATERIALS.plaster,
            upperMat: MATERIALS.plaster,
            shopWindows: true,
            upperWindows: true,
            withRoof: true
        });
        SectorGenerator.spawnNeonSign(ctx, LOCATIONS.POIS.PIZZERIA.x, LOCATIONS.POIS.PIZZERIA.z + 7.6, Math.PI, "PIZZERIA", 0xffaa00, true);

        // --- OVERPASS & TUNNEL ---
        // 1. Earth Mound (Embankment) - Split into two parts to leave gap for tunnel
        // West Segment (Left of Tunnel) - X=20 to ~114
        const embankmentWest = [
            new THREE.Vector3(20, 5, 364),
            new THREE.Vector3(84, 5, 350),
            new THREE.Vector3(133, 5, 345)
        ];
        SectorGenerator.createEmbankment(ctx, embankmentWest, 18, 5, MATERIALS.dirt);

        // East Segment (Right of Tunnel) - X=145 to 264
        const embankmentEast = [
            new THREE.Vector3(145, 5, 345),
            new THREE.Vector3(264, 5, 345)
        ];
        SectorGenerator.createEmbankment(ctx, embankmentEast, 18, 5, MATERIALS.dirt);

        // Overpass
        const overpassPoints = LOCATIONS.OVERPASS.map(p => p.clone());
        PathGenerator.createRoad(ctx, overpassPoints, 12);

        // --- GUARDRAILS & CRASH SCENE ---
        // South Guardrail (Continuous - Left side facing West)
        const railSouth = [
            new THREE.Vector3(264, 5, 351),
            new THREE.Vector3(135, 5, 351),
            new THREE.Vector3(84, 5, 356),
            new THREE.Vector3(20, 5, 370)
        ];
        SectorGenerator.createGuardrail(ctx, railSouth, true);

        // North Guardrail (Broken - Right side facing West)
        // Segment 1: West of crash
        const railNorthWest = [
            new THREE.Vector3(130, 5, 339),
            new THREE.Vector3(84, 5, 344),
            new THREE.Vector3(20, 5, 358)
        ];
        SectorGenerator.createGuardrail(ctx, railNorthWest, true);

        // Segment 2: East of crash
        const railNorthEast = [
            new THREE.Vector3(264, 5, 339),
            new THREE.Vector3(145, 5, 339)
        ];
        SectorGenerator.createGuardrail(ctx, railNorthEast, true);

        // Debris: Twisted Metal hanging off the edge
        const debrisGeo = new THREE.BoxGeometry(0.15, 0.3, 5);
        const debrisPositions = [
            { x: 144, z: 339, ry: 0.2, rz: 0.1 },
            { x: 142, z: 338, ry: 0.5, rz: -0.5 }, // Hanging
            { x: 128, z: 337, ry: 0.8, rz: -0.8 }, // Moved from 139 (Tunnel blocked) to 128
            { x: 131, z: 339, ry: -0.2, rz: 0.1 }
        ];
        debrisPositions.forEach(d => {
            const mesh = new THREE.Mesh(debrisGeo, MATERIALS.guardrail);
            mesh.position.set(d.x, 5, d.z);
            mesh.rotation.set(0, d.ry, d.rz);
            mesh.castShadow = true;
            ctx.scene.add(mesh);
        });

        // Skid Marks (Sliding from West towards the broken edge)
        // Left Tire
        PathGenerator.createDecalPath(ctx, [
            new THREE.Vector3(100, 5.5, 344),
            new THREE.Vector3(115, 5.5, 343),
            new THREE.Vector3(125, 5.5, 341),
            new THREE.Vector3(130, 5.5, 339)
        ], { spacing: 0.2, size: 0.5, material: MATERIALS.skidMark, variance: 0.02 });
        // Right Tire
        PathGenerator.createDecalPath(ctx, [
            new THREE.Vector3(100, 5.5, 346.5),
            new THREE.Vector3(115, 5.5, 345.5),
            new THREE.Vector3(125, 5.5, 343.5),
            new THREE.Vector3(131, 5.5, 341.5)
        ], { spacing: 0.2, size: 0.5, material: MATERIALS.skidMark, variance: 0.02 });

        // 2. Concrete Tunnel at
        // This is where one road segment of the overpass crosses.
        // The tunnel should be oriented to connect town center to station.
        const tunnelPos = new THREE.Vector3(LOCATIONS.TRIGGERS.TUNNEL.x, 0, LOCATIONS.TRIGGERS.TUNNEL.z);
        ObjectGenerator.createTunnel(ctx, tunnelPos, 9, 3.5, 21, 0, 2.5, 0.5);

        // 3. The "Tunnel Blocker" Bus
        const bus = ObjectGenerator.createVehicle('bus', 1, 0x009ddb, false);

        // Bus Orientation: Lying on side (X-rotation), Front pointing East (+X)
        bus.position.set(LOCATIONS.TRIGGERS.BUS.x, 1.8, LOCATIONS.TRIGGERS.BUS.z);
        bus.rotation.set(Math.PI / 2, 0, 0); // Lying on side

        // Interaction Data
        SectorGenerator.addInteractable(ctx, bus, {
            id: 'tunnel_bus',
            label: 'ui.interact_plant_explosive',
            type: 'sector_specific'
        });

        bus.updateMatrixWorld();

        const busBox = new THREE.Box3().setFromObject(bus);
        const busSize = new THREE.Vector3();
        busBox.getSize(busSize);

        // Create a centered dummy mesh for collision to avoid offset issues with the visual group
        const busCenter = new THREE.Vector3();
        busBox.getCenter(busCenter);
        const colMesh = new THREE.Mesh(new THREE.BoxGeometry(busSize.x, busSize.y, busSize.z));
        colMesh.position.copy(busCenter);
        colMesh.visible = false;
        colMesh.updateMatrixWorld();
        scene.add(colMesh);

        const busIdx = obstacles.length;
        const obstacle_bus = { mesh: colMesh, collider: { type: 'box' as const, size: busSize } };
        SectorGenerator.addObstacle(ctx, obstacle_bus);

        // Bus - Burn effect (Relative to center of top face)
        SectorGenerator.setOnFire(ctx, bus, { smoke: true, intensity: 25, distance: 50, onRoof: true });
        scene.add(bus);

        // Store references in sectorState for interactive explosion
        (ctx as any).busObject = bus;
        (ctx as any).busObjectIdx = busIdx;

        // Fences
        const ty = LOCATIONS.POIS.TRAIN_YARD;
        SectorGenerator.createFence(ctx, [new THREE.Vector3(ty.x - 60, 0, ty.z + 40), new THREE.Vector3(ty.x + 60, 0, ty.z + 40)], 'mesh', 4, true);
        // Station Ground
        const stationGround = new THREE.Mesh(new THREE.PlaneGeometry(120, 80), MATERIALS.asphalt);
        stationGround.rotation.x = -Math.PI / 2;
        stationGround.position.set(LOCATIONS.POIS.TRAIN_YARD.x, 0.025, LOCATIONS.POIS.TRAIN_YARD.z);
        stationGround.receiveShadow = true;
        scene.add(stationGround);

        // Rail Track:
        PathGenerator.createRailTrack(ctx, [
            new THREE.Vector3(-17, 0, 450),
            new THREE.Vector3(0, 0, 435),
            new THREE.Vector3(65, 0, 400),
            new THREE.Vector3(150, 0, 400),
            new THREE.Vector3(260, 0, 415),
        ]);

        // Locomotive
        const train = new THREE.Group();
        train.position.set(LOCATIONS.POIS.TRAIN_YARD.x, 0, LOCATIONS.POIS.TRAIN_YARD.z);
        train.rotation.y = -0.05;
        const matBody = MATERIALS.train; const matBlack = MATERIALS.blackMetal;

        // Chassis (Black Metal)
        const chassis = new THREE.Mesh(new THREE.BoxGeometry(16, 1.5, 4), matBlack);
        chassis.position.y = 1.5;
        train.add(chassis);

        // Boiler and Cabin merged (Train Mat)
        const boilerGeo = new THREE.CylinderGeometry(1.8, 1.8, 10, 16);
        boilerGeo.rotateZ(Math.PI / 2);
        boilerGeo.translate(2, 4.0, 0);

        const cabinBodyGeo = new THREE.BoxGeometry(5, 2, 4.2);
        cabinBodyGeo.translate(-5, 2.3, 0);

        const mergedTrainGeo = BufferGeometryUtils.mergeGeometries([boilerGeo, cabinBodyGeo]);
        const trainBody = new THREE.Mesh(mergedTrainGeo, matBody);
        train.add(trainBody);
        scene.add(train);
        SectorGenerator.addObstacle(ctx, {
            mesh: train,
            collider: { type: 'box', size: new THREE.Vector3(18, 12, 6) }
        });

        // --- FOREST ---
        // FOREST
        // Forest: Home 1
        let forestPolygon = [
            new THREE.Vector3(37, 0, 44),
            new THREE.Vector3(36, 0, 30),
            new THREE.Vector3(103, 0, 30),
            new THREE.Vector3(99, 0, 67),
            new THREE.Vector3(76, 0, 43),
        ];
        SectorGenerator.createForest(ctx, forestPolygon, 8, 'spruce');

        // Forest: Home 2
        forestPolygon = [
            new THREE.Vector3(-27, 0, 45),
            new THREE.Vector3(-27, 0, 80),
            new THREE.Vector3(57, 0, 89),
            new THREE.Vector3(82, 0, 110),
            new THREE.Vector3(85, 0, 147),
            new THREE.Vector3(55, 0, 177),
            new THREE.Vector3(123, 0, 148),
            new THREE.Vector3(123, 0, 85),
            new THREE.Vector3(96, 0, 78),
            new THREE.Vector3(70, 0, 55),
            new THREE.Vector3(32, 0, 55),
            new THREE.Vector3(24, 0, 37),
        ];
        SectorGenerator.createForest(ctx, forestPolygon, 8, 'spruce');
        // Forest: SMU
        forestPolygon = [
            new THREE.Vector3(199, 0, 140),
            new THREE.Vector3(174, 0, 137),
            new THREE.Vector3(129, 0, 163),
            new THREE.Vector3(142, 0, 173),
        ];
        SectorGenerator.createForest(ctx, forestPolygon, 12, 'pine');
        // Forest: Town center (north west)
        forestPolygon = [
            new THREE.Vector3(128, 0, 200),
            new THREE.Vector3(65, 0, 234),
            new THREE.Vector3(68, 0, 253),
            new THREE.Vector3(68, 0, 253),
            new THREE.Vector3(100, 0, 253),
            new THREE.Vector3(100, 0, 237),
            new THREE.Vector3(122, 0, 237),
            new THREE.Vector3(122, 0, 253),
            new THREE.Vector3(138, 0, 253),
        ];
        SectorGenerator.createForest(ctx, forestPolygon, 12, 'birch');

        // Forest: Town center (south west)
        forestPolygon = [
            new THREE.Vector3(20, 0, 230),
            new THREE.Vector3(66, 0, 230),
            new THREE.Vector3(66, 0, 285),
            new THREE.Vector3(83, 0, 285),
            new THREE.Vector3(83, 0, 340),
            new THREE.Vector3(28, 0, 350),

        ];
        SectorGenerator.createForest(ctx, forestPolygon, 10, 'birch');

        // Forest: Town center (east)
        forestPolygon = [
            new THREE.Vector3(145, 0, 198),
            new THREE.Vector3(147, 0, 218),
            new THREE.Vector3(175, 0, 218),
            new THREE.Vector3(175, 0, 239),
            new THREE.Vector3(175, 0, 255),
            new THREE.Vector3(192, 0, 255),
            new THREE.Vector3(192, 0, 239),
            new THREE.Vector3(210, 0, 239),
            new THREE.Vector3(210, 0, 255),
            new THREE.Vector3(240, 0, 255),
            new THREE.Vector3(240, 0, 285),
            new THREE.Vector3(180, 0, 285),
            new THREE.Vector3(180, 0, 333),
            new THREE.Vector3(250, 0, 333),
            new THREE.Vector3(270, 0, 300),
            new THREE.Vector3(276, 0, 252),
            new THREE.Vector3(227, 0, 187),
            new THREE.Vector3(203, 0, 172),
        ];
        SectorGenerator.createForest(ctx, forestPolygon, 8, 'spruce');

        // Forest: Train Yard (north west)
        forestPolygon = [
            new THREE.Vector3(88, 0, 364),
            new THREE.Vector3(88, 0, 392),
            new THREE.Vector3(53, 0, 401),
            new THREE.Vector3(33, 0, 409),
            new THREE.Vector3(31, 0, 375),
        ];
        SectorGenerator.createForest(ctx, forestPolygon, 8, 'spruce');

        // Forest: Train Yard (north east)
        forestPolygon = [
            new THREE.Vector3(212, 0, 359),
            new THREE.Vector3(250, 0, 359),
            new THREE.Vector3(250, 0, 408),
            new THREE.Vector3(212, 0, 403),
        ];
        SectorGenerator.createForest(ctx, forestPolygon, 8, 'spruce');

        // Forest: Train Yard (south of railroad)
        forestPolygon = [
            new THREE.Vector3(88, 0, 403),
            new THREE.Vector3(88, 0, 441),
            new THREE.Vector3(212, 0, 441),
            new THREE.Vector3(212, 0, 412),
            new THREE.Vector3(250, 0, 417),
            new THREE.Vector3(250, 0, 470),
            new THREE.Vector3(50, 0, 470),
            new THREE.Vector3(36, 0, 418),
            new THREE.Vector3(54, 0, 409),
        ];
        SectorGenerator.createForest(ctx, forestPolygon, 8, 'spruce');

        // --- FENCES ---
        const ty2 = LOCATIONS.POIS.TRAIN_YARD;
        SectorGenerator.createFence(ctx, [new THREE.Vector3(ty2.x - 60, 0, ty2.z - 40), new THREE.Vector3(ty2.x + 60, 0, ty2.z - 40)], 'mesh', 4, true);

        // Dead Bodies & Extra Chests
        SectorGenerator.spawnDeadBody(ctx, 37, 44, 'WALKER', 0, true);
        SectorGenerator.spawnChest(ctx, 45, 45, 'standard');
        SectorGenerator.spawnChest(ctx, 110, 80, 'standard');
        SectorGenerator.spawnChest(ctx, LOCATIONS.POIS.CAFE.x, LOCATIONS.POIS.CAFE.z + 5, 'standard');
    },

    setupContent: (ctx: SectorContext) => {
        const { triggers } = ctx;
        // --- TRIGGERS ---
        triggers.push(
            // Clues (Action: 50 XP Reward)
            { id: 's1_start_tracks', position: LOCATIONS.TRIGGERS.START_TRACKS, radius: 10, type: 'THOUGHTS', content: "clues.s1_start_tracks", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 50 } }] },
            { id: 's1_blood_stains', position: LOCATIONS.TRIGGERS.BLOOD_STAINS, radius: 10, type: 'THOUGHTS', content: "clues.s1_blood_stains", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 50 } }] },
            { id: 's1_they_must_be_scared', position: LOCATIONS.TRIGGERS.CHAOS_HERE, radius: 8, type: 'THOUGHTS', content: "clues.s1_they_must_be_scared", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 50 } }] },
            { id: 's1_still_tracking', position: LOCATIONS.TRIGGERS.STILL_TRACKING, radius: 15, type: 'THOUGHTS', content: "clues.s1_still_tracking", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 50 } }] },
            { id: 's1_town_center', position: LOCATIONS.TRIGGERS.TOWN_CENTER, radius: 80, type: 'THOUGHTS', content: "clues.s1_town_center", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 50 } }] },

            // POIs (Action: 250 XP Reward)
            { id: 's1_poi_building_on_fire', position: LOCATIONS.POIS.SMU, size: { width: 60, depth: 60 }, type: 'POI', content: "clues.s1_poi_building_on_fire", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 500 } }] },
            { id: 's1_poi_church', position: LOCATIONS.POIS.CHURCH, size: { width: 30, depth: 30 }, type: 'POI', content: "clues.s1_poi_church", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 500 } }] },
            { id: 's1_poi_cafe', position: LOCATIONS.POIS.CAFE, size: { width: 25, depth: 25 }, type: 'POI', content: "clues.s1_poi_cafe", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 500 } }] },
            { id: 's1_poi_pizzeria', position: LOCATIONS.POIS.PIZZERIA, size: { width: 25, depth: 25 }, type: 'POI', content: "clues.s1_poi_pizzeria", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 500 } }] },
            { id: 's1_poi_grocery', position: LOCATIONS.POIS.GROCERY, size: { width: 25, depth: 40 }, type: 'POI', content: "clues.s1_poi_grocery", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 500 } }] },
            { id: 's1_poi_gym', position: LOCATIONS.POIS.GYM, size: { width: 45, depth: 25 }, type: 'POI', content: "clues.s1_poi_gym", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 500 } }] },
            { id: 's1_poi_train_yard', position: LOCATIONS.POIS.TRAIN_YARD, size: { width: 130, depth: 90 }, type: 'POI', content: "clues.s1_poi_train_yard", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 500 } }] },

            // --- THE BUS EVENT ---
            // --- THE BUS EVENT (Handled via Interaction now) ---
            /*
            {
                id: 's1_bus_event',
                position: LOCATIONS.TRIGGERS.BUS,
                radius: 8,
                type: 'EVENT',
                content: null,
                triggered: false,
                actions: [ ...moved to onInteract/onUpdate... ]
            },
            */

            // --- FIND LOKE EVENT ---
            {
                id: 'found_loke',
                position: LOCATIONS.SPAWN.FAMILY,
                radius: 5,
                type: 'EVENT',
                content: '',
                triggered: false,
                actions: [{ type: 'START_CINEMATIC' }, { type: 'TRIGGER_FAMILY_FOLLOW', delay: 2000 }]
            }
        );

        // ===== ENVIRONMENTAL FEATURES =====

        // Flower garden near home
        const homeFlowers = [
            new THREE.Vector3(8, 0, -8),
            new THREE.Vector3(12, 0, -8),
            new THREE.Vector3(12, 0, -2),
            new THREE.Vector3(8, 0, -2)
        ];
        EnvironmentGenerator.fillAreaWithFlowers(ctx, homeFlowers, 1.0);

        // Wildflowers near church area
        const churchFlowers = [
            new THREE.Vector3(160, 0, 235),
            new THREE.Vector3(170, 0, 235),
            new THREE.Vector3(170, 0, 245),
            new THREE.Vector3(160, 0, 245)
        ];
        EnvironmentGenerator.fillAreaWithFlowers(ctx, churchFlowers, 0.7);
    },

    onInteract: (id: string, object: THREE.Object3D, state: any, events: any) => {
        if (id === 'tunnel_bus') {
            object.userData.isInteractable = false;
            state.sectorState.busSequence = { startTime: state.time || Date.now(), step: 0 };

            // Immediate feedback
            events.setNotification({ text: events.t('clues.s1_event_tunnel_blocked'), duration: 1500 });
        }
    },

    onUpdate: (dt, now, playerPos, gameState, sectorState, events) => {
        const state = gameState;
        if (!sectorState.spawns) sectorState.spawns = {};

        // --- BUS SEQUENCE ---
        if (sectorState.busSequence) {
            const seq = sectorState.busSequence;
            const elapsed = now - seq.startTime;

            if (seq.step === 0 && elapsed > 1500) {
                events.playSound('explosion');
                events.cameraShake(5.0);
                // Pan Camera manually or via event? generic setCameraOverride is robust
                events.setCameraOverride({
                    active: true,
                    targetPos: new THREE.Vector3(150, 0, 400), // Train Yard
                    lookAtPos: new THREE.Vector3(150, 2, 400),
                    endTime: now + 4000
                });
                seq.step++;
            }
            if (seq.step === 1 && elapsed > 2500) {
                events.playSound('explosion');
                events.cameraShake(5.0);
                seq.step++;
            }
            if (seq.step === 2 && elapsed > 3500) {
                events.setNotification({ text: events.t('clues.s1_event_tunnel_whats_happening'), duration: 3000 });
                seq.step++;
            }
            if (seq.step === 3 && elapsed > 6500) {
                // START WAVE
                // events.spawnHorde(30); // Not directly available in events interface?
                // events was: spawnZombie, spawnHorde... Yes!
                events.spawnHorde(30, 'WALKER', new THREE.Vector3(150, 0, 400)); // Train yard focus

                // Specific spawns
                const LOCS = {
                    CHURCH: new THREE.Vector3(165, 0, 240),
                    CAFE: new THREE.Vector3(110, 0, 250),
                    PIZZERIA: new THREE.Vector3(200, 0, 250),
                    GYM: new THREE.Vector3(105, 0, 295),
                    GROCERY: new THREE.Vector3(170, 0, 300)
                };

                for (let i = 0; i < 6; i++) events.spawnZombie('RUNNER', LOCS.CHURCH);
                for (let i = 0; i < 6; i++) events.spawnZombie('WALKER', LOCS.CAFE);
                for (let i = 0; i < 6; i++) events.spawnZombie('WALKER', LOCS.PIZZERIA);
                for (let i = 0; i < 6; i++) events.spawnZombie('WALKER', LOCS.GYM);
                for (let i = 0; i < 6; i++) events.spawnZombie('WALKER', LOCS.GROCERY);

                seq.step++;
                sectorState.busSequence = null; // Done
            }
        }

        // 1. Initial Group (3 walkers, 1.5s after start)
        if (!sectorState.spawns.initial && now - state.startTime > 0) {
            sectorState.spawns.initial = true;
            for (let i = 0; i < 3; i++) {
                events.spawnZombie('WALKER', new THREE.Vector3(14, 0, 1));
            }
        }

        // 2. Forest (Home -> SMU) - Varied zombies
        const forestHomeSMU = new THREE.Vector3(70, 0, 50);
        if (playerPos.distanceTo(forestHomeSMU) < 40 && !sectorState.spawns.forest_home_smu) {
            sectorState.spawns.forest_home_smu = true;
            for (let i = 0; i < 6; i++) {
                const type = Math.random() > 0.7 ? 'RUNNER' : 'WALKER';
                const offX = (Math.random() - 0.5) * 30;
                const offZ = (Math.random() - 0.5) * 30;
                events.spawnZombie(type, new THREE.Vector3(forestHomeSMU.x + offX, 0, forestHomeSMU.z + offZ));
            }
        }

        // 3. Buildings - Zombies around key locations
        const buildingPOIs = [
            { name: 'church', pos: LOCATIONS.POIS.CHURCH, count: 6, type: 'MIXED' },
            { name: 'cafe', pos: LOCATIONS.POIS.CAFE, count: 4, type: 'WALKER' },
            { name: 'grocery', pos: LOCATIONS.POIS.GROCERY, count: 5, type: 'RUNNER' },
            { name: 'gym', pos: LOCATIONS.POIS.GYM, count: 3, type: 'MIXED' },
            { name: 'pizzeria', pos: LOCATIONS.POIS.PIZZERIA, count: 4, type: 'WALKER' },
        ];

        buildingPOIs.forEach(poi => {
            const dist = playerPos.distanceTo(new THREE.Vector3(poi.pos.x, 0, poi.pos.z));
            if (dist < 45 && !sectorState.spawns[poi.name]) {
                sectorState.spawns[poi.name] = true;
                for (let i = 0; i < poi.count; i++) {
                    let type = 'WALKER';
                    if (poi.type === 'MIXED') type = Math.random() > 0.8 ? 'RUNNER' : 'WALKER';
                    else if (poi.type === 'RUNNER') type = Math.random() > 0.3 ? 'RUNNER' : 'WALKER';
                    else if (poi.type === 'WALKER') type = 'WALKER';

                    const offX = (Math.random() - 0.5) * 20;
                    const offZ = (Math.random() - 0.5) * 20;
                    events.spawnZombie(type, new THREE.Vector3(poi.pos.x + offX, 0, poi.pos.z + offZ));
                }
            }
        });

        // 4. Town Center Forest - Harder group
        const townCenterWoods = new THREE.Vector3(145, 0, 240);
        if (playerPos.distanceTo(townCenterWoods) < 50 && !sectorState.spawns.town_forest) {
            sectorState.spawns.town_forest = true;
            for (let i = 0; i < 8; i++) {
                let type = 'WALKER';
                const roll = Math.random();
                if (roll > 0.8) type = 'TANK';
                if (roll > 0.9) type = 'BOMBER';
                else if (roll > 0.7) type = 'RUNNER';

                const offX = (Math.random() - 0.5) * 40;
                const offZ = (Math.random() - 0.5) * 40;
                events.spawnZombie(type, new THREE.Vector3(townCenterWoods.x + offX, 0, townCenterWoods.z + offZ));
            }
        }

        // Train Smoke
        if (events.spawnPart) {
            const interval = 80; // Smoke rate
            if (now - (sectorState.lastSmokeTime || 0) > interval) {
                (sectorState as any).lastSmokeTime = now;
                const tPos = LOCATIONS.POIS.TRAIN_YARD;
                const yRot = -0.05;
                const localX = 6, localY = 7.0, localZ = 0;
                const wx = tPos.x + (localX * Math.cos(yRot) - localZ * Math.sin(yRot));
                const wz = tPos.z + (localX * Math.sin(yRot) + localZ * Math.cos(yRot));

                events.spawnPart(wx, localY, wz, 'black_smoke', 1);
            }
        }

        // --- WAVE LOGIC ---
        if (sectorState.hordeKilled === undefined) sectorState.hordeKilled = 0;
        if (sectorState.busCanBeInteractedWith === undefined) sectorState.busCanBeInteractedWith = false;

        // Explode Bus interaction criteria
        if (sectorState.hordeTarget !== undefined && sectorState.hordeKilled >= sectorState.hordeTarget
            && !sectorState.busCanBeInteractedWith
            && playerPos.distanceTo(new THREE.Vector3(LOCATIONS.TRIGGERS.BUS.x, 0, LOCATIONS.TRIGGERS.BUS.z)) < 25) {
            sectorState.busCanBeInteractedWith = true;
            sectorState.waveActive = false; // Progress bar finished
            events.setNotification({ visible: true, text: events.t('clues.s1_event_tunnel_plant_explosives'), timestamp: now });
        }

        // Handle Bus Gate & Interaction
        if (sectorState.busCanBeInteractedWith && !sectorState.busExploded) {
            const busObj = (sectorState.ctx as any).busObject;
            const dist = playerPos.distanceTo(busObj.position);
            const proximity = 8;
            const nowTime = now;

            // EXECUTING EXPLOSION
            if ((sectorState as any).busExplosionStartTime) {
                const elapsed = nowTime - (sectorState as any).busExplosionStartTime;
                const ring = (sectorState as any).busRing;

                // 2s delay before explosion
                if (elapsed < 3000) {
                    // Pulsing Ring Effect
                    if (ring) {
                        const pulse = (Math.sin(elapsed * 0.01) + 1) * 0.5; // 0..1
                        ring.material.opacity = 0.3 + (pulse * 0.5);
                        ring.scale.setScalar(1.0 + (pulse * 0.2));
                        const red = new THREE.Color(0xff0000);
                        const yellow = new THREE.Color(0xffff00);
                        ring.material.color.copy(red).lerp(yellow, pulse);
                    }

                    // BEEP BEEP (Every 500ms, then 250ms)
                    const beepInterval = elapsed > 2000 ? 250 : 500;
                    const lastBeep = (sectorState as any).lastBeepTime || 0;
                    if (nowTime - lastBeep > beepInterval) {
                        (sectorState as any).lastBeepTime = nowTime;
                        events.playTone(880, 'sine', 0.1, 0.15);
                    }

                    // SHAKE BUS
                    if (busObj) {
                        const shakeAmount = 0.05 + (elapsed / 3000) * 0.15;
                        busObj.position.x = (sectorState as any).originalBusPos.x + (Math.random() - 0.5) * shakeAmount;
                        busObj.position.z = (sectorState as any).originalBusPos.z + (Math.random() - 0.5) * shakeAmount;
                        events.cameraShake(0.5);
                    }
                } else {
                    // BOOM TIME (3s elapsed)
                    (sectorState as any).busExplosionStartTime = null;
                    if (ring) {
                        events.scene.remove(ring);
                        (sectorState as any).busRing = null;

                        // Clear Camera Override
                        if (events.setCameraOverride) {
                            events.setCameraOverride(null);
                        }
                    }

                    sectorState.busExploded = true;
                    (sectorState as any).busInteractionActive = false;
                    events.setNotification({
                        visible: true,
                        text: events.t('clues.s1_event_tunnel_cleared'),
                        timestamp: now
                    });

                    // Explosion FX
                    events.playSound('explosion');
                    events.cameraShake(5);

                    // ATTRACT ZOMBIES ON EXPLOSION
                    const attrackAreaRadius = 100;
                    if (events.emitNoise) {
                        events.emitNoise(busObj.position, attrackAreaRadius, 'loud_explosion');
                    }

                    // Chain notifications: Wait for "Tunnel Cleared" to fade before showing "Zombies Attracted"
                    setTimeout(() => {
                        events.setNotification({
                            visible: true,
                            text: events.t('clues.s1_event_tunnel_explosion_attracted_zombies'),
                            timestamp: Date.now()
                        });
                    }, 3500);

                    // Remove/Hide Bus
                    if (busObj) {
                        busObj.visible = false;
                        events.scene.remove(busObj);
                    }

                    // Disable Collider
                    const obstacles = (sectorState.ctx as any).obstacles;
                    const busColliderIdx = (sectorState.ctx as any).busObjectIdx;
                    if (busColliderIdx !== undefined && obstacles && obstacles[busColliderIdx]) {
                        obstacles[busColliderIdx].collider.size.set(0, 0, 0);
                    }

                    // Spawn Rubble (5 pieces)
                    const rubbleGeo = new THREE.BoxGeometry(2, 2, 4);
                    const rubbleMat = MATERIALS.concrete.clone();
                    rubbleMat.color.setHex(0x009ddb);
                    for (let i = 0; i < 5; i++) {
                        const r = new THREE.Mesh(rubbleGeo, rubbleMat);
                        // Random scatter/rotation
                        r.position.copy(busObj.position);
                        r.position.x += (Math.random() - 0.5) * 8;
                        r.position.z += (Math.random() - 0.5) * 8;
                        r.position.y = 1;
                        r.rotation.set(Math.random(), Math.random(), Math.random());
                        r.castShadow = true;
                        events.scene.add(r);
                    }
                }
                // Processing explosion -> Skip interaction check
                return;
            }

            // INTERACTION TRIGGERED BY PLAYER INTERACTION SYSTEM
            if ((sectorState as any).busInteractionTriggered && !(sectorState as any).busExplosionStartTime) {
                // Start Countdown Sequence
                (sectorState as any).busExplosionStartTime = nowTime;
                (sectorState as any).originalBusPos = busObj.position.clone();
                (sectorState as any).lastBeepTime = nowTime;
                events.playTone(880, 'sine', 0.1, 0.2);

                // Spawn Red Ring
                const ringGeo = new THREE.RingGeometry(6, 7, 32);
                const ringMat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
                const ring = new THREE.Mesh(ringGeo, ringMat);
                ring.rotation.x = -Math.PI / 2;
                ring.position.copy(busObj.position);
                ring.position.y = 1.0;
                events.scene.add(ring);
                (sectorState as any).busRing = ring;

                // Clear the prompt if it was lingering (controlled by InteractionSystem, but good safety)
                events.setInteraction(null);

                // Zoom Camera to Bus Front ("159" sign)
                if (events.setCameraOverride) {
                    const busPos = busObj.position.clone();
                    // Bus is lying on side (X-rotation), Front is +X.
                    // "159" sign is at local x + something.
                    // Let's look exactly at the front sign position.
                    // Sign pos was: s.c[0] / 2 + 0.05, s.c[1] - 0.2, 0  (Local to bus)

                    // World Position of Front:
                    // Bus Rotation is (PI/2, 0, 0).
                    // Front is +X. Top is -Z (in world)? No. 
                    // Let's just look at the Bus Center + Offset

                    const camTarget = busPos.clone().add(new THREE.Vector3(-6, 4, 3)); // Closer and adjusted angle
                    const lookAt = busPos.clone().add(new THREE.Vector3(6.5, 0.5, 0)); // Look specifically at the destination sign area

                    events.setCameraOverride({
                        active: true,
                        targetPos: camTarget,
                        lookAtPos: lookAt,
                        endTime: nowTime + 4000 // Slightly longer than explosion to hold frame
                    });
                }
            }
        }
    },
};


// Legacy spawn function removed - logic moved to controlled onUpdate triggers
/*
function spawnSectorHordes(ctx: SectorContext) {
    if (!ctx.spawnHorde) return;

    // Defined Horde Locations
    const hordeSpots = [
        new THREE.Vector3(20, 0, 20),   // Near Start
        new THREE.Vector3(45, 0, -30),  // Woods
        new THREE.Vector3(-10, 0, 50),  // Road
        new THREE.Vector3(60, 0, 60),   // Town Center
        new THREE.Vector3(-40, 0, -20)  // Embankment
    ];

    hordeSpots.forEach((pos, i) => {
        // Randomize count 5-8
        // Don't spawn too many or perf will die
        const count = 5 + Math.floor(ctx.rng() * 4);
        ctx.spawnHorde(count, undefined, pos);
    });
}
*/