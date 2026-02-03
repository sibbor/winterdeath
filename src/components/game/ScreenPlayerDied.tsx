
import React, { useEffect, useState } from 'react';
import { t } from '../../utils/i18n';
import { soundManager } from '../../utils/sound';
import { PLAYER_CHARACTER } from '../../content/constants';

interface ScreenPlayerDiedProps {
    onContinue: () => void;
    killerName: string;
}

const ScreenPlayerDied: React.FC<ScreenPlayerDiedProps> = ({ onContinue, killerName }) => {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        soundManager.playUiConfirm();
        // Trigger fade-in after a brief delay
        setTimeout(() => setIsVisible(true), 50);
    }, []);

    // Unified ESC handling is managed via useGlobalInput in App.tsx

    return (
        <div
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/70 backdrop-blur-md p-8 text-white font-sans select-none overflow-hidden transition-opacity duration-1000"
            style={{ opacity: isVisible ? 1 : 0 }}
        >
            {/* Background Aesthetic */}
            <div className="absolute inset-0 pointer-events-none opacity-40">
                <div className="w-full h-full bg-[radial-gradient(circle_at_center,_transparent_0%,_black_95%)]" />
            </div>

            <div className="relative z-10 max-w-4xl w-full flex flex-col items-center gap-12 text-center animate-[narrative-fade_1.5s_ease-out_forwards]">
                {/* Header */}
                <div className="flex flex-col gap-2">
                    <h2 className="text-red-600 font-bold tracking-[0.3em] text-xl uppercase animate-pulse">
                        {PLAYER_CHARACTER.name} {t('ui.killed_by')}
                    </h2>
                    <div className="h-1 w-24 bg-red-600 mx-auto rounded-full" />
                </div>

                {/* Killer Name */}
                <div className="min-h-[100px] flex items-center justify-center px-4 relative w-full">
                    <p className="text-4xl md:text-6xl font-light italic leading-relaxed text-gray-200 drop-shadow-[0_0_15px_rgba(0,0,0,1)] z-20">
                        "{killerName}"
                    </p>
                </div>

                {/* Action Button */}
                <div className="relative flex flex-col items-center gap-8 mt-12 w-full z-10 animate-[fadeIn_1s_ease-out_forwards]">
                    <button
                        onClick={onContinue}
                        className="group relative px-16 py-5 bg-white text-black border-4 border-black hover:bg-black hover:text-white transition-all duration-300 rounded-full overflow-hidden min-w-[280px] shadow-[0_0_30px_rgba(255,255,255,0.1)] pointer-events-auto">
                        <span className="relative z-10 text-xl font-black tracking-[0.2em] uppercase transition-colors">
                            {t('ui.continue')}
                        </span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ScreenPlayerDied;
