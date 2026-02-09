
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createProceduralTextures, MATERIALS, GEOMETRY, ModelFactory, createSignMesh } from '../../utils/assets';
import { SectorContext } from '../../types/sectors';

// Lazy load textures
let sharedTextures: any = null;
const getSharedTextures = () => {
    if (!sharedTextures) sharedTextures = createProceduralTextures();
    return sharedTextures;
};

const NATURE_VARIANTS = 8; // Increased from 5
const uniqueMeshes: Record<string, THREE.Group[]> = {
    'spruce': [],
    'pine': [],
    'birch': [],
    'oak': [],
    'rock': []
};

export const initNaturePrototypes = async (yieldToMain?: () => Promise<void>) => {
    if (uniqueMeshes['spruce'].length > 0) return;

    const tex = getSharedTextures();

    // Use centralized materials
    const trunkMat = MATERIALS.treeTrunk;
    const birchTrunkMat = MATERIALS.treeTrunkBirch;

    // Foliage (Keeping local variants for color/alpha tweaks if needed, but linking to MATERIALS)
    const spruceMat = MATERIALS.treeLeaves.clone();
    spruceMat.color.set(0xffffff);

    const pineMat = MATERIALS.treeLeaves.clone();
    pineMat.color.set(0xcccccc);

    const birchMat = MATERIALS.treeLeaves.clone();
    birchMat.color.set(0x99cc99);

    // 1. SPRUCE (Abstract Crossed Planes)
    for (let i = 0; i < NATURE_VARIANTS; i++) {
        const group = new THREE.Group();
        const height = 12 + (Math.random() * 4);
        const spreadBase = 3.5 + (Math.random() * 1.0);

        // Trunk
        const trunkGeo = new THREE.CylinderGeometry(0.2, 0.5, height, 5);
        trunkGeo.translate(0, height / 2, 0);
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.castShadow = true; trunk.receiveShadow = true;
        group.add(trunk);

        // Foliage (Crossed Planes)
        const layers = 7;
        const planesPerLayer = 6;
        const startY = 2.0;

        const vertices: number[] = [];
        const uvs: number[] = [];
        const indices: number[] = [];
        let vIdx = 0;

        for (let l = 0; l < layers; l++) {
            const t = l / (layers - 1);
            const layerY = startY + (l / layers) * (height - startY - 0.5);

            const layerSpread = spreadBase * (1.0 - t * 0.8) + 0.5;
            const layerHeight = (height / layers) * 2.0;

            for (let p = 0; p < planesPerLayer; p++) {
                const angle = (Math.PI / planesPerLayer) * p + (Math.random() * 0.5);
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);
                const hw = layerSpread;
                const hh = layerHeight;

                const yBot = -hh * 0.4;
                const yTop = hh * 0.6;

                const transform = (x: number, y: number, z: number) => {
                    return [x * cos - z * sin, y + layerY, x * sin + z * cos];
                };

                const p1 = transform(-hw, yBot, 0); const p2 = transform(hw, yBot, 0);
                const p3 = transform(-hw, yTop, 0); const p4 = transform(hw, yTop, 0);

                vertices.push(...p1, ...p2, ...p3, ...p4);
                uvs.push(0, 0, 1, 0, 0, 1, 1, 1);
                indices.push(vIdx, vIdx + 1, vIdx + 2, vIdx + 2, vIdx + 1, vIdx + 3);
                vIdx += 4;
            }
        }

        const foliageGeo = new THREE.BufferGeometry();
        foliageGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        foliageGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        foliageGeo.setIndex(indices);
        foliageGeo.computeVertexNormals();

        const foliage = new THREE.Mesh(foliageGeo, spruceMat);
        foliage.castShadow = true; foliage.receiveShadow = true;
        group.add(foliage);

        uniqueMeshes['spruce'].push(group);
        if (yieldToMain) await yieldToMain();
    }

    // 2. PINE (Tall, High Canopy - "Scots Pine")
    for (let i = 0; i < NATURE_VARIANTS; i++) {
        const group = new THREE.Group();
        const height = 16 + (Math.random() * 6);
        const spreadBase = 3.5 + (Math.random() * 1.0);

        // Trunk (Reddish/Brown)
        const trunkGeo = new THREE.CylinderGeometry(0.3, 0.6, height, 6);
        trunkGeo.translate(0, height / 2, 0);
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.castShadow = true; trunk.receiveShadow = true;
        group.add(trunk);

        // Foliage (High Crown)
        const layers = 6;
        const planesPerLayer = 5;
        const startY = height * 0.55; // High up
        const crownHeight = height - startY;

        const vertices: number[] = [];
        const uvs: number[] = [];
        const indices: number[] = [];
        let vIdx = 0;

        for (let l = 0; l < layers; l++) {
            const t = l / (layers - 1); // 0 to 1 along crown height
            const layerY = startY + (l / layers) * (crownHeight - 0.5);

            // Bulbous crown shape (narrow base, wide middle, tapered top)
            const shapeFactor = Math.sin(Math.pow(t, 0.8) * Math.PI);
            const layerSpread = spreadBase * (0.4 + shapeFactor * 0.8);
            const layerHeight = (crownHeight / layers) * 2.2;

            for (let p = 0; p < planesPerLayer; p++) {
                const angle = (Math.PI / planesPerLayer) * p + (Math.random() * 0.5);
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);
                const hw = layerSpread;
                const hh = layerHeight;

                const yBot = -hh * 0.4;
                const yTop = hh * 0.6;

                const transform = (x: number, y: number, z: number) => {
                    return [x * cos - z * sin, y + layerY, x * sin + z * cos];
                };

                const p1 = transform(-hw, yBot, 0); const p2 = transform(hw, yBot, 0);
                const p3 = transform(-hw, yTop, 0); const p4 = transform(hw, yTop, 0);

                vertices.push(...p1, ...p2, ...p3, ...p4);
                uvs.push(0, 0, 1, 0, 0, 1, 1, 1);
                indices.push(vIdx, vIdx + 1, vIdx + 2, vIdx + 2, vIdx + 1, vIdx + 3);
                vIdx += 4;
            }
        }

        const foliageGeo = new THREE.BufferGeometry();
        foliageGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        foliageGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        foliageGeo.setIndex(indices);
        foliageGeo.computeVertexNormals();

        const foliage = new THREE.Mesh(foliageGeo, pineMat);
        foliage.castShadow = true; foliage.receiveShadow = true;
        group.add(foliage);

        uniqueMeshes['pine'].push(group);
        if (yieldToMain) await yieldToMain();
    }

    // 3. BIRCH (Slender, Oval Crown)
    for (let i = 0; i < NATURE_VARIANTS; i++) {
        const group = new THREE.Group();
        const height = 10 + Math.random() * 4;
        const spreadBase = 2.5 + (Math.random() * 0.8);

        // Trunk (Slender White)
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.25, height, 5).translate(0, height / 2, 0), birchTrunkMat);
        trunk.castShadow = true; group.add(trunk);

        // Foliage (Oval/Ellipsoid shape covering most of upper tree)
        const layers = 5;
        const planesPerLayer = 3;
        const startY = height * 0.3; // Starts lower than pine

        const vertices: number[] = [];
        const uvs: number[] = [];
        const indices: number[] = [];
        let vIdx = 0;

        for (let l = 0; l < layers; l++) {
            const t = l / (layers - 1);
            const layerY = startY + (l / layers) * (height - startY - 0.5);

            // Oval Shape
            const shapeFactor = Math.sin(t * Math.PI);
            const layerSpread = spreadBase * (0.3 + shapeFactor * 0.8); // Avoid zero width at ends
            const layerHeight = ((height - startY) / layers) * 2.0;

            for (let p = 0; p < planesPerLayer; p++) {
                const angle = (Math.PI / planesPerLayer) * p + (Math.random() * 1.0);
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);
                const hw = layerSpread;
                const hh = layerHeight;

                const yBot = -hh * 0.4;
                const yTop = hh * 0.6;

                const transform = (x: number, y: number, z: number) => {
                    return [x * cos - z * sin, y + layerY, x * sin + z * cos];
                };

                const p1 = transform(-hw, yBot, 0); const p2 = transform(hw, yBot, 0);
                const p3 = transform(-hw, yTop, 0); const p4 = transform(hw, yTop, 0);

                vertices.push(...p1, ...p2, ...p3, ...p4);
                uvs.push(0, 0, 1, 0, 0, 1, 1, 1);
                indices.push(vIdx, vIdx + 1, vIdx + 2, vIdx + 2, vIdx + 1, vIdx + 3);
                vIdx += 4;
            }
        }

        const foliageGeo = new THREE.BufferGeometry();
        foliageGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        foliageGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        foliageGeo.setIndex(indices);
        foliageGeo.computeVertexNormals();

        const foliage = new THREE.Mesh(foliageGeo, birchMat);
        foliage.castShadow = true; group.add(foliage);
        uniqueMeshes['birch'].push(group);
        if (yieldToMain) await yieldToMain();
    }

    // 4. OAK (Sturdy, Broad Crown)
    for (let i = 0; i < NATURE_VARIANTS; i++) {
        const group = new THREE.Group();
        const height = 8 + Math.random() * 4;
        const spreadBase = 4.0 + (Math.random() * 2.0);

        // Trunk (Darker/Wider)
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.6, height, 6).translate(0, height / 2, 0), MATERIALS.treeTrunkOak);
        trunk.castShadow = true; group.add(trunk);

        // Foliage (Billowing clusters)
        const layers = 6;
        const clustersPerLayer = 4;
        const startY = height * 0.4;

        const vertices: number[] = [];
        const uvs: number[] = [];
        const indices: number[] = [];
        let vIdx = 0;

        for (let l = 0; l < layers; l++) {
            const t = l / (layers - 1);
            const layerY = startY + (l / layers) * (height - startY);
            const shapeFactor = Math.sin(t * Math.PI * 0.8 + 0.2);
            const layerSpread = spreadBase * (0.5 + shapeFactor * 0.7);
            const layerHeight = ((height - startY) / layers) * 3.0;

            for (let p = 0; p < clustersPerLayer; p++) {
                const angle = (Math.PI * 2 / clustersPerLayer) * p + Math.random();
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);
                const hw = layerSpread * (0.6 + Math.random() * 0.4);
                const hh = layerHeight * (0.6 + Math.random() * 0.4);

                const yBot = -hh * 0.5;
                const yTop = hh * 0.5;

                const transform = (x: number, y: number, z: number) => {
                    return [x * cos - z * sin + (Math.random() - 0.5) * 1.0, y + layerY, x * sin + z * cos + (Math.random() - 0.5) * 1.0];
                };

                // Create a diamond/cluster of planes
                const p1 = transform(-hw, yBot, 0); const p2 = transform(hw, yBot, 0);
                const p3 = transform(-hw, yTop, 0); const p4 = transform(hw, yTop, 0);

                vertices.push(...p1, ...p2, ...p3, ...p4);
                uvs.push(0, 0, 1, 0, 0, 1, 1, 1);
                indices.push(vIdx, vIdx + 1, vIdx + 2, vIdx + 2, vIdx + 1, vIdx + 3);
                vIdx += 4;
            }
        }

        const foliageGeo = new THREE.BufferGeometry();
        foliageGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        foliageGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        foliageGeo.setIndex(indices);
        foliageGeo.computeVertexNormals();

        const foliage = new THREE.Mesh(foliageGeo, MATERIALS.treeLeavesOak);
        foliage.castShadow = true; group.add(foliage);
        uniqueMeshes['oak'].push(group);
        if (yieldToMain) await yieldToMain();
    }

    // 5. ROCKS (Simplified)
    for (let i = 0; i < NATURE_VARIANTS; i++) {
        const group = new THREE.Group();
        const geo = new THREE.DodecahedronGeometry(1, 0); // Detail 0 for simplicity
        // Deform
        const pos = geo.attributes.position;
        for (let v = 0; v < pos.count; v++) {
            pos.setXYZ(v, pos.getX(v) * (0.8 + Math.random() * 0.4), pos.getY(v) * (0.8 + Math.random() * 0.4), pos.getZ(v) * (0.8 + Math.random() * 0.4));
        }
        geo.computeVertexNormals();
        const mesh = new THREE.Mesh(geo, MATERIALS.stone); // Use stone material for bump mapping
        mesh.castShadow = true; mesh.receiveShadow = true;
        group.add(mesh);
        uniqueMeshes['rock'].push(group);
        if (yieldToMain && i % 2 === 0) await yieldToMain();
    }
};

const buildingMeshes: Record<string, THREE.Group> = {};

export const initBuildingPrototypes = async (yieldToMain?: () => Promise<void>) => {
    if (buildingMeshes['WallSection']) return;

    // Wall Section (4m wide, 4m high)
    const wallGroup = new THREE.Group();
    const wall = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 0.4), MATERIALS.building || MATERIALS.concrete);
    wall.position.y = 2;
    wall.castShadow = true;
    wall.receiveShadow = true;
    wallGroup.add(wall);
    buildingMeshes['WallSection'] = wallGroup;

    // Corner
    const cornerGroup = new THREE.Group();
    const c1 = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 0.4), MATERIALS.building || MATERIALS.concrete);
    c1.position.set(0, 2, 1.8);
    c1.castShadow = true;
    cornerGroup.add(c1);
    const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4, 4), MATERIALS.building || MATERIALS.concrete);
    c2.position.set(1.8, 2, 0);
    c2.castShadow = true;
    cornerGroup.add(c2);
    buildingMeshes['Corner'] = cornerGroup;

    // Door Frame
    const doorGroup = new THREE.Group();
    const sideR = new THREE.Mesh(new THREE.BoxGeometry(1.5, 4, 0.4), MATERIALS.building || MATERIALS.concrete);
    sideR.position.set(1.25, 2, 0);
    doorGroup.add(sideR);
    const sideL = new THREE.Mesh(new THREE.BoxGeometry(1.5, 4, 0.4), MATERIALS.building || MATERIALS.concrete);
    sideL.position.set(-1.25, 2, 0);
    doorGroup.add(sideL);
    const top = new THREE.Mesh(new THREE.BoxGeometry(1, 1.5, 0.4), MATERIALS.building || MATERIALS.concrete);
    top.position.set(0, 3.25, 0);
    doorGroup.add(top);
    buildingMeshes['DoorFrame'] = doorGroup;

    // Window Frame
    const windowGroup = new THREE.Group();
    const wSideR = new THREE.Mesh(new THREE.BoxGeometry(1, 4, 0.4), MATERIALS.building || MATERIALS.concrete);
    wSideR.position.set(1.5, 2, 0);
    windowGroup.add(wSideR);
    const wSideL = new THREE.Mesh(new THREE.BoxGeometry(1, 4, 0.4), MATERIALS.building || MATERIALS.concrete);
    wSideL.position.set(-1.5, 2, 0);
    windowGroup.add(wSideL);
    const wTop = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 0.4), MATERIALS.building || MATERIALS.concrete);
    wTop.position.set(0, 3.5, 0);
    windowGroup.add(wTop);
    const wBot = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 0.4), MATERIALS.building || MATERIALS.concrete);
    wBot.position.set(0, 0.5, 0);
    windowGroup.add(wBot);
    // Glass
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), MATERIALS.glass);
    glass.position.set(0, 2, 0);
    windowGroup.add(glass);
    buildingMeshes['WindowFrame'] = windowGroup;

    // Floor
    const floorGroup = new THREE.Group();
    const floor = new THREE.Mesh(new THREE.BoxGeometry(4, 0.2, 4), MATERIALS.concrete);
    floor.position.y = -0.1;
    floorGroup.add(floor);
    buildingMeshes['Floor'] = floorGroup;
    if (yieldToMain) await yieldToMain();
};

export const ObjectGenerator = {
    initNaturePrototypes,
    initBuildingPrototypes,
    getPrototypes: () => {
        // Return flatten array of all variants
        return [
            ...uniqueMeshes['spruce'],
            ...uniqueMeshes['pine'],
            ...uniqueMeshes['birch'],
            ...uniqueMeshes['oak']
        ];
    },

    createTree: (type: 'spruce' | 'pine' | 'birch' | 'oak' = 'spruce', scale: number = 1.0) => {
        // Warning: This remains sync to avoid breaking hundreds of call sites.
        // It relies on prototypes being pre-warmed.
        const list = uniqueMeshes[type] || uniqueMeshes['spruce'];
        const p = list[Math.floor(Math.random() * list.length)];
        const t = p.clone();
        t.scale.multiplyScalar(scale);
        t.rotation.y = Math.random() * Math.PI * 2; // Use Math.PI * 2 for full rotation
        return t;
    },

    createTreeStump: (scale: number = 1.0) => {
        const group = new THREE.Group();
        const height = 0.6 + Math.random() * 0.4;
        const radius = 0.4 + Math.random() * 0.2;

        const sideGeo = new THREE.CylinderGeometry(radius, radius * 1.1, height, 8);
        const sideMesh = new THREE.Mesh(sideGeo, MATERIALS.treeTrunk);
        sideMesh.position.y = height / 2;
        sideMesh.castShadow = true;
        group.add(sideMesh);

        const topGeo = new THREE.CircleGeometry(radius, 8);
        const topMesh = new THREE.Mesh(topGeo, MATERIALS.treeStumpTop);
        topMesh.rotation.x = -Math.PI / 2;
        topMesh.position.y = height + 0.01;
        topMesh.receiveShadow = true;
        group.add(topMesh);

        group.scale.setScalar(scale);
        group.rotation.y = Math.random() * Math.PI * 2;
        return group;
    },

    createDeforestation: (ctx: SectorContext, x: number, z: number, width: number, depth: number, count: number = 10) => {
        for (let i = 0; i < count; i++) {
            const rx = x + (Math.random() - 0.5) * width;
            const rz = z + (Math.random() - 0.5) * depth;
            const stump = ObjectGenerator.createTreeStump(0.8 + Math.random() * 0.5);
            stump.position.set(rx, 0, rz);
            ctx.scene.add(stump);
            ctx.obstacles.push({
                mesh: stump,
                collider: { type: 'cylinder', radius: 0.5, height: 1.0 }
            });
        }
    },

    createRock: (scale: number = 1.0, radius: number = 1.0) => {
        // Warning: Sync, relies on pre-warmed prototypes
        const list = uniqueMeshes['rock'];
        const p = list[Math.floor(Math.random() * list.length)];
        const r = p.clone();
        r.scale.multiplyScalar(scale * radius);
        r.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        return r;
    },

    createHedge: (length: number = 2.0, height: number = 1.2, thickness: number = 0.8) => {
        const group = new THREE.Group();
        const mat = MATERIALS.treeLeaves.clone();
        mat.color.set(0x2d4c1e);
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(thickness, height, length), mat);
        mesh.position.y = height / 2;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        // Add some noise "foliage" boxes
        for (let i = 0; i < 5; i++) {
            const leaf = new THREE.Mesh(new THREE.BoxGeometry(thickness * 1.1, height * 0.2, length * 0.2), mat);
            leaf.position.set((Math.random() - 0.5) * 0.1, Math.random() * height, (Math.random() - 0.5) * length);
            group.add(leaf);
        }
        return group;
    },

    createFence: (length: number = 3.0) => {
        const group = new THREE.Group();
        const mat = MATERIALS.treeTrunk.clone();
        mat.color.set(0x4a3728);
        // Posts
        const postGeo = new THREE.BoxGeometry(0.2, 1.2, 0.2);
        const p1 = new THREE.Mesh(postGeo, mat); p1.position.set(0, 0.6, -length / 2); group.add(p1);
        const p2 = new THREE.Mesh(postGeo, mat); p2.position.set(0, 0.6, length / 2); group.add(p2);
        // Rails
        const railGeo = new THREE.BoxGeometry(0.1, 0.15, length);
        const r1 = new THREE.Mesh(railGeo, mat); r1.position.set(0, 0.4, 0); group.add(r1);
        const r2 = new THREE.Mesh(railGeo, mat); r2.position.set(0, 0.9, 0); group.add(r2);
        return group;
    },

    createMeshFence: (length: number = 3.0, height: number = 2.5) => {
        const group = new THREE.Group();
        const postMat = MATERIALS.steel;
        const meshMat = MATERIALS.fenceMesh;

        // Posts
        const postGeo = new THREE.BoxGeometry(0.12, height, 0.12);
        const p1 = new THREE.Mesh(postGeo, postMat); p1.position.set(0, height / 2, -length / 2); group.add(p1);
        const p2 = new THREE.Mesh(postGeo, postMat); p2.position.set(0, height / 2, length / 2); group.add(p2);

        // Mesh Plane
        const planeGeo = new THREE.PlaneGeometry(length, height * 0.9);
        const mesh = new THREE.Mesh(planeGeo, meshMat);
        mesh.rotation.y = Math.PI / 2;
        mesh.position.set(0, height * 0.48, 0);
        group.add(mesh);

        // Optional: Top rail for extra detail
        const railGeo = new THREE.CylinderGeometry(0.04, 0.04, length);
        const rail = new THREE.Mesh(railGeo, postMat);
        rail.rotation.x = Math.PI / 2;
        rail.position.set(0, height * 0.95, 0);
        group.add(rail);

        return group;
    },

    createStoneWall: (length: number = 2.0, height: number = 1.0) => {
        const group = new THREE.Group();
        const mat = MATERIALS.stone;
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.6, height, length), mat);
        base.position.y = height / 2;
        group.add(base);
        // Stones
        for (let i = 0; i < 10; i++) {
            const stone = new THREE.Mesh(new THREE.BoxGeometry(0.7, height * 0.3, length * 0.25), mat);
            stone.position.set((Math.random() - 0.5) * 0.1, Math.random() * height, (Math.random() - 0.5) * length);
            stone.rotation.set(Math.random(), Math.random(), Math.random());
            group.add(stone);
        }
        return group;
    },

    createBuildingPiece: (type: string) => {
        // Warning: Sync
        const proto = buildingMeshes[type];
        return proto ? proto.clone() : new THREE.Group();
    },

    createBarrel: (explosive: boolean = false) => {
        const group = new THREE.Group();
        const mat = explosive ? MATERIALS.barrelExplosive : MATERIALS.barrel;
        const mesh = new THREE.Mesh(GEOMETRY.barrel, mat);
        mesh.position.y = 0.75;
        mesh.castShadow = true;
        group.add(mesh);
        return group;
    },

    createStreetLamp: () => {
        const group = new THREE.Group();
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.2, 8), MATERIALS.blackMetal);
        pole.position.y = 4;
        group.add(pole);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 2), MATERIALS.blackMetal);
        arm.position.set(0, 7.5, 0.5);
        group.add(arm);
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.8), MATERIALS.blackMetal);
        head.position.set(0, 7.5, 1.5);
        group.add(head);

        const light = new THREE.PointLight(0xaaddff, 4, 30);
        light.position.set(0, 7.4, 1.5);
        group.add(light);

        return group;
    },

    createBuilding: (width: number, height: number, depth: number, color: number, createRoof: boolean = true) => {
        const material = MATERIALS.building.clone();
        material.color.setHex(color);

        // 1. Create the main building body
        let bodyGeo = new THREE.BoxGeometry(width, height, depth);
        bodyGeo.translate(0, height / 2, 0);

        // Convert to non-indexed for merging
        const nonIndexedBody = bodyGeo.index ? bodyGeo.toNonIndexed() : bodyGeo.clone();

        let mergedGeometry: THREE.BufferGeometry | null = null;
        let actualRoofHeight = 0;

        // 2. Optional Roof Logic
        if (createRoof) {
            actualRoofHeight = height * 0.5;
            const shape = new THREE.Shape();
            shape.moveTo(-width / 2, 0);
            shape.lineTo(width / 2, 0);
            shape.lineTo(0, actualRoofHeight);
            shape.closePath();

            let roofGeo = new THREE.ExtrudeGeometry(shape, {
                depth: depth,
                bevelEnabled: false
            });

            // Offset roof to sit on top of the body
            roofGeo.translate(0, height, -depth / 2);
            const nonIndexedRoof = roofGeo.index ? roofGeo.toNonIndexed() : roofGeo.clone();

            // Merge body and roof
            mergedGeometry = BufferGeometryUtils.mergeGeometries([nonIndexedBody, nonIndexedRoof]);

            // Cleanup
            roofGeo.dispose();
            nonIndexedRoof.dispose();
        } else {
            mergedGeometry = nonIndexedBody.clone();
        }

        // 3. Finalize Geometry
        if (mergedGeometry) {
            mergedGeometry = BufferGeometryUtils.mergeVertices(mergedGeometry);
            mergedGeometry.computeVertexNormals();
        }

        // 4. Create Mesh
        const building = new THREE.Mesh(mergedGeometry || nonIndexedBody, material);
        building.castShadow = true;
        building.receiveShadow = true;

        // Expose dimensions if needed by caller (e.g. for collision)
        building.userData = { size: new THREE.Vector3(width, height + actualRoofHeight, depth) };

        bodyGeo.dispose();
        nonIndexedBody.dispose();

        return building;
    },

    createBox: (scale: number = 1.0) => {
        const group = new THREE.Group();
        const mat = MATERIALS.buildingPiece; // Dark wood/metal look
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
        mesh.position.y = 0.5;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        group.scale.setScalar(scale);
        group.rotation.y = Math.random() * Math.PI * 2;
        return group;
    },

    createShelf: (scale: number = 1.0) => {
        const group = new THREE.Group();
        const mat = MATERIALS.treeTrunk; // Wood look

        // Frame
        const w = 2.0; const h = 2.0; const d = 0.5;
        const sideGeo = new THREE.BoxGeometry(0.1, h, d);
        const l = new THREE.Mesh(sideGeo, mat); l.position.set(-w / 2, h / 2, 0); group.add(l);
        const r = new THREE.Mesh(sideGeo, mat); r.position.set(w / 2, h / 2, 0); group.add(r);

        // Shelves
        const shelfGeo = new THREE.BoxGeometry(w, 0.1, d);
        for (let y = 0.1; y < h; y += 0.6) {
            const s = new THREE.Mesh(shelfGeo, mat);
            s.position.set(0, y, 0);
            s.castShadow = true;
            group.add(s);

            // Random Props on shelf
            if (Math.random() > 0.3) {
                const numProps = Math.floor(Math.random() * 4);
                for (let i = 0; i < numProps; i++) {
                    const prop = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), MATERIALS.barrel);
                    prop.position.set((Math.random() - 0.5) * w * 0.8, y + 0.15, (Math.random() - 0.5) * d * 0.6);
                    group.add(prop);
                }
            }
        }

        group.scale.setScalar(scale);
        return group;
    },

    createCaveEntrance: () => {
        const group = new THREE.Group();
        // A rocky archway
        const mat = MATERIALS.stone;

        // Left Pillar
        const left = new THREE.Mesh(new THREE.DodecahedronGeometry(6, 0), mat);
        left.scale.set(1, 2.5, 1);
        left.position.set(-8, 6, 0);
        left.castShadow = true; left.receiveShadow = true;
        group.add(left);

        // Right Pillar
        const right = new THREE.Mesh(new THREE.DodecahedronGeometry(6, 0), mat);
        right.scale.set(1, 2.5, 1);
        right.position.set(8, 6, 0);
        right.castShadow = true; right.receiveShadow = true;
        group.add(right);

        // Top Arch
        const top = new THREE.Mesh(new THREE.DodecahedronGeometry(6, 0), mat);
        top.scale.set(2.5, 1, 1.5);
        top.position.set(0, 14, 0);
        top.castShadow = true; top.receiveShadow = true;
        group.add(top);

        return group;
    },

    createMountainSlice: (ctx: SectorContext, p1: THREE.Vector3, p2: THREE.Vector3, height: number = 15) => {
        // Optimized wall generation using a stretched cube with texture repeating
        const vec = new THREE.Vector3().subVectors(p2, p1);
        const len = vec.length();
        const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
        const angle = Math.atan2(vec.z, vec.x);

        // Create custom material clone for tiling if not exists
        // Note: For performance, we might want to share this, but "stone" is standard.
        // To fix bump map stretching, we need to map UVs or use triplanar. 
        // Simple fix: Repeat texture based on length.

        const mat = MATERIALS.stone.clone();
        if (mat.map) {
            mat.map = mat.map.clone();
            mat.map.wrapS = THREE.RepeatWrapping;
            mat.map.wrapT = THREE.RepeatWrapping;
            mat.map.repeat.set(len / 4, height / 4);
        }
        if (mat.bumpMap) {
            mat.bumpMap = mat.bumpMap.clone();
            mat.bumpMap.wrapS = THREE.RepeatWrapping;
            mat.bumpMap.wrapT = THREE.RepeatWrapping;
            mat.bumpMap.repeat.set(len / 4, height / 4);
        }

        const geo = new THREE.BoxGeometry(len, height, 8); // Thick mountain wall
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(mid.x, height / 2 - 2, mid.z);
        mesh.rotation.y = -angle;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        ctx.scene.add(mesh);

        // Collider
        ctx.obstacles.push({
            mesh: mesh,
            collider: { type: 'box', size: new THREE.Vector3(len, height, 8) }
        });
    },

    /**
     * Creates a massive rock wall along a path.
     * @param gaps Array of absolute distance ranges [start, end] to skip generation.
     */
    createRockWall: (ctx: SectorContext, points: THREE.Vector3[], height: number = 6, thickness: number = 4, gaps: { start: number, end: number }[] = []) => {
        const curve = new THREE.CatmullRomCurve3(points);
        const length = curve.getLength();
        // Place large rocks overlapping provided points
        const rockSize = thickness;
        const steps = Math.ceil(length / (rockSize * 0.6)); // High overlap

        initNaturePrototypes();
        const rockProtos = uniqueMeshes['rock'];

        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const dist = t * length;

            // Check gaps
            let inGap = false;
            for (const g of gaps) {
                if (dist >= g.start && dist <= g.end) { inGap = true; break; }
            }
            if (inGap) continue;

            const pt = curve.getPoint(t);
            // Random jitter
            const jitter = new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2);

            // Stack rocks for height
            const stacks = Math.ceil(height / rockSize);
            for (let h = 0; h < stacks; h++) {
                const rock = rockProtos[Math.floor(Math.random() * rockProtos.length)].clone();
                const actualH = (h * rockSize * 0.8) + (Math.random() * 1);
                rock.position.copy(pt).add(jitter).setY(actualH);
                rock.scale.setScalar(rockSize * (0.8 + Math.random() * 0.5));
                rock.rotation.set(Math.random() * 10, Math.random() * 10, Math.random() * 10);
                rock.castShadow = true;
                rock.receiveShadow = true;
                ctx.scene.add(rock);
            }

            // Collider: Create a single invisible box collider for the segment
            const colMesh = new THREE.Mesh(new THREE.BoxGeometry(thickness, height, thickness));
            colMesh.position.set(pt.x, height / 2, pt.z);
            colMesh.visible = false;
            colMesh.updateMatrixWorld();
            ctx.scene.add(colMesh);
            ctx.obstacles.push({
                mesh: colMesh,
                collider: { type: 'box', size: new THREE.Vector3(thickness, height, thickness) }
            });
        }
    },

    /**
     * Creates an invisible collision wall along a path.
     */
    createInvisibleWall: (ctx: SectorContext, points: THREE.Vector3[], height: number = 3, thickness: number = 1.0, name: string = 'InvisibleWall') => {
        const curve = new THREE.CatmullRomCurve3(points);
        const length = curve.getLength();
        const steps = Math.ceil(length / 2);
        const pointsList = curve.getSpacedPoints(steps);

        for (let i = 0; i < pointsList.length - 1; i++) {
            const curr = pointsList[i];
            const next = pointsList[i + 1];
            const mid = new THREE.Vector3().addVectors(curr, next).multiplyScalar(0.5);

            const segment = new THREE.Mesh(new THREE.BoxGeometry(thickness, height, 2.1));
            mid.y = height / 2;
            segment.position.copy(mid);
            segment.lookAt(next.x, mid.y, next.z);
            segment.visible = false; // Invisible
            segment.name = `${name}_${i}`;
            segment.updateMatrixWorld(); // Ensure matrix is ready

            ctx.scene.add(segment);

            ctx.obstacles.push({
                mesh: segment,
                collider: { type: 'box', size: new THREE.Vector3(thickness, height, 2.0) }
            });
        }
    },

    createVehicle: (type = 'station wagon', scale = 1.0, colorOverride?: number, addSnow = true) => {
        const vehicleBody = new THREE.Group();

        // Slumpfaktorer för post-apokalyptisk känsla
        const isBrokenGlass = Math.random() > 0.5;
        const isDoorOpen = Math.random() > 0.7; // 30% chans att en dörr står öppen
        const doorAngle = (Math.random() * 0.6) + 0.2; // Hur mycket dörren är öppen

        const colors = [0x7c2e2e, 0x3e4c5e, 0x8c8c7a, 0x4a5c4a, 0x8b5a2b, 0x5d4037];
        let bodyColor = colorOverride ?? colors[Math.floor(Math.random() * colors.length)];

        const matBody = MATERIALS.vehicleBody.clone();
        matBody.color.setHex(bodyColor);
        const matWindow = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.1, metalness: 0.9, transparent: true, opacity: 0.7 });
        const matBumper = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
        const matSirenBlue = new THREE.MeshStandardMaterial({ color: 0x0044ff, emissive: 0x0022ff, emissiveIntensity: 2 });
        const matSirenRed = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xaa0000, emissiveIntensity: 2 });

        const specs: Record<string, any> = {
            'station wagon': { c: [4.6, 0.7, 1.8], k: [2.8, 0.65, 1.6], ko: [-0.4, 1.25], hasTrunk: false },
            'sedan': { c: [4.5, 0.7, 1.8], k: [2.2, 0.65, 1.6], ko: [-0.1, 1.25], hasTrunk: true },
            'police': { c: [4.6, 0.7, 1.8], k: [2.8, 0.65, 1.6], ko: [-0.4, 1.25], isEmergency: true, body: 0xffffff },
            'ambulance': { c: [5.2, 1.0, 2.2], k: [3.8, 1.2, 2.0], ko: [0, 1.9], isEmergency: true, body: 0xeeeeee },
            'bus': { c: [12.0, 2.5, 3.5], k: [9.0, 1.8, 2.4], ko: [0, 2.5], isLarge: true, body: 0x009ddb },
            'tractor': { c: [2.5, 0.8, 1.8], k: [1.2, 1.5, 1.4], ko: [0.5, 1.5], isAgricultural: true, body: 0xcc2222 },
            'timber_truck': { c: [12.0, 0.8, 2.6], k: [2.5, 1.8, 2.4], ko: [4.0, 1.5], isLarge: true, body: 0x4a5c4a }
        };

        const s = specs[type] || specs['station wagon'];
        if (s.body) matBody.color.set(s.body);

        // 1. Chassi
        const chassis = new THREE.Mesh(new THREE.BoxGeometry(s.c[0], s.c[1], s.c[2]), matBody);
        chassis.position.y = s.c[1] / 2 + 0.3;
        chassis.castShadow = true;
        vehicleBody.add(chassis);

        // 2. Kabin (utan dörrar om vi vill ha dem rörliga)
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(s.k[0], s.k[1], s.k[2] * 0.95), matBody);
        cabin.position.set(s.ko[0], s.ko[1], 0);
        cabin.castShadow = true;
        vehicleBody.add(cabin);

        // 3. Fönster (Slumpmässigt krossade)
        if (!isBrokenGlass || Math.random() > 0.5) {
            const frontWindow = new THREE.Mesh(new THREE.BoxGeometry(0.05, s.k[1] * 0.8, s.k[2] * 0.9), matWindow);
            frontWindow.position.set(s.ko[0] + s.k[0] / 2 + 0.01, s.ko[1], 0);
            vehicleBody.add(frontWindow);
        }

        // Special: Västtrafik Bus Windows (Black Strip)
        if (type === 'bus') {
            const windowStrip = new THREE.Mesh(new THREE.BoxGeometry(s.c[0] * 0.85, s.c[1] * 0.35, s.c[2] + 0.02), matWindow);
            windowStrip.position.set(0, s.c[1] / 2 + 0.2, 0); // Upper half
            vehicleBody.add(windowStrip);

            // Special: Destination Sign "159"
            const sign = createSignMesh("159", 2.0, 0.6, '#ffaa00', '#000000');
            // Front is +X (s.c[0]/2). Top is s.c[1] + 0.3.
            sign.position.set(s.c[0] / 2 + 0.05, s.c[1] - 0.2, 0);
            sign.rotation.y = Math.PI / 2;
            vehicleBody.add(sign);
        }

        // 4. Dörrar (Slumpmässigt öppna)
        const doorGeo = new THREE.BoxGeometry(s.k[0] * 0.4, s.k[1], 0.05);
        const leftDoor = new THREE.Mesh(doorGeo, matBody);
        // Pivot-punkt för dörren (framkant)
        leftDoor.position.set(s.k[0] * 0.2, 0, 0);
        const doorGroup = new THREE.Group();
        doorGroup.add(leftDoor);
        doorGroup.position.set(s.ko[0] + s.k[0] * 0.1, s.ko[1], s.c[2] / 2);

        if (isDoorOpen) {
            doorGroup.rotation.y = doorAngle;
        }
        vehicleBody.add(doorGroup);

        // 5. Sirener (Blåljus/Rödljus)
        if (s.isEmergency) {
            const sirenBase = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.15, s.k[2] * 0.8), matBumper);
            sirenBase.position.set(s.ko[0], s.ko[1] + s.k[1] / 2 + 0.05, 0);
            vehicleBody.add(sirenBase);

            const blueLight = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.3), matSirenBlue);
            blueLight.position.set(s.ko[0], s.ko[1] + s.k[1] / 2 + 0.15, s.k[2] * 0.2);
            vehicleBody.add(blueLight);

            const redLight = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.3), matSirenRed);
            redLight.position.set(s.ko[0], s.ko[1] + s.k[1] / 2 + 0.15, -s.k[2] * 0.2);
            vehicleBody.add(redLight);

            // Lägg till en blinkande ljuskälla om det behövs
            const light = new THREE.PointLight(0x0044ff, 5, 10);
            light.position.set(s.ko[0], s.ko[1] + s.k[1] / 2 + 0.5, 0);
            vehicleBody.add(light);
        }

        // 6. Snö (Boolean check)
        if (addSnow && MATERIALS.snow) {
            const snowRoof = new THREE.Mesh(new THREE.BoxGeometry(s.k[0] * 1.05, 0.1, s.k[2] * 1.05), MATERIALS.snow);
            snowRoof.position.set(s.ko[0], s.ko[1] + s.k[1] / 2 + 0.05, 0);
            vehicleBody.add(snowRoof);

            if (!s.isLarge && !s.isAgricultural) {
                const hoodSnow = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, s.c[2] * 0.9), MATERIALS.snow);
                hoodSnow.position.set(s.c[0] / 2 - 0.6, chassis.position.y + s.c[1] / 2 + 0.01, 0);
                vehicleBody.add(hoodSnow);
            }
        }

        // 7. Special Extras (Timber for Timber Truck, Big Wheels for Tractor)
        if (type === 'tractor') {
            const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
            const frontWheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.4, 12);
            frontWheelGeo.rotateZ(Math.PI / 2);
            const rearWheelGeo = new THREE.CylinderGeometry(1.2, 1.2, 0.6, 12);
            rearWheelGeo.rotateZ(Math.PI / 2);

            const fwL = new THREE.Mesh(frontWheelGeo, wheelMat); fwL.position.set(1.0, 0.4, 0.7); vehicleBody.add(fwL);
            const fwR = new THREE.Mesh(frontWheelGeo, wheelMat); fwR.position.set(1.0, 0.4, -0.7); vehicleBody.add(fwR);
            const rwL = new THREE.Mesh(rearWheelGeo, wheelMat); rwL.position.set(-0.5, 1.2, 1.0); vehicleBody.add(rwL);
            const rwR = new THREE.Mesh(rearWheelGeo, wheelMat); rwR.position.set(-0.5, 1.2, -1.0); vehicleBody.add(rwR);
        }

        if (type === 'timber_truck') {
            const logs = ObjectGenerator.createTimberPile(1.0);
            logs.position.set(-2, chassis.position.y + 0.4, 0);
            logs.scale.set(1.5, 1.5, 0.6); // Scale to fit flatbed
            vehicleBody.add(logs);
        }

        vehicleBody.scale.set(scale, scale, scale);
        // ctx.scene.add(vehicleBody); -- Handled by caller (SectorBuilder)
        // ctx.obstacles.push({ mesh: vehicleBody }); -- Handled by caller

        return vehicleBody;
    },

    /**
     * Creates a standardized fire asset with physics-based particles and light.
     */
    createFire: (ctx: SectorContext, x: number, z: number, y: number = 0, scale: number = 1.0) => {
        const group = new THREE.Group();
        group.position.set(x, y, z);
        group.scale.setScalar(scale);

        // Logic Tags
        group.userData.isFire = true;

        // Asset-Driven Effects
        group.userData.effects = [
            {
                type: 'light',
                color: 0xff7722,
                intensity: 30 * scale,
                distance: 40 * scale,
                offset: new THREE.Vector3(0, 1.5, 0),
                flicker: true
            },
            {
                type: 'emitter', particle: 'campfire_flame',
                interval: 60, count: 1,
                offset: new THREE.Vector3(0, 0.5, 0), spread: 0.5, color: 0xffaa00
            },
            {
                type: 'emitter', particle: 'campfire_spark',
                interval: 100, count: 1,
                offset: new THREE.Vector3(0, 1.0, 0), spread: 0.8, color: 0xffdd00
            },
            {
                type: 'emitter', particle: 'black_smoke',
                interval: 200, count: 1,
                offset: new THREE.Vector3(0, 1.8, 0), spread: 0.4
            }
        ];

        ctx.scene.add(group);
        ctx.obstacles.push({ mesh: group, radius: 0.8 * scale });
    },


    /**
     * Creates a standardized campfire asset with physics-based particles and light.
     */
    createCampfire: (ctx: SectorContext, x: number, z: number, y: number = 0, scale: number = 1.0) => {
        const group = new THREE.Group();
        group.position.set(x, y, z);
        group.scale.setScalar(scale);

        // Visuals (Campfire Style)
        const ash = new THREE.Mesh(new THREE.CircleGeometry(0.8, 8), MATERIALS.ash);
        ash.rotation.x = -Math.PI / 2;
        ash.position.y = 0.05;
        ash.receiveShadow = true;
        group.add(ash);

        // Stones Ring
        const stoneGeo = new THREE.DodecahedronGeometry(0.25);
        const stoneMat = MATERIALS.stone;
        for (let i = 0; i < 10; i++) { // More stones
            const s = new THREE.Mesh(stoneGeo, stoneMat);
            const angle = (i / 10) * Math.PI * 2;
            const r = 0.9 + (Math.random() - 0.5) * 0.1;
            s.position.set(Math.cos(angle) * r, 0.15, Math.sin(angle) * r);
            s.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
            s.castShadow = true;
            s.receiveShadow = true;
            group.add(s);
        }

        const logGeo = new THREE.CylinderGeometry(0.12, 0.12, 1.4);
        const logMat = MATERIALS.treeTrunk;
        for (let i = 0; i < 4; i++) { // 4 logs
            const log = new THREE.Mesh(logGeo, logMat);
            log.rotation.z = Math.PI / 2;
            log.rotation.y = (i / 4) * Math.PI * 2 + (Math.random() * 0.2);
            log.rotation.x = (Math.random() - 0.5) * 0.2; // Tilted slightly
            log.position.y = 0.25;
            log.castShadow = true;
            log.receiveShadow = true;
            group.add(log);
        }

        // Logic Tags
        group.userData.isFire = true;

        // Asset-Driven Effects (High Intensity for Campfire feel)
        group.userData.effects = [
            {
                type: 'light',
                color: 0xff7722,
                intensity: 30 * scale,
                distance: 40 * scale,
                offset: new THREE.Vector3(0, 1.5, 0),
                flicker: true
            },
            {
                type: 'emitter', particle: 'campfire_flame',
                interval: 60, count: 1,
                offset: new THREE.Vector3(0, 0.5, 0), spread: 0.5, color: 0xffaa00
            },
            {
                type: 'emitter', particle: 'campfire_spark',
                interval: 100, count: 1,
                offset: new THREE.Vector3(0, 1.0, 0), spread: 0.8, color: 0xffdd00
            },
            {
                type: 'emitter', particle: 'black_smoke',
                interval: 200, count: 1,
                offset: new THREE.Vector3(0, 1.8, 0), spread: 0.4
            }
        ];

        ctx.scene.add(group);
        ctx.obstacles.push({ mesh: group, radius: 0.8 * scale });
        return group;
    },



    /**
     * Spawns trees within a polygonal area.
     */
    createForest: async (ctx: SectorContext, polygon: THREE.Vector3[], spacing: number = 8, type: string | string[] = 'random') => {
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        polygon.forEach(p => {
            minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
            minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
        });

        const validPointsByType: Record<string, { x: number, z: number, r: number, s: number }[]> = {};
        const types = Array.isArray(type) ? type : (type === 'random' ? ['spruce', 'pine', 'birch'] : [type]);

        for (let x = minX; x <= maxX; x += spacing) {
            for (let z = minZ; z <= maxZ; z += spacing) {
                const jx = x + (Math.random() - 0.5) * spacing;
                const jz = z + (Math.random() - 0.5) * spacing;

                let inside = false;
                for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
                    const xi = polygon[i].x, zi = polygon[i].z;
                    const xj = polygon[j].x, zj = polygon[j].z;
                    const intersect = ((zi > jz) !== (zj > jz)) && (jx < (xj - xi) * (jz - zi) / (zj - zi) + xi);
                    if (intersect) inside = !inside;
                }

                if (inside) {
                    const selectedType = types[Math.floor(Math.random() * types.length)];
                    if (!validPointsByType[selectedType]) validPointsByType[selectedType] = [];
                    validPointsByType[selectedType].push({
                        x: jx,
                        z: jz,
                        r: Math.random() * Math.PI * 2,
                        s: 0.8 + Math.random() * 0.5
                    });
                }
            }
            if (ctx.yield) await ctx.yield();
        }

        for (const treeType of Object.keys(validPointsByType)) {
            ObjectGenerator.addInstancedTrees(ctx, treeType, validPointsByType[treeType]);
            if (ctx.yield) await ctx.yield();
        }
    },

    addInstancedTrees: (ctx: SectorContext, treeType: string, points: { x: number, z: number, r: number, s: number }[]) => {
        ObjectGenerator.initNaturePrototypes();
        const protoList = (uniqueMeshes as any)[treeType];
        if (!protoList || protoList.length === 0) return;

        const variantCount = protoList.length;
        const pointsByVariant: { x: number, z: number, r: number, s: number }[][] = Array.from({ length: variantCount }, () => []);

        points.forEach(p => {
            const vIdx = Math.floor(Math.random() * variantCount);
            pointsByVariant[vIdx].push(p);
        });

        for (let vIdx = 0; vIdx < pointsByVariant.length; vIdx++) {
            const variantPoints = pointsByVariant[vIdx];
            if (variantPoints.length === 0) continue;
            const protoGroup = protoList[vIdx];

            const parts: { geo: THREE.BufferGeometry, mat: THREE.Material }[] = [];
            protoGroup.traverse((child: any) => {
                if (child instanceof THREE.Mesh) {
                    parts.push({ geo: child.geometry, mat: child.material });
                }
            });

            for (const part of parts) {
                const instancedMesh = new THREE.InstancedMesh(part.geo, part.mat, variantPoints.length);
                instancedMesh.castShadow = true;
                instancedMesh.receiveShadow = true;

                const matrix = new THREE.Matrix4();
                const position = new THREE.Vector3();
                const rotation = new THREE.Quaternion();
                const scale = new THREE.Vector3();

                variantPoints.forEach((p, i) => {
                    position.set(p.x, 0, p.z);
                    rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.r);
                    scale.set(p.s, p.s, p.s);
                    matrix.compose(position, rotation, scale);
                    instancedMesh.setMatrixAt(i, matrix);
                });

                instancedMesh.instanceMatrix.needsUpdate = true;
                ctx.scene.add(instancedMesh);
            }

            variantPoints.forEach(p => {
                const c = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4, 0.5));
                c.visible = false;
                c.name = 'TreeCollision';
                c.position.set(p.x, 2, p.z);
                c.updateMatrixWorld();
                ctx.scene.add(c);
                ctx.obstacles.push({ mesh: c, collider: { type: 'cylinder', radius: 0.4 * p.s, height: 4 } });
            });
        }
    },

    fillArea: async (
        ctx: SectorContext,
        center: { x: number, z: number },
        size: { width: number, height: number } | number,
        count: number,
        type: 'tree' | 'rock' | 'debris',
        avoidCenterRadius: number = 0,
        exclusionZones: { pos: THREE.Vector3, radius: number }[] = []
    ) => {
        const isRect = typeof size !== 'number';
        const rectW = isRect ? (size as any).width : 0;
        const rectH = isRect ? (size as any).height : 0;
        const radius = !isRect ? (size as number) : 0;

        const treePoints: { x: number, z: number, r: number, s: number }[] = [];

        for (let i = 0; i < count; i++) {
            let x, z;
            let safety = 0;
            let valid = false;
            do {
                if (isRect) {
                    x = center.x + (Math.random() - 0.5) * rectW;
                    z = center.z + (Math.random() - 0.5) * rectH;
                } else {
                    const r = Math.sqrt(Math.random()) * radius;
                    const theta = Math.random() * Math.PI * 2;
                    x = center.x + r * Math.cos(theta);
                    z = center.z + r * Math.sin(theta);
                }

                const distToCenter = Math.sqrt((x - center.x) ** 2 + (z - center.z) ** 2);
                let excluded = false;
                for (const zone of exclusionZones) {
                    const dx = x - zone.pos.x;
                    const dz = z - zone.pos.z;
                    if (dx * dx + dz * dz < zone.radius * zone.radius) {
                        excluded = true;
                        break;
                    }
                }

                if (distToCenter >= avoidCenterRadius && !excluded) {
                    valid = true;
                }

                safety++;
            } while (!valid && safety < 10);

            if (!valid) continue;

            if (type === 'tree') {
                treePoints.push({
                    x, z,
                    r: Math.random() * Math.PI * 2,
                    s: 0.8 + Math.random() * 0.8
                });
            } else if (type === 'rock') {
                const rock = new THREE.Mesh(GEOMETRY.stone, MATERIALS.stone);
                const s = 0.5 + Math.random();
                rock.scale.setScalar(s);
                rock.position.set(x, s / 2, z);
                rock.rotation.set(Math.random(), Math.random(), Math.random());
                rock.castShadow = true;
                ctx.scene.add(rock);
                ctx.obstacles.push({ mesh: rock, collider: { type: 'sphere', radius: s } });
            }

            if (ctx.yield && i % 20 === 0) await ctx.yield();
        }

        if (treePoints.length > 0) {
            ObjectGenerator.addInstancedTrees(ctx, 'spruce', treePoints);
        }
    },

    fillWheatField: async (ctx: SectorContext, polygon: THREE.Vector3[], density: number = 0.5) => {
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        polygon.forEach(p => {
            minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
            minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
        });

        const spacing = 1.0 / density;
        const positions: THREE.Vector3[] = [];

        for (let x = minX; x <= maxX; x += spacing) {
            for (let z = minZ; z <= maxZ; z += spacing) {
                const jx = x + (Math.random() - 0.5) * (spacing * 0.5);
                const jz = z + (Math.random() - 0.5) * (spacing * 0.5);

                let inside = false;
                for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
                    const xi = polygon[i].x, zi = polygon[i].z;
                    const xj = polygon[j].x, zj = polygon[j].z;
                    const intersect = ((zi > jz) !== (zj > jz)) && (jx < (xj - xi) * (jz - zi) / (zj - zi) + xi);
                    if (intersect) inside = !inside;
                }

                if (inside) {
                    positions.push(new THREE.Vector3(jx, 0, jz));
                }
            }
            if (ctx.yield) await ctx.yield();
        }

        // Use Instancing for Performance
        const protoGroup = ObjectGenerator.createWheatStalk(1.0);
        const parts: { geo: THREE.BufferGeometry, mat: THREE.Material }[] = [];
        protoGroup.traverse(c => { if (c instanceof THREE.Mesh) parts.push({ geo: c.geometry, mat: c.material }); });

        for (const part of parts) {
            const instanced = new THREE.InstancedMesh(part.geo, part.mat, positions.length);
            const matrix = new THREE.Matrix4();
            const dummy = new THREE.Object3D();

            positions.forEach((p, i) => {
                dummy.position.copy(p);
                dummy.rotation.y = Math.random() * Math.PI;
                dummy.scale.setScalar(0.8 + Math.random() * 0.4);
                dummy.updateMatrix();
                instanced.setMatrixAt(i, dummy.matrix);
            });
            instanced.instanceMatrix.needsUpdate = true;
            instanced.castShadow = true;
            instanced.receiveShadow = true;
            ctx.scene.add(instanced);
            if (ctx.yield) await ctx.yield();
        }
    },


    createTunnel: (ctx: SectorContext, pos: THREE.Vector3, width: number = 6, height: number = 5, length: number = 10, rotation: number = 0, wallThick: number = 0.5, roofThick: number = 0.5) => {
        const group = new THREE.Group();
        group.position.copy(pos);
        group.rotation.y = rotation;

        const mat = MATERIALS.concrete;

        // Sides
        const sideL = new THREE.Mesh(new THREE.BoxGeometry(wallThick, height, length), mat);
        sideL.position.set(-width / 2 - wallThick / 2, height / 2, 0);
        group.add(sideL);

        const sideR = new THREE.Mesh(new THREE.BoxGeometry(wallThick, height, length), mat);
        sideR.position.set(width / 2 + wallThick / 2, height / 2, 0);
        group.add(sideR);

        // Roof
        const roof = new THREE.Mesh(new THREE.BoxGeometry(width + wallThick * 2, roofThick, length), mat);
        roof.position.set(0, height + roofThick / 2, 0);
        group.add(roof);

        ctx.scene.add(group);

        const colL = new THREE.Mesh(new THREE.BoxGeometry(wallThick, height, length));
        colL.position.copy(pos).setY(pos.y + height / 2);
        colL.rotation.y = rotation;
        colL.translateX(-width / 2 - wallThick / 2);
        colL.visible = false;
        colL.updateMatrixWorld();
        ctx.scene.add(colL);
        ctx.obstacles.push({ mesh: colL, collider: { type: 'box', size: new THREE.Vector3(wallThick, height, length) } });

        const colR = new THREE.Mesh(new THREE.BoxGeometry(wallThick, height, length));
        colR.position.copy(pos).setY(pos.y + height / 2);
        colR.rotation.y = rotation;
        colR.translateX(width / 2 + wallThick / 2);
        colR.visible = false;
        colR.updateMatrixWorld();
        ctx.scene.add(colR);
        ctx.obstacles.push({ mesh: colR, collider: { type: 'box', size: new THREE.Vector3(wallThick, height, length) } });

        return group;
    },

    createHaybale: (scale: number = 1.0) => {
        const group = new THREE.Group();
        const mat = MATERIALS.hay;
        const geo = new THREE.CylinderGeometry(1.2, 1.2, 2.4, 12);
        geo.rotateZ(Math.PI / 2);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.y = 1.2;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        group.scale.setScalar(scale);
        return group;
    },

    createTimberPile: (scale: number = 1.0) => {
        const group = new THREE.Group();
        const trunkMat = MATERIALS.treeTrunk;
        const endMat = MATERIALS.logEnd;
        const logHeight = 6;
        const logRadius = 0.3;
        const logGeo = new THREE.CylinderGeometry(logRadius, logRadius, logHeight, 8);
        logGeo.rotateX(Math.PI / 2);
        const materials = [trunkMat, endMat, endMat];
        const layers = 4;
        for (let l = 0; l < layers; l++) {
            const logsInLayer = layers - l;
            const y = logRadius + l * (logRadius * 1.7);
            const startX = -(logsInLayer - 1) * logRadius;
            for (let i = 0; i < logsInLayer; i++) {
                const log = new THREE.Mesh(logGeo, materials);
                log.position.set(startX + i * logRadius * 2, y, 0);
                log.rotation.z = (Math.random() - 0.5) * 0.05;
                log.castShadow = true;
                group.add(log);
            }
        }
        group.scale.setScalar(scale);
        return group;
    },

    createWheatStalk: (scale: number = 1.0) => {
        const group = new THREE.Group();
        const mat = MATERIALS.wheat;
        const height = 1.2 + Math.random() * 0.4;
        const stalkGeo = new THREE.PlaneGeometry(0.1, height);
        stalkGeo.translate(0, height / 2, 0);
        const p1 = new THREE.Mesh(stalkGeo, mat);
        p1.rotation.y = Math.random() * Math.PI;
        p1.rotation.x = (Math.random() - 0.5) * 0.2;
        group.add(p1);
        const p2 = p1.clone();
        p2.rotation.y += Math.PI / 2;
        group.add(p2);
        group.scale.setScalar(scale);
        return group;
    },
    createDeadBody: (type: 'WALKER' | 'RUNNER' | 'BOMBER' | 'TANK' | 'PLAYER' | 'HUMAN', rot: number = 0, blood: boolean = true) => {
        const group = new THREE.Group();
        group.rotation.y = rot;

        if (blood) {
            const bloodPool = new THREE.Mesh(GEOMETRY.decal, MATERIALS.bloodDecal);
            bloodPool.rotation.x = -Math.PI / 2;
            bloodPool.position.set(0, 0.02, 0);
            bloodPool.scale.set(5, 5, 1);
            group.add(bloodPool);
        }

        const baseZomb = ModelFactory.createZombie(type, { color: 0x445544 });
        const corpse = ModelFactory.createCorpse(baseZomb);
        corpse.position.set(0, 0.1, 0);
        group.add(corpse);

        return group;
    },

    createContainer: (colorOverride?: number, addSnow: boolean = true) => {
        const group = new THREE.Group();
        const mat = MATERIALS.container.clone();
        if (colorOverride !== undefined) mat.color.setHex(colorOverride);

        // 20ft Container: 6.0m L x 2.6m H x 2.4m W
        const body = new THREE.Mesh(new THREE.BoxGeometry(6.0, 2.6, 2.4), mat);
        body.position.y = 1.3;
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);

        // Snow layer on top
        if (addSnow) {
            const snowGeo = new THREE.BoxGeometry(6.05, 0.1, 2.45);
            const snow = new THREE.Mesh(snowGeo, MATERIALS.snow);
            snow.position.y = 2.6 + 0.05;
            group.add(snow);
        }

        return group;
    },
    createGrassField: (ctx: SectorContext, x: number, z: number, width: number, depth: number, count: number) => {
        const dummy = new THREE.Object3D();
        // Simple Grass Blade: Triangle
        const geometry = new THREE.ConeGeometry(0.05, 0.4, 3);
        geometry.translate(0, 0.2, 0); // Pivot at bottom

        const material = MATERIALS.grass;
        const mesh = new THREE.InstancedMesh(geometry, material, count);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        for (let i = 0; i < count; i++) {
            const px = x + (Math.random() - 0.5) * width;
            const pz = z + (Math.random() - 0.5) * depth;
            const scale = 0.8 + Math.random() * 0.4;
            const rot = Math.random() * Math.PI;

            dummy.position.set(px, 0, pz);
            dummy.rotation.set(0, rot, 0);
            dummy.scale.set(scale, scale * (0.8 + Math.random() * 0.5), scale);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
        }

        mesh.instanceMatrix.needsUpdate = true;
        ctx.scene.add(mesh);

        // Add to vegetation list if we had one, or just letting it be static
        // For wind, we'd need a custom shader or a system that updates instance matrices (expensive)
        // Leaving as static for now, or maybe the material handles it later.
    },
};
