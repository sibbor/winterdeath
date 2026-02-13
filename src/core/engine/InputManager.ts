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
    mouse: THREE.Vector2;
    aimVector: THREE.Vector2;
    cursorPos: { x: number, y: number };
    joystickMove: THREE.Vector2;
    joystickAim: THREE.Vector2;
    locked: boolean;
}

// Map for quick keyboard status updates
const KEY_MAP: Record<string, keyof InputState> = {
    'w': 'w', 'a': 'a', 's': 's', 'd': 'd',
    ' ': 'space', 'r': 'r', 'e': 'e',
    '1': '1', '2': '2', '3': '3', '4': '4'
};

export class InputManager {
    public state: InputState;
    private isEnabled: boolean = false;
    private virtualAimPos: THREE.Vector2 = new THREE.Vector2(0, -200);

    // Callbacks for discrete actions
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
        // Full reset of all boolean states to prevent "stuck" keys on disable
        const keys: (keyof InputState)[] = ['w', 'a', 's', 'd', 'space', 'fire', 'r', 'e', '1', '2', '3', '4'];
        keys.forEach(k => (this.state[k] as boolean) = false);

        this.state.joystickMove.set(0, 0);
        this.state.joystickAim.set(0, 0);
    }

    private bindEvents() {
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUp);
        window.addEventListener('mousemove', this.handleMouseMove);
        window.addEventListener('mousedown', this.handleMouseDown);
        window.addEventListener('mouseup', this.handleMouseUp);
        window.addEventListener('wheel', this.handleWheel, { passive: true });
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
        if (!this.isEnabled) return;
        const key = e.key.toLowerCase();
        const stateKey = KEY_MAP[key];

        if (stateKey) {
            (this.state[stateKey] as boolean) = true;
        }

        if (this.onKeyDown) this.onKeyDown(e.key);
    };

    private handleKeyUp = (e: KeyboardEvent) => {
        if (!this.isEnabled) return;
        const key = e.key.toLowerCase();
        const stateKey = KEY_MAP[key];

        if (stateKey) {
            (this.state[stateKey] as boolean) = false;
        }

        if (this.onKeyUp) this.onKeyUp(e.key);
    };

    private handleMouseMove = (e: MouseEvent) => {
        if (!this.isEnabled) {
            // Still track cursor for UI even if game input is disabled
            this.state.cursorPos.x = e.clientX;
            this.state.cursorPos.y = e.clientY;
            return;
        }

        if (document.pointerLockElement) {
            // --- Pointer Locked: Virtual "Tether" Cursor ---
            this.virtualAimPos.x += e.movementX;
            this.virtualAimPos.y += e.movementY;

            const maxRadius = 300;
            const minRadius = 50;
            const distSq = this.virtualAimPos.lengthSq();

            // Clamping using squared distance (Math.sqrt only when needed)
            if (distSq > maxRadius * maxRadius) {
                this.virtualAimPos.setLength(maxRadius);
            } else if (distSq < minRadius * minRadius && distSq > 0) {
                this.virtualAimPos.setLength(minRadius);
            }

            this.state.aimVector.copy(this.virtualAimPos);
            // Normalize to -1 -> 1 range for consistency
            this.state.mouse.x = this.virtualAimPos.x / maxRadius;
            this.state.mouse.y = this.virtualAimPos.y / maxRadius;
        } else {
            // --- Standard Mouse: Center-relative ---
            this.state.cursorPos.x = e.clientX;
            this.state.cursorPos.y = e.clientY;

            const centerX = window.innerWidth / 2;
            const centerY = window.innerHeight / 2;

            this.state.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
            this.state.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

            this.state.aimVector.set(e.clientX - centerX, e.clientY - centerY);
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

        if (e.deltaY < 0) {
            this.state.scrollUp = true;
            setTimeout(() => this.state.scrollUp = false, 50);
        } else if (e.deltaY > 0) {
            this.state.scrollDown = true;
            setTimeout(() => this.state.scrollDown = false, 50);
        }
    };

    private handleLockChange = () => {
        this.state.locked = !!document.pointerLockElement;
    };

    public requestPointerLock(element: HTMLElement) {
        if (this.state.locked) return;
        element.requestPointerLock();
    }

    public setJoystickMove(x: number, y: number) {
        this.state.joystickMove.set(x, y);
    }

    public setJoystickAim(x: number, y: number) {
        this.state.joystickAim.set(x, y);
    }
}