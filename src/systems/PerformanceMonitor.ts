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

    // --- ZERO-GC DYNAMIC SYSTEM TRACKING ---
    private readonly MAX_SYSTEMS = 64;
    private _keyMap: Record<string, number> = {};
    private _keys: string[] = [];
    private _systemCount: number = 0;

    private timings: Float32Array;
    private startTimes: Float32Array;

    // --- HÄR ÄR DEN SAKNADE VARIABELN ---
    private _lastFrameTotal: number = 0;

    private _consoleLoggingEnabled: boolean = true;
    private _aiLoggingEnabled: boolean = true;
    private _shaderLoggingEnabled: boolean = true;

    // --- PRE-ALLOCATED CACHES FOR GETTERS (100% ZERO-GC UI POLLING) ---
    private _timingsObject: Record<string, number> = {};
    private _gameStateCache = { playerX: 0, playerZ: 0, camX: 0, camY: 0, camZ: 0, enemies: 0, objects: 0 };
    private _rendererStatsCache = { drawCalls: 0, triangles: 0, shaderPrograms: 0, shaderRecompiles: 0, textures: 0, geometries: 0 };
    private _gcInfoCache = { timeSinceDetection: 0, droppedMB: 0, heapUsedMB: 0, heapLimitMB: 0 };
    private _formattedTimingsCache = { breakdown: {} as Record<string, number>, total: 0 };

    // --- GAME STATE CACHE (Raw numbers only) ---
    public gameState = {
        playerCoords: { x: 0, z: 0 },
        cameraPos: { x: 0, y: 0, z: 0 },
        enemyCount: 0,
        objectCount: 0
    };

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

    // --- RECORDING STATE ---
    private _reports: Record<string, number[]> = {};
    private _isRecording = false;
    private _recordingPending = false;
    private _recordingFramesLeft = 0;

    constructor() {
        this.timings = new Float32Array(this.MAX_SYSTEMS);
        this.startTimes = new Float32Array(this.MAX_SYSTEMS);

        const savedEng = localStorage.getItem('vinterdod_debug_console_logging');
        if (savedEng !== null) this._consoleLoggingEnabled = savedEng === 'true';

        const savedAI = localStorage.getItem('vinterdod_debug_ai_logging');
        if (savedAI !== null) this._aiLoggingEnabled = savedAI === 'true';

        const savedShaders = localStorage.getItem('vinterdod_debug_shader_logging');
        if (savedShaders !== null) this._shaderLoggingEnabled = savedShaders === 'true';
    }

    public startFrame() {
        this._lastFrameTotal = 0;

        for (let i = 0; i < this._systemCount; i++) {
            this.timings[i] = 0;
            this.startTimes[i] = 0;
        }

        // --- INSPELNINGSLOGIK (Frame Count) ---
        if (this._isRecording) {
            this._recordingFramesLeft--;
            if (this._recordingFramesLeft <= 0) {
                this._isRecording = false;
                this.dumpReport();
            }
        }

        const now = performance.now();
        this._frameCount++;
        if (now - this._lastFpsUpdate > 1000) {
            this._fps = this._frameCount;
            this._frameCount = 0;
            this._lastFpsUpdate = now;
        }

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

    public setRendererStats(rendererInfo: { render: { calls: number; triangles: number }; memory: { textures: number; geometries: number }; programs: any[] | null | undefined }): void {
        this._drawCalls = rendererInfo.render.calls;
        this._triangles = rendererInfo.render.triangles;
        this._textures = rendererInfo.memory.textures;
        this._geometries = rendererInfo.memory.geometries;

        const currentPrograms = rendererInfo.programs || null;
        const programCount = currentPrograms ? currentPrograms.length : 0;

        if (programCount > this._lastShaderPrograms && this._lastShaderPrograms > 0 && currentPrograms) {
            const diff = programCount - this._lastShaderPrograms;
            this._shaderRecompileCount += diff;

            if (this._shaderLoggingEnabled) {
                console.warn(`[SHADER] New program compiled — total: ${programCount} (+${diff})`);
                for (let i = 0; i < currentPrograms.length; i++) {
                    const p = currentPrograms[i];
                    const key = p.cacheKey || p.id;
                    if (key && !this._knownPrograms.has(key)) {
                        console.log(`   -> New Material Program: ${p.name || 'Unknown'}`);
                        this._knownPrograms.add(key);
                    }
                }
            } else {
                for (let i = 0; i < currentPrograms.length; i++) {
                    const p = currentPrograms[i];
                    const key = p.cacheKey || p.id;
                    if (key) this._knownPrograms.add(key);
                }
            }
        } else if (programCount > 0 && this._lastShaderPrograms === 0 && currentPrograms) {
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
    // TIMING HELPERS (HOT PATH - 100% ZERO GC)
    // ============================================================================

    private _getIndex(id: string): number {
        let idx = this._keyMap[id];
        if (idx === undefined) {
            if (this._systemCount >= this.MAX_SYSTEMS) {
                console.warn(`[PerformanceMonitor] Over ${this.MAX_SYSTEMS} systems tracked! Ignoring '${id}'.`);
                return 0;
            }
            idx = this._systemCount;
            this._keyMap[id] = idx;
            this._keys.push(id);
            this._systemCount++;
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

        const time = performance.now() - start;
        this.timings[idx] += time;

        // Spara enbart data till arrayer när vi befinner oss i aktiv inspelning
        if (this._isRecording) {
            if (!this._reports[id]) this._reports[id] = [];
            this._reports[id].push(time);
        }
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
    // PROFILING & DUMPING
    // ============================================================================

    public startRecording() {
        if (this._isRecording || this._recordingPending) return;
        this._recordingPending = true;

        console.log("⏳ [WinterEngine] Recording starting in 2 seconds. Close the menu!");

        setTimeout(() => {
            this._recordingPending = false;
            this._isRecording = true;
            this._recordingFramesLeft = 300; // 5 sekunder i 60 FPS
            this._reports = {};
            console.log("🔴 [WinterEngine] Recording active gameplay for 300 frames...");
        }, 2000);
    }

    // Returnerar true om vi antingen väntar (delay) eller faktiskt spelar in
    public get isRecordingActive(): boolean {
        return this._isRecording || this._recordingPending;
    }

    private dumpReport() {
        console.log("📊 ========================================================");
        console.log("📊 --- WINTER ENGINE 300-FRAME PERFORMANCE REPORT ---");
        console.log("📊 ========================================================");

        // Refresh caches before dumping
        const world = this.getFormattedGameState();
        const render = this.getFormattedRendererStats();
        const gc = this.getFormattedGcInfo();

        // 1. WORLD & MEMORY
        console.log("🌍 [WORLD & MEMORY]");
        console.log(`   Player: X:${world.playerX}, Z:${world.playerZ} | Cam: ${world.camX}, ${world.camY}, ${world.camZ}`);
        console.log(`   Entities: ${world.enemies} Enemies | ${world.objects} Objects`);
        console.log(`   Heap: ${gc.heapUsedMB} MB / ${gc.heapLimitMB} MB (Dropped: ${gc.droppedMB} MB)`);

        // 2. RENDERER
        console.log("🎨 [RENDERER]");
        console.log(`   Draw Calls: ${render.drawCalls}`);
        console.log(`   Triangles:  ${render.triangles}k`);
        console.log(`   Geometries: ${render.geometries} | Textures: ${render.textures}`);
        console.log(`   Shaders:    ${render.shaderPrograms} (Recompiles during 300 frames: ${render.shaderRecompiles})`);

        // 3. SYSTEMS
        console.log("⚙️  [SYSTEMS]");
        // Get all systems that registered a time > 0 during the recording
        const activeSystems = Object.keys(this._reports).filter(k => this._reports[k].length > 0);
        console.log(`   Active tracked systems: ${activeSystems.join(', ')}`);

        // 4. TIMINGS
        console.log("⏱️  [CPU TIMINGS (Avg over 300 frames)]");
        const report: any = {};
        let totalFrameTime = 0;

        for (const [id, times] of Object.entries(this._reports)) {
            if (times.length === 0) continue;
            let sum = 0;
            for (let i = 0; i < times.length; i++) sum += times[i];
            const avg = sum / times.length;
            report[id] = `${avg.toFixed(2)} ms`;

            // Only sum top-level domains to prevent counting sub-systems twice
            if (id === 'logic' || id === 'camera' || id === 'render') {
                totalFrameTime += avg;
            }
        }
        console.table(report);
        console.log(`🔥 Avg Total Frame Time: ${totalFrameTime.toFixed(2)} ms (Target for 60FPS: 16.6ms)`);
        console.log("==========================================================");
    }

    // ============================================================================
    // UI GETTERS (100% ZERO-GC, RE-USING CACHED OBJECTS & MATH ROUNDING)
    // ============================================================================

    public getFormattedGameState() {
        this._gameStateCache.playerX = Math.round(this.gameState.playerCoords.x * 10) / 10;
        this._gameStateCache.playerZ = Math.round(this.gameState.playerCoords.z * 10) / 10;
        this._gameStateCache.camX = Math.round(this.gameState.cameraPos.x * 10) / 10;
        this._gameStateCache.camY = Math.round(this.gameState.cameraPos.y * 10) / 10;
        this._gameStateCache.camZ = Math.round(this.gameState.cameraPos.z * 10) / 10;
        this._gameStateCache.enemies = this.gameState.enemyCount;
        this._gameStateCache.objects = this.gameState.objectCount;
        return this._gameStateCache;
    }

    public getFormattedRendererStats() {
        this._rendererStatsCache.drawCalls = this._drawCalls;
        this._rendererStatsCache.triangles = Math.round((this._triangles / 1000) * 10) / 10;
        this._rendererStatsCache.shaderPrograms = this._shaderPrograms;
        this._rendererStatsCache.shaderRecompiles = this._shaderRecompileCount;
        this._rendererStatsCache.textures = this._textures;
        this._rendererStatsCache.geometries = this._geometries;
        return this._rendererStatsCache;
    }

    public getFormattedGcInfo() {
        this._gcInfoCache.timeSinceDetection = Math.round(performance.now() - this._lastGcTime);
        this._gcInfoCache.droppedMB = Math.round(this.gcDroppedMB * 10) / 10;
        this._gcInfoCache.heapUsedMB = Math.round(this.heapUsedMB * 10) / 10;
        this._gcInfoCache.heapLimitMB = Math.round(this.heapLimitMB);
        return this._gcInfoCache;
    }

    public getFormattedTimings() {
        let total = 0;
        for (let i = 0; i < this._systemCount; i++) {
            const time = this.timings[i];
            this._formattedTimingsCache.breakdown[this._keys[i]] = Math.round(time * 100) / 100;
            total += time;
        }
        this._formattedTimingsCache.total = Math.round(total * 100) / 100;
        return this._formattedTimingsCache;
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

    public getTimings(): Record<string, number> {
        for (let i = 0; i < this._systemCount; i++) {
            this._timingsObject[this._keys[i]] = this.timings[i];
        }
        return this._timingsObject;
    }

    public printIfHeavy(context: string, totalTime: number, threshold: number = 50) {
        this._lastFrameTotal = totalTime;

        if (totalTime > threshold && this._consoleLoggingEnabled) {
            console.warn(`[${context}] HEAVY FRAME: ${Math.round(totalTime)}ms. Check Performance Tab.`);
        }
    }
}