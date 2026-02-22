import * as THREE from 'three';
import { DEFAULT_GRAPHICS } from '../../content/constants';
import { GraphicsSettings } from '../../types';
export type { GraphicsSettings };
import { InputManager } from './InputManager';
import { WindSystem } from '../systems/WindSystem';
import { WeatherSystem } from '../systems/WeatherSystem';
import { WaterSystem } from '../systems/WaterSystem';

/**
 * The Engine class acts as the central hub for the 3D environment.
 * Heavily optimized for high performance, GPU fill-rate protection, and Zero-GC.
 */
export class Engine {
    private static instance: Engine | null = null;

    public static getInstance(): Engine {
        if (!this.instance) this.instance = new Engine();
        return this.instance;
    }

    // Core Systems
    public scene: THREE.Scene;
    public camera: THREE.PerspectiveCamera;
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

    constructor() {
        this.scene = new THREE.Scene();
        this.clock = new THREE.Clock();

        // Setup Camera with a standard 50deg FOV
        this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 40, 20);
        this.camera.lookAt(0, 0, 0);

        this.initRenderer();

        this.input = new InputManager();
        this.input.enable();

        // Initialize persistent environmental systems
        this.wind = new WindSystem();
        this.weather = new WeatherSystem(this.scene, this.wind);
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

            // [VINTERDÖD] Force material recompilation for shadows
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

        this.renderer.dispose();

        // [VINTERDÖD] Aggressive Garbage Collection flagging
        // Helps the browser instantly reclaim VRAM and RAM when switching main states
        this.sceneStack.length = 0;
        this.onUpdate = null;
        this.onRender = null;

        Engine.instance = null;
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
        // [VINTERDÖD] Move environmental meshes to the new active scene
        if (this.weather && (this.weather as any).reAttach) (this.weather as any).reAttach(this.scene);
        if (this.water && (this.water as any).reAttach) (this.water as any).reAttach(this.scene);
    }

    private handleResize = () => {
        if (!this.container) return;
        const width = this.container.clientWidth || window.innerWidth;
        const height = this.container.clientHeight || window.innerHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    };

    /**
     * Main animation loop
     */
    private animate = () => {
        if (!this.isRunning) return;
        this.requestID = requestAnimationFrame(this.animate);

        // Delta time clamping prevents physics-warp during frame drops
        const dt = Math.min(this.clock.getDelta(), 0.05);
        const now = performance.now();

        // 1. Environmental Systems Update
        this.wind.update(now, dt);
        this.weather.update(dt, now);
        this.water.setWaterDynamics(this.wind.strength, this.wind.current);
        this.water.update(dt, now);

        // 2. Logic Update
        if (this.onUpdate) this.onUpdate(dt);

        // 3. Render Pass
        if (!this.isRenderingPaused) {
            if (this.onRender) {
                this.onRender();
            } else {
                this.renderer.render(this.scene, this.camera);
            }
        }
    };

    /**
     * Note: Returns a new object. Only call in UI/Menus, not in the game loop.
     */
    public getSettings(): GraphicsSettings {
        return { ...this.settings };
    }
}