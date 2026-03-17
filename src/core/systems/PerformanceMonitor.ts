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

    // Renderer Stat Tracking (set externally from WinterEngine after each render)
    private _drawCalls: number = 0;
    private _triangles: number = 0;
    private _textures: number = 0;
    private _geometries: number = 0;
    private _shaderPrograms: number = 0;
    private _lastShaderPrograms: number = 0;
    private _shaderRecompileCount: number = 0; // Cumulative new programs this session
    private _knownPrograms = new Set<string>(); // Tracks unique shader permutations

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
                    // We don't reset droppedMB so the UI can linger on the value
                }
            }
            this.lastHeapSize = currentHeap;
        }
    }

    // --- GAME STATE UPDATERS ---
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
     * Reads renderer.info — Zero-GC, just primitive copies.
     * Also tracks and logs exactly WHICH shaders were compiled if a spike happens.
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

                // Identify exactly what caused the recompile by checking against our known set
                const newPrograms = currentPrograms.filter(p => !this._knownPrograms.has(p.cacheKey || p.id));
                newPrograms.forEach(p => {
                    const matType = p.name || 'UnknownMaterial';
                    // cacheKey contains all the WebGL #defines (lights, fog, instancing, etc)
                    const keyString = String(p.cacheKey);
                    // Slice to 120 chars to avoid flooding the console, but keep enough to spot differences
                    const permPreview = keyString.length > 120 ? keyString.substring(0, 120) + '...' : keyString;

                    // Leta i hela scenen efter materialet som just skapades!
                    let foundObjectName = "Unknown (probably a sprite/particle)";
                    if ((window as any).gameEngine && (window as any).gameEngine.scene) {
                        (window as any).gameEngine.scene.traverse((obj: any) => {
                            if (obj.material && (obj.material.id === p.id || String(p.cacheKey) === obj.material.customProgramCacheKey?.())) {
                                foundObjectName = obj.name || obj.type || "Nameless object";
                            }
                        });
                    }
                    console.log(`   -> Type: ${matType} | Key: ${permPreview} | Belongs to: ${foundObjectName}`);
                });
            }
        }

        // Add all current programs to known set so we don't log them again
        for (let i = 0; i < currentPrograms.length; i++) {
            const key = currentPrograms[i].cacheKey || currentPrograms[i].id;
            if (key) this._knownPrograms.add(key);
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
            shaderRecompiles: this._shaderRecompileCount, // Int (used for coloring)
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
        for (const key in this.timings) {
            formatted[key] = this.timings[key].toFixed(2);
            total += this.timings[key];
        }
        return {
            breakdown: formatted,
            total: total.toFixed(2)
        };
    }

    // ============================================================================

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

    public get consoleLoggingEnabled(): boolean {
        return this._consoleLoggingEnabled;
    }

    public set consoleLoggingEnabled(value: boolean) {
        this._consoleLoggingEnabled = value;
        localStorage.setItem('vinterdod_debug_console_logging', String(value));
    }

    public get aiLoggingEnabled(): boolean {
        return this._aiLoggingEnabled;
    }

    public set aiLoggingEnabled(value: boolean) {
        this._aiLoggingEnabled = value;
        localStorage.setItem('vinterdod_debug_ai_logging', String(value));
    }

    public get shaderLoggingEnabled(): boolean {
        return this._shaderLoggingEnabled;
    }

    public set shaderLoggingEnabled(value: boolean) {
        this._shaderLoggingEnabled = value;
        localStorage.setItem('vinterdod_debug_shader_logging', String(value));
    }

    public getTimings(): Record<string, number> {
        return this.timings;
    }

    /**
     * Prints a standardized Heavy Frame output to the console if total time exceeds threshold.
     * Automatically includes renderer stats and GC info collected this frame.
     */
    public printIfHeavy(context: 'Game Engine Performance' | 'Camp Performance', totalTime: number, threshold: number = 50, extraStats?: Record<string, any>) {
        this._lastFrameTotal = totalTime;
        if (totalTime > threshold) {
            const formatted: Record<string, string> = {};

            // CPU timing breakdown
            for (const key in this.timings) {
                if (this.timings[key] > 0) {
                    formatted[key] = this.timings[key].toFixed(2) + 'ms';
                }
            }
            formatted.total = totalTime.toFixed(2) + 'ms';

            // Auto-include renderer stats (set by setRendererStats each frame)
            formatted['drawCalls'] = String(this._drawCalls);
            formatted['triangles'] = (this._triangles / 1000).toFixed(1) + 'k';
            formatted['shaderPrograms'] = String(this._shaderPrograms);
            if (this._shaderRecompileCount > 0) {
                formatted['⚠️ Shader Recompiles'] = String(this._shaderRecompileCount) + ' total this session';
            }

            // GC event flag
            if (this.gcDetected) {
                formatted['⚠️ GC Event Possible'] = `Heap dropped by ${this.gcDroppedMB.toFixed(2)} MB between frames`;
            }

            // Any caller-provided extra stats
            if (extraStats) {
                for (const key in extraStats) {
                    formatted[key] = extraStats[key];
                }
            }

            if (this._consoleLoggingEnabled) {
                console.warn(`[${context}] Frame took ${totalTime.toFixed(2)}ms:`, formatted);
            }
        }
    }
}