/**
 * RuntimeStressHarness
 * 
 * Aggressive, Zero-GC diagnostic tool designed to detect pool exhaustion, 
 * high-velocity tunneling, and memory drift during simulation stress tests.
 * 
 * COMPILATION: This service should be gated by a __DEV__ or NODE_ENV !== 'production' 
 * flag to ensure it is completely pruned from production builds.
 */
export class RuntimeStressHarness {
    public static get enabled(): boolean {
        if (typeof window === 'undefined') return false;

        // 1. Check current HudStore state (primary source of truth in session)
        const hudState = (window as any).HudStore?.getState();
        if (hudState && hudState.debugMode !== undefined) {
            return !!hudState.debugMode;
        }

        // 2. Check gameEngine SectorBuildContext override
        const gameEngine = (window as any).gameEngine;
        if (gameEngine?.SectorBuildContext && gameEngine.SectorBuildContext.debugMode !== undefined) {
            return !!gameEngine.SectorBuildContext.debugMode;
        }

        // 3. Check developer console/global override
        if ((window as any).WD_DEBUG === true) {
            return true;
        }

        return false;
    }

    // --- STATIC TELEMETRY BUFFERS (Zero-GC) ---
    private static lastHeapSize: number = 0;
    private static lastCheckTime: number = 0;
    private static totalHeapDrift: number = 0;
    private static maxFrameTime: number = 0;

    // --- POOL THRESHOLDS ---
    private static readonly CAPACITY_WARNING_THRESHOLD = 0.85;

    /**
     * Active Pool Monitoring
     * 
     * For circular pools (isCircular=true), 'count' represents cumulative sequential queries.
     * For standard pools, 'count' represents active allocations.
     */
    public static checkPoolCapacity(name: string, count: number, capacity: number, isCircular: boolean = false): void {
        if (!this.enabled) return;

        if (isCircular) {
            // Circular Ring Buffer logic: 'count' is cumulative sequential usage per tick.
            // We ignore structural capacity (re-entrancy depth) and monitor for infinite loops/spikes.
            if (count > 10000) {
                console.warn("[POOL BUDGET EXCEEDED]", name, "cumulative queries:", count, "/ 10000 budget");
            }
            return;
        }

        if (count > capacity * this.CAPACITY_WARNING_THRESHOLD) {
            // Using raw console methods to avoid string interpolation allocations
            console.warn("[POOL WARNING]", name, "is near capacity:", count, "/", capacity);
        }
    }

    /**
     * High-Velocity Tunneling Assertion
     * Detects if an entity moved more than one logic bucket (10m) in a single tick.
     */
    public static assertPhasing(id: string, currentX: number, currentZ: number, prevX: number, prevZ: number): void {
        if (!this.enabled) return;

        const dx = currentX - prevX;
        const dz = currentZ - prevZ;

        // Skip phasing check if we encounter the initialization sentinel
        if (prevX === Infinity || prevZ === Infinity) return;

        const distSq = dx * dx + dz * dz;

        if (distSq > 100) { // 10m^2 = 100
            console.warn("[PHASING WARNING]", id, "skipped bucket registration! Dist:", Math.sqrt(distSq).toFixed(2), "m");
        }
    }

    /**
     * Execution Budget Monitor
     */
    public static monitorFrame(startTime: number): void {
        if (!this.enabled) return;

        // Vinterdöd optimization: Skip warning during preloader ghost-render/warmup
        const gameEngine = (window as any).gameEngine;
        if (gameEngine?.environment?.isWarmup === true || gameEngine?.sceneContext?.isWarmup === true) {
            return;
        }

        const duration = performance.now() - startTime;
        if (duration > 1.0) {
            console.warn("[PERF WARNING] Spatial hot-path exceeded budget:", duration.toFixed(2), "ms");
        }
    }

    /**
     * V8 Memory Drift Telemetry (Zero-GC)
     * Tracks heap usage over 10 seconds to detect persistent leaks.
     */
    public static tickMemory(): void {
        if (!this.enabled) return;

        const now = performance.now();

        // performance.memory is non-standard but available in Chromium/V8
        const memory = (performance as any).memory;
        if (!memory) return;

        if (this.lastCheckTime === 0) {
            this.lastHeapSize = memory.usedJSHeapSize;
            this.lastCheckTime = now;
            return;
        }

        if (now - this.lastCheckTime >= 10000) { // Every 10 seconds
            const currentHeap = memory.usedJSHeapSize;
            const drift = currentHeap - this.lastHeapSize;
            this.totalHeapDrift += drift;

            if (drift > 1024 * 512) { // > 0.5MB drift in 10 seconds
                console.warn("[MEMORY DRIFT] Heap growth detected:", (drift / 1024 / 1024).toFixed(2), "MB over 10 seconds.");
            }

            this.lastHeapSize = currentHeap;
            this.lastCheckTime = now;
        }
    }
}
