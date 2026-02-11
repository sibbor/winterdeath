
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SectorContext } from '../../types/sectors';
import { MATERIALS, GEOMETRY } from '../../utils/assets';
import { SectorBuilder } from '../../core/world/SectorGenerator';
import { ObjectGenerator } from '../../core/world/ObjectGenerator';
import { t } from '../../utils/i18n';

export const generateCaveSystem = async (ctx: SectorContext, innerCave: THREE.Group) => {
    const { scene, obstacles, flickeringLights, triggers } = ctx;

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
        { id: 1, x: 100, z: -100, w: 30, d: 30, type: 'Lobby', zombies: 0 },
        { id: 2, x: 150, z: -150, w: 50, d: 20, type: 'Material', chests: 2 },
        { id: 3, x: 150, z: -200, w: 30, d: 30, type: 'Mess', zombies: 5 },
        { id: 4, x: 100, z: -200, w: 30, d: 30, type: 'Food', chests: 3 },
        { id: 5, x: 100, z: -125, w: 20, d: 20, type: 'Social1', zombies: 5 },
        { id: 6, x: 60, z: -125, w: 30, d: 30, type: 'Social2', zombies: 5 },
        { id: 7, x: 61, z: -193, w: 40, d: 50, type: 'Boss', boss: true, family: true },
        { id: 8, x: 25, z: -193, w: 20, d: 20, type: 'ShelterRoom' }
    ];

    // Define Explicit Corridors to Connect Rooms
    const corridors: Box[] = [
        // Entrance Tunnel (From -80 to R1 -100)
        { x: 100, z: -90, w: 14, d: 40 },

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
        { x: 60, z: -145, w: 10, d: 50 },    // North from R6
        { x: 75, z: -160, w: 30, d: 10 },    // East step
        { x: 85, z: -180, w: 10, d: 40 },    // South to R4 West side

        // New R4 (North) <-> R7 (East)
        // R4 (100, -200) -> R7 (61, -193)
        { x: 100, z: -182.5, w: 10, d: 15 }, // North from R4
        { x: 90, z: -175, w: 30, d: 10 },    // West step
        { x: 81, z: -184, w: 10, d: 20 },    // South to R7 East side
        // Shelter Room - Widened to 24 to fit the 22m door frame
        { x: 38, z: -193, w: 10, d: 24 }     // R8 <-> R7 (Connecting behind doors)
    ];

    // Floor generation
    const allSpaces: Box[] = [...rooms, ...corridors];
    allSpaces.forEach(s => {
        const floorMat = MATERIALS.gravel.clone();
        floorMat.bumpScale = 3.0;
        if (floorMat.map) {
            floorMat.map.wrapS = THREE.RepeatWrapping;
            floorMat.map.wrapT = THREE.RepeatWrapping;
            floorMat.map.repeat.set((s.w + 6) / 4, (s.d + 6) / 4);
        }
        if (floorMat.bumpMap) {
            floorMat.bumpMap.wrapS = THREE.RepeatWrapping;
            floorMat.bumpMap.wrapT = THREE.RepeatWrapping;
            floorMat.bumpMap.repeat.set((s.w + 6) / 4, (s.d + 6) / 4);
        }

        const floor = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.d), floorMat);
        floor.rotation.x = -Math.PI / 2;
        if (s.rotation) floor.rotation.z = -s.rotation;

        floor.position.set(s.x, 0.06, s.z);
        floor.receiveShadow = true;
        innerCave.add(floor);
    });

    if (ctx.yield) await ctx.yield();

    // Helpers
    const getCorners = (b: any, padding: number = 0) => {
        const hw = (b.w || b.width) / 2 + padding;
        const hd = (b.d || b.depth) / 2 + padding;

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
        };
    };

    const isPointInBox = (px: number, pz: number, b: any, padding: number = 0) => {
        const hw = (b.w || b.width) / 2 + padding;
        const hd = (b.d || b.depth) / 2 + padding;

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

    // Lights
    const createRoomLight = (pos: THREE.Vector3) => {
        SectorBuilder.spawnCaveLamp(ctx, pos.x, 4.5, pos.z);
    };

    const decorateRoom = (room: any) => {
        const cx = room.x;
        const cy = 0;
        const cz = room.z;
        const w = room.w || room.width;
        const d = room.d || room.depth;

        // Only decorate non-bunker rooms heavily
        if (room.type === 'ShelterRoom') return;

        const numProps = Math.floor(Math.random() * 4) + 2;
        for (let i = 0; i < numProps; i++) {
            const wall = Math.floor(Math.random() * 4);
            let px = 0, pz = 0, rot = 0;
            const offset = 1.0;

            if (wall === 0) { px = cx - w / 2 + offset; pz = cz + (Math.random() - 0.5) * (d - 2); rot = Math.PI / 2; }
            else if (wall === 1) { px = cx + w / 2 - offset; pz = cz + (Math.random() - 0.5) * (d - 2); rot = -Math.PI / 2; }
            else if (wall === 2) { pz = cz - d / 2 + offset; px = cx + (Math.random() - 0.5) * (w - 2); rot = 0; }
            else { pz = cz + d / 2 - offset; px = cx + (Math.random() - 0.5) * (w - 2); rot = Math.PI; }

            const type = Math.random() > 0.5 ? 'shelf' : 'box';
            const prop = type === 'shelf' ? ObjectGenerator.createShelf() : ObjectGenerator.createBox();

            prop.position.set(px, cy, pz);
            prop.rotation.y = rot + (Math.random() - 0.5) * 0.2;
            innerCave.add(prop);

            // Simple collider for props
            obstacles.push({
                mesh: prop.children[0] as THREE.Mesh,
                collider: { type: 'box', size: new THREE.Vector3(1, 2, 1) }
            });
        }
    };

    // --- WALL GENERATION (Optimized) ---
    const wallGeometries: THREE.BufferGeometry[] = [];
    const wallHeight = 6;
    const wallThick = 4.0;

    // Helper to add UVs properly to a box geometry so textures tile based on world size
    const addWallGeometry = (width: number, height: number, depth: number, x: number, y: number, z: number, rotationY: number) => {
        const geo = new THREE.BoxGeometry(width, height, depth);

        // Transform UVs for tiling
        const uvAttribute = geo.attributes.uv;
        for (let i = 0; i < uvAttribute.count; i++) {
            const u = uvAttribute.getX(i);
            const v = uvAttribute.getY(i);

            if (width > depth) {
                uvAttribute.setXY(i, u * (width / 4), v * (height / 4));
            } else {
                uvAttribute.setXY(i, u * (depth / 4), v * (height / 4));
            }
        }

        // Bake transform into geometry
        geo.rotateY(rotationY);
        geo.translate(x, y, z);

        wallGeometries.push(geo);

        // Still need individual colliders for physics
        // Fix: Use a real Object3D so physics system can read matrixWorld
        const dummy = new THREE.Object3D();
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, rotationY, 0);
        dummy.updateMatrixWorld(); // Essential as it's not in the scene graph

        obstacles.push({
            mesh: dummy,
            collider: { type: 'box', size: new THREE.Vector3(width, height, depth) }
        });
    };

    const createWallSegment = (pA: THREE.Vector3, pB: THREE.Vector3) => {
        const vec = new THREE.Vector3().subVectors(pB, pA);
        const len = vec.length();
        if (len < 0.5) return;

        const mid = new THREE.Vector3().addVectors(pA, pB).multiplyScalar(0.5);
        const angle = Math.atan2(vec.z, vec.x);

        addWallGeometry(len, wallHeight, wallThick, mid.x, wallHeight / 2, mid.z, -angle);
    };

    for (const r of allSpaces) {
        const wallDist = 1.0;
        const corners = getCorners(r, wallDist);

        for (let i = 0; i < 4; i++) {
            const p1 = corners[i];
            const p2 = corners[(i + 1) % 4];

            let segmentStart = new THREE.Vector3();
            let isSegmentActive = false;

            const dist = Math.sqrt((p2.x - p1.x) ** 2 + (p2.z - p1.z) ** 2);
            const steps = Math.ceil(dist / 2.0); // Optimization: Reduced resolution from 0.5 to 2.0.

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
                        createWallSegment(segmentStart, new THREE.Vector3(px, 0, pz)); // Original pz was correct, just using current point
                        isSegmentActive = false;
                    }
                }
            }
            // Finish last segment
            if (isSegmentActive) {
                createWallSegment(segmentStart, new THREE.Vector3(p2.x, 0, p2.z));
            }
        }
    }

    // --- FINALIZE WALLS (Merge) ---
    if (wallGeometries.length > 0) {
        const mergedWallGeo = BufferGeometryUtils.mergeGeometries(wallGeometries);
        if (mergedWallGeo) {
            const mat = MATERIALS.stone.clone();
            if (mat.map) {
                mat.map.wrapS = THREE.RepeatWrapping;
                mat.map.wrapT = THREE.RepeatWrapping;
            }
            if (mat.bumpMap) {
                mat.bumpMap.wrapS = THREE.RepeatWrapping;
                mat.bumpMap.wrapT = THREE.RepeatWrapping;
            }

            const wallMesh = new THREE.Mesh(mergedWallGeo, mat);
            wallMesh.castShadow = true;
            wallMesh.receiveShadow = true;
            wallMesh.name = 'Cave_Walls_Merged';
            innerCave.add(wallMesh);
        }

        // Cleanup geometries
        wallGeometries.forEach(g => g.dispose());
    }

    if (ctx.yield) await ctx.yield();

    // Room Specifics (Lights, Spawns, Decor)
    for (const r of rooms) {
        // Lights
        createRoomLight(new THREE.Vector3(r.x, 4.5, r.z));

        if (r.type === 'ShelterRoom') {
            const light = new THREE.PointLight(0xff0000, 100, 50);
            light.position.set(r.x, 8, r.z);
            innerCave.add(light);
        } else {
            // Decorate normal rooms
            //decorateRoom(r);
        }

        // Chest spawns
        if (r.chests) {
            for (let i = 0; i < r.chests; i++) {
                await SectorBuilder.spawnChest(ctx, r.x + (Math.random() - 0.5) * (r.w - 6), r.z + (Math.random() - 0.5) * (r.d - 6), 'standard', Math.random() * Math.PI);
            }
        }
    }

    // --- PART 3: THE SHELTER PORT ---
    // 1. Frame - Hollow construction to allow seeing through
    const frameGroup = new THREE.Group();
    frameGroup.name = 's2_shelter_port_frame';
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
    doorL.name = 's2_shelter_port_left';
    doorL.position.set(-5, -1, 0); // Relative to frame, positioned to close gap
    frameGroup.add(doorL);

    const doorR = new THREE.Mesh(new THREE.BoxGeometry(10, 17, 1), MATERIALS.metalPanel);
    doorR.name = 's2_shelter_port_right';
    doorR.position.set(5, -1, 0); // Relative to frame, positioned to close gap
    frameGroup.add(doorR);

};
