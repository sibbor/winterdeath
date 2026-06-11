import { useSyncExternalStore, useCallback, useRef, useEffect } from 'react';

/**
 * Status Store
 * 
 * Holds the high-frequency status bitmask for the HUD.
 * Uses a simplified version of the HudStore pattern to maintain Zero-GC performance.
 */
class StatusStoreClass {
    private mask: number = 0;
    private listeners: (() => void)[] = [];

    public setStatusFlags(flags: number): void {
        if (this.mask !== flags) {
            this.mask = flags;
            this.notifyListeners();
        }
    }

    public getStatusFlags(): number {
        return this.mask;
    }

    public subscribe(listener: () => void): () => void {
        this.listeners.push(listener);
        return () => {
            const index = this.listeners.indexOf(listener);
            if (index !== -1) {
                this.listeners.splice(index, 1);
            }
        };
    }

    private notifyListeners(): void {
        for (let i = 0; i < this.listeners.length; i++) {
            this.listeners[i]();
        }
    }
}

export const StatusStore = new StatusStoreClass();

export function useStatusStore<T>(selector: (flags: number) => T): T {
    const selectorRef = useRef(selector);

    useEffect(() => {
        selectorRef.current = selector;
    });

    const getSnapshot = useCallback(() => {
        return selectorRef.current(StatusStore.getStatusFlags());
    }, []);

    const subscribe = useCallback((onStoreChange: () => void) => {
        return StatusStore.subscribe(onStoreChange);
    }, []);

    return useSyncExternalStore(subscribe, getSnapshot);
}
