import React, { useState, useEffect, useRef } from 'react';
import { PerformanceMonitor } from '../../../systems/PerformanceMonitor';
import { WinterEngine } from '../../../core/engine/WinterEngine';
import { HudStore } from '../../../store/HudStore';
import { SystemID } from '../../../systems/SystemID';

interface DebugDisplayProps {
    debugMode: boolean;
}

const DebugDisplay: React.FC<DebugDisplayProps> = React.memo(({ debugMode }) => {
    const [isMinimized, setIsMinimized] = useState(() => localStorage.getItem('vinterdod_debug_minimized') === 'true');
    const [systemsExpanded, setSystemsExpanded] = useState(true);
    const [showLogs, setShowLogs] = useState(false);
    const [tick, setTick] = useState(0);
    const forceUpdate = () => setTick(t => t + 1);

    // --- HIGH-FREQUENCY REFS ---
    const fpsRef = useRef<HTMLSpanElement>(null);
    const playerXRef = useRef<HTMLSpanElement>(null);
    const playerZRef = useRef<HTMLSpanElement>(null);
    const camXRef = useRef<HTMLSpanElement>(null);
    const camYRef = useRef<HTMLSpanElement>(null);
    const camZRef = useRef<HTMLSpanElement>(null);
    
    // Renderer Stats Refs
    const drawCallsRef = useRef<HTMLSpanElement>(null);
    const trisRef = useRef<HTMLSpanElement>(null);
    const shadersRef = useRef<HTMLSpanElement>(null);
    const recompRef = useRef<HTMLSpanElement>(null);
    const texRef = useRef<HTMLSpanElement>(null);
    const geoRef = useRef<HTMLSpanElement>(null);
    
    // World/Mem Refs
    const enemiesRef = useRef<HTMLSpanElement>(null);
    const objectsRef = useRef<HTMLSpanElement>(null);
    const heapRef = useRef<HTMLSpanElement>(null);
    const heapLimitRef = useRef<HTMLSpanElement>(null);
    const gcAlertRef = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        if (!debugMode) return;
        
        const monitor = PerformanceMonitor.getInstance();
        let lastUpdate = 0;

        return HudStore.subscribe(() => {
            const now = performance.now();
            
            // 1. High-frequency updates (every frame for smoothness where possible, or just link to loop)
            if (fpsRef.current) fpsRef.current.innerText = Math.round(monitor.getFps()).toString();
            
            // 2. Throttled updates (4 times per second to prevent visual noise)
            if (now - lastUpdate < 250) return;
            lastUpdate = now;

            const world = monitor.getFormattedGameState();
            const render = monitor.getFormattedRendererStats();
            const gc = monitor.getFormattedGcInfo();

            if (playerXRef.current) playerXRef.current.innerText = world.playerX.toString();
            if (playerZRef.current) playerZRef.current.innerText = world.playerZ.toString();
            if (camXRef.current) camXRef.current.innerText = world.camX.toString();
            if (camYRef.current) camYRef.current.innerText = world.camY.toString();
            if (camZRef.current) camZRef.current.innerText = world.camZ.toString();

            if (drawCallsRef.current) drawCallsRef.current.innerText = render.drawCalls.toString();
            if (trisRef.current) trisRef.current.innerText = render.triangles.toString();
            if (shadersRef.current) shadersRef.current.innerText = render.shaderPrograms.toString();
            if (recompRef.current) {
                recompRef.current.innerText = render.shaderRecompiles.toString();
                recompRef.current.className = render.shaderRecompiles > 0 ? 'text-yellow-400 font-bold' : 'text-white';
            }
            if (texRef.current) texRef.current.innerText = render.textures.toString();
            if (geoRef.current) geoRef.current.innerText = render.geometries.toString();

            if (enemiesRef.current) enemiesRef.current.innerText = world.enemies.toString();
            if (objectsRef.current) objectsRef.current.innerText = world.objects.toString();
            
            if (heapRef.current) heapRef.current.innerText = gc.heapUsedMB.toString();
            if (heapLimitRef.current) heapLimitRef.current.innerText = `/ ${gc.heapLimitMB}MB`;

            if (gcAlertRef.current) {
                const recentGC = gc.timeSinceDetection < 2000;
                gcAlertRef.current.innerText = recentGC ? `⚠️ ~${gc.droppedMB}MB freed` : '—';
                gcAlertRef.current.className = recentGC ? 'text-yellow-400 font-bold' : 'text-white/20';
            }
        });
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
                    <span ref={fpsRef}>0</span> FPS
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
                        <span className="bg-green-500 text-black px-1 rounded font-bold"><span ref={fpsRef}>0</span> FPS</span>
                    </div>

                    <>
                        <div className="flex items-center justify-between">
                            <div className="text-white/40 uppercase text-[10px] shrink-0 mr-2">Player</div>
                            <span className="text-white tabular-nums">
                                X: <span ref={playerXRef}>0</span>, Z: <span ref={playerZRef}>0</span>
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="text-white/40 uppercase text-[10px] shrink-0 mr-2">Camera</div>
                            <span className="text-white tabular-nums text-[10px]">
                                <span ref={camXRef}>0</span>, <span ref={camYRef}>0</span>, <span ref={camZRef}>0</span>
                            </span>
                        </div>
                    </>

                    <div>
                        <div className="text-white/40 uppercase text-[10px] mb-0.5">Renderer</div>
                        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                            <div>Calls: <span ref={drawCallsRef} className="text-white">0</span></div>
                            <div>Tris: <span ref={trisRef} className="text-white">0</span></div>
                            <div>Shaders: <span ref={shadersRef} className="text-white">0</span></div>
                            <div>Recomp: <span ref={recompRef} className="text-white">0</span></div>
                            <div>Tex: <span ref={texRef} className="text-white">0</span></div>
                            <div>Geo: <span ref={geoRef} className="text-white">0</span></div>
                        </div>
                    </div>

                    <div className="mt-1 flex items-center justify-between">
                        <span className="text-white/40">GC</span>
                        <span ref={gcAlertRef} className="text-white/20">—</span>
                    </div>

                    {parseFloat(String(gc.heapUsedMB)) > 0 && (
                        <div>
                            <div className="text-white/40 uppercase text-[10px] mb-0.5">World / Memory</div>
                            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                                <div>Enemies: <span ref={enemiesRef} className="text-white">0</span></div>
                                <div>Obj: <span ref={objectsRef} className="text-white">0</span></div>
                                <div>Heap: <span ref={heapRef} className="text-white">0</span>MB</div>
                                <div ref={heapLimitRef} className="text-white/40">/ 0MB</div>
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
                                        const timing = timings.breakdown[sys.systemId];
                                        return (
                                            <div key={sys.systemId} onClick={(e) => { e.stopPropagation(); engine?.setSystemEnabled(sys.systemId as SystemID, !sys.enabled); forceUpdate(); }} className={`flex justify-between border-b border-white/5 py-0.5 cursor-pointer hover:bg-white/5 px-1 rounded ${sys.enabled ? 'text-green-400' : 'text-red-400/60'}`}>
                                                <span className="truncate mr-2">{SystemID[sys.systemId] || `SYS_${sys.systemId}`}</span>
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
                                        forceUpdate();
                                    }}
                                    className={`px-2 py-0.5 rounded transition-colors font-bold tracking-wider ${monitor.logsHijackEnabled ? 'bg-blue-500 text-white' : 'bg-white/10 text-white/40 hover:bg-white/20'}`}
                                >
                                    HIJACK
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setShowLogs(v => !v); forceUpdate(); }}
                                    className={`px-2 py-0.5 rounded transition-colors font-bold tracking-wider ${showLogs ? 'bg-green-500 text-black' : 'bg-white/10 text-white/40 hover:bg-white/20'}`}
                                >
                                    LOG
                                </button>
                                <button
                                    disabled={monitor.isRecordingActive}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        monitor.startRecording();
                                        forceUpdate();
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
                        <div onClick={(e) => { e.stopPropagation(); monitor.consoleLoggingEnabled = !monitor.consoleLoggingEnabled; forceUpdate(); }} className="flex justify-between items-center cursor-pointer hover:bg-white/5 p-1 rounded transition-colors">
                            <span className="text-white/60">Engine Perf</span>
                            <span className={`font-bold ${monitor.consoleLoggingEnabled ? 'text-green-400' : 'text-red-400'}`}>{monitor.consoleLoggingEnabled ? 'ON' : 'OFF'}</span>
                        </div>
                        <div onClick={(e) => { e.stopPropagation(); monitor.aiLoggingEnabled = !monitor.aiLoggingEnabled; forceUpdate(); }} className="flex justify-between items-center cursor-pointer hover:bg-white/5 p-1 rounded transition-colors">
                            <span className="text-white/60">AI</span>
                            <span className={`font-bold ${monitor.aiLoggingEnabled ? 'text-green-400' : 'text-red-400'}`}>{monitor.aiLoggingEnabled ? 'ON' : 'OFF'}</span>
                        </div>
                        <div onClick={(e) => { e.stopPropagation(); monitor.shaderLoggingEnabled = !monitor.shaderLoggingEnabled; forceUpdate(); }} className="flex justify-between items-center cursor-pointer hover:bg-white/5 p-1 rounded transition-colors">
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