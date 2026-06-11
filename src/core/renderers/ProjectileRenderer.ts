import * as THREE from 'three';
import { ProjectilePoolState, MAX_PROJECTILES } from '../pools/ProjectilePool';
import { GEOMETRY } from '../../utils/assets/geometry';
import { MATERIALS } from '../../utils/assets/materials';
import { DamageID } from '../../entities/player/CombatTypes';

/**
 * Projectile Renderer (Phase 8)
 * 
 * Optimized WebGL rendering for massive numbers of projectiles.
 * Uses a single THREE.InstancedMesh to batch all draw calls into one.
 * Employs Zero-GC scratchpads for per-frame matrix updates.
 */
export class ProjectileRenderer {
    private mesh: THREE.InstancedMesh;
    private scene: THREE.Scene;

    constructor(scene: THREE.Scene) {
        this.scene = scene;

        // Initializing with MAX_PROJECTILES to avoid GPU re-allocations
        this.mesh = new THREE.InstancedMesh(
            GEOMETRY.bullet,
            MATERIALS.bullet,
            MAX_PROJECTILES
        );

        // Optimization: Disable frustum culling per-instance for maximum speed
        this.mesh.frustumCulled = false;
        this.mesh.castShadow = false; // Bullets are too small/fast for shadows
        this.mesh.receiveShadow = false;
        this.mesh.count = 0;

        // Pre-allocate instance color buffer
        this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PROJECTILES * 3), 3);
        this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);

        this.scene.add(this.mesh);
    }

    syncTransforms() {
        const pool = ProjectilePoolState;
        const activeCount = pool.activeCount;

        // Tell Three.js how many instances to actually render
        this.mesh.count = activeCount;

        if (activeCount === 0) {
            this.mesh.instanceMatrix.needsUpdate = true;
            if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
            return;
        }

        const matrixArray = this.mesh.instanceMatrix.array;
        const colorArray = this.mesh.instanceColor!.array as Float32Array;

        // Standard for-loop for maximum JIT optimization
        for (let i = 0; i < activeCount; i++) {
            let scaleVal = 1.0;
            let colorR = 1.0;
            let colorG = 0.93;
            let colorB = 0.73; // Warm tracer glow for standard bullets

            if (pool.type[i] === 1) {
                // Throwable: Grenade, Molotov, Flashbang
                scaleVal = 3.5;
                const wep = pool.weaponId[i];
                if (wep === DamageID.GRENADE) {
                    colorR = 0.13; colorG = 0.77; colorB = 0.37; // Bright Toxic Green
                } else if (wep === DamageID.MOLOTOV) {
                    colorR = 0.98; colorG = 0.45; colorB = 0.09; // Vivid Orange
                } else if (wep === DamageID.FLASHBANG) {
                    colorR = 0.22; colorG = 0.74; colorB = 0.95; // Vivid light blue/cyan glow
                }
            }

            const offset = i * 16;
            // Write identity matrix components scaled by scaleVal
            matrixArray[offset + 0] = scaleVal;
            matrixArray[offset + 1] = 0;
            matrixArray[offset + 2] = 0;
            matrixArray[offset + 3] = 0;

            matrixArray[offset + 4] = 0;
            matrixArray[offset + 5] = scaleVal;
            matrixArray[offset + 6] = 0;
            matrixArray[offset + 7] = 0;

            matrixArray[offset + 8] = 0;
            matrixArray[offset + 9] = 0;
            matrixArray[offset + 10] = scaleVal;
            matrixArray[offset + 11] = 0;

            // Set Position
            matrixArray[offset + 12] = pool.posX[i];
            matrixArray[offset + 13] = pool.posY[i];
            matrixArray[offset + 14] = pool.posZ[i];
            matrixArray[offset + 15] = 1;

            // Set Color
            const cOffset = i * 3;
            colorArray[cOffset + 0] = colorR;
            colorArray[cOffset + 1] = colorG;
            colorArray[cOffset + 2] = colorB;
        }

        // Hide inactive/remaining particles by moving them underground
        for (let i = activeCount; i < MAX_PROJECTILES; i++) {
            matrixArray[i * 16 + 13] = -1000;
        }

        // Notify WebGL that the instance matrix and color buffers are dirty
        this.mesh.instanceMatrix.needsUpdate = true;
        if (this.mesh.instanceColor) {
            this.mesh.instanceColor.needsUpdate = true;
        }
    }

    /**
     * Resets the renderer state.
     */
    clear() {
        this.mesh.count = 0;
        this.mesh.instanceMatrix.needsUpdate = true;
    }

    /**
     * Re-attaches the instanced mesh to a new scene.
     */
    reAttach(newScene: THREE.Scene) {
        this.scene = newScene;
        this.scene.add(this.mesh);
    }
}