
import * as THREE from 'three';
import { GEOMETRY, MATERIALS } from '../../utils/assets';
import { Enemy } from '../../types/enemy';

export class ZombieRenderer {
    private meshes: Record<string, THREE.InstancedMesh> = {};
    private scene: THREE.Scene;
    private maxInstances: number;

    constructor(scene: THREE.Scene, maxInstances: number = 200) {
        this.scene = scene;
        this.maxInstances = maxInstances;

        // Initialize InstancedMeshes for each type
        this.createInstances('WALKER', MATERIALS.walker);
        this.createInstances('RUNNER', MATERIALS.runner);
        this.createInstances('TANK', MATERIALS.tank);
        this.createInstances('BOMBER', MATERIALS.bomber);
    }

    public reAttach(scene: THREE.Scene) {
        this.scene = scene;
        Object.values(this.meshes).forEach(m => {
            if (m.parent !== scene) {
                scene.add(m);
            }
        });
    }

    private createInstances(type: string, material: THREE.Material) {
        const mesh = new THREE.InstancedMesh(GEOMETRY.zombie, material, this.maxInstances);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.count = 0;
        mesh.frustumCulled = false; // Prevent instances disappearing when far from 0,0,0

        this.meshes[type] = mesh;
        this.scene.add(mesh);
    }

    public sync(enemies: Enemy[]) {
        // Reset counts for all render types
        Object.values(this.meshes).forEach(m => {
            m.count = 0;
        });

        if (enemies.length === 0) {
            Object.values(this.meshes).forEach(m => {
                m.instanceMatrix.needsUpdate = true;
                if (m.instanceColor) m.instanceColor.needsUpdate = true;
            });
            return;
        }

        const dummy = new THREE.Object3D();

        for (const e of enemies) {
            // Render until fully removed from enemies array (cleanup handles migration to CorpseRenderer)
            if (e.deathState === 'dead') continue;

            const instMesh = this.meshes[e.type]; // e.type is already upper 'WALKER' from spawner
            if (!instMesh || instMesh.count >= this.maxInstances) continue;

            const idx = instMesh.count;

            // Sync position, rotation, scale
            const scale = e.originalScale || 1.0;
            const wScale = (e.widthScale || 1.0) * scale;
            dummy.position.copy(e.mesh.position);
            // dummy.position.y += scale; // Removed: Mesh position already centers geometry
            dummy.quaternion.copy(e.mesh.quaternion);
            dummy.scale.set(wScale, scale, wScale);

            // Boss/Special scaling & color overrides
            if (e.isBoss || e.color !== undefined) {
                const color = new THREE.Color(e.color || 0xffffff);
                instMesh.setColorAt(idx, color);
            }

            dummy.updateMatrix();
            instMesh.setMatrixAt(idx, dummy.matrix);
            instMesh.count++;
        }

        // Apply updates after batch is full
        Object.values(this.meshes).forEach(m => {
            m.instanceMatrix.needsUpdate = true;
            if (m.instanceColor) m.instanceColor.needsUpdate = true;
        });
    }

    public destroy() {
        Object.values(this.meshes).forEach(m => {
            this.scene.remove(m);
            m.dispose();
        });
        this.meshes = {};
    }
}
