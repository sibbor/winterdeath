import * as THREE from 'three';
import { GEOMETRY, MATERIALS } from '../../utils/assets';
import { ZOMBIE_TYPES } from '../../content/constants';
import { Enemy } from '../../types/enemy';

export class ZombieRenderer {
    private meshes: Record<string, THREE.InstancedMesh> = {};
    private _meshList: THREE.InstancedMesh[] = []; // Cached list for fast O(1) iteration
    private scene: THREE.Scene;
    private maxInstances: number;

    // --- PERFORMANCE SCRATCHPADS ---
    private _dummy = new THREE.Object3D();
    private _tempColor = new THREE.Color();

    constructor(scene: THREE.Scene, maxInstances: number = 500) {
        this.scene = scene;
        this.maxInstances = maxInstances;

        // Initialize InstancedMeshes for each type
        this.createInstances('WALKER', this.getMat(ZOMBIE_TYPES.WALKER.color));
        this.createInstances('RUNNER', this.getMat(ZOMBIE_TYPES.RUNNER.color));
        this.createInstances('TANK', this.getMat(ZOMBIE_TYPES.TANK.color));
        this.createInstances('BOMBER', this.getMat(ZOMBIE_TYPES.BOMBER.color));

        this._updateMeshList();
    }

    private getMat(color: number) {
        // Material cloning is fine during init/constructor
        const m = MATERIALS.zombie.clone() as THREE.MeshStandardMaterial;
        m.color.set(color);
        return m;
    }

    public reAttach(scene: THREE.Scene) {
        this.scene = scene;
        for (let i = 0; i < this._meshList.length; i++) {
            const m = this._meshList[i];
            if (m.parent !== scene) scene.add(m);
        }
    }

    private createInstances(type: string, material: THREE.Material) {
        const mesh = new THREE.InstancedMesh(GEOMETRY.zombie, material, this.maxInstances);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.count = 0;

        // Optimization: Setting frustumCulled to false is heavy on GPU but prevents popping.
        // If performance drops, consider true + computeBoundingSphere() in sync.
        mesh.frustumCulled = false;

        this.meshes[type] = mesh;
        this.scene.add(mesh);
        this._updateMeshList();
    }

    private _updateMeshList() {
        this._meshList = Object.values(this.meshes);
    }

    /**
     * Synchronizes enemy states with hardware instances
     * High-performance loop: Zero new object allocations
     */
    public sync(enemies: Enemy[]) {
        // 1. Reset counts using fast loop
        for (let i = 0; i < this._meshList.length; i++) {
            this._meshList[i].count = 0;
        }

        if (enemies.length === 0) {
            this._finalizeUpdates();
            return;
        }

        // 2. Map enemies to instances
        for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];

            // Only render enemies in render-ready states (migration to CorpseRenderer handles death)
            if (e.deathState === 'dead') continue;

            const instMesh = this.meshes[e.type];
            if (!instMesh || instMesh.count >= this.maxInstances) continue;

            const idx = instMesh.count;

            // Sync transform using reusable dummy object (Zero-GC)
            const scale = e.originalScale || 1.0;
            const wScale = (e.widthScale || 1.0) * scale;

            this._dummy.position.copy(e.mesh.position);
            this._dummy.quaternion.copy(e.mesh.quaternion);
            this._dummy.scale.set(wScale, scale, wScale);

            // Handle special color overrides (Bosses/Damaged)
            if (e.isBoss || e.color !== undefined) {
                this._tempColor.set(e.color || 0xffffff);
                instMesh.setColorAt(idx, this._tempColor);
            }

            this._dummy.updateMatrix();
            instMesh.setMatrixAt(idx, this._dummy.matrix);
            instMesh.count++;
        }

        this._finalizeUpdates();
    }

    /**
     * Notifies WebGL that buffer data has changed
     */
    private _finalizeUpdates() {
        for (let i = 0; i < this._meshList.length; i++) {
            const m = this._meshList[i];
            // Only update GPU buffers if there are instances or if it was recently cleared
            m.instanceMatrix.needsUpdate = true;
            if (m.instanceColor) m.instanceColor.needsUpdate = true;
        }
    }

    public destroy() {
        for (let i = 0; i < this._meshList.length; i++) {
            const m = this._meshList[i];
            this.scene.remove(m);
            m.dispose();
            if (m.material instanceof THREE.Material) m.material.dispose();
        }
        this.meshes = {};
        this._meshList = [];
    }
}