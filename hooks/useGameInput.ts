
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export interface InputState {
    w: boolean;
    a: boolean;
    s: boolean;
    d: boolean;
    space: boolean;
    fire: boolean;
    r: boolean;
    e: boolean;
    scrollUp: boolean;
    scrollDown: boolean;
    mouse: THREE.Vector2; // Normalized device coordinates (-1 to 1)
    aimVector: THREE.Vector2; // Direction from center of screen
    cursorPos: { x: number, y: number }; // Screen pixels for UI cursor
}

export const useGameInput = (
    isEnabled: boolean, 
    handlers?: { 
        onKeyDown?: (key: string) => void;
        onKeyUp?: (key: string) => void; 
        onUnlock?: () => void;
    }
) => {
    const input = useRef<InputState>({
        w: false, a: false, s: false, d: false,
        space: false, fire: false, r: false, e: false,
        scrollUp: false, scrollDown: false,
        mouse: new THREE.Vector2(),
        aimVector: new THREE.Vector2(1, 0), // Default forward
        cursorPos: { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    });

    const handlersRef = useRef(handlers);
    useEffect(() => { handlersRef.current = handlers; }, [handlers]);

    // Reset input state when disabled to prevent stuck keys
    useEffect(() => {
        if (!isEnabled) {
            input.current.w = false;
            input.current.a = false;
            input.current.s = false;
            input.current.d = false;
            input.current.space = false;
            input.current.fire = false;
            input.current.r = false;
            input.current.e = false;
            input.current.scrollUp = false;
            input.current.scrollDown = false;
        }
    }, [isEnabled]);

    useEffect(() => {
        const onKD = (e: KeyboardEvent) => {
            if (!isEnabled) return;
            // Check if e.key exists before calling toLowerCase
            const k = e.key ? e.key.toLowerCase() : '';
            
            if (k === 'w') input.current.w = true;
            if (k === 'a') input.current.a = true;
            if (k === 's') input.current.s = true;
            if (k === 'd') input.current.d = true;
            if (k === ' ') input.current.space = true;
            if (k === 'r') input.current.r = true;
            if (k === 'e') input.current.e = true;
            
            if (handlersRef.current?.onKeyDown && e.key) handlersRef.current.onKeyDown(e.key);
        };

        const onKU = (e: KeyboardEvent) => {
            if (!isEnabled) return;
            const k = e.key ? e.key.toLowerCase() : '';
            
            if (k === 'w') input.current.w = false;
            if (k === 'a') input.current.a = false;
            if (k === 's') input.current.s = false;
            if (k === 'd') input.current.d = false;
            if (k === ' ') input.current.space = false;
            if (k === 'r') input.current.r = false;
            if (k === 'e') input.current.e = false;

            if (handlersRef.current?.onKeyUp && e.key) handlersRef.current.onKeyUp(e.key);
        };

        const onWheel = (e: WheelEvent) => {
            if (!isEnabled) return;
            if (e.deltaY < 0) {
                input.current.scrollUp = true;
                setTimeout(() => input.current.scrollUp = false, 100);
            }
            if (e.deltaY > 0) {
                input.current.scrollDown = true;
                setTimeout(() => input.current.scrollDown = false, 100);
            }
        };

        const onMM = (e: MouseEvent) => {
            // Track mouse position even if disabled for UI cursor, but don't update aim/game inputs
            input.current.cursorPos.x = e.clientX;
            input.current.cursorPos.y = e.clientY;

            if (!isEnabled) return;
            
            // Normalized for Three.js Raycasting
            input.current.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
            input.current.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

            // Aim Vector relative to center of screen (Player Position approximation)
            const centerX = window.innerWidth / 2;
            const centerY = window.innerHeight / 2;
            
            // Vector from center to mouse
            input.current.aimVector.x = e.clientX - centerX;
            input.current.aimVector.y = e.clientY - centerY;
        };

        const onMD = (e: MouseEvent) => {
            if (!isEnabled) return;
            if (e.button === 0) {
                input.current.fire = true;
            }
        };

        const onMU = (e: MouseEvent) => {
            if (!isEnabled) return;
            if (e.button === 0) input.current.fire = false;
        };
        
        window.addEventListener('keydown', onKD);
        window.addEventListener('keyup', onKU);
        window.addEventListener('mousemove', onMM);
        window.addEventListener('mousedown', onMD);
        window.addEventListener('mouseup', onMU);
        window.addEventListener('wheel', onWheel);

        return () => {
            window.removeEventListener('keydown', onKD);
            window.removeEventListener('keyup', onKU);
            window.removeEventListener('mousemove', onMM);
            window.removeEventListener('mousedown', onMD);
            window.removeEventListener('mouseup', onMU);
            window.removeEventListener('wheel', onWheel);
        };
    }, [isEnabled]);

    return input;
};
