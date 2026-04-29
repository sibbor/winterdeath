import * as THREE from 'three';
import { NoiseType } from '../../entities/enemies/EnemyTypes';
import { SectorDef, SectorContext } from '../../game/session/SectorTypes';
import { SoundID } from '../../utils/audio/AudioTypes';
import { MATERIALS, GEOMETRY } from '../../utils/assets';
import { SectorBuilder } from '../../core/world/SectorBuilder';
import { InteractionType } from '../../systems/InteractionTypes';
import { PathGenerator } from '../../core/world/generators/PathGenerator';
import { ObjectGenerator } from '../../core/world/generators/ObjectGenerator';
import { VehicleGenerator } from '../../core/world/generators/VehicleGenerator';
import { GeneratorUtils } from '../../core/world/generators/GeneratorUtils';
import { CAMERA_HEIGHT } from '../constants';
import { EnemyType } from '../../entities/enemies/EnemyTypes';
import { FamilyMemberID } from '../constants';
import { MaterialType, VEGETATION_TYPE } from '../../content/environment';
import { WeatherType } from '../../core/engine/EngineTypes';
import { POI_TYPE } from '../../content/pois';
import { TriggerType, TriggerActionType, TriggerStatus } from '../../systems/TriggerTypes';

const LOCATIONS = {
    SPAWN: {
        PLAYER: { x: -21, z: 15, rot: Math.PI / 1.25 },
        //DONT'REMOVE:PLAYER: { x: 138, z: 313, rot: Math.PI / 1.25 },
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
        BUS: { x: 138, z: 329, y: 2 },
        TUNNEL: { x: 138, z: 344 }
    },
    OVERPASS: [
        new THREE.Vector3(264, 5, 345),
        new THREE.Vector3(135, 5, 345),
        new THREE.Vector3(84, 5, 350),
        new THREE.Vector3(20, 5, 364)
    ]
} as const;
const EXPLODING_BUS_ID = 'tunnel_bus';
const EXPLODING_BUS_POS = LOCATIONS.TRIGGERS.BUS;

const _v1 = new THREE.Vector3();

// Zero-GC Pre-allocated Vectors for the Update Loop
const _trainYardPos = new THREE.Vector3(LOCATIONS.POIS.TRAIN_YARD.x, 0, LOCATIONS.POIS.TRAIN_YARD.z);
const _viewPos = new THREE.Vector3();
const _camOverrideTarget = new THREE.Vector3();
const _camOverrideLookAt = new THREE.Vector3();

// Zero-GC for the bus event
const _busOriginalPos = new THREE.Vector3();
const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _rotation = new THREE.Euler();
const _quat = new THREE.Quaternion();

// Offsets for Camera Panning Sequences
const _offsetTrainYard = new THREE.Vector3(0, 10, 22);
const _zoomOffsetTarget = new THREE.Vector3(22, 10, 0);
const _zoomOffsetLook = new THREE.Vector3(0, 2, 0);

/**
 * VINTERDÖD: Unified Bus Explosion Handler
 * Reuses the optimized physics and FX logic from Sector 4.
 */
function explodeBus(dt: number, renderTime: number, gameState: any, sectorState: any, events: any) {
    if (!sectorState.busExplosionHandled) {
        sectorState.busExplosionHandled = true;
        sectorState.busExplosionTime = renderTime;

        if (events.playSound) events.playSound(SoundID.EXPLOSION);
        if (events.cameraShake) events.cameraShake(5);

        _busOriginalPos.set(EXPLODING_BUS_POS.x, EXPLODING_BUS_POS.y, EXPLODING_BUS_POS.z);

        if (events.spawnParticle) {
            // Use new scale parameter for massive cinematic explosion
            events.spawnParticle(_busOriginalPos.x, 2, _busOriginalPos.z, 'shockwave', 1, 2.5);
            events.spawnParticle(_busOriginalPos.x, 2, _busOriginalPos.z, 'large_smoke', 8, 2.0);
        }

        // Make noise to attract enemies
        if (events.makeNoise) {
            events.makeNoise(_busOriginalPos.clone(), NoiseType.OTHER, 100);
        }

        // Clear bus
        const _busObj = (sectorState.ctx as any).busObject as THREE.Object3D | null;
        if (_busObj) {
            _busObj.position.set(0, -1000, 0);
        }

        const _obsArray = sectorState.ctx.obstacles;
        if (_obsArray) {
            for (let i = 0; i < _obsArray.length; i++) {
                const o = _obsArray[i];
                if (o && o.id === EXPLODING_BUS_ID) {
                    o.collider.size?.set(0, 0, 0);
                    if (o.position) o.position.set(99999, -1000, 99999);
                    if (o.mesh) {
                        o.mesh.position.set(99999, -1000, 99999);
                    }
                    _obsArray.splice(i, 1);
                    break;
                }
            }
        }

        // Activate Rubble
        const rMesh = (sectorState.ctx as any).busRubble;
        if (rMesh) {
            sectorState.busRubble = rMesh;
            rMesh.position.set(0, 0, 0); // [VINTERDÖD FIX] Snap to origin so absolute instance coordinates work
            rMesh.visible = true;
            rMesh.userData.active = true;
            if (rMesh.userData.hasLanded) rMesh.userData.hasLanded.fill(0);

            const data = rMesh.userData;
            for (let i = 0; i < rMesh.count; i++) {
                const ix = i * 3;
                const arcAngle = Math.random() * Math.PI * 2;
                const power = 1.5 + Math.random();
                const dirX = Math.cos(arcAngle) * power;
                const dirZ = Math.sin(arcAngle) * power;
                const dirY = 3.0 + Math.random() * 4.0; // More vertical burst
                const speed = 15 + Math.random() * 25;

                _v1.set(dirX, dirY, dirZ).normalize().multiplyScalar(speed);
                data.velocities[ix] = _v1.x;
                data.velocities[ix + 1] = _v1.y;
                data.velocities[ix + 2] = _v1.z;

                // [VINTERDÖD FIX] Use absolute world-space start coordinates
                data.positions[ix] = EXPLODING_BUS_POS.x + (Math.random() - 0.5) * 8;
                data.positions[ix + 1] = EXPLODING_BUS_POS.y + 1 + Math.random() * 2;
                data.positions[ix + 2] = EXPLODING_BUS_POS.z + (Math.random() - 0.5) * 8;

                if (!data.spin) data.spin = new Float32Array(rMesh.count * 3);
                if (!data.rotations) data.rotations = new Float32Array(rMesh.count * 3);

                data.spin[ix] = (Math.random() - 0.5) * 20;
                data.spin[ix + 1] = (Math.random() - 0.5) * 20;
                data.spin[ix + 2] = (Math.random() - 0.5) * 20;
            }

            // Activate Tires
            const tires = (sectorState.ctx as any).busTires;
            if (tires) {
                sectorState.busTires = tires;
                tires.position.set(0, 0, 0); // [VINTERDÖD FIX] Snap to origin
                tires.visible = true;
                tires.userData.active = true;
                const tData = tires.userData;
                tData.hasLanded.fill(0);
                for (let i = 0; i < 4; i++) {
                    const ix = i * 3;
                    tData.positions[ix] = EXPLODING_BUS_POS.x + (Math.random() - 0.5) * 4;
                    tData.positions[ix + 1] = EXPLODING_BUS_POS.y + 2;
                    tData.positions[ix + 2] = EXPLODING_BUS_POS.z + (Math.random() - 0.5) * 4;

                    const angle = Math.random() * Math.PI * 2;
                    const tSpeed = 20 + Math.random() * 15;
                    tData.velocities[ix] = Math.cos(angle) * tSpeed * 0.5;
                    tData.velocities[ix + 1] = 18 + Math.random() * 12;
                    tData.velocities[ix + 2] = Math.sin(angle) * tSpeed * 0.5;

                    tData.spin[ix] = (Math.random() - 0.5) * 30;
                    tData.spin[ix + 1] = (Math.random() - 0.5) * 30;
                    tData.spin[ix + 2] = (Math.random() - 0.5) * 30;
                }
            }
        }
    }

    // --- RUBBLE & TIRE PHYSICS ---
    const activeMeshes = [];
    if (sectorState.busRubble && sectorState.busRubble.userData.active) activeMeshes.push(sectorState.busRubble);
    if (sectorState.busTires && sectorState.busTires.userData.active) activeMeshes.push(sectorState.busTires);

    for (const rubble of activeMeshes) {
        const isTire = rubble === sectorState.busTires;
        const rubbleWeight = isTire ? 35.0 : 18.0;
        const bouncy = isTire ? 0.7 : 0.4;
        const data = rubble.userData;
        let stillMoving = false;
        const elapsed = renderTime - (sectorState.busExplosionTime || 0);

        for (let i = 0; i < rubble.count; i++) {
            const ix = i * 3;

            // [VINTERDÖD FIX] Dynamic ground height lookup
            const groundY = (gameState.collisionGrid && gameState.collisionGrid.getGroundHeight)
                ? gameState.collisionGrid.getGroundHeight(data.positions[ix], data.positions[ix + 2])
                : 0.1;
            const minHeight = groundY + (isTire ? 0.8 : 0.2);

            const isAboveGround = data.positions[ix + 1] > minHeight;
            const hasVelY = Math.abs(data.velocities[ix + 1]) > 0.1;
            const hasVelX = Math.abs(data.velocities[ix]) > 0.1;
            const hasVelZ = Math.abs(data.velocities[ix + 2]) > 0.1;

            if (isAboveGround || hasVelY || hasVelX || hasVelZ) {
                stillMoving = true;
                const safeDelta = Math.min(dt, 0.05);

                data.velocities[ix + 1] -= rubbleWeight * safeDelta;
                data.positions[ix] += data.velocities[ix] * safeDelta;
                data.positions[ix + 1] += data.velocities[ix + 1] * safeDelta;
                data.positions[ix + 2] += data.velocities[ix + 2] * safeDelta;

                if (data.positions[ix + 1] <= minHeight) {
                    data.positions[ix + 1] = minHeight;
                    data.velocities[ix] *= 0.6;
                    data.velocities[ix + 2] *= 0.6;
                    data.velocities[ix + 1] *= -bouncy;

                    if (data.spin) {
                        data.spin[ix] *= 0.6;
                        data.spin[ix + 1] *= 0.6;
                        data.spin[ix + 2] *= 0.6;
                    }

                    if (Math.abs(data.velocities[ix + 1]) < 1.0) data.velocities[ix + 1] = 0;
                    if (Math.abs(data.velocities[ix]) < 0.2) data.velocities[ix] = 0;
                    if (Math.abs(data.velocities[ix + 2]) < 0.2) data.velocities[ix + 2] = 0;

                    if (data.hasLanded && !data.hasLanded[i] && events.playSound) {
                        if (!isTire || Math.abs(data.velocities[ix + 1]) > 2) {
                            events.playSound(isTire ? SoundID.IMPACT_METAL : SoundID.IMPACT_METAL);
                        }
                        if (Math.abs(data.velocities[ix + 1]) < 2) data.hasLanded[i] = 1;
                    }
                }

                if (data.rotations && data.spin) {
                    data.rotations[ix] += data.spin[ix] * safeDelta;
                    data.rotations[ix + 1] += data.spin[ix + 1] * safeDelta;
                    data.rotations[ix + 2] += data.spin[ix + 2] * safeDelta;
                }

                _position.set(data.positions[ix], data.positions[ix + 1], data.positions[ix + 2]);
                if (data.rotations) {
                    _rotation.set(data.rotations[ix], data.rotations[ix + 1], data.rotations[ix + 2]);
                    _quat.setFromEuler(_rotation);
                } else {
                    _quat.set(0, 0, 0, 1);
                }

                if (isTire) {
                    _scale.set(1, 1, 1);
                } else {
                    const s = data.scales ? data.scales[i] : 1.0;
                    // [VINTERDÖD OPT] Varied bus-like shapes: Panels, Beams, Scrap
                    const type = i % 3;
                    if (type === 0) _scale.set(4.0 * s, 0.4 * s, 6.0 * s); // Huge Panels
                    else if (type === 1) _scale.set(1.5 * s, 0.5 * s, 10.0 * s); // Long Beams
                    else _scale.set(1.5 * s, 1.5 * s, 1.5 * s); // Scrap
                }

                _matrix.compose(_position, _quat, _scale);
                rubble.setMatrixAt(i, _matrix);
            }
        }
        rubble.instanceMatrix.needsUpdate = true;
        if (!stillMoving || elapsed > 15000) {
            data.active = false;
        }
    }
}

export const Sector0: SectorDef = {
    id: 0,
    name: "sectors.sector_0_name",
    environment: {
        bgColor: 0x020208,
        ambientIntensity: 0.4,
        ambientColor: 0x404050,
        groundColor: 0xddddff,
        fov: 50,
        skyLight: { visible: true, color: 0x6688ff, intensity: 10.0, position: { x: 50, y: 35, z: 50 } },
        cameraOffsetZ: 40,
        cameraHeight: CAMERA_HEIGHT,
        wind: {
            strengthMin: 0.5,
            strengthMax: 1.0,
            direction: { x: 1, z: 1 },
            angleVariance: Math.PI / 4
        },
        fog: {
            density: 200,
            color: 0x020208,
            height: 10
        },
        weather: {
            type: WeatherType.SNOW,
            particles: 2000
        },
    },
    groundType: 'SNOW',
    ambientLoop: SoundID.AMBIENT_WIND,

    playerSpawn: LOCATIONS.SPAWN.PLAYER,
    familySpawn: LOCATIONS.SPAWN.FAMILY,
    bossSpawn: LOCATIONS.SPAWN.BOSS,

    collectibles: [
        { id: 's0_collectible_1', x: LOCATIONS.COLLECTIBLES.C1.x, z: LOCATIONS.COLLECTIBLES.C1.z },
        { id: 's0_collectible_2', x: LOCATIONS.COLLECTIBLES.C2.x, z: LOCATIONS.COLLECTIBLES.C2.z }
    ],

    cinematic: {
        offset: LOCATIONS.CINEMATIC.OFFSET,
        lookAtOffset: LOCATIONS.CINEMATIC.LOOK_AT,
    },

    setupProps: (ctx: SectorContext) => {
        const { scene, obstacles } = ctx;
        (ctx as any).sectorState.ctx = ctx;

        SectorBuilder.spawnChest(ctx, LOCATIONS.SPAWN.BOSS.x, LOCATIONS.SPAWN.BOSS.z, 'big');

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
            SectorBuilder.spawnStreetLight(ctx, -50, z, Math.PI / 2);
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
        ], 16, undefined, MaterialType.ASPHALT, true);

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
            SectorBuilder.spawnStreetLight(ctx, x, 280, Math.PI);
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
        SectorBuilder.spawnBuilding(ctx, LOCATIONS.BUILDINGS.HOME.x - 2, LOCATIONS.BUILDINGS.HOME.z + 10, 20, 7, 25, 0, 0xffffff, true, true, 1.0);

        // Home - Police car and family's car
        VehicleGenerator.createPoliceCar().position.set(LOCATIONS.VEHICLES.POLICE_CAR.x, 0, LOCATIONS.VEHICLES.POLICE_CAR.z);

        SectorBuilder.spawnVehicle(ctx, LOCATIONS.VEHICLES.POLICE_CAR.x, LOCATIONS.VEHICLES.POLICE_CAR.z, LOCATIONS.VEHICLES.POLICE_CAR.rotation, 'police');
        const familyCar = SectorBuilder.spawnVehicle(ctx, LOCATIONS.VEHICLES.FAMILY_CAR.x, LOCATIONS.VEHICLES.FAMILY_CAR.z, 0.3, 'station wagon', 0x333333, false);
        SectorBuilder.setOnFire(ctx, familyCar, { smoke: true, intensity: 100, distance: 30, onRoof: true });

        // Home: Hedges
        SectorBuilder.createHedge(ctx, [new THREE.Vector3(-19, 0, 8), new THREE.Vector3(-29, 0, 8), new THREE.Vector3(-29, 0, 32), new THREE.Vector3(-17, 0, 40), new THREE.Vector3(11, 0, 40), new THREE.Vector3(23, 0, 33)]);
        SectorBuilder.createHedge(ctx, [new THREE.Vector3(-6, 0, 0), new THREE.Vector3(31, 0, 0), new THREE.Vector3(31, 0, 31)]);

        // Kindergarten
        const kindergarten = new THREE.Mesh(new THREE.BoxGeometry(60, 10, 50), MATERIALS.building);
        kindergarten.position.set(LOCATIONS.BUILDINGS.KINDGARTEN.x, 0, LOCATIONS.BUILDINGS.KINDGARTEN.z);
        kindergarten.castShadow = true;
        scene.add(kindergarten);
        SectorBuilder.addObstacle(ctx, {
            mesh: kindergarten,
            collider: { type: 'box', size: new THREE.Vector3(60, 20, 50) }
        });

        // Fence between kindergarten and SMU
        SectorBuilder.createFence(ctx, [
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
            SectorBuilder.spawnBuilding(ctx, b.x, b.z, b.s[0], b.s[1], b.s[2], b.rotation, b.color, true, true);
        }

        // SMU
        const smu = SectorBuilder.spawnPoi(ctx, POI_TYPE.SMU, LOCATIONS.POIS.SMU.x, LOCATIONS.POIS.SMU.z, 0);

        // SMU - Containers
        SectorBuilder.spawnContainer(ctx, LOCATIONS.POIS.SMU.x - 35, LOCATIONS.POIS.SMU.z - 5, 0, 0x0044cc);
        SectorBuilder.spawnContainer(ctx, LOCATIONS.POIS.SMU.x - 35, LOCATIONS.POIS.SMU.z + 5, 0, 0x0044cc);

        // SMU - Cars
        const carColors = [0x3355ff, 0xcccccc, 0xcc2222];
        const carType = ['suv', 'station wagon', 'sedan'] as const;
        for (let i = 0; i < 3; i++) {
            const rotation = Math.random() * Math.PI;
            const carPos = { x: LOCATIONS.POIS.SMU.x + 35, z: LOCATIONS.POIS.SMU.z + (i * 12) - 10 };
            const car = SectorBuilder.spawnVehicle(ctx, carPos.x, carPos.z, rotation, carType[i], carColors[i]);
            SectorBuilder.setOnFire(ctx, car, { smoke: true, intensity: 80, distance: 25, onRoof: true });
        }

        // SMU - Stone wall
        SectorBuilder.createStoneWall(ctx, [
            new THREE.Vector3(203, 0, 71),
            new THREE.Vector3(206, 0, 112),
            new THREE.Vector3(205, 0, 134),
            new THREE.Vector3(203, 0, 146)
        ], 1.5, 1.5);

        // Town center - hedges
        SectorBuilder.createHedge(ctx, [new THREE.Vector3(141, 0, 188), new THREE.Vector3(146, 0, 230)]);
        SectorBuilder.createHedge(ctx, [new THREE.Vector3(139, 0, 195), new THREE.Vector3(136, 0, 231)]);

        // Church
        SectorBuilder.spawnPoi(ctx, POI_TYPE.CHURCH, LOCATIONS.POIS.CHURCH.x, LOCATIONS.POIS.CHURCH.z, 0);

        // Cafe
        SectorBuilder.spawnPoi(ctx, POI_TYPE.CAFE, LOCATIONS.POIS.CAFE.x, LOCATIONS.POIS.CAFE.z, 0);

        // Grocery store
        SectorBuilder.spawnPoi(ctx, POI_TYPE.GROCERY_STORE, LOCATIONS.POIS.GROCERY.x, LOCATIONS.POIS.GROCERY.z, 0);
        SectorBuilder.spawnContainer(ctx, LOCATIONS.POIS.GROCERY.x - 5, LOCATIONS.POIS.GROCERY.z + 20, Math.PI / 2.5, 0x111111);
        SectorBuilder.spawnContainer(ctx, LOCATIONS.POIS.GROCERY.x + 5, LOCATIONS.POIS.GROCERY.z + 20, Math.PI / 2.5, 0x111111);

        // Gym
        SectorBuilder.spawnPoi(ctx, POI_TYPE.GYM, LOCATIONS.POIS.GYM.x, LOCATIONS.POIS.GYM.z, 0);

        // Pizzeria
        SectorBuilder.spawnPoi(ctx, POI_TYPE.PIZZERIA, LOCATIONS.POIS.PIZZERIA.x, LOCATIONS.POIS.PIZZERIA.z, 0);

        // Embankment
        const embankmentWest = [
            new THREE.Vector3(20, 5, 364),
            new THREE.Vector3(84, 5, 350),
            new THREE.Vector3(133, 5, 345)
        ];
        SectorBuilder.createEmbankment(ctx, embankmentWest, 18, 5, MATERIALS.dirt);

        const embankmentEast = [
            new THREE.Vector3(145, 5, 345),
            new THREE.Vector3(264, 5, 345)
        ];
        SectorBuilder.createEmbankment(ctx, embankmentEast, 18, 5, MATERIALS.dirt);

        // Overpass
        const overpassPoints = LOCATIONS.OVERPASS.map(p => p.clone());
        PathGenerator.createRoad(ctx, overpassPoints, 12);

        const guardRailSouth = [
            new THREE.Vector3(264, 5, 351),
            new THREE.Vector3(135, 5, 351),
            new THREE.Vector3(84, 5, 356),
            new THREE.Vector3(20, 5, 370)
        ];
        SectorBuilder.createGuardrail(ctx, guardRailSouth, true);

        const guardRailNorthWest = [
            new THREE.Vector3(113, 5, 339),
            new THREE.Vector3(84, 5, 344),
            new THREE.Vector3(20, 5, 358)
        ];
        SectorBuilder.createGuardrail(ctx, guardRailNorthWest, true);

        const guardRailNorthEast = [
            new THREE.Vector3(264, 5, 339),
            new THREE.Vector3(135, 5, 339)
        ];
        SectorBuilder.createGuardrail(ctx, guardRailNorthEast, true);

        // Debris
        const debrisGeo = new THREE.BoxGeometry(0.15, 0.3, 5);
        const debrisPositions = [
            { x: 113, z: 339, ry: 0.2, rz: 0.1 },
            { x: 113, z: 338, ry: 0.5, rz: -0.5 },
            { x: 135, z: 337, ry: 0.8, rz: -0.8 },
            { x: 135, z: 339, ry: -0.2, rz: 0.1 }
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
        // Left tire
        PathGenerator.createDecalPath(ctx, [
            new THREE.Vector3(80, 6, 344),
            new THREE.Vector3(95, 6, 344),
            new THREE.Vector3(110, 6, 341.5),
            new THREE.Vector3(125, 6, 339.5)
        ], { spacing: 0.2, size: 0.5, material: MATERIALS.skidMark, variance: 0.02 });

        // Right tire
        PathGenerator.createDecalPath(ctx, [
            new THREE.Vector3(80, 6, 346.5),
            new THREE.Vector3(95, 6, 345.5),
            new THREE.Vector3(110, 6, 343.5),
            new THREE.Vector3(125, 6, 341.5)
        ], { spacing: 0.2, size: 0.5, material: MATERIALS.skidMark, variance: 0.02 });

        // Tunnel
        const tunnelPos = new THREE.Vector3(LOCATIONS.TRIGGERS.TUNNEL.x, 0, LOCATIONS.TRIGGERS.TUNNEL.z);
        const tunnel = ObjectGenerator.createStandardTunnel(6, 6, 25, 1, 1);
        tunnel.position.copy(tunnelPos);
        ctx.scene.add(tunnel);

        for (let i = 0; i < tunnel.userData.colliders.length; i++) {
            const c = tunnel.userData.colliders[i];
            const wPos = tunnelPos.clone();
            if (c.offset) wPos.add(c.offset);
            SectorBuilder.addObstacle(ctx, {
                position: wPos,
                collider: { type: c.type, size: c.size, radius: c.radius },
                materialId: MaterialType.CONCRETE
            });
        }

        // Bus (tunnel blocker)
        const bus = VehicleGenerator.createBus(0x009ddb, false);
        bus.position.set(LOCATIONS.TRIGGERS.BUS.x, LOCATIONS.TRIGGERS.BUS.y, LOCATIONS.TRIGGERS.BUS.z);
        bus.rotation.set(Math.PI / 2, Math.PI / 2, 0);
        GeneratorUtils.freezeStatic(bus);

        const busBox = new THREE.Box3().setFromObject(bus);
        const busSize = new THREE.Vector3();
        busBox.getSize(busSize);

        const busCenter = new THREE.Vector3();
        busBox.getCenter(busCenter);
        const colMesh = new THREE.Mesh(new THREE.BoxGeometry(busSize.x, busSize.y, busSize.z));
        colMesh.position.copy(busCenter);
        colMesh.visible = false;
        GeneratorUtils.freezeStatic(colMesh);
        scene.add(colMesh);
        scene.add(bus);
        SectorBuilder.setOnFire(ctx, bus, { smoke: true, intensity: 25, distance: 50, onRoof: true });

        // Obstacle
        const busIdx = obstacles.length;
        const obstacle_bus = { id: EXPLODING_BUS_ID, mesh: colMesh, collider: { type: 'box' as const, size: busSize } };
        SectorBuilder.addObstacle(ctx, obstacle_bus);

        // Interactable
        SectorBuilder.addInteractable(ctx, bus, {
            id: 'tunnel_bus_explode',
            label: 'ui.interact_blow_up_bus',
            type: InteractionType.SECTOR_SPECIFIC,
            collider: { type: 'sphere', radius: 15.0 }
        });
        // Non-interactble from start
        bus.userData.isInteractable = false;

        // Store references for the event logic
        (ctx as any).busObject = bus;
        (ctx as any).busColMesh = colMesh;
        (ctx as any).busObjectIdx = busIdx;

        // [EXPLOSION LAG FIX] Pre-allocate bus rubble under the ground
        // NaturePropGenerator now defaults to active: false
        const rubble = SectorBuilder.spawnRubble(ctx, LOCATIONS.TRIGGERS.BUS.x, LOCATIONS.TRIGGERS.BUS.z, 20, MATERIALS.busBlue, Math.PI);
        rubble.position.y = -1000;
        rubble.visible = false;
        rubble.frustumCulled = true;
        rubble.userData.hasLanded = new Uint8Array(rubble.count);
        (ctx as any).busRubble = rubble;

        // Tires (4 bouncing tires)
        const tireGeo = new THREE.DodecahedronGeometry(0.8, 1);
        const tireMat = MATERIALS.vehicleTire;
        const tires = new THREE.InstancedMesh(tireGeo, tireMat, 4);
        tires.position.set(0, 0, 0);
        tires.visible = false;
        tires.userData.active = false;
        tires.userData.hasLanded = new Uint8Array(4);
        tires.userData.positions = new Float32Array(4 * 3);
        tires.userData.velocities = new Float32Array(4 * 3);
        tires.userData.rotations = new Float32Array(4 * 3);
        tires.userData.spin = new Float32Array(4 * 3);
        tires.userData.scales = new Float32Array(4).fill(1.0);
        scene.add(tires);
        (ctx as any).busTires = tires;

        // ----------------------------
        // Train yard - Fence
        const ty = LOCATIONS.POIS.TRAIN_YARD;
        const fenceHeight = 3;

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
        const locomotive = ObjectGenerator.createLocomotive();
        locomotive.position.set(LOCATIONS.POIS.TRAIN_YARD.x, -0.05, LOCATIONS.POIS.TRAIN_YARD.z);
        locomotive.rotation.y = -0.05;
        ctx.scene.add(locomotive);
        if (locomotive.userData.colliders) {
            for (const col of locomotive.userData.colliders) {
                SectorBuilder.addObstacle(ctx, {
                    mesh: locomotive,
                    position: locomotive.position.clone().add(col.offset || new THREE.Vector3()),
                    quaternion: locomotive.quaternion,
                    collider: col,
                    type: 'PoiCollider'
                });
            }
        }

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
            SectorBuilder.addObstacle(ctx, {
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
        SectorBuilder.fillVegetation(ctx, VEGETATION_TYPE.SPRUCE, forestPolygon, 8);

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
        SectorBuilder.fillVegetation(ctx, VEGETATION_TYPE.SPRUCE, forestPolygon, 8);

        // Forest
        forestPolygon = [
            new THREE.Vector3(188, 0, 151),
            new THREE.Vector3(188, 0, 140),
            new THREE.Vector3(174, 0, 137),
            new THREE.Vector3(125, 0, 137),
            new THREE.Vector3(129, 0, 163),
            new THREE.Vector3(142, 0, 173),
        ];
        SectorBuilder.fillVegetation(ctx, VEGETATION_TYPE.PINE, forestPolygon, 12);

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
        SectorBuilder.fillVegetation(ctx, VEGETATION_TYPE.BIRCH, forestPolygon, 12);

        // Forsest - Gym
        forestPolygon = [
            new THREE.Vector3(20, 0, 230),
            new THREE.Vector3(66, 0, 230),
            new THREE.Vector3(66, 0, 285),
            new THREE.Vector3(72, 0, 285),
            new THREE.Vector3(72, 0, 340),
            new THREE.Vector3(28, 0, 350),

        ];
        SectorBuilder.fillVegetation(ctx, VEGETATION_TYPE.BIRCH, forestPolygon, 10);

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
        SectorBuilder.fillVegetation(ctx, VEGETATION_TYPE.BIRCH, forestPolygon, 8);

        // Forest: Trainyard - North-West
        forestPolygon = [
            new THREE.Vector3(88, 0, 364),
            new THREE.Vector3(88, 0, 392),
            new THREE.Vector3(53, 0, 401),
            new THREE.Vector3(33, 0, 409),
            new THREE.Vector3(31, 0, 375),
        ];
        SectorBuilder.fillVegetation(ctx, VEGETATION_TYPE.SPRUCE, forestPolygon, 8);

        forestPolygon = [
            new THREE.Vector3(212, 0, 359),
            new THREE.Vector3(250, 0, 359),
            new THREE.Vector3(250, 0, 408),
            new THREE.Vector3(212, 0, 403),
        ];
        SectorBuilder.fillVegetation(ctx, VEGETATION_TYPE.SPRUCE, forestPolygon, 8);

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
        SectorBuilder.fillVegetation(ctx, VEGETATION_TYPE.SPRUCE, forestPolygon, 8);

        SectorBuilder.spawnDeadBody(ctx, 37, 44, EnemyType.WALKER, 0, true);
        SectorBuilder.spawnChest(ctx, 45, 45, 'standard');
        SectorBuilder.spawnChest(ctx, 110, 80, 'standard');
        SectorBuilder.spawnChest(ctx, LOCATIONS.POIS.CAFE.x, LOCATIONS.POIS.CAFE.z + 5, 'standard');

        // Spawn Loke
        SectorBuilder.spawnFamily(ctx, FamilyMemberID.LOKE, LOCATIONS.SPAWN.FAMILY.x, LOCATIONS.SPAWN.FAMILY.z, Math.PI);
    },

    setupContent: async (ctx: SectorContext) => {
        if (ctx.isWarmup) return; // Triggers produce no GPU state — skip during preloader ghost-render
        SectorBuilder.addTriggers(ctx, [
            { id: 's0_start_tracks', position: LOCATIONS.TRIGGERS.START_TRACKS, radius: 10, type: TriggerType.THOUGHT, content: "clues.0.0.reaction", statusFlags: TriggerStatus.ACTIVE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 50 } }] },
            { id: 's0_blood_stains', position: LOCATIONS.TRIGGERS.BLOOD_STAINS, radius: 10, type: TriggerType.THOUGHT, content: "clues.0.1.reaction", statusFlags: TriggerStatus.ACTIVE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 50 } }] },
            { id: 's0_they_must_be_scared', position: LOCATIONS.TRIGGERS.CHAOS_HERE, radius: 8, type: TriggerType.THOUGHT, content: "clues.0.2.reaction", statusFlags: TriggerStatus.ACTIVE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 50 } }] },
            { id: 's0_still_tracking', position: LOCATIONS.TRIGGERS.STILL_TRACKING, radius: 15, type: TriggerType.THOUGHT, content: "clues.0.3.reaction", statusFlags: TriggerStatus.ACTIVE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 50 } }] },
            { id: 's0_town_center', position: LOCATIONS.TRIGGERS.TOWN_CENTER, radius: 80, type: TriggerType.THOUGHT, content: "clues.0.4.reaction", statusFlags: TriggerStatus.ACTIVE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 50 } }] },

            { id: 's0_poi_building_on_fire', position: LOCATIONS.POIS.SMU, size: { width: 60, depth: 60 }, type: TriggerType.POI, content: "pois.0.0.reaction", statusFlags: TriggerStatus.ACTIVE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 500 } }] },
            { id: 's0_poi_church', position: LOCATIONS.POIS.CHURCH, size: { width: 30, depth: 30 }, type: TriggerType.POI, content: "pois.0.1.reaction", statusFlags: TriggerStatus.ACTIVE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 500 } }] },
            { id: 's0_poi_cafe', position: LOCATIONS.POIS.CAFE, size: { width: 25, depth: 25 }, type: TriggerType.POI, content: "pois.0.2.reaction", statusFlags: TriggerStatus.ACTIVE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 500 } }] },
            { id: 's0_poi_pizzeria', position: LOCATIONS.POIS.PIZZERIA, size: { width: 25, depth: 25 }, type: TriggerType.POI, content: "pois.0.3.reaction", statusFlags: TriggerStatus.ACTIVE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 500 } }] },
            { id: 's0_poi_grocery', position: LOCATIONS.POIS.GROCERY, size: { width: 25, depth: 40 }, type: TriggerType.POI, content: "pois.0.4.reaction", statusFlags: TriggerStatus.ACTIVE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 500 } }] },
            { id: 's0_poi_gym', position: LOCATIONS.POIS.GYM, size: { width: 45, depth: 25 }, type: TriggerType.POI, content: "pois.0.5.reaction", statusFlags: TriggerStatus.ACTIVE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 500 } }] },
            { id: 's0_poi_train_yard', position: LOCATIONS.POIS.TRAIN_YARD, size: { width: 130, depth: 90 }, type: TriggerType.POI, content: "pois.0.6.reaction", statusFlags: TriggerStatus.ACTIVE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 500 } }] },

            // THE NATIVE BUS EVENT TRIGGER
            { id: 's0_event_tunnel_blocked', position: LOCATIONS.TRIGGERS.BUS, radius: 15, type: TriggerType.SPEAK, content: "clues.0.5.reaction", statusFlags: TriggerStatus.ACTIVE, actions: [] },

            // LOKE CINEMATIC TRIGGER — starts INACTIVE.
            // Activated by onUpdate State 9 only after the bus explosion settles,
            // so the player cannot skip the cinematic by walking to Loke early.
            {
                id: 'found_loke',
                position: LOCATIONS.SPAWN.FAMILY,
                familyId: FamilyMemberID.LOKE,
                radius: 8,
                type: TriggerType.EVENT,
                content: '',
                statusFlags: TriggerStatus.ONCE, // Starts INACTIVE (Missing ACTIVE bit)
                actions: [{ type: TriggerActionType.START_CINEMATIC, payload: { familyId: FamilyMemberID.LOKE, scriptId: 0, sectorId: 0 } }]
            }
        ]);
    },

    onInteract: (id: string, object: THREE.Object3D, state: any, events: any) => {
        // Only triggered when the player hits [E] after the wave is cleared
        if (id === 'tunnel_bus_explode') {
            state.sectorState.busInteractionTriggered = true;
            object.userData.isInteractable = false;
        }
    },

    onSectorUpdate: ({ delta, simTime, renderTime, playerPos, gameState, sectorState, ...events }) => {
        // --- SECTOR 0: LOKE MISSION LOGIC ---
        if (!sectorState.spawns) sectorState.spawns = {};

        // --- 1. AMBIENT ZOMBIE SPAWNS ---
        if (!sectorState.spawns.initial && simTime - gameState.startTime > 0) {
            sectorState.spawns.initial = true;
            for (let i = 0; i < 3; i++) {
                if (events.spawnZombie) events.spawnZombie(EnemyType.WALKER, new THREE.Vector3(14, 0, 1));
            }
        }

        const forestHomeSMU = new THREE.Vector3(70, 0, 50);
        if (playerPos.distanceTo(forestHomeSMU) < 40 && !sectorState.spawns.forest_home_smu) {
            sectorState.spawns.forest_home_smu = true;
            for (let i = 0; i < 6; i++) {
                const type = Math.random() > 0.7 ? EnemyType.RUNNER : EnemyType.WALKER;
                const offX = (Math.random() - 0.5) * 30;
                const offZ = (Math.random() - 0.5) * 30;
                if (events.spawnZombie) events.spawnZombie(type, new THREE.Vector3(forestHomeSMU.x + offX, 0, forestHomeSMU.z + offZ));
            }
        }

        const buildingPOIs = [
            { name: 'church', pos: LOCATIONS.POIS.CHURCH, count: 6, isMixed: true },
            { name: 'cafe', pos: LOCATIONS.POIS.CAFE, count: 4, type: EnemyType.WALKER },
            { name: 'grocery', pos: LOCATIONS.POIS.GROCERY, count: 5, type: EnemyType.RUNNER },
            { name: 'gym', pos: LOCATIONS.POIS.GYM, count: 3, isMixed: true },
            { name: 'pizzeria', pos: LOCATIONS.POIS.PIZZERIA, count: 4, type: EnemyType.WALKER },
        ];

        buildingPOIs.forEach(poi => {
            const dist = playerPos.distanceTo(new THREE.Vector3(poi.pos.x, 0, poi.pos.z));
            if (dist < 45 && !sectorState.spawns[poi.name]) {
                sectorState.spawns[poi.name] = true;
                for (let i = 0; i < poi.count; i++) {
                    let type: EnemyType = EnemyType.WALKER;
                    if (poi.isMixed) type = Math.random() > 0.8 ? EnemyType.RUNNER : EnemyType.WALKER;
                    else if (poi.type === EnemyType.RUNNER) type = Math.random() > 0.3 ? EnemyType.RUNNER : EnemyType.WALKER;
                    else if (poi.type !== undefined) type = poi.type;

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
                let type = EnemyType.WALKER;
                const rand = Math.random();
                if (rand > 0.8) type = EnemyType.TANK;
                else if (rand > 0.9) type = EnemyType.BOMBER;
                else if (rand > 0.7) type = EnemyType.RUNNER;

                const offX = (Math.random() - 0.5) * 40;
                const offZ = (Math.random() - 0.5) * 40;
                if (events.spawnZombie) events.spawnZombie(type, new THREE.Vector3(townCenterWoods.x + offX, 0, townCenterWoods.z + offZ));
            }
        }

        // --- 2. TRAIN SMOKE ---
        if (events.spawnParticle) {
            const interval = 80;
            if (simTime - (sectorState.lastSmokeTime || 0) > interval) {
                sectorState.lastSmokeTime = simTime;
                const tPos = LOCATIONS.POIS.TRAIN_YARD;
                const yRot = -0.05;
                const localX = 6, localY = 7.0, localZ = 0;
                const wx = tPos.x + (localX * Math.cos(yRot) - localZ * Math.sin(yRot));
                const wz = tPos.z + (localX * Math.sin(yRot) + localZ * Math.cos(yRot));

                events.spawnParticle(wx, localY, wz, 'black_smoke', 1);
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
            const busTrigger = gameState.triggers?.find((t: any) => t.id === 's0_event_tunnel_blocked');
            if (busTrigger && busTrigger.triggered) {
                sectorState.busEventState = 1;
                sectorState.busEventTimer = simTime;
            }
        }

        // State 1: Wait 2.0s, then trigger first distant explosion
        else if (sectorState.busEventState === 1 && simTime - sectorState.busEventTimer > 2000) {
            sectorState.busEventState = 2;
            sectorState.busEventTimer = simTime;

            if (events.playSound) events.playSound(SoundID.EXPLOSION);
            if (events.cameraShake) events.cameraShake(1.0);

            gameState.triggers.push({
                id: 'dyn_speak_' + Date.now(),
                position: playerPos.clone(),
                radius: 100,
                type: TriggerType.SPEAK,
                content: "clues.0.6.reaction",
                statusFlags: TriggerStatus.ACTIVE,
                triggered: false,
                actions: []
            });
        }

        // State 2: Wait 2s, then pan camera
        else if (sectorState.busEventState === 2 && simTime - sectorState.busEventTimer > 2000) {
            sectorState.busEventState = 3;
            sectorState.busEventTimer = simTime;

            if (events.setCameraOverride) {
                _camOverrideTarget.copy(_trainYardPos).add(_offsetTrainYard);
                _camOverrideLookAt.copy(_trainYardPos);
                events.setCameraOverride({
                    active: true,
                    targetPos: _camOverrideTarget,
                    lookAtPos: _camOverrideLookAt,
                    endTime: renderTime + 4000
                });
            }
        }

        // State 3: Wait 2s for camera to arrive, then BIG explosion at train yard
        else if (sectorState.busEventState === 3 && simTime - sectorState.busEventTimer > 2000) {
            sectorState.busEventState = 4;
            sectorState.busEventTimer = simTime;

            if (events.playSound) events.playSound(SoundID.EXPLOSION);
            if (events.cameraShake) events.cameraShake(5.0);

            if (events.makeNoise) {
                events.makeNoise(_trainYardPos.clone(), NoiseType.OTHER, 100);
            }
        }

        // State 4: Wait 2s on explosion view, then return camera and spawn wave
        else if (sectorState.busEventState === 4 && simTime - sectorState.busEventTimer > 2000) {
            sectorState.busEventState = 5;
            sectorState.busEventTimer = simTime;

            if (events.setCameraOverride) events.setCameraOverride(null);

            gameState.triggers.push({
                id: 'dyn_speak_' + Date.now(),
                position: playerPos.clone(),
                radius: 100,
                type: TriggerType.SPEAK,
                content: "clues.0.9.reaction",
                statusFlags: TriggerStatus.ACTIVE,
                triggered: false,
                actions: []
            });

            // ZOMBIE WAVE
            // Randomized 3-spot Horde Spawn (Bus Event Pincer)
            const SPOTS = [
                LOCATIONS.POIS.CHURCH,
                LOCATIONS.POIS.CAFE,
                LOCATIONS.POIS.GROCERY
            ];

            for (let i = 0; i < SPOTS.length; i++) {
                _viewPos.set(SPOTS[i].x, 0, SPOTS[i].z);
                if (events.spawnHorde) {
                    // undefined type = engine randomizes (Walkers, Runners, etc.)
                    events.spawnHorde(6, undefined, _viewPos.clone());
                }
            }

            // Sector tracking: 18 zombies in this wave
            sectorState.zombiesKillTarget = 1;
            sectorState.zombiesKilled = 0;
            sectorState.startingKills = gameState.sessionStats.kills;
        }

        // State 5: Wait for player to kill the wave
        else if (sectorState.busEventState === 5) {
            sectorState.zombiesKilled = gameState.sessionStats.kills - sectorState.startingKills;

            if (sectorState.zombiesKilled >= sectorState.zombiesKillTarget) {
                sectorState.busEventState = 6;
                sectorState.busEventTimer = simTime;

                gameState.triggers.push({
                    id: 'dyn_speak_' + Date.now(),
                    position: playerPos.clone(),
                    radius: 100,
                    type: TriggerType.SPEAK,
                    content: "clues.0.7.reaction",
                    statusFlags: TriggerStatus.ACTIVE,
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
            sectorState.busEventTimer = simTime;
            sectorState.lastBeepTime = simTime;

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
                        endTime: renderTime + 4000
                    });
                }

                // Spawn red pulsating ring
                const busExplosionRing = new THREE.Mesh(GEOMETRY.busExplosionRing, MATERIALS.busExplosionRing);
                busExplosionRing.rotation.x = -Math.PI / 2;
                busExplosionRing.position.copy(busPos);
                busExplosionRing.position.y = 1.0;

                if (events.scene) events.scene.add(busExplosionRing);
                sectorState.busRing = busExplosionRing;
            }

            if (events.playTone) events.playTone(880, 'sine', 0.1, 0.2);
            if (events.setInteraction) events.setInteraction(null);
        }

        // State 7: Bomb countdown sequence
        else if (sectorState.busEventState === 7) {
            const elapsed = simTime - sectorState.busEventTimer;
            const pos = (sectorState as any).originalBusPos || LOCATIONS.TRIGGERS.BUS;
            _busOriginalPos.copy(pos);

            if (elapsed < 3000) {
                // Beep sequence
                const beepInterval = elapsed > 2000 ? 250 : 500;
                if (simTime - sectorState.lastBeepTime > beepInterval) {
                    sectorState.lastBeepTime = simTime;
                    if (events.playTone) events.playTone(880, 'sine', 0.1, 0.15);
                }

                // Pulsating visual effect on the ring
                if (sectorState.busRing) {
                    const elapsedRender = renderTime - (sectorState.busEventTimer || renderTime);
                    const pulse = (Math.sin(elapsedRender * 0.01) + 1) * 0.5;
                    sectorState.busRing.material.opacity = 0.3 + (pulse * 0.5);
                    sectorState.busRing.scale.setScalar(1.0 + (pulse * 0.2));
                    sectorState.busRing.material.color.setRGB(1.0, pulse, 0.0);
                }
            } else {
                // Trigger the actual explosion
                sectorState.busEventState = 8;
                sectorState.busEventTimer = simTime;

                if (sectorState.busRing) {
                    if (events.scene) events.scene.remove(sectorState.busRing);
                    sectorState.busRing = null;
                }

                sectorState.busExploded = true;
            }
        }

        // State 8: Explosion physics and post-explosion timer
        else if (sectorState.busEventState === 8) {
            const elapsed = simTime - sectorState.busEventTimer;

            // PHYSICS UPDATE
            explodeBus(delta, renderTime, gameState, sectorState, events);

            if (elapsed > 10000 || (!sectorState.busRubble?.userData.active)) {
                sectorState.busEventState = 9;
                sectorState.busEventTimer = simTime;

                if (events.setCameraOverride) events.setCameraOverride(null);

                gameState.triggers.push({
                    id: 'dyn_speak_' + Date.now(),
                    position: playerPos.clone(),
                    radius: 100,
                    type: TriggerType.SPEAK,
                    content: "clues.0.8.reaction",
                    statusFlags: TriggerStatus.ACTIVE,
                    triggered: false,
                    actions: []
                });
            }
        }

        // State 9: Explosion settled — activate the Loke proximity trigger so the player
        // can now walk through the tunnel and begin the cinematic encounter.
        else if (sectorState.busEventState === 9 && !sectorState.lokeUnlocked) {
            // Wait a beat (1.5s) for the rubble speech bubble to land before unlocking
            if (simTime - sectorState.busEventTimer > 1500) {
                sectorState.lokeUnlocked = true;

                // Activate the found_loke trigger
                const lokeTrigger = gameState.triggers?.find((t: any) => t.id === 'found_loke');
                if (lokeTrigger) {
                    lokeTrigger.statusFlags |= TriggerStatus.ACTIVE;
                    lokeTrigger.triggered = false; // Maintain boolean compatibility
                }
            }
        }
    }
};