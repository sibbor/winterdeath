
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

        // Corpses use a white material base so they can be tinted via setColorAt
        const material = MATERIALS.zombie.clone() as THREE.MeshStandardMaterial;
        material.color.set(0xffffff);

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

    public addCorpse(position: THREE.Vector3, rotation: THREE.Euler | THREE.Quaternion, scale: number, widthScale: number = 1.0, colorHex?: number) {
        if (this.currentCount >= this.maxInstances) {
            this.currentCount = 0;
        }

        this.dummy.position.copy(position);

        if (rotation instanceof THREE.Euler) {
            this.dummy.rotation.copy(rotation);
        } else {
            this.dummy.quaternion.copy(rotation);
        }

        const wScale = widthScale * scale;
        this.dummy.scale.set(wScale, scale, wScale);
        this.dummy.updateMatrix();

        this.mesh.setMatrixAt(this.currentCount, this.dummy.matrix);

        // Darken and apply the specific enemy color
        if (colorHex !== undefined) {
            const c = new THREE.Color(colorHex);
            c.multiplyScalar(0.5); // Darken for corpse look
            this.mesh.setColorAt(this.currentCount, c);
            if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
        }

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
