import { SystemID } from './System';

/**
 * Centralized, high-performance tracking system strictly adhering to Zero-GC principles.
 * Ensures consistent profiling output. Acts strictly as a data layer.
 */
export class PerformanceMonitor {
    readonly systemId = SystemID.PERFORMANCE_MONITOR;
    id = 'performance_monitor';
    enabled = false; // [VINTERDÖD] Disabled by default to protect menu performance
    persistent = true;

    private static instance: PerformanceMonitor | null = null;

    public static getInstance() {
        if (!this.instance) this.instance = new PerformanceMonitor();
        return this.instance;
    }

    // --- ZERO-GC DYNAMIC SYSTEM TRACKING ---
    private readonly RECORD_FRAMES = 400;
    private readonly MAX_SYSTEMS = 64;
    private _keyMap: Record<string, number> = {};
    private _keys: string[] = [];
    private _systemCount: number = 0;

    // ZERO-GC: Typed arrays ensure contiguous memory allocation for CPU cache friendliness
    private timings: Float32Array;
    private startTimes: Float32Array;

    private _lastFrameTotal: number = 0;

    private _consoleLoggingEnabled: boolean = true;
    private _aiLoggingEnabled: boolean = true;
    private _shaderLoggingEnabled: boolean = true;
    private _logHijackEnabled: boolean = false;

    // ZERO-GC: Pre-allocated ring-buffer for logs (100 slots reused, no Array.push)
    private _logs: { msg: string, color: string, time: number }[] = new Array(100).fill(null).map(() => ({ msg: '', color: '', time: 0 }));
    private _logIndex: number = 0;
    private _originalConsole: any = null;

    // --- PRE-ALLOCATED CACHES FOR GETTERS (100% ZERO-GC UI POLLING) ---
    // These objects are mutated and returned, avoiding new object allocations per frame.
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

    // FPS Tracking (Stable Counter-based calculation)
    private _fps: number = 0;
    private _renderFrameCount: number = 0;
    private _lastRenderFpsUpdate: number = 0;

    // Logic FPS (Fixed Step)
    private _logicFps: number = 0;
    private _logicFrameCount: number = 0;
    private _lastLogicFpsUpdate: number = 0;

    // GC Tracking (live state)
    private lastHeapSize: number = 0;
    private gcDetected: boolean = false;
    private gcDroppedMB: number = 0;
    private heapUsedMB: number = 0;
    private heapLimitMB: number = 0;
    private _lastGcTime: number = 0;
    private _lastMemUpdate: number = 0;

    // GC Recording accumulators
    private _recordingTotalGcMB: number = 0;
    private _recordingGcEventCount: number = 0;

    // Pre-allocated GC event ring buffer (Zero-GC — slots created once)
    private static readonly GC_RING_SIZE = 32;
    private _gcRing: { time: number; droppedMB: number; heapBefore: number; heapAfter: number }[];
    private _gcRingHead: number = 0;
    private _gcRingCount: number = 0;

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
    public _recordingPending = false;
    private _recordingFramesLeft = 0;
    private _recordingStartRecompiles = 0;
    private _recordingStartTime = 0;

    constructor() {
        this.timings = new Float32Array(this.MAX_SYSTEMS);
        this.startTimes = new Float32Array(this.MAX_SYSTEMS);

        // Pre-allocate GC ring buffer slots (done once — Zero-GC in hot-path)
        this._gcRing = new Array(PerformanceMonitor.GC_RING_SIZE);
        for (let i = 0; i < PerformanceMonitor.GC_RING_SIZE; i++) {
            this._gcRing[i] = { time: 0, droppedMB: 0, heapBefore: 0, heapAfter: 0 };
        }

        const now = performance.now();
        this._lastLogicFpsUpdate = now;
        this._lastRenderFpsUpdate = now;

        const savedEng = localStorage.getItem('vinterdod_debug_console_logging');
        if (savedEng !== null) this._consoleLoggingEnabled = savedEng === 'true';

        const savedAI = localStorage.getItem('vinterdod_debug_ai_logging');
        if (savedAI !== null) this._aiLoggingEnabled = savedAI === 'true';

        const savedShaders = localStorage.getItem('vinterdod_debug_shader_logging');
        if (savedShaders !== null) this._shaderLoggingEnabled = savedShaders === 'true';

        const savedHijack = localStorage.getItem('vinterdod_debug_logs_hijack');
        if (savedHijack === 'true') this.logsHijackEnabled = true;
    }

    public silenceWarnings: boolean = false; // [VINTERDÖD] Prevent console spam during heavy loads

    public startFrame() {
        // [VINTERDÖD] Relaxed Guard: Enable if in session OR if debug mode is active.
        // This allows capturing preloader and menu metrics when the developer opts-in.
        const hudState = (window as any).HudStore?.getState();
        const hudVisible = hudState ? !!hudState.hudVisible : false;
        const debugMode = hudState ? !!hudState.debugMode : false;

        this.enabled = hudVisible || debugMode;

        if (!this.enabled) {
            this._lastRenderFpsUpdate = 0;
            this._renderFrameCount = 0;
            return;
        }

        this._lastFrameTotal = 0;

        // ZERO-GC: Reset arrays using standard loop
        for (let i = 0; i < this._systemCount; i++) {
            this.timings[i] = 0;
            this.startTimes[i] = 0;
        }

        const now = performance.now();
        if (this._lastRenderFpsUpdate === 0) {
            this._lastRenderFpsUpdate = now;
        }

        this._renderFrameCount++;
        if (now - this._lastRenderFpsUpdate > 1000) {
            const timePassed = now - this._lastRenderFpsUpdate;
            this._fps = (this._renderFrameCount * 1000) / timePassed;
            this._renderFrameCount = 0;
            this._lastRenderFpsUpdate = now;
        }

        if (now - this._lastMemUpdate > 500) {
            this._lastMemUpdate = now;
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

                        // --- Recording: accumulate total and push to ring buffer ---
                        if (this._isRecording) {
                            this._recordingTotalGcMB += this.gcDroppedMB;
                            this._recordingGcEventCount++;

                            // Zero-GC: mutate pre-allocated slot
                            const slot = this._gcRing[this._gcRingHead];
                            slot.time = now - this._recordingStartTime;
                            slot.droppedMB = this.gcDroppedMB;
                            slot.heapBefore = this.lastHeapSize / 1048576;
                            slot.heapAfter = currentHeap / 1048576;
                            this._gcRingHead = (this._gcRingHead + 1) % PerformanceMonitor.GC_RING_SIZE;
                            if (this._gcRingCount < PerformanceMonitor.GC_RING_SIZE) this._gcRingCount++;
                        }
                    } else {
                        this.gcDetected = false;
                    }
                }
                this.lastHeapSize = currentHeap;
            }
        }
    }

    public updateGameState(playerX: number, playerZ: number, camX: number, camY: number, camZ: number, enemies: number, objects: number) {
        if (!this.enabled) return;
        this.gameState.playerCoords.x = playerX;
        this.gameState.playerCoords.z = playerZ;
        this.gameState.cameraPos.x = camX;
        this.gameState.cameraPos.y = camY;
        this.gameState.cameraPos.z = camZ;
        this.gameState.enemyCount = enemies;
        this.gameState.objectCount = objects;
    }

    public setRendererStats(rendererInfo: { render: { calls: number; triangles: number }; memory: { textures: number; geometries: number }; programs: any[] | null | undefined }): void {
        if (!this.enabled) return;
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

    private _registerSystem(id: string): number {
        if (this._systemCount >= this.MAX_SYSTEMS) {
            console.warn(`[PerformanceMonitor] Over ${this.MAX_SYSTEMS} systems tracked! Ignoring '${id}'.`);
            return 0;
        }
        const idx = this._systemCount;
        this._keyMap[id] = idx;
        this._keys.push(id);
        this._systemCount++;
        return idx;
    }

    public begin(id: string) {
        if (!this.enabled) return;
        let idx = this._keyMap[id];
        if (idx === undefined) {
            idx = this._registerSystem(id);
        }
        this.startTimes[idx] = performance.now();
    }

    public end(id: string) {
        if (!this.enabled) return;
        let idx = this._keyMap[id];
        if (idx === undefined) return;

        const start = this.startTimes[idx];
        if (start === 0) return;

        const time = performance.now() - start;
        this.timings[idx] += time;

        if (this._isRecording) {
            const sysName = this._keys[idx];
            if (!this._reports[sysName]) this._reports[sysName] = [];
            this._reports[sysName].push(time);
        }
    }

    public track(id: string, fn: () => void) {
        if (!this.enabled) { fn(); return; }
        this.begin(id);
        fn();
        this.end(id);
    }

    public addTime(id: string, ms: number) {
        if (!this.enabled) return;
        let idx = this._keyMap[id];
        if (idx === undefined) {
            idx = this._registerSystem(id);
        }
        this.timings[idx] += ms;
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
            this._reports = {};
            this._recordingStartRecompiles = this._shaderRecompileCount;
            this._recordingStartTime = performance.now();

            // Reset GC recording accumulators
            this._recordingTotalGcMB = 0;
            this._recordingGcEventCount = 0;
            this._gcRingHead = 0;
            this._gcRingCount = 0;

            console.log(`🔴 [WinterEngine] Recording started! Click REC again to stop and dump report.`);
        }, 2000);
    }

    public stopRecording() {
        if (this._isRecording) {
            this._isRecording = false;
            const duration = performance.now() - this._recordingStartTime;
            console.log(`⏹️ [WinterEngine] Recording finished (Duration: ${(duration / 1000).toFixed(2)}s). Dumping report...`);
            this.dumpReport();
        } else if (this._recordingPending) {
            this._recordingPending = false;
            console.log("⏹️ [WinterEngine] Recording cancelled.");
        }
    }

    private dumpReport() {
        console.log("📊 ========================================================");
        console.log(`📊 --- WINTER ENGINE PERFORMANCE REPORT ---`);
        console.log("📊 ========================================================");

        const reportKeys = Object.keys(this._reports);
        if (reportKeys.length === 0) {
            console.log("📊 [WinterEngine] No systems tracked during recording.");
            return;
        }

        const frameCount = reportKeys.length > 0 ? this._reports[reportKeys[0]].length : 0;
        console.log(`📊 Session: ${frameCount} frames captured.`);

        const world = this.getFormattedGameState();
        const render = this.getFormattedRendererStats();
        const gc = this.getFormattedGcInfo();

        console.log("🌍 [WORLD & MEMORY]");
        console.log(`   Player: X: ${world.playerX}, Z: ${world.playerZ} | Cam: ${world.camX}, ${world.camY}, ${world.camZ}`);
        console.log(`   Entities: ${world.enemies} Enemies | ${world.objects} Objects`);
        console.log(`   Heap: ${gc.heapUsedMB} MB / ${gc.heapLimitMB} MB | Last drop: ${gc.droppedMB} MB`);
        console.log(`   GC Events during session: ${this._recordingGcEventCount} | Total reclaimed: ${(Math.round(this._recordingTotalGcMB * 10) / 10)} MB`);

        if (this._recordingGcEventCount > 0) {
            console.log("🗑️  [GC EVENT TIMELINE]");
            const gcTable: Record<string, string> = {};
            // Reconstruct chronological order from ring buffer
            const start = this._gcRingCount < PerformanceMonitor.GC_RING_SIZE
                ? 0
                : this._gcRingHead; // wrapped — oldest is at head
            for (let i = 0; i < this._gcRingCount; i++) {
                const idx = (start + i) % PerformanceMonitor.GC_RING_SIZE;
                const ev = this._gcRing[idx];
                const label = `GC #${i + 1} @ +${(ev.time / 1000).toFixed(2)}s`;
                gcTable[label] = `↓ ${(Math.round(ev.droppedMB * 10) / 10)} MB  (${(Math.round(ev.heapBefore * 10) / 10)} → ${(Math.round(ev.heapAfter * 10) / 10)} MB)`;
            }
            console.table(gcTable);
        }

        console.log("🎨 [RENDERER]");
        console.log(`   Draw Calls: ${render.drawCalls}`);
        console.log(`   Triangles: ${render.triangles}k`);
        console.log(`   Geometries: ${render.geometries} | Textures: ${render.textures}`);

        const sessionRecompiles = render.shaderRecompiles - this._recordingStartRecompiles;
        console.log(`   Shaders: ${render.shaderPrograms} (Recompiles during ${frameCount} frames: ${sessionRecompiles} | Lifetime: ${render.shaderRecompiles})`);

        console.log("⚙️  [SYSTEMS]");
        const activeSystems = Object.keys(this._reports).filter(k => this._reports[k].length > 0);
        console.log(`   Active tracked systems: ${activeSystems.join(', ')}`);

        console.log(`⏱️  [CPU TIMINGS]`);
        const report: any = {};
        let totalFrameTime = 0;

        for (const [id, times] of Object.entries(this._reports)) {
            if (times.length === 0) continue;
            let sum = 0;
            for (let i = 0; i < times.length; i++) sum += times[i];
            const avg = sum / times.length;
            report[id] = `${avg.toFixed(2)} ms`;

            if (id === 'logic' || id === 'logic_simulation' || id === 'camera' || id === 'render') {
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
        // During recording, show the session-accumulated total; otherwise show last single drop.
        this._gcInfoCache.droppedMB = this._isRecording
            ? Math.round(this._recordingTotalGcMB * 10) / 10
            : Math.round(this.gcDroppedMB * 10) / 10;
        this._gcInfoCache.heapUsedMB = Math.round(this.heapUsedMB * 10) / 10;
        this._gcInfoCache.heapLimitMB = Math.round(this.heapLimitMB);
        return this._gcInfoCache;
    }

    /**
     * Returns the GC event ring buffer in chronological order.
     * Read-only view — do not mutate the returned slots.
     */
    public getGcEvents(): { time: number; droppedMB: number; heapBefore: number; heapAfter: number }[] {
        // Returns a sorted snapshot — only called from dev tooling, not hot-path.
        const result: { time: number; droppedMB: number; heapBefore: number; heapAfter: number }[] = [];
        const start = this._gcRingCount < PerformanceMonitor.GC_RING_SIZE ? 0 : this._gcRingHead;
        for (let i = 0; i < this._gcRingCount; i++) {
            result.push(this._gcRing[(start + i) % PerformanceMonitor.GC_RING_SIZE]);
        }
        return result;
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
    public getLogicFps(): number { return this._logicFps; }
    public get isRecordingActive(): boolean { return this._isRecording; }
    public get isRecordingPending(): boolean { return this._recordingPending; }

    /**
     * Ticks the logic frame counter. Should be called inside the fixed-step loop.
     */
    public tickLogic() {
        if (!this.enabled) return;
        const now = performance.now();
        this._logicFrameCount++;
        if (now - this._lastLogicFpsUpdate > 1000) {
            this._logicFps = this._logicFrameCount;
            this._logicFrameCount = 0;
            this._lastLogicFpsUpdate = now;
        }
    }

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

    public get logsHijackEnabled(): boolean { return this._logHijackEnabled; }
    public set logsHijackEnabled(value: boolean) {
        if (this._logHijackEnabled === value) return;
        this._logHijackEnabled = value;
        localStorage.setItem('vinterdod_debug_logs_hijack', String(value));

        if (value) {
            this._applyHijack();
        } else {
            this._removeHijack();
        }
    }

    private _applyHijack() {
        if (this._originalConsole) return;
        this._originalConsole = {
            log: console.log,
            warn: console.warn,
            error: console.error,
            info: console.info
        };

        const pushLog = (msg: any[], color: string) => {
            let str = '';
            for (let i = 0; i < msg.length; i++) {
                const a = msg[i];
                if (a instanceof Error) {
                    str += a.message + ' ';
                } else if (a !== null && typeof a === 'object') {
                    // ZERO-GC: Avoid JSON.stringify in hot paths
                    if (a.constructor && a.constructor.name) {
                        str += `[${a.constructor.name}] `;
                    } else {
                        str += '[Object] ';
                    }
                } else {
                    str += String(a) + ' ';
                }
            }

            const logObj = this._logs[this._logIndex];
            logObj.msg = str;
            logObj.color = color;
            logObj.time = performance.now();

            this._logIndex = (this._logIndex + 1) % 100;
        };

        console.log = (...args) => {
            if (this._originalConsole) this._originalConsole.log(...args);
            pushLog(args, '#ffffff');
        };
        console.warn = (...args) => {
            if (this._originalConsole) this._originalConsole.warn(...args);
            pushLog(args, '#ffcc00');
        };
        console.error = (...args) => {
            if (this._originalConsole) this._originalConsole.error(...args);
            pushLog(args, '#ff5555');
        };
        console.info = (...args) => {
            if (this._originalConsole) this._originalConsole.info(...args);
            pushLog(args, '#00ccff');
        };
    }

    private _removeHijack() {
        if (!this._originalConsole) return;
        console.log = this._originalConsole.log;
        console.warn = this._originalConsole.warn;
        console.error = this._originalConsole.error;
        console.info = this._originalConsole.info;
        this._originalConsole = null;
    }

    public getLogs() {
        // ZERO-GC: Keeps the existing zero-gc index sorting
        const sorted = [];
        for (let i = 0; i < 100; i++) {
            const idx = (this._logIndex + i) % 100;
            const log = this._logs[idx];
            if (log.time !== 0) sorted.push(log);
        }
        return sorted;
    }

    public clearLogs() {
        for (let i = 0; i < 100; i++) {
            this._logs[i].msg = '';
            this._logs[i].time = 0;
        }
    }

    public getTimings(): Record<string, number> {
        for (let i = 0; i < this._systemCount; i++) {
            this._timingsObject[this._keys[i]] = this.timings[i];
        }
        return this._timingsObject;
    }

    public printIfHeavy(context: string, totalTime: number, threshold: number = 50) {
        if (!this.enabled || this.silenceWarnings) return;
        this._lastFrameTotal = totalTime;

        if (totalTime > threshold && this._consoleLoggingEnabled) {
            console.warn(`[${context}] HEAVY FRAME: ${Math.round(totalTime)} ms. Check Performance Tab.`);
        }
    }
}
