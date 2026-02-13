import * as THREE from 'three';
import { GEOMETRY, MATERIALS } from '../../utils/assets';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _tempColor = new THREE.Color();

/**
 * CorpseRenderer manages dead enemy visuals using Hardware Instancing.
 * Optimized to handle thousands of static meshes with zero runtime allocation.
 */
export class CorpseRenderer {
    private mesh: THREE.InstancedMesh;
    private scene: THREE.Scene;
    private maxInstances: number;
    private currentCount: number = 0;
    private dummy = new THREE.Object3D();

    constructor(scene: THREE.Scene, maxInstances: number = 2000) {
        this.scene = scene;
        this.maxInstances = maxInstances;

        // Corpses use a unique material clone to allow global darkening 
        // without affecting living enemies or other systems.
        const material = MATERIALS.zombie.clone() as THREE.MeshStandardMaterial;
        material.color.set(0xffffff); // Set to white to act as a multiplier for instance colors

        this.mesh = new THREE.InstancedMesh(GEOMETRY.zombie, material, this.maxInstances);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.mesh.count = 0;

        // Disable frustum culling to prevent corpses from popping in/out 
        // when the camera is close to the ground.
        this.mesh.frustumCulled = false;

        this.scene.add(this.mesh);
    }

    /**
     * Re-inserts the instanced mesh into a new scene context (e.g. level transition).
     */
    public reAttach(scene: THREE.Scene) {
        this.scene = scene;
        if (this.mesh.parent !== scene) {
            scene.add(this.mesh);
        }
    }

    /**
     * Adds a static corpse to the world.
     * Uses O(1) circular buffer logic to overwrite oldest corpses when max capacity is reached.
     */
    public addCorpse(
        position: THREE.Vector3,
        rotation: THREE.Euler | THREE.Quaternion,
        scale: number,
        widthScale: number = 1.0,
        colorHex?: number
    ) {
        // Circular buffer logic: Overwrite the oldest instance if full
        if (this.currentCount >= this.maxInstances) {
            this.currentCount = 0;
        }

        const idx = this.currentCount;

        // 1. Sync Transform via reusable dummy object
        this.dummy.position.copy(position);

        if (rotation instanceof THREE.Euler) {
            this.dummy.rotation.copy(rotation);
        } else {
            this.dummy.quaternion.copy(rotation);
        }

        const wScale = widthScale * scale;
        this.dummy.scale.set(wScale, scale, wScale);
        this.dummy.updateMatrix();

        // Write transformation matrix to the instanced buffer
        this.mesh.setMatrixAt(idx, this.dummy.matrix);

        // 2. Sync Color (Zero-GC)
        if (colorHex !== undefined) {
            // Apply a 0.5 multiplier to the original hex to make the corpse look "cold" or darkened
            _tempColor.setHex(colorHex).multiplyScalar(0.5);
            this.mesh.setColorAt(idx, _tempColor);

            if (this.mesh.instanceColor) {
                this.mesh.instanceColor.needsUpdate = true;
            }
        }

        // 3. Increment internal counter and notify GPU
        this.currentCount++;

        // Ensure the draw count covers all instances created so far
        if (this.mesh.count < this.maxInstances && this.mesh.count < this.currentCount) {
            this.mesh.count = this.currentCount;
        }

        // Set the dirty flag for the next render pass
        this.mesh.instanceMatrix.needsUpdate = true;
    }

    /**
     * Resets all corpses. Useful for game restarts or level clears.
     */
    public clear() {
        this.currentCount = 0;
        this.mesh.count = 0;
        this.mesh.instanceMatrix.needsUpdate = true;
    }

    /**
     * Full cleanup of GPU resources.
     */
    public destroy() {
        this.scene.remove(this.mesh);
        this.mesh.dispose();
        if (this.mesh.material instanceof THREE.Material) {
            this.mesh.material.dispose();
        }
    }
}