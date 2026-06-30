import * as THREE from 'three';
import { System, SystemID } from './System';
import { CelestialType, MATERIALS_SKY, SkyConfig, SKY_KEYFRAMES, SkyCloudConfig, SkyKeyframe } from '../utils/assets/materials_sky';
import { GEOMETRY } from '../utils/assets';
import { SKY_SYSTEM } from '../content/constants';
import { GameSessionLogic } from '../game/session/GameSessionLogic';

// Zero-GC Module Scratchpads and Mathematical Constants
const _c1 = new THREE.Color();
const _c2 = new THREE.Color();
const _c3 = new THREE.Color();
const _c4 = new THREE.Color();
const _c5 = new THREE.Color();
const _v1 = new THREE.Vector3();
const PI2 = Math.PI * 2;
const PI05 = Math.PI * 0.5;

/**
 * SkySystem: Procedural Environmental Controller (V2)
 *
 * OWNS:
 * - Stars (THREE.Points)
 * - Celestial body meshes & halos (Moon / Sun Groups)
 * - Instanced Cloud System (THREE.InstancedMesh) -> High-performance cache locality
 * - HemisphereLight (ambient fill)
 * - DirectionalLight (sun/moon shadows) — authoritative global shadowing
 *
 * Heavily optimized for Zero-GC hot-paths, implementing spatial and temporal thresholding.
 */
export class SkySystem implements System {
    public readonly systemId = SystemID.SKY;
    public id = 'sky';
    public enabled = true;
    public persistent = true;

    // --- ENGINE STATE ---
    public currentTime: number = 0;
    public timeScale: number = 0;
    private activeConfig: SkyConfig | null = null;
    public currentAtmosphereColor: THREE.Color = new THREE.Color(0x050510);

    // Temporal cache to block redundant keyframe interpolations
    private lastLerpTime: number = -1;

    // Spatial cache to block redundant scene graph matrix updates
    private lastTrackedPos: THREE.Vector3 = new THREE.Vector3(Infinity, Infinity, Infinity);

    // Runtime caching properties
    private _cachedKeyframeIndex: number = 0;

    // Pre-resolved active configuration colors & values to achieve true Zero-GC in processProcedural and update
    private _hasAtmosphereColor: boolean = false;
    private _activeAtmosphereColor: THREE.Color = new THREE.Color();

    private _hasHemiSkyColor: boolean = false;
    private _activeHemiSkyColor: THREE.Color = new THREE.Color();
    private _activeHemiGroundColor: number = 0x333322;
    private _hasHemiIntensity: boolean = false;
    private _activeHemiIntensity: number = 0.0;

    private _hasCelestialColor: boolean = false;
    private _activeCelestialColor: THREE.Color = new THREE.Color();
    private _hasCelestialTypeOverride: boolean = false;
    private _celestialTypeOverride: CelestialType = CelestialType.SUN;
    private _celestialRadiusSun: number = 25;
    private _celestialRadiusMoon: number = 18;
    private _hasStaticPos: boolean = false;
    private _staticPos: THREE.Vector3 = new THREE.Vector3();
    private _orbitDist: number = 200;

    private _hasLightColor: boolean = false;
    private _activeLightColor: THREE.Color = new THREE.Color();
    private _activeLightVisible: boolean = true;
    private _hasLightIntensity: boolean = false;
    private _activeLightIntensity: number = 0.0;
    private _activeLightCastShadow: boolean = true;

    private _hasCloudsColor: boolean = false;
    private _activeCloudsColor: THREE.Color = new THREE.Color();
    private _hasCloudsOpacity: boolean = false;
    private _activeCloudsOpacity: number = 0.5;
    private _activeCloudsSpeed: number = 1.0;
    private _activeCloudsHeight: number = 120;

    private _hasStarsOverride: boolean = false;
    private _starsOverride: number = 0;

    // --- SCENE OBJECTS ---
    public root: THREE.Group;
    private currentScene: THREE.Scene | null = null;
    private starSystem!: THREE.Points;

    // Dual celestial body nodes
    private sunGroup!: THREE.Group;
    private sunMesh!: THREE.Mesh;
    private sunHalo!: THREE.Sprite;
    private sunRays!: THREE.Sprite;
    private moonGroup!: THREE.Group;
    private moonMesh!: THREE.Mesh;
    private moonHalo!: THREE.Sprite;

    private sunMaterial!: THREE.MeshBasicMaterial;
    private sunHaloMaterial!: THREE.SpriteMaterial;
    private sunRaysMaterial!: THREE.ShaderMaterial;
    private moonMaterial!: THREE.MeshBasicMaterial;
    private moonHaloMaterial!: THREE.SpriteMaterial;

    // Scale caches for procedural pulsing
    private sunHaloBaseScale: number = 0;
    private moonHaloBaseScale: number = 0;

    private hemiLight!: THREE.HemisphereLight;
    public skyLight!: THREE.DirectionalLight;

    // High-Performance Instanced Cloud Engine
    private cloudMesh: THREE.InstancedMesh | null = null;
    private cloudMaterial!: THREE.MeshBasicMaterial; // Managed internally as an instanced material path
    private cloudCount: number = 0;
    private maxCloudInstances: number = 12;

    // Flat TypedArrays maximizing CPU cache locality (L1/L2)
    private _cloudPositions!: Float32Array;
    private _cloudVelocities!: Float32Array;
    private _cloudBaseScales!: Float32Array;

    // --- STATIC ASSETS CACHE ---
    private static STATIC_SKY_CACHE = {
        starGeo: null as THREE.BufferGeometry | null
    };

    constructor() {
        this.root = new THREE.Group();
        this.root.name = 'SKY_SYSTEM_ROOT';
        this.root.userData = { isSystemic: true, isPersistent: true, isEngineStatic: true };
    }

    public init(): void {
        const cache = SkySystem.STATIC_SKY_CACHE;

        // 1. STAR SYSTEM (Seeded static buffers allocated exactly once globally)
        if (!cache.starGeo) {
            const starCount = SKY_SYSTEM.STAR_COUNT_MAX;
            const geo = new THREE.BufferGeometry();
            const positions = new Float32Array(starCount * 3);
            const sizes = new Float32Array(starCount);
            const phases = new Float32Array(starCount);
            const twinkleSpeeds = new Float32Array(starCount);

            for (let i = 0; i < starCount; i++) {
                const r = 1200 + Math.random() * 800;
                const theta = Math.random() * Math.PI * 2;
                const phi = (Math.PI / 2) - Math.random() * 1.5;

                const i3 = i * 3;
                positions[i3] = r * Math.sin(phi) * Math.cos(theta);
                positions[i3 + 1] = r * Math.cos(phi);
                positions[i3 + 2] = r * Math.sin(phi) * Math.sin(theta);

                const roll = Math.random();
                sizes[i] = roll > 0.98 ? 4.5 : (roll > 0.90 ? 3.5 : (roll > 0.70 ? 2.5 : 1.5));
                phases[i] = Math.random() * Math.PI * 2;
                twinkleSpeeds[i] = Math.random() > 0.8 ? 0.2 + Math.random() * 0.5 : 0.0;
            }
            geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
            geo.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
            geo.setAttribute('twinkleSpeed', new THREE.BufferAttribute(twinkleSpeeds, 1));
            geo.userData = { isSharedAsset: true };
            cache.starGeo = geo;
        }

        this.starSystem = new THREE.Points(cache.starGeo, MATERIALS_SKY.star);
        this.starSystem.frustumCulled = false;
        this.starSystem.userData.isEngineStatic = true;
        this.root.add(this.starSystem);

        // 2. CELESTIAL MATERIAL PROXIES (Allocation-free structure instantiation)
        this.sunMaterial = new THREE.MeshBasicMaterial({
            color: MATERIALS_SKY.sun.color,
            fog: false,
            blending: THREE.AdditiveBlending,
            transparent: true,
            depthWrite: false
        });

        this.sunHaloMaterial = new THREE.SpriteMaterial({
            map: MATERIALS_SKY.moonHalo.map,
            color: MATERIALS_SKY.moonHalo.color,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending,
            fog: false,
            depthWrite: false
        });

        this.sunRaysMaterial = MATERIALS_SKY.sunRays;

        this.moonMaterial = new THREE.MeshBasicMaterial({
            color: MATERIALS_SKY.moon.color,
            fog: false,
            transparent: true
        });

        this.moonHaloMaterial = new THREE.SpriteMaterial({
            map: MATERIALS_SKY.moonHalo.map,
            color: MATERIALS_SKY.moonHalo.color,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending,
            fog: false,
            depthWrite: false
        });

        // Sun Hierarchy Setup
        this.sunGroup = new THREE.Group();
        this.sunGroup.name = 'SUN_GROUP';

        this.sunMesh = new THREE.Mesh(GEOMETRY.celestialBody, this.sunMaterial);
        this.sunMesh.frustumCulled = false;
        this.sunMesh.userData.isEngineStatic = true;
        this.sunGroup.add(this.sunMesh);

        this.sunHalo = new THREE.Sprite(this.sunHaloMaterial);
        this.sunHalo.position.set(0, 0, 10);
        this.sunHalo.userData.isEngineStatic = true;
        this.sunGroup.add(this.sunHalo);

        this.sunRays = new THREE.Sprite(this.sunRaysMaterial as any);
        this.sunRays.position.set(0, 0, 8);
        this.sunRays.userData.isEngineStatic = true;
        this.sunGroup.add(this.sunRays);

        this.root.add(this.sunGroup);

        // Moon Hierarchy Setup
        this.moonGroup = new THREE.Group();
        this.moonGroup.name = 'MOON_GROUP';

        this.moonMesh = new THREE.Mesh(GEOMETRY.celestialBody, this.moonMaterial);
        this.moonMesh.frustumCulled = false;
        this.moonMesh.userData.isEngineStatic = true;
        this.moonGroup.add(this.moonMesh);

        this.moonHalo = new THREE.Sprite(this.moonHaloMaterial);
        this.moonHalo.position.set(0, 0, 10);
        this.moonHalo.userData.isEngineStatic = true;
        this.moonGroup.add(this.moonHalo);

        this.root.add(this.moonGroup);

        // 3. HEMISPHERE LIGHT
        this.hemiLight = new THREE.HemisphereLight(0x9ab0cc, 0x333322, 0.6);
        this.hemiLight.name = SKY_SYSTEM.HEMI_LIGHT;
        this.hemiLight.userData.isEngineStatic = true;
        this.root.add(this.hemiLight);

        // 4. DIRECTIONAL LIGHT shadow mapping configurations
        this.skyLight = new THREE.DirectionalLight(0xaaccff, 0.4);
        this.skyLight.name = SKY_SYSTEM.SKY_LIGHT;
        this.skyLight.userData.isEngineStatic = true;
        this.skyLight.castShadow = true;
        this.skyLight.shadow.mapSize.set(1024, 1024);
        this.skyLight.shadow.camera.near = 0.5;
        this.skyLight.shadow.camera.far = 1000;
        this.skyLight.shadow.camera.left = -100;
        this.skyLight.shadow.camera.right = 100;
        this.skyLight.shadow.camera.top = 100;
        this.skyLight.shadow.camera.bottom = -100;
        this.skyLight.shadow.bias = -0.0004;

        this.skyLight.position.set(-80, 150, -100);
        this.root.add(this.skyLight);
        this.root.add(this.skyLight.target);

        // 5. INSTANCED CLOUD ENGINE INLINE ALLOCATION
        this.cloudMaterial = new THREE.MeshBasicMaterial({
            map: MATERIALS_SKY.cloud.map,
            color: 0xffffff,
            transparent: true,
            opacity: 0.5,
            blending: THREE.NormalBlending,
            fog: false,
            depthWrite: false
        });

        // Pack primitive states into flat matrices for absolute memory locality
        this._cloudPositions = new Float32Array(this.maxCloudInstances * 3);
        this._cloudVelocities = new Float32Array(this.maxCloudInstances);
        this._cloudBaseScales = new Float32Array(this.maxCloudInstances * 2);

        // Seed initial simulation coordinates linearly
        for (let i = 0; i < this.maxCloudInstances; i++) {
            const i2 = i * 2;
            const i3 = i * 3;

            this._cloudPositions[i3 + 0] = (Math.random() - 0.5) * 800;
            this._cloudPositions[i3 + 1] = 120 + Math.random() * 50;
            this._cloudPositions[i3 + 2] = -250 - Math.random() * 80;

            const baseW = 120 + Math.random() * 80;
            this._cloudBaseScales[i2 + 0] = baseW;
            this._cloudBaseScales[i2 + 1] = baseW * 0.5;

            this._cloudVelocities[i] = 5.0 + Math.random() * 7.0;
        }

        // Pre-instantiate and attach THREE.Color objects directly to keyframe elements to completely bypass Map hash lookup in hot-paths
        for (let i = 0; i < SKY_KEYFRAMES.length; i++) {
            const kf = SKY_KEYFRAMES[i];

            kf.atmosphereColorObj = new THREE.Color(kf.atmosphereColor);
            kf.celestialColorObj = new THREE.Color(kf.celestialColor);
            kf.lightColorObj = new THREE.Color(kf.lightColor);
            kf.hemiSkyColorObj = new THREE.Color(kf.hemiSkyColor);
        }
    }

    public getCelestialPosition(): THREE.Vector3 {
        if (this.sunGroup && this.sunGroup.visible &&
            (!this.moonGroup.visible || this.sunMaterial.opacity >= this.moonMaterial.opacity)) {
            this.sunGroup.getWorldPosition(_v1);
        } else if (this.moonGroup && this.moonGroup.visible) {
            this.moonGroup.getWorldPosition(_v1);
        } else {
            this.sunGroup.getWorldPosition(_v1);
        }
        return _v1;
    }

    public sync(config: SkyConfig): void {
        this.activeConfig = config;

        if (config.time !== undefined) {
            this.currentTime = config.time;
        }
        this.timeScale = config.timeScale || 0;

        // Resolve optional configuration colors and variables into flat private properties to achieve true Zero-GC
        if (config.atmosphereColor !== undefined) {
            this._hasAtmosphereColor = true;
            this._activeAtmosphereColor.setHex(config.atmosphereColor);
        } else {
            this._hasAtmosphereColor = false;
        }

        if (config.hemi) {
            if (config.hemi.skyColor !== undefined) {
                this._hasHemiSkyColor = true;
                this._activeHemiSkyColor.setHex(config.hemi.skyColor);
            } else {
                this._hasHemiSkyColor = false;
            }
            this._activeHemiGroundColor = config.hemi.groundColor !== undefined ? config.hemi.groundColor : 0x333322;
            if (config.hemi.intensity !== undefined) {
                this._hasHemiIntensity = true;
                this._activeHemiIntensity = config.hemi.intensity;
            } else {
                this._hasHemiIntensity = false;
            }
        } else {
            this._hasHemiSkyColor = false;
            this._activeHemiGroundColor = 0x333322;
            this._hasHemiIntensity = false;
        }

        if (config.celestial) {
            if (config.celestial.color !== undefined) {
                this._hasCelestialColor = true;
                this._activeCelestialColor.setHex(config.celestial.color);
            } else {
                this._hasCelestialColor = false;
            }

            if (config.celestial.type !== undefined) {
                this._hasCelestialTypeOverride = true;
                this._celestialTypeOverride = config.celestial.type;
            } else {
                this._hasCelestialTypeOverride = false;
            }

            const celTypeVal = config.celestial.type;
            const celRadiusVal = config.celestial.radius;
            this._celestialRadiusSun = (celTypeVal === CelestialType.SUN && celRadiusVal !== undefined) ? celRadiusVal : 25;
            this._celestialRadiusMoon = (celTypeVal === CelestialType.MOON && celRadiusVal !== undefined) ? celRadiusVal : 18;

            if (config.celestial.position) {
                this._hasStaticPos = true;
                this._staticPos.copy(config.celestial.position);
            } else {
                this._hasStaticPos = false;
            }

            this._orbitDist = config.celestial.distance || (this._hasStaticPos ? 180 : 200);
        } else {
            this._hasCelestialColor = false;
            this._hasCelestialTypeOverride = false;
            this._celestialRadiusSun = 25;
            this._celestialRadiusMoon = 18;
            this._hasStaticPos = false;
            this._orbitDist = 200;
        }

        if (config.light) {
            if (config.light.color !== undefined) {
                this._hasLightColor = true;
                this._activeLightColor.setHex(config.light.color);
            } else {
                this._hasLightColor = false;
            }

            this._activeLightVisible = config.light.visible !== undefined ? config.light.visible : true;

            if (config.light.intensity !== undefined) {
                this._hasLightIntensity = true;
                this._activeLightIntensity = config.light.intensity;
            } else {
                this._hasLightIntensity = false;
            }

            this._activeLightCastShadow = config.light.castShadow !== undefined ? config.light.castShadow : true;
        } else {
            this._hasLightColor = false;
            this._activeLightVisible = true;
            this._hasLightIntensity = false;
            this._activeLightCastShadow = true;
        }

        if (config.clouds) {
            if (config.clouds.color !== undefined) {
                this._hasCloudsColor = true;
                this._activeCloudsColor.setHex(config.clouds.color);
            } else {
                this._hasCloudsColor = false;
            }

            if (config.clouds.opacity !== undefined) {
                this._hasCloudsOpacity = true;
                this._activeCloudsOpacity = config.clouds.opacity;
            } else {
                this._hasCloudsOpacity = false;
            }

            this._activeCloudsSpeed = config.clouds.speed !== undefined ? config.clouds.speed : 1.0;
            this._activeCloudsHeight = config.clouds.height !== undefined ? config.clouds.height : 120;
        } else {
            this._hasCloudsColor = false;
            this._hasCloudsOpacity = false;
            this._activeCloudsSpeed = 1.0;
            this._activeCloudsHeight = 120;
        }

        if (config.stars !== undefined) {
            this._hasStarsOverride = true;
            this._starsOverride = config.stars;
        } else {
            this._hasStarsOverride = false;
        }

        // Sync instance draw layer context
        this.syncCloudMeshLayer(config.clouds);

        this.lastLerpTime = -1;
        this.processProcedural(this.currentTime);
    }

    /**
     * Reconfigures instance layout boundary counts without pipeline recreation.
     */
    private syncCloudMeshLayer(cfg?: Partial<SkyCloudConfig>): void {
        const targetCount = cfg?.count !== undefined ? Math.min(cfg.count, this.maxCloudInstances) : 6;
        this.cloudCount = targetCount;

        if (this.cloudCount <= 0) {
            if (this.cloudMesh) this.cloudMesh.visible = false;
            return;
        }

        // Lazy initialization of the singular cloud InstancedMesh node
        if (!this.cloudMesh) {
            const planeGeo = new THREE.PlaneGeometry(1, 1);
            planeGeo.rotateX(-Math.atan2(50, 40));
            this.cloudMesh = new THREE.InstancedMesh(planeGeo, this.cloudMaterial, this.maxCloudInstances);
            this.cloudMesh.name = 'SkySystem_Cloud_Mesh';
            this.cloudMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            this.cloudMesh.frustumCulled = false;
            this.cloudMesh.userData.isEngineStatic = true;
            this.root.add(this.cloudMesh);
        }

        this.cloudMesh.visible = true;
        this.cloudMesh.count = this.cloudCount;

        const baseHeight = cfg?.height !== undefined ? cfg.height : 120;
        for (let i = 0; i < this.cloudCount; i++) {
            this._cloudPositions[i * 3 + 1] = baseHeight + (i % 3) * 15;
        }
    }

    public update(ctx: GameSessionLogic, delta: number, _simTime: number, renderTime: number): void {
        if (!this.activeConfig || !ctx.state) return;

        // 1. CELESTIAL SCALING & WARPING PULSES
        if (this.sunGroup && this.sunGroup.visible) {
            const pulseHalo = 1.0 + Math.sin(renderTime * 0.003) * 0.15;
            const hScale = this.sunHaloBaseScale * pulseHalo;
            this.sunHalo.scale.set(hScale, hScale, 1);

            this.sunRaysMaterial.uniforms.uTime.value = renderTime * 0.001;
            const pulseRays = 1.0 + Math.sin(renderTime * 0.0025) * 0.06;
            this.sunRays.scale.setScalar(this.sunHaloBaseScale * 1.6 * pulseRays);
        }

        if (this.moonGroup && this.moonGroup.visible) {
            const pulse = 1.0 + Math.sin(renderTime * 0.002) * 0.10;
            const hScale = this.moonHaloBaseScale * pulse;
            this.moonHalo.scale.set(hScale, hScale, 1);
        }

        // 2. PARALLAX GRAPH TRACKING
        let pPos = this.lastTrackedPos;
        if (ctx.state && ctx.state.player) {
            pPos = ctx.state.player.position;
        } else if (ctx.engine && ctx.engine.camera && ctx.engine.camera.threeCamera) {
            pPos = ctx.engine.camera.threeCamera.position;
        }

        if (this.lastTrackedPos.distanceToSquared(pPos) > 100.0) {
            this.lastTrackedPos.copy(pPos);
            this.root.position.copy(pPos);

            this.skyLight.target.position.set(0, 0, 0);
            this.skyLight.target.updateMatrixWorld();
        }

        // 3. TIMELINE INTERPOLATION STEPPING
        if (this.timeScale !== 0) {
            this.currentTime = (this.currentTime + this.timeScale * delta) % 1.0;
            if (Math.abs(this.currentTime - this.lastLerpTime) > 0.0001) {
                this.processProcedural(this.currentTime);
            }
        }

        // 4. INSTANCED CLOUD SIMULATION LOOP (Linear Array Buffer Access)
        if (this.cloudMesh && this.cloudMesh.visible && this.cloudCount > 0) {
            const speedScale = this._activeCloudsSpeed;
            const baseHeight = this._activeCloudsHeight;
            const timeMultiplier = this.timeScale === 0 ? 1.0 : Math.max(1.0, Math.abs(this.timeScale) * 50.0);

            const pos = this._cloudPositions;
            const vel = this._cloudVelocities;
            const scales = this._cloudBaseScales;
            const matrixArray = this.cloudMesh.instanceMatrix.array;

            for (let i = 0; i < this.cloudCount; i++) {
                const i2 = i * 2;
                const i3 = i * 3;
                const matIdx = i * 16;

                // Advance translation along horizontal drift path
                pos[i3 + 0] += vel[i] * speedScale * timeMultiplier * delta;

                // Enforce bounding volumes via wrapping logic
                if (pos[i3 + 0] > 450) {
                    pos[i3 + 0] = -450;
                    pos[i3 + 1] = baseHeight + Math.random() * 50;
                    scales[i2 + 0] = 120 + Math.random() * 80;
                    scales[i2 + 1] = scales[i2 + 0] * (0.4 + Math.random() * 0.2);
                }

                // Compute async mathematical stretching/morphing values
                const morphW = 1.0 + Math.sin(renderTime * 0.0005 * timeMultiplier + i) * 0.2;
                const morphH = 1.0 + Math.cos(renderTime * 0.0007 * timeMultiplier + i) * 0.15;
                const finalScaleW = scales[i2 + 0] * morphW;
                const finalScaleH = scales[i2 + 1] * morphH;

                // Write transformation components sequentially directly into InstancedMesh ArrayBuffer matrix positions to prevent V8 deoptimization
                matrixArray[matIdx + 0] = finalScaleW;
                matrixArray[matIdx + 1] = 0.0;
                matrixArray[matIdx + 2] = 0.0;
                matrixArray[matIdx + 3] = 0.0;
                matrixArray[matIdx + 4] = 0.0;
                matrixArray[matIdx + 5] = finalScaleH;
                matrixArray[matIdx + 6] = 0.0;
                matrixArray[matIdx + 7] = 0.0;
                matrixArray[matIdx + 8] = 0.0;
                matrixArray[matIdx + 9] = 0.0;
                matrixArray[matIdx + 10] = 1.0;
                matrixArray[matIdx + 11] = 0.0;
                matrixArray[matIdx + 12] = pos[i3 + 0];
                matrixArray[matIdx + 13] = pos[i3 + 1];
                matrixArray[matIdx + 14] = pos[i3 + 2];
                matrixArray[matIdx + 15] = 1.0;
            }
            this.cloudMesh.instanceMatrix.needsUpdate = true;
        }
    }

    private processProcedural(time: number): void {
        if (!this.activeConfig) return;

        const normalizedTime = Math.max(0.0, Math.min(1.0, ((time % 1.0) + 1.0) % 1.0));
        this.lastLerpTime = time;

        // 1. RESOLVE DNA INTERVAL (Implementing O(1) Temporal Gating boundary checks)
        let idx = this._cachedKeyframeIndex;
        let k1 = SKY_KEYFRAMES[idx] as Required<SkyKeyframe>;
        let k2 = SKY_KEYFRAMES[idx + 1] as Required<SkyKeyframe>;

        if (normalizedTime < k1.time || normalizedTime > k2.time) {
            let found = false;
            for (let i = 0; i < SKY_KEYFRAMES.length - 1; i++) {
                if (normalizedTime >= SKY_KEYFRAMES[i].time && normalizedTime <= SKY_KEYFRAMES[i + 1].time) {
                    this._cachedKeyframeIndex = i;
                    idx = i;
                    k1 = SKY_KEYFRAMES[i] as Required<SkyKeyframe>;
                    k2 = SKY_KEYFRAMES[i + 1] as Required<SkyKeyframe>;
                    found = true;
                    break;
                }
            }
            if (!found) {
                this._cachedKeyframeIndex = 0;
                idx = 0;
                k1 = SKY_KEYFRAMES[0] as Required<SkyKeyframe>;
                k2 = SKY_KEYFRAMES[1] as Required<SkyKeyframe>;
            }
        }

        const range = k2.time - k1.time;
        const alpha = range > 0 ? (normalizedTime - k1.time) / range : 0;

        // 2. ATMOSPHERE TINTING (Reference-based copying/lerping using direct Color properties)
        const kfAtmosphere = _c1.copy(k1.atmosphereColorObj).lerp(k2.atmosphereColorObj, alpha);
        if (this._hasAtmosphereColor) {
            this.currentAtmosphereColor.copy(kfAtmosphere).lerp(this._activeAtmosphereColor, 0.4);
        } else {
            this.currentAtmosphereColor.copy(kfAtmosphere);
        }

        if (this.currentScene && this.currentScene.background !== this.currentAtmosphereColor) {
            this.currentScene.background = this.currentAtmosphereColor;
        }

        // 3. HEMISPHERE FILL
        const kfHemiSky = _c2.copy(k1.hemiSkyColorObj).lerp(k2.hemiSkyColorObj, alpha);

        let hemiSkyColorObj: THREE.Color;
        if (this._hasHemiSkyColor) {
            hemiSkyColorObj = _c3.copy(this._activeHemiSkyColor);
        } else if (this._hasAtmosphereColor) {
            hemiSkyColorObj = _c3.copy(kfHemiSky).lerp(this._activeAtmosphereColor, 0.4);
        } else {
            hemiSkyColorObj = kfHemiSky;
        }

        const hemiGround = this._activeHemiGroundColor;
        const hemiIntensity = this._hasHemiIntensity ? this._activeHemiIntensity : (k1.hemiIntensity + (k2.hemiIntensity - k1.hemiIntensity) * alpha);

        this.hemiLight.color.copy(hemiSkyColorObj);
        this.hemiLight.groundColor.setHex(hemiGround);
        this.hemiLight.intensity = hemiIntensity;

        // 4. CELESTIAL VISUALS TRACKING
        const isDay = normalizedTime > 0.25 && normalizedTime < 0.75;

        let celColorObj: THREE.Color;
        if (this._hasCelestialColor) {
            celColorObj = _c3.copy(this._activeCelestialColor);
        } else {
            celColorObj = _c3.copy(k1.celestialColorObj).lerp(k2.celestialColorObj, alpha);
        }

        let litColorObj: THREE.Color;
        if (this._hasLightColor) {
            litColorObj = _c4.copy(this._activeLightColor);
        } else {
            litColorObj = _c4.copy(k1.lightColorObj).lerp(k2.lightColorObj, alpha);
        }

        let cloudColorObj: THREE.Color;
        if (this._hasCloudsColor) {
            cloudColorObj = _c2.copy(this._activeCloudsColor);
        } else {
            cloudColorObj = _c2.copy(this.currentAtmosphereColor).lerp(litColorObj, 0.85);
        }

        const celRadiusSun = this._celestialRadiusSun;
        const celRadiusMoon = this._celestialRadiusMoon;

        // Circular position calculations
        const angleSun = (normalizedTime * PI2) - PI05;
        const angleMoon = angleSun + Math.PI;

        const sinSun = Math.sin(angleSun);
        const sinMoon = Math.sin(angleMoon);

        let sunOpacity = Math.max(0, Math.min(1, sinSun / 0.15));
        let moonOpacity = Math.max(0, Math.min(1, sinMoon / 0.15));

        if (this._hasCelestialTypeOverride) {
            if (this._celestialTypeOverride === CelestialType.SUN) {
                moonOpacity = 0.0;
            } else {
                sunOpacity = 0.0;
            }
        }

        let refX = 0;
        let refY = 150;
        let refZ = -300;

        if (this._hasStaticPos) {
            refX = this._staticPos.x;
            refY = this._staticPos.y;
            refZ = this._staticPos.z;
        }

        const orbitDist = this._orbitDist;

        if (this._hasStaticPos && this.timeScale === 0) {
            const celType = this._hasCelestialTypeOverride ? this._celestialTypeOverride : (isDay ? CelestialType.SUN : CelestialType.MOON);
            if (celType === CelestialType.SUN) {
                this.sunGroup.position.set(refX, refY, refZ);
                sunOpacity = 1.0;
                moonOpacity = 0.0;
            } else {
                this.moonGroup.position.set(refX, refY, refZ);
                moonOpacity = 1.0;
                sunOpacity = 0.0;
            }
        } else {
            this.sunGroup.position.set(refX + Math.cos(angleSun) * orbitDist, Math.sin(angleSun) * refY, refZ);
            this.moonGroup.position.set(refX + Math.cos(angleMoon) * orbitDist, Math.sin(angleMoon) * refY, refZ);
        }

        // Apply parameters to sun visual elements
        if (sunOpacity > 0) {
            this.sunGroup.visible = true;
            this.sunMaterial.color.copy(celColorObj);
            this.sunMaterial.opacity = sunOpacity;
            this.sunMesh.scale.setScalar(celRadiusSun * (0.8 + 0.2 * sunOpacity));

            this.sunHaloMaterial.color.copy(celColorObj).lerp(cloudColorObj, 0.20);
            this.sunHaloMaterial.opacity = sunOpacity;

            const sunHScale = celRadiusSun * 6 * (0.5 + 0.5 * sunOpacity);
            this.sunHaloBaseScale = sunHScale;
            this.sunHalo.scale.set(sunHScale, sunHScale, 1);

            this.sunRaysMaterial.uniforms.uColor.value.copy(celColorObj).lerp(cloudColorObj, 0.10);
            this.sunRaysMaterial.uniforms.uOpacity.value = 0.7 * sunOpacity;
        } else {
            this.sunGroup.visible = false;
        }

        // Apply parameters to moon visual elements
        if (moonOpacity > 0) {
            this.moonGroup.visible = true;
            this.moonMaterial.color.copy(celColorObj);
            this.moonMaterial.opacity = moonOpacity;
            this.moonMesh.scale.setScalar(celRadiusMoon * (0.8 + 0.2 * moonOpacity));

            this.moonHaloMaterial.color.copy(celColorObj).lerp(cloudColorObj, 0.35);
            this.moonHaloMaterial.opacity = 0.8 * moonOpacity;

            const moonHScale = celRadiusMoon * 6 * (0.5 + 0.5 * moonOpacity);
            this.moonHaloBaseScale = moonHScale;
            this.moonHalo.scale.set(moonHScale, moonHScale, 1);
        } else {
            this.moonGroup.visible = false;
        }

        // 5. DIRECTIONAL LIGHTING SHADOW CONTROL
        if (this._activeLightVisible === false) {
            this.skyLight.visible = false;
            this.skyLight.intensity = 0;
        } else {
            this.skyLight.visible = true;
            const litIntensity = this._hasLightIntensity ? this._activeLightIntensity : (k1.lightIntensity + (k2.lightIntensity - k1.lightIntensity) * alpha);

            const isSunDominant = (sunOpacity >= moonOpacity);
            const dominantGroup = isSunDominant ? this.sunGroup : this.moonGroup;
            const dominantAngle = isSunDominant ? angleSun : angleMoon;
            const horizonFade = Math.pow(Math.max(0, Math.min(1, Math.sin(dominantAngle))), 2.0);

            this.skyLight.castShadow = this._activeLightCastShadow;
            this.skyLight.color.copy(litColorObj);
            this.skyLight.intensity = litIntensity * horizonFade;
            this.skyLight.position.copy(dominantGroup.position);
        }

        // 6. STAR FIELD TELEMETRY
        const celType = this._hasCelestialTypeOverride ? this._celestialTypeOverride : (isDay ? CelestialType.SUN : CelestialType.MOON);
        const targetStars = this._hasStarsOverride ? this._starsOverride : (celType === CelestialType.MOON ? 1500 : 0);
        this.starSystem.visible = targetStars > 0;
        if (this.starSystem.visible) {
            this.starSystem.geometry.setDrawRange(0, targetStars);

            let starOpacity = 0.0;
            if (normalizedTime >= 0.78) {
                starOpacity = Math.max(0.0, Math.min(1.0, (normalizedTime - 0.78) / 0.05));
            } else if (normalizedTime <= 0.22) {
                starOpacity = Math.max(0.0, Math.min(1.0, (0.22 - normalizedTime) / 0.05));
            }
            (this.starSystem.material as THREE.ShaderMaterial).uniforms.uOpacity.value = starOpacity;
        }

        // 7. INSTANCED CLOUD UNIFORM TINTING
        if (this.cloudMesh && this.cloudMesh.visible) {
            const cloudBaseOpacity = this._hasCloudsOpacity ? this._activeCloudsOpacity : (isDay ? 1.0 : 0.50);
            this.cloudMaterial.color.copy(cloudColorObj);
            this.cloudMaterial.opacity = cloudBaseOpacity;
        }
    }



    public reAttach(newScene: THREE.Scene): void {
        this.currentScene = newScene;
        newScene.add(this.root);
    }

    public clear(): void {
        // [VINTERDÖD FIX] Persistent systems should not dispose of their shared materials
        // when jumping between sectors, otherwise they become invisible (disposed on GPU).
        // if (this.sunMaterial) this.sunMaterial.dispose();
        // if (this.sunHaloMaterial) this.sunHaloMaterial.dispose();
        // if (this.sunRaysMaterial) this.sunRaysMaterial.dispose();
        // if (this.moonMaterial) this.moonMaterial.dispose();
        // if (this.moonHaloMaterial) this.moonHaloMaterial.dispose();
        // if (this.cloudMaterial) this.cloudMaterial.dispose();
        if (this.cloudMesh) {
            this.root.remove(this.cloudMesh);
            this.cloudMesh.dispose();
            this.cloudMesh = null;
        }
        // Force evaluation on spatial/temporal checks post-transition
        this.lastTrackedPos.set(Infinity, Infinity, Infinity);
        this.lastLerpTime = -1;
    }
}
