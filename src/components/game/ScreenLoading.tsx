import React, { useState, useEffect, useMemo } from 'react';
import { t } from '../../utils/i18n';
import { SECTOR_THEMES } from '../../content/constants';

interface ScreenLoadingProps {
    mapIndex: number;
    isCamp?: boolean;
    isMobileDevice?: boolean;
    debugInfo?: {
        fps?: number;
        sceneChildren?: number;
        obstacles?: number;
    };
}

const ScreenLoading: React.FC<ScreenLoadingProps> = ({ mapIndex, isCamp, isMobileDevice, debugInfo }) => {
    const tips = useMemo(() => t('tips') as string[], []);
    const [randomTip, setRandomTip] = useState('');

    const mapKeys = ['village', 'bunker', 'mast', 'scrapyard', 'home'];
    const mapKey = isCamp ? 'camp' : (mapKeys[mapIndex] || 'village');

    const [isMinimized, setIsMinimized] = useState(() => {
        return localStorage.getItem('vinterdod_debug_minimized') === 'true';
    });

    const toggleMinimized = () => {
        const newState = !isMinimized;
        setIsMinimized(newState);
        localStorage.setItem('vinterdod_debug_minimized', String(newState));
    };

    useEffect(() => {
        if (tips && Array.isArray(tips) && tips.length > 0) {
            const index = Math.floor(Math.random() * tips.length);
            setRandomTip(tips[index]);
        }
    }, [tips]);

    return (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black text-white font-sans overflow-hidden select-none">
            {/* Background Aesthetic */}
            <div className="absolute inset-0 opacity-20">
                <div className="w-full h-full bg-[radial-gradient(circle_at_center,_rgba(255,0,0,0.1)_0%,_transparent_70%)]" />
                <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-red-900/20 to-transparent" />
            </div>

            <div className={`relative z-10 max-w-2xl w-full px-8 flex flex-col items-center ${isMobileDevice ? 'gap-8' : 'gap-12'}`}>
                {/* Sector Info */}
                <div className="flex flex-col items-center gap-4 text-center">
                    <h4 className="text-red-600 font-black tracking-[0.4em] uppercase text-sm animate-pulse">
                        {t('ui.loading')}
                    </h4>
                    <h2 className={`${isMobileDevice ? 'text-3xl' : 'text-5xl md:text-6xl'} font-black italic tracking-tighter uppercase drop-shadow-[0_0_10px_rgba(255,255,255,0.3)] skew-x-[-10deg]`}>
                        {t(`maps.${mapKey}_name`)}
                    </h2>
                    <div className="h-1 w-32 bg-red-600 rounded-full mt-2" />

                    <p className="text-gray-400 text-sm italic max-w-md mt-2">
                        <span className="text-red-500 uppercase tracking-[0.2em] block mb-2">
                            {t('ui.survivor_tip')}
                        </span>
                        "{randomTip}"
                    </p>
                </div>

                {/* Loading Bar */}
                <div className="w-full h-3 bg-gray-900 border border-black rounded-full overflow-hidden relative skew-x-[-10deg]">
                    <div className="h-full bg-red-600 animate-[loading-progress_3s_ease-in-out_infinite] shadow-[0_0_10px_rgba(220,38,38,0.5)]" />
                </div>

                {/* Debug Info */}
                {debugInfo && (
                    isMinimized ? (
                        <div
                            onClick={toggleMinimized}
                            className="absolute top-4 right-4 bg-red-900 px-2 py-1 rounded cursor-pointer z-[110] shadow-lg pointer-events-auto hover:bg-red-800 transition-colors border border-red-700"
                        >
                            <div className="font-mono font-bold text-white text-[10px]">
                                FPS: {debugInfo.fps?.toFixed(0) || '?'}
                            </div>
                        </div>
                    ) : (
                        <div
                            onClick={toggleMinimized}
                            className="absolute top-4 right-4 bg-black/80 border border-red-900/50 rounded px-4 py-3 text-xs font-mono z-[110] cursor-pointer hover:bg-black/90 transition-colors pointer-events-auto"
                        >
                            <div className="text-red-500 font-bold mb-2">DEBUG INFO</div>
                            <div className="space-y-1 text-gray-300">
                                <div>FPS: <span className={debugInfo.fps && debugInfo.fps < 30 ? 'text-red-500 font-bold' : 'text-green-500'}>{debugInfo.fps?.toFixed(1) || '?'}</span></div>
                                <div>Scene Children: <span className="text-yellow-500">{debugInfo.sceneChildren || 0}</span></div>
                                <div>Obstacles: <span className="text-yellow-500">{debugInfo.obstacles || 0}</span></div>
                            </div>
                        </div>
                    )
                )}
            </div>

            <style>{`
                @keyframes loading-progress {
                    0% { width: 0%; left: 0; }
                    50% { width: 70%; left: 15%; }
                    100% { width: 100%; left: 0; }
                }
                @keyframes fade-in {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
};

export default ScreenLoading;
