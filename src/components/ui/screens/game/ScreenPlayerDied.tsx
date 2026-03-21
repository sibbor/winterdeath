import React, { useEffect, useState, useMemo } from 'react';
import { t } from '../../../../utils/i18n';
import { soundManager } from '../../../../utils/SoundManager';
import { PLAYER_CHARACTER } from '../../../../content/constants';
import { useHudStore } from '../../../../hooks/useHudStore';

interface ScreenPlayerDiedProps {
    onContinue: () => void;
    isMobileDevice?: boolean;
}

const ScreenPlayerDied: React.FC<ScreenPlayerDiedProps> = ({ onContinue, isMobileDevice }) => {
    const [isVisible, setIsVisible] = useState(false);

    // Fetch data using optimized selectors
    const killerName = useHudStore(s => s.killerName || 'UNKNOWN');
    const killerAttackName = useHudStore(s => s.killerAttackName || '');
    const killedByEnemy = useHudStore(s => s.killedByEnemy || false);

    useEffect(() => {
        soundManager.playUiConfirm();
        const tId = setTimeout(() => setIsVisible(true), 10);
        return () => clearTimeout(tId);
    }, []);

    // Allow pressing Enter to continue
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter') onContinue(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onContinue]);

    // Zero-GC: Memoize death details
    const { deathPhrase, killerDisplayName } = useMemo(() => {
        const phrase = killedByEnemy ? t('ui.killed_by') : t('ui.died_from');
        const displayName = killedByEnemy && killerAttackName
            ? `${killerName.toUpperCase()} (${t(`attacks.${killerAttackName}.title`)})`
            : killerName.toUpperCase();

        return { deathPhrase: phrase, killerDisplayName: displayName };
    }, [killedByEnemy, killerName, killerAttackName]);

    return (
        <div
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/70 backdrop-blur-md p-4 sm:p-8 text-white font-sans select-none overflow-hidden transition-opacity duration-500"
            style={{ opacity: isVisible ? 1 : 0 }}
        >
            {/* Background Aesthetic */}
            <div className="absolute inset-0 pointer-events-none opacity-40">
                <div className="w-full h-full bg-[radial-gradient(circle_at_center,_transparent_0%,_black_95%)]" />
            </div>

            <div className={`relative z-10 max-w-4xl w-full flex flex-col items-center ${isMobileDevice ? 'gap-6' : 'gap-12'} text-center animate-deathFadeIn`}>
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
                <div className={`relative flex flex-col items-center gap-8 ${isMobileDevice ? 'mt-6' : 'mt-12'} w-full z-10 animate-deathFadeIn`}>
                    <button
                        onClick={onContinue}
                        className={`group relative ${isMobileDevice ? 'px-12 py-4' : 'px-16 py-5'} bg-white text-black border-4 border-black transition-all duration-200 hover:scale-105 active:scale-95 rounded-full overflow-hidden min-w-[240px] sm:min-w-[280px] shadow-[0_0_30px_rgba(255,255,255,0.1)] pointer-events-auto`}>
                        <span className={`relative z-10 ${isMobileDevice ? 'text-lg' : 'text-xl'} font-black tracking-[0.2em] uppercase`}>
                            {t('ui.continue')}
                        </span>
                    </button>
                </div>
            </div>

            <style>{`
                @keyframes deathFadeIn {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-deathFadeIn { animation: deathFadeIn 0.6s ease-out forwards; }
            `}</style>
        </div>
    );
};

export default ScreenPlayerDied;