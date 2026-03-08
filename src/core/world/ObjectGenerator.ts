import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createProceduralDiffuse, MATERIALS, GEOMETRY, ModelFactory, createSignMesh, createTextSprite } from '../../utils/assets';
import { SectorContext } from '../../types/SectorEnvironment';
import { SectorGenerator } from './SectorGenerator';
import { ZOMBIE_TYPES } from '../../content/enemies/zombies';
import { EffectManager } from '../systems/EffectManager';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
// Reused to prevent garbage collection stutter during mass-instancing
const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _rotation = new THREE.Euler();
const _quat = new THREE.Quaternion();
const _v1_og = new THREE.Vector3();

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

const LOCAL_MATS = {
    litWindow: new THREE.MeshStandardMaterial({ color: 0xffffaa, emissive: 0xffffaa, emissiveIntensity: 5 }),
    darkWindow: new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9, metalness: 0.1 }),
    upWindow: new THREE.MeshStandardMaterial({ color: 0xffffaa, emissive: 0xffffaa, emissiveIntensity: 0.5 }),
    caveLampBulb: new THREE.MeshStandardMaterial({ color: 0xffffaa, emissive: 0xffffaa, emissiveIntensity: 20 }),
    caveLampCage: new THREE.MeshStandardMaterial({ color: 0x333333, wireframe: true })
};

// Dynamic caches for colored objects
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

    createScarecrow(x: number, z: number) {
        const group = new THREE.Group();
        group.position.set(x, 0, z);

        // Wood material for post and arms
        const postMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 });

        // Vertical post
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.5), postMat);
        post.position.y = 1.25;
        group.add(post);

        // Horizontal arms
        const arms = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.8), postMat);
        arms.rotation.z = Math.PI / 2;
        arms.position.y = 1.8;
        group.add(arms);

        // Burlap sack head
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.3), new THREE.MeshStandardMaterial({ color: 0xeadbaf, roughness: 1.0 }));
        head.position.y = 2.4;
        group.add(head);

        // Flannel/Shirt body
        const shirt = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 1.0), new THREE.MeshStandardMaterial({ color: 0x6b8e23, roughness: 0.8 }));
        shirt.position.y = 1.6;
        group.add(shirt);

        // Farmer hat
        const hat = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.5), new THREE.MeshStandardMaterial({ color: 0x4a3c31, roughness: 1.0 }));
        hat.position.y = 2.75;
        group.add(hat);

        return group;
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
            { type: 'emitter', particle: 'campfire_flame', interval: 60, count: 1, offset: new THREE.Vector3(0, 0.5, 0), spread: 0.5, color: 0xffaa00 },
            { type: 'emitter', particle: 'campfire_spark', interval: 100, count: 1, offset: new THREE.Vector3(0, 1.0, 0), spread: 0.8, color: 0xffdd00 },
            { type: 'emitter', particle: 'campfire_smoke', interval: 200, count: 1, offset: new THREE.Vector3(0, 1.8, 0), spread: 0.4 }
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

        // Vänster vägg
        const sideL = new THREE.Mesh(new THREE.BoxGeometry(wallThick, height, length), mat);
        sideL.position.set(-width / 2 - wallThick / 2, height / 2, 0);
        group.add(sideL);

        // Höger vägg
        const sideR = new THREE.Mesh(new THREE.BoxGeometry(wallThick, height, length), mat);
        sideR.position.set(width / 2 + wallThick / 2, height / 2, 0);
        group.add(sideR);

        // Tak
        const roof = new THREE.Mesh(new THREE.BoxGeometry(width + wallThick * 2, roofThick, length), mat);
        roof.position.set(0, height + roofThick / 2, 0);
        group.add(roof);

        ctx.scene.add(group);

        // --------------------------------------------------------
        // KOLLISIONSHANTERING
        // Tvinga fram en uppdatering av världen så vi kan hämta 
        // de exakta globala positionerna för väggarna.
        // --------------------------------------------------------
        group.updateMatrixWorld(true);

        const worldPosL = new THREE.Vector3();
        sideL.getWorldPosition(worldPosL);

        const worldPosR = new THREE.Vector3();
        sideR.getWorldPosition(worldPosR);

        const worldQuat = new THREE.Quaternion();
        group.getWorldQuaternion(worldQuat);

        // Använd SectorGenerator.addObstacle så de hamnar i SpatialGrid!
        // Vi skickar in position och quaternion direkt istället för meshen 
        // för att vara 100% säkra på att det blir världskoordinater.
        SectorGenerator.addObstacle(ctx, {
            position: worldPosL,
            quaternion: worldQuat,
            collider: { type: 'box', size: new THREE.Vector3(wallThick, height, length) }
        });

        SectorGenerator.addObstacle(ctx, {
            position: worldPosR,
            quaternion: worldQuat,
            collider: { type: 'box', size: new THREE.Vector3(wallThick, height, length) }
        });

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

    createDeadBody: (type: 'WALKER' | 'RUNNER' | 'BOMBER' | 'TANK' | 'PLAYER' | 'HUMAN', rot: number = 0, blood?: boolean) => {
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

    createNeonSign: (text: string, color: number = 0x00ffff, withBacking: boolean = true, scale: number = 1.0, backgroundColor: number = 0x050505) => {
        const group = new THREE.Group();
        if (withBacking) {
            const mat = MATERIALS.blackMetal.clone();
            mat.color.setHex(backgroundColor);
            const base = new THREE.Mesh(new THREE.BoxGeometry(text.length * 0.4 + 1, 0.8, 0.2), mat);
            group.add(base);
        }

        const label = createTextSprite(text);
        label.position.z = withBacking ? 0.12 : 0;
        label.scale.set(text.length * 0.6, 0.8, 1);
        group.add(label);

        EffectManager.attachEffect(group, 'neon_sign', { color, intensity: 15, distance: 20 });
        group.scale.setScalar(scale);
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
        const xs = [-1.2, 0, 1.2];
        for (let i = 0; i < xs.length; i++) {
            const x = xs[i];
            const ins = new THREE.Mesh(insGeo, MATERIALS.stone);
            ins.position.set(x, 9.2, 0);
            group.add(ins);
        }

        group.userData.material = 'WOOD';
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
        upperWindows?: boolean,
        allSides?: boolean,
        upperRows?: number,
        mapRepeat?: { x: number, y: number }
    } = {}) => {
        const group = new THREE.Group();
        const {
            lowerMat,
            upperMat,
            withRoof = true,
            withLights = true,
            shopWindows = true,
            upperWindows = true,
            allSides = false,
            upperRows = 1,
            mapRepeat
        } = opts;

        const midPoint = height * 0.4;

        const lowerGeo = new THREE.BoxGeometry(width, midPoint, depth).translate(0, midPoint / 2, 0);
        const lowerMesh = new THREE.Mesh(lowerGeo, lowerMat || MATERIALS.whiteBrick);
        lowerMesh.castShadow = true; lowerMesh.receiveShadow = true;
        group.add(lowerMesh);

        const upperHeight = height - midPoint;
        const upperGeo = new THREE.BoxGeometry(width, upperHeight, depth).translate(0, midPoint + upperHeight / 2, 0);

        let finalUpperMat = upperMat || MATERIALS.wooden_fasade;
        if (mapRepeat && (finalUpperMat as any).map) {
            finalUpperMat = finalUpperMat.clone();
            (finalUpperMat as any).map = (finalUpperMat as any).map.clone();
            (finalUpperMat as any).map.repeat.set(mapRepeat.x, mapRepeat.y);
            (finalUpperMat as any).map.wrapS = (finalUpperMat as any).map.wrapT = THREE.RepeatWrapping;
            (finalUpperMat as any).map.needsUpdate = true;
        }

        const upperMesh = new THREE.Mesh(upperGeo, finalUpperMat);
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
            const winWidth = 3.5;
            const winHeight = midPoint * 0.7;
            const winGeo = new THREE.PlaneGeometry(winWidth, winHeight);

            const sides = allSides ? 4 : 1;
            let totalWinCount = 0;

            for (let s = 0; s < sides; s++) {
                const isSide = s === 1 || s === 3;
                const sideWidth = isSide ? depth : width;
                for (let x = -sideWidth / 2 + 2.5; x <= sideWidth / 2 - 2.5; x += 4.5) totalWinCount++;
            }

            if (totalWinCount > 0) {
                const instancedWindows = new THREE.InstancedMesh(winGeo, MATERIALS.glass, totalWinCount);
                let idx = 0;

                for (let s = 0; s < sides; s++) {
                    const isSide = s === 1 || s === 3;
                    const sideWidth = isSide ? depth : width;
                    const sideDepth = isSide ? width : depth;
                    const rotation = (s * Math.PI) / 2;

                    for (let x = -sideWidth / 2 + 2.5; x <= sideWidth / 2 - 2.5; x += 4.5) {
                        _position.set(x, midPoint / 2, sideDepth / 2 + 0.05);
                        _rotation.set(0, rotation, 0);
                        _quat.setFromEuler(_rotation);
                        _position.applyQuaternion(_quat);

                        _matrix.makeRotationFromQuaternion(_quat);
                        _matrix.setPosition(_position);

                        instancedWindows.setMatrixAt(idx++, _matrix);

                        if (withLights) {
                            const light = new THREE.PointLight(0xffffaa, 4, 10);
                            _v1_og.set(x, midPoint / 2, sideDepth / 2 - 1).applyQuaternion(_quat);
                            light.position.copy(_v1_og);
                            group.add(light);
                        }
                    }
                }
                instancedWindows.instanceMatrix.needsUpdate = true;
                group.add(instancedWindows);
            }
        }

        if (upperWindows) {
            const upWinWidth = 1.2;
            const upWinHeight = 1.5;
            const upWinGeo = new THREE.PlaneGeometry(upWinWidth, upWinHeight);

            const sides = allSides ? 4 : 1;
            let totalUpWinCount = 0;

            for (let s = 0; s < sides; s++) {
                const isSide = s === 1 || s === 3;
                const sideWidth = isSide ? depth : width;
                for (let r = 0; r < upperRows; r++) {
                    for (let x = -sideWidth / 2 + 2; x <= sideWidth / 2 - 2; x += 4) totalUpWinCount++;
                }
            }

            if (totalUpWinCount > 0) {
                const instancedUpWindows = new THREE.InstancedMesh(upWinGeo, LOCAL_MATS.upWindow, totalUpWinCount);
                let idx = 0;

                for (let s = 0; s < sides; s++) {
                    const isSide = s === 1 || s === 3;
                    const sideWidth = isSide ? depth : width;
                    const sideDepth = isSide ? width : depth;
                    const rotation = (s * Math.PI) / 2;
                    const rowHeight = upperHeight / (upperRows + 1);

                    for (let r = 0; r < upperRows; r++) {
                        const yPos = midPoint + (r + 1) * rowHeight;
                        for (let x = -sideWidth / 2 + 2; x <= sideWidth / 2 - 2; x += 4) {
                            _position.set(x, yPos, sideDepth / 2 + 0.05);
                            _rotation.set(0, rotation, 0);
                            _quat.setFromEuler(_rotation);
                            _position.applyQuaternion(_quat);

                            _matrix.makeRotationFromQuaternion(_quat);
                            _matrix.setPosition(_position);

                            instancedUpWindows.setMatrixAt(idx++, _matrix);
                        }
                    }
                }
                instancedUpWindows.instanceMatrix.needsUpdate = true;
                group.add(instancedUpWindows);
            }
        }

        group.userData = { size: new THREE.Vector3(width, height + (withRoof ? 3 : 0), depth), material: 'CONCRETE' };
        return group;
    },

    createNeonHeart: (color: number = 0xff0000, scale: number = 1.0) => {
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
        geo.scale(0.10, -0.10, 0.10);
        geo.translate(-0.2, 0.4, 0);

        if (!neonHeartCache[color]) neonHeartCache[color] = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });

        group.add(new THREE.Mesh(geo, neonHeartCache[color]));

        const light = new THREE.PointLight(color, 50, 50);
        light.position.set(0, 0, 0.5);
        group.add(light);

        group.scale.setScalar(scale);
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
    },

    /**
     * Creates an InstancedMesh of animated bus rubble pieces.
     * @param x Epicenter X
     * @param z Epicenter Z
     * @param count Number of pieces
     * @param material Optional material override
     * @param directionBias Center angle (radians) of the half-arc launch direction.
     *   Default PI = northward (negative Z). The arc spans [bias - PI/2, bias + PI/2].
     */
    createRubble: (x: number, z: number, count: number, material?: THREE.Material, directionBias: number = Math.PI) => {
        const mat = material == null ? MATERIALS.steel : material;

        const geometry = new THREE.BoxGeometry(2, 2, 4);
        const mesh = new THREE.InstancedMesh(geometry, mat, count);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Allocate continuous memory for physics (Zero-GC)
        // 3 floats per instance (x, y, z)
        const positions = new Float32Array(count * 3);
        const velocities = new Float32Array(count * 3);
        const rotations = new Float32Array(count * 3);
        const spin = new Float32Array(count * 3);
        const scales = new Float32Array(count);

        for (let i = 0; i < count; i++) {
            const ix = i * 3;

            // Start near the epicenter
            positions[ix] = x + (Math.random() - 0.5) * 4.0;
            positions[ix + 1] = 2.0 + Math.random() * 2.0;
            positions[ix + 2] = z + (Math.random() - 0.5) * 4.0;

            // Polar-form velocity biased toward directionBias half-arc.
            // With gravity 50 m/s^2, speed=30 and vy=20: t_air=0.8s, range=30*0.8=24m.
            // Pieces land 15-25m from bus, scattered in the chosen half-circle arc.
            const halfArc = Math.PI * 0.5; // 90 degrees each side of bias
            const angle = (directionBias - halfArc) + Math.random() * (halfArc * 2.0);
            const speed = 20.0 + Math.random() * 15.0; // 20-35 m/s lateral
            velocities[ix] = Math.cos(angle) * speed;
            velocities[ix + 1] = 12.0 + Math.random() * 18.0; // 12-30 m/s upward
            velocities[ix + 2] = Math.sin(angle) * speed;

            // Initial rotation
            rotations[ix] = Math.random() * Math.PI;
            rotations[ix + 1] = Math.random() * Math.PI;
            rotations[ix + 2] = Math.random() * Math.PI;

            // Spin speed
            spin[ix] = (Math.random() - 0.5) * 15.0;
            spin[ix + 1] = (Math.random() - 0.5) * 15.0;
            spin[ix + 2] = (Math.random() - 0.5) * 15.0;

            // Randomize scale for variety
            scales[i] = 0.5 + Math.random() * 0.8;

            _position.set(positions[ix], positions[ix + 1], positions[ix + 2]);
            _rotation.set(rotations[ix], rotations[ix + 1], rotations[ix + 2]);
            _quat.setFromEuler(_rotation);
            _scale.setScalar(scales[i]);

            _matrix.compose(_position, _quat, _scale);
            mesh.setMatrixAt(i, _matrix);
        }

        // Store physics data in userData for access in the update loop
        mesh.userData = { positions, velocities, rotations, spin, scales, active: true };
        mesh.instanceMatrix.needsUpdate = true;

        return mesh;
    },
};