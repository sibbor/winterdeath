import * as THREE from 'three';
import { WindSystem } from './WindSystem';

const MAX_FOG_PLANES = 40; // Drastically reduced for Fill Rate performance
const FOG_AREA_SIZE = 120.0;
const FOG_SCALE = 45.0; // Larger planes to compensate for fewer instances
const DEFAULT_FOG_HEIGHT = 15.0;

/**
 * FogSystem
 * Handles localized, drifting volumetric fog planes.
 * Matches WeatherSystem's standalone architecture with zero GC and high-performance buffer manipulation.
 */
export class FogSystem {
    private scene: THREE.Scene;
    private wind: WindSystem;
    private camera: THREE.Camera;

    private fogMesh: THREE.InstancedMesh | null = null;
    private fogMaterial: THREE.ShaderMaterial | null = null;

    // Zero-GC Buffers for raw physics data
    private positions: Float32Array;
    private velocities: Float32Array;

    private fogCount: number = 0;
    private targetColor: THREE.Color = new THREE.Color(0.7, 0.75, 0.8);
    private targetHeight: number = DEFAULT_FOG_HEIGHT; // Default height ceiling

    constructor(scene: THREE.Scene, wind: WindSystem, camera: THREE.Camera) {
        this.scene = scene;
        this.wind = wind;
        this.camera = camera;

        // Pre-allocate flat memory buffers (Zero-GC)
        this.positions = new Float32Array(MAX_FOG_PLANES * 3);
        this.velocities = new Float32Array(MAX_FOG_PLANES * 3);
    }

    /**
     * Synchronizes fog state. Initializes the mesh lazily and updates density/color/height.
     */
    public sync(density: number, height?: number, color?: THREE.Color) {
        this.fogCount = Math.min(density, MAX_FOG_PLANES);

        if (height !== undefined) {
            this.targetHeight = height;
        }

        if (color) {
            this.targetColor.copy(color);
            if (this.fogMaterial) {
                this.fogMaterial.uniforms.uColor.value.copy(this.targetColor);
            }
        }

        if (this.fogCount <= 0) {
            if (this.fogMesh) this.fogMesh.visible = false;
            return;
        }

        // Setup InstancedMesh lazily
        if (!this.fogMesh) {
            // Procedural Volumetric Soft Fog Shader
            this.fogMaterial = new THREE.ShaderMaterial({
                uniforms: {
                    uColor: { value: this.targetColor }
                },
                vertexShader: `
                    varying vec2 vUv;
                    void main() {
                        vUv = uv;
                        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
                    }
                `,
                fragmentShader: `
                    uniform vec3 uColor;
                    varying vec2 vUv;
                    void main() {
                        // Distance from center for soft sphere
                        float dist = length(vUv - 0.5) * 2.0;
                        
                        // Very soft fade out to prevent hard clipping with the ground
                        float alpha = smoothstep(1.0, 0.2, dist) * 0.12; 
                        
                        if (alpha <= 0.01) discard; // Save fill rate
                        gl_FragColor = vec4(uColor, alpha);
                    }
                `,
                transparent: true,
                depthWrite: false, // Essential for transparency sorting
                blending: THREE.NormalBlending
            });

            const planeGeo = new THREE.PlaneGeometry(1, 1);
            this.fogMesh = new THREE.InstancedMesh(planeGeo, this.fogMaterial, MAX_FOG_PLANES);

            // Protect from the WebGL Black Hole during clean-up
            this.fogMesh.name = 'FogSystem_Mesh';
            this.fogMesh.userData = { isPersistent: true, isEngineStatic: true };
            this.fogMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

            // Disable frustum culling since we wrap them mathematically around the camera
            this.fogMesh.frustumCulled = false;
            this.fogMesh.renderOrder = 998; // Render just behind particles

            this.scene.add(this.fogMesh);
        }

        this.fogMesh.visible = true;
        if (!this.fogMesh.parent) this.scene.add(this.fogMesh);
        this.fogMesh.count = this.fogCount;

        // Distribute initial positions
        const areaHalf = FOG_AREA_SIZE * 0.5;
        const centerX = this.camera.position?.x || 0;
        const centerZ = this.camera.position?.z || 0;

        for (let i = 0; i < this.fogCount; i++) {
            const i3 = i * 3;

            this.positions[i3 + 0] = centerX + (Math.random() * FOG_AREA_SIZE) - areaHalf;

            // Distribute vertically based on the new targetHeight parameter
            this.positions[i3 + 1] = -2.0 + Math.random() * (this.targetHeight + 2.0);

            this.positions[i3 + 2] = centerZ + (Math.random() * FOG_AREA_SIZE) - areaHalf;

            // Individual slow drift velocities
            this.velocities[i3 + 0] = (Math.random() - 0.5) * 0.8;
            this.velocities[i3 + 1] = (Math.random() - 0.5) * 0.1;
            this.velocities[i3 + 2] = (Math.random() - 0.5) * 0.8;
        }
    }

    /**
     * Updates fog planes based on wind and handles zero-math billboarding.
     */
    public update(dt: number, time: number) {
        if (!this.fogMesh || !this.fogMesh.visible || this.fogCount === 0) return;

        // Direct wind access for zero-overhead integration
        const windVec = this.wind.current;
        const wx = windVec.x * 2.0; // Fog drifts with wind
        const wy = windVec.y * 2.0;

        const count = this.fogCount;
        const pos = this.positions;
        const vel = this.velocities;
        const areaSize = FOG_AREA_SIZE;
        const areaHalf = areaSize * 0.5;

        // Avoid NaN crashes if camera is unset
        const centerX = this.camera.position?.x || 0;
        const centerZ = this.camera.position?.z || 0;

        // Utilize the dynamic targetHeight
        const yTop = this.targetHeight;

        const matrixArray = this.fogMesh.instanceMatrix.array;
        const camWorld = this.camera.matrixWorld.elements;

        // Zero-math billboarding components extracted from camera (Scale baked in)
        const cxX = camWorld[0] * FOG_SCALE, cxY = camWorld[1] * FOG_SCALE, cxZ = camWorld[2] * FOG_SCALE;
        const cyX = camWorld[4] * FOG_SCALE, cyY = camWorld[5] * FOG_SCALE, cyZ = camWorld[6] * FOG_SCALE;
        const czX = camWorld[8] * FOG_SCALE, czY = camWorld[9] * FOG_SCALE, czZ = camWorld[10] * FOG_SCALE;

        for (let i = 0; i < count; i++) {
            const i3 = i * 3;

            let x = pos[i3 + 0] + (vel[i3 + 0] + wx) * dt;
            let y = pos[i3 + 1] + vel[i3 + 1] * dt;
            let z = pos[i3 + 2] + (vel[i3 + 2] + wy) * dt;

            // Gentle vertical bouncing/wrapping using dynamic height
            if (y < -2.0) y = yTop;
            else if (y > yTop) y = -2.0;

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

            const matIdx = i * 16;

            // Apply camera-facing orientation (Zero-GC billboarding)
            matrixArray[matIdx + 0] = cxX; matrixArray[matIdx + 1] = cxY; matrixArray[matIdx + 2] = cxZ; matrixArray[matIdx + 3] = 0;
            matrixArray[matIdx + 4] = cyX; matrixArray[matIdx + 5] = cyY; matrixArray[matIdx + 6] = cyZ; matrixArray[matIdx + 7] = 0;
            matrixArray[matIdx + 8] = czX; matrixArray[matIdx + 9] = czY; matrixArray[matIdx + 10] = czZ; matrixArray[matIdx + 11] = 0;

            // Set translation
            matrixArray[matIdx + 12] = x;
            matrixArray[matIdx + 13] = y;
            matrixArray[matIdx + 14] = z;
            matrixArray[matIdx + 15] = 1;
        }

        this.fogMesh.instanceMatrix.needsUpdate = true;
    }

    /**
     * Completely removes and disposes of the fog system from the GPU.
     */
    public clear() {
        if (this.fogMesh) {
            this.scene.remove(this.fogMesh);
            this.fogMesh.dispose();
            this.fogMesh = null;
        }
        if (this.fogMaterial) {
            this.fogMaterial.dispose();
            this.fogMaterial = null;
        }
    }

    /**
     * Re-attaches the fog mesh to a new scene (e.g. after Sector transition).
     */
    public reAttach(newScene: THREE.Scene) {
        if (this.fogMesh) {
            newScene.add(this.fogMesh);
        }
        this.scene = newScene;
    }
}