import * as THREE from 'three';
import { WindSystem } from './WindSystem';
import { GEOMETRY } from '../../utils/assets';
import { WeatherType } from '../../types';

// --- PERFORMANCE SCRATCHPADS ---
const _dummy = new THREE.Object3D();
const _v1 = new THREE.Vector3();

export class WeatherSystem {
    private instancedMesh: THREE.InstancedMesh | null = null;

    // Using Typed Arrays instead of Array<Vector3> for massive GC reduction
    private positions: Float32Array;
    private velocities: Float32Array;

    private scene: THREE.Scene;
    private type: WeatherType = 'none';
    private count: number = 0;
    private areaSize: number = 100;
    private wind: WindSystem;
    private maxCount: number;

    constructor(scene: THREE.Scene, wind: WindSystem, maxCount: number = 1000) {
        this.scene = scene;
        this.wind = wind;
        this.maxCount = maxCount;

        // Pre-allocate memory buffers once
        this.positions = new Float32Array(maxCount * 3);
        this.velocities = new Float32Array(maxCount * 3);
    }

    /**
     * Reconfigures the weather type and particle count.
     * Reuses existing mesh and buffers where possible.
     */
    public sync(type: WeatherType, count: number, areaSize: number = 100) {
        if (this.type === type && this.count === count) return;

        const actualCount = Math.min(count, this.maxCount);
        this.type = type;
        this.count = actualCount;
        this.areaSize = areaSize;

        // Cleanup if switching to none
        if (type === 'none' || actualCount <= 0) {
            if (this.instancedMesh) this.instancedMesh.visible = false;
            return;
        }

        // Setup visuals
        let color = 0xffffff;
        let opacity = 0.8;
        if (type === 'rain') {
            color = 0xaaaaff;
            opacity = 0.4;
        }

        // (Re)create mesh only if material properties changed significantly
        if (!this.instancedMesh) {
            const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity });
            this.instancedMesh = new THREE.InstancedMesh(GEOMETRY.weatherParticle, mat, this.maxCount);
            this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            this.scene.add(this.instancedMesh);
        } else {
            const mat = this.instancedMesh.material as THREE.MeshBasicMaterial;
            mat.color.set(color);
            mat.opacity = opacity;
            this.instancedMesh.visible = true;
        }

        this.instancedMesh.count = actualCount;

        // Initialize particle buffers
        for (let i = 0; i < actualCount; i++) {
            const i3 = i * 3;
            // X, Y, Z positions
            this.positions[i3 + 0] = (Math.random() - 0.5) * areaSize;
            this.positions[i3 + 1] = Math.random() * 40;
            this.positions[i3 + 2] = (Math.random() - 0.5) * areaSize;

            // X, Y, Z velocities
            if (type === 'snow') {
                this.velocities[i3 + 0] = (Math.random() - 0.5) * 1.5; // Sway
                this.velocities[i3 + 1] = -(8 + Math.random() * 7);   // Fall speed
                this.velocities[i3 + 2] = (Math.random() - 0.5) * 1.5; // Sway
            } else {
                this.velocities[i3 + 0] = 0;
                this.velocities[i3 + 1] = -(50 + Math.random() * 30); // Fast rain
                this.velocities[i3 + 2] = 0;
            }

            this.updateInstanceMatrix(i);
        }
        this.instancedMesh.instanceMatrix.needsUpdate = true;
    }

    /**
     * Main update loop. 
     * Runs at Zero-GC using Float32Array indexing.
     */
    public update(delta: number, now: number) {
        if (this.type === 'none' || !this.instancedMesh) return;

        const windVec = this.wind.current;
        const windSwayMult = this.type === 'snow' ? 150.0 : 80.0;
        const isRain = this.type === 'rain';

        for (let i = 0; i < this.count; i++) {
            const i3 = i * 3;

            // Apply movement logic directly to buffer values
            this.positions[i3 + 1] += this.velocities[i3 + 1] * delta; // Vertical
            this.positions[i3 + 0] += (this.velocities[i3 + 0] + windVec.x * windSwayMult) * delta; // Horizontal X
            this.positions[i3 + 2] += (this.velocities[i3 + 2] + windVec.y * windSwayMult) * delta; // Horizontal Z

            // Seamless Reset (Teleport back to top)
            if (this.positions[i3 + 1] < -5) {
                this.positions[i3 + 1] = 40;
                this.positions[i3 + 0] = (Math.random() - 0.5) * this.areaSize;
                this.positions[i3 + 2] = (Math.random() - 0.5) * this.areaSize;
            }

            // Sync with GPU
            this.updateInstanceMatrix(i);
        }
        this.instancedMesh.instanceMatrix.needsUpdate = true;
    }

    /**
     * Internal helper to set matrix values from buffer data
     */
    private updateInstanceMatrix(index: number) {
        if (!this.instancedMesh) return;
        const i3 = index * 3;

        _dummy.position.set(this.positions[i3], this.positions[i3 + 1], this.positions[i3 + 2]);

        if (this.type === 'rain') {
            _dummy.scale.set(0.5, 4.0, 1.0);
        } else {
            _dummy.scale.set(1, 1, 1);
        }

        _dummy.updateMatrix();
        this.instancedMesh.setMatrixAt(index, _dummy.matrix);
    }

    public clear() {
        if (this.instancedMesh) {
            this.scene.remove(this.instancedMesh);
            if (this.instancedMesh.material instanceof THREE.Material) {
                this.instancedMesh.material.dispose();
            }
            this.instancedMesh.dispose();
            this.instancedMesh = null;
        }
        // No need to clear Float32Arrays, just leave them allocated
    }
}