import * as THREE from 'three';
import { SectorDef, SectorContext } from '../../types/sectors';
import { MATERIALS, GEOMETRY, createTextSprite, ModelFactory } from '../../utils/assets';
import { SectorBuilder } from '../../core/world/SectorGenerator';
import { PathGenerator } from '../../core/world/PathGenerator';
import { ObjectGenerator } from '../../core/world/ObjectGenerator';
import { t } from '../../utils/i18n';

const LOCATIONS = {
    SPAWN: {
        PLAYER: { x: -6, z: 35, rot: Math.PI / 1.25 },
        FAMILY: { x: 144, z: 400, y: 4 },
        BOSS: { x: 67, z: 400 }
    },
    CINEMATIC: {
        OFFSET: { x: 15, y: 12, z: 15 },
        LOOK_AT: { x: 0, y: 1.5, z: 0 }
    },
    POIS: {
        HOME: { x: 0, z: 0 },
        CAR: { x: -18, z: 4 },
        KINDGARTEN: { x: 150, z: 20 },
        SMU: { x: 150, z: 110 },
        CHURCH: { x: 165, z: 240 },
        CAFE: { x: 110, z: 250 },
        GROCERY: { x: 170, z: 300 },
        GYM: { x: 105, z: 295 },
        PIZZERIA: { x: 200, z: 250 },
        TRAIN_YARD: { x: 150, z: 400 },
        BUS: { x: 139, z: 333 }
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
        TUNNEL: { x: 139, z: 333 }
    }
} as const;

export const Sector1: SectorDef = {
    id: 0,
    name: "maps.village_name",
    environment: {
        bgColor: 0x020208,
        fogDensity: 0.02,
        ambientIntensity: 0.6,
        groundColor: 0xddddff,
        fov: 50,
        moon: { visible: true, color: 0x6688ff, intensity: 0.6 },
        cameraOffsetZ: 40,
        weather: 'snow'
    },

    // --- ADJUST SPAWN POINTS HERE ---
    playerSpawn: LOCATIONS.SPAWN.PLAYER,
    familySpawn: LOCATIONS.SPAWN.FAMILY,
    bossSpawn: LOCATIONS.SPAWN.BOSS,

    // Cinematic Camera Setup
    cinematic: {
        offset: LOCATIONS.CINEMATIC.OFFSET,
        lookAtOffset: LOCATIONS.CINEMATIC.LOOK_AT,
    },

    generate: (ctx: SectorContext) => {
        const { scene, obstacles, flickeringLights, burningBarrels, triggers } = ctx;

        // Path: Home -> SMU
        PathGenerator.createDirtPath(ctx, [
            new THREE.Vector3(25, 0, 28),
            new THREE.Vector3(35, 0, 48),
            new THREE.Vector3(79, 0, 49),
            new THREE.Vector3(103, 0, 74),
            new THREE.Vector3(183, 0, 78),
        ], 4, true, true);

        // Road: SMU -> Main Road
        PathGenerator.createRoad(ctx, [
            new THREE.Vector3(210, 0, 30),
            new THREE.Vector3(210, 0, 150),
            new THREE.Vector3(188, 0, 164),
            new THREE.Vector3(35, 0, 225)
        ], 16);

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
            new THREE.Vector3(191, 0, 141),
            new THREE.Vector3(201, 0, 148)
        ], { spacing: 0.6, size: 0.4, material: MATERIALS.footprintDecal, variance: 0.2 });

        // Home
        const villaGroup = new THREE.Group();
        villaGroup.position.set(LOCATIONS.POIS.HOME.x, LOCATIONS.POIS.HOME.z, 15);
        const villaBody = new THREE.Mesh(new THREE.BoxGeometry(20, 7, 14), new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.8 }));
        villaBody.position.y = 3.5;
        villaBody.castShadow = true;
        villaGroup.add(villaBody);
        const villaRoof = new THREE.Mesh(new THREE.ConeGeometry(16, 6, 4), MATERIALS.blackMetal);
        villaRoof.position.y = 10;
        villaRoof.rotation.y = Math.PI / 4;
        villaGroup.add(villaRoof);
        scene.add(villaGroup);
        obstacles.push({ mesh: villaGroup, collider: { type: 'box', size: new THREE.Vector3(20, 20, 14) } });

        // Burning Car
        SectorBuilder.spawnCar(ctx, LOCATIONS.POIS.CAR.x, LOCATIONS.POIS.CAR.z, 0.3, 0, 0x333333);
        const carFire = new THREE.PointLight(0xff4400, 15, 30);
        carFire.position.set(LOCATIONS.POIS.CAR.x, 4, LOCATIONS.POIS.CAR.z);
        scene.add(carFire);
        flickeringLights.push({ light: carFire, baseInt: 10, flickerRate: 0.4 });
        burningBarrels.push({ position: new THREE.Vector3(LOCATIONS.POIS.CAR.x, 2, LOCATIONS.POIS.CAR.z) });

        // Kindergarten
        const kindergarten = new THREE.Mesh(new THREE.BoxGeometry(60, 10, 50), new THREE.MeshStandardMaterial({ color: 0xffffff }));
        kindergarten.position.set(LOCATIONS.POIS.KINDGARTEN.x, 0, LOCATIONS.POIS.KINDGARTEN.z);
        kindergarten.castShadow = true;
        scene.add(kindergarten);
        obstacles.push({ mesh: kindergarten, collider: { type: 'box', size: new THREE.Vector3(50, 20, 50) } });

        // Random Buildings (Dead Objects)
        const deadBuildings = [
            { x: 54, z: 15, s: [15, 12, 15], color: 0x776655 },
            { x: 237, z: 92, s: [18, 15, 20], color: 0x555566 },
            { x: 235, z: 117, s: [12, 10, 12], color: 0x665555 },
            { x: 224, z: 168, s: [20, 8, 20], color: 0x444444 },
            { x: 117, z: 170, s: [16, 14, 16], color: 0x777777 }
        ];
        deadBuildings.forEach((b) => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.s[0], b.s[1], b.s[2]), new THREE.MeshStandardMaterial({ color: b.color, roughness: 0.9 }));
            mesh.position.set(b.x, b.s[1] / 2, b.z);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            scene.add(mesh);
            obstacles.push({ mesh: mesh, collider: { type: 'box', size: new THREE.Vector3(b.s[0], b.s[1] * 2, b.s[2]) } });
        });

        // Fences & Walls
        ObjectGenerator.createFence(ctx, [
            new THREE.Vector3(104, 0, 19),
            new THREE.Vector3(104, 0, 67),
            new THREE.Vector3(184, 0, 67)
        ]);

        ObjectGenerator.createStoneWall(ctx, [
            new THREE.Vector3(203, 0, 76),
            new THREE.Vector3(206, 0, 112),
            new THREE.Vector3(205, 0, 134),
            new THREE.Vector3(203, 0, 146)
        ]);

        // Hedges
        ObjectGenerator.createHedge(ctx, [new THREE.Vector3(-19, 0, 8), new THREE.Vector3(-29, 0, 8), new THREE.Vector3(-29, 0, 32), new THREE.Vector3(-17, 0, 40), new THREE.Vector3(11, 0, 40), new THREE.Vector3(23, 0, 33)]);
        ObjectGenerator.createHedge(ctx, [new THREE.Vector3(-6, 0, 0), new THREE.Vector3(31, 0, 0), new THREE.Vector3(31, 0, 31)]);
        ObjectGenerator.createHedge(ctx, [new THREE.Vector3(141, 0, 192), new THREE.Vector3(146, 0, 230)]);
        ObjectGenerator.createHedge(ctx, [new THREE.Vector3(130, 0, 198), new THREE.Vector3(136, 0, 231)]);

        // POI: SMU
        //SectorBuilder.spawnDebugMarker(ctx, LOCATIONS.POIS.SMU.x, LOCATIONS.POIS.SMU.z, 10, t('clues.s1_poi_building_on_fire'));
        const smu = new THREE.Mesh(new THREE.BoxGeometry(50, 10, 50), new THREE.MeshStandardMaterial({ color: 0x752020 }));
        smu.position.set(LOCATIONS.POIS.SMU.x, 5, LOCATIONS.POIS.SMU.z);
        smu.castShadow = true;
        scene.add(smu);
        obstacles.push({ mesh: smu, collider: { type: 'box', size: new THREE.Vector3(50, 20, 50) } });

        // Burning Cars
        const carColors = [0x3355ff, 0xcccccc, 0xcc2222]; // Blue, Silver, Red
        for (let i = 0; i < 3; i++) {
            const carPos = { x: LOCATIONS.POIS.SMU.x + 35, z: LOCATIONS.POIS.SMU.z + (i * 12) - 10 };
            SectorBuilder.spawnCar(ctx, carPos.x, carPos.z, 0.3, 0, carColors[i]);
            const carFire = new THREE.PointLight(0xff4400, 15, 30);
            carFire.position.set(carPos.x, 4, carPos.z);
            scene.add(carFire);
            flickeringLights.push({ light: carFire, baseInt: 10, flickerRate: 0.4 });
            burningBarrels.push({ position: new THREE.Vector3(carPos.x, 2, carPos.z) });
        }

        // POI: Church 
        //SectorBuilder.spawnDebugMarker(ctx, LOCATIONS.POIS.CHURCH.x, LOCATIONS.POIS.CHURCH.z, 15, t('clues.s1_poi_church'));
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

        // Café 
        //SectorBuilder.spawnDebugMarker(ctx, LOCATIONS.POIS.CAFE.x, LOCATIONS.POIS.CAFE.z, 12, t('clues.s1_poi_cafe'));
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

        // Gym 
        //SectorBuilder.spawnDebugMarker(ctx, LOCATIONS.POIS.GYM.x, LOCATIONS.POIS.GYM.z, 10, t('clues.s1_poi_gym'));
        const gym = new THREE.Mesh(new THREE.BoxGeometry(40, 12, 20), MATERIALS.metalPanel);
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

        // Train Yard
        //SectorBuilder.spawnDebugMarker(ctx, LOCATIONS.POIS.TRAIN_YARD.x, LOCATIONS.POIS.TRAIN_YARD.z, 10, t('clues.s1_poi_train_yard'));

        // Gravel
        const gravel = new THREE.Mesh(new THREE.PlaneGeometry(120, 80), MATERIALS.gravel);
        gravel.rotation.x = -Math.PI / 2;
        gravel.position.set(LOCATIONS.POIS.TRAIN_YARD.x, 0.02, LOCATIONS.POIS.TRAIN_YARD.z);
        gravel.receiveShadow = true;
        scene.add(gravel);

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
        const matBlack = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });

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

        // Smoke Emitter
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

        // Locomotive Smoke
        // TODO: use smoke from ObjectGenerator.createSmoke(ctx, LOCATIONS.POIS.TRAIN_YARD.x + 5.5, 0, 7.5, 'black_smoke', 150, 1, 2);
        // REMOVE: const smokeEmitter = new THREE.Group();
        // REMOVE: Align with Chimney (Local x=6, Rot=0.23)
        // REMOVE: smokeEmitter.position.set(LOCATIONS.POIS.TRAIN_YARD.x + 5.5, 7.5, LOCATIONS.POIS.TRAIN_YARD.z - 1.3);
        // REMOVE: scene.add(smokeEmitter);

        // The Bus (Blocker)
        const bus = new THREE.Group();
        bus.position.set(LOCATIONS.POIS.BUS.x, 0, LOCATIONS.POIS.BUS.z);
        const busBody = new THREE.Mesh(new THREE.BoxGeometry(4.5, 4.5, 14), new THREE.MeshStandardMaterial({ color: 0x1133aa }));
        busBody.position.y = 2.25;
        busBody.rotation.y = Math.PI / 2;
        bus.add(busBody);

        // Asset-Driven Effects for Bus
        bus.userData.effects = [
            { type: 'light', color: 0xffaa00, intensity: 8, distance: 30, offset: new THREE.Vector3(0, 5, 0), flicker: true },
            { type: 'emitter', particle: 'campfire_flame', interval: 30, count: 2, offset: new THREE.Vector3(0, 3, 0), spread: 2.5 },
            { type: 'emitter', particle: 'campfire_spark', interval: 100, count: 1, offset: new THREE.Vector3(0, 4, 0), spread: 3 },
            { type: 'emitter', particle: 'black_smoke', interval: 150, count: 1, offset: new THREE.Vector3(0, 5, 0), spread: 2 }
        ];

        scene.add(bus);
        obstacles.push({ mesh: bus, collider: { type: 'box', size: new THREE.Vector3(4.5, 10, 14) }, id: 'gate' });

        // Ground Plane (Snow) - Restored & Lowered
        const groundGeo = new THREE.PlaneGeometry(2000, 2000);
        const groundMat = new THREE.MeshStandardMaterial({
            color: 0xddddff, // Snow White
            roughness: 1.0,
            metalness: 0.1
        });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.5; // Prevent Z-fighting
        ground.receiveShadow = true;
        scene.add(ground);

        // TREES
        // Home 1
        let forestPolygon = [
            new THREE.Vector3(37, 0, 44),
            new THREE.Vector3(36, 0, 30),
            new THREE.Vector3(103, 0, 30),
            new THREE.Vector3(99, 0, 67),
            new THREE.Vector3(76, 0, 43),
        ];
        ObjectGenerator.createForestInPolygon(ctx, forestPolygon, 8, 'spruce');
        // Home 2
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
        ObjectGenerator.createForestInPolygon(ctx, forestPolygon, 8, 'spruce');
        // SMU
        forestPolygon = [
            new THREE.Vector3(199, 0, 140),
            new THREE.Vector3(174, 0, 137),
            new THREE.Vector3(129, 0, 163),
            new THREE.Vector3(142, 0, 173),
        ];
        ObjectGenerator.createForestInPolygon(ctx, forestPolygon, 12, 'pine');
        // Town center
        forestPolygon = [
            new THREE.Vector3(128, 0, 200),
            new THREE.Vector3(65, 0, 234),
            new THREE.Vector3(68, 0, 256),
            new THREE.Vector3(122, 0, 247),
            new THREE.Vector3(138, 0, 253),
        ];
        ObjectGenerator.createForestInPolygon(ctx, forestPolygon, 12, 'birch');


        // --- DECORATION: DEAD ZOMBIE AT (37, 44) ---
        // Blood Pool
        const bloodPool = new THREE.Mesh(GEOMETRY.decal, MATERIALS.bloodDecal);
        bloodPool.rotation.x = -Math.PI / 2;
        bloodPool.position.set(37, 0.05, 44);
        bloodPool.scale.set(3, 3, 1);
        scene.add(bloodPool);

        // Corpse
        const baseZomb = ModelFactory.createZombie('WALKER', { color: 0x445544 });
        const corpse = ModelFactory.createCorpse(baseZomb);
        corpse.position.set(37, 0.2, 44);
        scene.add(corpse);


        // --- TRIGGERS ---
        triggers.push(
            // Collectibles (Action: 1 SP Reward)
            { id: 's1_collectible_1', position: LOCATIONS.COLLECTIBLES.C1, radius: 4, type: 'COLLECTIBLE', content: "clues.s1_collectible_1", description: "clues.s1_collectible_1_description", triggered: false, icon: "s1_collectible_1_icon", actions: [{ type: 'GIVE_REWARD', payload: { sp: 1 } }] },
            { id: 's1_collectible_2', position: LOCATIONS.COLLECTIBLES.C2, radius: 4, type: 'COLLECTIBLE', content: "clues.s1_collectible_2", description: "clues.s1_collectible_2_description", triggered: false, icon: "s1_collectible_2_icon", actions: [{ type: 'GIVE_REWARD', payload: { sp: 1 } }] },

            // Clues (Action: 50 XP Reward)
            { id: 's1_start_tracks', position: LOCATIONS.TRIGGERS.START_TRACKS, radius: 10, type: 'THOUGHTS', content: "clues.s1_start_tracks", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 50 } }] },
            { id: 's1_blood_stains', position: LOCATIONS.TRIGGERS.BLOOD_STAINS, radius: 10, type: 'THOUGHTS', content: "clues.s1_blood_stains", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 50 } }] },
            { id: 's1_they_must_be_scared', position: LOCATIONS.TRIGGERS.CHAOS_HERE, radius: 8, type: 'THOUGHTS', content: "clues.s1_they_must_be_scared", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 50 } }] },
            { id: 's1_still_tracking', position: LOCATIONS.TRIGGERS.STILL_TRACKING, radius: 15, type: 'THOUGHTS', content: "clues.s1_still_tracking", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 50 } }] },
            { id: 's1_town_center', position: LOCATIONS.TRIGGERS.TOWN_CENTER, radius: 80, type: 'THOUGHTS', content: "clues.s1_town_center", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 50 } }] },
            { id: 's1_tunnel_blocked', position: LOCATIONS.TRIGGERS.TUNNEL, radius: 10, type: 'THOUGHTS', content: "clues.s1_tunnel_blocked", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 50 } }] },
            { id: 's1_tunnel_cleared', position: LOCATIONS.TRIGGERS.TUNNEL, radius: 10, type: 'THOUGHTS', content: "clues.s1_tunnel_cleared", triggered: false },

            // POIs (Action: 250 XP Reward)
            { id: 's1_poi_building_on_fire', position: LOCATIONS.POIS.SMU, radius: 50, type: 'POI', content: "clues.s1_poi_building_on_fire", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 500 } }] },
            { id: 's1_poi_church', position: LOCATIONS.POIS.CHURCH, radius: 20, type: 'POI', content: "clues.s1_poi_church", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 500 } }] },
            { id: 's1_poi_cafe', position: LOCATIONS.POIS.CAFE, radius: 20, type: 'POI', content: "clues.s1_poi_cafe", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 500 } }] },
            { id: 's1_poi_pizzeria', position: LOCATIONS.POIS.PIZZERIA, radius: 20, type: 'POI', content: "clues.s1_poi_pizzeria", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 500 } }] },
            { id: 's1_poi_grocery', position: LOCATIONS.POIS.GROCERY, radius: 20, type: 'POI', content: "clues.s1_poi_grocery", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 500 } }] },
            { id: 's1_poi_train_yard', position: LOCATIONS.POIS.TRAIN_YARD, radius: 30, type: 'POI', content: "clues.s1_poi_train_yard", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 500 } }] },

            // --- THE GYM EVENT (Trigger #4) ---
            {
                id: 's1_gym_event',
                position: LOCATIONS.POIS.GYM,
                radius: 15,
                type: 'EVENT',
                content: "story.gym_event",
                triggered: false,
                actions: [
                    { type: 'CAMERA_SHAKE', payload: { amount: 2.0 } },
                    { type: 'PLAY_SOUND', payload: { id: 'explosion' } },
                    // Pan to Train Yard
                    { type: 'CAMERA_PAN', payload: { target: LOCATIONS.POIS.TRAIN_YARD, duration: 2000 } },
                    { type: 'PLAY_SOUND', payload: { id: 'explosion' } },
                    // After pan (using delay)
                    { type: 'SHOW_TEXT', payload: { text: t('story.gym_event') }, delay: 2500 },
                    // Start Wave
                    { type: 'START_WAVE', payload: { count: 50 }, delay: 3000 },
                    // Spawn Zombies from Directions
                    // Batch 1: Church (North)
                    //{ type: 'SPAWN_ENEMY', payload: { type: 'RUNNER', count: 10, pos: LOCATIONS.POIS.CHURCH, spread: 10 }, delay: 3000 },
                    // Batch 2: Cafe (West)
                    //{ type: 'SPAWN_ENEMY', payload: { type: 'WALKER', count: 10, pos: LOCATIONS.POIS.CAFE, spread: 10 }, delay: 3500 },
                    // Batch 3: Grocery (South)
                    //{ type: 'SPAWN_ENEMY', payload: { type: 'WALKER', count: 10, pos: LOCATIONS.POIS.GROCERY, spread: 10 }, delay: 4000 },
                    // More waves follow logic in onUpdate if needed, or define here
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

        // --- ZOMBIE SPAWNING ---
        for (let i = 0; i < 3; i++) {
            const jitterX = (Math.random() - 0.5) * 2;
            const jitterZ = (Math.random() - 0.5) * 2;
            ctx.spawnZombie('RUNNER', new THREE.Vector3(-18 + jitterX, 0, -5 + jitterZ));
        }
    },

    onUpdate: (dt, now, playerPos, gameState, sectorState, events) => {
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
                // Add velocity? spawnPart handles it.
                events.spawnPart(wx, localY, wz, 'black_smoke', 1);
            }
        }

        // --- WAVE LOGIC ---nit State
        if (sectorState.hordeKilled === undefined) sectorState.hordeKilled = 0;
        if (sectorState.hordeTarget === undefined) sectorState.hordeTarget = 999; // Default high until event starts
        if (sectorState.busUnlocked === undefined) sectorState.busUnlocked = false;
        if (sectorState.waveActive === undefined) sectorState.waveActive = false;
        if (sectorState.lastSpawnTime === undefined) sectorState.lastSpawnTime = 0;

        // Wave Logic: Spawn reinforcements if wave is active and we haven't reached target kills + active enemies
        // We spawned 30 initially via trigger. We need 20 more to reach 50 kills.
        if (sectorState.waveActive && sectorState.hordeKilled < sectorState.hordeTarget) {
            const activeCount = gameState.enemies.length;
            const totalToKill = sectorState.hordeTarget;

            // Keep population up to ~15 during the event
            if (activeCount < 15 && now - sectorState.lastSpawnTime > 2000) {
                sectorState.lastSpawnTime = now;
                // Spawn randomly around the center plaza
                const center = { x: 230, z: -400 };
                const angle = Math.random() * Math.PI * 2;
                const dist = 30 + Math.random() * 20;
                const pos = new THREE.Vector3(center.x + Math.cos(angle) * dist, 0, center.z + Math.sin(angle) * dist);

                events.spawnZombie('RUNNER', pos);
            }
        }

        // Unlock Bus
        if (sectorState.waveActive && sectorState.hordeKilled >= sectorState.hordeTarget && !sectorState.busUnlocked) {
            sectorState.busUnlocked = true;
            events.setNotification({ visible: true, text: events.t('clues.bus_clear'), icon: '🚌', timestamp: now });
        }

        // Handle Bus Gate
        if (sectorState.busUnlocked) {
            gameState.busUnlocked = true;
        }
    }
};
