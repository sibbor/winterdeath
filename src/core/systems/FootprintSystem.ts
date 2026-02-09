import * as THREE from 'three';
import { MATERIALS } from '../../utils/assets/materials';

const MAX_FOOTPRINTS = 50;
const FADE_DURATION = 5000; // 5 seconds fade
const START_OPACITY = 0.8;

interface Footprint {
    mesh: THREE.Mesh;
    life: number;
    active: boolean;
}

class FootprintSystemClass {
    public enabled = true; // Easy toggle for debugging/performance
    private footprints: Footprint[] = [];
    private scene: THREE.Scene | null = null;
    private geometry: THREE.PlaneGeometry;
    private materialBase: THREE.MeshBasicMaterial;
    private index = 0;

    constructor() {
        this.geometry = new THREE.PlaneGeometry(0.25, 0.45); // Approx foot size
        this.geometry.rotateX(-Math.PI / 2); // Flat on ground
        this.materialBase = MATERIALS.footprintDecal;
    }

    init(scene: THREE.Scene) {
        this.scene = scene;

        // Aggressive Cleanup: Find any old debug meshes that might be lingering in the scene
        const toRemove: THREE.Object3D[] = [];
        toRemove.forEach(obj => {
            if (obj.parent) obj.parent.remove(obj);
            if ((obj as THREE.Mesh).material) ((obj as THREE.Mesh).material as THREE.Material).dispose();
        });

        if (this.footprints.length > 0) {
            this.index = 0; // Reset index for the new level/session
            this.footprints.forEach(fp => {
                if (fp.mesh.parent !== scene) {
                    scene.add(fp.mesh);
                }
                fp.active = false;
                fp.mesh.visible = false;

                fp.mesh.scale.set(1, 1, 1);
                fp.mesh.position.set(0, -100, 0);
                fp.mesh.updateMatrix();
            });
            return;
        }

        this.index = 0;

        // Pre-allocate pool
        for (let i = 0; i < MAX_FOOTPRINTS; i++) {
            const mat = this.materialBase.clone();
            const mesh = new THREE.Mesh(this.geometry, mat);
            mesh.name = "Footprint_Mesh";
            mesh.userData.isEngineStatic = true;
            mesh.visible = false;
            mesh.renderOrder = 2;
            mesh.matrixAutoUpdate = false;

            this.scene.add(mesh);
            this.footprints.push({ mesh, life: 0, active: false });
        }
    }

    addFootprint(position: THREE.Vector3, rotationY: number, isRight: boolean) {
        if (!this.enabled || !this.scene) return;

        const footprint = this.footprints[this.index];
        this.index = (this.index + 1) % MAX_FOOTPRINTS;

        // Position offset
        const offsetDist = 0.15;
        const SideOffset = new THREE.Vector3(isRight ? offsetDist : -offsetDist, 0, 0);
        SideOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotationY);

        const checkPos = position.clone().add(SideOffset);
        const groundHeight = this.getGroundHeight(checkPos);

        if (groundHeight === null) {
            return;
        }

        // Reset
        footprint.active = true;
        footprint.life = FADE_DURATION;
        footprint.mesh.visible = true;

        const mat = footprint.mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = START_OPACITY;
        mat.color.setHex(0x000000);
        mat.transparent = true;
        mat.depthTest = true;

        footprint.mesh.position.copy(checkPos);
        footprint.mesh.position.y = groundHeight + 0.02;

        footprint.mesh.rotation.x = 0;
        footprint.mesh.rotation.y = rotationY;
        footprint.mesh.rotation.z = 0;

        // Mirror for left/right foot if the texture is asymmetrical (our ellipse one is slightly)
        if (isRight) {
            footprint.mesh.scale.set(-0.6, 1, 1);
        } else {
            footprint.mesh.scale.set(0.6, 1, 1);
        }

        footprint.mesh.updateMatrix();
        footprint.mesh.updateMatrixWorld(true);
    }

    private caster = new THREE.Raycaster();
    private down = new THREE.Vector3(0, -1, 0);

    private getGroundHeight(pos: THREE.Vector3): number | null {
        if (!this.scene) return null;

        // Optimization: Explicitly filter for ground meshes to avoid recursive scene traversal
        const groundMeshes = this.scene.children.filter(obj =>
            obj.type === 'Mesh' && obj.name.startsWith('Ground_')
        );

        if (groundMeshes.length === 0) return null;

        this.caster.set(new THREE.Vector3(pos.x, 10.0, pos.z), this.down);

        // Fast non-recursive check against a tiny set of meshes
        const hits = this.caster.intersectObjects(groundMeshes, false);

        if (hits.length > 0) {
            const hit = hits[0];
            if (hit.object.name.includes('SNOW')) {
                return hit.point.y;
            }
        }

        return null;
    }

    update(delta: number) {
        if (!this.enabled || !this.scene) return;

        this.footprints.forEach(fp => {
            if (fp.active) {
                fp.life -= delta;
                if (fp.life <= 0) {
                    fp.active = false;
                    fp.mesh.visible = false;
                } else {
                    // Linear fade
                    const ratio = fp.life / FADE_DURATION;
                    (fp.mesh.material as THREE.MeshBasicMaterial).opacity = ratio * START_OPACITY;
                }
            }
        });
    }

    cleanup() {
        if (this.scene) {
            this.footprints.forEach(fp => {
                this.scene?.remove(fp.mesh);
                (fp.mesh.material as THREE.Material).dispose();
            });
            this.geometry.dispose();
            this.footprints = [];
            this.scene = null;
        }
    }
}

export const FootprintSystem = new FootprintSystemClass();
