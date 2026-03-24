import * as THREE from 'three';
import { DEFAULT_GRAPHICS, LIGHT_SYSTEM } from '../../content/constants';
import { GraphicsSettings } from '../../core/engine/EngineTypes';
import { InputManager } from './InputManager';
import { CameraSystem } from '../../systems/CameraSystem';
import { WindSystem } from '../../systems/WindSystem';
import { WeatherSystem } from '../../systems/WeatherSystem';
import { FogSystem } from '../../systems/FogSystem';
import { WaterSystem } from '../../systems/WaterSystem';
import { PerformanceMonitor } from '../../systems/PerformanceMonitor';
import { GEOMETRY, MATERIALS } from '../../utils/assets';
import { System } from '../../systems/System';
import { SectorEnvironment, EnvironmentOverride, EnvironmentalZone, EnvironmentalWeather, WeatherType } from '../../core/engine/EngineTypes';
import { NoiseType } from '../../entities/enemies/EnemyTypes';

// Module-level scratchpads for Zero-GC operations
const _c1 = new THREE.Color();
const _c2 = new THREE.Color();
const _v1 = new THREE.Vector3();
const _traverseStack: THREE.Object3D[] = [];

export type { GraphicsSettings };

/**
 * The Engine class acts as the central hub for the 3D environment.
 * Heavily optimized for high performance, GPU fill-rate protection, and Zero-GC.
 */
export class WinterEngine {
    private static instance: WinterEngine | null = null;

    // Accepts initial settings to prevent double WebGL context creation on boot
    public static getInstance(initialSettings?: Partial<GraphicsSettings>): WinterEngine {
        if (!this.instance) this.instance = new WinterEngine(initialSettings);
        return this.instance;
    }

    // Max safe shadows & visible lights
    public maxSafeShadows: number = 0;
    public maxVisibleLights: number = 0;

    // Core Systems
    public scene: THREE.Scene;
    public camera: CameraSystem;
    public renderer!: THREE.WebGLRenderer;
    public input: InputManager;

    // Environmental Systems (Persistent across scenes)
    public wind: WindSystem;
    public weather: WeatherSystem;
    public fog: FogSystem;
    public water: WaterSystem;

    private sceneStack: THREE.Scene[] = [];
    public settings: GraphicsSettings;

    // Lifecycle & Timing
    private clock: THREE.Clock;
    private requestID: number | null = null;
    private isRunning: boolean = false;
    private container: HTMLElement | null = null;

    // Callbacks
    public onUpdate: ((dt: number) => void) | null = null;
    public onRender: (() => void) | null = null;
    public isRenderingPaused: boolean = false;
    public isSimulationPaused: boolean = false;
    public onUpdateContext: any = null;
    public screenWidth: number = window.innerWidth;
    public screenHeight: number = window.innerHeight;

    // Cached Sets for O(1) Zero-GC lookups during cleanup
    private sharedGeoSet: Set<any> | null = null;
    private sharedMatSet: Set<any> | null = null;

    // --- HYBRID SYSTEM REGISTRY (Zero-GC) ---
    private _systemsMap: Map<string, System> = new Map();
    private _systemArray: System[] = [];

    // --- CACHED SCENE REFERENCES ---
    private _cachedSkyLight: THREE.DirectionalLight | null = null;
    private _cachedAmbientLight: THREE.AmbientLight | null = null;
    private _cachedGround: THREE.Mesh | null = null;

    constructor(initialSettings?: Partial<GraphicsSettings>) {
        this.settings = { ...DEFAULT_GRAPHICS, ...initialSettings };
        this.scene = new THREE.Scene();
        this.clock = new THREE.Clock();

        this.initRenderer();

        this.input = new InputManager();
        this.input.enable();

        // Initialize persistent environmental systems
        this.camera = new CameraSystem();
        this.wind = new WindSystem();
        this.weather = new WeatherSystem(this.scene, this.wind, this.camera.threeCamera);
        this.fog = new FogSystem(this.scene, this.wind, this.camera.threeCamera);
        this.water = new WaterSystem(this.scene);

        // Export for standalone systems (Zero-GC singleton access)
        (window as any).WinterEngineInstance = this;

        // Register persistent environmental systems to the centralized registry
        this.registerSystem(this.wind);
        this.registerSystem(this.weather);
        this.registerSystem(this.fog);
        this.registerSystem(this.water);

        window.addEventListener('resize', this.handleResize);
    }

    private _calculateHardwareLimits() {
        const maxTextures = this.renderer.capabilities.maxTextures;

        // SUPER-SAFE BUDGET:
        // We reserve 12 textures for extremely heavy materials (water, PBR, envMaps etc).
        // This leaves (maxTextures - 12) textures for PointLight shadows.
        // On a graphics card with 16 textures, this results in a maximum of 4 PointLight shadows.
        const safeShadowLimit = Math.max(0, maxTextures - 12);

        this.maxSafeShadows = Math.min(LIGHT_SYSTEM.MAX_SHADOW_CASTING_LIGHTS, safeShadowLimit);
        this.maxVisibleLights = LIGHT_SYSTEM.MAX_VISIBLE_LIGHTS;

        console.log(`[WinterEngine] GPU MaxTextures: ${maxTextures}. Safe Shadows capped at: ${this.maxSafeShadows}`);
    }

    /**
     * Initializes the WebGLRenderer with high-performance parameters.
     * Hard-caps pixel ratio to prevent GPU burnout on Retina/4K mobile screens.
     */
    private initRenderer() {
        const params: THREE.WebGLRendererParameters = {
            antialias: this.settings.antialias,
            powerPreference: 'high-performance',
            precision: 'highp',
            alpha: false,       // Optimization: Canvas is opaque
            stencil: false,     // Optimization: No stencil buffer needed
            depth: true,
            preserveDrawingBuffer: false
        };

        this.renderer = new THREE.WebGLRenderer(params);
        this._calculateHardwareLimits();

        // --- RESOLUTION MULTIPLIER LOGIC ---
        const maxRatio = Math.min(window.devicePixelRatio, 1.5);
        this.renderer.setPixelRatio(Math.min(maxRatio, this.settings.pixelRatio || 1));
        this.renderer.setSize(window.innerWidth, window.innerHeight);

        // Shadow mapping setup
        this.renderer.shadowMap.enabled = this.settings.shadows;
        this.renderer.shadowMap.type = this.settings.shadowMapType as THREE.ShadowMapType;

        // Color space management
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    }

    public updateSettings(newSettings: Partial<GraphicsSettings>) {
        const needsRecreation = newSettings.antialias !== undefined && newSettings.antialias !== this.settings.antialias;
        this.settings = { ...this.settings, ...newSettings };

        if (needsRecreation) {
            this.recreateRenderer();
        } else {
            this.applySettings();
        }
    }

    private recreateRenderer() {
        const oldDom = this.renderer.domElement;
        const parent = oldDom.parentNode;

        this.renderer.dispose();
        if (parent) parent.removeChild(oldDom);

        this.initRenderer();

        if (parent) parent.appendChild(this.renderer.domElement);
        this.handleResize();
    }

    private applySettings() {
        const maxRatio = Math.min(window.devicePixelRatio, 1.5);
        this.renderer.setPixelRatio(Math.min(maxRatio, this.settings.pixelRatio || 1));

        const shadowsEnabled = this.settings.shadows;
        const shadowType = this.settings.shadowMapType as THREE.ShadowMapType;

        if (this.renderer.shadowMap.enabled !== shadowsEnabled || this.renderer.shadowMap.type !== shadowType) {
            this.renderer.shadowMap.enabled = shadowsEnabled;
            this.renderer.shadowMap.type = shadowType;

            // Force material recompilation for shadows (Zero-GC iterative traversal)
            _traverseStack.length = 0;
            _traverseStack.push(this.scene);

            while (_traverseStack.length > 0) {
                const obj = _traverseStack.pop() as any;

                if (obj.isMesh && obj.material) {
                    if (Array.isArray(obj.material)) {
                        const len = obj.material.length;
                        for (let i = 0; i < len; i++) {
                            obj.material[i].needsUpdate = true;
                        }
                    } else {
                        obj.material.needsUpdate = true;
                    }
                }

                for (let i = 0; i < obj.children.length; i++) {
                    _traverseStack.push(obj.children[i]);
                }
            }
        }
    }

    public mount(container: HTMLElement) {
        this.container = container;
        if (this.renderer.domElement.parentNode && this.renderer.domElement.parentNode !== container) {
            this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
        }
        container.appendChild(this.renderer.domElement);
        this.handleResize();

        this.isRenderingPaused = false;
        this.isSimulationPaused = false;

        this.start();
    }

    public start() {
        if (!this.isRunning) {
            this.isRunning = true;
            this.clock.start();
            this.animate();
        }
    }

    public stop() {
        this.isRunning = false;
        if (this.requestID !== null) {
            cancelAnimationFrame(this.requestID);
            this.requestID = null;
        }
    }

    public dispose() {
        this.stop();
        window.removeEventListener('resize', this.handleResize);
        this.input.dispose();

        if (this.container && this.renderer.domElement.parentNode === this.container) {
            this.container.removeChild(this.renderer.domElement);
        }

        // Aggressive Cleanup before renderer disposal
        this.clearActiveScene(true);

        this.renderer.dispose();

        // Aggressive Garbage Collection flagging
        this.sceneStack.length = 0;
        this.onUpdate = null;
        this.onRender = null;

        this.sharedGeoSet = null;
        this.sharedMatSet = null;

        this.clearSystems();

        WinterEngine.instance = null;
    }

    /**
     * Aggressively disposes of all objects in the current scene.
     * Uses O(1) Set lookups and flat loops to guarantee Zero-GC drops.
     * @param includingPersistent If true, even systemic meshes (weather/water/fog) are disposed.
     */
    public clearActiveScene(includingPersistent: boolean = false) {
        const monitor = PerformanceMonitor.getInstance();
        monitor.begin('cleanup');

        const disposableObjects: THREE.Object3D[] = [];
        const children = this.scene.children;

        // 1. Collect all children (Zero-GC Loop)
        for (let i = 0; i < children.length; i++) {
            const child = children[i];

            const isPersistent = child.userData.isPersistent ||
                child.name.indexOf('Weather') !== -1 ||
                child.name.indexOf('Fog') !== -1 ||
                child.name.indexOf('Water') !== -1 ||
                child.name.indexOf('Wind') !== -1;

            if (!isPersistent || includingPersistent) {
                disposableObjects.push(child);
            }
        }

        // Initialize Sets lazily, using flat loops (Zero-GC)
        if (!this.sharedGeoSet) {
            this.sharedGeoSet = new Set();
            for (const key in GEOMETRY) this.sharedGeoSet.add((GEOMETRY as any)[key]);
        }
        if (!this.sharedMatSet) {
            this.sharedMatSet = new Set();
            for (const key in MATERIALS) this.sharedMatSet.add((MATERIALS as any)[key]);
        }

        // 2. Dispose of Geometries and Materials iteratively
        for (let i = 0; i < disposableObjects.length; i++) {
            const obj = disposableObjects[i];

            _traverseStack.length = 0;
            _traverseStack.push(obj);

            while (_traverseStack.length > 0) {
                const child = _traverseStack.pop() as any;

                const isProtected = child.userData?.isEngineStatic || child.userData?.isSharedAsset;
                if (isProtected) continue;

                if (child.isMesh || child.isLine || child.isPoints || child.isSprite) {
                    if (child.geometry) {
                        const isSharedGeo = this.sharedGeoSet!.has(child.geometry) || child.geometry.userData?.isSharedAsset;
                        if (!isSharedGeo && child.geometry.dispose) {
                            child.geometry.dispose();
                        }
                    }

                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            const len = child.material.length;
                            for (let m = 0; m < len; m++) {
                                const mat = child.material[m];
                                const isSharedMat = this.sharedMatSet!.has(mat) || mat.userData?.isSharedAsset;
                                if (!isSharedMat && mat.dispose) mat.dispose();
                            }
                        } else {
                            const isSharedMat = this.sharedMatSet!.has(child.material) || child.material.userData?.isSharedAsset;
                            if (!isSharedMat && child.material.dispose) child.material.dispose();
                        }
                    }
                }

                for (let c = 0; c < child.children.length; c++) {
                    _traverseStack.push(child.children[c]);
                }
            }

            this.scene.remove(obj);
        }

        // Reset references
        this._cachedSkyLight = null;
        this._cachedAmbientLight = null;
        this._cachedGround = null;

        monitor.end('cleanup');
        if (monitor.consoleLoggingEnabled) {
            console.log(`[WinterEngine] Scene Cleanup Complete. Disposed ${disposableObjects.length} root objects.`);
        }
    }

    // --- Scene Management ---

    public pushScene(newScene: THREE.Scene) {
        this.sceneStack.push(this.scene);
        this.scene = newScene;
        this.syncSystemsToScene();
        this.applySettings();
        this.cacheSceneReferences();
    }

    public popScene() {
        if (this.sceneStack.length > 0) {
            this.scene = this.sceneStack.pop()!;
            this.syncSystemsToScene();
            this.applySettings();
            this.cacheSceneReferences();
        }
    }

    public syncSystemsToScene(targetScene?: THREE.Scene) {
        const systems = this._systemArray;
        const len = systems.length;
        const scene = targetScene || this.scene;

        for (let i = 0; i < len; i++) {
            const sys = systems[i];
            if (sys.reAttach) sys.reAttach(scene);
        }
    }

    /**
     * Builds O(1) references to key scene objects to prevent string lookups in hot loops.
     */
    private cacheSceneReferences() {
        this._cachedSkyLight = null;
        this._cachedAmbientLight = null;
        this._cachedGround = null;

        _traverseStack.length = 0;
        _traverseStack.push(this.scene);

        while (_traverseStack.length > 0) {
            const node = _traverseStack.pop() as THREE.Object3D;

            if (node.name === LIGHT_SYSTEM.SKY_LIGHT) this._cachedSkyLight = node as THREE.DirectionalLight;
            else if (node.name === LIGHT_SYSTEM.AMBIENT_LIGHT) this._cachedAmbientLight = node as THREE.AmbientLight;
            else if (node.name === 'GROUND') this._cachedGround = node as THREE.Mesh;

            for (let i = 0; i < node.children.length; i++) {
                _traverseStack.push(node.children[i]);
            }
        }
    }

    private handleResize = () => {
        if (!this.container) return;
        const width = this.container.clientWidth || window.innerWidth;
        const height = this.container.clientHeight || window.innerHeight;

        this.screenWidth = width;
        this.screenHeight = height;

        this.camera.set('aspect', width / height);
        this.renderer.setSize(width, height);
    };

    /**
     * Main animation loop
     */
    private animate = () => {
        if (!this.isRunning) return;
        this.requestID = requestAnimationFrame(this.animate);

        const frameStart = performance.now();
        // Delta time clamping prevents physics-warp during frame drops
        const dt = Math.min(this.clock.getDelta(), 0.05);
        const now = performance.now();
        const monitor = PerformanceMonitor.getInstance();
        monitor.startFrame();

        // 1. Logic Update (Physics, Movement, Systems)
        monitor.begin('logic');
        if (this.onUpdate) this.onUpdate(dt);
        monitor.end('logic');

        // 2. High-Performance System Logic (Unified Registry)
        if (!this.isSimulationPaused) {
            this.updateSystems(this.onUpdateContext, dt, now);
        }

        // 3. Camera Update
        monitor.begin('camera');
        this.camera.update(dt, now);
        monitor.end('camera');

        // 4. Render Pass
        monitor.begin('render');
        if (!this.isRenderingPaused) {
            if (this.onRender) {
                this.onRender();
            } else {
                monitor.begin('render_setup');
                this.scene.updateMatrixWorld();
                this.camera.threeCamera.updateMatrixWorld();
                monitor.end('render_setup');

                monitor.begin('render_draw');
                this.renderer.render(this.scene, this.camera.threeCamera);
                monitor.end('render_draw');
            }
        }
        monitor.end('render');

        monitor.setRendererStats(this.renderer.info);

        const totalTime = performance.now() - frameStart;
        monitor.printIfHeavy('Game Engine Performance', totalTime, 50);
    };

    public getSettings(): GraphicsSettings {
        return { ...this.settings };
    }

    public registerSystem(system: System) {
        if (!this._systemsMap.has(system.id)) {
            this._systemsMap.set(system.id, system);
            this._systemArray.push(system);
        }
    }

    public unregisterSystem(id: string) {
        const sys = this._systemsMap.get(id);
        if (sys) {
            this._systemsMap.delete(id);
            const idx = this._systemArray.indexOf(sys);
            if (idx !== -1) {
                // Swap-and-Pop: Efficient removal without shifting (Zero-GC)
                this._systemArray[idx] = this._systemArray[this._systemArray.length - 1];
                this._systemArray.pop();
            }
            if (sys.clear) sys.clear();
        }
    }

    public getSystem<T extends System>(id: string): T | null {
        return (this._systemsMap.get(id) as T) || null;
    }

    public getSystems(): System[] {
        return this._systemArray;
    }

    public updateSystems(context: any, dt: number, now: number): void {
        const monitor = PerformanceMonitor.getInstance();
        const systems = this._systemArray;
        const len = systems.length;

        for (let i = 0; i < len; i++) {
            const sys = systems[i];

            if (sys.enabled === false) continue;

            const id = sys.id;
            monitor.begin(id);
            sys.update(context, dt, now);
            monitor.end(id);
        }
    }

    public setSystemEnabled(id: string, enabled: boolean) {
        const sys = this._systemsMap.get(id);
        if (sys) {
            sys.enabled = enabled;
        }
    }

    public syncEnvironment(env: SectorEnvironment | EnvironmentOverride, targetScene?: THREE.Scene) {
        const scene = targetScene || this.scene;
        let requiresRecache = false;

        // 1. Light Setup (Ambient)
        if (env.ambientIntensity !== undefined) {
            let ambient = this._cachedAmbientLight;
            if (!ambient && targetScene) ambient = targetScene.getObjectByName(LIGHT_SYSTEM.AMBIENT_LIGHT) as THREE.AmbientLight;

            if (ambient) {
                ambient.intensity = env.ambientIntensity;
                if (env.ambientColor !== undefined) ambient.color.setHex(env.ambientColor);
            } else {
                const amb = new THREE.AmbientLight(env.ambientColor || 0x404050, env.ambientIntensity);
                amb.name = LIGHT_SYSTEM.AMBIENT_LIGHT;
                scene.add(amb);
                requiresRecache = true;
            }
        }

        // 2. Wind Configuration
        if (env.wind && this.wind) {
            const w = env.wind;
            const minStrength = w.strengthMin ?? 0.02;
            const maxStrength = w.strengthMax ?? 0.05;
            let baseAngle = 0;
            let angleVariance = w.angleVariance ?? Math.PI;

            if (w.direction && (w.direction.x !== 0 || w.direction.z !== 0)) {
                baseAngle = Math.atan2(w.direction.z, w.direction.x);
                angleVariance = w.angleVariance ?? (Math.PI / 4);
            }
            this.wind.sync(minStrength, maxStrength, baseAngle, angleVariance);
        }

        // 3. Fog & Background Color
        if (env.bgColor !== undefined) {
            if (!targetScene) this.renderer.setClearColor(env.bgColor);
            _c1.setHex(env.bgColor);
        }

        let volDensity = 0;
        let fogHeight: number | undefined = undefined;
        let fogColorHex = env.bgColor || 0x000000;

        if (env.fog) {
            fogColorHex = env.fog.color !== undefined ? env.fog.color : (env.bgColor || 0x000000);
            volDensity = env.fog.density;
            fogHeight = env.fog.height;
        } else if ((env as any).fogDensity !== undefined) {
            fogColorHex = (env as any).fogColor !== undefined ? (env as any).fogColor : (env.bgColor || 0x000000);
            volDensity = (env as any).fogDensity;
        }

        _c1.setHex(fogColorHex);

        if (this.fog) {
            this.fog.reAttach(scene);
            if (this.settings.volumetricFog) {
                this.fog.sync(volDensity, fogHeight, _c1);

                if (volDensity > 0) {
                    const distFog = volDensity * 0.0001;
                    scene.fog = new THREE.FogExp2(fogColorHex, distFog);
                } else {
                    scene.fog = null;
                }
            } else {
                this.fog.sync(0, undefined, _c1);
                if (volDensity > 0) {
                    const fallbackDensity = volDensity < 1.0 ? volDensity : volDensity * 0.0005;
                    scene.fog = new THREE.FogExp2(fogColorHex, fallbackDensity);
                } else {
                    scene.fog = null;
                }
            }
        }

        if (scene.background && (scene.background as THREE.Color).isColor) {
            (scene.background as THREE.Color).copy(_c1);
        } else {
            scene.background = _c1.clone();
        }

        // 4. Weather Sync
        if (env.weather && this.weather) {
            this.weather.reAttach(scene);
            const w = env.weather as EnvironmentalWeather;
            const type = typeof w === 'string' ? w : w.type;
            const count = typeof w === 'string' ? 2000 : w.particles;
            this.weather.sync(type as WeatherType, count);
        }

        // 5. Water Sync
        if (this.water) {
            this.water.reAttach(scene);
            if (env.skyLight?.visible && env.skyLight.position) {
                _v1.set(env.skyLight.position.x, env.skyLight.position.y || 100, env.skyLight.position.z);
                this.water.setLightPosition(_v1);
            }
        }

        // 6. Camera Settings
        if (env.fov !== undefined) {
            this.camera.set('fov', env.fov);
        }

        // 7. SkyLight Setup
        if (env.skyLight) {
            let sky = this._cachedSkyLight;
            if (!sky && targetScene) sky = targetScene.getObjectByName(LIGHT_SYSTEM.SKY_LIGHT) as THREE.DirectionalLight;

            if (!sky) {
                sky = new THREE.DirectionalLight(env.skyLight.color, env.skyLight.intensity);
                sky.name = LIGHT_SYSTEM.SKY_LIGHT;
                scene.add(sky);
                scene.add(sky.target);
                requiresRecache = true;
            }

            sky.color.setHex(env.skyLight.color);
            sky.intensity = env.skyLight.visible ? env.skyLight.intensity : 0;

            if (env.skyLight.position) {
                sky.position.set(env.skyLight.position.x, env.skyLight.position.y || 100, env.skyLight.position.z);
            }

            if (this.settings.shadows) {
                sky.castShadow = true;
                const shadowRes = this.settings.shadowResolution;
                sky.shadow.camera.left = -100;
                sky.shadow.camera.right = 100;
                sky.shadow.camera.top = 100;
                sky.shadow.camera.bottom = -100;
                sky.shadow.camera.far = 300;
                sky.shadow.bias = -0.0005;
                sky.shadow.mapSize.width = shadowRes * 2;
                sky.shadow.mapSize.height = shadowRes * 2;
                sky.shadow.camera.updateProjectionMatrix();
            } else {
                sky.castShadow = false;
            }
        }

        if (requiresRecache) this.cacheSceneReferences();
    }

    /**
     * Updates the atmosphere blending based on player position and zones.
     * High-performance, Zero-GC loop executed every frame.
     */
    public updateAtmosphere(playerPos: THREE.Vector3, defaultEnv: SectorEnvironment, zones: EnvironmentalZone[] | undefined, sectorState: any, dt: number) {
        if (!playerPos) return;

        // 1. Determine Default Target Values
        const targetFogColor = _c1.setHex(defaultEnv.bgColor);
        if (defaultEnv.fog?.color !== undefined) targetFogColor.setHex(defaultEnv.fog.color);

        let targetFogDensity = defaultEnv.fog?.density ?? 0;
        let targetAmbient = defaultEnv.ambientIntensity;
        let targetGroundColor = defaultEnv.groundColor ?? 0xffffff;
        let activeWeather: any = defaultEnv.weather?.type || 'none';
        let maxWeight = 0;

        const px = playerPos.x;
        const pz = playerPos.z;

        // 2. Zone Blending
        const override = sectorState.envOverride;
        if (!override && zones && zones.length > 0) {
            let totalWeight = 0;
            let blendedR = 0, blendedG = 0, blendedB = 0;
            let blendedDensity = 0;
            let blendedAmbient = 0;

            for (let i = 0; i < zones.length; i++) {
                const z = zones[i];
                const dx = px - z.x;
                const dz = pz - z.z;
                const distSq = dx * dx + dz * dz;

                const inner = z.innerRadius || 250;
                const outer = z.outerRadius || 450;
                const outerSq = outer * outer;

                if (distSq < outerSq) {
                    const dist = Math.sqrt(distSq);
                    let weight = 1.0;
                    if (dist > inner) {
                        weight = 1.0 - ((dist - inner) / (outer - inner));
                    }
                    weight = weight * weight;

                    _c2.setHex(z.bgColor);
                    blendedR += _c2.r * weight;
                    blendedG += _c2.g * weight;
                    blendedB += _c2.b * weight;

                    const zFogDensity = z.fogDensity ?? 0;
                    blendedDensity += zFogDensity * weight;
                    blendedAmbient += z.ambient * weight;
                    totalWeight += weight;

                    if (weight > maxWeight) {
                        maxWeight = weight;
                        activeWeather = z.weather;
                    }
                }
            }

            if (totalWeight > 0) {
                const lerpFactor = Math.min(1.0, totalWeight);
                const invWeight = 1 / totalWeight;
                _c2.setRGB(blendedR * invWeight, blendedG * invWeight, blendedB * invWeight);

                targetFogColor.lerp(_c2, lerpFactor);
                targetFogDensity = THREE.MathUtils.lerp(targetFogDensity, blendedDensity * invWeight, lerpFactor);
                targetAmbient = THREE.MathUtils.lerp(targetAmbient, blendedAmbient * invWeight, lerpFactor);
            }
        }

        // 3. Apply Overrides
        if (override) {
            if (override.bgColor !== undefined) targetFogColor.setHex(override.bgColor);
            if (override.fog?.color !== undefined) targetFogColor.setHex(override.fog.color);
            if (override.fog?.density !== undefined) targetFogDensity = override.fog.density;
            if (override.ambientIntensity !== undefined) targetAmbient = override.ambientIntensity;
            if (override.groundColor !== undefined) targetGroundColor = override.groundColor;

            if (override.fov !== undefined) this.camera.set('fov', override.fov);
            if (override.weather !== undefined) {
                const type = typeof override.weather === 'string' ? override.weather : override.weather.type;
                const count = typeof override.weather === 'string' ? (override.weatherDensity ?? 1.0) * 2000 : override.weather.particles;
                this.weather.sync(type as WeatherType, count);
            }

            const skyLight = this._cachedSkyLight;
            if (skyLight) {
                if (override.skyLightColor !== undefined) skyLight.color.setHex(override.skyLightColor);
                if (override.skyLightIntensity !== undefined) skyLight.intensity = override.skyLightIntensity;
                if (override.skyLightVisible !== undefined) skyLight.visible = override.skyLightVisible;
                if (override.skyLightPosition) skyLight.position.set(override.skyLightPosition.x, override.skyLightPosition.y, override.skyLightPosition.z);
            }
        }

        // 4. Apply Blended Values to systems (Lerped for smoothness)
        const sceneFog = this.scene.fog as THREE.FogExp2;
        if (sceneFog && sceneFog.isFogExp2) {
            sceneFog.color.lerp(targetFogColor, 0.05);

            const camY = this.camera.position.y;
            const FOG_HEIGHT_MIN = 25;
            const FOG_HEIGHT_MAX = 90;
            const heightFactor = 1.0 - Math.max(0, Math.min(1, (camY - FOG_HEIGHT_MIN) / (FOG_HEIGHT_MAX - FOG_HEIGHT_MIN)));
            const baseDistanceDensity = targetFogDensity * 0.0001;
            sceneFog.density = THREE.MathUtils.lerp(sceneFog.density, baseDistanceDensity * heightFactor, 0.05);
        }

        if (this.fog && (this.fog as any).fogMaterial) {
            (this.fog as any).fogMaterial.uniforms.uColor.value.lerp(targetFogColor, 0.05);
        }

        const ambient = this._cachedAmbientLight;
        if (ambient) {
            ambient.intensity = THREE.MathUtils.lerp(ambient.intensity, targetAmbient, 0.05);
        }

        const ground = this._cachedGround;
        if (ground && ground.material) {
            (ground.material as THREE.MeshStandardMaterial).color.lerp(_c2.setHex(targetGroundColor), 0.05);
        }

        // 5. Auto-Weather Sync
        if (!override && zones && zones.length > 0) {
            if (maxWeight > 0.5 && this.weather.type !== activeWeather) {
                this.weather.sync(activeWeather as WeatherType, 2000);
            }
        }
    }

    /**
     * Clears all non-persistent systems and calls their cleanup functions.
     * Uses in-place array filtering (O(N), Zero-GC) to prevent array shifting.
     */
    public clearSystems() {
        let keepCount = 0;

        for (let i = 0; i < this._systemArray.length; i++) {
            const sys = this._systemArray[i];

            if (sys.persistent) {
                // Keep persistent systems in place
                this._systemArray[keepCount++] = sys;
            } else {
                // Cleanup removed system
                if (sys.clear) sys.clear();
                this._systemsMap.delete(sys.id);
            }
        }

        // Truncate the array to the new length (Zero-GC removal)
        this._systemArray.length = keepCount;
    }
}