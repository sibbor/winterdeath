import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MATERIALS, createSignMesh } from '../../utils/assets';
import { VEHICLE_HEADLIGHT } from '../../content/constants';


/**
 * VehicleGenerator
 * Dedicated generator for all driveable and static vehicles.
 * Optimized for Zero-GC, shared geometries, and fake emissive lighting.
 * Features separated chassis and root groups for realistic suspension.
 */

// --- GLOBAL SCALE MULTIPLIER ---
// 1.5x gör fordonen betydligt mer proportionerliga gentemot spelaren
const S = 1.5;

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
                const geo = new THREE.BoxGeometry(w * S, h * S, d * S);
                geo.rotateY(ry); geo.rotateX(rx); geo.rotateZ(rz);
                geo.translate(tx * S, ty * S, tz * S);
                parts.push(geo);
            };

            const hullLength = 6.5;
            addPart(0.15, 0.3, hullLength + 0.5, 0, -0.2, 0); // Köl (Z är längden)
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

            addPart(2.4, 1.0, 0.15, 0, 0.5, -(hullLength / 2 + 0.1), -0.2, 0, 0); // Akter
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

        // OBS! Ingen rotateY(Math.PI / 2) här. Båten byggs exakt längs med Z från start.

        return boatMesh;
    },

    // Notera nu: X är Bredd, Y är Höjd, Z är Längd framåt/bakåt.
    // Däcken sätts på Y = radien. Detta garanterar att botten på däcket alltid är Y = 0.

    createStationWagon: (colorOverride?: number, addSnow: boolean = true) => {
        const root = new THREE.Group();
        const chassis = new THREE.Group();
        root.add(chassis);
        root.userData.chassis = chassis;

        const mat = VehicleGenerator._getVehicleMaterial(colorOverride ?? 0x7c2e2e);

        const cW = 1.8 * S; const cH = 0.7 * S; const cD = 4.6 * S;
        const groundClearance = 0.3 * S;
        const chassisY = groundClearance + (cH / 2); // Exakt botten-nivå för karossen

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

        // POLICE SIGN FIX: Exakt på dörrarna (sidorna), roterade rätt
        const signPolis = createSignMesh("POLIS", 1.8 * S, 0.4 * S, '#000000', '#ffff00');
        signPolis.position.set(-0.91 * S, chassisY, 0);
        signPolis.rotation.y = -Math.PI / 2;
        chassis.add(signPolis);

        const signPolisR = signPolis.clone();
        signPolisR.position.x = 0.91 * S;
        signPolisR.rotation.y = Math.PI / 2;
        chassis.add(signPolisR);

        VehicleGenerator._addWindow(chassis, 1.4 * S, 0.5 * S, 0.05 * S, 0, cabY, 1.0 * S);
        VehicleGenerator._addWindow(chassis, 0.05 * S, 0.45 * S, 1.2 * S, 0.81 * S, cabY, 0.2 * S);
        VehicleGenerator._addWindow(chassis, 0.05 * S, 0.45 * S, 1.2 * S, -0.81 * S, cabY, 0.2 * S);
        VehicleGenerator._addWindow(chassis, 1.4 * S, 0.5 * S, 0.05 * S, 0, cabY, -1.8 * S);

        VehicleGenerator._addTires(root, 4, 0.35 * S, 0.4 * S, 0.95 * S, 1.5 * S, -1.5 * S);

        // SIREN FIX: På taket!
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

        VehicleGenerator._addPart(chassis, cW, cH, cD, 0, chassisY, 0, mat); // Lower body

        // Förlängt skåp som går ända bak till dörrarna
        const cabH = 1.4 * S; const cabD = 3.8 * S;
        const cabY = chassisY + (cH / 2) + (cabH / 2);
        VehicleGenerator._addPart(chassis, 2.0 * S, cabH, cabD, 0, cabY, -0.7 * S, mat);

        const cross = createSignMesh("✚", 0.5 * S, 0.5 * S, '#ff0000', '#ffffff');
        cross.position.set(-1.01 * S, cabY, -0.7 * S);
        cross.rotation.y = -Math.PI / 2;
        chassis.add(cross);

        const crossR = cross.clone();
        crossR.position.x = 1.01 * S;
        crossR.rotation.y = Math.PI / 2;
        chassis.add(crossR);

        VehicleGenerator._addWindow(chassis, 1.8 * S, 0.7 * S, 0.05 * S, 0, cabY, 1.2 * S);
        VehicleGenerator._addWindow(chassis, 0.05 * S, 0.6 * S, 1.0 * S, 1.01 * S, cabY, 0.5 * S);
        VehicleGenerator._addWindow(chassis, 0.05 * S, 0.6 * S, 1.0 * S, -1.01 * S, cabY, 0.5 * S);
        VehicleGenerator._addWindow(chassis, 0.05 * S, 0.8 * S, 1.5 * S, 1.01 * S, cabY, -1.5 * S);
        VehicleGenerator._addWindow(chassis, 0.05 * S, 0.8 * S, 1.5 * S, -1.01 * S, cabY, -1.5 * S);

        // Bakdörrar
        VehicleGenerator._addPart(chassis, 0.95 * S, 1.2 * S, 0.05 * S, 0.5 * S, cabY, -2.6 * S, mat);
        VehicleGenerator._addPart(chassis, 0.95 * S, 1.2 * S, 0.05 * S, -0.5 * S, cabY, -2.6 * S, mat);

        VehicleGenerator._addTires(root, 4, 0.45 * S, 0.5 * S, 1.15 * S, 1.6 * S, -1.8 * S);

        const roofY = cabY + (cabH / 2);
        VehicleGenerator._addSirens(chassis, root, 0, roofY, 1.0 * S, true);

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
            const zPos = 4.0 * S - i * 2.0 * S;
            VehicleGenerator._addWindow(chassis, 0.05 * S, 1.0 * S, 1.5 * S, (cW / 2) + 0.01, chassisY + 0.2 * S, zPos);
            VehicleGenerator._addWindow(chassis, 0.05 * S, 1.0 * S, 1.5 * S, -(cW / 2) - 0.01, chassisY + 0.2 * S, zPos);
        }

        const backSign = createSignMesh("159", 0.8 * S, 0.4 * S, '#ffaa00', '#000000');
        backSign.position.set(0, chassisY + 1.0 * S, -(cD / 2) - 0.01);
        backSign.rotation.y = Math.PI;
        chassis.add(backSign);

        // Nedsänkt bakruta
        VehicleGenerator._addWindow(chassis, 3.1 * S, 0.8 * S, 0.05 * S, 0, chassisY - 0.2 * S, -(cD / 2));

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

        VehicleGenerator._addPart(chassis, cW, cH, cD, 0, bonnetY, 0.5 * S, mat); // Bonnet

        const cabH = 1.8 * S;
        const cabY = groundClearance + (cabH / 2) + 0.2 * S;
        VehicleGenerator._addPart(chassis, 1.8 * S, cabH, 1.2 * S, 0, cabY, -0.65 * S, mat); // Cab 

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
            m.position.set(tx * S, r, tz * S); // Perfekt på marken
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

        VehicleGenerator._addPart(chassis, cW, cH, cD, 0, chassisY, 0, mat); // Main bed

        const cabH = 1.8 * S;
        const cabY = chassisY + (cH / 2) + (cabH / 2);
        VehicleGenerator._addPart(chassis, 2.4 * S, cabH, 2.5 * S, 0, cabY, 4.7 * S, mat); // Cab front

        VehicleGenerator._addWindow(chassis, 2.0 * S, 1.0 * S, 0.05 * S, 0, cabY + 0.1 * S, 5.96 * S);
        VehicleGenerator._addWindow(chassis, 0.05 * S, 1.0 * S, 1.2 * S, 1.21 * S, cabY + 0.1 * S, 4.7 * S);
        VehicleGenerator._addWindow(chassis, 0.05 * S, 1.0 * S, 1.2 * S, -1.21 * S, cabY + 0.1 * S, 4.7 * S);

        VehicleGenerator._addTires(root, 6, 0.6 * S, 0.6 * S, 1.3 * S, 4.5 * S, -4.5 * S, -3.0 * S);

        VehicleGenerator._addLights(chassis, root, cW, cH, cD, chassisY);
        VehicleGenerator._addBrakeLights(chassis, root, cW, cH, cD, chassisY);

        import('./ObjectGenerator').then(({ ObjectGenerator }) => {
            const logs = ObjectGenerator.createTimberPile(1.0);

            // 1. Positionera uppe på flaket
            logs.position.set(0, chassisY + (cH / 2) + 0.2 * S, -1.5 * S);

            // 2. Rotera HELA högen 90 grader (Y-axeln) så de vilar längs med lastbilen
            logs.rotation.set(0, Math.PI / 2, 0);

            // 3. Skala upp högen! Extra mycket på Z (längden) så de fyller upp hela flaket
            logs.scale.set(1.5 * S, 1.5 * S, 2.6 * S);

            chassis.add(logs);
        });

        return VehicleGenerator._finalize(root);
    },

    createHeadlamp() {
        const vehicleHeadlight = new THREE.SpotLight(
            VEHICLE_HEADLIGHT.color,
            VEHICLE_HEADLIGHT.intensity,
            VEHICLE_HEADLIGHT.distance,
            VEHICLE_HEADLIGHT.angle,
            VEHICLE_HEADLIGHT.penumbra,
            VEHICLE_HEADLIGHT.decay);
        vehicleHeadlight.name = VEHICLE_HEADLIGHT.name;
        vehicleHeadlight.position.set(VEHICLE_HEADLIGHT.position.x, VEHICLE_HEADLIGHT.position.y, VEHICLE_HEADLIGHT.position.z);
        vehicleHeadlight.target.position.set(VEHICLE_HEADLIGHT.targetPosition.x, VEHICLE_HEADLIGHT.targetPosition.y, VEHICLE_HEADLIGHT.targetPosition.z);
        vehicleHeadlight.castShadow = VEHICLE_HEADLIGHT.castShadows;
        vehicleHeadlight.shadow.camera.near = VEHICLE_HEADLIGHT.cameraNear;
        vehicleHeadlight.shadow.camera.far = VEHICLE_HEADLIGHT.cameraFar;
        vehicleHeadlight.shadow.bias = VEHICLE_HEADLIGHT.shadowBias;

        return vehicleHeadlight;
    },

    createVehicle: (type: string = 'station wagon', colorOverride?: number, addSnow: boolean = true): THREE.Group => {
        let vehicleGroup: THREE.Group;

        // 1. Skapa rätt biltyp och spara i variabeln
        if (type === 'police') vehicleGroup = VehicleGenerator.createPoliceCar(colorOverride, addSnow);
        else if (type === 'ambulance') vehicleGroup = VehicleGenerator.createAmbulance(colorOverride, addSnow);
        else if (type === 'bus') vehicleGroup = VehicleGenerator.createBus(colorOverride, addSnow);
        else if (type === 'tractor') vehicleGroup = VehicleGenerator.createTractor(colorOverride, addSnow);
        else if (type === 'timber_truck') vehicleGroup = VehicleGenerator.createTimberTruck(colorOverride, addSnow);
        else if (type === 'sedan') vehicleGroup = VehicleGenerator.createSedan(colorOverride, addSnow);
        else vehicleGroup = VehicleGenerator.createStationWagon(colorOverride, addSnow);

        // 2. --- LÄGG TILL FORDONETS EGNA STRÅLKASTARE ---
        const vLight = VehicleGenerator.createHeadlamp();

        const lights = vehicleGroup.userData.lights;
        let frontZ = 0;
        let lightY = 0;

        // Försök läsa av positionen från bilens befintliga små "glödande" meshes
        if (lights && lights.headlights && lights.headlights.meshes && lights.headlights.meshes.length > 0) {
            frontZ = lights.headlights.meshes[0].position.z;
            lightY = lights.headlights.meshes[0].position.y;
        } else {
            // Fallback: Räkna ut var fronten är genom att mäta 3D-modellens volym
            const box = new THREE.Box3().setFromObject(vehicleGroup);
            frontZ = box.max.z;
            lightY = (box.max.y - box.min.y) * 0.4; // Sätt höjden till 40% av bilens höjd
        }

        vLight.position.set(0, lightY, frontZ + 0.2); // 0.2 m framför grillen
        vLight.target.position.set(0, lightY, frontZ + 20);

        // Fäst i chassit så lampan guppar med fjädringen (om chassi finns)
        const mountTarget = vehicleGroup.userData.chassis || vehicleGroup;
        mountTarget.add(vLight);
        mountTarget.add(vLight.target);

        // 3. Returnera det färdiga fordonet med inbyggd lampa
        return vehicleGroup;
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
            m.rotation.z = Math.PI / 2; // Rullar längs Z
            m.scale.set(radius, width, radius);
            // Eftersom vi sätter y = radius är botten av däcket garanterat på y=0
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
        const mat = VEHICLE_MATS.headlight.clone();

        const xOffset = (cW / 2) - (0.2 * S);
        const yPos = yCenter + (cH / 2) - (0.15 * S);
        const zPos = (cD / 2) + zOffset;

        const createL = (xPos: number) => {
            const glow = new THREE.Mesh(SHARED_GEOMETRIES.sphere, mat);
            glow.scale.setScalar(0.15 * S);
            glow.position.set(xPos, yPos, zPos);
            chassis.add(glow);
            return glow;
        };

        const left = createL(-xOffset);
        const right = createL(xOffset);

        if (!root.userData.lights) root.userData.lights = {};
        root.userData.lights.headlights = { material: mat, meshes: [left, right] };
    },

    _addBrakeLights: (chassis: THREE.Group, root: THREE.Group, cW: number, cH: number, cD: number, yCenter: number) => {
        const mat = VEHICLE_MATS.brakeLight.clone();

        const xOffset = (cW / 2) - (0.3 * S);
        const yPos = yCenter + (cH / 2) - (0.15 * S);
        const zPos = -(cD / 2 + 0.01);

        const createL = (xPos: number) => {
            const glow = new THREE.Mesh(SHARED_GEOMETRIES.box, mat);
            glow.scale.set(0.4 * S, 0.2 * S, 0.01);
            glow.position.set(xPos, yPos, zPos);
            chassis.add(glow);
            return glow;
        };

        const left = createL(-xOffset);
        const right = createL(xOffset);

        if (!root.userData.lights) root.userData.lights = {};
        root.userData.lights.brake = { material: mat, meshes: [left, right] };
    },

    _addSirens: (chassis: THREE.Group, root: THREE.Group, x: number, y: number, z: number, enableBlinking: boolean = false) => {
        const matBlue = VEHICLE_MATS.sirenBlue.clone();
        const matRed = VEHICLE_MATS.sirenRed.clone();

        VehicleGenerator._addPart(chassis, 0.8 * S, 0.15 * S, 0.4 * S, x, y + 0.05 * S, z, VEHICLE_MATS.sirenBase);

        const blue = new THREE.Mesh(SHARED_GEOMETRIES.box, matBlue);
        blue.scale.set(0.3 * S, 0.1 * S, 0.15 * S);
        blue.position.set(x + 0.2 * S, y + 0.15 * S, z);
        chassis.add(blue);

        const red = new THREE.Mesh(SHARED_GEOMETRIES.box, matRed);
        red.scale.set(0.3 * S, 0.1 * S, 0.15 * S);
        red.position.set(x - 0.2 * S, y + 0.15 * S, z);
        chassis.add(red);

        if (enableBlinking) {
            root.userData.sirenOn = false;
            if (!root.userData.lights) root.userData.lights = {};
            root.userData.lights.siren = { materialBlue: matBlue, materialRed: matRed, blueMesh: blue, redMesh: red };
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