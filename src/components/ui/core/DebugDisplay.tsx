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
        return saved !== 'false'; // Default to true
    });

    // Update FPS from PerformanceMonitor for consistency
    useEffect(() => {
        const interval = setInterval(() => {
            setFps(PerformanceMonitor.getInstance().getFps());
        }, 500); // 2Hz UI update is plenty for FPS
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
            className="fixed top-1/2 -translate-y-1/2 right-4 w-52 bg-black/80 backdrop-blur-md border border-white/10 p-3 rounded-lg shadow-2xl z-[9999] font-mono text-[10px] text-green-400 pointer-events-auto cursor-pointer hover:border-green-500/30 transition-all overflow-hidden"
        >
            <div className="flex justify-between items-center mb-2 border-b border-white/10 pb-1">
                <span className="font-bold text-white uppercase tracking-wider">Debug Monitor</span>
                <span className="bg-green-500 text-black px-1 rounded font-bold">{Math.round(fps)} FPS</span>
            </div>

            <div className="space-y-2">
                <div>
                    <div className="text-white/40 uppercase text-[12px] mb-0.5">Player Position</div>
                    <div className="flex justify-between">
                        <span>X: {debugInfo?.coords?.x?.toFixed(1) ?? '0.0'}</span>
                        <span>Z: {debugInfo?.coords?.z?.toFixed(1) ?? '0.0'}</span>
                    </div>
                </div>

                <div>
                    <div className="text-white/40 uppercase text-[12px] mb-0.5">Camera</div>
                    <div className="flex justify-between">
                        <span>X: {debugInfo?.camera?.x?.toFixed(1) ?? '0.0'}</span>
                        <span>Y: {debugInfo?.camera?.y?.toFixed(1) ?? '0.0'}</span>
                        <span>Z: {debugInfo?.camera?.z?.toFixed(1) ?? '0.0'}</span>
                    </div>
                </div>

                <div>
                    <div className="text-white/40 uppercase text-[12px] mb-0.5">World State</div>
                    <div className="grid grid-cols-2 gap-1">
                        <div>Enemies: <span className="text-white">{debugInfo?.enemies ?? 0}</span></div>
                        <div>Mode: <span className="text-white truncate">{debugInfo?.modes ?? 'N/A'}</span></div>
                        <div>Objects: <span className="text-white">{debugInfo?.objects ?? 0}</span></div>
                        <div>Draw Calls: <span className="text-white">{debugInfo?.drawCalls ?? 0}</span></div>
                    </div>
                </div>

                {debugInfo?.performance?.cpu && (
                    <div>
                        <div className="text-white/40 uppercase text-[12px] mb-0.5">CPU Timings</div>
                        <div className="space-y-0.5 max-h-24 overflow-y-auto pr-1 custom-scrollbar">
                            {Object.entries(debugInfo.performance.cpu).map(([key, val]) => (
                                <div key={key} className="flex justify-between border-b border-white/5 py-0.5">
                                    <span className="text-white/60 truncate mr-2">{key.replace('render_', '')}</span>
                                    <span>{(val as number).toFixed(2)}ms</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {systems && systems.length > 0 && (
                    <div>
                        <div className="text-white/40 uppercase text-[12px] mb-0.5">Systems</div>
                        <div className="space-y-0.5">
                            {systems.map(sys => {
                                const timing = debugInfo?.performance?.cpu?.[sys.id];
                                return (
                                    <div
                                        key={sys.id}
                                        onClick={(e) => { e.stopPropagation(); onToggleSystem?.(sys.id, !sys.enabled); }}
                                        className={`flex justify-between border-b border-white/5 py-0.5 cursor-pointer hover:bg-white/5 px-1 rounded ${sys.enabled ? 'text-green-400' : 'text-red-400/60'
                                            }`}
                                    >
                                        <span className="truncate mr-2">{sys.id}</span>
                                        <span className="text-white/40">{timing !== undefined ? `${timing.toFixed(2)}ms` : '–'}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {debugInfo?.performance?.memory && (
                    <div>
                        <div className="text-white/40 uppercase text-[12px] mb-0.5">Memory (RAM)</div>
                        <div className="flex justify-between">
                            <span>Used: {debugInfo.performance.memory.heapUsed}MB</span>
                            <span className="text-white/40">/ {debugInfo.performance.memory.heapLimit}MB</span>
                        </div>
                    </div>
                )}

                <div className="pt-2 border-t border-white/10 mt-2">
                    <div
                        onClick={(e) => { e.stopPropagation(); setConsoleLogging(!consoleLogging); }}
                        className="flex justify-between items-center cursor-pointer hover:bg-white/5 p-1 rounded transition-colors"
                    >
                        <span className="text-white/60">Console Logging</span>
                        <span className={`font-bold ${consoleLogging ? 'text-green-400' : 'text-red-400'}`}>
                            {consoleLogging ? 'ENABLED' : 'DISABLED'}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DebugDisplay;