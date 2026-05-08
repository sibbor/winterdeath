import * as THREE from 'three';
import { GEOMETRY, MATERIALS } from '../../utils/assets';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _tempColor = new THREE.Color();
const _tempQuat = new THREE.Quaternion();
const _defaultDeadColor = new THREE.Color(0x808080); // 0xffffff * 0.5 (default color for cold corpses)

/**
 * CorpseRenderer manages dead enemy visuals using Hardware Instancing.
 * Optimized to handle thousands of static meshes with zero runtime allocation.
 */
export class CorpseRenderer {
    private mesh: THREE.InstancedMesh;
    private scene: THREE.Scene;
    private maxInstances: number;
    private insertIndex: number = 0;
    private dummy = new THREE.Object3D();
    private _sharedBoundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 2000);

    constructor(scene: THREE.Scene, maxInstances: number = 2000) {
        this.scene = scene;
        this.maxInstances = maxInstances;

        // Corpses use a unique material clone to allow global darkening 
        // without affecting living enemies or other systems.
        const material = MATERIALS.zombie.clone() as THREE.MeshStandardMaterial;
        material.color.setHex(0xffffff); // Set to white to act as a multiplier for instance colors

        this.mesh = new THREE.InstancedMesh(GEOMETRY.zombie, material, this.maxInstances);
        this.mesh.frustumCulled = false;
        this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.maxInstances * 3), 3);
        
        // --- BUOYANCY ATTRIBUTE (Phase 15) ---
        // 1.0 = Floating on water, 0.0 = Static on ground
        this.mesh.geometry.setAttribute('aIsFloating', new THREE.InstancedBufferAttribute(new Float32Array(this.maxInstances), 1));

        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.mesh.count = 0;
        this.mesh.boundingSphere = this._sharedBoundingSphere;

        // --- SHADER INJECTION ---
        material.onBeforeCompile = (shader) => {
            shader.uniforms.uTime = { value: 0 };
            
            shader.vertexShader = `
                attribute float aIsFloating;
                varying float vIsFloating;
                uniform float uTime;
                ${shader.vertexShader}
            `.replace(
                '#include <begin_vertex>',
                `
                #include <begin_vertex>
                vIsFloating = aIsFloating;
                if (aIsFloating > 0.5) {
                    // Optimized procedural buoyancy based on world-space coordinates
                    // We extract the instance position directly from the modelMatrix (which is the instanceMatrix in Three.js)
                    vec3 instancePos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
                    
                    // Sine-wave oscillation seed based on position and time
                    float seed = (instancePos.x * 0.4) + (instancePos.z * 0.4) + (uTime * 1.8);
                    float wave = sin(seed) * 0.12;
                    float wave2 = cos(seed * 0.7) * 0.08;
                    
                    transformed.y += wave + wave2;
                    
                    // Suble tilt detail (optional but looks great for floaters)
                    // transformed.x += wave * 0.2;
                }
                `
            );
            this.mesh.userData.shader = shader;
        };

        this.scene.add(this.mesh);
    }

    /**
     * Re-inserts the instanced mesh into a new scene context (e.g. level transition).
     */
    public reAttach(scene: THREE.Scene) {
        this.scene = scene;
        if (this.mesh.parent !== scene) {
            scene.add(this.mesh);
        }
    }

    /**
     * Adds a static corpse to the world.
     * Uses O(1) circular buffer logic to overwrite oldest corpses when max capacity is reached.
     */
    public addCorpse(
        position: THREE.Vector3,
        rotation: THREE.Euler | THREE.Quaternion,
        scale: number,
        widthScale: number = 1.0,
        colorHex?: number,
        isFloating: boolean = false
    ) {
        const idx = this.insertIndex;

        // 1. Sync Transform via direct composition (Zero-GC, bypasses Object3D overhead)
        this.dummy.position.copy(position);

        const wScale = widthScale * scale;
        this.dummy.scale.set(wScale, scale, wScale);

        // [VINTERDÖD] Snabb type-check istället för instanceof (vilket är långsammare) och direkt matriskomposition.
        if ((rotation as THREE.Euler).isEuler) {
            _tempQuat.setFromEuler(rotation as THREE.Euler);
            this.dummy.matrix.compose(this.dummy.position, _tempQuat, this.dummy.scale);
        } else {
            this.dummy.matrix.compose(this.dummy.position, rotation as THREE.Quaternion, this.dummy.scale);
        }

        // Write transformation matrix to the instanced buffer
        this.mesh.setMatrixAt(idx, this.dummy.matrix);

        // 2. Sync Color (Zero-GC & Anti-Bleed)
        if (colorHex !== undefined) {
            // Apply a 0.5 multiplier to the original hex to make the corpse look "cold" or darkened
            _tempColor.setHex(colorHex).multiplyScalar(0.5);
            this.mesh.setColorAt(idx, _tempColor);
        } else {
            // [VINTERDÖD] Återställ materialets grundfärg så vi inte blöder färg från ett överskrivet lik
            this.mesh.setColorAt(idx, _defaultDeadColor);
        }

        // 3. Sync Buoyancy State (Zero-GC Attribute update)
        const floatingAttr = this.mesh.geometry.getAttribute('aIsFloating') as THREE.InstancedBufferAttribute;
        floatingAttr.setX(idx, isFloating ? 1.0 : 0.0);
        floatingAttr.needsUpdate = true;

        // 4. Increment internal counter & Wrap around for circular logic
        this.insertIndex = (this.insertIndex + 1) % this.maxInstances;

        // Increase render count up to max limits
        if (this.mesh.count < this.maxInstances) {
            this.mesh.count++;
        }

        // Set the dirty flags for the next render pass
        this.mesh.instanceMatrix.needsUpdate = true;
        if (this.mesh.instanceColor) {
            this.mesh.instanceColor.needsUpdate = true;
        }
    }

    /**
     * Updates uniform data for all corpses (e.g. buoyancy time).
     */
    public update(renderTime: number) {
        if (this.mesh.userData.shader) {
            this.mesh.userData.shader.uniforms.uTime.value = renderTime * 0.001;
        }
    }

    /**
     * Resets all corpses. Useful for game restarts or level clears.
     */
    public clear() {
        this.insertIndex = 0;
        this.mesh.count = 0;
        this.mesh.instanceMatrix.needsUpdate = true;
    }

    /**
     * Full cleanup of GPU resources.
     */
    public destroy() {
        this.scene.remove(this.mesh);
        this.mesh.dispose();
        if (this.mesh.material instanceof THREE.Material) {
            this.mesh.material.dispose();
        }
    }
}
