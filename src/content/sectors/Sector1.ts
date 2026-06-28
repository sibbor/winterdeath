import * as THREE from 'three';
import { SectorDef, SectorBuildContext, EnvironmentalZone, ChestType, SectorEvent, SectorEventState, SectorEventConstraint, BossID } from '../../game/session/SectorTypes';
import { GroundType } from '../../core/engine/EnvironmentalTypes';
import { MATERIALS } from '../../utils/assets';
import { SectorBuilder } from '../../core/world/SectorBuilder';
import { InteractionType, InteractionSubType, InteractionShape } from '../../systems/ui/UIEventBridge';
import { VehicleID } from '../../entities/vehicles/VehicleTypes';
import { PathGenerator } from '../../core/world/generators/PathGenerator';
import { VegetationGenerator } from '../../core/world/generators/VegetationGenerator';
import { GeneratorUtils } from '../../core/world/generators/GeneratorUtils';
import { NaturePropGenerator } from '../../core/world/generators/NaturePropGenerator';
import { VEGETATION_TYPE, MaterialType } from '../../content/environment';
import { PoiType, PoiID } from '../../content/pois';
import { ClueID } from '../../content/clues';
import { CollectibleID } from '../../content/collectibles';
import { generateCaveSystem } from './Sector1_Cave';
import { audioEngine } from '../../utils/audio/AudioEngine';
import { SoundID, FXID } from '../../utils/audio/AudioTypes';
import { CAMERA_HEIGHT } from '../constants';
import { PlayerAnimator } from '../../entities/player/PlayerAnimator';
import { EnemyType } from '../../entities/enemies/EnemyTypes';
import { FamilyMemberID } from '../constants';
import { TriggerType, TriggerActionType, TriggerStatus } from '../../types/TriggerTypes';
import { WeatherType } from '../../core/engine/EnvironmentalTypes';
import { UIEventRingBuffer, UIEventType } from '../../systems/ui/UIEventRingBuffer';
import { FXParticleType } from '../../types/FXTypes';
import { isPointInPolygon } from '../../utils/math/GeometryUtils';
import { NavigationSystem } from '../../systems/NavigationSystem';

const _v1 = new THREE.Vector3();

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

    { x: -100, z: -68 },
    { x: 94, z: -70 },
    { x: 116, z: -71 },
    { x: 116, z: -83 },
    { x: 135, z: -90 },
    { x: 158, z: -90 },
    { x: 158, z: -25 },
    { x: 250, z: -14 },
    { x: 250, z: -300 },
    { x: -100, z: -300 }
    /*
    { x: -250, z: -50 },    // West Edge Entrance
    { x: 350, z: -50 },     // East Edge Entrance
    { x: 350, z: -500 },    // Deep North-East
    { x: -250, z: -500 }    // Deep North-West
    */
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
    { id: 1, x: 89, z: -88, zombies: 0 },
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
        CAVE_ENTRANCE: { x: 105, z: -77 },
        TUNNEL: { x: 165, z: -54 },
        CAMPFIRE: { x: 0, z: 12 },
        TRAIN_TUNNEL: { x: 165, z: -55 },
        BOSS_ROOM: { x: 61, z: -193 }
    },
    COLLECTIBLES: {
        C1: { x: 133, z: -75 },
        C2: { x: 155, z: -155 }
    },
    TRIGGERS: {
        START: { x: -1, z: 178 },
        COMBAT: { x: 10, z: 64 },
        CAVE_LIGHTS: { x: 89, z: -89 },
        CAVE_WATCH: { x: 116, z: -80 },
        CAVE_LOOT_1: { x: 150, z: -150 },
        CAVE_LOOT_2: { x: 100, z: -200 }
    }
} as const;

async function addProps(ctx: SectorBuildContext) {
    await SectorBuilder.spawnPoi(ctx, PoiType.CAMPFIRE, LOCATIONS.POIS.CAMPFIRE.x, LOCATIONS.POIS.CAMPFIRE.z, 0, { scale: 1.0, y: 0 });

    await SectorBuilder.spawnBarrel(ctx, 106, -55);
    await SectorBuilder.spawnBarrel(ctx, 108, -57);

    await SectorBuilder.spawnTimberPile(ctx, 80, -55, Math.PI * 0.25, 2);
    await SectorBuilder.spawnTimberPile(ctx, 77, -50, Math.PI * 0.20, 1.5);

    await SectorBuilder.spawnVehicle(ctx, 101, -54, Math.PI * 3.15, VehicleID.TIMBER_TRUCK, undefined, true);

    await SectorBuilder.spawnTimberPile(ctx, 77, -51, Math.PI * 1.26, 1.5);

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
        new THREE.Vector3(116, 0, -71),
    ], 'BoundryWall_LeftOfCave');

    await SectorBuilder.createBoundry(ctx, [
        new THREE.Vector3(116, 0, -83),
        new THREE.Vector3(124, 0, -87),
        new THREE.Vector3(135, 0, -90),
    ], 'BoundryWall_RightOfCave');
}

const KEYS = {
    jordanEventState: 'state',
    jordanEventTimer: 'timer',
    doorCloseSoundPlayed: 'b1',
    generatorOn: 'b2',
} as const;

const jordanRescueEvent: SectorEvent = {
    id: 'jordan_rescue',
    onStart: (ctx, eventState) => {
        eventState[KEYS.jordanEventState] = 0;
        eventState[KEYS.jordanEventTimer] = 0;
        eventState[KEYS.doorCloseSoundPlayed] = false;
        eventState[KEYS.generatorOn] = false;
    },
    onUpdate: (ctx, eventState) => {
        const { delta, simTime, renderTime, playerPos, gameState, engine } = ctx;
        const sectorState = gameState.sectorState;
        let mask = SectorEventConstraint.NONE;

        if (!eventState[KEYS.jordanEventState]) eventState[KEYS.jordanEventState] = 0;
        const jcState = eventState[KEYS.jordanEventState];
        const jcTimer = eventState[KEYS.jordanEventTimer] || 0;
        const elapsed = simTime - jcTimer;

        const scene = ctx.scene;

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
            // Animate survivors in the shelter
            const innerCave = scene.getObjectByName("Sector1_InnerCave");
            if (innerCave) {
                innerCave.traverse((child) => {
                    if (child.userData.isShelterHuman) {
                        const body = child.userData.cachedBody || child.children.find((c: any) => c.userData.isBody);
                        if (body) {
                            if (!child.userData.animState) {
                                child.userData.animState = {
                                    isMoving: false, isRushing: false, isDodging: false, dodgeStartTime: 0,
                                    staminaRatio: 1.0, isSpeaking: false, isThinking: false,
                                    isIdleLong: Math.random() > 0.5,
                                    isSwimming: false, isWading: false, seed: Math.random() * 1000,
                                    renderTime: 0, simTime: 0
                                };
                            }
                            const animState = child.userData.animState;
                            animState.renderTime = renderTime;
                            animState.simTime = simTime;
                            PlayerAnimator.update(body, animState, renderTime, delta);
                        }
                    }
                });
            }

            if (sectorState.pendingTrigger === 'SPAWN_JORDAN') {
                console.log("[Sector1] Processing SPAWN_JORDAN trigger");
                sectorState.pendingTrigger = null;
                eventState[KEYS.jordanEventState] = 3;
                eventState[KEYS.jordanEventTimer] = simTime;
                audioEngine.playSound(SoundID.DOOR_OPEN, 0.6);

                UIEventRingBuffer.push(UIEventType.HUD_VISIBILITY, 0, 0, simTime);

                if (ctx.setCameraOverride) {
                    ctx.setCameraOverride({
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
                eventState[KEYS.jordanEventState] = 6;
                eventState[KEYS.jordanEventTimer] = simTime;
            }

            if (jcState === 1) {
                if (elapsed > 1500) {
                    if (doorFrame && ctx.startCinematic) {
                        ctx.startCinematic(doorFrame, 1, 0, { targetPos: _fixedCamTarget, lookAtPos: _fixedCamLookAt, rotationSpeed: 0 });
                        eventState[KEYS.jordanEventState] = 2;
                        eventState[KEYS.jordanEventTimer] = simTime;
                    }
                }
            }
            else if (jcState === 3) {
                const openDist = Math.max(0, Math.min(10, elapsed * 0.005));
                if (doorL) { doorL.position.x = -5 - openDist; doorL.matrixAutoUpdate = true; }
                if (doorR) { doorR.position.x = 5 + openDist; doorR.matrixAutoUpdate = true; }

                if (sectorState.doorObstacleL) sectorState.doorObstacleL.isMutated = true;
                if (sectorState.doorObstacleR) sectorState.doorObstacleR.isMutated = true;
                if (sectorState.doorObstacleFrame) {
                    sectorState.doorObstacleFrame.isMutated = true;
                    if (sectorState.doorObstacleFrame.collider.size) {
                        sectorState.doorObstacleFrame.collider.size.set(0, 0, 0);
                    }
                }

                if (elapsed > 2000) {
                    eventState[KEYS.jordanEventState] = 4;
                    eventState[KEYS.jordanEventTimer] = simTime;

                    // Re-bake navigation cost map to clear pathfinding blocks
                    NavigationSystem.init(ctx.ctx);

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
                    if (playerPos) {
                        if (!sectorState.walkTarget) sectorState.walkTarget = new THREE.Vector3();
                        sectorState.walkTarget.set(playerPos.x, 0.06, playerPos.z);
                        const jPos = jordan.position;
                        _vS1.subVectors(playerPos, jPos);
                        _vS1.y = 0;
                        _vS1.normalize();
                        sectorState.walkTarget.sub(_vS1.multiplyScalar(2.0));
                    }
                    const target = sectorState.walkTarget || _fallbackWalkTarget;
                    const distToTarget = jordan.position.distanceTo(target);
                    const distToPlayer = playerPos ? jordan.position.distanceTo(playerPos) : Infinity;

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

                    if (distToTarget < 1.5 || distToPlayer < 4.0) {
                        eventState[KEYS.jordanEventState] = 5;
                        eventState[KEYS.jordanEventTimer] = simTime;
                        if (ctx.startCinematic) {
                            ctx.startCinematic(jordan, 1, 1, { targetPos: _fixedCamTarget, lookAtPos: _fixedCamLookAt, rotationSpeed: 0 });
                        }
                    }
                }
            }
            else if (jcState === 6) {
                const closeProgress = Math.max(0, Math.min(1, elapsed / 800));
                if (doorL) { doorL.position.x = -15 + (closeProgress * 10); doorL.matrixAutoUpdate = true; }
                if (doorR) { doorR.position.x = 15 - (closeProgress * 10); doorR.matrixAutoUpdate = true; }

                if (elapsed >= 800 && !eventState[KEYS.doorCloseSoundPlayed]) {
                    audioEngine.playSound(SoundID.DOOR_SHUT, 0.6);
                    eventState[KEYS.doorCloseSoundPlayed] = true;
                }

                if (elapsed > 1000) {
                    eventState[KEYS.jordanEventState] = 7;
                    eventState[KEYS.jordanEventTimer] = simTime;
                    if (ctx.setCameraOverride) ctx.setCameraOverride(null);
                    UIEventRingBuffer.push(UIEventType.HUD_VISIBILITY, 1, 0, simTime);

                    // --- COLLISION RESTORATION: Re-enable door colliders ---
                    const streamer = ctx.engine?.systems.worldStreamer;
                    if (streamer) {
                        if (sectorState.doorFrame) sectorState.doorFrame.updateMatrixWorld(true);

                        if (sectorState.doorObstacleL) {
                            sectorState.doorObstacleL.isMutated = false;
                            if (doorL) {
                                doorL.getWorldPosition(sectorState.doorObstacleL.position);
                                doorL.getWorldQuaternion(sectorState.doorObstacleL.quaternion);
                                streamer.updateObstacle(sectorState.doorObstacleL);
                            }
                        }
                        if (sectorState.doorObstacleR) {
                            sectorState.doorObstacleR.isMutated = false;
                            if (doorR) {
                                doorR.getWorldPosition(sectorState.doorObstacleR.position);
                                doorR.getWorldQuaternion(sectorState.doorObstacleR.quaternion);
                                streamer.updateObstacle(sectorState.doorObstacleR);
                            }
                        }
                        if (sectorState.doorObstacleFrame) {
                            sectorState.doorObstacleFrame.isMutated = false;
                            if (sectorState.doorObstacleFrame.collider?.size) {
                                sectorState.doorObstacleFrame.collider.size.set(22, 17, 4);
                            }
                            streamer.updateObstacle(sectorState.doorObstacleFrame);
                        }
                    }

                    // --- OPTIMIZATION: SEQUENTIAL CALLS AVOIDING ARRAY ALLOCATIONS ---
                    if (ctx.onAction) {
                        ctx.onAction({ type: TriggerActionType.SPAWN_BOSS, payload: { pos: LOCATIONS.SPAWN.BOSS } });
                    }
                }
            }
            else if (jcState === 7) {
                if (!sectorState.bossSpawned) {
                    sectorState.bossSpawned = true;
                    ctx.onAction({ type: TriggerActionType.SPAWN_BOSS, payload: { bossId: BossID.SECTOR_1 } });
                }
            }
        }

        // Apply cinematic active constraint flags
        if (jcState >= 1 && jcState < 7) {
            mask |= SectorEventConstraint.DISABLE_INPUT | SectorEventConstraint.DISABLE_TELEPORT | SectorEventConstraint.HIDE_HUD;
        }

        return mask;
    },
    onInteract: (id, object, ctx, eventState) => {
        const subType = object.userData.interactionSubType;
        if (subType === InteractionSubType.KNOCK_ON_PORT) {
            if (!eventState[KEYS.jordanEventState]) {
                eventState[KEYS.jordanEventState] = 1;
                eventState[KEYS.jordanEventTimer] = ctx.simTime;
                object.userData.isInteractable = false;
                if (ctx.setBubble) ctx.setBubble(ctx.t('ui.knocking'), 2000);
                audioEngine.playSound(SoundID.DOOR_KNOCK, 0.6);
                return true;
            }
        }

        if (id === 'cave_generator') {
            const isCurrentlyOn = !!eventState[KEYS.generatorOn];
            const nextState = !isCurrentlyOn;
            eventState[KEYS.generatorOn] = nextState;

            // Turn light color to green (on) or red (off)
            const light = object.getObjectByName('generator_light') as THREE.Mesh;
            if (light && light.material) {
                (light.material as THREE.MeshBasicMaterial).color.setHex(nextState ? 0x00ff00 : 0xff0000);
            }

            if (nextState) {
                // Play electric spark sound & spawn sparks
                ctx.playSound(SoundID.UI_UPGRADE);
                ctx.spawnParticle(object.position.x, object.position.y + 1, object.position.z + 0.45, FXParticleType.SPARK, 15);
            } else {
                // Play off switch click sound
                ctx.playSound(SoundID.UI_CONFIRM);
            }

            // Turn on/off all cave lights!
            const lights = ctx.gameState.world.lights;
            if (lights) {
                for (let i = 0; i < lights.length; i++) {
                    const l = lights[i];
                    if (l.isCaveLight) {
                        l.intensity = nextState ? (l.originalIntensity || 45) : 0;
                    }
                }
                if (ctx.engine && ctx.engine.systems.light) {
                    ctx.engine.systems.light.rebuildBuckets(lights);
                }
            }

            // Fire the clue trigger programmatically only the first time it is turned on
            if (nextState) {
                const triggerSystem = ctx.engine?.systems.triggerSystem;
                if (triggerSystem) {
                    const idx = triggerSystem.getTriggerById(ClueID.S1_CAVE_LIGHTS, TriggerType.CLUE);
                    if (idx !== -1 && !triggerSystem.isTriggered(idx)) {
                        triggerSystem.fireTrigger(idx, ctx.engine.onUpdateContext);
                    }
                }
            }

            return true;
        }

        return false;
    },
    onPlayerRespawn: (ctx, state, engine, eventState) => {
        // If checkpoint is active for Jordan, player respawns at boss (doors closed, not interactable, etc.)
        const isBossCheckpoint = state.checkpoint && state.checkpoint.active && state.checkpoint.familyMemberId === FamilyMemberID.JORDAN;
        if (isBossCheckpoint) {
            eventState[KEYS.jordanEventState] = 7;
            eventState[KEYS.jordanEventTimer] = engine.simTime;
            state.sectorState.bossSpawned = false; // Reset so boss spawns again on reload

            // Keep doors closed!
            const doorL = state.sectorState.doorL;
            const doorR = state.sectorState.doorR;
            if (doorL) doorL.position.x = -5;
            if (doorR) doorR.position.x = 5;

            // Disable doors interactable
            const doorFrame = state.sectorState.doorFrame;
            if (doorFrame) doorFrame.userData.isInteractable = false;
            return;
        }

        eventState[KEYS.jordanEventState] = 0;
        eventState[KEYS.jordanEventTimer] = 0;
        eventState[KEYS.doorCloseSoundPlayed] = false;
        eventState[KEYS.generatorOn] = false;
        state.sectorState.bossSpawned = false;

        const generator = engine.scene.getObjectByName('cave_generator');
        if (generator) {
            generator.userData.isInteractable = true;
            const light = generator.getObjectByName('generator_light') as THREE.Mesh;
            if (light && light.material) {
                (light.material as THREE.MeshBasicMaterial).color.setHex(0xff0000);
            }
        }

        // Also reset all cave lights back to 0 intensity
        const lights = state.world.lights;
        if (lights) {
            for (let i = 0; i < lights.length; i++) {
                const l = lights[i];
                if (l.isCaveLight) {
                    l.intensity = 0;
                }
            }
            if (engine.systems.light) {
                engine.systems.light.rebuildBuckets(lights);
            }
        }

        const doorL = state.sectorState.doorL;
        const doorR = state.sectorState.doorR;
        if (doorL) doorL.position.x = -5;
        if (doorR) doorR.position.x = 5;

        // Reset doors interactable
        const doorFrame = state.sectorState.doorFrame;
        if (doorFrame) doorFrame.userData.isInteractable = true;
    }
};

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
                position: { x: 170, y: 100, z: -190 }
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

    setupProps: async (ctx: SectorBuildContext) => {
        let startTime = performance.now();
        // ASYNC YIELDING: Prevents frame drops during asset generation
        const yieldIfBudgetExceeded = async () => {
            if (performance.now() - startTime > 12) {
                if (ctx.yield) await ctx.yield();
                startTime = performance.now();
            }
        };

        await SectorBuilder.spawnChest(ctx, LOCATIONS.SPAWN.BOSS.x, LOCATIONS.SPAWN.BOSS.z, ChestType.BIG, 0, undefined, 0.06);
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
        if ((ctx as any).sectorState) {
            (ctx as any).sectorState.railTrackCurve = railTrackCurve;
        }
        await yieldIfBudgetExceeded();

        // Poles
        const numPoles = 18;
        const poleWorldPositions: THREE.Vector3[][] = [];
        const xs = [-1.2, 0, 1.2];

        for (let i = 0; i <= numPoles; i++) {
            const t = i / numPoles;
            const pos = railTrackCurve.getPointAt(t);
            const tangent = railTrackCurve.getTangentAt(t);

            // Get normal vector to the right side of the track
            const normX = -tangent.z;
            const normZ = tangent.x;
            const len = Math.sqrt(normX * normX + normZ * normZ);
            const offsetDist = 8;

            const px = pos.x + (normX / len) * offsetDist;
            const pz = pos.z + (normZ / len) * offsetDist;
            const py = pos.y;

            const angle = Math.atan2(tangent.x, tangent.z);

            const pole = await SectorBuilder.spawnElectricPole(ctx, px, pz, angle);

            // Calculate insulator world positions for this pole
            const insulators: THREE.Vector3[] = [];
            for (let k = 0; k < xs.length; k++) {
                const xLocal = xs[k];
                const worldX = px + xLocal * Math.cos(angle);
                const worldZ = pz - xLocal * Math.sin(angle);
                const worldY = py + 9.2;
                insulators.push(new THREE.Vector3(worldX, worldY, worldZ));
            }
            poleWorldPositions.push(insulators);

            await yieldIfBudgetExceeded();
        }

        // Connect poles with wires
        const wireMaterial = new THREE.LineBasicMaterial({ color: 0x222222 });
        for (let i = 0; i < poleWorldPositions.length - 1; i++) {
            const insA = poleWorldPositions[i];
            const insB = poleWorldPositions[i + 1];

            for (let k = 0; k < xs.length; k++) {
                const pA = insA[k];
                const pB = insB[k];

                const pMid = new THREE.Vector3().addVectors(pA, pB).multiplyScalar(0.5);
                pMid.y -= 1.0; // Sag

                const bezier = new THREE.QuadraticBezierCurve3(pA, pMid, pB);
                const points = bezier.getPoints(12);
                const geom = new THREE.BufferGeometry().setFromPoints(points);
                const wireLine = new THREE.Line(geom, wireMaterial);

                ctx.scene.add(wireLine);
            }
            await yieldIfBudgetExceeded();
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

        // Campfire area exclusion (Campfire at 0,0)
        const campfireExclude = [
            new THREE.Vector3(-10, 0, 2),
            new THREE.Vector3(10, 0, 2),
            new THREE.Vector3(10, 0, 22),
            new THREE.Vector3(-10, 0, 22)
        ];

        await SectorBuilder.fillVegetation(ctx, [VEGETATION_TYPE.PINE, VEGETATION_TYPE.SPRUCE], forestLeft, 12, campfireExclude);
        await yieldIfBudgetExceeded();
        await SectorBuilder.fillVegetation(ctx, [VEGETATION_TYPE.PINE, VEGETATION_TYPE.SPRUCE], forestRight, 12, campfireExclude);
        await yieldIfBudgetExceeded();

        // --- BOUNDARIES ---
        await createBoundries(ctx, railTrackCurve);
        await yieldIfBudgetExceeded();

        // --- MOUNTAIN ---
        const mountainPoints = [
            new THREE.Vector3(-19, 0, -68),
            new THREE.Vector3(94, 0, -70),
            new THREE.Vector3(116, 0, -71),
            new THREE.Vector3(116, 0, -83),
            new THREE.Vector3(135, 0, -90),
            new THREE.Vector3(158, 0, -90),
            new THREE.Vector3(158, 0, -25),
            new THREE.Vector3(200, 0, -14)
        ];

        await SectorBuilder.createMountain(ctx, mountainPoints, 20, 20, {
            position: new THREE.Vector3(LOCATIONS.POIS.CAVE_ENTRANCE.x, 0, LOCATIONS.POIS.CAVE_ENTRANCE.z),
            rotation: Math.PI / 2,
            cutoutLength: 50
        });
        await yieldIfBudgetExceeded();

        // --- VISUAL MOUNTAIN BLOCKS TO COVER THE VOID BEHIND THE MOUNTAIN (x > 158) ---
        const rock1 = NaturePropGenerator.createRock(40, 45, 25);
        rock1.position.set(185, -2, -80);
        ctx.scene.add(rock1);

        const rock2 = NaturePropGenerator.createRock(50, 50, 30);
        rock2.position.set(195, -2, -40);
        ctx.scene.add(rock2);

        const rock3 = NaturePropGenerator.createRock(45, 45, 25);
        rock3.position.set(175, -2, -10);
        ctx.scene.add(rock3);

        await yieldIfBudgetExceeded();

        // --- POI: BLOCKED TRAIN TUNNEL ---
        await SectorBuilder.spawnPoi(ctx, PoiType.TRAIN_TUNNEL, LOCATIONS.POIS.TRAIN_TUNNEL.x, LOCATIONS.POIS.TRAIN_TUNNEL.z, 0, {
            points: [
                new THREE.Vector3(LOCATIONS.POIS.TRAIN_TUNNEL.x, 0, LOCATIONS.POIS.TRAIN_TUNNEL.z),
                new THREE.Vector3(LOCATIONS.POIS.TRAIN_TUNNEL.x + 10, 0, LOCATIONS.POIS.TRAIN_TUNNEL.z)
            ]
        });

        // Add rocks block the train tunnel:
        SectorBuilder.spawnRock(
            ctx,
            LOCATIONS.POIS.TRAIN_TUNNEL.x + 4,
            LOCATIONS.POIS.TRAIN_TUNNEL.z + 4,
            5, 20, 15);
        SectorBuilder.spawnRock(
            ctx,
            LOCATIONS.POIS.TRAIN_TUNNEL.x,
            LOCATIONS.POIS.TRAIN_TUNNEL.z - 5,
            15, 20, 15);
        SectorBuilder.spawnRock(
            ctx,
            LOCATIONS.POIS.TRAIN_TUNNEL.x,
            LOCATIONS.POIS.TRAIN_TUNNEL.z,
            10, 20, 15);
        SectorBuilder.spawnRock(
            ctx,
            LOCATIONS.POIS.TRAIN_TUNNEL.x + 10,
            LOCATIONS.POIS.TRAIN_TUNNEL.z + 2,
            10, 20, 15);

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

        await SectorBuilder.spawnFamily(ctx, FamilyMemberID.JORDAN, LOCATIONS.SPAWN.FAMILY.x, LOCATIONS.SPAWN.FAMILY.z, Math.PI, { following: false, found: false, visible: true });
    },

    setupContent: async (ctx: SectorBuildContext) => {
        const { scene } = ctx;

        // Reset Sector 1 narrative/event states on start/restart
        const sState = (ctx as any).sectorState;
        if (sState) {
            sState.jordanEventState = 0;
            sState.jordanEventTimer = 0;
            sState.walkTarget = null;
            sState.jordanMesh = null;
            sState.doorL = null;
            sState.doorR = null;
            sState.doorFrame = null;
            sState.wasInsideCave = false;
            sState.pendingTrigger = null;
            sState.doorObstacleFrame = null;
        }

        if (!ctx.isWarmup) {
            SectorBuilder.addTriggers(ctx, [
                { id: ClueID.S1_START, position: LOCATIONS.TRIGGERS.START, radius: 10, type: TriggerType.CLUE, content: "clues.1.0.reaction", statusFlags: TriggerStatus.ACTIVE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 50 } }] },
                { id: ClueID.S1_COMBAT, position: LOCATIONS.TRIGGERS.COMBAT, radius: 10, type: TriggerType.CLUE, content: "clues.1.1.reaction", statusFlags: TriggerStatus.ACTIVE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 50 } }] },
                { id: ClueID.S1_CAVE_LIGHTS, position: LOCATIONS.TRIGGERS.CAVE_LIGHTS, radius: 10, type: TriggerType.CLUE, content: "clues.1.2.reaction", statusFlags: TriggerStatus.NONE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 50 } }] },
                { id: ClueID.S1_CAVE_LOOT, position: LOCATIONS.TRIGGERS.CAVE_LOOT_1, radius: 15, type: TriggerType.CLUE, content: "clues.1.3.reaction", statusFlags: TriggerStatus.ACTIVE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 50 } }] },
                { id: ClueID.S1_CAVE_LOOT_MORE, position: LOCATIONS.TRIGGERS.CAVE_LOOT_2, radius: 15, type: TriggerType.CLUE, content: "clues.1.4.reaction", statusFlags: TriggerStatus.ACTIVE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 50 } }] },
                { id: PoiID.S1_CAMPFIRE, position: LOCATIONS.POIS.CAMPFIRE, radius: 10, type: TriggerType.POI, content: "pois.1.0.reaction", statusFlags: TriggerStatus.ACTIVE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 500 } }] },
                { id: PoiID.S1_TRAIN_TUNNEL, position: LOCATIONS.POIS.TRAIN_TUNNEL, radius: 15, type: TriggerType.POI, content: "pois.1.1.reaction", statusFlags: TriggerStatus.ACTIVE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 500 } }] },
                { id: PoiID.S1_CAVE_ENTRANCE, position: LOCATIONS.POIS.CAVE_ENTRANCE, radius: 12, type: TriggerType.POI, content: "pois.1.2.reaction", statusFlags: TriggerStatus.ACTIVE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 500 } }] },
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

        // Spawn interactable generator in first room
        const generator = SectorBuilder.spawnGenerator(ctx, 83, -100);
        SectorBuilder.addInteractable(ctx, generator, {
            id: 'cave_generator',
            type: InteractionType.SECTOR_SPECIFIC,
            label: 'ui.interact_turn_on_generator',
            collider: { type: InteractionShape.SPHERE, radius: 4.0 }
        });

    },

    onSectorUpdate: ({ delta, simTime, renderTime, playerPos, gameState, sectorState, ctx, ...events }) => {
        // --- OPTIMIZATION: CACHED REVERB CHECK ---
        // Avoids continuous WebAudio node adjustments every frame
        // Atmosphere/Weather is now handled by SectorSystem via SECTOR1_ZONES
        const insideCave = isPointInPolygon(playerPos.x, playerPos.z, CAVE_ENVIRONMENTAL_POLY);
        if (sectorState.wasInsideCave !== insideCave) {
            sectorState.wasInsideCave = insideCave;
            if (audioEngine.audioContext) {
                audioEngine.setReverb(insideCave ? 0.35 : 0);
            }

            // Toggle visibility of outside terrain to render cave cleanly from inside
            const sceneHost = (events as any).scene || (gameState as any).scene;
            const scene = sceneHost as THREE.Scene;
            if (scene) {
                const mountain = scene.getObjectByName("Mountain");
                if (mountain) mountain.visible = !insideCave;

                const ground = scene.getObjectByName("GROUND");
                if (ground) ground.visible = !insideCave;
            }
        }

        // Spawn zombies once at the beginning of gameplay (after EnemyManager init)
        if (!sectorState.zombiesSpawned) {
            sectorState.zombiesSpawned = true;

            // Spawn forest zombies on both sides of track
            if (sectorState.railTrackCurve && events.spawnZombie) {
                const tempV = new THREE.Vector3();
                const samples = 15;
                const curve = sectorState.railTrackCurve;
                for (let i = 0; i < samples; i++) {
                    const t = i / (samples - 1);
                    const trackPoint = curve.getPointAt(t);
                    const tangent = curve.getTangentAt(t);

                    const normX = -tangent.z;
                    const normZ = tangent.x;
                    const len = Math.sqrt(normX * normX + normZ * normZ);
                    const dirX = normX / len;
                    const dirZ = normZ / len;

                    // Spawn on left side (woods)
                    const leftDist = 12 + Math.random() * 33;
                    const leftX = trackPoint.x - dirX * leftDist;
                    const leftZ = trackPoint.z - dirZ * leftDist;
                    if (!(leftX > 86 && leftZ < -62) && leftZ > -55) {
                        tempV.set(leftX, 0, leftZ);
                        const type = Math.random() > 0.8 ? EnemyType.RUNNER : EnemyType.WALKER;
                        events.spawnZombie(type, tempV);
                    }

                    // Spawn on right side (woods)
                    const rightDist = 12 + Math.random() * 33;
                    const rightX = trackPoint.x + dirX * rightDist;
                    const rightZ = trackPoint.z + dirZ * rightDist;
                    if (rightZ > -55) {
                        tempV.set(rightX, 0, rightZ);
                        const type = Math.random() > 0.8 ? EnemyType.RUNNER : EnemyType.WALKER;
                        events.spawnZombie(type, tempV);
                    }
                }
            }

            // Spawn cave zombies at all times (immediately on load)
            if (events.spawnZombie) {
                for (let j = 0; j < ROOM_CENTERS.length; j++) {
                    const r = ROOM_CENTERS[j];
                    for (let i = 0; i < r.zombies; i++) {
                        const offX = (Math.random() - 0.5) * 20;
                        const offZ = (Math.random() - 0.5) * 20;
                        let type = EnemyType.WALKER;
                        if (r.id === 6 && Math.random() > 0.8) type = EnemyType.TANK;
                        if (r.id === 5 && Math.random() > 0.7) type = EnemyType.BLOATER;
                        else if (Math.random() > 0.7) type = EnemyType.RUNNER;

                        const pos = new THREE.Vector3(r.x + offX, 0, r.z + offZ);
                        events.spawnZombie(type, pos);
                    }
                }
            }
        }
    },

    events: [jordanRescueEvent]
};