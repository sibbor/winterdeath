import * as THREE from 'three';

/**
 * Strictly typed numeric enum for engine input actions.
 * Use explicit integers to ensure dense array allocation in the InputState buffer.
 * VINTERDÖD: SMI-Hardened to avoid string-based lookups in the engine hot-path.
 */
export enum InputAction {
    UP = 0,
    LEFT = 1,
    DOWN = 2,
    RIGHT = 3,
    DODGE = 4,      // Usually Space
    RELOAD = 5,     // Usually R
    INTERACT = 6,   // Usually E
    FLASHLIGHT = 7, // Usually F
    MAP = 8,        // Usually M
    SLOT_1 = 9,
    SLOT_2 = 10,
    SLOT_3 = 11,
    SLOT_4 = 12,
    FIRE = 13,      // Mouse Left / Right Stick Trigger
    ENTER = 14,
    ESCAPE = 15,
    SHIFT = 16,
    CTRL = 17,
    SCROLL_UP = 18,
    SCROLL_DOWN = 19,

    COUNT = 20
}

/**
 * Optimized InputState for Zero-GC performance.
 */
export interface InputState {
    /**
     * Binary action flags stored in a typed array.
     * Use InputAction enum as the index.
     * Guaranteed SMI (Small Integer) values for V8 JIT performance.
     */
    actions: Uint8Array;

    /** Analog mouse position (-1 to 1) */
    mouse: THREE.Vector2;
    /** Raw direction vector for aiming */
    aimVector: THREE.Vector2;
    /** Current screen space cursor position */
    cursorPos: { x: number, y: number };
    /** Mobile/Touch joystick movement vector */
    joystickMove: THREE.Vector2;
    /** Mobile/Touch joystick aiming/firing vector */
    joystickAim: THREE.Vector2;
    /** Whether the pointer is currently locked by the browser */
    locked: boolean;
}
