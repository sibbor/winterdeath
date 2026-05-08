/**
 * Status Store
 * 
 * Holds the high-frequency status bitmask for the HUD.
 * Uses a simplified version of the HudStore pattern to maintain Zero-GC performance.
 */
class StatusStoreClass {
    private mask: number = 0;
    private listeners: (() => void)[] = [];

    public setStatusMask(mask: number): void {
        if (this.mask !== mask) {
            this.mask = mask;
            this.notifyListeners();
        }
    }

    public getStatusMask(): number {
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

export function useStatusStore<T>(selector: (mask: number) => T): T {
    const getSnapshot = useCallback(() => selector(StatusStore.getStatusMask()), [selector]);
    const subscribe = useCallback((onStoreChange: () => void) => StatusStore.subscribe(onStoreChange), []);

    return useSyncExternalStore(subscribe, getSnapshot);
}
