import React, { useState, useEffect } from 'react';
import { PerformanceMonitor } from '../../../core/systems/PerformanceMonitor';

interface DebugDisplayProps {
    fps?: number; // Kept for compat but will prioritize PerformanceMonitor
    debugMode: boolean;
    systems?: { id: string; enabled: boolean }[];
    onToggleSystem?: (id: string, enabled: boolean) => void;
    debugInfo?: {
        aim?: { x: number; y: number };
        cam?: { x: number; y: number; z: number };
        camera?: {
            x: number;
            y: number;
            z: number;
            rotX: number;
            rotY: number;
            rotZ: number;
            fov: number;
        };
        modes?: string;
        enemies?: number;
        objects?: number;
        drawCalls?: number;
        coords?: { x: number; z: number };
        performance?: {
            cpu?: Record<string, number>;
            memory?: {
                heapLimit: number;
                heapTotal: number;
                heapUsed: number;
            } | null;
        };
    };
}

const DebugDisplay: React.FC<DebugDisplayProps> = ({ fps: propFps, debugMode, debugInfo, systems, onToggleSystem }) => {
    const [isMinimized, setIsMinimized] = useState(() => {
        const saved = localStorage.getItem('vinterdod_debug_minimized');
        return saved === 'true';
    });

    const [fps, setFps] = useState(0);
    const [consoleLogging, setConsoleLogging] = useState(() => {
        const saved = localStorage.getItem('vinterdod_debug_console_logging');
        return saved !== 'false';
    });
    const [systemsExpanded, setSystemsExpanded] = useState(true);

    // Update FPS and renderer/GC stats from PerformanceMonitor
    const [rendererStats, setRendererStats] = useState(() => PerformanceMonitor.getInstance().getRendererStats());
    const [gcInfo, setGcInfo] = useState(() => PerformanceMonitor.getInstance().getGcInfo());
    // Track when GC was last detected so its message lingers for 2 s
    const [gcLastDetectedAt, setGcLastDetectedAt] = useState(0);
    const [gcLastDropMB, setGcLastDropMB] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            const now = performance.now();
            setFps(PerformanceMonitor.getInstance().getFps());
            const rs = PerformanceMonitor.getInstance().getRendererStats();
            setRendererStats(rs);
            const gc = PerformanceMonitor.getInstance().getGcInfo();
            setGcInfo(gc);
            if (gc.detected) {
                setGcLastDetectedAt(now);
                setGcLastDropMB(gc.droppedMB);
            }
        }, 500);
        return () => clearInterval(interval);
    }, []);

    // Sync console logging state to PerformanceMonitor
    useEffect(() => {
        PerformanceMonitor.getInstance().consoleLoggingEnabled = consoleLogging;
        localStorage.setItem('vinterdod_debug_console_logging', String(consoleLogging));
    }, [consoleLogging]);

    const toggleMinimized = (e: React.MouseEvent) => {
        if (!debugMode) return;
        e.stopPropagation();
        const next = !isMinimized;
        setIsMinimized(next);
        localStorage.setItem('vinterdod_debug_minimized', String(next));
    };

    // --- Mode: OFF - Simple FPS in top-left ---
    if (!debugMode) {
        return (
            <div className="fixed top-0 right-0 z-[9999] bg-black/40 text-white/50 px-2 py-0.5 font-mono text-[12px] pointer-events-none select-none backdrop-blur-[2px] border border-white/5 rounded-sm">
                {Math.round(fps)} FPS
            </div>
        );
    }


    // Minimized State (Simple View in top-right)
    if (isMinimized) {
        return (
            <div
                onClick={toggleMinimized}
                className="fixed top-0 right-0 z-[9999] bg-black/40 px-2 py-0.5 cursor-pointer shadow-xl pointer-events-auto border border-green-400/30 hover:bg-green-600 backdrop-blur-md"
            >
                <div className="font-mono font-bold text-white text-[12px]">
                    {Math.round(fps)} FPS
                </div>
            </div>
        );
    }

    // Expanded State (Right Side Panel)
    return (
        <div
            onClick={toggleMinimized}
            className="fixed top-0 bottom-0 right-0 w-56 bg-black/85 backdrop-blur-md border-l border-white/10 shadow-2xl z-[9999] font-mono text-[11px] text-green-400 pointer-events-auto cursor-pointer hover:border-green-500/20 transition-all flex flex-col overflow-hidden"
        >
            {/* Static top section — never scrolls */}
            <div className="p-3 shrink-0 space-y-2">
                <div className="flex justify-between items-center mb-2 border-b border-white/10 pb-1">
                    <span className="font-bold text-white uppercase tracking-wider">Debug Monitor</span>
                    <span className="bg-green-500 text-black px-1 rounded font-bold">{Math.round(fps)} FPS</span>
                </div>

                <div className="flex items-center justify-between">
                    <div className="text-white/40 uppercase text-[10px] shrink-0 mr-2">Player</div>
                    <span className="text-white tabular-nums">
                        {debugInfo?.coords?.x?.toFixed(1) ?? '0.0'}, {debugInfo?.camera?.y?.toFixed(1) ?? '0.0'}
                    </span>
                </div>

                <div className="flex items-center justify-between">
                    <div className="text-white/40 uppercase text-[10px] shrink-0 mr-2">Camera</div>
                    <span className="text-white tabular-nums">
                        {debugInfo?.camera?.x?.toFixed(1) ?? '0.0'}, {debugInfo?.camera?.z?.toFixed(1) ?? '0.0'}, {debugInfo?.camera?.y?.toFixed(1) ?? '0.0'}
                    </span>
                </div>

                <div>
                    <div className="text-white/40 uppercase text-[10px] mb-0.5">Renderer</div>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                        <div>Calls: <span className="text-white">{rendererStats.drawCalls}</span></div>
                        <div>Tris: <span className="text-white">{(rendererStats.triangles / 1000).toFixed(1)}k</span></div>
                        <div>Shaders: <span className="text-white">{rendererStats.shaderPrograms}</span></div>
                        <div>Recomp: <span className={rendererStats.shaderRecompiles > 0 ? 'text-yellow-400 font-bold' : 'text-white'}>{rendererStats.shaderRecompiles}</span></div>
                        <div>Tex: <span className="text-white">{rendererStats.textures}</span></div>
                        <div>Geo: <span className="text-white">{rendererStats.geometries}</span></div>
                    </div>
                    {/* GC row — always visible; yellow lingers 2 s after detection */}
                    <div className="mt-1 flex items-center justify-between">
                        <span className="text-white/40">GC</span>
                        <span className={(performance.now() - gcLastDetectedAt) < 2000 ? 'text-yellow-400 font-bold' : 'text-white/20'}>
                            {(performance.now() - gcLastDetectedAt) < 2000 ? `⚠️ ~${gcLastDropMB.toFixed(1)}MB freed` : '—'}
                        </span>
                    </div>
                </div>

                {gcInfo.heapUsedMB > 0 && (
                    <div>
                        <div className="text-white/40 uppercase text-[10px] mb-0.5">World / Memory</div>
                        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                            <div>Enemies: <span className="text-white">{debugInfo?.enemies ?? 0}</span></div>
                            <div>Obj: <span className="text-white">{debugInfo?.objects ?? 0}</span></div>
                            <div>Heap: <span className="text-white">{gcInfo.heapUsedMB}MB</span></div>
                            <div className="text-white/40">/ {gcInfo.heapLimitMB}MB</div>
                        </div>
                    </div>
                )}

                {systems && systems.length > 0 && (
                    <div>
                        <div
                            onClick={(e) => { e.stopPropagation(); setSystemsExpanded(v => !v); }}
                            className="flex items-center justify-between text-white/40 uppercase text-[10px] mb-0.5 cursor-pointer hover:text-white/70 select-none"
                        >
                            <span>Systems</span>
                            <span className="text-[8px]">{systemsExpanded ? '▾' : '▸'}</span>
                        </div>
                        {systemsExpanded && (
                            <div className="space-y-0.5">
                                {systems.map(sys => {
                                    const timing = debugInfo?.performance?.cpu?.[sys.id];
                                    return (
                                        <div
                                            key={sys.id}
                                            onClick={(e) => { e.stopPropagation(); onToggleSystem?.(sys.id, !sys.enabled); }}
                                            className={`flex justify-between border-b border-white/5 py-0.5 cursor-pointer hover:bg-white/5 px-1 rounded ${sys.enabled ? 'text-green-400' : 'text-red-400/60'}`}
                                        >
                                            <span className="truncate mr-2">{sys.id}</span>
                                            <span className="text-white/40">{timing !== undefined ? `${timing.toFixed(2)}ms` : '–'}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                <div className="border-t border-white/10 pt-1">
                    <div
                        onClick={(e) => { e.stopPropagation(); setConsoleLogging(!consoleLogging); }}
                        className="flex justify-between items-center cursor-pointer hover:bg-white/5 p-1 rounded transition-colors"
                    >
                        <span className="text-white/60">Console Logging</span>
                        <span className={`font-bold ${consoleLogging ? 'text-green-400' : 'text-red-400'}`}>
                            {consoleLogging ? 'ON' : 'OFF'}
                        </span>
                    </div>
                </div>
            </div>

            {/* CPU Timings — pinned at bottom, fills remaining height, inner list scrolls */}
            {debugInfo?.performance?.cpu && (
                <div className="flex flex-col flex-1 min-h-0 border-t border-white/10 p-3">
                    <div className="text-white/40 uppercase text-[10px] mb-1 shrink-0">CPU Timings</div>
                    <div className="overflow-y-auto flex-1 space-y-0.5 pr-1">
                        {Object.entries(debugInfo.performance.cpu).map(([key, val]) => (
                            <div key={key} className="flex justify-between border-b border-white/5 py-0.5">
                                <span className="text-white/60 truncate mr-2">{key.replace('render_', '')}</span>
                                <span>{(val as number).toFixed(2)}ms</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default DebugDisplay;