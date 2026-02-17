import * as THREE from 'three';
import { WindSystem } from './WindSystem';
import { GEOMETRY, MATERIALS } from '../../utils/assets';
import { WeatherType } from '../../types';

/**
 * [VINTERDÖD] WeatherSystem
 * Handles millions of particles with zero GC and high-performance buffer manipulation.
 */
export class WeatherSystem {
    private instancedMesh: THREE.InstancedMesh | null = null;

    // Buffers for raw physics data
    private positions: Float32Array;
    private velocities: Float32Array;

    private scene: THREE.Scene;
    private type: WeatherType = 'none';
    private count: number = 0;
    private areaSize: number = 100;
    private wind: WindSystem;
    private maxCount: number;

    // [VINTERDÖD] Cached physics multiplier to avoid string checks in hot loop
    private swayMult: number = 0.0;

    constructor(scene: THREE.Scene, wind: WindSystem, maxCount: number = 2000) {
        this.scene = scene;
        this.wind = wind;
        this.maxCount = maxCount;

        // Pre-allocate flat memory buffers
        this.positions = new Float32Array(maxCount * 3);
        this.velocities = new Float32Array(maxCount * 3);
    }

    /**
     * Synchronizes weather state. Switches materials and re-initializes buffers if needed.
     */
    public sync(type: WeatherType, count: number, areaSize: number = 100) {
        const needsResync = this.type !== type || this.count !== count || this.areaSize !== areaSize;

        if (!needsResync) {
            if (this.instancedMesh) {
                if (!this.instancedMesh.parent) this.scene.add(this.instancedMesh);
                this.instancedMesh.visible = type !== 'none' && count > 0;
            }
            return;
        }

        const actualCount = Math.min(count, this.maxCount);
        this.type = type;
        this.count = actualCount;
        this.areaSize = areaSize;

        if (type === 'none' || actualCount <= 0) {
            if (this.instancedMesh) this.instancedMesh.visible = false;
            return;
        }

        // [VINTERDÖD] Assign shared material and pre-calculate physics multipliers
        let selectedMaterial: THREE.Material;
        if (type === 'rain') {
            selectedMaterial = MATERIALS.rain;
            this.swayMult = 5.0; // Heavy, low sway
        } else if (type === 'ash') {
            selectedMaterial = MATERIALS.ash;
            this.swayMult = 15.0; // Light, drifting
        } else if (type === 'ember') {
            selectedMaterial = MATERIALS.ember;
            this.swayMult = 25.0; // Very light, erratic
        } else {
            selectedMaterial = MATERIALS.snow;
            this.swayMult = 20.0; // Soft sway
        }

        // Setup or update InstancedMesh
        if (!this.instancedMesh) {
            this.instancedMesh = new THREE.InstancedMesh(GEOMETRY.weatherParticle, selectedMaterial, this.maxCount);
            this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            this.instancedMesh.frustumCulled = false;
            this.instancedMesh.renderOrder = 999;
            this.scene.add(this.instancedMesh);
        } else {
            this.instancedMesh.material = selectedMaterial;
            this.instancedMesh.visible = true;
            if (!this.instancedMesh.parent) this.scene.add(this.instancedMesh);
        }

        this.instancedMesh.count = actualCount;

        const pos = this.positions;
        const vel = this.velocities;
        const matrixArray = this.instancedMesh.instanceMatrix.array;

        // Static scales per type
        const sX = type === 'rain' ? 0.4 : 1.0;
        const sY = type === 'rain' ? 4.0 : 1.0;
        const sZ = 1.0;
        const areaHalf = areaSize * 0.5;

        // [VINTERDÖD] Buffer Initialization
        for (let i = 0; i < actualCount; i++) {
            const i3 = i * 3;
            const x = (Math.random() * areaSize) - areaHalf;
            const y = Math.random() * 40;
            const z = (Math.random() * areaSize) - areaHalf;

            pos[i3 + 0] = x;
            pos[i3 + 1] = y;
            pos[i3 + 2] = z;

            if (type === 'snow') {
                vel[i3 + 0] = (Math.random() - 0.5) * 1.5;
                vel[i3 + 1] = -(8 + Math.random() * 7);
                vel[i3 + 2] = (Math.random() - 0.5) * 1.5;
            } else if (type === 'ash') {
                vel[i3 + 0] = (Math.random() - 0.5) * 2;
                vel[i3 + 1] = -(2 + Math.random() * 3);
                vel[i3 + 2] = (Math.random() - 0.5) * 2;
            } else if (type === 'ember') {
                vel[i3 + 0] = (Math.random() - 0.5) * 3;
                vel[i3 + 1] = (1 + Math.random() * 4); // Rises UP
                vel[i3 + 2] = (Math.random() - 0.5) * 3;
            } else { // rain
                vel[i3 + 0] = 0;
                vel[i3 + 1] = -(50 + Math.random() * 30);
                vel[i3 + 2] = 0;
            }

            // Direct matrix mutation (Column-major 4x4)
            const matIdx = i * 16;
            matrixArray[matIdx + 0] = sX;
            matrixArray[matIdx + 5] = sY;
            matrixArray[matIdx + 10] = sZ;
            matrixArray[matIdx + 12] = x;
            matrixArray[matIdx + 13] = y;
            matrixArray[matIdx + 14] = z;
            matrixArray[matIdx + 15] = 1;
        }
        this.instancedMesh.instanceMatrix.needsUpdate = true;
    }

    /**
     * Updates particles based on wind and velocity.
     */
    public update(dt: number, time: number) {
        if (!this.instancedMesh || !this.instancedMesh.visible) return;

        // [VINTERDÖD] Using cached sway multiplier and direct wind access
        const windVec = this.wind.current;
        const wx = windVec.x * this.swayMult;
        const wy = windVec.y * this.swayMult;

        const count = this.count;
        const pos = this.positions;
        const vel = this.velocities;
        const areaSize = this.areaSize;
        const areaHalf = areaSize * 0.5;
        const yTop = 40.0;
        const matrixArray = this.instancedMesh.instanceMatrix.array;

        for (let i = 0; i < count; i++) {
            const i3 = i * 3;

            // Integration
            let x = pos[i3 + 0] + (vel[i3 + 0] + wx) * dt;
            let y = pos[i3 + 1] + vel[i3 + 1] * dt;
            let z = pos[i3 + 2] + (vel[i3 + 2] + wy) * dt;

            // [VINTERDÖD] Bidirectional Wrap: Teleport particles to opposite side
            if (y < 0.0) {
                y = yTop;
                x = (Math.random() * areaSize) - areaHalf;
                z = (Math.random() * areaSize) - areaHalf;
            } else if (y > yTop) {
                y = 0.0;
                x = (Math.random() * areaSize) - areaHalf;
                z = (Math.random() * areaSize) - areaHalf;
            }

            pos[i3 + 0] = x;
            pos[i3 + 1] = y;
            pos[i3 + 2] = z;

            // Update only translation components in matrix (Indices 12, 13, 14)
            const matIdx = i * 16;
            matrixArray[matIdx + 12] = x;
            matrixArray[matIdx + 13] = y;
            matrixArray[matIdx + 14] = z;
        }

        this.instancedMesh.instanceMatrix.needsUpdate = true;
    }

    public clear() {
        if (this.instancedMesh) {
            this.scene.remove(this.instancedMesh);
            // Materials are shared in MATERIALS, so we don't dispose them here
            this.instancedMesh.dispose();
            this.instancedMesh = null;
        }
    }

    public reAttach(newScene: THREE.Scene) {
        if (this.instancedMesh) {
            newScene.add(this.instancedMesh);
        }
        this.scene = newScene;
    }
}