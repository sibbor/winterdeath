import * as THREE from 'three';
import { SectorDef, SectorBuildContext, EnvironmentalZone, ChestType } from '../../game/session/SectorTypes';
import { GroundType } from '../../core/engine/EnvironmentalTypes';
import { MATERIALS } from '../../utils/assets';
import { SectorBuilder } from '../../core/world/SectorBuilder';
import { InteractionType, InteractionSubType, InteractionShape } from '../../systems/ui/UIEventBridge';
import { VehicleID } from '../../entities/vehicles/VehicleTypes';
import { PathGenerator } from '../../core/world/generators/PathGenerator';
import { VegetationGenerator } from '../../core/world/generators/VegetationGenerator';
import { VEGETATION_TYPE } from '../../content/environment';
import { PoiType, PoiID } from '../../content/pois';
import { ClueID } from '../../content/clues';
import { CollectibleID } from '../../content/collectibles';
import { generateCaveSystem } from './Sector1_Cave';
import { audioEngine } from '../../utils/audio/AudioEngine';
import { SoundID } from '../../utils/audio/AudioTypes';
import { CAMERA_HEIGHT } from '../constants';
import { PlayerAnimator } from '../../entities/player/PlayerAnimator';
import { EnemyType } from '../../entities/enemies/EnemyTypes';
import { FamilyMemberID } from '../constants';
import { TriggerType, TriggerActionType, TriggerStatus } from '../../types/TriggerTypes';
import { WeatherType } from '../../core/engine/EnvironmentalTypes';
import { UIEventRingBuffer, UIEventType } from '../../systems/ui/UIEventRingBuffer';
import { isPointInPolygon } from '../../utils/math/GeometryUtils';

// ============================================================================
// SECTOR CONSTANTS & ENVIRONMENTAL POLYGON
// ============================================================================
const DEFAULT_WEATHER_TYPE = WeatherType.SNOW;
const DEFAULT_WEATHER_PARTICLES = 3000;
const DEFAULT_WIND_STRENGTH_MIN = 0.3;
const DEFAULT_WIND_STRENGTH_MAX = 1.0;
const DEFAULT_WIND_VARIANCE = Math.PI / 4;

/**
 * Environmental polygon covering the mountain range and cave systems.
 * Ensures the 'outside' environment (Snow/Wind) is disabled exactly when
 * the player enters the cave or goes deep into the mountain shadows.
 */
const CAVE_ENVIRONMENTAL_POLY = [
    /*
        { x: -100, z: -68 },
        { x: 94, z: -70 },
        { x: 107, z: -70 },
        { x: 118, z: -85 },
        { x: 158, z: -90 },
        { x: 158, z: -25 },
        { x: 250, z: -14 },
        { x: 250, z: -300 },
        { x: -100, z: -300 }
    */
    { x: -250, z: -50 },    // West Edge Entrance
    { x: 350, z: -50 },     // East Edge Entrance
    { x: 350, z: -500 },    // Deep North-East
    { x: -250, z: -500 }    // Deep North-West
];

// ============================================================================
// ZERO-GC PRE-ALLOCATED GLOBALS (Hoisted to avoid runtime allocations)
// ============================================================================
const _vS1 = new THREE.Vector3();
const _animState = {
    isMoving: false, isRushing: false, isDodging: false, dodgeStartTime: 0,
    staminaRatio: 1.0, isSpeaking: false, isThinking: false, isIdleLong: false,
    isSwimming: false, isWading: false, seed: 0, renderTime: 0, simTime: 0
};

const _fixedCamTarget = new THREE.Vector3(60, 12, -193);
const _fixedCamLookAt = new THREE.Vector3(45, 1, -193);
const _fallbackJordanPos = new THREE.Vector3(25, 0, -193);
const _fallbackWalkTarget = new THREE.Vector3(52, 0, -193);

export const ENVIRONMENTAL_ZONES: EnvironmentalZone[] = [
    {
        label: "THE MOUNTAIN VAULT",
        polygon: CAVE_ENVIRONMENTAL_POLY,
        weather: WeatherType.NONE,
        weatherDensity: 0,
        //windStrength: 0,
        bgColor: 0x111118,
        fogDensity: 0.005,
        ambient: 0.2
    }
];

// Hoisted to prevent allocating 1 array + 4 objects every frame
const ROOM_CENTERS = [
    { id: 1, x: 100, z: -100, zombies: 0 },
    { id: 3, x: 150, z: -200, zombies: 3 },
    { id: 5, x: 100, z: -125, zombies: 5 },
    { id: 6, x: 60, z: -125, zombies: 5 },
] as const;

const LOCATIONS = {
    SPAWN: {
        PLAYER: { x: 0, z: 200, rot: Math.PI },
        FAMILY: { x: 25, z: -193, y: 0 },
        BOSS: { x: 74, z: -210 }
    },
    CINEMATIC: {
        OFFSET: { x: -8, y: 5, z: -25 },
        LOOK_AT: { x: 3, y: 1, z: 10 },
        ZOOM: 0.2
    },
    POIS: {
        CAVE_ENTRANCE: { x: 100, z: -70 },
        TUNNEL: { x: 165, z: -54 },
        CAMPFIRE: { x: 0, z: 12 },
        TRAIN_TUNNEL: { x: 150, z: -50 },
        BOSS_ROOM: { x: 61, z: -193 }
    },
    COLLECTIBLES: {
        C1: { x: 133, z: -75 },
        C2: { x: 155, z: -155 }
    },
    TRIGGERS: {
        START: { x: -1, z: 178 },
        COMBAT: { x: 10, z: 64 },
        CAVE_LIGHTS: { x: 100, z: -126 },
        CAVE_WATCH: { x: 100, z: -80 },
        CAVE_LOOT_1: { x: 150, z: -150 },
        CAVE_LOOT_2: { x: 100, z: -200 }
    }
} as const;

async function addProps(ctx: SectorBuildContext) {
    await SectorBuilder.spawnPoi(ctx, PoiType.CAMPFIRE, LOCATIONS.POIS.CAMPFIRE.x, LOCATIONS.POIS.CAMPFIRE.z, 0, { scale: 1.0, y: 0 });

    await SectorBuilder.spawnBarrel(ctx, 106, -65);
    await SectorBuilder.spawnBarrel(ctx, 108, -67);

    await SectorBuilder.spawnTimberPile(ctx, 92, -60, Math.PI * 0.25, 2);
    await SectorBuilder.spawnTimberPile(ctx, 88, -55, Math.PI * 0.20, 1.5);

    await SectorBuilder.spawnVehicle(ctx, 111, -64, Math.PI * 1.25, VehicleID.TIMBER_TRUCK, undefined, true);

    await VegetationGenerator.createDeforestation(ctx, 135, -75, 50, 30, 25);
}

async function createBoundries(ctx: SectorBuildContext, curve: THREE.Curve<THREE.Vector3>) {
    const boundryPoints = curve.getSpacedPoints(150);
    const wallOffset = 35;

    const blockPointsWest = PathGenerator.getOffsetPoints(boundryPoints, -wallOffset);
    const blockPointsEast = PathGenerator.getOffsetPoints(boundryPoints, wallOffset);

    const cavePos = new THREE.Vector3(LOCATIONS.POIS.CAVE_ENTRANCE.x, 0, LOCATIONS.POIS.CAVE_ENTRANCE.z);

    let splitIdx = -1;
    let minDist = Infinity;
    for (let i = 0; i < blockPointsWest.length; i++) {
        const d = blockPointsWest[i].distanceTo(cavePos);
        if (d < minDist) { minDist = d; splitIdx = i; }
    }

    if (splitIdx !== -1) {
        const gap = 10;
        const part1 = blockPointsWest.slice(0, Math.max(0, splitIdx - gap));
        const part2 = blockPointsWest.slice(Math.min(blockPointsWest.length, splitIdx + gap));
        if (part1.length > 1) await SectorBuilder.createBoundry(ctx, part1, 'BoundryWall_West_A');
        if (part2.length > 1) await SectorBuilder.createBoundry(ctx, part2, 'BoundryWall_West_B');
    } else {
        await SectorBuilder.createBoundry(ctx, blockPointsWest, 'BoundryWall_West');
    }

    await SectorBuilder.createBoundry(ctx, blockPointsEast, 'BoundryWall_East');

    await SectorBuilder.createBoundry(ctx, [
        new THREE.Vector3(-34, 0, 213),
        new THREE.Vector3(34, 0, 213)
    ], 'BoundryWall_Back');

    await SectorBuilder.createBoundry(ctx, [
        new THREE.Vector3(158, 0, -88),
        new THREE.Vector3(158, 0, -17),
    ], 'BoundryWall_Tunnel');

    await SectorBuilder.createBoundry(ctx, [
        new THREE.Vector3(55, 0, -65),
        new THREE.Vector3(94, 0, -70),
    ], 'BoundryWall_LeftOfCave');

    await SectorBuilder.createBoundry(ctx, [
        new THREE.Vector3(107, 0, -70),
        new THREE.Vector3(118, 0, -85),
        new THREE.Vector3(135, 0, -90),
    ], 'BoundryWall_RightOfCave');
}

export const Sector1: SectorDef = {
    id: 1,
    environment: {
        bgColor: 0x020208,
        fog: {
            density: 0.02,
            color: 0x020208,
            height: 10
        },
        groundColor: 0xddddff,
        ambient: 0.6,
        fov: 50,
        sky: {
            time: 0.1,
            atmosphereColor: 0x0a0a1a,
            celestial: {
                radius: 20,
                color: 0xaaccff,
                position: { x: 50, y: 35, z: 50 }
            },
            light: {
                visible: true,
                color: 0xaaccff,
                intensity: 0.5,
                castShadow: true
            }
        },
        cameraOffsetZ: 40,
        cameraHeight: CAMERA_HEIGHT,
        weather: {
            type: DEFAULT_WEATHER_TYPE,
            particles: DEFAULT_WEATHER_PARTICLES
        },
        wind: {
            strengthMin: DEFAULT_WIND_STRENGTH_MIN,
            strengthMax: DEFAULT_WIND_STRENGTH_MAX,
            angleVariance: DEFAULT_WIND_VARIANCE
        }
    },
    ground: GroundType.SNOW,
    groundSize: { width: 600, depth: 600 },
    ambientLoop: SoundID.AMBIENT_STORM,
    playerSpawn: LOCATIONS.SPAWN.PLAYER,
    bossSpawn: LOCATIONS.SPAWN.BOSS,
    environmentalZones: ENVIRONMENTAL_ZONES,
    collectibles: [
        { id: CollectibleID.S1_COLLECTIBLE_1, x: LOCATIONS.COLLECTIBLES.C1.x, z: LOCATIONS.COLLECTIBLES.C1.z },
        { id: CollectibleID.S1_COLLECTIBLE_2, x: LOCATIONS.COLLECTIBLES.C2.x, z: LOCATIONS.COLLECTIBLES.C2.z }
    ],

    cinematic: {
        offset: { x: 20, y: 8, z: 0 },
        lookAtOffset: { x: -20, y: -5, z: 0 },
        rotationSpeed: 0,
        zoom: 0.1
    },

    setupProps: async (ctx: SectorBuildContext) => {
        let startTime = performance.now();
        // ASYNC YIELDING: Prevents frame drops during asset generation
        const yieldIfBudgetExceeded = async () => {
            if (performance.now() - startTime > 12) {
                if (ctx.yield) await ctx.yield();
                startTime = performance.now();
            }
        };

        await SectorBuilder.spawnChest(ctx, LOCATIONS.SPAWN.BOSS.x, LOCATIONS.SPAWN.BOSS.z, ChestType.BIG);
        await yieldIfBudgetExceeded();

        // --- RAILWAY ---
        const railRoadPath = [
            new THREE.Vector3(0, 0, 240),
            new THREE.Vector3(0, 0, 120),
            new THREE.Vector3(10, 0, 60),
            new THREE.Vector3(40, 0, 0),
            new THREE.Vector3(LOCATIONS.POIS.CAVE_ENTRANCE.x, 0, -50),
            new THREE.Vector3(200, 0, -53)
        ];
        const railTrackCurve = await PathGenerator.createRailTrack(ctx, railRoadPath);
        await yieldIfBudgetExceeded();

        const polyline = railTrackCurve.getSpacedPoints(15);
        for (let i = 0; i < polyline.length; i++) {
            if (i % 3 === 0) {
                await SectorBuilder.spawnElectricPole(ctx, polyline[i].x + 8, polyline[i].z, 0);
                await yieldIfBudgetExceeded();
            }
        }

        // --- FOREST ---
        const forestOffset = 8;
        const forestDepth = 70;
        const forestSamples = 80;
        const fPoints = railTrackCurve.getSpacedPoints(forestSamples);

        const filterPointsBeforeCave = (points: THREE.Vector3[]) => {
            return points.filter(p => !(p.x > 86 && p.z < -62) && p.z > -55);
        };

        const forestLeft = [
            ...filterPointsBeforeCave(PathGenerator.getOffsetPoints(fPoints, -forestOffset)),
            ...filterPointsBeforeCave(PathGenerator.getOffsetPoints(fPoints, -(forestOffset + forestDepth))).reverse()
        ];
        const forestRight = [
            ...PathGenerator.getOffsetPoints(fPoints, forestOffset),
            ...PathGenerator.getOffsetPoints(fPoints, forestOffset + forestDepth).reverse()
        ];

        for (let i = 0; i < forestLeft.length; i++) forestLeft[i].y = 0;
        for (let i = 0; i < forestRight.length; i++) forestRight[i].y = 0;

        await SectorBuilder.fillVegetation(ctx, [VEGETATION_TYPE.PINE, VEGETATION_TYPE.SPRUCE], forestLeft, 12);
        await yieldIfBudgetExceeded();
        await SectorBuilder.fillVegetation(ctx, [VEGETATION_TYPE.PINE, VEGETATION_TYPE.SPRUCE], forestRight, 12);
        await yieldIfBudgetExceeded();

        // --- BOUNDARIES ---
        await createBoundries(ctx, railTrackCurve);
        await yieldIfBudgetExceeded();

        // --- MOUNTAIN & CAVE OPENING ---
        const mountainPoints = [
            new THREE.Vector3(-19, 0, -68),
            new THREE.Vector3(94, 0, -70),
            new THREE.Vector3(107, 0, -70),
            new THREE.Vector3(118, 0, -85),
            new THREE.Vector3(158, 0, -90),
            new THREE.Vector3(158, 0, -25),
            new THREE.Vector3(200, 0, -14)
        ];

        await SectorBuilder.createMountain(ctx, mountainPoints, 20, 20, {
            position: new THREE.Vector3(LOCATIONS.POIS.CAVE_ENTRANCE.x, 0, LOCATIONS.POIS.CAVE_ENTRANCE.z - 2),
            rotation: 0
        });
        await yieldIfBudgetExceeded();

        await SectorBuilder.spawnPoi(ctx, PoiType.TRAIN_TUNNEL, LOCATIONS.POIS.TUNNEL.x, LOCATIONS.POIS.TUNNEL.z, 0, {
            points: [
                new THREE.Vector3(LOCATIONS.POIS.TUNNEL.x, 0, LOCATIONS.POIS.TUNNEL.z),
                new THREE.Vector3(LOCATIONS.POIS.TUNNEL.x + 10, 0, LOCATIONS.POIS.TUNNEL.z)
            ]
        });
        await yieldIfBudgetExceeded();

        await addProps(ctx);

        // --- PATHS ---
        await PathGenerator.createDecalPath(ctx, [
            new THREE.Vector3(12, 0, 43), new THREE.Vector3(8, 0, 33), new THREE.Vector3(3, 0, 29), new THREE.Vector3(2, 0, 21), new THREE.Vector3(-1, 0, 13)
        ], { spacing: 0.6, size: 0.4, material: MATERIALS.footprintDecal, variance: 0.2 });
        await yieldIfBudgetExceeded();

        await PathGenerator.createDecalPath(ctx, [
            new THREE.Vector3(2, 0, 10), new THREE.Vector3(10, 0, 6), new THREE.Vector3(17, 0, 3), new THREE.Vector3(23, 0, -2), new THREE.Vector3(36, 0, -5), new THREE.Vector3(42, 0, -9)
        ], { spacing: 0.6, size: 0.4, material: MATERIALS.footprintDecal, variance: 0.2 });
        await yieldIfBudgetExceeded();

        await PathGenerator.createDecalPath(ctx, [
            new THREE.Vector3(157, 0, -58), new THREE.Vector3(150, 0, -63), new THREE.Vector3(147, 0, -71), new THREE.Vector3(135, 0, -75), new THREE.Vector3(122, 0, -78), new THREE.Vector3(110, 0, -76), new THREE.Vector3(100, 0, -80)
        ], { spacing: 0.6, size: 0.4, material: MATERIALS.footprintDecal, variance: 0.2 });
        await yieldIfBudgetExceeded();

        await SectorBuilder.spawnFamily(ctx, FamilyMemberID.JORDAN, LOCATIONS.SPAWN.FAMILY.x, LOCATIONS.SPAWN.FAMILY.z, Math.PI, { following: false, visible: false });
    },

    setupContent: async (ctx: SectorBuildContext) => {
        const { scene } = ctx;

        if (!ctx.isWarmup) {
            SectorBuilder.addTriggers(ctx, [
                { id: ClueID.S1_START, position: LOCATIONS.TRIGGERS.START, radius: 10, type: TriggerType.CLUE, content: "clues.1.0.reaction", statusFlags: TriggerStatus.ACTIVE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 50 } }] },
                { id: ClueID.S1_COMBAT, position: LOCATIONS.TRIGGERS.COMBAT, radius: 10, type: TriggerType.CLUE, content: "clues.1.1.reaction", statusFlags: TriggerStatus.ACTIVE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 50 } }] },
                { id: ClueID.S1_CAVE_LIGHTS, position: LOCATIONS.TRIGGERS.CAVE_LIGHTS, radius: 10, type: TriggerType.CLUE, content: "clues.1.2.reaction", statusFlags: TriggerStatus.ACTIVE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 50 } }] },
                { id: ClueID.S1_CAVE_LOOT, position: LOCATIONS.TRIGGERS.CAVE_LOOT_1, radius: 15, type: TriggerType.CLUE, content: "clues.1.3.reaction", statusFlags: TriggerStatus.ACTIVE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 50 } }] },
                { id: ClueID.S1_CAVE_LOOT_MORE, position: LOCATIONS.TRIGGERS.CAVE_LOOT_2, radius: 15, type: TriggerType.CLUE, content: "clues.1.4.reaction", statusFlags: TriggerStatus.ACTIVE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 50 } }] },
                { id: PoiID.S1_CAMPFIRE, position: LOCATIONS.POIS.CAMPFIRE, radius: 10, type: TriggerType.POI, content: "pois.1.0.reaction", statusFlags: TriggerStatus.ACTIVE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 500 } }] },
                { id: PoiID.S1_TRAIN_TUNNEL, position: LOCATIONS.POIS.TRAIN_TUNNEL, radius: 15, type: TriggerType.POI, content: "pois.1.1.reaction", statusFlags: TriggerStatus.ACTIVE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 500 } }] },
                { id: PoiID.S1_CAVE_ENTRANCE, position: LOCATIONS.POIS.CAVE_ENTRANCE, radius: 15, type: TriggerType.POI, content: "pois.1.2.reaction", statusFlags: TriggerStatus.ACTIVE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 500 } }] },
                { id: PoiID.S1_MOUNTAIN_VAULT, position: LOCATIONS.POIS.BOSS_ROOM, radius: 30, type: TriggerType.POI, content: "pois.1.3.reaction", statusFlags: TriggerStatus.ACTIVE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 500 } }] }
            ]);
        }

        const innerCave = new THREE.Group();
        innerCave.name = "Sector1_InnerCave";
        scene.add(innerCave);
        await generateCaveSystem(ctx, innerCave);

        const doorFrame = scene.getObjectByName('s1_shelter_port_frame');
        if (doorFrame) {
            SectorBuilder.addInteractable(ctx, doorFrame, {
                id: 'cave_door',
                type: InteractionType.SECTOR_SPECIFIC,
                subType: InteractionSubType.KNOCK_ON_PORT,
                label: 'ui.interact_knock_on_port',
                collider: { type: InteractionShape.SPHERE, radius: 12.0 }
            });
        }
    },

    onInteract: (id: string, object: THREE.Object3D, state: any, events: any) => {
        const subType = object.userData.interactionSubType;

        if (subType === InteractionSubType.KNOCK_ON_PORT) {
            if (!state.sectorState.jordanEventState) {
                state.sectorState.jordanEventState = 1;
                state.sectorState.jordanEventTimer = state.simTime;
                object.userData.isInteractable = false;
                events.setBubble(events.t('ui.knocking'), 2000);
                audioEngine.playSound(SoundID.DOOR_KNOCK, 0.6);
            }
        }
    },

    onSectorUpdate: ({ delta, simTime, renderTime, playerPos, gameState, sectorState, ...events }) => {
        // --- OPTIMIZATION: CACHED REVERB CHECK ---
        // Avoids continuous WebAudio node adjustments every frame
        // Atmosphere/Weather is now handled by SectorSystem via SECTOR1_ZONES
        const insideCave = isPointInPolygon(playerPos.x, playerPos.z, CAVE_ENVIRONMENTAL_POLY);
        if (sectorState.wasInsideCave !== insideCave) {
            sectorState.wasInsideCave = insideCave;
            if (audioEngine.ctx) {
                audioEngine.setReverb(insideCave ? 0.35 : 0);
            }
        }

        if (!sectorState.jordanEventState) sectorState.jordanEventState = 0;
        const jcState = sectorState.jordanEventState;
        const jcTimer = sectorState.jordanEventTimer || 0;
        const elapsed = simTime - jcTimer;

        const sceneHost = (events as any).scene || (gameState as any).scene;
        const scene = sceneHost as THREE.Scene;

        // --- ZERO-GC SCENE CACHING ---
        if (!sectorState.jordanMesh && scene) {
            sectorState.jordanMesh = scene.children.find(c => (c.userData.isFamilyMember || c.userData.type === 'family') && c.userData.name === 'Jordan');
        }
        if (!sectorState.doorL && scene) sectorState.doorL = scene.getObjectByName('s1_shelter_port_left');
        if (!sectorState.doorR && scene) sectorState.doorR = scene.getObjectByName('s1_shelter_port_right');
        if (!sectorState.doorFrame && scene) sectorState.doorFrame = scene.getObjectByName('s1_shelter_port_frame');

        const jordan = sectorState.jordanMesh;
        const doorL = sectorState.doorL;
        const doorR = sectorState.doorR;
        const doorFrame = sectorState.doorFrame;

        if (scene) {
            //const voidRoof = scene.getObjectByName("Sector1_VoidRoof");
            //if (voidRoof) voidRoof.visible = true;

            if (sectorState.pendingTrigger === 'SPAWN_JORDAN') {
                console.log("[Sector1] Processing SPAWN_JORDAN trigger");
                sectorState.pendingTrigger = null;
                sectorState.jordanEventState = 3;
                sectorState.jordanEventTimer = simTime;
                audioEngine.playSound(SoundID.DOOR_OPEN, 0.6);

                UIEventRingBuffer.push(UIEventType.HUD_COMMAND, 0, 0, simTime);

                if (events.setCameraOverride) {
                    events.setCameraOverride({
                        active: true,
                        targetPos: _fixedCamTarget,
                        lookAtPos: _fixedCamLookAt,
                        endTime: renderTime + 60000
                    });
                }
            }

            if (sectorState.pendingTrigger === 'CLOSE_DOORS') {
                console.log("[Sector1] Processing CLOSE_DOORS trigger");
                sectorState.pendingTrigger = null;
                sectorState.jordanEventState = 6;
                sectorState.jordanEventTimer = simTime;
            }

            if (jcState === 1) {
                if (elapsed > 1500) {
                    if (doorFrame && (events as any).startCinematic) {
                        (events as any).startCinematic(doorFrame, 1, 0, { targetPos: _fixedCamTarget, lookAtPos: _fixedCamLookAt });
                        sectorState.jordanEventState = 2;
                        sectorState.jordanEventTimer = simTime;
                    }
                }
            }
            else if (jcState === 3) {
                const openDist = Math.max(0, Math.min(10, elapsed * 0.005));
                if (doorL) { doorL.position.x = -5 - openDist; doorL.matrixAutoUpdate = true; }
                if (doorR) { doorR.position.x = 5 + openDist; doorR.matrixAutoUpdate = true; }

                if (sectorState.doorObstacleL?.collider) sectorState.doorObstacleL.collider.size.set(0, 0, 0);
                if (sectorState.doorObstacleR?.collider) sectorState.doorObstacleR.collider.size.set(0, 0, 0);

                if (elapsed > 2000) {
                    sectorState.jordanEventState = 4;
                    sectorState.jordanEventTimer = simTime;

                    // --- OPTIMIZATION: ZERO-GC VECTOR MATH ---
                    if (!sectorState.walkTarget) sectorState.walkTarget = new THREE.Vector3();

                    if (playerPos) {
                        sectorState.walkTarget.set(playerPos.x, 0, playerPos.z);
                        const jPos = jordan?.position || _fallbackJordanPos;

                        _vS1.subVectors(playerPos, jPos).normalize();
                        sectorState.walkTarget.sub(_vS1.multiplyScalar(2.0));
                    } else {
                        sectorState.walkTarget.copy(_fallbackWalkTarget);
                    }
                }
            }
            else if (jcState === 4) {
                if (jordan) {
                    const target = sectorState.walkTarget || _fallbackWalkTarget;
                    jordan.position.lerp(target, 0.05);

                    const body = jordan.userData.cachedBody || jordan.children.find((c: any) => c.userData.isBody);
                    if (body) {
                        _animState.isMoving = true;
                        _animState.isRushing = false;
                        _animState.isDodging = false;
                        _animState.dodgeStartTime = 0;
                        _animState.staminaRatio = 1.0;
                        _animState.isSpeaking = gameState.speakingUntil > simTime;
                        _animState.isThinking = false;
                        _animState.isIdleLong = false;
                        _animState.isSwimming = false;
                        _animState.isWading = false;
                        _animState.seed = jordan.userData.seed || 0;
                        _animState.renderTime = renderTime;
                        _animState.simTime = simTime;

                        PlayerAnimator.update(body, _animState, renderTime, delta);
                    }

                    if (jordan.position.distanceTo(target) < 1.5) {
                        sectorState.jordanEventState = 5;
                        sectorState.jordanEventTimer = simTime;
                        if (events.startCinematic) {
                            events.startCinematic(jordan, 1, 1, { targetPos: _fixedCamTarget, lookAtPos: _fixedCamLookAt });
                        }
                    }
                }
            }
            else if (jcState === 6) {
                const closeProgress = Math.max(0, Math.min(1, elapsed / 800));
                if (doorL) { doorL.position.x = -15 + (closeProgress * 10); doorL.matrixAutoUpdate = true; }
                if (doorR) { doorR.position.x = 15 - (closeProgress * 10); doorR.matrixAutoUpdate = true; }

                if (elapsed >= 800 && !sectorState.doorCloseSoundPlayed) {
                    audioEngine.playSound(SoundID.DOOR_SHUT, 0.6);
                    sectorState.doorCloseSoundPlayed = true;
                }

                if (elapsed > 1000) {
                    sectorState.jordanEventState = 7;
                    sectorState.jordanEventTimer = simTime;
                    if (events.setCameraOverride) events.setCameraOverride(null);
                    UIEventRingBuffer.push(UIEventType.HUD_COMMAND, 1, 0, simTime);

                    // --- OPTIMIZATION: SEQUENTIAL CALLS AVOIDING ARRAY ALLOCATIONS ---
                    if (events.onAction) {
                        events.onAction({ type: TriggerActionType.FAMILY_MEMBER_FOUND, payload: { id: FamilyMemberID.JORDAN } });
                        events.onAction({ type: TriggerActionType.FAMILY_MEMBER_FOLLOW });
                        events.onAction({ type: TriggerActionType.SPAWN_BOSS, payload: { pos: LOCATIONS.SPAWN.BOSS } });
                    }
                }
            }
        }

        // --- OPTIMIZATION: HOISTED ROOM CENTERS SPAWN CHECK ---
        if (!sectorState.spawnedRooms) sectorState.spawnedRooms = {};

        for (let j = 0; j < ROOM_CENTERS.length; j++) {
            const r = ROOM_CENTERS[j];
            if (!sectorState.spawnedRooms[r.id]) {
                const dist = Math.sqrt((playerPos.x - r.x) ** 2 + (playerPos.z - r.z) ** 2);
                if (dist < 30) {
                    sectorState.spawnedRooms[r.id] = true;
                    for (let i = 0; i < r.zombies; i++) {
                        const offX = (Math.random() - 0.5) * 20;
                        const offZ = (Math.random() - 0.5) * 20;
                        let type = EnemyType.WALKER;
                        if (r.id === 6 && Math.random() > 0.8) type = EnemyType.TANK;
                        if (r.id === 5 && Math.random() > 0.7) type = EnemyType.BOMBER;
                        else if (Math.random() > 0.7) type = EnemyType.RUNNER;

                        _vS1.set(r.x + offX, 0, r.z + offZ);
                        events.spawnZombie(type, _vS1);
                    }
                }
            }
        }
    }
};
