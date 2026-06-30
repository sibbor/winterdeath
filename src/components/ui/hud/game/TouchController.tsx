import React, { useRef, useCallback, useEffect } from 'react';
import { InputAction, InputState } from '../../../../core/engine/InputManager';
import { useOrientation } from '../../../../hooks/useOrientation';
import { HudStore } from '../../../../store/HudStore';

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

    // --- REFS FOR DIRECT DOM MANIPULATION (Zero-GC) ---
    const rootRef = useRef<HTMLDivElement>(null);
    const leftZoneRef = useRef<HTMLDivElement>(null);
    const rightZoneRef = useRef<HTMLDivElement>(null);
    const pauseZoneRef = useRef<HTMLDivElement>(null);
    const actionZoneRef = useRef<HTMLDivElement>(null);
    const leftStickContainerRef = useRef<HTMLDivElement>(null);
    const leftStickKnobRef = useRef<HTMLDivElement>(null);
    const rightStickContainerRef = useRef<HTMLDivElement>(null);
    const rightStickKnobRef = useRef<HTMLDivElement>(null);

    // Touch tracking (uses refs to avoid re-renders)
    const leftTouchId = useRef<number | null>(null);
    const rightTouchId = useRef<number | null>(null);

    // Pre-allocated objects for touch tracking (Zero-GC lazy initialized)
    const leftCenter = useRef<{ x: number; y: number }>();
    if (!leftCenter.current) leftCenter.current = { x: 0, y: 0 };
    const rightCenter = useRef<{ x: number; y: number }>();
    if (!rightCenter.current) rightCenter.current = { x: 0, y: 0 };

    const isInteractiveElement = (target: EventTarget, currentTarget: EventTarget) => {
        let el = target as HTMLElement | null;
        while (el && el !== currentTarget) {
            if (el.tagName === 'BUTTON' || el.tagName === 'A' || el.classList.contains('pointer-events-auto')) {
                return true;
            }
            el = el.parentElement;
        }
        return false;
    };

    // HudStore.subscribe — drives hudVisible via direct DOM, zero React re-renders
    useEffect(() => {
        let prevVisible: boolean | null = null;

        return HudStore.subscribe((state) => {
            const visible = state.hudVisible;
            if (visible === prevVisible) return;
            prevVisible = visible;

            // Opacity on root
            if (rootRef.current) rootRef.current.style.opacity = visible ? '1' : '0';

            // pointer-events on interactive zones
            const pe = visible ? 'auto' : 'none';
            if (leftZoneRef.current) leftZoneRef.current.style.pointerEvents = pe;
            if (rightZoneRef.current) rightZoneRef.current.style.pointerEvents = pe;
            if (pauseZoneRef.current) pauseZoneRef.current.style.pointerEvents = pe;
            if (actionZoneRef.current) actionZoneRef.current.style.pointerEvents = pe;

            // Reset inputs when HUD hides
            if (!visible) {
                leftTouchId.current = null;
                rightTouchId.current = null;
                if (inputState?.joystickMove) inputState.joystickMove.set(0, 0);
                if (inputState?.joystickAim) inputState.joystickAim.set(0, 0);
                if (leftStickContainerRef.current) leftStickContainerRef.current.style.display = 'none';
                if (rightStickContainerRef.current) rightStickContainerRef.current.style.display = 'none';
                const inputManager = (window as any).inputManager;
                if (inputManager) {
                    inputManager.handleVirtualAction(InputAction.FIRE, false);
                } else if (inputState?.actions) {
                    inputState.actions[InputAction.FIRE] = 0;
                }
            }
        });
    }, [inputState]);

    /**
     * SMI-Hardened action handler.
     * Updates the shared input buffer via the InputManager singleton context.
     */
    const handleAction = useCallback((action: InputAction, pressed: boolean) => {
        // Enforce structural synchronization directly into the global execution thread
        const inputManager = (window as any).inputManager;

        if (inputManager) {
            inputManager.handleVirtualAction(action, pressed);
        } else {
            // High-performance fallback primitive array mutation if singleton hasn't locked yet
            if (action < InputAction.COUNT) {
                inputState.actions[action] = pressed ? 1 : 0;
            }
        }
    }, [inputState]);

    const handleActionTouchStart = useCallback((e: React.TouchEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        if (e.cancelable) e.preventDefault();
        const action = Number(e.currentTarget.dataset.action);
        if (!isNaN(action)) handleAction(action as InputAction, true);
    }, [handleAction]);

    const handleActionTouchEnd = useCallback((e: React.TouchEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        if (e.cancelable) e.preventDefault();
        const action = Number(e.currentTarget.dataset.action);
        if (!isNaN(action)) handleAction(action as InputAction, false);
    }, [handleAction]);

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        if (e.cancelable) e.preventDefault();

        const touches = e.changedTouches;
        const w = window.innerWidth;
        const h = window.innerHeight;

        const leftBound = isLandscapeMode ? 0.4 : 0.45;
        const rightBound = isLandscapeMode ? 0.6 : 0.55;

        for (let i = 0; i < touches.length; i++) {
            const t = touches[i];
            if (isInteractiveElement(t.target, e.currentTarget)) continue;

            const x = t.clientX;
            const y = t.clientY;

            // --- LEFT ZONE (Movement) ---
            if (x < w * leftBound && y > h * 0.3 && leftTouchId.current === null) {
                leftTouchId.current = t.identifier;
                leftCenter.current.x = x;
                leftCenter.current.y = y;

                if (leftStickContainerRef.current) {
                    leftStickContainerRef.current.style.display = 'block';
                    leftStickContainerRef.current.style.transform = `translate3d(${x - STICK_RADIUS}px, ${y - STICK_RADIUS}px, 0)`;
                }
            }
            // --- RIGHT ZONE (Aiming) ---
            else if (x > w * rightBound && y > h * 0.3 && rightTouchId.current === null) {
                rightTouchId.current = t.identifier;
                rightCenter.current.x = x;
                rightCenter.current.y = y;

                if (rightStickContainerRef.current) {
                    rightStickContainerRef.current.style.display = 'block';
                    rightStickContainerRef.current.style.transform = `translate3d(${x - STICK_RADIUS}px, ${y - STICK_RADIUS}px, 0)`;
                }
            }
        }
    }, [isLandscapeMode]);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        if (e.cancelable) e.preventDefault();
        const touches = e.touches; // Use all active touches for more stable tracking

        for (let i = 0; i < touches.length; i++) {
            const t = touches[i];

            // 1. UPDATE LEFT STICK (Movement)
            if (t.identifier === leftTouchId.current && inputState?.joystickMove) {
                const dx = t.clientX - leftCenter.current.x;
                const dy = t.clientY - leftCenter.current.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist > 2) {
                    const normMag = dist >= 42 ? 1.0 : (dist / 42);
                    const invDist = 1.0 / dist;
                    const nx = dx * invDist;
                    const ny = dy * invDist;
                    inputState.joystickMove.set(nx * normMag, ny * normMag);

                    if (leftStickKnobRef.current) {
                        const visualDist = Math.min(dist, MAX_DIST);
                        const vx = nx * visualDist;
                        const vy = ny * visualDist;
                        leftStickKnobRef.current.style.transform = `translate3d(${vx}px, ${vy}px, 0)`;
                    }
                } else {
                    inputState.joystickMove.set(0, 0);
                }
            }

            // 2. UPDATE RIGHT STICK (Aiming / Firing)
            if (t.identifier === rightTouchId.current && inputState?.joystickAim) {
                const dx = t.clientX - rightCenter.current.x;
                const dy = t.clientY - rightCenter.current.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist > 2) {
                    const normMag = dist >= 42 ? 1.0 : (dist / 42);
                    const invDist = 1.0 / dist;
                    const nx = dx * invDist;
                    const ny = dy * invDist;
                    inputState.joystickAim.set(nx * normMag, ny * normMag);

                    // Fire trigger logic synced instantly into engine state pipeline context
                    const inputManager = (window as any).inputManager;
                    if (inputManager) {
                        inputManager.handleVirtualAction(InputAction.FIRE, dist > 8);
                    } else {
                        inputState.actions[InputAction.FIRE] = dist > 8 ? 1 : 0;
                    }

                    if (rightStickKnobRef.current) {
                        const visualDist = Math.min(dist, MAX_DIST);
                        const vx = nx * visualDist;
                        const vy = ny * visualDist;
                        rightStickKnobRef.current.style.transform = `translate3d(${vx}px, ${vy}px, 0)`;
                    }
                } else {
                    inputState.joystickAim.set(0, 0);
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
                    const inputManager = (window as any).inputManager;
                    if (inputManager) {
                        inputManager.handleVirtualAction(InputAction.FIRE, false);
                    } else {
                        inputState.actions[InputAction.FIRE] = 0;
                    }
                }
                if (rightStickContainerRef.current) rightStickContainerRef.current.style.display = 'none';
            }
        }
    }, [inputState]);

    return (
        <div
            ref={rootRef}
            className="absolute inset-0 pointer-events-none z-[120] overflow-hidden select-none touch-none transition-opacity duration-1000"
            style={{ opacity: 0 }}
        >
            {/* LEFT TOUCH ZONE (Movement) */}
            <div
                ref={leftZoneRef}
                className={`absolute left-0 ${isLandscapeMode ? 'w-[40%] h-[65%]' : 'w-[45%] h-[75%]'}`}
                style={{ top: HUD_GUTTER, touchAction: 'none', pointerEvents: 'none' }}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchEnd}
            />

            {/* RIGHT TOUCH ZONE (Aiming) */}
            <div
                ref={rightZoneRef}
                className={`absolute right-0 ${isLandscapeMode ? 'w-[40%] h-[65%]' : 'w-[45%] h-[75%]'}`}
                style={{ top: HUD_GUTTER, touchAction: 'none', pointerEvents: 'none' }}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchEnd}
            />

            {/* LEFT JOYSTICK VISUAL */}
            <div
                ref={leftStickContainerRef}
                className="absolute rounded-full border-2 border-white/20 bg-white/5 pointer-events-none animate-in fade-in zoom-in duration-200"
                style={{ width: STICK_RADIUS * 2, height: STICK_RADIUS * 2, display: 'none', left: 0, top: 0 }}
            >
                <div
                    ref={leftStickKnobRef}
                    className="absolute rounded-full bg-white/40 shadow-[0_0_15px_rgba(255,255,255,0.3)]"
                    style={{
                        left: STICK_RADIUS - 25,
                        top: STICK_RADIUS - 25,
                        width: 50,
                        height: 50
                    }}
                />
            </div>

            {/* RIGHT JOYSTICK VISUAL */}
            <div
                ref={rightStickContainerRef}
                className="absolute rounded-full border-2 border-red-500/20 bg-red-900/5 pointer-events-none animate-in fade-in zoom-in duration-200"
                style={{ width: STICK_RADIUS * 2, height: STICK_RADIUS * 2, display: 'none', left: 0, top: 0 }}
            >
                <div
                    ref={rightStickKnobRef}
                    className="absolute rounded-full bg-red-500/40 shadow-[0_0_15px_rgba(220,38,38,0.3)]"
                    style={{
                        left: STICK_RADIUS - 25,
                        top: STICK_RADIUS - 25,
                        width: 50,
                        height: 50
                    }}
                />
            </div>

            {/* PAUSE BUTTON — top-center, always accessible */}
            <div ref={pauseZoneRef} className="absolute top-3 left-1/2 -translate-x-1/2 z-40 pt-safe" style={{ pointerEvents: 'none' }}>
                <button
                    className="w-12 h-12 rounded-full border border-white/20 bg-black/60 text-white font-bold backdrop-blur-sm flex items-center justify-center active:scale-95 transition-transform"
                    onTouchStart={(e) => { e.stopPropagation(); onPause?.(); }}
                >
                    ||
                </button>
            </div>

            {/* Action Buttons */}
            <div ref={actionZoneRef} className={`absolute flex z-40 pr-safe pb-safe ${isLandscapeMode ? 'bottom-4 right-4 flex-col gap-3' : 'bottom-24 right-4 flex-col gap-3'}`} style={{ pointerEvents: 'none' }}>
                <div className="flex justify-end">
                    <button data-action={InputAction.FLASHLIGHT} className="w-14 h-14 md:w-16 md:h-16 rounded-full border border-white/20 bg-black/40 backdrop-blur-sm flex items-center justify-center p-2.5 opacity-60 active:opacity-100 transition-opacity" onTouchStart={handleActionTouchStart} onTouchEnd={handleActionTouchEnd} onTouchCancel={handleActionTouchEnd}>
                        <img src="/assets/icons/ui/icon_flashlight.png" alt="F" className="w-full h-full object-contain pointer-events-none" />
                    </button>
                </div>
                <div className="flex items-end gap-3">
                    <button data-action={InputAction.RELOAD} className="w-16 h-16 md:w-20 md:h-20 rounded-full border border-white/20 bg-black/40 backdrop-blur-sm flex items-center justify-center p-3.5 opacity-60 active:opacity-100 transition-opacity" onTouchStart={handleActionTouchStart} onTouchEnd={handleActionTouchEnd} onTouchCancel={handleActionTouchEnd}>
                        <img src="/assets/icons/ui/icon_reload.png" alt="R" className="w-full h-full object-contain pointer-events-none" />
                    </button>
                    <button data-action={InputAction.DODGE} className="w-20 h-20 md:w-24 md:h-24 rounded-full border border-white/20 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4.5 shadow-[0_0_20px_rgba(255,0,0,0.4)] opacity-80 active:opacity-100 transition-opacity" onTouchStart={handleActionTouchStart} onTouchEnd={handleActionTouchEnd} onTouchCancel={handleActionTouchEnd}>
                        <img src="/assets/icons/ui/icon_dodge.png" alt="Dodge" className="w-full h-full object-contain pointer-events-none" />
                    </button>
                </div>
            </div>
        </div>
    );
});

export default TouchController;