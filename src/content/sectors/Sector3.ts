import * as THREE from 'three';
import { SectorDef, SectorContext } from '../../types/SectorEnvironment';
import { MATERIALS, GEOMETRY, createTextSprite, ModelFactory } from '../../utils/assets';
import { SectorGenerator } from '../../core/world/SectorGenerator';
import { PathGenerator } from '../../core/world/PathGenerator';
import { EnvironmentGenerator } from '../../core/world/EnvironmentGenerator';
import { BOSSES, FAMILY_MEMBERS, CAMERA_HEIGHT } from '../../content/constants';

const LOCATIONS = {
    SPAWN: {
        PLAYER: { x: 0, z: 0 },
        FAMILY: { x: 215, z: -25 },
        BOSS: { x: 220, z: -10 }
    },
    CINEMATIC: {
        OFFSET: { x: 15, y: 15, z: -10 },
        LOOK_AT: { x: 0, y: 2, z: 0 }
    },
    COLLECTIBLES: {
        C1: { x: 275, z: -180 },
        C2: { x: 215, z: -25 }
    },
    TRIGGERS: {
        FOREST_NOISE: { x: 20, z: -18 },
        POI_MAST: { x: 215, z: -25 },
        FOUND_ESMERALDA: { x: 215, z: -25 }
    },
    POIS: {
        FARM: { x: 150, z: -120 },
        FARMHOUSE: { x: 275, z: -175 },
        BARN: { x: 305, z: -150 },
        MAST: { x: 215, z: -25 },
    },
    PATHS: {
        FOREST_TRAIL: [
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(40, 0, -30),
            new THREE.Vector3(80, 0, -10),
            new THREE.Vector3(120, 0, -50),
            new THREE.Vector3(125, 0, -79)
        ],
        HAGLAREDSVAGEN: [
            new THREE.Vector3(64, 0, -83),
            new THREE.Vector3(140, 0, -83),
            new THREE.Vector3(180, 0, -120),
            new THREE.Vector3(250, 0, -150),
            new THREE.Vector3(320, 0, -120),
            new THREE.Vector3(400, 0, -80)
        ],
        ROAD_TO_MAST: [
            new THREE.Vector3(300, 0, -130),
            new THREE.Vector3(289, 0, -92),
            new THREE.Vector3(250, 0, -85),
            new THREE.Vector3(215, 0, -25)
        ],
        FARM_PATH: [
            new THREE.Vector3(159, 0, -142),
            new THREE.Vector3(176, 0, -166),
            new THREE.Vector3(212, 0, -190),
            new THREE.Vector3(255, 0, -183),
        ]
    }
} as const;

export const Sector3: SectorDef = {
    id: 2,
    name: "sectors.sector_3_name",
    environment: {
        bgColor: 0x051015,
        fogDensity: 0.02,
        ambientIntensity: 0.3,
        groundColor: 0x112211,
        fov: 50,
        skyLight: { visible: true, color: 0x88ffaa, intensity: 0.8, position: { x: 50, y: 35, z: 50 } },
        cameraOffsetZ: 40,
        cameraHeight: CAMERA_HEIGHT,
        weather: 'rain'
    },

    // Set to SNOW as requested for clear visual debugging
    groundType: 'SNOW',
    ambientLoop: 'ambient_forest_loop',

    playerSpawn: LOCATIONS.SPAWN.PLAYER,
    familySpawn: LOCATIONS.SPAWN.FAMILY,
    bossSpawn: LOCATIONS.SPAWN.BOSS,

    collectibles: [
        { id: 's3_collectible_1', x: LOCATIONS.COLLECTIBLES.C1.x, z: LOCATIONS.COLLECTIBLES.C1.z },
        { id: 's3_collectible_2', x: LOCATIONS.COLLECTIBLES.C2.x, z: LOCATIONS.COLLECTIBLES.C2.z }
    ],

    cinematic: {
        offset: LOCATIONS.CINEMATIC.OFFSET,
        lookAtOffset: LOCATIONS.CINEMATIC.LOOK_AT,
        rotationSpeed: 0.02
    },

    setupProps: async (ctx: SectorContext) => {
        const { scene } = ctx;
        (ctx as any).sectorState.ctx = ctx;

        // --- 1. PATHS AND SPLINES ---
        const trailCurve = PathGenerator.createDirtPath(ctx, [...LOCATIONS.PATHS.FOREST_TRAIL], 3);
        const hagCurve = PathGenerator.createGravelRoad(ctx, [...LOCATIONS.PATHS.HAGLAREDSVAGEN], 6);
        PathGenerator.createGravelRoad(ctx, [...LOCATIONS.PATHS.ROAD_TO_MAST], 6);

        // Farm path bending SOUTH
        const farmCurve = PathGenerator.createDirtPath(ctx, [...LOCATIONS.PATHS.FARM_PATH], 3);

        const gravelGeo = new THREE.CylinderGeometry(25, 25, 0.1, 16);
        const gravelMat = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 1.0 });

        const farmGravel = new THREE.Mesh(gravelGeo, gravelMat);
        farmGravel.position.set(LOCATIONS.POIS.FARM.x, 0.02, LOCATIONS.POIS.FARM.z);
        farmGravel.receiveShadow = true;
        scene.add(farmGravel);

        const fhGravel = new THREE.Mesh(gravelGeo, gravelMat);
        fhGravel.position.set(LOCATIONS.POIS.FARMHOUSE.x, 0.02, LOCATIONS.POIS.FARMHOUSE.z);
        fhGravel.receiveShadow = true;
        scene.add(fhGravel);

        SectorGenerator.spawnChest(ctx, LOCATIONS.SPAWN.BOSS.x, LOCATIONS.SPAWN.BOSS.z, 'big');

        // --- 2. BUILDINGS & PROPS ---
        const farm = SectorGenerator.spawnBuilding(ctx, LOCATIONS.POIS.FARM.x, LOCATIONS.POIS.FARM.z, 25, 8, 20, (3 * Math.PI) / 4, 0x7c2e2e);
        SectorGenerator.setOnFire(ctx, farm, { smoke: true, intensity: 20, distance: 40, onRoof: true });

        SectorGenerator.spawnDeadBody(ctx, LOCATIONS.POIS.FARM.x + 5, LOCATIONS.POIS.FARM.z + 5, 'WALKER', Math.random() * Math.PI);
        SectorGenerator.spawnDeadBody(ctx, LOCATIONS.POIS.FARM.x - 5, LOCATIONS.POIS.FARM.z + 10, 'RUNNER', Math.random() * Math.PI);
        SectorGenerator.spawnDeadBody(ctx, LOCATIONS.POIS.FARM.x + 10, LOCATIONS.POIS.FARM.z - 5, 'TANK', Math.random() * Math.PI);

        SectorGenerator.spawnVehicle(ctx, LOCATIONS.POIS.FARM.x - 10, LOCATIONS.POIS.FARM.z + 5, (3 * Math.PI) / 4, 'tractor');
        SectorGenerator.spawnHaybale(ctx, LOCATIONS.POIS.FARM.x + 5, LOCATIONS.POIS.FARM.z - 5, Math.random() * Math.PI, 1.2);
        SectorGenerator.spawnHaybale(ctx, LOCATIONS.POIS.FARM.x + 8, LOCATIONS.POIS.FARM.z - 2, Math.random() * Math.PI, 1.1);
        SectorGenerator.spawnHaybale(ctx, LOCATIONS.POIS.FARM.x + 4, LOCATIONS.POIS.FARM.z - 8, Math.random() * Math.PI, 1.0);

        SectorGenerator.spawnTimberPile(ctx, LOCATIONS.POIS.FARM.x - 15, LOCATIONS.POIS.FARM.z + 10, Math.PI / 4, 1.2);
        SectorGenerator.spawnTimberPile(ctx, LOCATIONS.POIS.FARM.x - 12, LOCATIONS.POIS.FARM.z + 14, Math.PI / 3, 1.0);

        SectorGenerator.spawnTimberPile(ctx, 122, -92, 0, 2.0);
        SectorGenerator.spawnVehicle(ctx, 136, -92, -Math.PI / 3, 'timber_truck', 0x334433);
        SectorGenerator.spawnCrashedCar(ctx, 160, -85, -Math.PI / 4, 0xcc2222);

        const farmHouse = SectorGenerator.spawnBuilding(ctx, LOCATIONS.POIS.FARMHOUSE.x, LOCATIONS.POIS.FARMHOUSE.z, 25, 8, 20, (3 * Math.PI) / 4, 0x7c2e2e, true, true);
        SectorGenerator.setOnFire(ctx, farmHouse, { smoke: true, intensity: 150, distance: 40, onRoof: true });

        const barn = SectorGenerator.spawnBuilding(ctx, LOCATIONS.POIS.BARN.x, LOCATIONS.POIS.BARN.z, 25, 8, 20, (3 * Math.PI) / 4, 0x7c2e2e, true, true);
        SectorGenerator.setOnFire(ctx, barn, { smoke: true, intensity: 150, distance: 40, onRoof: true });

        // Abandoned House 1: North of Farmhouse (Birch Forest)
        const house1Coords = { x: 285, z: -250 };
        SectorGenerator.spawnBuilding(ctx, house1Coords.x, house1Coords.z, 12, 5, 12, Math.PI / 4, 0x445544, false);
        SectorGenerator.spawnDeadBody(ctx, house1Coords.x + 5, house1Coords.z + 5, 'HUMAN', Math.random() * Math.PI);

        // Abandoned House 2: South near boundary (Dead Forest)
        const house2Coords = { x: 300, z: 80 };
        SectorGenerator.spawnBuilding(ctx, house2Coords.x, house2Coords.z, 15, 6, 15, -Math.PI / 3, 0x333333, false);
        SectorGenerator.spawnDeadBody(ctx, house2Coords.x - 5, house2Coords.z - 5, 'HUMAN', Math.random() * Math.PI);

        // --- 3. SPLINE-BASED PROCEDURAL VEGETATION ---
        const trailPts = trailCurve.getSpacedPoints(80);
        const hagPts = hagCurve.getSpacedPoints(120);
        const farmPathPts = farmCurve.getSpacedPoints(60);

        const forestOffset = 7;
        const forestDepth = 35;

        // 4.3 Spruce (Forest Trail)
        // Strict filters: x < 115 stops before crossroads. z > -75 prevents bleeding onto Haglaredsvägen (z:-83).
        const filterTrailNorth = (points: THREE.Vector3[]) => points.filter(p => p.x < 115 && p.z > -75);
        const filterTrailSouth = (points: THREE.Vector3[]) => points.filter(p => p.x < 115);

        const sprucePolyNorth = [
            ...filterTrailNorth(PathGenerator.getOffsetPoints(trailPts, -forestOffset)),
            ...filterTrailNorth(PathGenerator.getOffsetPoints(trailPts, -(forestOffset + forestDepth))).reverse()
        ];
        const sprucePolySouth = [
            ...filterTrailSouth(PathGenerator.getOffsetPoints(trailPts, forestOffset)),
            ...filterTrailSouth(PathGenerator.getOffsetPoints(trailPts, forestOffset + forestDepth)).reverse()
        ];
        sprucePolyNorth.forEach(p => p.y = 0);
        sprucePolySouth.forEach(p => p.y = 0);

        await SectorGenerator.createForest(ctx, sprucePolyNorth, 12, ['spruce', 'pine']);
        await SectorGenerator.createForest(ctx, sprucePolySouth, 12, ['spruce', 'pine']);

        // 4.6 Wheat Fields (Strictly SOUTH of Haglaredsvägen using offset spline)
        const wheatOffset = 7;
        const wheatDepth = 35;

        const filterWheat1 = (points: THREE.Vector3[]) => points.filter(p => p.x > 90 && p.x < 150);
        const wheatPoly1 = [
            ...filterWheat1(PathGenerator.getOffsetPoints(hagPts, wheatOffset)),
            ...filterWheat1(PathGenerator.getOffsetPoints(hagPts, wheatOffset + wheatDepth)).reverse()
        ];
        wheatPoly1.forEach(p => p.y = 0);
        await SectorGenerator.fillWheatField(ctx, wheatPoly1, 0.4);
        SectorGenerator.createScarecrow(ctx, 125, -95);

        const filterWheat2 = (points: THREE.Vector3[]) => points.filter(p => p.x > 170 && p.x < 240);
        const wheatPoly2 = [
            ...filterWheat2(PathGenerator.getOffsetPoints(hagPts, wheatOffset)),
            ...filterWheat2(PathGenerator.getOffsetPoints(hagPts, wheatOffset + wheatDepth)).reverse()
        ];
        wheatPoly2.forEach(p => p.y = 0);
        await SectorGenerator.fillWheatField(ctx, wheatPoly2, 0.4);
        SectorGenerator.createScarecrow(ctx, 205, -135);

        // 4.7 Flowers (Nested dynamically between Farm Path and Haglaredsvägen)
        const filterFlowersFarm = (points: THREE.Vector3[]) => points.filter(p => p.x > 160 && p.x < 250);
        const filterFlowersHag = (points: THREE.Vector3[]) => points.filter(p => p.x > 160 && p.x < 250);

        const flowerPoly = [
            ...filterFlowersFarm(PathGenerator.getOffsetPoints(farmPathPts, 4)),       // Outer south boundary of farm path
            ...filterFlowersHag(PathGenerator.getOffsetPoints(hagPts, -4)).reverse()   // Inner north boundary of Haglaredsvägen
        ];
        flowerPoly.forEach(p => p.y = 0);
        await SectorGenerator.fillAreaWithFlowers(ctx, flowerPoly, 0.9, 'flower');

        // 4.8 Sunflowers (Strictly SOUTH of Haglaredsvägen, East of Mast Road)
        const sunflowerPoly1 = [
            new THREE.Vector3(310, 0, -110),
            new THREE.Vector3(360, 0, -110),
            new THREE.Vector3(360, 0, -80),
            new THREE.Vector3(310, 0, -80)
        ];
        await SectorGenerator.fillAreaWithFlowers(ctx, sunflowerPoly1, 0.4, 'sunflower');

        const sunflowerPoly2 = [
            new THREE.Vector3(310, 0, -70),
            new THREE.Vector3(360, 0, -70),
            new THREE.Vector3(360, 0, -40),
            new THREE.Vector3(310, 0, -40)
        ];
        await SectorGenerator.fillAreaWithFlowers(ctx, sunflowerPoly2, 0.4, 'sunflower');

        // 4.4 Birch Forest (Wrapping North and East of House 1)
        const birchPolyL = [
            new THREE.Vector3(260, 0, -280),
            new THREE.Vector3(330, 0, -280),
            new THREE.Vector3(330, 0, -220),
            new THREE.Vector3(300, 0, -220),
            new THREE.Vector3(300, 0, -240),
            new THREE.Vector3(260, 0, -240)
        ];
        await SectorGenerator.createForest(ctx, birchPolyL, 15, ['birch']);

        // 4.5 Dead Trees (Wrapping House 2)
        const deadForestPoly = [
            new THREE.Vector3(270, 0, 60),
            new THREE.Vector3(340, 0, 60),
            new THREE.Vector3(340, 0, 110),
            new THREE.Vector3(270, 0, 110)
        ];
        await SectorGenerator.createForest(ctx, deadForestPoly, 18, ['dead_tree']);

        // --- 4. LAKE & GRASS ---
        const lakeCoords = { x: 255, z: -117 };
        const lake = SectorGenerator.addLake(ctx, lakeCoords.x, lakeCoords.z, 25, 7.0);

        const stone = EnvironmentGenerator.createRock(25, 25, 15);
        stone.position.set(lakeCoords.x - 20, -2, lakeCoords.z + 10);
        scene.add(stone);

        SectorGenerator.addObstacle(ctx, {
            mesh: stone,
            position: stone.position,
            collider: { type: 'sphere', radius: 12.5 }
        });

        if (lake) lake.registerSplashSource(stone);

        const boatGroup = SectorGenerator.spawnFloatableVehicle(ctx, lakeCoords.x - 12.5, lakeCoords.z, Math.random() * Math.PI);
        if (lake && boatGroup) {
            lake.registerFloatingProp(boatGroup);
            lake.registerSplashSource(boatGroup);
        }

        // Sparse Grass (Stretching from South/East of Lake down to the Mast)
        const sparseGrassPoly = [
            new THREE.Vector3(90, 0, 50),
            new THREE.Vector3(180, 0, 40),
            new THREE.Vector3(220, 0, 5),   // Approaching mast
            new THREE.Vector3(180, 0, -10),
            new THREE.Vector3(120, 0, 10)
        ];
        await EnvironmentGenerator.fillAreaWithGrass(ctx, sparseGrassPoly, 0.4);

        // --- 5. MOUNTAIN BOUNDARY ---
        SectorGenerator.createMountain(ctx, [
            new THREE.Vector3(124, 0, 16),
            new THREE.Vector3(139, 0, -22),
            new THREE.Vector3(150, 0, -53),
            new THREE.Vector3(233, 0, -106)
        ], 10, 7);

        // --- 6. THE MAST ---
        const mastPos = LOCATIONS.POIS.MAST;

        const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x222222 }));
        asphalt.rotation.x = -Math.PI / 2;
        asphalt.position.set(mastPos.x, 0.05, mastPos.z);
        asphalt.receiveShadow = true;
        scene.add(asphalt);

        SectorGenerator.createFence(ctx, [
            new THREE.Vector3(mastPos.x - 30, 0, mastPos.z + 30),
            new THREE.Vector3(mastPos.x - 30, 0, mastPos.z - 30),
            new THREE.Vector3(mastPos.x - 5, 0, mastPos.z - 30)
        ], 'black', 2.5);

        SectorGenerator.createFence(ctx, [
            new THREE.Vector3(mastPos.x + 5, 0, mastPos.z - 30),
            new THREE.Vector3(mastPos.x + 30, 0, mastPos.z - 30),
            new THREE.Vector3(mastPos.x + 30, 0, mastPos.z + 30),
            new THREE.Vector3(mastPos.x - 30, 0, mastPos.z + 30)
        ], 'black', 2.5);

        SectorGenerator.spawnBuilding(ctx, mastPos.x, mastPos.z, 15, 5, 12, Math.PI / 2, 0x555555, false);

        const mastGroup = new THREE.Group();
        mastGroup.position.set(mastPos.x, 5, mastPos.z);

        const mastBase = new THREE.Mesh(new THREE.BoxGeometry(10, 2, 10), MATERIALS.concrete);
        mastBase.position.y = 1;
        mastGroup.add(mastBase);

        const mastMesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 6, 60, 4), MATERIALS.mast);
        mastMesh.position.y = 30;
        mastGroup.add(mastMesh);

        const lightHub = new THREE.Group();
        lightHub.name = "mastWarningLights";
        lightHub.position.y = 60;

        const lightXs = [2, -2];
        for (let i = 0; i < lightXs.length; i++) {
            const posX = lightXs[i];
            const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.4), new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000 }));
            lamp.position.x = posX;
            const pLight = new THREE.PointLight(0xff0000, 10, 50);
            lamp.add(pLight);
            lightHub.add(lamp);
        }

        mastGroup.add(lightHub);
        mastGroup.userData.isObstacle = true;
        scene.add(mastGroup);
        SectorGenerator.addObstacle(ctx, {
            mesh: mastGroup,
            collider: { type: 'sphere', radius: 8 }
        });
    },

    setupContent: async (ctx: SectorContext) => {
        const { triggers } = ctx;

        triggers.push(
            { id: 'found_esmeralda', position: LOCATIONS.TRIGGERS.FOUND_ESMERALDA, radius: 8, type: 'EVENT', content: '', triggered: false, actions: [{ type: 'START_CINEMATIC' }] },
            { id: 's3_forest_noise', position: LOCATIONS.TRIGGERS.FOREST_NOISE, radius: 8, type: 'SPEAK', content: "clues.s3_forest_noise", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 50 } }] },
            { id: 's3_poi_mast', position: LOCATIONS.TRIGGERS.POI_MAST, radius: 50, type: 'POI', content: "clues.s3_poi_the_mast", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 500 } }] },
            { id: 's3_poi_farm', position: LOCATIONS.POIS.FARM, radius: 20, type: 'POI', content: "clues.s3_dead_bodies", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 500 } }] },
            { id: 's3_tractor', position: { x: LOCATIONS.POIS.FARM.x + 10, z: LOCATIONS.POIS.FARM.z + 10 }, radius: 8, type: 'SPEAK', content: "clues.s3_tractor", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 50 } }] },
            { id: 's3_poi_farmhouse', position: LOCATIONS.POIS.FARMHOUSE, radius: 20, type: 'POI', content: "clues.s3_poi_burning_farm", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 500 } }] },
            { id: 's3_poi_barn', position: LOCATIONS.POIS.BARN, radius: 20, type: 'POI', content: "clues.s3_poi_the_farm", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 500 } }] }
        );

        if (ctx.debugMode) {
            SectorGenerator.visualizeTriggers(ctx);
        }
    },

    setupZombies: async (ctx: SectorContext) => {
        if (!ctx.spawnHorde) return;

        const hordeSpots = [
            new THREE.Vector3(40, 0, -30),
            new THREE.Vector3(150, 0, -120),
            new THREE.Vector3(180, 0, -130),
            new THREE.Vector3(-250, 0, -50),
            new THREE.Vector3(300, 0, -100)
        ];

        for (let i = 0; i < hordeSpots.length; i++) {
            const count = 5 + Math.floor(ctx.rng() * 5);
            ctx.spawnHorde(count, undefined, hordeSpots[i]);
        }
    },

    onUpdate: (delta, now, playerPos, gameState, sectorState, events) => { }
};