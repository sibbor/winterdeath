import { useSyncExternalStore, useRef, useCallback, useEffect } from 'react';
import { HudStore } from '../store/HudStore';
import { HudState } from '../types/hud';

/**
 * Optimized hook for accessing HudStore state with selector support.
 * Uses a ref-based selector pattern to completely eliminate GC overhead 
 * and prevent re-subscriptions when using inline anonymous functions.
 * * @param selector A function that extracts the desired data from HudState.
 */
export function useHudStore<T>(selector: (state: HudState) => T): T {
    // 1. Keep a mutable reference to the LATEST selector function.
    // This prevents the "inline function trap" (e.g., useHudStore(s => s.hp))
    // from causing infinite re-renders or GC thrashing.
    const selectorRef = useRef(selector);

    // 2. Cache the computed result and the state it was based on
    const currentResultRef = useRef<T | null>(null);
    const lastStateRef = useRef<HudState | null>(null);

    // Sync the latest selector safely outside the render phase
    useEffect(() => {
        selectorRef.current = selector;
    });

    // 3. Stable snapshot getter with ZERO dependencies
    const getSnapshot = useCallback(() => {
        const state = HudStore.getState();

        // Ensure we have a result even on the first call (initialization)
        if (state !== lastStateRef.current || currentResultRef.current === null) {
            currentResultRef.current = selectorRef.current(state);
            lastStateRef.current = state;
        }

        return currentResultRef.current as T;
    }, []);

    // 4. Stable subscription reference
    const subscribe = useCallback((onStoreChange: () => void) => {
        return HudStore.subscribe(onStoreChange);
    }, []);

    // 5. Connect to React's highly optimized external store hook
    return useSyncExternalStore(subscribe, getSnapshot);
}