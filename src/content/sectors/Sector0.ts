import * as THREE from 'three';
import { EnemyType, NoiseType } from '../../entities/enemies/EnemyTypes';
import { SectorDef, SectorBuildContext, ChestType, SectorID } from '../../game/session/SectorTypes';
import { SoundID, ToneType } from '../../utils/audio/AudioTypes';
import { MATERIALS, GEOMETRY } from '../../utils/assets';
import { SectorBuilder } from '../../core/world/SectorBuilder';
import { ColliderType } from '../../core/world/CollisionResolution';
import { InteractionType, InteractionSubType, InteractionShape } from '../../systems/ui/UIEventBridge';
import { PathGenerator } from '../../core/world/generators/PathGenerator';
import { ObjectGenerator } from '../../core/world/generators/ObjectGenerator';
import { VehicleGenerator } from '../../core/world/generators/VehicleGenerator';
import { GeneratorUtils } from '../../core/world/generators/GeneratorUtils';
import { CAMERA_HEIGHT } from '../constants';
import { VehicleID } from '../../entities/vehicles/VehicleTypes';
import { FamilyMemberID } from '../constants';
import { MaterialType, VEGETATION_TYPE } from '../../content/environment';
import { WeatherType, GroundType } from '../../core/engine/EnvironmentalTypes';
import { FXParticleType } from '../../types/FXTypes';
import { PoiType, PoiID } from '../../content/pois';
import { ClueID } from '../../content/clues';
import { SectorEventID } from '../../content/sector_events';
import { CollectibleID } from '../../content/collectibles';
import { TriggerType, TriggerActionType, TriggerStatus } from '../../types/TriggerTypes';
import { EnemyWaveSystem, EnemyWaveConfig } from '../../systems/EnemyWaveSystem';

const LOCATIONS = {
    SPAWN: {
        PLAYER: { x: -21, z: 15, rot: Math.PI / 1.25 },
        FAMILY: { x: 153, z: 404 },
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

// --- PHYSICS SCRATCHPADS (Zero-GC) ---
const _activeMeshesScratch: THREE.InstancedMesh[] = new Array(16);
let _activeMeshCount = 0;

const EXPLODING_BUS_ID = 'tunnel_bus';
const EXPLODING_BUS_POS = LOCATIONS.TRIGGERS.BUS;

// ============================================================================
// ZERO-GC PRE-ALLOCATED STATIC BUFFERS (Eliminates 26MB Heap Drift completely)
// ============================================================================
const _v1 = new THREE.Vector3();
const _forestHomeSMU = new THREE.Vector3(70, 0, 50);
const _townCenterWoods = new THREE.Vector3(145, 0, 240);
const _trainYardPos = new THREE.Vector3(LOCATIONS.POIS.TRAIN_YARD.x, 0, LOCATIONS.POIS.TRAIN_YARD.z);
const _viewPos = new THREE.Vector3();
const _spawnScratch = new THREE.Vector3();
const _camOverrideTarget = new THREE.Vector3();
const _camOverrideLookAt = new THREE.Vector3();

const _busOriginalPos = new THREE.Vector3();
const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _rotation = new THREE.Euler();
const _quat = new THREE.Quaternion();

const _offsetTrainYard = new THREE.Vector3(0, 10, 22);
const _zoomOffsetTarget = new THREE.Vector3(22, 10, 0);
const _zoomOffsetLook = new THREE.Vector3(0, 2, 0);

// Pre-allocated flat array replacing the dynamic closure allocations
interface BuildingPoi {
    readonly name: string;
    readonly pos: { readonly x: number; readonly z: number };
    readonly count: number;
    readonly isMixed: boolean;
    readonly type?: EnemyType;
}

const BUILDING_POIS: readonly BuildingPoi[] = [
    { name: 'church', pos: LOCATIONS.POIS.CHURCH, count: 6, isMixed: true },
    { name: 'cafe', pos: LOCATIONS.POIS.CAFE, count: 4, isMixed: false, type: EnemyType.WALKER },
    { name: 'grocery', pos: LOCATIONS.POIS.GROCERY, count: 3, isMixed: true },
    { name: 'gym', pos: LOCATIONS.POIS.GYM, count: 3, isMixed: true },
    { name: 'pizzeria', pos: LOCATIONS.POIS.PIZZERIA, count: 4, isMixed: false, type: EnemyType.WALKER },
];

const SPOTS_ARRAY = [
    LOCATIONS.POIS.CHURCH,
    LOCATIONS.POIS.CAFE,
    LOCATIONS.POIS.GROCERY
] as const;

/*
* Creates the bus that blocks the player from continuing in the tunnel,
* the bus that the player blows up during the event.
*/
async function createExplodingBus(ctx: any) {
    const { scene } = ctx;

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

    const obstacle_bus = { id: EXPLODING_BUS_ID, mesh: colMesh, collider: { type: ColliderType.BOX, size: busSize } };
    SectorBuilder.addObstacle(ctx, obstacle_bus);

    SectorBuilder.addInteractable(ctx, bus, {
        id: 'tunnel_bus_explode',
        label: 'ui.interact_blow_up_bus',
        type: InteractionType.SECTOR_SPECIFIC,
        subType: InteractionSubType.PLANT_EXPLOSIVE,
        collider: { type: InteractionShape.SPHERE, radius: 15.0 }
    });
    bus.userData.isInteractable = false;

    // Store references
    (ctx as any).busObject = bus;
    (ctx as any).busColMesh = colMesh;
    (ctx as any).busCenter = busCenter.clone();
    (ctx as any).busSize = busSize.clone();
    (ctx as any).busObstacle = obstacle_bus;

    // Rubble
    const rubble = await SectorBuilder.spawnRubble(ctx, EXPLODING_BUS_POS.x, EXPLODING_BUS_POS.z, 20, MATERIALS.busBlue, Math.PI);
    rubble.position.set(0, 0, 0);
    rubble.visible = false; // [VINTERDÖD FIX] Keep hidden until explosion
    rubble.frustumCulled = false;
    rubble.userData.active = false;
    rubble.userData.hasLanded = new Uint8Array(rubble.count);
    rubble.userData.positions = new Float32Array(rubble.count * 3);
    rubble.userData.velocities = new Float32Array(rubble.count * 3);
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

    // Zero-GC Pre-allocation: Bus Explosion Ring
    const busExplosionRing = new THREE.Mesh(GEOMETRY.busExplosionRing, MATERIALS.busExplosionRing);
    busExplosionRing.rotation.x = -Math.PI / 2;
    busExplosionRing.position.set(0, -1000, 0);
    busExplosionRing.visible = false;
    scene.add(busExplosionRing);
    (ctx as any).busRing = busExplosionRing;
}

/**
 * Explodes the bus at the given position, creating rubble
 * (debris & tires flying in random directions)
 */
function explodeBus(delta: number, simTime: number, renderTime: number, gameState: any, sectorState: any, ctx: any, events: any) {
    if (!sectorState.busExplosionHandled) {
        sectorState.busExplosionHandled = true;
        sectorState.busExplosionTime = renderTime;

        if (events.playSound) events.playSound(SoundID.EXPLOSION);
        if (events.cameraShake) events.cameraShake(15);

        _busOriginalPos.set(EXPLODING_BUS_POS.x, EXPLODING_BUS_POS.y, EXPLODING_BUS_POS.z);

        if (events.spawnParticle) {
            events.spawnParticle(_busOriginalPos.x, 2, _busOriginalPos.z, FXParticleType.SHOCKWAVE, 1, undefined, undefined, undefined, 2.5);
            events.spawnParticle(_busOriginalPos.x, 2, _busOriginalPos.z, FXParticleType.LARGE_SMOKE, 8, undefined, undefined, undefined, 2.0);
        }

        if (events.makeNoise) {
            events.makeNoise(_busOriginalPos, NoiseType.OTHER, 100);
        }

        // (Re)move the bus object
        const _busObj = (ctx as any).busObject as THREE.Object3D | null;
        if (_busObj) {
            _busObj.traverse((child) => {
                child.matrixAutoUpdate = true;
            });
            _busObj.position.set(0, -1000, 0);
            _busObj.updateMatrixWorld(true);
        }

        // Remove the bus collider
        const _obsArray = ctx.obstacles;
        if (_obsArray) {
            for (let i = 0; i < _obsArray.length; i++) {
                const o = _obsArray[i];
                if (o && o.id === EXPLODING_BUS_ID) {
                    o.collider.size?.set(0, 0, 0);
                    if (o.position) o.position.set(99999, -1000, 99999);
                    if (o.mesh) {
                        o.mesh.position.set(99999, -1000, 99999);
                    }
                    //if (gameState.worldStreamer && typeof gameState.worldStreamer.updateObstacle === 'function') {
                    //    gameState.worldStreamer.updateObstacle(o);
                    //}
                    _obsArray[i] = _obsArray[_obsArray.length - 1];
                    _obsArray.pop();
                    break;
                }
            }
        }

        // Activate bus rubble
        const rMesh = (ctx as any).busRubble;
        if (rMesh) {
            // Debris
            rMesh.position.set(0, 0, 0);
            rMesh.visible = true;
            rMesh.userData.active = true;
            if (rMesh.userData.hasLanded) rMesh.userData.hasLanded.fill(0);

            const debrisData = rMesh.userData;
            for (let i = 0; i < rMesh.count; i++) {
                const ix = i * 3;
                const arcAngle = Math.random() * Math.PI * 2;
                const power = 1.5 + Math.random();
                const dirX = Math.cos(arcAngle) * power;
                const dirZ = Math.sin(arcAngle) * power;
                const dirY = 3.0 + Math.random() * 4.0; // More vertical burst
                const speed = 15 + Math.random() * 25;

                _v1.set(dirX, dirY, dirZ).normalize().multiplyScalar(speed);
                debrisData.velocities[ix] = _v1.x;
                debrisData.velocities[ix + 1] = _v1.y;
                debrisData.velocities[ix + 2] = _v1.z;

                debrisData.positions[ix] = EXPLODING_BUS_POS.x + (Math.random() - 0.5) * 8;
                debrisData.positions[ix + 1] = EXPLODING_BUS_POS.y + 1 + Math.random() * 2;
                debrisData.positions[ix + 2] = EXPLODING_BUS_POS.z + (Math.random() - 0.5) * 8;

                if (!debrisData.spin) debrisData.spin = new Float32Array(rMesh.count * 3);
                if (!debrisData.rotations) debrisData.rotations = new Float32Array(rMesh.count * 3);

                debrisData.spin[ix] = (Math.random() - 0.5) * 20;
                debrisData.spin[ix + 1] = (Math.random() - 0.5) * 20;
                debrisData.spin[ix + 2] = (Math.random() - 0.5) * 20;
            }

            // Tires:
            const tires = (ctx as any).busTires;
            if (tires) {
                tires.position.set(0, 0, 0);
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
    _activeMeshCount = 0;
    const busRubble = (ctx as any).busRubble;
    const busTires = (ctx as any).busTires;

    if (busRubble && busRubble.userData.active) _activeMeshesScratch[_activeMeshCount++] = busRubble;
    if (busTires && busTires.userData.active) _activeMeshesScratch[_activeMeshCount++] = busTires;

    for (let mIdx = 0; mIdx < _activeMeshCount; mIdx++) {
        const rubble = _activeMeshesScratch[mIdx];
        const isTire = rubble === busTires;
        const rubbleWeight = isTire ? 35.0 : 75.0;
        const bouncy = isTire ? 0.5 : 0.2;
        const data = rubble.userData;
        let stillMoving = false;
        const elapsed = renderTime - (sectorState.busExplosionTime || 0);

        for (let i = 0; i < rubble.count; i++) {
            const ix = i * 3;

            // [VINTERDÖD FIX] Dynamic ground height lookup
            const groundY = (gameState.worldStreamer && gameState.worldStreamer.getGroundHeight)
                ? gameState.worldStreamer.getGroundHeight(data.positions[ix], data.positions[ix + 2])
                : 0.1;
            const minHeight = groundY + (isTire ? 0.8 : 0.2);

            const isAboveGround = data.positions[ix + 1] > minHeight;
            const hasVelY = Math.abs(data.velocities[ix + 1]) > 0.1;
            const hasVelX = Math.abs(data.velocities[ix]) > 0.1;
            const hasVelZ = Math.abs(data.velocities[ix + 2]) > 0.1;

            if (isAboveGround || hasVelY || hasVelX || hasVelZ) {
                stillMoving = true;
                const safeDelta = Math.min(delta, 0.05);

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

                    if (data.hasLanded && !data.hasLanded[i] && events.playSound && sectorState.busExplosionTime) {
                        // Only play impact sounds during the active explosion window (first 10 seconds)
                        if (simTime - sectorState.busExplosionTime < 10000) {
                            if (!isTire || Math.abs(data.velocities[ix + 1]) > 2) {
                                events.playSound(isTire ? SoundID.IMPACT_METAL : SoundID.IMPACT_METAL);
                            }
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
    id: SectorID.VILLAGE,
    environment: {
        bgColor: 0x020208,
        groundColor: 0xddddff,
        ambient: 0.5,
        fov: 50,
        sky: {
            time: 0.05,
            atmosphereColor: 0x050510,
            celestial: {
                radius: 40,
                color: 0x88ccff,
                position: { x: -80, y: 220, z: -350 }
            },
            light: {
                visible: true,
                color: 0x88ccff,
                intensity: 1.5,
                castShadow: true
            }
        },
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
    ground: GroundType.SNOW,
    ambientLoop: SoundID.AMBIENT_WIND,

    playerSpawn: LOCATIONS.SPAWN.PLAYER,
    familySpawn: LOCATIONS.SPAWN.FAMILY,
    bossSpawn: LOCATIONS.SPAWN.BOSS,

    collectibles: [
        { id: CollectibleID.S0_COLLECTIBLE_1, x: LOCATIONS.COLLECTIBLES.C1.x, z: LOCATIONS.COLLECTIBLES.C1.z },
        { id: CollectibleID.S0_COLLECTIBLE_2, x: LOCATIONS.COLLECTIBLES.C2.x, z: LOCATIONS.COLLECTIBLES.C2.z }
    ],

    cinematic: {
        offset: LOCATIONS.CINEMATIC.OFFSET,
        lookAtOffset: LOCATIONS.CINEMATIC.LOOK_AT,
    },

    setupProps: async (ctx: SectorBuildContext) => {
        const { scene, obstacles } = ctx;

        let startTime = performance.now();
        const yieldIfBudgetExceeded = async () => {
            if (performance.now() - startTime > 12) {
                if (ctx.yield) await ctx.yield();
                startTime = performance.now();
            }
        };

        await SectorBuilder.spawnChest(ctx, LOCATIONS.SPAWN.BOSS.x, LOCATIONS.SPAWN.BOSS.z, ChestType.BIG);
        await yieldIfBudgetExceeded();

        await PathGenerator.createRoad(ctx, [
            new THREE.Vector3(-10, 0, 2),
            new THREE.Vector3(-42, 0, 2),
        ], 10);
        await yieldIfBudgetExceeded();

        await PathGenerator.createRoad(ctx, [
            new THREE.Vector3(-42, 0, 2),
            new THREE.Vector3(-42, 0, 35),
            new THREE.Vector3(-42, 0, -48)
        ], 16);
        await yieldIfBudgetExceeded();

        for (let z = -40; z <= 30; z += 35) {
            await SectorBuilder.spawnStreetLight(ctx, -50, z, Math.PI / 2);
            await yieldIfBudgetExceeded();
        }

        await PathGenerator.createDirtPath(ctx, [
            new THREE.Vector3(25, 0, 28),
            new THREE.Vector3(35, 0, 48),
            new THREE.Vector3(79, 0, 49),
            new THREE.Vector3(103, 0, 74),
            new THREE.Vector3(203, 0, 78),
        ], 4, undefined, false, true);
        await yieldIfBudgetExceeded();

        await PathGenerator.createRoad(ctx, [
            new THREE.Vector3(210, 0, 30),
            new THREE.Vector3(210, 0, 150),
            new THREE.Vector3(188, 0, 164),
            new THREE.Vector3(35, 0, 225)
        ], 16, undefined, MaterialType.ASPHALT, true);
        await yieldIfBudgetExceeded();

        await PathGenerator.createRoad(ctx, [
            new THREE.Vector3(135, 0, 193),
            new THREE.Vector3(147, 0, 270)
        ], 8);
        await yieldIfBudgetExceeded();

        await PathGenerator.createRoad(ctx, [
            new THREE.Vector3(236, 0, 271),
            new THREE.Vector3(63, 0, 271),
        ], 16);
        await yieldIfBudgetExceeded();

        for (let x = 70; x <= 230; x += 40) {
            await SectorBuilder.spawnStreetLight(ctx, x, 280, Math.PI);
            await yieldIfBudgetExceeded();
        }

        await PathGenerator.createDecalPath(ctx, [
            new THREE.Vector3(9, 0, 4),
            new THREE.Vector3(14, 0, 10),
            new THREE.Vector3(22, 0, 26),
            new THREE.Vector3(27, 0, 31)
        ], { spacing: 0.6, size: 0.4, material: MATERIALS.footprintDecal, variance: 0.2 });
        await yieldIfBudgetExceeded();

        await PathGenerator.createDecalPath(ctx, [
            new THREE.Vector3(181, 0, 81),
            new THREE.Vector3(189, 0, 89),
            new THREE.Vector3(192, 0, 99),
            new THREE.Vector3(192, 0, 112),
            new THREE.Vector3(186, 0, 117),
            new THREE.Vector3(180, 0, 121),
            new THREE.Vector3(181, 0, 128),
            new THREE.Vector3(201, 0, 148)
        ], { spacing: 0.6, size: 0.4, material: MATERIALS.footprintDecal, variance: 0.2 });
        await yieldIfBudgetExceeded();

        await SectorBuilder.spawnBuilding(ctx, LOCATIONS.BUILDINGS.HOME.x - 2, LOCATIONS.BUILDINGS.HOME.z + 10, 20, 7, 25, 0, 0xffffff, true, true, 1.0);
        await yieldIfBudgetExceeded();

        VehicleGenerator.createPoliceCar().position.set(LOCATIONS.VEHICLES.POLICE_CAR.x, 0, LOCATIONS.VEHICLES.POLICE_CAR.z);

        await SectorBuilder.spawnVehicle(ctx, LOCATIONS.VEHICLES.POLICE_CAR.x, LOCATIONS.VEHICLES.POLICE_CAR.z, LOCATIONS.VEHICLES.POLICE_CAR.rotation, VehicleID.POLICE);
        const familyCar = await SectorBuilder.spawnVehicle(ctx, LOCATIONS.VEHICLES.FAMILY_CAR.x, LOCATIONS.VEHICLES.FAMILY_CAR.z, 0.3, VehicleID.STATION_WAGON, 0x333333, false);
        await SectorBuilder.setOnFire(ctx, familyCar, { smoke: true, intensity: 100, distance: 30, onRoof: true });
        await yieldIfBudgetExceeded();

        await SectorBuilder.createHedgePath(ctx, [new THREE.Vector3(-19, 0, 8), new THREE.Vector3(-29, 0, 8), new THREE.Vector3(-29, 0, 32), new THREE.Vector3(-17, 0, 40), new THREE.Vector3(11, 0, 40), new THREE.Vector3(23, 0, 33)]);
        await SectorBuilder.createHedgePath(ctx, [new THREE.Vector3(-6, 0, 0), new THREE.Vector3(31, 0, 0), new THREE.Vector3(31, 0, 31)]);
        await yieldIfBudgetExceeded();

        const kindergarten = new THREE.Mesh(new THREE.BoxGeometry(60, 10, 50), MATERIALS.building);
        kindergarten.position.set(LOCATIONS.BUILDINGS.KINDGARTEN.x, 0, LOCATIONS.BUILDINGS.KINDGARTEN.z);
        kindergarten.castShadow = true;
        scene.add(kindergarten);
        await SectorBuilder.addObstacle(ctx, {
            mesh: kindergarten,
            collider: { type: ColliderType.BOX, size: new THREE.Vector3(60, 20, 50) }
        });
        await yieldIfBudgetExceeded();

        await SectorBuilder.createFence(ctx, [
            new THREE.Vector3(104, 0, 19),
            new THREE.Vector3(104, 0, 67),
            new THREE.Vector3(203, 0, 73)
        ], 'mesh', 1.5, false);
        await yieldIfBudgetExceeded();

        const randomBuildings = [
            { x: 54, z: 15, s: [15, 12, 15], rotation: 0, color: 0x776655 },
            { x: 237, z: 92, s: [18, 15, 20], rotation: 1.55, color: 0x555566 },
            { x: 235, z: 117, s: [12, 10, 12], rotation: 1.5, color: 0x665555 },
            { x: 224, z: 168, s: [20, 8, 20], rotation: Math.PI / 3, color: 0x444444 },
            { x: 117, z: 170, s: [16, 14, 16], rotation: Math.PI / 6, color: 0x777777 }
        ];
        for (let i = 0; i < randomBuildings.length; i++) {
            const b = randomBuildings[i];
            await SectorBuilder.spawnBuilding(ctx, b.x, b.z, b.s[0], b.s[1], b.s[2], b.rotation, b.color, true, true);
            await yieldIfBudgetExceeded();
        }

        await SectorBuilder.spawnPoi(ctx, PoiType.SMU, LOCATIONS.POIS.SMU.x, LOCATIONS.POIS.SMU.z, 0);
        await yieldIfBudgetExceeded();

        await SectorBuilder.spawnContainer(ctx, LOCATIONS.POIS.SMU.x - 35, LOCATIONS.POIS.SMU.z - 5, 0, 0x0044cc);
        await SectorBuilder.spawnContainer(ctx, LOCATIONS.POIS.SMU.x - 35, LOCATIONS.POIS.SMU.z + 5, 0, 0x0044cc);
        await yieldIfBudgetExceeded();

        const carColors = [0x3355ff, 0xcccccc, 0xcc2222];
        const carType = [VehicleID.SEDAN, VehicleID.STATION_WAGON, VehicleID.SEDAN] as const;
        for (let i = 0; i < 3; i++) {
            const rotation = Math.random() * Math.PI;
            const carPos = { x: LOCATIONS.POIS.SMU.x + 35, z: LOCATIONS.POIS.SMU.z + (i * 12) - 10 };
            const car = await SectorBuilder.spawnVehicle(ctx, carPos.x, carPos.z, rotation, carType[i], carColors[i]);
            await SectorBuilder.setOnFire(ctx, car, { smoke: true, intensity: 80, distance: 25, onRoof: true });
            await yieldIfBudgetExceeded();
        }

        await SectorBuilder.createStoneWallPath(ctx, [
            new THREE.Vector3(203, 0, 71),
            new THREE.Vector3(206, 0, 112),
            new THREE.Vector3(205, 0, 134),
            new THREE.Vector3(203, 0, 146)
        ], 1.5, 1.5);
        await yieldIfBudgetExceeded();

        await SectorBuilder.createHedgePath(ctx, [new THREE.Vector3(141, 0, 188), new THREE.Vector3(146, 0, 230)]);
        await SectorBuilder.createHedgePath(ctx, [new THREE.Vector3(139, 0, 195), new THREE.Vector3(136, 0, 231)]);
        await yieldIfBudgetExceeded();

        await SectorBuilder.spawnPoi(ctx, PoiType.CHURCH, LOCATIONS.POIS.CHURCH.x, LOCATIONS.POIS.CHURCH.z, 0);
        await SectorBuilder.spawnPoi(ctx, PoiType.CAFE, LOCATIONS.POIS.CAFE.x, LOCATIONS.POIS.CAFE.z, 0);
        await SectorBuilder.spawnPoi(ctx, PoiType.GROCERY_STORE, LOCATIONS.POIS.GROCERY.x, LOCATIONS.POIS.GROCERY.z, 0);
        await SectorBuilder.spawnContainer(ctx, LOCATIONS.POIS.GROCERY.x - 5, LOCATIONS.POIS.GROCERY.z + 20, Math.PI / 2.5, 0x111111);
        await SectorBuilder.spawnContainer(ctx, LOCATIONS.POIS.GROCERY.x + 5, LOCATIONS.POIS.GROCERY.z + 20, Math.PI / 2.5, 0x111111);
        await yieldIfBudgetExceeded();

        await SectorBuilder.spawnPoi(ctx, PoiType.GYM, LOCATIONS.POIS.GYM.x, LOCATIONS.POIS.GYM.z, 0);
        await SectorBuilder.spawnPoi(ctx, PoiType.PIZZERIA, LOCATIONS.POIS.PIZZERIA.x, LOCATIONS.POIS.PIZZERIA.z, 0);
        await yieldIfBudgetExceeded();

        const embankmentWest = [
            new THREE.Vector3(20, 5, 364),
            new THREE.Vector3(84, 5, 350),
            new THREE.Vector3(129, 5, 345)
        ];
        await SectorBuilder.createEmbankment(ctx, embankmentWest, 18, 5, MATERIALS.dirt);

        const embankmentEast = [
            new THREE.Vector3(147, 5, 345),
            new THREE.Vector3(264, 5, 345)
        ];
        await SectorBuilder.createEmbankment(ctx, embankmentEast, 18, 5, MATERIALS.dirt);
        await yieldIfBudgetExceeded();

        const overpassPoints = LOCATIONS.OVERPASS.map(p => p.clone());
        await PathGenerator.createRoad(ctx, overpassPoints, 12);

        const guardRailSouth = [
            new THREE.Vector3(264, 5, 351),
            new THREE.Vector3(135, 5, 351),
            new THREE.Vector3(84, 5, 356),
            new THREE.Vector3(20, 5, 370)
        ];
        await SectorBuilder.createGuardrail(ctx, guardRailSouth, true);

        const guardRailNorthWest = [
            new THREE.Vector3(113, 5, 339),
            new THREE.Vector3(84, 5, 344),
            new THREE.Vector3(20, 5, 358)
        ];
        await SectorBuilder.createGuardrail(ctx, guardRailNorthWest, true);

        const guardRailNorthEast = [
            new THREE.Vector3(264, 5, 339),
            new THREE.Vector3(135, 5, 339)
        ];
        await SectorBuilder.createGuardrail(ctx, guardRailNorthEast, true);
        await yieldIfBudgetExceeded();

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
            await yieldIfBudgetExceeded();
        }

        await PathGenerator.createDecalPath(ctx, [
            new THREE.Vector3(80, 6, 344),
            new THREE.Vector3(95, 6, 344),
            new THREE.Vector3(110, 6, 341.5),
            new THREE.Vector3(125, 6, 339.5)
        ], { spacing: 0.2, size: 0.5, material: MATERIALS.skidMark, variance: 0.02 });

        await PathGenerator.createDecalPath(ctx, [
            new THREE.Vector3(80, 6, 346.5),
            new THREE.Vector3(95, 6, 345.5),
            new THREE.Vector3(110, 6, 343.5),
            new THREE.Vector3(125, 6, 341.5)
        ], { spacing: 0.2, size: 0.5, material: MATERIALS.skidMark, variance: 0.02 });
        await yieldIfBudgetExceeded();

        const tunnelPos = new THREE.Vector3(LOCATIONS.TRIGGERS.TUNNEL.x, 0, LOCATIONS.TRIGGERS.TUNNEL.z);
        const tunnel = ObjectGenerator.createStandardTunnel(6, 6, 24, 1, 1);
        tunnel.position.copy(tunnelPos);
        ctx.scene.add(tunnel);

        for (let i = 0; i < tunnel.userData.colliders.length; i++) {
            const c = tunnel.userData.colliders[i];
            const wPos = tunnelPos.clone();
            if (c.offset) wPos.add(c.offset);
            await SectorBuilder.addObstacle(ctx, {
                position: wPos,
                collider: { type: c.type as any, size: c.size, radius: c.radius },
                materialId: MaterialType.CONCRETE
            });
            await yieldIfBudgetExceeded();
        }

        // Create the explodeable bus, blocking the tunnel
        createExplodingBus(ctx);

        const ty = LOCATIONS.POIS.TRAIN_YARD;
        const fenceHeight = 3;

        await SectorBuilder.createFence(ctx, [
            new THREE.Vector3(ty.x - 60, 0, ty.z + 40),
            new THREE.Vector3(ty.x + 60, 0, ty.z + 40)
        ], 'mesh', fenceHeight, true);

        await SectorBuilder.createFence(ctx, [
            new THREE.Vector3(ty.x - 60, 0, ty.z - 40),
            new THREE.Vector3(ty.x - 17, 0, ty.z - 40),
            new THREE.Vector3(ty.x - 17, 0, ty.z - 43),
        ], 'mesh', fenceHeight, true);
        await SectorBuilder.createFence(ctx, [
            new THREE.Vector3(ty.x - 5, 0, ty.z - 43),
            new THREE.Vector3(ty.x - 5, 0, ty.z - 40),
            new THREE.Vector3(ty.x + 60, 0, ty.z - 40)
        ], 'mesh', fenceHeight, true);

        await SectorBuilder.createFence(ctx, [
            new THREE.Vector3(ty.x - 60, 0, ty.z - 40),
            new THREE.Vector3(ty.x - 60, 0, ty.z - 6)
        ], 'mesh', fenceHeight, true);
        await SectorBuilder.createFence(ctx, [
            new THREE.Vector3(ty.x - 60, 0, ty.z),
            new THREE.Vector3(ty.x - 60, 0, ty.z + 40)
        ], 'mesh', fenceHeight, true);

        await SectorBuilder.createFence(ctx, [
            new THREE.Vector3(ty.x + 60, 0, ty.z - 40),
            new THREE.Vector3(ty.x + 60, 0, ty.z + 5),
        ], 'mesh', fenceHeight, true);
        await SectorBuilder.createFence(ctx, [
            new THREE.Vector3(ty.x + 60, 0, ty.z + 11),
            new THREE.Vector3(ty.x + 60, 0, ty.z + 40)
        ], 'mesh', fenceHeight, true);
        await yieldIfBudgetExceeded();

        const stationGround = new THREE.Mesh(new THREE.PlaneGeometry(120, 80), MATERIALS.asphalt);
        stationGround.rotation.x = -Math.PI / 2;
        stationGround.position.set(LOCATIONS.POIS.TRAIN_YARD.x, 0.025, LOCATIONS.POIS.TRAIN_YARD.z);
        stationGround.receiveShadow = true;
        scene.add(stationGround);

        await PathGenerator.createRailTrack(ctx, [
            new THREE.Vector3(-17, 0, 450),
            new THREE.Vector3(0, 0, 435),
            new THREE.Vector3(65, 0, 400),
            new THREE.Vector3(150, 0, 400),
            new THREE.Vector3(260, 0, 415),
        ]);
        await yieldIfBudgetExceeded();

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

        const cColors = [0x1a4a2a, 0x4a2a1a, 0x1a2a4a, 0x8b0000];
        const containersData = [
            { x: ty.x - 30, z: ty.z - 20, r: 0.1, c: cColors[0] },
            { x: ty.x - 28, z: ty.z - 17, r: 0.2, c: cColors[1] },
            { x: ty.x + 35, z: ty.z - 15, r: -0.1, c: cColors[2] },
            { x: ty.x + 40, z: ty.z + 10, r: Math.PI / 2 + 0.05, c: cColors[3] },
            { x: ty.x - 45, z: ty.z + 20, r: Math.PI / 2 - 0.1, c: cColors[0] }
        ];

        for (let i = 0; i < containersData.length; i++) {
            const data = containersData[i];
            const container = ObjectGenerator.createContainer(data.c, true);
            container.position.set(data.x, 0, data.z);
            container.rotation.y = data.r;
            scene.add(container);
            SectorBuilder.addObstacle(ctx, {
                mesh: container,
                collider: { type: ColliderType.BOX, size: new THREE.Vector3(6.0, 2.6, 2.4) }
            });
        }

        let forestPolygon = [
            new THREE.Vector3(37, 0, 44),
            new THREE.Vector3(36, 0, 30),
            new THREE.Vector3(103, 0, 30),
            new THREE.Vector3(99, 0, 67),
            new THREE.Vector3(76, 0, 43),
        ];

        await SectorBuilder.fillVegetation(ctx, VEGETATION_TYPE.SPRUCE, forestPolygon, 8);
        await yieldIfBudgetExceeded();

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
        await SectorBuilder.fillVegetation(ctx, [VEGETATION_TYPE.PINE, VEGETATION_TYPE.SPRUCE], forestPolygon, 12);
        await yieldIfBudgetExceeded();

        forestPolygon = [
            new THREE.Vector3(188, 0, 151),
            new THREE.Vector3(188, 0, 140),
            new THREE.Vector3(174, 0, 137),
            new THREE.Vector3(125, 0, 137),
            new THREE.Vector3(129, 0, 163),
            new THREE.Vector3(142, 0, 173),
        ];
        await SectorBuilder.fillVegetation(ctx, VEGETATION_TYPE.PINE, forestPolygon, 12);
        await yieldIfBudgetExceeded();

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
        await SectorBuilder.fillVegetation(ctx, VEGETATION_TYPE.BIRCH, forestPolygon, 12);
        await yieldIfBudgetExceeded();

        forestPolygon = [
            new THREE.Vector3(20, 0, 230),
            new THREE.Vector3(66, 0, 230),
            new THREE.Vector3(66, 0, 285),
            new THREE.Vector3(72, 0, 285),
            new THREE.Vector3(72, 0, 340),
            new THREE.Vector3(28, 0, 350),
        ];
        await SectorBuilder.fillVegetation(ctx, VEGETATION_TYPE.BIRCH, forestPolygon, 10);
        await yieldIfBudgetExceeded();

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
        await SectorBuilder.fillVegetation(ctx, VEGETATION_TYPE.BIRCH, forestPolygon, 8);
        await yieldIfBudgetExceeded();

        forestPolygon = [
            new THREE.Vector3(88, 0, 364),
            new THREE.Vector3(88, 0, 392),
            new THREE.Vector3(53, 0, 401),
            new THREE.Vector3(33, 0, 409),
            new THREE.Vector3(31, 0, 375),
        ];
        await SectorBuilder.fillVegetation(ctx, VEGETATION_TYPE.SPRUCE, forestPolygon, 8);
        await yieldIfBudgetExceeded();

        forestPolygon = [
            new THREE.Vector3(212, 0, 359),
            new THREE.Vector3(250, 0, 359),
            new THREE.Vector3(250, 0, 408),
            new THREE.Vector3(212, 0, 403),
        ];
        await SectorBuilder.fillVegetation(ctx, VEGETATION_TYPE.SPRUCE, forestPolygon, 8);
        await yieldIfBudgetExceeded();

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
        await SectorBuilder.fillVegetation(ctx, VEGETATION_TYPE.SPRUCE, forestPolygon, 8);
        await yieldIfBudgetExceeded();

        SectorBuilder.spawnDeadBody(ctx, 37, 44, EnemyType.WALKER, 0, true);
        SectorBuilder.spawnChest(ctx, 45, 45, ChestType.STANDARD);
        SectorBuilder.spawnChest(ctx, 110, 80, ChestType.STANDARD);
        SectorBuilder.spawnChest(ctx, LOCATIONS.POIS.CAFE.x, LOCATIONS.POIS.CAFE.z + 5, ChestType.STANDARD);

        SectorBuilder.spawnFamily(ctx, FamilyMemberID.LOKE, LOCATIONS.SPAWN.FAMILY.x, LOCATIONS.SPAWN.FAMILY.z, Math.PI);
    },

    setupContent: async (ctx: SectorBuildContext) => {
        if (ctx.isWarmup) return;

        // ZERO-GC FIX: Added ONCE bitmask to ensure triggers stop firing after touch
        SectorBuilder.addTriggers(ctx, [
            { id: ClueID.S0_START_TRACKS, position: LOCATIONS.TRIGGERS.START_TRACKS, radius: 10, type: TriggerType.CLUE, content: "clues.0.0.reaction", statusFlags: TriggerStatus.ACTIVE | TriggerStatus.ONCE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 50 } }] },
            { id: ClueID.S0_BLOOD_STAINS, position: LOCATIONS.TRIGGERS.BLOOD_STAINS, radius: 10, type: TriggerType.CLUE, content: "clues.0.1.reaction", statusFlags: TriggerStatus.ACTIVE | TriggerStatus.ONCE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 50 } }] },
            { id: ClueID.S0_THEY_MUST_BE_SCARED, position: LOCATIONS.TRIGGERS.CHAOS_HERE, radius: 8, type: TriggerType.CLUE, content: "clues.0.2.reaction", statusFlags: TriggerStatus.ACTIVE | TriggerStatus.ONCE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 50 } }] },
            { id: ClueID.S0_STILL_TRACKING, position: LOCATIONS.TRIGGERS.STILL_TRACKING, radius: 15, type: TriggerType.CLUE, content: "clues.0.3.reaction", statusFlags: TriggerStatus.ACTIVE | TriggerStatus.ONCE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 50 } }] },
            { id: ClueID.S0_TOWN_CENTER, position: LOCATIONS.TRIGGERS.TOWN_CENTER, radius: 80, type: TriggerType.CLUE, content: "clues.0.4.reaction", statusFlags: TriggerStatus.ACTIVE | TriggerStatus.ONCE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 50 } }] },

            { id: PoiID.S0_BUILDING_ON_FIRE, position: LOCATIONS.POIS.SMU, size: { width: 80, depth: 80 }, type: TriggerType.POI, content: "pois.0.0.reaction", statusFlags: TriggerStatus.ACTIVE | TriggerStatus.ONCE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 500 } }] },
            { id: PoiID.S0_CHURCH, position: LOCATIONS.POIS.CHURCH, size: { width: 50, depth: 50 }, type: TriggerType.POI, content: "pois.0.1.reaction", statusFlags: TriggerStatus.ACTIVE | TriggerStatus.ONCE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 500 } }] },
            { id: PoiID.S0_CAFE, position: LOCATIONS.POIS.CAFE, size: { width: 45, depth: 45 }, type: TriggerType.POI, content: "pois.0.2.reaction", statusFlags: TriggerStatus.ACTIVE | TriggerStatus.ONCE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 500 } }] },
            { id: PoiID.S0_PIZZERIA, position: LOCATIONS.POIS.PIZZERIA, size: { width: 45, depth: 45 }, type: TriggerType.POI, content: "pois.0.3.reaction", statusFlags: TriggerStatus.ACTIVE | TriggerStatus.ONCE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 500 } }] },
            { id: PoiID.S0_GROCERY, position: LOCATIONS.POIS.GROCERY, size: { width: 45, depth: 60 }, type: TriggerType.POI, content: "pois.0.4.reaction", statusFlags: TriggerStatus.ACTIVE | TriggerStatus.ONCE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 500 } }] },
            { id: PoiID.S0_GYM, position: LOCATIONS.POIS.GYM, size: { width: 65, depth: 45 }, type: TriggerType.POI, content: "pois.0.5.reaction", statusFlags: TriggerStatus.ACTIVE | TriggerStatus.ONCE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 500 } }] },
            { id: PoiID.S0_TRAIN_YARD, position: LOCATIONS.POIS.TRAIN_YARD, size: { width: 150, depth: 110 }, type: TriggerType.POI, content: "pois.0.6.reaction", statusFlags: TriggerStatus.ACTIVE | TriggerStatus.ONCE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 500 } }] },

            { id: SectorEventID.S0_TUNNEL_BLOCKED, position: LOCATIONS.TRIGGERS.BUS, radius: 15, type: TriggerType.EVENT, statusFlags: TriggerStatus.ACTIVE, actions: [] },

            {
                id: FamilyMemberID.LOKE,
                position: LOCATIONS.SPAWN.FAMILY,
                familyId: FamilyMemberID.LOKE,
                radius: 5,
                type: TriggerType.EVENT,
                statusFlags: TriggerStatus.ACTIVE | TriggerStatus.ONCE,
                actions: [{ type: TriggerActionType.START_CINEMATIC, payload: { familyId: FamilyMemberID.LOKE, dialogueId: 0, sectorId: 0 } }]
            }
        ]);
    },

    onInteract: (id: string, object: THREE.Object3D, state: any, events: any) => {
        const subType = object.userData.interactionSubType;
        if (subType === InteractionSubType.PLANT_EXPLOSIVE) {
            state.sectorState.busInteractionTriggered = true;
            object.userData.isInteractable = false;
            if (events.setInteraction) events.setInteraction(null);
        }
    },

    onSectorUpdate: ({ delta, simTime, renderTime, playerPos, gameState, sectorState, triggerSystem, ctx, engine, ...events }) => {
        if (!sectorState.spawns) sectorState.spawns = {};

        if (!sectorState.spawns.initial && simTime - gameState.startTime > 0) {
            sectorState.spawns.initial = true;
            for (let i = 0; i < 3; i++) {
                if (events.spawnZombie) events.spawnZombie(EnemyType.WALKER, new THREE.Vector3(14, 0, 1));
            }
        }

        _v1.set(_forestHomeSMU.x, 0, _forestHomeSMU.z);
        if (!sectorState.spawns.forest_home_smu && playerPos.distanceToSquared(_v1) < 1600) {
            sectorState.spawns.forest_home_smu = true;
            for (let i = 0; i < 6; i++) {
                const type = Math.random() > 0.7 ? EnemyType.RUNNER : EnemyType.WALKER;
                const offX = (Math.random() - 0.5) * 30;
                const offZ = (Math.random() - 0.5) * 30;
                _spawnScratch.set(_forestHomeSMU.x + offX, 0, _forestHomeSMU.z + offZ);
                if (events.spawnZombie) events.spawnZombie(type, _spawnScratch);
            }
        }

        // ZERO-GC FIX: Use pre-allocated flat array, eliminating array and closure allocations
        const bLen = BUILDING_POIS.length;
        for (let idx = 0; idx < bLen; idx++) {
            const poi = BUILDING_POIS[idx];
            if (!sectorState.spawns[poi.name]) {
                _v1.set(poi.pos.x, 0, poi.pos.z);
                if (playerPos.distanceToSquared(_v1) < 5625) {
                    sectorState.spawns[poi.name] = true;
                    for (let i = 0; i < poi.count; i++) {
                        let type: EnemyType = EnemyType.WALKER;
                        if (poi.isMixed) type = Math.random() > 0.8 ? EnemyType.RUNNER : EnemyType.WALKER;
                        else if (poi.type) type = poi.type;

                        const offX = (Math.random() - 0.5) * 20;
                        const offZ = (Math.random() - 0.5) * 20;
                        _spawnScratch.set(poi.pos.x + offX, 0, poi.pos.z + offZ);
                        if (events.spawnZombie) events.spawnZombie(type, _spawnScratch);
                    }
                }
            }
        }

        _v1.set(_townCenterWoods.x, 0, _townCenterWoods.z);
        if (!sectorState.spawns.town_forest && playerPos.distanceToSquared(_v1) < 5625) {
            sectorState.spawns.town_forest = true;
            for (let i = 0; i < 8; i++) {
                let type = EnemyType.WALKER;
                const rand = Math.random();
                if (rand > 0.8) type = EnemyType.TANK;
                else if (rand > 0.9) type = EnemyType.BLOATER;
                else if (rand > 0.7) type = EnemyType.RUNNER;

                const offX = (Math.random() - 0.5) * 40;
                const offZ = (Math.random() - 0.5) * 40;
                _spawnScratch.set(_townCenterWoods.x + offX, 0, _townCenterWoods.z + offZ);
                if (events.spawnZombie) events.spawnZombie(type, _spawnScratch);
            }
        }

        if (events.spawnParticle) {
            const interval = 80;
            if (simTime - (sectorState.lastSmokeTime || 0) > interval) {
                sectorState.lastSmokeTime = simTime;
                const tPos = LOCATIONS.POIS.TRAIN_YARD;
                const yRot = -0.05;
                const localX = 6, localY = 7.0, localZ = 0;
                const wx = tPos.x + (localX * Math.cos(yRot) - localZ * Math.sin(yRot));
                const wz = tPos.z + (localX * Math.sin(yRot) + localZ * Math.cos(yRot));

                events.spawnParticle(wx, localY, wz, FXParticleType.BLACK_SMOKE, 1);
            }
        }

        if (!sectorState.busEventState) {
            const busTrigIdx = triggerSystem.getTriggerById(SectorEventID.S0_TUNNEL_BLOCKED, TriggerType.EVENT);
            if (triggerSystem.isTriggered(busTrigIdx)) {
                sectorState.busEventState = 1;
                sectorState.busEventTimer = simTime;
                events.setBubble(events.t("sector_events.0.0.reaction"));
            }
        }
        else if (sectorState.busEventState === 1 && simTime - sectorState.busEventTimer > 2000) {
            // ZERO-GC FIX: Instantly push state to prevent multi-frame trigger duplication
            sectorState.busEventState = 2;
            sectorState.busEventTimer = simTime;

            if (events.playSound) events.playSound(SoundID.EXPLOSION);
            if (events.cameraShake) events.cameraShake(15);

            events.setBubble(events.t("sector_events.0.1.reaction"));
        }
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
        else if (sectorState.busEventState === 3 && simTime - sectorState.busEventTimer > 2000) {
            sectorState.busEventState = 4;
            sectorState.busEventTimer = simTime;

            if (events.playSound) events.playSound(SoundID.EXPLOSION);
            if (events.cameraShake) events.cameraShake(15.0);

            if (events.makeNoise) {
                events.makeNoise(_trainYardPos, NoiseType.OTHER, 100);
            }
        }
        else if (sectorState.busEventState === 4 && simTime - sectorState.busEventTimer > 2000) {
            // ZERO-GC FIX: Instantly push state to prevent duplicate allocations
            sectorState.busEventState = 5;
            sectorState.busEventTimer = simTime;

            if (events.setCameraOverride) events.setCameraOverride(null);

            events.setBubble(events.t("sector_events.0.4.reaction"));

            // Start the wave using the EnemyWaveSystem
            const enemyWaveSystem = engine.systems.enemyWave as EnemyWaveSystem;
            if (enemyWaveSystem) {
                const spawns: Array<{ type: EnemyType; pos: { x: number; z: number } }> = [];
                for (let i = 0; i < SPOTS_ARRAY.length; i++) {
                    const spot = SPOTS_ARRAY[i];
                    for (let j = 0; j < 6; j++) {
                        spawns.push({
                            type: EnemyType.WALKER,
                            pos: { x: spot.x, z: spot.z }
                        });
                    }
                }
                const waveConfigs: EnemyWaveConfig[] = [{
                    name: 'Wave 1: The Tunnel Horde',
                    targetRatio: 0.8, // 80%
                    spawns: spawns,
                    attractorPos: { x: LOCATIONS.TRIGGERS.TUNNEL.x, z: LOCATIONS.TRIGGERS.TUNNEL.z }
                }];
                enemyWaveSystem.startWaveChain(waveConfigs);
            }
        }
        else if (sectorState.busEventState === 5) {
            if (!sectorState.waveActive) {
                sectorState.busEventState = 6;
                sectorState.busEventTimer = simTime;
                events.setBubble(events.t("sector_events.0.2.reaction"));

                sectorState.busCanBeInteractedWith = true;

                const busObj = (ctx as any).busObject;
                if (busObj) {
                    busObj.userData.isInteractable = true;
                }
            }
        }
        else if (sectorState.busEventState === 6 && sectorState.busInteractionTriggered) {
            sectorState.busEventState = 7;
            sectorState.busEventTimer = simTime;
            sectorState.lastBeepTime = simTime;

            const busObj = (ctx as any).busObject;
            if (busObj) {
                if (!sectorState.originalBusPos) sectorState.originalBusPos = new THREE.Vector3();
                sectorState.originalBusPos.copy(busObj.position);
                const busPos = busObj.position;

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

                const busRing = (ctx as any).busRing;
                if (busRing) {
                    busRing.position.copy(busPos);
                    busRing.position.y = 1.0;
                    busRing.visible = true;
                    busRing.material.opacity = 0;
                }
            }

            if (events.playTone) events.playTone(880, ToneType.SINE, 0.1, 0.2);
            if (events.setInteraction) events.setInteraction(null);
        }
        else if (sectorState.busEventState === 7) {
            const elapsed = simTime - sectorState.busEventTimer;
            const pos = (sectorState as any).originalBusPos || LOCATIONS.TRIGGERS.BUS;
            _busOriginalPos.copy(pos);

            if (elapsed < 3000) {
                const beepInterval = elapsed > 2000 ? 250 : 500;
                if (simTime - sectorState.lastBeepTime > beepInterval) {
                    sectorState.lastBeepTime = simTime;
                    if (events.playTone) events.playTone(880, ToneType.SINE, 0.1, 0.15);
                }

                const busRing = (ctx as any).busRing;
                if (busRing) {
                    const elapsedRender = renderTime - (sectorState.busEventTimer || renderTime);
                    const pulse = (Math.sin(elapsedRender * 0.01) + 1) * 0.5;
                    busRing.material.opacity = 0.3 + (pulse * 0.5);
                    busRing.scale.setScalar(1.0 + (pulse * 0.2));
                    busRing.material.color.setRGB(1.0, pulse, 0.0);
                }
            } else {
                sectorState.busEventState = 8;
                sectorState.busEventTimer = simTime;

                const busRing = (ctx as any).busRing;
                if (busRing) {
                    busRing.visible = false;
                    busRing.position.y = -1000;
                }

                sectorState.busExploded = true;
            }
        }
        else if (sectorState.busEventState === 8) {
            const elapsed = simTime - sectorState.busEventTimer;

            explodeBus(delta, simTime, renderTime, gameState, sectorState, ctx, events);

            if (elapsed > 10000 || (elapsed > 1000 && (!(ctx as any).busRubble?.userData.active))) {
                sectorState.busEventState = 9;
                sectorState.busEventTimer = simTime;

                if (events.setCameraOverride) events.setCameraOverride(null);

                events.setBubble(events.t("sector_events.0.3.reaction"));
            }
        }
        else if (sectorState.busEventState === 9 && !sectorState.lokeUnlocked) {
            sectorState.lokeUnlocked = true;
        }
        else if (sectorState.lokeUnlocked && !sectorState.lokeCinematicTriggered) {
            _v1.set(LOCATIONS.SPAWN.FAMILY.x, 0, LOCATIONS.SPAWN.FAMILY.z);
            if (playerPos.distanceToSquared(_v1) < 4) { // 2 units — matches setupContent trigger radius
                sectorState.lokeCinematicTriggered = true;
                if (events.startCinematic) {
                    // Pass Loke's mesh so the camera pans to him correctly
                    const lokeMesh = ctx.activeFamilyMembers?.find((fm: any) => fm.id === FamilyMemberID.LOKE)?.mesh || null;
                    events.startCinematic(lokeMesh, 0, 0);
                }
            }
        }
    },

    onPlayerRespawn: (ctx: SectorBuildContext, state: any, engine: any) => {
        if (!state.sectorState) return;

        // Reset wave variables
        state.sectorState.waveActive = false;
        state.sectorState.waveName = '';
        state.sectorState.waveProgress = 0;
        state.sectorState.waveKills = 0;
        state.sectorState.waveTarget = 0;

        // Reset bus event data
        state.sectorState.busEventState = 0;
        state.sectorState.busEventTimer = 0;
        state.sectorState.busExplosionHandled = false;
        state.sectorState.busExplosionTime = 0;
        state.sectorState.lastBeepTime = 0;
        state.sectorState.busInteractionTriggered = false;
        state.sectorState.busCanBeInteractedWith = false;
        state.sectorState.busExploded = false;
        state.sectorState.lokeUnlocked = false;

        const bus = (ctx as any).busObject;
        if (bus) {
            bus.position.set(LOCATIONS.TRIGGERS.BUS.x, LOCATIONS.TRIGGERS.BUS.y, LOCATIONS.TRIGGERS.BUS.z);
            bus.userData.isInteractable = false;
        }

        const rubble = (ctx as any).busRubble;
        if (rubble) {
            rubble.visible = false;
            rubble.position.y = -1000;
            if (rubble.userData) rubble.userData.active = false;
        }

        const tires = (ctx as any).busTires;
        if (tires) {
            tires.visible = false;
            tires.position.y = -1000;
            if (tires.userData) tires.userData.active = false;
        }

        const busRing = (ctx as any).busRing;
        if (busRing) {
            busRing.visible = false;
            busRing.position.y = -1000;
        }

        // Restore collision obstacle
        const colMesh = (ctx as any).busColMesh;
        const busSize = new THREE.Vector3();
        if (bus) {
            const busBox = new THREE.Box3().setFromObject(bus);
            busBox.getSize(busSize);
            const busCenter = new THREE.Vector3();
            busBox.getCenter(busCenter);

            if (colMesh) {
                colMesh.position.copy(busCenter);
                colMesh.visible = false;
            }

            const obstacle_bus = {
                id: EXPLODING_BUS_ID,
                mesh: colMesh,
                position: busCenter,
                collider: { type: ColliderType.BOX, size: busSize }
            };

            let exists = false;
            for (let i = 0; i < ctx.obstacles.length; i++) {
                if (ctx.obstacles[i] && ctx.obstacles[i].id === EXPLODING_BUS_ID) {
                    ctx.obstacles[i] = obstacle_bus;
                    exists = true;
                    break;
                }
            }
            if (!exists) {
                //ctx.obstacles.push(obstacle_bus);
                if (ctx.worldStreamer && typeof ctx.worldStreamer.registerObstacle === 'function') {
                    ctx.worldStreamer.registerObstacle(obstacle_bus);
                }
            }
        }

        // Re-register the S0_TUNNEL_BLOCKED event trigger if it got deleted
        const triggerSystem = ctx.engine.systems.triggerSystem;
        if (triggerSystem) {
            const existingIdx = triggerSystem.getTriggerById(SectorEventID.S0_TUNNEL_BLOCKED, TriggerType.EVENT);
            if (existingIdx === -1) {
                triggerSystem.addTrigger({
                    id: SectorEventID.S0_TUNNEL_BLOCKED,
                    type: TriggerType.EVENT,
                    x: LOCATIONS.TRIGGERS.BUS.x,
                    y: 0,
                    z: LOCATIONS.TRIGGERS.BUS.z,
                    radius: 15,
                    statusFlags: TriggerStatus.ACTIVE | TriggerStatus.ONCE,
                    actions: []
                });
            }

            const lokeIdx = triggerSystem.getTriggerById(FamilyMemberID.LOKE, TriggerType.EVENT);
            if (lokeIdx === -1) {
                triggerSystem.addTrigger({
                    id: FamilyMemberID.LOKE,
                    type: TriggerType.EVENT,
                    x: LOCATIONS.SPAWN.FAMILY.x,
                    y: 0,
                    z: LOCATIONS.SPAWN.FAMILY.z,
                    radius: 8,
                    statusFlags: TriggerStatus.ACTIVE | TriggerStatus.ONCE,
                    actions: [{ type: TriggerActionType.START_CINEMATIC, payload: { familyId: FamilyMemberID.LOKE, dialogueId: 0, sectorId: 0 } }]
                });
            }
        }
    },

};