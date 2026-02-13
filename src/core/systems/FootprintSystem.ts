import * as THREE from 'three';
import { MATERIALS } from '../../utils/assets/materials';
import { soundManager } from '../../utils/sound';

const MAX_FOOTPRINTS = 50;
const FADE_DURATION = 15000; // 15 seconds fade
const START_OPACITY = 0.8;

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _sideOffset = new THREE.Vector3();
const _rayOrigin = new THREE.Vector3();
const _down = new THREE.Vector3(0, -1, 0);
const _caster = new THREE.Raycaster();

interface Footprint {
    mesh: THREE.Mesh;
    life: number;
    active: boolean;
}

class FootprintSystemClass {
    public enabled = true;
    private footprints: Footprint[] = [];
    private scene: THREE.Scene | null = null;
    private geometry: THREE.PlaneGeometry;
    private materialBase: THREE.MeshBasicMaterial;
    private index = 0;
    private groundMeshes: THREE.Object3D[] = []; // Cached ground references
    private lastSurface: 'snow' | 'metal' | 'wood' = 'snow';

    constructor() {
        this.geometry = new THREE.PlaneGeometry(0.25, 0.45);
        this.geometry.rotateX(-Math.PI / 2); // Orient flat for ground placement
        this.materialBase = MATERIALS.footprintDecal;
    }

    init(scene: THREE.Scene) {
        this.scene = scene;

        // Cache ground meshes once to avoid heavy scene filtering during gameplay
        this.groundMeshes = scene.children.filter(obj =>
            obj.type === 'Mesh' && obj.name.startsWith('Ground_')
        );

        if (this.footprints.length > 0) {
            this.index = 0;
            for (let i = 0; i < this.footprints.length; i++) {
                const fp = this.footprints[i];
                if (fp.mesh.parent !== scene) scene.add(fp.mesh);
                fp.active = false;
                fp.mesh.visible = false;
            }
            return;
        }

        this.index = 0;
        // Pre-allocate the pool with cloned materials for individual fading
        for (let i = 0; i < MAX_FOOTPRINTS; i++) {
            const mat = this.materialBase.clone();
            const mesh = new THREE.Mesh(this.geometry, mat);
            mesh.name = "Footprint_Mesh";
            mesh.userData.isEngineStatic = true;
            mesh.visible = false;
            mesh.renderOrder = 2;
            mesh.matrixAutoUpdate = false; // Manual updates only for performance

            this.scene.add(mesh);
            this.footprints.push({ mesh, life: 0, active: false });
        }
    }

    /**
     * Places a new footprint decal in the world.
     * Uses O(1) pool access and Zero-GC math.
     */
    addFootprint(position: THREE.Vector3, rotationY: number, isRight: boolean) {
        if (!this.enabled || !this.scene || this.groundMeshes.length === 0) return;

        const footprint = this.footprints[this.index];
        this.index = (this.index + 1) % MAX_FOOTPRINTS;

        // 1. Calculate side offset using scratchpad
        const offsetDist = 0.15;
        _sideOffset.set(isRight ? offsetDist : -offsetDist, 0, 0);
        _sideOffset.applyAxisAngle(_v1.set(0, 1, 0), rotationY);

        // 2. Determine target position
        _v2.copy(position).add(_sideOffset);

        const groundHeight = this.getGroundHeight(_v2);
        if (groundHeight === null) return;

        // 3. Reset and place the footprint
        footprint.active = true;
        footprint.life = FADE_DURATION;
        footprint.mesh.visible = true;

        const mat = footprint.mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = START_OPACITY;

        footprint.mesh.position.copy(_v2);
        footprint.mesh.position.y = groundHeight + 0.02; // Tiny offset to prevent Z-fighting
        footprint.mesh.rotation.y = rotationY;

        // Mirror for right foot logic
        footprint.mesh.scale.set(isRight ? -0.6 : 0.6, 1, 1);

        // Finalize transform once
        footprint.mesh.updateMatrix();

        // 4. Sound feedback
        soundManager.playFootstep(this.lastSurface);
    }

    /**
     * Highly optimized raycast against a cached subset of scene objects.
     */
    private getGroundHeight(pos: THREE.Vector3): number | null {
        _rayOrigin.set(pos.x, 10.0, pos.z);
        _caster.set(_rayOrigin, _down);

        // Non-recursive intersect for maximum speed
        const hits = _caster.intersectObjects(this.groundMeshes, false);

        if (hits.length > 0) {
            const hit = hits[0];
            const name = hit.object.name.toUpperCase();

            // Detect surface type for audio
            if (name.includes('METAL')) this.lastSurface = 'metal';
            else if (name.includes('WOOD') || name.includes('PLANK')) this.lastSurface = 'wood';
            else this.lastSurface = 'snow';

            return hit.point.y;
        }

        return null;
    }

    /**
     * Main update loop for fading footprints.
     * Uses a high-speed for-loop to avoid iterator overhead.
     */
    update(delta: number) {
        if (!this.enabled || !this.scene) return;

        for (let i = 0; i < this.footprints.length; i++) {
            const fp = this.footprints[i];
            if (!fp.active) continue;

            fp.life -= delta;

            if (fp.life <= 0) {
                fp.active = false;
                fp.mesh.visible = false;
            } else {
                // Smooth linear fade
                (fp.mesh.material as THREE.MeshBasicMaterial).opacity = (fp.life / FADE_DURATION) * START_OPACITY;
            }
        }
    }

    cleanup() {
        if (this.scene) {
            for (let i = 0; i < this.footprints.length; i++) {
                const fp = this.footprints[i];
                this.scene.remove(fp.mesh);
                (fp.mesh.material as THREE.Material).dispose();
            }
            this.geometry.dispose();
            this.footprints = [];
            this.groundMeshes = [];
            this.scene = null;
        }
    }
}

export const FootprintSystem = new FootprintSystemClass();