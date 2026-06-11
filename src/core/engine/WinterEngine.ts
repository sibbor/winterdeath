import * as THREE from 'three';
import { SETTINGS_DEFAULT, SKY_SYSTEM } from '../../content/constants';
import { GameSettings } from '../../types/StateTypes';
import { InputManager } from './InputManager';
import { CameraSystem } from '../../systems/CameraSystem';
import { LightSystem } from '../../systems/LightSystem';
import { WindSystem } from '../../systems/WindSystem';
import { WeatherSystem } from '../../systems/WeatherSystem';
import { FogSystem } from '../../systems/FogSystem';
import { WaterSystem } from '../../systems/WaterSystem';
import { PerformanceMonitor } from '../../systems/PerformanceMonitor';
import { AssetPreloader } from '../../systems/AssetPreloader';
import { SkySystem } from '../../systems/SkySystem';
import { EnvironmentManager } from '../../systems/EnvironmentManager';
import { GroundSystem } from '../../systems/GroundSystem';
import { SystemRegistry } from '../../systems/SystemRegistry';
import { GEOMETRY, MATERIALS } from '../../utils/assets';
import { System, SystemID } from '../../systems/System';
import { GroundType, EnvironmentConfig, EnvironmentOverride } from '../../core/engine/EnvironmentalTypes';
import { ChunkManager } from '../world/ChunkManager';
import { clearEffects } from '../../systems/EffectManager';

// Module-level scratchpads for Zero-GC operations
const _traverseStack: THREE.Object3D[] = [];

// Pre-allocated instances for Zero-GC render loop to prevent V8 polymorphic deoptimization.
const _fallbackContext = {
    scene: null as any,
    state: { hitStopTime: 0 },
    playerPos: new THREE.Vector3(0, 0, 0),
    dynamicLights: []
};
const _screenQuadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

export type { GameSettings };

/**
 * The Engine class acts as the central hub for the 3D environment.
 * Heavily optimized for high performance, GPU fill-rate protection, and Zero-GC.
 */
export class WinterEngine {
    private static instance: WinterEngine | null = null;

    // Accepts initial settings to prevent double WebGL context creation on boot
    public static getInstance(initialSettings?: Partial<GameSettings>): WinterEngine {
        if (!this.instance) this.instance = new WinterEngine(initialSettings);
        return this.instance;
    }

    // Max safe shadows & visible lights determined by hardware capabilities
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
    public light: LightSystem;
    public sky: SkySystem;
    public ground: GroundSystem;
    public environment: EnvironmentManager;

    private sceneStack: THREE.Scene[] = [];
    public settings: GameSettings;

    // Lifecycle & Timing
    private lastTime: number = 0;
    private requestID: number | null = null;
    private isRunning: boolean = false;
    private container: HTMLElement | null = null;
    public depthTexture: THREE.DepthTexture | null = null;
    private renderTarget: THREE.WebGLRenderTarget | null = null;
    private screenQuad: THREE.Mesh | null = null;

    // --- FIXED-STEP ACCUMULATOR ---
    /** 60Hz Physics/Logic target in seconds */
    public static readonly FIXED_DELTA = 1 / 60;
    /** Max simulation steps per frame to prevent "Spiral of Death" on lag spikes */
    private static readonly MAX_STEPS = 8;
    private _accumulator: number = 0;

    /** Engine's global visual clock (Milliseconds). Always ticks regardless of pause state. */
    public renderTime: number = 0;
    /** Engine's simulation clock (Milliseconds). Freezes during soft pause or cinematics. */
    public simTime: number = 0;

    // Callbacks
    public onUpdate: ((dt: number, simTime: number, renderTime: number) => void) | null = null;
    public onPreRender: (() => void) | null = null;
    public onRenderOverride: (() => void) | null = null;
    public onRender: (() => void) | null = null; // Legacy alias for onPreRender

    /**
     * Resets the engine context and timing to prevent 'state leakage' between the Camp
     * and high-action Gameplay Sessions. Essential for Zero-GC shader synchronization.
     */
    public clearUpdateContext() {
        this.onUpdateContext = null;
        this.onPreRender = null;
        this.onRenderOverride = null;
        this.onRender = null;
        this.lastTime = performance.now();
        this._accumulator = 0;
        this.renderTime = 0;
        this.simTime = 0;
        this.isSimulationPaused = false;
        this.isRenderingPaused = false;
    }

    // Hard Paused turns off everything (even environment):
    public isRenderingPaused: boolean = false;
    public isSimulationPaused: boolean = false;

    public onUpdateContext: any = null;
    public screenWidth: number = window.innerWidth;
    public screenHeight: number = window.innerHeight;
    public frameCount: number = 0;

    // Cached Sets for O(1) Zero-GC lookups during cleanup
    private sharedGeoSet: Set<any> | null = null;
    private sharedMatSet: Set<any> | null = null;

    // --- HYBRID SYSTEM REGISTRY (Zero-GC) ---
    public readonly systems = new SystemRegistry();
    private _tickableSystems: System[] = []; // Sub-list of systems that implement update()
    private _preallocatedSystemItems = Array.from(
        { length: SystemID.COUNT },
        () => ({ systemId: SystemID.NONE, enabled: false, persistent: false })
    );
    private _cachedSystemsList: { systemId: SystemID; enabled: boolean; persistent: boolean }[] = [];

    // --- CACHED SCENE REFERENCES ---
    private _cachedSkyLight: THREE.DirectionalLight | null = null;
    private _cachedGround: THREE.Mesh | null = null;

    constructor(initialSettings?: Partial<GameSettings>) {
        this.settings = { ...SETTINGS_DEFAULT, ...initialSettings };
        this.scene = new THREE.Scene();

        this.initRenderer();

        this.input = new InputManager();
        this.input.enable();

        this.camera = new CameraSystem();
        this.light = new LightSystem(this.scene, this.maxVisibleLights, this.maxSafeShadows);
        this.wind = new WindSystem();
        this.weather = new WeatherSystem(this.scene, this.wind, this.camera.threeCamera);
        this.fog = new FogSystem(this.scene, this.wind, this.camera.threeCamera);
        this.water = new WaterSystem(this.scene);
        this.sky = new SkySystem();
        this.ground = new GroundSystem();

        // Wire GroundSystem into WaterSystem so each addWaterBody auto-registers its spatial
        // zone in GroundSystem — enabling the buoyancy proximity gate without extra plumbing.
        this.water.setGroundRef(this.ground);

        // 3. Environment Orchestrator (The Master Sync System)
        this.environment = new EnvironmentManager(
            this.sky, this.fog, this.weather, this.water, this.light, this.wind, this.ground
        );

        // --- GATE SYSTEMS TO VARIABLE STEP (Visual Smoothness) ---
        this.wind.isFixedStep = false;
        this.weather.isFixedStep = false;
        this.water.isFixedStep = false;

        (window as any).WinterEngineInstance = this;

        this.registerSystem(SystemID.CAMERA, this.camera);
        this.registerSystem(SystemID.INPUT, this.input);
        this.registerSystem(SystemID.GROUND, this.ground, false);
        this.registerSystem(SystemID.WATER, this.water, false);
        this.registerSystem(SystemID.WEATHER, this.weather, false);
        this.registerSystem(SystemID.FOG, this.fog, false);
        this.registerSystem(SystemID.LIGHT, this.light, false);
        this.registerSystem(SystemID.ENVIRONMENT_MANAGER, this.environment);

        // Perform init logic once system is assigned a property
        this.sky.init();

        // Register the singleton monitor as a passive system
        this.registerSystem(SystemID.PERFORMANCE_MONITOR, PerformanceMonitor.getInstance());

        // Register the AssetPreloader as a passive system
        this.registerSystem(SystemID.ASSET_PRELOADER, AssetPreloader);

        window.addEventListener('resize', this.handleResize);
    }

    private _setHardwareLimits() {
        const maxTextures = this.renderer.capabilities.maxTextures;

        // Reserve slots for PBR, Water, EnvMaps, etc.
        const safeShadowLimit = Math.max(0, maxTextures - 12);
        this.maxSafeShadows = 1; //Math.min(LIGHT_SYSTEM.MAX_SHADOW_CASTING_LIGHTS, safeShadowLimit);

        // We trust the user's UI settings for performance scaling, but we establish the absolute engine bounds here.
        this.maxVisibleLights = 3;//LIGHT_SYSTEM.MAX_VISIBLE_LIGHTS;

        console.log(`[WinterEngine] GPU MaxTextures: ${maxTextures}. Max Visible Lights: ${this.maxVisibleLights}. Max Allowed Shadows: ${this.maxSafeShadows}`);
    }

    /**
     * Initializes the WebGLRenderer with high-performance parameters.
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
        this._setHardwareLimits();

        // Strictly respect the user's graphical settings from the UI
        this.renderer.setPixelRatio(this.settings.pixelRatio || 1);
        this.renderer.setSize(window.innerWidth, window.innerHeight);

        this.renderer.shadowMap.enabled = this.settings.shadows;
        this.renderer.shadowMap.type = this.settings.shadowMapType as THREE.ShadowMapType;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;

        // Depth Texture Support for Soft Fog/Particles
        if (this.settings.volumetricFog) {
            this.depthTexture = new THREE.DepthTexture(window.innerWidth, window.innerHeight);
            this.renderTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
                depthTexture: this.depthTexture,
                depthBuffer: true
            });

            // Fullscreen quad for blitting the result back to the screen
            const quadGeo = new THREE.PlaneGeometry(2, 2);
            const quadMat = new THREE.MeshBasicMaterial({ map: this.renderTarget.texture });
            this.screenQuad = new THREE.Mesh(quadGeo, quadMat);
        }

        // The canvas never needs pointer events on any device.
        // All interactions are captured by the GameSessionUI click-catcher overlay,
        // ensuring the HUD and custom cursors remain reachable.
        this.renderer.domElement.style.pointerEvents = 'none';

        // Vinterdöd Fix: Disable auto-reset to allow accumulation across multiple passes
        // (Volumetric Fog, UI overlays, etc.) in a single engine frame.
        this.renderer.info.autoReset = false;
    }

    public updateSettings(newSettings: Partial<GameSettings>) {
        if (!newSettings) return;
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

        // Prevent GPU memory leaks (VRAM bloat) when changing graphics settings.
        // WebGLRenderer.dispose() does not automatically free manually created FBOs or Geometries.
        if (this.renderTarget) {
            this.renderTarget.dispose();
            this.renderTarget = null;
        }
        if (this.depthTexture) {
            this.depthTexture.dispose();
            this.depthTexture = null;
        }
        if (this.screenQuad) {
            this.screenQuad.geometry.dispose();
            (this.screenQuad.material as THREE.Material).dispose();
            this.screenQuad = null;
        }

        this.renderer.dispose();
        if (parent) parent.removeChild(oldDom);

        this.initRenderer();

        if (parent) parent.appendChild(this.renderer.domElement);
        this.handleResize();
    }

    private applySettings() {
        this.renderer.setPixelRatio(this.settings.pixelRatio || 1);

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
                        for (let i = 0; i < obj.material.length; i++) {
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

        // Vinterdöd Cold-Boot Fix: Force an initial sync of all environmental systems
        // to the default scene to ensure fog, sky, and weather are visible on launch.
        this.syncSystemsToScene(this.scene);

        this.start();
    }

    public start() {
        if (!this.isRunning) {
            this.isRunning = true;
            this.lastTime = performance.now();
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

        // Hard cleanup of GPU buffers
        if (this.renderTarget) this.renderTarget.dispose();
        if (this.depthTexture) this.depthTexture.dispose();
        if (this.screenQuad) {
            this.screenQuad.geometry.dispose();
            (this.screenQuad.material as THREE.Material).dispose();
        }

        this.clearActiveScene(true);
        this.renderer.dispose();

        this.sceneStack.length = 0;
        this.onUpdate = null;
        this.onPreRender = null;
        this.onRenderOverride = null;
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
        const monitor = this.systems.performanceMonitor!;
        monitor.begin('cleanup');

        const disposableObjects: THREE.Object3D[] = [];
        const children = this.scene.children;

        // 1. Collect all children (Zero-GC Loop)
        for (let i = 0; i < children.length; i++) {
            const child = children[i];

            const isPersistent = child.userData.isPersistent || child.userData.isSystemic;

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

                if (child.isLight) {
                    if (child.shadow && (child.shadow as any).map) {
                        (child.shadow as any).map.dispose();
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
        this._cachedGround = null;

        // --- VINTERDÖD FIX: Clear static chunk cache to prevent leaks across sectors ---
        ChunkManager.clear();
        if (this.light) this.light.clear();
        clearEffects();

        monitor.end('cleanup');
        if (monitor.consoleLoggingEnabled) {
            console.log(`[WinterEngine] Scene Cleanup Complete. Disposed ${disposableObjects.length} root objects.`);
        }
    }

    private _activeScene: THREE.Scene | null = null;

    // --- Scene Management ---

    public mountScene(scene: THREE.Scene, env?: any, groundType: number = 0, isWarmup: boolean = false) {
        this.scene = scene;
        this._activeScene = scene;

        // --- CONSOLIDATED ENVIRONMENTAL LIFECYCLE ---
        // 1. Clear previous state (orphaned buffers, decals, etc.)
        this.environment.clear();

        // 2. Synchronize new scene context
        if (env) {
            this.environment.sync(env, groundType, scene, isWarmup);
        }

        // 3. Re-attach all tickable systems (Footprints, FX, etc.)
        this.syncSystemsToScene(scene);

        this.applySettings();
        this.cacheSceneReferences();
    }

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
        const systems = this._tickableSystems;
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
        this._cachedGround = null;

        _traverseStack.length = 0;
        _traverseStack.push(this.scene);

        while (_traverseStack.length > 0) {
            const node = _traverseStack.pop() as THREE.Object3D;

            if (node.name === SKY_SYSTEM.SKY_LIGHT) this._cachedSkyLight = node as THREE.DirectionalLight;
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

        if (this.renderTarget) {
            this.renderTarget.setSize(width, height);
            if (this.depthTexture) {
                this.depthTexture.image.width = width;
                this.depthTexture.image.height = height;
            }
        }
    };

    /**
     * Main animation loop
     */
    private animate = () => {
        if (!this.isRunning) return;
        try {
            this.requestID = requestAnimationFrame(this.animate);
        } catch (e) {
            //console.error(e);
        }

        // Vinterdöd Hardening: Manual reset of renderer stats for multi-pass accuracy
        this.renderer.info.reset();

        this.frameCount++;
        const now = performance.now();
        const frameStart = now;

        // --- 1. RAW DELTA CALCULATION ---
        const realDelta = Math.min(0.25, (now - this.lastTime) / 1000);
        this.lastTime = now;

        // Zero-GC Fallback Context
        if (!this.onUpdateContext) {
            _fallbackContext.scene = this.scene;
        }
        const context = this.onUpdateContext || _fallbackContext;
        const state = context.state;

        // --- ENGINE HIT-STOP (Micro-Freeze) ---
        //  SAFETY: Decrement hit-stop using raw realDelta (wall-clock) 
        // to prevent slow-mo logic causing elongated freezes (The "Matrix Lag" fix).
        const hitStop = (state && state.hitStopTime) ? state.hitStopTime : 0;
        if (hitStop > 0) {
            state.hitStopTime -= realDelta * 1000;
            // Early exit logic simulation but keep rendering/visuals
        }

        // --- 2. ACCUMULATE TIME ---
        // Only accumulate logic time if we are not currently micro-frozen
        if (hitStop <= 0) {
            this._accumulator += realDelta;
        }

        const monitor = this.systems.performanceMonitor!;
        monitor.startFrame();

        const FIXED_DT = WinterEngine.FIXED_DELTA;

        // --- 3. FIXED-STEP LOGIC HEARTBEAT (60Hz) ---
        // Decouples physics/AI/movement from rendering FPS.
        let steps = 0;
        monitor.begin('logic_simulation');
        while (this._accumulator >= FIXED_DT) {
            steps++;

            // Increment simulation clock by EXACT milliseconds to prevent drift
            if (!this.isSimulationPaused) {
                this.simTime += FIXED_DT * 1000;
            }

            // A. Trigger GameSessionLoop Logic (Always uses FIXED_DT in seconds)
            if (this.onUpdate) {
                this.onUpdate(FIXED_DT, this.simTime, this.renderTime);
            }

            // B. Update Logic Systems (Fixed-Step)
            this.updateSystems(context, FIXED_DT, true);

            // Vinterdöd Hardening: Track logic simulation health
            monitor.tickLogic();

            this._accumulator -= FIXED_DT;

            // Spiral of Death Protection
            if (steps >= WinterEngine.MAX_STEPS) {
                this._accumulator = 0; // Drop remaining time to catch up
                break;
            }
        }
        monitor.end('logic_simulation');

        // --- 4. VARIABLE RENDER CLOCK AND UPDATES ---
        // Environmental visual smoothing, camera tracking, and UI sync.
        this.renderTime += realDelta * 1000;

        // A. Update Visual Systems (Variable-Rate)
        this.updateSystems(context, realDelta, false);

        // B. Camera Update (Smooth Tracking)
        monitor.begin('camera');
        this.camera.update(context, realDelta, this.simTime, this.renderTime);
        monitor.end('camera');

        // --- 5. RENDER PASS ---
        monitor.begin('render');
        if (!this.isRenderingPaused) {
            // A. TRIGGER PRE-RENDER HOOKS (Buffer updates, logic that needs to run right before draw)
            if (this.onPreRender) this.onPreRender();
            if (this.onRender) this.onRender(); // Legacy support

            // B. MAIN RENDER PASS
            if (this.onRenderOverride) {
                this.onRenderOverride();
            } else if (this.renderTarget && this.settings.volumetricFog) {
                // Prevent Feedback Loop
                const fogMesh = this.fog?.fogMesh;
                const fogWasVisible = fogMesh ? fogMesh.visible : false;

                if (fogMesh && fogWasVisible) {
                    fogMesh.visible = false;
                }

                // 1. Render Scene to Target (Captures Depth from opaque geometry)
                this.renderer.setRenderTarget(this.renderTarget);
                try {
                    this.renderer.render(this.scene, this.camera.threeCamera);
                } catch (e) {
                    console.error("[WebGL Render Crash - Pass 1]", e);
                }

                // 2. Render Target Texture to Screen (Blit)
                this.renderer.setRenderTarget(null);
                if (this.screenQuad) {
                    const oldAutoClear = this.renderer.autoClear;
                    this.renderer.autoClear = false;

                    // Render the quad using the pre-allocated OrthographicCamera
                    try {
                        this.renderer.render(this.screenQuad as any, _screenQuadCamera);
                    } catch (e) {
                        console.error("[WebGL Render Crash - Blit Pass]", e);
                    }

                    // 3. Render Volumetric Fog
                    if (fogMesh && fogWasVisible) {
                        fogMesh.visible = true;
                        try {
                            this.renderer.render(fogMesh, this.camera.threeCamera);
                        } catch (e) {
                            console.error("[WebGL Render Crash - Fog Pass]", e);
                        }
                    }

                    this.renderer.autoClear = oldAutoClear;
                }
            } else {
                monitor.begin('render_draw');
                try {
                    this.renderer.render(this.scene, this.camera.threeCamera);
                } catch (e) {
                    console.error("[WebGL Render Crash]", e);
                }
                monitor.end('render_draw');
            }
        }
        monitor.end('render');

        monitor.setRendererStats(this.renderer.info);
        const totalTime = performance.now() - frameStart;
        monitor.printIfHeavy('Game Engine Performance', totalTime, 50);
    };

    /**
     * Resets the update loop timing to prevent large dt spikes after window refocus.
     */
    public resetTime = () => {
        this.lastTime = performance.now();
        this._accumulator = 0;
    };

    public getSettings(): GameSettings {
        return { ...this.settings };
    }

    private _updateRegistryProp(id: SystemID, sys: any) {
        switch (id) {
            case SystemID.SECTOR: this.systems.sector = sys; break;
            case SystemID.CINEMATIC: this.systems.cinematic = sys; break;
            case SystemID.HUD: this.systems.hud = sys; break;
            case SystemID.PERFORMANCE_MONITOR: this.systems.performanceMonitor = sys; break;
            case SystemID.ASSET_PRELOADER: this.systems.assetPreloader = sys; break;
            case SystemID.ENVIRONMENT_MANAGER: this.systems.environment = sys; break;
            case SystemID.SKY: this.systems.sky = sys; break;
            case SystemID.WIND: this.systems.wind = sys; break;
            case SystemID.WEATHER: this.systems.weather = sys; break;
            case SystemID.FOG: this.systems.fog = sys; break;
            case SystemID.WATER: this.systems.water = sys; break;
            case SystemID.GROUND: this.systems.ground = sys; break;
            case SystemID.LIGHT: this.systems.light = sys; break;
            case SystemID.CAMERA: this.systems.camera = sys; break;
            case SystemID.INPUT: this.systems.input = sys; break;
            case SystemID.SPATIAL_GRID: this.systems.spatialGrid = sys; break;
            case SystemID.WORLD_STREAMER: this.systems.worldStreamer = sys; break;
            case SystemID.NAVIGATION: this.systems.navigation = sys; break;
            case SystemID.OCCLUSION: this.systems.occlusion = sys; break;
            case SystemID.TRIGGER_HANDLER: this.systems.triggerHandler = sys; break;
            case SystemID.TRIGGER_SYSTEM: this.systems.triggerSystem = sys; break;
            case SystemID.LOOT: this.systems.loot = sys; break;
            case SystemID.FX: this.systems.fx = sys; break;
            case SystemID.PARTICLE: this.systems.particle = sys; break;
            case SystemID.FOOTPRINT: this.systems.footprint = sys; break;
            case SystemID.PLAYER_STATS: this.systems.playerStats = sys; break;
            case SystemID.PLAYER_MOVEMENT: this.systems.playerMovement = sys; break;
            case SystemID.PLAYER_COMBAT: this.systems.playerCombat = sys; break;
            case SystemID.PLAYER_MANAGER: this.systems.playerManager = sys; break;
            case SystemID.INTERACTION: this.systems.interaction = sys; break;
            case SystemID.PERK_SYSTEM: this.systems.perkSystem = sys; break;
            case SystemID.FAMILY: this.systems.family = sys; break;
            case SystemID.VEHICLE_MANAGER: this.systems.vehicleManager = sys; break;
            case SystemID.VEHICLE_MOVEMENT: this.systems.vehicleMovement = sys; break;
            case SystemID.WEAPON_HANDLER: this.systems.weaponHandler = sys; break;
            case SystemID.PROJECTILE: this.systems.projectile = sys; break;
            case SystemID.CHALLENGE_TRACKER: this.systems.challengeTracker = sys; break;
            case SystemID.DAMAGE_NUMBER: this.systems.damageNumber = sys; break;
            case SystemID.CAREER_STATS: this.systems.careerStats = sys; break;
            case SystemID.ENEMY_MANAGER: this.systems.enemyManager = sys; break;
            case SystemID.ENEMY_SYSTEM: this.systems.enemySystem = sys; break;
            case SystemID.ENEMY_AI: this.systems.enemyAI = sys; break;
            case SystemID.ENEMY_DETECTION: this.systems.enemyDetection = sys; break;
            case SystemID.ENEMY_WAVE_SYSTEM: this.systems.enemyWave = sys; break;
            case SystemID.DEATH: this.systems.death = sys; break;
            case SystemID.CAMP_EFFECT_MANAGER: this.systems.campEffects = sys; break;
            case SystemID.CAMP_CHATTER: this.systems.campChatter = sys; break;
            case SystemID.CAMP_FAMILY_ANIMATION: this.systems.campFamilyAnimation = sys; break;
            case SystemID.DISCOVERY_SYSTEM: this.systems.discovery = sys; break;
        }
    }

    private _getRegistryProp(id: SystemID): any {
        switch (id) {
            case SystemID.SECTOR: return this.systems.sector;
            case SystemID.CINEMATIC: return this.systems.cinematic;
            case SystemID.HUD: return this.systems.hud;
            case SystemID.PERFORMANCE_MONITOR: return this.systems.performanceMonitor;
            case SystemID.ASSET_PRELOADER: return this.systems.assetPreloader;
            case SystemID.ENVIRONMENT_MANAGER: return this.systems.environment;
            case SystemID.SKY: return this.systems.sky;
            case SystemID.WIND: return this.systems.wind;
            case SystemID.WEATHER: return this.systems.weather;
            case SystemID.FOG: return this.systems.fog;
            case SystemID.WATER: return this.systems.water;
            case SystemID.GROUND: return this.systems.ground;
            case SystemID.LIGHT: return this.systems.light;
            case SystemID.CAMERA: return this.systems.camera;
            case SystemID.INPUT: return this.systems.input;
            case SystemID.SPATIAL_GRID: return this.systems.spatialGrid;
            case SystemID.WORLD_STREAMER: return this.systems.worldStreamer;
            case SystemID.NAVIGATION: return this.systems.navigation;
            case SystemID.OCCLUSION: return this.systems.occlusion;
            case SystemID.TRIGGER_HANDLER: return this.systems.triggerHandler;
            case SystemID.TRIGGER_SYSTEM: return this.systems.triggerSystem;
            case SystemID.LOOT: return this.systems.loot;
            case SystemID.FX: return this.systems.fx;
            case SystemID.PARTICLE: return this.systems.particle;
            case SystemID.FOOTPRINT: return this.systems.footprint;
            case SystemID.PLAYER_STATS: return this.systems.playerStats;
            case SystemID.PLAYER_MOVEMENT: return this.systems.playerMovement;
            case SystemID.PLAYER_COMBAT: return this.systems.playerCombat;
            case SystemID.PLAYER_MANAGER: return this.systems.playerManager;
            case SystemID.INTERACTION: return this.systems.interaction;
            case SystemID.PERK_SYSTEM: return this.systems.perkSystem;
            case SystemID.FAMILY: return this.systems.family;
            case SystemID.VEHICLE_MANAGER: return this.systems.vehicleManager;
            case SystemID.VEHICLE_MOVEMENT: return this.systems.vehicleMovement;
            case SystemID.WEAPON_HANDLER: return this.systems.weaponHandler;
            case SystemID.PROJECTILE: return this.systems.projectile;
            case SystemID.CHALLENGE_TRACKER: return this.systems.challengeTracker;
            case SystemID.DAMAGE_NUMBER: return this.systems.damageNumber;
            case SystemID.CAREER_STATS: return this.systems.careerStats;
            case SystemID.ENEMY_MANAGER: return this.systems.enemyManager;
            case SystemID.ENEMY_SYSTEM: return this.systems.enemySystem;
            case SystemID.ENEMY_AI: return this.systems.enemyAI;
            case SystemID.ENEMY_DETECTION: return this.systems.enemyDetection;
            case SystemID.ENEMY_WAVE_SYSTEM: return this.systems.enemyWave;
            case SystemID.DEATH: return this.systems.death;
            case SystemID.CAMP_EFFECT_MANAGER: return this.systems.campEffects;
            case SystemID.CAMP_CHATTER: return this.systems.campChatter;
            case SystemID.CAMP_FAMILY_ANIMATION: return this.systems.campFamilyAnimation;
            case SystemID.DISCOVERY_SYSTEM: return this.systems.discovery;
            default: return null;
        }
    }

    public registerSystem(id: SystemID, sys: any, isTickable: boolean = true) {
        if (!sys) return;

        // --- STRICT MISMATCH VALIDATION ---
        if (sys.systemId !== undefined && sys.systemId !== id) {
            const errorMsg = `[WinterEngine] Critical error: System ID mismatch when trying to register ${sys.id || 'unknown system'} (ID: ${sys.systemId}) as ID ${id}. This prevents cross-wiring bugs.`;
            console.error(errorMsg);
            if (process.env.NODE_ENV === 'development') {
                throw new Error(errorMsg);
            }
        }

        this._updateRegistryProp(id, sys);
        if (isTickable && typeof sys.update === 'function') {
            this._tickableSystems.push(sys);
        }
    }

    public unregisterSystem(id: SystemID) {
        const sys = this._getRegistryProp(id);
        if (sys) {
            this._updateRegistryProp(id, null);
            const idx = this._tickableSystems.indexOf(sys);
            if (idx !== -1) {
                this._tickableSystems[idx] = this._tickableSystems[this._tickableSystems.length - 1];
                this._tickableSystems.pop();
            }
            if (sys.clear) sys.clear();
        }
    }

    public getSystems() {
        let count = 0;
        for (let i = 0; i < SystemID.COUNT; i++) {
            const sys = this._getRegistryProp(i as SystemID);
            if (sys && sys.systemId !== SystemID.PERFORMANCE_MONITOR && typeof sys.update === 'function') {
                const item = this._preallocatedSystemItems[count];
                item.systemId = sys.systemId;
                item.enabled = sys.enabled;
                item.persistent = sys.persistent;
                this._cachedSystemsList[count] = item;
                count++;
            }
        }
        this._cachedSystemsList.length = count;
        return this._cachedSystemsList;
    }

    public clearSystems() {
        for (let i = 0; i < SystemID.COUNT; i++) {
            const sys = this._getRegistryProp(i as SystemID);
            if (sys && !sys.persistent) {
                this.unregisterSystem(i as SystemID);
            }
        }
    }

    /**
     * Triggers a global micro-freeze for impact feel.
     * During this window, logic/physics clocks are suspended but rendering continues.
     */
    public triggerHitStop(ms: number) {
        const context = this.onUpdateContext;
        if (context && context.state) {
            context.state.hitStopTime = Math.max(context.state.hitStopTime || 0, ms);
        }
    }

    /**
     * Unified system update loop (Zero-GC)
     * Provision standardized timing: env systems get renderTime; simulation systems get simTime.
     */
    private updateSystems(context: any, delta: number, fixedOnly?: boolean): void {
        const monitor = this.systems.performanceMonitor!;

        // Hard-gate systems during loading/paused rendering
        // Prevents systems like CampChatter or Weather from running and playing sounds 
        // during full-screen transitions.
        if (this.isRenderingPaused) return;

        const systems = this._tickableSystems;
        const len = systems.length;

        for (let i = 0; i < len; i++) {
            const sys = systems[i];
            if (sys.enabled === false) continue;

            const systemId = sys.systemId;

            // --- FIXED-STEP & CLOCK GATING ---
            const isFixed = sys.isFixedStep || false;

            // Skip systems that don't match the current loop cycle
            if (fixedOnly !== undefined && isFixed !== fixedOnly) continue;

            // Vinterdöd Hardening: Generalized pause logic.
            // Logic systems (isFixedStep) are paused; Visual/Narrative systems (Cinematics, Environment) bypass pause.
            if (this.isSimulationPaused && sys.isFixedStep) continue;

            monitor.begin(sys.id);
            // Architectural Correctness: Only call update if it exists
            if (sys.update) {
                sys.update(context, delta, this.simTime, this.renderTime);
            }
            monitor.end(sys.id);
        }
    }

    public setSystemEnabled(id: SystemID, enabled: boolean) {
        const sys = this._getRegistryProp(id);
        if (sys) {
            sys.enabled = enabled;
        }
    }

    /**
     * Synchronizes the entire environmental suite.
     * Delegates to EnvironmentManager for authoritative state control.
     */
    public syncEnvironment(env: EnvironmentConfig | EnvironmentOverride, groundType?: GroundType, targetScene?: THREE.Scene) {
        const scene = targetScene || this.scene;
        const isWarmup = !!targetScene && targetScene !== this.scene;

        // VINTERDÖD FIX: Delegation of Authority
        this.environment.sync(env as EnvironmentConfig, groundType, scene, isWarmup);

        // Update camera FOV if provided (managed by CameraSystem but synced here)
        if (env.fov !== undefined) {
            this.camera.set('fov', env.fov);
        }

        if (isWarmup) return; // Skip recaching during background warmups

        this.cacheSceneReferences();
    }

    public clear() {
        if (this.renderer) this.renderer.dispose();
        this.scene.clear();
    }
}
