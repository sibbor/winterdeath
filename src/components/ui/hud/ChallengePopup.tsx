import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useUIEventBridge } from '../../../hooks/useUIEventBridge';
import { UIEventType } from '../../../systems/ui/UIEventRingBuffer';
import { t } from '../../../utils/i18n';
import { UISounds } from '../../../utils/audio/AudioLib';
import { CHALLENGES, ChallengeDef } from '../../../content/challenges';
import { DiscoveryType } from './HudTypes';
import { HudStore } from '../../../store/HudStore';
import { InputAction, INPUT_KEY_MAP } from '../../../core/engine/InputManager';
import { TIER_COLORS } from '../../../utils/ui/ColorUtils';

interface ChallengePopupProps {
    onOpenAdventureLog?: (tab: any, itemId: string) => void;
}

const ChallengePopup: React.FC<ChallengePopupProps> = ({ onOpenAdventureLog }) => {
    const [activeChallenge, setActiveChallenge] = useState<{ def: ChallengeDef, tier: number, timestamp: number } | null>(null);
    const timeoutRef = useRef<any>(null);
    const visibleRef = useRef(false);

    // FIXED: Hysteresis latch tracks uniquely encoded milestone IDs to block ring-buffer retention loops
    const lastProcessedP1 = useRef<number>(-1);

    // Sync visibility for key listener
    useEffect(() => {
        visibleRef.current = !!activeChallenge;
    }, [activeChallenge]);

    const handleChallengeInteraction = useCallback(() => {
        if (!activeChallenge || !onOpenAdventureLog) return;
        UISounds.playDiscovery();
        onOpenAdventureLog(DiscoveryType.CHALLENGE, activeChallenge.def.id.toString());
        setActiveChallenge(null);
    }, [activeChallenge, onOpenAdventureLog]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const action = INPUT_KEY_MAP[e.key];
            const isTargetAction = action === InputAction.ENTER;

            if (visibleRef.current && isTargetAction) {
                e.preventDefault();
                handleChallengeInteraction();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, [handleChallengeInteraction]);

    useUIEventBridge(useCallback((type, p1) => {
        if (type === UIEventType.CHALLENGE_COMPLETE) {
            // FIXED: Early exit guard stops event duplication from triggering UI sounds or component thrashing
            if (p1 === lastProcessedP1.current) return;
            lastProcessedP1.current = p1; // Lock latch immediately

            // DECODE: (ChallengeID << 8) | NewTier
            const challengeId = p1 >> 8;
            const tier = p1 & 0xFF;
            const challenge = CHALLENGES[challengeId];

            if (challenge) {
                setActiveChallenge({ def: challenge, tier, timestamp: Date.now() });
                UISounds.playDiscovery();

                if (timeoutRef.current) clearTimeout(timeoutRef.current);
                timeoutRef.current = setTimeout(() => {
                    setActiveChallenge(null);
                }, 6000);
            }
        }
    }, []));

    if (!activeChallenge) return null;

    const { def, tier } = activeChallenge;
    const cpReward = def.cpRewards[tier - 1] || 0;
    const target = def.targets[tier - 1];
    const isMobileDevice = HudStore.getState().isMobileDevice;

    const currentTierColor = tier === 1 ? TIER_COLORS.BRONZE : (tier === 2 ? TIER_COLORS.SILVER : TIER_COLORS.GOLD);

    return (
        <div
            key={activeChallenge.timestamp}
            className="fixed top-1/4 right-8 z-[10000] pointer-events-auto animate-challengePop"
            onClick={handleChallengeInteraction}
            style={{ '--tier-color': currentTierColor.str } as any}
        >
            <div className="relative p-6 flex flex-col items-center justify-center min-w-[320px] max-w-[380px] cursor-pointer group text-center">
                {/* SMOKY CINEMATIC BACKGROUND */}
                <div
                    className="absolute inset-0 pointer-events-none transition-opacity duration-300 group-hover:opacity-80"
                    style={{
                        background: 'radial-gradient(50% 50% at 50% 50%, rgba(0, 0, 0, 0.95) 0%, rgba(0, 0, 0, 0.65) 60%, transparent 100%)',
                        filter: 'blur(16px)',
                        transform: 'scaleX(1.3) scaleY(1.15)'
                    }}
                />

                <div className="relative flex flex-col items-center z-10 w-full">
                    <span className="text-[10px] font-mono font-bold tracking-[0.3em] uppercase leading-none mb-2" style={{ color: currentTierColor.str }}>
                        {t('ui.challenge_complete')}
                    </span>

                    <div className="flex flex-col items-center gap-1 mb-2">
                        <h3 className="text-xl font-mono font-black text-white uppercase tracking-widest leading-tight">
                            {t(def.titleKey)}
                        </h3>
                        <span className="text-[9px] font-mono font-bold uppercase tracking-widest opacity-80" style={{ color: currentTierColor.str }}>
                            [{t('ui.challenge_tier', { tier: tier })}]
                        </span>
                    </div>

                    <p className="text-[11px] text-zinc-300 font-mono leading-relaxed mb-4">
                        {t(def.descriptionKey).replace('{target}', target.toString())}
                    </p>

                    <div className="flex flex-col items-center gap-3 w-full">
                        <div className="bg-[#ef4444]/10 border border-[#ef4444]/20 px-3 py-1 rounded-sm shadow-[0_0_10px_rgba(239,68,68,0.1)]">
                            <span className="text-xs font-black text-[#ef4444] font-mono">+{cpReward} CP</span>
                        </div>

                        {/* ACTION BADGE */}
                        <div className="relative flex items-center justify-center min-w-[48px] h-8 border border-[#bfa979]/30 rounded bg-black/40 px-3 hover:bg-[#bfa979]/20 transition-all active:scale-95 shadow-[0_0_15px_rgba(0,0,0,0.5)]">
                            <span className="text-[9px] font-mono font-bold text-[#bfa979] tracking-widest uppercase">
                                {isMobileDevice ? t('ui.tap') : 'ENTER'}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="absolute top-2 right-2 opacity-5 pointer-events-none">
                    <span className="text-3xl">🏆</span>
                </div>
            </div>

            <style>{`
                @keyframes challengePop {
                    0% { opacity: 0; transform: translateX(50px) scale(0.95); filter: blur(8px); }
                    10% { opacity: 1; transform: translateX(0) scale(1); filter: blur(0px); }
                    90% { opacity: 1; transform: translateX(0) scale(1); filter: blur(0px); }
                    100% { opacity: 0; transform: translateX(25px) translateY(-10px) scale(0.95); filter: blur(4px); }
                }
                .animate-challengePop {
                    animation: challengePop 6000ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
                    will-change: transform, opacity;
                }
            `}</style>
        </div>
    );
};

export default ChallengePopup;