import React, { useRef, useState, useCallback } from 'react';
import { InputState } from '../../../core/engine/InputManager';
import { useOrientation } from '../../../hooks/useOrientation';

interface TouchControllerProps {
    inputState: InputState;
    onPause?: () => void;
    onOpenMap?: () => void;
}

const STICK_RADIUS = 60; // Slightly larger for better control
const MAX_DIST = 50;

const TouchController: React.FC<TouchControllerProps> = ({ inputState, onPause, onOpenMap }) => {
    const { isLandscapeMode } = useOrientation();
    // Joystick States
    const [leftStick, setLeftStick] = useState({ active: false, center: { x: 0, y: 0 }, curr: { x: 0, y: 0 } });
    const [rightStick, setRightStick] = useState({ active: false, center: { x: 0, y: 0 }, curr: { x: 0, y: 0 } });

    // IDs to track specific touches
    const leftTouchId = useRef<number | null>(null);
    const rightTouchId = useRef<number | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Helper to check if a touch is within a button's bounding rect
    const isInteractiveElement = (target: EventTarget) => {
        return (target as HTMLElement).tagName === 'BUTTON';
    };

    const handleAction = useCallback((action: 'r' | 'space' | 'e' | 'f', pressed: boolean) => {
        const keyMap = { r: 'r', space: ' ', e: 'e', f: 'f' };
        const key = keyMap[action];

        if (action === 'r') inputState.r = pressed;
        if (action === 'space') inputState.space = pressed;
        if (action === 'e') inputState.e = pressed;
        if (action === 'f') inputState.f = pressed;

        // Dispatch events for systems listening to keydown/keyup
        const eventType = pressed ? 'keydown' : 'keyup';
        window.dispatchEvent(new KeyboardEvent(eventType, { key, bubbles: true }));
    }, [inputState]);

    // Zero-GC React Event Handlers

    const handleActionTouchStart = useCallback((e: React.TouchEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        const action = e.currentTarget.dataset.action as 'r' | 'space' | 'e' | 'f';
        if (action) handleAction(action, true);
    }, [handleAction]);

    const handleActionTouchEnd = useCallback((e: React.TouchEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        const action = e.currentTarget.dataset.action as 'r' | 'space' | 'e' | 'f';
        if (action) handleAction(action, false);
    }, [handleAction]);

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        if (e.cancelable) e.preventDefault();

        // Iterate TouchList directly instead of Array.from to avoid GC allocation
        const touches = e.changedTouches;
        const w = window.innerWidth;
        const h = window.innerHeight;

        for (let i = 0; i < touches.length; i++) {
            const t = touches[i];
            if (isInteractiveElement(t.target)) return;

            const x = t.clientX;
            const y = t.clientY;

            // Left Zone (Movement) - Bottom Left Half
            if (x < w * 0.4 && y > h * 0.3 && leftTouchId.current === null) {
                leftTouchId.current = t.identifier;
                setLeftStick({ active: true, center: { x, y }, curr: { x, y } });
            }
            // Right Zone (Aiming) - Bottom Right Half
            else if (x > w * 0.5 && y > h * 0.3 && rightTouchId.current === null) {
                rightTouchId.current = t.identifier;
                setRightStick({ active: true, center: { x, y }, curr: { x, y } });
            }
        }
    }, []);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        // CRITICAL: This prevents the browser from intercepting the dual-touch as a zoom/scroll
        if (e.cancelable) e.preventDefault();

        const touches = e.changedTouches;

        for (let i = 0; i < touches.length; i++) {
            const t = touches[i];

            if (t.identifier === leftTouchId.current) {
                setLeftStick(prev => {
                    const center = prev.center;
                    let dx = t.clientX - center.x;
                    let dy = t.clientY - center.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist > MAX_DIST) {
                        const angle = Math.atan2(dy, dx);
                        dx = Math.cos(angle) * MAX_DIST;
                        dy = Math.sin(angle) * MAX_DIST;
                    }

                    const nx = dx / MAX_DIST;
                    const ny = dy / MAX_DIST;
                    inputState.joystickMove.set(nx, ny);

                    return { active: true, center, curr: { x: center.x + dx, y: center.y + dy } };
                });
            }

            if (t.identifier === rightTouchId.current) {
                setRightStick(prev => {
                    const center = prev.center;
                    let dx = t.clientX - center.x;
                    let dy = t.clientY - center.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist > MAX_DIST) {
                        const angle = Math.atan2(dy, dx);
                        dx = Math.cos(angle) * MAX_DIST;
                        dy = Math.sin(angle) * MAX_DIST;
                    }

                    const nx = dx / MAX_DIST;
                    const ny = dy / MAX_DIST;
                    inputState.joystickAim.set(nx, ny);

                    if (dist > 5) {
                        inputState.fire = true;
                    } else {
                        inputState.fire = false;
                    }

                    return { active: true, center, curr: { x: center.x + dx, y: center.y + dy } };
                });
            }
        }
    }, [inputState]);

    const handleTouchEnd = useCallback((e: React.TouchEvent) => {
        if (e.cancelable) e.preventDefault();

        const touches = e.changedTouches;

        for (let i = 0; i < touches.length; i++) {
            const t = touches[i];
            if (t.identifier === leftTouchId.current) {
                leftTouchId.current = null;
                setLeftStick(prev => ({ active: false, center: prev.center, curr: prev.center }));
                inputState.joystickMove.set(0, 0);
            }
            if (t.identifier === rightTouchId.current) {
                rightTouchId.current = null;
                setRightStick(prev => ({ active: false, center: prev.center, curr: prev.center }));
                inputState.joystickAim.set(0, 0);
                inputState.fire = false;
            }
        }
    }, [inputState]);

    return (
        <div
            ref={containerRef}
            className="absolute inset-0 pointer-events-auto z-[0] overflow-hidden select-none"
            style={{ touchAction: 'none' }} // INLINE STYLE IS CRITICAL FOR SAFARI
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
        >
            {/* Joysticks */}
            {leftStick.active && (
                <div
                    className="absolute rounded-full border-2 border-white/20 bg-white/5 pointer-events-none"
                    style={{
                        left: leftStick.center.x - STICK_RADIUS,
                        top: leftStick.center.y - STICK_RADIUS,
                        width: STICK_RADIUS * 2,
                        height: STICK_RADIUS * 2
                    }}
                >
                    <div
                        className="absolute rounded-full bg-white/40 shadow-[0_0_15px_rgba(255,255,255,0.3)]"
                        style={{
                            left: STICK_RADIUS + (leftStick.curr.x - leftStick.center.x) - 25,
                            top: STICK_RADIUS + (leftStick.curr.y - leftStick.center.y) - 25,
                            width: 50,
                            height: 50
                        }}
                    />
                </div>
            )}

            {rightStick.active && (
                <div
                    className="absolute rounded-full border-2 border-red-500/20 bg-red-900/5 pointer-events-none"
                    style={{
                        left: rightStick.center.x - STICK_RADIUS,
                        top: rightStick.center.y - STICK_RADIUS,
                        width: STICK_RADIUS * 2,
                        height: STICK_RADIUS * 2
                    }}
                >
                    <div
                        className="absolute rounded-full bg-red-500/40 shadow-[0_0_15px_rgba(220,38,38,0.3)]"
                        style={{
                            left: STICK_RADIUS + (rightStick.curr.x - rightStick.center.x) - 25,
                            top: STICK_RADIUS + (rightStick.curr.y - rightStick.center.y) - 25,
                            width: 50,
                            height: 50
                        }}
                    />
                </div>
            )}

            {/* Action Buttons (Bottom Right) */}
            <div className={`absolute pointer-events-auto flex z-40 pr-safe pb-safe
                ${isLandscapeMode
                    ? 'bottom-2 right-4 flex-col gap-2'
                    : 'bottom-24 right-4 flex-col gap-2'}
            `}>
                {/* Row for Flashlight (Above Dash) */}
                <div className="flex justify-end">
                    <button
                        data-action="f"
                        className="w-12 h-12 md:w-16 md:h-16 rounded-full border border-white/20 bg-black/40 backdrop-blur-sm flex items-center justify-center p-2 opacity-60 active:opacity-100 transition-opacity"
                        onTouchStart={handleActionTouchStart}
                        onTouchEnd={handleActionTouchEnd}
                    >
                        <img src="/assets/icons/ui/icon_flashlight.png" alt="F" className="w-full h-full object-contain pointer-events-none" />
                    </button>
                </div>

                {/* Row for Reload and Dash (Bottom Row) */}
                <div className="flex items-end gap-2">
                    {/* Reload (R) - 80% ish size of Dash */}
                    <button
                        data-action="r"
                        className="w-16 h-16 md:w-20 md:h-20 rounded-full border border-white/20 bg-black/40 backdrop-blur-sm flex items-center justify-center p-3 opacity-60 active:opacity-100 transition-opacity"
                        onTouchStart={handleActionTouchStart}
                        onTouchEnd={handleActionTouchEnd}
                    >
                        <img src="/assets/icons/ui/icon_reload.png" alt="R" className="w-full h-full object-contain pointer-events-none" />
                    </button>

                    {/* Dash (Space) - Primary control */}
                    <button
                        data-action="space"
                        className="w-20 h-20 md:w-24 md:h-24 rounded-full border border-white/20 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 shadow-[0_0_20px_rgba(255,0,0,0.4)] opacity-80 active:opacity-100 transition-opacity"
                        onTouchStart={handleActionTouchStart}
                        onTouchEnd={handleActionTouchEnd}
                    >
                        <img src="/assets/icons/ui/icon_dash.png" alt="Dash" className="w-full h-full object-contain pointer-events-none" />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TouchController;