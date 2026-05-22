import * as THREE from 'three';
import { WindSystem } from './WindSystem';
import { GEOMETRY, MATERIALS_WEATHER, WeatherUniforms } from '../utils/assets';
import { WeatherType } from '../core/engine/EngineTypes';
import { WEATHER_SYSTEM } from '../content/constants';
import { System, SystemID } from './System';

export class WeatherSystem implements System {
    readonly systemId = SystemID.WEATHER;
    public id = 'weather';
    public enabled = true;
    public persistent = true;
    public isFixedStep?: boolean;

    private weatherMesh: THREE.Mesh | null = null;
    private scene: THREE.Scene;
    public type: WeatherType = WeatherType.NONE;
    private count: number = 0;
    private areaSize: number = 100;
    private wind: WindSystem;
    private camera: THREE.Camera;
    private maxCount: number;

    private timeAccumulator: number = 0;
    private swayMult: number = 0.0;

    private _windOffset: THREE.Vector2 = new THREE.Vector2();
    private _smoothWind: THREE.Vector2 = new THREE.Vector2();

    // Cache compiled uniforms pointer directly for absolute Zero-GC and fast register updates in hot loops
    private _activeUniforms: WeatherUniforms | null = null;

    constructor(scene: THREE.Scene, wind: WindSystem, camera: THREE.Camera, maxCount: number = WEATHER_SYSTEM.MAX_NUM_PARTICLES) {
        this.scene = scene;
        this.wind = wind;
        this.camera = camera;
        this.maxCount = maxCount;
    }

    public sync(type: WeatherType, targetCount: number, areaSize: number = 100): void {
        const actualCount = Math.min(targetCount, this.maxCount);
        const isNewMaterial = this.type !== type;

        this.type = type;
        this.count = actualCount;
        this.areaSize = areaSize;
        this.timeAccumulator = 0;

        this._windOffset.set(0, 0);
        this._smoothWind.copy(this.wind.current);

        switch (type) {
            case WeatherType.RAIN: this.swayMult = 5.0; break;
            case WeatherType.SNOW: this.swayMult = 40.0; break;
            case WeatherType.ASH: this.swayMult = 15.0; break;
            case WeatherType.EMBER: this.swayMult = 25.0; break;
            default: this.swayMult = 40.0; break;
        }

        if (type === WeatherType.NONE || actualCount <= 0) {
            this._activeUniforms = null;
            if (this.weatherMesh) this.weatherMesh.visible = false;
            return;
        }

        const activeMat = MATERIALS_WEATHER.getMaterial(type);
        this._activeUniforms = activeMat.uniforms as WeatherUniforms;

        if (!this.weatherMesh) {
            const geo = new THREE.InstancedBufferGeometry();
            geo.copy(GEOMETRY.weatherParticle as any);
            geo.instanceCount = this.maxCount;

            const posArr = new Float32Array(this.maxCount * 3);
            const velArr = new Float32Array(this.maxCount * 3);

            geo.setAttribute('initialPos', new THREE.InstancedBufferAttribute(posArr, 3));
            geo.setAttribute('velocity', new THREE.InstancedBufferAttribute(velArr, 3));

            this.weatherMesh = new THREE.Mesh(geo, activeMat);
            this.weatherMesh.name = 'WeatherSystem_Particles';
            this.weatherMesh.userData = { isPersistent: true, isEngineStatic: true };
            this.weatherMesh.frustumCulled = false;
            this.weatherMesh.renderOrder = 999;
            this.scene.add(this.weatherMesh);
        } else if (isNewMaterial) {
            this.weatherMesh.material = activeMat;
        }

        this.weatherMesh.visible = true;
        if (!this.weatherMesh.parent) this.scene.add(this.weatherMesh);

        const geo = this.weatherMesh.geometry as THREE.InstancedBufferGeometry;
        geo.instanceCount = actualCount;

        const pos = geo.getAttribute('initialPos').array as Float32Array;
        const vel = geo.getAttribute('velocity').array as Float32Array;
        const areaHalf = areaSize * 0.5;

        // Allocation-free static array initialization paths
        for (let i = 0; i < this.maxCount; i++) {
            const i3 = i * 3;
            if (i >= actualCount) {
                pos[i3 + 1] = -10000; // Efficient out-of-frustum cull flag
                continue;
            }

            pos[i3 + 0] = (Math.random() * areaSize) - areaHalf;
            pos[i3 + 1] = Math.random() * 40;
            pos[i3 + 2] = (Math.random() * areaSize) - areaHalf;

            if (type === WeatherType.SNOW) {
                vel[i3 + 0] = (Math.random() - 0.5) * 1.2; vel[i3 + 1] = -(2.5 + Math.random() * 3.5); vel[i3 + 2] = (Math.random() - 0.5) * 1.2;
            } else if (type === WeatherType.ASH) {
                vel[i3 + 0] = (Math.random() - 0.5) * 1.5; vel[i3 + 1] = -(1.5 + Math.random() * 2.5); vel[i3 + 2] = (Math.random() - 0.5) * 1.5;
            } else if (type === WeatherType.EMBER) {
                vel[i3 + 0] = (Math.random() - 0.5) * 3; vel[i3 + 1] = (1.0 + Math.random() * 4.0); vel[i3 + 2] = (Math.random() - 0.5) * 3;
            } else {
                vel[i3 + 0] = 0; vel[i3 + 1] = -(50.0 + Math.random() * 30.0); vel[i3 + 2] = 0;
            }
        }

        geo.getAttribute('initialPos').needsUpdate = true;
        geo.getAttribute('velocity').needsUpdate = true;
        this._activeUniforms.uAreaSize.value = areaSize;
    }

    public update(ctx: any, delta: number, _simTime: number, _renderTime: number): void {
        if (!this.weatherMesh || !this.weatherMesh.visible || this.count === 0 || !this._activeUniforms) return;

        this.timeAccumulator += delta;
        this._activeUniforms.uTime.value = this.timeAccumulator;

        this._smoothWind.lerp(this.wind.current, 1.0 - Math.exp(-1.5 * delta));
        this._windOffset.x = (this._windOffset.x + this._smoothWind.x * this.swayMult * delta) % this.areaSize;
        this._windOffset.y = (this._windOffset.y + this._smoothWind.y * this.swayMult * delta) % this.areaSize;

        this._activeUniforms.uWindOffset.value.copy(this._windOffset);
        this._activeUniforms.uSmoothWind.value.copy(this._smoothWind);

        const pPos = ctx.playerPos || (ctx.camera && ctx.camera.position);
        if (pPos) this._activeUniforms.uPlayerPos.value.copy(pPos);
    }

    public clear(): void {
        if (this.weatherMesh) {
            this.scene.remove(this.weatherMesh);
            this.weatherMesh.geometry.dispose();
            this.weatherMesh = null;
        }
        this._activeUniforms = null;
    }

    public reAttach(newScene: THREE.Scene): void {
        if (this.weatherMesh) newScene.add(this.weatherMesh);
        this.scene = newScene;
    }

}