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
import { NoiseType } from '../../entities/enemies/EnemyTypes';

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

    // Cached Sets for O(1) Zero-GC lookups during cleanup
    private sharedGeoSet: Set<any> | null = null;
    private sharedMatSet: Set<any> | null = null;

    // --- HYBRID SYSTEM REGISTRY (Zero-GC) ---
    private _systemsMap: Map<string, System> = new Map();
    private _systemArray: System[] = [];

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
        // devicePixelRatio can be 2.0 or 3.0 on modern devices.
        // We cap the base ratio at 1.5 to prevent absurd 4K+ internal resolutions.
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
        // Re-apply the resolution logic when settings change
        const maxRatio = Math.min(window.devicePixelRatio, 1.5);
        this.renderer.setPixelRatio(Math.min(maxRatio, this.settings.pixelRatio || 1));

        const shadowsEnabled = this.settings.shadows;
        const shadowType = this.settings.shadowMapType as THREE.ShadowMapType;

        if (this.renderer.shadowMap.enabled !== shadowsEnabled || this.renderer.shadowMap.type !== shadowType) {
            this.renderer.shadowMap.enabled = shadowsEnabled;
            this.renderer.shadowMap.type = shadowType;

            // Force material recompilation for shadows
            // Zero-GC loop, avoids allocating functions in a massive scene traversal
            this.scene.traverse((obj: any) => {
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
            });
        }
    }

    public mount(container: HTMLElement) {
        this.container = container;
        if (this.renderer.domElement.parentNode && this.renderer.domElement.parentNode !== container) {
            this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
        }
        container.appendChild(this.renderer.domElement);
        this.handleResize();

        // Reset pause states on mount to ensure fresh state
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
        // Helps the browser instantly reclaim VRAM and RAM when switching main states
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

            // Added Fog to the persistent protection list
            const isPersistent = child.userData.isPersistent ||
                child.name.indexOf('Weather') !== -1 ||
                child.name.indexOf('Fog') !== -1 ||
                child.name.indexOf('Water') !== -1 ||
                child.name.indexOf('Wind') !== -1;

            if (!isPersistent || includingPersistent) {
                disposableObjects.push(child);
            }
        }

        // Initialize Sets lazily to avoid heavy computations at engine boot
        if (!this.sharedGeoSet) this.sharedGeoSet = new Set(Object.values(GEOMETRY));
        if (!this.sharedMatSet) this.sharedMatSet = new Set(Object.values(MATERIALS));

        // 2. Dispose of Geometries and Materials
        for (let i = 0; i < disposableObjects.length; i++) {
            const obj = disposableObjects[i];

            obj.traverse((child: any) => {
                // Safeguard: Check if this object or any children are explicitly protected
                const isProtected = child.userData?.isEngineStatic || child.userData?.isSharedAsset;
                if (isProtected) return;

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
            });

            // If it's a shared asset group, we still remove it from scene but DON'T traverse for disposal
            this.scene.remove(obj);
        }

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
    }

    public popScene() {
        if (this.sceneStack.length > 0) {
            this.scene = this.sceneStack.pop()!;
            this.syncSystemsToScene();
            this.applySettings();
        }
    }

    private syncSystemsToScene() {
        const systems = this._systemArray;
        const len = systems.length;

        for (let i = 0; i < len; i++) {
            const sys = systems[i];
            if (sys.reAttach) sys.reAttach(this.scene);
        }
    }

    private handleResize = () => {
        if (!this.container) return;
        const width = this.container.clientWidth || window.innerWidth;
        const height = this.container.clientHeight || window.innerHeight;

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
        // This must happen BEFORE the camera/fx update to avoid 1-frame lag.
        monitor.begin('logic');
        if (this.onUpdate) this.onUpdate(dt);
        monitor.end('logic');

        // 2. High-Performance System Logic (Unified Registry)
        if (!this.isSimulationPaused) {
            this.updateSystems(this.onUpdateContext, dt, now);
        }

        // 3. Camera Update — runs after all environment systems so thunder/weather
        // effects applied this frame (shake, FOV changes) are reflected immediately.
        monitor.begin('camera');
        this.camera.update(dt, now);
        monitor.end('camera');

        // 4. Render Pass
        monitor.begin('render');
        if (!this.isRenderingPaused) {
            if (this.onRender) {
                this.onRender();
            } else {
                // Split standard render into setup (CPU) and draw (GPU/Driver payload)
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

        // Feed renderer stats into the monitor — used both for heavy-frame logs and DebugDisplay live view
        monitor.setRendererStats(this.renderer.info);

        const totalTime = performance.now() - frameStart;
        monitor.printIfHeavy('Game Engine Performance', totalTime, 50);
    };

    /**
     * Note: Returns a new object. Only call in UI/Menus, not in the game loop.
     */
    public getSettings(): GraphicsSettings {
        return { ...this.settings };
    }

    /**
     * Registers a new system. Adds to Map for O(1) lookup and flat Array for Zero-GC iteration.
     */
    public registerSystem(system: System) {
        if (!this._systemsMap.has(system.id)) {
            this._systemsMap.set(system.id, system);
            this._systemArray.push(system);
        }
    }

    /**
     * Unregisters a system using Swap-and-Pop for O(1) array removal (Zero-GC).
     */
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

    /**
     * Type-safe system retrieval from the Map.
     */
    public getSystem<T extends System>(id: string): T | null {
        return (this._systemsMap.get(id) as T) || null;
    }

    /**
     * Returns the flat system array for the main update loop (Zero-GC).
     */
    public getSystems(): System[] {
        return this._systemArray;
    }

    /**
     * Centralized high-performance system update loop.
     * Skips disabled systems and handles performance monitoring automatically.
     * @param context Usually GameSessionLogic or null (for Camp)
     * @param dt Delta time in seconds
     * @param now performance.now() timestamp
     */
    public updateSystems(context: any, dt: number, now: number): void {
        const monitor = PerformanceMonitor.getInstance();
        const systems = this._systemArray;
        const len = systems.length;

        for (let i = 0; i < len; i++) {
            const sys = systems[i];

            // Fast skip for disabled systems
            if (sys.enabled === false) continue;

            const id = sys.id;
            monitor.begin(id);
            sys.update(context, dt, now);
            monitor.end(id);
        }
    }

    /**
     * Synchronizes the enabled state of a system.
     */
    public setSystemEnabled(id: string, enabled: boolean) {
        const sys = this._systemsMap.get(id);
        if (sys) {
            sys.enabled = enabled;
        }
    }

    /**
     * Broadcasts a world noise event to the EnemyDetectionSystem.
     * Centralized entry point for Combat, Projectiles, and Player movement.
     */
    public makeNoise(pos: THREE.Vector3, type: NoiseType, radius?: number) {
        const sys = this.getSystem<any>('EnemyDetectionSystem');
        if (sys && sys.makeNoise) {
            sys.makeNoise(pos, type, radius);
        }
    }

    /**
     * Clears all registered systems and calls their cleanup functions.
     */
    public clearSystems() {
        // Zero-GC loop
        const len = this._systemArray.length;
        for (let i = 0; i < len; i++) {
            const sys = this._systemArray[i];
            if (sys.clear) sys.clear();
        }
        this._systemArray.length = 0;
        this._systemsMap.clear();
    }
}