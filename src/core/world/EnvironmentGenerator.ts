import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MATERIALS } from '../../utils/assets/materials';
import { SectorContext } from '../../types/SectorEnvironment';
import { SectorGenerator } from './SectorGenerator';

// [VINTERDÖD] Pre-allokerade matte-objekt för brutal matris-komposition.
// Blixtsnabbt jämfört med att använda Object3D.updateMatrix().
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _euler = new THREE.Euler();
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

// [VINTERDÖD] Zero-GC polygon check. Tar in råa nummer istället för att kräva en "new Vector3".
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
// (Prototyperna genereras bara en gång vid uppstart, så här är allokeringar helt OK)

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
        // Lily pad geometry (slightly curved cylinder/disc)
        const padGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.05, 8);
        const pad = new THREE.Mesh(padGeo, MATERIALS.waterLily);
        pad.scale.set(1, 1, 0.8);
        group.add(pad);

        // Hanging Stem Geometry
        const stemLength = 1.5;
        const stemGeo = new THREE.CylinderGeometry(0.03, 0.03, stemLength, 4);
        stemGeo.translate(0, -stemLength / 2, 0);
        // Use seaweed material so it gets the underwater sway shader
        const stem = new THREE.Mesh(stemGeo, MATERIALS.seaweed);
        group.add(stem);

        // Flower
        if (Math.random() > 0.6) {
            const flowerGeo = new THREE.ConeGeometry(0.15, 0.2, 5);
            const flower = new THREE.Mesh(flowerGeo, MATERIALS.waterLilyFlower);
            flower.position.set(0.1, 0.1, 0.1);
            flower.rotation.set((Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.4);
            group.add(flower);
        }

        group.scale.setScalar(scale);
        group.userData.material = 'PLANT';
        group.userData.isBall = true; // Use this to allow water pushing logic
        group.userData.mass = 0.5; // Very light
        group.userData.floatOffset = 0.06; // Keep it visibly floating on top

        // Add stem connecting lily pad to the procedural lake bed
        /*
        const stemLen = currentDepth + 0.5; // Slightly longer for wave bobbing
        const stemGeo = new THREE.CylinderGeometry(0.04, 0.04, stemLen, 4);
        stemGeo.translate(0, -stemLen / 2, 0); // Origin at top
        const stemMat = MATERIALS.seaweed;
        const stem = new THREE.Mesh(stemGeo, stemMat);
        stem.userData.material = 'LEAVES';
        group.add(stem); // Attach to lily so it bobs with it!
        */

        return group;
    },

    createSeaweed: (width: number = 1.0, height: number = 2.0) => {
        const group = new THREE.Group();

        // [VINTERDÖD] Seaweed geo - more segments for better bending
        const geo = new THREE.PlaneGeometry(0.3 * width, height * 1.5, 2, 4);
        geo.translate(0, height * 0.75, 0);

        // Apply wind patch so seaweed sways like grass/vines
        const mat = MATERIALS.seaweed;

        const strands = 3 + Math.floor(Math.random() * 3);
        for (let i = 0; i < strands; i++) {
            const mesh = new THREE.Mesh(geo, mat);
            mesh.rotation.y = Math.random() * Math.PI;
            mesh.position.set((Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.4);
            // Different phase offsets for wind
            mesh.userData.windPhaseX = Math.random() * Math.PI * 2;
            mesh.userData.windPhaseZ = Math.random() * Math.PI * 2;
            group.add(mesh);
        }

        group.userData.material = 'LEAVES';
        // Add slightly wider non-visible collider
        group.userData.size = new THREE.Vector3(width * 0.8, height * 1.5, width * 0.8);
        return group;
    },

    initNaturePrototypes: async (yieldToMain?: () => Promise<void>) => {
        const VARIANTS = 3;
        for (let i = 0; i < VARIANTS; i++) {
            if (!prototypes[`PINE_${i}`]) prototypes[`PINE_${i}`] = generatePinePrototype(i);
            if (!prototypes[`SPRUCE_${i}`]) prototypes[`SPRUCE_${i}`] = generateSprucePrototype(i);
            if (!prototypes[`OAK_${i}`]) prototypes[`OAK_${i}`] = generateOakPrototype(i);
            if (!prototypes[`BIRCH_${i}`]) prototypes[`BIRCH_${i}`] = generateBirchPrototype(i);
            if (!prototypes[`DEAD_${i}`]) prototypes[`DEAD_${i}`] = generateDeadTreePrototype(i);
            if (yieldToMain) await yieldToMain();
        }
    },

    initPrototypes: async (yieldToMain?: () => Promise<void>) => {
        return EnvironmentGenerator.initNaturePrototypes(yieldToMain);
    },

    createMountain: (ctx: SectorContext, points: THREE.Vector3[], opening?: THREE.Group) => {
        if (!points || points.length < 2) return;

        const geometries: THREE.BufferGeometry[] = [];
        const curve = new THREE.CatmullRomCurve3(points);
        const length = curve.getLength();

        // One block every two meters along the line to build a completely solid wall
        const steps = Math.floor(length / 2.0);

        const openingPos = new THREE.Vector3();
        if (opening) opening.getWorldPosition(openingPos);

        // The clearance radius around the cave opening
        const caveClearanceRadiusSq = 16 * 16;

        // Deterministic pseudo-random (Zero-GC) so the mountain always looks the same
        const hash = (x: number) => {
            let n = Math.sin(x * 12.9898) * 43758.5453;
            return n - Math.floor(n);
        };

        // Added 'isPortal' flag so our manual portal blocks bypass the aggressive deletion
        const addRockBlock = (pos: THREE.Vector3, scale: THREE.Vector3, rot: THREE.Euler, type: 'dodeca' | 'icosa' = 'dodeca', isPortal: boolean = false) => {
            if (opening && !isPortal) {
                const dx = pos.x - openingPos.x;
                const dz = pos.z - openingPos.z;

                // Account for the physical size of the rock to prevent it bleeding into cave rooms
                const rockRadius = Math.max(scale.x, scale.z);
                const requiredClearance = 20 + rockRadius;

                if ((dx * dx + dz * dz) < (requiredClearance * requiredClearance)) {
                    return; // Delete any procedural rock that gets too close to the interior
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

            // 1. THE SHIELD WALL (Closest to the line)
            // Forms the playable boundary. Kept low to not block the camera.
            if (i % 2 === 0) {
                const scale = new THREE.Vector3(
                    4 + hash(i) * 2,
                    6 + hash(i + 1) * 4,  // Max Y scale = 10
                    4 + hash(i + 2) * 2
                );
                const maxRadius = Math.max(scale.x, scale.z);
                const safeOffset = maxRadius + 0.5;

                const pos = pt.clone().add(inwardDir.clone().multiplyScalar(safeOffset));
                pos.y = scale.y * 0.4;

                addRockBlock(pos, scale, new THREE.Euler(hash(i), hash(i + 1) * Math.PI, hash(i + 2)));
            }

            // 2. THE MIDDLE LAYER (Adds thickness)
            // Wider, but strictly capped in height to form a plateau.
            if (i % 3 === 0) {
                const scale = new THREE.Vector3(
                    8 + hash(i + 3) * 4,
                    8 + hash(i + 4) * 4, // Max Y scale = 12
                    8 + hash(i + 5) * 4
                );
                const maxRadius = Math.max(scale.x, scale.z);
                const safeOffset = 7.0 + maxRadius;

                const pos = pt.clone().add(inwardDir.clone().multiplyScalar(safeOffset));
                pos.y = scale.y * 0.3; // Push deeper into the ground

                addRockBlock(pos, scale, new THREE.Euler(hash(i + 3), hash(i + 4) * Math.PI, hash(i + 5)));
            }

            // 3. THE BACK FILLER (Replaced Peaks with wide Plateau blocks)
            // By making these wide but low, we block the void without blocking the top-down camera.
            if (i % 5 === 0) {
                const scale = new THREE.Vector3(
                    14 + hash(i + 6) * 6,
                    8 + hash(i + 7) * 4, // Low height! Max 12. No more spikes blocking the view.
                    14 + hash(i + 8) * 6
                );
                const maxRadius = Math.max(scale.x, scale.z);
                // Reduce depth slightly so it doesn't reach the cave rooms behind the wall
                const safeOffset = 12.0 + maxRadius;

                const pos = pt.clone().add(inwardDir.clone().multiplyScalar(safeOffset));
                pos.y = scale.y * 0.2;

                // Using Dodecahedron instead of Icosahedron to keep the top flatter
                const rot = new THREE.Euler(hash(i + 6) * 0.4, hash(i + 7) * Math.PI, hash(i + 8) * 0.4);
                addRockBlock(pos, scale, rot, 'dodeca');
            }
        }

        // --- SCULPT THE CAVE PORTAL MANUALLY ---
        if (opening) {
            // Base pillars (Kept shallow at Z = -2 so they don't block inner view)
            addRockBlock(openingPos.clone().add(new THREE.Vector3(-10, 5, -2)), new THREE.Vector3(6, 10, 8), new THREE.Euler(0.1, 0.4, -0.1), 'dodeca', true);
            addRockBlock(openingPos.clone().add(new THREE.Vector3(10, 5, -2)), new THREE.Vector3(6, 10, 8), new THREE.Euler(-0.1, -0.4, 0.1), 'dodeca', true);

            // The arch inner roof (Lowered Y significantly so camera sees over it)
            addRockBlock(openingPos.clone().add(new THREE.Vector3(-6, 10, -3)), new THREE.Vector3(6, 6, 8), new THREE.Euler(0.2, 0.2, -0.4), 'dodeca', true);
            addRockBlock(openingPos.clone().add(new THREE.Vector3(6, 10, -3)), new THREE.Vector3(6, 6, 8), new THREE.Euler(0.2, -0.2, 0.4), 'dodeca', true);
            addRockBlock(openingPos.clone().add(new THREE.Vector3(0, 12, -3)), new THREE.Vector3(8, 6, 9), new THREE.Euler(0.1, 0, 0), 'dodeca', true);

            // Filling/Forehead above the arch
            // Kept shallow (Z = -4) and very low height to act as a front facade only
            addRockBlock(openingPos.clone().add(new THREE.Vector3(-6, 14, -4)), new THREE.Vector3(10, 6, 8), new THREE.Euler(-0.2, 0.3, -0.1), 'dodeca', true);
            addRockBlock(openingPos.clone().add(new THREE.Vector3(6, 14, -4)), new THREE.Vector3(10, 6, 8), new THREE.Euler(-0.1, -0.4, 0.2), 'dodeca', true);
            addRockBlock(openingPos.clone().add(new THREE.Vector3(0, 16, -4)), new THREE.Vector3(12, 6, 8), new THREE.Euler(0, 0.1, 0), 'dodeca', true);
        }

        if (geometries.length === 0) return;

        let mountainGeo = BufferGeometryUtils.mergeGeometries(geometries);
        if (!mountainGeo) return;
        mountainGeo = mountainGeo.toNonIndexed();
        mountainGeo.computeVertexNormals();

        // --- COLORING (Low Poly Flat Shading) ---
        const count = mountainGeo.getAttribute('position').count;
        const colors = new Float32Array(count * 3);
        const finalPosAttr = mountainGeo.getAttribute('position');
        const normalAttr = mountainGeo.getAttribute('normal');
        const normal = new THREE.Vector3();
        const up = new THREE.Vector3(0, 1, 0);

        const COLORS = {
            SNOW: new THREE.Color(0xffffff),
            ROCK_LIGHT: new THREE.Color(0x888899),
            ROCK_DARK: new THREE.Color(0x444455),
        };

        for (let i = 0; i < count; i += 3) {
            const h = (finalPosAttr.getY(i) + finalPosAttr.getY(i + 1) + finalPosAttr.getY(i + 2)) / 3;
            normal.fromBufferAttribute(normalAttr, i);
            const upwardness = normal.dot(up);

            let r, g, b;

            // Adjusted snow heights for the new low plateau (snow appears lower down now)
            if ((upwardness > 0.65 && h > 6) || h > 12) {
                r = COLORS.SNOW.r;
                g = COLORS.SNOW.g;
                b = COLORS.SNOW.b;
            } else {
                const isLight = (normal.x * 0.5 + normal.z * 0.8) > 0;
                r = isLight ? COLORS.ROCK_LIGHT.r : COLORS.ROCK_DARK.r;
                g = isLight ? COLORS.ROCK_LIGHT.g : COLORS.ROCK_DARK.g;
                b = isLight ? COLORS.ROCK_LIGHT.b : COLORS.ROCK_DARK.b;
            }

            for (let j = 0; j < 3; j++) {
                const idx = (i + j) * 3;
                colors[idx] = r;
                colors[idx + 1] = g;
                colors[idx + 2] = b;
            }
        }

        mountainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const mountain = new THREE.Mesh(mountainGeo, MATERIALS.mountain);
        mountain.castShadow = true;
        mountain.receiveShadow = true;
        ctx.scene.add(mountain);
    },

    createMountainOpening: () => {
        const caveOpeningGroup = new THREE.Group();
        const tunnelDepth = 10;

        // 1. SKAPA DEN UTHUGGNA STENTUNNELN
        // Oregelbundna mått för att få en mer organisk/grottlik form
        const outW = 10;
        const inW = 6.5;
        const wallH = 6.5;
        const peakH = 12;
        const peakInH = 9;
        const topW = 4;
        const topInW = 2.5;

        const portalShape = new THREE.Shape();
        portalShape.moveTo(-outW, 0);
        portalShape.lineTo(-outW - 0.5, wallH); // Lite inbuktning
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

        const portalGeo = portalGeoExtruded.toNonIndexed();

        // Jitter: Skapa en ruffig, uthuggen yta inuti tunneln
        const posAttr = portalGeo.getAttribute('position');
        for (let i = 0; i < posAttr.count; i++) {
            const x = posAttr.getX(i);
            const y = posAttr.getY(i);

            // Jittra bara insidan (hålet) för att bevara de raka ytterväggarna mot det stora berget
            if (Math.abs(x) < outW - 1.0 && y < peakH - 1.0) {
                posAttr.setX(i, x + (Math.random() - 0.5) * 0.7);
                posAttr.setY(i, y + (Math.random() - 0.5) * 0.7);
            }
        }
        portalGeo.computeVertexNormals();

        // Färglägg tunneln exakt som berget för en sömlös övergång
        const count = portalGeo.getAttribute('position').count;
        const colors = new Float32Array(count * 3);
        const normalAttr = portalGeo.getAttribute('normal');
        const normal = new THREE.Vector3();

        const COLORS = {
            ROCK_LIGHT: new THREE.Color(0x888899),
            ROCK_DARK: new THREE.Color(0x444455),
        };

        for (let i = 0; i < count; i += 3) {
            normal.fromBufferAttribute(normalAttr, i);
            // Samma belysningslogik som berget (Flat Shading look)
            const isLight = (normal.x * 0.5 + normal.z * 0.8) > 0;
            const r = isLight ? COLORS.ROCK_LIGHT.r : COLORS.ROCK_DARK.r;
            const g = isLight ? COLORS.ROCK_LIGHT.g : COLORS.ROCK_DARK.g;
            const b = isLight ? COLORS.ROCK_LIGHT.b : COLORS.ROCK_DARK.b;

            for (let j = 0; j < 3; j++) {
                colors[(i + j) * 3] = r;
                colors[(i + j) * 3 + 1] = g;
                colors[(i + j) * 3 + 2] = b;
            }
        }
        portalGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const portal = new THREE.Mesh(portalGeo, MATERIALS.mountain);
        portal.castShadow = true;
        portal.receiveShadow = true;
        caveOpeningGroup.add(portal);

        // 2. TRÄBALKAR (Classic Mine Shaft)
        const logRadius = 0.5;
        const postHeight = wallH - 0.5;
        const framePositionsZ = [3.5, 0, -3.5]; // Placera tre ramar inuti tunneln

        // Välj trämaterial (vi använder treeTrunk som ser ut som runda stockar)
        const woodMat = MATERIALS.treeTrunk || MATERIALS.deadWood;

        framePositionsZ.forEach((fz) => {
            // Vänster pelare
            const postL = new THREE.Mesh(new THREE.CylinderGeometry(logRadius, logRadius, postHeight, 6), woodMat);
            postL.position.set(-inW + 1.0, postHeight / 2, fz);
            postL.rotation.y = Math.random() * Math.PI;
            postL.rotation.z = (Math.random() - 0.5) * 0.05; // Luta pyttelite för organisk känsla
            postL.castShadow = true;
            caveOpeningGroup.add(postL);

            // Höger pelare
            const postR = new THREE.Mesh(new THREE.CylinderGeometry(logRadius, logRadius, postHeight, 6), woodMat);
            postR.position.set(inW - 1.0, postHeight / 2, fz);
            postR.rotation.y = Math.random() * Math.PI;
            postR.rotation.z = (Math.random() - 0.5) * 0.05;
            postR.castShadow = true;
            caveOpeningGroup.add(postR);

            // Tvärbalk (Tak)
            const beamLen = (inW - 1.0) * 2 + 1.5;
            const topBeam = new THREE.Mesh(new THREE.CylinderGeometry(logRadius, logRadius, beamLen, 6), woodMat);
            topBeam.position.set(0, postHeight + logRadius - 0.2, fz);
            topBeam.rotation.z = Math.PI / 2;
            topBeam.rotation.x = Math.random() * Math.PI;
            topBeam.castShadow = true;
            caveOpeningGroup.add(topBeam);

            // Diagonal-strävor (Klassiska gruv-hörn)
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

        // Tvärgående takstockar som "håller upp" berget i taket
        // Vi loopar över Z-axeln (tunnelns djup) och lägger stockarna längs X-axeln
        const plankLength = (inW - 1.2) * 2;
        for (let z = -tunnelDepth / 2 + 0.5; z <= tunnelDepth / 2 - 0.5; z += 1.2) {
            const plank = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, plankLength, 5), woodMat);
            // Placeras strax ovanför de stora bärande ramarna
            plank.position.set(0, postHeight + logRadius * 2 - 0.2, z);

            // Rotera 90 grader runt Z för att lägga dem tvärs över tunneln (X-axeln)
            plank.rotation.z = Math.PI / 2;
            // Lite organisk vridning så de inte ligger onaturligt perfekt
            plank.rotation.x = (Math.random() - 0.5) * 0.2;

            plank.castShadow = true;
            caveOpeningGroup.add(plank);
        }

        return caveOpeningGroup;
    },

    createMountainOpeningInConrete: () => {
        const caveOpeningGroup = new THREE.Group();

        // 1. Brutalist, faceted concrete portal (matches low-poly mountains perfectly)
        const portalShape = new THREE.Shape();
        const outW = 8.5;  // Half-width outer
        const inW = 6;     // Half-width inner
        const wallH = 6;   // Straight wall height
        const peakH = 10;  // Total height outer
        const peakInH = 8; // Total height inner
        const topW = 4;    // Half-width flat top outer
        const topInW = 2.5;// Half-width flat top inner

        // Outer contour (Faceted arch instead of smooth curve)
        portalShape.moveTo(-outW, 0);
        portalShape.lineTo(-outW, wallH);
        portalShape.lineTo(-topW, peakH);
        portalShape.lineTo(topW, peakH);
        portalShape.lineTo(outW, wallH);
        portalShape.lineTo(outW, 0);
        portalShape.lineTo(-outW, 0);

        // Inner hole contour (Faceted design)
        const holePath = new THREE.Path();
        holePath.moveTo(inW, 0);
        holePath.lineTo(inW, wallH - 0.5);
        holePath.lineTo(topInW, peakInH);
        holePath.lineTo(-topInW, peakInH);
        holePath.lineTo(-inW, wallH - 0.5);
        holePath.lineTo(-inW, 0);
        holePath.lineTo(inW, 0);
        portalShape.holes.push(holePath);

        // Create the tunnel (depth 8 to anchor it deeply into the mountain)
        const tunnelDepth = 8;
        const extrudeSettings = { depth: tunnelDepth, steps: 2, bevelEnabled: false };
        const portalGeoExtruded = new THREE.ExtrudeGeometry(portalShape, extrudeSettings);
        portalGeoExtruded.translate(0, 0, -tunnelDepth / 2);
        const portalGeo = portalGeoExtruded.index ? portalGeoExtruded.toNonIndexed() : portalGeoExtruded;

        // Setup flat-shaded concrete material
        if (!MATERIALS.concreteDoubleSided) {
            MATERIALS.concreteDoubleSided = MATERIALS.concrete.clone();
            MATERIALS.concreteDoubleSided.side = THREE.DoubleSide;
            MATERIALS.concreteDoubleSided.flatShading = true;
        }

        const portal = new THREE.Mesh(portalGeo, MATERIALS.concreteDoubleSided);
        portal.castShadow = true;
        portal.receiveShadow = true;
        caveOpeningGroup.add(portal);

        // 2. Reinforcement beams / Industrial bunker feel
        // Using steel material for structural details
        const ribMat = MATERIALS.steel || MATERIALS.concreteDoubleSided;

        // Left support beam
        const ribL = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, tunnelDepth + 1), ribMat);
        ribL.position.set(-topInW - 1.0, peakInH - 0.5, 0);
        ribL.rotation.z = 0.75;
        ribL.castShadow = true;
        caveOpeningGroup.add(ribL);

        // Right support beam
        const ribR = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, tunnelDepth + 1), ribMat);
        ribR.position.set(topInW + 1.0, peakInH - 0.5, 0);
        ribR.rotation.z = -0.75;
        ribR.castShadow = true;
        caveOpeningGroup.add(ribR);

        // Top support beam
        const ribTop = new THREE.Mesh(new THREE.BoxGeometry(topInW * 2 + 2, 1.2, tunnelDepth + 1), ribMat);
        ribTop.position.set(0, peakInH - 0.2, 0);
        ribTop.castShadow = true;
        caveOpeningGroup.add(ribTop);

        // Floor threshold to ground the portal
        const threshold = new THREE.Mesh(new THREE.BoxGeometry(outW * 2 + 2, 0.5, tunnelDepth + 2), MATERIALS.concreteDoubleSided);
        threshold.position.set(0, 0.25, 0);
        threshold.receiveShadow = true;
        caveOpeningGroup.add(threshold);

        return caveOpeningGroup;
    },

    createRock: (width: number, height: number, sharpness: number = 0.5) => {
        const group = new THREE.Group();
        const mat = MATERIALS.stone;

        const r = width * 0.4;
        const geo = new THREE.DodecahedronGeometry(r, 0);

        const sx = 1.0 + (Math.random() - 0.5) * 0.4;
        const sz = 1.0 + (Math.random() - 0.5) * 0.4;
        const sy = (height / width) * (1.0 + (Math.random() - 0.5) * 0.4);

        const mesh = new THREE.Mesh(geo, mat);
        mesh.scale.set(sx, sy, sz);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        group.add(mesh);

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
        trunkMesh.castShadow = !materialOverride;
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
            }
        }

        let snowMesh: THREE.InstancedMesh | undefined;
        if (proto.snowGeo && !materialOverride) {
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
        mesh.castShadow = false;

        for (let i = 0; i < matrices.length; i++) {
            mesh.setMatrixAt(i, matrices[i]);
        }
        mesh.instanceMatrix.needsUpdate = true;
        ctx.scene.add(mesh);
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

            // [VINTERDÖD] Zero-GC matrisbyggande utan Object3D.
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
                quaternion: new THREE.Quaternion(), // Trädens colliders står alltid upprätt
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

        // [VINTERDÖD] Bort med forEach!
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

            // [VINTERDÖD] Skicka nummer, inte ett nytt objekt.
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

        const matrices: THREE.Matrix4[] = [];

        for (let i = 0; i < count; i++) {
            const x = minX + Math.random() * w;
            const z = minZ + Math.random() * d;

            if (isPointInPolygon(x, z, polygon)) {
                _pos.set(x, 0, z);
                _euler.set(0, Math.random() * Math.PI, 0);
                _quat.setFromEuler(_euler);
                _scale.set(1, 1.5 + Math.random(), 1);

                const mat = new THREE.Matrix4();
                mat.compose(_pos, _quat, _scale);
                matrices.push(mat);
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
            tree.rotation.y = Math.random() * PI2;

            ctx.scene.add(tree);

            if (!isFallen) {
                SectorGenerator.addObstacle(ctx, {
                    position: new THREE.Vector3(tx, 0, tz),
                    collider: { type: 'cylinder', radius: 0.4, height: 4 }
                });
            }
        }

        EnvironmentGenerator.fillArea(ctx, { x, z }, { width: w, height: d }, 15, 'debris');
    },

    fillAreaWithFlowers: (ctx: SectorContext,
        region: { x: number, z: number, w: number, d: number } | THREE.Vector3[],
        countOrDensity: number) => {
        let area: { x: number, z: number, w: number, d: number };
        let count = 0;

        if (Array.isArray(region)) {
            let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
            const polyLen = region.length;
            for (let i = 0; i < polyLen; i++) {
                const p = region[i];
                if (p.x < minX) minX = p.x;
                if (p.x > maxX) maxX = p.x;
                if (p.z < minZ) minZ = p.z;
                if (p.z > maxZ) maxZ = p.z;
            }
            const w = maxX - minX;
            const d = maxZ - minZ;
            count = Math.floor(w * d * countOrDensity);
            area = { x: minX, z: minZ, w, d };
        } else {
            area = region;
            count = countOrDensity;
        }

        const matrices: THREE.Matrix4[] = [];

        for (let i = 0; i < count; i++) {
            const x = area.x + Math.random() * area.w;
            const z = area.z + Math.random() * area.d;

            if (Array.isArray(region) && !isPointInPolygon(x, z, region)) continue;

            _pos.set(x, 0, z);
            _euler.set(0, Math.random() * PI2, 0);
            _quat.setFromEuler(_euler);
            _scale.setScalar(0.8 + Math.random() * 0.5);

            const mat = new THREE.Matrix4();
            mat.compose(_pos, _quat, _scale);
            matrices.push(mat);
        }

        EnvironmentGenerator.addInstancedGrass(ctx, matrices, true);
    },

    fillAreaWithGrass: (ctx: SectorContext, region: { x: number, z: number, w: number, d: number } | THREE.Vector3[], density: number = 2.0) => {
        let area: { x: number, z: number, w: number, d: number };
        let count = 0;

        if (Array.isArray(region)) {
            let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
            const polyLen = region.length;
            for (let i = 0; i < polyLen; i++) {
                const p = region[i];
                if (p.x < minX) minX = p.x;
                if (p.x > maxX) maxX = p.x;
                if (p.z < minZ) minZ = p.z;
                if (p.z > maxZ) maxZ = p.z;
            }
            count = Math.floor((maxX - minX) * (maxZ - minZ) * density);
            area = { x: minX, z: minZ, w: maxX - minX, d: maxZ - minZ };
        } else {
            area = region;
            count = Math.floor(area.w * area.d * density);
        }

        const matrices: THREE.Matrix4[] = [];

        for (let i = 0; i < count; i++) {
            const x = area.x + Math.random() * area.w;
            const z = area.z + Math.random() * area.d;

            if (Array.isArray(region) && !isPointInPolygon(x, z, region)) continue;

            _pos.set(x, 0, z);
            _euler.set(0, Math.random() * PI2, 0);
            _quat.setFromEuler(_euler);
            _scale.setScalar(0.8 + Math.random() * 0.5);

            const mat = new THREE.Matrix4();
            mat.compose(_pos, _quat, _scale);
            matrices.push(mat);
        }
        EnvironmentGenerator.addInstancedGrass(ctx, matrices, false);
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
            const grassMatrices: THREE.Matrix4[] = [];
            const flowerMatrices: THREE.Matrix4[] = [];

            for (let i = 0; i < grassCount; i++) {
                const x = area.x + (Math.random() - 0.5) * area.w;
                const z = area.z + (Math.random() - 0.5) * area.d;

                _pos.set(x, 0, z);
                _euler.set(0, Math.random() * Math.PI, 0);
                _quat.setFromEuler(_euler);
                _scale.setScalar(0.8 + Math.random() * 0.5);

                const mat = new THREE.Matrix4();
                mat.compose(_pos, _quat, _scale);

                if (Math.random() > 0.9) flowerMatrices.push(mat);
                else grassMatrices.push(mat);
            }
            EnvironmentGenerator.addInstancedGrass(ctx, grassMatrices, false);
            EnvironmentGenerator.addInstancedGrass(ctx, flowerMatrices, true);
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
        } else if (type === 'rock') {
            for (let i = 0; i < numItems; i++) {
                const x = area.x + (Math.random() - 0.5) * area.w;
                const z = area.z + (Math.random() - 0.5) * area.d;

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
            for (let i = 0; i < numItems; i++) {
                const x = area.x + (Math.random() - 0.5) * area.w;
                const z = area.z + (Math.random() - 0.5) * area.d;
                if (avoidCenterRadius > 0 && Math.hypot(x - center.x, z - center.z) < avoidCenterRadius) continue;

                const plank = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 0.3), MATERIALS.deadWood);
                plank.position.set(x, 0.05, z);
                plank.rotation.y = Math.random() * Math.PI;
                ctx.scene.add(plank);
            }
        }
    }
};

EnvironmentGenerator.initNaturePrototypes();