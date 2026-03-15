import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MATERIALS } from '../../utils/assets/materials';
import { SectorContext } from '../../types/sector';
import { SectorGenerator } from './SectorGenerator';
import { TreeType } from '../../content/constants';

// Pre-allocated math objects for fast matrix composition.
// Blazing fast compared to using Object3D.updateMatrix().
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _euler = new THREE.Euler();
const _mat = new THREE.Matrix4(); // [VINTERDÖD] Extra scratchpad to prevent matrix allocations
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
let prototypes: Record<string, TreePrototype> = {};

// --- ZERO-GC CACHES TO PREVENT WEBGL VRAM LEAKS ---
const _createCrossGeo = () => {
    const plane = new THREE.PlaneGeometry(1, 1);
    plane.translate(0, 0.5, 0); // Origin at bottom
    const p1 = plane.clone();
    const p2 = plane.clone().rotateY(Math.PI / 2);
    const p3 = plane.clone().rotateY(Math.PI / 4);
    const p4 = plane.clone().rotateY(-Math.PI / 4);
    const merged = BufferGeometryUtils.mergeGeometries([p1, p2, p3, p4]);
    return merged ? merged : new THREE.BufferGeometry();
};

const SHARED_GEO = {
    grass: _createCrossGeo(),
    sunflowerStem: new THREE.CylinderGeometry(0.05, 0.05, 3.0, 4).translate(0, 1.5, 0),
    sunflowerHead: new THREE.SphereGeometry(0.4, 8, 8).scale(1, 1, 0.2).translate(0, 3.0, 0.05),
    sunflowerCenter: new THREE.CylinderGeometry(0.2, 0.2, 0.1, 8).rotateX(Math.PI / 2).translate(0, 3.0, 0.1),
    rock: new THREE.DodecahedronGeometry(1, 0),
    debris: new THREE.BoxGeometry(1.5, 0.1, 0.3),
    lilyPad: new THREE.CylinderGeometry(0.5, 0.5, 0.05, 8).scale(1, 1, 0.8),
    lilyStem: new THREE.CylinderGeometry(0.03, 0.03, 1.5, 4).translate(0, -0.75, 0),
    lilyFlower: new THREE.ConeGeometry(0.15, 0.2, 5),
    seaweed: new THREE.PlaneGeometry(0.3, 3.0, 2, 4).translate(0, 1.5, 0)
};

const SHARED_MAT = {
    sunflowerStem: new THREE.MeshStandardMaterial({ color: 0x228B22 }),
    sunflowerHead: new THREE.MeshStandardMaterial({ color: 0xFFD700, roughness: 0.8 }),
    sunflowerCenter: new THREE.MeshStandardMaterial({ color: 0x3E2723, roughness: 1.0 })
};

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

// Zero-GC polygon check.
const isPointInPolygon = (px: number, pz: number, polygon: THREE.Vector3[]) => {
    let inside = false;
    const len = polygon.length;
    for (let i = 0, j = len - 1; i < len; j = i++) {
        const xi = polygon[i].x, zi = polygon[i].z;
        const xj = polygon[j].x, zj = polygon[j].z;
        const intersect = ((zi > pz) !== (zj > pz))
            && (px < (xj - xi) * (pz - zi) / (zj - zi) + xi);
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

        leafGeos.push(bakeGeo(cone.clone(), layerPos, layerRot, new THREE.Vector3(1, 1, 1)));

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

        leafGeos.push(bakeGeo(cone.clone(), layerPos, layerRot, new THREE.Vector3(1, 1, 1)));

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

export const EnvironmentGenerator = {
    createWaterLily: (scale: number = 1.0) => {
        const group = new THREE.Group();
        const pad = new THREE.Mesh(SHARED_GEO.lilyPad, MATERIALS.waterLily);
        group.add(pad);

        const stem = new THREE.Mesh(SHARED_GEO.lilyStem, MATERIALS.seaweed);
        group.add(stem);

        if (Math.random() > 0.6) {
            const flower = new THREE.Mesh(SHARED_GEO.lilyFlower, MATERIALS.waterLilyFlower);
            flower.position.set(0.1, 0.1, 0.1);
            flower.rotation.set((Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.4);
            group.add(flower);
        }

        group.scale.setScalar(scale);
        group.userData.material = 'PLANT';
        group.userData.isBall = true;
        group.userData.mass = 0.5;
        group.userData.floatOffset = 0.06;

        return group;
    },

    createSeaweed: (width: number = 1.0, height: number = 2.0) => {
        const group = new THREE.Group();
        const mat = MATERIALS.seaweed;

        const strands = 3 + Math.floor(Math.random() * 3);
        for (let i = 0; i < strands; i++) {
            const mesh = new THREE.Mesh(SHARED_GEO.seaweed, mat);
            // Apply scale here so we can reuse the shared geometry
            mesh.scale.set(width, height * 0.5, width);
            mesh.rotation.y = Math.random() * Math.PI;
            mesh.position.set((Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.4);
            mesh.userData.windPhaseX = Math.random() * Math.PI * 2;
            mesh.userData.windPhaseZ = Math.random() * Math.PI * 2;
            group.add(mesh);
        }

        group.userData.material = 'LEAVES';
        group.userData.size = new THREE.Vector3(width * 0.8, height * 1.5, width * 0.8);
        return group;
    },

    initNaturePrototypes: async (yieldToMain?: () => Promise<void>) => {
        const VARIANTS = 3;
        for (let i = 0; i < VARIANTS; i++) {
            if (!prototypes[`${TreeType.PINE}_${i}`]) prototypes[`${TreeType.PINE}_${i}`] = generatePinePrototype(i);
            if (!prototypes[`${TreeType.SPRUCE}_${i}`]) prototypes[`${TreeType.SPRUCE}_${i}`] = generateSprucePrototype(i);
            if (!prototypes[`${TreeType.OAK}_${i}`]) prototypes[`${TreeType.OAK}_${i}`] = generateOakPrototype(i);
            if (!prototypes[`${TreeType.BIRCH}_${i}`]) prototypes[`${TreeType.BIRCH}_${i}`] = generateBirchPrototype(i);
            if (!prototypes[`${TreeType.DEAD}_${i}`]) prototypes[`${TreeType.DEAD}_${i}`] = generateDeadTreePrototype(i);
            if (yieldToMain) await yieldToMain();
        }
    },

    initPrototypes: async (yieldToMain?: () => Promise<void>) => {
        return EnvironmentGenerator.initNaturePrototypes(yieldToMain);
    },

    createMountain: (ctx: SectorContext, points: THREE.Vector3[], depth: number = 20, height: number = 15, caveConfig?: { position: THREE.Vector3, rotation?: number }) => {
        if (!points || points.length < 2) return;

        const geometries: THREE.BufferGeometry[] = [];
        const curve = new THREE.CatmullRomCurve3(points);
        const length = curve.getLength();

        const steps = Math.floor(length / 2.0);
        const numLayers = Math.max(1, Math.ceil(depth / 6));
        const layerThickness = depth / numLayers;

        let openingPos = new THREE.Vector3();
        let openingDir = new THREE.Vector3(0, 0, 1);

        if (caveConfig) {
            const opening = EnvironmentGenerator.createMountainOpening(depth + 5);
            opening.position.copy(caveConfig.position);
            openingPos.copy(caveConfig.position);

            if (caveConfig.rotation !== undefined) {
                opening.rotation.y = caveConfig.rotation;
                openingDir.set(Math.sin(caveConfig.rotation), 0, Math.cos(caveConfig.rotation)).normalize();
            }
            ctx.scene.add(opening);
        }

        const hash = (x: number) => {
            let n = Math.sin(x * 12.9898) * 43758.5453;
            return n - Math.floor(n);
        };

        const addRockBlock = (pos: THREE.Vector3, scale: THREE.Vector3, rot: THREE.Euler, type: 'dodeca' | 'icosa' = 'dodeca', isPortal: boolean = false) => {
            if (caveConfig && !isPortal) {
                const tunnelCenter = openingPos.clone().add(openingDir.clone().multiplyScalar(depth * 0.4));
                const distSq = pos.distanceToSquared(tunnelCenter);
                const maxRadius = Math.max(scale.x, scale.z);
                const safeDist = (depth * 0.4) + maxRadius + 5;

                if (distSq < safeDist * safeDist) {
                    return;
                }
            }

            const geo = type === 'icosa' ? new THREE.IcosahedronGeometry(1, 0) : new THREE.DodecahedronGeometry(1, 0);
            const matrix = new THREE.Matrix4();
            const quat = new THREE.Quaternion().setFromEuler(rot);
            matrix.compose(pos, quat, scale);
            geo.applyMatrix4(matrix);
            geometries.push(geo);
        };

        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const pt = curve.getPointAt(t);
            const tangent = curve.getTangentAt(t).normalize();
            const inwardDir = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();

            for (let layer = 0; layer < numLayers; layer++) {
                if (layer > 0 && i % (layer + 1) !== 0) continue;

                const layerHeightFactor = numLayers === 1 ? 1 : layer / (numLayers - 1);
                const currentHeight = height * (0.4 + 0.6 * layerHeightFactor);

                const scaleX = 4 + hash(i + layer) * 4;
                const scaleZ = 4 + hash(i + layer + 1) * 4;
                const scaleY = currentHeight * (0.7 + 0.3 * hash(i + layer + 2));
                const scale = new THREE.Vector3(scaleX, scaleY, scaleZ);

                const maxRadius = Math.max(scale.x, scale.z);
                const safeOffset = (layer * layerThickness) + maxRadius * 0.5;

                const pos = pt.clone().add(inwardDir.clone().multiplyScalar(safeOffset));
                pos.y = scale.y * 0.3;

                const rot = new THREE.Euler(hash(i) * 0.4, hash(i + 1) * Math.PI, hash(i + 2) * 0.4);

                addRockBlock(pos, scale, rot, layer === 0 ? 'icosa' : 'dodeca');
            }
        }

        if (caveConfig) {
            const placePortalRock = (localPos: THREE.Vector3, scale: THREE.Vector3, localRot: THREE.Euler) => {
                const rotatedPos = localPos.clone();
                if (caveConfig.rotation) rotatedPos.applyAxisAngle(new THREE.Vector3(0, 1, 0), caveConfig.rotation);
                const worldPos = openingPos.clone().add(rotatedPos);
                const worldRot = new THREE.Euler(localRot.x, localRot.y + (caveConfig.rotation || 0), localRot.z);
                addRockBlock(worldPos, scale, worldRot, 'dodeca', true);
            };

            placePortalRock(new THREE.Vector3(-10, 5, -2), new THREE.Vector3(6, 10, 8), new THREE.Euler(0.1, 0.4, -0.1));
            placePortalRock(new THREE.Vector3(10, 5, -2), new THREE.Vector3(6, 10, 8), new THREE.Euler(-0.1, -0.4, 0.1));
            placePortalRock(new THREE.Vector3(-6, 10, -3), new THREE.Vector3(6, 6, 8), new THREE.Euler(0.2, 0.2, -0.4));
            placePortalRock(new THREE.Vector3(6, 10, -3), new THREE.Vector3(6, 6, 8), new THREE.Euler(0.2, -0.2, 0.4));
            placePortalRock(new THREE.Vector3(0, 12, -3), new THREE.Vector3(8, 6, 9), new THREE.Euler(0.1, 0, 0));
            placePortalRock(new THREE.Vector3(-6, 14, -4), new THREE.Vector3(10, 6, 8), new THREE.Euler(-0.2, 0.3, -0.1));
            placePortalRock(new THREE.Vector3(6, 14, -4), new THREE.Vector3(10, 6, 8), new THREE.Euler(-0.1, -0.4, 0.2));
            placePortalRock(new THREE.Vector3(0, 16, -4), new THREE.Vector3(12, 6, 8), new THREE.Euler(0, 0.1, 0));
        }

        if (geometries.length === 0) return;

        let mountainGeo = BufferGeometryUtils.mergeGeometries(geometries);
        if (!mountainGeo) return;
        mountainGeo = mountainGeo.index ? mountainGeo.toNonIndexed() : mountainGeo;
        mountainGeo.computeVertexNormals();

        const count = mountainGeo.getAttribute('position').count;
        const colors = new Float32Array(count * 3);
        const finalPosAttr = mountainGeo.getAttribute('position');
        const normalAttr = mountainGeo.getAttribute('normal');
        const normal = new THREE.Vector3();
        const up = new THREE.Vector3(0, 1, 0);

        const COLORS = {
            SNOW: new THREE.Color(0xffffff),
            ROCK_LIGHT: new THREE.Color(0xddddee),
            ROCK_DARK: new THREE.Color(0x888899),
        };

        for (let i = 0; i < count; i += 3) {
            const hAvg = (finalPosAttr.getY(i) + finalPosAttr.getY(i + 1) + finalPosAttr.getY(i + 2)) / 3;
            normal.fromBufferAttribute(normalAttr, i);
            const upwardness = normal.dot(up);

            let r, g, b;

            const snowThreshold = height * 0.6;

            if ((upwardness > 0.65 && hAvg > snowThreshold / 2) || hAvg > snowThreshold) {
                r = COLORS.SNOW.r; g = COLORS.SNOW.g; b = COLORS.SNOW.b;
            } else {
                const isLight = (normal.x * 0.5 + normal.z * 0.8) > 0;
                r = isLight ? COLORS.ROCK_LIGHT.r : COLORS.ROCK_DARK.r;
                g = isLight ? COLORS.ROCK_LIGHT.g : COLORS.ROCK_DARK.g;
                b = isLight ? COLORS.ROCK_LIGHT.b : COLORS.ROCK_DARK.b;
            }

            for (let j = 0; j < 3; j++) {
                const idx = (i + j) * 3;
                colors[idx] = r; colors[idx + 1] = g; colors[idx + 2] = b;
            }
        }

        mountainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const mountain = new THREE.Mesh(mountainGeo, MATERIALS.mountain);
        mountain.castShadow = true;
        mountain.receiveShadow = true;
        ctx.scene.add(mountain);
    },

    createMountainOpening: (tunnelDepth: number = 10) => {
        const caveOpeningGroup = new THREE.Group();

        const outW = 10;
        const inW = 6.5;
        const wallH = 6.5;
        const peakH = 12;
        const peakInH = 9;
        const topW = 4;
        const topInW = 2.5;

        const portalShape = new THREE.Shape();
        portalShape.moveTo(-outW, 0);
        portalShape.lineTo(-outW - 0.5, wallH);
        portalShape.lineTo(-topW, peakH + 0.5);
        portalShape.lineTo(topW, peakH);
        portalShape.lineTo(outW + 0.8, wallH);
        portalShape.lineTo(outW, 0);
        portalShape.lineTo(-outW, 0);

        const holePath = new THREE.Path();
        holePath.moveTo(inW, 0);
        holePath.lineTo(inW - 0.5, wallH - 0.5);
        holePath.lineTo(topInW, peakInH);
        holePath.lineTo(-topInW, peakInH - 0.5);
        holePath.lineTo(-inW + 0.5, wallH - 0.5);
        holePath.lineTo(-inW, 0);
        holePath.lineTo(inW, 0);
        portalShape.holes.push(holePath);

        const extrudeSettings = { depth: tunnelDepth, steps: 2, bevelEnabled: false };
        const portalGeoExtruded = new THREE.ExtrudeGeometry(portalShape, extrudeSettings);
        portalGeoExtruded.translate(0, 0, -tunnelDepth / 2);

        const portalGeo = portalGeoExtruded.index ? portalGeoExtruded.toNonIndexed() : portalGeoExtruded;

        const posAttr = portalGeo.getAttribute('position');
        for (let i = 0; i < posAttr.count; i++) {
            const x = posAttr.getX(i);
            const y = posAttr.getY(i);
            if (Math.abs(x) < outW - 1.0 && y < peakH - 1.0) {
                posAttr.setX(i, x + (Math.random() - 0.5) * 0.7);
                posAttr.setY(i, y + (Math.random() - 0.5) * 0.7);
            }
        }
        portalGeo.computeVertexNormals();

        const count = portalGeo.getAttribute('position').count;
        const colors = new Float32Array(count * 3);
        const normalAttr = portalGeo.getAttribute('normal');
        const normal = new THREE.Vector3();

        const COLORS = {
            ROCK_LIGHT: new THREE.Color(0xddddee),
            ROCK_DARK: new THREE.Color(0x888899),
        };

        for (let i = 0; i < count; i += 3) {
            normal.fromBufferAttribute(normalAttr, i);
            const isLight = (normal.x * 0.5 + normal.z * 0.8) > 0;
            const r = isLight ? COLORS.ROCK_LIGHT.r : COLORS.ROCK_DARK.r;
            const g = isLight ? COLORS.ROCK_LIGHT.g : COLORS.ROCK_DARK.g;
            const b = isLight ? COLORS.ROCK_LIGHT.b : COLORS.ROCK_DARK.b;

            for (let j = 0; j < 3; j++) {
                colors[(i + j) * 3] = r; colors[(i + j) * 3 + 1] = g; colors[(i + j) * 3 + 2] = b;
            }
        }
        portalGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const portal = new THREE.Mesh(portalGeo, MATERIALS.mountain);
        portal.castShadow = true;
        portal.receiveShadow = true;
        caveOpeningGroup.add(portal);

        const logRadius = 0.5;
        const postHeight = wallH - 0.5;
        const woodMat = MATERIALS.treeTrunk || MATERIALS.deadWood;

        const framePositionsZ: number[] = [];
        for (let z = -tunnelDepth / 2 + 1.5; z <= tunnelDepth / 2 - 1.5; z += 3.5) {
            framePositionsZ.push(z);
        }

        framePositionsZ.forEach((fz) => {
            const postL = new THREE.Mesh(new THREE.CylinderGeometry(logRadius, logRadius, postHeight, 6), woodMat);
            postL.position.set(-inW + 1.0, postHeight / 2, fz);
            postL.rotation.y = Math.random() * Math.PI;
            postL.rotation.z = (Math.random() - 0.5) * 0.05;
            postL.castShadow = true;
            caveOpeningGroup.add(postL);

            const postR = new THREE.Mesh(new THREE.CylinderGeometry(logRadius, logRadius, postHeight, 6), woodMat);
            postR.position.set(inW - 1.0, postHeight / 2, fz);
            postR.rotation.y = Math.random() * Math.PI;
            postR.rotation.z = (Math.random() - 0.5) * 0.05;
            postR.castShadow = true;
            caveOpeningGroup.add(postR);

            const beamLen = (inW - 1.0) * 2 + 1.5;
            const topBeam = new THREE.Mesh(new THREE.CylinderGeometry(logRadius, logRadius, beamLen, 6), woodMat);
            topBeam.position.set(0, postHeight + logRadius - 0.2, fz);
            topBeam.rotation.z = Math.PI / 2;
            topBeam.rotation.x = Math.random() * Math.PI;
            topBeam.castShadow = true;
            caveOpeningGroup.add(topBeam);

            const diagL = new THREE.Mesh(new THREE.CylinderGeometry(logRadius * 0.7, logRadius * 0.7, 2.5, 5), woodMat);
            diagL.position.set(-inW + 2.2, postHeight - 0.8, fz);
            diagL.rotation.z = -Math.PI / 4;
            diagL.castShadow = true;
            caveOpeningGroup.add(diagL);

            const diagR = new THREE.Mesh(new THREE.CylinderGeometry(logRadius * 0.7, logRadius * 0.7, 2.5, 5), woodMat);
            diagR.position.set(inW - 2.2, postHeight - 0.8, fz);
            diagR.rotation.z = Math.PI / 4;
            diagR.castShadow = true;
            caveOpeningGroup.add(diagR);
        });

        const plankLength = (inW - 1.2) * 2;
        for (let z = -tunnelDepth / 2 + 0.5; z <= tunnelDepth / 2 - 0.5; z += 1.2) {
            const plank = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, plankLength, 5), woodMat);
            plank.position.set(0, postHeight + logRadius * 2 - 0.2, z);
            plank.rotation.z = Math.PI / 2;
            plank.rotation.x = (Math.random() - 0.5) * 0.2;
            plank.castShadow = true;
            caveOpeningGroup.add(plank);
        }

        return caveOpeningGroup;
    },

    createMountainOpeningInConrete: () => {
        const caveOpeningGroup = new THREE.Group();

        const portalShape = new THREE.Shape();
        const outW = 8.5;
        const inW = 6;
        const wallH = 6;
        const peakH = 10;
        const peakInH = 8;
        const topW = 4;
        const topInW = 2.5;

        portalShape.moveTo(-outW, 0);
        portalShape.lineTo(-outW, wallH);
        portalShape.lineTo(-topW, peakH);
        portalShape.lineTo(topW, peakH);
        portalShape.lineTo(outW, wallH);
        portalShape.lineTo(outW, 0);
        portalShape.lineTo(-outW, 0);

        const holePath = new THREE.Path();
        holePath.moveTo(inW, 0);
        holePath.lineTo(inW, wallH - 0.5);
        holePath.lineTo(topInW, peakInH);
        holePath.lineTo(-topInW, peakInH);
        holePath.lineTo(-inW, wallH - 0.5);
        holePath.lineTo(-inW, 0);
        holePath.lineTo(inW, 0);
        portalShape.holes.push(holePath);

        const tunnelDepth = 8;
        const extrudeSettings = { depth: tunnelDepth, steps: 2, bevelEnabled: false };
        const portalGeoExtruded = new THREE.ExtrudeGeometry(portalShape, extrudeSettings);
        portalGeoExtruded.translate(0, 0, -tunnelDepth / 2);
        const portalGeo = portalGeoExtruded.index ? portalGeoExtruded.toNonIndexed() : portalGeoExtruded;

        if (!MATERIALS.concreteDoubleSided) {
            MATERIALS.concreteDoubleSided = MATERIALS.concrete.clone();
            MATERIALS.concreteDoubleSided.side = THREE.DoubleSide;
            MATERIALS.concreteDoubleSided.flatShading = true;
        }

        const portal = new THREE.Mesh(portalGeo, MATERIALS.concreteDoubleSided);
        portal.castShadow = true;
        portal.receiveShadow = true;
        caveOpeningGroup.add(portal);

        const ribMat = MATERIALS.steel || MATERIALS.concreteDoubleSided;

        const ribL = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, tunnelDepth + 1), ribMat);
        ribL.position.set(-topInW - 1.0, peakInH - 0.5, 0);
        ribL.rotation.z = 0.75;
        ribL.castShadow = true;
        caveOpeningGroup.add(ribL);

        const ribR = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, tunnelDepth + 1), ribMat);
        ribR.position.set(topInW + 1.0, peakInH - 0.5, 0);
        ribR.rotation.z = -0.75;
        ribR.castShadow = true;
        caveOpeningGroup.add(ribR);

        const ribTop = new THREE.Mesh(new THREE.BoxGeometry(topInW * 2 + 2, 1.2, tunnelDepth + 1), ribMat);
        ribTop.position.set(0, peakInH - 0.2, 0);
        ribTop.castShadow = true;
        caveOpeningGroup.add(ribTop);

        const threshold = new THREE.Mesh(new THREE.BoxGeometry(outW * 2 + 2, 0.5, tunnelDepth + 2), MATERIALS.concreteDoubleSided);
        threshold.position.set(0, 0.25, 0);
        threshold.receiveShadow = true;
        caveOpeningGroup.add(threshold);

        return caveOpeningGroup;
    },

    createRock: (width: number, height: number, sharpness: number = 0.5) => {
        const group = new THREE.Group();
        const mat = MATERIALS.stone;

        // Återanvänder vår globala cache!
        const geo = SHARED_GEO.rock;

        const sx = width * 0.4 * (1.0 + (Math.random() - 0.5) * 0.4);
        const sz = width * 0.4 * (1.0 + (Math.random() - 0.5) * 0.4);
        const sy = (height / 2) * (1.0 + (Math.random() - 0.5) * 0.4);

        const mesh = new THREE.Mesh(geo, mat);
        mesh.scale.set(sx, sy, sz);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        group.add(mesh);

        if (Math.random() > 0.3) {
            const sub = new THREE.Mesh(geo, mat);
            sub.scale.set(sx * 0.5, sy * 0.5, sz * 0.5);
            sub.position.set((Math.random() - 0.5) * sx, -sx * 0.2, (Math.random() - 0.5) * sx);
            sub.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
            sub.castShadow = true;
            sub.receiveShadow = true;
            group.add(sub);
        }

        group.userData.material = 'STONE';
        return group;
    },

    // Varning: createDeadTree och createTree returnerar "THREE.Group". Använder du dessa i dina skript 
    // för att spawna tusentals individuella träd så bryter du Instancingen. Forest-funktionerna är säkra.
    createTree: (type: TreeType = TreeType.PINE, scale: number = 1.0, variant: number = 0): THREE.Group => {
        const group = new THREE.Group();
        const key = `${type}_${variant % 3}`;
        const proto = prototypes[key] || prototypes[`${type}_0`] || prototypes[`${TreeType.PINE}_0`];

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
        trunkMesh.castShadow = !materialOverride;
        trunkMesh.receiveShadow = !materialOverride;
        trunkMesh.userData.windAffected = true; // [VINTERDÖD] Låter trädets stam vaja i vinden

        let leavesMesh: THREE.InstancedMesh | undefined;
        if (proto.leavesGeo) {
            leavesMesh = new THREE.InstancedMesh(proto.leavesGeo, leavesMat, matrices.length);
            leavesMesh.castShadow = !materialOverride;
            leavesMesh.receiveShadow = !materialOverride;
            leavesMesh.userData.windAffected = true; // [VINTERDÖD] Låter lövverket vaja i vinden

            if (!materialOverride) {
                leavesMesh.customDepthMaterial = new THREE.MeshDepthMaterial({
                    depthPacking: THREE.RGBADepthPacking,
                    map: (leavesMat as any).map,
                    alphaTest: (leavesMat as any).alphaTest
                });
            }
        }

        let snowMesh: THREE.InstancedMesh | undefined;
        if (proto.snowGeo && !materialOverride) {
            snowMesh = new THREE.InstancedMesh(proto.snowGeo, MATERIALS.snow, matrices.length);
            snowMesh.castShadow = true;
            snowMesh.userData.windAffected = true;
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
    },

    createForest: (ctx: SectorContext,
        region: { x: number, z: number, w: number, d: number } | THREE.Vector3[],
        countOrSpacing: number,
        type: string | string[] = 'PINE') => {

        if (Array.isArray(region)) {
            EnvironmentGenerator.createForestFromPolygon(ctx, region, countOrSpacing, type as string | string[]);
            return;
        }

        const area = region as { x: number, z: number, w: number, d: number };
        const count = countOrSpacing;

        const matrixBuckets: Record<string, THREE.Matrix4[]> = {};

        for (let i = 0; i < count; i++) {
            const x = area.x + (Math.random() - 0.5) * area.w;
            const z = area.z + (Math.random() - 0.5) * area.d;

            const scale = 0.8 + Math.random() * 0.6;
            const leanX = (Math.random() - 0.5) * 0.1;
            const leanZ = (Math.random() - 0.5) * 0.1;

            _pos.set(x, 0, z);
            _euler.set(leanX, Math.random() * PI2, leanZ);
            _quat.setFromEuler(_euler);
            _scale.setScalar(scale);

            // Denna allokering är okej eftersom vi behöver gruppera träd-varianterna, 
            // men vi slipper allokera matriser för tiotusentals grässtrån i de andra funktionerna.
            const mat = new THREE.Matrix4();
            mat.compose(_pos, _quat, _scale);

            let selectedType = type;
            if (Array.isArray(type)) {
                selectedType = type[Math.floor(Math.random() * type.length)];
            }
            if (selectedType === 'random') selectedType = ['PINE', 'OAK', 'DEAD', 'BIRCH'][Math.floor(Math.random() * 4)];
            if (typeof selectedType !== 'string') selectedType = 'PINE';
            selectedType = selectedType.toUpperCase();

            const variant = i % 3;
            const key = `${selectedType}_${variant}`;

            if (!matrixBuckets[key]) matrixBuckets[key] = [];
            matrixBuckets[key].push(mat);

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
        const polyLen = polygon.length;

        for (let i = 0; i < polyLen; i++) {
            const p = polygon[i];
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.z < minZ) minZ = p.z;
            if (p.z > maxZ) maxZ = p.z;
        }

        const width = maxX - minX;
        const depth = maxZ - minZ;
        const area = width * depth;
        const count = Math.floor(area / (spacing * spacing));

        const matrixBuckets: Record<string, THREE.Matrix4[]> = {};

        for (let i = 0; i < count; i++) {
            const x = minX + Math.random() * width;
            const z = minZ + Math.random() * depth;

            if (isPointInPolygon(x, z, polygon)) {
                const scale = 0.8 + Math.random() * 0.6;
                const leanX = (Math.random() - 0.5) * 0.1;
                const leanZ = (Math.random() - 0.5) * 0.1;

                _pos.set(x, 0, z);
                _euler.set(leanX, Math.random() * PI2, leanZ);
                _quat.setFromEuler(_euler);
                _scale.setScalar(scale);

                const mat = new THREE.Matrix4();
                mat.compose(_pos, _quat, _scale);

                let selectedType = type;
                if (Array.isArray(type)) {
                    selectedType = type[Math.floor(Math.random() * type.length)];
                }
                if (selectedType === 'random') selectedType = ['PINE', 'OAK', 'DEAD', 'BIRCH'][Math.floor(Math.random() * 4)];
                if (typeof selectedType !== 'string') selectedType = 'PINE';
                selectedType = selectedType.toUpperCase();

                const variant = i % 3;
                const key = `${selectedType}_${variant}`;

                if (!matrixBuckets[key]) matrixBuckets[key] = [];
                matrixBuckets[key].push(mat);

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

    // --- ZERO-GC INSTANCING GENERATORS ---
    // Instead of gathering matrices and calling an external function, we build them natively.

    fillWheatField: (ctx: SectorContext, polygon: THREE.Vector3[], density: number = 0.5) => {
        if (!polygon || polygon.length < 3) return;

        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        const polyLen = polygon.length;
        for (let i = 0; i < polyLen; i++) {
            const p = polygon[i];
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.z < minZ) minZ = p.z;
            if (p.z > maxZ) maxZ = p.z;
        }

        const w = maxX - minX;
        const d = maxZ - minZ;
        const count = Math.floor(w * d * 0.5 * density);

        const mesh = new THREE.InstancedMesh(SHARED_GEO.grass, MATERIALS.grass, count);
        let valid = 0;

        for (let i = 0; i < count; i++) {
            const x = minX + Math.random() * w;
            const z = minZ + Math.random() * d;

            if (isPointInPolygon(x, z, polygon)) {
                _pos.set(x, 0, z);
                _euler.set(0, Math.random() * Math.PI, 0);
                _quat.setFromEuler(_euler);
                _scale.set(1, 1.5 + Math.random(), 1); // 1.5x Taller than normal grass

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

        if (Array.isArray(region)) {
            let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
            for (let i = 0; i < region.length; i++) {
                const p = region[i];
                if (p.x < minX) minX = p.x;
                if (p.x > maxX) maxX = p.x;
                if (p.z < minZ) minZ = p.z;
                if (p.z > maxZ) maxZ = p.z;
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
        const sStem = isSunflower ? new THREE.InstancedMesh(SHARED_GEO.sunflowerStem, SHARED_MAT.sunflowerStem, count) : undefined;
        const sHead = isSunflower ? new THREE.InstancedMesh(SHARED_GEO.sunflowerHead, SHARED_MAT.sunflowerHead, count) : undefined;
        const sCent = isSunflower ? new THREE.InstancedMesh(SHARED_GEO.sunflowerCenter, SHARED_MAT.sunflowerCenter, count) : undefined;

        if (isSunflower) {
            sStem!.userData.windAffected = true;
            sHead!.userData.windAffected = true;
            sCent!.userData.windAffected = true;
        }

        let valid = 0;

        for (let i = 0; i < count; i++) {
            const x = area.x + Math.random() * area.w;
            const z = area.z + Math.random() * area.d;

            if (Array.isArray(region) && !isPointInPolygon(x, z, region)) continue;

            _pos.set(x, 0, z);
            _euler.set(0, Math.random() * PI2, 0);
            _quat.setFromEuler(_euler);
            _scale.setScalar(0.8 + Math.random() * 0.5);

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

        if (Array.isArray(region)) {
            let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
            for (let i = 0; i < region.length; i++) {
                const p = region[i];
                if (p.x < minX) minX = p.x;
                if (p.x > maxX) maxX = p.x;
                if (p.z < minZ) minZ = p.z;
                if (p.z > maxZ) maxZ = p.z;
            }
            area = { x: minX, z: minZ, w: maxX - minX, d: maxZ - minZ };
            count = Math.floor((maxX - minX) * (maxZ - minZ) * density);
        } else {
            area = region;
            count = Math.floor(area.w * area.d * density);
        }

        const mesh = new THREE.InstancedMesh(SHARED_GEO.grass, MATERIALS.grass, count);
        let valid = 0;

        for (let i = 0; i < count; i++) {
            const x = area.x + Math.random() * area.w;
            const z = area.z + Math.random() * area.d;

            if (Array.isArray(region) && !isPointInPolygon(x, z, region)) continue;

            _pos.set(x, 0, z);
            _euler.set(0, Math.random() * PI2, 0);
            _quat.setFromEuler(_euler);
            _scale.setScalar(0.8 + Math.random() * 0.5);

            _mat.compose(_pos, _quat, _scale);
            mesh.setMatrixAt(valid++, _mat);
        }

        mesh.count = valid;
        mesh.receiveShadow = true;
        mesh.instanceMatrix.needsUpdate = true;
        ctx.scene.add(mesh);
    },

    createDeadTree: (variant: 'standing' | 'fallen' = 'standing', scale: number = 1.0): THREE.Group => {
        const tree = EnvironmentGenerator.createTree(TreeType.DEAD, scale, Math.floor(Math.random() * 3));
        if (variant === 'fallen') {
            tree.rotation.z = Math.PI / 2 + (Math.random() - 0.5) * 0.5;
            tree.position.y = 0.5 * scale;
        }
        return tree;
    },

    createDeforestation: (ctx: SectorContext, x: number, z: number, w: number, d: number, count: number) => {
        const matrixBuckets: Record<string, THREE.Matrix4[]> = {};

        for (let i = 0; i < count; i++) {
            const tx = x + (Math.random() - 0.5) * w;
            const tz = z + (Math.random() - 0.5) * d;

            const isFallen = Math.random() > 0.3;
            const scale = 0.8 + Math.random() * 0.5;

            // [VINTERDÖD] Zero-GC setup for dead trees
            _pos.set(tx, isFallen ? 0.5 * scale : 0, tz);

            if (isFallen) {
                _euler.set(0, Math.random() * PI2, Math.PI / 2 + (Math.random() - 0.5) * 0.5);
            } else {
                _euler.set(0, Math.random() * PI2, 0);
            }

            _quat.setFromEuler(_euler);
            _scale.setScalar(scale);

            const mat = new THREE.Matrix4();
            mat.compose(_pos, _quat, _scale);

            const variant = Math.floor(Math.random() * 3);
            const key = `DEAD_${variant}`;

            if (!matrixBuckets[key]) matrixBuckets[key] = [];
            matrixBuckets[key].push(mat);

            if (!isFallen) {
                SectorGenerator.addObstacle(ctx, {
                    position: new THREE.Vector3(tx, 0, tz),
                    collider: { type: 'cylinder', radius: 0.4, height: 4 },
                    id: `deforest_tree_${i}`
                });
            }
        }

        for (const key in matrixBuckets) {
            EnvironmentGenerator.addInstancedTrees(ctx, key, matrixBuckets[key]);
        }

        EnvironmentGenerator.fillArea(ctx, { x, z }, { width: w, height: d }, 15, 'debris');
    },

    fillArea: (ctx: SectorContext,
        centerOrArea: { x: number, z: number, w?: number, d?: number },
        sizeOrDensity: { width: number, height: number } | number,
        count?: number,
        type: 'tree' | 'rock' | 'debris' | 'grass' = 'tree',
        avoidCenterRadius: number = 0,
        exclusionZones: { pos: THREE.Vector3, radius: number }[] = []) => {

        if ((centerOrArea as any).w !== undefined && typeof sizeOrDensity === 'number' && count === undefined) {
            const area = centerOrArea as { x: number, z: number, w: number, d: number };
            const density = sizeOrDensity as number;

            const treeCount = Math.floor(area.w * area.d * 0.01 * density);
            EnvironmentGenerator.createForest(ctx, area, treeCount, 'PINE');

            const grassCount = Math.floor(area.w * area.d * 0.1 * density);
            const instGrass = new THREE.InstancedMesh(SHARED_GEO.grass, MATERIALS.grass, grassCount);
            const instFlower = new THREE.InstancedMesh(SHARED_GEO.grass, MATERIALS.flower, grassCount);

            let gV = 0, fV = 0;

            for (let i = 0; i < grassCount; i++) {
                const x = area.x + (Math.random() - 0.5) * area.w;
                const z = area.z + (Math.random() - 0.5) * area.d;

                _pos.set(x, 0, z);
                _euler.set(0, Math.random() * Math.PI, 0);
                _quat.setFromEuler(_euler);
                _scale.setScalar(0.8 + Math.random() * 0.5);
                _mat.compose(_pos, _quat, _scale);

                if (Math.random() > 0.9) instFlower.setMatrixAt(fV++, _mat);
                else instGrass.setMatrixAt(gV++, _mat);
            }

            instGrass.count = gV;
            instGrass.receiveShadow = true;
            instGrass.instanceMatrix.needsUpdate = true;

            instFlower.count = fV;
            instFlower.receiveShadow = true;
            instFlower.instanceMatrix.needsUpdate = true;

            ctx.scene.add(instGrass, instFlower);
            return;
        }

        const center = centerOrArea as { x: number, z: number };
        let w = 0, d = 0;
        if (typeof sizeOrDensity === 'number') { w = sizeOrDensity; d = sizeOrDensity; }
        else { w = sizeOrDensity.width; d = sizeOrDensity.height; }

        const area = { x: center.x, z: center.z, w, d };
        const numItems = count || 20;

        if (type === 'tree') {
            EnvironmentGenerator.createForest(ctx, area, numItems, 'PINE');
        } else if (type === 'rock' || type === 'debris') {
            const isRock = type === 'rock';
            const geo = isRock ? SHARED_GEO.rock : SHARED_GEO.debris;
            const mat = isRock ? MATERIALS.stone : MATERIALS.deadWood;

            const instMesh = new THREE.InstancedMesh(geo, mat, numItems);
            let valid = 0;

            for (let i = 0; i < numItems; i++) {
                const x = area.x + (Math.random() - 0.5) * area.w;
                const z = area.z + (Math.random() - 0.5) * area.d;

                if (avoidCenterRadius > 0 && Math.hypot(x - center.x, z - center.z) < avoidCenterRadius) continue;

                if (isRock) {
                    const s = 0.5 + Math.random() * 1.5;
                    _pos.set(x, s / 2, z);
                    _euler.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
                    _scale.setScalar(s);

                    SectorGenerator.addObstacle(ctx, {
                        position: new THREE.Vector3(x, s / 2, z),
                        collider: { type: 'sphere', radius: s }
                    });
                } else {
                    _pos.set(x, 0.05, z);
                    _euler.set(0, Math.random() * Math.PI, 0);
                    _scale.set(1, 1, 1);
                }

                _quat.setFromEuler(_euler);
                _mat.compose(_pos, _quat, _scale);
                instMesh.setMatrixAt(valid++, _mat);
            }

            if (valid > 0) {
                instMesh.count = valid;
                if (isRock) {
                    instMesh.castShadow = true;
                    instMesh.receiveShadow = true;
                }
                instMesh.instanceMatrix.needsUpdate = true;
                ctx.scene.add(instMesh);
            }
        }
    }
};

EnvironmentGenerator.initNaturePrototypes();