import React, { useEffect, useState, useMemo } from 'react';
import { t } from '../../utils/i18n';
import { soundManager } from '../../utils/SoundManager';
import { PLAYER_CHARACTER } from '../../content/constants';
import { HudStore } from '../../core/systems/HudStore';

interface ScreenPlayerDiedProps {
    onContinue: () => void;
    isMobileDevice?: boolean;
}

const ScreenPlayerDied: React.FC<ScreenPlayerDiedProps> = ({ onContinue, isMobileDevice }) => {
    const [isVisible, setIsVisible] = useState(false);

    // Fetch data once on mount. Use fallbacks to prevent .toUpperCase() crashes on undefined.
    const hud = HudStore.getData();
    const {
        killerName = 'UNKNOWN',
        killerAttackName: attackName = '',
        killedByEnemy = false
    } = hud;

    useEffect(() => {
        soundManager.playUiConfirm();
        const tId = setTimeout(() => setIsVisible(true), 10);
        return () => clearTimeout(tId);
    }, []);

    // Zero-GC: Memoize string formatting so it doesn't reallocate if the component re-renders (e.g. on resize)
    const { deathPhrase, killerDisplayName } = useMemo(() => {
        const phrase = killedByEnemy ? t('ui.killed_by') : t('ui.died_from');
        const displayName = killedByEnemy && attackName
            ? `${killerName.toUpperCase()} (${t(`attacks.${attackName}.title`)})`
            : killerName.toUpperCase();

        return { deathPhrase: phrase, killerDisplayName: displayName };
    }, [killedByEnemy, killerName, attackName]);

    return (
        <div
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/70 backdrop-blur-md p-4 sm:p-8 text-white font-sans select-none overflow-hidden transition-opacity duration-500"
            style={{ opacity: isVisible ? 1 : 0 }}
        >
            {/* Background Aesthetic */}
            <div className="absolute inset-0 pointer-events-none opacity-40">
                <div className="w-full h-full bg-[radial-gradient(circle_at_center,_transparent_0%,_black_95%)]" />
            </div>

            <div className={`relative z-10 max-w-4xl w-full flex flex-col items-center ${isMobileDevice ? 'gap-6' : 'gap-12'} text-center animate-[fadeIn_0.6s_ease-out_forwards]`}>
                {/* Header */}
                <div className="flex flex-col gap-2">
                    <h2 className={`text-red-600 font-bold tracking-[0.3em] ${isMobileDevice ? 'text-lg' : 'text-xl'} uppercase animate-pulse`}>
                        {PLAYER_CHARACTER.name} {deathPhrase}
                    </h2>
                    <div className="h-1 w-24 bg-red-600 mx-auto rounded-full" />
                </div>

                {/* Killer Name / Death Cause */}
                <div className="min-h-[100px] flex items-center justify-center px-4 relative w-full">
                    <p className={`${isMobileDevice ? 'text-3xl' : 'text-4xl md:text-6xl'} font-light italic leading-relaxed text-gray-200 drop-shadow-[0_0_15px_rgba(0,0,0,1)] z-20`}>
                        {killerDisplayName}
                    </p>
                </div>

                {/* Action Button */}
                <div className={`relative flex flex-col items-center gap-8 ${isMobileDevice ? 'mt-6' : 'mt-12'} w-full z-10 animate-[fadeIn_0.6s_ease-out_forwards]`}>
                    <button
                        onClick={onContinue}
                        className={`group relative ${isMobileDevice ? 'px-12 py-4' : 'px-16 py-5'} bg-white text-black border-4 border-black transition-all duration-200 hover:scale-105 active:scale-95 rounded-full overflow-hidden min-w-[240px] sm:min-w-[280px] shadow-[0_0_30px_rgba(255,255,255,0.1)] pointer-events-auto`}>
                        <span className={`relative z-10 ${isMobileDevice ? 'text-lg' : 'text-xl'} font-black tracking-[0.2em] uppercase`}>
                            {t('ui.continue')}
                        </span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ScreenPlayerDied;