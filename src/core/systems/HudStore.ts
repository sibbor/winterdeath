export type HudData = any;
type Listener = (data: HudData) => void;

class HudStoreClass {
    private currentData: HudData = {};
    private listeners: Set<Listener> = new Set();

    public update(data: HudData) {
        this.currentData = data;
        this.listeners.forEach(l => l(data));
    }

    public subscribe(listener: Listener) {
        this.listeners.add(listener);
        listener(this.currentData);
        return () => {
            this.listeners.delete(listener);
        };
    }

    // Useful for the map etc. if you want to fetch data synchronously without subscribing
    public getData() {
        return this.currentData;
    }
}

export const HudStore = new HudStoreClass();