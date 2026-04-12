import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MATERIALS, getTreeDepthMaterial } from '../../../utils/assets/materials';
import { SectorContext } from '../../../game/session/SectorTypes';
import { SectorBuilder } from '../SectorBuilder';
import { VEGETATION_TYPE } from '../../../content/environment';
import { MaterialType } from '../../../content/environment';
import { GeneratorUtils } from './GeneratorUtils';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _matrix = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _euler = new THREE.Euler();
const _mat = new THREE.Matrix4();
const PI2 = Math.PI * 2;

// --- TYPES ---
interface TreePrototype {
    trunkGeo: THREE.BufferGeometry;
    leavesGeo?: THREE.BufferGeometry;
    snowGeo?: THREE.BufferGeometry;
    height: number;
    radius: number;
}

// Module-level storage for prototypes
const prototypes: Record<string, TreePrototype> = {};

// --- ZERO-GC CACHES ---
const _createCrossGeo = () => {
    const plane = new THREE.PlaneGeometry(1, 1);
    plane.translate(0, 0.5, 0); // Origin at bottom
    const p1 = plane.clone();
    const p2 = plane.clone().rotateY(Math.PI / 2);
    const p3 = plane.clone().rotateY(Math.PI / 4);
    const p4 = plane.clone().rotateY(-Math.PI / 4);
    const merged = BufferGeometryUtils.mergeGeometries([p1, p2, p3, p4]);

    // Cleanup temporary geometries
    p1.dispose(); p2.dispose(); p3.dispose(); p4.dispose(); plane.dispose();

    return merged ? merged : new THREE.BufferGeometry();
};

// Narrow, short cross-billboard for grass tufts (distinct from wide wheat stalks)
const _createGrassTuftGeo = () => {
    const plane = new THREE.PlaneGeometry(0.3, 0.7);
    plane.translate(0, 0.35, 0);
    const p1 = plane.clone();
    const p2 = plane.clone().rotateY(Math.PI / 2);
    const p3 = plane.clone().rotateY(Math.PI / 4);
    const merged = BufferGeometryUtils.mergeGeometries([p1, p2, p3]);
    p1.dispose(); p2.dispose(); p3.dispose(); plane.dispose();
    return merged ? merged : new THREE.BufferGeometry();
};

const SHARED_GEO = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cylinder: new THREE.CylinderGeometry(1, 1, 2, 8),
    plane: new THREE.PlaneGeometry(1, 1),
    grass: _createCrossGeo(),
    grassTuft: _createGrassTuftGeo(),
    sunflowerStem: new THREE.CylinderGeometry(0.05, 0.05, 3.0, 4).translate(0, 1.5, 0),
    sunflowerHead: new THREE.SphereGeometry(0.4, 8, 8).scale(1, 1, 0.2).translate(0, 3.0, 0.05),
    sunflowerCenter: new THREE.CylinderGeometry(0.2, 0.2, 0.1, 8).rotateX(Math.PI / 2).translate(0, 3.0, 0.1),
    lilyPad: new THREE.CylinderGeometry(0.5, 0.5, 0.05, 8).scale(1, 1, 0.8),
    lilyStem: new THREE.CylinderGeometry(0.03, 0.03, 1.5, 4).translate(0, -0.75, 0),
    lilyFlower: new THREE.ConeGeometry(0.15, 0.2, 5),
    seaweed: new THREE.PlaneGeometry(0.3, 3.0, 2, 4).translate(0, 1.5, 0)
};


// --- HELPERS ---
const safeMerge = (geos: THREE.BufferGeometry[]): THREE.BufferGeometry => {
    if (geos.length === 0) return new THREE.BufferGeometry();
    const merged = BufferGeometryUtils.mergeGeometries(geos);

    // VINTERDÖD OPTIMIZATION: Destroy the individual parts to free up RAM!
    for (let i = 0; i < geos.length; i++) {
        geos[i].dispose();
    }

    if (!merged) return new THREE.BufferGeometry();
    return merged;
};

const bakeGeo = (geo: THREE.BufferGeometry, pos: THREE.Vector3, rot: THREE.Euler, scale: THREE.Vector3) => {
    _quat.setFromEuler(rot);
    _matrix.compose(pos, _quat, scale);
    geo.applyMatrix4(_matrix);
    return geo;
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

    const trunkH = 4.5 + rng() * 2.0;
    const trunkGeo = new THREE.CylinderGeometry(0.2, 0.45, trunkH, 7);
    trunkGeo.translate(0, trunkH / 2, 0);
    const leanX = (rng() - 0.5) * 0.2;
    const leanZ = (rng() - 0.5) * 0.2;
    bakeGeo(trunkGeo, new THREE.Vector3(0, 0, 0), new THREE.Euler(leanX, 0, leanZ), new THREE.Vector3(1, 1, 1));
    trunkGeos.push(trunkGeo);

    const layers = 4 + Math.floor(rng() * 3);
    let y = trunkH * 0.7;
    let r = 2.5 + rng() * 1.0;

    for (let i = 0; i < layers; i++) {
        const h = 1.5 + rng() * 1.0;
        const nextR = r * 0.65;

        const cone = new THREE.ConeGeometry(r, h, 7);
        cone.translate(0, h / 2, 0);

        const layerRot = new THREE.Euler((rng() - 0.5) * 0.3 + leanX, 0, (rng() - 0.5) * 0.3 + leanZ);
        const layerPos = new THREE.Vector3(0, y, 0);

        leafGeos.push(bakeGeo(cone, layerPos, layerRot, new THREE.Vector3(1, 1, 1))); // No clone needed, bake mutates

        if (hasSnow) {
            const snow = new THREE.ConeGeometry(r * 0.9, h * 0.4, 7);
            snow.translate(0, h * 0.3, 0);
            snowGeos.push(bakeGeo(snow, layerPos, layerRot, new THREE.Vector3(1, 1, 1)));
        }

        y += h * 0.5;
        r = nextR;
    }

    const topH = 2.0;
    const top = new THREE.ConeGeometry(r, topH, 6);
    top.translate(0, topH / 2, 0);
    leafGeos.push(bakeGeo(top, new THREE.Vector3(0, y, 0), new THREE.Euler(leanX, 0, leanZ), new THREE.Vector3(1, 1, 1)));

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

    const trunkH = 4.0 + rng() * 2.0;
    const trunkGeo = new THREE.CylinderGeometry(0.3, 0.7, trunkH, 7);
    trunkGeo.translate(0, trunkH / 2, 0);
    const leanX = (rng() - 0.5) * 0.1;
    const leanZ = (rng() - 0.5) * 0.1;
    bakeGeo(trunkGeo, new THREE.Vector3(0, 0, 0), new THREE.Euler(leanX, 0, leanZ), new THREE.Vector3(1, 1, 1));
    trunkGeos.push(trunkGeo);

    const layers = 10 + Math.floor(rng() * 5);
    let y = 0.5;
    let r = 3.5 + rng() * 1.0;

    for (let i = 0; i < layers; i++) {
        const h = 1.0 + rng() * 0.5;
        const nextR = r * 0.85;

        const cone = new THREE.ConeGeometry(r, h, 8);
        cone.translate(0, h / 2, 0);

        const layerRot = new THREE.Euler((rng() - 0.5) * 0.1 + leanX, 0, (rng() - 0.5) * 0.1 + leanZ);
        const layerPos = new THREE.Vector3(0, y, 0);

        leafGeos.push(bakeGeo(cone, layerPos, layerRot, new THREE.Vector3(1, 1, 1)));

        if (hasSnow) {
            const snow = new THREE.ConeGeometry(r * 0.95, h * 0.4, 8);
            snow.translate(0, h * 0.35, 0);
            snowGeos.push(bakeGeo(snow, layerPos, layerRot, new THREE.Vector3(1, 1, 1)));
        }

        y += h * 0.55;
        r = nextR;
    }

    const topH = 1.5;
    const top = new THREE.ConeGeometry(r, topH, 6);
    top.translate(0, topH / 2, 0);
    leafGeos.push(bakeGeo(top, new THREE.Vector3(0, y, 0), new THREE.Euler(leanX, 0, leanZ), new THREE.Vector3(1, 1, 1)));

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

    const trunkH = 2.5 + rng() * 0.8;
    const trunkGeo = new THREE.CylinderGeometry(0.5, 0.8, trunkH, 7);
    trunkGeo.translate(0, trunkH / 2, 0);
    bakeGeo(trunkGeo, new THREE.Vector3(0, 0, 0), new THREE.Euler((rng() - 0.5) * 0.3, 0, (rng() - 0.5) * 0.3), new THREE.Vector3(1, 1, 1));
    trunkGeos.push(trunkGeo);

    const clusters = 12 + Math.floor(rng() * 6);
    for (let i = 0; i < clusters; i++) {
        const size = 1.8 + rng() * 1.2;
        const sphere = new THREE.DodecahedronGeometry(size, 0);

        const radius = 1.5 + rng() * 2.5;
        const angle = rng() * PI2;
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

    const trunkH = 3.5 + rng() * 2.5;
    const trunk = new THREE.CylinderGeometry(0.15, 0.35, trunkH, 4);
    trunk.translate(0, trunkH / 2, 0);
    const leanX = (rng() - 0.5) * 0.3;
    const leanZ = (rng() - 0.5) * 0.3;
    bakeGeo(trunk, new THREE.Vector3(0, 0, 0), new THREE.Euler(leanX, 0, leanZ), new THREE.Vector3(1, 1, 1));
    trunkGeos.push(trunk);

    if (rng() > 0.5) {
        const topH = 0.5 + rng() * 0.5;
        const top = new THREE.ConeGeometry(0.15, topH, 3);
        top.translate(0, topH / 2, 0);
        const tx = trunkH * Math.sin(leanZ);
        const tz = trunkH * Math.sin(leanX);
        const snappedRot = new THREE.Euler((rng() - 0.5) * 1.5, rng() * 3, (rng() - 0.5) * 1.5);
        bakeGeo(top, new THREE.Vector3(tx, trunkH, tz), snappedRot, new THREE.Vector3(1, 1, 1));
        trunkGeos.push(top);
    }

    const branches = 2 + Math.floor(rng() * 4);
    for (let i = 0; i < branches; i++) {
        const y = 1.0 + rng() * (trunkH - 1.5);
        const len = 0.8 + rng() * 1.2;
        const branch = new THREE.CylinderGeometry(0.02, 0.12, len, 3);
        branch.translate(0, len / 2, 0);

        const rotY = rng() * PI2;
        const rotZ = Math.PI / 3 + rng() * Math.PI / 4;

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

    const height = 5.0 + rng() * 2.5;
    const trunkRadius = 0.12;

    const trunk = new THREE.CylinderGeometry(trunkRadius * 0.6, trunkRadius, height, 5);
    trunk.translate(0, height / 2, 0);
    const leanX = (rng() - 0.5) * 0.2;
    const leanZ = (rng() - 0.5) * 0.2;
    bakeGeo(trunk, new THREE.Vector3(0, 0, 0), new THREE.Euler(leanX, 0, leanZ), new THREE.Vector3(1, 1, 1));
    trunkGeos.push(trunk);

    const clusters = 8 + Math.floor(rng() * 4);
    for (let i = 0; i < clusters; i++) {
        const y = height * 0.5 + rng() * height * 0.5;
        const size = 0.6 + rng() * 0.5;
        const sphere = new THREE.IcosahedronGeometry(size, 0);

        const r = 0.4 + rng() * 1.2;
        const a = rng() * PI2;

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

// --- PRIVATE FILL HELPERS (Zero-GC module helpers, not exported) ---

type Region = THREE.Vector3[] | { x: number, z: number, w: number, d: number };

const _getBounds = (region: Region) => {
    if (Array.isArray(region)) {
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (let i = 0; i < region.length; i++) {
            const p = region[i];
            if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
            if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
        }
        return { x: minX, z: minZ, w: maxX - minX, d: maxZ - minZ };
    }
    return region;
};

const _placeTrees = (ctx: SectorContext, region: Region, spacing: number, types: VEGETATION_TYPE[]) => {
    const bounds = _getBounds(region);
    const count = Math.floor((bounds.w * bounds.d) / (spacing * spacing));
    const matrixBuckets: Record<string, THREE.Matrix4[]> = {};
    const rand = () => Math.random();
    const isPolygon = Array.isArray(region);

    for (let i = 0; i < count; i++) {
        const x = bounds.x + rand() * bounds.w;
        const z = bounds.z + rand() * bounds.d;

        if (isPolygon && !GeneratorUtils.isPointInPolygon(x, z, region as THREE.Vector3[])) continue;

        const scale = 0.8 + rand() * 0.6;
        const leanX = (rand() - 0.5) * 0.1, leanZ = (rand() - 0.5) * 0.1;
        _pos.set(x, 0, z);
        _euler.set(leanX, rand() * PI2, leanZ);
        _quat.setFromEuler(_euler);
        _scale.setScalar(scale);
        _mat.compose(_pos, _quat, _scale);
        const mat = _mat.clone();

        const selectedType = types.length === 1 ? types[0] : types[Math.floor(rand() * types.length)];
        const key = `${selectedType}_${i % 3}`;
        if (!matrixBuckets[key]) matrixBuckets[key] = [];
        matrixBuckets[key].push(mat);

        SectorBuilder.addObstacle(ctx, {
            position: new THREE.Vector3(x, 0, z),
            quaternion: new THREE.Quaternion(),
            collider: { type: 'cylinder', radius: 0.5 * scale, height: 4 },
            id: `tree_fill_${i}`,
            materialId: MaterialType.WOOD
        });
    }

    for (const key in matrixBuckets) {
        VegetationGenerator.addInstancedTrees(ctx, key, matrixBuckets[key]);
    }
};

/** Generic instanced ground-cover (wheat, grass, flower, bush) */
const _placeGroundCover = (
    ctx: SectorContext,
    region: Region,
    density: number,
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    tallScale: boolean     // wheat grows tall (y varies 1.5–2.5), grass/flower stays uniform
) => {
    const bounds = _getBounds(region);
    const count = Math.floor(bounds.w * bounds.d * density);
    if (count <= 0) return;

    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.receiveShadow = true;

    const rand = () => Math.random();
    const isPolygon = Array.isArray(region);
    let valid = 0;

    for (let i = 0; i < count; i++) {
        const x = bounds.x + rand() * bounds.w;
        const z = bounds.z + rand() * bounds.d;
        if (isPolygon && !GeneratorUtils.isPointInPolygon(x, z, region as THREE.Vector3[])) continue;

        _pos.set(x, 0, z);
        _euler.set(0, rand() * PI2, 0);
        _quat.setFromEuler(_euler);
        if (tallScale) {
            _scale.set(1, 1.5 + rand(), 1);
        } else {
            _scale.setScalar(0.7 + rand() * 0.6);
        }
        _mat.compose(_pos, _quat, _scale);
        mesh.setMatrixAt(valid++, _mat);

        // VINTERDÖD: Register foliage presence with larger radius for consistent audio coverage
        ctx.collisionGrid.registerVegetation(x, z, 1.2, MaterialType.PLANT);
    }

    mesh.count = valid;
    mesh.instanceMatrix.needsUpdate = true;
    GeneratorUtils.freezeStatic(mesh);
    ctx.scene.add(mesh);
};

/** Three-part sunflower (stem + head + center) InstancedMesh */
const _placeSunflowers = (ctx: SectorContext, region: Region, density: number) => {
    const bounds = _getBounds(region);
    const count = Math.floor(bounds.w * bounds.d * density);
    if (count <= 0) return;

    const sStem = new THREE.InstancedMesh(SHARED_GEO.sunflowerStem, MATERIALS.sunflowerStem, count);
    const sHead = new THREE.InstancedMesh(SHARED_GEO.sunflowerHead, MATERIALS.sunflowerHead, count);
    const sCent = new THREE.InstancedMesh(SHARED_GEO.sunflowerCenter, MATERIALS.sunflowerCenter, count);
    for (const m of [sStem, sHead, sCent]) {
        m.userData.windAffected = true;
        GeneratorUtils.freezeStatic(m);
    }

    const rand = () => Math.random();
    const isPolygon = Array.isArray(region);
    let valid = 0;

    for (let i = 0; i < count; i++) {
        const x = bounds.x + rand() * bounds.w;
        const z = bounds.z + rand() * bounds.d;
        if (isPolygon && !GeneratorUtils.isPointInPolygon(x, z, region as THREE.Vector3[])) continue;

        _pos.set(x, 0, z);
        _euler.set(0, rand() * PI2, 0);
        _quat.setFromEuler(_euler);
        _scale.setScalar(0.8 + rand() * 0.5);
        _mat.compose(_pos, _quat, _scale);

        sStem.setMatrixAt(valid, _mat);
        sHead.setMatrixAt(valid, _mat);
        sCent.setMatrixAt(valid, _mat);
        valid++;

        // VINTERDÖD: Register sunflower presence with larger radius
        ctx.collisionGrid.registerVegetation(x, z, 1.5, MaterialType.PLANT);
    }

    sStem.count = valid; sHead.count = valid; sCent.count = valid;
    sStem.instanceMatrix.needsUpdate = true;
    sHead.instanceMatrix.needsUpdate = true;
    sCent.instanceMatrix.needsUpdate = true;
    ctx.scene.add(sStem, sHead, sCent);
};

export const VegetationGenerator = {

    createWaterLily: (scale: number = 1.0) => {
        const group = new THREE.Group();

        const pad = new THREE.Mesh(SHARED_GEO.lilyPad, MATERIALS.waterLily);
        group.add(pad);

        const stem = new THREE.Mesh(SHARED_GEO.lilyStem, MATERIALS.seaweed);
        group.add(stem);

        if (Math.random() > 0.6) {
            const flower = new THREE.Mesh(SHARED_GEO.lilyFlower, MATERIALS.waterLilyFlower);
            flower.position.set(0.1, 0.1, 0.1);
            flower.rotation.set(0.1, 0.1, 0.1);
            group.add(flower);
        }

        group.scale.setScalar(scale);
        group.userData.material = MaterialType.WOOD;
        group.userData.mass = 0.5;
        group.userData.floatOffset = 0.06;

        // Optimized single-shot freeze on root
        GeneratorUtils.freezeStatic(group);

        return group;
    },

    createSeaweed: (width: number = 1.0, height: number = 2.0) => {
        const group = new THREE.Group();
        const mat = MATERIALS.seaweed;

        const strands = 3 + Math.floor(Math.random() * 3);
        const rand = () => Math.random();
        for (let i = 0; i < strands; i++) {
            const mesh = new THREE.Mesh(SHARED_GEO.seaweed, mat);
            mesh.scale.set(width, height * 0.5, width);
            mesh.rotation.y = rand() * Math.PI;
            mesh.position.set((rand() - 0.5) * 0.4, 0, (rand() - 0.5) * 0.4);

            mesh.userData.windPhaseX = rand() * Math.PI * 2;
            mesh.userData.windPhaseZ = rand() * Math.PI * 2;
            group.add(mesh);
        }

        group.userData.material = MaterialType.WOOD;
        group.userData.size = new THREE.Vector3(width * 0.8, height * 1.5, width * 0.8);

        // Optimized single-shot freeze on root
        GeneratorUtils.freezeStatic(group);

        return group;
    },

    initNaturePrototypes: async (yieldToMain?: () => Promise<void>) => {
        const VARIANTS = 3;
        for (let i = 0; i < VARIANTS; i++) {
            if (!prototypes[`${VEGETATION_TYPE.PINE}_${i}`]) prototypes[`${VEGETATION_TYPE.PINE}_${i}`] = generatePinePrototype(i);
            if (!prototypes[`${VEGETATION_TYPE.SPRUCE}_${i}`]) prototypes[`${VEGETATION_TYPE.SPRUCE}_${i}`] = generateSprucePrototype(i);
            if (!prototypes[`${VEGETATION_TYPE.OAK}_${i}`]) prototypes[`${VEGETATION_TYPE.OAK}_${i}`] = generateOakPrototype(i);
            if (!prototypes[`${VEGETATION_TYPE.BIRCH}_${i}`]) prototypes[`${VEGETATION_TYPE.BIRCH}_${i}`] = generateBirchPrototype(i);
            if (!prototypes[`${VEGETATION_TYPE.DEAD_TREE}_${i}`]) prototypes[`${VEGETATION_TYPE.DEAD_TREE}_${i}`] = generateDeadTreePrototype(i);
            if (yieldToMain) await yieldToMain();
        }
    },

    initPrototypes: async (yieldToMain?: () => Promise<void>) => {
        return VegetationGenerator.initNaturePrototypes(yieldToMain);
    },

    createHedge: (length: number = 2.0, height: number = 1.2, thickness: number = 0.8) => {
        const geometries = [];

        const mainGeo = SHARED_GEO.box.clone();
        _matrix.makeScale(thickness, height, length);
        _matrix.setPosition(0, height / 2, 0);
        mainGeo.applyMatrix4(_matrix);
        geometries.push(mainGeo);

        const rand = () => Math.random();
        for (let i = 0; i < 5; i++) {
            const leafGeo = SHARED_GEO.box.clone();
            _matrix.makeScale(thickness * 1.1, height * 0.2, length * 0.2);
            _matrix.setPosition(
                (rand() - 0.5) * 0.1,
                rand() * height,
                (rand() - 0.5) * length
            );
            leafGeo.applyMatrix4(_matrix);
            geometries.push(leafGeo);
        }

        const merged = BufferGeometryUtils.mergeGeometries(geometries);
        const mesh = new THREE.Mesh(merged || new THREE.BufferGeometry(), MATERIALS.hedge);
        mesh.castShadow = true;

        // Freeze matrix
        GeneratorUtils.freezeStatic(mesh);

        for (let i = 0; i < geometries.length; i++) geometries[i].dispose();

        return mesh;
    },

    createTree: (type: VEGETATION_TYPE = VEGETATION_TYPE.PINE, scale: number = 1.0, variant: number = 0): THREE.Group => {
        const group = new THREE.Group();
        const key = `${type}_${variant % 3}`;
        const proto = prototypes[key] || prototypes[`${type}_0`] || prototypes[`${VEGETATION_TYPE.PINE}_0`];

        if (!proto) return group;

        let trunkMat = MATERIALS.treeTrunk;
        if (type === 'OAK') trunkMat = MATERIALS.treeTrunkOak;
        else if (type === 'BIRCH') trunkMat = MATERIALS.treeTrunkBirch;
        else if (type === 'DEAD_TREE') trunkMat = MATERIALS.deadWood;

        const trunk = new THREE.Mesh(proto.trunkGeo, trunkMat);
        trunk.castShadow = true; trunk.receiveShadow = true;
        group.add(trunk);

        if (proto.leavesGeo) {
            let mat = MATERIALS.treeFirNeedles;
            if (type === 'OAK') mat = MATERIALS.treeLeavesOak;
            else if (type === 'BIRCH') mat = MATERIALS.treeLeavesBirch;

            const leaves = new THREE.Mesh(proto.leavesGeo, mat);
            leaves.castShadow = true; leaves.receiveShadow = true;
            leaves.customDepthMaterial = getTreeDepthMaterial(mat);
            group.add(leaves);
        }

        if (proto.snowGeo) {
            const snow = new THREE.Mesh(proto.snowGeo, MATERIALS.snow);
            snow.castShadow = true;
            group.add(snow);
        }

        group.scale.setScalar(scale);

        // Optimized single-shot freeze on root
        GeneratorUtils.freezeStatic(group);

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
            else if (baseType === 'DEAD_TREE') { trunkMat = MATERIALS.deadWood; }
        }

        const trunkMesh = new THREE.InstancedMesh(proto.trunkGeo, trunkMat, matrices.length);
        trunkMesh.castShadow = !materialOverride;
        trunkMesh.receiveShadow = !materialOverride;
        trunkMesh.userData.windAffected = true;
        trunkMesh.userData.isEngineStatic = true;
        GeneratorUtils.freezeStatic(trunkMesh);

        let leavesMesh: THREE.InstancedMesh | undefined;
        if (proto.leavesGeo) {
            leavesMesh = new THREE.InstancedMesh(proto.leavesGeo, leavesMat, matrices.length);
            leavesMesh.castShadow = !materialOverride;
            leavesMesh.receiveShadow = !materialOverride;
            leavesMesh.userData.windAffected = true;
            leavesMesh.userData.isEngineStatic = true;
            GeneratorUtils.freezeStatic(leavesMesh);

            if (!materialOverride) {
                leavesMesh.customDepthMaterial = getTreeDepthMaterial(leavesMat);
            }
        }

        let snowMesh: THREE.InstancedMesh | undefined;
        if (proto.snowGeo && !materialOverride) {
            snowMesh = new THREE.InstancedMesh(proto.snowGeo, MATERIALS.snow, matrices.length);
            snowMesh.castShadow = true;
            snowMesh.userData.windAffected = true;
            snowMesh.userData.isEngineStatic = true;
            GeneratorUtils.freezeStatic(snowMesh);
        }

        for (let i = 0; i < matrices.length; i++) {
            trunkMesh.setMatrixAt(i, matrices[i]);
            if (leavesMesh) leavesMesh.setMatrixAt(i, matrices[i]);
            if (snowMesh) snowMesh.setMatrixAt(i, matrices[i]);
        }

        trunkMesh.instanceMatrix.needsUpdate = true;
        if (leavesMesh) leavesMesh.instanceMatrix.needsUpdate = true;
        if (snowMesh) snowMesh.instanceMatrix.needsUpdate = true;

        if (!(ctx as any).uniqueMeshes) (ctx as any).uniqueMeshes = [];
        ctx.scene.add(trunkMesh);
        if (leavesMesh) ctx.scene.add(leavesMesh);
        if (snowMesh) ctx.scene.add(snowMesh);
    },

    /**
     * Unified vegetation area-fill dispatcher.
     *
     * @param type  A single VEGETATION_TYPE or an array (trees only: randomly picks per instance)
     * @param region  Either a polygon (THREE.Vector3[]) or an AABB {x,z,w,d} (corner, not center)
     * @param density
     *   - Tree types  → spacing in world-units (e.g. 8). Wider = fewer trees.
     *   - Ground-cover → items per m² (e.g. 0.5–2.0). Higher = denser.
     */
    fillArea: (
        ctx: SectorContext,
        type: VEGETATION_TYPE | VEGETATION_TYPE[],
        region: THREE.Vector3[] | { x: number, z: number, w: number, d: number },
        density: number = 1.0
    ) => {
        const types = Array.isArray(type) ? type : [type];
        const firstType = types[0];

        // Route trees to the instanced-matrix path
        const isTree = firstType === VEGETATION_TYPE.PINE
            || firstType === VEGETATION_TYPE.SPRUCE
            || firstType === VEGETATION_TYPE.OAK
            || firstType === VEGETATION_TYPE.BIRCH
            || firstType === VEGETATION_TYPE.DEAD_TREE;

        if (isTree) {
            _placeTrees(ctx, region, density, types);
            return;
        }

        // Ground-cover types
        switch (firstType) {
            case VEGETATION_TYPE.WHEAT: _placeGroundCover(ctx, region, density, SHARED_GEO.grass, MATERIALS.wheat, true); break;
            case VEGETATION_TYPE.GRASS: _placeGroundCover(ctx, region, density, SHARED_GEO.grassTuft, MATERIALS.grassTuft, false); break;
            case VEGETATION_TYPE.FLOWER: _placeGroundCover(ctx, region, density, SHARED_GEO.grass, MATERIALS.flower, false); break;
            case VEGETATION_TYPE.SUNFLOWER: _placeSunflowers(ctx, region, density); break;
            case VEGETATION_TYPE.BUSH: _placeGroundCover(ctx, region, density, SHARED_GEO.box, MATERIALS.hedge, false); break;
        }
    },

    createForest: (ctx: SectorContext,
        region: { x: number, z: number, w: number, d: number } | THREE.Vector3[],
        countOrSpacing: number,
        type: string | string[] = 'PINE') => {

        if (Array.isArray(region)) {
            VegetationGenerator.createForestFromPolygon(ctx, region, countOrSpacing, type as string | string[]);
            return;
        }

        const area = region as { x: number, z: number, w: number, d: number };
        const count = countOrSpacing;
        const matrixBuckets: Record<string, THREE.Matrix4[]> = {};
        const rand = () => Math.random();

        for (let i = 0; i < count; i++) {
            const x = area.x + (rand() - 0.5) * area.w;
            const z = area.z + (rand() - 0.5) * area.d;

            const scale = 0.8 + rand() * 0.6;
            const leanX = (rand() - 0.5) * 0.1, leanZ = (rand() - 0.5) * 0.1;

            _pos.set(x, 0, z);
            _euler.set(leanX, rand() * PI2, leanZ);
            _quat.setFromEuler(_euler);
            _scale.setScalar(scale);
            _mat.compose(_pos, _quat, _scale);

            const mat = _mat.clone();

            let selectedType = type;
            if (Array.isArray(type)) selectedType = type[Math.floor(rand() * type.length)];
            if (selectedType === 'random') selectedType = ['PINE', 'OAK', 'DEAD_TREE', 'BIRCH'][Math.floor(rand() * 4)];
            if (typeof selectedType !== 'string') selectedType = 'PINE';
            selectedType = selectedType.toUpperCase();

            const variant = i % 3;
            const key = `${selectedType}_${variant}`;

            if (!matrixBuckets[key]) matrixBuckets[key] = [];
            matrixBuckets[key].push(mat);

            SectorBuilder.addObstacle(ctx, {
                position: new THREE.Vector3(x, 0, z),
                quaternion: new THREE.Quaternion(),
                collider: { type: 'cylinder', radius: 0.5 * scale, height: 4 },
                id: `tree_${i}`,
                materialId: MaterialType.WOOD
            });
        }

        for (const key in matrixBuckets) {
            VegetationGenerator.addInstancedTrees(ctx, key, matrixBuckets[key]);
        }
    },

    createForestFromPolygon: (ctx: SectorContext, polygon: THREE.Vector3[], spacing: number = 8, type: string | string[] = 'PINE') => {
        if (!polygon || polygon.length < 3) return;

        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (let i = 0; i < polygon.length; i++) {
            const p = polygon[i];
            if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
            if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
        }

        const width = maxX - minX, depth = maxZ - minZ;
        const count = Math.floor((width * depth) / (spacing * spacing));
        const matrixBuckets: Record<string, THREE.Matrix4[]> = {};
        const rand = () => Math.random();

        for (let i = 0; i < count; i++) {
            const x = minX + rand() * width;
            const z = minZ + rand() * depth;

            if (GeneratorUtils.isPointInPolygon(x, z, polygon)) {
                const scale = 0.8 + rand() * 0.6;
                const leanX = (rand() - 0.5) * 0.1, leanZ = (rand() - 0.5) * 0.1;

                _pos.set(x, 0, z);
                _euler.set(leanX, rand() * PI2, leanZ);
                _quat.setFromEuler(_euler);
                _scale.setScalar(scale);
                _mat.compose(_pos, _quat, _scale);

                const mat = _mat.clone();

                let selectedType = type;
                if (Array.isArray(type)) selectedType = type[Math.floor(rand() * type.length)];
                if (selectedType === 'random') selectedType = ['PINE', 'OAK', 'DEAD_TREE', 'BIRCH'][Math.floor(rand() * 4)];
                if (typeof selectedType !== 'string') selectedType = 'PINE';
                selectedType = selectedType.toUpperCase();

                const variant = i % 3;
                const key = `${selectedType}_${variant}`;

                if (!matrixBuckets[key]) matrixBuckets[key] = [];
                matrixBuckets[key].push(mat);

                SectorBuilder.addObstacle(ctx, {
                    position: new THREE.Vector3(x, 0, z),
                    quaternion: new THREE.Quaternion(),
                    collider: { type: 'cylinder', radius: 0.5 * scale, height: 4 },
                    id: `tree_poly_${i}`,
                    materialId: MaterialType.WOOD
                });
            }
        }

        for (const key in matrixBuckets) {
            VegetationGenerator.addInstancedTrees(ctx, key, matrixBuckets[key]);
        }
    },

    // ---------------------------------------------------------------------------
    // Deprecated fill helpers below — kept only for any external references.
    // Prefer VegetationGenerator.fillArea() for all new code.
    // ---------------------------------------------------------------------------

    fillWheatField: (ctx: SectorContext, polygon: THREE.Vector3[], density: number = 0.5) => {
        if (!polygon || polygon.length < 3) return;

        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (let i = 0; i < polygon.length; i++) {
            const p = polygon[i];
            if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
            if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
        }

        const w = maxX - minX, d = maxZ - minZ;
        const count = Math.floor(w * d * 0.5 * density);
        const mesh = new THREE.InstancedMesh(SHARED_GEO.grass, MATERIALS.grass, count);
        GeneratorUtils.freezeStatic(mesh);

        let valid = 0;
        const rand = () => Math.random();

        for (let i = 0; i < count; i++) {
            const x = minX + rand() * w;
            const z = minZ + rand() * d;

            if (GeneratorUtils.isPointInPolygon(x, z, polygon)) {
                _pos.set(x, 0, z);
                _euler.set(0, rand() * Math.PI, 0);
                _quat.setFromEuler(_euler);
                _scale.set(1, 1.5 + rand(), 1);

                _mat.compose(_pos, _quat, _scale);
                mesh.setMatrixAt(valid++, _mat);
            }
        }
        mesh.count = valid;
        mesh.receiveShadow = true;
        mesh.instanceMatrix.needsUpdate = true;
        ctx.scene.add(mesh);
    },

    fillAreaWithFlowers: (ctx: SectorContext,
        region: { x: number, z: number, w: number, d: number } | THREE.Vector3[],
        countOrDensity: number,
        type: 'flower' | 'sunflower' = 'flower') => {

        let area: { x: number, z: number, w: number, d: number };
        let count = 0;
        const rand = () => Math.random();

        if (Array.isArray(region)) {
            let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
            for (let i = 0; i < region.length; i++) {
                const p = region[i];
                if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
                if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
            }
            area = { x: minX, z: minZ, w: maxX - minX, d: maxZ - minZ };
            count = Math.floor(area.w * area.d * countOrDensity);
        } else {
            area = region;
            count = countOrDensity;
        }

        const isSunflower = type === 'sunflower';
        const geo = isSunflower ? undefined : SHARED_GEO.grass;
        const mat = isSunflower ? undefined : MATERIALS.flower;

        const mainMesh = isSunflower ? undefined : new THREE.InstancedMesh(geo!, mat!, count);
        const sStem = isSunflower ? new THREE.InstancedMesh(SHARED_GEO.sunflowerStem, MATERIALS.sunflowerStem, count) : undefined;
        const sHead = isSunflower ? new THREE.InstancedMesh(SHARED_GEO.sunflowerHead, MATERIALS.sunflowerHead, count) : undefined;
        const sCent = isSunflower ? new THREE.InstancedMesh(SHARED_GEO.sunflowerCenter, MATERIALS.sunflowerCenter, count) : undefined;

        if (isSunflower) {
            sStem!.userData.windAffected = true; GeneratorUtils.freezeStatic(sStem!);
            sHead!.userData.windAffected = true; GeneratorUtils.freezeStatic(sHead!);
            sCent!.userData.windAffected = true; GeneratorUtils.freezeStatic(sCent!);
        } else {
            GeneratorUtils.freezeStatic(mainMesh!);
        }

        let valid = 0;
        for (let i = 0; i < count; i++) {
            const x = area.x + rand() * area.w;
            const z = area.z + rand() * area.d;

            if (Array.isArray(region) && !GeneratorUtils.isPointInPolygon(x, z, region)) continue;

            _pos.set(x, 0, z);
            _euler.set(0, rand() * PI2, 0);
            _quat.setFromEuler(_euler);
            _scale.setScalar(0.8 + rand() * 0.5);

            _mat.compose(_pos, _quat, _scale);

            if (isSunflower) {
                sStem!.setMatrixAt(valid, _mat);
                sHead!.setMatrixAt(valid, _mat);
                sCent!.setMatrixAt(valid, _mat);
            } else {
                mainMesh!.setMatrixAt(valid, _mat);
            }
            valid++;
        }

        if (isSunflower) {
            sStem!.count = valid; sHead!.count = valid; sCent!.count = valid;
            sStem!.instanceMatrix.needsUpdate = true;
            sHead!.instanceMatrix.needsUpdate = true;
            sCent!.instanceMatrix.needsUpdate = true;
            ctx.scene.add(sStem!, sHead!, sCent!);
        } else {
            mainMesh!.count = valid;
            mainMesh!.receiveShadow = true;
            mainMesh!.instanceMatrix.needsUpdate = true;
            ctx.scene.add(mainMesh!);
        }
    },

    fillAreaWithGrass: (ctx: SectorContext, region: { x: number, z: number, w: number, d: number } | THREE.Vector3[], density: number = 2.0) => {
        let area: { x: number, z: number, w: number, d: number };
        let count = 0;
        const rand = () => Math.random();

        if (Array.isArray(region)) {
            let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
            for (let i = 0; i < region.length; i++) {
                const p = region[i];
                if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
                if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
            }
            area = { x: minX, z: minZ, w: maxX - minX, d: maxZ - minZ };
            count = Math.floor((maxX - minX) * (maxZ - minZ) * density);
        } else {
            area = region;
            count = Math.floor(area.w * area.d * density);
        }

        const mesh = new THREE.InstancedMesh(SHARED_GEO.grass, MATERIALS.grass, count);
        GeneratorUtils.freezeStatic(mesh);

        let valid = 0;
        for (let i = 0; i < count; i++) {
            const x = area.x + rand() * area.w;
            const z = area.z + rand() * area.d;

            if (Array.isArray(region) && !GeneratorUtils.isPointInPolygon(x, z, region)) continue;

            _pos.set(x, 0, z);
            _euler.set(0, rand() * PI2, 0);
            _quat.setFromEuler(_euler);
            _scale.setScalar(0.8 + rand() * 0.5);

            _mat.compose(_pos, _quat, _scale);
            mesh.setMatrixAt(valid++, _mat);
        }

        mesh.count = valid;
        mesh.receiveShadow = true;
        mesh.instanceMatrix.needsUpdate = true;
        ctx.scene.add(mesh);
    },

    createDeadTree: (variant: 'standing' | 'fallen' = 'standing', scale: number = 1.0): THREE.Group => {
        const tree = VegetationGenerator.createTree(VEGETATION_TYPE.DEAD_TREE, scale, Math.floor(Math.random() * 3));
        if (variant === 'fallen') {
            tree.rotation.z = Math.PI / 2 + (Math.random() - 0.5) * 0.5;
            tree.position.y = 0.5 * scale;
        }

        // Optimized single-shot freeze on root (covers both standing and fallen transforms)
        GeneratorUtils.freezeStatic(tree);

        return tree;
    },

    createDeforestation: (ctx: SectorContext, x: number, z: number, w: number, d: number, count: number) => {
        const matrixBuckets: Record<string, THREE.Matrix4[]> = {};
        const rand = () => Math.random();

        for (let i = 0; i < count; i++) {
            const tx = x + (rand() - 0.5) * w;
            const tz = z + (rand() - 0.5) * d;

            const isFallen = rand() > 0.3;
            const scale = 0.8 + rand() * 0.5;

            _pos.set(tx, isFallen ? 0.5 * scale : 0, tz);

            if (isFallen) {
                _euler.set(0, rand() * PI2, Math.PI / 2 + (rand() - 0.5) * 0.5);
            } else {
                _euler.set(0, rand() * PI2, 0);
            }

            _quat.setFromEuler(_euler);
            _scale.setScalar(scale);

            _mat.compose(_pos, _quat, _scale);
            const mat = _mat.clone();

            const variant = Math.floor(rand() * 3);
            const key = `DEAD_${variant}`;

            if (!matrixBuckets[key]) matrixBuckets[key] = [];
            matrixBuckets[key].push(mat);

            if (!isFallen) {
                SectorBuilder.addObstacle(ctx, {
                    position: new THREE.Vector3(tx, 0, tz),
                    collider: { type: 'cylinder', radius: 0.4, height: 4 },
                    id: `deforest_tree_${i}`
                });
            }
        }

        for (const key in matrixBuckets) {
            VegetationGenerator.addInstancedTrees(ctx, key, matrixBuckets[key]);
        }
    },
};