import React, { useRef, useEffect, useState } from 'react';
import { InputState } from '../../core/engine/InputManager';
import { t } from '../../utils/i18n';

interface TouchControllerProps {
    inputState: InputState;
    onPause?: () => void;
    onOpenMap?: () => void;
}

const TouchController: React.FC<TouchControllerProps> = ({ inputState, onPause, onOpenMap }) => {
    // Joystick States
    const [leftStick, setLeftStick] = useState({ active: false, center: { x: 0, y: 0 }, curr: { x: 0, y: 0 } });
    const [rightStick, setRightStick] = useState({ active: false, center: { x: 0, y: 0 }, curr: { x: 0, y: 0 } });

    // IDs to track specific touches
    const leftTouchId = useRef<number | null>(null);
    const rightTouchId = useRef<number | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const STICK_RADIUS = 60; // Slightly larger for better control
    const MAX_DIST = 50;

    // Helper to check if a touch is within a button's bounding rect
    const isInteractiveElement = (target: EventTarget) => {
        return (target as HTMLElement).tagName === 'BUTTON';
    };

    // --- React Event Handlers (Safe with touch-action: none) ---

    const handleTouchStart = (e: React.TouchEvent) => {
        if (e.cancelable) e.preventDefault();

        const touches = Array.from(e.changedTouches);
        const w = window.innerWidth;
        const h = window.innerHeight;

        touches.forEach((t: any) => {
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
        });
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        // CRITICAL: This prevents the browser from intercepting the dual-touch as a zoom/scroll
        if (e.cancelable) e.preventDefault();

        const touches = Array.from(e.changedTouches);

        touches.forEach((t: any) => {
            if (t.identifier === leftTouchId.current) {
                // We use the state's center. 
                const center = leftStick.center;
                let dx = t.clientX - center.x;
                let dy = t.clientY - center.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist > MAX_DIST) {
                    const angle = Math.atan2(dy, dx);
                    dx = Math.cos(angle) * MAX_DIST;
                    dy = Math.sin(angle) * MAX_DIST;
                }

                setLeftStick(prev => ({ ...prev, curr: { x: center.x + dx, y: center.y + dy } }));

                const nx = dx / MAX_DIST;
                const ny = dy / MAX_DIST;
                inputState.joystickMove.set(nx, ny);
            }

            if (t.identifier === rightTouchId.current) {
                const center = rightStick.center;
                let dx = t.clientX - center.x;
                let dy = t.clientY - center.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist > MAX_DIST) {
                    const angle = Math.atan2(dy, dx);
                    dx = Math.cos(angle) * MAX_DIST;
                    dy = Math.sin(angle) * MAX_DIST;
                }

                setRightStick(prev => ({ ...prev, curr: { x: center.x + dx, y: center.y + dy } }));

                const nx = dx / MAX_DIST;
                const ny = dy / MAX_DIST;
                inputState.joystickAim.set(nx, ny);

                if (dist > 5) {
                    inputState.fire = true;
                } else {
                    inputState.fire = false;
                }
            }
        });
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (e.cancelable) e.preventDefault();

        const touches = Array.from(e.changedTouches);

        touches.forEach((t: any) => {
            if (t.identifier === leftTouchId.current) {
                leftTouchId.current = null;
                setLeftStick(prev => ({ ...prev, active: false, curr: prev.center }));
                inputState.joystickMove.set(0, 0);
            }
            if (t.identifier === rightTouchId.current) {
                rightTouchId.current = null;
                setRightStick(prev => ({ ...prev, active: false, curr: prev.center }));
                inputState.joystickAim.set(0, 0);
                inputState.fire = false;
            }
        });
    };

    const handleAction = (action: 'r' | 'space' | 'e', pressed: boolean) => {
        const keyMap = { r: 'r', space: ' ', e: 'e' };
        const key = keyMap[action];

        if (action === 'r') inputState.r = pressed;
        if (action === 'space') inputState.space = pressed;
        if (action === 'e') inputState.e = pressed;

        // Dispatch events for systems listening to keydown/keyup
        const eventType = pressed ? 'keydown' : 'keyup';
        window.dispatchEvent(new KeyboardEvent(eventType, { key, bubbles: true }));
    };

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
            {/* System Buttons (Top Right - Pause Button Only) */}
            <div className="absolute top-14 right-4 flex flex-col gap-3 pointer-events-auto z-[70]">
                <button
                    className="w-14 h-14 rounded-full border-2 border-white/20 bg-white/5 text-white font-bold text-xs tracking-widest shadow-lg active:scale-95 active:bg-red-800 active:border-white transition-all backdrop-blur-sm flex items-center justify-center"
                    onTouchStart={(e) => { e.stopPropagation(); onPause?.(); }}
                >
                    ||
                </button>
            </div>

            {/* Left Joystick (Visual) */}
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

            {/* Right Joystick (Visual) */}
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

            {/* Action Buttons (Bottom Right Cluster) */}
            <div className="absolute bottom-40 right-6 pointer-events-auto flex flex-col items-end gap-3">
                <div className="flex gap-2 items-end">
                    {/* Reload (R) */}
                    <button
                        className="w-14 h-14 rounded-full border-2 border-gray-500 bg-black/60 text-gray-200 font-bold text-lg active:bg-gray-700 active:border-white active:scale-95 transition-all mb-2 mr-2"
                        onTouchStart={(e) => { e.stopPropagation(); handleAction('r', true); }}
                        onTouchEnd={(e) => { e.stopPropagation(); handleAction('r', false); }}
                    >
                        R
                    </button>

                    {/* Dash (Space) */}
                    <button
                        className="w-20 h-20 rounded-full border-2 border-white/80 bg-white/10 text-white font-black text-xs tracking-widest active:bg-white/30 active:scale-95 transition-all backdrop-blur-sm"
                        onTouchStart={(e) => { e.stopPropagation(); handleAction('space', true); }}
                        onTouchEnd={(e) => { e.stopPropagation(); handleAction('space', false); }}
                    >
                        DASH
                    </button>
                </div>

            </div>
        </div>
    );
};

export default TouchController;
