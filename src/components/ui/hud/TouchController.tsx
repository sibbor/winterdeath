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
const HUD_GUTTER = '12%'; // VINTERDÖD: Safe zone for Pause/HUD buttons

// ZERO-GC: Hoisted lookup table to avoid inline allocation per handler call
const KEY_MAP = { r: 'r', space: ' ', e: 'e', f: 'f' };

const TouchController: React.FC<TouchControllerProps> = React.memo(({ inputState, onPause, onOpenMap }) => {
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
    
    // ZERO-GC: Pre-allocated objects for touch tracking
    const leftCenter = useRef({ x: 0, y: 0 });
    const rightCenter = useRef({ x: 0, y: 0 });

    const isInteractiveElement = (target: EventTarget) => {
        return (target as HTMLElement).tagName === 'BUTTON';
    };

    const handleAction = useCallback((action: 'r' | 'space' | 'e' | 'f', pressed: boolean) => {
        const key = (KEY_MAP as any)[action];

        if (action === 'r') inputState.r = pressed;
        if (action === 'space') inputState.space = pressed;
        if (action === 'e') inputState.e = pressed;
        if (action === 'f') inputState.f = pressed;

        // Note: dispatching events is technically an allocation but acceptable for rare button presses (R/Space)
        // compared to 120FPS joystick move logic.
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
                
                // ZERO-GC: Mutating existing ref properties instead of object assignment
                leftCenter.current.x = x;
                leftCenter.current.y = y;

                if (leftStickContainerRef.current) {
                    leftStickContainerRef.current.style.display = 'block';
                    leftStickContainerRef.current.style.transform = `translate3d(${x - STICK_RADIUS}px, ${y - STICK_RADIUS}px, 0)`;
                }
            }
            // --- RIGHT ZONE (Aiming) ---
            else if (x > w * 0.5 && y > h * 0.3 && rightTouchId.current === null) {
                rightTouchId.current = t.identifier;
                
                // ZERO-GC: Mutating existing ref properties
                rightCenter.current.x = x;
                rightCenter.current.y = y;

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
            if (t.identifier === leftTouchId.current && inputState?.joystickMove) {
                let dx = t.clientX - leftCenter.current.x;
                let dy = t.clientY - leftCenter.current.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                // --- VINTERDÖD: ABSOLUTE NORMALIZATION ---
                // We enforce a unit vector if the distance exceeds 1.0 logic units.
                // This ensures absolute physics parity regardless of CSS-to-DPI scaling.
                if (dist > 0.001) {
                    const normMag = Math.min(1.0, dist / MAX_DIST);
                    const angle = Math.atan2(dy, dx);
                    inputState.joystickMove.set(Math.cos(angle) * normMag, Math.sin(angle) * normMag);
                } else {
                    inputState.joystickMove.set(0, 0);
                }

                const visualDist = Math.min(dist, MAX_DIST);
                const visualAngle = Math.atan2(dy, dx);
                if (leftStickKnobRef.current) {
                    leftStickKnobRef.current.style.transform = `translate3d(${Math.cos(visualAngle) * visualDist}px, ${Math.sin(visualAngle) * visualDist}px, 0)`;
                }
            }

            // Uppdatera höger spak
            if (t.identifier === rightTouchId.current && inputState?.joystickAim) {
                let dx = t.clientX - rightCenter.current.x;
                let dy = t.clientY - rightCenter.current.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist > 0.001) {
                    const normMag = Math.min(1.0, dist / MAX_DIST);
                    const angle = Math.atan2(dy, dx);
                    inputState.joystickAim.set(Math.cos(angle) * normMag, Math.sin(angle) * normMag);
                } else {
                    inputState.joystickAim.set(0, 0);
                }

                inputState.fire = dist > 5;

                const visualDist = Math.min(dist, MAX_DIST);
                const visualAngle = Math.atan2(dy, dx);
                if (rightStickKnobRef.current) {
                    rightStickKnobRef.current.style.transform = `translate3d(${Math.cos(visualAngle) * visualDist}px, ${Math.sin(visualAngle) * visualDist}px, 0)`;
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
                if (inputState?.joystickMove) inputState.joystickMove.set(0, 0);
                if (leftStickContainerRef.current) leftStickContainerRef.current.style.display = 'none';
            }
            if (t.identifier === rightTouchId.current) {
                rightTouchId.current = null;
                if (inputState?.joystickAim) {
                    inputState.joystickAim.set(0, 0);
                    inputState.fire = false;
                }
                if (rightStickContainerRef.current) rightStickContainerRef.current.style.display = 'none';
            }
        }
    }, [inputState]);

    return (
        <div className={`absolute inset-0 pointer-events-none z-[100] overflow-hidden select-none touch-none transition-opacity duration-1000 ${hudVisible ? 'opacity-100' : 'opacity-0'}`}>
            {/* LEFT TOUCH ZONE (Movement) */}
            <div
                className="absolute left-0 w-[40%] h-[80%] pointer-events-auto"
                style={{ top: HUD_GUTTER, touchAction: 'none' }}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchEnd}
            />

            {/* RIGHT TOUCH ZONE (Aiming) */}
            <div
                className="absolute right-0 w-[50%] h-[80%] pointer-events-auto"
                style={{ top: HUD_GUTTER, touchAction: 'none' }}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchEnd}
            />

            {/* LEFT JOYSTICK VISUAL */}
            <div
                ref={leftStickContainerRef}
                className="absolute rounded-full border-2 border-white/20 bg-white/5 pointer-events-none animate-in fade-in zoom-in duration-200"
                style={{ width: STICK_RADIUS * 2, height: STICK_RADIUS * 2, display: 'none' }}
            >
                <div
                    ref={leftStickKnobRef}
                    className="absolute rounded-full bg-white/40 shadow-[0_0_15px_rgba(255,255,255,0.3)]"
                    style={{ left: STICK_RADIUS - 25, top: STICK_RADIUS - 25, width: 50, height: 50 }}
                />
            </div>

            {/* RIGHT JOYSTICK VISUAL */}
            <div
                ref={rightStickContainerRef}
                className="absolute rounded-full border-2 border-red-500/20 bg-red-900/5 pointer-events-none animate-in fade-in zoom-in duration-200"
                style={{ width: STICK_RADIUS * 2, height: STICK_RADIUS * 2, display: 'none' }}
            >
                <div
                    ref={rightStickKnobRef}
                    className="absolute rounded-full bg-red-500/40 shadow-[0_0_15px_rgba(220,38,38,0.3)]"
                    style={{ left: STICK_RADIUS - 25, top: STICK_RADIUS - 25, width: 50, height: 50 }}
                />
            </div>

            {/* Action Buttons */}
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
                        <img src="/assets/icons/ui/icon_dodge.png" alt="Dodge" className="w-full h-full object-contain pointer-events-none" />
                    </button>
                </div>
            </div>
        </div>
    );
});

export default TouchController;