import * as THREE from 'three';
import { InputManager } from './InputManager';

export class Engine {
    // Core systems
    public scene: THREE.Scene;
    public camera: THREE.PerspectiveCamera;
    public renderer: THREE.WebGLRenderer;
    public input: InputManager;

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
        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25)); // Cap for performance
        this.renderer.shadowMap.enabled = false; // Start disabled for perf (or load from settings)
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // 4. Input
        this.input = new InputManager();
        this.input.enable(); // Default enable, control via game logic

        this.clock = new THREE.Clock();

        // Bind window resize
        window.addEventListener('resize', this.handleResize);
    }

    public mount(container: HTMLElement) {
        this.container = container;
        container.appendChild(this.renderer.domElement);
        this.handleResize(); // Ensure correct size on mount
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
        // Traverse and dispose scene objects if needed, or rely on Game Specific cleanup
    }

    private handleResize = () => {
        if (!this.container) return;

        // Fullscreen assumes body/window size, but if mounted in div, verify
        const width = window.innerWidth;
        const height = window.innerHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    };

    private animate = () => {
        this.requestID = requestAnimationFrame(this.animate);

        const dt = Math.min(this.clock.getDelta(), 0.1); // Cap dt to avoid huge jumps

        if (this.onUpdate) {
            this.onUpdate(dt);
        }

        if (this.onRender) {
            this.onRender();
        } else {
            // Default render if no override
            this.renderer.render(this.scene, this.camera);
        }
    };
}
