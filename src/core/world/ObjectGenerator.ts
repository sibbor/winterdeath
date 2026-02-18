import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createProceduralDiffuse, MATERIALS, GEOMETRY, ModelFactory, createSignMesh, createTextSprite } from '../../utils/assets';
import { SectorContext } from '../../types/SectorEnvironment';
import { ZOMBIE_TYPES } from '../../content/enemies/zombies';
import { EffectManager } from '../systems/EffectManager';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
// Reused to prevent garbage collection stutter during mass-instancing
const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _rotation = new THREE.Euler();
const _quat = new THREE.Quaternion();

// Lazy load textures
let sharedTextures: any = null;
const getSharedTextures = () => {
    if (!sharedTextures) sharedTextures = createProceduralDiffuse();
    return sharedTextures;
};

// --- [VINTERDÖD] MATERIAL CACHE ---
// Prevents massive GPU memory leaks and stuttering by reusing materials
// instead of creating 'new THREE.Material' inside generator functions.
let fenceMat: THREE.MeshStandardMaterial | null = null;
let boatMat: THREE.MeshStandardMaterial | null = null;

const LOCAL_MATS = {
    litWindow: new THREE.MeshStandardMaterial({ color: 0xffffaa, emissive: 0xffffaa, emissiveIntensity: 1 }),
    darkWindow: new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9, metalness: 0.1 }),
    upWindow: new THREE.MeshStandardMaterial({ color: 0xffffaa, emissive: 0xffffaa, emissiveIntensity: 0.5 }),
    vehicleWindow: new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.1, metalness: 0.9, transparent: true, opacity: 0.7 }),
    tractorWheel: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 }),
    sirenBase: new THREE.MeshStandardMaterial({ color: 0x111111 }),
    sirenBlue: new THREE.MeshStandardMaterial({ color: 0x0044ff, emissive: 0x0022ff, emissiveIntensity: 2 }),
    sirenRed: new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xaa0000, emissiveIntensity: 2 }),
    caveLampBulb: new THREE.MeshStandardMaterial({ color: 0xffffaa, emissive: 0xffffaa, emissiveIntensity: 2 }),
    caveLampCage: new THREE.MeshStandardMaterial({ color: 0x333333, wireframe: true })
};

// Dynamic caches for colored objects
const vehicleBodyCache: Record<number, THREE.MeshStandardMaterial> = {};
const neonHeartCache: Record<number, THREE.MeshBasicMaterial> = {};


export const ObjectGenerator = {

    createHedge: (length: number = 2.0, height: number = 1.2, thickness: number = 0.8) => {
        const group = new THREE.Group();
        // Använder det vind-patchade materialet direkt från MATERIALS!
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(thickness, height, length), MATERIALS.hedge);
        mesh.position.y = height / 2;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);

        const leafGeo = new THREE.BoxGeometry(thickness * 1.1, height * 0.2, length * 0.2);
        for (let i = 0; i < 5; i++) {
            const leaf = new THREE.Mesh(leafGeo, MATERIALS.hedge);
            leaf.position.set((Math.random() - 0.5) * 0.1, Math.random() * height, (Math.random() - 0.5) * length);
            group.add(leaf);
        }
        group.userData.material = 'WOOD';
        return group;
    },

    createFence: (length: number = 3.0) => {
        const group = new THREE.Group();

        // Lazy load & tint wood texture specifically for fences
        if (!fenceMat) {
            fenceMat = MATERIALS.wood.clone();
            fenceMat.color.setHex(0x4a3728);
        }

        const postGeo = new THREE.BoxGeometry(0.2, 1.2, 0.2);
        const p1 = new THREE.Mesh(postGeo, fenceMat); p1.position.set(0, 0.6, -length / 2); group.add(p1);
        const p2 = new THREE.Mesh(postGeo, fenceMat); p2.position.set(0, 0.6, length / 2); group.add(p2);

        const railGeo = new THREE.BoxGeometry(0.1, 0.15, length);
        const r1 = new THREE.Mesh(railGeo, fenceMat); r1.position.set(0, 0.4, 0); group.add(r1);
        const r2 = new THREE.Mesh(railGeo, fenceMat); r2.position.set(0, 0.9, 0); group.add(r2);

        group.userData.material = 'WOOD';
        return group;
    },

    createMeshFence: (length: number = 3.0, height: number = 2.5) => {
        const group = new THREE.Group();
        const postMat = MATERIALS.steel;
        const meshMat = MATERIALS.fenceMesh;

        const postGeo = new THREE.BoxGeometry(0.12, height, 0.12);
        const p1 = new THREE.Mesh(postGeo, postMat); p1.position.set(0, height / 2, -length / 2); group.add(p1);
        const p2 = new THREE.Mesh(postGeo, postMat); p2.position.set(0, height / 2, length / 2); group.add(p2);

        const planeGeo = new THREE.PlaneGeometry(length, height * 0.9);
        const mesh = new THREE.Mesh(planeGeo, meshMat);
        mesh.rotation.y = Math.PI / 2;
        mesh.position.set(0, height * 0.48, 0);
        group.add(mesh);

        const railGeo = new THREE.CylinderGeometry(0.04, 0.04, length);
        const rail = new THREE.Mesh(railGeo, postMat);
        rail.rotation.x = Math.PI / 2;
        rail.position.set(0, height * 0.95, 0);
        group.add(rail);

        group.userData.material = 'METAL';
        return group;
    },

    createTrainTunnel: (points: THREE.Vector3[]) => {
        if (!points || points.length < 2) return new THREE.Group();

        const tunnelWidthOuter = 16;
        const tunnelHeightWalls = 7;
        const tunnelArchRise = 5;
        const tunnelThickness = 2;
        const tunnelDepth = 30;

        const start = points[0];
        const end = points[points.length - 1];
        const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);

        const tunnelGroup = new THREE.Group();
        tunnelGroup.position.copy(mid);
        tunnelGroup.lookAt(end);

        const halfWidthO = tunnelWidthOuter / 2;
        const controlPointY_O = tunnelHeightWalls + (tunnelArchRise * 2);

        const archShape = new THREE.Shape();
        archShape.moveTo(-halfWidthO, 0);
        archShape.lineTo(-halfWidthO, tunnelHeightWalls);
        archShape.quadraticCurveTo(0, controlPointY_O, halfWidthO, tunnelHeightWalls);
        archShape.lineTo(halfWidthO, 0);
        archShape.lineTo(-halfWidthO, 0);

        const halfWidthI = halfWidthO - tunnelThickness;
        const wallHeightI = tunnelHeightWalls;
        const controlPointY_I = controlPointY_O - tunnelThickness;

        const holePath = new THREE.Path();
        holePath.moveTo(halfWidthI, 0);
        holePath.lineTo(halfWidthI, wallHeightI);
        holePath.quadraticCurveTo(0, controlPointY_I, -halfWidthI, wallHeightI);
        holePath.lineTo(-halfWidthI, 0);
        holePath.lineTo(halfWidthI, 0);

        archShape.holes.push(holePath);

        const archGeo = new THREE.ExtrudeGeometry(archShape, { depth: tunnelDepth, steps: 1, bevelEnabled: false });
        archGeo.translate(0, 0, -tunnelDepth / 2);

        const tunnelMat = MATERIALS.concrete.clone();
        tunnelMat.side = THREE.DoubleSide;
        tunnelGroup.add(new THREE.Mesh(archGeo, tunnelMat));

        const floorGeo = new THREE.PlaneGeometry(halfWidthI * 2, tunnelDepth);
        const gravelMat = MATERIALS.gravel.clone();
        if (gravelMat.map) {
            gravelMat.map.wrapS = gravelMat.map.wrapT = THREE.RepeatWrapping;
            gravelMat.map.repeat.set(halfWidthI, tunnelDepth / 2);
        }
        const floor = new THREE.Mesh(floorGeo, gravelMat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = 0.02;
        tunnelGroup.add(floor);

        return tunnelGroup;
    },

    createBarrel: (explosive: boolean = false) => {
        const group = new THREE.Group();
        const mat = explosive ? MATERIALS.barrelExplosive : MATERIALS.barrel;
        const mesh = new THREE.Mesh(GEOMETRY.barrel, mat);
        mesh.position.y = 0.75;
        mesh.castShadow = true;
        group.add(mesh);
        group.userData.material = 'METAL';
        return group;
    },

    createStreetLamp: () => {
        const group = new THREE.Group();
        const poleGeo = new THREE.CylinderGeometry(0.1, 0.2, 8).translate(0, 4, 0);
        const armGeo = new THREE.BoxGeometry(0.2, 0.2, 2).translate(0, 7.5, 0.5);
        const headGeo = new THREE.BoxGeometry(0.6, 0.2, 0.8).translate(0, 7.5, 1.5);

        const mergedGeo = BufferGeometryUtils.mergeGeometries([poleGeo, armGeo, headGeo]);
        const lampMesh = new THREE.Mesh(mergedGeo, MATERIALS.blackMetal);
        lampMesh.castShadow = true;
        group.add(lampMesh);

        const light = new THREE.PointLight(0xaaddff, 4, 30);
        light.position.set(0, 7.4, 1.5);
        group.add(light);

        group.userData.material = 'METAL';
        return group;
    },

    createBuilding: (width: number, height: number, depth: number, color: number, createRoof: boolean = true, withLights: boolean = false, lightProbability: number = 0.5) => {
        const group = new THREE.Group();
        const material = MATERIALS.brick.clone();
        material.color.setHex(color);

        let bodyGeo = new THREE.BoxGeometry(width, height, depth);
        bodyGeo.translate(0, height / 2, 0);
        const nonIndexedBody = bodyGeo.index ? bodyGeo.toNonIndexed() : bodyGeo.clone();

        let mergedGeometry: THREE.BufferGeometry | null = null;
        let actualRoofHeight = 0;

        if (createRoof) {
            actualRoofHeight = height * 0.5;
            const shape = new THREE.Shape();
            shape.moveTo(-width / 2, 0);
            shape.lineTo(width / 2, 0);
            shape.lineTo(0, actualRoofHeight);
            shape.closePath();

            let roofGeo = new THREE.ExtrudeGeometry(shape, { depth: depth, bevelEnabled: false });
            roofGeo.translate(0, height, -depth / 2);
            const nonIndexedRoof = roofGeo.index ? roofGeo.toNonIndexed() : roofGeo.clone();

            mergedGeometry = BufferGeometryUtils.mergeGeometries([nonIndexedBody, nonIndexedRoof]);

            roofGeo.dispose();
            nonIndexedRoof.dispose();
        } else {
            mergedGeometry = nonIndexedBody.clone();
        }

        if (mergedGeometry) {
            mergedGeometry = BufferGeometryUtils.mergeVertices(mergedGeometry);
            mergedGeometry.computeVertexNormals();
        }

        const building = new THREE.Mesh(mergedGeometry || nonIndexedBody, material);
        building.castShadow = true;
        building.receiveShadow = true;
        group.add(building);

        if (withLights) {
            const winGeo = new THREE.PlaneGeometry(1.2, 1.5);
            let litCount = 0;
            let darkCount = 0;

            for (let x = -width / 2 + 2; x < width / 2 - 1; x += 4) {
                for (let y = 2; y < height - 1; y += 4) {
                    if (Math.random() < lightProbability) litCount++;
                    else darkCount++;
                }
            }

            if (litCount > 0) {
                const litWindows = new THREE.InstancedMesh(winGeo, LOCAL_MATS.litWindow, litCount);
                let idx = 0;
                for (let x = -width / 2 + 2; x < width / 2 - 1; x += 4) {
                    for (let y = 2; y < height - 1; y += 4) {
                        if (Math.random() < lightProbability) {
                            _matrix.makeTranslation(x, y, depth / 2 + 0.05);
                            litWindows.setMatrixAt(idx++, _matrix);
                        }
                    }
                }
                litWindows.instanceMatrix.needsUpdate = true;
                group.add(litWindows);
            }

            if (darkCount > 0) {
                const darkWindows = new THREE.InstancedMesh(winGeo, LOCAL_MATS.darkWindow, darkCount);
                let idx = 0;
                for (let x = -width / 2 + 2; x < width / 2 - 1; x += 4) {
                    for (let y = 2; y < height - 1; y += 4) {
                        if (Math.random() >= lightProbability) {
                            _matrix.makeTranslation(x, y, depth / 2 + 0.05);
                            darkWindows.setMatrixAt(idx++, _matrix);
                        }
                    }
                }
                darkWindows.instanceMatrix.needsUpdate = true;
                group.add(darkWindows);
            }
        }

        group.userData = {
            size: new THREE.Vector3(width, height + actualRoofHeight, depth),
            material: 'CONCRETE'
        };

        bodyGeo.dispose();
        nonIndexedBody.dispose();

        return group;
    },

    createShelf: (scale: number = 1.0) => {
        const group = new THREE.Group();
        const mat = MATERIALS.treeTrunk;

        const w = 2.0, h = 2.0, d = 0.5;
        const sideGeo = new THREE.BoxGeometry(0.1, h, d);
        group.add(new THREE.Mesh(sideGeo, mat).translateX(-w / 2).translateY(h / 2));
        group.add(new THREE.Mesh(sideGeo, mat).translateX(w / 2).translateY(h / 2));

        const shelfGeo = new THREE.BoxGeometry(w, 0.1, d);
        const propGeo = new THREE.BoxGeometry(0.2, 0.2, 0.2);

        for (let y = 0.1; y < h; y += 0.6) {
            const s = new THREE.Mesh(shelfGeo, mat);
            s.position.set(0, y, 0);
            s.castShadow = true;
            group.add(s);

            if (Math.random() > 0.3) {
                const numProps = Math.floor(Math.random() * 4);
                for (let i = 0; i < numProps; i++) {
                    const prop = new THREE.Mesh(propGeo, MATERIALS.barrel);
                    prop.position.set((Math.random() - 0.5) * w * 0.8, y + 0.15, (Math.random() - 0.5) * d * 0.6);
                    group.add(prop);
                }
            }
        }
        group.scale.setScalar(scale);
        return group;
    },

    createBoat(): THREE.Mesh {
        // Lazy load & tint specifically for the boat hull
        if (!boatMat) {
            boatMat = MATERIALS.wood.clone();
            boatMat.color.setHex(0x5a3d2b);
            boatMat.roughness = 0.85;
            boatMat.metalness = 0.0;
            boatMat.flatShading = true;
            boatMat.needsUpdate = true;
        }

        const parts: THREE.BufferGeometry[] = [];

        const addPart = (w: number, h: number, d: number, tx: number, ty: number, tz: number, rx = 0, ry = 0, rz = 0) => {
            const geo = new THREE.BoxGeometry(w, h, d);
            geo.rotateY(ry);
            geo.rotateX(rx);
            geo.rotateZ(rz);
            geo.translate(tx, ty, tz);
            parts.push(geo);
        };

        const hullLength = 6.5;

        addPart(0.15, 0.3, hullLength + 0.5, 0, -0.2, 0);
        addPart(0.9, 0.08, hullLength, 0.4, -0.05, 0, 0, 0, 0.15);
        addPart(0.9, 0.08, hullLength, -0.4, -0.05, 0, 0, 0, -0.15);
        addPart(0.1, 0.7, hullLength + 0.2, 0.85, 0.3, 0, 0, 0, -0.4);
        addPart(0.1, 0.7, hullLength + 0.2, -0.85, 0.3, 0, 0, 0, 0.4);
        addPart(0.1, 0.6, hullLength + 0.4, 1.1, 0.7, 0, 0, 0, -0.25);
        addPart(0.1, 0.6, hullLength + 0.4, -1.1, 0.7, 0, 0, 0, 0.25);

        const bowZ = 1.0 + hullLength / 2;
        addPart(0.1, 0.7, 2.5, 0.5, 0.35, bowZ, 0, -0.6, -0.3);
        addPart(0.1, 0.7, 2.5, -0.5, 0.35, bowZ, 0, 0.6, 0.3);
        addPart(0.1, 0.6, 2.8, 0.6, 0.75, bowZ - 0.1, 0, -0.55, -0.2);
        addPart(0.1, 0.6, 2.8, -0.6, 0.75, bowZ - 0.1, 0, 0.55, 0.2);
        addPart(0.2, 1.2, 0.25, 0, 0.4, bowZ, 0.1, 0, 0);

        addPart(2.4, 1.0, 0.15, 0, 0.5, hullLength / 2 + 0.1, -0.2, 0, 0);
        addPart(1.2, 0.05, 4.0, 0, 0.05, 0.5);
        addPart(2.2, 0.08, 0.6, 0, 0.6, 1.8);
        addPart(2.3, 0.08, 0.7, 0, 0.6, -0.5);
        addPart(1.5, 0.08, 0.5, 0, 0.65, -2.8);
        addPart(0.15, 0.05, hullLength + 2.5, 1.25, 1.0, -0.5, 0, 0, -0.25);
        addPart(0.15, 0.05, hullLength + 2.5, -1.25, 1.0, -0.5, 0, 0, 0.25);
        addPart(2.5, 0.05, 0.15, 0, 0.95, hullLength / 2 + 0.15, -0.2, 0, 0);

        const mergedGeometry = BufferGeometryUtils.mergeGeometries(parts, false);
        for (let i = 0; i < parts.length; i++) parts[i].dispose();

        const boatMesh = new THREE.Mesh(mergedGeometry, boatMat);
        boatMesh.castShadow = true;
        boatMesh.receiveShadow = true;

        return boatMesh;
    },

    createVehicle: (type = 'station wagon', scale = 1.0, colorOverride?: number, addSnow = true) => {
        const vehicleBody = new THREE.Group();

        const isBrokenGlass = Math.random() > 0.5;
        const isDoorOpen = Math.random() > 0.7;
        const doorAngle = (Math.random() * 0.6) + 0.2;

        const colors = [0x7c2e2e, 0x3e4c5e, 0x8c8c7a, 0x4a5c4a, 0x8b5a2b, 0x5d4037];
        let bodyColor = colorOverride ?? colors[Math.floor(Math.random() * colors.length)];

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
        if (s.body) bodyColor = s.body;

        // Fetch from cache instead of cloning
        if (!vehicleBodyCache[bodyColor]) {
            const mat = MATERIALS.vehicleBody.clone();
            mat.color.setHex(bodyColor);
            vehicleBodyCache[bodyColor] = mat;
        }
        const matBody = vehicleBodyCache[bodyColor];

        // Chassis
        const chassis = new THREE.Mesh(new THREE.BoxGeometry(s.c[0], s.c[1], s.c[2]), matBody);
        chassis.position.y = s.c[1] / 2 + 0.3;
        chassis.castShadow = true;
        vehicleBody.add(chassis);

        // Cabin
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(s.k[0], s.k[1], s.k[2] * 0.95), matBody);
        cabin.position.set(s.ko[0], s.ko[1], 0);
        cabin.castShadow = true;
        vehicleBody.add(cabin);

        // Windshield
        if (!isBrokenGlass || Math.random() > 0.5) {
            const frontWindow = new THREE.Mesh(new THREE.BoxGeometry(0.05, s.k[1] * 0.8, s.k[2] * 0.9), LOCAL_MATS.vehicleWindow);
            frontWindow.position.set(s.ko[0] + s.k[0] / 2 + 0.01, s.ko[1], 0);
            vehicleBody.add(frontWindow);
        }

        // Bus Specifics
        if (type === 'bus') {
            const windowStrip = new THREE.Mesh(new THREE.BoxGeometry(s.c[0] * 0.85, s.c[1] * 0.35, s.c[2] + 0.02), LOCAL_MATS.vehicleWindow);
            windowStrip.position.set(0, s.c[1] / 2 + 0.2, 0);
            vehicleBody.add(windowStrip);

            const sign = createSignMesh("159", 2.0, 0.6, '#ffaa00', '#000000');
            sign.position.set(s.c[0] / 2 + 0.05, s.c[1] - 0.2, 0);
            sign.rotation.y = Math.PI / 2;
            vehicleBody.add(sign);
        }

        // Door (Open logic)
        const doorGeo = new THREE.BoxGeometry(s.k[0] * 0.4, s.k[1], 0.05);
        const leftDoor = new THREE.Mesh(doorGeo, matBody);
        leftDoor.position.set(s.k[0] * 0.2, 0, 0);
        const doorGroup = new THREE.Group();
        doorGroup.add(leftDoor);
        doorGroup.position.set(s.ko[0] + s.k[0] * 0.1, s.ko[1], s.c[2] / 2);
        if (isDoorOpen) doorGroup.rotation.y = doorAngle;
        vehicleBody.add(doorGroup);

        // Sirens
        if (s.isEmergency) {
            const sirenBase = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.15, s.k[2] * 0.8), LOCAL_MATS.sirenBase);
            sirenBase.position.set(s.ko[0], s.ko[1] + s.k[1] / 2 + 0.05, 0);
            vehicleBody.add(sirenBase);

            const blueLight = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.3), LOCAL_MATS.sirenBlue);
            blueLight.position.set(s.ko[0], s.ko[1] + s.k[1] / 2 + 0.15, s.k[2] * 0.2);
            vehicleBody.add(blueLight);

            const redLight = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.3), LOCAL_MATS.sirenRed);
            redLight.position.set(s.ko[0], s.ko[1] + s.k[1] / 2 + 0.15, -s.k[2] * 0.2);
            vehicleBody.add(redLight);

            const light = new THREE.PointLight(0x0044ff, 5, 10);
            light.position.set(s.ko[0], s.ko[1] + s.k[1] / 2 + 0.5, 0);
            vehicleBody.add(light);
        }

        // Snow layer
        if (addSnow) {
            const snowRoof = new THREE.Mesh(new THREE.BoxGeometry(s.k[0] * 1.05, 0.1, s.k[2] * 1.05), MATERIALS.snow);
            snowRoof.position.set(s.ko[0], s.ko[1] + s.k[1] / 2 + 0.05, 0);
            vehicleBody.add(snowRoof);

            if (!s.isLarge && !s.isAgricultural) {
                const hoodSnow = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, s.c[2] * 0.9), MATERIALS.snow);
                hoodSnow.position.set(s.c[0] / 2 - 0.6, chassis.position.y + s.c[1] / 2 + 0.01, 0);
                vehicleBody.add(hoodSnow);
            }
        }

        // Specials
        if (type === 'tractor') {
            const frontWheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.4, 12);
            const rearWheelGeo = new THREE.CylinderGeometry(1.2, 1.2, 0.6, 12);

            const fwL = new THREE.Mesh(frontWheelGeo, LOCAL_MATS.tractorWheel); fwL.position.set(1.0, 0.4, 0.7); vehicleBody.add(fwL);
            const fwR = new THREE.Mesh(frontWheelGeo, LOCAL_MATS.tractorWheel); fwR.position.set(1.0, 0.4, -0.7); vehicleBody.add(fwR);
            const rwL = new THREE.Mesh(rearWheelGeo, LOCAL_MATS.tractorWheel); rwL.position.set(-0.5, 1.2, 1.0); vehicleBody.add(rwL);
            const rwR = new THREE.Mesh(rearWheelGeo, LOCAL_MATS.tractorWheel); rwR.position.set(-0.5, 1.2, -1.0); vehicleBody.add(rwR);
        }

        if (type === 'timber_truck') {
            const logs = ObjectGenerator.createTimberPile(1.0);
            logs.position.set(chassis.position.x - 1.8, chassis.position.y + 0.4, 0);
            logs.rotation.set(0, Math.PI * 0.5, 0);
            logs.scale.set(1, 1, 1.3);
            vehicleBody.add(logs);
        }

        vehicleBody.scale.set(scale, scale, scale);
        vehicleBody.userData.material = 'METAL';
        vehicleBody.rotateY(Math.PI / 2);

        return vehicleBody;
    },

    createFire: (ctx: SectorContext, x: number, z: number, y: number = 0, scale: number = 1.0) => {
        const group = new THREE.Group();
        group.position.set(x, y, z);
        group.scale.setScalar(scale);

        group.userData.isFire = true;
        group.userData.effects = [
            { type: 'light', color: 0xff7722, intensity: 30 * scale, distance: 40 * scale, offset: new THREE.Vector3(0, 1.5, 0), flicker: true },
            { type: 'emitter', particle: 'flame', interval: 60, count: 1, offset: new THREE.Vector3(0, 0.5, 0), spread: 0.5, color: 0xffaa00 },
            { type: 'emitter', particle: 'spark', interval: 100, count: 1, offset: new THREE.Vector3(0, 1.0, 0), spread: 0.8, color: 0xffdd00 },
            { type: 'emitter', particle: 'smoke', interval: 200, count: 1, offset: new THREE.Vector3(0, 1.8, 0), spread: 0.4 }
        ];

        ctx.scene.add(group);
        if (ctx.obstacles) ctx.obstacles.push({ mesh: group, radius: 0.8 * scale });
    },

    createCampfire: (ctx: SectorContext, x: number, z: number, y: number = 0, scale: number = 1.0) => {
        const group = new THREE.Group();
        group.position.set(x, y, z);
        group.scale.setScalar(scale);

        const ash = new THREE.Mesh(new THREE.CircleGeometry(0.8, 8), MATERIALS.ash);
        ash.rotation.x = -Math.PI / 2;
        ash.position.y = 0.05;
        ash.receiveShadow = true;
        group.add(ash);

        const stoneGeo = new THREE.DodecahedronGeometry(0.25);
        for (let i = 0; i < 10; i++) {
            const s = new THREE.Mesh(stoneGeo, MATERIALS.stone);
            const angle = (i / 10) * Math.PI * 2;
            const r = 0.9 + (Math.random() - 0.5) * 0.1;
            s.position.set(Math.cos(angle) * r, 0.15, Math.sin(angle) * r);
            s.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
            s.castShadow = true;
            s.receiveShadow = true;
            group.add(s);
        }

        const logGeo = new THREE.CylinderGeometry(0.12, 0.12, 1.4);
        for (let i = 0; i < 4; i++) {
            const log = new THREE.Mesh(logGeo, MATERIALS.treeTrunk);
            log.rotation.set((Math.random() - 0.5) * 0.2, (i / 4) * Math.PI * 2 + (Math.random() * 0.2), Math.PI / 2);
            log.position.y = 0.25;
            log.castShadow = true;
            log.receiveShadow = true;
            group.add(log);
        }

        group.userData.isFire = true;
        group.userData.effects = [
            { type: 'light', color: 0xff7722, intensity: 30 * scale, distance: 40 * scale, offset: new THREE.Vector3(0, 1.5, 0), flicker: true },
            { type: 'emitter', particle: 'flame', interval: 60, count: 1, offset: new THREE.Vector3(0, 0.5, 0), spread: 0.5, color: 0xffaa00 },
            { type: 'emitter', particle: 'spark', interval: 100, count: 1, offset: new THREE.Vector3(0, 1.0, 0), spread: 0.8, color: 0xffdd00 },
            { type: 'emitter', particle: 'smoke', interval: 200, count: 1, offset: new THREE.Vector3(0, 1.8, 0), spread: 0.4 }
        ];

        ctx.scene.add(group);
        if (ctx.obstacles) ctx.obstacles.push({ mesh: group, radius: 0.8 * scale });
        return group;
    },

    createTunnel: (ctx: SectorContext, pos: THREE.Vector3, width: number = 6, height: number = 5, length: number = 10, rotation: number = 0, wallThick: number = 0.5, roofThick: number = 0.5) => {
        const group = new THREE.Group();
        group.position.copy(pos);
        group.rotation.y = rotation;

        const mat = MATERIALS.concrete;

        const sideL = new THREE.Mesh(new THREE.BoxGeometry(wallThick, height, length), mat);
        sideL.position.set(-width / 2 - wallThick / 2, height / 2, 0);
        group.add(sideL);

        const sideR = new THREE.Mesh(new THREE.BoxGeometry(wallThick, height, length), mat);
        sideR.position.set(width / 2 + wallThick / 2, height / 2, 0);
        group.add(sideR);

        const roof = new THREE.Mesh(new THREE.BoxGeometry(width + wallThick * 2, roofThick, length), mat);
        roof.position.set(0, height + roofThick / 2, 0);
        group.add(roof);

        ctx.scene.add(group);

        const colL = new THREE.Object3D();
        colL.position.copy(pos).setY(pos.y + height / 2);
        colL.rotation.y = rotation;
        colL.translateX(-width / 2 - wallThick / 2);
        colL.updateMatrixWorld();
        ctx.scene.add(colL);
        ctx.obstacles.push({ mesh: colL, collider: { type: 'box', size: new THREE.Vector3(wallThick, height, length) } });

        const colR = new THREE.Object3D();
        colR.position.copy(pos).setY(pos.y + height / 2);
        colR.rotation.y = rotation;
        colR.translateX(width / 2 + wallThick / 2);
        colR.updateMatrixWorld();
        ctx.scene.add(colR);
        ctx.obstacles.push({ mesh: colR, collider: { type: 'box', size: new THREE.Vector3(wallThick, height, length) } });

        return group;
    },

    createHaybale: (scale: number = 1.0) => {
        const group = new THREE.Group();
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 2.4, 12).rotateZ(Math.PI / 2), MATERIALS.hay);
        mesh.position.y = 1.2;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        group.scale.setScalar(scale);
        group.userData.material = 'WOOD';
        return group;
    },

    createTimberPile: (scale: number = 1.0) => {
        const group = new THREE.Group();
        const logHeight = 6, logRadius = 0.3;
        const logGeo = new THREE.CylinderGeometry(logRadius, logRadius, logHeight, 8).rotateX(Math.PI / 2);
        const materials = [MATERIALS.treeTrunk, MATERIALS.logEnd, MATERIALS.logEnd];

        for (let l = 0; l < 4; l++) {
            const logsInLayer = 4 - l;
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
        const height = 1.2 + Math.random() * 0.4;
        const stalkGeo = new THREE.PlaneGeometry(0.1, height).translate(0, height / 2, 0);
        const p1 = new THREE.Mesh(stalkGeo, MATERIALS.wheat);
        p1.rotation.set((Math.random() - 0.5) * 0.2, Math.random() * Math.PI, 0);
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

        const typeData = (ZOMBIE_TYPES as any)[type] || { color: 0x445544 };
        const baseZomb = ModelFactory.createZombie(type, typeData);
        const corpse = ModelFactory.createCorpse(baseZomb);
        corpse.position.set(0, 0.1, 0);
        group.add(corpse);
        group.userData.material = 'FLESH';
        return group;
    },

    createContainer: (colorOverride?: number, addSnow: boolean = true) => {
        const group = new THREE.Group();
        const mat = MATERIALS.container.clone();
        if (colorOverride !== undefined) mat.color.setHex(colorOverride);

        const body = new THREE.Mesh(new THREE.BoxGeometry(6.0, 2.6, 2.4), mat);
        body.position.y = 1.3;
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);

        if (addSnow) {
            const snow = new THREE.Mesh(new THREE.BoxGeometry(6.05, 0.1, 2.45), MATERIALS.snow);
            snow.position.y = 2.65;
            group.add(snow);
        }

        group.userData.material = 'METAL';
        return group;
    },

    createNeonSign: (text: string, color: number = 0x00ffff, withBacking: boolean = true) => {
        const group = new THREE.Group();
        if (withBacking) {
            const base = new THREE.Mesh(new THREE.BoxGeometry(text.length * 0.4 + 1, 0.8, 0.2), MATERIALS.blackMetal);
            group.add(base);
        }

        const label = createTextSprite(text);
        label.position.z = withBacking ? 0.12 : 0;
        label.scale.set(text.length * 0.6, 0.8, 1);
        group.add(label);

        EffectManager.attachEffect(group, 'neon_sign', { color, intensity: 15, distance: 20 });
        group.userData.material = 'METAL';
        return group;
    },

    createCaveLamp: () => {
        const group = new THREE.Group();
        group.add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2), MATERIALS.blackMetal));

        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2), LOCAL_MATS.caveLampBulb);
        bulb.position.y = -0.15;
        group.add(bulb);

        const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.5, 6, 1, true), LOCAL_MATS.caveLampCage);
        cage.position.y = -0.2;
        group.add(cage);

        const light = new THREE.PointLight(0xffffcc, 10, 25);
        light.position.y = -0.2;
        group.add(light);

        group.userData.material = 'METAL';
        return group;
    },

    createElectricPole: (withWires: boolean = false) => {
        const group = new THREE.Group();
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 10), MATERIALS.treeTrunk);
        pole.position.y = 5;
        group.add(pole);

        const crossArm = new THREE.Mesh(new THREE.BoxGeometry(3, 0.2, 0.2), MATERIALS.treeTrunk);
        crossArm.position.y = 9;
        group.add(crossArm);

        const insGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.3);
        [-1.2, 0, 1.2].forEach(x => {
            const ins = new THREE.Mesh(insGeo, MATERIALS.stone);
            ins.position.set(x, 9.2, 0);
            group.add(ins);
        });

        group.userData.material = 'WOOD';
        return group;
    },

    createCrashedCar: (color: number = 0x888888) => {
        const group = ObjectGenerator.createVehicle('sedan', 1.0, color, false);
        group.rotation.set(Math.PI / 12, 0, Math.PI / 8);

        const createSpot = (x: number) => {
            const light = new THREE.SpotLight(0xffffff, 20, 40, Math.PI / 6, 0.5);
            light.position.set(x, 0.5, 1.5);
            light.target.position.set(x, -1, 10);
            group.add(light);
            group.add(light.target);
        };
        createSpot(-0.8);
        createSpot(0.8);

        const scorch = new THREE.Mesh(new THREE.CircleGeometry(2, 16), MATERIALS.scorchDecal);
        scorch.rotation.x = -Math.PI / 2;
        scorch.position.y = -0.4;
        group.add(scorch);

        return group;
    },

    createGlassStaircase: (width: number, height: number, depth: number) => {
        const group = new THREE.Group();
        const box = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), MATERIALS.glass);
        box.position.y = height / 2;
        group.add(box);

        const numSteps = 12;
        const stepHeight = height / numSteps, stepDepth = depth / numSteps;
        const stepGeo = new THREE.BoxGeometry(width - 0.2, 0.1, stepDepth);
        for (let i = 0; i < numSteps; i++) {
            const step = new THREE.Mesh(stepGeo, MATERIALS.concrete);
            step.position.set(0, i * stepHeight + 0.1, -depth / 2 + i * stepDepth + stepDepth / 2);
            group.add(step);
        }

        EffectManager.attachEffect(group, 'flicker_light', { color: 0x88ccff, intensity: 10, distance: 15 });
        return group;
    },

    createStorefrontBuilding: (width: number, height: number, depth: number, opts: {
        lowerMat?: THREE.Material,
        upperMat?: THREE.Material,
        withRoof?: boolean,
        withLights?: boolean,
        shopWindows?: boolean,
        upperWindows?: boolean
    } = {}) => {
        const group = new THREE.Group();
        const { lowerMat, upperMat, withRoof = true, withLights = true, shopWindows = true, upperWindows = true } = opts;
        const midPoint = height * 0.4;

        const lowerGeo = new THREE.BoxGeometry(width, midPoint, depth).translate(0, midPoint / 2, 0);
        const lowerMesh = new THREE.Mesh(lowerGeo, lowerMat || MATERIALS.whiteBrick);
        lowerMesh.castShadow = true; lowerMesh.receiveShadow = true;
        group.add(lowerMesh);

        const upperHeight = height - midPoint;
        const upperGeo = new THREE.BoxGeometry(width, upperHeight, depth).translate(0, midPoint + upperHeight / 2, 0);
        const upperMesh = new THREE.Mesh(upperGeo, upperMat || MATERIALS.wooden_fasade);
        upperMesh.castShadow = true; upperMesh.receiveShadow = true;
        group.add(upperMesh);

        if (withRoof) {
            const roofHeight = 3;
            const roofGeo = new THREE.ConeGeometry(Math.max(width, depth) * 0.7, roofHeight, 4).rotateY(Math.PI / 4).translate(0, height + roofHeight / 2, 0);
            const roof = new THREE.Mesh(roofGeo, MATERIALS.stone);
            roof.castShadow = true;
            group.add(roof);
        }

        if (shopWindows) {
            const winHeight = midPoint * 0.7;
            const winGeo = new THREE.PlaneGeometry(3.5, winHeight);

            let winCount = 0;
            for (let x = -width / 2 + 2.5; x <= width / 2 - 2.5; x += 4.5) winCount++;

            if (winCount > 0) {
                const instancedWindows = new THREE.InstancedMesh(winGeo, MATERIALS.glass, winCount);
                let idx = 0;
                for (let x = -width / 2 + 2.5; x <= width / 2 - 2.5; x += 4.5) {
                    _matrix.makeTranslation(x, midPoint / 2, depth / 2 + 0.05);
                    instancedWindows.setMatrixAt(idx++, _matrix);

                    if (withLights) {
                        const light = new THREE.PointLight(0xffffaa, 4, 10);
                        light.position.set(x, midPoint / 2, depth / 2 - 1);
                        group.add(light);
                    }
                }
                instancedWindows.instanceMatrix.needsUpdate = true;
                group.add(instancedWindows);
            }
        }

        if (upperWindows) {
            const upWinGeo = new THREE.PlaneGeometry(1.2, 1.5);
            let upWinCount = 0;
            for (let x = -width / 2 + 2; x <= width / 2 - 2; x += 4) upWinCount++;

            if (upWinCount > 0) {
                const instancedUpWindows = new THREE.InstancedMesh(upWinGeo, LOCAL_MATS.upWindow, upWinCount);
                let idx = 0;
                for (let x = -width / 2 + 2; x <= width / 2 - 2; x += 4) {
                    _matrix.makeTranslation(x, midPoint + upperHeight / 2, depth / 2 + 0.05);
                    instancedUpWindows.setMatrixAt(idx++, _matrix);
                }
                instancedUpWindows.instanceMatrix.needsUpdate = true;
                group.add(instancedUpWindows);
            }
        }

        group.userData = { size: new THREE.Vector3(width, height + (withRoof ? 3 : 0), depth), material: 'CONCRETE' };
        return group;
    },

    createNeonHeart: (color: number = 0xff0000) => {
        const group = new THREE.Group();
        const x = 0, y = 0;
        const heartShape = new THREE.Shape();
        heartShape.moveTo(x + 5, y + 5);
        heartShape.bezierCurveTo(x + 5, y + 5, x + 4, y, x, y);
        heartShape.bezierCurveTo(x - 6, y, x - 6, y + 7, x - 6, y + 7);
        heartShape.bezierCurveTo(x - 6, y + 11, x - 3, y + 15.4, x + 5, y + 19);
        heartShape.bezierCurveTo(x + 12, y + 15.4, x + 16, y + 11, x + 16, y + 7);
        heartShape.bezierCurveTo(x + 16, y + 7, x + 16, y, x + 10, y);
        heartShape.bezierCurveTo(x + 7, y, x + 5, y + 5, x + 5, y + 5);

        const geo = new THREE.ShapeGeometry(heartShape);
        geo.scale(0.04, -0.04, 0.04);
        geo.translate(-0.2, 0.4, 0);

        if (!neonHeartCache[color]) neonHeartCache[color] = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });

        group.add(new THREE.Mesh(geo, neonHeartCache[color]));

        const light = new THREE.PointLight(color, 15, 12);
        light.position.set(0, 0, 0.5);
        group.add(light);

        return group;
    },

    createGrassField: (ctx: SectorContext, x: number, z: number, width: number, depth: number, count: number) => {
        const geometry = new THREE.ConeGeometry(0.05, 0.4, 3);
        geometry.translate(0, 0.2, 0);

        const mesh = new THREE.InstancedMesh(geometry, MATERIALS.grass, count);
        mesh.castShadow = false;
        mesh.receiveShadow = true;

        for (let i = 0; i < count; i++) {
            _position.set(x + (Math.random() - 0.5) * width, 0, z + (Math.random() - 0.5) * depth);
            const scaleBase = 0.8 + Math.random() * 0.4;
            _scale.set(scaleBase, scaleBase * (0.8 + Math.random() * 0.5), scaleBase);
            _rotation.set(0, Math.random() * Math.PI, 0);
            _quat.setFromEuler(_rotation);

            _matrix.compose(_position, _quat, _scale);
            mesh.setMatrixAt(i, _matrix);
        }

        mesh.instanceMatrix.needsUpdate = true;
        ctx.scene.add(mesh);
    },

    createTerminal: (type: 'ARMORY' | 'SPAWNER' | 'ENV') => {
        const group = new THREE.Group();

        const baseGeo = new THREE.BoxGeometry(1.2, 1.0, 0.8);
        const baseMat = MATERIALS.gun;
        const base = new THREE.Mesh(baseGeo, baseMat);
        base.position.y = 0.5;
        base.castShadow = true;
        group.add(base);

        const screenGeo = new THREE.BoxGeometry(1.0, 0.6, 0.1);
        const screenMat = type === 'ARMORY' ? MATERIALS.chestBig :
            type === 'SPAWNER' ? MATERIALS.barrelExplosive : MATERIALS.steel;

        const consoleTop = new THREE.Mesh(screenGeo, screenMat);
        consoleTop.position.set(0, 1.3, -0.2);
        consoleTop.rotation.x = -Math.PI / 6;
        group.add(consoleTop);

        const glowGeo = new THREE.PlaneGeometry(0.9, 0.5);
        const color = type === 'ARMORY' ? 0xffaa00 : type === 'SPAWNER' ? 0xff0000 : 0x00ffff;

        if (!neonHeartCache[color]) neonHeartCache[color] = new THREE.MeshBasicMaterial({ color: color });

        const glow = new THREE.Mesh(glowGeo, neonHeartCache[color]);
        glow.position.set(0, 1.3, -0.14);
        glow.rotation.x = -Math.PI / 6;
        group.add(glow);

        return group;
    }
};