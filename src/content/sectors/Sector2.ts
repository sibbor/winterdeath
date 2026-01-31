
import * as THREE from 'three';
import { SectorDef, SectorContext } from '../../types/sectors';
import { MATERIALS, GEOMETRY, createTextSprite } from '../../utils/assets';
import { SectorBuilder } from '../../core/world/SectorGenerator';
import { generateCaveSystem } from './Sector2_Cave';
import { t } from '../../utils/i18n';

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
        cameraOffsetZ: 35,
        weather: 'snow'
    },
    // --- SPAWN POINTS ---
    playerSpawn: { x: 0, z: 200 },
    familySpawn: { x: 61, z: -193, y: 0 }, // In Boss Room (R7)
    bossSpawn: { x: 61, z: -193 },

    cinematic: {
        offset: { x: 0, y: 15, z: 20 },
        lookAtOffset: { x: 0, y: 2, z: 0 },
        rotationSpeed: 0
    },

    generate: (ctx: SectorContext) => {
        const { scene, obstacles, flickeringLights, burningBarrels, triggers } = ctx;

        // --- TRIGGERS (Outside/General) ---
        triggers.push(
            // Collectible (1 SP)
            {
                id: 's2_collectible_1',
                position: { x: 50, z: 22 },
                radius: 2,
                type: 'COLLECTIBLE',
                content: "clues.s2_collectible_1",
                description: "clues.s2_collectible_1_description",
                triggered: false,
                icon: "s2_collectible_1_icon",
                actions: [{ type: 'GIVE_REWARD', payload: { sp: 1 } }]
            },
            // Narrative Triggers (50 XP)
            {
                id: 's2_start', position: { x: 0, z: 180 }, radius: 20, type: 'THOUGHTS', content: "clues.s2_start", triggered: false,
                actions: [{ type: 'GIVE_REWARD', payload: { xp: 50 } }]
            },
            {
                id: 's2_combat', position: { x: 2, z: 95 }, radius: 20, type: 'SPEECH', content: "clues.s2_combat", triggered: false,
                actions: [{ type: 'GIVE_REWARD', payload: { xp: 50 } }]
            },
            {
                id: 's2_mountain', position: { x: 95, z: -55 }, radius: 20, type: 'SPEECH', content: "clues.s2_mountain", triggered: false,
                actions: [{ type: 'GIVE_REWARD', payload: { xp: 50 } }]
            },
            {
                id: 's2_train_tunnel', position: { x: 130, z: -55 }, radius: 20, type: 'POI', content: "clues.s2_tunnel", triggered: false,
                actions: [{ type: 'GIVE_REWARD', payload: { xp: 50 } }]
            },

            // --- FIND JORDAN EVENT ---
            {
                id: 'found_jordan',
                position: { x: 61, z: -193 }, // Boss Room
                radius: 8,
                type: 'EVENT',
                content: '',
                triggered: false,
                actions: [{ type: 'START_CINEMATIC' }]
            }
        );

        // --- PART 1: THE SMOOTH S-CURVE RAILWAY ---
        const railPoints = [
            new THREE.Vector3(0, 0, 220),
            new THREE.Vector3(0, 0, 120),
            new THREE.Vector3(10, 0, 60),
            new THREE.Vector3(40, 0, 0),
            new THREE.Vector3(100, 0, -50),
            new THREE.Vector3(200, 0, -50)
        ];

        // Generate Rail Mesh
        const curve = SectorBuilder.createCurvedRailTrack(ctx, railPoints);

        // Ground (Snowy) - Covering the entire play area
        const forestGround = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), MATERIALS.snow);
        forestGround.rotation.x = -Math.PI / 2;
        forestGround.position.set(50, 0.05, -50);
        forestGround.receiveShadow = true;
        scene.add(forestGround);

        // --- CONFIGURATION ---
        // Exact Cave Entrance Position
        const caveEntrancePos = new THREE.Vector3(100, 0, -70);
        const tunnelPos = new THREE.Vector3(170, 0, -50); // End of track tunnel

        // --- PART 2: FOREST (Trees, Walls, Ground Rocks) ---
        const steps = 400;
        const curvePoints = curve.getSpacedPoints(steps);
        const wallOffset = 35;

        for (let i = 0; i < curvePoints.length; i++) {
            const pt = curvePoints[i];

            // Calculate normal vector
            let tangent;
            if (i < curvePoints.length - 1) {
                tangent = new THREE.Vector3().subVectors(curvePoints[i + 1], pt).normalize();
            } else {
                tangent = new THREE.Vector3().subVectors(pt, curvePoints[i - 1]).normalize();
            }
            const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);

            // Exclusion Zones
            const caveZone = { pos: caveEntrancePos, radius: 35 };
            // NEW: Zone covering the bulk of the cave to prevent tree overlap
            const caveDeepZone = { pos: new THREE.Vector3(100, 0, -170), radius: 100 };

            const pathZone = { pos: pt, radius: 12 };
            const tunnelZone = { pos: tunnelPos, radius: 25 };
            const tunnelApproachZone = { pos: new THREE.Vector3(145, 0, -50), radius: 35 };

            const zones = [caveZone, caveDeepZone, pathZone, tunnelZone, tunnelApproachZone];

            // 1. TRACKSIDE TREES
            if (i % 8 === 0) {
                const lineDist = 10 + Math.random() * 4;
                const posL = pt.clone().add(normal.clone().multiplyScalar(-lineDist));
                SectorBuilder.fillArea(ctx, { x: posL.x, z: posL.z }, 2, 1, 'tree', 0, zones);
                const posR = pt.clone().add(normal.clone().multiplyScalar(lineDist));
                SectorBuilder.fillArea(ctx, { x: posR.x, z: posR.z }, 2, 1, 'tree', 0, zones);
            }

            // 2. MID-RANGE FOREST FILL
            if (i % 10 === 0) {
                const fillDist = 18 + Math.random() * 15;
                const fPosL = pt.clone().add(normal.clone().multiplyScalar(-fillDist));
                SectorBuilder.fillArea(ctx, { x: fPosL.x, z: fPosL.z }, 4, 1, 'tree', 0, zones);
                const fPosR = pt.clone().add(normal.clone().multiplyScalar(fillDist));
                SectorBuilder.fillArea(ctx, { x: fPosR.x, z: fPosR.z }, 4, 1, 'tree', 0, zones);
            }

            // 3. DENSE FOREST & WALLS
            if (i % 16 === 0) {
                const wallL = pt.clone().add(normal.clone().multiplyScalar(-(wallOffset + 10)));
                SectorBuilder.fillArea(ctx, { x: wallL.x, z: wallL.z }, { width: 25, height: 25 }, 5, 'tree', 0, zones);
                const wallR = pt.clone().add(normal.clone().multiplyScalar(wallOffset + 10));
                SectorBuilder.fillArea(ctx, { x: wallR.x, z: wallR.z }, { width: 25, height: 25 }, 5, 'tree', 0, zones);
            }

            // 4. GROUND ROCKS
            if (i % 20 === 0) {
                const rockDist = 8 + Math.random() * 25;
                const side = Math.random() > 0.5 ? 1 : -1;
                const rPos = pt.clone().add(normal.clone().multiplyScalar(rockDist * side));

                const inTunnelApproach = rPos.x > 120 && rPos.x < 170 && Math.abs(rPos.z - (-50)) < 15;

                if (!inTunnelApproach && rPos.distanceTo(caveEntrancePos) > 30 && rPos.distanceTo(tunnelPos) > 30 && rPos.distanceTo(pt) > 8) {
                    const rock = new THREE.Mesh(GEOMETRY.stone, MATERIALS.stone);
                    const s = 0.5 + Math.random() * 1.5;
                    rock.scale.set(s, s * 0.6, s);
                    rock.position.set(rPos.x, s * 0.3, rPos.z);
                    rock.rotation.set(Math.random(), Math.random(), Math.random());
                    rock.castShadow = true;
                    scene.add(rock);
                }
            }

            // --- INVISIBLE WALLS ---
            if (i < steps - 1) {
                const nextPt = curvePoints[i + 1];
                const nextTangent = new THREE.Vector3().subVectors(curvePoints[Math.min(i + 2, steps - 1)], nextPt).normalize();
                const nextNormal = new THREE.Vector3(-nextTangent.z, 0, nextTangent.x);

                // LEFT WALL
                const w1 = pt.clone().add(normal.clone().multiplyScalar(-wallOffset));
                const w2 = nextPt.clone().add(nextNormal.clone().multiplyScalar(-wallOffset));
                const distToCave = w1.distanceTo(caveEntrancePos);

                // Keep gap for cave entrance
                if (distToCave > 35) {
                    const len = w1.distanceTo(w2);
                    const midL = new THREE.Vector3().addVectors(w1, w2).multiplyScalar(0.5);
                    const wallL = new THREE.Mesh(new THREE.BoxGeometry(1, 20, len + 0.5), new THREE.MeshBasicMaterial({ visible: false }));
                    wallL.position.copy(midL);
                    wallL.lookAt(w2);
                    scene.add(wallL);
                    obstacles.push({ mesh: wallL, collider: { type: 'box', size: new THREE.Vector3(1, 20, len + 0.5) } });
                }

                // RIGHT WALL
                const w3 = pt.clone().add(normal.clone().multiplyScalar(wallOffset));
                const w4 = nextPt.clone().add(nextNormal.clone().multiplyScalar(wallOffset));
                const midR = new THREE.Vector3().addVectors(w3, w4).multiplyScalar(0.5);
                const lenR = w3.distanceTo(w4);
                const wallR = new THREE.Mesh(new THREE.BoxGeometry(1, 20, lenR + 0.5), new THREE.MeshBasicMaterial({ visible: false }));
                wallR.position.copy(midR);
                wallR.lookAt(w4);
                scene.add(wallR);
                obstacles.push({ mesh: wallR, collider: { type: 'box', size: new THREE.Vector3(1, 20, lenR + 0.5) } });
            }
        }

        // --- PART 3: MOUNTAIN EXTERIOR & DECORATION ---

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
        tunnelGroup.add(darkBox);

        const tunnelBlock = new THREE.Mesh(new THREE.BoxGeometry(14, 20, 5), new THREE.MeshBasicMaterial({ visible: false }));
        tunnelBlock.position.set(0, 10, 2);
        tunnelGroup.add(tunnelBlock);
        obstacles.push({ mesh: tunnelBlock, collider: { type: 'box', size: new THREE.Vector3(14, 20, 5) } });

        permanentMountain.add(tunnelGroup);

        // 5. Permanent Rocks sealing the Tunnel
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

        // --- PART 4: PROCEDURAL MOUNTAIN FACE ---
        const mountainWidth = 300;
        const cliffLayers = 10;

        for (let layer = 0; layer < cliffLayers; layer++) {
            const numRocks = 35 - layer;
            const span = mountainWidth - (layer * 10);

            for (let i = 0; i < numRocks; i++) {
                const t = i / (numRocks - 1);
                const xPos = 80 + (t - 0.5) * span + (Math.random() - 0.5) * 15;
                const yHeight = layer * 10;

                // Gap for Tunnel
                if (Math.abs(xPos - tunnelPos.x) < 14) {
                    if (yHeight < 22) continue;
                }

                // Gap for Cave Entrance (Strict removal based on tunnel width)
                if (Math.abs(xPos - caveEntrancePos.x) < 22) { // Slightly wider than 14 for visual clearance
                    if (yHeight < 18) continue;
                }

                let zBase = -80; // Baseline Z for mountain face
                if (xPos > 130) {
                    // Taper towards tunnel
                    const lerpFactor = Math.min(1, (xPos - 130) / 40);
                    zBase = -80 + (lerpFactor * 30);
                } else if (xPos > 70 && xPos < 130) {
                    // Indent around cave entrance (Matches new -70 position logic)
                    zBase = -70;
                }

                const zDepth = zBase - (layer * 6) + (Math.random() - 0.5) * 8;

                if (xPos > 130 && xPos < 165 && Math.abs(zDepth - (-50)) < 12 && yHeight < 15) {
                    continue;
                }

                const s = 15 + Math.random() * 20;
                const rock = new THREE.Mesh(GEOMETRY.stone, MATERIALS.stone);
                rock.position.set(xPos, yHeight - 5 + (Math.random() * 5), zDepth);
                rock.scale.set(s, s, s);
                rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
                rock.castShadow = true;
                rock.receiveShadow = true;

                // Distance checks for visibility grouping
                const distToCave = new THREE.Vector2(xPos, zDepth).distanceTo(new THREE.Vector2(caveEntrancePos.x, caveEntrancePos.z));
                const distToTunnel = new THREE.Vector2(xPos, zDepth).distanceTo(new THREE.Vector2(tunnelPos.x, tunnelPos.z));

                if (distToCave < 60 || distToTunnel < 50) {
                    if (distToCave < 60 && yHeight > 8) { // Changed from 15 to 8 to match internal wall height
                        outerMountain.add(rock);
                    } else {
                        permanentMountain.add(rock);
                    }
                } else {
                    outerMountain.add(rock);
                }

                // Add collision for base layer
                if (layer === 0) {
                    obstacles.push({ mesh: rock, collider: { type: 'sphere', radius: s * 0.8 } });
                }
            }
        }

        // --- PART 5: THE CAVE SYSTEM (7 Rooms) ---
        // Extracted to Sector2_Cave.ts
        generateCaveSystem(ctx, innerCave, caveEntrancePos);

        SectorBuilder.spawnClueMarker(ctx, 50, 22, t('clues.s2_collectible_1'), 'phone');
        SectorBuilder.spawnClueMarker(ctx, 92, -208, t('clues.s2_collectible_2'), 'pacifier');

        SectorBuilder.visualizeTriggers(ctx);
    },

    onUpdate: (delta, now, playerPos, gameState, sectorState, events) => {
        // --- OCCLUSION LOGIC ---
        if ((events as any).scene) {
            const scene = (events as any).scene as THREE.Scene;
            const outer = scene.getObjectByName("Sector2_OuterMountain");
            const voidRoof = scene.getObjectByName("Sector2_VoidRoof");
            const curtain = scene.getObjectByName("Sector2_Curtain");

            // Check if inside cave bounds (Z < -60)
            const insideCave = playerPos.z < -60;

            if (outer) outer.visible = !insideCave;
            if (curtain) curtain.visible = insideCave;
            if (voidRoof) voidRoof.visible = true;
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
