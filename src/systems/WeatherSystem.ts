import * as THREE from 'three';
import { WindSystem } from './WindSystem';
import { GEOMETRY, MATERIALS } from '../utils/assets';
import { WeatherType } from '../core/engine/EngineTypes';
import { WEATHER_SYSTEM } from '../content/constants';
import { System } from './System';

/**
 * WeatherSystem
 * Handles millions of particles with zero GC and high-performance buffer manipulation.
 */
export class WeatherSystem implements System {
    public id = 'weather';
    public enabled = true;
    public persistent = true;
    public isFixedStep?: boolean;

    private instancedMesh: THREE.InstancedMesh | null = null;

    // Buffers for raw physics data
    private positions: Float32Array;
    private velocities: Float32Array;

    private scene: THREE.Scene;
    public type: WeatherType = WeatherType.NONE;
    private count: number = 0;
    private areaSize: number = 100;
    private wind: WindSystem;
    private camera: THREE.Camera;
    private maxCount: number;

    // Cached physics multiplier to avoid string checks in hot loop
    private swayMult: number = 0.0;

    // VINTERDÖD FIX: Ökade LUT (Look-Up Table) från 512 till 4096 för massivt ökad variation
    private _randLUT: Float32Array = new Float32Array(4096);
    private _randIdx: number = 0;

    constructor(scene: THREE.Scene, wind: WindSystem, camera: THREE.Camera, maxCount: number = WEATHER_SYSTEM.MAX_NUM_PARTICLES) {
        this.scene = scene;
        this.wind = wind;
        this.camera = camera;

        this.maxCount = maxCount;

        // Pre-allocate flat memory buffers
        this.positions = new Float32Array(this.maxCount * 3);
        this.velocities = new Float32Array(this.maxCount * 3);

        for (let i = 0; i < this._randLUT.length; i++) {
            this._randLUT[i] = Math.random();
        }
    }

    public sync(type: WeatherType, targetCount: number, areaSize: number = 100) {
        const actualCount = Math.min(targetCount, this.maxCount);
        const isNewMaterial = this.type !== type;

        this.type = type;
        this.count = actualCount;
        this.areaSize = areaSize;

        if (type === WeatherType.NONE || actualCount <= 0) {
            if (this.instancedMesh) this.instancedMesh.visible = false;
            return;
        }

        let selectedMaterial: THREE.Material;
        if (type === WeatherType.RAIN) {
            selectedMaterial = MATERIALS.particle_rain;
            this.swayMult = 5.0; // Heavy, low sway
        } else if (type === WeatherType.ASH) {
            selectedMaterial = MATERIALS.particle_ash;
            this.swayMult = 15.0; // Light, drifting
        } else if (type === WeatherType.EMBER) {
            selectedMaterial = MATERIALS.particle_ember;
            this.swayMult = 25.0; // Very light, erratic
        } else {
            selectedMaterial = MATERIALS.particle_snow;
            this.swayMult = 40.0; // Soft sway
        }

        if (!this.instancedMesh) {
            this.instancedMesh = new THREE.InstancedMesh(GEOMETRY.weatherParticle, selectedMaterial, this.maxCount);
            this.instancedMesh.name = 'WeatherSystem_Particles';
            this.instancedMesh.userData = { isPersistent: true, isEngineStatic: true };
            this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            this.instancedMesh.frustumCulled = false;
            this.instancedMesh.renderOrder = 999;
            this.scene.add(this.instancedMesh);
        } else if (isNewMaterial) {
            this.instancedMesh.material = selectedMaterial;
        }

        this.instancedMesh.visible = true;
        if (!this.instancedMesh.parent) this.scene.add(this.instancedMesh);

        this.instancedMesh.count = actualCount;

        const pos = this.positions;
        const vel = this.velocities;
        const matrixArray = this.instancedMesh.instanceMatrix.array;

        const sX = type === WeatherType.RAIN ? 0.4 : 1.0;
        const sY = type === WeatherType.RAIN ? 4.0 : 1.0;
        const sZ = 1.0;
        const areaHalf = areaSize * 0.5;

        const centerX = this.camera.position?.x || 0;
        const centerZ = this.camera.position?.z || 0;

        for (let i = 0; i < this.maxCount; i++) {
            const i3 = i * 3;
            const matIdx = i * 16;

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

            if (type === WeatherType.SNOW) {
                vel[i3 + 0] = (Math.random() - 0.5) * 1.5;
                vel[i3 + 1] = -(8 + Math.random() * 7);
                vel[i3 + 2] = (Math.random() - 0.5) * 1.5;
            } else if (type === WeatherType.ASH) {
                vel[i3 + 0] = (Math.random() - 0.5) * 2;
                vel[i3 + 1] = -(2 + Math.random() * 3);
                vel[i3 + 2] = (Math.random() - 0.5) * 2;
            } else if (type === WeatherType.EMBER) {
                vel[i3 + 0] = (Math.random() - 0.5) * 3;
                vel[i3 + 1] = (1 + Math.random() * 4); // Rises UP
                vel[i3 + 2] = (Math.random() - 0.5) * 3;
            } else { // rain
                vel[i3 + 0] = 0;
                vel[i3 + 1] = -(50 + Math.random() * 30);
                vel[i3 + 2] = 0;
            }

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

        for (let i = 0; i < this._randLUT.length; i++) this._randLUT[i] = Math.random();
        this._randIdx = 0;
    }

    public update(ctx: any, delta: number, simTime: number, renderTime: number) {
        if (!this.instancedMesh || !this.instancedMesh.visible || this.count === 0) return;

        const windVec = this.wind.current;
        const wx = windVec.x * this.swayMult;
        const wy = windVec.y * this.swayMult;

        const count = this.count;
        const pos = this.positions;
        const vel = this.velocities;
        const areaSize = this.areaSize;
        const areaHalf = areaSize * 0.5;

        const isRain = this.type === WeatherType.RAIN;
        const sY = isRain ? 4.0 : 1.0;

        const centerX = this.camera.position?.x || 0;
        const centerZ = this.camera.position?.z || 0;

        const yTop = 40.0;
        const matrixArray = this.instancedMesh.instanceMatrix.array;

        for (let i = 0; i < count; i++) {
            const i3 = i * 3;

            // Physical integration
            const vx = vel[i3 + 0] + wx;
            const vy = vel[i3 + 1];
            const vz = vel[i3 + 2] + wy;

            let x = pos[i3 + 0] + vx * delta;
            let y = pos[i3 + 1] + vy * delta;
            let z = pos[i3 + 2] + vz * delta;

            let needsReset = false;

            // 1. Wrap Vertical
            if (y < 0.0) {
                y = yTop;
                needsReset = true;
            } else if (y > yTop) {
                y = 0.0;
                needsReset = true;
            }

            // 2. Wrap Horizontal
            let wrappedX = false;
            let wrappedZ = false;
            while (x < centerX - areaHalf) { x += areaSize; wrappedX = true; }
            while (x > centerX + areaHalf) { x -= areaSize; wrappedX = true; }
            while (z < centerZ - areaHalf) { z += areaSize; wrappedZ = true; }
            while (z > centerZ + areaHalf) { z -= areaSize; wrappedZ = true; }

            if (wrappedX || wrappedZ) {
                // Randomisera höjden så mönstret bryts när spelaren rör sig!
                y = this._randLUT[this._randIdx++ & 4095] * yTop;
                needsReset = true;
            }

            // 3. VINTERDÖD FIX: Total Randomization
            // When a particle is reset, give it a NEW position AND a NEW velocity.
            // This kills the repetitive "rain clusters".
            if (needsReset) {
                const r0 = this._randLUT[this._randIdx++ & 4095];
                const r1 = this._randLUT[this._randIdx++ & 4095];
                const r2 = this._randLUT[this._randIdx++ & 4095];

                // If it hit the ceiling/floor, randomize X/Z
                if (!wrappedX && !wrappedZ) {
                    x = centerX + (r0 * areaSize - areaHalf);
                    z = centerZ + (r1 * areaSize - areaHalf);
                }

                // Generate a completely new velocity
                if (isRain) {
                    vel[i3 + 1] = -(50 + r2 * 30);
                } else if (this.type === WeatherType.SNOW) {
                    vel[i3 + 1] = -(8 + r2 * 7);
                    vel[i3 + 0] = (this._randLUT[this._randIdx++ & 4095] - 0.5) * 1.5;
                    vel[i3 + 2] = (this._randLUT[this._randIdx++ & 4095] - 0.5) * 1.5;
                } else if (this.type === WeatherType.ASH) {
                    vel[i3 + 1] = -(2 + r2 * 3);
                    vel[i3 + 0] = (this._randLUT[this._randIdx++ & 4095] - 0.5) * 2;
                    vel[i3 + 2] = (this._randLUT[this._randIdx++ & 4095] - 0.5) * 2;
                } else if (this.type === WeatherType.EMBER) {
                    vel[i3 + 1] = (1 + r2 * 4);
                    vel[i3 + 0] = (this._randLUT[this._randIdx++ & 4095] - 0.5) * 3;
                    vel[i3 + 2] = (this._randLUT[this._randIdx++ & 4095] - 0.5) * 3;
                }
            }

            pos[i3 + 0] = x;
            pos[i3 + 1] = y;
            pos[i3 + 2] = z;

            const matIdx = i * 16;

            // 4. Physical Shear (tilt the rain)
            if (isRain) {
                // By mapping the geometry Y-axis (col 1) to the velocity vector,
                // the particle tilts exactly in the direction the wind and gravity are pulling it.
                const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
                // We invert the vectors so +Y points up towards the wind source, preventing skewed normals
                matrixArray[matIdx + 4] = -(vx / speed) * sY;
                matrixArray[matIdx + 5] = -(vy / speed) * sY;
                matrixArray[matIdx + 6] = -(vz / speed) * sY;
            }

            // Update the position
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