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

let boatMat: THREE.MeshStandardMaterial | null = null;
let cachedBoatGeo: THREE.BufferGeometry | null = null;
const vehicleBodyCache: Record<number, THREE.MeshStandardMaterial> = {};

const VEHICLE_MATS = {
    window: new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.1, metalness: 0.9, transparent: true, opacity: 0.7 }),
    tire: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 }),
    sirenBase: new THREE.MeshStandardMaterial({ color: 0x111111 }),
    headlight: new THREE.MeshStandardMaterial({ color: 0xdddddd, emissive: 0xffffff, emissiveIntensity: 0 }),
    sirenBlue: new THREE.MeshStandardMaterial({ color: 0x0044ff, emissive: 0x0022ff, emissiveIntensity: 0 }),
    sirenRed: new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xaa0000, emissiveIntensity: 0 }),
    brakeLight: new THREE.MeshStandardMaterial({ color: 0xaa0000, emissive: 0xff0000, emissiveIntensity: 0 }),
    ambulanceYellow: new THREE.MeshStandardMaterial({ color: 0xddff00, roughness: 0.5, metalness: 0.2 }),
};

export const VehicleGenerator = {

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
        // Båten pekar nu längs Z-axeln från start
        boatMesh.rotateY(Math.PI / 2);

        return boatMesh;
    },

    // Notera: X är Bredd, Y är Höjd, Z är Längd framåt/bakåt.
    // Positiva Z = framåt i världen (där grillen och headlights är).
    // Negativa Z = bakåt (där brake lights är).

    createStationWagon: (colorOverride?: number, addSnow: boolean = true) => {
        const group = new THREE.Group();
        const mat = VehicleGenerator._getVehicleMaterial(colorOverride ?? 0x7c2e2e);

        VehicleGenerator._addPart(group, 1.8, 0.7, 4.6, 0, 0.65, 0, mat); // Chassis
        VehicleGenerator._addPart(group, 1.6, 0.65, 2.8, 0, 1.25, -0.4, mat); // Cabin

        VehicleGenerator._addWindow(group, 1.4, 0.5, 0.05, 0, 1.25, 1.0);
        VehicleGenerator._addWindow(group, 0.05, 0.45, 1.2, 0.82, 1.25, 0.2);
        VehicleGenerator._addWindow(group, 0.05, 0.45, 1.2, -0.82, 1.25, 0.2);
        VehicleGenerator._addWindow(group, 0.05, 0.45, 1.0, 0.82, 1.25, -1.2);
        VehicleGenerator._addWindow(group, 0.05, 0.45, 1.0, -0.82, 1.25, -1.2);
        VehicleGenerator._addWindow(group, 1.4, 0.5, 0.05, 0, 1.25, -1.8);

        VehicleGenerator._addTires(group, 4, 0.35, 0.4, 0.95, 1.5, -1.5);
        VehicleGenerator._addLights(group, 0.7, 0.65, 2.3);
        VehicleGenerator._addBrakeLights(group, 0.7, 0.65, -2.3);

        if (addSnow) VehicleGenerator._addSnow(group, 1.7, 0.1, 3.0, 0, 1.6, -0.4);

        return VehicleGenerator._finalize(group);
    },

    createSedan: (colorOverride?: number, addSnow: boolean = true) => {
        const group = new THREE.Group();
        const mat = VehicleGenerator._getVehicleMaterial(colorOverride ?? 0x3e4c5e);

        VehicleGenerator._addPart(group, 1.8, 0.7, 4.5, 0, 0.65, 0, mat);
        VehicleGenerator._addPart(group, 1.6, 0.65, 2.2, 0, 1.25, -0.1, mat);

        VehicleGenerator._addWindow(group, 1.4, 0.5, 0.05, 0, 1.25, 1.0);
        VehicleGenerator._addWindow(group, 0.05, 0.45, 1.0, 0.82, 1.25, 0.1);
        VehicleGenerator._addWindow(group, 0.05, 0.45, 1.0, -0.82, 1.25, 0.1);
        VehicleGenerator._addWindow(group, 1.4, 0.5, 0.05, 0, 1.25, -1.2);

        VehicleGenerator._addTires(group, 4, 0.35, 0.4, 0.95, 1.4, -1.4);
        VehicleGenerator._addLights(group, 0.7, 0.65, 2.25);
        VehicleGenerator._addBrakeLights(group, 0.7, 0.65, -2.25);

        if (addSnow) VehicleGenerator._addSnow(group, 1.7, 0.1, 2.4, 0, 1.6, -0.1);

        return VehicleGenerator._finalize(group);
    },

    createPoliceCar: (colorOverride?: number, addSnow: boolean = true) => {
        const group = new THREE.Group();
        const mat = VehicleGenerator._getVehicleMaterial(0xffffff);

        VehicleGenerator._addPart(group, 1.8, 0.7, 4.6, 0, 0.65, 0, mat);
        VehicleGenerator._addPart(group, 1.6, 0.65, 2.8, 0, 1.25, -0.4, mat);

        const signPolis = createSignMesh("POLIS", 1.8, 0.4, '#000000', '#ffff00');
        signPolis.position.set(0.82, 1.25, -0.4);
        signPolis.rotation.y = Math.PI / 2;
        group.add(signPolis);

        const signPolisR = signPolis.clone();
        signPolisR.position.x = -0.82;
        signPolisR.rotation.y = -Math.PI / 2;
        group.add(signPolisR);

        VehicleGenerator._addWindow(group, 1.4, 0.5, 0.05, 0, 1.25, 1.0);
        VehicleGenerator._addWindow(group, 0.05, 0.45, 1.2, 0.82, 1.25, 0.2);
        VehicleGenerator._addWindow(group, 0.05, 0.45, 1.2, -0.82, 1.25, 0.2);
        VehicleGenerator._addWindow(group, 1.4, 0.5, 0.05, 0, 1.25, -1.8);

        VehicleGenerator._addTires(group, 4, 0.35, 0.4, 0.95, 1.5, -1.5);
        VehicleGenerator._addSirens(group, 0, 1.6, 1.6, true);
        VehicleGenerator._addLights(group, 0.7, 0.65, 2.3);
        VehicleGenerator._addBrakeLights(group, 0.7, 0.65, -2.3);

        if (addSnow) VehicleGenerator._addSnow(group, 1.7, 0.1, 3.0, 0, 1.6, -0.4);

        return VehicleGenerator._finalize(group);
    },

    createAmbulance: (colorOverride?: number, addSnow: boolean = true) => {
        const group = new THREE.Group();
        const mat = VEHICLE_MATS.ambulanceYellow;

        VehicleGenerator._addPart(group, 2.2, 1.0, 5.2, 0, 0.8, 0, mat);
        VehicleGenerator._addPart(group, 2.0, 1.2, 3.8, 0, 1.9, 0, mat);

        const cross = createSignMesh("✚", 0.4, 0.4, '#ff0000', '#ffffff');
        cross.position.set(1.02, 1.9, 0);
        cross.rotation.y = Math.PI / 2;
        group.add(cross);

        const crossR = cross.clone();
        crossR.position.x = -1.02;
        crossR.rotation.y = -Math.PI / 2;
        group.add(crossR);

        VehicleGenerator._addWindow(group, 1.8, 0.7, 0.05, 0, 1.9, 1.9);
        VehicleGenerator._addWindow(group, 0.05, 0.6, 1.0, 1.02, 1.9, 1.2);
        VehicleGenerator._addWindow(group, 0.05, 0.6, 1.0, -1.02, 1.9, 1.2);
        VehicleGenerator._addWindow(group, 0.05, 0.8, 1.5, 1.02, 1.9, -1.0);
        VehicleGenerator._addWindow(group, 0.05, 0.8, 1.5, -1.02, 1.9, -1.0);

        VehicleGenerator._addPart(group, 0.95, 1.2, 0.05, 0.5, 1.9, -2.6, mat);
        VehicleGenerator._addPart(group, 0.95, 1.2, 0.05, -0.5, 1.9, -2.6, mat);

        VehicleGenerator._addTires(group, 4, 0.45, 0.5, 1.15, 1.8, -1.8);
        VehicleGenerator._addSirens(group, 0, 2.5, 2.0, true);
        VehicleGenerator._addLights(group, 0.8, 0.8, 2.6);
        VehicleGenerator._addBrakeLights(group, 0.8, 0.8, -2.6);

        return VehicleGenerator._finalize(group);
    },

    createBus: (colorOverride?: number, addSnow: boolean = true) => {
        const group = new THREE.Group();
        const mat = VehicleGenerator._getVehicleMaterial(colorOverride ?? 0x009ddb);

        VehicleGenerator._addPart(group, 3.5, 2.5, 12.0, 0, 1.55, 0, mat);

        const frontSign = createSignMesh("159 DALSJÖFORS", 2.0, 0.6, '#ffaa00', '#000000');
        frontSign.position.set(0, 2.5, 6.01);
        group.add(frontSign);

        VehicleGenerator._addWindow(group, 2.0, 1.2, 0.05, 0, 1.5, 6.0);

        for (let i = 0; i < 5; i++) {
            const zPos = 4.0 - i * 2.0;
            VehicleGenerator._addWindow(group, 0.05, 1.0, 1.5, 1.76, 1.8, zPos);
            VehicleGenerator._addWindow(group, 0.05, 1.0, 1.5, -1.76, 1.8, zPos);
        }

        const backSign = createSignMesh("159", 0.8, 0.4, '#ffaa00', '#000000');
        backSign.position.set(0, 2.5, -6.01);
        backSign.rotation.y = Math.PI;
        group.add(backSign);

        VehicleGenerator._addWindow(group, 2.0, 0.8, 0.05, 0, 1.5, -6.0);

        const addT = (tx: number, tz: number) => {
            const m = new THREE.Mesh(SHARED_GEOMETRIES.tire16, VEHICLE_MATS.tire);
            m.rotation.z = Math.PI / 2; // Rättad däckrotation för framåtvänd bil
            m.scale.set(0.65, 0.6, 0.65);
            m.position.set(tx, 0.65, tz);
            m.castShadow = true;
            group.add(m);
        };
        addT(1.55, 4.5); addT(-1.55, 4.5);
        addT(1.85, -4.5); addT(1.25, -4.5);
        addT(-1.85, -4.5); addT(-1.25, -4.5);

        VehicleGenerator._addLights(group, 1.2, 0.8, 6.01);
        VehicleGenerator._addBrakeLights(group, 1.2, 0.8, -6.01);

        if (addSnow) VehicleGenerator._addSnow(group, 3.5, 0.15, 12.0, 0, 2.85, 0);

        return VehicleGenerator._finalize(group);
    },

    createTractor: (colorOverride?: number, addSnow: boolean = true) => {
        const group = new THREE.Group();
        const mat = VehicleGenerator._getVehicleMaterial(colorOverride ?? 0xcc2222);

        VehicleGenerator._addPart(group, 1.8, 0.8, 2.5, 0, 0.7, 0, mat);
        VehicleGenerator._addPart(group, 1.4, 1.5, 1.2, 0, 1.5, -0.5, mat);

        VehicleGenerator._addWindow(group, 1.2, 1.0, 0.05, 0, 1.5, 0.1);
        VehicleGenerator._addWindow(group, 0.05, 1.0, 0.8, 0.72, 1.5, -0.5);
        VehicleGenerator._addWindow(group, 0.05, 1.0, 0.8, -0.72, 1.5, -0.5);

        const addT = (isFront: boolean, tx: number, ty: number, tz: number) => {
            const geo = isFront ? SHARED_GEOMETRIES.tire12 : SHARED_GEOMETRIES.tire16;
            const m = new THREE.Mesh(geo, VEHICLE_MATS.tire);
            m.rotation.z = Math.PI / 2;
            if (isFront) {
                m.scale.set(0.45, 0.45, 0.45);
            } else {
                m.scale.set(1.25, 0.7, 1.25);
            }
            m.position.set(tx, ty, tz);
            m.castShadow = true;
            group.add(m);
        };

        addT(true, 0.85, 0.45, 1.1); addT(true, -0.85, 0.45, 1.1);
        addT(false, 1.1, 1.25, -0.8); addT(false, -1.1, 1.25, -0.8);

        VehicleGenerator._addLights(group, 0.6, 0.8, 1.25);

        return VehicleGenerator._finalize(group);
    },

    createTimberTruck: (colorOverride?: number, addSnow: boolean = true) => {
        const group = new THREE.Group();
        const mat = VehicleGenerator._getVehicleMaterial(colorOverride ?? 0x4a5c4a);

        VehicleGenerator._addPart(group, 2.6, 0.8, 12.0, 0, 0.7, 0, mat);
        VehicleGenerator._addPart(group, 2.4, 1.8, 2.5, 0, 1.5, 4.0, mat);

        VehicleGenerator._addWindow(group, 2.0, 1.0, 0.05, 0, 1.8, 5.25);
        VehicleGenerator._addWindow(group, 0.05, 1.0, 1.2, 1.22, 1.8, 4.0);
        VehicleGenerator._addWindow(group, 0.05, 1.0, 1.2, -1.22, 1.8, 4.0);

        VehicleGenerator._addTires(group, 6, 0.55, 0.5, 1.3, 5.0, -3.0, -4.5);
        VehicleGenerator._addLights(group, 0.9, 0.7, 6.0);
        VehicleGenerator._addBrakeLights(group, 0.9, 0.7, -6.0);

        import('./ObjectGenerator').then(({ ObjectGenerator }) => {
            const logs = ObjectGenerator.createTimberPile(1.0);
            logs.position.set(0, 1.1, -1.8);
            logs.scale.set(1.3, 1, 1);
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

    _addTires: (group: THREE.Group, count: number, radius: number, width: number, x: number, z: number, rearZ: number, midZ?: number) => {
        const addT = (tx: number, tz: number) => {
            const m = new THREE.Mesh(SHARED_GEOMETRIES.tire16, VEHICLE_MATS.tire);
            m.rotation.z = Math.PI / 2; // Däck rullar längs Z nu
            m.scale.set(radius, width, radius);
            m.position.set(tx, radius, tz);
            m.castShadow = true;
            group.add(m);
        };
        addT(x, z); addT(-x, z);
        addT(x, rearZ); addT(-x, rearZ);
        if (count === 6 && midZ !== undefined) {
            addT(x, midZ); addT(-x, midZ);
        }
    },

    _addLights: (group: THREE.Group, xOff: number, y: number, z: number) => {
        const mat = VEHICLE_MATS.headlight.clone();

        const createL = (xPos: number) => {
            const glow = new THREE.Mesh(SHARED_GEOMETRIES.sphere, mat);
            glow.scale.setScalar(0.15);
            glow.position.set(xPos, y, z);
            group.add(glow);
            return glow;
        };

        const left = createL(-xOff);
        const right = createL(xOff);

        if (!group.userData.lights) group.userData.lights = {};
        group.userData.lights.headlights = { material: mat, meshes: [left, right] };
    },

    _addBrakeLights: (group: THREE.Group, xOff: number, y: number, z: number) => {
        const mat = VEHICLE_MATS.brakeLight.clone();

        const createL = (xPos: number) => {
            const glow = new THREE.Mesh(SHARED_GEOMETRIES.box, mat);
            glow.scale.set(0.4, 0.2, 0.1); // Bredare på X nu
            glow.position.set(xPos, y, z);
            group.add(glow);
            return glow;
        };

        const left = createL(-xOff);
        const right = createL(xOff);

        if (!group.userData.lights) group.userData.lights = {};
        group.userData.lights.brake = { material: mat, meshes: [left, right] };
    },

    _addSirens: (group: THREE.Group, x: number, y: number, z: number, enableBlinking: boolean = false) => {
        const matBlue = VEHICLE_MATS.sirenBlue.clone();
        const matRed = VEHICLE_MATS.sirenRed.clone();

        VehicleGenerator._addPart(group, 0.8, 0.15, 0.4, x, y + 0.05, z, VEHICLE_MATS.sirenBase);

        const blue = new THREE.Mesh(SHARED_GEOMETRIES.box, matBlue);
        blue.scale.set(0.3, 0.1, 0.15);
        blue.position.set(x + 0.2, y + 0.15, z);
        group.add(blue);

        const red = new THREE.Mesh(SHARED_GEOMETRIES.box, matRed);
        red.scale.set(0.3, 0.1, 0.15);
        red.position.set(x - 0.2, y + 0.15, z);
        group.add(red);

        if (enableBlinking) {
            group.userData.sirenOn = false;
            if (!group.userData.lights) group.userData.lights = {};
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
        // group.rotateY(Math.PI * 1.5); <--- BORTTAGEN! 
        // Bilen pekar nu i standard Z-riktning för att synka perfekt med fysiklådan
        return group;
    }
};