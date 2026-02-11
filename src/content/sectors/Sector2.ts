
import * as THREE from 'three';
import { SectorDef, SectorContext } from '../../types/sectors';
import { MATERIALS, GEOMETRY, createTextSprite, ModelFactory } from '../../utils/assets';
import { SectorBuilder } from '../../core/world/SectorGenerator';
import { PathGenerator } from '../../core/world/PathGenerator';
import { ObjectGenerator } from '../../core/world/ObjectGenerator';
import { generateCaveSystem } from './Sector2_Cave';
import { t } from '../../utils/i18n';
import { soundManager } from '../../utils/sound';
import { EnemyManager } from '../../core/EnemyManager';
import { BOSSES, FAMILY_MEMBERS, CAMERA_HEIGHT } from '../../content/constants';
import { SectorManager } from '../../core/SectorManager';
import { FamilySystem } from '../../core/systems/FamilySystem';

const LOCATIONS = {
    SPAWN: {
        //PLAYER: { x: 0, z: 200, rot: Math.PI },
        //TODO: when debugging the cave/mountain:
        PLAYER: { x: 100, z: -60, rot: Math.PI },
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
        CAMPFIRE: { x: -1, z: 13 },
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
    ctx.scene.add(ObjectGenerator.createCampfire(ctx, -1, 13, 0, 1.0));

    const barrel = ObjectGenerator.createBarrel();
    barrel.position.set(106, 0, -65);
    barrel.rotateX(Math.PI * 0.5);
    barrel.rotateY(Math.PI * 0.75);
    ctx.scene.add(barrel);
    const barrel2 = ObjectGenerator.createBarrel();
    barrel2.position.set(108, 0, -67);
    ctx.scene.add(barrel2);

    const timberPile = ObjectGenerator.createTimberPile(2);
    timberPile.position.set(92, 0, -60);
    timberPile.rotateY(Math.PI * 0.25);
    ctx.scene.add(timberPile);

    const timberPile2 = ObjectGenerator.createTimberPile(1.5);
    timberPile2.position.set(88, 0, -55);
    timberPile2.rotateY(Math.PI * 0.20);
    ctx.scene.add(timberPile2);

    const timberTruck = ObjectGenerator.createVehicle('timber_truck', 1.5);
    timberTruck.position.set(111, 0, -64);
    timberTruck.rotateY(Math.PI * 1.25);
    ctx.scene.add(timberTruck);

    ObjectGenerator.createDeforestation(ctx, 135, -75, 50, 30, 25);
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
    blockPointsWest.forEach((p, i) => {
        const d = p.distanceTo(cavePos);
        if (d < minDist) { minDist = d; splitIdx = i; }
    });

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

export const Sector2: SectorDef = {
    id: 1,
    name: "maps.bunker_name",
    environment: {
        bgColor: 0x050510,
        fogDensity: 0.02,
        ambientIntensity: 0.15,
        groundColor: 0x111111,
        fov: 50,
        moon: { visible: true, color: 0x8899aa, intensity: 0.7, position: { x: -40, y: 30, z: -20 } },
        cameraOffsetZ: 40,
        cameraHeight: CAMERA_HEIGHT,
        weather: 'snow'
    },
    groundType: 'SNOW',
    groundSize: { width: 600, depth: 600 },
    ambientLoop: 'ambient_wind_loop',
    playerSpawn: LOCATIONS.SPAWN.PLAYER,
    familySpawn: LOCATIONS.SPAWN.FAMILY,
    bossSpawn: LOCATIONS.SPAWN.BOSS,

    collectibles: [
        { id: 's2_collectible_1', x: LOCATIONS.COLLECTIBLES.C1.x, z: LOCATIONS.COLLECTIBLES.C1.z },
        { id: 's2_collectible_2', x: LOCATIONS.COLLECTIBLES.C2.x, z: LOCATIONS.COLLECTIBLES.C2.z }
    ],

    cinematic: {
        offset: { x: 20, y: 8, z: 0 },
        lookAtOffset: { x: -20, y: -5, z: 0 },
        rotationSpeed: 0,
        zoom: 0.1
    },

    generate: async (ctx: SectorContext) => {
        const { scene, obstacles, triggers } = ctx;
        (ctx as any).sectorState.ctx = ctx;

        SectorBuilder.spawnChest(ctx, LOCATIONS.SPAWN.BOSS.x, LOCATIONS.SPAWN.BOSS.z, 'big');

        triggers.push(
            {
                id: 's2_start', position: LOCATIONS.TRIGGERS.START, radius: 10, type: 'THOUGHTS', content: "clues.s2_start", triggered: false,
                actions: [{ type: 'GIVE_REWARD', payload: { xp: 50 } }]
            },
            {
                id: 's2_campfire', position: LOCATIONS.POIS.CAMPFIRE, radius: 10, type: 'SPEECH', content: "clues.s2_campfire", triggered: false,
                actions: [{ type: 'GIVE_REWARD', payload: { xp: 50 } }]
            },
            {
                id: 's2_combat', position: LOCATIONS.TRIGGERS.COMBAT, radius: 10, type: 'SPEECH', content: "clues.s2_combat", triggered: false,
                actions: [{ type: 'GIVE_REWARD', payload: { xp: 50 } }]
            },
            {
                id: 's2_train_tunnel', position: LOCATIONS.POIS.TRAIN_TUNNEL, radius: 15, type: 'SPEECH', content: "clues.s2_train_tunnel", triggered: false,
                actions: [{ type: 'GIVE_REWARD', payload: { xp: 50 } }]
            },
            {
                id: 's2_cave_lights', position: LOCATIONS.TRIGGERS.CAVE_LIGHTS, radius: 10, type: 'SPEECH', content: "clues.s2_cave_lights", triggered: false,
                actions: [{ type: 'GIVE_REWARD', payload: { xp: 50 } }]
            },
            {
                id: 's2_cave_watch_out', position: { x: LOCATIONS.POIS.CAVE_ENTRANCE.x, z: -80 }, radius: 10, type: 'SPEECH', content: "clues.s2_cave_watch_out", triggered: false,
                actions: [{ type: 'GIVE_REWARD', payload: { xp: 50 } }]
            },
            {
                id: 's2_cave_loot', position: LOCATIONS.TRIGGERS.CAVE_LOOT_1, radius: 15, type: 'SPEECH', content: "clues.s2_cave_loot", triggered: false,
                actions: [{ type: 'GIVE_REWARD', payload: { xp: 50 } }]
            },
            {
                id: 's2_cave_loot_more', position: LOCATIONS.TRIGGERS.CAVE_LOOT_2, radius: 15, type: 'SPEECH', content: "clues.s2_cave_loot_more", triggered: false,
                actions: [{ type: 'GIVE_REWARD', payload: { xp: 50 } }]
            },
            {
                id: 's2_cave_knock_shelter_port', position: { x: 35, z: -193 }, radius: 10, type: 'EVENT', content: '', triggered: false,
                actions: []
            },
            {
                id: 's2_cave_shelter_port_room', position: LOCATIONS.POIS.BOSS_ROOM, radius: 30, type: 'SPEECH', content: "clues.s2_cave_shelter_port_room", triggered: false,
                actions: [{ type: 'GIVE_REWARD', payload: { xp: 50 } }]
            },
        );

        if (ctx.yield) await ctx.yield();

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


        // --- FOREST ---
        const forestOffset = 8;
        const forestDepth = 70;
        const forestSamples = 80;
        const fPoints = railTrackCurve.getSpacedPoints(forestSamples);

        const leftInner: THREE.Vector3[] = [];
        const leftOuter: THREE.Vector3[] = [];
        const rightInner: THREE.Vector3[] = [];
        const rightOuter: THREE.Vector3[] = [];

        fPoints.forEach((pt, i) => {
            let tangent;
            if (i < fPoints.length - 1) tangent = new THREE.Vector3().subVectors(fPoints[i + 1], pt).normalize();
            else if (i > 0) tangent = new THREE.Vector3().subVectors(pt, fPoints[i - 1]).normalize();
            else tangent = new THREE.Vector3(0, 0, -1);

            const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
            leftInner.push(pt.clone().add(normal.clone().multiplyScalar(-forestOffset)));
            leftOuter.push(pt.clone().add(normal.clone().multiplyScalar(-(forestOffset + forestDepth))));
            rightInner.push(pt.clone().add(normal.clone().multiplyScalar(forestOffset)));
            rightOuter.push(pt.clone().add(normal.clone().multiplyScalar(forestOffset + forestDepth)));
        });

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

        forestLeft.forEach(p => p.y = 0);
        forestRight.forEach(p => p.y = 0);

        SectorBuilder.createForest(ctx, forestLeft, 12, ['pine', 'spruce']);
        SectorBuilder.createForest(ctx, forestRight, 12, ['pine', 'spruce']);


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

        const caveOpening = SectorBuilder.createMountainOpening();
        caveOpening.position.x = LOCATIONS.POIS.CAVE_ENTRANCE.x;
        caveOpening.position.z = LOCATIONS.POIS.CAVE_ENTRANCE.z - 2;
        scene.add(caveOpening);
        SectorBuilder.createMountain(ctx, mountainPoints, caveOpening);

        // Train Tunnel
        const trainTunnel = ObjectGenerator.createTrainTunnel([
            new THREE.Vector3(LOCATIONS.POIS.TUNNEL.x, 0, LOCATIONS.POIS.TUNNEL.z),
            new THREE.Vector3(LOCATIONS.POIS.TUNNEL.x + 10, 0, LOCATIONS.POIS.TUNNEL.z)
        ]);
        ctx.obstacles.push({ mesh: trainTunnel });
        scene.add(trainTunnel);


        // CAVE SYSTEM --
        const innerCave = new THREE.Group();
        innerCave.name = "Sector2_InnerCave";
        scene.add(innerCave);
        await generateCaveSystem(ctx, innerCave);


        // --- PROPS ---
        addProps(ctx);


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

        // --- ENEMIES ---
        spawnSectorHordes(ctx);
    },

    onUpdate: (delta, now, playerPos, gameState, sectorState, events) => {
        // --- REVERB ---
        const insideCave = playerPos.z < -80;
        if (soundManager.core) {
            if (insideCave) soundManager.setReverb(0.35);
            else soundManager.setReverb(0);
        }

        // --- FAMILY FOLLOW ---
        const familyMembers = (events as any).scene.children.filter((c: any) =>
            c.userData.type === 'family' || c.userData.isFamilyMember
        );

        familyMembers.forEach((member: THREE.Group, index: number) => {
            if (member.userData.name === 'Jordan' && sectorState.jordanCinematic?.phase !== 'COMPLETE') return;

            const ring = member.children.find((c: any) => c.userData.isRing);
            const familyObj = {
                mesh: member,
                following: true,
                ring: ring,
                seed: member.userData.seed || 0,
                isSpeaking: (gameState.speakingUntil > now),
                isThinking: (gameState.thinkingUntil > now)
            };

            FamilySystem.update(
                familyObj,
                { position: playerPos } as THREE.Group,
                gameState,
                !!sectorState.jordanCinematic && sectorState.jordanCinematic.phase !== 'NONE',
                now,
                delta,
                {
                    setFoundMemberName: () => { },
                    startCinematic: (m) => { if ((events as any).startCinematic) (events as any).startCinematic(m); }
                },
                index
            );
        });

        // --- SCENE-DEPENDENT LOGIC ---
        if ((events as any).scene) {
            const scene = (events as any).scene as THREE.Scene;
            const voidRoof = scene.getObjectByName("Sector2_VoidRoof");
            if (voidRoof) voidRoof.visible = true;

            if (!sectorState.jordanCinematic) {
                sectorState.jordanCinematic = { phase: 'NONE', timer: 0 };
            }

            const jc = sectorState.jordanCinematic;
            const fixedCamTarget = new THREE.Vector3(60, 12, -193);
            const fixedCamLookAt = new THREE.Vector3(45, 1, -193);

            const knockingTrigger = gameState.triggers.find(t => t.id === 's2_cave_knock_shelter_port');
            if (knockingTrigger && knockingTrigger.triggered && !sectorState.introCinematicPlayed) {
                const doorFrame = scene.getObjectByName('s2_shelter_port_frame');
                if (doorFrame && (events as any).startCinematic) {
                    (events as any).startCinematic(doorFrame, 1, { targetPos: fixedCamTarget, lookAtPos: fixedCamLookAt });
                    sectorState.introCinematicPlayed = true;
                    soundManager.playMetalKnocking();
                }
            }

            const jordan = scene.children.find(c => (c.userData.isFamilyMember || c.userData.type === 'family') && c.userData.name === 'Jordan');
            const doorL = scene.getObjectByName('s2_shelter_port_left');
            const doorR = scene.getObjectByName('s2_shelter_port_right');

            if (!jc.listenerAdded) {
                window.addEventListener('spawn_jordan', () => {
                    if (sectorState.jordanCinematic && sectorState.jordanCinematic.phase === 'NONE') {
                        sectorState.jordanCinematic.phase = 'OPENING_DOORS';
                        sectorState.jordanCinematic.timer = performance.now();
                        soundManager.playMetalDoorOpen();
                        window.dispatchEvent(new CustomEvent('hide_hud'));
                        if ((window as any).setCameraOverride) {
                            (window as any).setCameraOverride({
                                active: true,
                                targetPos: fixedCamTarget,
                                lookAtPos: fixedCamLookAt,
                                endTime: performance.now() + 60000
                            });
                        }
                    }
                }, { once: true });

                window.addEventListener('s2_conclusion', () => {
                    jc.phase = 'FINISHED_AFTER_DIALOGUE';
                    if (!jc.doorsClosing) {
                        jc.doorsClosing = true;
                        jc.doorsClosingTimer = performance.now();
                    }
                });
                jc.listenerAdded = true;
            }

            // Door Animation
            if (jc.phase === 'OPENING_DOORS') {
                const elapsed = now - jc.timer;
                const openDist = Math.min(10, elapsed * 0.005);
                if (doorL) doorL.position.x = -5 - openDist;
                if (doorR) doorR.position.x = 5 + openDist;

                if (elapsed > 2000) {
                    jc.phase = 'JORDAN_WALK';
                    jc.timer = now;
                    if (playerPos) {
                        jc.walkTarget = new THREE.Vector3(playerPos.x, 0, playerPos.z);
                        const toPlayer = new THREE.Vector3().subVectors(playerPos, jordan?.position || new THREE.Vector3(25, 0, -193)).normalize();
                        jc.walkTarget.sub(toPlayer.multiplyScalar(2.0));
                    } else {
                        jc.walkTarget = new THREE.Vector3(52, 0, -193);
                    }
                }
            } else if (jc.doorsClosing) {
                const elapsed = now - (jc.doorsClosingTimer || now);
                const closeProgress = Math.min(1, elapsed / 800);
                if (doorL) doorL.position.x = -15 + (closeProgress * 10);
                if (doorR) doorR.position.x = 15 - (closeProgress * 10);

                if (elapsed >= 800 && !jc.doorCloseSoundPlayed) {
                    soundManager.playMetalDoorShut();
                    jc.doorCloseSoundPlayed = true;
                }

                if (elapsed > 500 && jc.phase === 'FINISHED_AFTER_DIALOGUE') {
                    jc.phase = 'COMPLETE';
                    if ((window as any).clearCameraOverride) (window as any).clearCameraOverride();
                    window.dispatchEvent(new CustomEvent('show_hud'));
                    window.dispatchEvent(new CustomEvent('boss-spawn-trigger'));
                    window.dispatchEvent(new CustomEvent('family-follow'));
                }
            }

            // Phase Machine
            if (jc.phase === 'JORDAN_WALK') {
                if (!jc.jordan && jordan) jc.jordan = jordan;
                if (jc.jordan) {
                    const walkTarget = jc.walkTarget || new THREE.Vector3(52, 0, -193);
                    const jordanPos = jc.jordan.position;
                    jordanPos.lerp(walkTarget, 0.05);

                    const familyObj = {
                        mesh: jc.jordan,
                        following: false,
                        isMoving: true,
                        isSpeaking: (gameState.speakingUntil > now),
                        seed: jc.jordan.userData.seed || 0
                    };
                    FamilySystem.update(familyObj, { position: playerPos } as THREE.Group, gameState, true, now, delta, { setFoundMemberName: () => { }, startCinematic: () => { } });

                    if (jordanPos.distanceTo(walkTarget) < 1.5) jc.phase = 'START_DIALOGUE_2';
                }
            } else if (jc.phase === 'START_DIALOGUE_2') {
                jc.phase = 'WAITING_FOR_CONCLUSION';
                const jordanObj = (events as any).familyMesh || scene.children.find(c => (c.userData.isFamilyMember || c.userData.type === 'family') && c.userData.name === 'Jordan');
                if (jordanObj && (events as any).startCinematic) {
                    (events as any).startCinematic(jordanObj, 102, { targetPos: fixedCamTarget, lookAtPos: fixedCamLookAt });
                }
            }

            if (!sectorState.bossListenerAdded) {
                window.addEventListener('boss-spawn-trigger', () => {
                    if (!sectorState.bossSpawned) {
                        const EnemyManager = (window as any).EnemyManager || (events as any).EnemyManager;
                        if (EnemyManager) {
                            EnemyManager.spawnBoss(scene, LOCATIONS.SPAWN.BOSS, BOSSES[1]);
                            sectorState.bossSpawned = true;
                        }
                    }
                }, { once: true });
                sectorState.bossListenerAdded = true;
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

        roomCenters.forEach(r => {
            if (!sectorState.spawnedRooms[r.id]) {
                const dist = Math.sqrt((playerPos.x - r.x) ** 2 + (playerPos.z - r.z) ** 2);
                if (dist < 30) {
                    sectorState.spawnedRooms[r.id] = true;
                    for (let i = 0; i < r.zombies; i++) {
                        const offX = (Math.random() - 0.5) * 20;
                        const offZ = (Math.random() - 0.5) * 20;
                        let type = 'WALKER';
                        if (r.id === 6 && Math.random() > 0.8) type = 'TANK';
                        if (r.id === 5 && Math.random() > 0.7) type = 'BOMBER';
                        else if (Math.random() > 0.7) type = 'RUNNER';
                        events.spawnZombie(type, new THREE.Vector3(r.x + offX, 0, r.z + offZ));
                    }
                }
            }
        });
    }
};

