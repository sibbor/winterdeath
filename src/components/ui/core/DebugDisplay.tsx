
import React from 'react';

interface DebugDisplayProps {
    fps: number;
    debugInfo?: any;
}

const DebugDisplay: React.FC<DebugDisplayProps> = ({ fps, debugInfo }) => {
    if (debugInfo) {
        // Detailed Debug View (Black/Grey Box, Center Right)
        return (
            <div className="fixed top-4 right-4 p-4 bg-black/80 font-mono text-xs rounded z-[9999] pointer-events-none select-none border border-gray-700/50">
                <div className="grid grid-cols-2 gap-x-8 gap-y-1">
                    {/* TOP SECTION */}
                    <div className="font-bold text-gray-500 uppercase tracking-wider">FPS:</div>
                    <div className="text-right font-bold text-gray-500">{fps}</div>

                    {debugInfo.coords && (
                        <>
                            <div className="font-bold text-gray-500 uppercase tracking-wider">Coords:</div>
                            <div className="text-right font-bold text-gray-500">
                                {Math.round(debugInfo.coords.x)}, {Math.round(debugInfo.coords.z)}
                            </div>
                        </>
                    )}

                    <div className="col-span-2 border-b border-white/10 my-1"></div>

                    {/* INPUT SECTION */}
                    <div className="font-bold text-gray-500 uppercase tracking-wider">Input:</div>
                    <div className="text-right font-bold text-gray-500">
                        {debugInfo.input.w ? 'W' : '_'}{debugInfo.input.a ? 'A' : '_'}{debugInfo.input.s ? 'S' : '_'}{debugInfo.input.d ? 'D' : '_'}
                    </div>

                    <div className="font-bold text-gray-500 uppercase tracking-wider">Aim:</div>
                    <div className="text-right font-bold text-gray-500">{debugInfo.aim.x}, {debugInfo.aim.y}</div>

                    <div className="font-bold text-gray-500 uppercase tracking-wider">Fire:</div>
                    <div className="text-right font-bold text-gray-500">{debugInfo.input.fire}</div>

                    <div className="font-bold text-gray-500 uppercase tracking-wider">Reload:</div>
                    <div className="text-right font-bold text-gray-500">{debugInfo.input.reload}</div>

                    <div className="col-span-2 border-b border-white/10 my-1"></div>

                    {/* STATS SECTION */}
                    {debugInfo.drawCalls !== undefined && (
                        <>
                            <div className="font-bold text-gray-500 uppercase tracking-wider">Draw Calls:</div>
                            <div className="text-right font-bold text-gray-500">{debugInfo.drawCalls}</div>
                        </>
                    )}

                    <div className="font-bold text-gray-500 uppercase tracking-wider">Objects:</div>
                    <div className="text-right font-bold text-gray-500">{debugInfo.objects}</div>

                    <div className="font-bold text-gray-500 uppercase tracking-wider">Enemies:</div>
                    <div className="text-right font-bold text-gray-500">{debugInfo.enemies}</div>

                    {/* CAMERA SECTION */}
                    {debugInfo.camera && (
                        <>
                            <div className="col-span-2 border-b border-white/10 my-1"></div>

                            <div className="font-bold text-cyan-400 uppercase tracking-wider">Camera Pos:</div>
                            <div className="text-right font-bold text-cyan-400">
                                {Math.round(debugInfo.camera.x)}, {Math.round(debugInfo.camera.y)}, {Math.round(debugInfo.camera.z)}
                            </div>

                            <div className="font-bold text-cyan-400 uppercase tracking-wider">Camera Rot:</div>
                            <div className="text-right font-bold text-cyan-400">
                                {Math.round(debugInfo.camera.rotX * 180 / Math.PI)}°, {Math.round(debugInfo.camera.rotY * 180 / Math.PI)}°
                            </div>

                            {debugInfo.camera.fov && (
                                <>
                                    <div className="font-bold text-cyan-400 uppercase tracking-wider">FOV:</div>
                                    <div className="text-right font-bold text-cyan-400">{Math.round(debugInfo.camera.fov)}°</div>
                                </>
                            )}
                        </>
                    )}
                </div>
            </div>
        );
    }

    // Simple FPS View
    return (
        <div className="fixed top-0 right-0 z-[9999] bg-black/50 text-white/50 px-2 py-1 font-mono text-[10px] pointer-events-none select-none backdrop-blur-sm border-b border-l border-white/10">
            {fps} FPS
        </div>
    );
};

export default DebugDisplay;