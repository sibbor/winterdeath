import * as THREE from 'three';
import { MATERIALS } from '../../../utils/assets/materials';
import { SectorContext } from '../../../game/session/SectorTypes';
import { SectorBuilder } from '../SectorBuilder';
import { VegetationGenerator } from './VegetationGenerator';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _euler = new THREE.Euler();
const _quat = new THREE.Quaternion();

const SHARED_GEO = {
    box: new THREE.BoxGeometry(1, 1, 1),
    rock: new THREE.DodecahedronGeometry(1, 0),
    debris: new THREE.BoxGeometry(1, 1, 1), // Using box for generic debris
};

export const NaturePropGenerator = {

    /**
     * Creates a single static rock mesh group.
     */
    createRock: (width: number, height: number, sharpness: number = 0.5) => {
        const group = new THREE.Group();
        const mat = MATERIALS.stone;
        const geo = SHARED_GEO.rock;

        const sx = width * 0.4 * (1.0 + (Math.random() - 0.5) * 0.4);
        const sz = width * 0.4 * (1.0 + (Math.random() - 0.5) * 0.4);
        const sy = (height / 2) * (1.0 + (Math.random() - 0.5) * 0.4);

        const mesh = new THREE.Mesh(geo, mat);
        mesh.scale.set(sx, sy, sz);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

        // VINTERDÖD OPTIMIZATION: Freeze static mesh matrices
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();

        group.add(mesh);

        if (Math.random() > 0.3) {
            const sub = new THREE.Mesh(geo, mat);
            sub.scale.set(sx * 0.5, sy * 0.5, sz * 0.5);
            sub.position.set((Math.random() - 0.5) * sx, -sx * 0.2, (Math.random() - 0.5) * sx);
            sub.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
            sub.castShadow = true;
            sub.receiveShadow = true;

            sub.matrixAutoUpdate = false;
            sub.updateMatrix();

            group.add(sub);
        }

        group.userData.material = 'STONE';

        // Freeze the parent group as well
        group.matrixAutoUpdate = false;
        group.updateMatrix();

        return group;
    },

    /**
     * Spawns physics-based rubble using InstancedMesh.
     */

    /**
     * Fills an area with rocks or debris.
     */
    fillArea: (ctx: SectorContext, centerOrArea: { x: number, z: number, w: number, d: number } | { x: number, z: number }, sizeOrDensity: { width: number, height: number } | number, count?: number, type: 'tree' | 'rock' | 'debris' = 'tree', avoidCenterRadius: number = 0) => {
        // Legacy delegation: if type is tree, hand over to VegetationGenerator
        if (type === 'tree') {
            const area = (centerOrArea as any).w !== undefined ? centerOrArea as { x: number, z: number, w: number, d: number } : { x: (centerOrArea as any).x, z: (centerOrArea as any).z, w: (sizeOrDensity as any).width || (sizeOrDensity as number), d: (sizeOrDensity as any).height || (sizeOrDensity as number) };
            VegetationGenerator.createForest(ctx, area as any, count || 20, 'PINE');
            return;
        }

        const center = centerOrArea as { x: number, z: number };
        let w = 0, d = 0;
        if (typeof sizeOrDensity === 'number') { w = sizeOrDensity; d = sizeOrDensity; }
        else { w = sizeOrDensity.width; d = sizeOrDensity.height; }

        const area = { x: (centerOrArea as any).w !== undefined ? (centerOrArea as any).x : center.x, z: (centerOrArea as any).d !== undefined ? (centerOrArea as any).z : center.z, w, d };
        const numItems = count || 20;

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
                _position.set(x, s / 2, z);
                _euler.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
                _scale.setScalar(s);

                // Need a unique Vector3 allocation here since SpatialGrid keeps the reference
                SectorBuilder.addObstacle(ctx, {
                    position: new THREE.Vector3(x, s / 2, z),
                    collider: { type: 'sphere', radius: s }
                });
            } else {
                _position.set(x, 0.05, z);
                _euler.set(0, Math.random() * Math.PI, 0);
                _scale.setScalar(1);
            }

            // FIX: Actually apply the Euler rotation to the Quaternion!
            _quat.setFromEuler(_euler);
            _matrix.compose(_position, _quat, _scale);
            instMesh.setMatrixAt(valid++, _matrix);
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
};