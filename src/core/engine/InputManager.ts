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
    '1': boolean;
    '2': boolean;
    '3': boolean;
    '4': boolean;
    scrollUp: boolean;
    scrollDown: boolean;
    mouse: THREE.Vector2; // Normalized device coordinates (-1 to 1)
    aimVector: THREE.Vector2; // Direction from center of screen (or relative movement)
    cursorPos: { x: number, y: number }; // Screen pixels
    joystickMove: THREE.Vector2; // Left stick input (-1 to 1)
    joystickAim: THREE.Vector2;  // Right stick input (-1 to 1)
    locked: boolean;
}

export class InputManager {
    public state: InputState;
    private isEnabled: boolean = false;
    private aimAngle: number = -Math.PI / 2; // Start facing Up
    private virtualAimPos: THREE.Vector2 = new THREE.Vector2(0, -200); // Virtual cursor position relative to player


    // Callbacks for discrete actions (optional, for UI/Systems)
    public onKeyDown?: (key: string) => void;
    public onKeyUp?: (key: string) => void;

    constructor() {
        this.state = {
            w: false, a: false, s: false, d: false,
            space: false, fire: false, r: false, e: false,
            '1': false, '2': false, '3': false, '4': false,
            scrollUp: false, scrollDown: false,
            mouse: new THREE.Vector2(),
            aimVector: new THREE.Vector2(1, 0),
            cursorPos: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
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
        this.state.w = false;
        this.state.a = false;
        this.state.s = false;
        this.state.d = false;
        this.state.space = false;
        this.state.fire = false;
        this.state.r = false;
        this.state.e = false;
        this.state['1'] = false;
        this.state['2'] = false;
        this.state['3'] = false;
        this.state['4'] = false;
        this.state.joystickMove.set(0, 0);
        this.state.joystickAim.set(0, 0);
        // Keep mouse/aim to avoid snapping
    }

    private bindEvents() {
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUp);
        window.addEventListener('mousemove', this.handleMouseMove);
        window.addEventListener('mousedown', this.handleMouseDown);
        window.addEventListener('mouseup', this.handleMouseUp);
        window.addEventListener('wheel', this.handleWheel);
        document.addEventListener('pointerlockchange', this.handleLockChange);
    }

    public dispose() {
        window.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('keyup', this.handleKeyUp);
        window.removeEventListener('mousemove', this.handleMouseMove);
        window.removeEventListener('mousedown', this.handleMouseDown);
        window.removeEventListener('mouseup', this.handleMouseUp);
        window.removeEventListener('wheel', this.handleWheel);
        document.removeEventListener('pointerlockchange', this.handleLockChange);
    }

    private handleKeyDown = (e: KeyboardEvent) => {
        // Always track keys, but state reflects active only if enabled? 
        // Or should we block tracking? Usually better to block logic, not state updates, 
        // but for safety let's check isEnabled.
        if (!this.isEnabled) return;

        const k = e.key ? e.key.toLowerCase() : '';
        if (k === 'w') this.state.w = true;
        if (k === 'a') this.state.a = true;
        if (k === 's') this.state.s = true;
        if (k === 'd') this.state.d = true;
        if (k === ' ') this.state.space = true;
        if (k === 'r') this.state.r = true;
        if (k === 'e') this.state.e = true;
        if (k === '1') this.state['1'] = true;
        if (k === '2') this.state['2'] = true;
        if (k === '3') this.state['3'] = true;
        if (k === '4') this.state['4'] = true;

        if (this.onKeyDown) this.onKeyDown(e.key);
    };

    private handleKeyUp = (e: KeyboardEvent) => {
        if (!this.isEnabled) return;

        const k = e.key ? e.key.toLowerCase() : '';
        if (k === 'w') this.state.w = false;
        if (k === 'a') this.state.a = false;
        if (k === 's') this.state.s = false;
        if (k === 'd') this.state.d = false;
        if (k === ' ') this.state.space = false;
        if (k === 'r') this.state.r = false;
        if (k === 'e') this.state.e = false;
        if (k === '1') this.state['1'] = false;
        if (k === '2') this.state['2'] = false;
        if (k === '3') this.state['3'] = false;
        if (k === '4') this.state['4'] = false;

        if (this.onKeyUp) this.onKeyUp(e.key);
    };

    private handleMouseMove = (e: MouseEvent) => {
        // Always track locked state
        if (document.pointerLockElement) {
            if (!this.isEnabled) return;

            // Accumulate movement into virtual cursor
            this.virtualAimPos.x += e.movementX;
            this.virtualAimPos.y += e.movementY;

            // Clamp radius to keep it responsive (like a tether)
            const maxRadius = 300;
            const minRadius = 50;
            const length = this.virtualAimPos.length();

            if (length > maxRadius) {
                this.virtualAimPos.multiplyScalar(maxRadius / length);
            } else if (length < minRadius && length > 0) {
                this.virtualAimPos.multiplyScalar(minRadius / length);
            }

            // Update aimAngle and vectors from virtual cursor
            this.aimAngle = Math.atan2(this.virtualAimPos.y, this.virtualAimPos.x);

            this.state.aimVector.copy(this.virtualAimPos);
            this.state.mouse.x = this.virtualAimPos.x / maxRadius;
            this.state.mouse.y = this.virtualAimPos.y / maxRadius;
        } else {
            this.state.cursorPos.x = e.clientX;
            this.state.cursorPos.y = e.clientY;

            if (!this.isEnabled) return;

            this.state.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
            this.state.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

            const centerX = window.innerWidth / 2;
            const centerY = window.innerHeight / 2;

            this.state.aimVector.x = e.clientX - centerX;
            this.state.aimVector.y = e.clientY - centerY;

            // Sync angle for smooth transition
            this.aimAngle = Math.atan2(this.state.aimVector.y, this.state.aimVector.x);
        }
    };

    private handleMouseDown = (e: MouseEvent) => {
        if (!this.isEnabled) return;
        if (e.button === 0) this.state.fire = true;
    };

    private handleMouseUp = (e: MouseEvent) => {
        if (!this.isEnabled) return;
        if (e.button === 0) this.state.fire = false;
    };

    private handleWheel = (e: WheelEvent) => {
        if (!this.isEnabled) return;
        if (e.deltaY < 0) {
            this.state.scrollUp = true;
            // Auto reset scroll "impulse" next frame is tricky in event listener...
            // Use setTimeout for now like the hook
            setTimeout(() => this.state.scrollUp = false, 100);
        }
        if (e.deltaY > 0) {
            this.state.scrollDown = true;
            setTimeout(() => this.state.scrollDown = false, 100);
        }
    };

    private handleLockChange = () => {
        this.state.locked = !!document.pointerLockElement;
    };

    public requestPointerLock(element: HTMLElement) {
        if (this.state.locked) return;
        try {
            // Some browsers require a user gesture, which this call should be part of
            const promise = element.requestPointerLock() as any;
            if (promise && promise.catch) {
                promise.catch((e: any) => console.warn("Pointer lock error:", e));
            }
        } catch (e) {
            console.warn("Pointer lock failed:", e);
        }
    }

    public setJoystickMove(x: number, y: number) {
        this.state.joystickMove.set(x, y);
    }

    public setJoystickAim(x: number, y: number) {
        this.state.joystickAim.set(x, y);
    }
}
