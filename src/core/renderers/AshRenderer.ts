import * as THREE from 'three';
import { GEOMETRY, MATERIALS } from '../../utils/assets';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _tempColor = new THREE.Color();
const _tempQuat = new THREE.Quaternion();
const _tempScale = new THREE.Vector3();
const _tempPos = new THREE.Vector3();
const _ashColor = new THREE.Color(0x333333); // Dark gray/black for ash

interface AnimatingAsh {
    idx: number; // Index in the InstancedMesh
    startTime: number;
    duration: number;
    targetScaleX: number;
    targetScaleY: number;
    targetScaleZ: number;
    pos: THREE.Vector3;
    rot: THREE.Euler;
    colorHex: number; // The original color of the enemy
}

/**
 * AshRenderer manages the creation and animation of shrinking enemies turning into ash piles.
 * Zero-GC: Reuses an internal array of AnimatingAsh to avoid creating new objects every frame.
 */
export class AshRenderer {
    private mesh: THREE.InstancedMesh;
    private scene: THREE.Scene;
    private maxInstances: number;
    private insertIndex: number = 0;
    private dummy = new THREE.Object3D();
    private _sharedBoundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 2000);

    // Animation pooling
    private animatingList: AnimatingAsh[] = [];
    private animatingPool: AnimatingAsh[] = []; // Pool to avoid GC

    constructor(scene: THREE.Scene, maxInstances: number = 2000) {
        this.scene = scene;
        this.maxInstances = maxInstances;

        this.mesh = new THREE.InstancedMesh(GEOMETRY.ashPile, MATERIALS.ash, this.maxInstances);
        this.mesh.frustumCulled = false;
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.mesh.count = 0;
        this.mesh.boundingSphere = this._sharedBoundingSphere;

        // Ensure instance matrices and colors are initialized properly to avoid WebGL stutter
        if (!this.mesh.instanceColor) {
            this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.maxInstances * 3), 3);
        }

        this.scene.add(this.mesh);

        // TODO: DON'T USE MAGIC NUMBER 500 HERE:
        // Pre-allocate animation pool (no runtime GC)
        for (let i = 0; i < 500; i++) {
            this.animatingPool.push({
                idx: 0, startTime: 0, duration: 0,
                targetScaleX: 0, targetScaleY: 0, targetScaleZ: 0,
                pos: new THREE.Vector3(), rot: new THREE.Euler(),
                colorHex: 0xffffff
            });
        }
    }

    public reAttach(scene: THREE.Scene) {
        this.scene = scene;
        if (this.mesh.parent !== scene) {
            scene.add(this.mesh);
        }
    }

    /**
     * Starts a new ash pile animation.
     */
    public addAsh(
        position: THREE.Vector3,
        rotation: THREE.Euler,
        scale: number,
        widthScale: number,
        colorHex: number,
        now: number,
        durationMs: number = 1500
    ) {
        const idx = this.insertIndex;
        this.insertIndex = (this.insertIndex + 1) % this.maxInstances;
        if (this.mesh.count < this.maxInstances) this.mesh.count++;

        // 1. Start it at essentially zero scale so it visually grows
        this.dummy.position.copy(position);
        this.dummy.position.y = 0.2; // Keep it slightly above ground
        this.dummy.scale.set(0.01, 0.01, 0.01);
        _tempQuat.setFromEuler(rotation);
        this.dummy.matrix.compose(this.dummy.position, _tempQuat, this.dummy.scale);

        this.mesh.setMatrixAt(idx, this.dummy.matrix);

        // 2. Start it completely in the enemy's color, so it transitions to ash-black as it scales
        _tempColor.setHex(colorHex);
        this.mesh.setColorAt(idx, _tempColor);

        this.mesh.instanceMatrix.needsUpdate = true;
        if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;

        // 3. Register for animation
        if (this.animatingPool.length > 0) {
            const anim = this.animatingPool.pop()!;
            anim.idx = idx;
            anim.startTime = now;
            anim.duration = durationMs;
            anim.pos.copy(position);
            anim.pos.y = 0.2;
            anim.rot.copy(rotation);

            // Ash pile target dimensions (ZERO-GC, no strings attached!)
            anim.targetScaleX = 1.2 * scale * widthScale;
            anim.targetScaleY = 1.0 * scale;
            anim.targetScaleZ = 1.2 * scale * widthScale;

            anim.colorHex = colorHex;
            this.animatingList.push(anim);
        } else {
            console.warn('[AshRenderer] Animation pool exhausted!');
        }
    }

    /**
     * Updates active animations every frame
     */
    public update(now: number) {
        let dirty = false;

        for (let i = this.animatingList.length - 1; i >= 0; i--) {
            const anim = this.animatingList[i];
            const age = now - anim.startTime;
            let progress = age / anim.duration;

            let finished = false;
            if (progress >= 1.0) {
                progress = 1.0;
                finished = true;
            }

            // Sync visual growth
            _tempPos.copy(anim.pos);
            _tempQuat.setFromEuler(anim.rot);
            _tempScale.set(
                Math.max(0.01, anim.targetScaleX * progress),
                Math.max(0.01, anim.targetScaleY * progress),
                Math.max(0.01, anim.targetScaleZ * progress)
            );

            this.dummy.matrix.compose(_tempPos, _tempQuat, _tempScale);
            this.mesh.setMatrixAt(anim.idx, this.dummy.matrix);

            // Sync color transition (original color -> black ash)
            _tempColor.setHex(anim.colorHex);
            _tempColor.lerp(_ashColor, progress);
            this.mesh.setColorAt(anim.idx, _tempColor);

            dirty = true;

            if (finished) {
                // Return to pool (Swap & Pop)
                this.animatingPool.push(anim);
                this.animatingList[i] = this.animatingList[this.animatingList.length - 1];
                this.animatingList.pop();
            }
        }

        if (dirty) {
            this.mesh.instanceMatrix.needsUpdate = true;
            if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
        }
    }

    public clear() {
        this.insertIndex = 0;
        this.mesh.count = 0;

        // Return everything to the pool
        while (this.animatingList.length > 0) {
            this.animatingPool.push(this.animatingList.pop()!);
        }

        this.mesh.instanceMatrix.needsUpdate = true;
    }

    public destroy() {
        this.scene.remove(this.mesh);
        this.mesh.dispose();
    }
}
