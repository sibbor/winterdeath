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

const KEY_MAP: Record<string, keyof InputState> = {
    'w': 'w', 'a': 'a', 's': 's', 'd': 'd',
    ' ': 'space', 'r': 'r', 'e': 'e',
    '1': '1', '2': '2', '3': '3', '4': '4'
};

export class InputManager {
    public state: InputState;
    private isEnabled: boolean = false;
    private virtualAimPos: THREE.Vector2 = new THREE.Vector2(0, -200);

    // Cached window dimensions to prevent layout thrashing on mousemove
    private screenWidth: number = window.innerWidth;
    private screenHeight: number = window.innerHeight;

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
            cursorPos: { x: this.screenWidth / 2, y: this.screenHeight / 2 },
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
        const keys: (keyof InputState)[] = ['w', 'a', 's', 'd', 'space', 'fire', 'r', 'e', '1', '2', '3', '4'];
        for (let i = 0; i < keys.length; i++) {
            (this.state[keys[i]] as boolean) = false;
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
        document.removeEventListener('pointerlockchange', this.handleLockChange);
    }

    private handleResize = () => {
        this.screenWidth = window.innerWidth;
        this.screenHeight = window.innerHeight;
    };

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
            this.state.cursorPos.x = e.clientX;
            this.state.cursorPos.y = e.clientY;
            return;
        }

        if (document.pointerLockElement) {
            this.virtualAimPos.x += e.movementX;
            this.virtualAimPos.y += e.movementY;

            const maxRadius = 300;
            const minRadius = 50;
            const distSq = this.virtualAimPos.lengthSq();

            if (distSq > maxRadius * maxRadius) {
                this.virtualAimPos.setLength(maxRadius);
            } else if (distSq < minRadius * minRadius && distSq > 0) {
                this.virtualAimPos.setLength(minRadius);
            }

            this.state.aimVector.copy(this.virtualAimPos);
            this.state.mouse.x = this.virtualAimPos.x / maxRadius;
            this.state.mouse.y = this.virtualAimPos.y / maxRadius;
        } else {
            this.state.cursorPos.x = e.clientX;
            this.state.cursorPos.y = e.clientY;

            const centerX = this.screenWidth / 2;
            const centerY = this.screenHeight / 2;

            this.state.mouse.x = (e.clientX / this.screenWidth) * 2 - 1;
            this.state.mouse.y = -(e.clientY / this.screenHeight) * 2 + 1;

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