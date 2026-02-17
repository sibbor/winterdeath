import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MATERIALS, WindUniforms } from '../../utils/assets/materials';
import { SectorContext } from '../../types/SectorEnvironment';
import { SectorGenerator } from './SectorGenerator';

// --- CONFIGURATION ---
const LOD_DISTANCES = {
    HIGH: 30,
    MEDIUM: 60,
    LOW: 120
};

// --- TYPES ---
interface TreePrototype {
    trunkGeo: THREE.BufferGeometry;
    leavesGeo?: THREE.BufferGeometry;
    snowGeo?: THREE.BufferGeometry;
    height: number;
    radius: number;
}

// Module-level storage for prototypes
let prototypes: Record<string, TreePrototype> = {};

// --- GEOMETRY HELPERS ---
const safeMerge = (geos: THREE.BufferGeometry[]): THREE.BufferGeometry => {
    if (geos.length === 0) return new THREE.BufferGeometry();
    const merged = BufferGeometryUtils.mergeGeometries(geos);
    if (!merged) return new THREE.BufferGeometry();
    return merged;
};

const bakeGeo = (geo: THREE.BufferGeometry, pos: THREE.Vector3, rot: THREE.Euler, scale: THREE.Vector3) => {
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion().setFromEuler(rot);
    matrix.compose(pos, quaternion, scale);
    geo.applyMatrix4(matrix);
    return geo;
};

const isPointInPolygon = (p: THREE.Vector3, polygon: THREE.Vector3[]) => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x, zi = polygon[i].z;
        const xj = polygon[j].x, zj = polygon[j].z;
        const intersect = ((zi > p.z) !== (zj > p.z))
            && (p.x < (xj - xi) * (p.z - zi) / (zj - zi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
};

// --- PROTOTYPE GENERATORS ---

const generatePinePrototype = (seed: number, hasSnow: boolean = false): TreePrototype => {
    const trunkGeos: THREE.BufferGeometry[] = [];
    const leafGeos: THREE.BufferGeometry[] = [];
    const snowGeos: THREE.BufferGeometry[] = [];

    let currentSeed = seed;
    const rng = () => {
        const x = Math.sin(currentSeed++) * 10000;
        return x - Math.floor(x);
    };

    // PINE: High Canopy, Tall Trunk (Scotland Pine style)
    const trunkH = 4.5 + rng() * 2.0;
    const trunkGeo = new THREE.CylinderGeometry(0.2, 0.45, trunkH, 7);
    trunkGeo.translate(0, trunkH / 2, 0);
    const leanX = (rng() - 0.5) * 0.2;
    const leanZ = (rng() - 0.5) * 0.2;
    bakeGeo(trunkGeo, new THREE.Vector3(0, 0, 0), new THREE.Euler(leanX, 0, leanZ), new THREE.Vector3(1, 1, 1));
    trunkGeos.push(trunkGeo);

    // Foliage: Starts high up
    const layers = 4 + Math.floor(rng() * 3);
    let y = trunkH * 0.7;
    let r = 2.5 + rng() * 1.0;

    for (let i = 0; i < layers; i++) {
        const h = 1.5 + rng() * 1.0;
        const nextR = r * 0.65; // Quick taper

        const cone = new THREE.ConeGeometry(r, h, 7);
        cone.translate(0, h / 2, 0);

        const layerRot = new THREE.Euler((rng() - 0.5) * 0.3 + leanX, 0, (rng() - 0.5) * 0.3 + leanZ);
        const layerPos = new THREE.Vector3(0, y, 0);

        leafGeos.push(bakeGeo(cone.clone(), layerPos, layerRot, new THREE.Vector3(1, 1, 1)));

        if (hasSnow) {
            const snow = new THREE.ConeGeometry(r * 0.9, h * 0.4, 7);
            snow.translate(0, h * 0.3, 0);
            snowGeos.push(bakeGeo(snow, layerPos, layerRot, new THREE.Vector3(1, 1, 1)));
        }

        y += h * 0.5;
        r = nextR;
    }

    // Top
    const topH = 2.0;
    const top = new THREE.ConeGeometry(r, topH, 6);
    top.translate(0, topH / 2, 0);
    leafGeos.push(bakeGeo(top.clone(), new THREE.Vector3(0, y, 0), new THREE.Euler(leanX, 0, leanZ), new THREE.Vector3(1, 1, 1)));

    return {
        trunkGeo: safeMerge(trunkGeos),
        leavesGeo: safeMerge(leafGeos),
        snowGeo: hasSnow && snowGeos.length > 0 ? safeMerge(snowGeos) : undefined,
        height: y + topH,
        radius: 3.5
    };
};

const generateSprucePrototype = (seed: number, hasSnow: boolean = false): TreePrototype => {
    const trunkGeos: THREE.BufferGeometry[] = [];
    const leafGeos: THREE.BufferGeometry[] = [];
    const snowGeos: THREE.BufferGeometry[] = [];

    let currentSeed = seed;
    const rng = () => {
        const x = Math.sin(currentSeed++) * 10000;
        return x - Math.floor(x);
    };

    // SPRUCE: Dense, touches ground, conical
    const trunkH = 4.0 + rng() * 2.0;
    const trunkGeo = new THREE.CylinderGeometry(0.3, 0.7, trunkH, 7);
    trunkGeo.translate(0, trunkH / 2, 0);
    const leanX = (rng() - 0.5) * 0.1;
    const leanZ = (rng() - 0.5) * 0.1;
    bakeGeo(trunkGeo, new THREE.Vector3(0, 0, 0), new THREE.Euler(leanX, 0, leanZ), new THREE.Vector3(1, 1, 1));
    trunkGeos.push(trunkGeo);

    // Foliage: Starts very low
    const layers = 10 + Math.floor(rng() * 5);
    let y = 0.5; // Nearly ground level
    let r = 3.5 + rng() * 1.0; // Wide base

    for (let i = 0; i < layers; i++) {
        const h = 1.0 + rng() * 0.5;
        const nextR = r * 0.85; // Slow taper

        const cone = new THREE.ConeGeometry(r, h, 8);
        cone.translate(0, h / 2, 0);

        const layerRot = new THREE.Euler((rng() - 0.5) * 0.1 + leanX, 0, (rng() - 0.5) * 0.1 + leanZ);
        const layerPos = new THREE.Vector3(0, y, 0);

        leafGeos.push(bakeGeo(cone.clone(), layerPos, layerRot, new THREE.Vector3(1, 1, 1)));

        if (hasSnow) {
            const snow = new THREE.ConeGeometry(r * 0.95, h * 0.4, 8);
            snow.translate(0, h * 0.35, 0);
            snowGeos.push(bakeGeo(snow, layerPos, layerRot, new THREE.Vector3(1, 1, 1)));
        }

        y += h * 0.55;
        r = nextR;
    }

    // Top
    const topH = 1.5;
    const top = new THREE.ConeGeometry(r, topH, 6);
    top.translate(0, topH / 2, 0);
    leafGeos.push(bakeGeo(top.clone(), new THREE.Vector3(0, y, 0), new THREE.Euler(leanX, 0, leanZ), new THREE.Vector3(1, 1, 1)));

    return {
        trunkGeo: safeMerge(trunkGeos),
        leavesGeo: safeMerge(leafGeos),
        snowGeo: hasSnow && snowGeos.length > 0 ? safeMerge(snowGeos) : undefined,
        height: y + topH,
        radius: 4.5
    };
};

const generateOakPrototype = (seed: number): TreePrototype => {
    const trunkGeos: THREE.BufferGeometry[] = [];
    const leafGeos: THREE.BufferGeometry[] = [];

    let currentSeed = seed;
    const rng = () => {
        const x = Math.sin(currentSeed++) * 10000;
        return x - Math.floor(x);
    };

    // OAK: Massive, twisted trunk, huge canopy
    const trunkH = 2.5 + rng() * 0.8;
    const trunkGeo = new THREE.CylinderGeometry(0.5, 0.8, trunkH, 7);
    trunkGeo.translate(0, trunkH / 2, 0);
    bakeGeo(trunkGeo, new THREE.Vector3(0, 0, 0), new THREE.Euler((rng() - 0.5) * 0.3, 0, (rng() - 0.5) * 0.3), new THREE.Vector3(1, 1, 1));
    trunkGeos.push(trunkGeo);

    // Leaves: Massive Clumps
    const clusters = 12 + Math.floor(rng() * 6);
    for (let i = 0; i < clusters; i++) {
        const size = 1.8 + rng() * 1.2;
        const sphere = new THREE.DodecahedronGeometry(size, 0);

        // Distribute wide
        const radius = 1.5 + rng() * 2.5;
        const angle = rng() * Math.PI * 2;
        const y = trunkH * 0.8 + rng() * 2.0;

        sphere.translate(Math.cos(angle) * radius, y, Math.sin(angle) * radius);

        bakeGeo(sphere, new THREE.Vector3(0, 0, 0), new THREE.Euler(rng(), rng(), rng()), new THREE.Vector3(1, 0.7, 1));
        leafGeos.push(sphere);
    }

    return {
        trunkGeo: safeMerge(trunkGeos),
        leavesGeo: safeMerge(leafGeos),
        height: trunkH + 3.0,
        radius: 4.5
    };
};

const generateDeadTreePrototype = (seed: number): TreePrototype => {
    const trunkGeos: THREE.BufferGeometry[] = [];
    let currentSeed = seed;
    const rng = () => {
        const x = Math.sin(currentSeed++) * 10000;
        return x - Math.floor(x);
    };

    // DEAD: Angular, jagged, low-poly
    const trunkH = 3.5 + rng() * 2.5;
    // Use fewer segments (4) for a square/angular look
    const trunk = new THREE.CylinderGeometry(0.15, 0.35, trunkH, 4);
    trunk.translate(0, trunkH / 2, 0);
    const leanX = (rng() - 0.5) * 0.3;
    const leanZ = (rng() - 0.5) * 0.3;
    bakeGeo(trunk, new THREE.Vector3(0, 0, 0), new THREE.Euler(leanX, 0, leanZ), new THREE.Vector3(1, 1, 1));
    trunkGeos.push(trunk);

    // Snapped Top?
    if (rng() > 0.5) {
        // Add a jagged top piece
        const topH = 0.5 + rng() * 0.5;
        const top = new THREE.ConeGeometry(0.15, topH, 3);
        top.translate(0, topH / 2, 0);
        // Place at top of trunk, rotated sharply
        const tx = trunkH * Math.sin(leanZ);
        const tz = trunkH * Math.sin(leanX);
        const snappedRot = new THREE.Euler((rng() - 0.5) * 1.5, rng() * 3, (rng() - 0.5) * 1.5);
        bakeGeo(top, new THREE.Vector3(tx, trunkH, tz), snappedRot, new THREE.Vector3(1, 1, 1));
        trunkGeos.push(top);
    }

    // Angular Branches
    const branches = 2 + Math.floor(rng() * 4);
    for (let i = 0; i < branches; i++) {
        const y = 1.0 + rng() * (trunkH - 1.5);
        const len = 0.8 + rng() * 1.2;
        // 3 segments for triangle branches (sharp)
        const branch = new THREE.CylinderGeometry(0.02, 0.12, len, 3);
        branch.translate(0, len / 2, 0);

        const rotY = rng() * Math.PI * 2;
        const rotZ = Math.PI / 3 + rng() * Math.PI / 4; // Steeper angle

        // Position on trunk
        const bx = y * Math.sin(leanZ);
        const bz = y * Math.sin(leanX);

        bakeGeo(branch, new THREE.Vector3(bx, y, bz), new THREE.Euler(rng() * 0.5, rotY, rotZ), new THREE.Vector3(1, 1, 1));
        trunkGeos.push(branch);
    }

    return {
        trunkGeo: safeMerge(trunkGeos),
        height: trunkH + 1.0,
        radius: 2.0
    };
};

const generateBirchPrototype = (seed: number): TreePrototype => {
    const trunkGeos: THREE.BufferGeometry[] = [];
    const leafGeos: THREE.BufferGeometry[] = [];
    let currentSeed = seed;
    const rng = () => {
        const x = Math.sin(currentSeed++) * 10000;
        return x - Math.floor(x);
    };

    // BIRCH: Slender, white, tall
    const height = 5.0 + rng() * 2.5;
    const trunkRadius = 0.12; // Thinner

    const trunk = new THREE.CylinderGeometry(trunkRadius * 0.6, trunkRadius, height, 5);
    trunk.translate(0, height / 2, 0);
    const leanX = (rng() - 0.5) * 0.2; // More lean
    const leanZ = (rng() - 0.5) * 0.2;
    bakeGeo(trunk, new THREE.Vector3(0, 0, 0), new THREE.Euler(leanX, 0, leanZ), new THREE.Vector3(1, 1, 1));
    trunkGeos.push(trunk);

    // Leaves: Small clumps attached high up
    const clusters = 8 + Math.floor(rng() * 4);
    for (let i = 0; i < clusters; i++) {
        const y = height * 0.5 + rng() * height * 0.5;
        const size = 0.6 + rng() * 0.5; // Smaller clumps
        const sphere = new THREE.IcosahedronGeometry(size, 0);

        const r = 0.4 + rng() * 1.2;
        const a = rng() * Math.PI * 2;

        // Position relative to lean
        const lx = y * Math.sin(leanZ);
        const lz = y * Math.sin(leanX);

        bakeGeo(sphere, new THREE.Vector3(lx + Math.cos(a) * r, y, lz + Math.sin(a) * r), new THREE.Euler(rng(), rng(), rng()), new THREE.Vector3(1, 0.8, 1));
        leafGeos.push(sphere);
    }

    return {
        trunkGeo: safeMerge(trunkGeos),
        leavesGeo: safeMerge(leafGeos),
        height,
        radius: 2.5
    };
};

// --- MAIN GENERATOR CLASS ---

export const EnvironmentGenerator = {

    initNaturePrototypes: async (yieldToMain?: () => Promise<void>) => {
        const VARIANTS = 3;
        for (let i = 0; i < VARIANTS; i++) {
            if (!prototypes[`PINE_${i}`]) prototypes[`PINE_${i}`] = generatePinePrototype(i);
            if (!prototypes[`SPRUCE_${i}`]) prototypes[`SPRUCE_${i}`] = generateSprucePrototype(i);
            if (!prototypes[`OAK_${i}`]) prototypes[`OAK_${i}`] = generateOakPrototype(i);
            if (!prototypes[`BIRCH_${i}`]) prototypes[`BIRCH_${i}`] = generateBirchPrototype(i);
            if (!prototypes[`DEAD_${i}`]) prototypes[`DEAD_${i}`] = generateDeadTreePrototype(i);
            if (yieldToMain && i % 2 === 0) await yieldToMain();
        }
    },

    // Support legacy call with alias if needed, or simply let AssetPreloader call initNaturePrototypes
    // For safety, we can adding initPrototypes as an alias:
    initPrototypes: async (yieldToMain?: () => Promise<void>) => {
        return EnvironmentGenerator.initNaturePrototypes(yieldToMain);
    },

    createRock: (width: number, height: number, sharpness: number = 0.5) => {
        const group = new THREE.Group();
        const mat = MATERIALS.stone;

        // Main bulk
        const r = width * 0.4;
        const geo = new THREE.DodecahedronGeometry(r, 0); // Low poly

        // Randomize shape via scale
        const sx = 1.0 + (Math.random() - 0.5) * 0.4;
        const sz = 1.0 + (Math.random() - 0.5) * 0.4;
        const sy = (height / width) * (1.0 + (Math.random() - 0.5) * 0.4);

        const mesh = new THREE.Mesh(geo, mat);
        mesh.scale.set(sx, sy, sz);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Random rotation
        mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        group.add(mesh);

        // Add 1-2 smaller chunks for detail
        if (Math.random() > 0.3) {
            const sub = new THREE.Mesh(geo, mat);
            sub.scale.set(sx * 0.5, sy * 0.5, sz * 0.5);
            sub.position.set((Math.random() - 0.5) * r, -r * 0.2, (Math.random() - 0.5) * r);
            sub.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
            sub.castShadow = true;
            sub.receiveShadow = true;
            group.add(sub);
        }

        group.userData.material = 'STONE';
        return group;
    },

    createTree: (type: 'PINE' | 'SPRUCE' | 'OAK' | 'DEAD' | 'BIRCH' = 'PINE', scale: number = 1.0, variant: number = 0): THREE.Group => {
        const group = new THREE.Group();
        const key = `${type}_${variant % 3}`;
        const proto = prototypes[key] || prototypes[`${type}_0`] || prototypes['PINE_0'];

        if (!proto) return group;

        let trunkMat = MATERIALS.treeTrunk;
        if (type === 'OAK') trunkMat = MATERIALS.treeTrunkOak;
        else if (type === 'BIRCH') trunkMat = MATERIALS.treeTrunkBirch;
        else if (type === 'DEAD') trunkMat = MATERIALS.deadWood;

        const trunk = new THREE.Mesh(proto.trunkGeo, trunkMat);
        trunk.castShadow = true; trunk.receiveShadow = true;
        group.add(trunk);

        if (proto.leavesGeo) {
            let mat = MATERIALS.treeFirNeedles;
            if (type === 'OAK') mat = MATERIALS.treeLeavesOak;
            else if (type === 'BIRCH') mat = MATERIALS.treeLeavesBirch;

            const leaves = new THREE.Mesh(proto.leavesGeo, mat);
            leaves.castShadow = true; leaves.receiveShadow = true;
            leaves.customDepthMaterial = new THREE.MeshDepthMaterial({
                depthPacking: THREE.RGBADepthPacking,
                map: (mat as any).map,
                alphaTest: (mat as any).alphaTest
            });
            group.add(leaves);
        }

        if (proto.snowGeo) {
            const snow = new THREE.Mesh(proto.snowGeo, MATERIALS.snow);
            snow.castShadow = true;
            group.add(snow);
        }

        group.scale.setScalar(scale);
        return group;
    },

    addInstancedTrees: (ctx: SectorContext | { scene: THREE.Scene, uniqueMeshes?: any[] }, typeKey: string, matrices: THREE.Matrix4[], materialOverride?: THREE.Material) => {
        if (matrices.length === 0) return;

        const proto = prototypes[typeKey];
        if (!proto) return;

        const baseType = typeKey.split('_')[0];
        let trunkMat = materialOverride || MATERIALS.treeTrunk;
        let leavesMat = materialOverride || MATERIALS.treeFirNeedles;

        if (!materialOverride) {
            if (baseType === 'OAK') { trunkMat = MATERIALS.treeTrunkOak; leavesMat = MATERIALS.treeLeavesOak; }
            else if (baseType === 'BIRCH') { trunkMat = MATERIALS.treeTrunkBirch; leavesMat = MATERIALS.treeLeavesBirch; }
            else if (baseType === 'DEAD') { trunkMat = MATERIALS.deadWood; }
        }

        const trunkMesh = new THREE.InstancedMesh(proto.trunkGeo, trunkMat, matrices.length);
        trunkMesh.castShadow = !materialOverride; // Disable shadows for silhouettes (assimilated from CampWorld logic)
        trunkMesh.receiveShadow = !materialOverride;

        let leavesMesh: THREE.InstancedMesh | undefined;
        if (proto.leavesGeo) {
            leavesMesh = new THREE.InstancedMesh(proto.leavesGeo, leavesMat, matrices.length);
            leavesMesh.castShadow = !materialOverride;
            leavesMesh.receiveShadow = !materialOverride;

            if (!materialOverride) {
                leavesMesh.customDepthMaterial = new THREE.MeshDepthMaterial({
                    depthPacking: THREE.RGBADepthPacking,
                    map: (leavesMat as any).map,
                    alphaTest: (leavesMat as any).alphaTest
                });
                let snowMesh: THREE.InstancedMesh | undefined;
                if (proto.snowGeo && !materialOverride) { // No snow on silhouettes
                    snowMesh = new THREE.InstancedMesh(proto.snowGeo, MATERIALS.snow, matrices.length);
                    snowMesh.castShadow = true;
                }

                for (let i = 0; i < matrices.length; i++) {
                    trunkMesh.setMatrixAt(i, matrices[i]);
                    if (leavesMesh) leavesMesh.setMatrixAt(i, matrices[i]);
                    if (snowMesh) snowMesh.setMatrixAt(i, matrices[i]);
                }

                trunkMesh.instanceMatrix.needsUpdate = true;
                if (leavesMesh) leavesMesh.instanceMatrix.needsUpdate = true;
                if (snowMesh) snowMesh.instanceMatrix.needsUpdate = true;

                if (!ctx.uniqueMeshes) (ctx as any).uniqueMeshes = [];
                ctx.scene.add(trunkMesh);
                if (leavesMesh) ctx.scene.add(leavesMesh);
                if (snowMesh) ctx.scene.add(snowMesh);
            }
        }
    },

    addInstancedGrass: (ctx: SectorContext, matrices: THREE.Matrix4[], isFlower: boolean = false, scaleY: number = 1.0) => {
        if (matrices.length === 0) return;

        const w = 0.8; const h = 0.8 * scaleY;
        const plane1 = new THREE.PlaneGeometry(w, h);
        plane1.translate(0, h / 2, 0);
        const plane2 = plane1.clone();
        plane2.rotateY(Math.PI / 2);
        const plane3 = plane1.clone();
        plane3.rotateY(Math.PI / 4);
        const plane4 = plane1.clone();
        plane4.rotateY(-Math.PI / 4);

        const geo = safeMerge([plane1, plane2, plane3, plane4]);
        const mat = isFlower ? MATERIALS.flower : MATERIALS.grass;

        const mesh = new THREE.InstancedMesh(geo, mat, matrices.length);
        mesh.receiveShadow = true;
        mesh.castShadow = false; // Explicitly disable shadows for grass/flowers

        for (let i = 0; i < matrices.length; i++) {
            mesh.setMatrixAt(i, matrices[i]);
        }
        mesh.instanceMatrix.needsUpdate = true;
        ctx.scene.add(mesh);
    },

    /**
     * Mixed usage createForest
     * Supports both Rect Area and Polygon (via overloading checks)
     */
    createForest: (ctx: SectorContext,
        region: { x: number, z: number, w: number, d: number } | THREE.Vector3[],
        countOrSpacing: number,
        type: string | string[] = 'PINE') => {

        // Check if region is Polygon (Array)
        if (Array.isArray(region)) {
            // Redirect to Polygon implementation
            EnvironmentGenerator.createForestFromPolygon(ctx, region, countOrSpacing, type as string | string[]);
            return;
        }

        // Rect Area implementation
        const area = region as { x: number, z: number, w: number, d: number };
        const count = countOrSpacing; // In this case it's count

        const matrixBuckets: Record<string, THREE.Matrix4[]> = {};
        const dummy = new THREE.Object3D();

        for (let i = 0; i < count; i++) {
            const x = area.x + (Math.random() - 0.5) * area.w;
            const z = area.z + (Math.random() - 0.5) * area.d;

            const scale = 0.8 + Math.random() * 0.6;
            dummy.position.set(x, 0, z);
            dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);

            // Random lean
            const leanX = (Math.random() - 0.5) * 0.1;
            const leanZ = (Math.random() - 0.5) * 0.1;
            dummy.rotateX(leanX);
            dummy.rotateZ(leanZ);

            dummy.scale.setScalar(scale);
            dummy.updateMatrix();

            // Pick type if array
            let selectedType = type;
            if (Array.isArray(type)) {
                selectedType = type[Math.floor(Math.random() * type.length)];
            }
            if (selectedType === 'random') selectedType = ['PINE', 'OAK', 'DEAD', 'BIRCH'][Math.floor(Math.random() * 4)];

            const variant = i % 3;
            // Ensure selectedType is a string
            if (typeof selectedType !== 'string') selectedType = 'PINE';

            const key = `${selectedType}_${variant}`;

            if (!matrixBuckets[key]) matrixBuckets[key] = [];
            matrixBuckets[key].push(dummy.matrix.clone());

            SectorGenerator.addObstacle(ctx, {
                position: new THREE.Vector3(x, 0, z),
                quaternion: new THREE.Quaternion(),
                collider: { type: 'cylinder', radius: 0.5 * scale, height: 4 },
                id: `tree_${i}`
            });
        }

        for (const key in matrixBuckets) {
            EnvironmentGenerator.addInstancedTrees(ctx, key, matrixBuckets[key]);
        }
    },

    createForestFromPolygon: (ctx: SectorContext, polygon: THREE.Vector3[], spacing: number = 8, type: string | string[] = 'PINE') => {
        if (!polygon || polygon.length < 3) return;

        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        polygon.forEach(p => {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.z < minZ) minZ = p.z;
            if (p.z > maxZ) maxZ = p.z;
        });

        const width = maxX - minX;
        const depth = maxZ - minZ;
        const area = width * depth;
        const count = Math.floor(area / (spacing * spacing));

        const matrixBuckets: Record<string, THREE.Matrix4[]> = {};
        const dummy = new THREE.Object3D();

        for (let i = 0; i < count; i++) {
            const x = minX + Math.random() * width;
            const z = minZ + Math.random() * depth;

            if (isPointInPolygon(new THREE.Vector3(x, 0, z), polygon)) {
                const scale = 0.8 + Math.random() * 0.6;
                dummy.position.set(x, 0, z);
                dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);

                // Lean
                dummy.rotateX((Math.random() - 0.5) * 0.1);
                dummy.rotateZ((Math.random() - 0.5) * 0.1);

                dummy.scale.setScalar(scale);
                dummy.updateMatrix();

                let selectedType = type;
                if (Array.isArray(type)) {
                    selectedType = type[Math.floor(Math.random() * type.length)];
                }
                if (selectedType === 'random') selectedType = ['PINE', 'OAK', 'DEAD', 'BIRCH'][Math.floor(Math.random() * 4)];

                const variant = i % 3;
                // Ensure selectedType is a string
                if (typeof selectedType !== 'string') selectedType = 'PINE';

                const key = `${selectedType}_${variant}`;

                if (!matrixBuckets[key]) matrixBuckets[key] = [];
                matrixBuckets[key].push(dummy.matrix.clone());

                SectorGenerator.addObstacle(ctx, {
                    position: new THREE.Vector3(x, 0, z),
                    quaternion: new THREE.Quaternion(),
                    collider: { type: 'cylinder', radius: 0.5 * scale, height: 4 },
                    id: `tree_poly_${i}`
                });
            }
        }

        for (const key in matrixBuckets) {
            EnvironmentGenerator.addInstancedTrees(ctx, key, matrixBuckets[key]);
        }
    },

    fillWheatField: (ctx: SectorContext, polygon: THREE.Vector3[], density: number = 0.5) => {
        if (!polygon || polygon.length < 3) return;

        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        polygon.forEach(p => {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.z < minZ) minZ = p.z;
            if (p.z > maxZ) maxZ = p.z;
        });

        const w = maxX - minX;
        const d = maxZ - minZ;
        const count = Math.floor(w * d * 0.5 * density);

        const matrices: THREE.Matrix4[] = [];
        const dummy = new THREE.Object3D();

        for (let i = 0; i < count; i++) {
            const x = minX + Math.random() * w;
            const z = minZ + Math.random() * d;

            if (isPointInPolygon(new THREE.Vector3(x, 0, z), polygon)) {
                dummy.position.set(x, 0, z);
                dummy.scale.set(1, 1.5 + Math.random(), 1);
                dummy.rotation.y = Math.random() * Math.PI;
                dummy.updateMatrix();
                matrices.push(dummy.matrix.clone());
            }
        }

        EnvironmentGenerator.addInstancedGrass(ctx, matrices, false, 1.5);
    },

    createDeadTree: (variant: 'standing' | 'fallen' = 'standing', scale: number = 1.0): THREE.Group => {
        const tree = EnvironmentGenerator.createTree('DEAD', scale, Math.floor(Math.random() * 3));
        if (variant === 'fallen') {
            tree.rotation.z = Math.PI / 2 + (Math.random() - 0.5) * 0.5;
            tree.position.y = 0.5 * scale;
        }
        return tree;
    },

    createDeforestation: (ctx: SectorContext, x: number, z: number, w: number, d: number, count: number) => {
        for (let i = 0; i < count; i++) {
            const tx = x + (Math.random() - 0.5) * w;
            const tz = z + (Math.random() - 0.5) * d;

            const isFallen = Math.random() > 0.3;
            const tree = EnvironmentGenerator.createDeadTree(isFallen ? 'fallen' : 'standing', 0.8 + Math.random() * 0.5);
            tree.position.set(tx, 0, tz);
            tree.rotation.y = Math.random() * Math.PI * 2;

            ctx.scene.add(tree);

            // Add collider for standing trees only (fallen usually low enough to walk over or separate handling)
            if (!isFallen) {
                SectorGenerator.addObstacle(ctx, {
                    position: new THREE.Vector3(tx, 0, tz),
                    collider: { type: 'cylinder', radius: 0.4, height: 4 }
                });
            }
        }

        // Add scattered debris/logs
        EnvironmentGenerator.fillArea(ctx, { x, z }, { width: w, height: d }, 15, 'debris');
    },

    fillAreaWithFlowers: (ctx: SectorContext,
        region: { x: number, z: number, w: number, d: number } | THREE.Vector3[],
        countOrDensity: number) => {
        let area: { x: number, z: number, w: number, d: number };
        let count = 0;

        if (Array.isArray(region)) {
            // Polygon - calc bounds
            let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
            region.forEach(p => {
                if (p.x < minX) minX = p.x;
                if (p.x > maxX) maxX = p.x;
                if (p.z < minZ) minZ = p.z;
                if (p.z > maxZ) maxZ = p.z;
            });
            const w = maxX - minX;
            const d = maxZ - minZ;
            count = Math.floor(w * d * countOrDensity); // Treat as density for poly
            area = { x: minX, z: minZ, w, d };
        } else {
            area = region;
            count = countOrDensity; // Treat as absolute count for rect
        }

        const matrices: THREE.Matrix4[] = [];
        const dummy = new THREE.Object3D();

        for (let i = 0; i < count; i++) {
            const x = area.x + Math.random() * area.w;
            const z = area.z + Math.random() * area.d;

            if (Array.isArray(region)) {
                if (!isPointInPolygon(new THREE.Vector3(x, 0, z), region)) continue;
            }

            dummy.position.set(x, 0, z);
            dummy.rotation.y = Math.random() * Math.PI * 2;
            dummy.scale.setScalar(0.8 + Math.random() * 0.5);
            dummy.updateMatrix();
            matrices.push(dummy.matrix.clone());
        }

        EnvironmentGenerator.addInstancedGrass(ctx, matrices, true);
    },

    fillAreaWithGrass: (ctx: SectorContext, region: { x: number, z: number, w: number, d: number } | THREE.Vector3[], density: number = 2.0) => {
        // Wrapper for legacy or simple grass filling
        EnvironmentGenerator.fillAreaWithFlowers(ctx, region, density);
        // Note: fillAreaWithFlowers actually adds grass too, but we can specialize if needed.
        // For now, mapping to the same logic but maybe different internal flag if we want just grass?
        // Let's copy the logic but set isFlower=false explicitly for all

        let area: { x: number, z: number, w: number, d: number };
        let count = 0;
        if (Array.isArray(region)) {
            let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
            region.forEach(p => {
                if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
                if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
            });
            count = Math.floor((maxX - minX) * (maxZ - minZ) * density);
            area = { x: minX, z: minZ, w: maxX - minX, d: maxZ - minZ };
        } else {
            area = region;
            count = Math.floor(area.w * area.d * density);
        }

        const matrices: THREE.Matrix4[] = [];
        const dummy = new THREE.Object3D();
        for (let i = 0; i < count; i++) {
            const x = area.x + Math.random() * area.w;
            const z = area.z + Math.random() * area.d;
            if (Array.isArray(region) && !isPointInPolygon(new THREE.Vector3(x, 0, z), region)) continue;

            dummy.position.set(x, 0, z);
            dummy.rotation.y = Math.random() * Math.PI * 2;
            dummy.scale.setScalar(0.8 + Math.random() * 0.5);
            dummy.updateMatrix();
            matrices.push(dummy.matrix.clone());
        }
        EnvironmentGenerator.addInstancedGrass(ctx, matrices, false);
    },

    /**
     * Legacy compatible fillArea with overload support
     */
    fillArea: (ctx: SectorContext,
        centerOrArea: { x: number, z: number, w?: number, d?: number },
        sizeOrDensity: { width: number, height: number } | number,
        count?: number,
        type: 'tree' | 'rock' | 'debris' | 'grass' = 'tree',
        avoidCenterRadius: number = 0,
        exclusionZones: { pos: THREE.Vector3, radius: number }[] = []) => {

        // Check for new signature: (ctx, area{x,z,w,d}, density)
        if ((centerOrArea as any).w !== undefined && typeof sizeOrDensity === 'number' && count === undefined) {
            const area = centerOrArea as { x: number, z: number, w: number, d: number };
            const density = sizeOrDensity as number; // It's density in new sig

            // Reuse existing logic (with default PINE/OAK mix?)
            const treeCount = Math.floor(area.w * area.d * 0.01 * density);
            EnvironmentGenerator.createForest(ctx, area, treeCount, 'PINE');

            // Grass impl...
            const grassCount = Math.floor(area.w * area.d * 0.1 * density);
            const grassMatrices: THREE.Matrix4[] = [];
            const flowerMatrices: THREE.Matrix4[] = [];
            const dummy = new THREE.Object3D();
            for (let i = 0; i < grassCount; i++) {
                const x = area.x + (Math.random() - 0.5) * area.w;
                const z = area.z + (Math.random() - 0.5) * area.d;
                dummy.position.set(x, 0, z);
                dummy.scale.setScalar(0.8 + Math.random() * 0.5);
                dummy.rotation.y = Math.random() * Math.PI;
                dummy.updateMatrix();
                if (Math.random() > 0.9) flowerMatrices.push(dummy.matrix.clone());
                else grassMatrices.push(dummy.matrix.clone());
            }
            EnvironmentGenerator.addInstancedGrass(ctx, grassMatrices, false);
            EnvironmentGenerator.addInstancedGrass(ctx, flowerMatrices, true);
            return;
        }

        // Legacy Signature
        const center = centerOrArea as { x: number, z: number };
        let w = 0, d = 0;
        if (typeof sizeOrDensity === 'number') { w = sizeOrDensity; d = sizeOrDensity; }
        else { w = sizeOrDensity.width; d = sizeOrDensity.height; }

        const area = { x: center.x, z: center.z, w, d };
        const numItems = count || 20;

        if (type === 'tree') {
            EnvironmentGenerator.createForest(ctx, area, numItems, 'PINE');
        } else if (type === 'rock') {
            // Placeholder Rock Gen
            for (let i = 0; i < numItems; i++) {
                const x = area.x + (Math.random() - 0.5) * area.w;
                const z = area.z + (Math.random() - 0.5) * area.d;

                // Simple Check
                if (avoidCenterRadius > 0 && Math.hypot(x - center.x, z - center.z) < avoidCenterRadius) continue;

                const s = 0.5 + Math.random() * 1.5;
                const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), MATERIALS.stone);
                rock.position.set(x, s / 2, z);
                rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
                rock.castShadow = true;
                rock.receiveShadow = true;
                ctx.scene.add(rock);

                SectorGenerator.addObstacle(ctx, {
                    position: rock.position,
                    collider: { type: 'sphere', radius: s }
                });
            }
        } else if (type === 'debris') {
            // Placeholder Debris
            for (let i = 0; i < numItems; i++) {
                const x = area.x + (Math.random() - 0.5) * area.w;
                const z = area.z + (Math.random() - 0.5) * area.d;
                if (avoidCenterRadius > 0 && Math.hypot(x - center.x, z - center.z) < avoidCenterRadius) continue;

                // Simple Plank
                const plank = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 0.3), MATERIALS.deadWood);
                plank.position.set(x, 0.05, z);
                plank.rotation.y = Math.random() * Math.PI;
                ctx.scene.add(plank);
            }
        }
    }
};

// Initialize prototypes
EnvironmentGenerator.initNaturePrototypes();