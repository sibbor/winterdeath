import * as THREE from 'three';

export interface InputState {
    w: boolean;
    a: boolean;
    s: boolean;
    d: boolean;
    space: boolean;
    fire: boolean;
    r: boolean;
    e: boolean;
    f: boolean;
    m: boolean;
    enter: boolean;
    escape: boolean;
    shift: boolean;
    '1': boolean;
    '2': boolean;
    '3': boolean;
    '4': boolean;
    scrollUp: boolean;
    scrollDown: boolean;
    mouse: THREE.Vector2;
    aimVector: THREE.Vector2;
    cursorPos: { x: number, y: number };
    joystickMove: THREE.Vector2;
    joystickAim: THREE.Vector2;
    locked: boolean;
}

// Map both uppercase and lowercase to avoid string allocation (.toLowerCase()) at runtime
const KEY_MAP: Record<string, keyof InputState> = {
    'w': 'w', 'W': 'w',
    'a': 'a', 'A': 'a',
    's': 's', 'S': 's',
    'd': 'd', 'D': 'd',
    ' ': 'space',
    'r': 'r', 'R': 'r',
    'e': 'e', 'E': 'e',
    'f': 'f', 'F': 'f',
    'm': 'm', 'M': 'm',
    'Enter': 'enter',
    'Escape': 'escape',
    'Shift': 'shift',
    '1': '1', '2': '2', '3': '3', '4': '4'
};

// Static array avoids runtime allocation during resets
const _RESET_KEYS: (keyof InputState)[] = [
    'w', 'a', 's', 'd', 'space', 'fire', 'r', 'e', 'f', 'm',
    'enter', 'escape', 'shift', '1', '2', '3', '4'
];

// Pre-calculated math constants
const MAX_AIM_RADIUS = 300;
const MAX_AIM_RADIUS_SQ = MAX_AIM_RADIUS * MAX_AIM_RADIUS;
const MIN_AIM_RADIUS = 50;
const MIN_AIM_RADIUS_SQ = MIN_AIM_RADIUS * MIN_AIM_RADIUS;
const INV_MAX_AIM_RADIUS = 1.0 / MAX_AIM_RADIUS;

export class InputManager {
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
            w: false, a: false, s: false, d: false,
            space: false, fire: false, r: false, e: false,
            f: false, m: false, enter: false, escape: false, shift: false,
            '1': false, '2': false, '3': false, '4': false,
            scrollUp: false, scrollDown: false,
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

    private resetState() {
        // Classic for-loop over static array for Zero-GC
        for (let i = 0; i < _RESET_KEYS.length; i++) {
            (this.state[_RESET_KEYS[i]] as boolean) = false;
        }

        this.state.joystickMove.set(0, 0);
        this.state.joystickAim.set(0, 0);
        this.state.scrollUp = false;
        this.state.scrollDown = false;
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
        const stateKey = KEY_MAP[e.key];

        if (stateKey) {
            (this.state[stateKey] as boolean) = true;
        }

        if (this.onKeyDown) this.onKeyDown(e.key);
    };

    private handleKeyUp = (e: KeyboardEvent) => {
        if (!this.isEnabled) return;

        // Zero-GC: Direct property lookup avoids string mutation
        const stateKey = KEY_MAP[e.key];

        if (stateKey) {
            (this.state[stateKey] as boolean) = false;
        }

        if (this.onKeyUp) this.onKeyUp(e.key);
    };
    
    private handleVirtualKey = (e: CustomEvent) => {
        if (!this.isEnabled) return;
        const { key, pressed } = e.detail;
        const stateKey = KEY_MAP[key] || key;
        if (this.state[stateKey as keyof InputState] !== undefined) {
             (this.state[stateKey as keyof InputState] as boolean) = pressed;
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
        if (this.isEnabled && e.button === 0) this.state.fire = true;
    };

    private handleMouseUp = (e: MouseEvent) => {
        if (this.isEnabled && e.button === 0) this.state.fire = false;
    };

    private handleWheel = (e: WheelEvent) => {
        if (!this.isEnabled) return;

        // Zero-GC: Handled purely as flags. The game loop (WeaponHandler) 
        // will consume these and set them back to false immediately.
        if (e.deltaY < 0) {
            this.state.scrollUp = true;
        } else if (e.deltaY > 0) {
            this.state.scrollDown = true;
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