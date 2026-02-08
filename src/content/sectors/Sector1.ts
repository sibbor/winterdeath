import * as THREE from 'three';
import { SectorDef, SectorContext } from '../../types/sectors';
import { MATERIALS, GEOMETRY, createTextSprite, ModelFactory } from '../../utils/assets';
import { SectorBuilder } from '../../core/world/SectorGenerator';
import { PathGenerator } from '../../core/world/PathGenerator';
import { ObjectGenerator } from '../../core/world/ObjectGenerator';
import { t } from '../../utils/i18n';
import { CAMERA_HEIGHT } from '../constants';


const LOCATIONS = {
    SPAWN: {
        PLAYER: { x: -6, z: 35, rot: Math.PI / 1.25 },
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
    name: "maps.village_name",
    environment: {
        bgColor: 0x020208,
        fogDensity: 0.02,
        ambientIntensity: 0.2, // Lowered from 0.6 to make shadows pop
        groundColor: 0xddddff,
        fov: 50,
        moon: { visible: true, color: 0x6688ff, intensity: 0.8, position: { x: 50, y: 35, z: 50 } }, // Lower moon for bump visibility
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

    generate: async (ctx: SectorContext) => {
        const { scene, obstacles, flickeringLights, burningObjects, triggers } = ctx;
        (ctx as any).sectorState.ctx = ctx;

        // Road: Vargstigen -> Drive Way
        PathGenerator.createRoad(ctx, [
            new THREE.Vector3(-10, 0, 2),
            new THREE.Vector3(-42, 0, 2),
        ], 10);

        if (ctx.yield) await ctx.yield();

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

        if (ctx.yield) await ctx.yield();

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

        // Path: Home -> Forest Path (Footprints)
        PathGenerator.createDecalPath(ctx, [
            new THREE.Vector3(3, 0, 26),
            new THREE.Vector3(9, 0, 29),
            new THREE.Vector3(21, 0, 29),
            new THREE.Vector3(26, 0, 31)
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
        SectorBuilder.spawnBuilding(ctx, LOCATIONS.BUILDINGS.HOME.x - 2, LOCATIONS.BUILDINGS.HOME.z + 10, 20, 7, 25, 0, 0xffffff);
        // Home: Police car and family's car
        SectorBuilder.spawnVehicle(ctx, LOCATIONS.VEHICLES.POLICE_CAR.x, LOCATIONS.VEHICLES.POLICE_CAR.z, LOCATIONS.VEHICLES.POLICE_CAR.rotation, 'police');
        const familyCar = SectorBuilder.spawnVehicle(ctx, LOCATIONS.VEHICLES.FAMILY_CAR.x, LOCATIONS.VEHICLES.FAMILY_CAR.z, 0.3, 'station wagon', 0x333333, false);
        SectorBuilder.setOnFire(ctx, familyCar, { smoke: true, intensity: 100, distance: 20, onRoof: true });

        // Home: Hedges
        SectorBuilder.createHedge(ctx, [new THREE.Vector3(-19, 0, 8), new THREE.Vector3(-29, 0, 8), new THREE.Vector3(-29, 0, 32), new THREE.Vector3(-17, 0, 40), new THREE.Vector3(11, 0, 40), new THREE.Vector3(23, 0, 33)]);
        SectorBuilder.createHedge(ctx, [new THREE.Vector3(-6, 0, 0), new THREE.Vector3(31, 0, 0), new THREE.Vector3(31, 0, 31)]);

        if (ctx.yield) await ctx.yield();

        // Kindergarten
        const kindergarten = new THREE.Mesh(new THREE.BoxGeometry(60, 10, 50), MATERIALS.building);
        kindergarten.position.set(LOCATIONS.BUILDINGS.KINDGARTEN.x, 0, LOCATIONS.BUILDINGS.KINDGARTEN.z);
        kindergarten.castShadow = true;
        scene.add(kindergarten);
        obstacles.push({ mesh: kindergarten, collider: { type: 'box', size: new THREE.Vector3(50, 20, 50) } });

        // Fence between SMU/Kindergarten
        SectorBuilder.createFence(ctx, [
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
            SectorBuilder.spawnBuilding(ctx, b.x, b.z, b.s[0], b.s[1], b.s[2], b.rotation, b.color);
        });

        if (ctx.yield) await ctx.yield();

        // SMU: stone wall
        SectorBuilder.createStoneWall(ctx, [
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
        obstacles.push({ mesh: smu, collider: { type: 'box', size: new THREE.Vector3(50, 20, 50) } });
        SectorBuilder.setOnFire(ctx, smu, { smoke: true, intensity: 25, distance: 50, onRoof: true });
        // 2 blue colored containers behind (west of) the building
        SectorBuilder.spawnContainer(ctx, LOCATIONS.POIS.SMU.x - 35, LOCATIONS.POIS.SMU.z - 5, 0, 0x0044cc);
        SectorBuilder.spawnContainer(ctx, LOCATIONS.POIS.SMU.x - 35, LOCATIONS.POIS.SMU.z + 5, 0, 0x0044cc);

        // Burning Cars
        const carColors = [0x3355ff, 0xcccccc, 0xcc2222]; // Blue, Silver, Red
        const carType = ['suv', 'station wagon', 'sedan'] as const;
        for (let i = 0; i < 3; i++) {
            const carPos = { x: LOCATIONS.POIS.SMU.x + 35, z: LOCATIONS.POIS.SMU.z + (i * 12) - 10 };
            const car = SectorBuilder.spawnVehicle(ctx, carPos.x, carPos.z, 0.3, carType[i], carColors[i]);
            SectorBuilder.setOnFire(ctx, car, { smoke: true, intensity: 25, distance: 50, onRoof: true });
        }

        // Hedges:
        SectorBuilder.createHedge(ctx, [new THREE.Vector3(141, 0, 190), new THREE.Vector3(146, 0, 230)]);
        SectorBuilder.createHedge(ctx, [new THREE.Vector3(130, 0, 193), new THREE.Vector3(136, 0, 231)]);

        // POI: Church 
        const churchGroup = new THREE.Group();
        churchGroup.position.set(LOCATIONS.POIS.CHURCH.x, 0, LOCATIONS.POIS.CHURCH.z);
        const churchBody = new THREE.Mesh(new THREE.BoxGeometry(15, 12, 15), MATERIALS.brownBrick);
        churchBody.position.y = 6;
        churchGroup.add(churchBody);
        const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4, 0.2), MATERIALS.crossEmissive);
        const crossH = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.5, 0.2), MATERIALS.crossEmissive);
        crossV.position.set(0, 8, 7.6);
        crossH.position.set(0, 8.5, 7.6);
        churchGroup.add(crossV);
        churchGroup.add(crossH);
        const tower = new THREE.Mesh(new THREE.BoxGeometry(4, 12, 4), MATERIALS.blackMetal);
        const towerTop = new THREE.Mesh(new THREE.ConeGeometry(6, 2, 6), MATERIALS.blackMetal);
        tower.position.set(-10, 8, -15);
        towerTop.position.y = 12;
        tower.add(towerTop);
        churchGroup.add(tower);
        scene.add(churchGroup);
        obstacles.push({ mesh: churchGroup, collider: { type: 'box', size: new THREE.Vector3(15, 20, 15) } });
        // Church burning on roof
        SectorBuilder.setOnFire(ctx, churchGroup, { smoke: true, intensity: 25, distance: 50, onRoof: true });

        // Café 
        const cafeGroup = new THREE.Group();
        cafeGroup.position.set(LOCATIONS.POIS.CAFE.x, 6, LOCATIONS.POIS.CAFE.z);

        const cafeBodyLeft = new THREE.Mesh(new THREE.BoxGeometry(5, 12, 12), MATERIALS.yellowBrick);
        cafeBodyLeft.position.x = -6;
        const cafeBodyRight = new THREE.Mesh(new THREE.BoxGeometry(5, 12, 12), MATERIALS.yellowBrick);
        cafeBodyRight.position.x = 6;
        const cafeBodyCenter = new THREE.Mesh(new THREE.BoxGeometry(12, 12, 5), MATERIALS.yellowBrick);
        cafeBodyCenter.position.z = -3;
        cafeGroup.castShadow = true;
        cafeGroup.add(cafeBodyLeft);
        cafeGroup.add(cafeBodyRight);
        cafeGroup.add(cafeBodyCenter);

        obstacles.push({ mesh: cafeGroup, collider: { type: 'box', size: new THREE.Vector3(15, 20, 12) } });

        const cafeSign = createTextSprite(t('clues.s1_poi_cafe'));
        cafeSign.position.set(0, 3, 6.5);
        cafeGroup.add(cafeSign);

        scene.add(cafeGroup);

        // Grocery Store
        //SectorBuilder.spawnDebugMarker(ctx, LOCATIONS.POIS.GROCERY.x, LOCATIONS.POIS.GROCERY.z, 8, t('clues.s1_poi_grocery'));
        const grocery = new THREE.Mesh(new THREE.BoxGeometry(15, 6, 30), MATERIALS.concrete);
        grocery.position.set(LOCATIONS.POIS.GROCERY.x, 3, LOCATIONS.POIS.GROCERY.z);
        grocery.castShadow = true;
        scene.add(grocery);
        obstacles.push({ mesh: grocery, collider: { type: 'box', size: new THREE.Vector3(15, 20, 30) } });
        const grocSign = createTextSprite(t('clues.s1_poi_grocery'));
        grocSign.scale.set(8, 2, 1); grocSign.position.set(-8, 2, 0);
        grocSign.rotation.y = -Math.PI / 2;
        grocery.add(grocSign);
        // 2 black colored containers behind the building
        SectorBuilder.spawnContainer(ctx, LOCATIONS.POIS.GROCERY.x - 5, LOCATIONS.POIS.GROCERY.z + 20, Math.PI / 2.5, 0x111111);
        SectorBuilder.spawnContainer(ctx, LOCATIONS.POIS.GROCERY.x + 5, LOCATIONS.POIS.GROCERY.z + 20, Math.PI / 2.5, 0x111111);

        // Gym 
        //SectorBuilder.spawnDebugMarker(ctx, LOCATIONS.POIS.GYM.x, LOCATIONS.POIS.GYM.z, 10, t('clues.s1_poi_gym'));
        const gym = new THREE.Mesh(new THREE.BoxGeometry(40, 12, 20), MATERIALS.concrete);
        gym.position.set(LOCATIONS.POIS.GYM.x, 4, LOCATIONS.POIS.GYM.z);
        gym.castShadow = true;
        scene.add(gym);
        obstacles.push({ mesh: gym, collider: { type: 'box', size: new THREE.Vector3(40, 20, 20) } });
        const gymSign = createTextSprite(t('clues.s1_poi_gym'));
        gymSign.position.set(0, 3, 10.1);
        gym.add(gymSign);

        // Pizzeria
        //SectorBuilder.spawnDebugMarker(ctx, LOCATIONS.POIS.PIZZERIA.x, LOCATIONS.POIS.PIZZERIA.z, 6, t('clues.s1_poi_pizzeria'));
        const pizza = new THREE.Mesh(new THREE.BoxGeometry(12, 5, 12), MATERIALS.brownBrick);
        pizza.position.set(LOCATIONS.POIS.PIZZERIA.x, 2.5, LOCATIONS.POIS.PIZZERIA.z);
        scene.add(pizza);
        obstacles.push({ mesh: pizza, collider: { type: 'box', size: new THREE.Vector3(12, 10, 12) } });

        // --- OVERPASS & TUNNEL ---
        // 1. Earth Mound (Embankment) - Split into two parts to leave gap for tunnel
        // West Segment (Left of Tunnel) - X=20 to ~114
        const embankmentWest = [
            new THREE.Vector3(20, 5, 364),
            new THREE.Vector3(84, 5, 350),
            new THREE.Vector3(133, 5, 345)
        ];
        SectorBuilder.createEmbankment(ctx, embankmentWest, 18, 5, MATERIALS.dirt);

        // East Segment (Right of Tunnel) - X=145 to 264
        const embankmentEast = [
            new THREE.Vector3(145, 5, 345),
            new THREE.Vector3(264, 5, 345)
        ];
        SectorBuilder.createEmbankment(ctx, embankmentEast, 18, 5, MATERIALS.dirt);

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
        SectorBuilder.createGuardrail(ctx, railSouth, true);

        // North Guardrail (Broken - Right side facing West)
        // Segment 1: West of crash
        const railNorthWest = [
            new THREE.Vector3(130, 5, 339),
            new THREE.Vector3(84, 5, 344),
            new THREE.Vector3(20, 5, 358)
        ];
        SectorBuilder.createGuardrail(ctx, railNorthWest, true);

        // Segment 2: East of crash
        const railNorthEast = [
            new THREE.Vector3(264, 5, 339),
            new THREE.Vector3(145, 5, 339)
        ];
        SectorBuilder.createGuardrail(ctx, railNorthEast, true);

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
        obstacles.push({ mesh: colMesh, collider: { type: 'box', size: busSize } });

        // Bus - Burn effect (Relative to center of top face)
        SectorBuilder.setOnFire(ctx, bus, { smoke: true, intensity: 25, distance: 50, onRoof: true });
        scene.add(bus);

        // Store references in sectorState for interactive explosion
        (ctx as any).busObject = bus;
        (ctx as any).busObjectIdx = busIdx;


        // Ground: Asphalt (Station Floor)
        const stationGround = new THREE.Mesh(new THREE.PlaneGeometry(120, 80), MATERIALS.asphalt);
        stationGround.rotation.x = -Math.PI / 2;
        stationGround.position.set(LOCATIONS.POIS.TRAIN_YARD.x, 0.025, LOCATIONS.POIS.TRAIN_YARD.z);
        stationGround.receiveShadow = true;
        scene.add(stationGround);

        // Rail Track:
        const railTrack = PathGenerator.createRailTrack(ctx, [
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

        const matBody = MATERIALS.train; // Standard metal
        const matBlack = MATERIALS.blackMetal;

        // 1. Chassis & Wheels
        const chassis = new THREE.Mesh(new THREE.BoxGeometry(16, 1.5, 4), matBlack);
        chassis.position.y = 1.5;
        train.add(chassis);

        const wheelGeo = new THREE.CylinderGeometry(1.2, 1.2, 0.5, 16);
        wheelGeo.rotateX(Math.PI / 2);
        [-5, -2, 2, 5].forEach(x => {
            const w1 = new THREE.Mesh(wheelGeo, matBlack); w1.position.set(x, 1.2, 2); train.add(w1);
            const w2 = new THREE.Mesh(wheelGeo, matBlack); w2.position.set(x, 1.2, -2); train.add(w2);
        });

        // 2. Boiler (Cylindrical Body)
        const boiler = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 10, 16), matBody);
        boiler.rotation.z = Math.PI / 2;
        boiler.position.set(2, 4.0, 0); // Positioned forward
        train.add(boiler);

        // 3. Detail: Chimney (Smoke Pipe)
        const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 2), matBlack);
        chimney.position.set(6, 5.5, 0); // Near front
        train.add(chimney);

        // 4. Detail: Cowcatcher
        const cowcatcher = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 4), matBlack);
        cowcatcher.position.set(8, 2, 0);
        cowcatcher.rotation.z = -Math.PI / 4; // Sloped
        train.add(cowcatcher);

        // 5. Cabin (Detailed with openings)
        const cabinGroup = new THREE.Group();
        cabinGroup.position.set(-5, 2.3, 0); // Rear position

        // Floor/Base
        const cabBase = new THREE.Mesh(new THREE.BoxGeometry(5, 2, 4.2), matBody);
        cabBase.position.y = 1;
        cabinGroup.add(cabBase);

        // Roof
        const cabRoof = new THREE.Mesh(new THREE.BoxGeometry(6, 0.4, 5), matBlack);
        cabRoof.position.y = 5.2;
        cabinGroup.add(cabRoof);

        // Pillars (Creating Windows)
        const pillarGeo = new THREE.BoxGeometry(0.4, 2.5, 0.4);
        [[-2.3, 1.9], [2.3, 1.9], [-2.3, -1.9], [2.3, -1.9]].forEach(([px, pz]) => {
            const p = new THREE.Mesh(pillarGeo, matBlack);
            p.position.set(px, 3.25, pz);
            cabinGroup.add(p);
        });

        // Front Wall (Below Windshield)
        const frontWall = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3, 4.2), matBody);
        frontWall.position.set(2.3, 1.5, 0);
        cabinGroup.add(frontWall);

        train.add(cabinGroup);
        scene.add(train);

        // Collider
        obstacles.push({ mesh: train, collider: { type: 'box', size: new THREE.Vector3(18, 12, 6) } });

        // Smoke Emitter (coming from the chimney)
        if (ctx.smokeEmitters) {
            // Approx world pos for static train
            const tPos = LOCATIONS.POIS.TRAIN_YARD;
            const yRot = -0.05;
            const localX = 6, localY = 6.8, localZ = 0; // Top of chimney
            const wx = tPos.x + (localX * Math.cos(yRot) - localZ * Math.sin(yRot));
            const wz = tPos.z + (localX * Math.sin(yRot) + localZ * Math.cos(yRot));
            ctx.smokeEmitters.push({
                position: new THREE.Vector3(wx, localY, wz),
                type: 'black_smoke',
                interval: 150
            });
        }

        // FOREST
        // Forst: Home 1
        let forestPolygon = [
            new THREE.Vector3(37, 0, 44),
            new THREE.Vector3(36, 0, 30),
            new THREE.Vector3(103, 0, 30),
            new THREE.Vector3(99, 0, 67),
            new THREE.Vector3(76, 0, 43),
        ];
        await ObjectGenerator.createForest(ctx, forestPolygon, 8, 'spruce');
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
        await ObjectGenerator.createForest(ctx, forestPolygon, 8, 'spruce');
        // Forest: SMU
        forestPolygon = [
            new THREE.Vector3(199, 0, 140),
            new THREE.Vector3(174, 0, 137),
            new THREE.Vector3(129, 0, 163),
            new THREE.Vector3(142, 0, 173),
        ];
        await ObjectGenerator.createForest(ctx, forestPolygon, 12, 'pine');
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
        await ObjectGenerator.createForest(ctx, forestPolygon, 12, 'birch');

        // Forest: Town center (south west)
        forestPolygon = [
            new THREE.Vector3(20, 0, 230),
            new THREE.Vector3(66, 0, 230),
            new THREE.Vector3(66, 0, 285),
            new THREE.Vector3(83, 0, 285),
            new THREE.Vector3(83, 0, 340),
            new THREE.Vector3(28, 0, 350),

        ];
        await ObjectGenerator.createForest(ctx, forestPolygon, 10, 'birch');

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
        await ObjectGenerator.createForest(ctx, forestPolygon, 8, 'spruce');

        // Forest: Train Yard (north west)
        forestPolygon = [
            new THREE.Vector3(88, 0, 364),
            new THREE.Vector3(88, 0, 392),
            new THREE.Vector3(53, 0, 401),
            new THREE.Vector3(33, 0, 409),
            new THREE.Vector3(31, 0, 375),
        ];
        await ObjectGenerator.createForest(ctx, forestPolygon, 8, 'spruce');

        // Forest: Train Yard (north east)
        forestPolygon = [
            new THREE.Vector3(212, 0, 359),
            new THREE.Vector3(250, 0, 359),
            new THREE.Vector3(250, 0, 408),
            new THREE.Vector3(212, 0, 403),
        ];
        await ObjectGenerator.createForest(ctx, forestPolygon, 8, 'spruce');

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
        await ObjectGenerator.createForest(ctx, forestPolygon, 8, 'spruce');

        // --- DECORATION: DEAD ZOMBIES ---
        SectorBuilder.spawnDeadBody(ctx, 37, 44, 'WALKER', Math.random() * Math.PI, true);
        SectorBuilder.spawnDeadBody(ctx, 42, 45, 'RUNNER', Math.random() * Math.PI, true);

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
            {
                id: 's1_bus_event',
                position: LOCATIONS.TRIGGERS.BUS,
                radius: 8,
                type: 'EVENT',
                content: null,
                triggered: false,
                actions: [
                    { type: 'SHOW_TEXT', payload: { text: t('clues.s1_event_tunnel_blocked'), duration: 1500 } },

                    { type: 'PLAY_SOUND', payload: { id: 'explosion' }, delay: 1500 },
                    { type: 'CAMERA_SHAKE', payload: { amount: 5.0 }, delay: 1650 },
                    { type: 'CAMERA_PAN', payload: { target: LOCATIONS.POIS.TRAIN_YARD, duration: 3000 }, delay: 1500 },
                    { type: 'PLAY_SOUND', payload: { id: 'explosion' }, delay: 2500 },
                    { type: 'CAMERA_SHAKE', payload: { amount: 5.0 }, delay: 2650 },
                    { type: 'SHOW_TEXT', payload: { text: t('clues.s1_event_tunnel_whats_happening') }, delay: 3500 },

                    // Start the kill objective
                    { type: 'START_WAVE', payload: { count: 30 }, delay: 6500 },

                    // Spawn Zombies from different directions (Total 30)
                    { type: 'SPAWN_ENEMY', payload: { type: 'RUNNER', count: 6, pos: LOCATIONS.POIS.CHURCH, spread: 20 }, delay: 7000 },
                    { type: 'SPAWN_ENEMY', payload: { type: 'WALKER', count: 6, pos: LOCATIONS.POIS.CAFE, spread: 20 }, delay: 8500 },
                    { type: 'SPAWN_ENEMY', payload: { type: 'WALKER', count: 6, pos: LOCATIONS.POIS.PIZZERIA, spread: 20 }, delay: 10000 },
                    { type: 'SPAWN_ENEMY', payload: { type: 'WALKER', count: 6, pos: LOCATIONS.POIS.GYM, spread: 20 }, delay: 11500 },
                    { type: 'SPAWN_ENEMY', payload: { type: 'WALKER', count: 6, pos: LOCATIONS.POIS.GROCERY, spread: 20 }, delay: 7000 },
                ]
            },

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

        // --- 7. ADDITIONAL CHESTS ---
        SectorBuilder.spawnChest(ctx, 45, 45, 'standard', Math.random() * Math.PI);
        SectorBuilder.spawnChest(ctx, 110, 80, 'standard', Math.random() * Math.PI);
        SectorBuilder.spawnChest(ctx, LOCATIONS.POIS.CAFE.x, LOCATIONS.POIS.CAFE.z + 5, 'standard', Math.PI / 4);
        SectorBuilder.spawnChest(ctx, LOCATIONS.POIS.GROCERY.x, LOCATIONS.POIS.GROCERY.z + 20, 'standard', -Math.PI / 2);
        SectorBuilder.spawnChest(ctx, LOCATIONS.POIS.GYM.x + 10, LOCATIONS.POIS.GYM.z + 15, 'standard', 0);
        SectorBuilder.spawnChest(ctx, LOCATIONS.POIS.PIZZERIA.x + 10, LOCATIONS.POIS.PIZZERIA.z + 5, 'standard', Math.PI);
        SectorBuilder.spawnChest(ctx, LOCATIONS.POIS.CHURCH.x - 10, LOCATIONS.POIS.CHURCH.z + 5, 'standard', Math.PI / 6);
        SectorBuilder.spawnChest(ctx, LOCATIONS.POIS.TRAIN_YARD.x - 10, LOCATIONS.POIS.TRAIN_YARD.z + 15, 'standard', -0.5);

        // --- 8. TRAINYARD ENHANCEMENTS ---
        // Station House
        SectorBuilder.spawnBuilding(ctx, LOCATIONS.POIS.TRAIN_YARD.x + 40, LOCATIONS.POIS.TRAIN_YARD.z - 20, 15, 6, 25, 0, 0xaaaaaa);

        // 20 random colored containers
        const containerColors = [0xcc3333, 0x33cc33, 0x3333cc, 0xcccc33, 0xcc33cc, 0x33cccc, 0x333333, 0x888888];
        // 3 stacks where one container stands on top of another one
        SectorBuilder.spawnContainerStack(ctx, 110, 420, 0.1, 2, containerColors[0]);
        SectorBuilder.spawnContainerStack(ctx, 130, 435, -0.2, 2, containerColors[1]);
        SectorBuilder.spawnContainerStack(ctx, 170, 430, 0.05, 2, containerColors[2]);
        // 14 containers
        for (let i = 0; i < 14; i++) {
            const rx = LOCATIONS.POIS.TRAIN_YARD.x - 50 + Math.random() * 100;
            const rz = LOCATIONS.POIS.TRAIN_YARD.z - 30 + Math.random() * 60;
            // Avoid locomotive area
            if (Math.abs(rx - LOCATIONS.POIS.TRAIN_YARD.x) < 20 && Math.abs(rz - LOCATIONS.POIS.TRAIN_YARD.z) < 10) continue;
            const rot = (Math.random() - 0.5) * 0.5;
            const col = containerColors[Math.floor(Math.random() * containerColors.length)];
            SectorBuilder.spawnContainer(ctx, rx, rz, rot, col);
        }

        // Fence around the trainyard
        const ty = LOCATIONS.POIS.TRAIN_YARD;
        const fenceHeight = 4;

        // South Side (Solid)
        SectorBuilder.createFence(ctx, [
            new THREE.Vector3(ty.x - 60, 0, ty.z + 40),
            new THREE.Vector3(ty.x + 60, 0, ty.z + 40)
        ], 'mesh', fenceHeight, true);

        // North Side (Openings for path/railroad)
        SectorBuilder.createFence(ctx, [
            new THREE.Vector3(ty.x - 60, 0, ty.z - 40),
            new THREE.Vector3(ty.x - 17, 0, ty.z - 40),
            new THREE.Vector3(ty.x - 17, 0, ty.z - 43),
        ], 'mesh', fenceHeight, true);
        SectorBuilder.createFence(ctx, [
            new THREE.Vector3(ty.x - 5, 0, ty.z - 43),
            new THREE.Vector3(ty.x - 5, 0, ty.z - 40),
            new THREE.Vector3(ty.x + 60, 0, ty.z - 40)
        ], 'mesh', fenceHeight, true);

        // West Side (Opening for railroad)
        SectorBuilder.createFence(ctx, [
            new THREE.Vector3(ty.x - 60, 0, ty.z - 40),
            new THREE.Vector3(ty.x - 60, 0, ty.z - 6)
        ], 'mesh', fenceHeight, true);
        SectorBuilder.createFence(ctx, [
            new THREE.Vector3(ty.x - 60, 0, ty.z),
            new THREE.Vector3(ty.x - 60, 0, ty.z + 40)
        ], 'mesh', fenceHeight, true);

        // East Side (Opening for railroad)
        SectorBuilder.createFence(ctx, [
            new THREE.Vector3(ty.x + 60, 0, ty.z - 40),
            new THREE.Vector3(ty.x + 60, 0, ty.z + 5),
        ], 'mesh', fenceHeight, true);
        SectorBuilder.createFence(ctx, [
            new THREE.Vector3(ty.x + 60, 0, ty.z + 11),
            new THREE.Vector3(ty.x + 60, 0, ty.z + 40)
        ], 'mesh', fenceHeight, true);

        // Legacy random hordes removed in favor of controlled spawning in onUpdate
        // spawnSectorHordes(ctx);
    },

    onUpdate: (dt, now, playerPos, gameState, sectorState, events) => {
        const state = gameState;
        if (!sectorState.spawns) sectorState.spawns = {};

        // 1. Initial Group (3 walkers, 1.5s after start)
        if (!sectorState.spawns.initial && now - state.startTime > 1500) {
            sectorState.spawns.initial = true;
            for (let i = 0; i < 3; i++) {
                const offX = (Math.random() - 0.5) * 10;
                const offZ = (Math.random() - 0.5) * 10;
                events.spawnZombie('WALKER', new THREE.Vector3(-20 + offX, 0, 45 + offZ));
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
            console.log("Bus event: zombies killed and player near bus, activating interaction");
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
                    console.log("Bus event: BOOM");
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