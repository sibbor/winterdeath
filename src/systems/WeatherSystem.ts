import * as THREE from 'three';
import { WindSystem } from './WindSystem';
import { GEOMETRY, MATERIALS } from '../utils/assets';
import { WeatherType } from '../core/engine/EngineTypes';;
import { WEATHER_SYSTEM } from '../content/constants';

/**
 * WeatherSystem
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
    private camera: THREE.Camera;
    private maxCount: number;

    // Cached physics multiplier to avoid string checks in hot loop
    private swayMult: number = 0.0;

    // Pre-generated random LUT — avoids Math.random() inside the hot loop
    private _randLUT: Float32Array = new Float32Array(512);
    private _randIdx: number = 0;

    constructor(scene: THREE.Scene, wind: WindSystem, camera: THREE.Camera, maxCount: number = WEATHER_SYSTEM.MAX_NUM_PARTICLES) {
        this.scene = scene;
        this.wind = wind;
        this.camera = camera;

        // Use a safe, high default maxCount to prevent out-of-bounds issues during transitions
        this.maxCount = maxCount;

        // Pre-allocate flat memory buffers
        this.positions = new Float32Array(this.maxCount * 3);
        this.velocities = new Float32Array(this.maxCount * 3);

        for (let i = 0; i < this._randLUT.length; i++) {
            this._randLUT[i] = Math.random();
        }
    }

    /**
     * Synchronizes weather state. Switches materials and re-initializes buffers if needed.
     */
    public sync(type: WeatherType, targetCount: number, areaSize: number = 100) {
        // Safety cap against configuration mistakes
        const actualCount = Math.min(targetCount, this.maxCount);

        // We check if the material needs changing
        const isNewMaterial = this.type !== type;

        this.type = type;
        this.count = actualCount;
        this.areaSize = areaSize;

        if (type === 'none' || actualCount <= 0) {
            if (this.instancedMesh) this.instancedMesh.visible = false;
            return;
        }

        // Assign shared material and pre-calculate physics multipliers
        let selectedMaterial: THREE.Material;
        if (type === 'rain') {
            selectedMaterial = MATERIALS.particle_rain;
            this.swayMult = 5.0; // Heavy, low sway
        } else if (type === 'ash') {
            selectedMaterial = MATERIALS.particle_ash;
            this.swayMult = 15.0; // Light, drifting
        } else if (type === 'ember') {
            selectedMaterial = MATERIALS.particle_ember;
            this.swayMult = 25.0; // Very light, erratic
        } else {
            selectedMaterial = MATERIALS.particle_snow;
            this.swayMult = 40.0; // Soft sway
        }

        // Setup or update InstancedMesh
        if (!this.instancedMesh) {
            // ALWAYS allocate the maximum possible buffer size to prevent reallocation crashes
            this.instancedMesh = new THREE.InstancedMesh(GEOMETRY.weatherParticle, selectedMaterial, this.maxCount);

            // Protect particles from the WebGL Black Hole during clean-up
            this.instancedMesh.name = 'WeatherSystem_Particles';
            this.instancedMesh.userData = { isPersistent: true, isEngineStatic: true };

            this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            this.instancedMesh.frustumCulled = false;
            this.instancedMesh.renderOrder = 999;
            this.scene.add(this.instancedMesh);
        } else if (isNewMaterial) {
            this.instancedMesh.material = selectedMaterial;
        }

        // We always make it visible and ensure it's in the scene
        this.instancedMesh.visible = true;
        if (!this.instancedMesh.parent) this.scene.add(this.instancedMesh);

        // Tell the GPU how many items to actually draw this frame
        this.instancedMesh.count = actualCount;

        const pos = this.positions;
        const vel = this.velocities;
        const matrixArray = this.instancedMesh.instanceMatrix.array;

        // Static scales per type
        const sX = type === 'rain' ? 0.4 : 1.0;
        const sY = type === 'rain' ? 4.0 : 1.0;
        const sZ = 1.0;
        const areaHalf = areaSize * 0.5;

        // Use the camera to avoid NaN crashes
        const centerX = this.camera.position?.x || 0;
        const centerZ = this.camera.position?.z || 0;

        // Buffer Initialization
        // We iterate over maxCount instead of actualCount to ensure the trailing unused matrices 
        // are scaled to 0, preventing ghost particles or corruption from previous sectors.
        // THIS ALWAYS RUNS NOW, relocating the storm to the player immediately on Sector load.
        for (let i = 0; i < this.maxCount; i++) {
            const i3 = i * 3;
            const matIdx = i * 16;

            // If beyond the requested count, scale to 0 to hide it
            if (i >= actualCount) {
                matrixArray[matIdx + 0] = 0;
                matrixArray[matIdx + 5] = 0;
                matrixArray[matIdx + 10] = 0;
                continue;
            }

            const x = centerX + (Math.random() * areaSize) - areaHalf;
            const y = Math.random() * 40;
            const z = centerZ + (Math.random() * areaSize) - areaHalf;

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
            // Essential to write all 16 values explicitly at least once to clear NaN/Undefined
            matrixArray[matIdx + 0] = sX;   // Scale X
            matrixArray[matIdx + 1] = 0;
            matrixArray[matIdx + 2] = 0;
            matrixArray[matIdx + 3] = 0;

            matrixArray[matIdx + 4] = 0;
            matrixArray[matIdx + 5] = sY;   // Scale Y
            matrixArray[matIdx + 6] = 0;
            matrixArray[matIdx + 7] = 0;

            matrixArray[matIdx + 8] = 0;
            matrixArray[matIdx + 9] = 0;
            matrixArray[matIdx + 10] = sZ;  // Scale Z
            matrixArray[matIdx + 11] = 0;

            matrixArray[matIdx + 12] = x;   // Position X
            matrixArray[matIdx + 13] = y;   // Position Y
            matrixArray[matIdx + 14] = z;   // Position Z
            matrixArray[matIdx + 15] = 1;   // W (Required for visibility)
        }

        this.instancedMesh.instanceMatrix.needsUpdate = true;

        // Refill random LUT on weather change so wrapping uses fresh values immediately
        for (let i = 0; i < this._randLUT.length; i++) this._randLUT[i] = Math.random();
        this._randIdx = 0;
    }

    /**
     * Updates particles based on wind and velocity.
     */
    public update(dt: number, time: number) {
        if (!this.instancedMesh || !this.instancedMesh.visible || this.count === 0) return;

        // Using cached sway multiplier and direct wind access
        const windVec = this.wind.current;
        const wx = windVec.x * this.swayMult;
        const wy = windVec.y * this.swayMult;

        const count = this.count;
        const pos = this.positions;
        const vel = this.velocities;
        const areaSize = this.areaSize;
        const areaHalf = areaSize * 0.5;

        // Use the camera to avoid NaN crashes
        const centerX = this.camera.position?.x || 0;
        const centerZ = this.camera.position?.z || 0;

        const yTop = 40.0;
        const matrixArray = this.instancedMesh.instanceMatrix.array;

        for (let i = 0; i < count; i++) {
            const i3 = i * 3;

            // Integration
            let x = pos[i3 + 0] + (vel[i3 + 0] + wx) * dt;
            let y = pos[i3 + 1] + vel[i3 + 1] * dt;
            let z = pos[i3 + 2] + (vel[i3 + 2] + wy) * dt;

            // Wrap uses LUT instead of Math.random() — two reads advance the ring index
            if (y < 0.0) {
                y = yTop;
                const r0 = this._randLUT[this._randIdx++ & 511];
                const r1 = this._randLUT[this._randIdx++ & 511];
                x = centerX + (r0 * areaSize - areaHalf);
                z = centerZ + (r1 * areaSize - areaHalf);
            } else if (y > yTop) {
                y = 0.0;
                const r0 = this._randLUT[this._randIdx++ & 511];
                const r1 = this._randLUT[this._randIdx++ & 511];
                x = centerX + (r0 * areaSize - areaHalf);
                z = centerZ + (r1 * areaSize - areaHalf);
            }

            // X/Z Axis Wrapping relative to camera
            const dx = x - centerX;
            const dz = z - centerZ;

            if (dx < -areaHalf) x += areaSize;
            else if (dx > areaHalf) x -= areaSize;

            if (dz < -areaHalf) z += areaSize;
            else if (dz > areaHalf) z -= areaSize;

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