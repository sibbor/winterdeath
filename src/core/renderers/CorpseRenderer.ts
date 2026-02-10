
import * as THREE from 'three';
import { GEOMETRY, MATERIALS } from '../../utils/assets';

export class CorpseRenderer {
    private mesh: THREE.InstancedMesh;
    private scene: THREE.Scene;
    private maxInstances: number;
    private currentCount: number = 0;
    private dummy = new THREE.Object3D();

    constructor(scene: THREE.Scene, maxInstances: number = 2000) {
        this.scene = scene;
        this.maxInstances = maxInstances;

        // Corpses are tinted darker and use a single material for now to maximize batching
        const material = MATERIALS.walker.clone() as THREE.MeshStandardMaterial;
        material.color.multiplyScalar(0.5);

        this.mesh = new THREE.InstancedMesh(GEOMETRY.zombie, material, this.maxInstances);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.mesh.count = 0;
        this.mesh.frustumCulled = false;
        this.scene.add(this.mesh);
    }

    public reAttach(scene: THREE.Scene) {
        this.scene = scene;
        if (this.mesh.parent !== scene) {
            scene.add(this.mesh);
        }
    }

    public addCorpse(position: THREE.Vector3, rotation: THREE.Euler | THREE.Quaternion, scale: number, widthScale: number = 1.0) {
        if (this.currentCount >= this.maxInstances) {
            this.currentCount = 0;
        }

        this.dummy.position.copy(position);
        // Slightly higher to ensure visibility above ground plane, 
        // matching the 1.0 body height half-offset
        this.dummy.position.y = Math.max(0.3, position.y);

        if (rotation instanceof THREE.Euler) {
            this.dummy.rotation.copy(rotation);
        } else {
            this.dummy.quaternion.copy(rotation);
        }

        // Force "lying down" if not already
        const isLyingDown = Math.abs(this.dummy.rotation.x + Math.PI / 2) < 0.5;
        if (!isLyingDown) {
            this.dummy.rotation.x = -Math.PI / 2;
            this.dummy.rotation.z = Math.random() * Math.PI * 2;
        }
        this.dummy.position.y += scale; // Offset for centered lathe geometry
        const wScale = widthScale * scale;
        this.dummy.scale.set(wScale, scale, wScale);
        this.dummy.updateMatrix();

        this.mesh.setMatrixAt(this.currentCount, this.dummy.matrix);
        this.currentCount++;
        this.mesh.count = Math.max(this.mesh.count, this.currentCount);
        this.mesh.instanceMatrix.needsUpdate = true;
    }

    public clear() {
        this.currentCount = 0;
        this.mesh.count = 0;
        this.mesh.instanceMatrix.needsUpdate = true;
    }

    public destroy() {
        this.scene.remove(this.mesh);
        this.mesh.dispose();
    }
}
