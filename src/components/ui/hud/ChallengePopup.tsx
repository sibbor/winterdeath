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
            <div className="bg-black/95 border-l-4 border-[var(--tier-color)] p-5 shadow-[0_15px_50px_rgba(0,0,0,0.9)] backdrop-blur-md hud-gritty-base min-w-[300px] overflow-hidden cursor-pointer hover:bg-zinc-900/40 transition-colors">
                <div className="flex flex-col relative z-10">
                    <span className="text-[11px] font-black uppercase tracking-[0.4em] leading-none mb-2 opacity-80" style={{ color: currentTierColor.str }}>
                        {t('ui.challenge_complete')}
                    </span>

                    <div className="flex items-baseline gap-2">
                        <h3 className="text-2xl font-black text-white uppercase tracking-tighter italic leading-none">
                            {t(def.titleKey)}
                        </h3>
                        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: currentTierColor.str }}>
                            {t('ui.challenge_tier', { tier: tier })}
                        </span>
                    </div>

                    <div className="h-[1px] w-full bg-white/10 my-3" />

                    <p className="text-xs text-white/70 font-medium leading-relaxed italic mb-3">
                        {t(def.descriptionKey).replace('{target}', target.toString())}
                    </p>

                    <div className="flex items-center justify-between mt-1">
                        <div className="flex items-center gap-1.5 opacity-60">
                            <div className="px-1.5 py-0.5 border border-white/30 rounded text-[10px] font-mono font-bold text-white uppercase">
                                {isMobileDevice ? t('ui.tap') : 'ENTER'}
                            </div>
                            <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{t('ui.view_details')}</span>
                        </div>

                        <div className="bg-red-600/20 border border-red-500/50 px-2 py-1 rounded-sm shadow-[0_0_10px_rgba(239,68,68,0.2)]">
                            <span className="text-sm font-black text-red-500 font-mono">+{cpReward} CP</span>
                        </div>
                    </div>
                </div>

                <div className="absolute top-0 right-0 p-1 opacity-20 pointer-events-none">
                    <span className="text-4xl">🏆</span>
                </div>
                <div className="absolute inset-0 hud-noise-overlay opacity-10 pointer-events-none" />
                <div className="absolute bottom-0 left-0 h-1 bg-gradient-to-r from-transparent via-[var(--tier-color)] to-transparent w-full opacity-50" />
            </div>

            <style>{`
                @keyframes challengePop {
                    0% { opacity: 0; transform: translateX(50px) skewX(-10deg); }
                    10% { opacity: 1; transform: translateX(0) skewX(0); }
                    90% { opacity: 1; transform: translateX(0); }
                    100% { opacity: 0; transform: translateX(20px) translateY(-10px); }
                }
                .animate-challengePop {
                    animation: challengePop 6000ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
                }
            `}</style>
        </div>
    );
};

export default ChallengePopup;