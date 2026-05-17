import React, { useState, useEffect, useRef } from 'react';
import { PerformanceMonitor } from '../../../systems/PerformanceMonitor';
import { WinterEngine } from '../../../core/engine/WinterEngine';
import { HudStore } from '../../../store/HudStore';
import { SystemID } from '../../../systems/SystemID';
import { t } from '../../../utils/i18n';
import { checkIsMobileDevice } from '../../../utils/device';

interface DebugDisplayProps { }

const getPeriodName = (time: number): string => {
    const tVal = ((time % 1) + 1) % 1;
    if (tVal < 0.1 || tVal >= 0.9) return 'Midnight';
    if (tVal >= 0.1 && tVal < 0.35) return 'Dawn';
    if (tVal >= 0.35 && tVal < 0.65) return 'Noon';
    return 'Dusk';
};

const DebugDisplay: React.FC<DebugDisplayProps> = React.memo(() => {
    const [debugMode, setDebugMode] = useState(() => (window as any).HudStore?.getState().debugMode || false);
    const [hudVisible, setHudVisible] = useState(() => (window as any).HudStore?.getState().hudVisible || false);
    const [isMinimized, setIsMinimized] = useState(() => localStorage.getItem('vinterdod_debug_minimized') === 'true');
    const [systemsExpanded, setSystemsExpanded] = useState(true);
    const [cpuExpanded, setCpuExpanded] = useState(false);
    const [showLogs, setShowLogs] = useState(false);
    const [isMobile] = useState(() => checkIsMobileDevice());
    const [tick, setTick] = useState(0);


    const forceUpdate = () => setTick(t => t + 1);

    // --- HIGH-FREQUENCY REFS ---
    const fpsRef = useRef<HTMLSpanElement>(null);
    const logicFpsRef = useRef<HTMLSpanElement>(null);
    const playerXRef = useRef<HTMLSpanElement>(null);
    const playerZRef = useRef<HTMLSpanElement>(null);
    const camXRef = useRef<HTMLSpanElement>(null);
    const camYRef = useRef<HTMLSpanElement>(null);
    const camZRef = useRef<HTMLSpanElement>(null);

    // Sky Time Refs
    const skyTimeRef = useRef<HTMLSpanElement>(null);
    const skyFactorRef = useRef<HTMLSpanElement>(null);

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

    // Recording State Tracking
    const lastRecordState = useRef({ active: false, pending: false });

    useEffect(() => {
        const monitor = PerformanceMonitor.getInstance();
        let rafId: number;
        let lastUpdate = 0;

        const updateRefs = () => {
            const now = performance.now();

            // Check for recording state changes to trigger React re-render for the button
            if (monitor.isRecordingActive !== lastRecordState.current.active || monitor._recordingPending !== lastRecordState.current.pending) {
                lastRecordState.current.active = monitor.isRecordingActive;
                lastRecordState.current.pending = monitor._recordingPending;
                forceUpdate();
            }

            if (now - lastUpdate > 100) {
                lastUpdate = now;

                if (fpsRef.current) fpsRef.current.textContent = Math.round(monitor.getFps()).toString();
                if (logicFpsRef.current) logicFpsRef.current.textContent = Math.round(monitor.getLogicFps()).toString();

                const world = monitor.getFormattedGameState();
                const render = monitor.getFormattedRendererStats();
                const gc = monitor.getFormattedGcInfo();

                if (playerXRef.current) playerXRef.current.textContent = world.playerX.toString();
                if (playerZRef.current) playerZRef.current.textContent = world.playerZ.toString();
                if (camXRef.current) camXRef.current.textContent = world.camX.toString();
                if (camYRef.current) camYRef.current.textContent = world.camY.toString();
                if (camZRef.current) camZRef.current.textContent = world.camZ.toString();

                const engine = WinterEngine.getInstance();
                if (engine && engine.sky) {
                    const sky = engine.sky;
                    const skyTime = sky.currentTime;
                    const skyFactor = sky.timeScale;

                    if (skyTimeRef.current) {
                        const period = getPeriodName(skyTime);
                        skyTimeRef.current.textContent = `${period} (${skyTime.toFixed(4)})`;
                    }
                    if (skyFactorRef.current) {
                        skyFactorRef.current.textContent = skyFactor.toFixed(4);
                    }
                }

                if (drawCallsRef.current) drawCallsRef.current.textContent = render.drawCalls.toString();
                if (trisRef.current) trisRef.current.textContent = render.triangles.toString();
                if (shadersRef.current) shadersRef.current.textContent = render.shaderPrograms.toString();
                if (recompRef.current) {
                    recompRef.current.textContent = render.shaderRecompiles.toString();
                    recompRef.current.className = render.shaderRecompiles > 0 ? 'text-yellow-400 font-bold' : 'text-white';
                }
                if (texRef.current) texRef.current.textContent = render.textures.toString();
                if (geoRef.current) geoRef.current.textContent = render.geometries.toString();

                if (enemiesRef.current) enemiesRef.current.textContent = world.enemies.toString();
                if (objectsRef.current) objectsRef.current.textContent = world.objects.toString();

                if (heapRef.current) heapRef.current.textContent = gc.heapUsedMB.toString();
                if (heapLimitRef.current) heapLimitRef.current.textContent = `/ ${gc.heapLimitMB}MB`;

                if (gcAlertRef.current) {
                    const recentGC = gc.timeSinceDetection < 2000;
                    gcAlertRef.current.textContent = recentGC ? `⚠️ ~${gc.droppedMB}MB freed` : '—';
                    gcAlertRef.current.className = recentGC ? 'text-yellow-400 font-bold' : 'text-white/20';
                }
            }
            rafId = requestAnimationFrame(updateRefs);
        };

        rafId = requestAnimationFrame(updateRefs);

        const unsubscribe = HudStore.subscribe((state) => {
            if (state.debugMode !== debugMode) setDebugMode(state.debugMode);
            if (state.hudVisible !== hudVisible) setHudVisible(state.hudVisible);
        });

        return () => {
            cancelAnimationFrame(rafId);
            unsubscribe();
        };
    }, [debugMode, hudVisible]);

    const toggleMinimized = (e: React.MouseEvent) => {
        e.stopPropagation();
        const next = !isMinimized;
        setIsMinimized(next);
        localStorage.setItem('vinterdod_debug_minimized', String(next));
    };

    if (!debugMode || !hudVisible) return null;

    const monitor = PerformanceMonitor.getInstance();
    const engine = WinterEngine.getInstance();

    if (isMinimized) {
        return (
            <div
                onClick={toggleMinimized}
                onPointerDown={(e) => e.stopPropagation()}
                className="fixed top-0 right-0 z-[9998] bg-black/80 text-white/70 px-3 py-1 font-mono text-[11px] select-none backdrop-blur-md border border-white/10 rounded-bl-lg shadow-2xl cursor-pointer pointer-events-auto flex items-center gap-3">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                        <span ref={fpsRef} className="font-bold">0</span> <span className="opacity-60 text-[9px]">FPS</span>
                    </div>
                    <div className="flex items-center gap-1.5 opacity-60">
                        <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                        <span ref={logicFpsRef} className="font-bold">0</span> <span className="opacity-60 text-[9px]">LOGIC</span>
                    </div>
                </div>
                <div className="w-px h-3 bg-white/10"></div>
                <div className="opacity-40 hover:opacity-100 transition-opacity">
                    [+]
                </div>
            </div>
        );
    }

    const world = monitor.getFormattedGameState();
    const render = monitor.getFormattedRendererStats();
    const gc = monitor.getFormattedGcInfo();
    const timings = monitor.getFormattedTimings();
    const systems = engine ? engine.getSystems() : [];
    const logs = showLogs ? monitor.getLogs() : [];

    const systemElements = [];
    if (systemsExpanded && systems.length > 0) {
        for (let i = 0; i < systems.length; i++) {
            const sys = systems[i];
            const timing = timings.breakdown[sys.systemId];
            systemElements.push(
                <div key={sys.systemId} onClick={(e) => { e.stopPropagation(); engine?.setSystemEnabled(sys.systemId as SystemID, !sys.enabled); forceUpdate(); }} className={`flex justify-between border-b border-white/5 py-0.5 cursor-pointer hover:bg-white/5 px-1 rounded ${sys.enabled !== false ? 'text-green-400' : 'text-red-400/60'}`}>
                    <span className="truncate mr-2">{SystemID[sys.systemId] || `SYS_${sys.systemId}`}</span>
                    <span className="text-white/40">{timing !== undefined ? `${timing}ms` : '–'}</span>
                </div>
            );
        }
    }

    const logElements = [];
    if (showLogs && logs.length > 0) {
        for (let i = 0; i < logs.length; i++) {
            const l = logs[i] as any;
            logElements.push(
                <div key={i} className="border-b border-white/5 pb-1 last:border-0" style={{ color: l.color }}>
                    <span className="opacity-50 mr-2 text-[10px]">[{new Date(l.time).toISOString().split('T')[1].split('Z')[0]}]</span>
                    {l.msg}
                </div>
            );
        }
    }

    const timingElements = [];
    if (timings) {
        for (const key in timings.breakdown) {
            const val = (timings.breakdown as any)[key];
            timingElements.push(
                <div key={key} className="flex justify-between border-b border-white/5 py-0.5">
                    <span className="text-white/60 truncate mr-2">{key.replace('render_', '')}</span>
                    <span>{val}ms</span>
                </div>
            );
        }
    }



    const showDebugButtons = isMobile;

    // Record button text logic
    let recordText = 'START RECORDING';
    if (monitor.isRecordingActive) recordText = 'STOP RECORDING';
    else if (monitor.isRecordingPending) recordText = 'STARTING IN 2 SEC';

    return (
        <>
            <div
                className="fixed top-0 bottom-0 right-0 w-56 bg-black/75 border-l border-white/10 shadow-2xl z-[9998] font-mono text-[11px] text-green-400 pointer-events-auto transition-all flex flex-col overflow-hidden"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-3 shrink-0 space-y-2 overflow-y-auto flex-1">
                    <div
                        onClick={toggleMinimized}
                        className="flex justify-between items-center mb-2 border-b border-white/10 pb-1 cursor-pointer group select-none"
                        title="Minimize"
                    >
                        <span className="font-bold text-white uppercase tracking-wider group-hover:text-green-400 transition-colors">{t('ui.debug_monitor')}</span>
                        <div className="flex items-center gap-2">
                            <span className="bg-green-500 text-black px-1 rounded font-bold"><span ref={fpsRef}>0</span> {t('ui.fps')}</span>
                            <div className="opacity-40 group-hover:opacity-100 transition-opacity font-bold text-white px-1">
                                [-]
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="text-white/40 uppercase text-[10px] shrink-0 mr-2">{t('ui.time_of_day')}</div>
                        <span className="text-white tabular-nums text-[10px]">
                            <span ref={skyTimeRef}>Midnight (0.0000)</span>
                        </span>
                    </div>
                    <div className="flex items-center justify-between">
                        <div className="text-white/40 uppercase text-[10px] shrink-0 mr-2">{t('ui.time_factor')}</div>
                        <span className="text-white tabular-nums text-[10px]">
                            <span ref={skyFactorRef}>0.0000</span>
                        </span>
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="text-white/40 uppercase text-[10px] shrink-0 mr-2">{t('ui.player')}</div>
                        <span className="text-white tabular-nums">
                            X: <span ref={playerXRef}>0</span>, Z: <span ref={playerZRef}>0</span>
                        </span>
                    </div>
                    <div className="flex items-center justify-between">
                        <div className="text-white/40 uppercase text-[10px] shrink-0 mr-2">{t('ui.camera')}</div>
                        <span className="text-white tabular-nums text-[10px]">
                            <span ref={camXRef}>0</span>, <span ref={camYRef}>0</span>, <span ref={camZRef}>0</span>
                        </span>
                    </div>

                    <div>
                        <div className="text-white/40 uppercase text-[10px] mb-0.5">{t('ui.renderer')}</div>
                        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                            <div>{t('ui.draw_calls')}: <span ref={drawCallsRef} className="text-white">0</span></div>
                            <div>{t('ui.triangles')}: <span ref={trisRef} className="text-white">0</span></div>
                            <div>{t('ui.shaders')}: <span ref={shadersRef} className="text-white">0</span></div>
                            <div>{t('ui.recompiles')}: <span ref={recompRef} className="text-white">0</span></div>
                            <div>{t('ui.textures')}: <span ref={texRef} className="text-white">0</span></div>
                            <div>{t('ui.geometries')}: <span ref={geoRef} className="text-white">0</span></div>
                        </div>
                    </div>

                    <div className="flex items-center justify-between">
                        <span className="text-white/40 uppercase text-[10px]">GC</span>
                        <span ref={gcAlertRef} className="text-white/20">—</span>
                    </div>

                    {parseFloat(String(gc.heapUsedMB)) > 0 && (
                        <div>
                            <div className="text-white/40 uppercase text-[10px] mb-0.5">{t('ui.world_memory')}</div>
                            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                                <div>{t('ui.enemies')}: <span ref={enemiesRef} className="text-white">0</span></div>
                                <div>{t('ui.objects')}: <span ref={objectsRef} className="text-white">0</span></div>
                                <div>{t('ui.heap')}: <span ref={heapRef} className="text-white">0</span>MB</div>
                                <div ref={heapLimitRef} className="text-white/40">/ 0MB</div>
                            </div>
                        </div>
                    )}

                    <div>
                        <div
                            className="text-white/40 uppercase text-[10px] mb-0.5 cursor-pointer hover:text-white flex justify-between select-none"
                            onClick={(e) => { e.stopPropagation(); setCpuExpanded(!cpuExpanded); }}
                        >
                            <span>{t('ui.cpu_timings')}</span>
                            <span className="opacity-40">{cpuExpanded ? '▼' : '▶'}</span>
                        </div>
                        {cpuExpanded && (
                            <div className="space-y-0.5 pr-1">
                                {timingElements}
                            </div>
                        )}
                    </div>

                    <div>
                        <div
                            className="text-white/40 uppercase text-[10px] mb-0.5 cursor-pointer hover:text-white flex justify-between select-none"
                            onClick={(e) => { e.stopPropagation(); setSystemsExpanded(!systemsExpanded); }}
                        >
                            <span>{t('ui.systems')}</span>
                            <span className="opacity-40">{systemsExpanded ? '▼' : '▶'}</span>
                        </div>
                        {systemsExpanded && (
                            <div className="space-y-0.5 pr-1">
                                {systemElements}
                            </div>
                        )}
                    </div>

                    <div className="pt-1 border-t border-white/10 shrink-0">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-white/40 uppercase text-[10px]">{t('ui.logging')}</span>
                        </div>

                        <div className="grid grid-cols-2 gap-1 mb-2">
                            {showDebugButtons && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); setShowLogs(!showLogs); }}
                                    className={`px-1 py-0.5 rounded text-[9px] font-bold ${showLogs ? 'bg-blue-500 text-white' : 'bg-white/10 text-white/40'}`}
                                >
                                    LOG
                                </button>
                            )}
                            <button
                                onClick={(e) => { e.stopPropagation(); monitor.isRecordingActive ? monitor.stopRecording() : monitor.startRecording(); forceUpdate(); }}
                                className={`px-1 py-0.5 rounded text-[9px] font-bold transition-all ${monitor.isRecordingActive ? 'bg-red-500 text-white animate-pulse-red shadow-[0_0_8px_rgba(239,68,68,0.5)]' : (monitor.isRecordingPending ? 'bg-orange-500 text-black' : 'bg-white/10 text-white/40')}`}
                            >
                                {recordText}
                            </button>
                        </div>
                    </div>

                    <div className="pt-1 border-t border-white/10 text-[9px] space-y-1">
                        <div onClick={(e) => { e.stopPropagation(); monitor.consoleLoggingEnabled = !monitor.consoleLoggingEnabled; forceUpdate(); }} className="flex justify-between items-center cursor-pointer hover:bg-white/5 p-1 rounded transition-colors">
                            <span className="text-white/60">{t('ui.engine_perf')}</span>
                            <span className={`font-bold ${monitor.consoleLoggingEnabled ? 'text-green-400' : 'text-red-400'}`}>{monitor.consoleLoggingEnabled ? t('ui.on') : t('ui.off')}</span>
                        </div>
                        <div onClick={(e) => { e.stopPropagation(); monitor.aiLoggingEnabled = !monitor.aiLoggingEnabled; forceUpdate(); }} className="flex justify-between items-center cursor-pointer hover:bg-white/5 p-1 rounded transition-colors">
                            <span className="text-white/60">{t('ui.ai')}</span>
                            <span className={`font-bold ${monitor.aiLoggingEnabled ? 'text-green-400' : 'text-red-400'}`}>{monitor.aiLoggingEnabled ? t('ui.on') : t('ui.off')}</span>
                        </div>
                        <div onClick={(e) => { e.stopPropagation(); monitor.shaderLoggingEnabled = !monitor.shaderLoggingEnabled; forceUpdate(); }} className="flex justify-between items-center cursor-pointer hover:bg-white/5 p-1 rounded transition-colors">
                            <span className="text-white/60">{t('ui.shaders')}</span>
                            <span className={`font-bold ${monitor.shaderLoggingEnabled ? 'text-green-400' : 'text-red-400'}`}>{monitor.shaderLoggingEnabled ? t('ui.on') : t('ui.off')}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* FULLSCREEN LOG WINDOW (Mobile Only) */}
            {showLogs && isMobile && (
                <div className="fixed inset-0 z-[99999] bg-black/95 flex flex-col pointer-events-auto backdrop-blur-md pb-safe" onPointerDown={(e) => e.stopPropagation()}>
                    {/* ROW 1: Header + Close */}
                    <div className="flex justify-between items-center bg-white/10 p-2 border-b border-white/20 shadow-lg shrink-0 pt-safe">
                        <span className="text-white font-bold tracking-widest uppercase text-[10px] ml-1">{t('ui.system_logs')}</span>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowLogs(false);
                            }}
                            className="px-3 py-1 font-bold text-white bg-white/10 hover:bg-white/20 rounded transition-colors text-[10px]"
                        >
                            {t('ui.close')}
                        </button>
                    </div>

                    {/* ROW 2: Controls */}
                    <div className="flex items-center gap-1.5 p-1.5 bg-white/5 border-b border-white/10 shrink-0 overflow-x-auto">
                        <button
                            onClick={(e) => { e.stopPropagation(); monitor.clearLogs(); forceUpdate(); }}
                            className="px-2 py-1 font-bold text-red-300 bg-red-500/20 rounded text-[9px] uppercase"
                        >
                            {t('ui.clear')}
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); monitor.logsHijackEnabled = !monitor.logsHijackEnabled; forceUpdate(); }}
                            className={`px-2 py-1 font-bold rounded text-[9px] uppercase ${monitor.logsHijackEnabled ? 'bg-orange-500 text-black' : 'bg-white/10 text-white/40'}`}
                        >
                            HIJACK
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 font-mono text-[11px] space-y-1 break-words">
                        {logElements.length > 0 ? (
                            logElements
                        ) : (
                            <div className="text-white/20 italic text-center py-20 uppercase tracking-widest text-sm">{t('ui.no_logs')}</div>
                        )}
                    </div>
                </div>
            )}

            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes pulse-red-anim {
                    0%, 100% { background-color: #ef4444; }
                    50% { background-color: #f87171; }
                }
                .animate-pulse-red {
                    animation: pulse-red-anim 1s cubic-bezier(0.4, 0, 0.6, 1) infinite;
                }
            `}} />
        </>
    );
});

export default DebugDisplay;
