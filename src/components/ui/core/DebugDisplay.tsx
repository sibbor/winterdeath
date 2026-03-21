import React, { useState, useEffect } from 'react';
import { PerformanceMonitor } from '../../../systems/PerformanceMonitor';

interface DebugDisplayProps {
    debugMode: boolean;
    systems?: { id: string; enabled: boolean }[];
    onToggleSystem?: (id: string, enabled: boolean) => void;
}

const DebugDisplay: React.FC<DebugDisplayProps> = ({ debugMode, systems, onToggleSystem }) => {
    const [isMinimized, setIsMinimized] = useState(() => localStorage.getItem('vinterdod_debug_minimized') === 'true');
    const [systemsExpanded, setSystemsExpanded] = useState(true);

    // En enda state-box för all formaterad data (uppdateras 15 ggr/sek)
    const [stats, setStats] = useState<any>(null);

    useEffect(() => {
        if (!debugMode) return;

        const monitor = PerformanceMonitor.getInstance();

        // 66ms = ~15 uppdateringar per sekund. "Realtid" för ögat, men skonsamt för React.
        const interval = setInterval(() => {
            setStats({
                fps: Math.round(monitor.getFps()),
                gameState: monitor.getFormattedGameState(),
                renderer: monitor.getFormattedRendererStats(),
                gc: monitor.getFormattedGcInfo(),
                timings: monitor.getFormattedTimings(),
                logging: {
                    engine: monitor.consoleLoggingEnabled,
                    ai: monitor.aiLoggingEnabled,
                    shader: monitor.shaderLoggingEnabled
                }
            });
        }, 66);

        return () => clearInterval(interval);
    }, [debugMode]);

    const toggleMinimized = (e: React.MouseEvent) => {
        e.stopPropagation();
        const next = !isMinimized;
        setIsMinimized(next);
        localStorage.setItem('vinterdod_debug_minimized', String(next));
    };

    // Mode: OFF
    if (!debugMode) {
        return (
            <div className="fixed top-0 right-0 z-[9998] bg-black/40 text-white/50 px-2 py-0.5 font-mono text-[12px] pointer-events-none select-none backdrop-blur-[2px] border border-white/5 rounded-sm">
                {stats?.fps ?? 0} FPS
            </div>
        );
    }

    // Minimized State
    if (isMinimized) {
        return (
            <div onClick={toggleMinimized} className="fixed top-0 right-0 z-[9998] bg-black/40 px-2 py-0.5 cursor-pointer shadow-xl pointer-events-auto border border-green-400/30 hover:bg-green-600 backdrop-blur-md">
                <div className="font-mono font-bold text-white text-[12px]">{stats?.fps ?? 0} FPS</div>
            </div>
        );
    }

    if (!stats) return null; // Väntar på första ticken

    // Expanded State
    return (
        <div onClick={toggleMinimized} className="fixed top-0 bottom-0 right-0 w-56 bg-black/85 backdrop-blur-md border-l border-white/10 shadow-2xl z-[9998] font-mono text-[11px] text-green-400 pointer-events-auto cursor-pointer hover:border-green-500/20 transition-all flex flex-col overflow-hidden">
            <div className="p-3 shrink-0 space-y-2">
                <div className="flex justify-between items-center mb-2 border-b border-white/10 pb-1">
                    <span className="font-bold text-white uppercase tracking-wider">Debug Monitor</span>
                    <span className="bg-green-500 text-black px-1 rounded font-bold">{stats.fps} FPS</span>
                </div>

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
                    <div className="mt-1 flex items-center justify-between">
                        <span className="text-white/40">GC</span>
                        <span className={stats.gc.timeSinceDetection < 2000 ? 'text-yellow-400 font-bold' : 'text-white/20'}>
                            {stats.gc.timeSinceDetection < 2000 ? `⚠️ ~${stats.gc.droppedMB}MB freed` : '—'}
                        </span>
                    </div>
                </div>

                {parseFloat(stats.gc.heapUsedMB) > 0 && (
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

                {systems && systems.length > 0 && (
                    <div>
                        <div onClick={(e) => { e.stopPropagation(); setSystemsExpanded(v => !v); }} className="flex items-center justify-between text-white/40 uppercase text-[10px] mb-0.5 cursor-pointer hover:text-white/70 select-none">
                            <span>Systems</span>
                            <span className="text-[8px]">{systemsExpanded ? '▾' : '▸'}</span>
                        </div>
                        {systemsExpanded && (
                            <div className="space-y-0.5">
                                {systems.map(sys => {
                                    const timing = stats.timings.breakdown[sys.id];
                                    return (
                                        <div key={sys.id} onClick={(e) => { e.stopPropagation(); onToggleSystem?.(sys.id, !sys.enabled); }} className={`flex justify-between border-b border-white/5 py-0.5 cursor-pointer hover:bg-white/5 px-1 rounded ${sys.enabled ? 'text-green-400' : 'text-red-400/60'}`}>
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
                    <div className="text-white/40 uppercase text-[10px] mb-1">Logging</div>
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
            </div>

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
        </div>
    );
};

export default DebugDisplay;