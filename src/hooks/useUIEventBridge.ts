import { useEffect } from 'react';
import { UIEventRingBuffer, UIEventType } from '../systems/ui/UIEventRingBuffer';
import { DiscoveryType } from '../components/ui/hud/HudTypes';
import { DataResolver } from '../utils/ui/DataResolver';
import { t } from '../utils/i18n';
import { useStatusStore, StatusStore } from '../store/StatusStore';

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
    const listenerCount = listeners.size;
    if (listenerCount === 0) {
        isPolling = false;
        rafId = null;
        return;
    }

    // Drain the buffer until empty
    let processedCount = 0;
    while (UIEventRingBuffer.poll(_packetScratch)) {
        const type = _packetScratch[0] as UIEventType;
        const p1 = _packetScratch[1];
        const p2 = _packetScratch[2];
        const time = _packetScratch[3];

        // [VINTERDÖD] Special handling for string-based events
        let p1Value: any = p1;

        if (type === UIEventType.CHAT_BUBBLE) {
            p1Value = UIEventRingBuffer.getString(p1);
        }
        else if (type === UIEventType.SYNC_STATUS) {
            StatusStore.setStatusMask(p1);
        }
        else if (type === UIEventType.DISCOVERY) {
            /*
            const discoveryType = p2 as DiscoveryType;
            let resolvedId: string | number = p1;
            let title = '';
            let details = '';

            switch (discoveryType) {
                case DiscoveryType.PERK:
                    const perk = DataResolver.getPerks()[resolvedId as any];
                    if (perk) {
                        title = t(DataResolver.getDiscoveryTitle(discoveryType));
                        details = t(perk.displayName);
                    }
                    break;
                case DiscoveryType.POI:
                    title = t(DataResolver.getDiscoveryTitle(discoveryType));
                    details = t(DataResolver.getPoiName(resolvedId));
                    break;
                case DiscoveryType.CLUE:
                    title = t(DataResolver.getDiscoveryTitle(discoveryType));
                    details = t(DataResolver.getClueDescription(resolvedId));
                    break;
                case DiscoveryType.COLLECTIBLE:
                    title = t(DataResolver.getDiscoveryTitle(discoveryType));
                    details = t(DataResolver.getCollectibleName(resolvedId));
                    break;
                case DiscoveryType.ZOMBIE:
                    title = t(DataResolver.getDiscoveryTitle(discoveryType));
                    details = t(DataResolver.getZombieName(resolvedId as any));
                    break;
                case DiscoveryType.BOSS:
                    title = t(DataResolver.getDiscoveryTitle(discoveryType));
                    details = t(DataResolver.getBossName(resolvedId as any));
                    break;
            }
            p1Value = { title, details };
            */
        }


        //if (process.env.NODE_ENV === 'development') {
        const eventName = UIEventType[type] || 'UNKNOWN';
        console.debug(`[UIBridge] Drained: ${eventName} | P1: ${p1Value} | P2: ${p2} | Listeners: ${listenerCount}`);
        //}

        // Notify all bridge listeners (Zero-GC Loop)
        // [VINTERDÖD] We use for...of on the Set. While it creates an iterator, 
        // V8's escape analysis often elides this allocation. 
        // We avoid Array.from() which is a guaranteed allocation.
        for (const cb of listeners) {
            cb(type, p1Value, p2, time);
        }

        processedCount++;
        // Safety break to prevent infinite loops if something goes wrong
        if (processedCount > 100) break;
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
