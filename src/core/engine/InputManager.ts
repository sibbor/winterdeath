import * as THREE from 'three';
import { System, SystemID } from '../../systems/System';
import { UIEventBridge, MetaActionId } from '../../systems/ui/UIEventBridge';
import { GameSessionLogic } from '../../game/session/GameSessionLogic';
import { FLASHLIGHT } from '../../content/constants';

/**
 * Strictly typed numeric enum for engine input actions.
 * Use explicit integers to ensure dense array allocation in the InputState buffer.
 * SMI-Hardened to avoid string-based lookups in the engine hot-path.
 */
export enum InputAction {
    UP = 0,
    LEFT = 1,
    DOWN = 2,
    RIGHT = 3,
    DODGE = 4,      // Usually Space
    FIRE = 5,       // Mouse Left / Right Stick Trigger
    RELOAD = 6,     // Usually R
    INTERACT = 7,   // Usually E
    FLASHLIGHT = 8, // Usually F
    MAP = 9,        // Usually M
    SLOT_1 = 10,
    SLOT_2 = 11,
    SLOT_3 = 12,
    SLOT_4 = 13,
    SLOT_5 = 14,
    SCROLL_UP = 15,
    SCROLL_DOWN = 16,
    ENTER = 17,
    ESCAPE = 18,
    SHIFT = 19,
    CTRL = 20,

    ARROW_UP = 21,
    ARROW_DOWN = 22,
    ARROW_LEFT = 23,
    ARROW_RIGHT = 24,

    COUNT = 25
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
    'ArrowUp': InputAction.ARROW_UP,
    'ArrowDown': InputAction.ARROW_DOWN,
    'ArrowLeft': InputAction.ARROW_LEFT,
    'ArrowRight': InputAction.ARROW_RIGHT,
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
    /** Current state of the player's flashlight */
    flashlightOn: boolean;
}

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
    private physicalActions: Uint8Array;
    private prevActions: Uint8Array;
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

    private onKeyDown: ((key: string) => void) | null = null;
    private onKeyUp: ((key: string) => void) | null = null;

    private lastNavBackTime = 0;
    private lastNavMapTime = 0;
    private lastNavLogTime = 0;
    private readonly NAV_DEBOUNCE_MS = 150;
    public onMetaAction?: (actionId: MetaActionId) => void;

    constructor() {
        this.screenWidth = window.innerWidth;
        this.screenHeight = window.innerHeight;
        this.invScreenWidth = 1.0 / Math.max(1, this.screenWidth);
        this.invScreenHeight = 1.0 / Math.max(1, this.screenHeight);
        this.screenHalfWidth = this.screenWidth * 0.5;
        this.screenHalfHeight = this.screenHeight * 0.5;

        this.state = {
            actions: new Uint8Array(InputAction.COUNT),
            mouse: new THREE.Vector2(),
            aimVector: new THREE.Vector2(1, 0),
            cursorPos: { x: this.screenHalfWidth, y: this.screenHalfHeight },
            joystickMove: new THREE.Vector2(0, 0),
            joystickAim: new THREE.Vector2(0, 0),
            locked: false,
            flashlightOn: true
        };

        this.physicalActions = new Uint8Array(InputAction.COUNT);
        this.prevActions = new Uint8Array(InputAction.COUNT);

        // --- ZERO-GC PRE-BINDING ---
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleKeyUp = this.handleKeyUp.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        this.handleWheel = this.handleWheel.bind(this);
        this.handleResize = this.handleResize.bind(this);
        this.handleLockChange = this.handleLockChange.bind(this);
        this.handleFocus = this.handleFocus.bind(this);
        this.handleBlur = this.handleBlur.bind(this);

        this.bindEvents();
        (window as any).inputManager = this;
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
        this.physicalActions.fill(0);
        this.state.joystickMove.set(0, 0);
        this.state.joystickAim.set(0, 0);
    }

    /**
     * Direct buffer check.
     * High-frequency systems should use state.actions[InputAction.X] directly.
     */
    public isPressed(action: InputAction): boolean {
        return this.state.actions[action] === 1;
    }

    /**
     * Allows external systems (like TouchController) to trigger actions.
     * These persist until released.
     */
    public handleVirtualAction(action: InputAction, pressed: boolean) {
        if (action >= 0 && action < InputAction.COUNT) {
            this.physicalActions[action] = pressed ? 1 : 0;
        }
    }

    private bindEvents() {
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUp);
        window.addEventListener('mousemove', this.handleMouseMove);
        window.addEventListener('mousedown', this.handleMouseDown);
        window.addEventListener('mouseup', this.handleMouseUp);
        window.addEventListener('wheel', this.handleWheel, { passive: true });
        window.addEventListener('resize', this.handleResize);
        window.addEventListener('focus', this.handleFocus);
        window.addEventListener('blur', this.handleBlur);
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
        window.removeEventListener('focus', this.handleFocus);
        window.removeEventListener('blur', this.handleBlur);
        document.removeEventListener('pointerlockchange', this.handleLockChange);
    }

    private handleResize() {
        this.screenWidth = window.innerWidth;
        this.screenHeight = window.innerHeight;
        this.invScreenWidth = 1.0 / Math.max(1, this.screenWidth);
        this.invScreenHeight = 1.0 / Math.max(1, this.screenHeight);
        this.screenHalfWidth = this.screenWidth * 0.5;
        this.screenHalfHeight = this.screenHeight * 0.5;
    }

    public update(session: GameSessionLogic, delta: number, simTime: number, renderTime: number) {
        if (!this.isEnabled) return;

        // Sync physical actions to state first
        this.state.actions.set(this.physicalActions);

        // High-frequency polling from SMI scratchpad (Zero-GC)
        const isInteracting = UIEventBridge.getInteractionTrigger();
        if (isInteracting) {
            this.state.actions[InputAction.INTERACT] = 1;
        }

        // Consume and handle UI Meta Actions
        const uiAction = UIEventBridge.consumeUiAction();
        if (uiAction !== MetaActionId.NONE) {
            this.handleMetaAction(uiAction);
        }

        // --- RISING EDGE DETECTOR (Toggles) ---
        // Vinterdöd Hardening: Detect the exact frame a button is pressed 
        // to handle toggles centrally without leaking logic into other systems.
        const flashlightPressed = this.state.actions[InputAction.FLASHLIGHT] === 1;
        if (flashlightPressed && this.prevActions[InputAction.FLASHLIGHT] === 0) {
            this.state.flashlightOn = !this.state.flashlightOn;

            // Sync to game state immediately if available
            if (session.state) {
                session.state.flashlightOn = this.state.flashlightOn;

                // Update 3D scene representation
                const playerGroup = (session as any).playerGroup || (session as any)._playerGroup;
                if (playerGroup) {
                    const flashlight = playerGroup.getObjectByName('FLASHLIGHT') as THREE.SpotLight;
                    if (flashlight) {
                        const defaultIntensity = FLASHLIGHT.intensity;
                        const multiplier = session.state.vehicle?.active ? 2.0 : 1.0;
                        flashlight.intensity = session.state.flashlightOn ? (defaultIntensity * multiplier) : 0;
                    }
                }
            }
        }

        // Update previous state for next frame
        this.prevActions.set(this.state.actions);
    }

    /**
     * Translates high-level UI commands into engine states or triggers.
     */
    private handleMetaAction(actionId: MetaActionId) {
        // 1. Direct Action Mapping (Simulation Flags)
        switch (actionId) {
            case MetaActionId.INTERACT_TAP:
                // Set flag for one frame (will be cleared by reset/update or handled in same tick)
                this.state.actions[InputAction.INTERACT] = 1;
                break;
            case MetaActionId.RELOAD_TAP:
                this.state.actions[InputAction.RELOAD] = 1;
                break;
            case MetaActionId.WEAPON_SLOT_1:
                this.state.actions[InputAction.SLOT_1] = 1;
                break;
            case MetaActionId.WEAPON_SLOT_2:
                this.state.actions[InputAction.SLOT_2] = 1;
                break;
            case MetaActionId.WEAPON_SLOT_3:
                this.state.actions[InputAction.SLOT_3] = 1;
                break;
            case MetaActionId.WEAPON_SLOT_4:
                this.state.actions[InputAction.SLOT_4] = 1;
                break;
            case MetaActionId.WEAPON_SLOT_5:
                this.state.actions[InputAction.SLOT_5] = 1;
                break;
            case MetaActionId.TOGGLE_FLASHLIGHT:
                this.state.actions[InputAction.FLASHLIGHT] = 1;
                break;
        }

        // 2. Callback for high-level logic (Menus, Screen Toggles)
        if (this.onMetaAction) {
            this.onMetaAction(actionId);
        }
    }

    private handleKeyDown(e: KeyboardEvent) {
        if (!this.isEnabled) return;

        if (this.onKeyDown) this.onKeyDown(e.key);

        if (e.repeat) return;

        const action = INPUT_KEY_MAP[e.key];
        if (action !== undefined) {
            this.physicalActions[action] = 1;

            // Signal navigation events to the UI via Zero-GC SMI bridge
            const now = performance.now();
            if (action === InputAction.ESCAPE) {
                if (now - this.lastNavBackTime > this.NAV_DEBOUNCE_MS) {
                    UIEventBridge.signalEngineEvent(MetaActionId.NAV_BACK);
                    this.lastNavBackTime = now;
                }
            } else if (action === InputAction.ENTER) {
                UIEventBridge.signalEngineEvent(MetaActionId.NAV_CONFIRM);
            } else if (action === InputAction.MAP) {
                if (now - this.lastNavMapTime > this.NAV_DEBOUNCE_MS) {
                    UIEventBridge.signalEngineEvent(MetaActionId.NAV_MAP);
                    this.lastNavMapTime = now;
                }
            }
        }
    }

    private handleKeyUp(e: KeyboardEvent) {
        if (!this.isEnabled) return;

        if (this.onKeyUp) this.onKeyUp(e.key);

        const action = INPUT_KEY_MAP[e.key];
        if (action !== undefined) {
            this.physicalActions[action] = 0;
        }
    }

    private handleMouseMove(e: MouseEvent) {
        if (!this.isEnabled) {
            this.state.cursorPos.x = e.clientX;
            this.state.cursorPos.y = e.clientY;
            return;
        }

        if (document.pointerLockElement) {
            this.virtualAimPos.x += e.movementX;
            this.virtualAimPos.y += e.movementY;

            // Clamp virtual position to circle radius
            const distSq = this.virtualAimPos.x * this.virtualAimPos.x + this.virtualAimPos.y * this.virtualAimPos.y;
            if (distSq > MAX_AIM_RADIUS_SQ) {
                const dist = Math.sqrt(distSq);
                const invDist = 1.0 / dist;
                this.virtualAimPos.x *= invDist * MAX_AIM_RADIUS;
                this.virtualAimPos.y *= invDist * MAX_AIM_RADIUS;
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
    }

    private handleMouseDown(e: MouseEvent) {
        if (!this.isEnabled) return;
        // Button 0 = Left Click
        if (e.button === 0) {
            this.physicalActions[InputAction.FIRE] = 1;
        }
    }

    private handleMouseUp(e: MouseEvent) {
        if (!this.isEnabled) return;
        if (e.button === 0) {
            this.physicalActions[InputAction.FIRE] = 0;
        }
    }

    private handleWheel(e: WheelEvent) {
        // Implement weapon switching with scroll wheel if needed
        // Zero-GC: Handled purely as flags. The game loop (WeaponHandler) 
        // will consume these and set them back to false immediately.
        if (e.deltaY < 0) {
            this.state.actions[InputAction.SCROLL_UP] = 1;
        } else if (e.deltaY > 0) {
            this.state.actions[InputAction.SCROLL_DOWN] = 1;
        }
    };

    private handleLockChange() {
        this.state.locked = !!document.pointerLockElement;
    }

    private handleFocus() {
        // --- VINTERDÖD FIX: Forced State Recovery ---
        // Ensure the locked flag is synchronized with the actual document state
        // and re-enable input if it was supposed to be enabled.
        this.state.locked = !!document.pointerLockElement;

        // We don't automatically .enable() here because some overlays might want it disabled,
        // but we ensure that if we ARE enabled, we are truly capturing.
    }

    private handleBlur() {
        // --- VINTERDÖD FIX: Zero-GC State Flush ---
        // Prevent "Infinite Walking" by completely clearing the action buffer when the window loses focus.
        this.resetState();
    }

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