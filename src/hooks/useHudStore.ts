import { useSyncExternalStore, useRef, useCallback, useEffect } from 'react';
import { HudStore } from '../store/HudStore';
import { HudState } from '../components/ui/hud/HudTypes';

/**
 * Optimized hook for accessing HudStore state with selector support.
 * Uses a ref-based selector pattern to completely eliminate GC overhead 
 * and prevent re-subscriptions when using inline anonymous functions.
 * * @param selector A function that extracts the desired data from HudState.
 */
/**
 * Optimized shallow equality check for arrays and objects. 
 * Prevents re-renders when engine double-buffering swaps between identical collections.
 */
export function shallowEqual(a: any, b: any): boolean {
    if (Object.is(a, b)) return true;
    if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false;

    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;

    for (let i = 0; i < keysA.length; i++) {
        if (!Object.prototype.hasOwnProperty.call(b, keysA[i]) || !Object.is(a[keysA[i]], b[keysA[i]])) {
            return false;
        }
    }
    return true;
}

/**
 * Optimized hook for accessing HudStore state with selector support.
 * Uses a ref-based selector pattern and shallow equality to eliminate GC 
 * and persistent re-renders from double-buffering.
 */
export function useHudStore<T>(selector: (state: HudState) => T, shallow: boolean = false): T {
    const selectorRef = useRef(selector);
    const lastResultRef = useRef<T | null>(null);
    const lastStateRef = useRef<HudState | null>(null);

    useEffect(() => {
        selectorRef.current = selector;
    });

    const getSnapshot = useCallback(() => {
        const state = HudStore.getState();
        
        // Optimization: If state hasn't changed at all, avoid re-running selector
        if (state === lastStateRef.current) return lastResultRef.current as T;

        const nextResult = selectorRef.current(state);

        // --- SHALLOW EQUALITY BYPASS ---
        // If we are using shallow compare (for arrays/objects) and the content is the same,
        // we return the OLD reference to trick useSyncExternalStore into skipping re-render.
        if (shallow && lastResultRef.current !== null && shallowEqual(nextResult, lastResultRef.current)) {
            lastStateRef.current = state;
            return lastResultRef.current;
        }

        lastResultRef.current = nextResult;
        lastStateRef.current = state;
        return nextResult;
    }, [shallow]);

    const subscribe = useCallback((onStoreChange: () => void) => {
        return HudStore.subscribe(onStoreChange);
    }, []);

    return useSyncExternalStore(subscribe, getSnapshot);
}