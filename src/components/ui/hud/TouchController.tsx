import React, { useRef, useCallback } from 'react';
import { InputState } from '../../../core/engine/InputManager';
import { useOrientation } from '../../../hooks/useOrientation';
import { useHudStore } from '../../../hooks/useHudStore';

interface TouchControllerProps {
    inputState: InputState;
    onPause?: () => void;
    onOpenMap?: () => void;
}

const STICK_RADIUS = 60;
const MAX_DIST = 50;

const TouchController: React.FC<TouchControllerProps> = ({ inputState, onPause, onOpenMap }) => {
    const { isLandscapeMode } = useOrientation();
    const hudVisible = useHudStore(s => s.hudVisible);

    // --- REFS FÖR DIREKT DOM-MANIPULATION (Zero-GC) ---
    const leftStickContainerRef = useRef<HTMLDivElement>(null);
    const leftStickKnobRef = useRef<HTMLDivElement>(null);
    const rightStickContainerRef = useRef<HTMLDivElement>(null);
    const rightStickKnobRef = useRef<HTMLDivElement>(null);

    // Touch tracking (Använder refs för att slippa re-renders)
    const leftTouchId = useRef<number | null>(null);
    const rightTouchId = useRef<number | null>(null);
    const leftCenter = useRef({ x: 0, y: 0 });
    const rightCenter = useRef({ x: 0, y: 0 });

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

        window.dispatchEvent(new KeyboardEvent(pressed ? 'keydown' : 'keyup', { key, bubbles: true }));
    }, [inputState]);

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

        const touches = e.changedTouches;
        const w = window.innerWidth;
        const h = window.innerHeight;

        for (let i = 0; i < touches.length; i++) {
            const t = touches[i];
            if (isInteractiveElement(t.target)) continue;

            const x = t.clientX;
            const y = t.clientY;

            // --- LEFT ZONE (Movement) ---
            if (x < w * 0.4 && y > h * 0.3 && leftTouchId.current === null) {
                leftTouchId.current = t.identifier;
                leftCenter.current = { x, y };

                if (leftStickContainerRef.current) {
                    leftStickContainerRef.current.style.display = 'block';
                    leftStickContainerRef.current.style.transform = `translate3d(${x - STICK_RADIUS}px, ${y - STICK_RADIUS}px, 0)`;
                }
            }
            // --- RIGHT ZONE (Aiming) ---
            else if (x > w * 0.5 && y > h * 0.3 && rightTouchId.current === null) {
                rightTouchId.current = t.identifier;
                rightCenter.current = { x, y };

                if (rightStickContainerRef.current) {
                    rightStickContainerRef.current.style.display = 'block';
                    rightStickContainerRef.current.style.transform = `translate3d(${x - STICK_RADIUS}px, ${y - STICK_RADIUS}px, 0)`;
                }
            }
        }
    }, []);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        if (e.cancelable) e.preventDefault();
        const touches = e.changedTouches;

        for (let i = 0; i < touches.length; i++) {
            const t = touches[i];

            // Uppdatera vänster spak
            if (t.identifier === leftTouchId.current) {
                let dx = t.clientX - leftCenter.current.x;
                let dy = t.clientY - leftCenter.current.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist > MAX_DIST) {
                    const ratio = MAX_DIST / dist;
                    dx *= ratio;
                    dy *= ratio;
                }

                inputState.joystickMove.set(dx / MAX_DIST, dy / MAX_DIST);

                if (leftStickKnobRef.current) {
                    leftStickKnobRef.current.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
                }
            }

            // Uppdatera höger spak
            if (t.identifier === rightTouchId.current) {
                let dx = t.clientX - rightCenter.current.x;
                let dy = t.clientY - rightCenter.current.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist > MAX_DIST) {
                    const ratio = MAX_DIST / dist;
                    dx *= ratio;
                    dy *= ratio;
                }

                inputState.joystickAim.set(dx / MAX_DIST, dy / MAX_DIST);
                inputState.fire = dist > 5;

                if (rightStickKnobRef.current) {
                    rightStickKnobRef.current.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
                }
            }
        }
    }, [inputState]);

    const handleTouchEnd = useCallback((e: React.TouchEvent) => {
        const touches = e.changedTouches;

        for (let i = 0; i < touches.length; i++) {
            const t = touches[i];
            if (t.identifier === leftTouchId.current) {
                leftTouchId.current = null;
                inputState.joystickMove.set(0, 0);
                if (leftStickContainerRef.current) leftStickContainerRef.current.style.display = 'none';
            }
            if (t.identifier === rightTouchId.current) {
                rightTouchId.current = null;
                inputState.joystickAim.set(0, 0);
                inputState.fire = false;
                if (rightStickContainerRef.current) rightStickContainerRef.current.style.display = 'none';
            }
        }
    }, [inputState]);

    return (
        <div className={`absolute inset-0 pointer-events-none z-[40] overflow-hidden select-none touch-none transition-opacity duration-1000 ${hudVisible ? 'opacity-100' : 'opacity-0'}`}>
            {/* Full-screen joystick capture layer — sits BELOW GameHUD (z-50).
                pointer-events-auto only for touch, so joystick gestures anywhere work.
                GameHUD renders at z-[60]+ as a sibling in App.tsx and sits above this. */}
            <div
                className="absolute inset-0 pointer-events-auto"
                style={{ touchAction: 'none' }}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchEnd}
            >
            {/* VÄNSTER JOYSTICK (Renderas alltid men döljs via CSS) */}
            <div
                ref={leftStickContainerRef}
                className="absolute rounded-full border-2 border-white/20 bg-white/5 pointer-events-none will-change-transform"
                style={{ width: STICK_RADIUS * 2, height: STICK_RADIUS * 2, display: 'none' }}
            >
                <div
                    ref={leftStickKnobRef}
                    className="absolute rounded-full bg-white/40 shadow-[0_0_15px_rgba(255,255,255,0.3)] will-change-transform"
                    style={{ left: STICK_RADIUS - 25, top: STICK_RADIUS - 25, width: 50, height: 50 }}
                />
            </div>

            {/* HÖGER JOYSTICK */}
            <div
                ref={rightStickContainerRef}
                className="absolute rounded-full border-2 border-red-500/20 bg-red-900/5 pointer-events-none will-change-transform"
                style={{ width: STICK_RADIUS * 2, height: STICK_RADIUS * 2, display: 'none' }}
            >
                <div
                    ref={rightStickKnobRef}
                    className="absolute rounded-full bg-red-500/40 shadow-[0_0_15px_rgba(220,38,38,0.3)] will-change-transform"
                    style={{ left: STICK_RADIUS - 25, top: STICK_RADIUS - 25, width: 50, height: 50 }}
                />
            </div>

            {/* Action Buttons - Statiska, triggar inga re-renders förutom vid tryck */}
            <div className={`absolute pointer-events-auto flex z-40 pr-safe pb-safe ${isLandscapeMode ? 'bottom-2 right-4 flex-col gap-2' : 'bottom-24 right-4 flex-col gap-2'}`}>
                <div className="flex justify-end">
                    <button data-action="f" className="w-12 h-12 md:w-16 md:h-16 rounded-full border border-white/20 bg-black/40 backdrop-blur-sm flex items-center justify-center p-2 opacity-60 active:opacity-100 transition-opacity" onTouchStart={handleActionTouchStart} onTouchEnd={handleActionTouchEnd}>
                        <img src="/assets/icons/ui/icon_flashlight.png" alt="F" className="w-full h-full object-contain pointer-events-none" />
                    </button>
                </div>
                <div className="flex items-end gap-2">
                    <button data-action="r" className="w-16 h-16 md:w-20 md:h-20 rounded-full border border-white/20 bg-black/40 backdrop-blur-sm flex items-center justify-center p-3 opacity-60 active:opacity-100 transition-opacity" onTouchStart={handleActionTouchStart} onTouchEnd={handleActionTouchEnd}>
                        <img src="/assets/icons/ui/icon_reload.png" alt="R" className="w-full h-full object-contain pointer-events-none" />
                    </button>
                    <button data-action="space" className="w-20 h-20 md:w-24 md:h-24 rounded-full border border-white/20 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 shadow-[0_0_20px_rgba(255,0,0,0.4)] opacity-80 active:opacity-100 transition-opacity" onTouchStart={handleActionTouchStart} onTouchEnd={handleActionTouchEnd}>
                        <img src="/assets/icons/ui/icon_dash.png" alt="Dash" className="w-full h-full object-contain pointer-events-none" />
                    </button>
                </div>
            </div>
            </div>  {/* joystick capture layer */}
        </div>
    );
};

export default TouchController;