/**
 * Centralized, high-performance tracking system strictly adhering to Zero-GC principles.
 * Ensures consistent profiling output across both game logic and UI components.
 */
export class PerformanceMonitor {
    private static instance: PerformanceMonitor | null = null;

    public static getInstance() {
        if (!this.instance) this.instance = new PerformanceMonitor();
        return this.instance;
    }

    // Flat timing structure avoids nested object allocation per frame
    private timings: Record<string, number> = {};
    private startTimes: Record<string, number> = {};
    private _lastFrameTotal: number = 0;

    // FPS Tracking
    private _fps: number = 0;
    private _frameCount: number = 0;
    private _lastFpsUpdate: number = 0;


    // GC Tracking
    private lastHeapSize: number = 0;
    private gcDetected: boolean = false;
    private gcDroppedMB: number = 0;

    /**
     * Clears tracking data for a new frame.
     */
    public startFrame() {
        this._lastFrameTotal = 0;
        // Optimization: Rather than object allocation, simply clear properties
        for (const key in this.timings) {
            this.timings[key] = 0;
            this.startTimes[key] = 0;
        }

        const now = performance.now();
        this._frameCount++;
        if (now - this._lastFpsUpdate > 1000) {
            this._fps = this._frameCount;
            this._frameCount = 0;
            this._lastFpsUpdate = now;
        }

        // --- EXPERIMENTAL GC TRACKING ---

        // (performance.memory is a Chrome/Edge non-standard API)
        const mem = (performance as any).memory;
        if (mem) {
            const currentHeap = mem.usedJSHeapSize;
            if (this.lastHeapSize > 0) {
                // If the heap shrunk by at least 1MB, a GC event likely occurred
                const diff = this.lastHeapSize - currentHeap;
                if (diff > 1048576) {
                    this.gcDetected = true;
                    this.gcDroppedMB = diff / 1048576;
                } else {
                    this.gcDetected = false;
                    this.gcDroppedMB = 0;
                }
            }
            this.lastHeapSize = currentHeap;
        }
    }

    /**
     * Mark the start of a block to track.
     */
    public begin(id: string) {
        this.startTimes[id] = performance.now();
    }

    /**
     * Mark the end of a block and accumulate the time passed.
     */
    public end(id: string) {
        const start = this.startTimes[id];
        if (start === undefined || start === 0) return;
        const passed = performance.now() - start;
        this.timings[id] = (this.timings[id] || 0) + passed;
    }

    /**
     * Run a synchronous function and track its duration under the provided ID.
     */
    public track(id: string, fn: () => void) {
        this.begin(id);
        fn();
        this.end(id);
    }

    /**
     * Add time directly (useful if passing metrics up from sub-systems that pre-tracked them).
     */
    public addTime(id: string, ms: number) {
        this.timings[id] = (this.timings[id] || 0) + ms;
    }

    public getFps(): number {
        return this._fps;
    }

    public getTimings(): Record<string, number> {

        return this.timings;
    }

    /**
     * Prints a standardized Heavy Frame output to the console if total time exceeds threshold.
     * Extracts debug stats out of the WebGL parameter if provided.
     */
    public printIfHeavy(context: 'Game Engine Performance' | 'Camp Performance', totalTime: number, threshold: number = 50, extraStats?: Record<string, any>) {
        this._lastFrameTotal = totalTime;
        if (totalTime > threshold) {
            const formatted: Record<string, string> = {};

            // Format standard properties
            for (const key in this.timings) {
                if (this.timings[key] > 0) {
                    formatted[key] = this.timings[key].toFixed(2) + 'ms';
                }
            }
            formatted.total = totalTime.toFixed(2) + 'ms';

            // Add extra stats (draw calls, triangles, logic iterations)
            if (extraStats) {
                for (const key in extraStats) {
                    formatted[key] = extraStats[key];
                }
            }

            if (this.gcDetected) {
                formatted['⚠️ GC Event Possible'] = `Heap dropped by ${this.gcDroppedMB.toFixed(2)} MB between frames`;
            }

            console.warn(`[${context}] Frame took ${totalTime.toFixed(2)}ms:`, formatted);
        }
    }
}
