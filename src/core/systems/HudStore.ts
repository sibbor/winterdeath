export type HudData = any;
type Listener = (data: HudData) => void;

class HudStoreClass {
    private currentData: HudData = {};
    // Zero-GC: We use an Array instead of Set for lightning fast, allocation free looping
    private listeners: Listener[] = [];

    public update(data: HudData) {
        // Since HudSystem.getHudData() creates a complete object, 
        // we just replace the reference. No expensive {...spread} needed!
        this.currentData = data;

        // Zero-GC loop
        for (let i = 0; i < this.listeners.length; i++) {
            this.listeners[i](this.currentData);
        }
    }

    public subscribe(listener: Listener) {
        if (!this.listeners.includes(listener)) {
            this.listeners.push(listener);
        }

        // Send initial data directly
        listener(this.currentData);

        // Return unsubscribe function
        return () => {
            const index = this.listeners.indexOf(listener);
            if (index !== -1) {
                this.listeners.splice(index, 1);
            }
        };
    }

    // Used by e.g. the map to get data synchronously
    public getData() {
        return this.currentData;
    }
}

export const HudStore = new HudStoreClass();