import * as THREE from 'three';
import { DEFAULT_GRAPHICS, GraphicsSettings } from '../../content/constants';
import { InputManager } from './InputManager';

// Remove local interface

export class Engine {
    // Singleton-like access for shared resources
    private static instance: Engine | null = null;
    public static getInstance() {
        if (!this.instance) this.instance = new Engine();
        return this.instance;
    }

    // Core systems
    public scene: THREE.Scene;
    public camera: THREE.PerspectiveCamera;
    public renderer: THREE.WebGLRenderer;
    public input: InputManager;

    // Settings
    private settings: GraphicsSettings = { ...DEFAULT_GRAPHICS };

    // Time tracking
    private clock: THREE.Clock;
    private requestID: number | null = null;

    // Lifecycle state
    private isRunning: boolean = false;
    private container: HTMLElement | null = null;

    // Loop callback for game logic (dependency injection)
    public onUpdate: ((dt: number) => void) | null = null;
    public onRender: (() => void) | null = null;

    constructor() {
        // 1. Scene
        this.scene = new THREE.Scene();

        // 2. Camera
        this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 40, 20);
        this.camera.lookAt(0, 0, 0);

        // 3. Renderer
        this.renderer = new THREE.WebGLRenderer({
            antialias: this.settings.antialias,
            powerPreference: 'high-performance'
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.applySettings();

        // 4. Input
        this.input = new InputManager();
        this.input.enable();

        this.clock = new THREE.Clock();

        window.addEventListener('resize', this.handleResize);
    }

    public updateSettings(newSettings: Partial<GraphicsSettings>) {
        const antialiasChanged = newSettings.antialias !== undefined && newSettings.antialias !== this.settings.antialias;
        this.settings = { ...this.settings, ...newSettings };

        if (antialiasChanged) {
            this.recreateRenderer();
        } else {
            this.applySettings();
        }
    }

    private recreateRenderer() {
        // 1. Dispose old renderer
        const oldDom = this.renderer.domElement;
        const parent = oldDom.parentNode;
        this.renderer.dispose();

        // 2. Create new renderer with updated settings
        this.renderer = new THREE.WebGLRenderer({
            antialias: this.settings.antialias,
            powerPreference: 'high-performance'
        });

        // 3. Restore DOM state
        const targetParent = parent || this.container;
        if (targetParent) {
            if (oldDom.parentNode === targetParent) {
                targetParent.removeChild(oldDom);
            }
            targetParent.appendChild(this.renderer.domElement);
        }

        // 4. Restore renderer state
        this.applySettings();
        this.handleResize(); // Ensure size is correct
    }

    private applySettings() {
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.settings.pixelRatio));

        // Update shadow map settings
        const shadowsChanged = this.renderer.shadowMap.enabled !== this.settings.shadows;
        const shadowTypeChanged = this.renderer.shadowMap.type !== this.settings.shadowMapType;

        this.renderer.shadowMap.enabled = this.settings.shadows;
        this.renderer.shadowMap.type = this.settings.shadowMapType;

        // If shadows were toggled or type changed, we need to force material recompilation
        // otherwise Three.js might keep using shaders that expect different shadow map configurations
        if ((shadowsChanged || shadowTypeChanged) && this.scene) {
            this.scene.traverse(obj => {
                if ((obj as any).isMesh && (obj as any).material) {
                    const mat = (obj as any).material;
                    if (Array.isArray(mat)) {
                        mat.forEach(m => m.needsUpdate = true);
                    } else {
                        mat.needsUpdate = true;
                    }
                }
            });
        }

        // Note: Antialias cannot be changed after creation in standard WebGL context without re-creating renderer
    }

    public getSettings() {
        return { ...this.settings };
    }

    public mount(container: HTMLElement) {
        this.container = container;
        // Optimization: Ensure we don't duplicate the canvas if re-mounting
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

    private handleResize = () => {
        if (!this.container) return;
        const width = this.container.clientWidth || window.innerWidth;
        const height = this.container.clientHeight || window.innerHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    };

    private animate = () => {
        if (!this.isRunning) return;
        this.requestID = requestAnimationFrame(this.animate);

        const dt = Math.min(this.clock.getDelta(), 0.1);

        if (this.onUpdate) this.onUpdate(dt);
        if (this.onRender) this.onRender();
        else this.renderer.render(this.scene, this.camera);
    };
}
