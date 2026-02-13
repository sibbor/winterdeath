import * as THREE from 'three';
import { SectorDef, SectorContext } from '../../types/sectors';
import { MATERIALS, GEOMETRY, createTextSprite, ModelFactory } from '../../utils/assets';
import { SectorBuilder } from '../../core/world/SectorGenerator';
import { PathGenerator } from '../../core/world/PathGenerator';
import { ObjectGenerator } from '../../core/world/ObjectGenerator';
import { EnvironmentGenerator } from '../../core/world/EnvironmentGenerator';
import { t } from '../../utils/i18n';
import { soundManager } from '../../utils/sound';
import { EnemyManager } from '../../core/EnemyManager';
import { BOSSES, FAMILY_MEMBERS, CAMERA_HEIGHT } from '../../content/constants';
import { SectorManager } from '../../core/SectorManager';

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
        POI_MAST: { x: 215, z: -250 },
        FOUND_ESMERALDA: { x: -215, z: -25 }
        /*s3_dead_bodies: "Poor bastards... Children, look away!",
        s3_tractor: "Nice tractor. Wonder if it's working?",

        s3_poi_burning_farm: "The farm is in flames. At least it's giving us some warmth in this ice-colde bister winter night.",
        s3_poi_the_farm: "The egg farm. This is the place where we used to get our eggs from.",
        s3_poi_the_mast:
        */
    },
    POIS: {
        SPAWN: { x: 0, z: 0, rot: Math.PI / 2 },
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
            new THREE.Vector3(280, 0, -62),
            new THREE.Vector3(270, 0, -61),
            new THREE.Vector3(271, 0, -113),
            new THREE.Vector3(215, 0, -25)
        ]
    }
} as const;

export const Sector3: SectorDef = {
    id: 2,
    name: "maps.sector_3_name",
    environment: {
        bgColor: 0x051015,
        fogDensity: 0.02,
        ambientIntensity: 0.3, // Increased for readability
        groundColor: 0x112211,
        fov: 50,
        moon: { visible: true, color: 0x88ffaa, intensity: 0.8, position: { x: 50, y: 35, z: 50 } }, // Slightly brighter moon
        cameraOffsetZ: 40,
        cameraHeight: CAMERA_HEIGHT,
        weather: 'rain'
    },

    // Automatic Content
    groundType: 'GRAVEL',
    ambientLoop: 'ambient_forest_loop',

    // --- SPAWN POINTS ---
    playerSpawn: LOCATIONS.SPAWN.PLAYER,
    familySpawn: LOCATIONS.SPAWN.FAMILY,
    bossSpawn: LOCATIONS.SPAWN.BOSS,

    // Auto-Spawn Collectibles
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

        PathGenerator.createDirtPath(ctx, [...LOCATIONS.PATHS.FOREST_TRAIL], 3);
        PathGenerator.createGravelRoad(ctx, [...LOCATIONS.PATHS.HAGLAREDSVAGEN], 6);
        PathGenerator.createGravelRoad(ctx, [...LOCATIONS.PATHS.ROAD_TO_MAST], 6);

        // Reward Chest at boss spawn
        SectorBuilder.spawnChest(ctx, LOCATIONS.SPAWN.BOSS.x, LOCATIONS.SPAWN.BOSS.z, 'big');

        // 1. Burning Farm
        const farm = SectorBuilder.spawnBuilding(ctx, LOCATIONS.POIS.FARM.x, LOCATIONS.POIS.FARM.z, 25, 8, 20, (3 * Math.PI) / 4, 0x7c2e2e);
        SectorBuilder.setOnFire(ctx, farm, { smoke: true, intensity: 20, distance: 40, onRoof: true });

        // 1.1. Farm House area props and bodies
        SectorBuilder.spawnDeadBody(ctx, LOCATIONS.POIS.FARMHOUSE.x + 5, LOCATIONS.POIS.FARMHOUSE.z + 5, 'WALKER', Math.random() * Math.PI);
        SectorBuilder.spawnDeadBody(ctx, LOCATIONS.POIS.FARMHOUSE.x - 5, LOCATIONS.POIS.FARMHOUSE.z + 10, 'RUNNER', Math.random() * Math.PI);
        SectorBuilder.spawnDeadBody(ctx, LOCATIONS.POIS.FARM.x + 10, LOCATIONS.POIS.FARM.z - 5, 'TANK', Math.random() * Math.PI);

        // 1.2. Farm House area props
        SectorBuilder.spawnVehicle(ctx, LOCATIONS.POIS.FARM.x - 10, LOCATIONS.POIS.FARM.z + 5, (3 * Math.PI) / 4, 'tractor');
        SectorBuilder.spawnHaybale(ctx, LOCATIONS.POIS.FARM.x + 5, LOCATIONS.POIS.FARM.z - 5, Math.random() * Math.PI, 1.2);
        SectorBuilder.spawnHaybale(ctx, LOCATIONS.POIS.FARM.x + 8, LOCATIONS.POIS.FARM.z - 2, Math.random() * Math.PI, 1.1);
        SectorBuilder.spawnHaybale(ctx, LOCATIONS.POIS.FARM.x + 4, LOCATIONS.POIS.FARM.z - 8, Math.random() * Math.PI, 1.0);

        SectorBuilder.spawnTimberPile(ctx, LOCATIONS.POIS.FARMHOUSE.x - 15, LOCATIONS.POIS.FARMHOUSE.z + 10, Math.PI / 4, 1.2);
        SectorBuilder.spawnTimberPile(ctx, LOCATIONS.POIS.FARMHOUSE.x - 12, LOCATIONS.POIS.FARMHOUSE.z + 14, Math.PI / 3, 1.0);

        // 1.3 Timber truck on the road near the farm
        SectorBuilder.spawnTimberPile(ctx, 122, -92, 0, 2.0);
        SectorBuilder.spawnVehicle(ctx, 136, -92, -Math.PI / 3, 'timber_truck', 0x334433);

        // Crashed car with headlights near the farm entrance
        SectorBuilder.spawnCrashedCar(ctx, 160, -85, -Math.PI / 4, 0xcc2222);

        // 2. Burning Farm
        const farmHouse = SectorBuilder.spawnBuilding(ctx, LOCATIONS.POIS.FARMHOUSE.x, LOCATIONS.POIS.FARMHOUSE.z, 25, 8, 20, (3 * Math.PI) / 4, 0x7c2e2e, true, true);
        SectorBuilder.setOnFire(ctx, farmHouse, { smoke: true, intensity: 150, distance: 40, onRoof: true });

        // 3. Barn
        const barn = SectorBuilder.spawnBuilding(ctx, LOCATIONS.POIS.BARN.x, LOCATIONS.POIS.BARN.z, 25, 8, 20, (3 * Math.PI) / 4, 0x7c2e2e, true, true);
        SectorBuilder.setOnFire(ctx, barn, { smoke: true, intensity: 150, distance: 40, onRoof: true });

        // --- 4. Wheat Field ---
        const fieldPoly = [
            new THREE.Vector3(100, 0, -80),
            new THREE.Vector3(250, 0, -80),
            new THREE.Vector3(250, 0, -180),
            new THREE.Vector3(100, 0, -180)
        ];
        await SectorBuilder.fillWheatField(ctx, fieldPoly, 0.4);

        // --- 5. Forest ---
        const clearingPoly = [
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(80, 0, 0),
            new THREE.Vector3(80, 0, -80),
            new THREE.Vector3(0, 0, -80)
        ];
        await SectorBuilder.createForest(ctx, clearingPoly, 12, ['spruce', 'pine', 'birch']);

        // --- 6. The Mast ---
        const mastPos = LOCATIONS.POIS.MAST;

        // Asfalt-platta under masten
        const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x222222 }));
        asphalt.rotation.x = -Math.PI / 2;
        asphalt.position.set(mastPos.x, 0.05, mastPos.z);
        asphalt.receiveShadow = true;
        scene.add(asphalt);

        // Stängsel runt området
        SectorBuilder.createFence(ctx, [
            new THREE.Vector3(mastPos.x - 30, 0, mastPos.z + 30),
            new THREE.Vector3(mastPos.x - 30, 0, mastPos.z - 30),
            new THREE.Vector3(mastPos.x + 30, 0, mastPos.z - 30),
            new THREE.Vector3(mastPos.x + 30, 0, mastPos.z + 30),
            new THREE.Vector3(mastPos.x - 30, 0, mastPos.z + 30)
        ], 'black', 2.5);

        // Kontrollrummet (Byggnaden under masten)
        const controlRoom = SectorBuilder.spawnBuilding(ctx, mastPos.x, mastPos.z, 15, 5, 12, Math.PI / 2, 0x555555, false);

        // Masten (Sammanslagen geometri)
        const mastGroup = new THREE.Group();
        mastGroup.position.set(mastPos.x, 5, mastPos.z);

        const mastBase = new THREE.Mesh(new THREE.BoxGeometry(10, 2, 10), MATERIALS.concrete);
        mastBase.position.y = 1;
        mastGroup.add(mastBase);

        const mastMesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 6, 60, 4), MATERIALS.mast);
        mastMesh.position.y = 30;
        mastGroup.add(mastMesh);

        // Roterande Hub för varningsljus
        const lightHub = new THREE.Group();
        lightHub.name = "mastWarningLights";
        lightHub.position.y = 60;

        [2, -2].forEach(posX => {
            const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.4), new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000 }));
            lamp.position.x = posX;
            const pLight = new THREE.PointLight(0xff0000, 10, 50);
            lamp.add(pLight);
            lightHub.add(lamp);
        });

        mastGroup.add(lightHub);
        mastGroup.userData.isObstacle = true;
        scene.add(mastGroup);
        SectorBuilder.addObstacle(ctx, {
            mesh: mastGroup,
            collider: { type: 'sphere', radius: 8 } // Simple radial collider for the mast base area
        });

        // ===== DENSE FOREST VEGETATION =====
        const meadow = [new THREE.Vector3(-50, 0, -50), new THREE.Vector3(50, 0, -50), new THREE.Vector3(50, 0, 50), new THREE.Vector3(-50, 0, 50)];
        await EnvironmentGenerator.fillAreaWithGrass(ctx, meadow, 2.8);
        const flowers = [new THREE.Vector3(-30, 0, 180), new THREE.Vector3(0, 0, 180), new THREE.Vector3(0, 0, 210), new THREE.Vector3(-30, 0, 210)];
        await EnvironmentGenerator.fillAreaWithFlowers(ctx, flowers, 0.9);
        // ===== END =====
    },

    setupContent: async (ctx: SectorContext) => {
        const { triggers } = ctx;

        triggers.push(
            { id: 'found_esmeralda', position: LOCATIONS.TRIGGERS.FOUND_ESMERALDA, radius: 8, type: 'EVENT', content: '', triggered: false, actions: [{ type: 'START_CINEMATIC' }] },
            { id: 's3_forest_noise', position: LOCATIONS.TRIGGERS.FOREST_NOISE, radius: 8, type: 'SPEECH', content: "clues.s3_forest_noise", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 50 } }] },
            { id: 's3_mast_sight', position: LOCATIONS.TRIGGERS.POI_MAST, radius: 50, type: 'SPEECH', content: "clues.s3_poi_the_mast", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 50 } }] },
            { id: 's3_dead_bodies', position: LOCATIONS.POIS.FARM, radius: 8, type: 'SPEECH', content: "clues.s3_dead_bodies", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 50 } }] },
            { id: 's3_tractor', position: { x: LOCATIONS.POIS.FARM.x + 10, z: LOCATIONS.POIS.FARM.z + 10 }, radius: 8, type: 'SPEECH', content: "clues.s3_tractor", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 50 } }] },
            { id: 's3_poi_burning_farm', position: LOCATIONS.POIS.FARMHOUSE, radius: 20, type: 'SPEECH', content: "clues.s3_poi_burning_farm", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 50 } }] },
            { id: 's3_poi_the_farm', position: LOCATIONS.POIS.BARN, radius: 20, type: 'SPEECH', content: "clues.s3_poi_the_farm", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 50 } }] },
        );

        if (ctx.debugMode) {
            SectorBuilder.visualizeTriggers(ctx);
        }
    },

    setupZombies: async (ctx: SectorContext) => {
        if (!ctx.spawnHorde) return;

        // Defined Horde Locations (Farm / Mast)
        const hordeSpots = [
            new THREE.Vector3(40, 0, -30),   // Forest Trail
            new THREE.Vector3(150, 0, -120), // Farm
            new THREE.Vector3(180, 0, -130), // Wheat Field
            new THREE.Vector3(-250, 0, -50), // Mast Area
            new THREE.Vector3(300, 0, -100)  // Road
        ];

        hordeSpots.forEach((pos, i) => {
            const count = 5 + Math.floor(ctx.rng() * 5);
            ctx.spawnHorde(count, undefined, pos);
        });
    },

    onUpdate: (delta, now, playerPos, gameState, sectorState, events) => {
        // Roterande varningsljus i masten (Söker efter unikt namn i scenen)
        /*
        ctx.scene.traverse((obj) => {
            if (obj.name === "mastWarningLights") {
                obj.rotation.y += delta * 2.0;
            }
        });
        */
    }
};