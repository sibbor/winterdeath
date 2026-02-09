
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
        //TODO: enable after we're done with creating the mountain, cave opening and cave...
        //PLAYER: { x: 0, z: 200, rot: Math.PI },
        PLAYER: { x: 100, z: -65, rot: Math.PI },
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
        TUNNEL: { x: 170, z: -50 },
        CAMPFIRE: { x: -1, z: 13 },
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
    // Automatic Content
    groundType: 'SNOW',
    groundSize: { width: 600, depth: 600 },
    ambientLoop: 'ambient_wind_loop',
    // --- SPAWN POINTS ---
    playerSpawn: LOCATIONS.SPAWN.PLAYER,
    familySpawn: LOCATIONS.SPAWN.FAMILY,
    bossSpawn: LOCATIONS.SPAWN.BOSS,

    // Auto-Spawn Collectibles
    collectibles: [
        { id: 's2_collectible_1', x: LOCATIONS.COLLECTIBLES.C1.x, z: LOCATIONS.COLLECTIBLES.C1.z },
        { id: 's2_collectible_2', x: LOCATIONS.COLLECTIBLES.C2.x, z: LOCATIONS.COLLECTIBLES.C2.z }
    ],

    cinematic: {
        offset: { x: 20, y: 8, z: 0 }, // Behind the player (East of midpoint)
        lookAtOffset: { x: -20, y: -5, z: 0 }, // Looking West through the door
        rotationSpeed: 0,
        zoom: 0.1
    },

    generate: async (ctx: SectorContext) => {
        const { scene, obstacles, triggers } = ctx;
        (ctx as any).sectorState.ctx = ctx;

        const caveEntrancePos = new THREE.Vector3(LOCATIONS.POIS.CAVE_ENTRANCE.x, 0, LOCATIONS.POIS.CAVE_ENTRANCE.z);
        const tunnelPos = new THREE.Vector3(LOCATIONS.POIS.TUNNEL.x, 0, LOCATIONS.POIS.TUNNEL.z);

        // Reward Chest at boss spawn
        SectorBuilder.spawnChest(ctx, LOCATIONS.SPAWN.BOSS.x, LOCATIONS.SPAWN.BOSS.z, 'big');

        // --- TRIGGERS (Outside/General) ---
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
                id: 's2_train_tunnel', position: {
                    x: LOCATIONS.POIS.TUNNEL.x - 10, z: LOCATIONS.POIS.TUNNEL.z
                }, radius: 15, type: 'SPEECH', content: "clues.s2_train_tunnel", triggered: false,
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
                id: 's2_cave_knock_port', position: { x: 35, z: -193 }, radius: 10, type: 'EVENT', content: '', triggered: false,
                actions: []
            },
            {
                id: 's2_cave_door_room', position: LOCATIONS.POIS.BOSS_ROOM, radius: 30, type: 'SPEECH', content: "clues.s2_cave_door", triggered: false,
                actions: [{ type: 'GIVE_REWARD', payload: { xp: 50 } }]
            },
        );

        if (ctx.yield) await ctx.yield();

        // --- PART 1: THE SMOOTH S-CURVE RAILWAY ---
        // Generate Rail Mesh
        const railRoadPath = [
            new THREE.Vector3(0, 0, 240),
            new THREE.Vector3(0, 0, 120),
            new THREE.Vector3(10, 0, 60),
            new THREE.Vector3(40, 0, 0),
            new THREE.Vector3(LOCATIONS.POIS.CAVE_ENTRANCE.x, 0, -50),
            new THREE.Vector3(200, 0, -50)];
        const curve = PathGenerator.createRailTrack(ctx, railRoadPath);

        // Campfire
        const campfire = ObjectGenerator.createCampfire(ctx, -1, 13, 0, 1.0);
        scene.add(campfire);

        // Path: Rail road -> Campfire
        PathGenerator.createDecalPath(ctx, [
            new THREE.Vector3(12, 0, 43),
            new THREE.Vector3(8, 0, 33),
            new THREE.Vector3(3, 0, 29),
            new THREE.Vector3(2, 0, 21),
            new THREE.Vector3(-1, 0, 13)
        ], { spacing: 0.6, size: 0.4, material: MATERIALS.footprintDecal, variance: 0.2 });

        // Path: Campfire -> Rail road
        PathGenerator.createDecalPath(ctx, [
            new THREE.Vector3(2, 0, 10),
            new THREE.Vector3(10, 0, 6),
            new THREE.Vector3(17, 0, 3),
            new THREE.Vector3(23, 0, -2),
            new THREE.Vector3(36, 0, -5),
            new THREE.Vector3(42, 0, -9)
        ], { spacing: 0.6, size: 0.4, material: MATERIALS.footprintDecal, variance: 0.2 });

        // Path: Tunnel -> Cave
        PathGenerator.createDecalPath(ctx, [
            new THREE.Vector3(157, 0, -58),
            new THREE.Vector3(150, 0, -63),
            new THREE.Vector3(147, 0, -71),
            new THREE.Vector3(135, 0, -75),
            new THREE.Vector3(122, 0, -78),
            new THREE.Vector3(110, 0, -76),
            new THREE.Vector3(100, 0, -80)
        ], { spacing: 0.6, size: 0.4, material: MATERIALS.footprintDecal, variance: 0.2 });

        // --- PART 2: FOREST (Trees, Walls, Ground Rocks) ---
        // Polygon Forest Generation
        // Left Forest (West of track)
        // Polygon Forest Generation
        // Adjusted to follow the S-Curve of the track
        // Track Path: (0,240) -> (0,120) -> (10,60) -> (40,0) -> (100,-50) -> (200,-50)

        // Left Forest (West/North of track)
        // Polygon Forest Generation
        // Procedural generation to hug the track with ~5m ground buffer (8m total offset)
        // Procedural generation to hug the track with ~5m ground buffer
        const forestOffset = 8; // Start 8m from center
        const forestDepth = 70; // 30m deep forest strip
        const forestSamples = 80;
        const fPoints = curve.getSpacedPoints(forestSamples);

        const leftInner: THREE.Vector3[] = [];
        const rightInner: THREE.Vector3[] = [];
        const leftOuter: THREE.Vector3[] = [];
        const rightOuter: THREE.Vector3[] = [];

        fPoints.forEach((pt, i) => {
            let tangent;
            if (i < fPoints.length - 1) tangent = new THREE.Vector3().subVectors(fPoints[i + 1], pt).normalize();
            else if (i > 0) tangent = new THREE.Vector3().subVectors(pt, fPoints[i - 1]).normalize();
            else tangent = new THREE.Vector3(0, 0, -1);

            const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);

            // Inner Edge (Closer to track)
            leftInner.push(pt.clone().add(normal.clone().multiplyScalar(-forestOffset)));
            rightInner.push(pt.clone().add(normal.clone().multiplyScalar(forestOffset)));

            // Outer Edge (30m further out)
            leftOuter.push(pt.clone().add(normal.clone().multiplyScalar(-(forestOffset + forestDepth))));
            rightOuter.push(pt.clone().add(normal.clone().multiplyScalar(forestOffset + forestDepth)));
        });

        // Filter out points that would spawn trees inside the cave
        // Cave entrance is around (100, -70), exclude that zone
        // But allow the area from (86, -62) to (10, -62)
        const filterPointsBeforeCave = (points: THREE.Vector3[]) => {
            return points.filter(p => {
                // Exclude the cave entrance zone: X > 86 AND Z < -62
                if (p.x > 86 && p.z < -62) return false;
                // Exclude points too far south (beyond -70 where cave is)
                if (p.z < -70) return false;
                return true;
            });
        };

        // Left Forest (West/North) - Filter to stop before cave, then loop back through outer points
        const filteredLeftInner = filterPointsBeforeCave(leftInner);
        const filteredLeftOuter = filterPointsBeforeCave(leftOuter);
        const forestLeft = [...filteredLeftInner, ...filteredLeftOuter.reverse()];

        // Right Forest (East/South) - Loop back through outer points (no filtering needed)
        const forestRight = [...rightInner, ...rightOuter.reverse()];

        // Flatten Y
        forestLeft.forEach(p => p.y = 0);
        forestRight.forEach(p => p.y = 0);

        // Tree Types: Pine and Spruce (No Birch)
        SectorBuilder.createForest(ctx, forestLeft, 12, ['pine', 'spruce']);
        SectorBuilder.createForest(ctx, forestRight, 12, ['pine', 'spruce']);

        if (ctx.yield) await ctx.yield();

        // --- INVISIBLE WALLS (Blocking 35m from track) ---
        // Generate Left and Right wall paths from the main curve
        const railPoints = curve.getSpacedPoints(150);
        const leftWallPoints: THREE.Vector3[] = [];
        const rightWallPoints: THREE.Vector3[] = [];
        const wallOffset = 35;

        railPoints.forEach((pt, i) => {
            let tangent;
            if (i < railPoints.length - 1) tangent = new THREE.Vector3().subVectors(railPoints[i + 1], pt).normalize();
            else if (i > 0) tangent = new THREE.Vector3().subVectors(pt, railPoints[i - 1]).normalize();
            else tangent = new THREE.Vector3(0, 0, 1); // Default tangent for single point or start

            const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
            leftWallPoints.push(pt.clone().add(normal.clone().multiplyScalar(-wallOffset)));
            rightWallPoints.push(pt.clone().add(normal.clone().multiplyScalar(wallOffset)));
        });

        if (ctx.yield) await ctx.yield();

        // --- DEBUG VISUALIZATION (Via SectorBuilder) ---
        if (ctx.debugMode) {
            SectorBuilder.visualizeTriggers(ctx);
        }

        // --- PART 3: THE BUNKER ENTRANCE (Interactive Doors & Frame) ---
        // 1. Frame - Hollow construction to allow seeing through
        const frameGroup = new THREE.Group();
        frameGroup.name = 's2_bunker_door_frame';
        frameGroup.position.set(41, 8.5, -193); // Centered on the boss room West wall
        frameGroup.rotation.y = Math.PI / 2; // Rotate 90 deg to face East/West

        const frameMat = MATERIALS.concrete;
        // Top cap
        const topFrame = new THREE.Mesh(new THREE.BoxGeometry(22, 1, 4), frameMat);
        topFrame.position.y = 7.5;
        frameGroup.add(topFrame);
        // Left post
        const leftPost = new THREE.Mesh(new THREE.BoxGeometry(2, 16, 4), frameMat);
        leftPost.position.x = -10;
        frameGroup.add(leftPost);
        // Right post
        const rightPost = new THREE.Mesh(new THREE.BoxGeometry(2, 16, 4), frameMat);
        rightPost.position.x = 10;
        frameGroup.add(rightPost);

        scene.add(frameGroup);

        // 2. The Doors (L/R) - Widened to 10m each, 17m height, lowered to reach ground
        const doorL = new THREE.Mesh(new THREE.BoxGeometry(10, 17, 1), MATERIALS.metalPanel);
        doorL.name = 's2_bunker_door_l';
        doorL.position.set(-5, -1, 0); // Relative to frame, positioned to close gap
        frameGroup.add(doorL);

        const doorR = new THREE.Mesh(new THREE.BoxGeometry(10, 17, 1), MATERIALS.metalPanel);
        doorR.name = 's2_bunker_door_r';
        doorR.position.set(5, -1, 0); // Relative to frame, positioned to close gap
        frameGroup.add(doorR);

        // 3. Jordan & Loke (Now handled by centralized GameSession system)
        if (ctx.yield) await ctx.yield();

        // --- PART 4: MOUNTAIN EXTERIOR & DECORATION ---

        // 1. Create Cave Entrance (Visual Arch)
        const caveEntranceGroup = ObjectGenerator.createCaveEntrance();
        caveEntranceGroup.position.copy(caveEntrancePos);
        caveEntranceGroup.position.z -= 2; // Slight offset
        caveEntranceGroup.rotation.y = -Math.PI / 2;
        scene.add(caveEntranceGroup);

        // 2. Left Wall (Needs gap for Cave Entrance at 100, -70)
        // We use createMountainSlice for visual mountains with collision
        const leftPoints = curve.getSpacedPoints(40).map(p => {
            // Offset to left
            const tangent = curve.getTangentAt(curve.getUtoTmapping(0, p.distanceTo(curve.getPoint(0)))); // Approx
            // Simple offset logic similar to before but cleaner
            // Re-using the manual offset logic from original code for consistency
            return p;
        });

        // Let's use the explicit wall points generated earlier
        // Segment 1: Start to Cave
        // Cave Gap is roughly index 115-125 in the 150-point resolution
        // caveEntrancePos is (100, 0, -70)

        // Re-calculate split indices based on distance to cave
        let splitIdx = -1;
        let splitDist = 9999;
        leftWallPoints.forEach((p, i) => {
            const d = p.distanceTo(caveEntrancePos);
            if (d < splitDist) { splitDist = d; splitIdx = i; }
        });

        // Generate Mountain Slices (Iterate points and build segments)
        const buildMountainWall = (points: THREE.Vector3[]) => {
            for (let i = 0; i < points.length - 1; i++) {
                // Optimization: Combine multiple points into longer segments if straight?
                // For now, simple segments every 2 points to reduce draw calls slightly?
                // Or just use every point.
                // Let's use stride of 1 for smoothness.
                ObjectGenerator.createMountainSlice(ctx, points[i], points[i + 1], 15 + Math.random() * 5);
            }
        };

        if (splitIdx !== -1) {
            const gapRadiusIdx = 6;
            const p1 = leftWallPoints.slice(0, Math.max(0, splitIdx - gapRadiusIdx));
            const p2 = leftWallPoints.slice(Math.min(leftWallPoints.length, splitIdx + gapRadiusIdx));

            buildMountainWall(p1);
            buildMountainWall(p2);
        } else {
            buildMountainWall(leftWallPoints);
        }

        // 3. Right Wall (Continuous)
        buildMountainWall(rightWallPoints);

        // 4. Backward Exit Block
        ObjectGenerator.createMountainSlice(ctx, new THREE.Vector3(-34, 0, 213), new THREE.Vector3(34, 0, 213), 20);

        // 5. Right Side Block
        ObjectGenerator.createMountainSlice(ctx, new THREE.Vector3(165, 0, -88), new THREE.Vector3(165, 0, -17), 20);

        // Mountain Groups (Cleanup old empty groups if not used)
        const innerCave = new THREE.Group();
        innerCave.name = "Sector2_InnerCave";
        scene.add(innerCave);

        if (ctx.yield) await ctx.yield();

        // 2. Train tunnel Arch (Concrete) - Decorative only, blocked
        const tunnelGroup = new THREE.Group();
        tunnelGroup.position.copy(tunnelPos);
        tunnelGroup.rotation.y = Math.PI / 2;

        const tunnelMat = MATERIALS.concrete;
        const archShape = new THREE.Shape();
        archShape.moveTo(-8, 0);
        archShape.lineTo(-8, 10);
        archShape.absarc(0, 10, 8, Math.PI, 0, true);
        archShape.lineTo(8, 0);
        archShape.lineTo(6, 0);
        archShape.lineTo(6, 9);
        archShape.absarc(0, 9, 6, 0, Math.PI, true);
        archShape.lineTo(-6, 0);

        const extrudeSettings = { depth: 10, bevelEnabled: false };
        const archGeo = new THREE.ExtrudeGeometry(archShape, extrudeSettings);
        const arch = new THREE.Mesh(archGeo, tunnelMat);
        arch.position.z = -5;
        tunnelGroup.add(arch);

        const darkBox = new THREE.Mesh(new THREE.BoxGeometry(14, 18, 1), new THREE.MeshBasicMaterial({ color: 0x000000 }));
        darkBox.position.z = 2;
        darkBox.name = 'TunnelDarkBox';
        tunnelGroup.add(darkBox);

        const tunnelBlock = new THREE.Mesh(new THREE.BoxGeometry(14, 20, 5), new THREE.MeshBasicMaterial({ visible: false }));
        tunnelBlock.position.set(0, 10, 2);
        tunnelBlock.name = 'TunnelBlock';
        tunnelGroup.add(tunnelBlock);
        obstacles.push({ mesh: tunnelBlock, collider: { type: 'box', size: new THREE.Vector3(14, 20, 5) } });

        scene.add(tunnelGroup); // Add directly to scene or permanentMountain

        // --- PART 5: THE CAVE SYSTEM (7 Rooms) ---
        // Extracted to Sector2_Cave.ts
        await generateCaveSystem(ctx, innerCave, caveEntrancePos);

        spawnSectorHordes(ctx);
    },

    onUpdate: (delta, now, playerPos, gameState, sectorState, events) => {
        // --- REVERB LOGIC ---
        // Inside cave bounds (Z < -65)
        const insideCave = playerPos.z < -65;
        if (soundManager.core) { // Check if core exists (safe check)
            // Simple fade handled by setReverb's built-in lerp
            if (insideCave) {
                soundManager.setReverb(0.35);
            } else {
                soundManager.setReverb(0);
            }
        }

        // --- FAMILY FOLLOW LOGIC ---
        // Generic follower system for all family members
        const familyMembers = (events as any).scene.children.filter((c: any) =>
            c.userData.type === 'family' || c.userData.isFamilyMember
        );

        familyMembers.forEach((member: THREE.Group, index: number) => {
            // Don't move Jordan during cinematic
            if (member.userData.name === 'Jordan' && sectorState.jordanCinematic?.phase !== 'COMPLETE') return;

            const ring = member.children.find((c: any) => c.userData.isRing);
            const familyObj = {
                mesh: member,
                following: true,
                ring: ring,
                seed: member.userData.seed || 0,
                // Pass cinematic speaking states if active
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
                index // Pass follower index for spacing
            );
        });

        // --- OCCLUSION LOGIC ---
        if ((events as any).scene) {
            const scene = (events as any).scene as THREE.Scene;
            const voidRoof = scene.getObjectByName("Sector2_VoidRoof");

            if (voidRoof) voidRoof.visible = true; // Always active to mask

            // --- JORDAN CINEMATIC LOGIC ---
            if (!sectorState.jordanCinematic) {
                sectorState.jordanCinematic = { phase: 'NONE', timer: 0 };
            }

            // Fixed Camera Positions for the whole sequence (adjusted to keep player in view)
            const fixedCamTarget = new THREE.Vector3(60, 12, -193);
            const fixedCamLookAt = new THREE.Vector3(45, 1, -193);

            // --- CINEMATIC TRIGGER & SEQUENCE ---
            // Access triggers from gameState (4th argument)
            const knockingTrigger = gameState.triggers.find(t => t.id === 's2_cave_knock_port');
            if (knockingTrigger && knockingTrigger.triggered && !sectorState.introCinematicPlayed) {
                const doorFrame = scene.getObjectByName('s2_bunker_door_frame');
                if (doorFrame && (events as any).startCinematic) {
                    (events as any).startCinematic(doorFrame, 1, { targetPos: fixedCamTarget, lookAtPos: fixedCamLookAt });
                    sectorState.introCinematicPlayed = true;
                    // Play knocking sound at start of Dialogue 1
                    soundManager.playMetalKnocking();
                }
            }


            const jordan = scene.children.find(c => (c.userData.isFamilyMember || c.userData.type === 'family') && c.userData.name === 'Jordan');
            /*
            if (jordan && sectorState.jordanCinematic.phase === 'NONE' && jordan.visible) {
                jordan.visible = false;
            }
            */

            const jc = sectorState.jordanCinematic;
            const doorL = scene.getObjectByName('s2_bunker_door_l');
            const doorR = scene.getObjectByName('s2_bunker_door_r');

            // Listen for custom triggers
            if (!jc.listenerAdded) {
                window.addEventListener('spawn_jordan', () => {
                    if (sectorState.jordanCinematic && sectorState.jordanCinematic.phase === 'NONE') {
                        sectorState.jordanCinematic.phase = 'OPENING_DOORS';
                        sectorState.jordanCinematic.timer = performance.now();
                        // Reset Jordan position just in case
                        //if (jordan) jordan.position.set(25, 0, -193);

                        // Play sound
                        soundManager.playMetalDoorOpen();

                        // Hide HUD for cinematic
                        window.dispatchEvent(new CustomEvent('hide_hud'));

                        // Ensure keep_camera override is active
                        if ((window as any).setCameraOverride) {
                            (window as any).setCameraOverride({
                                active: true,
                                targetPos: fixedCamTarget,
                                lookAtPos: fixedCamLookAt,
                                endTime: performance.now() + 60000 // 1 minute lock to cover sequence
                            });
                        }
                    }
                }, { once: true });

                window.addEventListener('s2_conclusion', () => {
                    // Dialogue finished! Prepare for boss spawn
                    jc.phase = 'FINISHED_AFTER_DIALOGUE';

                    // NO LONGER Remove Loke from scene after dialogue 2
                    // Loke stays to fight!
                    /*
                    if (jc.loke) {
                        jc.loke.visible = false;
                    }
                    */

                    // Trigger closing if not already closing (e.g. if skipped)
                    if (!jc.doorsClosing) {
                        jc.doorsClosing = true;
                        jc.doorsClosingTimer = performance.now();
                    }
                });

                jc.listenerAdded = true;
            }

            // --- MESH-INDEPENDENT ANIMATION UPDATES (CONCURRENT) ---

            // 1. Door Animation (Opening or Closing)
            if (jc.phase === 'OPENING_DOORS') {
                const elapsed = now - jc.timer;
                const openDist = Math.min(10, elapsed * 0.005); // Opened wide enough to clear 10m doors
                if (doorL) doorL.position.x = -5 - openDist;
                if (doorR) doorR.position.x = 5 + openDist;

                if (elapsed > 2000) {
                    jc.phase = 'JORDAN_WALK';
                    jc.timer = now;

                    // Dynamic walk target: Capture player position
                    if (playerPos) {
                        jc.walkTarget = new THREE.Vector3(playerPos.x, 0, playerPos.z);
                        // Add small gap so he doesn't walk into the player's face
                        const toPlayer = new THREE.Vector3().subVectors(playerPos, jordan?.position || new THREE.Vector3(25, 0, -193)).normalize();
                        jc.walkTarget.sub(toPlayer.multiplyScalar(2.0));
                    } else {
                        jc.walkTarget = new THREE.Vector3(52, 0, -193);
                    }
                }
            } else if (jc.doorsClosing) {
                // Secondary close trigger during WALK or via event
                const elapsed = now - (jc.doorsClosingTimer || now);
                const closeProgress = Math.min(1, elapsed / 800);
                if (doorL) doorL.position.x = -15 + (closeProgress * 10);
                if (doorR) doorR.position.x = 15 - (closeProgress * 10);

                // Play sound when doors finish closing (at 800ms)
                if (elapsed >= 800 && !jc.doorCloseSoundPlayed) {
                    soundManager.playMetalDoorShut();
                    jc.doorCloseSoundPlayed = true;
                }

                if (elapsed > 500 && jc.phase === 'FINISHED_AFTER_DIALOGUE') {
                    jc.phase = 'COMPLETE';

                    // Reset camera and HUD BEFORE boss spawn
                    if ((window as any).clearCameraOverride) (window as any).clearCameraOverride();
                    window.dispatchEvent(new CustomEvent('show_hud'));
                    window.dispatchEvent(new CustomEvent('boss-spawn-trigger'));
                    window.dispatchEvent(new CustomEvent('family-follow'));
                }
            }

            // --- MAIN STORY PHASE MACHINE ---
            if (jc.phase === 'JORDAN_WALK') {
                // Ensure we have the mesh reference
                if (!jc.jordan && jordan) jc.jordan = jordan;

                if (jc.jordan) {
                    const walkTarget = jc.walkTarget || new THREE.Vector3(52, 0, -193);
                    const jordanPos = jc.jordan.position;
                    const moveSpeed = 0.05;
                    jordanPos.lerp(walkTarget, moveSpeed);

                    // Manually trigger walk animation during walk phase
                    const familyObj = {
                        mesh: jc.jordan,
                        following: false,
                        isMoving: true,
                        isSpeaking: (gameState.speakingUntil > now),
                        seed: jc.jordan.userData.seed || 0
                    };
                    FamilySystem.update(familyObj, { position: playerPos } as THREE.Group, gameState, true, now, delta, { setFoundMemberName: () => { }, startCinematic: () => { } });

                    if (jordanPos.distanceTo(walkTarget) < 1.5) {
                        jc.phase = 'START_DIALOGUE_2';
                    }
                }
            } else if (jc.phase === 'START_DIALOGUE_2') {
                jc.phase = 'WAITING_FOR_CONCLUSION';
                const jordanObj = (events as any).familyMesh || scene.children.find(c => (c.userData.isFamilyMember || c.userData.type === 'family') && c.userData.name === 'Jordan');
                if (jordanObj && (events as any).startCinematic) {
                    (events as any).startCinematic(jordanObj, 102, { targetPos: fixedCamTarget, lookAtPos: fixedCamLookAt });
                }
            }
            else if (jc.phase === 'CLOSING_DOORS_LEGACY_HACK') { // Old path cleanup if needed
                jc.phase = 'COMPLETE';
            }

            // --- BOSS SPAWN EVENT ---
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

        // --- SPAWNING LOGIC (Shifted Z) ---
        if (!sectorState.spawnedRooms) sectorState.spawnedRooms = {};

        const roomCenters = [
            { id: 1, x: 100, z: -100, zomb: 5 },
            { id: 3, x: 150, z: -200, zomb: 5 },
            { id: 5, x: 100, z: -125, zomb: 5 },
            { id: 6, x: 60, z: -125, zomb: 5 },
        ];

        roomCenters.forEach(r => {
            if (!sectorState.spawnedRooms[r.id]) {
                const dist = Math.sqrt((playerPos.x - r.x) ** 2 + (playerPos.z - r.z) ** 2);
                if (dist < 30) {
                    sectorState.spawnedRooms[r.id] = true;
                    for (let i = 0; i < r.zomb; i++) {
                        const offX = (Math.random() - 0.5) * 20;
                        const offZ = (Math.random() - 0.5) * 20;
                        let type = 'WALKER';
                        if (r.id === 6 && Math.random() > 0.8) type = 'TANK';
                        else if (Math.random() > 0.7) type = 'RUNNER';

                        events.spawnZombie(type, new THREE.Vector3(r.x + offX, 0, r.z + offZ));
                    }
                }
            }
        });

        // Tunnel Ambush (Shifted Z)
        if (playerPos.z < -90 && playerPos.z > -130 && Math.abs(playerPos.x - 100) < 10) {
            if (gameState.enemies.length < 5 && Math.random() < 0.02) {
                events.spawnZombie('RUNNER', new THREE.Vector3(100, 0, -120));
            }
        }
    }
};

function spawnSectorHordes(ctx: SectorContext) {
    // TODO: Re-enable when we're done with the cave entrance and mountain
    return;
    if (!ctx.spawnHorde) return;

    // Defined Horde Locations (Forest)
    const hordeSpots = [
        new THREE.Vector3(0, 0, 150),   // Near Start
        new THREE.Vector3(30, 0, 100),  // Mid Forest
        new THREE.Vector3(-30, 0, 80),  // Left Forest
        new THREE.Vector3(50, 0, 0),    // Near Cave Path
        new THREE.Vector3(120, 0, -60)  // Outside Cave
    ];

    hordeSpots.forEach((pos, i) => {
        const count = 4 + Math.floor(ctx.rng() * 4);
        ctx.spawnHorde(count, undefined, pos);
    });
}
