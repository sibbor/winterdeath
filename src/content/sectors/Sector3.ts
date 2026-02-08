import * as THREE from 'three';
import { SectorDef, SectorContext } from '../../types/sectors';
import { MATERIALS, GEOMETRY, createTextSprite, ModelFactory } from '../../utils/assets';
import { SectorBuilder } from '../../core/world/SectorGenerator';
import { PathGenerator } from '../../core/world/PathGenerator';
import { ObjectGenerator } from '../../core/world/ObjectGenerator';
import { t } from '../../utils/i18n';
import { soundManager } from '../../utils/sound';
import { EnemyManager } from '../../core/EnemyManager';
import { BOSSES, FAMILY_MEMBERS, CAMERA_HEIGHT } from '../../content/constants';
import { SectorManager } from '../../core/SectorManager';

const LOCATIONS = {
    SPAWN: {
        PLAYER: { x: 0, z: 0 },
        FAMILY: { x: -200, z: -10, y: 0 },
        BOSS: { x: -220, z: -10 }
    },
    CINEMATIC: {
        OFFSET: { x: 15, y: 15, z: -10 },
        LOOK_AT: { x: 0, y: 2, z: 0 }
    },
    COLLECTIBLES: {
        C1: { x: 230, z: -130 },
        C2: { x: 200, z: -100 }
    },
    TRIGGERS: {
        FOREST_NOISE: { x: 16, z: -4 },
        MAST_SIGHT: { x: -450, z: -80 },
        FOUND_ESMERALDA: { x: -200, z: -10 }
    },
    POIS: {
        SPAWN: { x: 0, z: 0, rot: Math.PI / 2 },
        FARM: { x: 150, z: -120 },
        FARMHOUSE: { x: 275, z: -175 },
        MAST: { x: -250, z: -50 },
    },
    PATHS: {
        FOREST_TRAIL: [
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(40, 0, -30),
            new THREE.Vector3(80, 0, -10),
            new THREE.Vector3(120, 0, -50)
        ],
        HAGLAREDSVAGEN: [
            new THREE.Vector3(120, 0, -50),
            new THREE.Vector3(180, 0, -120),
            new THREE.Vector3(250, 0, -150),
            new THREE.Vector3(320, 0, -120),
            new THREE.Vector3(400, 0, -80)
        ],
        ROAD_TO_MAST: [
            new THREE.Vector3(120, 0, -50),
            new THREE.Vector3(180, 0, -120),
            new THREE.Vector3(250, 0, -150),
            new THREE.Vector3(320, 0, -120),
            new THREE.Vector3(400, 0, -80)
        ]
    }
} as const;

export const Sector3: SectorDef = {
    id: 2,
    name: "maps.mast_name",
    environment: {
        bgColor: 0x051015,
        fogDensity: 0.02,
        ambientIntensity: 0.5,
        groundColor: 0x112211,
        fov: 50,
        moon: { visible: true, color: 0x88ffaa, intensity: 0.4 },
        cameraOffsetZ: 40,
        cameraHeight: CAMERA_HEIGHT,
        weather: 'rain'
    },

    // Automatic Content
    groundType: 'GRAVEL',
    bounds: { width: 500, depth: 800 },
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

    generate: async (ctx: SectorContext) => {
        const { scene, obstacles, triggers } = ctx;
        (ctx as any).sectorState.ctx = ctx;

        PathGenerator.createDirtPath(ctx, [...LOCATIONS.PATHS.FOREST_TRAIL], 3);
        PathGenerator.createGravelRoad(ctx, [...LOCATIONS.PATHS.HAGLAREDSVAGEN], 6);
        PathGenerator.createGravelRoad(ctx, [...LOCATIONS.PATHS.ROAD_TO_MAST], 6);

        if (ctx.yield) await ctx.yield();

        // 2. Burning Farm
        const farm = SectorBuilder.spawnBuilding(ctx, LOCATIONS.POIS.FARM.x, LOCATIONS.POIS.FARM.z, 25, 8, 20, (3 * Math.PI) / 4, 0x7c2e2e);
        SectorBuilder.setOnFire(ctx, farm, { smoke: true, intensity: 20, distance: 40, onRoof: true });

        // 3. Farm House area props and bodies
        SectorBuilder.spawnDeadBody(ctx, LOCATIONS.POIS.FARMHOUSE.x + 5, LOCATIONS.POIS.FARMHOUSE.z + 5, 'WALKER', Math.random() * Math.PI);
        SectorBuilder.spawnDeadBody(ctx, LOCATIONS.POIS.FARMHOUSE.x - 5, LOCATIONS.POIS.FARMHOUSE.z + 10, 'RUNNER', Math.random() * Math.PI);
        SectorBuilder.spawnDeadBody(ctx, LOCATIONS.POIS.FARM.x + 10, LOCATIONS.POIS.FARM.z - 5, 'WALKER', Math.random() * Math.PI);

        if (ctx.yield) await ctx.yield();

        // 3. Farm House area props
        SectorBuilder.spawnVehicle(ctx, LOCATIONS.POIS.FARM.x - 10, LOCATIONS.POIS.FARM.z + 5, (3 * Math.PI) / 4, 'tractor');
        SectorBuilder.spawnHaybale(ctx, LOCATIONS.POIS.FARM.x + 5, LOCATIONS.POIS.FARM.z - 5, Math.random() * Math.PI, 1.2);
        SectorBuilder.spawnHaybale(ctx, LOCATIONS.POIS.FARM.x + 8, LOCATIONS.POIS.FARM.z - 2, Math.random() * Math.PI, 1.1);
        SectorBuilder.spawnHaybale(ctx, LOCATIONS.POIS.FARM.x + 4, LOCATIONS.POIS.FARM.z - 8, Math.random() * Math.PI, 1.0);

        SectorBuilder.spawnTimberPile(ctx, LOCATIONS.POIS.FARMHOUSE.x - 15, LOCATIONS.POIS.FARMHOUSE.z + 10, Math.PI / 4, 1.2);
        SectorBuilder.spawnTimberPile(ctx, LOCATIONS.POIS.FARMHOUSE.x - 12, LOCATIONS.POIS.FARMHOUSE.z + 14, Math.PI / 3, 1.0);

        // Timber truck on the road near the farm
        SectorBuilder.spawnVehicle(ctx, 160, -90, -Math.PI / 6, 'timber_truck', 0x334433);

        if (ctx.yield) await ctx.yield();

        // --- 4. Wheat Field ---
        const fieldPoly = [
            new THREE.Vector3(100, 0, -80),
            new THREE.Vector3(250, 0, -80),
            new THREE.Vector3(250, 0, -180),
            new THREE.Vector3(100, 0, -180)
        ];
        await SectorBuilder.fillWheatField(ctx, fieldPoly, 0.4);

        if (ctx.yield) await ctx.yield();

        // --- 5. Forest Clearing ---
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
        controlRoom.userData.isObstacle = true;

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

        // --- 5. TRIGGERS ---
        triggers.push(
            { id: 'found_esmeralda', position: LOCATIONS.TRIGGERS.FOUND_ESMERALDA, radius: 8, type: 'EVENT', content: '', triggered: false, actions: [{ type: 'START_CINEMATIC' }] },

            // Clues
            { id: 's3_forest_noise', position: LOCATIONS.TRIGGERS.FOREST_NOISE, radius: 8, type: 'THOUGHTS', content: "clues.s3_forest_noise", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 50 } }] },
            { id: 's3_mast_sight', position: LOCATIONS.TRIGGERS.MAST_SIGHT, radius: 8, type: 'THOUGHTS', content: "clues.s3_mast_sight", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 50 } }] }
        );

        // --- 6. COLLECTIBLES (Auto-Spawned) ---
        if (ctx.debugMode) {
            SectorBuilder.visualizeTriggers(ctx);
        }

        spawnSectorHordes(ctx);
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

function spawnSectorHordes(ctx: SectorContext) {
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
}