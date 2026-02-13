
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createProceduralTextures, MATERIALS, GEOMETRY, ModelFactory, createSignMesh, createTextSprite } from '../../utils/assets';
import { SectorContext } from '../../types/sectors';
import { ZOMBIE_TYPES } from '../../content/enemies/zombies';
import { EffectManager } from '../systems/EffectManager';

// Lazy load textures
let sharedTextures: any = null;
const getSharedTextures = () => {
    if (!sharedTextures) sharedTextures = createProceduralTextures();
    return sharedTextures;
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
    wallGroup.userData.material = 'CONCRETE';
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
    cornerGroup.userData.material = 'CONCRETE';
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
    doorGroup.userData.material = 'CONCRETE';
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
    windowGroup.userData.material = 'CONCRETE'; // Default to concrete for the frame
    buildingMeshes['WindowFrame'] = windowGroup;

    // Floor
    const floorGroup = new THREE.Group();
    const floor = new THREE.Mesh(new THREE.BoxGeometry(4, 0.2, 4), MATERIALS.concrete);
    floor.position.y = -0.1;
    floorGroup.add(floor);
    floorGroup.userData.material = 'CONCRETE';
    buildingMeshes['Floor'] = floorGroup;
    if (yieldToMain) await yieldToMain();
};

export const ObjectGenerator = {
    initBuildingPrototypes,

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
        group.userData.material = 'WOOD';
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
        group.userData.material = 'WOOD';
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
        group.userData.material = 'METAL';
        return group;
    },

    /**
     * Creates a concrete arch train tunnel along a path.
     */
    createTrainTunnel: (points: THREE.Vector3[]) => {
        if (!points || points.length < 2) {
            console.warn("createTrainTunnel called with insufficient points", points);
            return new THREE.Group();
        }

        const tunnelWidthOuter = 16;
        const tunnelHeightWalls = 7;
        const tunnelArchRise = 5;
        const tunnelThickness = 2;
        const tunnelDepth = 30;

        const start = points[0];
        const end = points[points.length - 1];
        const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);

        const halfWidthO = tunnelWidthOuter / 2;
        const controlPointY_O = tunnelHeightWalls + (tunnelArchRise * 2);
        const tunnelGroup = new THREE.Group();
        tunnelGroup.position.copy(mid);
        tunnelGroup.lookAt(end);

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
        archGeo.translate(0, 0, -tunnelDepth / 2); // Center along depth

        const tunnelMat = MATERIALS.concrete.clone();
        tunnelMat.side = THREE.DoubleSide;
        const arch = new THREE.Mesh(archGeo, tunnelMat);
        tunnelGroup.add(arch);

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
        group.userData.material = 'METAL';
        return group;
    },

    createStreetLamp: () => {
        const group = new THREE.Group();

        // Merge geometries for the pole, arm, and head
        const poleGeo = new THREE.CylinderGeometry(0.1, 0.2, 8);
        poleGeo.translate(0, 4, 0);

        const armGeo = new THREE.BoxGeometry(0.2, 0.2, 2);
        armGeo.translate(0, 7.5, 0.5);

        const headGeo = new THREE.BoxGeometry(0.6, 0.2, 0.8);
        headGeo.translate(0, 7.5, 1.5);

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
        group.add(building);

        // 5. Windows / Lights
        if (withLights) {
            const litWinMat = new THREE.MeshStandardMaterial({ color: 0xffffaa, emissive: 0xffffaa, emissiveIntensity: 1 });
            const darkWinMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9, metalness: 0.1 });
            const winGeo = new THREE.PlaneGeometry(1.2, 1.5);

            // Collect window positions first
            const litPositions: Array<{ x: number, y: number }> = [];
            const darkPositions: Array<{ x: number, y: number }> = [];

            // Front windows
            for (let x = -width / 2 + 2; x < width / 2 - 1; x += 4) {
                for (let y = 2; y < height - 1; y += 4) {
                    const isLit = Math.random() < lightProbability;
                    if (isLit) {
                        litPositions.push({ x, y });
                    } else {
                        darkPositions.push({ x, y });
                    }
                }
            }

            // Create InstancedMesh for lit windows (if any)
            if (litPositions.length > 0) {
                const litWindows = new THREE.InstancedMesh(winGeo, litWinMat, litPositions.length);
                const matrix = new THREE.Matrix4();
                litPositions.forEach((pos, i) => {
                    matrix.setPosition(pos.x, pos.y, depth / 2 + 0.05);
                    litWindows.setMatrixAt(i, matrix);
                });
                litWindows.instanceMatrix.needsUpdate = true;
                group.add(litWindows);
            }

            // Create InstancedMesh for dark windows (if any)
            if (darkPositions.length > 0) {
                const darkWindows = new THREE.InstancedMesh(winGeo, darkWinMat, darkPositions.length);
                const matrix = new THREE.Matrix4();
                darkPositions.forEach((pos, i) => {
                    matrix.setPosition(pos.x, pos.y, depth / 2 + 0.05);
                    darkWindows.setMatrixAt(i, matrix);
                });
                darkWindows.instanceMatrix.needsUpdate = true;
                group.add(darkWindows);
            }
        }

        // Expose dimensions if needed by caller (e.g. for collision)
        group.userData = {
            size: new THREE.Vector3(width, height + actualRoofHeight, depth),
            material: 'CONCRETE'
        };

        bodyGeo.dispose();
        nonIndexedBody.dispose();

        return group;
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
            logs.position.set(chassis.position.x - 1.8, chassis.position.y + 0.4, 0);
            logs.rotation.set(0, Math.PI * 0.5, 0);
            logs.scale.set(1, 1, 1.3); // Scale to fit flatbed
            vehicleBody.add(logs);
        }

        vehicleBody.scale.set(scale, scale, scale);
        // ctx.scene.add(vehicleBody); -- Handled by caller (SectorBuilder)
        // ctx.obstacles.push({ mesh: vehicleBody }); -- Handled by caller

        vehicleBody.userData.material = 'METAL';
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
        if (ctx.obstacles) {
            ctx.obstacles.push({ mesh: group, radius: 0.8 * scale });
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
        if (ctx.obstacles) {
            ctx.obstacles.push({ mesh: group, radius: 0.8 * scale });
        }
        return group;
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
        colL.userData.material = 'STONE';
        ctx.scene.add(colL);
        ctx.obstacles.push({ mesh: colL, collider: { type: 'box', size: new THREE.Vector3(wallThick, height, length) } });

        const colR = new THREE.Mesh(new THREE.BoxGeometry(wallThick, height, length));
        colR.position.copy(pos).setY(pos.y + height / 2);
        colR.rotation.y = rotation;
        colR.translateX(width / 2 + wallThick / 2);
        colR.visible = false;
        colR.updateMatrixWorld();
        colR.userData.material = 'STONE';
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
        group.userData.material = 'WOOD';
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

        // Actual lighting effect
        EffectManager.attachEffect(group, 'neon_sign', { color, intensity: 15, distance: 20 });

        group.userData.material = 'METAL';
        return group;
    },

    createCaveLamp: () => {
        const group = new THREE.Group();
        const fixture = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2), MATERIALS.blackMetal);
        group.add(fixture);

        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2), new THREE.MeshStandardMaterial({ color: 0xffffaa, emissive: 0xffffaa, emissiveIntensity: 2 }));
        bulb.position.y = -0.15;
        group.add(bulb);

        const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.5, 6, 1, true), new THREE.MeshStandardMaterial({ color: 0x333333, wireframe: true }));
        cage.position.y = -0.2;
        group.add(cage);

        // Actual light
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

        // Insulators
        const insGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.3);
        const insMat = MATERIALS.stone;
        [-1.2, 0, 1.2].forEach(x => {
            const ins = new THREE.Mesh(insGeo, insMat);
            ins.position.set(x, 9.2, 0);
            group.add(ins);
        });

        group.userData.material = 'WOOD';
        return group;
    },

    createCrashedCar: (color: number = 0x888888) => {
        const group = ObjectGenerator.createVehicle('sedan', 1.0, color, false);
        group.rotation.x = Math.PI / 12; // Tilted
        group.rotation.z = Math.PI / 8;

        // Headlights (Spotlights)
        const leftLight = new THREE.SpotLight(0xffffff, 20, 40, Math.PI / 6, 0.5);
        leftLight.position.set(-0.8, 0.5, 1.5);
        leftLight.target.position.set(-0.8, -1, 10);
        group.add(leftLight);
        group.add(leftLight.target);

        const rightLight = new THREE.SpotLight(0xffffff, 20, 40, Math.PI / 6, 0.5);
        rightLight.position.set(0.8, 0.5, 1.5);
        rightLight.target.position.set(0.8, -1, 10);
        group.add(rightLight);
        group.add(rightLight.target);

        // Debris / Scorch
        const scorch = new THREE.Mesh(new THREE.CircleGeometry(2, 16), MATERIALS.scorchDecal);
        scorch.rotation.x = -Math.PI / 2;
        scorch.position.y = -0.4;
        return group;
    },

    createGlassStaircase: (width: number, height: number, depth: number) => {
        const group = new THREE.Group();

        const boxMat = MATERIALS.glass;
        const box = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), boxMat);
        box.position.y = height / 2;
        group.add(box);

        const stepMat = MATERIALS.concrete;
        const numSteps = 12;
        const stepHeight = height / numSteps;
        const stepDepth = depth / numSteps;
        for (let i = 0; i < numSteps; i++) {
            const step = new THREE.Mesh(new THREE.BoxGeometry(width - 0.2, 0.1, stepDepth), stepMat);
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

        const lowerGeo = new THREE.BoxGeometry(width, midPoint, depth);
        lowerGeo.translate(0, midPoint / 2, 0);
        const lowerMesh = new THREE.Mesh(lowerGeo, lowerMat || MATERIALS.whiteBrick);
        lowerMesh.castShadow = true;
        lowerMesh.receiveShadow = true;
        group.add(lowerMesh);

        const upperHeight = height - midPoint;
        const upperGeo = new THREE.BoxGeometry(width, upperHeight, depth);
        upperGeo.translate(0, midPoint + upperHeight / 2, 0);
        const upperMesh = new THREE.Mesh(upperGeo, upperMat || MATERIALS.wooden_fasade);
        upperMesh.castShadow = true;
        upperMesh.receiveShadow = true;
        group.add(upperMesh);

        if (withRoof) {
            const roofHeight = 3;
            const roofGeo = new THREE.ConeGeometry(Math.max(width, depth) * 0.7, roofHeight, 4);
            roofGeo.rotateY(Math.PI / 4);
            roofGeo.translate(0, height + roofHeight / 2, 0);
            const roof = new THREE.Mesh(roofGeo, MATERIALS.stone);
            roof.castShadow = true;
            group.add(roof);
        }

        if (shopWindows) {
            const winMat = MATERIALS.glass;
            const winHeight = midPoint * 0.7;
            const winGeo = new THREE.PlaneGeometry(3.5, winHeight);

            const winPositions: Array<{ x: number, y: number }> = [];
            for (let x = -width / 2 + 2.5; x <= width / 2 - 2.5; x += 4.5) {
                winPositions.push({ x, y: midPoint / 2 });

                if (withLights) {
                    const light = new THREE.PointLight(0xffffaa, 4, 10);
                    light.position.set(x, midPoint / 2, depth / 2 - 1);
                    group.add(light);
                }
            }

            if (winPositions.length > 0) {
                const instancedWindows = new THREE.InstancedMesh(winGeo, winMat, winPositions.length);
                const matrix = new THREE.Matrix4();
                winPositions.forEach((pos, i) => {
                    matrix.setPosition(pos.x, pos.y, depth / 2 + 0.05);
                    instancedWindows.setMatrixAt(i, matrix);
                });
                instancedWindows.instanceMatrix.needsUpdate = true;
                group.add(instancedWindows);
            }
        }

        if (upperWindows) {
            const upWinMat = new THREE.MeshStandardMaterial({ color: 0xffffaa, emissive: 0xffffaa, emissiveIntensity: 0.5 });
            const upWinGeo = new THREE.PlaneGeometry(1.2, 1.5);

            const upWinPositions: Array<{ x: number, y: number }> = [];
            for (let x = -width / 2 + 2; x <= width / 2 - 2; x += 4) {
                upWinPositions.push({ x, y: midPoint + (height - midPoint) / 2 });
            }

            if (upWinPositions.length > 0) {
                const instancedUpWindows = new THREE.InstancedMesh(upWinGeo, upWinMat, upWinPositions.length);
                const matrix = new THREE.Matrix4();
                upWinPositions.forEach((pos, i) => {
                    matrix.setPosition(pos.x, pos.y, depth / 2 + 0.05);
                    instancedUpWindows.setMatrixAt(i, matrix);
                });
                instancedUpWindows.instanceMatrix.needsUpdate = true;
                group.add(instancedUpWindows);
            }
        }

        group.userData = {
            size: new THREE.Vector3(width, height + (withRoof ? 3 : 0), depth),
            material: 'CONCRETE'
        };

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
        const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geo, mat);
        group.add(mesh);

        const light = new THREE.PointLight(color, 15, 12);
        light.position.set(0, 0, 0.5);
        group.add(light);

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
