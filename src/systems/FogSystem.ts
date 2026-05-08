import * as THREE from 'three';
import { WinterEngine } from '../core/engine/WinterEngine';
import { WindSystem } from './WindSystem';
import { createFogMaterial } from '../utils/assets/materials_fog';
import { System, SystemID } from './System';

const MAX_FOG_PLANES = 25; // Superlågt antal för max prestanda
const FOG_AREA_SIZE = 80.0; // Dimman kretsar i denna radie runt spelaren
const FOG_SCALE = 22.0; // Stora mjuka moln

export class FogSystem implements System {
    readonly systemId = SystemID.FOG;
    public id = 'fog';
    public enabled = true;
    public persistent = true;

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

    public sync(density: number, height?: number, color?: THREE.Color) {
        this.fogCount = Math.floor(Math.min(density, MAX_FOG_PLANES));

        if (color) {
            this.targetColor.copy(color);
            if (this.fogMaterial) {
                this.fogMaterial.uniforms.uColor.value.copy(this.targetColor);
            }
            if (this.scene.fog) {
                this.scene.fog.color.copy(this.targetColor);
            }
        }

        // Grundläggande avståndsdimma (Kostar 0 prestanda)
        if (!this.scene.fog) {
            this.scene.fog = new THREE.FogExp2(this.targetColor, 0.0);
        }
        (this.scene.fog as THREE.FogExp2).density = Math.min(density * 0.0005, 0.03);

        if (this.fogCount <= 0) {
            if (this.fogMesh) this.fogMesh.visible = false;
            return;
        }

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

            // Pre-injicera skalan i matrisen (behöver bara göras en gång)
            const dummy = new THREE.Matrix4();
            for (let i = 0; i < MAX_FOG_PLANES; i++) {
                dummy.makeScale(FOG_SCALE, FOG_SCALE, FOG_SCALE);
                this.fogMesh.setMatrixAt(i, dummy);
            }
        }

        this.fogMesh.visible = true;
        if (!this.fogMesh.parent) this.scene.add(this.fogMesh);
        this.fogMesh.count = this.fogCount;

        // Skala opaciteten inuti shadern beroende på hur "tjock" dimma spelet ber om
        this.fogMaterial!.uniforms.uDensity.value = Math.min(density * 0.03, 0.8);

        // Ge partiklarna initiala positioner
        const areaHalf = FOG_AREA_SIZE * 0.5;
        const centerX = this.camera.position?.x || 0;
        const centerZ = this.camera.position?.z || 0;

        for (let i = 0; i < this.fogCount; i++) {
            const i3 = i * 3;
            this.positions[i3 + 0] = centerX + (Math.random() * FOG_AREA_SIZE) - areaHalf;
            // Horizontal planes stick closer to ground (0-2m)
            this.positions[i3 + 1] = 0.1 + Math.random() * 1.5;
            this.positions[i3 + 2] = centerZ + (Math.random() * FOG_AREA_SIZE) - areaHalf;

            this.velocities[i3 + 0] = (Math.random() - 0.5) * 0.2;
            this.velocities[i3 + 2] = (Math.random() - 0.5) * 0.2;
        }
    }

    public update(ctx: any, delta: number, simTime: number, renderTime: number): void {
        const engine = WinterEngine.getInstance();
        if (!engine?.settings?.volumetricFog) {
            if (this.fogMesh && this.fogMesh.visible) this.fogMesh.visible = false;
            if (this.scene.fog) (this.scene.fog as THREE.FogExp2).density = 0;
            return;
        }

        if (!this.fogMesh || !this.fogMesh.visible || this.fogCount === 0) return;

        // Apply smoothing to the wind force for volumetric fog planes
        // This prevents the "fast reaction" artifacts in the atmosphere.
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

            // Resolve Depth Texture and Resolution from Engine Instance
            if (engine.depthTexture) uniforms.uDepthTexture.value = engine.depthTexture;
            if (engine.renderer) {
                const size = engine.renderer.getSize(new THREE.Vector2());
                uniforms.uResolution.value.copy(size);
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

            // Wrap: Om dimman blåser iväg från kameran, flytta den till andra sidan
            while (x < centerX - areaHalf) x += FOG_AREA_SIZE;
            while (x > centerX + areaHalf) x -= FOG_AREA_SIZE;
            while (z < centerZ - areaHalf) z += FOG_AREA_SIZE;
            while (z > centerZ + areaHalf) z -= FOG_AREA_SIZE;

            pos[i3 + 0] = x;
            pos[i3 + 2] = z;

            // ZERO-GC: Vi uppdaterar BARA translationen i matrisen (index 12, 13, 14)
            // Shadern hanterar skala och rotation automatiskt!
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
