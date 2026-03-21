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

    // 3. Stable snapshot getter with ZERO dependencies.
    // NOTE: We intentionally do NOT cache on state reference equality.
    // The direct interaction-clear paths in GameSessionLoop mutate the HudStore
    // state object in-place before calling HudStore.update(), so the reference
    // never changes. Skipping the re-computation would permanently return the
    // stale type ('chest', 'collectible', etc.) and the prompt would never hide.
    // React's useSyncExternalStore handles duplicate-value suppression itself via
    // Object.is(), so re-renders are only triggered when the selector's returned
    // primitive value actually changes.
    const getSnapshot = useCallback(() => {
        const state = HudStore.getState();
        currentResultRef.current = selectorRef.current(state);
        lastStateRef.current = state;
        return currentResultRef.current as T;
    }, []);

    // 4. Stable subscription reference
    const subscribe = useCallback((onStoreChange: () => void) => {
        return HudStore.subscribe(onStoreChange);
    }, []);

    // 5. Connect to React's highly optimized external store hook
    return useSyncExternalStore(subscribe, getSnapshot);
}