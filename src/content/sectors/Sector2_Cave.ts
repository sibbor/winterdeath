
import * as THREE from 'three';
import { SectorContext } from '../../types/sectors';
import { MATERIALS, GEOMETRY } from '../../utils/assets';
import { SectorBuilder } from '../../core/world/SectorGenerator';

export const generateCaveSystem = (ctx: SectorContext, innerCave: THREE.Group, caveEntrancePos: THREE.Vector3) => {
    const { scene, obstacles, flickeringLights, triggers } = ctx;

    // --- CAVE TRIGGERS ---
    triggers.push(
        {
            id: 's2_cave_lights', position: { x: 100, z: -126 }, radius: 10, type: 'SPEECH', content: "clues.s2_cave_lights", triggered: false,
            actions: [{ type: 'GIVE_REWARD', payload: { xp: 50 } }]
        },
        {
            id: 's2_cave_watch_out', position: { x: caveEntrancePos.x, z: -80 }, radius: 10, type: 'SPEECH', content: "clues.s2_cave_watch_out", triggered: false,
            actions: [{ type: 'GIVE_REWARD', payload: { xp: 50 } }]
        },
        {
            id: 's2_cave_loot', position: { x: 150, z: -150 }, radius: 15, type: 'SPEECH', content: "clues.s2_cave_loot", triggered: false,
            actions: [{ type: 'GIVE_REWARD', payload: { xp: 50 } }]
        },
        {
            id: 's2_cave_loot_more', position: { x: 100, z: -200 }, radius: 15, type: 'SPEECH', content: "clues.s2_cave_loot_more", triggered: false,
            actions: [{ type: 'GIVE_REWARD', payload: { xp: 50 } }]
        },
        {
            id: 's2_cave_door', position: { x: 61, z: -193 }, radius: 25, type: 'SPEECH', content: "clues.s2_cave_door", triggered: false,
            actions: [{ type: 'GIVE_REWARD', payload: { xp: 50 } }]
        },

        // Collectible (1 SP)
        {
            id: 's2_collectible_2',
            position: { x: 92, z: -208 },
            radius: 2,
            type: 'COLLECTIBLE',
            content: "clues.s2_collectible_2",
            description: "clues.s2_collectible_2_description",
            triggered: false,
            icon: "s2_collectible_2_icon",
            actions: [{ type: 'GIVE_REWARD', payload: { sp: 1 } }]
        },
    );

    // 5.1 Floors (Gravel)
    const caveFloor = new THREE.Mesh(new THREE.PlaneGeometry(350, 350), MATERIALS.gravel);
    caveFloor.rotation.x = -Math.PI / 2;
    caveFloor.position.set(60, 0.06, -210); // Shifted Z
    caveFloor.receiveShadow = true;
    innerCave.add(caveFloor);

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
        { id: 7, x: 61, z: -193, w: 40, d: 50, type: 'Boss', boss: true, family: true }
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
        { x: 75, z: -160, w: 30, d: 10 }, // East step
        { x: 85, z: -180, w: 10, d: 40 }, // South to R4 West side

        // New R4 (North) <-> R7 (East)
        // R4 (100, -200) -> R7 (61, -193)
        { x: 100, z: -182.5, w: 10, d: 15 }, // North from R4
        { x: 90, z: -175, w: 30, d: 10 },    // West step
        { x: 81, z: -184, w: 10, d: 20 }     // South to R7 East side
    ];

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

        const numLights = Math.max(1, Math.floor(dist / 4));
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

    // 5.4 Wall Builder (Organic Locking Stones) for Rooms AND Corridors
    const allSpaces = [...rooms, ...corridors];

    allSpaces.forEach(r => {
        const wallDist = 1.0;
        const corners = getCorners(r, wallDist);

        // Generate perimeter points by walking along edges
        const perimeter = [];
        for (let i = 0; i < 4; i++) {
            const p1 = corners[i];
            const p2 = corners[(i + 1) % 4];
            const dist = Math.sqrt((p2.x - p1.x) ** 2 + (p2.z - p1.z) ** 2);
            // Step size approx 2.0
            const steps = Math.ceil(dist / 2.0);
            for (let j = 0; j < steps; j++) {
                const t = j / steps;
                perimeter.push({
                    x: p1.x + (p2.x - p1.x) * t,
                    z: p1.z + (p2.z - p1.z) * t
                });
            }
        }

        perimeter.forEach(pt => {
            // EXCEPTION: Cave Entrance Opening
            // Entrance width 14. Center 100.
            // Opening buffer: 7 + 1 = 8.
            if (pt.z > -71 && Math.abs(pt.x - 100) < 8.0) return;

            // Check if this wall point is inside ANY other room/corridor (creates opening)
            // Use a smaller negative padding to allow tight fits to open up
            for (const other of allSpaces) {
                if (other === r) continue;
                if (isPointInBox(pt.x, pt.z, other, -1.0)) return;
            }

            // Stack stones
            const stones = 1 + Math.floor(Math.random() * 2);
            for (let k = 0; k < stones; k++) {
                const rock = new THREE.Mesh(GEOMETRY.stone, MATERIALS.stone);
                const s = 3.0 + Math.random() * 1.5;

                const jx = (Math.random() - 0.5) * 1.0;
                const jz = (Math.random() - 0.5) * 1.0;

                rock.position.set(pt.x + jx, k * 2.5 + s * 0.4, pt.z + jz);
                rock.scale.set(s, s * 0.8, s);
                rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
                rock.castShadow = true;
                innerCave.add(rock);

                if (k === 0) obstacles.push({ mesh: rock, collider: { type: 'sphere', radius: s * 0.7 } });
            }
        });
    });

    // Room Specifics (Lights, Spawns)
    rooms.forEach(r => {
        // Lights
        createStringLight(
            new THREE.Vector3(r.x - r.w / 3, 8, r.z),
            new THREE.Vector3(r.x + r.w / 3, 8, r.z),
            2.0
        );

        // Spawns
        if (r.chests) {
            for (let i = 0; i < r.chests; i++) {
                SectorBuilder.spawnChest(ctx, r.x + (Math.random() - 0.5) * (r.w - 6), r.z + (Math.random() - 0.5) * (r.d - 6), 'standard', Math.random() * Math.PI);
            }
        }
        if (r.boss) {
            const doorGroup = new THREE.Group();
            // Decorative back door at West wall
            doorGroup.position.set(r.x - r.w / 2 + 2, 0, r.z);
            doorGroup.rotation.y = Math.PI / 2;

            const doorL = new THREE.Mesh(new THREE.BoxGeometry(10, 14, 1), MATERIALS.metalPanel); doorL.position.set(-5, 7, 0);
            const doorR = new THREE.Mesh(new THREE.BoxGeometry(10, 14, 1), MATERIALS.metalPanel); doorR.position.set(5, 7, 0);
            const frame = new THREE.Mesh(new THREE.BoxGeometry(22, 16, 2), MATERIALS.concrete); frame.position.set(0, 8, -1);

            const ind = new THREE.PointLight(0x00ff00, 2, 15); ind.position.set(0, 12, 2);
            doorGroup.add(doorL); doorGroup.add(doorR); doorGroup.add(frame); doorGroup.add(ind);
            innerCave.add(doorGroup);
            obstacles.push({ mesh: doorGroup, collider: { type: 'box', size: new THREE.Vector3(4, 14, 20) } });

            SectorBuilder.spawnDebugMarker(ctx, r.x, r.z, 8, "BUNKER VAULT");
        }
    });

    // Entrance Light
    const entranceLight = new THREE.SpotLight(0xaaccff, 10, 200, 0.6, 0.5, 1);
    entranceLight.position.set(caveEntrancePos.x, 30, caveEntrancePos.z + 20);
    entranceLight.target.position.set(caveEntrancePos.x, 0, caveEntrancePos.z - 80);
    entranceLight.castShadow = true;
    scene.add(entranceLight);
    scene.add(entranceLight.target);

    // Invisible walls to prevent climbing around entrance outside
    const blockL = new THREE.Mesh(new THREE.BoxGeometry(80, 50, 20), new THREE.MeshBasicMaterial({ visible: false }));
    blockL.position.set(caveEntrancePos.x - 60, 25, caveEntrancePos.z - 10); obstacles.push({ mesh: blockL, collider: { type: 'box', size: new THREE.Vector3(80, 50, 20) } });
    const blockR = new THREE.Mesh(new THREE.BoxGeometry(80, 50, 20), new THREE.MeshBasicMaterial({ visible: false }));
    blockR.position.set(caveEntrancePos.x + 60, 25, caveEntrancePos.z - 10); obstacles.push({ mesh: blockR, collider: { type: 'box', size: new THREE.Vector3(80, 50, 20) } });

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

    /*    
    // innerCave.add(roofMesh); // COMMENTED OUT FOR DEBUGGING (Kept logic from original)

    // Curtain to hide entrance transition if needed
    const curtain = new THREE.Mesh(new THREE.PlaneGeometry(300, 150), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    curtain.position.set(caveEntrancePos.x, 20, caveEntrancePos.z + 10); 
    curtain.rotation.y = Math.PI; 
    curtain.name = "Sector2_Curtain";
    curtain.visible = false;
    scene.add(curtain);
    */

    (ctx as any).roomData = rooms;
};
