import * as THREE from 'three';
import { DEFAULT_GRAPHICS } from '../../content/constants';
import { GraphicsSettings } from '../../types';
import { InputManager } from './InputManager';
import { CameraSystem } from '../systems/CameraSystem';
import { WindSystem } from '../systems/WindSystem';
import { WeatherSystem } from '../systems/WeatherSystem';
import { WaterSystem } from '../systems/WaterSystem';
import { PerformanceMonitor } from '../systems/PerformanceMonitor';
import { GEOMETRY, MATERIALS } from '../../utils/assets';

export type { GraphicsSettings };

/**
 * The Engine class acts as the central hub for the 3D environment.
 * Heavily optimized for high performance, GPU fill-rate protection, and Zero-GC.
 */
export class WinterEngine {
    private static instance: WinterEngine | null = null;

    public static getInstance(): WinterEngine {
        if (!this.instance) this.instance = new WinterEngine();
        return this.instance;
    }

    // Core Systems
    public scene: THREE.Scene;
    public camera: CameraSystem;
    public renderer!: THREE.WebGLRenderer;
    public input: InputManager;

    // Environmental Systems (Persistent across scenes)
    public wind: WindSystem;
    public weather: WeatherSystem;
    public water: WaterSystem;

    private sceneStack: THREE.Scene[] = [];
    private settings: GraphicsSettings = { ...DEFAULT_GRAPHICS };

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

    constructor() {
        this.scene = new THREE.Scene();
        this.clock = new THREE.Clock();

        this.initRenderer();

        this.input = new InputManager();
        this.input.enable();

        // Initialize persistent environmental systems
        this.camera = new CameraSystem();
        this.wind = new WindSystem();
        this.weather = new WeatherSystem(this.scene, this.wind, this.camera.threeCamera);
        this.water = new WaterSystem(this.scene);

        window.addEventListener('resize', this.handleResize);
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

        // [VINTERDÖD] Reset pause states on mount to ensure fresh state
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

        WinterEngine.instance = null;
    }

    /**
     * Aggressively disposes of all objects in the current scene.
     * @param includingPersistent If true, even systemic meshes (weather/water) are disposed.
     */
    public clearActiveScene(includingPersistent: boolean = false) {
        const monitor = PerformanceMonitor.getInstance();
        monitor.begin('cleanup');

        const disposableObjects: THREE.Object3D[] = [];

        // 1. Collect all children
        this.scene.children.forEach(child => {
            // Skip persistent systems unless explicitly requested
            const isPersistent = child.userData.isPersistent ||
                child.name.includes('Weather') ||
                child.name.includes('Water');

            if (!isPersistent || includingPersistent) {
                disposableObjects.push(child);
            }
        });

        // Pre-allocate disposal function to ensure Zero-GC loops during cleanup traversal
        const checkMaterial = (m: any) => {
            const isSharedMat = Object.values(MATERIALS).includes(m) || m.userData?.isSharedAsset;
            if (!isSharedMat && m.dispose) m.dispose();
        };

        // 2. Dispose of Geometries and Materials
        for (let i = 0; i < disposableObjects.length; i++) {
            const obj = disposableObjects[i];

            obj.traverse((child: any) => {
                // Safeguard: Check if this object or any children are explicitly protected
                const isProtected = child.userData?.isEngineStatic || child.userData?.isSharedAsset;
                if (isProtected) return;

                if (child.isMesh || child.isLine || child.isPoints || child.isSprite) {
                    if (child.geometry) {
                        // Safeguard: Do not dispose if it's a shared geometry
                        const isSharedGeo = Object.values(GEOMETRY).includes(child.geometry) || child.geometry.userData?.isSharedAsset;
                        if (!isSharedGeo && child.geometry.dispose) child.geometry.dispose();
                    }

                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            const len = child.material.length;
                            for (let m = 0; m < len; m++) {
                                checkMaterial(child.material[m]);
                            }
                        } else {
                            checkMaterial(child.material);
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
        // Move environmental meshes to the new active scene
        if (this.weather && (this.weather as any).reAttach) (this.weather as any).reAttach(this.scene);
        if (this.water && (this.water as any).reAttach) (this.water as any).reAttach(this.scene);
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

        // 2. Environmental Systems Update
        if (!this.isSimulationPaused) {
            monitor.begin('wind');
            this.wind.update(now, dt);
            monitor.end('wind');

            monitor.begin('weather');
            this.weather.update(dt, now);
            monitor.end('weather');

            monitor.begin('water');
            this.water.setWaterDynamics(this.wind.strength, this.wind.current);
            this.water.update(dt, now);
            monitor.end('water');
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

                // Note: Removed the forced this.renderer.shadowMap.needsUpdate here.
                // Three.js handles shadow map autoUpdate organically. Forcing it creates major GPU bottleneck overhead.

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
}