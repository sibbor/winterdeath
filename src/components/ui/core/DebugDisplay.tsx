import React, { useState } from 'react';

interface DebugDisplayProps {
    fps: number;
    debugInfo?: any;
}

const DebugDisplay: React.FC<DebugDisplayProps> = ({ fps, debugInfo }) => {
    const [isMinimized, setIsMinimized] = useState(false);

    if (!debugInfo) {
        // Simple FPS View (Always visible if debugInfo is missing but component rendered?)
        // Usually dependent on parent mapping.
        return (
            <div className="fixed top-0 right-0 z-[9999] bg-black/50 text-white/50 px-2 py-1 font-mono text-[10px] pointer-events-none select-none backdrop-blur-sm border-b border-l border-white/10">
                {fps} FPS
            </div>
        );
    }

    // Minimized State
    if (isMinimized) {
        return (
            <div
                onClick={() => setIsMinimized(false)}
                className="fixed top-1/2 -translate-y-1/2 right-4 bg-green-700 px-2 rounded cursor-pointer z-[9999] shadow-xl pointer-events-auto hover:border-white transition-colors"
            >
                <div className="font-mono font-bold text-white text-xs">
                    FPS: {Math.round(fps)}
                </div>
            </div>
        );
    }

    // Expanded State
    return (
        <div
            onClick={() => setIsMinimized(true)}
            className="fixed top-1/2 -translate-y-1/2 right-4 bg-black/80 p-4 rounded text-xs font-mono text-green-400 z-[9999] pointer-events-auto cursor-pointer border border-green-900 shadow-2xl hover:bg-black/90 transition-colors select-none"
        >
            <div className="flex justify-between items-center mb-2 border-b border-green-900/50 pb-1">
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
                Winterdöd Engine v0.9
            </div>
        </div>
    );
};

export default DebugDisplay;