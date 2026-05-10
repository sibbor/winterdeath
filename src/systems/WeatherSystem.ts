import * as THREE from 'three';
import { WindSystem } from './WindSystem';
import { GEOMETRY, MATERIALS } from '../utils/assets';
import { WeatherType } from '../core/engine/EngineTypes';
import { WEATHER_SYSTEM } from '../content/constants';
import { System, SystemID } from './System';

/**
 * WeatherSystem
 * Handles millions of particles with zero GC and high-performance buffer manipulation.
 */
export class WeatherSystem implements System {
    readonly systemId = SystemID.WEATHER;
    public id = 'weather';
    public enabled = true;
    public persistent = true;
    public isFixedStep?: boolean;

    private instancedMesh: THREE.InstancedMesh | null = null;

    private scene: THREE.Scene;
    public type: WeatherType = WeatherType.NONE;
    private count: number = 0;
    private areaSize: number = 100;
    private wind: WindSystem;
    private camera: THREE.Camera;
    private maxCount: number;

    // Cached physics multiplier for shader uniforms
    private swayMult: number = 0.0;

    // --- WEATHER INERTIA SCRATCHPADS (Zero-GC) ---
    private _windOffset = new THREE.Vector2(0, 0);
    private _smoothWind = new THREE.Vector2(0, 0);

    // Persistent material registry to avoid runtime compilation/disposal churn
    private materialRegistry: Map<WeatherType, THREE.ShaderMaterial> = new Map();

    constructor(scene: THREE.Scene, wind: WindSystem, camera: THREE.Camera, maxCount: number = WEATHER_SYSTEM.MAX_NUM_PARTICLES) {
        this.scene = scene;
        this.wind = wind;
        this.camera = camera;
        this.maxCount = maxCount;

        // Precompile all necessary weather variations immediately
        this.precompileMaterials();
    }

    private precompileMaterials() {
        const activeTypes = [WeatherType.RAIN, WeatherType.SNOW, WeatherType.ASH, WeatherType.EMBER];
        for (let i = 0; i < activeTypes.length; i++) {
            const t = activeTypes[i];
            this.materialRegistry.set(t, this.createWeatherMaterial(t));
        }
    }

    public sync(type: WeatherType, targetCount: number, areaSize: number = 100) {
        const actualCount = Math.min(targetCount, this.maxCount);
        const isNewMaterial = this.type !== type;

        this.type = type;
        this.count = actualCount;
        this.areaSize = areaSize;

        // Reset wind accumulation for clean transitions
        this._windOffset.set(0, 0);
        this._smoothWind.copy(this.wind.current);

        // Set physics multipliers for the shader
        switch (type) {
            case WeatherType.RAIN: this.swayMult = 5.0; break;
            case WeatherType.SNOW: this.swayMult = 40.0; break;
            case WeatherType.ASH: this.swayMult = 15.0; break;
            case WeatherType.EMBER: this.swayMult = 25.0; break;
            default: this.swayMult = 40.0; break;
        }

        if (type === WeatherType.NONE || actualCount <= 0) {
            if (this.instancedMesh) this.instancedMesh.visible = false;
            return;
        }

        if (!this.instancedMesh) {
            // Clone geometry once to add custom attributes without affecting shared assets.
            // This happens only once during system initialization or first weather sync.
            const geo = GEOMETRY.weatherParticle.clone();

            const posArr = new Float32Array(this.maxCount * 3);
            const velArr = new Float32Array(this.maxCount * 3);

            geo.setAttribute('initialPos', new THREE.InstancedBufferAttribute(posArr, 3));
            geo.setAttribute('velocity', new THREE.InstancedBufferAttribute(velArr, 3));

            let cachedMaterial = this.materialRegistry.get(type);
            if (!cachedMaterial) {
                cachedMaterial = this.createWeatherMaterial(type);
                this.materialRegistry.set(type, cachedMaterial);
            }

            this.instancedMesh = new THREE.InstancedMesh(geo, cachedMaterial, this.maxCount);
            this.instancedMesh.name = 'WeatherSystem_Particles';
            this.instancedMesh.userData = { isPersistent: true, isEngineStatic: true };
            this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            this.instancedMesh.frustumCulled = false;
            this.instancedMesh.renderOrder = 999;
            this.scene.add(this.instancedMesh);
        } else if (isNewMaterial) {
            // Re-use precompiled material directly from the map instead of disposing
            let cachedMaterial = this.materialRegistry.get(type);
            if (!cachedMaterial) {
                cachedMaterial = this.createWeatherMaterial(type);
                this.materialRegistry.set(type, cachedMaterial);
            }
            this.instancedMesh.material = cachedMaterial;
        }

        this.instancedMesh.visible = true;
        if (!this.instancedMesh.parent) this.scene.add(this.instancedMesh);

        this.instancedMesh.count = actualCount;

        const initialPosAttr = this.instancedMesh.geometry.getAttribute('initialPos') as THREE.InstancedBufferAttribute;
        const velocityAttr = this.instancedMesh.geometry.getAttribute('velocity') as THREE.InstancedBufferAttribute;
        const pos = initialPosAttr.array as Float32Array;
        const vel = velocityAttr.array as Float32Array;

        const areaHalf = areaSize * 0.5;

        // Seed particles once during sync
        for (let i = 0; i < this.maxCount; i++) {
            const i3 = i * 3;

            if (i >= actualCount) {
                pos[i3 + 1] = -1000; // Hide unused
                continue;
            }

            // Initial random distribution (Seed-space, shader handles camera offset)
            pos[i3 + 0] = (Math.random() * areaSize) - areaHalf;
            pos[i3 + 1] = Math.random() * 40;
            pos[i3 + 2] = (Math.random() * areaSize) - areaHalf;

            switch (type) {
                case WeatherType.SNOW:
                    vel[i3 + 0] = (Math.random() - 0.5) * 1.2;
                    vel[i3 + 1] = -(2.5 + Math.random() * 3.5);
                    vel[i3 + 2] = (Math.random() - 0.5) * 1.2;
                    break;
                case WeatherType.ASH:
                    vel[i3 + 0] = (Math.random() - 0.5) * 1.5;
                    vel[i3 + 1] = -(1.5 + Math.random() * 2.5);
                    vel[i3 + 2] = (Math.random() - 0.5) * 1.5;
                    break;
                case WeatherType.EMBER:
                    vel[i3 + 0] = (Math.random() - 0.5) * 3;
                    vel[i3 + 1] = (1 + Math.random() * 4); // Rises UP
                    vel[i3 + 2] = (Math.random() - 0.5) * 3;
                    break;
                case WeatherType.RAIN:
                default:
                    vel[i3 + 0] = 0;
                    vel[i3 + 1] = -(50 + Math.random() * 30);
                    vel[i3 + 2] = 0;
                    break;
            }
        }

        initialPosAttr.needsUpdate = true;
        velocityAttr.needsUpdate = true;

        // Reset the instanceMatrix to Identity since we handle positioning in shader
        this.instancedMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
        const identity = new THREE.Matrix4();
        for (let i = 0; i < this.maxCount; i++) this.instancedMesh.setMatrixAt(i, identity);
        this.instancedMesh.instanceMatrix.needsUpdate = true;

        // Synchronize area size uniform safely
        const mat = this.instancedMesh.material as THREE.ShaderMaterial;
        if (mat && mat.uniforms && mat.uniforms.uAreaSize) {
            mat.uniforms.uAreaSize.value = areaSize;
        }
    }

    public update(ctx: any, delta: number, simTime: number, renderTime: number) {
        if (!this.instancedMesh || !this.instancedMesh.visible || this.count === 0) return;

        const mat = this.instancedMesh.material as THREE.ShaderMaterial;
        if (!mat || !mat.uniforms) return;

        // --- ZERO-GC UNIFORM UPDATE ---
        mat.uniforms.uTime.value = renderTime * 0.001;

        // Apply Weather Inertia (Smoothing) - Increased speed for better responsiveness
        const lerpFactor = 1.0 - Math.exp(-1.5 * delta);
        this._smoothWind.lerp(this.wind.current, lerpFactor);

        // Integrate wind into offset (Movement over time)
        this._windOffset.x += this._smoothWind.x * this.swayMult * delta;
        this._windOffset.y += this._smoothWind.y * this.swayMult * delta;

        mat.uniforms.uWindOffset.value.copy(this._windOffset);
        mat.uniforms.uSmoothWind.value.copy(this._smoothWind);

        if (this.camera.position) {
            mat.uniforms.uPlayerPos.value.copy(this.camera.position);
        }
    }

    private createWeatherMaterial(type: WeatherType): THREE.ShaderMaterial {
        const isRain = type === WeatherType.RAIN;
        const color = isRain ? 0xaaaaff : (type === WeatherType.ASH ? 0x333333 : (type === WeatherType.EMBER ? 0xff4400 : 0xffffff));
        const opacity = isRain ? 0.6 : 0.8;

        return new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uWindOffset: { value: new THREE.Vector2() },
                uSmoothWind: { value: new THREE.Vector2() },
                uPlayerPos: { value: new THREE.Vector3() },
                uAreaSize: { value: this.areaSize },
                uYTop: { value: 40.0 },
                uColor: { value: new THREE.Color(color) },
                uOpacity: { value: opacity },
                uIsRain: { value: isRain ? 1.0 : 0.0 }
            },
            vertexShader: `
                uniform float uTime;
                uniform vec2 uWindOffset;
                uniform vec2 uSmoothWind;
                uniform vec3 uPlayerPos;
                uniform float uAreaSize;
                uniform float uYTop;
                uniform float uIsRain;

                attribute vec3 initialPos;
                attribute vec3 velocity;

                void main() {
                    float areaHalf = uAreaSize * 0.5;
                    
                    // 1. Calculate world-space position with wrap-around
                    vec3 pos = initialPos;
                    
                    // Apply velocity and Integrated Wind Offset
                    pos.x += velocity.x * uTime + uWindOffset.x;
                    pos.y += velocity.y * uTime;
                    pos.z += velocity.z * uTime + uWindOffset.y;
                    
                    // 2. Wrap Y (Vertical Loop)
                    pos.y = mod(pos.y, uYTop);
                    
                    // 3. Wrap X and Z around the player camera
                    pos.x = uPlayerPos.x + mod(pos.x - uPlayerPos.x + areaHalf, uAreaSize) - areaHalf;
                    pos.z = uPlayerPos.z + mod(pos.z - uPlayerPos.z + areaHalf, uAreaSize) - areaHalf;
                    
                    // 4. Handle Rain Tilting (Physical Shear) using Smooth Wind
                    vec3 localPos = position;
                    if (uIsRain > 0.5) {
                        // For rain, we use a consistent sway multiplier to determine the tilt vector
                        vec3 totalVel = vec3(velocity.x + uSmoothWind.x * 5.0, velocity.y, velocity.z + uSmoothWind.y * 5.0);
                        float speed = length(totalVel);
                        vec3 dir = totalVel / speed;
                        
                        if (localPos.y > 0.0) {
                            localPos.x += dir.x * localPos.y * 2.0;
                            localPos.z += dir.z * localPos.y * 2.0;
                        }
                    }

                    vec4 worldPos = vec4(pos + localPos, 1.0);
                    gl_Position = projectionMatrix * viewMatrix * worldPos;
                }
            `,
            fragmentShader: `
                uniform vec3 uColor;
                uniform float uOpacity;
                void main() {
                    gl_FragColor = vec4(uColor, uOpacity);
                }
            `,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide
        });
    }

    public clear() {
        if (this.instancedMesh) {
            this.scene.remove(this.instancedMesh);
            // Retain cached registry items safely to prevent GC churn upon reattachment
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