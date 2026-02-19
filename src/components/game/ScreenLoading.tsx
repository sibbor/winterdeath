import React, { useState, useEffect, useMemo } from 'react';
import { t } from '../../utils/i18n';

interface ScreenLoadingProps {
    sectorIndex: number;
    isCamp?: boolean;
    isInitialBoot?: boolean;
    isMobileDevice?: boolean;
    debugInfo?: any;
}

const ScreenLoading: React.FC<ScreenLoadingProps> = ({ sectorIndex, isCamp, isInitialBoot, isMobileDevice }) => {
    const tips = useMemo(() => t('tips') as string[], []);
    const [randomTip, setRandomTip] = useState('');

    const sectorKeys = ['sector_1', 'sector_2', 'sector_3', 'sector_4', 'sector_5', 'sector_6'];
    const sectorKey = isCamp ? 'camp' : (sectorKeys[sectorIndex] || 'sector_1');

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
                        {isInitialBoot ? t('ui.starting') : t('ui.loading')}
                    </h4>
                    <h2 className={`${isMobileDevice ? 'text-3xl' : 'text-5xl md:text-6xl'} font-black italic tracking-tighter uppercase drop-shadow-[0_0_10px_rgba(255,255,255,0.3)] skew-x-[-10deg]`}>
                        {isInitialBoot ? (
                            <div className="flex flex-col items-center">
                                <span className="block leading-none">{t('ui.game_title_1')}</span>
                                <span className="block leading-none text-red-600">{t('ui.game_title_2')}</span>
                            </div>
                        ) : (
                            t(`sectors.${sectorKey}_name`)
                        )}
                    </h2>
                    <div className="h-1 w-32 bg-red-600 rounded-full mt-2" />

                    {!isInitialBoot && (
                        <p className="text-gray-400 text italic max-w-md mt-2">
                            <span className="text-red-500 uppercase tracking-[0.2em] block mb-2">
                                {t('ui.survivor_tip')}
                            </span>
                            "{randomTip}"
                        </p>
                    )}
                </div>

                {/* Loading Bar */}
                {!isInitialBoot && (
                    <div className="w-full h-3 bg-gray-900 border border-black rounded-full overflow-hidden relative skew-x-[-10deg]">
                        <div className="h-full bg-red-600 animate-[loading-progress_3s_ease-in-out_infinite] shadow-[0_0_10px_rgba(220,38,38,0.5)]" />
                    </div>
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
