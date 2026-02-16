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
        } else if (type === 'ash') {
            color = 0x222222; // Dark Gray
            opacity = 0.9;
        } else if (type === 'ember') {
            color = 0xff4400; // Glowing Orange/Red
            opacity = 1.0;
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
            } else if (type === 'ash') {
                this.velocities[i3 + 0] = (Math.random() - 0.5) * 2;
                this.velocities[i3 + 1] = -(2 + Math.random() * 3); // Slow fall
                this.velocities[i3 + 2] = (Math.random() - 0.5) * 2;
            } else if (type === 'ember') {
                this.velocities[i3 + 0] = (Math.random() - 0.5) * 3;
                this.velocities[i3 + 1] = (1 + Math.random() * 4); // Rise up? Or float. Let's make them float up slowly or chaotic.
                this.velocities[i3 + 2] = (Math.random() - 0.5) * 3;
            } else { // rain
                this.velocities[i3 + 0] = 0;
                this.velocities[i3 + 1] = -(50 + Math.random() * 30); // Fast rain
                this.velocities[i3 + 2] = 0;
            }

            this.updateInstanceMatrix(i);
        }
        this.instancedMesh.instanceMatrix.needsUpdate = true;
    }

    public update(dt: number, time: number) {
        if (!this.instancedMesh || !this.instancedMesh.visible) return;

        const windVec = this.wind.current;
        const windSwayMult = this.type === 'snow' ? 20.0 : 10.0;

        for (let i = 0; i < this.count; i++) {
            const i3 = i * 3;

            // Apply movement logic directly to buffer values
            this.positions[i3 + 1] += this.velocities[i3 + 1] * dt; // Vertical
            this.positions[i3 + 0] += (this.velocities[i3 + 0] + windVec.x * windSwayMult) * dt; // Horizontal X
            this.positions[i3 + 2] += (this.velocities[i3 + 2] + windVec.y * windSwayMult) * dt; // Horizontal Z

            // Seamless Reset (Teleport back to top)
            if (this.positions[i3 + 1] < 0) {
                this.positions[i3 + 1] = 40;
                this.positions[i3 + 0] = (Math.random() - 0.5) * this.areaSize;
                this.positions[i3 + 2] = (Math.random() - 0.5) * this.areaSize;
            }

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

    public setVisible(visible: boolean) {
        if (this.instancedMesh) this.instancedMesh.visible = visible;
    }
}