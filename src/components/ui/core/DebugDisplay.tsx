import React, { useState } from 'react';

interface DebugDisplayProps {
    fps: number;
    debugInfo?: any;
}

const DebugDisplay: React.FC<DebugDisplayProps> = ({ fps, debugInfo }) => {
    const [isMinimized, setIsMinimized] = useState(() => {
        return localStorage.getItem('vinterdod_debug_minimized') === 'true';
    });

    const toggleMinimized = () => {
        const newState = !isMinimized;
        setIsMinimized(newState);
        localStorage.setItem('vinterdod_debug_minimized', String(newState));
    };

    // Minimized State (or Simple View if minimized)
    if (isMinimized) {
        return (
            <div
                onClick={toggleMinimized}
                className="fixed top-12 right-4 bg-green-700/80 px-2 py-1 rounded cursor-pointer z-[9999] shadow-xl pointer-events-auto border border-green-400/30 hover:bg-green-600 transition-colors backdrop-blur-md"
            >
                <div className="font-mono font-bold text-white text-[10px]">
                    FPS: {Math.round(fps)}
                </div>
            </div>
        );
    }

    if (!debugInfo) {
        // Simple FPS View (top right) - only if NOT minimized
        return (
            <div
                onClick={toggleMinimized}
                className="fixed top-0 right-0 z-[9999] bg-black/50 text-white/50 px-2 py-1 font-mono text-[10px] pointer-events-auto cursor-pointer select-none backdrop-blur-sm border-b border-l border-white/10 hover:bg-black/70 transition-colors"
            >
                {fps} FPS
            </div>
        );
    }

    // Expanded State
    return (
        <div
            onClick={toggleMinimized}
            className="fixed top-1/2 -translate-y-1/2 right-4 bg-black/80 p-4 rounded text-xs font-mono text-green-400 z-[9999] pointer-events-auto cursor-pointer border border-green-900 shadow-2xl hover:bg-black/90 transition-colors select-none backdrop-blur-lg"
        >
            <div className="flex justify-between items-center mb-2 border-b border-green-900/50 pb-1 pointer-events-none">
                <span className="font-bold text-white">DEBUG MONITOR</span>
                <span className="text-white bg-green-700 px-2 rounded">FPS: {Math.round(fps)}</span>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {/* Stats */}
                <div className="text-gray-400">Coords:</div>
                <div className="text-right font-bold text-white">
                    {debugInfo.coords && `${Math.round(debugInfo.coords.x)}, ${Math.round(debugInfo.coords.z)}`}
                </div>

                <div className="text-gray-400">Input:</div>
                <div className="text-right font-bold text-white">
                    {debugInfo.input && (
                        <>
                            <span className={debugInfo.input.w ? 'text-green-400' : 'text-gray-700'}>{debugInfo.input.w ? 'W' : '_'}</span>
                            <span className={debugInfo.input.a ? 'text-green-400' : 'text-gray-700'}>{debugInfo.input.a ? 'A' : '_'}</span>
                            <span className={debugInfo.input.s ? 'text-green-400' : 'text-gray-700'}>{debugInfo.input.s ? 'S' : '_'}</span>
                            <span className={debugInfo.input.d ? 'text-green-400' : 'text-gray-700'}>{debugInfo.input.d ? 'D' : '_'}</span>
                        </>
                    )}
                </div>

                <div className="text-gray-400">Aim:</div>
                <div className="text-right font-bold text-gray-500">{debugInfo.aim.x}, {debugInfo.aim.y}</div>

                <div className="text-gray-400">Fire/Reload:</div>
                <div className="text-right font-bold text-gray-500">
                    {debugInfo.input.fire ? 'FIRE' : '-'} / {debugInfo.input.reload ? 'RLD' : '-'}
                </div>

                <div className="col-span-2 border-t border-green-900/30 my-1"></div>

                <div className="text-gray-400">Draw Calls:</div>
                {debugInfo.drawCalls !== undefined && (
                    <div className="text-right font-bold text-yellow-500">{debugInfo.drawCalls}</div>
                )}

                <div className="text-gray-400">Objects:</div>
                <div className="text-right font-bold text-blue-400">{debugInfo.objects}</div>

                <div className="text-gray-400">Enemies:</div>
                <div className="text-right font-bold text-red-500">{debugInfo.enemies}</div>

                {debugInfo.camera && (
                    <>
                        <div className="col-span-2 border-t border-green-900/30 my-1"></div>
                        <div className="text-gray-400">Cam Pos:</div>
                        <div className="text-right text-xs text-gray-300">
                            {Math.round(debugInfo.camera.x)}, {Math.round(debugInfo.camera.y)}, {Math.round(debugInfo.camera.z)}
                        </div>
                        <div className="text-gray-400">Cam Rot:</div>
                        <div className="text-right text-xs text-gray-300">
                            {Math.round(debugInfo.camera.rotX * 180 / Math.PI)}°, {Math.round(debugInfo.camera.rotY * 180 / Math.PI)}°
                        </div>
                        <div className="text-gray-400">FOV:</div>
                        <div className="text-right text-xs text-gray-300">{Math.round(debugInfo.camera.fov)}°</div>
                    </>
                )}
            </div>

            <div className="mt-2 text-[10px] text-gray-600 text-center font-sans tracking-widest uppercase">
                Vinterdöd Engine
            </div>

            <button
                onClick={(e) => {
                    e.stopPropagation();
                    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true }));
                }}
                className="w-full mt-2 bg-green-900/50 hover:bg-green-800 text-green-200 text-xs py-1 rounded border border-green-700/50"
            >
                TOGGLE SYSTEMS
            </button>
        </div>
    );
};

export default DebugDisplay;