import * as THREE from 'three';
import { ParticlePoolState } from '../../core/state/ParticlePool';
import { POOL_PARTICLE_MAX } from '../../content/constants';
import { MATERIALS, GEOMETRY } from '../../utils/assets';

/**
 * Instanced Particle Renderer (Phase 10)
 * 
 * Bypasses high-level Three.js abstractions by directly mutating the instanceMatrix buffer.
 * Achieves significant performance gains by eliminating Matrix4 object creation and setMatrixAt overhead.
 */
export class ParticleRenderer {
    private instancedMesh: THREE.InstancedMesh;

    constructor(scene: THREE.Scene) {
        this.instancedMesh = new THREE.InstancedMesh(
            GEOMETRY.flame,
            MATERIALS.flamethrower_flame,
            POOL_PARTICLE_MAX
        );

        // Optimizations
        this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.instancedMesh.frustumCulled = false; // Always render, we manage visibility via buffer
        this.instancedMesh.renderOrder = 100;    // Render over other objects

        // Initialize instance colors
        this.instancedMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(POOL_PARTICLE_MAX * 3), 3);
        this.instancedMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);

        scene.add(this.instancedMesh);
    }

    /**
     * Updates the WebGL buffer directly from the SoA pool.
     * ZERO-GC: No allocations.
     */
    render() {
        const pool = ParticlePoolState;
        const count = pool.activeCount;
        const matrixArray = this.instancedMesh.instanceMatrix.array;
        const colorArray = this.instancedMesh.instanceColor!.array as Float32Array;

        // --- PHASE 10: DIRECT BUFFER MUTATION ---
        // Matrix4 in memory:
        // [ 0,  1,  2,  3 ]  <-- column 0 (Scale X)
        // [ 4,  5,  6,  7 ]  <-- column 1 (Scale Y)
        // [ 8,  9, 10, 11 ]  <-- column 2 (Scale Z)
        // [ 12, 13, 14, 15 ] <-- column 3 (Position)

        for (let i = 0; i < count; i++) {
            const s = pool.scale[i];
            if (isNaN(s) || isNaN(pool.posX[i])) continue;

            const offset = i * 16;

            // 1. Clear previous matrix state to identity-ish with scale
            // (Only strictly need to set 0, 5, 10, 12, 13, 14, 15 if buffer is reused)
            matrixArray[offset + 0] = s;
            matrixArray[offset + 1] = 0;
            matrixArray[offset + 2] = 0;
            matrixArray[offset + 3] = 0;

            matrixArray[offset + 4] = 0;
            matrixArray[offset + 5] = s;
            matrixArray[offset + 6] = 0;
            matrixArray[offset + 7] = 0;

            matrixArray[offset + 8] = 0;
            matrixArray[offset + 9] = 0;
            matrixArray[offset + 10] = s;
            matrixArray[offset + 11] = 0;

            // 2. Set Position
            matrixArray[offset + 12] = pool.posX[i];
            matrixArray[offset + 13] = pool.posY[i];
            matrixArray[offset + 14] = pool.posZ[i];
            matrixArray[offset + 15] = 1;

            // 3. Set Color
            const cOffset = i * 3;
            colorArray[cOffset + 0] = pool.colorR[i];
            colorArray[cOffset + 1] = pool.colorG[i];
            colorArray[cOffset + 2] = pool.colorB[i];
        }

        // 3. Hide inactive particles by moving them underground
        // (Swap-and-Go leaves garbage in the high indices of the buffer)
        for (let i = count; i < POOL_PARTICLE_MAX; i++) {
            const offset = i * 16;
            matrixArray[offset + 13] = -1000;
        }

        // 5. Batch upload to GPU
        this.instancedMesh.instanceMatrix.needsUpdate = true;
        this.instancedMesh.instanceColor!.needsUpdate = true;
    }
}
