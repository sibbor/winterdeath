import * as THREE from 'three';
import { WindSystem } from './WindSystem';
import { GEOMETRY } from '../../utils/assets';
import { WeatherType } from '../../types';

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
        const needsResync = this.type !== type || this.count !== count || this.areaSize !== areaSize;

        // [VINTERDÖD] If we already have the mesh and types/count match, just ensure it's in the scene and visible.
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
            const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false });
            this.instancedMesh = new THREE.InstancedMesh(GEOMETRY.weatherParticle, mat, this.maxCount);
            this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            this.instancedMesh.frustumCulled = false;
            this.instancedMesh.renderOrder = 999;
            this.scene.add(this.instancedMesh);
        } else {
            const mat = this.instancedMesh.material as THREE.MeshBasicMaterial;
            mat.color.setHex(color); // [VINTERDÖD] Undvik extra allokering genom setHex
            mat.opacity = opacity;
            this.instancedMesh.visible = true;

            // [VINTERDÖD] Ensure mesh is in the scene graph (in case scene.clear() was called)
            if (!this.instancedMesh.parent) {
                this.scene.add(this.instancedMesh);
            }

            // Re-apply material safety
            (this.instancedMesh.material as THREE.MeshBasicMaterial).depthWrite = false;
        }

        this.instancedMesh.count = actualCount;

        // [VINTERDÖD] Cacha variabler innan loopen för maximerad L1-cache access
        const pos = this.positions;
        const vel = this.velocities;
        const matrixArray = this.instancedMesh.instanceMatrix.array;

        // Fastställ statisk skala per vädertyp
        const sX = type === 'rain' ? 0.5 : 1.0;
        const sY = type === 'rain' ? 4.0 : 1.0;
        const sZ = 1.0;

        // Initialize particle buffers
        for (let i = 0; i < actualCount; i++) {
            const i3 = i * 3;

            // X, Y, Z positions
            const x = (Math.random() - 0.5) * areaSize;
            const y = Math.random() * 40;
            const z = (Math.random() - 0.5) * areaSize;

            pos[i3 + 0] = x;
            pos[i3 + 1] = y;
            pos[i3 + 2] = z;

            // X, Y, Z velocities
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
                vel[i3 + 1] = (1 + Math.random() * 4);
                vel[i3 + 2] = (Math.random() - 0.5) * 3;
            } else { // rain
                vel[i3 + 0] = 0;
                vel[i3 + 1] = -(50 + Math.random() * 30);
                vel[i3 + 2] = 0;
            }

            // [VINTERDÖD] Direkt Matrix Array Mutation. Inget Object3D overhead. Inga .setMatrixAt-anrop.
            const matIdx = i * 16;

            // Column 1
            matrixArray[matIdx + 0] = sX;
            matrixArray[matIdx + 1] = 0;
            matrixArray[matIdx + 2] = 0;
            matrixArray[matIdx + 3] = 0;

            // Column 2
            matrixArray[matIdx + 4] = 0;
            matrixArray[matIdx + 5] = sY;
            matrixArray[matIdx + 6] = 0;
            matrixArray[matIdx + 7] = 0;

            // Column 3
            matrixArray[matIdx + 8] = 0;
            matrixArray[matIdx + 9] = 0;
            matrixArray[matIdx + 10] = sZ;
            matrixArray[matIdx + 11] = 0;

            // Column 4 (Translation)
            matrixArray[matIdx + 12] = x;
            matrixArray[matIdx + 13] = y;
            matrixArray[matIdx + 14] = z;
            matrixArray[matIdx + 15] = 1;
        }
        this.instancedMesh.instanceMatrix.needsUpdate = true;
    }

    public update(dt: number, time: number) {
        if (!this.instancedMesh || !this.instancedMesh.visible) return;

        const windVec = this.wind.current;
        // TODO: add support for ash and ember as well
        const windSwayMult = this.type === 'snow' ? 20.0 : 10.0;

        const wx = windVec.x * windSwayMult;
        const wy = windVec.y * windSwayMult;

        const count = this.count;
        const pos = this.positions;
        const vel = this.velocities;
        const areaSize = this.areaSize;
        const matrixArray = this.instancedMesh.instanceMatrix.array;

        for (let i = 0; i < count; i++) {
            const i3 = i * 3;

            // Apply movement logic directly to buffer values
            let x = pos[i3 + 0] + (vel[i3 + 0] + wx) * dt;
            let y = pos[i3 + 1] + vel[i3 + 1] * dt;
            let z = pos[i3 + 2] + (vel[i3 + 2] + wy) * dt;

            // Seamless Reset (Teleport back to top)
            if (y < 0) {
                y = 40;
                x = (Math.random() - 0.5) * areaSize;
                z = (Math.random() - 0.5) * areaSize;
            }

            pos[i3 + 0] = x;
            pos[i3 + 1] = y;
            pos[i3 + 2] = z;

            // [VINTERDÖD] Uppdatera endast x, y, z i 4x4-matrisen (Index 12, 13, 14)
            // Detta skalar bort all beräkningsoverhead för rot/skala.
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
            if (this.instancedMesh.material) {
                (this.instancedMesh.material as THREE.Material).dispose();
            }
            this.instancedMesh.dispose();
            this.instancedMesh = null;
        }
    }

    /**
     * [VINTERDÖD] Moves the weather mesh to a new scene.
     * Crucial for the Engine-owned model.
     */
    public reAttach(newScene: THREE.Scene) {
        if (this.instancedMesh) {
            newScene.add(this.instancedMesh);
        }
        this.scene = newScene;
    }
}