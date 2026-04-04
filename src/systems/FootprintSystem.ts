import * as THREE from 'three';
import { MATERIALS } from '../utils/assets/materials';
import { soundManager } from '../utils/audio/SoundManager';
import { MaterialType, MATERIAL_TYPE } from '../content/environment';
import { GameSessionLogic } from '../game/session/GameSessionLogic';
import { FXSystem } from './FXSystem';

const MAX_FOOTPRINTS = 50;
const FADE_DURATION = 15000; // 15 seconds fade
const START_OPACITY = 0.8;

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _sideOffset = new THREE.Vector3();
const _rayOrigin = new THREE.Vector3(0, 50.0, 0); // [VINTERDÖD] High-terrain support
const _down = new THREE.Vector3(0, -1, 0);
const _caster = new THREE.Raycaster();
const _tempQuat = new THREE.Quaternion(); // [VINTERDÖD] För snabb matrix-komposition
const _tempColor = new THREE.Color();

// [VINTERDÖD] Zero-GC result object for ground detection
const _groundResult = {
    height: 0,
    material: MaterialType.GENERIC as MATERIAL_TYPE
};

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

    constructor() {
        this.geometry = new THREE.PlaneGeometry(0.25, 0.45);
        this.geometry.rotateX(-Math.PI / 2); // Orient flat for ground placement
        this.materialBase = MATERIALS.footprintDecal;
    }

    init(scene: THREE.Scene) {
        this.scene = scene;

        // [VINTERDÖD] Recursive traverse to find nested ground meshes (e.g. within groups)
        this.groundMeshes.length = 0;
        scene.traverse((obj) => {
            if ((obj as any).isMesh) {
                const name = obj.name.toLowerCase();
                if (name.includes('ground') || name.includes('terrain') || name.includes('floor') || name.includes('road')) {
                    this.groundMeshes.push(obj);
                }
            }
        });

        if (this.footprints.length > 0) {
            this.index = 0;
            const fpLen = this.footprints.length;
            for (let i = 0; i < fpLen; i++) {
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
            mesh.frustumCulled = false;   // [VINTERDÖD] Never pop out of view

            this.scene.add(mesh);
            this.footprints.push({ mesh, life: 0, active: false });
        }
    }

    /**
     * Places a new footprint decal in the world or handles water FX.
     * Centralized hub for ALL step-based audio/visual feedback.
     */
    addFootprint(
        session: GameSessionLogic,
        position: THREE.Vector3,
        rotationY: number,
        isRight: boolean,
        isRushing: boolean,
        inWater: boolean,
        isSwimming: boolean
    ) {
        if (!this.enabled || !this.scene) return;

        // 1. Water Handle (No decals, no raycast)
        if (inWater) {
            if (isSwimming) {
                soundManager.playSwimming();
                FXSystem.spawnPart(
                    this.scene,
                    session.state.particles,
                    position.x, position.y + 1.0, position.z,
                    'splash',
                    10
                );
                session.engine.water.spawnRipple(position.x, position.z, session.state.simTime, 4.0);
            } else {
                soundManager.playFootstep(MaterialType.WATER, isRight);
                session.engine.water.spawnRipple(position.x, position.z, session.state.simTime, 1.5);
            }
            return;
        }

        // 2. Land Handle (Raycast + Decal)
        if (this.groundMeshes.length === 0) return;

        const ground = this.getGroundResult(position);
        if (ground === null) return;

        const footprint = this.footprints[this.index];
        this.index = (this.index + 1) % MAX_FOOTPRINTS;

        // Blixtsnabb matematisk X/Z offset
        const offsetDist = isRight ? 0.15 : -0.15;
        const cosY = Math.cos(rotationY);
        const sinY = Math.sin(rotationY);

        _sideOffset.set(offsetDist * cosY, 0, -offsetDist * sinY);
        _v2.copy(position).add(_sideOffset);

        // Reset and place the footprint
        footprint.active = true;
        footprint.life = FADE_DURATION;
        footprint.mesh.visible = true;

        const mat = footprint.mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = START_OPACITY;

        // Dynamic Tinting (Zero-GC)
        if (ground.material === MaterialType.SNOW) {
            _tempColor.set(0xcccccc);
        } else if (ground.material === MaterialType.DIRT || ground.material === MaterialType.GRAVEL) {
            _tempColor.set(0x443322);
        } else {
            _tempColor.set(0x222222);
        }
        mat.color.copy(_tempColor);

        footprint.mesh.position.copy(_v2);
        footprint.mesh.position.y = ground.height + 0.02; // Tiny offset to prevent Z-fighting

        _tempQuat.setFromAxisAngle(_v1.set(0, 1, 0), rotationY);

        const scaleX = isRight ? -0.6 : 0.6;
        _v1.set(scaleX, 1, 1);

        footprint.mesh.matrix.compose(footprint.mesh.position, _tempQuat, _v1);
        footprint.mesh.updateMatrixWorld(true); // [VINTERDÖD] Force update for non-auto meshes

        // 3. Audio & Particle Feedback
        soundManager.playFootstep(ground.material, isRight);

        if (isRushing && (ground.material === MaterialType.SNOW || ground.material === MaterialType.DIRT)) {
            FXSystem.spawnPart(
                this.scene,
                session.state.particles,
                _v2.x, _v2.y, _v2.z,
                'large_smoke',
                1
            );
        }
    }

    /**
     * Highly optimized raycast against a cached subset of scene objects.
     * Returns a pooled result object to avoid frame-rate allocations.
     */
    private getGroundResult(pos: THREE.Vector3): typeof _groundResult | null {
        _rayOrigin.set(pos.x, 10.0, pos.z);
        _caster.set(_rayOrigin, _down);

        const hits = _caster.intersectObjects(this.groundMeshes, false);

        if (hits.length > 0) {
            const hit = hits[0];
            _groundResult.height = hit.point.y;

            // Read materialId from userData (Standardized in TerrainGenerator)
            const materialId = hit.object.userData.materialId;
            _groundResult.material = materialId || MaterialType.GENERIC;

            return _groundResult;
        }

        return null;
    }

    /**
     * Main update loop for fading footprints.
     * Uses a high-speed for-loop to avoid iterator overhead.
     */
    update(delta: number) {
        if (!this.enabled || !this.scene) return;

        const len = this.footprints.length;
        for (let i = 0; i < len; i++) {
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
            const len = this.footprints.length;
            for (let i = 0; i < len; i++) {
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