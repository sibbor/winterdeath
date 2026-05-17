import * as THREE from 'three';
import { WinterEngine } from '../core/engine/WinterEngine';
import { WindSystem } from './WindSystem';
import { createFogMaterial } from '../utils/assets/materials_fog';
import { System, SystemID } from './System';

const MAX_FOG_PLANES = 25; // Optimized for performance
const FOG_AREA_SIZE = 80.0; // Radius around player
const FOG_SCALE = 22.0; // Large soft clouds

/**
 * FogSystem: Authoritative Atmospheric Fog Controller.
 * Handles both baseline THREE.FogExp2 and high-end volumetric fog planes.
 * * 100% Zero-GC hot-paths.
 */
export class FogSystem implements System {
    readonly systemId = SystemID.FOG;
    public id = 'fog';
    public enabled = true;
    public persistent = true;

    // --- PERFORMANCE SCRATCHPADS ---
    private static _sizeScratch = new THREE.Vector2();
    private _fogNodes: THREE.Object3D[] = [];
    private scene: THREE.Scene;
    private wind: WindSystem;
    private camera: THREE.Camera;

    public fogMesh: THREE.InstancedMesh | null = null;
    private fogMaterial: THREE.ShaderMaterial | null = null;

    private positions: Float32Array;
    private velocities: Float32Array;

    private targetColor: THREE.Color = new THREE.Color(0.7, 0.75, 0.8);
    private fogCount: number = 0;
    private _smoothWind = new THREE.Vector2(0, 0);

    constructor(scene: THREE.Scene, wind: WindSystem, camera: THREE.Camera) {
        this.scene = scene;
        this.wind = wind;
        this.camera = camera;

        this.positions = new Float32Array(MAX_FOG_PLANES * 3);
        this.velocities = new Float32Array(MAX_FOG_PLANES * 3);
    }

    /**
     * Authoritative sync method for environmental fog.
     * Manages baseline FogExp2 and Volumetric planes.
     */
    public sync(density: number, height?: number, color?: THREE.Color) {
        const engine = WinterEngine.getInstance();

        // 1. BASELINE FOG (FogExp2)
        // VINTERDÖD FIX: Smart Density Normalization.
        // High values (e.g. 200) are treated as "Atmospheric Distance" and scaled down.
        // Low values (< 1.0) are treated as raw coefficients.
        let fallbackDensity = density <= 0 ? 0 : (density < 1.0 ? density : density * 0.0001);

        // Safety cap: Even at 100% density, we must allow light to penetrate slightly.
        // 0.04 is very thick but not pitch black.
        fallbackDensity = Math.min(fallbackDensity, 0.04);

        if (color) {
            this.targetColor.copy(color);
        }

        // Manage lifecycle of the scene.fog object
        if (fallbackDensity > 0) {
            if (this.scene.fog && (this.scene.fog as THREE.FogExp2).isFogExp2) {
                (this.scene.fog as THREE.FogExp2).color.copy(this.targetColor);
                (this.scene.fog as THREE.FogExp2).density = fallbackDensity;
            } else {
                this.scene.fog = new THREE.FogExp2(this.targetColor.getHex(), fallbackDensity);
            }
        } else {
            this.scene.fog = null;
        }

        // 2. VOLUMETRIC FOG (Instanced Planes)
        const wantsVolumetric = engine?.settings?.volumetricFog ?? true;
        this.fogCount = wantsVolumetric ? Math.floor(Math.min(density, MAX_FOG_PLANES)) : 0;

        if (this.fogCount <= 0) {
            if (this.fogMesh) this.fogMesh.visible = false;
            return;
        }

        // Lazy initialization of volumetric assets
        if (!this.fogMesh) {
            this.fogMaterial = createFogMaterial(this.targetColor);
            const planeGeo = new THREE.PlaneGeometry(1, 1);

            this.fogMesh = new THREE.InstancedMesh(planeGeo, this.fogMaterial, MAX_FOG_PLANES);
            this.fogMesh.name = 'FogSystem_Mesh';
            this.fogMesh.userData = { isPersistent: true, isEngineStatic: true };
            this.fogMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            this.fogMesh.frustumCulled = false;
            this.fogMesh.renderOrder = 998;

            this.scene.add(this.fogMesh);

            const dummy = new THREE.Matrix4();
            for (let i = 0; i < MAX_FOG_PLANES; i++) {
                dummy.makeScale(FOG_SCALE, FOG_SCALE, FOG_SCALE);
                this.fogMesh.setMatrixAt(i, dummy);
            }
        }

        this.fogMesh.visible = true;
        if (!this.fogMesh.parent) this.scene.add(this.fogMesh);
        this.fogMesh.count = this.fogCount;

        if (this.fogMaterial) {
            this.fogMaterial.uniforms.uColor.value.copy(this.targetColor);
            this.fogMaterial.uniforms.uDensity.value = Math.min(density * 0.03, 0.8);
        }

        // Initialize particle spatial state
        const areaHalf = FOG_AREA_SIZE * 0.5;
        const centerX = this.camera.position?.x || 0;
        const centerZ = this.camera.position?.z || 0;

        for (let i = 0; i < this.fogCount; i++) {
            const i3 = i * 3;
            this.positions[i3 + 0] = centerX + (Math.random() * FOG_AREA_SIZE) - areaHalf;
            this.positions[i3 + 1] = 0.1 + Math.random() * 1.5;
            this.positions[i3 + 2] = centerZ + (Math.random() * FOG_AREA_SIZE) - areaHalf;

            this.velocities[i3 + 0] = (Math.random() - 0.5) * 0.2;
            this.velocities[i3 + 2] = (Math.random() - 0.5) * 0.2;
        }
    }

    public update(_ctx: any, delta: number, simTime: number, renderTime: number): void {
        const engine = WinterEngine.getInstance();

        // Settings Guard: Check for setting change mid-session
        const wantsVolumetric = engine?.settings?.volumetricFog ?? true;
        if (!wantsVolumetric) {
            if (this.fogMesh && this.fogMesh.visible) this.fogMesh.visible = false;
            return;
        }

        if (!this.fogMesh || !this.fogMesh.visible || this.fogCount === 0) return;

        // Apply smoothed wind force
        const lerpFactor = 1.0 - Math.exp(-0.25 * delta);
        this._smoothWind.lerp(this.wind.current, lerpFactor);

        const wx = this._smoothWind.x * 2.5;
        const wz = this._smoothWind.y * 2.5;

        const centerX = this.camera.position?.x || 0;
        const centerZ = this.camera.position?.z || 0;
        const areaHalf = FOG_AREA_SIZE * 0.5;

        const pos = this.positions;
        const vel = this.velocities;
        const matrixArray = this.fogMesh.instanceMatrix.array;

        if (this.fogMaterial) {
            const uniforms = this.fogMaterial.uniforms;
            uniforms.uTime.value = renderTime * 0.001;
            uniforms.uWind.value.set(this.wind.current.x, this.wind.current.y);

            if (engine.depthTexture) uniforms.uDepthTexture.value = engine.depthTexture;
            if (engine.renderer) {
                engine.renderer.getSize(FogSystem._sizeScratch);
                uniforms.uResolution.value.copy(FogSystem._sizeScratch);
            }
            if (this.camera instanceof THREE.PerspectiveCamera) {
                uniforms.uCameraNear.value = this.camera.near;
                uniforms.uCameraFar.value = this.camera.far;
            }
        }

        for (let i = 0; i < this.fogCount; i++) {
            const i3 = i * 3;
            let x = pos[i3 + 0] + (vel[i3 + 0] + wx) * delta;
            let y = pos[i3 + 1];
            let z = pos[i3 + 2] + (vel[i3 + 2] + wz) * delta;

            // --- ZERO-GC O(1) ALGEBRAIC WRAPPING (Bypasses while-loop spikes) ---
            let dx = x - centerX;
            x = centerX + (((dx + areaHalf) % FOG_AREA_SIZE + FOG_AREA_SIZE) % FOG_AREA_SIZE) - areaHalf;

            let dz = z - centerZ;
            z = centerZ + (((dz + areaHalf) % FOG_AREA_SIZE + FOG_AREA_SIZE) % FOG_AREA_SIZE) - areaHalf;

            pos[i3 + 0] = x;
            pos[i3 + 2] = z;

            const matIdx = i * 16;
            matrixArray[matIdx + 12] = x;
            matrixArray[matIdx + 13] = y;
            matrixArray[matIdx + 14] = z;
        }

        this.fogMesh.instanceMatrix.needsUpdate = true;
    }

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
        if (this.scene.fog) this.scene.fog = null;
    }

    public reAttach(newScene: THREE.Scene) {
        if (this.fogMesh) newScene.add(this.fogMesh);
        if (this.scene.fog) newScene.fog = this.scene.fog;
        this.scene = newScene;
    }
}