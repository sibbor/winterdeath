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
        //DON'T REMOVE:
        //PLAYER: { x: -21, z: 15, rot: Math.PI / 1.25 },
        PLAYER: { x: 138, z: 313, rot: Math.PI / 1.25 },
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
        CHAOS_HERE: { x: 196, z: 160 },
        BLOOD_STAINS: { x: 34, z: 47 },
        STILL_TRACKING: { x: 87, z: 60 },
        TOWN_CENTER: { x: 145, z: 260 },
        BUS: { x: 138, z: 333 },
        TUNNEL: { x: 138, z: 344 }
    },
    OVERPASS: [
        new THREE.Vector3(264, 5, 345),
        new THREE.Vector3(135, 5, 345),
        new THREE.Vector3(84, 5, 350),
        new THREE.Vector3(20, 5, 364)
    ]
} as const;

// Zero-GC Pre-allocated Vectors for the Update Loop
const _busPos = new THREE.Vector3(LOCATIONS.TRIGGERS.BUS.x, 0, LOCATIONS.TRIGGERS.BUS.z);
const _trainYardPos = new THREE.Vector3(LOCATIONS.POIS.TRAIN_YARD.x, 0, LOCATIONS.POIS.TRAIN_YARD.z);
const _viewPos = new THREE.Vector3();
const _camTarget = new THREE.Vector3();
const _lookAt = new THREE.Vector3();
const _camOverrideTarget = new THREE.Vector3();
const _camOverrideLookAt = new THREE.Vector3();

// Zero-GC for the bus event
const _busOriginalPos = new THREE.Vector3();
const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _rotation = new THREE.Euler();
const _quat = new THREE.Quaternion();

// Offsets for Camera Panning Sequences — matched to Camp camera angle (low, close, south-facing)
const _offsetTrainYard = new THREE.Vector3(0, 10, 22);   // Camp: y=10, z=22 from subject
const _zoomOffsetTarget = new THREE.Vector3(22, 10, 0);  // Bus explode: east side, camp elevation — shows "159" sign
const _zoomOffsetLook = new THREE.Vector3(0, 2, 0);      // Camp lookAt: subject center + y2

export const Sector1: SectorDef = {
    id: 0,
    name: "sectors.sector_1_name",
    environment: {
        bgColor: 0x020208,
        fogDensity: 0.02,
        ambientIntensity: 0.4,
        groundColor: 0xddddff,
        fov: 50,
        skyLight: { visible: true, color: 0x6688ff, intensity: 10.0, position: { x: 50, y: 35, z: 50 } },
        cameraOffsetZ: 40,
        cameraHeight: CAMERA_HEIGHT,
        weather: 'snow',
        wind: {
            strengthMin: 0.05,
            strengthMax: 1.0,
            direction: { x: 1, z: 1 },
            angleVariance: Math.PI / 4
        }
    },
    groundType: 'SNOW',
    ambientLoop: 'ambient_wind_loop',

    playerSpawn: LOCATIONS.SPAWN.PLAYER,
    familySpawn: LOCATIONS.SPAWN.FAMILY,
    bossSpawn: LOCATIONS.SPAWN.BOSS,

    collectibles: [
        { id: 's1_collectible_1', x: LOCATIONS.COLLECTIBLES.C1.x, z: LOCATIONS.COLLECTIBLES.C1.z },
        { id: 's1_collectible_2', x: LOCATIONS.COLLECTIBLES.C2.x, z: LOCATIONS.COLLECTIBLES.C2.z }
    ],

    cinematic: {
        offset: LOCATIONS.CINEMATIC.OFFSET,
        lookAtOffset: LOCATIONS.CINEMATIC.LOOK_AT,
    },

    setupProps: (ctx: SectorContext) => {
        const { scene, obstacles } = ctx;
        (ctx as any).sectorState.ctx = ctx;

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

        // Street Lights along Vargstigen
        for (let z = -40; z <= 30; z += 35) {
            SectorGenerator.spawnStreetLight(ctx, -50, z, Math.PI / 2);
        }

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
            SectorGenerator.spawnStreetLight(ctx, x, 280, Math.PI);
        }

        // Path: Home -> Forest Path (Footprints)
        PathGenerator.createDecalPath(ctx, [
            new THREE.Vector3(9, 0, 4),
            new THREE.Vector3(14, 0, 10),
            new THREE.Vector3(22, 0, 26),
            new THREE.Vector3(27, 0, 31)
        ], { spacing: 0.6, size: 0.4, material: MATERIALS.footprintDecal, variance: 0.2 });

        // Path: Home -> Forest Path (Footprints)
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

        // Home - House
        SectorGenerator.spawnBuilding(ctx, LOCATIONS.BUILDINGS.HOME.x - 2, LOCATIONS.BUILDINGS.HOME.z + 10, 20, 7, 25, 0, 0xffffff, true, true, 1.0);

        // Home - Police car and family's car
        SectorGenerator.spawnVehicle(ctx, LOCATIONS.VEHICLES.POLICE_CAR.x, LOCATIONS.VEHICLES.POLICE_CAR.z, LOCATIONS.VEHICLES.POLICE_CAR.rotation, 'police');
        const familyCar = SectorGenerator.spawnVehicle(ctx, LOCATIONS.VEHICLES.FAMILY_CAR.x, LOCATIONS.VEHICLES.FAMILY_CAR.z, 0.3, 'station wagon', 0x333333, false);
        SectorGenerator.setOnFire(ctx, familyCar, { smoke: true, intensity: 100, distance: 30, onRoof: true });

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

        // Fence between kindergarten and SMU
        SectorGenerator.createFence(ctx, [
            new THREE.Vector3(104, 0, 19),
            new THREE.Vector3(104, 0, 67),
            new THREE.Vector3(203, 0, 73)
        ], 'mesh', 1.5, false);

        // Random buildings
        const randomBuildings = [
            { x: 54, z: 15, s: [15, 12, 15], rotation: 0, color: 0x776655 },
            { x: 237, z: 92, s: [18, 15, 20], rotation: 1.55, color: 0x555566 },
            { x: 235, z: 117, s: [12, 10, 12], rotation: 1.5, color: 0x665555 },
            { x: 224, z: 168, s: [20, 8, 20], rotation: Math.PI / 3, color: 0x444444 },
            { x: 117, z: 170, s: [16, 14, 16], rotation: Math.PI / 6, color: 0x777777 }
        ];
        for (let i = 0; i < randomBuildings.length; i++) {
            const b = randomBuildings[i];
            SectorGenerator.spawnBuilding(ctx, b.x, b.z, b.s[0], b.s[1], b.s[2], b.rotation, b.color, true, true);
        }

        // SMU
        const smu = new THREE.Mesh(new THREE.BoxGeometry(50, 10, 50), MATERIALS.brownBrick);
        smu.position.set(LOCATIONS.POIS.SMU.x, 5, LOCATIONS.POIS.SMU.z);
        smu.castShadow = true;
        scene.add(smu);
        SectorGenerator.addObstacle(ctx, {
            mesh: smu,
            collider: { type: 'box', size: new THREE.Vector3(50, 20, 50) }
        });
        SectorGenerator.setOnFire(ctx, smu, { smoke: true, intensity: 120, distance: 35, onRoof: true });

        // SMU - Containers
        SectorGenerator.spawnContainer(ctx, LOCATIONS.POIS.SMU.x - 35, LOCATIONS.POIS.SMU.z - 5, 0, 0x0044cc);
        SectorGenerator.spawnContainer(ctx, LOCATIONS.POIS.SMU.x - 35, LOCATIONS.POIS.SMU.z + 5, 0, 0x0044cc);

        // SMU - Cars
        const carColors = [0x3355ff, 0xcccccc, 0xcc2222];
        const carType = ['suv', 'station wagon', 'sedan'] as const;
        for (let i = 0; i < 3; i++) {
            const rotation = Math.random() * Math.PI;
            const carPos = { x: LOCATIONS.POIS.SMU.x + 35, z: LOCATIONS.POIS.SMU.z + (i * 12) - 10 };
            const car = SectorGenerator.spawnVehicle(ctx, carPos.x, carPos.z, rotation, carType[i], carColors[i]);
            SectorGenerator.setOnFire(ctx, car, { smoke: true, intensity: 80, distance: 25, onRoof: true });
        }

        // SMU - Stone wall
        SectorGenerator.createStoneWall(ctx, [
            new THREE.Vector3(203, 0, 71),
            new THREE.Vector3(206, 0, 112),
            new THREE.Vector3(205, 0, 134),
            new THREE.Vector3(203, 0, 146)
        ], 1.5, 1.5);

        // Town center - hedges
        SectorGenerator.createHedge(ctx, [new THREE.Vector3(141, 0, 188), new THREE.Vector3(146, 0, 230)]);
        SectorGenerator.createHedge(ctx, [new THREE.Vector3(139, 0, 195), new THREE.Vector3(136, 0, 231)]);

        // Church
        const churchGroup = new THREE.Group();
        churchGroup.position.set(LOCATIONS.POIS.CHURCH.x, 0, LOCATIONS.POIS.CHURCH.z);

        const churchBodyGeo = new THREE.BoxGeometry(15, 12, 15);
        churchBodyGeo.translate(0, 6, 0);
        const churchBody = new THREE.Mesh(churchBodyGeo, MATERIALS.brownBrick);
        churchGroup.add(churchBody);

        const crossVGeo = new THREE.BoxGeometry(0.5, 4, 0.2);
        crossVGeo.translate(0, 8, 7.6);
        const crossHGeo = new THREE.BoxGeometry(2.5, 0.5, 0.2);
        crossHGeo.translate(0, 8.5, 7.6);
        const mergedCrossGeo = BufferGeometryUtils.mergeGeometries([crossVGeo, crossHGeo]);
        const cross = new THREE.Mesh(mergedCrossGeo, MATERIALS.crossEmissive);
        churchGroup.add(cross);

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
        SectorGenerator.addObstacle(ctx, {
            position: new THREE.Vector3(LOCATIONS.POIS.CHURCH.x - 10, 0, LOCATIONS.POIS.CHURCH.z - 15),
            collider: { type: 'box', size: new THREE.Vector3(6, 20, 6) }
        });

        // Dark green metal doors
        const doorMat = MATERIALS.blackMetal.clone();
        doorMat.color.setHex(0x004422); // Dark green
        const doorGeo = new THREE.PlaneGeometry(6, 6);
        const doors = new THREE.Mesh(doorGeo, doorMat);
        doors.position.set(0, 3, 7.6);
        churchGroup.add(doors);

        SectorGenerator.setOnFire(ctx, churchGroup, { smoke: true, intensity: 25, distance: 15, onRoof: true });
        SectorGenerator.setOnFire(ctx, tower, { smoke: true, intensity: 60, distance: 25, onRoof: true });

        // Cafe
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

        const obstacle_cafe = { mesh: cafeGroup, collider: { type: 'box' as const, size: new THREE.Vector3(18, 20, 12) } };
        SectorGenerator.addObstacle(ctx, obstacle_cafe);

        scene.add(cafeGroup);

        SectorGenerator.spawnNeonSign(ctx, LOCATIONS.POIS.CAFE.x, LOCATIONS.POIS.CAFE.z - 6, 0, "CAFÉ", 0xffaa00);


        // Grocery store
        const grocery = SectorGenerator.spawnStorefrontBuilding(ctx, LOCATIONS.POIS.GROCERY.x, LOCATIONS.POIS.GROCERY.z, 15, 10, 30, 0, {
            lowerMat: MATERIALS.whiteBrick,
            upperMat: MATERIALS.wooden_fasade,
            shopWindows: false,
            upperWindows: true,
            withRoof: false
        });

        const grocWinMat = MATERIALS.glass;
        const grocWinGeo = new THREE.PlaneGeometry(3.5, 3.5);
        for (let z = -10; z <= 10; z += 5) {
            const win = new THREE.Mesh(grocWinGeo, grocWinMat);
            win.position.set(LOCATIONS.POIS.GROCERY.x - 7.6, 2.5, LOCATIONS.POIS.GROCERY.z + z);
            win.rotation.y = -Math.PI / 2;
            scene.add(win);
        }

        const grocEntrance = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), MATERIALS.glass);
        grocEntrance.position.set(LOCATIONS.POIS.GROCERY.x, 3, LOCATIONS.POIS.GROCERY.z - 15.1);
        scene.add(grocEntrance);

        const heartX = LOCATIONS.POIS.GROCERY.x - 7.7;
        const heartZ = LOCATIONS.POIS.GROCERY.z + 6;
        SectorGenerator.spawnNeonHeart(ctx, heartX, 7.5, heartZ, -Math.PI / 2, 0xff0000, 2.0);
        SectorGenerator.spawnNeonSign(ctx, heartX, LOCATIONS.POIS.GROCERY.z - 2, -Math.PI / 2, "Ica Hjärtat", 0xffffff, true, 1.5);

        SectorGenerator.spawnContainer(ctx, LOCATIONS.POIS.GROCERY.x - 5, LOCATIONS.POIS.GROCERY.z + 20, Math.PI / 2.5, 0x111111);
        SectorGenerator.spawnContainer(ctx, LOCATIONS.POIS.GROCERY.x + 5, LOCATIONS.POIS.GROCERY.z + 20, Math.PI / 2.5, 0x111111);

        // Gym
        const gymMat = MATERIALS.sheet_metal.clone();
        gymMat.color.setHex(0xeae7d6); // Lighter cream/beige tint
        const gym = SectorGenerator.spawnStorefrontBuilding(ctx, LOCATIONS.POIS.GYM.x, LOCATIONS.POIS.GYM.z, 40, 12, 20, 0, {
            lowerMat: gymMat,
            upperMat: gymMat,
            shopWindows: true,
            upperWindows: true,
            withRoof: false,
            mapRepeat: { x: 40, y: 1 }
        });

        SectorGenerator.spawnGlassStaircase(ctx, LOCATIONS.POIS.GYM.x - 23, LOCATIONS.POIS.GYM.z, 6, 12, 8, 0);

        const gymSign = createTextSprite("Gånghester Gym");
        gymSign.position.set(-10, 4.5, 10.1); // Repositioned for visibility
        gym.add(gymSign);

        // Pizzeria
        SectorGenerator.spawnStorefrontBuilding(ctx, LOCATIONS.POIS.PIZZERIA.x, LOCATIONS.POIS.PIZZERIA.z, 20, 8, 15, 0, {
            lowerMat: MATERIALS.plaster,
            upperMat: MATERIALS.plaster,
            shopWindows: true,
            upperWindows: true,
            withRoof: true
        });
        SectorGenerator.spawnNeonSign(ctx, LOCATIONS.POIS.PIZZERIA.x, LOCATIONS.POIS.PIZZERIA.z + 7.6, Math.PI, "Gånghester Pizzera", 0xffffff, true, 1.0, 0x000000);
        // Positioned at y:4.0 (halfway up the 8m building)
        const pizSign = scene.children[scene.children.length - 1];
        pizSign.position.y = 4.0;

        // Embankment
        const embankmentWest = [
            new THREE.Vector3(20, 5, 364),
            new THREE.Vector3(84, 5, 350),
            new THREE.Vector3(133, 5, 345)
        ];
        SectorGenerator.createEmbankment(ctx, embankmentWest, 18, 5, MATERIALS.dirt);

        const embankmentEast = [
            new THREE.Vector3(145, 5, 345),
            new THREE.Vector3(264, 5, 345)
        ];
        SectorGenerator.createEmbankment(ctx, embankmentEast, 18, 5, MATERIALS.dirt);

        // Overpass
        const overpassPoints = LOCATIONS.OVERPASS.map(p => p.clone());
        PathGenerator.createRoad(ctx, overpassPoints, 12);

        const guardRailSouth = [
            new THREE.Vector3(264, 5, 351),
            new THREE.Vector3(135, 5, 351),
            new THREE.Vector3(84, 5, 356),
            new THREE.Vector3(20, 5, 370)
        ];
        SectorGenerator.createGuardrail(ctx, guardRailSouth, true);

        const guardRailNorthWest = [
            new THREE.Vector3(130, 5, 339),
            new THREE.Vector3(84, 5, 344),
            new THREE.Vector3(20, 5, 358)
        ];
        SectorGenerator.createGuardrail(ctx, guardRailNorthWest, true);

        const guardRailNorthEast = [
            new THREE.Vector3(264, 5, 339),
            new THREE.Vector3(145, 5, 339)
        ];
        SectorGenerator.createGuardrail(ctx, guardRailNorthEast, true);

        // TODO: Adjust this:
        // Debris
        const debrisGeo = new THREE.BoxGeometry(0.15, 0.3, 5);
        const debrisPositions = [
            { x: 144, z: 339, ry: 0.2, rz: 0.1 },
            { x: 142, z: 338, ry: 0.5, rz: -0.5 },
            { x: 128, z: 337, ry: 0.8, rz: -0.8 },
            { x: 131, z: 339, ry: -0.2, rz: 0.1 }
        ];
        for (let i = 0; i < debrisPositions.length; i++) {
            const d = debrisPositions[i];
            const mesh = new THREE.Mesh(debrisGeo, MATERIALS.guardrail);
            mesh.position.set(d.x, 5, d.z);
            mesh.rotation.set(0, d.ry, d.rz);
            mesh.castShadow = true;
            ctx.scene.add(mesh);
        }

        // Skid Marks (Sliding from West towards the broken edge)
        // Left Tire
        PathGenerator.createDecalPath(ctx, [
            new THREE.Vector3(100, 6, 344),
            new THREE.Vector3(115, 6, 343),
            new THREE.Vector3(125, 6, 341),
            new THREE.Vector3(130, 6, 339)
        ], { spacing: 0.2, size: 0.5, material: MATERIALS.skidMark, variance: 0.02 });
        // Right tire
        PathGenerator.createDecalPath(ctx, [
            new THREE.Vector3(100, 6, 346.5),
            new THREE.Vector3(115, 6, 345.5),
            new THREE.Vector3(125, 6, 343.5),
            new THREE.Vector3(131, 6, 341.5)
        ], { spacing: 0.2, size: 0.5, material: MATERIALS.skidMark, variance: 0.02 });

        // Tunnel
        const tunnelPos = new THREE.Vector3(LOCATIONS.TRIGGERS.TUNNEL.x, 0, LOCATIONS.TRIGGERS.TUNNEL.z);
        ObjectGenerator.createTunnel(ctx, tunnelPos, 9, 3.5, 21, 0, 2.5, 0.5);

        // Bus (tunnel blocker)
        const bus = ObjectGenerator.createVehicle('bus', 1, 0x009ddb, false);
        bus.position.set(LOCATIONS.TRIGGERS.BUS.x, 1.8, LOCATIONS.TRIGGERS.BUS.z);
        bus.rotation.set(-Math.PI / 2, 0, 0);
        bus.updateMatrixWorld();

        const busBox = new THREE.Box3().setFromObject(bus);
        const busSize = new THREE.Vector3();
        busBox.getSize(busSize);

        const busCenter = new THREE.Vector3();
        busBox.getCenter(busCenter);
        const colMesh = new THREE.Mesh(new THREE.BoxGeometry(busSize.x, busSize.y, busSize.z));
        colMesh.position.copy(busCenter);
        colMesh.visible = false;
        colMesh.updateMatrixWorld();
        scene.add(colMesh);

        const busIdx = obstacles.length;
        const obstacle_bus = { mesh: colMesh, collider: { type: 'box' as const, size: busSize } };

        scene.add(bus);

        SectorGenerator.addObstacle(ctx, obstacle_bus);
        SectorGenerator.setOnFire(ctx, bus, { smoke: true, intensity: 25, distance: 50, onRoof: true });
        SectorGenerator.addInteractable(ctx, bus, {
            id: 'tunnel_bus_explode',
            label: 'ui.interact_blow_up_bus',
            type: 'sector_specific',
            radius: 15.0
        });
        // Non-interactble from start
        bus.userData.isInteractable = false;

        // Store references for the event logic
        (ctx as any).busObject = bus;
        (ctx as any).busColMesh = colMesh; // [VINTERDÖD] Needed for proper scene.remove on explosion
        (ctx as any).busObjectIdx = busIdx;

        // ----------------------------
        // Train yard - Fence
        const ty = LOCATIONS.POIS.TRAIN_YARD;
        const fenceHeight = 3;

        // South Side (Solid)
        SectorGenerator.createFence(ctx, [
            new THREE.Vector3(ty.x - 60, 0, ty.z + 40),
            new THREE.Vector3(ty.x + 60, 0, ty.z + 40)
        ], 'mesh', fenceHeight, true);

        // North Side (Openings for path/railroad)
        SectorGenerator.createFence(ctx, [
            new THREE.Vector3(ty.x - 60, 0, ty.z - 40),
            new THREE.Vector3(ty.x - 17, 0, ty.z - 40),
            new THREE.Vector3(ty.x - 17, 0, ty.z - 43),
        ], 'mesh', fenceHeight, true);
        SectorGenerator.createFence(ctx, [
            new THREE.Vector3(ty.x - 5, 0, ty.z - 43),
            new THREE.Vector3(ty.x - 5, 0, ty.z - 40),
            new THREE.Vector3(ty.x + 60, 0, ty.z - 40)
        ], 'mesh', fenceHeight, true);

        // West Side (Opening for railroad)
        SectorGenerator.createFence(ctx, [
            new THREE.Vector3(ty.x - 60, 0, ty.z - 40),
            new THREE.Vector3(ty.x - 60, 0, ty.z - 6)
        ], 'mesh', fenceHeight, true);
        SectorGenerator.createFence(ctx, [
            new THREE.Vector3(ty.x - 60, 0, ty.z),
            new THREE.Vector3(ty.x - 60, 0, ty.z + 40)
        ], 'mesh', fenceHeight, true);

        // East Side (Opening for railroad)
        SectorGenerator.createFence(ctx, [
            new THREE.Vector3(ty.x + 60, 0, ty.z - 40),
            new THREE.Vector3(ty.x + 60, 0, ty.z + 5),
        ], 'mesh', fenceHeight, true);
        SectorGenerator.createFence(ctx, [
            new THREE.Vector3(ty.x + 60, 0, ty.z + 11),
            new THREE.Vector3(ty.x + 60, 0, ty.z + 40)
        ], 'mesh', fenceHeight, true);


        // Train yard - Ground
        const stationGround = new THREE.Mesh(new THREE.PlaneGeometry(120, 80), MATERIALS.asphalt);
        stationGround.rotation.x = -Math.PI / 2;
        stationGround.position.set(LOCATIONS.POIS.TRAIN_YARD.x, 0.025, LOCATIONS.POIS.TRAIN_YARD.z);
        stationGround.receiveShadow = true;
        scene.add(stationGround);

        // Trainyard - rail track
        PathGenerator.createRailTrack(ctx, [
            new THREE.Vector3(-17, 0, 450),
            new THREE.Vector3(0, 0, 435),
            new THREE.Vector3(65, 0, 400),
            new THREE.Vector3(150, 0, 400),
            new THREE.Vector3(260, 0, 415),
        ]);

        // Train yard - Train
        const train = new THREE.Group();
        train.position.set(LOCATIONS.POIS.TRAIN_YARD.x, 0, LOCATIONS.POIS.TRAIN_YARD.z);
        train.rotation.y = -0.05;
        const matBody = MATERIALS.train; const matBlack = MATERIALS.blackMetal;

        const chassis = new THREE.Mesh(new THREE.BoxGeometry(16, 1.5, 4), matBlack);
        chassis.position.y = 1.5;
        train.add(chassis);

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

        // Train yard - Containers
        const cColors = [0x1a4a2a, 0x4a2a1a, 0x1a2a4a, 0x8b0000];

        const containersData = [
            { x: ty.x - 30, z: ty.z - 20, r: 0.1, c: cColors[0] },      // Back left
            { x: ty.x - 28, z: ty.z - 17, r: 0.2, c: cColors[1] },      // Back left slightly offset
            { x: ty.x + 35, z: ty.z - 15, r: -0.1, c: cColors[2] },     // Back right
            { x: ty.x + 40, z: ty.z + 10, r: Math.PI / 2 + 0.05, c: cColors[3] }, // Right side
            { x: ty.x - 45, z: ty.z + 20, r: Math.PI / 2 - 0.1, c: cColors[0] }  // Left side
        ];

        for (let i = 0; i < containersData.length; i++) {
            const data = containersData[i];
            const container = ObjectGenerator.createContainer(data.c, true);
            container.position.set(data.x, 0, data.z);
            container.rotation.y = data.r;
            scene.add(container);
            SectorGenerator.addObstacle(ctx, {
                mesh: container,
                collider: { type: 'box', size: new THREE.Vector3(6.0, 2.6, 2.4) }
            });
        }

        // FORESTS
        // Forest: Home -> SMU
        let forestPolygon = [
            new THREE.Vector3(37, 0, 44),
            new THREE.Vector3(36, 0, 30),
            new THREE.Vector3(103, 0, 30),
            new THREE.Vector3(99, 0, 67),
            new THREE.Vector3(76, 0, 43),
        ];
        SectorGenerator.createForest(ctx, forestPolygon, 8, 'spruce');

        // Forest: Home -> SMU
        forestPolygon = [
            new THREE.Vector3(-27, 0, 45),
            new THREE.Vector3(-27, 0, 80),
            new THREE.Vector3(57, 0, 89),
            new THREE.Vector3(82, 0, 110),
            new THREE.Vector3(85, 0, 147),
            new THREE.Vector3(55, 0, 177),
            new THREE.Vector3(123, 0, 148),
            new THREE.Vector3(123, 0, 115),
            new THREE.Vector3(109, 0, 115),
            new THREE.Vector3(101, 0, 96),
            new THREE.Vector3(96, 0, 78),
            new THREE.Vector3(70, 0, 55),
            new THREE.Vector3(32, 0, 55),
            new THREE.Vector3(24, 0, 37),
        ];
        SectorGenerator.createForest(ctx, forestPolygon, 8, 'spruce');

        // Forest
        forestPolygon = [
            new THREE.Vector3(188, 0, 151),
            new THREE.Vector3(188, 0, 140),
            new THREE.Vector3(174, 0, 137),
            new THREE.Vector3(125, 0, 137),
            new THREE.Vector3(129, 0, 163),
            new THREE.Vector3(142, 0, 173),
        ];
        SectorGenerator.createForest(ctx, forestPolygon, 12, 'pine');

        // Forest - Cafe
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

        // Forsest - Gym
        forestPolygon = [
            new THREE.Vector3(20, 0, 230),
            new THREE.Vector3(66, 0, 230),
            new THREE.Vector3(66, 0, 285),
            new THREE.Vector3(72, 0, 285),
            new THREE.Vector3(72, 0, 340),
            new THREE.Vector3(28, 0, 350),

        ];
        SectorGenerator.createForest(ctx, forestPolygon, 10, 'birch');

        // Forest - Town center
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
        SectorGenerator.createForest(ctx, forestPolygon, 8, 'birch');

        // Forest: Trainyard - North-West
        forestPolygon = [
            new THREE.Vector3(88, 0, 364),
            new THREE.Vector3(88, 0, 392),
            new THREE.Vector3(53, 0, 401),
            new THREE.Vector3(33, 0, 409),
            new THREE.Vector3(31, 0, 375),
        ];
        SectorGenerator.createForest(ctx, forestPolygon, 8, 'spruce');

        // Forst
        forestPolygon = [
            new THREE.Vector3(212, 0, 359),
            new THREE.Vector3(250, 0, 359),
            new THREE.Vector3(250, 0, 408),
            new THREE.Vector3(212, 0, 403),
        ];
        SectorGenerator.createForest(ctx, forestPolygon, 8, 'spruce');

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

        SectorGenerator.spawnDeadBody(ctx, 37, 44, 'WALKER', 0, true);
        SectorGenerator.spawnChest(ctx, 45, 45, 'standard');
        SectorGenerator.spawnChest(ctx, 110, 80, 'standard');
        SectorGenerator.spawnChest(ctx, LOCATIONS.POIS.CAFE.x, LOCATIONS.POIS.CAFE.z + 5, 'standard');
    },

    setupContent: (ctx: SectorContext) => {
        const { triggers } = ctx;

        triggers.push(
            { id: 's1_start_tracks', position: LOCATIONS.TRIGGERS.START_TRACKS, radius: 10, type: 'THOUGHTS', content: "clues.s1_start_tracks", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 50 } }] },
            { id: 's1_blood_stains', position: LOCATIONS.TRIGGERS.BLOOD_STAINS, radius: 10, type: 'THOUGHTS', content: "clues.s1_blood_stains", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 50 } }] },
            { id: 's1_they_must_be_scared', position: LOCATIONS.TRIGGERS.CHAOS_HERE, radius: 8, type: 'THOUGHTS', content: "clues.s1_they_must_be_scared", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 50 } }] },
            { id: 's1_still_tracking', position: LOCATIONS.TRIGGERS.STILL_TRACKING, radius: 15, type: 'THOUGHTS', content: "clues.s1_still_tracking", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 50 } }] },
            { id: 's1_town_center', position: LOCATIONS.TRIGGERS.TOWN_CENTER, radius: 80, type: 'THOUGHTS', content: "clues.s1_town_center", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 50 } }] },

            { id: 's1_poi_building_on_fire', position: LOCATIONS.POIS.SMU, size: { width: 60, depth: 60 }, type: 'POI', content: "clues.s1_poi_building_on_fire", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 500 } }] },
            { id: 's1_poi_church', position: LOCATIONS.POIS.CHURCH, size: { width: 30, depth: 30 }, type: 'POI', content: "clues.s1_poi_church", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 500 } }] },
            { id: 's1_poi_cafe', position: LOCATIONS.POIS.CAFE, size: { width: 25, depth: 25 }, type: 'POI', content: "clues.s1_poi_cafe", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 500 } }] },
            { id: 's1_poi_pizzeria', position: LOCATIONS.POIS.PIZZERIA, size: { width: 25, depth: 25 }, type: 'POI', content: "clues.s1_poi_pizzeria", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 500 } }] },
            { id: 's1_poi_grocery', position: LOCATIONS.POIS.GROCERY, size: { width: 25, depth: 40 }, type: 'POI', content: "clues.s1_poi_grocery", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 500 } }] },
            { id: 's1_poi_gym', position: LOCATIONS.POIS.GYM, size: { width: 45, depth: 25 }, type: 'POI', content: "clues.s1_poi_gym", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 500 } }] },
            { id: 's1_poi_train_yard', position: LOCATIONS.POIS.TRAIN_YARD, size: { width: 130, depth: 90 }, type: 'POI', content: "clues.s1_poi_train_yard", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 500 } }] },

            // THE NATIVE BUS EVENT TRIGGER
            { id: 's1_event_tunnel_blocked', position: LOCATIONS.TRIGGERS.BUS, radius: 15, type: 'SPEECH', content: "clues.s1_event_tunnel_blocked", triggered: false, actions: [] },

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

        /* TODO: FIX THIS  DO NOT REMOVE
        const homeFlowers = [
            new THREE.Vector3(8, 0, -8),
            new THREE.Vector3(12, 0, -8),
            new THREE.Vector3(12, 0, -2),
            new THREE.Vector3(8, 0, -2)
        ];
        EnvironmentGenerator.fillAreaWithFlowers(ctx, homeFlowers, 1.0);

        const churchFlowers = [
            new THREE.Vector3(160, 0, 235),
            new THREE.Vector3(170, 0, 235),
            new THREE.Vector3(170, 0, 245),
            new THREE.Vector3(160, 0, 245)
        ];
        EnvironmentGenerator.fillAreaWithFlowers(ctx, churchFlowers, 0.7);
        */
    },

    onInteract: (id: string, object: THREE.Object3D, state: any, events: any) => {
        // Only triggered when the player hits [E] after the wave is cleared
        if (id === 'tunnel_bus_explode') {
            state.sectorState.busInteractionTriggered = true;
            object.userData.isInteractable = false;
        }
    },

    onUpdate: (dt, now, playerPos, gameState, sectorState, events) => {
        const state = gameState;
        if (!sectorState.spawns) sectorState.spawns = {};

        // --- 1. AMBIENT ZOMBIE SPAWNS ---
        if (!sectorState.spawns.initial && now - state.startTime > 0) {
            sectorState.spawns.initial = true;
            for (let i = 0; i < 3; i++) {
                if (events.spawnZombie) events.spawnZombie('WALKER', new THREE.Vector3(14, 0, 1));
            }
        }

        const forestHomeSMU = new THREE.Vector3(70, 0, 50);
        if (playerPos.distanceTo(forestHomeSMU) < 40 && !sectorState.spawns.forest_home_smu) {
            sectorState.spawns.forest_home_smu = true;
            for (let i = 0; i < 6; i++) {
                const type = Math.random() > 0.7 ? 'RUNNER' : 'WALKER';
                const offX = (Math.random() - 0.5) * 30;
                const offZ = (Math.random() - 0.5) * 30;
                if (events.spawnZombie) events.spawnZombie(type, new THREE.Vector3(forestHomeSMU.x + offX, 0, forestHomeSMU.z + offZ));
            }
        }

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

                    const offX = (Math.random() - 0.5) * 20;
                    const offZ = (Math.random() - 0.5) * 20;
                    if (events.spawnZombie) events.spawnZombie(type, new THREE.Vector3(poi.pos.x + offX, 0, poi.pos.z + offZ));
                }
            }
        });

        const townCenterWoods = new THREE.Vector3(145, 0, 240);
        if (playerPos.distanceTo(townCenterWoods) < 50 && !sectorState.spawns.town_forest) {
            sectorState.spawns.town_forest = true;
            for (let i = 0; i < 8; i++) {
                let type = 'WALKER';
                const roll = Math.random();
                if (roll > 0.8) type = 'TANK';
                else if (roll > 0.9) type = 'BOMBER';
                else if (roll > 0.7) type = 'RUNNER';

                const offX = (Math.random() - 0.5) * 40;
                const offZ = (Math.random() - 0.5) * 40;
                if (events.spawnZombie) events.spawnZombie(type, new THREE.Vector3(townCenterWoods.x + offX, 0, townCenterWoods.z + offZ));
            }
        }

        // --- 2. TRAIN SMOKE ---
        if (events.spawnPart) {
            const interval = 80;
            if (now - (sectorState.lastSmokeTime || 0) > interval) {
                sectorState.lastSmokeTime = now;
                const tPos = LOCATIONS.POIS.TRAIN_YARD;
                const yRot = -0.05;
                const localX = 6, localY = 7.0, localZ = 0;
                const wx = tPos.x + (localX * Math.cos(yRot) - localZ * Math.sin(yRot));
                const wz = tPos.z + (localX * Math.sin(yRot) + localZ * Math.cos(yRot));

                events.spawnPart(wx, localY, wz, 'black_smoke', 1);
            }
        }

        // --- 3. BUS EVENT STATE MACHINE ---
        if (sectorState.busEventState === undefined) {
            sectorState.busEventState = 0;
            sectorState.zombiesKilled = 0;
            sectorState.zombiesKillTarget = 0;
        }

        // State 0: Wait for player to approach the bus
        if (sectorState.busEventState === 0) {
            const busTrigger = gameState.triggers?.find((t: any) => t.id === 's1_event_tunnel_blocked');
            if (busTrigger && busTrigger.triggered) {
                sectorState.busEventState = 1;
                sectorState.busEventTimer = now;
            }
        }

        // State 1: Wait 2.0s, then trigger first distant explosion
        else if (sectorState.busEventState === 1 && now - sectorState.busEventTimer > 2000) {
            sectorState.busEventState = 2;
            sectorState.busEventTimer = now;

            if (events.playSound) events.playSound('explosion');
            if (events.cameraShake) events.cameraShake(1.0);

            gameState.triggers.push({
                id: 'dyn_speech_' + Date.now(),
                position: playerPos.clone(),
                radius: 100,
                type: 'SPEECH',
                content: "clues.s1_event_tunnel_whats_happening",
                triggered: false,
                actions: []
            });
        }

        // State 2: Wait 2s, then pan camera
        else if (sectorState.busEventState === 2 && now - sectorState.busEventTimer > 2000) {
            sectorState.busEventState = 3;
            sectorState.busEventTimer = now;

            if (events.setCameraOverride) {
                _camOverrideTarget.copy(_trainYardPos).add(_offsetTrainYard);
                _camOverrideLookAt.copy(_trainYardPos);
                events.setCameraOverride({
                    active: true,
                    targetPos: _camOverrideTarget,
                    lookAtPos: _camOverrideLookAt,
                    endTime: performance.now() + 4000
                });
            }
        }

        // State 3: Wait 2s for camera to arrive, then BIG explosion at train yard
        else if (sectorState.busEventState === 3 && now - sectorState.busEventTimer > 2000) {
            sectorState.busEventState = 4;
            sectorState.busEventTimer = now;

            if (events.playSound) events.playSound('explosion');
            if (events.cameraShake) events.cameraShake(5.0);

            if (events.emitNoise) {
                events.emitNoise(_trainYardPos.clone(), 200, 'loud_explosion');
            }
        }

        // State 4: Wait 2s on explosion view, then return camera and spawn wave
        else if (sectorState.busEventState === 4 && now - sectorState.busEventTimer > 2000) {
            sectorState.busEventState = 5;
            sectorState.busEventTimer = now;

            if (events.setCameraOverride) events.setCameraOverride(null);

            gameState.triggers.push({
                id: 'dyn_speech_' + Date.now(),
                position: playerPos.clone(),
                radius: 100,
                type: 'SPEECH',
                content: "clues.s1_event_tunnel_explosion_attracted_zombies",
                triggered: false,
                actions: []
            });

            // ZOMBIE WAVE
            const LOCS = [
                LOCATIONS.POIS.CHURCH,
                LOCATIONS.POIS.CAFE,
                LOCATIONS.POIS.PIZZERIA,
                LOCATIONS.POIS.GYM,
                LOCATIONS.POIS.GROCERY
            ];

            let totalSpawned = 0;
            for (let i = 0; i < LOCS.length; i++) {
                for (let j = 0; j < 6; j++) {
                    _viewPos.set(LOCS[i].x, 0, LOCS[i].z);
                    if (events.spawnZombie) events.spawnZombie(undefined, _viewPos.clone());
                    totalSpawned++;
                }
            }

            // Adjust Target
            sectorState.zombiesKillTarget = 1; // TODO: Increase for prod
            sectorState.zombiesKilled = 0;
            sectorState.startingKills = gameState.killsInRun;
        }

        // State 5: Wait for player to kill the wave
        else if (sectorState.busEventState === 5) {
            sectorState.zombiesKilled = gameState.killsInRun - sectorState.startingKills;

            if (sectorState.zombiesKilled >= sectorState.zombiesKillTarget) {
                sectorState.busEventState = 6;
                sectorState.busEventTimer = now;

                gameState.triggers.push({
                    id: 'dyn_speech_' + Date.now(),
                    position: playerPos.clone(),
                    radius: 100,
                    type: 'SPEECH',
                    content: "clues.s1_event_tunnel_plant_explosives",
                    triggered: false,
                    actions: []
                });

                // Flag interaction for PlayerInteractionSystem
                sectorState.busCanBeInteractedWith = true;

                const busObj = (sectorState.ctx as any).busObject;
                if (busObj) {
                    busObj.userData.isInteractable = true;
                }
            }
        }

        // State 6: Wait for player to press [E]
        else if (sectorState.busEventState === 6 && sectorState.busInteractionTriggered) {
            sectorState.busEventState = 7;
            sectorState.busEventTimer = now;
            sectorState.lastBeepTime = now;

            const busObj = (sectorState.ctx as any).busObject;
            if (busObj) {
                sectorState.originalBusPos = busObj.position.clone();
                const busPos = busObj.position;

                // Cinematic Camera
                if (events.setCameraOverride) {
                    _camOverrideTarget.copy(busPos).add(_zoomOffsetTarget);
                    _camOverrideLookAt.copy(busPos).add(_zoomOffsetLook);
                    events.setCameraOverride({
                        active: true,
                        targetPos: _camOverrideTarget,
                        lookAtPos: _camOverrideLookAt,
                        endTime: performance.now() + 4000
                    });
                }

                // Spawn red pulsating ring
                const ringGeo = new THREE.RingGeometry(6, 7, 32);
                const ringMat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
                const ring = new THREE.Mesh(ringGeo, ringMat);
                ring.rotation.x = -Math.PI / 2;
                ring.position.copy(busPos);
                ring.position.y = 1.0;
                if (events.scene) events.scene.add(ring);
                sectorState.busRing = ring;
            }

            if (events.playTone) events.playTone(880, 'sine', 0.1, 0.2);
            if (events.setInteraction) events.setInteraction(null);
        }

        // State 7: Bomb countdown sequence
        else if (sectorState.busEventState === 7) {
            const elapsed = now - sectorState.busEventTimer;
            const _busObjShake = (sectorState.ctx as any).busObject;
            const pos = (sectorState as any).originalBusPos || LOCATIONS.TRIGGERS.BUS;
            _busOriginalPos.copy(pos);

            if (elapsed < 3000) {
                // Beep sequence
                const beepInterval = elapsed > 2000 ? 250 : 500;
                if (now - sectorState.lastBeepTime > beepInterval) {
                    sectorState.lastBeepTime = now;
                    if (events.playTone) events.playTone(880, 'sine', 0.1, 0.15);
                }

                // Pulsating visual effect on the ring
                if (sectorState.busRing) {
                    const pulse = (Math.sin(elapsed * 0.01) + 1) * 0.5;
                    sectorState.busRing.material.opacity = 0.3 + (pulse * 0.5);
                    sectorState.busRing.scale.setScalar(1.0 + (pulse * 0.2));
                    sectorState.busRing.material.color.setRGB(1.0, pulse, 0.0);
                }

                // Shake the bus to build tension
                if (_busObjShake) {
                    const shakeAmount = 0.05 + (elapsed / 3000) * 0.15;
                    _busObjShake.position.x = _busOriginalPos.x + (Math.random() - 0.5) * shakeAmount;
                    _busObjShake.position.z = _busOriginalPos.z + (Math.random() - 0.5) * shakeAmount;

                    // FIX: Tvinga Three.js att uppdatera matrisen så vi undviker fysik-lagg!
                    _busObjShake.updateMatrixWorld();

                    if (events.cameraShake) events.cameraShake(0.5);
                }
            } else {
                // Trigger the actual explosion
                sectorState.busEventState = 8;
                sectorState.busEventTimer = now;

                if (sectorState.busRing) {
                    if (events.scene) events.scene.remove(sectorState.busRing);
                    sectorState.busRing = null;
                }

                if (events.playSound) events.playSound('explosion');
                if (events.cameraShake) events.cameraShake(5);

                // --- 1. USE NATIVE GAME ENGINE EXPLOSION (NO CRASHES) ---
                if (events.spawnPart) {
                    events.spawnPart(_busOriginalPos.x, 2, _busOriginalPos.z, 'flash', 1);
                    events.spawnPart(_busOriginalPos.x, 2, _busOriginalPos.z, 'shockwave', 1);
                    events.spawnPart(_busOriginalPos.x, 2, _busOriginalPos.z, 'large_fire', 15);
                    events.spawnPart(_busOriginalPos.x, 2, _busOriginalPos.z, 'large_smoke', 10);
                    events.spawnPart(_busOriginalPos.x, 3, _busOriginalPos.z, 'debris', 30);
                    events.spawnPart(_busOriginalPos.x, 3, _busOriginalPos.z, 'scrap', 15);
                }

                // --- 2. CLEAR THE TUNNEL PASSAGE ---
                const _busObj = (sectorState.ctx as any).busObject as THREE.Object3D | null;
                const _obsArray = sectorState.ctx.obstacles;

                if (_busObj && events.scene) {
                    SectorGenerator.extinguishFire(sectorState.ctx, _busObj);
                    events.scene.remove(_busObj);
                    (sectorState.ctx as any).busObject = null;
                }

                if (_obsArray && _busOriginalPos) {
                    for (let i = 0; i < _obsArray.length; i++) {
                        const obs = _obsArray[i];
                        if (obs && obs.collider && obs.collider.type === 'box' &&
                            Math.abs(obs.position.x - _busOriginalPos.x) < 2.0 &&
                            Math.abs(obs.position.z - _busOriginalPos.z) < 2.0) {

                            obs.collider.size.set(0, 0, 0);
                            obs.radius = 0;
                            obs.position.setY(-1000);
                            if (obs.mesh) {
                                obs.mesh.position.setY(-1000);
                                if (events.scene) events.scene.remove(obs.mesh);
                            }

                            _obsArray[i] = _obsArray[_obsArray.length - 1];
                            _obsArray.pop();
                            break;
                        }
                    }
                }
                (sectorState.ctx as any).busObjectIdx = undefined;

                // --- 3. SPAWN ANIMATED RUBBLE BIASED AWAY FROM TUNNEL ---
                sectorState.busRubble = SectorGenerator.spawnRubble(
                    sectorState.ctx,
                    _busOriginalPos.x,
                    _busOriginalPos.z,
                    20,
                    MATERIALS.busBlue,
                    Math.PI
                );

                if (sectorState.busRubble) {
                    sectorState.busRubble.userData.active = true;
                    sectorState.busRubble.userData.hasLanded = new Uint8Array(sectorState.busRubble.count);

                    const data = sectorState.busRubble.userData;
                    for (let i = 0; i < sectorState.busRubble.count; i++) {
                        const ix = i * 3;

                        // X = Sprid i sidled
                        const dirX = (Math.random() - 0.5) * 3.0;

                        // Y = Kasta uppåt
                        const dirY = 1.0 + Math.random();

                        // Z = NEGATIV RIKTNING (bort från tunnelns Z=344 mot gatan på Z=300)
                        const dirZ = -(0.5 + Math.random() * 1.5);

                        const force = 15 + Math.random() * 20;
                        const vec = new THREE.Vector3(dirX, dirY, dirZ).normalize().multiplyScalar(force);

                        data.velocities[ix] = vec.x;
                        data.velocities[ix + 1] = vec.y;
                        data.velocities[ix + 2] = vec.z;
                    }
                }
                sectorState.lastMetalImpactTime = 0;
            }
        }

        // State 8: Explosion physics and post-explosion events
        else if (sectorState.busEventState === 8) {
            const elapsed = now - sectorState.busEventTimer;

            // FIX: dt är redan i sekunder, rör inte denna!
            const dtSec = dt;

            let transitionToState9 = false;

            // Animate rubble physics using TypedArrays
            if (sectorState.busRubble && sectorState.busRubble.userData.active) {
                const rubble = sectorState.busRubble;
                const data = rubble.userData;
                let stillMoving = false;

                for (let i = 0; i < rubble.count; i++) {
                    const ix = i * 3;

                    if (data.positions[ix + 1] > 0.5) {
                        stillMoving = true;

                        data.velocities[ix + 1] -= 50.0 * dtSec; // Gravity

                        data.positions[ix] += data.velocities[ix] * dtSec;
                        data.positions[ix + 1] += data.velocities[ix + 1] * dtSec;
                        data.positions[ix + 2] += data.velocities[ix + 2] * dtSec;

                        if (data.positions[ix + 1] <= 0.5) {
                            data.positions[ix + 1] = 0.5;

                            data.velocities[ix] *= 0.4;
                            data.velocities[ix + 2] *= 0.4;
                            data.velocities[ix + 1] *= -0.3; // Dampened bounce

                            data.spin[ix] *= 0.2;
                            data.spin[ix + 1] *= 0.2;
                            data.spin[ix + 2] *= 0.2;

                            if (Math.abs(data.velocities[ix + 1]) < 1.0) {
                                data.velocities[ix + 1] = 0;
                            }

                            if (data.hasLanded && !data.hasLanded[i] && events.playSound) {
                                data.hasLanded[i] = 1;
                                if (now - sectorState.lastMetalImpactTime > 80) {
                                    sectorState.lastMetalImpactTime = now;
                                    events.playSound('impact_metal');
                                }
                            }
                        }

                        data.rotations[ix] += data.spin[ix] * dtSec;
                        data.rotations[ix + 1] += data.spin[ix + 1] * dtSec;
                        data.rotations[ix + 2] += data.spin[ix + 2] * dtSec;

                        _position.set(data.positions[ix], data.positions[ix + 1], data.positions[ix + 2]);
                        _rotation.set(data.rotations[ix], data.rotations[ix + 1], data.rotations[ix + 2]);
                        _quat.setFromEuler(_rotation);
                        _scale.setScalar(data.scales ? data.scales[i] : 1.0);

                        _matrix.compose(_position, _quat, _scale);
                        rubble.setMatrixAt(i, _matrix);
                    }
                }

                rubble.instanceMatrix.needsUpdate = true;

                if (!stillMoving || elapsed > 3500) {
                    data.active = false;
                    transitionToState9 = true;
                }
            } else if (elapsed > 2000) {
                transitionToState9 = true;
            }

            if (transitionToState9) {
                sectorState.busEventState = 9;

                if (events.setCameraOverride) events.setCameraOverride(null);

                gameState.triggers.push({
                    id: 'dyn_speech_' + Date.now(),
                    position: playerPos.clone(),
                    radius: 100,
                    type: 'SPEECH',
                    content: "clues.s1_event_tunnel_cleared",
                    triggered: false,
                    actions: []
                });
            }
        }
    }
};