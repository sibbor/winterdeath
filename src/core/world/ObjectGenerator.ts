
import * as THREE from 'three';
import { createProceduralTextures, MATERIALS, GEOMETRY } from '../../utils/assets';
import { SectorContext } from '../../types/sectors';

// Lazy load textures
let sharedTextures: any = null;
const getSharedTextures = () => {
    if (!sharedTextures) sharedTextures = createProceduralTextures();
    return sharedTextures;
};

const NATURE_VARIANTS = 5;
const uniqueMeshes: Record<string, THREE.Group[]> = {
    'spruce': [],
    'pine': [],
    'birch': [],
    'rock': []
};

export const initNaturePrototypes = () => {
    if (uniqueMeshes['spruce'].length > 0) return;

    const tex = getSharedTextures();

    // Materials
    const trunkMat = new THREE.MeshStandardMaterial({
        map: tex.barkTex,
        color: 0xffffff,
        roughness: 1.0,
        name: 'TrunkMat'
    });
    const birchTrunkMat = new THREE.MeshStandardMaterial({
        map: tex.birchTex,
        color: 0xffffff,
        roughness: 0.8,
        name: 'BirchTrunk'
    });

    // Foliage
    const spruceMat = new THREE.MeshStandardMaterial({
        map: tex.pineBranchTex,
        alphaMap: tex.pineBranchTex,
        color: 0xffffff,
        transparent: true,
        alphaTest: 0.4,
        side: THREE.DoubleSide,
        roughness: 0.8,
        name: 'SpruceMat'
    });
    const pineMat = new THREE.MeshStandardMaterial({
        map: tex.pineBranchTex,
        alphaMap: tex.pineBranchTex,
        color: 0xcccccc,
        transparent: true,
        alphaTest: 0.4,
        side: THREE.DoubleSide,
        roughness: 0.8,
        name: 'PineMat'
    });
    const birchMat = new THREE.MeshStandardMaterial({
        map: tex.pineBranchTex,
        alphaMap: tex.pineBranchTex,
        color: 0x99cc99,
        transparent: true,
        alphaTest: 0.4,
        side: THREE.DoubleSide,
        roughness: 0.8,
        name: 'BirchMat'
    });

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
        const layers = 6;
        const planesPerLayer = 4;
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
        const layers = 5;
        const planesPerLayer = 3;
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
    }

    // 4. ROCKS
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.9, flatShading: true });
    for (let i = 0; i < NATURE_VARIANTS; i++) {
        const group = new THREE.Group();
        const geo = new THREE.DodecahedronGeometry(1, 0); // Low poly rock
        // Deform
        const pos = geo.attributes.position;
        for (let v = 0; v < pos.count; v++) {
            pos.setXYZ(v, pos.getX(v) * (0.8 + Math.random() * 0.4), pos.getY(v) * (0.8 + Math.random() * 0.4), pos.getZ(v) * (0.8 + Math.random() * 0.4));
        }
        geo.computeVertexNormals();
        const mesh = new THREE.Mesh(geo, rockMat);
        mesh.castShadow = true; mesh.receiveShadow = true;
        group.add(mesh);
        uniqueMeshes['rock'].push(group);
    }
};



const buildingMeshes: Record<string, THREE.Group> = {};

export const initBuildingPrototypes = () => {
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
};

export const ObjectGenerator = {
    initNaturePrototypes,
    getPrototypes: () => {
        // Return flatten array of all variants
        return [
            ...uniqueMeshes['spruce'],
            ...uniqueMeshes['pine'],
            ...uniqueMeshes['birch']
        ];
    },

    createTree: (type: 'spruce' | 'pine' | 'birch' = 'spruce', scale: number = 1.0) => {
        initNaturePrototypes();
        const list = uniqueMeshes[type] || uniqueMeshes['spruce'];
        const p = list[Math.floor(Math.random() * list.length)];
        const t = p.clone();
        t.scale.multiplyScalar(scale);
        t.rotation.y = Math.random() * Math.PI * 2; // Use Math.PI * 2 for full rotation
        return t;
    },

    createRock: (scale: number = 1.0, radius: number = 1.0, segments: number = 6) => {
        if (radius !== 1.0 || segments !== 6) {
            const geo = new THREE.IcosahedronGeometry(radius, Math.min(segments, 4)); // Using detail instead of sides for icosahedron
            const mat = (MATERIALS as any).rock || new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.9 });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.scale.setScalar(scale);
            mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            return mesh;
        }
        initNaturePrototypes();
        const list = uniqueMeshes['rock'];
        const p = list[Math.floor(Math.random() * list.length)];
        const r = p.clone();
        r.scale.multiplyScalar(scale);
        r.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        return r;
    },

    createHedge: (length: number = 2.0, height: number = 1.2, thickness: number = 0.8) => {
        const group = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: 0x2d4c1e, roughness: 0.9 });
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
        const mat = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 1.0 });
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

    createStoneWall: (length: number = 2.0, height: number = 1.0) => {
        const group = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 1.0 });
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
        initBuildingPrototypes();
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
     * Creates a hedge along a path.
     */
    createHedgePath: (ctx: SectorContext, points: THREE.Vector3[], height: number = 2, thickness: number = 1.5) => {
        const curve = new THREE.CatmullRomCurve3(points);
        const length = curve.getLength();
        const steps = Math.ceil(length / 2);
        const pointsList = curve.getSpacedPoints(steps);

        const geo = new THREE.BoxGeometry(thickness, height, 2.1);
        // Fallback material
        const mat = (MATERIALS as any).pineFoliage || new THREE.MeshStandardMaterial({ color: 0x2d4c1e, roughness: 0.9, name: 'HedgeMat' });

        for (let i = 0; i < pointsList.length - 1; i++) {
            const curr = pointsList[i];
            const next = pointsList[i + 1];
            const mid = new THREE.Vector3().addVectors(curr, next).multiplyScalar(0.5);
            mid.y = height / 2;

            const segment = new THREE.Mesh(geo, mat);
            segment.position.copy(mid);
            segment.lookAt(next.x, mid.y, next.z);
            segment.castShadow = true;
            segment.receiveShadow = true;

            ctx.scene.add(segment);

            ctx.obstacles.push({
                mesh: segment,
                collider: { type: 'box', size: new THREE.Vector3(thickness, height, 2.0) }
            });
        }
    },

    /**
     * Creates a standardized campfire asset with physics-based particles and light.
     */
    createCampfire: (ctx: SectorContext, x: number, z: number, y: number = 0, scale: number = 1.0) => {
        const group = new THREE.Group();
        group.position.set(x, y, z);
        group.scale.setScalar(scale);

        // Visuals (Campfire Style)
        const ash = new THREE.Mesh(new THREE.CircleGeometry(0.8, 8), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 1 }));
        ash.rotation.x = -Math.PI / 2;
        ash.position.y = 0.05;
        ash.receiveShadow = true;
        group.add(ash);

        // Stones Ring
        const stoneGeo = new THREE.DodecahedronGeometry(0.25);
        const stoneMat = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.9 });
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
        const logMat = new THREE.MeshStandardMaterial({ color: 0x5e3723, roughness: 1.0 });
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
     * Creates a stone wall along a path.
     */
    createStoneWallPath: (ctx: SectorContext, points: THREE.Vector3[], height: number = 1.5, thickness: number = 0.8) => {
        const curve = new THREE.CatmullRomCurve3(points);
        const length = curve.getLength();
        // Dense packing for dry stone wall look
        const rockSize = thickness * 0.8;
        const steps = Math.ceil(length / (rockSize * 0.5));

        initNaturePrototypes();
        const rockProtos = uniqueMeshes['rock'];
        if (!rockProtos || rockProtos.length === 0) return;

        // Use InstancedMesh for performance
        // Flatten all rock variants into one list? 
        // For simplicity/performance, let's pick ONE rock prototype group (the first one) and random-rotate it.
        // Or better: Create a dedicated InstancedMesh for "WallRocks".
        // Since uniqueMeshes['rock'] has multiple variants (groups with Mesh inside), we need to extract geometry.

        const protoGroup = rockProtos[0];
        let protoMesh: THREE.Mesh | null = null;
        protoGroup.traverse(c => { if (c instanceof THREE.Mesh) protoMesh = c; });
        if (!protoMesh) return;

        const count = steps * Math.ceil(height / rockSize) * 2; // Rough estimate
        const instances = new THREE.InstancedMesh(protoMesh.geometry, MATERIALS.stone, count);
        instances.name = 'StoneWall';
        instances.castShadow = true;
        instances.receiveShadow = true;

        const dummy = new THREE.Object3D();
        let idx = 0;

        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const pt = curve.getPoint(t);

            // Stack rocks
            const stacks = Math.ceil(height / (rockSize * 0.7));
            for (let h = 0; h < stacks; h++) {
                if (idx >= count) break;

                const actualH = (h * rockSize * 0.7) + (Math.random() * 0.2);

                // Random offset from center line for "messy" look
                const offset = (Math.random() - 0.5) * (thickness * 0.5);

                // Tangent for local offset? simplified: just random jitter x/z
                dummy.position.set(
                    pt.x + (Math.random() - 0.5) * 0.3,
                    actualH + rockSize / 2,
                    pt.z + (Math.random() - 0.5) * 0.3
                );

                const scaleVar = 0.8 + Math.random() * 0.4;
                dummy.scale.setScalar(rockSize * scaleVar);
                dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

                dummy.updateMatrix();
                instances.setMatrixAt(idx++, dummy.matrix);
            }
        }

        instances.instanceMatrix.needsUpdate = true;
        ctx.scene.add(instances);

        // Invisible Collider
        // Generate simplified collision boxes
        // ... (Optional: reuse invisible wall logic or leave as visual only if detailed physics not needed)
        // For walls, we usually want collision.
        ObjectGenerator.createInvisibleWall(ctx, points, height, thickness * 1.5, 'StoneWall_Col');
    },

    /**
     * Creates a plank fence along a path.
     */
    createFencePath: (ctx: SectorContext, points: THREE.Vector3[], color: 'white' | 'wood' | 'black' = 'wood', height: number = 1.2) => {
        const curve = new THREE.CatmullRomCurve3(points);
        const length = curve.getLength();
        const steps = Math.ceil(length / 2.0); // 2m panels
        const pointsList = curve.getSpacedPoints(steps);

        let matColor = 0x8b5a2b; // Wood
        if (color === 'white') matColor = 0xeeeeee;
        if (color === 'black') matColor = 0x222222;

        const mat = new THREE.MeshStandardMaterial({ color: matColor, roughness: 0.9 });

        // Simple plank fence geometry: 2 rails + posts
        // We'll just make a simplified solid panel with alpha/gaps or constructed geometry
        // Constructed is better for 3D look.

        // Post geometry
        const postGeo = new THREE.BoxGeometry(0.15, height + 0.2, 0.15);
        // Rail geometry
        const railGeo = new THREE.BoxGeometry(0.05, 0.15, 2.0);
        // Vertical plank geometry
        const plankGeo = new THREE.BoxGeometry(0.02, height * 0.8, 0.12);

        for (let i = 0; i < pointsList.length - 1; i++) {
            const curr = pointsList[i];
            const next = pointsList[i + 1];
            const mid = new THREE.Vector3().addVectors(curr, next).multiplyScalar(0.5);

            const group = new THREE.Group();
            group.position.copy(mid);
            group.lookAt(next.x, mid.y, next.z);

            // Post at start (relative to mid)
            // Actually, best to place posts at 'curr' and 'next'?
            // Loop is segments. Place Post at -1 local Z (start) and +1 local Z (end)?
            // Or just place one post per segment at start?

            const post = new THREE.Mesh(postGeo, mat);
            post.position.set(0, height / 2, -1);
            group.add(post);

            // Rails
            const railTop = new THREE.Mesh(railGeo, mat);
            railTop.position.set(0, height - 0.2, 0);
            group.add(railTop);

            const railBot = new THREE.Mesh(railGeo, mat);
            railBot.position.set(0, 0.4, 0);
            group.add(railBot);

            // Planks
            for (let p = 0; p < 10; p++) {
                const plank = new THREE.Mesh(plankGeo, mat);
                plank.position.set(0.05 * (p % 2 === 0 ? 1 : -1), height / 2, -0.9 + (p * 0.2));
                plank.rotation.z = (Math.random() - 0.5) * 0.05;
                group.add(plank);
            }

            ctx.scene.add(group);

            // CollisionBox
            const colGeo = new THREE.BoxGeometry(0.2, height, 2.0);
            const colMesh = new THREE.Mesh(colGeo); // Invisible helper for collision system that expects a mesh
            colMesh.position.copy(mid);
            colMesh.lookAt(next.x, mid.y, next.z);
            colMesh.visible = false;
            colMesh.updateMatrixWorld();
            ctx.scene.add(colMesh);

            ctx.obstacles.push({
                mesh: colMesh,
                collider: { type: 'box', size: new THREE.Vector3(0.2, height, 2.0) }
            });
        }
    },

    /**
     * Spawns trees within a polygonal area.
     */
    createForestInPolygon: (ctx: SectorContext, polygon: THREE.Vector3[], spacing: number = 8, type: string | string[] = 'random') => {
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        polygon.forEach(p => {
            minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
            minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
        });

        // 1. Collect Valid Points & Assign Types
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
        }

        // 2. Instance Generation per Type
        initNaturePrototypes();
        const dummy = new THREE.Object3D();

        Object.keys(validPointsByType).forEach(treeType => {
            const points = validPointsByType[treeType];
            if (points.length === 0) return;

            const protoList = uniqueMeshes[treeType];
            if (!protoList || protoList.length === 0) return;

            // Use the first variant for instancing (Simplification for performance)
            const protoGroup = protoList[0];

            const meshes: { mesh: THREE.Mesh, geo: THREE.BufferGeometry, mat: THREE.Material }[] = [];
            protoGroup.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    meshes.push({ mesh: child, geo: child.geometry, mat: child.material });
                }
            });

            meshes.forEach(part => {
                const instancedMesh = new THREE.InstancedMesh(part.geo, part.mat, points.length);
                instancedMesh.castShadow = true;
                instancedMesh.receiveShadow = true;

                const localPos = part.mesh.position.clone();
                const localRot = part.mesh.quaternion.clone();
                const localScale = part.mesh.scale.clone();

                points.forEach((p, i) => {
                    const treePos = new THREE.Vector3(p.x, 0, p.z);
                    const treeRot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.r);
                    const treeScale = new THREE.Vector3(p.s, p.s, p.s);

                    dummy.position.copy(localPos).applyQuaternion(treeRot).multiply(treeScale).add(treePos);
                    dummy.quaternion.copy(localRot).premultiply(treeRot);
                    dummy.scale.copy(localScale).multiply(treeScale);
                    dummy.updateMatrix();
                    instancedMesh.setMatrixAt(i, dummy.matrix);
                });

                instancedMesh.instanceMatrix.needsUpdate = true;
                ctx.scene.add(instancedMesh);
            });

            // 3. Collision (Simplified) - One per tree
            points.forEach(p => {
                const c = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4, 0.5));
                c.visible = false;
                c.name = 'TreeCollision';
                c.position.set(p.x, 2, p.z);
                c.updateMatrixWorld();
                ctx.scene.add(c);
                ctx.obstacles.push({ mesh: c, collider: { type: 'cylinder', radius: 0.4, height: 4 } });
            });
        });
    }
};