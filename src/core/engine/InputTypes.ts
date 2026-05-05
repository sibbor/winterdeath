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
    SLOT_5 = 20,

    COUNT = 21
}

/**
 * Mapping keyboard event keys to SMI-hardened InputActions.
 * Zero-GC: Using a Record for O(1) lookup during key events.
 */
export const INPUT_KEY_MAP: Record<string, InputAction> = {
    'w': InputAction.UP, 'W': InputAction.UP,
    'a': InputAction.LEFT, 'A': InputAction.LEFT,
    's': InputAction.DOWN, 'S': InputAction.DOWN,
    'd': InputAction.RIGHT, 'D': InputAction.RIGHT,
    ' ': InputAction.DODGE,
    'r': InputAction.RELOAD, 'R': InputAction.RELOAD,
    'e': InputAction.INTERACT, 'E': InputAction.INTERACT,
    'f': InputAction.FLASHLIGHT, 'F': InputAction.FLASHLIGHT,
    'm': InputAction.MAP, 'M': InputAction.MAP,
    'Enter': InputAction.ENTER,
    'Escape': InputAction.ESCAPE,
    'Shift': InputAction.SHIFT,
    'Control': InputAction.CTRL,
    'ArrowUp': InputAction.UP,
    'ArrowDown': InputAction.DOWN,
    'ArrowLeft': InputAction.LEFT,
    'ArrowRight': InputAction.RIGHT,
    '1': InputAction.SLOT_1, '2': InputAction.SLOT_2, '3': InputAction.SLOT_3, '4': InputAction.SLOT_4, '5': InputAction.SLOT_5
};

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
