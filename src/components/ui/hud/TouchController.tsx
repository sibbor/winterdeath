import React, { useRef, useCallback } from 'react';
import { InputAction, InputState } from '../../../core/engine/InputManager';
import { useOrientation } from '../../../hooks/useOrientation';
import { useHudStore } from '../../../hooks/useHudStore';

/**
 * ZERO-GC PIXEL POOL
 * Pre-allocated strings for -100px to 100px to avoid string building in joystick loops.
 * Access via: PIXEL_STRINGS[Math.round(val) + 100]
 */
const PIXEL_STRINGS = Array.from({ length: 201 }, (_, i) => (i - 100).toString() + 'px');

interface TouchControllerProps {
    inputState: InputState;
    onPause?: () => void;
    onOpenMap?: () => void;
}

const STICK_RADIUS = 60;
const MAX_DIST = 50;
const HUD_GUTTER = '12%'; // Safe zone for Pause/HUD buttons

const TouchController: React.FC<TouchControllerProps> = React.memo(({ inputState, onPause, onOpenMap }) => {
    const { isLandscapeMode } = useOrientation();
    const hudVisible = useHudStore(s => s.hudVisible);

    // --- REFS FÖR DIREKT DOM-MANIPULATION (Zero-GC) ---
    const leftStickContainerRef = useRef<HTMLDivElement>(null);
    const leftStickKnobRef = useRef<HTMLDivElement>(null);
    const rightStickContainerRef = useRef<HTMLDivElement>(null);
    const rightStickKnobRef = useRef<HTMLDivElement>(null);

    // Touch tracking (uses refs to avoid re-renders)
    const leftTouchId = useRef<number | null>(null);
    const rightTouchId = useRef<number | null>(null);

    // Pre-allocated objects for touch tracking
    const leftCenter = useRef({ x: 0, y: 0 });
    const rightCenter = useRef({ x: 0, y: 0 });

    const isInteractiveElement = (target: EventTarget) => {
        return (target as HTMLElement).tagName === 'BUTTON';
    };

    /**
     * SMI-Hardened action handler.
     * Updates the shared input buffer directly.
     */
    const handleAction = useCallback((action: InputAction, pressed: boolean) => {
        if (action < InputAction.COUNT) {
            inputState.actions[action] = pressed ? 1 : 0;
        }
    }, [inputState]);

    const handleActionTouchStart = useCallback((e: React.TouchEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        const action = Number(e.currentTarget.dataset.action);
        if (!isNaN(action)) handleAction(action as InputAction, true);
    }, [handleAction]);

    const handleActionTouchEnd = useCallback((e: React.TouchEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        const action = Number(e.currentTarget.dataset.action);
        if (!isNaN(action)) handleAction(action as InputAction, false);
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

                // --- ABSOLUTE NORMALIZATION ---
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
                    const tx = Math.max(0, Math.min(200, Math.round(Math.cos(visualAngle) * visualDist) + 100));
                    const ty = Math.max(0, Math.min(200, Math.round(Math.sin(visualAngle) * visualDist) + 100));
                    leftStickKnobRef.current.style.setProperty('--tx', PIXEL_STRINGS[tx]);
                    leftStickKnobRef.current.style.setProperty('--ty', PIXEL_STRINGS[ty]);
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

                inputState.actions[InputAction.FIRE] = dist > 5 ? 1 : 0;

                const visualDist = Math.min(dist, MAX_DIST);
                const visualAngle = Math.atan2(dy, dx);
                if (rightStickKnobRef.current) {
                    const tx = Math.max(0, Math.min(200, Math.round(Math.cos(visualAngle) * visualDist) + 100));
                    const ty = Math.max(0, Math.min(200, Math.round(Math.sin(visualAngle) * visualDist) + 100));
                    rightStickKnobRef.current.style.setProperty('--tx', PIXEL_STRINGS[tx]);
                    rightStickKnobRef.current.style.setProperty('--ty', PIXEL_STRINGS[ty]);
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
                    inputState.actions[InputAction.FIRE] = 0;
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
                ref={leftStickKnobRef}
                className="absolute rounded-full bg-white/40 shadow-[0_0_15px_rgba(255,255,255,0.3)]"
                style={{
                    left: STICK_RADIUS - 25,
                    top: STICK_RADIUS - 25,
                    width: 50,
                    height: 50,
                    // Zero-GC: Static string, values updated via CSS vars
                    transform: 'translate3d(var(--tx, 0px), var(--ty, 0px), 0)'
                }}
            />

            {/* RIGHT JOYSTICK VISUAL */}
            <div
                ref={rightStickContainerRef}
                className="absolute rounded-full border-2 border-red-500/20 bg-red-900/5 pointer-events-none animate-in fade-in zoom-in duration-200"
                style={{ width: STICK_RADIUS * 2, height: STICK_RADIUS * 2, display: 'none' }}
            >
                <div
                    ref={rightStickKnobRef}
                    className="absolute rounded-full bg-red-500/40 shadow-[0_0_15px_rgba(220,38,38,0.3)]"
                    style={{
                        left: STICK_RADIUS - 25,
                        top: STICK_RADIUS - 25,
                        width: 50,
                        height: 50,
                        // LÄGG TILL: Statisk sträng för Zero-GC
                        transform: 'translate3d(var(--tx, 0px), var(--ty, 0px), 0)'
                    }}
                />
            </div>

            {/* Action Buttons */}
            <div className={`absolute pointer-events-auto flex z-40 pr-safe pb-safe ${isLandscapeMode ? 'bottom-2 right-4 flex-col gap-2' : 'bottom-24 right-4 flex-col gap-2'}`}>
                <div className="flex justify-end">
                    <button data-action={InputAction.FLASHLIGHT} className="w-12 h-12 md:w-16 md:h-16 rounded-full border border-white/20 bg-black/40 backdrop-blur-sm flex items-center justify-center p-2 opacity-60 active:opacity-100 transition-opacity" onTouchStart={handleActionTouchStart} onTouchEnd={handleActionTouchEnd}>
                        <img src="/assets/icons/ui/icon_flashlight.png" alt="F" className="w-full h-full object-contain pointer-events-none" />
                    </button>
                </div>
                <div className="flex items-end gap-2">
                    <button data-action={InputAction.RELOAD} className="w-16 h-16 md:w-20 md:h-20 rounded-full border border-white/20 bg-black/40 backdrop-blur-sm flex items-center justify-center p-3 opacity-60 active:opacity-100 transition-opacity" onTouchStart={handleActionTouchStart} onTouchEnd={handleActionTouchEnd}>
                        <img src="/assets/icons/ui/icon_reload.png" alt="R" className="w-full h-full object-contain pointer-events-none" />
                    </button>
                    <button data-action={InputAction.DODGE} className="w-20 h-20 md:w-24 md:h-24 rounded-full border border-white/20 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 shadow-[0_0_20px_rgba(255,0,0,0.4)] opacity-80 active:opacity-100 transition-opacity" onTouchStart={handleActionTouchStart} onTouchEnd={handleActionTouchEnd}>
                        <img src="/assets/icons/ui/icon_dodge.png" alt="Dodge" className="w-full h-full object-contain pointer-events-none" />
                    </button>
                </div>
            </div>
        </div>
    );
});

export default TouchController;
