import * as THREE from 'three';
import { System, SystemID } from '../../systems/System';
import { UIEventBridge, MetaActionId } from '../../systems/ui/UIEventBridge';
import { GameSessionLogic } from '../../game/session/GameSessionLogic';
import { FLASHLIGHT } from '../../content/constants';

export enum InputAction {
    UP = 0, LEFT = 1, DOWN = 2, RIGHT = 3,
    DODGE = 4, FIRE = 5, RELOAD = 6, INTERACT = 7,
    FLASHLIGHT = 8, MAP = 9, LOG = 25, // Explicit binding for L key mapping
    SLOT_1 = 10, SLOT_2 = 11, SLOT_3 = 12, SLOT_4 = 13, SLOT_5 = 14,
    SCROLL_UP = 15, SCROLL_DOWN = 16, ENTER = 17, ESCAPE = 18,
    SHIFT = 19, CTRL = 20,
    ARROW_UP = 21, ARROW_DOWN = 22, ARROW_LEFT = 23, ARROW_RIGHT = 24,
    COUNT = 26
}

// Fixed INPUT_KEY_MAP to include explicit 'l' and 'L' binding definitions
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
    'l': InputAction.LOG, 'L': InputAction.LOG,
    'Enter': InputAction.ENTER, 'Escape': InputAction.ESCAPE,
    'Shift': InputAction.SHIFT, 'Control': InputAction.CTRL,
    'ArrowUp': InputAction.ARROW_UP, 'ArrowDown': InputAction.ARROW_DOWN,
    'ArrowLeft': InputAction.ARROW_LEFT, 'ArrowRight': InputAction.ARROW_RIGHT,
    '1': InputAction.SLOT_1, '2': InputAction.SLOT_2, '3': InputAction.SLOT_3, '4': InputAction.SLOT_4, '5': InputAction.SLOT_5
};

export interface InputState {
    actions: Uint8Array;
    mouse: THREE.Vector2;
    aimVector: THREE.Vector2;
    cursorPos: { x: number, y: number };
    joystickMove: THREE.Vector2;
    joystickAim: THREE.Vector2;
    locked: boolean;
    flashlightOn: boolean;
}

const MAX_AIM_RADIUS = 300;
const MAX_AIM_RADIUS_SQ = MAX_AIM_RADIUS * MAX_AIM_RADIUS;
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

    private screenWidth: number = window.innerWidth;
    private screenHeight: number = window.innerHeight;
    private invScreenWidth: number = 1.0 / this.screenWidth;
    private invScreenHeight: number = 1.0 / this.screenHeight;
    private screenHalfWidth: number = this.screenWidth * 0.5;
    private screenHalfHeight: number = this.screenHeight * 0.5;

    private lastNavBackTime = 0;
    private lastNavMapTime = 0;
    private lastNavLogTime = 0;
    private readonly NAV_DEBOUNCE_MS = 200;
    public onMetaAction?: (actionId: MetaActionId) => void;

    constructor() {
        this.handleResize();
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

    public enable() { this.isEnabled = true; }
    public disable() { this.isEnabled = false; this.resetState(); }

    public clearActions() {
        this.state.actions.fill(0);
        this.physicalActions.fill(0);
        this.prevActions.fill(0);
        this.state.joystickMove.set(0, 0);
        this.state.joystickAim.set(0, 0);
    }

    private resetState() { this.clearActions(); }

    private onKeyDown: ((key: string) => void) | null = null;
    private onKeyUp: ((key: string) => void) | null = null;

    public isPressed(action: InputAction): boolean { return this.state.actions[action] === 1; }

    public handleVirtualAction(action: InputAction, pressed: boolean) {
        if (action >= 0 && action < InputAction.COUNT) {
            this.physicalActions[action] = pressed ? 1 : 0;
        }
    }

    private bindEvents() {
        window.addEventListener('keydown', this.handleKeyDown, { capture: true });
        window.addEventListener('keyup', this.handleKeyUp, { capture: true });
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
        window.removeEventListener('keydown', this.handleKeyDown, true);
        window.removeEventListener('keyup', this.handleKeyUp, true);
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
        this.screenWidth = window.innerWidth; this.screenHeight = window.innerHeight;
        this.invScreenWidth = 1.0 / Math.max(1, this.screenWidth);
        this.invScreenHeight = 1.0 / Math.max(1, this.screenHeight);
        this.screenHalfWidth = this.screenWidth * 0.5; this.screenHalfHeight = this.screenHeight * 0.5;
    }

    public update(session: GameSessionLogic, delta: number, simTime: number, renderTime: number) {
        if (!this.isEnabled) {
            // Consume signals even if disabled to prevent backlog buildup
            UIEventBridge.consumeEngineSignal();
            UIEventBridge.consumeUiAction();
            return;
        }

        this.state.actions.set(this.physicalActions);

        if (UIEventBridge.getInteractionTrigger()) {
            this.state.actions[InputAction.INTERACT] = 1;
        }

        // Process transient UI-to-Engine action signals after copying keyboard physical actions,
        // so they persist for the simulation tick instead of being instantly overwritten.
        const engineSignal = UIEventBridge.consumeEngineSignal();
        if (engineSignal !== MetaActionId.NONE) {
            this.handleMetaAction(engineSignal);
        }

        const uiAction = UIEventBridge.consumeUiAction();
        if (uiAction !== MetaActionId.NONE) {
            this.handleMetaAction(uiAction);
        }

        // --- FLASHLIGHT TOGGLE (F) ---
        const flashlightPressed = this.state.actions[InputAction.FLASHLIGHT] === 1;
        if (flashlightPressed && this.prevActions[InputAction.FLASHLIGHT] === 0) {
            this.state.flashlightOn = !this.state.flashlightOn;
            if (session.state) {
                session.state.ui.flashlightOn = this.state.flashlightOn;
                const playerGroup = (session as any).playerGroup || (session as any)._playerGroup;
                if (playerGroup) {
                    let flashlight = playerGroup.userData.flashlightRef as THREE.SpotLight | undefined;
                    if (!flashlight) {
                        flashlight = playerGroup.getObjectByName('FLASHLIGHT') as THREE.SpotLight;
                        if (flashlight) {
                            playerGroup.userData.flashlightRef = flashlight;
                        }
                    }
                    if (flashlight) {
                        flashlight.intensity = session.state.ui.flashlightOn ? (FLASHLIGHT.intensity * (session.state.vehicle?.active ? 2.0 : 1.0)) : 0;
                    }
                }
            }
        }

        this.prevActions.set(this.state.actions);
    }

    private handleMetaAction(actionId: MetaActionId) {
        if (actionId === MetaActionId.NONE) return;

        switch (actionId) {
            case MetaActionId.INTERACT_TAP: this.state.actions[InputAction.INTERACT] = 1; break;
            case MetaActionId.RELOAD_TAP: this.state.actions[InputAction.RELOAD] = 1; break;
            case MetaActionId.WEAPON_SLOT_1: this.state.actions[InputAction.SLOT_1] = 1; break;
            case MetaActionId.WEAPON_SLOT_2: this.state.actions[InputAction.SLOT_2] = 1; break;
            case MetaActionId.WEAPON_SLOT_3: this.state.actions[InputAction.SLOT_3] = 1; break;
            case MetaActionId.WEAPON_SLOT_4: this.state.actions[InputAction.SLOT_4] = 1; break;
            case MetaActionId.WEAPON_SLOT_5: this.state.actions[InputAction.SLOT_5] = 1; break;
            case MetaActionId.TOGGLE_FLASHLIGHT: this.state.actions[InputAction.FLASHLIGHT] = 1; break;
        }

        if (this.onMetaAction) {
            this.onMetaAction(actionId);
        }

        window.dispatchEvent(new CustomEvent('engine-meta-action', { detail: { actionId } }));
    }

    private handleKeyDown(e: KeyboardEvent) {
        const action = INPUT_KEY_MAP[e.key];
        if (action === undefined) return;

        if (action === InputAction.ESCAPE || action === InputAction.MAP || action === InputAction.LOG || action === InputAction.ENTER) {
            e.preventDefault();
            e.stopPropagation();
        }

        const now = performance.now();

        if (action === InputAction.ESCAPE) {
            if (now - this.lastNavBackTime > this.NAV_DEBOUNCE_MS) {
                this.handleMetaAction(MetaActionId.NAV_BACK);
                this.lastNavBackTime = now;
            }
            return;
        }

        if (action === InputAction.MAP) {
            if (now - this.lastNavMapTime > this.NAV_DEBOUNCE_MS) {
                this.handleMetaAction(MetaActionId.NAV_MAP);
                this.lastNavMapTime = now;
            }
            return;
        }

        if (action === InputAction.LOG) {
            if (now - this.lastNavLogTime > this.NAV_DEBOUNCE_MS) {
                this.handleMetaAction(MetaActionId.NAV_LOG);
                this.lastNavLogTime = now;
            }
            return;
        }

        if (action === InputAction.ENTER) {
            this.handleMetaAction(MetaActionId.NAV_CONFIRM);
            return;
        }

        if (!this.isEnabled) return;

        if (this.onKeyDown) this.onKeyDown(e.key);
        if (e.repeat) return;

        this.physicalActions[action] = 1;
    }

    private handleKeyUp(e: KeyboardEvent) {
        const action = INPUT_KEY_MAP[e.key];
        if (action === undefined) return;

        if (action === InputAction.ESCAPE || action === InputAction.MAP || action === InputAction.LOG || action === InputAction.ENTER) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        if (!this.isEnabled) return;
        if (this.onKeyUp) this.onKeyUp(e.key);
        this.physicalActions[action] = 0;
    }

    private handleMouseMove(e: MouseEvent) {
        if (!this.isEnabled) {
            this.state.cursorPos.x = e.clientX; this.state.cursorPos.y = e.clientY;
            return;
        }
        if (document.pointerLockElement) {
            this.virtualAimPos.x += e.movementX; this.virtualAimPos.y += e.movementY;
            const distSq = this.virtualAimPos.x * this.virtualAimPos.x + this.virtualAimPos.y * this.virtualAimPos.y;
            if (distSq > MAX_AIM_RADIUS_SQ) {
                const dist = Math.sqrt(distSq);
                this.virtualAimPos.x *= (1.0 / dist) * MAX_AIM_RADIUS;
                this.virtualAimPos.y *= (1.0 / dist) * MAX_AIM_RADIUS;
            }
            this.state.aimVector.copy(this.virtualAimPos);
            this.state.mouse.x = this.virtualAimPos.x * INV_MAX_AIM_RADIUS;
            this.state.mouse.y = this.virtualAimPos.y * INV_MAX_AIM_RADIUS;
        } else {
            this.state.cursorPos.x = e.clientX; this.state.cursorPos.y = e.clientY;
            this.state.mouse.x = (e.clientX * this.invScreenWidth) * 2.0 - 1.0;
            this.state.mouse.y = -(e.clientY * this.invScreenHeight) * 2.0 + 1.0;
            this.state.aimVector.set(e.clientX - this.screenHalfWidth, e.clientY - this.screenHalfHeight);
        }
    }

    private handleMouseDown(e: MouseEvent) { if (this.isEnabled && e.button === 0) this.physicalActions[InputAction.FIRE] = 1; }
    private handleMouseUp(e: MouseEvent) { if (this.isEnabled && e.button === 0) this.physicalActions[InputAction.FIRE] = 0; }
    private handleWheel(e: WheelEvent) {
        if (!this.isEnabled) return;
        if (e.deltaY < 0) this.state.actions[InputAction.SCROLL_UP] = 1;
        else if (e.deltaY > 0) this.state.actions[InputAction.SCROLL_DOWN] = 1;
    }
    private handleLockChange() { this.state.locked = !!document.pointerLockElement; }
    private handleFocus() { this.state.locked = !!document.pointerLockElement; }
    private handleBlur() { this.resetState(); }

    public requestPointerLock(element: HTMLElement) {
        if (!element || this.state.locked || !!document.pointerLockElement) return;
        try {
            const promise = element.requestPointerLock() as any;
            if (promise && promise.catch) promise.catch(() => { });
        } catch (err) { }
    }

    public setJoystickMove(x: number, y: number) { this.state.joystickMove.set(x, y); }
    public setJoystickAim(x: number, y: number) { this.state.joystickAim.set(x, y); }
}