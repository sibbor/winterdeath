import * as THREE from 'three';
import { DEFAULT_GRAPHICS } from '../../content/constants';
import { GraphicsSettings } from '../../types';
export type { GraphicsSettings };
import { InputManager } from './InputManager';

/**
 * The Engine class acts as the central hub for the 3D environment.
 * Optimized for high performance and clean resource management.
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
    public renderer!: THREE.WebGLRenderer; // Assigned via initRenderer
    public input: InputManager;

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

        window.addEventListener('resize', this.handleResize);
    }

    /**
     * Initializes or re-initializes the WebGLRenderer.
     * Note: Antialiasing is a context parameter and requires renderer recreation.
     */
    private initRenderer() {
        const params: THREE.WebGLRendererParameters = {
            antialias: this.settings.antialias,
            powerPreference: 'high-performance',
            precision: 'highp'
        };

        this.renderer = new THREE.WebGLRenderer(params);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.settings.pixelRatio));
        this.renderer.setSize(window.innerWidth, window.innerHeight);

        // Shadow mapping setup
        this.renderer.shadowMap.enabled = this.settings.shadows;
        this.renderer.shadowMap.type = this.settings.shadowMapType as THREE.ShadowMapType;

        // Color space management for modern displays
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

        // Deep dispose to free GPU memory
        this.renderer.dispose();
        if (parent) parent.removeChild(oldDom);

        this.initRenderer();

        if (parent) parent.appendChild(this.renderer.domElement);
        this.handleResize();
    }

    private applySettings() {
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.settings.pixelRatio));

        const shadowsEnabled = this.settings.shadows;
        const shadowType = this.settings.shadowMapType as THREE.ShadowMapType;

        if (this.renderer.shadowMap.enabled !== shadowsEnabled || this.renderer.shadowMap.type !== shadowType) {
            this.renderer.shadowMap.enabled = shadowsEnabled;
            this.renderer.shadowMap.type = shadowType;

            // Force material recompilation to sync with new shadow state
            this.scene.traverse((obj) => {
                if ((obj as THREE.Mesh).isMesh) {
                    const mesh = obj as THREE.Mesh;
                    if (Array.isArray(mesh.material)) {
                        mesh.material.forEach(m => m.needsUpdate = true);
                    } else {
                        mesh.material.needsUpdate = true;
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
        Engine.instance = null;
    }

    // --- Scene Management ---

    public pushScene(newScene: THREE.Scene) {
        this.sceneStack.push(this.scene);
        this.scene = newScene;
        this.applySettings();
    }

    public popScene() {
        if (this.sceneStack.length > 0) {
            this.scene = this.sceneStack.pop()!;
            this.applySettings();
        }
    }

    // --- Core Loop ---

    private handleResize = () => {
        if (!this.container) return;
        const width = this.container.clientWidth || window.innerWidth;
        const height = this.container.clientHeight || window.innerHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    };

    /**
     * Main animation loop. Optimized for Zero-GC and consistent frame timing.
     */
    private animate = () => {
        if (!this.isRunning) return;
        this.requestID = requestAnimationFrame(this.animate);

        // Delta time clamping (dt) prevents "teleporting" during lag spikes
        const dt = Math.min(this.clock.getDelta(), 0.05);

        // 1. Logic Update
        if (this.onUpdate) this.onUpdate(dt);

        // 2. Render Pass
        if (!this.isRenderingPaused) {
            if (this.onRender) {
                this.onRender();
            } else {
                this.renderer.render(this.scene, this.camera);
            }
        }
    };

    public getSettings(): GraphicsSettings {
        return { ...this.settings };
    }
}