import * as THREE from 'three';
import { InputAction, InputState, INPUT_KEY_MAP } from './InputTypes';
import { System, SystemID } from '../../systems/System';

// Pre-calculated math constants
const MAX_AIM_RADIUS = 300;
const MAX_AIM_RADIUS_SQ = MAX_AIM_RADIUS * MAX_AIM_RADIUS;
const MIN_AIM_RADIUS = 50;
const MIN_AIM_RADIUS_SQ = MIN_AIM_RADIUS * MIN_AIM_RADIUS;
const INV_MAX_AIM_RADIUS = 1.0 / MAX_AIM_RADIUS;

export class InputManager implements System {
    readonly systemId = SystemID.INPUT;
    id = 'input';
    enabled = true;
    persistent = true;
    public state: InputState;
    private isEnabled: boolean = false;
    private virtualAimPos: THREE.Vector2 = new THREE.Vector2(0, -200);

    // Cached window dimensions to prevent layout thrashing on mousemove
    private screenWidth: number = window.innerWidth;
    private screenHeight: number = window.innerHeight;

    // Pre-calculated inverses to transform slow division into fast multiplication
    private invScreenWidth: number = 1.0 / this.screenWidth;
    private invScreenHeight: number = 1.0 / this.screenHeight;
    private screenHalfWidth: number = this.screenWidth * 0.5;
    private screenHalfHeight: number = this.screenHeight * 0.5;

    public onKeyDown?: (key: string) => void;
    public onKeyUp?: (key: string) => void;

    constructor() {
        this.state = {
            actions: new Uint8Array(InputAction.COUNT),
            mouse: new THREE.Vector2(),
            aimVector: new THREE.Vector2(1, 0),
            cursorPos: { x: this.screenHalfWidth, y: this.screenHalfHeight },
            joystickMove: new THREE.Vector2(0, 0),
            joystickAim: new THREE.Vector2(0, 0),
            locked: false
        };

        this.bindEvents();
    }

    public enable() {
        this.isEnabled = true;
    }

    public disable() {
        this.isEnabled = false;
        this.resetState();
    }

    /**
     * Resets the input buffer. Zero-GC.
     */
    private resetState() {
        this.state.actions.fill(0);
        this.state.joystickMove.set(0, 0);
        this.state.joystickAim.set(0, 0);
    }

    /**
     * VINTERDÖD: Direct buffer check.
     * High-frequency systems should use state.actions[InputAction.X] directly.
     */
    public isPressed(action: InputAction): boolean {
        return this.state.actions[action] === 1;
    }

    private bindEvents() {
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUp);
        window.addEventListener('mousemove', this.handleMouseMove);
        window.addEventListener('mousedown', this.handleMouseDown);
        window.addEventListener('mouseup', this.handleMouseUp);
        window.addEventListener('wheel', this.handleWheel, { passive: true });
        window.addEventListener('resize', this.handleResize);
        window.addEventListener('hud-virtual-key', this.handleVirtualKey as any);
        document.addEventListener('pointerlockchange', this.handleLockChange);
    }

    public dispose() {
        window.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('keyup', this.handleKeyUp);
        window.removeEventListener('mousemove', this.handleMouseMove);
        window.removeEventListener('mousedown', this.handleMouseDown);
        window.removeEventListener('mouseup', this.handleMouseUp);
        window.removeEventListener('wheel', this.handleWheel);
        window.removeEventListener('resize', this.handleResize);
        window.removeEventListener('hud-virtual-key', this.handleVirtualKey as any);
        document.removeEventListener('pointerlockchange', this.handleLockChange);
    }

    private handleResize = () => {
        this.screenWidth = window.innerWidth;
        this.screenHeight = window.innerHeight;

        // Cache multiplication-friendly values
        this.invScreenWidth = 1.0 / this.screenWidth;
        this.invScreenHeight = 1.0 / this.screenHeight;
        this.screenHalfWidth = this.screenWidth * 0.5;
        this.screenHalfHeight = this.screenHeight * 0.5;
    };

    private handleKeyDown = (e: KeyboardEvent) => {
        if (!this.isEnabled) return;

        // Zero-GC: Direct property lookup avoids string mutation
        const action = INPUT_KEY_MAP[e.key];
        if (action !== undefined) {
            this.state.actions[action] = 1;
        }

        if (this.onKeyDown) this.onKeyDown(e.key);
    };

    private handleKeyUp = (e: KeyboardEvent) => {
        if (!this.isEnabled) return;

        // Zero-GC: Direct property lookup avoids string mutation
        const action = INPUT_KEY_MAP[e.key];
        if (action !== undefined) {
            this.state.actions[action] = 0;
        }

        if (this.onKeyUp) this.onKeyUp(e.key);
    };
    
    private handleVirtualKey = (e: CustomEvent) => {
        if (!this.isEnabled) return;
        const { key, pressed } = e.detail;
        
        // Try mapping from key string first
        let action = INPUT_KEY_MAP[key];
        
        // If not found, it might be a direct enum index passed as a string or number
        if (action === undefined && !isNaN(key)) {
            action = Number(key);
        }

        if (action !== undefined && action < InputAction.COUNT) {
            this.state.actions[action] = pressed ? 1 : 0;
        }
    };

    private handleMouseMove = (e: MouseEvent) => {
        if (!this.isEnabled) {
            this.state.cursorPos.x = e.clientX;
            this.state.cursorPos.y = e.clientY;
            return;
        }

        if (document.pointerLockElement) {
            this.virtualAimPos.x += e.movementX;
            this.virtualAimPos.y += e.movementY;

            const distSq = this.virtualAimPos.lengthSq();

            // Zero-GC manual length clamping to avoid redundant Math.sqrt
            if (distSq > MAX_AIM_RADIUS_SQ) {
                const invDist = MAX_AIM_RADIUS / Math.sqrt(distSq);
                this.virtualAimPos.x *= invDist;
                this.virtualAimPos.y *= invDist;
            } else if (distSq < MIN_AIM_RADIUS_SQ && distSq > 0) {
                const invDist = MIN_AIM_RADIUS / Math.sqrt(distSq);
                this.virtualAimPos.x *= invDist;
                this.virtualAimPos.y *= invDist;
            }

            this.state.aimVector.copy(this.virtualAimPos);
            this.state.mouse.x = this.virtualAimPos.x * INV_MAX_AIM_RADIUS;
            this.state.mouse.y = this.virtualAimPos.y * INV_MAX_AIM_RADIUS;
        } else {
            this.state.cursorPos.x = e.clientX;
            this.state.cursorPos.y = e.clientY;

            // Use pre-calculated inverse for fast multiplication instead of division
            this.state.mouse.x = (e.clientX * this.invScreenWidth) * 2.0 - 1.0;
            this.state.mouse.y = -(e.clientY * this.invScreenHeight) * 2.0 + 1.0;

            this.state.aimVector.set(e.clientX - this.screenHalfWidth, e.clientY - this.screenHalfHeight);
        }
    };

    private handleMouseDown = (e: MouseEvent) => {
        if (this.isEnabled && e.button === 0) {
            this.state.actions[InputAction.FIRE] = 1;
        }
    };

    private handleMouseUp = (e: MouseEvent) => {
        if (this.isEnabled && e.button === 0) {
            this.state.actions[InputAction.FIRE] = 0;
        }
    };

    private handleWheel = (e: WheelEvent) => {
        if (!this.isEnabled) return;

        // Zero-GC: Handled purely as flags. The game loop (WeaponHandler) 
        // will consume these and set them back to false immediately.
        if (e.deltaY < 0) {
            this.state.actions[InputAction.SCROLL_UP] = 1;
        } else if (e.deltaY > 0) {
            this.state.actions[InputAction.SCROLL_DOWN] = 1;
        }
    };

    private handleLockChange = () => {
        this.state.locked = !!document.pointerLockElement;
    };

    /**
     * Centralized Pointer Lock Request.
     */
    public requestPointerLock(element: HTMLElement) {
        if (!element || this.state.locked || !element.requestPointerLock) return;

        try {
            const promise = element.requestPointerLock() as any;
            if (promise && promise.catch) {
                promise.catch((e: Error) => {
                    // Silently catch common browser-level rejection (e.g. user gesture missing)
                });
            }
        } catch (err) {
            // Fallback for older browsers
        }
    }

    public setJoystickMove(x: number, y: number) {
        this.state.joystickMove.set(x, y);
    }

    public setJoystickAim(x: number, y: number) {
        this.state.joystickAim.set(x, y);
    }
}