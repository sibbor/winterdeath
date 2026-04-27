import * as THREE from 'three';
import { GEOMETRY, MATERIALS } from '../../utils/assets';
import { ZOMBIE_TYPES } from '../../content/constants';
import { Enemy, EnemyDeathState, EnemyType } from '../../entities/enemies/EnemyTypes';
import { WeaponType } from '../../content/weapons';

export class ZombieRenderer {
    private meshes: Record<string, THREE.InstancedMesh> = {};
    private _meshList: THREE.InstancedMesh[] = []; // Cached list for fast O(1) iteration
    private scene: THREE.Scene;
    private maxInstances: number;

    // --- PERFORMANCE SCRATCHPADS ---
    private _tempColor = new THREE.Color();
    private _white = new THREE.Color(0xffffff);

    // En enorm bounding sphere som säkerställer att horden inte pop:ar, 
    // men tillåter THREE att ignorera hela gruppen om du tittar bort.
    private _sharedBoundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 2000);

    constructor(scene: THREE.Scene, maxInstances: number = 500) {
        this.scene = scene;
        this.maxInstances = maxInstances;

        // Initialize InstancedMeshes for each type
        this.createInstances(EnemyType.WALKER, this.getMat(ZOMBIE_TYPES[EnemyType.WALKER].color));
        this.createInstances(EnemyType.RUNNER, this.getMat(ZOMBIE_TYPES[EnemyType.RUNNER].color));
        this.createInstances(EnemyType.TANK, this.getMat(ZOMBIE_TYPES[EnemyType.TANK].color));
        this.createInstances(EnemyType.BOMBER, this.getMat(ZOMBIE_TYPES[EnemyType.BOMBER].color));

        this._updateMeshList();
    }

    private getMat(color: number) {
        // Material cloning is fine during init/constructor
        const m = MATERIALS.zombie.clone() as THREE.MeshStandardMaterial;
        // [VINTERDÖD] Låter basfärgen förbli här. Instansfärger multipliceras sedan med denna.
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

    private createInstances(type: EnemyType | string, material: THREE.Material) {

        const mesh = new THREE.InstancedMesh(GEOMETRY.zombie, material, this.maxInstances);
        mesh.frustumCulled = false;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.count = 0;

        // PRE-ALLOCATE COLOR BUFFER
        // Detta är extremt viktigt för setColorAt ska funka utan att krascha/lura GC
        mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.maxInstances * 3), 3);

        // OPTIMERING: Istället för frustumCulled = false (som ritar objekten även om du tittar bort),
        // ger vi dem en gigantisk sfär. Då ritas horden så fort ETT hörn av mappen är i bild, 
        // men klipps bort om du tittar rakt upp i himlen.
        mesh.boundingSphere = this._sharedBoundingSphere;

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
    public sync(enemies: Enemy[], time: number) {
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
            if (e.deathState === EnemyDeathState.DEAD) continue;

            const instMesh = this.meshes[e.type];
            if (!instMesh || instMesh.count >= this.maxInstances) continue;

            const idx = instMesh.count;

            // --- MATRIX SYNC ---
            // Eftersom EnemyAnimator redan snurrar, poserar och skalar e.mesh,
            // uppdaterar vi dess world matrix och lånar den direkt till instansen!
            // Det sparar CPU eftersom vi slipper räkna matrisen två gånger.
            e.mesh.updateMatrixWorld(true);
            instMesh.setMatrixAt(idx, e.mesh.matrixWorld);

            // --- HIT FLASH LOGIC ---
            // Calculate color based on hit feedback. Arc-Cannon has a unique cyan-white flash.
            const timeSinceHit = time - e.hitTime;
            if (timeSinceHit < 100) {
                if (e.lastDamageType === WeaponType.ARC_CANNON) {
                    // Lerp between White and Cyan for the electric look
                    this._tempColor.set(0x00ffff).lerp(this._white, 0.4);
                } else {
                    this._tempColor.set(0xffffff); // Standard white flash
                }
                instMesh.setColorAt(idx, this._tempColor);
            } else {
                // If not flashing, reset to white (which allows the material base color to show)
                this._tempColor.setHex(0xffffff);
                instMesh.setColorAt(idx, this._tempColor);
            }

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
            if (m.count > 0 || m.instanceMatrix.needsUpdate) {
                m.instanceMatrix.needsUpdate = true;
                if (m.instanceColor) m.instanceColor.needsUpdate = true;
            }
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