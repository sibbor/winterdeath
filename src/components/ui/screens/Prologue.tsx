import React, { useState, useEffect } from 'react';
import { t, getLocale, setLocale as setGlobalLocale } from '../../../utils/i18n';
import { soundManager } from '../../../utils/SoundManager';

interface PrologueProps {
    onComplete: () => void;
    isMobileDevice?: boolean;
}

const Prologue: React.FC<PrologueProps> = ({ onComplete, isMobileDevice }) => {
    const [currentPage, setCurrentIndex] = useState(0);
    // Denna state används för att tvinga React att rita om när språket ändras
    const [locale, setLocale] = useState(getLocale());

    useEffect(() => {
        const handleLocaleChange = () => {
            setLocale(getLocale());
        };

        window.addEventListener('locale-changed', handleLocaleChange);
        soundManager.playUiConfirm();
        soundManager.playPrologueMusic();

        return () => {
            window.removeEventListener('locale-changed', handleLocaleChange);
            soundManager.stopPrologueMusic();
        };
    }, []);

    // VINTERDÖD FIX: Funktionen som faktiskt byter språk
    const toggleLanguage = () => {
        const current = getLocale();
        const next = current === 'en' ? 'sv' : 'en';

        // 1. Ändra den globala inställningen (triggat locale-changed eventet)
        setGlobalLocale(next);

        // 2. Ge auditiv feedback
        soundManager.playUiClick();
    };

    const prologueData = t('story.prologue') as any[];

    // Safety check if data is missing
    if (!prologueData || !Array.isArray(prologueData)) {
        return (
            <div className="fixed inset-0 bg-black flex items-center justify-center text-white">
                <button onClick={onComplete} className="p-4 bg-red-600 uppercase font-black tracking-widest">
                    Skip Prologue (Error Loading)
                </button>
            </div>
        );
    }

    const handleNext = () => {
        if (currentPage < prologueData.length - 1) {
            setCurrentIndex(prev => prev + 1);
            soundManager.playUiConfirm();
        } else {
            handleFinish();
        }
    };

    const handleFinish = () => {
        soundManager.playUiConfirm();
        onComplete();
    };

    const currentStep = prologueData[currentPage];

    return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black p-4 sm:p-8 text-white font-sans select-none overflow-hidden">
            {/* Background Aesthetic (Simple Snowy Overlay Placeholder) */}
            <div className="absolute inset-0 pointer-events-none opacity-20">
                <div className="w-full h-full bg-[radial-gradient(circle_at_center,_transparent_0%,_black_90%)]" />
            </div>

            <div className={`relative z-10 max-w-4xl w-full flex flex-col items-center ${isMobileDevice ? 'gap-6' : 'gap-12'} text-center`}>
                {/* Game Title Design (Only on first step) */}
                {currentPage === 0 && (
                    <div className="flex flex-col items-center mb-4 sm:mb-8 animate-title-drop select-none pointer-events-none text-6xl sm:text-9xl font-mono">
                        <h1 className="text-white leading">
                            {t('ui.game_title_1')}
                        </h1>
                        <h1 className="text-red-600 leading-[0.85]">
                            {t('ui.game_title_2')}
                        </h1>
                    </div>
                )}

                {/* Header / Overlay */}
                <div className="flex flex-col gap-2">
                    <h2 className="text-red-600 font-mono font-bold tracking-[0.2em] text-lg sm:text-xl uppercase animate-pulse">
                        {currentStep.overlay}
                    </h2>
                    <div className="h-1 w-24 bg-red-600 mx-auto rounded-full" />
                </div>

                {/* Narrative Text */}
                <div className="min-h-[180px] sm:min-h-[220px] flex items-center justify-center px-4 relative w-full max-w-lg">
                    <p
                        key={currentPage}
                        className={`${isMobileDevice ? 'text-lg' : 'text-2xl md:text-3xl'} font-light font-mono italic leading-relaxed z-20 animate-narrative-fade`}
                    >
                        "{currentStep.narrative}"
                    </p>

                    {/* Thought Bubbles Overlaying the sides */}
                    {currentStep.bubbles?.map((bubble: string, i: number) => {
                        const isEven = i % 2 === 0;
                        const verticalPos = 10 + (i * 35);
                        return (
                            <div
                                key={`${currentPage}-${i}`}
                                className={`absolute z-30 w-[140px] sm:w-[180px] md:w-[240px] bg-black/85 text-white p-3 sm:p-5 rounded-[2rem] border-2 border-white/20 backdrop-blur-md animate-thought-pop shadow-[0_10px_40px_rgba(255,255,255,0.05)]
                                    ${isEven ? '-left-8 sm:-left-12 md:-left-64 lg:-left-[400px]' : '-right-8 sm:-right-12 md:-right-64 lg:-right-[400px]'}
                                `}
                                style={{
                                    top: `${verticalPos}%`,
                                    animationDelay: `${i * 3.5}s`,
                                    opacity: 0,
                                }}
                            >
                                <p className="text-[10px] sm:text-sm md:text-base font-bold uppercase tracking-widest leading-tight">
                                    {bubble}
                                </p>
                                {/* Thought "tail" dots */}
                                <div className={`absolute bottom-[-10px] w-3 h-3 sm:w-4 sm:h-4 bg-black/80 rounded-full border border-white/10 ${isEven ? 'right-10' : 'left-10'}`} />
                                <div className={`absolute bottom-[-22px] w-2 h-2 bg-black/60 rounded-full ${isEven ? 'right-14' : 'left-14'}`} />
                            </div>
                        );
                    })}
                </div>

                {/* Prompt Button Area */}
                <div className="relative flex flex-col items-center gap-4 sm:gap-8 mt-6 sm:mt-12 w-full z-10">
                    <button
                        onClick={handleNext}
                        className={`group relative ${isMobileDevice ? 'px-8 py-3' : 'px-16 py-5'} bg-white text-black border-4 border-black transition-all duration-200 hover:scale-105 active:scale-95 rounded-full overflow-hidden min-w-[240px] sm:min-w-[280px] shadow-[0_0_30px_rgba(255,255,255,0.1)]`}
                    >
                        <span className={`${isMobileDevice ? 'text-lg' : 'text-xl'} font-bold tracking-[0.2em] uppercase relative z-10`}>
                            {currentPage === prologueData.length - 1 ? t('ui.begin') : t('ui.continue')}
                        </span>
                    </button>

                    {/* Container that centers the row on the screen */}
                    <div className="flex justify-center items-center w-full gap-x-10 text-gray-500 uppercase text-[10px] sm:text-xs font-bold font-mono mt-4">
                        {/* LANGUAGE BUTTON */}
                        <button
                            onClick={toggleLanguage}
                            className="flex-1 text-right hover:text-white duration-200 tracking-[0.2em] whitespace-nowrap"
                        >
                            {t('ui.language')}: {locale.toUpperCase()}
                        </button>
                        {/* SKIP BUTTON */}
                        <button
                            onClick={handleFinish}
                            className="flex-1 text-left hover:text-white duration-200 tracking-[0.2em] whitespace-nowrap"
                        >
                            {t('ui.skip')}
                        </button>
                    </div>
                </div>

                {/* Progress Indicator */}
                <div className="fixed bottom-12 left-1/2 -translate-x-1/2 flex gap-3 z-50">
                    {prologueData.map((_, i) => (
                        <button
                            key={i}
                            onClick={() => {
                                soundManager.playUiConfirm();
                                setCurrentIndex(i);
                            }}
                            className={`h-2 transition-all duration-700 rounded-full cursor-pointer hover:bg-gray-400 ${i === currentPage ? 'w-12 bg-white' : 'w-4 bg-gray-800'}`}
                            aria-label={`Go to story point ${i + 1}`}
                        />
                    ))}
                </div>
            </div>

            <style>{`
                @keyframes title-drop {
                    0% { 
                        opacity: 0; 
                        transform: translateY(-50px) scale(1.1); 
                        filter: blur(20px);
                    }
                    100% { 
                        opacity: 1; 
                        transform: translateY(0) scale(1); 
                        filter: blur(0);
                    }
                }
                .animate-title-drop {
                    animation: title-drop 1.5s cubic-bezier(0.23, 1, 0.32, 1) forwards;
                }
                @keyframes thought-pop {
                    0% { 
                        opacity: 0; 
                        transform: scale(0.6) translateY(20px); 
                        filter: blur(10px);
                    }
                    15% { 
                        opacity: 1; 
                        transform: scale(1) translateY(0); 
                        filter: blur(0);
                    }
                    85% { 
                        opacity: 1; 
                        transform: scale(1) translateY(0); 
                        filter: blur(0);
                    }
                    100% { 
                        opacity: 0; 
                        transform: scale(0.95) translateY(-10px); 
                        filter: blur(5px);
                    }
                }
                @keyframes narrative-fade {
                    0% { 
                        opacity: 0; 
                        transform: translateY(10px);
                        filter: blur(8px);
                    }
                    100% { 
                        opacity: 1; 
                        transform: translateY(0);
                        filter: blur(0);
                    }
                }
                .animate-thought-pop {
                    animation: thought-pop 8s cubic-bezier(0.165, 0.84, 0.44, 1) forwards;
                }
                .animate-narrative-fade {
                    animation: narrative-fade 2s cubic-bezier(0.23, 1, 0.32, 1) forwards;
                }
            `}</style>
        </div >
    );
};

export default Prologue;
