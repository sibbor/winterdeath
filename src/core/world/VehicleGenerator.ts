import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MATERIALS, createSignMesh } from '../../utils/assets';
import { VEHICLES, VehicleType } from '../../content/vehicles';

/**
 * VehicleGenerator
 * Dedicated generator for all driveable and static vehicles.
 * Optimized for Zero-GC, shared geometries, and fake emissive lighting.
 */

// --- SHARED GEOMETRIES FOR ZERO-GC ---
const SHARED_GEOMETRIES = {
    box: new THREE.BoxGeometry(1, 1, 1),
    tire16: new THREE.CylinderGeometry(1, 1, 1, 16),
    tire12: new THREE.CylinderGeometry(1, 1, 1, 12),
    sphere: new THREE.SphereGeometry(1, 8, 8),
};

// --- VEHICLE MATERIAL & GEOMETRY CACHES ---
let boatMat: THREE.MeshStandardMaterial | null = null;
let cachedBoatGeo: THREE.BufferGeometry | null = null;
const vehicleBodyCache: Record<number, THREE.MeshStandardMaterial> = {};

const VEHICLE_MATS = {
    window: new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.1, metalness: 0.9, transparent: true, opacity: 0.7 }),
    tire: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 }),
    sirenBase: new THREE.MeshStandardMaterial({ color: 0x111111 }),

    // Base materials for lights. Kept at intensity 0 (off). 
    // These will be cloned per vehicle so they can be toggled independently.
    headlight: new THREE.MeshStandardMaterial({ color: 0xdddddd, emissive: 0xffffff, emissiveIntensity: 0 }),
    sirenBlue: new THREE.MeshStandardMaterial({ color: 0x0044ff, emissive: 0x0022ff, emissiveIntensity: 0 }),
    sirenRed: new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xaa0000, emissiveIntensity: 0 }),
    brakeLight: new THREE.MeshStandardMaterial({ color: 0xaa0000, emissive: 0xff0000, emissiveIntensity: 0 }),

    ambulanceYellow: new THREE.MeshStandardMaterial({ color: 0xddff00, roughness: 0.5, metalness: 0.2 }),
};

export const VehicleGenerator = {

    /**
     * Creates a procedural boat mesh.
     * Caches the merged geometry upon first creation.
     */
    createBoat: (): THREE.Mesh => {
        if (!boatMat) {
            boatMat = MATERIALS.wood.clone();
            boatMat.color.setHex(0x5a3d2b);
            boatMat.roughness = 0.85;
            boatMat.metalness = 0.0;
            boatMat.flatShading = true;
            boatMat.needsUpdate = true;
        }

        if (!cachedBoatGeo) {
            const parts: THREE.BufferGeometry[] = [];
            const addPart = (w: number, h: number, d: number, tx: number, ty: number, tz: number, rx = 0, ry = 0, rz = 0) => {
                const geo = new THREE.BoxGeometry(w, h, d);
                geo.rotateY(ry); geo.rotateX(rx); geo.rotateZ(rz);
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
            addPart(0.2, 1.2, 0.25, 0, 0.4, bowZ, 0.1, 0, 0);

            addPart(2.4, 1.0, 0.15, 0, 0.5, hullLength / 2 + 0.1, -0.2, 0, 0);
            addPart(1.2, 0.05, 4.0, 0, 0.05, 0.5);
            addPart(2.2, 0.08, 0.6, 0, 0.6, 1.8);
            addPart(2.3, 0.08, 0.7, 0, 0.6, -0.5);
            addPart(1.5, 0.08, 0.5, 0, 0.65, -2.8);

            cachedBoatGeo = BufferGeometryUtils.mergeGeometries(parts, false);
            for (let i = 0; i < parts.length; i++) parts[i].dispose();
        }

        const boatMesh = new THREE.Mesh(cachedBoatGeo, boatMat);
        boatMesh.castShadow = true;
        boatMesh.receiveShadow = true;
        boatMesh.rotateY(Math.PI * 4);

        return boatMesh;
    },

    /**
     * Specialized creation functions for each vehicle type.
     */
    createStationWagon: (colorOverride?: number, addSnow: boolean = true) => {
        const group = new THREE.Group();
        const mat = VehicleGenerator._getVehicleMaterial(colorOverride ?? 0x7c2e2e);

        VehicleGenerator._addPart(group, 4.6, 0.7, 1.8, 0, 0.65, 0, mat);
        VehicleGenerator._addPart(group, 2.8, 0.65, 1.6, -0.4, 1.25, 0, mat);

        VehicleGenerator._addWindow(group, 0.05, 0.5, 1.4, 1.0, 1.25, 0);
        VehicleGenerator._addWindow(group, 1.2, 0.45, 0.05, 0.2, 1.25, 0.82);
        VehicleGenerator._addWindow(group, 1.2, 0.45, 0.05, 0.2, 1.25, -0.82);
        VehicleGenerator._addWindow(group, 1.0, 0.45, 0.05, -1.2, 1.25, 0.82);
        VehicleGenerator._addWindow(group, 1.0, 0.45, 0.05, -1.2, 1.25, -0.82);
        VehicleGenerator._addWindow(group, 0.05, 0.5, 1.4, -1.8, 1.25, 0);

        VehicleGenerator._addTires(group, 4, 0.35, 0.4, 1.5, 0.95, -1.5);
        VehicleGenerator._addLights(group, 2.3, 0.65, 0.7);
        VehicleGenerator._addBrakeLights(group, -2.3, 0.65, 0.7);

        if (addSnow) VehicleGenerator._addSnow(group, 3.0, 0.1, 1.7, -0.4, 1.6);

        return VehicleGenerator._finalize(group);
    },

    createSedan: (colorOverride?: number, addSnow: boolean = true) => {
        const group = new THREE.Group();
        const mat = VehicleGenerator._getVehicleMaterial(colorOverride ?? 0x3e4c5e);

        VehicleGenerator._addPart(group, 4.5, 0.7, 1.8, 0, 0.65, 0, mat);
        VehicleGenerator._addPart(group, 2.2, 0.65, 1.6, -0.1, 1.25, 0, mat);

        VehicleGenerator._addWindow(group, 0.05, 0.5, 1.4, 1.0, 1.25, 0);
        VehicleGenerator._addWindow(group, 1.0, 0.45, 0.05, 0.1, 1.25, 0.82);
        VehicleGenerator._addWindow(group, 1.0, 0.45, 0.05, 0.1, 1.25, -0.82);
        VehicleGenerator._addWindow(group, 0.05, 0.5, 1.4, -1.2, 1.25, 0);

        VehicleGenerator._addTires(group, 4, 0.35, 0.4, 1.4, 0.95, -1.4);
        VehicleGenerator._addLights(group, 2.25, 0.65, 0.7);
        VehicleGenerator._addBrakeLights(group, -2.25, 0.65, 0.7);

        if (addSnow) VehicleGenerator._addSnow(group, 2.4, 0.1, 1.7, -0.1, 1.6);

        return VehicleGenerator._finalize(group);
    },

    createPoliceCar: (colorOverride?: number, addSnow: boolean = true) => {
        const group = new THREE.Group();
        const mat = VehicleGenerator._getVehicleMaterial(0xffffff);

        VehicleGenerator._addPart(group, 4.6, 0.7, 1.8, 0, 0.65, 0, mat);
        VehicleGenerator._addPart(group, 2.8, 0.65, 1.6, -0.4, 1.25, 0, mat);

        const signPolis = createSignMesh("POLIS", 1.8, 0.4, '#000000', '#ffff00');
        signPolis.position.set(-0.4, 1.25, 0.82); group.add(signPolis);
        const signPolisR = signPolis.clone(); signPolisR.position.z = -0.82; signPolisR.rotation.y = Math.PI; group.add(signPolisR);

        const unitNum = createSignMesh("52-1120", 0.6, 0.15, '#000000', '#ffffff');
        unitNum.position.set(1.5, 0.9, 0.92); group.add(unitNum);
        const unitNumR = unitNum.clone(); unitNumR.position.z = -0.92; unitNumR.rotation.y = Math.PI; group.add(unitNumR);

        VehicleGenerator._addWindow(group, 0.05, 0.5, 1.4, 1.0, 1.25, 0);
        VehicleGenerator._addWindow(group, 1.2, 0.45, 0.05, 0.2, 1.25, 0.82);
        VehicleGenerator._addWindow(group, 1.2, 0.45, 0.05, 0.2, 1.25, -0.82);
        VehicleGenerator._addWindow(group, 0.05, 0.5, 1.4, -1.8, 1.25, 0);

        VehicleGenerator._addTires(group, 4, 0.35, 0.4, 1.5, 0.95, -1.5);
        VehicleGenerator._addSirens(group, -0.4, 1.6, 1.6, true);
        VehicleGenerator._addLights(group, 2.3, 0.65, 0.7);
        VehicleGenerator._addBrakeLights(group, -2.3, 0.65, 0.7);

        if (addSnow) VehicleGenerator._addSnow(group, 3.0, 0.1, 1.7, -0.4, 1.6);

        return VehicleGenerator._finalize(group);
    },

    createAmbulance: (colorOverride?: number, addSnow: boolean = true) => {
        const group = new THREE.Group();
        const mat = VEHICLE_MATS.ambulanceYellow;

        VehicleGenerator._addPart(group, 5.2, 1.0, 2.2, 0, 0.8, 0, mat);
        VehicleGenerator._addPart(group, 3.8, 1.2, 2.0, 0, 1.9, 0, mat);

        const cross = createSignMesh("✚", 0.4, 0.4, '#ff0000', '#ffffff');
        cross.position.set(0, 1.9, 1.02); group.add(cross);
        const crossR = cross.clone(); crossR.position.z = -1.02; crossR.rotation.y = Math.PI; group.add(crossR);

        VehicleGenerator._addWindow(group, 0.05, 0.7, 1.8, 1.9, 1.9, 0);
        VehicleGenerator._addWindow(group, 1.0, 0.6, 0.05, 1.2, 1.9, 1.02);
        VehicleGenerator._addWindow(group, 1.0, 0.6, 0.05, 1.2, 1.9, -1.02);
        VehicleGenerator._addWindow(group, 1.5, 0.8, 0.05, -1.0, 1.9, 1.02);
        VehicleGenerator._addWindow(group, 1.5, 0.8, 0.05, -1.0, 1.9, -1.02);

        VehicleGenerator._addPart(group, 0.05, 1.2, 0.95, -2.6, 1.9, 0.5, mat);
        VehicleGenerator._addPart(group, 0.05, 1.2, 0.95, -2.6, 1.9, -0.5, mat);

        VehicleGenerator._addTires(group, 4, 0.45, 0.5, 1.8, 1.15, -1.8);
        VehicleGenerator._addSirens(group, 0, 2.5, 2.0, true);
        VehicleGenerator._addLights(group, 2.6, 0.8, 0.8);
        VehicleGenerator._addBrakeLights(group, -2.6, 0.8, 0.8);

        return VehicleGenerator._finalize(group);
    },

    createBus: (colorOverride?: number, addSnow: boolean = true) => {
        const group = new THREE.Group();
        const mat = VehicleGenerator._getVehicleMaterial(colorOverride ?? 0x009ddb);

        VehicleGenerator._addPart(group, 12.0, 2.5, 3.5, 0, 1.55, 0, mat);

        const frontSign = createSignMesh("159 DALSJÖFORS", 2.0, 0.6, '#ffaa00', '#000000');
        frontSign.position.set(6.01, 2.5, 0);
        frontSign.rotation.y = Math.PI / 2;
        group.add(frontSign);

        VehicleGenerator._addWindow(group, 0.05, 1.2, 2.0, 6.0, 1.5, 0);

        for (let i = 0; i < 5; i++) {
            const xPos = 4.0 - i * 2.0;
            VehicleGenerator._addWindow(group, 1.5, 1.0, 0.05, xPos, 1.8, 1.76);
            VehicleGenerator._addWindow(group, 1.5, 1.0, 0.05, xPos, 1.8, -1.76);
        }

        const backSign = createSignMesh("159", 0.8, 0.4, '#ffaa00', '#000000');
        backSign.position.set(-6.01, 2.5, 0);
        backSign.rotation.y = -Math.PI / 2;
        group.add(backSign);

        VehicleGenerator._addWindow(group, 0.05, 0.8, 2.0, -6.0, 1.5, 0);

        const addT = (tx: number, tz: number) => {
            const m = new THREE.Mesh(SHARED_GEOMETRIES.tire16, VEHICLE_MATS.tire);
            m.rotation.x = Math.PI / 2;
            m.scale.set(0.65, 0.6, 0.65);
            m.position.set(tx, 0.65, tz);
            m.castShadow = true;
            group.add(m);
        };
        addT(4.5, 1.55); addT(4.5, -1.55);
        addT(-4.5, 1.25); addT(-4.5, 1.85);
        addT(-4.5, -1.25); addT(-4.5, -1.85);

        VehicleGenerator._addLights(group, 6.01, 0.8, 1.2);
        VehicleGenerator._addBrakeLights(group, -6.01, 0.8, 1.2);

        if (addSnow) VehicleGenerator._addSnow(group, 12.0, 0.15, 3.5, 0, 2.85);

        return VehicleGenerator._finalize(group);
    },

    createTractor: (colorOverride?: number, addSnow: boolean = true) => {
        const group = new THREE.Group();
        const mat = VehicleGenerator._getVehicleMaterial(colorOverride ?? 0xcc2222);

        VehicleGenerator._addPart(group, 2.5, 0.8, 1.8, 0, 0.7, 0, mat);
        VehicleGenerator._addPart(group, 1.2, 1.5, 1.4, 0.5, 1.5, 0, mat);

        VehicleGenerator._addWindow(group, 0.05, 1.0, 1.2, 1.1, 1.5, 0);
        VehicleGenerator._addWindow(group, 0.8, 1.0, 0.05, 0.5, 1.5, 0.72);
        VehicleGenerator._addWindow(group, 0.8, 1.0, 0.05, 0.5, 1.5, -0.72);

        const addT = (isFront: boolean, tx: number, ty: number, tz: number) => {
            const geo = isFront ? SHARED_GEOMETRIES.tire12 : SHARED_GEOMETRIES.tire16;
            const m = new THREE.Mesh(geo, VEHICLE_MATS.tire);
            m.rotation.x = Math.PI / 2;
            if (isFront) {
                m.scale.set(0.45, 0.45, 0.45);
            } else {
                m.scale.set(1.25, 0.7, 1.25);
            }
            m.position.set(tx, ty, tz);
            m.castShadow = true;
            group.add(m);
        };

        addT(true, 1.1, 0.45, 0.85); addT(true, 1.1, 0.45, -0.85);
        addT(false, -0.8, 1.25, 1.1); addT(false, -0.8, 1.25, -1.1);

        VehicleGenerator._addLights(group, 1.25, 0.8, 0.6);

        return VehicleGenerator._finalize(group);
    },

    createTimberTruck: (colorOverride?: number, addSnow: boolean = true) => {
        const group = new THREE.Group();
        const mat = VehicleGenerator._getVehicleMaterial(colorOverride ?? 0x4a5c4a);

        VehicleGenerator._addPart(group, 12.0, 0.8, 2.6, 0, 0.7, 0, mat);
        VehicleGenerator._addPart(group, 2.5, 1.8, 2.4, 4.0, 1.5, 0, mat);

        VehicleGenerator._addWindow(group, 0.05, 1.0, 2.0, 5.25, 1.8, 0);
        VehicleGenerator._addWindow(group, 1.2, 1.0, 0.05, 4.0, 1.8, 1.22);
        VehicleGenerator._addWindow(group, 1.2, 1.0, 0.05, 4.0, 1.8, -1.22);

        VehicleGenerator._addTires(group, 6, 0.55, 0.5, 5.0, 1.3, -4.5, -3.0);
        VehicleGenerator._addLights(group, 6.0, 0.7, 0.9);
        VehicleGenerator._addBrakeLights(group, -6.0, 0.7, 0.9);

        import('./ObjectGenerator').then(({ ObjectGenerator }) => {
            const logs = ObjectGenerator.createTimberPile(1.0);
            logs.position.set(-1.8, 1.1, 0);
            logs.rotation.set(0, Math.PI * 0.5, 0);
            logs.scale.set(1, 1, 1.3);
            group.add(logs);
        });

        return VehicleGenerator._finalize(group);
    },

    createVehicle: (type: string = 'station wagon', colorOverride?: number, addSnow: boolean = true): THREE.Group => {
        if (type === 'police') return VehicleGenerator.createPoliceCar(colorOverride, addSnow);
        else if (type === 'ambulance') return VehicleGenerator.createAmbulance(colorOverride, addSnow);
        else if (type === 'bus') return VehicleGenerator.createBus(colorOverride, addSnow);
        else if (type === 'tractor') return VehicleGenerator.createTractor(colorOverride, addSnow);
        else if (type === 'timber_truck') return VehicleGenerator.createTimberTruck(colorOverride, addSnow);
        else if (type === 'sedan') return VehicleGenerator.createSedan(colorOverride, addSnow);
        else return VehicleGenerator.createStationWagon(colorOverride, addSnow);
    },

    // --- INTERNAL HELPERS ---

    _getVehicleMaterial: (color: number) => {
        if (!vehicleBodyCache[color]) {
            const mat = MATERIALS.vehicleBody.clone();
            mat.color.setHex(color);
            vehicleBodyCache[color] = mat;
        }
        return vehicleBodyCache[color];
    },

    _addPart: (group: THREE.Group, w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) => {
        const mesh = new THREE.Mesh(SHARED_GEOMETRIES.box, mat);
        mesh.scale.set(w, h, d);
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        return mesh;
    },

    _addWindow: (group: THREE.Group, w: number, h: number, d: number, x: number, y: number, z: number) => {
        const mesh = new THREE.Mesh(SHARED_GEOMETRIES.box, VEHICLE_MATS.window);
        mesh.scale.set(w, h, d);
        mesh.position.set(x, y, z);
        group.add(mesh);
        return mesh;
    },

    _addTires: (group: THREE.Group, count: number, radius: number, width: number, x: number, z: number, rearX: number, midX?: number) => {
        const addT = (tx: number, tz: number) => {
            const m = new THREE.Mesh(SHARED_GEOMETRIES.tire16, VEHICLE_MATS.tire);
            m.rotation.x = Math.PI / 2;
            m.scale.set(radius, width, radius);
            m.position.set(tx, radius, tz);
            m.castShadow = true;
            group.add(m);
        };
        addT(x, z); addT(x, -z);
        addT(rearX, z); addT(rearX, -z);
        if (count === 6 && midX !== undefined) {
            addT(midX, z); addT(midX, -z);
        }
    },

    _addLights: (group: THREE.Group, x: number, y: number, zOff: number) => {
        // Clone the material per vehicle so headlights can be toggled independently
        const mat = VEHICLE_MATS.headlight.clone();

        const createL = (offset: number) => {
            const glow = new THREE.Mesh(SHARED_GEOMETRIES.sphere, mat);
            glow.scale.setScalar(0.15);
            glow.position.set(x, y, offset);
            group.add(glow);
            return glow;
        };

        const left = createL(zOff);
        const right = createL(-zOff);

        // Store references in userData for easy toggling in step 2
        if (!group.userData.lights) group.userData.lights = {};
        group.userData.lights.headlights = { material: mat, meshes: [left, right] };
    },

    _addBrakeLights: (group: THREE.Group, x: number, y: number, zOff: number) => {
        // Clone the material per vehicle so brake lights can be toggled independently
        const mat = VEHICLE_MATS.brakeLight.clone();

        const createL = (offset: number) => {
            const glow = new THREE.Mesh(SHARED_GEOMETRIES.box, mat);
            glow.scale.set(0.1, 0.2, 0.4);
            glow.position.set(x, y, offset);
            group.add(glow);
            return glow;
        };

        const left = createL(zOff);
        const right = createL(-zOff);

        // Store references in userData for step 2
        if (!group.userData.lights) group.userData.lights = {};
        group.userData.lights.brake = { material: mat, meshes: [left, right] };
    },

    _addSirens: (group: THREE.Group, x: number, y: number, zWidth: number, enableBlinking: boolean = false) => {
        const matBlue = VEHICLE_MATS.sirenBlue.clone();
        const matRed = VEHICLE_MATS.sirenRed.clone();

        VehicleGenerator._addPart(group, 0.4, 0.15, zWidth * 0.8, x, y + 0.05, 0, VEHICLE_MATS.sirenBase);

        const blue = new THREE.Mesh(SHARED_GEOMETRIES.box, matBlue);
        blue.scale.set(0.15, 0.1, 0.3);
        blue.position.set(x, y + 0.15, zWidth * 0.2);
        group.add(blue);

        const red = new THREE.Mesh(SHARED_GEOMETRIES.box, matRed);
        red.scale.set(0.15, 0.1, 0.3);
        red.position.set(x, y + 0.15, -zWidth * 0.2);
        group.add(red);

        if (enableBlinking) {
            group.userData.sirenOn = false; // By default off
            if (!group.userData.lights) group.userData.lights = {};
            // Store references so we can update the emissive intensity in the render loop
            group.userData.lights.siren = { materialBlue: matBlue, materialRed: matRed, blueMesh: blue, redMesh: red };
        }
    },

    _addSnow: (group: THREE.Group, w: number, h: number, d: number, x: number, y: number, z: number = 0) => {
        const snow = new THREE.Mesh(SHARED_GEOMETRIES.box, MATERIALS.snow);
        snow.scale.set(w * 1.05, 0.1, d * 1.05);
        snow.position.set(x, y, z);
        group.add(snow);
    },

    _finalize: (group: THREE.Group) => {
        group.userData.material = 'METAL';
        group.rotateY(Math.PI * 1.5);
        return group;
    }
};