import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GEOMETRY as SHARED_GEO, MATERIALS } from '../../../utils/assets';
import { ObjectGenerator } from './ObjectGenerator';
import { MaterialType } from '../../../content/environment';
import { GeneratorUtils } from './GeneratorUtils';

const _v1 = new THREE.Vector3();

export const PoiGenerator = {

    createChurch: () => {
        const churchGroup = new THREE.Group();

        const churchBodyGeo = new THREE.BoxGeometry(15, 12, 15);
        churchBodyGeo.translate(0, 6, 0);
        const churchBody = new THREE.Mesh(churchBodyGeo, MATERIALS.brownBrick);
        churchGroup.add(churchBody);

        const crossVGeo = new THREE.BoxGeometry(0.5, 4, 0.2);
        crossVGeo.translate(0, 8, 7.6);
        const crossHGeo = new THREE.BoxGeometry(2.5, 0.5, 0.2);
        crossHGeo.translate(0, 8.5, 7.6);
        const mergedCrossGeo = BufferGeometryUtils.mergeGeometries([crossVGeo, crossHGeo]);
        const cross = new THREE.Mesh(mergedCrossGeo, MATERIALS.crossEmissive);
        churchGroup.add(cross);

        const towerGeo = new THREE.BoxGeometry(4, 12, 4);
        towerGeo.translate(-10, 6, -15);
        const towerTopGeo = new THREE.ConeGeometry(6, 2, 6);
        towerTopGeo.translate(-10, 12, -15);
        const mergedTowerGeo = BufferGeometryUtils.mergeGeometries([towerGeo, towerTopGeo]);
        const tower = new THREE.Mesh(mergedTowerGeo, MATERIALS.blackMetal);
        churchGroup.add(tower);

        // Dark green metal doors
        const doorMat = MATERIALS.blackMetal.clone();
        doorMat.color.setHex(0x004422); // Dark green
        const doorGeo = new THREE.PlaneGeometry(6, 6);
        const doors = new THREE.Mesh(doorGeo, doorMat);
        doors.position.set(0, 3, 7.6);
        churchGroup.add(doors);

        churchGroup.userData = {
            size: new THREE.Vector3(15, 20, 25),
            material: MaterialType.CONCRETE,
            effects: [
                { type: 'fire', smoke: true, intensity: 25, distance: 15, onRoof: true, target: 'main' },
                { type: 'fire', smoke: true, intensity: 60, distance: 25, onRoof: true, target: 'tower', offset: new THREE.Vector3(-10, 12, -15) }
            ],
            colliders: [
                { type: 'box', size: new THREE.Vector3(15, 20, 25) },
                { type: 'box', size: new THREE.Vector3(6, 20, 6), offset: new THREE.Vector3(-10, 0, -15) }
            ]
        };

        return GeneratorUtils.freezeStatic(churchGroup);
    },

    createCafe: () => {
        const group = new THREE.Group();

        const cafeLeftGeo = new THREE.BoxGeometry(5, 12, 12);
        cafeLeftGeo.translate(-6, 0, 0);
        const cafeRightGeo = new THREE.BoxGeometry(5, 12, 12);
        cafeRightGeo.translate(6, 0, 0);
        const cafeCenterGeo = new THREE.BoxGeometry(12, 12, 5);
        cafeCenterGeo.translate(0, 0, -3);

        const mergedCafeGeo = BufferGeometryUtils.mergeGeometries([cafeLeftGeo, cafeRightGeo, cafeCenterGeo]);
        const cafeBody = new THREE.Mesh(mergedCafeGeo, MATERIALS.yellowBrick);
        cafeBody.position.y = 6;
        group.add(cafeBody);

        group.userData = {
            size: new THREE.Vector3(18, 20, 12),
            material: MaterialType.CONCRETE,
            neonSign: { text: "CAFÉ", color: 0xffaa00, offset: new THREE.Vector3(0, 6, -6) },
            colliders: [{ type: 'box', size: new THREE.Vector3(18, 20, 12) }]
        };
        return GeneratorUtils.freezeStatic(group);
    },

    createGroceryStore: () => {
        const group = ObjectGenerator.createStorefrontBuilding(15, 10, 30, {
            lowerMat: MATERIALS.whiteBrick,
            upperMat: MATERIALS.wooden_fasade,
            shopWindows: false,
            upperWindows: true,
            withRoof: false
        });

        const grocWinMat = MATERIALS.glass;
        const grocWinGeo = new THREE.PlaneGeometry(3.5, 3.5);
        for (let z = -10; z <= 10; z += 5) {
            const win = new THREE.Mesh(grocWinGeo, grocWinMat);
            win.position.set(-7.6, 2.5, z);
            win.rotation.y = -Math.PI / 2;
            group.add(win);
        }

        const grocEntrance = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), MATERIALS.glass);
        grocEntrance.position.set(0, 3, -15.1);
        group.add(grocEntrance);

        // Store sign logic in userData so SectorBuilder can attach it later
        group.userData.neonSign = { text: "Ica Hjärtat", color: 0xffffff, offset: new THREE.Vector3(-7.7, 7.5, -2), rot: -Math.PI / 2 };
        group.userData.neonHeart = { offset: new THREE.Vector3(-7.7, 7.5, 6), rot: -Math.PI / 2 };
        group.userData.colliders = [{ type: 'box', size: new THREE.Vector3(15, 10, 30) }];

        return GeneratorUtils.freezeStatic(group);
    },

    createGym: () => {
        const gymMat = MATERIALS.sheet_metal.clone();
        gymMat.color.setHex(0xeae7d6);
        const group = ObjectGenerator.createStorefrontBuilding(40, 12, 20, {
            lowerMat: gymMat,
            upperMat: gymMat,
            shopWindows: true,
            upperWindows: true,
            withRoof: false,
            mapRepeat: { x: 40, y: 1 }
        });

        // Add staircase as separated group in userData? (To apply flicker)
        group.userData.staircase = { width: 6, height: 12, depth: 8, offset: new THREE.Vector3(-23, 0, 0) };
        group.userData.neonSign = { text: "Gånghester Gym", color: 0xffaa00, offset: new THREE.Vector3(-10, 4.5, 10.1) };
        group.userData.colliders = [{ type: 'box', size: new THREE.Vector3(40, 12, 20) }];

        return GeneratorUtils.freezeStatic(group);
    },

    createPizzeria: () => {
        const group = ObjectGenerator.createStorefrontBuilding(20, 8, 15, {
            lowerMat: MATERIALS.plaster,
            upperMat: MATERIALS.plaster,
            shopWindows: true,
            upperWindows: true,
            withRoof: true
        });

        group.userData.neonSign = { text: "Gånghester Pizzera", color: 0xffffff, backingColor: 0x000000, offset: new THREE.Vector3(0, 4.0, 7.6), rot: Math.PI };
        group.userData.colliders = [{ type: 'box', size: new THREE.Vector3(20, 8, 15) }];

        return GeneratorUtils.freezeStatic(group);
    },



    createDealership: () => {
        const group = new THREE.Group();
        const shed = new THREE.Mesh(new THREE.BoxGeometry(20, 8, 20), MATERIALS.metalPanel);
        shed.position.y = 4;
        group.add(shed);

        group.userData.colliders = [{ type: 'sphere', radius: 12 }];
        return GeneratorUtils.freezeStatic(group);
    },

    createFarm: () => {
        const group = ObjectGenerator.createBuilding(25, 8, 20, 0x7c2e2e, true, true);
        group.userData.effects = [{ type: 'fire', smoke: true, intensity: 20, distance: 40, onRoof: true }];
        return group;
    },

    createEggFarm: () => {
        const group = ObjectGenerator.createBuilding(25, 8, 20, 0x7c2e2e, true, true);
        group.userData.effects = [{ type: 'fire', smoke: true, intensity: 150, distance: 40, onRoof: true }];
        return group;
    },

    createBarn: () => {
        const group = ObjectGenerator.createBuilding(25, 8, 20, 0x7c2e2e, true, true);
        group.userData.effects = [{ type: 'fire', smoke: false, intensity: 0, distance: 0, onRoof: true }];
        return group;
    },

    // Moved from ObjectGenerator
    createMast: () => {
        const group = new THREE.Group();

        const mastBase = new THREE.Mesh(new THREE.BoxGeometry(10, 2, 10), MATERIALS.concrete);
        mastBase.position.y = 1;
        mastBase.castShadow = true;
        group.add(mastBase);

        const mastMesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 6, 60, 4), MATERIALS.mast);
        mastMesh.position.y = 30;
        mastMesh.castShadow = true;
        group.add(mastMesh);

        const lightHub = new THREE.Group();
        lightHub.name = "mastWarningLights";
        lightHub.position.y = 60;

        const lightXs = [2, -2];
        for (let i = 0; i < lightXs.length; i++) {
            const posX = lightXs[i];
            const lamp = new THREE.Mesh(
                new THREE.SphereGeometry(0.4),
                new THREE.MeshBasicMaterial({ color: 0xff0000 })
            );
            lamp.position.x = posX;

            lamp.userData.needsLogicalLight = true;
            lamp.userData.lightColor = 0xff0000;
            lamp.userData.lightIntensity = 150.0;
            lamp.userData.lightDistance = 100.0;

            lightHub.add(lamp);
        }

        group.add(lightHub);
        group.userData.colliders = [{ type: 'box', size: new THREE.Vector3(10, 60, 10) }];

        return GeneratorUtils.freezeStatic(group, ["mastWarningLights"]);
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
        const mid = _v1.copy(start).add(end).multiplyScalar(0.5);

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

        const mesh = new THREE.Mesh(archGeo, tunnelMat);
        tunnelGroup.add(mesh);

        const floorGeo = new THREE.PlaneGeometry(1, 1);
        const floor = new THREE.Mesh(floorGeo, MATERIALS.gravel);
        floor.scale.set(halfWidthI * 2, tunnelDepth, 1);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = 0.02;
        tunnelGroup.add(floor);

        return GeneratorUtils.freezeStatic(tunnelGroup);
    },



    createSmu: () => {
        const group = new THREE.Group();
        const smu = new THREE.Mesh(new THREE.BoxGeometry(50, 10, 50), MATERIALS.brownBrick);
        smu.position.set(0, 5, 0);
        group.add(smu);

        group.userData.colliders = [
            { type: 'box', size: new THREE.Vector3(50, 20, 50) }
        ];
        group.userData.effects = [
            { type: 'fire', smoke: true, intensity: 120, distance: 35, onRoof: true }
        ];

        return GeneratorUtils.freezeStatic(group);
    },

    createCampfire: (scale: number = 1.0) => {
        const group = new THREE.Group();
        group.scale.setScalar(scale);

        const ash = new THREE.Mesh(new THREE.CircleGeometry(0.8, 8), MATERIALS.ash);
        ash.rotation.x = -Math.PI / 2;
        ash.position.y = 0.05;
        ash.receiveShadow = true;
        group.add(ash);

        for (let i = 0; i < 10; i++) {
            const s = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), MATERIALS.stone);
            const angle = (i / 10) * Math.PI * 2;
            const r = 0.9 + (Math.random() - 0.5) * 0.1;
            s.scale.setScalar(0.25);
            s.position.set(Math.cos(angle) * r, 0.15, Math.sin(angle) * r);
            s.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
            s.castShadow = true;
            s.receiveShadow = true;
            group.add(s);
        }

        for (let i = 0; i < 4; i++) {
            const log = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 8), MATERIALS.treeTrunk);
            log.scale.set(0.12, 1.4, 0.12);
            log.rotation.set((Math.random() - 0.5) * 0.2, (i / 4) * Math.PI * 2 + (Math.random() * 0.2), Math.PI / 2);
            log.position.y = 0.25;
            log.castShadow = true;
            log.receiveShadow = true;
            group.add(log);
        }

        group.userData.isFire = true;
        group.userData.effects = [
            { type: 'light', color: 0xff7722, intensity: 30 * scale, distance: 40 * scale, offset: new THREE.Vector3(0, 1, 0), flicker: true },
            { type: 'emitter', particle: 'campfire_flame', interval: 60, count: 1, offset: new THREE.Vector3(0, 0, 0), spread: 0.5, color: 0xffaa00 },
            { type: 'emitter', particle: 'campfire_spark', interval: 100, count: 1, offset: new THREE.Vector3(0, 1, 0), spread: 0.8, color: 0xffdd00 },
            { type: 'emitter', particle: 'campfire_smoke', interval: 200, count: 1, offset: new THREE.Vector3(0, 2, 0), spread: 0.4 }
        ];

        group.userData.colliders = [
            { type: 'sphere', radius: 0.8 * scale }
        ];

        return GeneratorUtils.freezeStatic(group);
    }
};
