import React, { useState, useEffect, useMemo } from 'react';
import { t } from '../../../../utils/i18n';
import { SECTOR_THEMES } from '../../../../content/sectors/sector_themes';

interface ScreenLoadingProps {
    sectorIndex: number;
    isCamp?: boolean;
    isInitialBoot?: boolean;
    isPrologue?: boolean; // VINTERDÖD FIX: Ny prop!
    isMobileDevice?: boolean;
    isDone?: boolean;
    debugInfo?: any;
}

const ScreenLoading: React.FC<ScreenLoadingProps> = ({ sectorIndex, isCamp, isInitialBoot, isPrologue, isMobileDevice, isDone }) => {
    const tips = useMemo(() => t('tips') as string[], []);
    const [randomTip, setRandomTip] = useState('');
    const currentTheme = SECTOR_THEMES[sectorIndex];

    // Stable state to prevent text flickering during fade-out
    const [displayInfo, setDisplayInfo] = useState({
        sectorKey: isCamp ? 'sectors.camp_name' : (currentTheme?.name || `sectors.sector_${sectorIndex}_name`),
        isCamp: !!isCamp,
        isInitialBoot: !!isInitialBoot,
        isPrologue: !!isPrologue
    });

    useEffect(() => {
        if (!isDone) {
            setDisplayInfo({
                sectorKey: isCamp ? 'sectors.camp_name' : (currentTheme?.name || `sectors.sector_${sectorIndex}_name`),
                isCamp: !!isCamp,
                isInitialBoot: !!isInitialBoot,
                isPrologue: !!isPrologue
            });
        }
    }, [sectorIndex, isCamp, isInitialBoot, isPrologue, isDone, currentTheme]);

    useEffect(() => {
        if (tips && Array.isArray(tips) && tips.length > 0) {
            const index = Math.floor(Math.random() * tips.length);
            setRandomTip(tips[index]);
        }
    }, [tips]);

    // Sticky "done" state to prevent "double-fade" flickers if flags overlap momentarily
    const [isActuallyDone, setIsActuallyDone] = useState(false);

    useEffect(() => {
        if (isDone) {
            setIsActuallyDone(true);
        } else {
            setIsActuallyDone(false);
        }
    }, [isDone]);

    const isStarting = displayInfo.isInitialBoot || displayInfo.isPrologue;

    return (
        <div
            className={`fixed inset-0 z-[1000] flex flex-col items-center justify-center bg-black text-white font-sans overflow-hidden select-none ease-in-out ${isActuallyDone ? 'opacity-0 scale-105 transition-all duration-1000' : 'opacity-100 scale-100 transition-none'} ${isDone ? 'pointer-events-none' : ''}`}
        >
            {/* Background Aesthetic */}
            <div className="absolute inset-0 opacity-20">
                <div className="w-full h-full bg-[radial-gradient(circle_at_center,_rgba(255,0,0,0.1)_0%,_transparent_70%)]" />
                <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-red-900/20 to-transparent" />
            </div>

            <div className={`relative z-10 max-w-2xl w-full px-8 flex flex-col items-center ${isMobileDevice ? 'gap-8' : 'gap-12'}`}>
                {/* Sector Info */}
                <div className="flex flex-col items-center gap-4 text-center">
                    <h4 className="text-red-600 font-mono tracking-[0.2em] uppercase text-sm animate-pulse">
                        {isStarting ? t('ui.starting') : t('ui.loading')}
                    </h4>
                    <h2 className={`${isMobileDevice ? 'text-3xl' : 'text-5xl md:text-6xl'} font-mono tracking-[0.2em] uppercase`}>
                        {isStarting ? (
                            <div className="flex flex-col items-center">
                                <span className="block leading-none">{t('ui.game_title_1')}</span>
                                <span className="block leading-none text-red-600">{t('ui.game_title_2')}</span>
                            </div>
                        ) : (
                            t(displayInfo.sectorKey)
                        )}
                    </h2>
                    <div className="h-1 w-32 bg-red-600 rounded-full mt-2" />

                    {!isStarting && (
                        <p className="text-gray-400 text font-mono max-w-md mt-2">
                            <span className="text-red-500 uppercase tracking-[0.2em] block mb-2">
                                {t('ui.survivor_tip')}
                            </span>
                            <span className="italic">"{randomTip}"</span>
                        </p>
                    )}
                </div>

                {/* Loading Bar - Döljs helt under Prolog-starten */}
                {!isStarting && (
                    <div className="w-full h-3 bg-gray-900 border border-black rounded-full overflow-hidden relative">
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
            `}</style>
        </div>
    );
};

export default ScreenLoading;