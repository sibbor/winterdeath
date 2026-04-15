import * as THREE from 'three';
import { SectorDef, SectorContext } from '../../game/session/SectorTypes';
import { MATERIALS } from '../../utils/assets';
import { SectorBuilder } from '../../core/world/SectorBuilder';
import { InteractionType } from '../../systems/InteractionTypes';
import { PathGenerator } from '../../core/world/generators/PathGenerator';
import { VegetationGenerator } from '../../core/world/generators/VegetationGenerator';
import { VEGETATION_TYPE } from '../../content/environment';
import { POI_TYPE } from '../../content/pois';
import { generateCaveSystem } from './Sector1_Cave';
import { audioEngine } from '../../utils/audio/AudioEngine';
import { SoundID } from '../../utils/audio/AudioTypes';
import { CAMERA_HEIGHT } from '../constants';
import { PlayerAnimator } from '../../entities/player/PlayerAnimator';
import { EnemyType } from '../../entities/enemies/EnemyTypes';
import { FamilyMemberID } from '../constants';
import { TriggerType, TriggerActionType, TriggerStatus } from '../../systems/TriggerTypes';

const _vS1 = new THREE.Vector3(); // Zero-GC Scratchpad

const LOCATIONS = {
    SPAWN: {
        PLAYER: { x: 0, z: 200, rot: Math.PI },
        // When editing the mountain:
        //PLAYER: { x: 100, z: -60, rot: Math.PI },
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
        TRAIN_TUNNEL: { x: 170, z: -50 },
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

async function addProps(ctx: SectorContext) {
    SectorBuilder.spawnPoi(ctx, POI_TYPE.CAMPFIRE, LOCATIONS.POIS.CAMPFIRE.x, LOCATIONS.POIS.CAMPFIRE.z, 0, { scale: 1.0, y: 0 });

    SectorBuilder.spawnBarrel(ctx, 106, -65);
    SectorBuilder.spawnBarrel(ctx, 108, -67);

    SectorBuilder.spawnTimberPile(ctx, 92, -60, Math.PI * 0.25, 2);
    SectorBuilder.spawnTimberPile(ctx, 88, -55, Math.PI * 0.20, 1.5);

    SectorBuilder.spawnVehicle(ctx, 111, -64, Math.PI * 1.25, 'timber_truck', undefined, true);

    VegetationGenerator.createDeforestation(ctx, 135, -75, 50, 30, 25);

    // Sparse grass
    /*
    const sparseGrass = [
        new THREE.Vector3(-10, 0, 160),
        new THREE.Vector3(20, 0, 160),
        new THREE.Vector3(20, 0, 190),
        new THREE.Vector3(-10, 0, 190)
    ];
    VegetationGenerator.fillAreaWithGrass(ctx, sparseGrass, 0.8);
    */


    // Fallen trees near cave
    /*
    for (let i = 0; i < 8; i++) {
        const deadTree = VegetationGenerator.createDeadTree('fallen', 0.7 + Math.random() * 0.5);
        deadTree.position.set(85 + (Math.random() - 0.5) * 30, 0, -70 + (Math.random() - 0.5) * 20);
        ctx.scene.add(deadTree);
    }
    */
}

function spawnSectorHordes(ctx: SectorContext) {
    return;
}

function createBoundries(ctx: SectorContext, curve: THREE.Curve<THREE.Vector3>) {
    const boundryPoints = curve.getSpacedPoints(150);
    const wallOffset = 35;

    const blockPointsWest = PathGenerator.getOffsetPoints(boundryPoints, -wallOffset);
    const blockPointsEast = PathGenerator.getOffsetPoints(boundryPoints, wallOffset);

    // West wall needs a gap for the cave entrance
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
        if (part1.length > 1) SectorBuilder.createBoundry(ctx, part1, 'BoundryWall_West_A');
        if (part2.length > 1) SectorBuilder.createBoundry(ctx, part2, 'BoundryWall_West_B');
    } else {
        SectorBuilder.createBoundry(ctx, blockPointsWest, 'BoundryWall_West');
    }

    // East wall is continuous
    SectorBuilder.createBoundry(ctx, blockPointsEast, 'BoundryWall_East');

    SectorBuilder.createBoundry(ctx, [
        new THREE.Vector3(-34, 0, 213),
        new THREE.Vector3(34, 0, 213)
    ], 'BoundryWall_Back');

    SectorBuilder.createBoundry(ctx, [
        new THREE.Vector3(158, 0, -88),
        new THREE.Vector3(158, 0, -17),
    ], 'BoundryWall_Tunnel');

    SectorBuilder.createBoundry(ctx, [
        new THREE.Vector3(55, 0, -65),
        new THREE.Vector3(94, 0, -70),

    ], 'BoundryWall_LeftOfCave');

    SectorBuilder.createBoundry(ctx, [
        new THREE.Vector3(107, 0, -70),
        new THREE.Vector3(118, 0, -85),
        new THREE.Vector3(135, 0, -90),
    ], 'BoundryWall_RightOfCave');
}

export const Sector1: SectorDef = {
    id: 1,
    name: "sectors.sector_1_name",
    environment: {
        bgColor: 0x020208,
        fog: {
            density: 200,
            color: 0x020208,
            height: 10
        },
        ambientIntensity: 0.4,
        ambientColor: 0x404050,
        groundColor: 0xddddff,
        fov: 50,
        skyLight: { visible: true, color: 0x6688ff, intensity: 10.0, position: { x: 50, y: 35, z: 50 } },
        cameraOffsetZ: 40,
        cameraHeight: CAMERA_HEIGHT,
        weather: {
            type: 'snow',
            particles: 3000
        }, wind: {
            strengthMin: 0.3,
            strengthMax: 1.0,
            angleVariance: Math.PI / 4
        }
    },
    groundType: 'SNOW',
    groundSize: { width: 600, depth: 600 },
    ambientLoop: SoundID.AMBIENT_STORM,
    playerSpawn: LOCATIONS.SPAWN.PLAYER,
    bossSpawn: LOCATIONS.SPAWN.BOSS,
    collectibles: [
        { id: 's1_collectible_1', x: LOCATIONS.COLLECTIBLES.C1.x, z: LOCATIONS.COLLECTIBLES.C1.z },
        { id: 's1_collectible_2', x: LOCATIONS.COLLECTIBLES.C2.x, z: LOCATIONS.COLLECTIBLES.C2.z }
    ],

    cinematic: {
        offset: { x: 20, y: 8, z: 0 },
        lookAtOffset: { x: -20, y: -5, z: 0 },
        rotationSpeed: 0,
        zoom: 0.1
    },

    setupProps: async (ctx: SectorContext) => {
        const { scene } = ctx;
        (ctx as any).sectorState.ctx = ctx;

        // Reward Chest at boss spawn
        SectorBuilder.spawnChest(ctx, LOCATIONS.SPAWN.BOSS.x, LOCATIONS.SPAWN.BOSS.z, 'big');

        // --- RAILWAY ---
        const railRoadPath = [
            new THREE.Vector3(0, 0, 240),
            new THREE.Vector3(0, 0, 120),
            new THREE.Vector3(10, 0, 60),
            new THREE.Vector3(40, 0, 0),
            new THREE.Vector3(LOCATIONS.POIS.CAVE_ENTRANCE.x, 0, -50),
            new THREE.Vector3(200, 0, -53)
        ];
        const railTrackCurve = PathGenerator.createRailTrack(ctx, railRoadPath);

        // Electric Poles along Railway
        const polyline = railTrackCurve.getSpacedPoints(15);
        for (let i = 0; i < polyline.length; i++) {
            if (i % 3 === 0) {
                SectorBuilder.spawnElectricPole(ctx, polyline[i].x + 8, polyline[i].z, 0);
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

        SectorBuilder.fillVegetation(ctx, [VEGETATION_TYPE.PINE, VEGETATION_TYPE.SPRUCE], forestLeft, 12);
        SectorBuilder.fillVegetation(ctx, [VEGETATION_TYPE.PINE, VEGETATION_TYPE.SPRUCE], forestRight, 12);

        // --- BOUNDARIES ---
        createBoundries(ctx, railTrackCurve);

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

        SectorBuilder.createMountain(ctx, mountainPoints, 20, 20,
            {
                position: new THREE.Vector3(LOCATIONS.POIS.CAVE_ENTRANCE.x, 0,
                    LOCATIONS.POIS.CAVE_ENTRANCE.z - 2),
                rotation: 0
            }
        );

        // Train Tunnel
        SectorBuilder.spawnPoi(ctx, POI_TYPE.TRAIN_TUNNEL, LOCATIONS.POIS.TUNNEL.x, LOCATIONS.POIS.TUNNEL.z, 0, {
            points: [
                new THREE.Vector3(LOCATIONS.POIS.TUNNEL.x, 0, LOCATIONS.POIS.TUNNEL.z),
                new THREE.Vector3(LOCATIONS.POIS.TUNNEL.x + 10, 0, LOCATIONS.POIS.TUNNEL.z)
            ]
        });

        // --- PROPS ---
        await addProps(ctx);

        // --- PATHS ---
        PathGenerator.createDecalPath(ctx, [
            new THREE.Vector3(12, 0, 43), new THREE.Vector3(8, 0, 33), new THREE.Vector3(3, 0, 29), new THREE.Vector3(2, 0, 21), new THREE.Vector3(-1, 0, 13)
        ], { spacing: 0.6, size: 0.4, material: MATERIALS.footprintDecal, variance: 0.2 });

        PathGenerator.createDecalPath(ctx, [
            new THREE.Vector3(2, 0, 10), new THREE.Vector3(10, 0, 6), new THREE.Vector3(17, 0, 3), new THREE.Vector3(23, 0, -2), new THREE.Vector3(36, 0, -5), new THREE.Vector3(42, 0, -9)
        ], { spacing: 0.6, size: 0.4, material: MATERIALS.footprintDecal, variance: 0.2 });

        PathGenerator.createDecalPath(ctx, [
            new THREE.Vector3(157, 0, -58), new THREE.Vector3(150, 0, -63), new THREE.Vector3(147, 0, -71), new THREE.Vector3(135, 0, -75), new THREE.Vector3(122, 0, -78), new THREE.Vector3(110, 0, -76), new THREE.Vector3(100, 0, -80)
        ], { spacing: 0.6, size: 0.4, material: MATERIALS.footprintDecal, variance: 0.2 });

        // Jordan - Inside the shelter, not following yet
        SectorBuilder.spawnFamily(ctx, FamilyMemberID.JORDAN, LOCATIONS.SPAWN.FAMILY.x, LOCATIONS.SPAWN.FAMILY.z, Math.PI, { following: false, visible: false });
    },

    setupContent: async (ctx: SectorContext) => {
        const { scene } = ctx;

        if (!ctx.isWarmup) {
            // Triggers produce no GPU state — skip during preloader ghost-render
            SectorBuilder.addTriggers(ctx, [
                { id: 's1_start', position: LOCATIONS.TRIGGERS.START, radius: 10, type: TriggerType.THOUGHT, content: "clues.1.0.reaction", statusFlags: TriggerStatus.ACTIVE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 50 } }] },
                { id: 's1_combat', position: LOCATIONS.TRIGGERS.COMBAT, radius: 10, type: TriggerType.SPEAK, content: "clues.1.1.reaction", statusFlags: TriggerStatus.ACTIVE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 50 } }] },
                { id: 's1_cave_lights', position: LOCATIONS.TRIGGERS.CAVE_LIGHTS, radius: 10, type: TriggerType.SPEAK, content: "clues.1.2.reaction", statusFlags: TriggerStatus.ACTIVE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 50 } }] },
                { id: 's1_cave_loot', position: LOCATIONS.TRIGGERS.CAVE_LOOT_1, radius: 15, type: TriggerType.SPEAK, content: "clues.1.3.reaction", statusFlags: TriggerStatus.ACTIVE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 50 } }] },
                { id: 's1_cave_loot_more', position: LOCATIONS.TRIGGERS.CAVE_LOOT_2, radius: 15, type: TriggerType.SPEAK, content: "clues.1.4.reaction", statusFlags: TriggerStatus.ACTIVE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 50 } }] },
                { id: 's1_poi_campfire', position: LOCATIONS.POIS.CAMPFIRE, radius: 10, type: TriggerType.POI, content: "pois.1.0.reaction", statusFlags: TriggerStatus.ACTIVE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 500 } }] },
                { id: 's1_poi_train_tunnel', position: LOCATIONS.POIS.TRAIN_TUNNEL, radius: 15, type: TriggerType.POI, content: "pois.1.1.reaction", statusFlags: TriggerStatus.ACTIVE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 500 } }] },
                { id: 's1_poi_cave_entrance', position: LOCATIONS.POIS.CAVE_ENTRANCE, radius: 15, type: TriggerType.POI, content: "pois.1.2.reaction", statusFlags: TriggerStatus.ACTIVE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 500 } }] },
                { id: 's1_poi_mountain_vault', position: LOCATIONS.POIS.BOSS_ROOM, radius: 30, type: TriggerType.POI, content: "pois.1.3.reaction", statusFlags: TriggerStatus.ACTIVE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 500 } }] }
            ]);
        }

        // CAVE SYSTEM
        const innerCave = new THREE.Group();
        innerCave.name = "Sector2_InnerCave";
        scene.add(innerCave);
        await generateCaveSystem(ctx, innerCave);

        // Make Door Interactable
        const doorFrame = scene.getObjectByName('s2_shelter_port_frame');
        if (doorFrame) {
            SectorBuilder.addInteractable(ctx, doorFrame, {
                id: 'cave_door',
                type: InteractionType.SECTOR_SPECIFIC,
                label: 'ui.interact_knock_on_port',
                radius: 12.0
            });
        }
    },

    onInteract: (id: string, object: THREE.Object3D, state: any, events: any) => {
        if (id === 'cave_door') {
            if (!state.sectorState.jordanEventState) {
                state.sectorState.jordanEventState = 1; // KNOCKING
                // VINTERDÖD FIX: Unified with Simulation Clock
                state.sectorState.jordanEventTimer = state.simTime;
                object.userData.isInteractable = false;
                events.setNotification({ text: events.t('ui.knocking'), duration: 2000 });
                audioEngine.playSound(SoundID.DOOR_KNOCK, 0.6);
            }
        }
    },

    onUpdate: (delta, simTime, renderTime, playerPos, gameState, sectorState, events) => {
        // --- REVERB ---
        const insideCave = playerPos.z < -80;
        if (audioEngine.ctx) {
            if (insideCave) audioEngine.setReverb(0.35);
            else audioEngine.setReverb(0);
        }

        /*
        // --- FAMILY FOLLOW ---
        const familyMembers = (events as any).scene.children.filter((c: any) =>
            c.userData.type === 'family' || c.userData.isFamilyMember
        );

        for (let index = 0; index < familyMembers.length; index++) {
            const member = familyMembers[index];
            if (member.userData.name === 'Jordan' && (!sectorState.jordanEventState || sectorState.jordanEventState < 7)) continue;

            const ring = member.children.find((c: any) => c.userData.isRing);
            const familyObj = {
                mesh: member,
                following: true,
                ring: ring,
                seed: member.userData.seed || 0,
                isSpeaking: (gameState.speakingUntil > simTime),
                isThinking: (gameState.thinkingUntil > simTime)
            };

            const body = member.userData.cachedBody || member.children.find((c: any) => c.userData.isBody);
            member.userData.cachedBody = body;
            if (body) {
                PlayerAnimator.update(body, {
                    isMoving: familyObj.following,
                    isRushing: false, isDodging: false, dodgeStartTime: 0,
                    staminaRatio: 1.0,
                    isSpeaking: familyObj.isSpeaking || false,
                    isThinking: familyObj.isThinking || false,
                    isIdleLong: false, isSwimming: false, isWading: false,
                    seed: familyObj.seed, renderTime: renderTime
                }, renderTime, delta);
            }
        }
        */

        // --- SECTOR-SPECIFIC NARRATIVE SYSTEM ---
        if (!sectorState.jordanEventState) sectorState.jordanEventState = 0;
        const jcState = sectorState.jordanEventState;
        const jcTimer = sectorState.jordanEventTimer || 0;
        const elapsed = simTime - jcTimer;

        // Shared positions and refs
        const fixedCamTarget = new THREE.Vector3(60, 12, -193);
        const fixedCamLookAt = new THREE.Vector3(45, 1, -193);
        const sceneHost = (events as any).scene || (gameState as any).scene;
        const scene = sceneHost as THREE.Scene;
        const jordan = scene?.children.find(c => (c.userData.isFamilyMember || c.userData.type === 'family') && c.userData.name === 'Jordan');
        const doorL = scene?.getObjectByName('s2_shelter_port_left');
        const doorR = scene?.getObjectByName('s2_shelter_port_right');
        const doorFrame = scene?.getObjectByName('s2_shelter_port_frame');

        if (scene) {
            // 1. VOID ROOF HANDLING
            const voidRoof = scene.getObjectByName("Sector2_VoidRoof");
            if (voidRoof) voidRoof.visible = true;

            // 2. DIALOGUE TRIGGERS (Bridged via GameSession onAction)
            if (sectorState.pendingTrigger === 'SPAWN_JORDAN') {
                sectorState.pendingTrigger = null; // Konsumera direkt (Zero-GC)
                sectorState.jordanEventState = 3; // OPENING_DOORS
                sectorState.jordanEventTimer = simTime;
                audioEngine.playSound(SoundID.DOOR_OPEN, 0.6);

                window.dispatchEvent(new CustomEvent('hide_hud'));

                if (events.setCameraOverride) {
                    events.setCameraOverride({
                        active: true,
                        targetPos: fixedCamTarget,
                        lookAtPos: fixedCamLookAt,
                        endTime: renderTime + 60000
                    });
                }
            }

            if (sectorState.pendingTrigger === 'CLOSE_DOORS') {
                sectorState.pendingTrigger = null; // Konsumera direkt
                sectorState.jordanEventState = 6; // DOORS_CLOSING
                sectorState.jordanEventTimer = simTime;
            }

            // 3. STATE MACHINE TRANSITIONS
            if (jcState === 1) { // KNOCKING -> START CINEMATIC (Sector 1, Dialogue 0: shelter door)
                if (elapsed > 1500) {
                    if (doorFrame && (events as any).startCinematic) {
                        // Sector 1, Dialogue 0 = Robert knocking / voice from inside
                        (events as any).startCinematic(doorFrame, 1, 0, { targetPos: fixedCamTarget, lookAtPos: fixedCamLookAt });
                        sectorState.jordanEventState = 2; // CINEMATIC_1_RUNNING
                        sectorState.jordanEventTimer = simTime;
                    }
                }
            }
            else if (jcState === 3) { // OPENING_DOORS
                const openDist = Math.max(0, Math.min(10, elapsed * 0.005));
                if (doorL) { doorL.position.x = -5 - openDist; doorL.matrixAutoUpdate = true; }
                if (doorR) { doorR.position.x = 5 + openDist; doorR.matrixAutoUpdate = true; }

                if (sectorState.doorObstacleL?.collider) sectorState.doorObstacleL.collider.size.set(0, 0, 0);
                if (sectorState.doorObstacleR?.collider) sectorState.doorObstacleR.collider.size.set(0, 0, 0);

                if (elapsed > 2000) {
                    sectorState.jordanEventState = 4; // JORDAN_WALK
                    sectorState.jordanEventTimer = simTime;

                    if (playerPos) {
                        sectorState.walkTarget = sectorState.walkTarget || new THREE.Vector3();
                        sectorState.walkTarget.set(playerPos.x, 0, playerPos.z);

                        _vS1.subVectors(playerPos, jordan?.position || new THREE.Vector3(25, 0, -193)).normalize();
                        sectorState.walkTarget.sub(_vS1.multiplyScalar(2.0));
                    } else {
                        sectorState.walkTarget = sectorState.walkTarget || new THREE.Vector3();
                        sectorState.walkTarget.set(52, 0, -193);
                    }
                }
            }
            else if (jcState === 4) { // JORDAN_WALK
                if (jordan) {
                    const target = sectorState.walkTarget || new THREE.Vector3(52, 0, -193);
                    jordan.position.lerp(target, 0.05);

                    const body = jordan.userData.cachedBody || jordan.children.find((c: any) => c.userData.isBody);
                    if (body) {
                        PlayerAnimator.update(body, {
                            isMoving: true, isRushing: false, isDodging: false, dodgeStartTime: 0,
                            staminaRatio: 1.0, isSpeaking: gameState.speakingUntil > simTime,
                            isThinking: false, isIdleLong: false, isSwimming: false, isWading: false,
                            seed: jordan.userData.seed || 0,
                            renderTime: renderTime,
                            simTime: simTime
                        }, renderTime);
                    }

                    if (jordan.position.distanceTo(target) < 1.5) {
                        sectorState.jordanEventState = 5; // DIALOGUE_1_1 (Jordan + Loke outside)
                        sectorState.jordanEventTimer = simTime;
                        if (events.startCinematic) {
                            // Sector 1, Dialogue 1 = Jordan + Loke conversation outside
                            events.startCinematic(jordan, 1, 1, { targetPos: fixedCamTarget, lookAtPos: fixedCamLookAt });
                        }
                    }
                }
            }
            else if (jcState === 6) { // DOORS_CLOSING
                const closeProgress = Math.max(0, Math.min(1, elapsed / 800));
                if (doorL) { doorL.position.x = -15 + (closeProgress * 10); doorL.position.x = -15 + (closeProgress * 10); doorL.matrixAutoUpdate = true; }
                if (doorR) { doorR.position.x = 15 - (closeProgress * 10); doorR.position.x = 15 - (closeProgress * 10); doorR.matrixAutoUpdate = true; }

                if (elapsed >= 800 && !sectorState.doorCloseSoundPlayed) {
                    audioEngine.playSound(SoundID.DOOR_SHUT, 0.6);
                    sectorState.doorCloseSoundPlayed = true;
                }

                if (elapsed > 1000) {
                    sectorState.jordanEventState = 7; // COMPLETE
                    sectorState.jordanEventTimer = simTime;
                    if (events.setCameraOverride) events.setCameraOverride(null);
                    window.dispatchEvent(new CustomEvent('show_hud'));

                    // --- VINTERDÖD ACTION API ---
                    // NU, när dörren är stängd, skickar vi the globala händelserna!
                    if (events.onAction) {
                        events.onAction([
                            { type: 'FAMILY_MEMBER_FOUND', payload: { id: FamilyMemberID.JORDAN } },
                            { type: 'FAMILY_MEMBER_FOLLOW' },
                            { type: 'SPAWN_BOSS', payload: { pos: LOCATIONS.SPAWN.BOSS } }
                        ]);
                    }
                }
            }
        }

        // --- SPAWNING LOGIC ---
        if (!sectorState.spawnedRooms) sectorState.spawnedRooms = {};
        const roomCenters = [
            { id: 1, x: 100, z: -100, zombies: 0 },
            { id: 3, x: 150, z: -200, zombies: 3 },
            { id: 5, x: 100, z: -125, zombies: 5 },
            { id: 6, x: 60, z: -125, zombies: 5 },
        ];

        for (let j = 0; j < roomCenters.length; j++) {
            const r = roomCenters[j];
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
