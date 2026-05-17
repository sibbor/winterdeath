import * as THREE from 'three';
import { ProjectilePoolState, MAX_PROJECTILES } from '../../core/state/ProjectilePool';
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

    // --- PERFORMANCE SCRATCHPADS ---
    private _matrix = new THREE.Matrix4();
    private _position = new THREE.Vector3();
    private _quaternion = new THREE.Quaternion();
    private _scale = new THREE.Vector3(1, 1, 1);
    private _color = new THREE.Color();

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

        this.scene.add(this.mesh);
    }

    /**
     * Synchronizes SoA projectile state with GPU instance buffers.
     * ZERO-GC hot path.
     */
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

        // Standard for-loop for maximum JIT optimization
        for (let i = 0; i < activeCount; i++) {
            this._position.set(pool.posX[i], pool.posY[i], pool.posZ[i]);

            // Select scale and color based on projectile type and weapon definition
            let colorHex = 0xffeebb; // Warm tracer glow for standard bullets
            if (pool.type[i] === 1) {
                // Throwable: Grenade, Molotov, Flashbang
                this._scale.set(3.5, 3.5, 3.5);
                const wep = pool.weaponId[i];
                if (wep === DamageID.GRENADE) {
                    colorHex = 0x22c55e; // Bright Toxic Green for visibility
                } else if (wep === DamageID.MOLOTOV) {
                    colorHex = 0xf97316; // Vivid Orange
                } else if (wep === DamageID.FLASHBANG) {
                    colorHex = 0x38bdf8; // Vivid light blue/cyan glow
                }
            } else {
                // Bullet
                this._scale.set(1, 1, 1);
            }

            // Compose the matrix for this instance
            // Note: Since bullets are currently spheres, rotation is ignored for speed.
            this._matrix.compose(this._position, this._quaternion, this._scale);

            this.mesh.setMatrixAt(i, this._matrix);

            // Set color for instanced mesh
            this._color.setHex(colorHex);
            this.mesh.setColorAt(i, this._color);
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
