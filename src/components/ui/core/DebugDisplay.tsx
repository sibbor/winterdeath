import React, { useState, useEffect } from 'react';
import { PerformanceMonitor } from '../../../systems/PerformanceMonitor';
import { WinterEngine } from '../../../core/engine/WinterEngine';

interface DebugDisplayProps {
    debugMode: boolean;
}

const DebugDisplay: React.FC<DebugDisplayProps> = React.memo(({ debugMode }) => {
    const [isMinimized, setIsMinimized] = useState(() => localStorage.getItem('vinterdod_debug_minimized') === 'true');
    const [systemsExpanded, setSystemsExpanded] = useState(true);

    const [stats, setStats] = useState<any>(null);
    const [systems, setSystems] = useState<any[]>([]);

    useEffect(() => {
        const monitor = PerformanceMonitor.getInstance();

        // 250ms är tillräckligt snabbt för att kännas live, 
        // men sparar massivt med GC-arbete jämfört med 100ms.
        const interval = setInterval(() => {
            const engine = WinterEngine.getInstance();

            if (!debugMode) return; // Gör inget om debug är helt av

            if (isMinimized) {
                // LIGHTWEIGHT MODE: Endast FPS (nästan ingen GC)
                setStats({
                    fps: Math.round(monitor.getFps())
                });
            } else {
                // FULL MODE: Hämta all formaterad data
                setStats({
                    fps: Math.round(monitor.getFps()),
                    gameState: monitor.getFormattedGameState(),
                    renderer: monitor.getFormattedRendererStats(),
                    gc: monitor.getFormattedGcInfo(),
                    timings: monitor.getFormattedTimings(),
                    recordingState: monitor.isRecordingActive,
                    logging: {
                        engine: monitor.consoleLoggingEnabled,
                        ai: monitor.aiLoggingEnabled,
                        shader: monitor.shaderLoggingEnabled
                    }
                });
                setSystems(engine.getSystems());
            }
        }, 250);

        return () => clearInterval(interval);
    }, [debugMode, isMinimized]);

    const toggleMinimized = (e: React.MouseEvent) => {
        e.stopPropagation();
        const next = !isMinimized;
        setIsMinimized(next);
        localStorage.setItem('vinterdod_debug_minimized', String(next));
    };

    // Show FPS meter in the top-right
    if (!debugMode || (debugMode && isMinimized)) {
        return (
            <div
                onClick={debugMode ? toggleMinimized : undefined}
                className={`fixed top-0 right-0 z-[9998] bg-black/40 text-white/50 px-2 py-0.5 font-mono text-[12px] select-none backdrop-blur-[2px] border border-white/5 rounded-sm ${debugMode ? 'cursor-pointer pointer-events-auto' : 'pointer-events-none'}`}>
                <div className="font-mono font-bold text-white text-[12px]">
                    {stats?.fps ?? 0} FPS
                </div>
            </div>
        );
    }

    if (!stats || !debugMode) return null;

    // Expanded State
    return (
        <div onClick={toggleMinimized} className="fixed top-0 bottom-0 right-0 w-56 bg-black/85 backdrop-blur-md border-l border-white/10 shadow-2xl z-[9998] font-mono text-[11px] text-green-400 pointer-events-auto cursor-pointer hover:border-green-500/20 transition-all flex flex-col overflow-hidden">
            <div className="p-3 shrink-0 space-y-2">
                <div className="flex justify-between items-center mb-2 border-b border-white/10 pb-1">
                    <span className="font-bold text-white uppercase tracking-wider">Debug Monitor</span>
                    <span className="bg-green-500 text-black px-1 rounded font-bold">{stats.fps ?? 0} FPS</span>
                </div>

                {stats.gameState && (
                    <>
                        <div className="flex items-center justify-between">
                            <div className="text-white/40 uppercase text-[10px] shrink-0 mr-2">Player</div>
                            <span className="text-white tabular-nums">
                                X: {stats.gameState.playerX}, Z: {stats.gameState.playerZ}
                            </span>
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="text-white/40 uppercase text-[10px] shrink-0 mr-2">Camera</div>
                            <span className="text-white tabular-nums text-[10px]">
                                {stats.gameState.camX}, {stats.gameState.camY}, {stats.gameState.camZ}
                            </span>
                        </div>
                    </>
                )}

                {stats.renderer && (
                    <div>
                        <div className="text-white/40 uppercase text-[10px] mb-0.5">Renderer</div>
                        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                            <div>Calls: <span className="text-white">{stats.renderer.drawCalls}</span></div>
                            <div>Tris: <span className="text-white">{stats.renderer.triangles}</span></div>
                            <div>Shaders: <span className="text-white">{stats.renderer.shaderPrograms}</span></div>
                            <div>Recomp: <span className={stats.renderer.shaderRecompiles > 0 ? 'text-yellow-400 font-bold' : 'text-white'}>{stats.renderer.shaderRecompiles}</span></div>
                            <div>Tex: <span className="text-white">{stats.renderer.textures}</span></div>
                            <div>Geo: <span className="text-white">{stats.renderer.geometries}</span></div>
                        </div>
                    </div>
                )}

                {stats.gc && (
                    <div className="mt-1 flex items-center justify-between">
                        <span className="text-white/40">GC</span>
                        <span className={stats.gc.timeSinceDetection < 2000 ? 'text-yellow-400 font-bold' : 'text-white/20'}>
                            {stats.gc.timeSinceDetection < 2000 ? `⚠️ ~${stats.gc.droppedMB}MB freed` : '—'}
                        </span>
                    </div>
                )}

                {stats.gc?.heapUsedMB && parseFloat(stats.gc.heapUsedMB) > 0 && stats.gameState && (
                    <div>
                        <div className="text-white/40 uppercase text-[10px] mb-0.5">World / Memory</div>
                        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                            <div>Enemies: <span className="text-white">{stats.gameState.enemies}</span></div>
                            <div>Obj: <span className="text-white">{stats.gameState.objects}</span></div>
                            <div>Heap: <span className="text-white">{stats.gc.heapUsedMB}MB</span></div>
                            <div className="text-white/40">/ {stats.gc.heapLimitMB}MB</div>
                        </div>
                    </div>
                )}

                {systems && systems.length > 0 && stats.timings && (
                    <div>
                        <div onClick={(e) => { e.stopPropagation(); setSystemsExpanded(v => !v); }} className="flex items-center justify-between text-white/40 uppercase text-[10px] mb-0.5 cursor-pointer hover:text-white/70 select-none">
                            <span>Systems</span>
                            <span className="text-[8px]">{systemsExpanded ? '▾' : '▸'}</span>
                        </div>
                        {systemsExpanded && (
                            <div className="space-y-0.5">
                                {systems.map(sys => {
                                    const timing = stats.timings?.breakdown?.[sys.id];
                                    return (
                                        <div key={sys.id} onClick={(e) => { e.stopPropagation(); WinterEngine.getInstance().setSystemEnabled(sys.id, !sys.enabled); }} className={`flex justify-between border-b border-white/5 py-0.5 cursor-pointer hover:bg-white/5 px-1 rounded ${sys.enabled ? 'text-green-400' : 'text-red-400/60'}`}>
                                            <span className="truncate mr-2">{sys.id}</span>
                                            <span className="text-white/40">{timing !== undefined ? `${timing}ms` : '–'}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {stats.logging && (
                    <div className="border-t border-white/10 pt-1 space-y-0.5">
                        <div className="flex justify-between items-center mb-1">
                            <div className="text-white/40 uppercase text-[10px]">Logging</div>
                            <button
                                disabled={stats.recordingState}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    PerformanceMonitor.getInstance().startRecording();
                                }}
                                className={`px-2 py-0.5 rounded transition-colors font-bold tracking-wider ${stats.recordingState
                                    ? 'bg-gray-500/20 text-gray-400 cursor-not-allowed animate-pulse'
                                    : 'bg-red-500/20 text-red-300 hover:bg-red-500/40 cursor-pointer'
                                    }`}
                            >
                                {stats.recordingState ? 'RECORDING...' : 'RECORD'}
                            </button>
                        </div>
                        <div onClick={(e) => { e.stopPropagation(); PerformanceMonitor.getInstance().consoleLoggingEnabled = !stats.logging.engine; }} className="flex justify-between items-center cursor-pointer hover:bg-white/5 p-1 rounded transition-colors">
                            <span className="text-white/60">Engine Perf</span>
                            <span className={`font-bold ${stats.logging.engine ? 'text-green-400' : 'text-red-400'}`}>{stats.logging.engine ? 'ON' : 'OFF'}</span>
                        </div>
                        <div onClick={(e) => { e.stopPropagation(); PerformanceMonitor.getInstance().aiLoggingEnabled = !stats.logging.ai; }} className="flex justify-between items-center cursor-pointer hover:bg-white/5 p-1 rounded transition-colors">
                            <span className="text-white/60">AI</span>
                            <span className={`font-bold ${stats.logging.ai ? 'text-green-400' : 'text-red-400'}`}>{stats.logging.ai ? 'ON' : 'OFF'}</span>
                        </div>
                        <div onClick={(e) => { e.stopPropagation(); PerformanceMonitor.getInstance().shaderLoggingEnabled = !stats.logging.shader; }} className="flex justify-between items-center cursor-pointer hover:bg-white/5 p-1 rounded transition-colors">
                            <span className="text-white/60">Shaders</span>
                            <span className={`font-bold ${stats.logging.shader ? 'text-green-400' : 'text-red-400'}`}>{stats.logging.shader ? 'ON' : 'OFF'}</span>
                        </div>
                    </div>
                )}
            </div>

            {stats.timings && (
                <div className="flex flex-col flex-1 min-h-0 border-t border-white/10 p-3">
                    <div className="flex justify-between items-center mb-1 shrink-0">
                        <div className="text-white/40 uppercase text-[10px]">CPU Timings</div>
                        <div className="text-green-400 text-[10px] font-bold">
                            {stats.timings.total}ms
                        </div>
                    </div>
                    <div className="overflow-y-auto flex-1 space-y-0.5 pr-1">
                        {Object.entries(stats.timings.breakdown).map(([key, val]) => (
                            <div key={key} className="flex justify-between border-b border-white/5 py-0.5">
                                <span className="text-white/60 truncate mr-2">{key.replace('render_', '')}</span>
                                <span>{val as string}ms</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
});

export default DebugDisplay;