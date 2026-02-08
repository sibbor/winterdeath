
import * as THREE from 'three';
import { SectorContext } from '../../types/sectors';
import { MATERIALS, GEOMETRY } from '../../utils/assets';
import { SectorBuilder } from '../../core/world/SectorGenerator';
import { t } from '../../utils/i18n';

export const generateCaveSystem = async (ctx: SectorContext, innerCave: THREE.Group, caveEntrancePos: THREE.Vector3) => {
    const { scene, obstacles, flickeringLights, triggers } = ctx;

    // 5.1 Floors (Specific Rooms & Corridors)
    // Removed giant plane to prevent leakage

    // Will generate floors after spaces are defined...
    interface Box { x: number; z: number; w: number; d: number; rotation?: number; }
    interface RoomData extends Box {
        id: number;
        type: string;
        zombies?: number;
        chests?: number;
        boss?: boolean;
        family?: boolean;
    }


    // Define Rooms
    const rooms: RoomData[] = [
        { id: 1, x: 100, z: -100, w: 30, d: 30, type: 'Lobby', zombies: 5 },
        { id: 2, x: 150, z: -150, w: 50, d: 20, type: 'Material', chests: 2 },
        { id: 3, x: 150, z: -200, w: 30, d: 30, type: 'Mess', zombies: 5 },
        { id: 4, x: 100, z: -200, w: 30, d: 30, type: 'Food', chests: 3 },
        { id: 5, x: 100, z: -125, w: 20, d: 20, type: 'Social1', zombies: 5 },
        { id: 6, x: 60, z: -125, w: 30, d: 30, type: 'Social2', zombies: 5 },
        { id: 7, x: 61, z: -193, w: 40, d: 50, type: 'Boss', boss: true, family: true },
        { id: 8, x: 25, z: -193, w: 20, d: 20, type: 'BunkerInterior' } // Room behind the doors
    ];

    // Define Explicit Corridors to Connect Rooms
    const corridors: Box[] = [
        // Entrance Tunnel (From -70 to R1 -100)
        { x: 100, z: -85, w: 14, d: 35 },

        // R5 <-> R2 Connection (Diagonal) - Modified to be truly diagonal
        { x: 118, z: -138, w: 35, d: 12, rotation: -Math.PI / 4 },

        // R2 <-> R3 (Vertical)
        // R2 (150,-150) to R3 (150,-200)
        { x: 150, z: -175, w: 10, d: 30 },

        // R3 <-> R4 (Horizontal)
        // R3 (150,-200) to R4 (100,-200)
        { x: 125, z: -200, w: 30, d: 10 },

        // R5 <-> R1 (Vertical)
        // R5 top -115. R1 bottom -115. (Touch)
        { x: 100, z: -115, w: 10, d: 10 },

        // R5 <-> R6 (Horizontal)
        // R5 left 90. R6 right 75.
        { x: 82.5, z: -125, w: 20, d: 10 },

        // New R6 (North) <-> R4 (West)
        // R6 (60, -125) -> R4 (100, -200)
        { x: 60, z: -145, w: 10, d: 50 },  // North from R6
        { x: 75, z: -160, w: 30, d: 10 },  // East step
        { x: 85, z: -180, w: 10, d: 40 },  // South to R4 West side

        // New R4 (North) <-> R7 (East)
        // R4 (100, -200) -> R7 (61, -193)
        { x: 100, z: -182.5, w: 10, d: 15 }, // North from R4
        { x: 90, z: -175, w: 30, d: 10 },    // West step
        { x: 81, z: -184, w: 10, d: 20 },     // South to R7 East side
        // Bunker interior connection - Widened to 24 to fit the 22m door frame
        { x: 38, z: -193, w: 10, d: 24 }      // R8 <-> R7 (Connecting behind doors)
    ];

    // --- FLOOR GENERATION ---
    const allSpaces: Box[] = [...rooms, ...corridors];
    allSpaces.forEach(s => {
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(s.w + 6, s.d + 6), MATERIALS.gravel);
        floor.rotation.x = -Math.PI / 2;
        if (s.rotation) floor.rotation.z = -s.rotation; // Plane geometry is X-Z, rotation is Y (which becomes Z after rotX)

        floor.position.set(s.x, 0.06, s.z); // Lifted to 0.05 for visibility
        floor.receiveShadow = true;
        innerCave.add(floor);
    });

    if (ctx.yield) await ctx.yield();

    // Entrance Half-Circle Gravel
    const entranceGeo = new THREE.CircleGeometry(12, 32, 0, Math.PI);
    const entranceFloor = new THREE.Mesh(entranceGeo, MATERIALS.gravel);
    entranceFloor.rotation.x = -Math.PI / 2;
    // Entrance is at -70. Cave interior goes to -100.
    // So we want the half-circle to point towards POSITIVE Z (towards track).
    entranceFloor.rotation.z = 0;
    entranceFloor.position.set(caveEntrancePos.x, 0.05, caveEntrancePos.z + 2); // Lifted to 0.05
    innerCave.add(entranceFloor);

    const createStringLight = (p1: THREE.Vector3, p2: THREE.Vector3, intensity: number) => {
        const dist = p1.distanceTo(p2);
        const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
        mid.y -= 1.0;

        const curve = new THREE.QuadraticBezierCurve3(p1, mid, p2);
        const points = curve.getPoints(10);
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ color: 0x000000 });
        const line = new THREE.Line(geometry, material);
        innerCave.add(line);

        const numLights = Math.max(1, Math.floor(dist / 15)); // Optimized: 15m spacing (was 4m)
        for (let i = 1; i <= numLights; i++) {
            const t = i / (numLights + 1);
            const pos = curve.getPoint(t);

            const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1), new THREE.MeshBasicMaterial({ color: 0xffffcc }));
            bulb.position.copy(pos);
            innerCave.add(bulb);

            const light = new THREE.PointLight(0xffaa00, intensity, 15);
            light.position.copy(pos);
            innerCave.add(light);

            if (Math.random() > 0.8) {
                flickeringLights.push({ light, baseInt: intensity, flickerRate: 0.1 });
            }
        }
    };

    const isPointInBox = (px: number, pz: number, b: Box, padding: number = 0) => {
        const hw = b.w / 2 + padding;
        const hd = b.d / 2 + padding;

        if (b.rotation) {
            // Transform point to box local space
            const dx = px - b.x;
            const dz = pz - b.z;
            const cos = Math.cos(-b.rotation);
            const sin = Math.sin(-b.rotation);
            const rx = dx * cos - dz * sin;
            const rz = dx * sin + dz * cos;
            return (rx >= -hw && rx <= hw && rz >= -hd && rz <= hd);
        }

        return (px >= b.x - hw && px <= b.x + hw && pz >= b.z - hd && pz <= b.z + hd);
    };

    const getCorners = (b: Box, padding: number = 0) => {
        const hw = b.w / 2 + padding;
        const hd = b.d / 2 + padding;

        if (b.rotation) {
            const cos = Math.cos(b.rotation);
            const sin = Math.sin(b.rotation);
            // Local corners relative to center
            const localCorners = [
                { x: -hw, z: -hd },
                { x: hw, z: -hd },
                { x: hw, z: hd },
                { x: -hw, z: hd }
            ];
            // Rotate and Translate
            return localCorners.map(p => ({
                x: b.x + (p.x * cos - p.z * sin),
                z: b.z + (p.x * sin + p.z * cos)
            }));
        } else {
            return [
                { x: b.x - hw, z: b.z - hd },
                { x: b.x + hw, z: b.z - hd },
                { x: b.x + hw, z: b.z + hd },
                { x: b.x - hw, z: b.z + hd }
            ];
        }
    };

    // 5.4 Wall Builder (Instanced Visuals + Simplified Physics)
    // Using InstancedMesh for stones (Draw Call Check: Massive Reduction)
    // Using Composed Box Colliders for walls (Physics Check: Massive Reduction)

    const createWallSegment = (pA: THREE.Vector3, pB: THREE.Vector3) => {
        const vec = new THREE.Vector3().subVectors(pB, pA);
        const len = vec.length();
        if (len < 0.5) return;

        const mid = new THREE.Vector3().addVectors(pA, pB).multiplyScalar(0.5);
        const angle = Math.atan2(vec.z, vec.x);

        const wallHeight = 5;
        const wallThick = 4.0;
        const wall = new THREE.Mesh(new THREE.BoxGeometry(len, wallHeight, wallThick), MATERIALS.stone);

        wall.position.set(mid.x, wallHeight / 2, mid.z);
        wall.rotation.y = -angle;

        wall.castShadow = false;
        wall.receiveShadow = false;
        wall.name = 'Cave_Wall';
        scene.add(wall);
        wall.updateMatrixWorld();

        obstacles.push({ mesh: wall, collider: { type: 'box', size: new THREE.Vector3(len, wallHeight, wallThick) } });
    };

    for (const r of allSpaces) {
        const wallDist = 1.0;
        const corners = getCorners(r, wallDist);

        for (let i = 0; i < 4; i++) {
            const p1 = corners[i];
            const p2 = corners[(i + 1) % 4];

            const segmentStart = new THREE.Vector3();
            let isSegmentActive = false;

            const dist = Math.sqrt((p2.x - p1.x) ** 2 + (p2.z - p1.z) ** 2);
            const steps = Math.ceil(dist / 0.5); // Higher resolution (0.5m steps instead of 2.0m)

            for (let j = 0; j <= steps; j++) {
                const t = j / steps;
                const px = p1.x + (p2.x - p1.x) * t;
                const pz = p1.z + (p2.z - p1.z) * t;

                // Validity Check
                let isValid = true;

                // Entrance Gap - Widened to remove protruding walls
                if (pz > -71 && Math.abs(px - 100) < 18.0) isValid = false;

                // Bunker Door Gap (Manual punch-through on West wall)
                if (Math.abs(px - 41) < 2.0 && Math.abs(pz - (-193)) < 12.0) isValid = false;

                // Intersection Gap (Doorways)
                if (isValid) {
                    for (const other of allSpaces) {
                        if (other === r) continue;
                        if (isPointInBox(px, pz, other, -1.0)) {
                            isValid = false;
                            break;
                        }
                    }
                }

                if (isValid) {
                    // Start segment if needed
                    if (!isSegmentActive) {
                        segmentStart.set(px, 0, pz);
                        isSegmentActive = true;
                    }
                } else {
                    // Found a hole (Doorway/Gap)
                    if (isSegmentActive) {
                        createWallSegment(segmentStart, new THREE.Vector3(px, 0, pz));
                        isSegmentActive = false;
                    }
                }
            }

            // End of edge cleanup
            if (isSegmentActive) {
                createWallSegment(segmentStart, new THREE.Vector3(p2.x, 0, p2.z));
            }
        }
        if (ctx.yield) await ctx.yield();
    }

    // Room Specifics (Lights, Spawns)
    for (const r of rooms) {
        // Lights
        createStringLight(
            new THREE.Vector3(r.x - r.w / 3, 8, r.z),
            new THREE.Vector3(r.x + r.w / 3, 8, r.z),
            2.0
        );

        if (r.type === 'BunkerInterior') {
            // Bright light for bunker
            const light = new THREE.PointLight(0xfff0dd, 5, 25);
            light.position.set(r.x, 8, r.z);
            innerCave.add(light);
        }

        // Spawns
        if (r.chests) {
            for (let i = 0; i < r.chests; i++) {
                await SectorBuilder.spawnChest(ctx, r.x + (Math.random() - 0.5) * (r.w - 6), r.z + (Math.random() - 0.5) * (r.d - 6), 'standard', Math.random() * Math.PI);
            }
        }
        if (ctx.yield) await ctx.yield();
    }

    /*

    // --- VOID ROOF (MOUNTAIN TOP) ---
    // Creates a solid mesh over the entire cave area EXCEPT rooms/corridors
    const caveRoofShape = new THREE.Shape();
    // Huge bounding box covering the entire underground area
    // Top edge at -70 to perfectly align with entrance
    caveRoofShape.moveTo(-200, -400);
    caveRoofShape.lineTo(300, -400);
    caveRoofShape.lineTo(300, -70);
    caveRoofShape.lineTo(-200, -70);
    caveRoofShape.lineTo(-200, -400);

    // Punch holes for every room and corridor
    allSpaces.forEach(s => {
        const hole = new THREE.Path();
        const corners = getCorners(s, 0); // No padding for the visual hole

        hole.moveTo(corners[0].x, corners[0].z);
        hole.lineTo(corners[1].x, corners[1].z);
        hole.lineTo(corners[2].x, corners[2].z);
        hole.lineTo(corners[3].x, corners[3].z);
        hole.lineTo(corners[0].x, corners[0].z);

        caveRoofShape.holes.push(hole);
    });

    // Extrude high to form the solid mountain mass
    const roofGeo = new THREE.ExtrudeGeometry(caveRoofShape, { depth: 30, bevelEnabled: false });

    const roofMesh = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({
        color: 0x111111, roughness: 1.0, side: THREE.DoubleSide
    }));

    // Rotate: Shape is X/Y (mapped to X/Z). Extrusion is Z (mapped to Y).
    roofMesh.rotation.x = Math.PI / 2; // Lie flat
    roofMesh.position.y = 8; // Sit on top of walls
    roofMesh.castShadow = true;
    roofMesh.receiveShadow = true;
    roofMesh.name = "Sector2_VoidRoof";
    innerCave.add(roofMesh);

    // Curtain to hide entrance transition if needed
    const curtain = new THREE.Mesh(new THREE.PlaneGeometry(300, 150), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    curtain.position.set(caveEntrancePos.x, 20, caveEntrancePos.z + 10);
    curtain.rotation.y = Math.PI;
    curtain.name = "Sector2_Curtain";
    curtain.visible = false;
    scene.add(curtain);
    */

    // --- RANDOM HORDE SPAWNS (Testing) ---
    if (ctx.spawnHorde) {
        // Lobby
        ctx.spawnHorde(5, 'WALKER', new THREE.Vector3(100, 0, -100));
        // Mess Hall
        ctx.spawnHorde(4, 'RUNNER', new THREE.Vector3(150, 0, -200));
        // Deep Tunnel
        ctx.spawnHorde(3, 'TANK', new THREE.Vector3(60, 0, -125));
    }

    (ctx as any).roomData = rooms;
};
