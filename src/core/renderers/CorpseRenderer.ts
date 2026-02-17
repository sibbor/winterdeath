import * as THREE from 'three';
import { GEOMETRY, MATERIALS } from '../../utils/assets';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _tempColor = new THREE.Color();
const _tempQuat = new THREE.Quaternion(); // [VINTERDÖD] Repellerar GC vid Euler-omvandlingar
const _defaultDeadColor = new THREE.Color(0x808080); // [VINTERDÖD] 0xffffff * 0.5 (Standardfärgen för kalla lik)

/**
 * CorpseRenderer manages dead enemy visuals using Hardware Instancing.
 * Optimized to handle thousands of static meshes with zero runtime allocation.
 */
export class CorpseRenderer {
    private mesh: THREE.InstancedMesh;
    private scene: THREE.Scene;
    private maxInstances: number;
    private insertIndex: number = 0; // [VINTERDÖD] Egen pekare för ren O(1) cirkulär loop
    private dummy = new THREE.Object3D();

    constructor(scene: THREE.Scene, maxInstances: number = 2000) {
        this.scene = scene;
        this.maxInstances = maxInstances;

        // Corpses use a unique material clone to allow global darkening 
        // without affecting living enemies or other systems.
        const material = MATERIALS.zombie.clone() as THREE.MeshStandardMaterial;
        material.color.setHex(0xffffff); // Set to white to act as a multiplier for instance colors

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
        const idx = this.insertIndex;

        // 1. Sync Transform via direct composition (Zero-GC, bypasses Object3D overhead)
        this.dummy.position.copy(position);

        const wScale = widthScale * scale;
        this.dummy.scale.set(wScale, scale, wScale);

        // [VINTERDÖD] Snabb type-check istället för instanceof (vilket är långsammare) och direkt matriskomposition.
        if ((rotation as THREE.Euler).isEuler) {
            _tempQuat.setFromEuler(rotation as THREE.Euler);
            this.dummy.matrix.compose(this.dummy.position, _tempQuat, this.dummy.scale);
        } else {
            this.dummy.matrix.compose(this.dummy.position, rotation as THREE.Quaternion, this.dummy.scale);
        }

        // Write transformation matrix to the instanced buffer
        this.mesh.setMatrixAt(idx, this.dummy.matrix);

        // 2. Sync Color (Zero-GC & Anti-Bleed)
        if (colorHex !== undefined) {
            // Apply a 0.5 multiplier to the original hex to make the corpse look "cold" or darkened
            _tempColor.setHex(colorHex).multiplyScalar(0.5);
            this.mesh.setColorAt(idx, _tempColor);
        } else {
            // [VINTERDÖD] Återställ materialets grundfärg så vi inte blöder färg från ett överskrivet lik
            this.mesh.setColorAt(idx, _defaultDeadColor);
        }

        // 3. Increment internal counter & Wrap around for circular logic
        this.insertIndex = (this.insertIndex + 1) % this.maxInstances;

        // Increase render count up to max limits
        if (this.mesh.count < this.maxInstances) {
            this.mesh.count++;
        }

        // Set the dirty flags for the next render pass
        this.mesh.instanceMatrix.needsUpdate = true;
        if (this.mesh.instanceColor) {
            this.mesh.instanceColor.needsUpdate = true;
        }
    }

    /**
     * Resets all corpses. Useful for game restarts or level clears.
     */
    public clear() {
        this.insertIndex = 0;
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