import React, { useEffect, useState, useMemo } from 'react';
import { t } from '../../../utils/i18n';
import { UISounds } from '../../../utils/audio/AudioLib';
import { useHudStore } from '../../../hooks/useHudStore';
import { DataResolver } from '../../../core/data/DataResolver';
import { HORIZONTAL_HATCHING_STYLE_DARK } from './ModalLayout';
import { StatusEffectID } from '../../../types/StatusEffects';
import { EnemyAttackType } from '../../../entities/player/CombatTypes';

interface ScreenPlayerDiedProps {
    onContinue: () => void;
    onRespawn: () => void;
    onRespawnAtBoss?: () => void;
    isMobileDevice?: boolean;
}

const ScreenPlayerDied: React.FC<ScreenPlayerDiedProps> = ({ onContinue, onRespawn, onRespawnAtBoss, isMobileDevice }) => {
    const [isVisible, setIsVisible] = useState(false);

    // Fetch data using optimized selectors
    const killerName = useHudStore(s => s.killerName || t('ui.unknown'));
    const deathReason = useHudStore(s => s.killerAttackName || '');
    const killedByEnemy = useHudStore(s => s.killedByEnemy || false);
    const lethalSourceId = useHudStore(s => s.lethalSourceId ?? StatusEffectID.NONE);
    const lethalStatusEffect = useHudStore(s => s.lethalStatusEffect ?? StatusEffectID.NONE);
    const bossSpawned = useHudStore(s => s.bossSpawned || s.bossActive);

    useEffect(() => {
        UISounds.playDefeat();
        const tId = setTimeout(() => setIsVisible(true), 10);
        return () => clearTimeout(tId);
    }, []);

    // Allow pressing Enter to continue
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                onContinue();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onContinue]);

    // Zero-GC: Memoize death details
    const { deathPhrase, deathDisplayText, deathDescription, headerText } = useMemo(() => {
        const phrase = killedByEnemy ? t('ui.killed_by') : t('ui.died_from');

        // killerName and deathReason are now keys or pre-resolved names
        const nameResolved = killerName.includes('.') ? t(killerName) : killerName;
        const attackResolved = deathReason.includes('.') ? t(deathReason) : deathReason;

        let displayName = nameResolved.toUpperCase();

        // Granular Attribution Logic
        if (killedByEnemy) {
            if (lethalStatusEffect !== StatusEffectID.NONE) {
                // Killed by Enemy via DoT (e.g. Walker (Bite [Bleeding]))
                const effectName = t(DataResolver.getPerkName(lethalStatusEffect));
                let attackType = EnemyAttackType.HIT;
                if (lethalStatusEffect === StatusEffectID.BLEEDING) {
                    attackType = EnemyAttackType.BITE;
                } else if (lethalStatusEffect === StatusEffectID.ELECTRIFIED) {
                    attackType = EnemyAttackType.ELECTRIC_BEAM;
                } else if (lethalStatusEffect === StatusEffectID.FREEZING) {
                    attackType = EnemyAttackType.FREEZE_JUMP;
                }
                const attackName = t(DataResolver.getAttackName(attackType));
                displayName = `${nameResolved.toUpperCase()} (${attackName} [${effectName}])`;
            } else if (deathReason && deathReason !== 'attacks.HIT.title' && deathReason !== 'HIDDEN') {
                // Killed by Enemy via direct attack
                displayName = `${nameResolved.toUpperCase()} (${attackResolved})`;
            }
        } else {
            // Environmental Death
            if (lethalStatusEffect !== StatusEffectID.NONE) {
                displayName = t(DataResolver.getPerkName(lethalStatusEffect)).toUpperCase();
            } else {
                displayName = nameResolved.toUpperCase();
            }
        }

        const description = (killedByEnemy || lethalStatusEffect === StatusEffectID.NONE)
            ? t(DataResolver.getAttackDescription(deathReason as any))
            : t(DataResolver.getPerkDescription(lethalStatusEffect));

        return {
            deathPhrase: phrase,
            deathDisplayText: displayName,
            deathDescription: description,
            headerText: t('ui.player_died', { name: DataResolver.getPlayerName() })
        };
    }, [killedByEnemy, killerName, deathReason, lethalSourceId, lethalStatusEffect]);

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
                    <h2 className={`text-red-600 font-black tracking-[0.4em] ${isMobileDevice ? 'text-lg' : 'text-xl'} uppercase animate-pulse`}>
                        {headerText}
                    </h2>
                    <div className="h-1 w-24 bg-red-600 mx-auto rounded-full" />
                </div>

                {/* Killer Name / Death Cause */}
                <div className="flex flex-col items-center justify-center gap-2 px-4 relative w-full">
                    <span className="text-zinc-500 font-bold uppercase tracking-[0.2em] text-sm">
                        {deathPhrase}
                    </span>
                    <p className={`${isMobileDevice ? 'text-3xl' : 'text-4xl md:text-5xl'} font-light font-mono italic leading-relaxed text-gray-100 drop-shadow-[0_0_15px_rgba(0,0,0,1)] z-20`}>
                        {deathDisplayText}
                    </p>
                    {deathDescription && deathDescription !== 'ui.description_missing' && !deathDescription.startsWith('attacks.') && (
                        <p className={`${isMobileDevice ? 'text-base' : 'text-lg'} text-gray-400 font-medium font-mono italic max-w-2xl mt-4 leading-relaxed tracking-wide opacity-80 animate-fadeIn`}>
                            "{deathDescription}"
                        </p>
                    )}
                </div>

                {/* Action Buttons */}
                <div className={`relative flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6 ${isMobileDevice ? 'mt-6' : 'mt-12'} w-full z-10 animate-deathFadeIn`}>

                    {/* 1. Respawn at Boss Button (Only if boss was active) */}
                    {bossSpawned && onRespawnAtBoss && (
                        <button
                            onClick={onRespawnAtBoss}
                            className={`group relative ${isMobileDevice ? 'px-8 py-3' : 'px-10 py-4'} bg-orange-600 text-white border-4 border-black shadow-[0_0_40px_rgba(255,165,0,0.2)] transition-all duration-200 hover:scale-105 active:scale-95 rounded-full overflow-hidden min-w-[200px] pointer-events-auto`}>
                            <div className="absolute inset-0 opacity-10 group-hover:opacity-30 transition-opacity" style={HORIZONTAL_HATCHING_STYLE_DARK} />
                            <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300" />
                            <span className={`relative z-10 ${isMobileDevice ? 'text-base' : 'text-lg'} font-black tracking-[0.2em] uppercase`}>
                                {t('ui.respawn_at_boss')}
                            </span>
                        </button>
                    )}

                    {/* 2. Respawn Button (Instant - Start of sector) */}
                    <button
                        onClick={onRespawn}
                        className={`group relative ${isMobileDevice ? 'px-8 py-3' : 'px-10 py-4'} bg-red-600 text-white border-4 border-black shadow-[0_0_40px_rgba(255,0,0,0.2)] transition-all duration-200 hover:scale-105 active:scale-95 rounded-full overflow-hidden min-w-[200px] pointer-events-auto`}>
                        <div className="absolute inset-0 opacity-10 group-hover:opacity-30 transition-opacity" style={HORIZONTAL_HATCHING_STYLE_DARK} />
                        <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300" />
                        <span className={`relative z-10 ${isMobileDevice ? 'text-base' : 'text-lg'} font-black tracking-[0.2em] uppercase`}>
                            {t('ui.respawn')}
                        </span>
                    </button>

                    {/* 3. Continue Button (To Report) */}
                    <button
                        onClick={onContinue}
                        className={`group relative ${isMobileDevice ? 'px-8 py-3' : 'px-10 py-4'} bg-white text-black border-4 border-black hover:bg-gray-200 transition-all duration-200 hover:scale-105 active:scale-95 rounded-full overflow-hidden min-w-[200px] shadow-[0_0_30px_rgba(255,255,255,0.1)] pointer-events-auto`}>
                        <div className="absolute inset-0 opacity-10 group-hover:opacity-20 transition-opacity" style={HORIZONTAL_HATCHING_STYLE_DARK} />
                        <span className={`relative z-10 ${isMobileDevice ? 'text-base' : 'text-lg'} font-black tracking-[0.2em] uppercase`}>
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
