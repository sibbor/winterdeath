import { useEffect } from 'react';
import { UIEventRingBuffer, UIEventType } from '../systems/ui/UIEventRingBuffer';

// --- PERFORMANCE: Static scratchpad to avoid allocations in the rAF loop ---
const _packetScratch = new Int32Array(4);

export type UIEventCallback = (type: UIEventType, p1: any, p2: number, timestamp: number) => void;

// Global listener registry for the bridge
const listeners: Set<UIEventCallback> = new Set();
let isPolling = false;
let rafId: number | null = null;

/**
 * Global Polling Pump
 * 
 * Ensures exactly one rAF loop drains the Ring Buffer and broadcasts
 * to all registered React listeners. This prevents race conditions
 * where multiple hooks compete for the same SMI packets.
 */
const pump = () => {
    if (listeners.size === 0) {
        isPolling = false;
        rafId = null;
        return;
    }

    // Drain the buffer until empty
    while (UIEventRingBuffer.poll(_packetScratch)) {
        const type = _packetScratch[0] as UIEventType;
        const p1 = _packetScratch[1];
        const p2 = _packetScratch[2];
        const time = _packetScratch[3];

        // [VINTERDÖD] Special handling for string-based events
        let p1Value: any = p1;
        if (type === UIEventType.CHAT_BUBBLE || type === UIEventType.DISCOVERY) {
            p1Value = UIEventRingBuffer.getString(p1);
        }

        // Notify all bridge listeners (Zero-GC Loop)
        for (const cb of listeners) {
            cb(type, p1Value, p2, time);
        }
    }

    rafId = requestAnimationFrame(pump);
};

/**
 * useUIEventBridge - Asynchronous Polling Hook
 * 
 * Decouples the simulation frequency (120Hz+) from the React render cadence.
 * Registers a callback to receive high-performance SMI packets from the engine.
 */
export const useUIEventBridge = (onEvent?: UIEventCallback) => {
    useEffect(() => {
        if (!onEvent) return;

        listeners.add(onEvent);

        // Start the global pump if this is the first listener
        if (!isPolling) {
            isPolling = true;
            rafId = requestAnimationFrame(pump);
        }

        return () => {
            listeners.delete(onEvent);
            // Pump stops automatically when listeners.size === 0
        };
    }, [onEvent]);
};
