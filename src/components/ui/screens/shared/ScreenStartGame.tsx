import React, { useState } from 'react';
import { t } from '../../../../utils/i18n';
import { soundManager } from '../../../../utils/audio/SoundManager';

interface ScreenStartUpProps {
    onStart: () => void;
    isMobileDevice?: boolean;
}

const ScreenStartGame: React.FC<ScreenStartUpProps> = ({ onStart, isMobileDevice }) => {
    const [isStarting, setIsStarting] = useState(false);

    const handleStart = async () => {
        setIsStarting(true);

        // FIX: Stupid Apple iOS fix
        // This click unlocks the audio card in the browser.
        // We play a sound or a click sound, and if AudioContext was 'suspended'
        // the browser will now force it to 'running'.
        try {
            soundManager.playUiConfirm();
            if (soundManager.core.ctx.state === 'suspended') {
                await soundManager.core.ctx.resume();
            }
        } catch (e) {
            console.error("Sound playback failed:", e);
        }

        // Låt klicket ljuda och animationen börja innan vi stänger komponenten
        setTimeout(() => {
            onStart();
        }, 500);
    };

    return (
        <div className={`fixed inset-0 z-[2000] flex flex-col items-center justify-center bg-black text-white select-none cursor-none transition-opacity duration-500 ${isStarting ? 'opacity-0' : 'opacity-100'}`}>
            <div className="absolute inset-0 opacity-30">
                <div className="w-full h-full bg-[radial-gradient(circle_at_center,_rgba(50,50,50,0.4)_0%,_black_80%)]" />
            </div>

            <div className="relative z-10 flex flex-col items-center gap-12">
                <div className="flex flex-col items-center mb-4 sm:mb-8 select-none text-6xl sm:text-9xl font-mono">
                    <h1 className="text-white leading">
                        {t('ui.game_title_1')}
                    </h1>
                    <h1 className="text-red-600 leading-[0.85]">
                        {t('ui.game_title_2')}
                    </h1>
                </div>

                <button
                    onClick={handleStart}
                    className={`group relative ${isMobileDevice ? 'px-8 py-3' : 'px-16 py-5'} bg-white text-black border-4 border-black transition-all duration-200 hover:scale-105 active:scale-95 rounded-full overflow-hidden min-w-[240px] sm:min-w-[280px] shadow-[0_0_30px_rgba(255,255,255,0.1)]`}
                >
                    <span className={`${isMobileDevice ? 'text-lg' : 'text-xl'} font-bold tracking-[0.2em] uppercase relative z-10`}>
                        {t('ui.begin')}
                    </span>
                </button>
            </div>
        </div>
    );
};

export default ScreenStartGame;