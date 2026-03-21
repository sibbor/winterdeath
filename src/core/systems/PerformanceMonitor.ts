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

    // Zero-GC: Fast array tracking instead of slow Dictionary/Object keys
    private _keys: string[] = ['logic', 'wind', 'weather', 'water', 'camera', 'render', 'render_setup', 'render_draw', 'cleanup'];
    private timings: Float32Array;
    private startTimes: Float32Array;

    private _lastFrameTotal: number = 0;
    private _consoleLoggingEnabled: boolean = true;
    private _aiLoggingEnabled: boolean = true;
    private _shaderLoggingEnabled: boolean = true;

    // --- GAME STATE CACHE (Raw data, updated 60fps, Zero-GC) ---
    public gameState = {
        playerCoords: { x: 0, z: 0 },
        cameraPos: { x: 0, y: 0, z: 0 },
        enemyCount: 0,
        objectCount: 0
    };

    constructor() {
        // Pre-allocate typed arrays for blazingly fast iteration without garbage
        this.timings = new Float32Array(this._keys.length);
        this.startTimes = new Float32Array(this._keys.length);

        // Load initial state from localStorage
        const savedEng = localStorage.getItem('vinterdod_debug_console_logging');
        if (savedEng !== null) this._consoleLoggingEnabled = savedEng === 'true';

        const savedAI = localStorage.getItem('vinterdod_debug_ai_logging');
        if (savedAI !== null) this._aiLoggingEnabled = savedAI === 'true';

        const savedShaders = localStorage.getItem('vinterdod_debug_shader_logging');
        if (savedShaders !== null) this._shaderLoggingEnabled = savedShaders === 'true';
    }

    // FPS Tracking
    private _fps: number = 0;
    private _frameCount: number = 0;
    private _lastFpsUpdate: number = 0;

    // GC Tracking
    private lastHeapSize: number = 0;
    private gcDetected: boolean = false;
    private gcDroppedMB: number = 0;
    private heapUsedMB: number = 0;
    private heapLimitMB: number = 0;
    private _lastGcTime: number = 0;

    // Renderer Stat Tracking
    private _drawCalls: number = 0;
    private _triangles: number = 0;
    private _textures: number = 0;
    private _geometries: number = 0;
    private _shaderPrograms: number = 0;
    private _lastShaderPrograms: number = 0;
    private _shaderRecompileCount: number = 0;
    private _knownPrograms = new Set<string>();

    /**
     * Clears tracking data for a new frame. 
     * Uses flat typed array iteration for 0 memory allocation.
     */
    public startFrame() {
        this._lastFrameTotal = 0;

        // Zero-GC loop over pre-allocated typed arrays
        for (let i = 0; i < this._keys.length; i++) {
            this.timings[i] = 0;
            this.startTimes[i] = 0;
        }

        const now = performance.now();
        this._frameCount++;
        if (now - this._lastFpsUpdate > 1000) {
            this._fps = this._frameCount;
            this._frameCount = 0;
            this._lastFpsUpdate = now;
        }

        // --- EXPERIMENTAL GC TRACKING ---
        const mem = (performance as any).memory;
        if (mem) {
            const currentHeap = mem.usedJSHeapSize;
            this.heapUsedMB = currentHeap / 1048576;
            this.heapLimitMB = mem.jsHeapSizeLimit / 1048576;
            if (this.lastHeapSize > 0) {
                const diff = this.lastHeapSize - currentHeap;
                if (diff > 1048576) {
                    this.gcDetected = true;
                    this.gcDroppedMB = diff / 1048576;
                    this._lastGcTime = now;
                } else {
                    this.gcDetected = false;
                }
            }
            this.lastHeapSize = currentHeap;
        }
    }

    public updateGameState(playerX: number, playerZ: number, camX: number, camY: number, camZ: number, enemies: number, objects: number) {
        this.gameState.playerCoords.x = playerX;
        this.gameState.playerCoords.z = playerZ;
        this.gameState.cameraPos.x = camX;
        this.gameState.cameraPos.y = camY;
        this.gameState.cameraPos.z = camZ;
        this.gameState.enemyCount = enemies;
        this.gameState.objectCount = objects;
    }

    /**
     * Called from WinterEngine immediately after renderer.render().
     * Heavily optimized to avoid Scene traversals and array allocations.
     */
    public setRendererStats(rendererInfo: { render: { calls: number; triangles: number }; memory: { textures: number; geometries: number }; programs: any[] | null | undefined }): void {
        this._drawCalls = rendererInfo.render.calls;
        this._triangles = rendererInfo.render.triangles;
        this._textures = rendererInfo.memory.textures;
        this._geometries = rendererInfo.memory.geometries;

        const currentPrograms = rendererInfo.programs || [];
        const programCount = currentPrograms.length;

        if (programCount > this._lastShaderPrograms && this._lastShaderPrograms > 0) {
            const diff = programCount - this._lastShaderPrograms;
            this._shaderRecompileCount += diff;

            if (this._shaderLoggingEnabled) {
                console.warn(`[SHADER] New program compiled — total: ${programCount} (+${diff})`);

                // [VINTERDÖD] Optimized logger: No .filter, no .forEach, NO SCENE TRAVERSALS.
                for (let i = 0; i < currentPrograms.length; i++) {
                    const p = currentPrograms[i];
                    const key = p.cacheKey || p.id;

                    if (!this._knownPrograms.has(key)) {
                        const keyString = String(key);
                        // Shorten string drastically to prevent string-heap bloat
                        const permPreview = keyString.length > 60 ? keyString.substring(0, 60) + '...' : keyString;
                        console.log(`   -> Type: ${p.name || 'UnknownMaterial'} | Signature: ${permPreview}`);
                        this._knownPrograms.add(key);
                    }
                }
            } else {
                // If logging is disabled, still add to known set silently
                for (let i = 0; i < currentPrograms.length; i++) {
                    const p = currentPrograms[i];
                    const key = p.cacheKey || p.id;
                    if (key) this._knownPrograms.add(key);
                }
            }
        } else if (programCount > 0 && this._lastShaderPrograms === 0) {
            // Initial population
            for (let i = 0; i < currentPrograms.length; i++) {
                const p = currentPrograms[i];
                const key = p.cacheKey || p.id;
                if (key) this._knownPrograms.add(key);
            }
        }

        this._lastShaderPrograms = programCount;
        this._shaderPrograms = programCount;
    }

    // ============================================================================
    // UI GETTERS (FORMATS ON DEMAND TO PREVENT CONSTANT GC SPIKES)
    // ============================================================================

    public getFormattedGameState() {
        return {
            playerX: this.gameState.playerCoords.x.toFixed(1),
            playerZ: this.gameState.playerCoords.z.toFixed(1),
            camX: this.gameState.cameraPos.x.toFixed(1),
            camY: this.gameState.cameraPos.y.toFixed(1),
            camZ: this.gameState.cameraPos.z.toFixed(1),
            enemies: this.gameState.enemyCount.toString(),
            objects: this.gameState.objectCount.toString()
        };
    }

    public getFormattedRendererStats() {
        return {
            drawCalls: this._drawCalls.toString(),
            triangles: (this._triangles / 1000).toFixed(1) + 'k',
            shaderPrograms: this._shaderPrograms.toString(),
            shaderRecompiles: this._shaderRecompileCount,
            textures: this._textures.toString(),
            geometries: this._geometries.toString()
        };
    }

    public getFormattedGcInfo() {
        return {
            timeSinceDetection: performance.now() - this._lastGcTime,
            droppedMB: this.gcDroppedMB.toFixed(1),
            heapUsedMB: this.heapUsedMB.toFixed(1),
            heapLimitMB: this.heapLimitMB.toFixed(0),
        };
    }

    public getFormattedTimings() {
        const formatted: Record<string, string> = {};
        let total = 0;
        for (let i = 0; i < this._keys.length; i++) {
            const time = this.timings[i];
            formatted[this._keys[i]] = time.toFixed(2);
            total += time;
        }
        return {
            breakdown: formatted,
            total: total.toFixed(2)
        };
    }

    // ============================================================================
    // TIMING HELPERS
    // ============================================================================

    private _getIndex(id: string): number {
        const idx = this._keys.indexOf(id);
        if (idx === -1) {
            this._keys.push(id);
            // Re-allocate buffers if an unknown system is added dynamically
            const newTimings = new Float32Array(this._keys.length);
            newTimings.set(this.timings);
            this.timings = newTimings;

            const newStarts = new Float32Array(this._keys.length);
            newStarts.set(this.startTimes);
            this.startTimes = newStarts;

            return this._keys.length - 1;
        }
        return idx;
    }

    public begin(id: string) {
        this.startTimes[this._getIndex(id)] = performance.now();
    }

    public end(id: string) {
        const idx = this._getIndex(id);
        const start = this.startTimes[idx];
        if (start === 0) return;
        this.timings[idx] += performance.now() - start;
    }

    public track(id: string, fn: () => void) {
        this.begin(id);
        fn();
        this.end(id);
    }

    public addTime(id: string, ms: number) {
        this.timings[this._getIndex(id)] += ms;
    }

    // ============================================================================
    // SETTERS & GETTERS
    // ============================================================================

    public getFps(): number { return this._fps; }

    public get consoleLoggingEnabled(): boolean { return this._consoleLoggingEnabled; }
    public set consoleLoggingEnabled(value: boolean) {
        this._consoleLoggingEnabled = value;
        localStorage.setItem('vinterdod_debug_console_logging', String(value));
    }

    public get aiLoggingEnabled(): boolean { return this._aiLoggingEnabled; }
    public set aiLoggingEnabled(value: boolean) {
        this._aiLoggingEnabled = value;
        localStorage.setItem('vinterdod_debug_ai_logging', String(value));
    }

    public get shaderLoggingEnabled(): boolean { return this._shaderLoggingEnabled; }
    public set shaderLoggingEnabled(value: boolean) {
        this._shaderLoggingEnabled = value;
        localStorage.setItem('vinterdod_debug_shader_logging', String(value));
    }

    // Return mapped object ONLY if UI explicitly requests it
    public getTimings(): Record<string, number> {
        const obj: Record<string, number> = {};
        for (let i = 0; i < this._keys.length; i++) obj[this._keys[i]] = this.timings[i];
        return obj;
    }

    public printIfHeavy(context: 'Game Engine Performance' | 'Camp Performance', totalTime: number, threshold: number = 50, extraStats?: Record<string, any>) {
        this._lastFrameTotal = totalTime;
        if (totalTime > threshold) {
            const formatted: Record<string, string> = {};

            for (let i = 0; i < this._keys.length; i++) {
                const time = this.timings[i];
                if (time > 0) formatted[this._keys[i]] = time.toFixed(2) + 'ms';
            }
            formatted.total = totalTime.toFixed(2) + 'ms';

            formatted['drawCalls'] = String(this._drawCalls);
            formatted['triangles'] = (this._triangles / 1000).toFixed(1) + 'k';
            formatted['shaderPrograms'] = String(this._shaderPrograms);

            if (this._shaderRecompileCount > 0) {
                formatted['⚠️ Shader Recompiles'] = String(this._shaderRecompileCount) + ' total this session';
            }
            if (this.gcDetected) {
                formatted['⚠️ GC Event Possible'] = `Heap dropped by ${this.gcDroppedMB.toFixed(2)} MB between frames`;
            }
            if (extraStats) {
                for (const key in extraStats) formatted[key] = extraStats[key];
            }

            if (this._consoleLoggingEnabled) {
                console.warn(`[${context}] Frame took ${totalTime.toFixed(2)}ms:`, formatted);
            }
        }
    }
}