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

// Hook implementation for React
import { useSyncExternalStore, useCallback } from 'react';

export function useStatusStore<T>(selector: (flags: number) => T): T {
    const getSnapshot = useCallback(() => selector(StatusStore.getStatusFlags()), [selector]);
    const subscribe = useCallback((onStoreChange: () => void) => StatusStore.subscribe(onStoreChange), []);

    return useSyncExternalStore(subscribe, getSnapshot);
}
