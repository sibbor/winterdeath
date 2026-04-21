import * as THREE from 'three';
import { SectorDef, SectorContext } from '../../game/session/SectorTypes';
import { SectorBuilder } from '../../core/world/SectorBuilder';
import { PathGenerator } from '../../core/world/generators/PathGenerator';
import { SoundID } from '../../utils/audio/AudioTypes';
import { VEGETATION_TYPE } from '../../content/environment';
import { NaturePropGenerator } from '../../core/world/generators/NaturePropGenerator';
import { CAMERA_HEIGHT } from '../constants';
import { EnemyType, EnemyDeathState } from '../../entities/enemies/EnemyTypes';
import { FamilyMemberID } from '../constants';
import { POI_TYPE } from '../../content/pois';
import { TriggerType, TriggerActionType, TriggerStatus } from '../../systems/TriggerTypes';
import { WeatherType } from '../../core/engine/EngineTypes';

const LOCATIONS = {
    SPAWN: {
        //PLAYER: { x: 0, z: 0 },
        PLAYER: { x: 145, z: -70 },
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
        FOREST_AMBIENT: { x: 20, z: -18 },
        POI_MAST: { x: 215, z: -25 },
        FOUND_ESMERALDA: { x: 215, z: -25 }
    },
    POIS: {
        FARM: { x: 150, z: -120 },
        EGG_FARM: { x: 275, z: -175 },
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
            new THREE.Vector3(245, 0, -75),
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

// Mast light
let mastLightHubRef: THREE.Object3D | null = null;

export const Sector2: SectorDef = {
    id: 2,
    name: "sectors.sector_2_name",
    environment: {
        bgColor: 0x051015,
        fog: {
            density: 200,
            color: 0x020208,
            height: 10
        },
        ambientIntensity: 0.3,
        ambientColor: 0x404050,
        groundColor: 0x112211,
        fov: 50,
        skyLight: { visible: true, color: 0x88ffaa, intensity: 5.0, position: { x: 50, y: 35, z: 50 } },
        cameraOffsetZ: 40,
        cameraHeight: CAMERA_HEIGHT,
        weather: {
            type: WeatherType.RAIN,
            particles: 3000
        },
        wind: {
            strengthMin: 0.5,
            strengthMax: 1.0,
            //direction: { x: 1, z: 1 },
            angleVariance: Math.PI / 4
        }
    },

    // Set to SNOW as requested for clear visual debugging
    groundType: 'SNOW',
    ambientLoop: SoundID.AMBIENT_CAVE,

    playerSpawn: LOCATIONS.SPAWN.PLAYER,
    bossSpawn: LOCATIONS.SPAWN.BOSS,

    collectibles: [
        { id: 's2_collectible_1', x: LOCATIONS.COLLECTIBLES.C1.x, z: LOCATIONS.COLLECTIBLES.C1.z },
        { id: 's2_collectible_2', x: LOCATIONS.COLLECTIBLES.C2.x, z: LOCATIONS.COLLECTIBLES.C2.z }
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
        fhGravel.position.set(LOCATIONS.POIS.EGG_FARM.x, 0.02, LOCATIONS.POIS.EGG_FARM.z);
        fhGravel.receiveShadow = true;
        scene.add(fhGravel);

        SectorBuilder.spawnChest(ctx, LOCATIONS.SPAWN.BOSS.x, LOCATIONS.SPAWN.BOSS.z, 'big');

        // --- 2. BUILDINGS & PROPS ---
        // POI - Farm
        SectorBuilder.spawnPoi(ctx, POI_TYPE.FARM, LOCATIONS.POIS.FARM.x, LOCATIONS.POIS.FARM.z, (3 * Math.PI) / 4);

        SectorBuilder.spawnDeadBody(ctx, LOCATIONS.POIS.FARM.x + 5, LOCATIONS.POIS.FARM.z + 5, EnemyType.WALKER, Math.random() * Math.PI);
        SectorBuilder.spawnDeadBody(ctx, LOCATIONS.POIS.FARM.x - 5, LOCATIONS.POIS.FARM.z + 10, EnemyType.RUNNER, Math.random() * Math.PI);
        SectorBuilder.spawnDeadBody(ctx, LOCATIONS.POIS.FARM.x + 10, LOCATIONS.POIS.FARM.z - 5, EnemyType.TANK, Math.random() * Math.PI);

        SectorBuilder.spawnDriveableVehicle(ctx, LOCATIONS.POIS.FARM.x - 20, LOCATIONS.POIS.FARM.z + 5, (3 * Math.PI) / 2, 'tractor');
        SectorBuilder.spawnHaybale(ctx, LOCATIONS.POIS.FARM.x + 15, LOCATIONS.POIS.FARM.z - 5, Math.random() * Math.PI, 1.2);
        SectorBuilder.spawnHaybale(ctx, LOCATIONS.POIS.FARM.x + 18, LOCATIONS.POIS.FARM.z - 2, Math.random() * Math.PI, 1.1);
        SectorBuilder.spawnHaybale(ctx, LOCATIONS.POIS.FARM.x + 4, LOCATIONS.POIS.FARM.z - 8, Math.random() * Math.PI, 1.0);

        // Timberpiles + timbertruck
        SectorBuilder.spawnTimberPile(ctx, LOCATIONS.POIS.FARM.x - 15, LOCATIONS.POIS.FARM.z + 10, Math.PI / 4, 1.2);
        SectorBuilder.spawnTimberPile(ctx, LOCATIONS.POIS.FARM.x - 12, LOCATIONS.POIS.FARM.z + 14, Math.PI / 3, 1.0);
        //SectorBuilder.spawnTimberPile(ctx, 122, -92, 0, 2.0);
        SectorBuilder.spawnDriveableVehicle(ctx, 136, -92, -Math.PI / 3, 'timber_truck', 0x334433);

        // POI - Egg farm
        SectorBuilder.spawnPoi(ctx, POI_TYPE.EGG_FARM, LOCATIONS.POIS.EGG_FARM.x, LOCATIONS.POIS.EGG_FARM.z, (3 * Math.PI) / 4);
        SectorBuilder.spawnPoi(ctx, POI_TYPE.BARN, LOCATIONS.POIS.BARN.x, LOCATIONS.POIS.BARN.z, (3 * Math.PI) / 4);

        // Abandoned House 1: North of Farmhouse (Birch Forest)
        const house1Coords = { x: 350, z: -130 };
        SectorBuilder.spawnBuilding(ctx, house1Coords.x, house1Coords.z, 12, 5, 12, Math.PI / 4, 0x445544, false);
        SectorBuilder.spawnDeadBody(ctx, house1Coords.x + 5, house1Coords.z + 5, 'HUMAN', Math.random() * Math.PI);

        // Abandoned House 2: South near boundary
        const house2Coords = { x: 310, z: -90 };
        SectorBuilder.spawnBuilding(ctx, house2Coords.x, house2Coords.z, 15, 6, 15, -Math.PI / 3, 0x333333, false);
        SectorBuilder.spawnDeadBody(ctx, house2Coords.x - 5, house2Coords.z - 5, 'HUMAN', Math.random() * Math.PI);

        // --- 3. SPLINE-BASED PROCEDURAL VEGETATION ---
        const trailPts = trailCurve.getSpacedPoints(80);
        const hagPts = hagCurve.getSpacedPoints(120);
        const farmPathPts = farmCurve.getSpacedPoints(60);

        // --- 4.3 Forest ---
        const forestOffset = 7;
        const forestDepth = 35;

        // Strict filters: x < 115 stops before crossroads. z > -75 prevents bleeding onto Haglaredsvägen (z:-83).
        const filterTrailNorth = (points: THREE.Vector3[]) => points.filter(p => p.x < 115 && p.z > -75);
        const sprucePolyNorth = [
            ...filterTrailNorth(PathGenerator.getOffsetPoints(trailPts, -forestOffset)),
            ...filterTrailNorth(PathGenerator.getOffsetPoints(trailPts, -(forestOffset + forestDepth))).reverse()
        ];
        sprucePolyNorth.forEach(p => p.y = 0);
        SectorBuilder.fillVegetation(ctx, [VEGETATION_TYPE.SPRUCE, VEGETATION_TYPE.PINE], sprucePolyNorth, 12);

        // Dead trees
        const filterTrailSouth = (points: THREE.Vector3[]) => points.filter(p => p.x < 115);
        const deadTreePoly = [
            ...filterTrailSouth(PathGenerator.getOffsetPoints(trailPts, forestOffset)),
            ...filterTrailSouth(PathGenerator.getOffsetPoints(trailPts, forestOffset + forestDepth)).reverse()
        ];
        deadTreePoly.forEach(p => p.y = 0);
        SectorBuilder.fillVegetation(ctx, [VEGETATION_TYPE.DEAD_TREE], deadTreePoly, 12);

        // --- 4.4 Wheat Fields ---
        const wheatOffset = 7;
        const wheatDepth = 35;

        const wheatField1 = [
            new THREE.Vector3(112, 0, -86),
            new THREE.Vector3(112, 0, -120),
            new THREE.Vector3(77, 0, -120),
            new THREE.Vector3(77, 0, -88),
        ]
        SectorBuilder.fillVegetation(ctx, VEGETATION_TYPE.WHEAT, wheatField1, 0.4);
        SectorBuilder.createScarecrow(ctx, 100, -100);

        const filterWheat2 = (points: THREE.Vector3[]) => points.filter(p => p.x > 170 && p.x < 240);
        const wheatPoly2 = [
            ...filterWheat2(PathGenerator.getOffsetPoints(hagPts, wheatOffset)),
            ...filterWheat2(PathGenerator.getOffsetPoints(hagPts, wheatOffset + wheatDepth)).reverse()
        ];
        wheatPoly2.forEach(p => p.y = 0);
        SectorBuilder.fillVegetation(ctx, VEGETATION_TYPE.WHEAT, wheatPoly2, 0.4);
        SectorBuilder.createScarecrow(ctx, 205, -135);

        // 4.7 Flowers (Nested dynamically between Farm Path and Haglaredsvägen)
        const filterFlowersFarm = (points: THREE.Vector3[]) => points.filter(p => p.x > 160 && p.x < 250);
        const filterFlowersHag = (points: THREE.Vector3[]) => points.filter(p => p.x > 160 && p.x < 250);

        const flowerPoly = [
            ...filterFlowersFarm(PathGenerator.getOffsetPoints(farmPathPts, 4)),       // Outer south boundary of farm path
            ...filterFlowersHag(PathGenerator.getOffsetPoints(hagPts, -4)).reverse()   // Inner north boundary of Haglaredsvägen
        ];
        flowerPoly.forEach(p => p.y = 0);
        SectorBuilder.fillVegetation(ctx, VEGETATION_TYPE.FLOWER, flowerPoly, 0.9);

        // 4.8 Sunflowers (Strictly SOUTH of Haglaredsvägen, East of Mast Road)
        const sunflowerPoly1 = [
            new THREE.Vector3(310, 0, -110),
            new THREE.Vector3(360, 0, -110),
            new THREE.Vector3(360, 0, -80),
            new THREE.Vector3(310, 0, -80)
        ];
        SectorBuilder.fillVegetation(ctx, VEGETATION_TYPE.SUNFLOWER, sunflowerPoly1, 0.4);

        const sunflowerPoly2 = [
            new THREE.Vector3(310, 0, -70),
            new THREE.Vector3(360, 0, -70),
            new THREE.Vector3(360, 0, -40),
            new THREE.Vector3(310, 0, -40)
        ];
        SectorBuilder.fillVegetation(ctx, VEGETATION_TYPE.SUNFLOWER, sunflowerPoly2, 0.4);

        // 4.4 Birch Forest (Wrapping North and East of House 1)
        const birchPolyL = [
            new THREE.Vector3(260, 0, -280),
            new THREE.Vector3(330, 0, -280),
            new THREE.Vector3(330, 0, -220),
            new THREE.Vector3(300, 0, -220),
            new THREE.Vector3(300, 0, -240),
            new THREE.Vector3(260, 0, -240)
        ];
        SectorBuilder.fillVegetation(ctx, VEGETATION_TYPE.BIRCH, birchPolyL, 15);

        // 4.5 Dead Trees (Wrapping House 2)
        const deadForestPoly = [
            new THREE.Vector3(270, 0, 60),
            new THREE.Vector3(340, 0, 60),
            new THREE.Vector3(340, 0, 110),
            new THREE.Vector3(270, 0, 110)
        ];
        SectorBuilder.fillVegetation(ctx, VEGETATION_TYPE.DEAD_TREE, deadForestPoly, 18);

        // --- 4. LAKE & GRASS ---
        const lakeCoords = { x: 255, z: -117 };
        const lake = SectorBuilder.addLake(ctx, lakeCoords.x, lakeCoords.z, 25, 7.0);

        const stone = NaturePropGenerator.createRock(25, 25, 15);
        stone.position.set(lakeCoords.x - 20, -2, lakeCoords.z + 10);
        scene.add(stone);

        SectorBuilder.addObstacle(ctx, {
            mesh: stone,
            position: stone.position,
            collider: { type: 'sphere', radius: 12.5 }
        });

        if (lake) lake.registerSplashSource(stone);

        const boatGroup = SectorBuilder.spawnFloatableVehicle(ctx, lakeCoords.x - 12.5, lakeCoords.z, Math.random() * Math.PI);
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
        SectorBuilder.fillVegetation(ctx, VEGETATION_TYPE.GRASS, sparseGrassPoly, 0.4);

        // --- 5. MOUNTAIN BOUNDARY ---
        SectorBuilder.createMountain(ctx, [
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

        SectorBuilder.createFence(ctx, [
            new THREE.Vector3(mastPos.x - 30, 0, mastPos.z + 30),
            new THREE.Vector3(mastPos.x - 30, 0, mastPos.z - 30),
            new THREE.Vector3(mastPos.x - 5, 0, mastPos.z - 30)
        ], 'black', 2.5);

        SectorBuilder.createFence(ctx, [
            new THREE.Vector3(mastPos.x + 5, 0, mastPos.z - 30),
            new THREE.Vector3(mastPos.x + 30, 0, mastPos.z - 30),
            new THREE.Vector3(mastPos.x + 30, 0, mastPos.z + 30),
            new THREE.Vector3(mastPos.x - 30, 0, mastPos.z + 30)
        ], 'black', 2.5);

        SectorBuilder.spawnBuilding(ctx, mastPos.x, mastPos.z, 15, 5, 12, Math.PI / 2, 0x555555, false);

        // The Mast
        const mastGroup = new THREE.Group();
        mastGroup.position.set(mastPos.x, 5, mastPos.z);

        const mast = SectorBuilder.spawnPoi(ctx, POI_TYPE.MAST, mastPos.x, mastPos.z, 0);
        mast.name = "POI_MAST";
        ctx.sectorState.mastLightHub = mast.getObjectByName("mastWarningLights") || null;

        // Esmeralda - Inside the building, not following yet
        SectorBuilder.spawnFamily(ctx, FamilyMemberID.ESMERALDA, LOCATIONS.SPAWN.FAMILY.x, LOCATIONS.SPAWN.FAMILY.z, Math.PI, { following: false, visible: false });
    },

    setupContent: async (ctx: SectorContext) => {
        if (ctx.isWarmup) return; // Triggers produce no GPU state — skip during preloader ghost-render
        // Triggers:
        SectorBuilder.addTriggers(ctx, [
            // ESMERALDA CINEMATIC TRIGGER — starts INACTIVE.
            // Activated by onUpdate once all mast-area zombies are cleared.
            {
                id: 's2_found_esmeralda',
                position: LOCATIONS.TRIGGERS.FOUND_ESMERALDA,
                familyId: FamilyMemberID.ESMERALDA,
                radius: 8,
                type: TriggerType.EVENT,
                content: '',
                statusFlags: TriggerStatus.ONCE, // Starts INACTIVE — activated after kill clear
                actions: [{ type: TriggerActionType.START_CINEMATIC, payload: { familyId: FamilyMemberID.ESMERALDA, sectorId: 2, scriptId: 0 } }]
            },
            // MAST ZONE — player entering this activates the zombie kill event
            {
                id: 's2_mast_zone_enter',
                position: LOCATIONS.TRIGGERS.POI_MAST,
                radius: 40,
                type: TriggerType.EVENT,
                content: '',
                statusFlags: TriggerStatus.ACTIVE | TriggerStatus.ONCE,
                actions: [] // Consumed in onUpdate via mastEventState
            },
            { id: 's2_forest_noise', position: LOCATIONS.TRIGGERS.FOREST_AMBIENT, radius: 8, type: TriggerType.SPEAK, content: "clues.2.0.reaction", statusFlags: TriggerStatus.ACTIVE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 50 } }] },
            {
                id: 's2_poi_mast',
                position: LOCATIONS.TRIGGERS.POI_MAST,
                radius: 50,
                type: TriggerType.POI,
                content: "pois.2.0.reaction",
                statusFlags: TriggerStatus.ACTIVE,
                actions: [
                    { type: TriggerActionType.GIVE_REWARD, payload: { xp: 500 } },
                    { type: TriggerActionType.START_CINEMATIC, payload: { sectorId: 2, scriptId: 1, customPath: 'mast_flyover' } }
                ]
            },
            { id: 's2_poi_farm', position: LOCATIONS.POIS.FARM, radius: 20, type: TriggerType.POI, content: "pois.2.1.reaction", statusFlags: TriggerStatus.ACTIVE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 500 } }] },
            { id: 's2_tractor', position: { x: LOCATIONS.POIS.FARM.x + 10, z: LOCATIONS.POIS.FARM.z + 10 }, radius: 8, type: TriggerType.SPEAK, content: "clues.2.2.reaction", statusFlags: TriggerStatus.ACTIVE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 50 } }] },
            { id: 's2_poi_egg_farm', position: LOCATIONS.POIS.EGG_FARM, radius: 20, type: TriggerType.POI, content: "pois.2.2.reaction", statusFlags: TriggerStatus.ACTIVE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 500 } }] },
            { id: 's2_poi_barn', position: LOCATIONS.POIS.BARN, radius: 20, type: TriggerType.POI, content: "pois.2.3.reaction", statusFlags: TriggerStatus.ACTIVE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 500 } }] }
        ]);
    },

    setupZombies: async (ctx: SectorContext) => {
        if (ctx.isWarmup || !ctx.spawnHorde) return; // No enemy spawning during preloader ghost-render

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

        // ~20 zombies pre-placed at the mast area for the Esmeralda kill-clear event.
        // Mixed types for variety: walkers, runners, and one tank.
        const mastPos = LOCATIONS.POIS.MAST;
        const mastZombieTypes = [
            EnemyType.WALKER, EnemyType.WALKER, EnemyType.WALKER, EnemyType.WALKER, EnemyType.WALKER,
            EnemyType.WALKER, EnemyType.WALKER, EnemyType.WALKER, EnemyType.WALKER, EnemyType.WALKER,
            EnemyType.RUNNER, EnemyType.RUNNER, EnemyType.RUNNER, EnemyType.RUNNER, EnemyType.RUNNER,
            EnemyType.RUNNER, EnemyType.RUNNER, EnemyType.RUNNER,
            EnemyType.TANK, EnemyType.TANK
        ];

        for (let i = 0; i < mastZombieTypes.length; i++) {
            // Spread across the fenced mast compound (~30x30 area), seeded for consistency
            const angle = (i / mastZombieTypes.length) * Math.PI * 2;
            const radius = 8 + ctx.rng() * 18;
            const offX = Math.cos(angle) * radius;
            const offZ = Math.sin(angle) * radius;
            const spawnPos = new THREE.Vector3(mastPos.x + offX, 0, mastPos.z + offZ);
            ctx.spawnHorde(1, mastZombieTypes[i], spawnPos);
        }
    },

    onUpdate: (delta, simTime, renderTime, playerPos, gameState, sectorState, events) => {
        // Rotating mast warning light (every frame, Zero-GC)
        if (sectorState.mastLightHub) {
            sectorState.mastLightHub.rotation.y += delta * 2.0;
        }

        // =====================================================================
        // MAST EVENT STATE MACHINE
        // State 0: idle (player hasn't entered the mast area)
        // State 1: mast_zone entered — watching for zombie clearance
        // State 2: zombies cleared — Esmeralda walks out of building
        // State 3: cinematic started (waiting for CinematicSystem to finish via dialogue triggers)
        // =====================================================================
        if (!sectorState.mastEventState) sectorState.mastEventState = 0;
        const mes = sectorState.mastEventState;
        const mesTimer = sectorState.mastEventTimer || 0;
        const mesElapsed = simTime - mesTimer;

        const mastX = LOCATIONS.POIS.MAST.x;
        const mastZ = LOCATIONS.POIS.MAST.z;
        const MAST_RADIUS_SQ = 40 * 40;

        const sceneHost = (events as any).scene || (gameState as any).scene;
        const scene = sceneHost as THREE.Scene;

        if (mes === 0) {
            // Check if mast_zone_enter trigger was consumed (pendingTrigger) OR player walked into zone
            const dx = playerPos.x - mastX;
            const dz = playerPos.z - mastZ;
            if (dx * dx + dz * dz < MAST_RADIUS_SQ) {
                sectorState.mastEventState = 1;
                sectorState.mastEventTimer = simTime;
                // Tell the player something is happening
                events.setNotification({ text: (events as any).t?.('clues.2.mast_enter') || 'Zombies inside the compound...', duration: 3500 });
            }
        }

        else if (mes === 1) {
            // Count living enemies within the mast radius each tick (throttled to ~5fps)
            if (mesElapsed > 200) {
                sectorState.mastEventTimer = simTime; // Reset for throttle

                const enemies = (gameState as any).enemies;
                let aliveInZone = 0;
                if (enemies) {
                    for (let i = 0; i < enemies.length; i++) {
                        const e = enemies[i];
                        if (e.deathState !== EnemyDeathState.ALIVE) continue;
                        const ex = e.mesh?.position.x ?? 0;
                        const ez = e.mesh?.position.z ?? 0;
                        const edx = ex - mastX;
                        const edz = ez - mastZ;
                        if (edx * edx + edz * edz < MAST_RADIUS_SQ) aliveInZone++;
                    }
                }

                if (aliveInZone === 0 && (simTime - (sectorState.mastZombiesSpawnedAt || 0) > 2000)) {
                    // All mast zombies dead — transition to Esmeralda exit
                    sectorState.mastEventState = 2;
                    sectorState.mastEventTimer = simTime;
                    events.setNotification({ text: (events as any).t?.('clues.2.mast_clear') || 'The area is clear...', duration: 3000 });
                }
                sectorState.mastZombiesSpawnedAt = sectorState.mastZombiesSpawnedAt || simTime; // Set once
            }
        }

        else if (mes === 2) {
            // Wait 1.5s, then walk Esmeralda out of the building toward the player
            if (mesElapsed > 1500 && scene) {
                const esmeralda = scene.children.find(
                    (c: any) => (c.userData.isFamilyMember || c.userData.type === 'family') && c.userData.name === 'Esmeralda'
                ) as any;

                if (esmeralda) {
                    if (!sectorState.esmeraldaWalkTarget) {
                        sectorState.esmeraldaWalkTarget = new THREE.Vector3(
                            mastX,
                            0,
                            mastZ + 20 // Walk out from the building toward the road
                        );
                    }

                    esmeralda.position.lerp(sectorState.esmeraldaWalkTarget, 0.04);

                    if (esmeralda.position.distanceTo(sectorState.esmeraldaWalkTarget) < 2.0) {
                        // Esmeralda has reached her mark — start the cinematic
                        sectorState.mastEventState = 3;
                        sectorState.mastEventTimer = simTime;

                        if (events.startCinematic) {
                            events.startCinematic(esmeralda, 2, 0); // Sector 2, Dialogue 0
                        }

                        // Activate the proximity trigger as a fallback (player walked in late)
                        const esmeraldaTrigger = (gameState as any).triggers?.find((t: any) => t.id === 's2_found_esmeralda');
                        if (esmeraldaTrigger) {
                            esmeraldaTrigger.statusFlags = TriggerStatus.ACTIVE | TriggerStatus.ONCE;
                            esmeraldaTrigger.triggered = false; // Maintain boolean compatibility
                        }
                    }
                } else {
                    // Esmeralda mesh not found — advance anyway after a timeout
                    if (mesElapsed > 5000) {
                        sectorState.mastEventState = 3;
                        sectorState.mastEventTimer = simTime;
                    }
                }
            }
        }
        // State 3: cinematic running — FAMILY_MEMBER_FOUND + SPAWN_BOSS handled by dialogue trigger array
    }
};