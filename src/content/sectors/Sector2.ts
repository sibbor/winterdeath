
import * as THREE from 'three';
import { SectorDef, SectorContext } from '../../types/sectors';
import { MATERIALS, GEOMETRY, createTextSprite, ModelFactory } from '../../utils/assets';
import { SectorBuilder } from '../../core/world/SectorGenerator';
import { PathGenerator } from '../../core/world/PathGenerator';
import { ObjectGenerator } from '../../core/world/ObjectGenerator';
import { generateCaveSystem } from './Sector2_Cave';
import { t } from '../../utils/i18n';
import { soundManager } from '../../utils/sound';
import { normalize } from 'path';
import { EnemyManager } from '../../core/EnemyManager';
import { BOSSES, FAMILY_MEMBERS } from '../../content/constants';
import { SectorManager } from '../../core/SectorManager';

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
        ambientIntensity: 0.2,
        groundColor: 0x111111,
        fov: 50,
        moon: { visible: true, color: 0x8899aa, intensity: 0.5 },
        cameraOffsetZ: 40,
        weather: 'snow'
    },
    // --- SPAWN POINTS ---
    playerSpawn: LOCATIONS.SPAWN.PLAYER,
    familySpawn: LOCATIONS.SPAWN.FAMILY,
    bossSpawn: LOCATIONS.SPAWN.BOSS,

    cinematic: {
        offset: { x: 20, y: 8, z: 0 }, // Behind the player (East of midpoint)
        lookAtOffset: { x: -20, y: -5, z: 0 }, // Looking West through the door
        rotationSpeed: 0,
        zoom: 0.1
    },

    generate: (ctx: SectorContext) => {
        const { scene, obstacles, flickeringLights, burningBarrels, triggers } = ctx;

        // Exact Cave Entrance Position
        const caveEntrancePos = new THREE.Vector3(LOCATIONS.POIS.CAVE_ENTRANCE.x, 0, LOCATIONS.POIS.CAVE_ENTRANCE.z);
        const tunnelPos = new THREE.Vector3(LOCATIONS.POIS.TUNNEL.x, 0, LOCATIONS.POIS.TUNNEL.z);

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

        // Visual Collectibles                
        SectorBuilder.spawnCollectible(ctx, LOCATIONS.COLLECTIBLES.C1.x, LOCATIONS.COLLECTIBLES.C1.z, 's2_collectible_1', 'pacifier');
        SectorBuilder.spawnCollectible(ctx, LOCATIONS.COLLECTIBLES.C2.x, LOCATIONS.COLLECTIBLES.C2.z, 's2_collectible_2', 'teddy');

        // Visualize Triggers
        SectorBuilder.visualizeTriggers(ctx);

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

        // Ground (Snowy) - Covering the entire play area
        const forestGround = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), MATERIALS.snow);
        forestGround.rotation.x = -Math.PI / 2;
        forestGround.position.set(50, 0.05, -50);
        forestGround.receiveShadow = true;
        scene.add(forestGround);

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
        ObjectGenerator.createForestInPolygon(ctx, forestLeft, 12, ['pine', 'spruce']);
        ObjectGenerator.createForestInPolygon(ctx, forestRight, 12, ['pine', 'spruce']);


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

        // --- DEBUG VISUALIZATION ---
        // 1. Forest Polygons (Green Lines)
        const debugMatGreen = new THREE.LineBasicMaterial({ color: 0x00ff00 });
        [forestLeft, forestRight].forEach(poly => {
            const points = [...poly, poly[0]]; // Close loop
            const geo = new THREE.BufferGeometry().setFromPoints(points);
            const line = new THREE.Line(geo, debugMatGreen);
            line.position.y = 1; // Slight lift
            scene.add(line);
        });

        // 2. Invisible Walls (Blue Lines)
        const debugMatBlue = new THREE.LineBasicMaterial({ color: 0x0000ff });
        [leftWallPoints, rightWallPoints].forEach(pts => {
            if (pts.length < 2) return;
            const geo = new THREE.BufferGeometry().setFromPoints(pts);
            const line = new THREE.Line(geo, debugMatBlue); // Open path
            line.position.y = 2; // Higher lift
            scene.add(line);
        });

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

        // 3. Spawners for Loke & Jordan
        // Re-check for family models and spawn if missing
        const ModelFactory = (window as any).ModelFactory;
        if (ModelFactory) {
            let lokeMesh = scene.children.find(c => c.userData.isFamilyMember && c.userData.name === 'Loke');
            if (!lokeMesh) {
                lokeMesh = ModelFactory.createFamilyMember(FAMILY_MEMBERS[0]);
                lokeMesh.name = 'Loke';
                lokeMesh.userData.name = 'Loke';
                lokeMesh.userData.type = 'family';
                lokeMesh.userData.isFamilyMember = true;
                lokeMesh.visible = false;
                scene.add(lokeMesh);
            }

            let jordanMesh = scene.children.find(c => c.userData.isFamilyMember && c.userData.name === 'Jordan');
            if (!jordanMesh) {
                jordanMesh = ModelFactory.createFamilyMember(FAMILY_MEMBERS[1]);
                jordanMesh.name = 'Jordan';
                jordanMesh.userData.name = 'Jordan';
                jordanMesh.userData.type = 'family';
                jordanMesh.userData.isFamilyMember = true;
                jordanMesh.visible = false;
                jordanMesh.position.set(LOCATIONS.SPAWN.FAMILY.x, LOCATIONS.SPAWN.FAMILY.y, LOCATIONS.SPAWN.FAMILY.z); // Initial position inside room R8
                scene.add(jordanMesh);
            }
        }

        // --- PART 4: MOUNTAIN EXTERIOR & DECORATION ---
        // 1. Left Wall (Needs gap for Cave Entrance at 100, -70)

        // Find split point
        let caveIndex = -1;
        let minCaveDist = Infinity;
        leftWallPoints.forEach((p, i) => {
            const d = p.distanceTo(caveEntrancePos);
            if (d < minCaveDist) { minCaveDist = d; caveIndex = i; }
        });

        if (minCaveDist < 50) {
            // Create gap
            const gapSize = 15; // Number of points to skip
            const startGap = Math.max(0, caveIndex - 5);
            const endGap = Math.min(leftWallPoints.length, caveIndex + 10);

            const wall1 = leftWallPoints.slice(0, startGap);
            const wall2 = leftWallPoints.slice(endGap);

            if (wall1.length > 1) ObjectGenerator.createInvisibleWall(ctx, wall1, 10, 1.0, 'InvisibleWall_Left_1');
            if (wall2.length > 1) ObjectGenerator.createInvisibleWall(ctx, wall2, 10, 1.0, 'InvisibleWall_Left_2');
        } else {
            ObjectGenerator.createInvisibleWall(ctx, leftWallPoints, 10, 1.0, 'InvisibleWall_Left');
        }

        // 2. Right Wall (Continuous)
        ObjectGenerator.createInvisibleWall(ctx, rightWallPoints, 10, 1.0, 'InvisibleWall_Right');

        // 3. Backward Exit Block (Z=213)
        const backBlockPoints = [new THREE.Vector3(-34, 0, 213), new THREE.Vector3(34, 0, 213)];
        ObjectGenerator.createInvisibleWall(ctx, backBlockPoints, 10, 1.0, 'InvisibleWall_BackBlock');

        // 4. Right Side Block (X=34)
        const rightBlockPoints = [new THREE.Vector3(165, 0, -88), new THREE.Vector3(165, 0, -17)];
        ObjectGenerator.createInvisibleWall(ctx, rightBlockPoints, 10, 1.0, 'InvisibleWall_RightBlock');

        // Debug Visual for Back Block
        const debugBackBlock = new THREE.Line(new THREE.BufferGeometry().setFromPoints(backBlockPoints), debugMatBlue);
        debugBackBlock.position.y = 2;
        scene.add(debugBackBlock);
        const debugRightBlock = new THREE.Line(new THREE.BufferGeometry().setFromPoints(rightBlockPoints), debugMatBlue);
        debugRightBlock.position.y = 2;
        scene.add(debugRightBlock);

        // Mountain Groups
        const outerMountain = new THREE.Group();
        outerMountain.name = "Sector2_OuterMountain";
        scene.add(outerMountain);

        const permanentMountain = new THREE.Group();
        permanentMountain.name = "Sector2_PermanentMountain";
        scene.add(permanentMountain);

        const innerCave = new THREE.Group();
        innerCave.name = "Sector2_InnerCave";
        scene.add(innerCave);

        // 2. Tunnel Arch (Concrete) - Decorative only, blocked
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

        permanentMountain.add(tunnelGroup);

        // 5. Permanent Rocks sealing the Tunnel
        /* Commented out for performance
        for (let z = -42; z <= -18; z += 6) {
            const r = new THREE.Mesh(GEOMETRY.stone, MATERIALS.stone);
            const s = 5 + Math.random() * 4;
            r.scale.set(s, s, s);
            r.position.set(167, s / 2 - 1, z);
            r.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
            r.castShadow = true;
            permanentMountain.add(r);
            obstacles.push({ mesh: r, collider: { type: 'sphere', radius: s * 0.8 } });
        }
        for (let z = -58; z >= -80; z -= 6) {
            const r = new THREE.Mesh(GEOMETRY.stone, MATERIALS.stone);
            const s = 5 + Math.random() * 4;
            r.scale.set(s, s, s);
            r.position.set(167, s / 2 - 1, z);
            r.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
            r.castShadow = true;
            permanentMountain.add(r);
            obstacles.push({ mesh: r, collider: { type: 'sphere', radius: s * 0.8 } });
        }
        for (let x = 165; x <= 175; x += 5) {
            const r = new THREE.Mesh(GEOMETRY.stone, MATERIALS.stone);
            r.scale.set(8, 6, 6);
            r.position.set(x, 18, -50);
            permanentMountain.add(r);
        }
         
        // --- PART 4: MEGA ROCK SYSTEM (Visuals + Optimized Physics) ---
        // Replaces Blocky Mountains with Scaled Stone Clusters
         
        const createMegaRock = (name: string, x: number, y: number, z: number, w: number, h: number, d: number) => {
            // 1. Physics: Simple Box Collider (Invisible)
            // Only generated if touching ground
            if (y - h / 2 < 2) {
                const colliderGeo = new THREE.BoxGeometry(w, h, d);
                const colliderMat = new THREE.MeshBasicMaterial({ visible: false });
                const collider = new THREE.Mesh(colliderGeo, colliderMat);
                collider.position.set(x, y, z);
                collider.name = name + "_Collider";
                scene.add(collider);
                collider.updateMatrixWorld();
                obstacles.push({ mesh: collider, collider: { type: 'box', size: new THREE.Vector3(w, h, d) } });
            }
         
            // 2. Visuals: Composite Scaled Stones
            // Create a few overlapping stones to break the uniformity
            // Main mass
            const mainRock = new THREE.Mesh(GEOMETRY.stone, MATERIALS.stone);
            mainRock.position.set(x, y, z);
            mainRock.scale.set(w * 0.8, h * 0.9, d * 0.8);
            mainRock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
            mainRock.castShadow = true;
            mainRock.receiveShadow = true;
            outerMountain.add(mainRock);
         
            // Detail boulders (2-4 extra)
            const numDetails = 2 + Math.floor(Math.random() * 3);
            for (let i = 0; i < numDetails; i++) {
                const detail = new THREE.Mesh(GEOMETRY.stone, MATERIALS.stone);
                // Random offset within the bounds
                const jx = (Math.random() - 0.5) * w * 0.6;
                const jy = (Math.random() - 0.5) * h * 0.6;
                const jz = (Math.random() - 0.5) * d * 0.6;
         
                detail.position.set(x + jx, y + jy, z + jz);
                // Smaller random scales
                detail.scale.set(w * (0.3 + Math.random() * 0.4), h * (0.3 + Math.random() * 0.4), d * (0.3 + Math.random() * 0.4));
                detail.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
                detail.castShadow = true;
                detail.receiveShadow = true;
                outerMountain.add(detail);
            }
        };
         
        // 1. Left Mountain (Ends at X=90. Start at -50. Center = 20. Width = 140.)
        createMegaRock("Mountain_Left", 20, 20, -80, 140, 40, 60);
         
        // 2. Cave Arch (X=90 to 110. Center=100. Width=20.)
        createMegaRock("Mountain_Arch_Cave", 100, 23, -80, 20, 34, 60);
         
        // 3. Middle Mountain (X=110 to 128. Center=119. Width=18.)
        createMegaRock("Mountain_Center", 119, 20, -80, 18, 40, 60);
         
        // 4. Tunnel Arch (X=128 to 146. Center=137. Width=18.)
        createMegaRock("Mountain_Arch_Tunnel", 137, 24, -80, 18, 32, 60);
         
        // 5. Right Mountain (X=146 to 300. Center=223. Width=154.)
        createMegaRock("Mountain_Right", 223, 20, -80, 154, 40, 60);
         
        // 6. Right Side Extension
        createMegaRock("Mountain_Right_South", 180, 20, 0, 80, 40, 200);
        */

        // --- PART 5: THE CAVE SYSTEM (7 Rooms) ---
        // Extracted to Sector2_Cave.ts
        generateCaveSystem(ctx, innerCave, caveEntrancePos);
    },

    onUpdate: (delta, now, playerPos, gameState, sectorState, events) => {
        // --- OCCLUSION LOGIC ---
        if ((events as any).scene) {
            const scene = (events as any).scene as THREE.Scene;
            const outer = scene.getObjectByName("Sector2_OuterMountain");
            const voidRoof = scene.getObjectByName("Sector2_VoidRoof");
            const curtain = scene.getObjectByName("Sector2_Curtain");

            // Check if inside cave bounds (Z < -60)
            const insideCave = playerPos.z < -70;

            if (outer) outer.visible = !insideCave;
            if (curtain) curtain.visible = insideCave;
            if (voidRoof) voidRoof.visible = true;

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
                }
            }

            // Ensure Jordan is hidden if not yet revealed
            const jordan = scene.children.find(c => (c.userData.isFamilyMember || c.userData.type === 'family') && c.userData.name === 'Jordan');
            if (jordan && sectorState.jordanCinematic.phase === 'NONE' && jordan.visible) {
                jordan.visible = false;
            }

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
                        if (jordan) jordan.position.set(25, 0, -193);

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

                    // Remove Loke from scene after dialogue 2 ends
                    if (jc.loke) {
                        jc.loke.visible = false;
                    }

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

                if (elapsed > 0 && !jordan?.visible) {
                    // Reveal Jordan immediately as doors open
                    if (jordan) {
                        jordan.visible = true;
                        jordan.position.set(LOCATIONS.SPAWN.FAMILY.x, LOCATIONS.SPAWN.FAMILY.y, LOCATIONS.SPAWN.FAMILY.z);
                        jc.jordan = jordan;
                    }
                }

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

                    // Prepare Loke
                    let loke = scene.children.find(c =>
                        (c.userData.isFamilyMember || c.userData.type === 'family' || c.name === 'Loke') &&
                        c.userData.name === 'Loke'
                    );

                    if (!loke) {
                        // Fallback: Manually create Loke (The Camp might have issues with duplicate members if not careful)
                        const lokeData = FAMILY_MEMBERS.find(f => f.name === 'Loke');
                        if (lokeData) {
                            loke = ModelFactory.createFamilyMember(lokeData);
                            scene.add(loke);
                        }
                    }

                    if (loke && playerPos) {
                        loke.userData.name = 'Loke';
                        loke.userData.isFamilyMember = true;
                        loke.userData.type = 'family';
                        loke.name = 'Loke'; // Also set standard mesh name

                        loke.position.set(playerPos.x + 1, 0, playerPos.z + 1);
                        loke.lookAt(new THREE.Vector3(41, 0, -193));
                        loke.visible = true;

                        loke.traverse((child: any) => {
                            if (child.isMesh) {
                                if (!child.userData.originalMaterial) child.userData.originalMaterial = child.material.clone();
                                child.material = child.material.clone();
                                child.material.transparent = true;
                                child.material.opacity = 0;
                                child.material.needsUpdate = true;
                            }
                        });
                        jc.loke = loke;
                        jc.lokeFadeStart = now;
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

                if (elapsed > 1000 && jc.phase === 'FINISHED_AFTER_DIALOGUE') {
                    jc.phase = 'COMPLETE';

                    // Reset camera and HUD BEFORE boss spawn
                    if ((window as any).clearCameraOverride) (window as any).clearCameraOverride();
                    window.dispatchEvent(new CustomEvent('show_hud'));

                    // Then trigger boss spawn
                    window.dispatchEvent(new CustomEvent('boss-spawn-trigger'));
                    window.dispatchEvent(new CustomEvent('family-follow'));
                }
            }

            // 2. Loke Fade Update
            if (jc.loke && jc.lokeFadeStart) {
                const elapsed = now - jc.lokeFadeStart;
                const opacity = Math.min(1.0, elapsed / 2000);
                jc.loke.traverse((child: any) => {
                    if (child.isMesh && child.material) {
                        child.material.opacity = opacity;
                        child.material.transparent = opacity < 0.99;
                    }
                });
                if (opacity >= 1.0) delete jc.lokeFadeStart;
            }

            // --- MAIN STORY PHASE MACHINE ---
            if (jc.phase === 'JORDAN_WALK') {
                if (jc.jordan) {
                    const walkTarget = jc.walkTarget || new THREE.Vector3(52, 0, -193);
                    const jordanPos = jc.jordan.position;
                    const moveSpeed = 0.05;
                    jordanPos.lerp(walkTarget, moveSpeed);

                    if (jordanPos.distanceTo(walkTarget) < 1.0) {
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
