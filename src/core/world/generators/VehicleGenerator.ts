import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MATERIALS } from '../../../utils/assets';

/**
 * VehicleGenerator
 * Dedicated generator for all driveable and static vehicles.
 * Optimized for Zero-GC, shared geometries, and fake emissive lighting.
 */

const S = 1.5;

// --- PERFORMANCE SCRATCHPADS ---
const _v1 = new THREE.Vector3();
const _m1 = new THREE.Matrix4();

// --- SHARED GEOMETRIES ---
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

export const createSignMesh = (text: string, width: number, height: number, textColor: string = '#ffaa00', bgColor: string = '#000000') => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    // [VINTERDÖD MOD] Dynamic aspect ratio to prevent stretching
    const aspect = width / height;
    if (aspect >= 1) {
        canvas.width = 512;
        canvas.height = Math.round(512 / aspect);
    } else {
        canvas.height = 512;
        canvas.width = Math.round(512 * aspect);
    }

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Font size relative to height for consistent padding
    const fontSize = Math.round(canvas.height * 0.75);
    ctx.font = `bold ${fontSize}px Arial`;
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
    return mesh;
};

export const VehicleGenerator = {

    createBoat: (): THREE.Mesh => {
        if (!boatMat) {
            boatMat = (MATERIALS.wood as THREE.MeshStandardMaterial).clone();
            boatMat.color.setHex(0x5a3d2b);
            boatMat.roughness = 0.85;
            boatMat.metalness = 0.0;
            boatMat.flatShading = true;
        }

        if (!cachedBoatGeo) {
            const parts: THREE.BufferGeometry[] = [];
            const addPart = (w: number, h: number, d: number, tx: number, ty: number, tz: number, rx = 0, ry = 0, rz = 0) => {
                const geo = new THREE.BoxGeometry(w * S, h * S, d * S);
                const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz));
                _m1.compose(_v1.set(tx * S, ty * S, tz * S), quat, new THREE.Vector3(1, 1, 1));
                geo.applyMatrix4(_m1);
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

            addPart(2.4, 1.0, 0.15, 0, 0.5, -(hullLength / 2 + 0.1), -0.2, 0, 0);
            addPart(1.2, 0.05, 4.0, 0, 0.05, 0.5);
            addPart(2.2, 0.08, 0.6, 0, 0.6, 1.8);
            addPart(2.3, 0.08, 0.7, 0, 0.6, -0.5);
            addPart(1.5, 0.08, 0.5, 0, 0.65, -2.8);

            cachedBoatGeo = BufferGeometryUtils.mergeGeometries(parts, false);
            // CRITICAL: Cleanup memory
            for (let i = 0; i < parts.length; i++) parts[i].dispose();
        }

        const boatMesh = new THREE.Mesh(cachedBoatGeo, boatMat);
        boatMesh.castShadow = true;
        boatMesh.receiveShadow = true;
        return boatMesh;
    },

    createStationWagon: (colorOverride?: number, addSnow: boolean = true) => {
        const root = new THREE.Group();
        const chassis = new THREE.Group();
        root.add(chassis);
        root.userData.chassis = chassis;

        const mat = VehicleGenerator._getVehicleMaterial(colorOverride ?? 0x7c2e2e);

        const cW = 1.8 * S; const cH = 0.7 * S; const cD = 4.6 * S;
        const groundClearance = 0.3 * S;
        const chassisY = groundClearance + (cH / 2);

        VehicleGenerator._addPart(chassis, cW, cH, cD, 0, chassisY, 0, mat);
        VehicleGenerator._addPart(chassis, 1.6 * S, 0.65 * S, 2.8 * S, 0, chassisY + (cH / 2) + 0.325 * S, -0.4 * S, mat);

        const cabY = chassisY + (cH / 2) + 0.325 * S;

        VehicleGenerator._addWindow(chassis, 1.4 * S, 0.5 * S, 0.05 * S, 0, cabY, 1.4 * S);
        VehicleGenerator._addWindow(chassis, 0.05 * S, 0.45 * S, 1.2 * S, 0.81 * S, cabY, 0.2 * S);
        VehicleGenerator._addWindow(chassis, 0.05 * S, 0.45 * S, 1.2 * S, -0.81 * S, cabY, 0.2 * S);
        VehicleGenerator._addWindow(chassis, 0.05 * S, 0.45 * S, 1.0 * S, 0.81 * S, cabY, -1.0 * S);
        VehicleGenerator._addWindow(chassis, 0.05 * S, 0.45 * S, 1.0 * S, -0.81 * S, cabY, -1.0 * S);
        VehicleGenerator._addWindow(chassis, 1.4 * S, 0.5 * S, 0.05 * S, 0, cabY, -1.4 * S);

        VehicleGenerator._addTires(root, 4, 0.35 * S, 0.4 * S, 0.95 * S, 1.5 * S, -1.5 * S);
        VehicleGenerator._addLights(chassis, root, cW, cH, cD, chassisY);
        VehicleGenerator._addBrakeLights(chassis, root, cW, cH, cD, chassisY);

        if (addSnow) VehicleGenerator._addSnow(chassis, cW, 0.1 * S, cD, 0, chassisY + (cH / 2), -0.4 * S);

        return VehicleGenerator._finalize(root);
    },

    createSedan: (colorOverride?: number, addSnow: boolean = true) => {
        const root = new THREE.Group();
        const chassis = new THREE.Group();
        root.add(chassis);
        root.userData.chassis = chassis;

        const mat = VehicleGenerator._getVehicleMaterial(colorOverride ?? 0x3e4c5e);

        const cW = 1.8 * S; const cH = 0.7 * S; const cD = 4.5 * S;
        const groundClearance = 0.3 * S;
        const chassisY = groundClearance + (cH / 2);

        VehicleGenerator._addPart(chassis, cW, cH, cD, 0, chassisY, 0, mat);
        VehicleGenerator._addPart(chassis, 1.6 * S, 0.65 * S, 2.2 * S, 0, chassisY + (cH / 2) + 0.325 * S, -0.1 * S, mat);

        const cabY = chassisY + (cH / 2) + 0.325 * S;

        VehicleGenerator._addWindow(chassis, 1.4 * S, 0.5 * S, 0.05 * S, 0, cabY, 1.1 * S);
        VehicleGenerator._addWindow(chassis, 0.05 * S, 0.45 * S, 1.0 * S, 0.81 * S, cabY, 0.1 * S);
        VehicleGenerator._addWindow(chassis, 0.05 * S, 0.45 * S, 1.0 * S, -0.81 * S, cabY, 0.1 * S);
        VehicleGenerator._addWindow(chassis, 1.4 * S, 0.5 * S, 0.05 * S, 0, cabY, -1.2 * S);

        VehicleGenerator._addTires(root, 4, 0.35 * S, 0.4 * S, 0.95 * S, 1.4 * S, -1.4 * S);
        VehicleGenerator._addLights(chassis, root, cW, cH, cD, chassisY);
        VehicleGenerator._addBrakeLights(chassis, root, cW, cH, cD, chassisY);

        if (addSnow) VehicleGenerator._addSnow(chassis, cW, 0.1 * S, cD, 0, chassisY + (cH / 2), -0.1 * S);

        return VehicleGenerator._finalize(root);
    },

    createPoliceCar: (colorOverride?: number, addSnow: boolean = true) => {
        const root = new THREE.Group();
        const chassis = new THREE.Group();
        root.add(chassis);
        root.userData.chassis = chassis;

        const mat = VehicleGenerator._getVehicleMaterial(0xffffff);

        const cW = 1.8 * S; const cH = 0.7 * S; const cD = 4.6 * S;
        const groundClearance = 0.3 * S;
        const chassisY = groundClearance + (cH / 2);

        VehicleGenerator._addPart(chassis, cW, cH, cD, 0, chassisY, 0, mat);
        VehicleGenerator._addPart(chassis, 1.6 * S, 0.65 * S, 2.8 * S, 0, chassisY + (cH / 2) + 0.325 * S, -0.4 * S, mat);

        const cabY = chassisY + (cH / 2) + 0.325 * S;

        const signPolis = createSignMesh("POLIS", 1.8 * S, 0.4 * S, '#000000', '#ffff00');
        signPolis.position.set(-0.91 * S, chassisY, 0);
        signPolis.rotation.y = -Math.PI / 2;
        chassis.add(signPolis);

        const signPolisR = new THREE.Mesh(signPolis.geometry, signPolis.material);
        signPolisR.position.x = 0.91 * S;
        signPolisR.rotation.y = Math.PI / 2;
        chassis.add(signPolisR);

        VehicleGenerator._addWindow(chassis, 1.4 * S, 0.5 * S, 0.05 * S, 0, cabY, 1.0 * S);
        VehicleGenerator._addWindow(chassis, 0.05 * S, 0.45 * S, 1.2 * S, 0.81 * S, cabY, 0.2 * S);
        VehicleGenerator._addWindow(chassis, 0.05 * S, 0.45 * S, 1.2 * S, -0.81 * S, cabY, 0.2 * S);
        VehicleGenerator._addWindow(chassis, 1.4 * S, 0.5 * S, 0.05 * S, 0, cabY, -1.8 * S);

        VehicleGenerator._addTires(root, 4, 0.35 * S, 0.4 * S, 0.95 * S, 1.5 * S, -1.5 * S);

        const roofY = cabY + (0.65 * S / 2);
        VehicleGenerator._addSirens(chassis, root, 0, roofY, -0.4 * S, true);

        VehicleGenerator._addLights(chassis, root, cW, cH, cD, chassisY);
        VehicleGenerator._addBrakeLights(chassis, root, cW, cH, cD, chassisY);

        if (addSnow) VehicleGenerator._addSnow(chassis, cW, 0.1 * S, cD, 0, chassisY + (cH / 2), -0.4 * S);

        return VehicleGenerator._finalize(root);
    },

    createAmbulance: (colorOverride?: number, addSnow: boolean = true) => {
        const root = new THREE.Group();
        const chassis = new THREE.Group();
        root.add(chassis);
        root.userData.chassis = chassis;

        const mat = VEHICLE_MATS.ambulanceYellow;

        const cW = 2.2 * S; const cH = 1.0 * S; const cD = 5.2 * S;
        const groundClearance = 0.4 * S;
        const chassisY = groundClearance + (cH / 2);

        VehicleGenerator._addPart(chassis, cW, cH, cD, 0, chassisY, 0, mat);

        const cabH = 1.4 * S; const cabD = 3.8 * S;
        const cabY = chassisY + (cH / 2) + (cabH / 2);

        // Calculate roofY early for both the cross and the sirens
        const roofY = cabY + (cabH / 2);

        VehicleGenerator._addPart(chassis, 2.0 * S, cabH, cabD, 0, cabY, -0.7 * S, mat);

        // Create a single, larger cross for the roof (Square aspect ratio handled by ui.ts)
        const cross = createSignMesh("✚", 1.8 * S, 1.8 * S, '#ff0000', '#ffffff');

        // Center on the cab roof (-0.7 * S is the cab center)
        cross.position.set(0, roofY + 0.01 * S, -0.7 * S);
        cross.rotation.x = -Math.PI / 2;
        chassis.add(cross);

        VehicleGenerator._addWindow(chassis, 1.8 * S, 0.7 * S, 0.05 * S, 0, cabY, 1.2 * S);
        VehicleGenerator._addWindow(chassis, 0.05 * S, 0.6 * S, 1.0 * S, 1.01 * S, cabY, 0.5 * S);
        VehicleGenerator._addWindow(chassis, 0.05 * S, 0.6 * S, 1.0 * S, -1.01 * S, cabY, 0.5 * S);
        VehicleGenerator._addWindow(chassis, 0.05 * S, 0.8 * S, 1.5 * S, 1.01 * S, cabY, -1.5 * S);
        VehicleGenerator._addWindow(chassis, 0.05 * S, 0.8 * S, 1.5 * S, -1.01 * S, cabY, -1.5 * S);

        VehicleGenerator._addPart(chassis, 0.95 * S, 1.2 * S, 0.05 * S, 0.5 * S, cabY, -2.6 * S, mat);
        VehicleGenerator._addPart(chassis, 0.95 * S, 1.2 * S, 0.05 * S, -0.5 * S, cabY, -2.6 * S, mat);

        VehicleGenerator._addTires(root, 4, 0.45 * S, 0.5 * S, 1.15 * S, 1.6 * S, -1.8 * S);

        VehicleGenerator._addSirens(chassis, root, 0, roofY, 0.8 * S, true);

        VehicleGenerator._addLights(chassis, root, cW, cH, cD, chassisY);
        VehicleGenerator._addBrakeLights(chassis, root, cW, cH, cD, chassisY);

        return VehicleGenerator._finalize(root);
    },

    createBus: (colorOverride?: number, addSnow: boolean = true) => {
        const root = new THREE.Group();
        const chassis = new THREE.Group();
        root.add(chassis);
        root.userData.chassis = chassis;

        const mat = VehicleGenerator._getVehicleMaterial(colorOverride ?? 0x009ddb);

        const cW = 3.5 * S; const cH = 2.5 * S; const cD = 12.0 * S;
        const groundClearance = 0.5 * S;
        const chassisY = groundClearance + (cH / 2);

        VehicleGenerator._addPart(chassis, cW, cH, cD, 0, chassisY, 0, mat);

        const frontSign = createSignMesh("159 DALSJÖFORS", 2.0 * S, 0.5 * S, '#ffaa00', '#000000');
        frontSign.position.set(0, chassisY + 1.0 * S, (cD / 2) + 0.01);
        chassis.add(frontSign);

        VehicleGenerator._addWindow(chassis, 3.1 * S, 1.2 * S, 0.05 * S, 0, chassisY + 0.1 * S, cD / 2);

        for (let i = 0; i < 6; i++) {
            const zPos = 5.0 * S - i * 2.0 * S;
            VehicleGenerator._addWindow(chassis, 0.05 * S, 1.0 * S, 1.5 * S, (cW / 2) + 0.01, chassisY + 0.2 * S, zPos);
            VehicleGenerator._addWindow(chassis, 0.05 * S, 1.0 * S, 1.5 * S, -(cW / 2) - 0.01, chassisY + 0.2 * S, zPos);
        }

        const backSign = createSignMesh("159", 0.8 * S, 0.4 * S, '#ffaa00', '#000000');
        backSign.position.set(0, chassisY + 1.0 * S, -(cD / 2) - 0.01);
        backSign.rotation.y = Math.PI;
        chassis.add(backSign);

        VehicleGenerator._addWindow(chassis, 3.1 * S, 0.8 * S, 0.05 * S, 0, chassisY + 0.3 * S, -(cD / 2));

        VehicleGenerator._addTires(root, 6, 0.65 * S, 0.6 * S, 1.55 * S, 4.5 * S, -4.5 * S, -2.5 * S);

        VehicleGenerator._addLights(chassis, root, cW, cH, cD, chassisY);
        VehicleGenerator._addBrakeLights(chassis, root, cW, cH, cD, chassisY);

        if (addSnow) VehicleGenerator._addSnow(chassis, cW, 0.15 * S, cD, 0, chassisY + (cH / 2), 0);

        return VehicleGenerator._finalize(root);
    },

    createTractor: (colorOverride?: number, addSnow: boolean = true) => {
        const root = new THREE.Group();
        const chassis = new THREE.Group();
        root.add(chassis);
        root.userData.chassis = chassis;

        const mat = VehicleGenerator._getVehicleMaterial(colorOverride ?? 0xcc2222);

        const cW = 1.4 * S; const cH = 0.8 * S; const cD = 1.5 * S;
        const groundClearance = 0.6 * S;
        const bonnetY = groundClearance + (cH / 2);

        VehicleGenerator._addPart(chassis, cW, cH, cD, 0, bonnetY, 0.5 * S, mat);

        const cabH = 1.8 * S;
        const cabY = groundClearance + (cabH / 2) + 0.2 * S;
        VehicleGenerator._addPart(chassis, 1.8 * S, cabH, 1.2 * S, 0, cabY, -0.65 * S, mat);

        VehicleGenerator._addWindow(chassis, 1.6 * S, 1.0 * S, 0.05 * S, 0, cabY, -0.05 * S);
        VehicleGenerator._addWindow(chassis, 0.05 * S, 1.0 * S, 0.8 * S, 0.9 * S, cabY, -0.65 * S);
        VehicleGenerator._addWindow(chassis, 0.05 * S, 1.0 * S, 0.8 * S, -0.9 * S, cabY, -0.65 * S);

        const addT = (isFront: boolean, tx: number, tz: number) => {
            const geo = isFront ? SHARED_GEOMETRIES.tire12 : SHARED_GEOMETRIES.tire16;
            const m = new THREE.Mesh(geo, VEHICLE_MATS.tire);
            m.rotation.z = Math.PI / 2;
            const r = (isFront ? 0.45 : 0.8) * S;
            const w = (isFront ? 0.45 : 0.7) * S;
            m.scale.set(r, w, r);
            m.position.set(tx * S, r, tz * S);
            m.castShadow = true;
            root.add(m);
        };

        addT(true, 0.85, 1.4); addT(true, -0.85, 1.4);
        addT(false, 1.1, -0.8); addT(false, -1.1, -0.8);

        VehicleGenerator._addLights(chassis, root, cW, cH, cD, bonnetY, 0.5 * S);

        return VehicleGenerator._finalize(root);
    },

    createTimberTruck: (colorOverride?: number, addSnow: boolean = true) => {
        const root = new THREE.Group();
        const chassis = new THREE.Group();
        root.add(chassis);
        root.userData.chassis = chassis;

        const mat = VehicleGenerator._getVehicleMaterial(colorOverride ?? 0x4a5c4a);

        const cW = 2.6 * S; const cH = 0.8 * S; const cD = 12.0 * S;
        const groundClearance = 0.6 * S;
        const chassisY = groundClearance + (cH / 2);

        VehicleGenerator._addPart(chassis, cW, cH, cD, 0, chassisY, 0, mat);

        const cabH = 1.8 * S;
        const cabY = chassisY + (cH / 2) + (cabH / 2);
        VehicleGenerator._addPart(chassis, 2.4 * S, cabH, 2.5 * S, 0, cabY, 4.7 * S, mat);

        VehicleGenerator._addWindow(chassis, 2.0 * S, 1.0 * S, 0.05 * S, 0, cabY + 0.1 * S, 5.96 * S);
        VehicleGenerator._addWindow(chassis, 0.05 * S, 1.0 * S, 1.2 * S, 1.21 * S, cabY + 0.1 * S, 4.7 * S);
        VehicleGenerator._addWindow(chassis, 0.05 * S, 1.0 * S, 1.2 * S, -1.21 * S, cabY + 0.1 * S, 4.7 * S);

        VehicleGenerator._addTires(root, 6, 0.6 * S, 0.6 * S, 1.3 * S, 4.5 * S, -4.5 * S, -3.0 * S);
        VehicleGenerator._addLights(chassis, root, cW, cH, cD, chassisY);
        VehicleGenerator._addBrakeLights(chassis, root, cW, cH, cD, chassisY);

        import('./ObjectGenerator').then(({ ObjectGenerator }) => {
            const logs = ObjectGenerator.createTimberPile(1.0);
            logs.position.set(0, chassisY + (cH / 2) + 0.2 * S, -1.5 * S);
            logs.rotation.set(0, Math.PI, 0);
            logs.scale.set(1.5 * S, 1.5 * S, 1.5 * S);
            chassis.add(logs);
        });

        return VehicleGenerator._finalize(root);
    },

    createVehicle: (type: string = 'station wagon', colorOverride?: number, addSnow: boolean = true): THREE.Group => {
        if (type === 'police') return VehicleGenerator.createPoliceCar(colorOverride, addSnow);
        if (type === 'ambulance') return VehicleGenerator.createAmbulance(colorOverride, addSnow);
        if (type === 'bus') return VehicleGenerator.createBus(colorOverride, addSnow);
        if (type === 'tractor') return VehicleGenerator.createTractor(colorOverride, addSnow);
        if (type === 'timber_truck') return VehicleGenerator.createTimberTruck(colorOverride, addSnow);
        if (type === 'sedan') return VehicleGenerator.createSedan(colorOverride, addSnow);
        return VehicleGenerator.createStationWagon(colorOverride, addSnow);
    },

    // --- INTERNAL HELPERS ---

    _getVehicleMaterial: (color: number) => {
        if (!vehicleBodyCache[color]) {
            const mat = (MATERIALS.vehicleBody as THREE.MeshStandardMaterial).clone();
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
            m.rotation.z = Math.PI / 2;
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

    _addLights: (chassis: THREE.Group, root: THREE.Group, cW: number, cH: number, cD: number, yCenter: number, zOffset: number = 0) => {
        const xOffset = (cW / 2) - (0.2 * S);
        const yPos = yCenter + (cH / 2) - (0.15 * S);
        const zPos = (cD / 2) + zOffset;

        const createL = (xPos: number) => {
            const glow = new THREE.Mesh(SHARED_GEOMETRIES.sphere, VEHICLE_MATS.headlight);
            glow.scale.setScalar(0.15 * S);
            glow.position.set(xPos, yPos, zPos);
            chassis.add(glow);
            return glow;
        };

        const left = createL(-xOffset);
        const right = createL(xOffset);

        if (!root.userData.lights) root.userData.lights = {};
        root.userData.lights.headlights = { material: VEHICLE_MATS.headlight, meshes: [left, right] };
    },

    _addBrakeLights: (chassis: THREE.Group, root: THREE.Group, cW: number, cH: number, cD: number, yCenter: number) => {
        const xOffset = (cW / 2) - (0.3 * S);
        const yPos = yCenter + (cH / 2) - (0.15 * S);
        const zPos = -(cD / 2 + 0.01);

        const createL = (xPos: number) => {
            const glow = new THREE.Mesh(SHARED_GEOMETRIES.box, VEHICLE_MATS.brakeLight);
            glow.scale.set(0.4 * S, 0.2 * S, 0.01);
            glow.position.set(xPos, yPos, zPos);
            chassis.add(glow);
            return glow;
        };

        const left = createL(-xOffset);
        const right = createL(xOffset);

        if (!root.userData.lights) root.userData.lights = {};
        root.userData.lights.brake = { material: VEHICLE_MATS.brakeLight, meshes: [left, right] };
    },

    _addSirens: (chassis: THREE.Group, root: THREE.Group, x: number, y: number, z: number, enableBlinking: boolean = false) => {
        VehicleGenerator._addPart(chassis, 0.8 * S, 0.15 * S, 0.4 * S, x, y + 0.05 * S, z, VEHICLE_MATS.sirenBase);

        const blue = new THREE.Mesh(SHARED_GEOMETRIES.box, VEHICLE_MATS.sirenBlue);
        blue.scale.set(0.3 * S, 0.1 * S, 0.15 * S);
        blue.position.set(x + 0.2 * S, y + 0.15 * S, z);
        chassis.add(blue);

        const red = new THREE.Mesh(SHARED_GEOMETRIES.box, VEHICLE_MATS.sirenRed);
        red.scale.set(0.3 * S, 0.1 * S, 0.15 * S);
        red.position.set(x - 0.2 * S, y + 0.15 * S, z);
        chassis.add(red);

        if (enableBlinking) {
            root.userData.sirenOn = false;
            if (!root.userData.lights) root.userData.lights = {};
            root.userData.lights.siren = { materialBlue: VEHICLE_MATS.sirenBlue, materialRed: VEHICLE_MATS.sirenRed, blueMesh: blue, redMesh: red };
        }
    },

    _addSnow: (group: THREE.Group, w: number, h: number, d: number, x: number, y: number, z: number = 0) => {
        const snow = new THREE.Mesh(SHARED_GEOMETRIES.box, MATERIALS.snow);
        snow.scale.set(w * 1.05, h, d * 1.05);
        snow.position.set(x, y, z);
        group.add(snow);
    },

    _finalize: (root: THREE.Group) => {
        root.userData.material = 'METAL';
        return root;
    }
};