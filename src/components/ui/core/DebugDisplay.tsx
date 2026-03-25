import React, { useState, useEffect } from 'react';
import { PerformanceMonitor } from '../../../systems/PerformanceMonitor';
import { WinterEngine } from '../../../core/engine/WinterEngine';

interface DebugDisplayProps {
    debugMode: boolean;
}

const DebugDisplay: React.FC<DebugDisplayProps> = React.memo(({ debugMode }) => {
    const [isMinimized, setIsMinimized] = useState(() => localStorage.getItem('vinterdod_debug_minimized') === 'true');
    const [systemsExpanded, setSystemsExpanded] = useState(true);
    const [showLogs, setShowLogs] = useState(false);

    // VINTERDÖD OPTIMIZATION: Endast en "tick" för att trigga re-render.
    // Inga tunga objekt allokeras i minnet var 250:e ms.
    const [, setTick] = useState(0);

    useEffect(() => {
        if (!debugMode) return;
        const interval = setInterval(() => {
            setTick(t => t + 1); // Tvinga React att läsa färsk data direkt från cachen
        }, 250);
        return () => clearInterval(interval);
    }, [debugMode]);

    const toggleMinimized = (e: React.MouseEvent) => {
        e.stopPropagation();
        const next = !isMinimized;
        setIsMinimized(next);
        localStorage.setItem('vinterdod_debug_minimized', String(next));
    };

    if (!debugMode) return null;

    // --- ZERO-GC READS ---
    // Läser referenser till pre-allokerade objekt i din monitor, skapar noll garbage.
    const monitor = PerformanceMonitor.getInstance();
    const engine = WinterEngine.getInstance();
    const fps = Math.round(monitor.getFps());

    if (isMinimized) {
        return (
            <div
                onClick={toggleMinimized}
                className="fixed top-0 right-0 z-[9998] bg-black/40 text-white/50 px-2 py-0.5 font-mono text-[12px] select-none backdrop-blur-[2px] border border-white/5 rounded-sm cursor-pointer pointer-events-auto">
                <div className="font-mono font-bold text-white text-[12px]">
                    {fps} FPS
                </div>
            </div>
        );
    }

    // Hämtar data direkt i render-fasen
    const world = monitor.getFormattedGameState();
    const render = monitor.getFormattedRendererStats();
    const gc = monitor.getFormattedGcInfo();
    const timings = monitor.getFormattedTimings();
    const systems = engine ? engine.getSystems() : [];
    const logs = showLogs ? monitor.getLogs() : [];

    return (
        <>
            {/* HUVUDPANELEN */}
            <div onClick={toggleMinimized} className="fixed top-0 bottom-0 right-0 w-56 bg-black/75 border-l border-white/10 shadow-2xl z-[9998] font-mono text-[11px] text-green-400 pointer-events-auto cursor-pointer hover:border-green-500/20 transition-all flex flex-col overflow-hidden">
                <div className="p-3 shrink-0 space-y-2">
                    <div className="flex justify-between items-center mb-2 border-b border-white/10 pb-1">
                        <span className="font-bold text-white uppercase tracking-wider">Debug Monitor</span>
                        <span className="bg-green-500 text-black px-1 rounded font-bold">{fps} FPS</span>
                    </div>

                    <>
                        <div className="flex items-center justify-between">
                            <div className="text-white/40 uppercase text-[10px] shrink-0 mr-2">Player</div>
                            <span className="text-white tabular-nums">
                                X: {world.playerX}, Z: {world.playerZ}
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="text-white/40 uppercase text-[10px] shrink-0 mr-2">Camera</div>
                            <span className="text-white tabular-nums text-[10px]">
                                {world.camX}, {world.camY}, {world.camZ}
                            </span>
                        </div>
                    </>

                    <div>
                        <div className="text-white/40 uppercase text-[10px] mb-0.5">Renderer</div>
                        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                            <div>Calls: <span className="text-white">{render.drawCalls}</span></div>
                            <div>Tris: <span className="text-white">{render.triangles}</span></div>
                            <div>Shaders: <span className="text-white">{render.shaderPrograms}</span></div>
                            <div>Recomp: <span className={render.shaderRecompiles > 0 ? 'text-yellow-400 font-bold' : 'text-white'}>{render.shaderRecompiles}</span></div>
                            <div>Tex: <span className="text-white">{render.textures}</span></div>
                            <div>Geo: <span className="text-white">{render.geometries}</span></div>
                        </div>
                    </div>

                    <div className="mt-1 flex items-center justify-between">
                        <span className="text-white/40">GC</span>
                        <span className={gc.timeSinceDetection < 2000 ? 'text-yellow-400 font-bold' : 'text-white/20'}>
                            {gc.timeSinceDetection < 2000 ? `⚠️ ~${gc.droppedMB}MB freed` : '—'}
                        </span>
                    </div>

                    {parseFloat(String(gc.heapUsedMB)) > 0 && (
                        <div>
                            <div className="text-white/40 uppercase text-[10px] mb-0.5">World / Memory</div>
                            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                                <div>Enemies: <span className="text-white">{world.enemies}</span></div>
                                <div>Obj: <span className="text-white">{world.objects}</span></div>
                                <div>Heap: <span className="text-white">{gc.heapUsedMB}MB</span></div>
                                <div className="text-white/40">/ {gc.heapLimitMB}MB</div>
                            </div>
                        </div>
                    )}

                    {systems && systems.length > 0 && (
                        <div>
                            <div onClick={(e) => { e.stopPropagation(); setSystemsExpanded(v => !v); }} className="flex items-center justify-between text-white/40 uppercase text-[10px] mb-0.5 cursor-pointer hover:text-white/70 select-none">
                                <span>Systems</span>
                                <span className="text-[8px]">{systemsExpanded ? '▾' : '▸'}</span>
                            </div>
                            {systemsExpanded && (
                                <div className="space-y-0.5">
                                    {systems.map(sys => {
                                        const timing = timings.breakdown[sys.id];
                                        return (
                                            <div key={sys.id} onClick={(e) => { e.stopPropagation(); engine?.setSystemEnabled(sys.id, !sys.enabled); }} className={`flex justify-between border-b border-white/5 py-0.5 cursor-pointer hover:bg-white/5 px-1 rounded ${sys.enabled ? 'text-green-400' : 'text-red-400/60'}`}>
                                                <span className="truncate mr-2">{sys.id}</span>
                                                <span className="text-white/40">{timing !== undefined ? `${timing}ms` : '–'}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="border-t border-white/10 pt-1 space-y-0.5">
                        <div className="flex justify-between items-center mb-1">
                            <div className="text-white/40 uppercase text-[10px]">Logging</div>
                            <div className="flex gap-1">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        monitor.logsHijackEnabled = !monitor.logsHijackEnabled;
                                        if (monitor.logsHijackEnabled) setShowLogs(true);
                                    }}
                                    className={`px-2 py-0.5 rounded transition-colors font-bold tracking-wider ${monitor.logsHijackEnabled ? 'bg-blue-500 text-white' : 'bg-white/10 text-white/40 hover:bg-white/20'}`}
                                >
                                    HIJACK
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setShowLogs(v => !v); }}
                                    className={`px-2 py-0.5 rounded transition-colors font-bold tracking-wider ${showLogs ? 'bg-green-500 text-black' : 'bg-white/10 text-white/40 hover:bg-white/20'}`}
                                >
                                    LOG
                                </button>
                                <button
                                    disabled={monitor.isRecordingActive}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        monitor.startRecording();
                                    }}
                                    className={`px-2 py-0.5 rounded transition-colors font-bold tracking-wider ${monitor.isRecordingActive
                                        ? 'bg-gray-500/20 text-gray-400 cursor-not-allowed animate-pulse'
                                        : 'bg-red-500/20 text-red-300 hover:bg-red-500/40 cursor-pointer'
                                        }`}
                                >
                                    {monitor.isRecordingActive ? 'REC' : 'REC'}
                                </button>
                            </div>
                        </div>
                        <div onClick={(e) => { e.stopPropagation(); monitor.consoleLoggingEnabled = !monitor.consoleLoggingEnabled; }} className="flex justify-between items-center cursor-pointer hover:bg-white/5 p-1 rounded transition-colors">
                            <span className="text-white/60">Engine Perf</span>
                            <span className={`font-bold ${monitor.consoleLoggingEnabled ? 'text-green-400' : 'text-red-400'}`}>{monitor.consoleLoggingEnabled ? 'ON' : 'OFF'}</span>
                        </div>
                        <div onClick={(e) => { e.stopPropagation(); monitor.aiLoggingEnabled = !monitor.aiLoggingEnabled; }} className="flex justify-between items-center cursor-pointer hover:bg-white/5 p-1 rounded transition-colors">
                            <span className="text-white/60">AI</span>
                            <span className={`font-bold ${monitor.aiLoggingEnabled ? 'text-green-400' : 'text-red-400'}`}>{monitor.aiLoggingEnabled ? 'ON' : 'OFF'}</span>
                        </div>
                        <div onClick={(e) => { e.stopPropagation(); monitor.shaderLoggingEnabled = !monitor.shaderLoggingEnabled; }} className="flex justify-between items-center cursor-pointer hover:bg-white/5 p-1 rounded transition-colors">
                            <span className="text-white/60">Shaders</span>
                            <span className={`font-bold ${monitor.shaderLoggingEnabled ? 'text-green-400' : 'text-red-400'}`}>{monitor.shaderLoggingEnabled ? 'ON' : 'OFF'}</span>
                        </div>
                    </div>
                </div>

                {timings && (
                    <div className="flex flex-col flex-1 min-h-0 border-t border-white/10 p-3">
                        <div className="flex justify-between items-center mb-1 shrink-0">
                            <div className="text-white/40 uppercase text-[10px]">CPU Timings</div>
                            <div className="text-green-400 text-[10px] font-bold">
                                {timings.total}ms
                            </div>
                        </div>
                        <div className="overflow-y-auto flex-1 space-y-0.5 pr-1">
                            {Object.entries(timings.breakdown).map(([key, val]) => (
                                <div key={key} className="flex justify-between border-b border-white/5 py-0.5">
                                    <span className="text-white/60 truncate mr-2">{key.replace('render_', '')}</span>
                                    <span>{val}ms</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* STANDALONE LOG WINDOW */}
            {showLogs && (
                <div className="fixed inset-0 z-[99999] bg-black/95 flex flex-col pointer-events-auto backdrop-blur-md pb-safe">
                    <div className="flex justify-between items-center bg-white/10 p-3 border-b border-white/20 shadow-lg shrink-0 pt-safe">
                        <span className="text-white font-bold tracking-widest uppercase text-xs">System Logs</span>
                        <div className="flex gap-2">
                            <button onClick={() => monitor.clearLogs()} className="px-3 py-1 font-bold text-red-300 bg-red-500/20 hover:bg-red-500/40 rounded transition-colors">CLEAR</button>
                            <button onClick={() => setShowLogs(false)} className="px-3 py-1 font-bold text-white bg-white/20 hover:bg-white/30 rounded transition-colors">CLOSE</button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 font-mono text-[11px] space-y-2 break-words">
                        {logs.length > 0 ? (
                            logs.map((l: any, i: number) => (
                                <div key={i} className="border-b border-white/5 pb-1 last:border-0" style={{ color: l.color }}>
                                    <span className="opacity-50 mr-2 text-[9px]">[{new Date(l.time).toISOString().split('T')[1].split('Z')[0]}]</span>
                                    {l.msg}
                                </div>
                            ))
                        ) : (
                            <div className="text-white/20 italic text-center py-20 uppercase tracking-widest text-sm">No logs captured...</div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
});

export default DebugDisplay;