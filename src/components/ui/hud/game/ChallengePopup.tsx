import React, { useRef, useCallback, useEffect } from 'react';
import { useUIEventBridge } from '../../../../hooks/useUIEventBridge';
import { UIEventType } from '../../../../systems/ui/UIEventRingBuffer';
import { t } from '../../../../utils/i18n';
import { UISounds } from '../../../../utils/audio/AudioLib';
import { CHALLENGES } from '../../../../content/challenges';
import { DiscoveryType } from './HudTypes';
import { HudStore } from '../../../../store/HudStore';
import { InputAction, INPUT_KEY_MAP } from '../../../../core/engine/InputManager';
import { TIER_COLORS } from '../../../../utils/ui/ColorUtils';
import { GameSettings } from '../../../../types/StateTypes';

interface ChallengePopupProps {
    onOpenAdventureLog?: (tab: any, itemId: string) => void;
    settings?: GameSettings;
}

/**
 * ChallengePopup — Zero-GC DOM mutation pattern (same as DiscoveryPopup).
 * No useState, no React re-renders. Drives visibility and content via direct ref writes.
 */
const ChallengePopup: React.FC<ChallengePopupProps> = ({ onOpenAdventureLog, settings }) => {
    const settingsRef = useRef(settings);
    useEffect(() => {
        settingsRef.current = settings;
    }, [settings]);

    // DOM node refs — never re-allocated
    const containerRef = useRef<HTMLDivElement>(null);
    const headerLabelRef = useRef<HTMLSpanElement>(null);
    const titleRef = useRef<HTMLHeadingElement>(null);
    const tierRef = useRef<HTMLSpanElement>(null);
    const descRef = useRef<HTMLParagraphElement>(null);
    const cpRef = useRef<HTMLSpanElement>(null);
    const badgeRef = useRef<HTMLSpanElement>(null);

    // State tokens — no React state involvement
    const isVisibleRef = useRef(false);
    const activeChallengeIdRef = useRef(-1);
    const lastProcessedP1 = useRef<number>(-1);
    const timeoutRef = useRef<any>(null);

    const hide = useCallback(() => {
        isVisibleRef.current = false;
        activeChallengeIdRef.current = -1;
        if (containerRef.current) {
            containerRef.current.style.display = 'none';
            containerRef.current.style.animation = 'none';
        }
    }, []);

    const show = useCallback((challengeId: number, tier: number) => {
        const challenge = CHALLENGES[challengeId];
        if (!challenge) return;

        activeChallengeIdRef.current = challengeId;

        const tierColor = tier === 1 ? TIER_COLORS.BRONZE : (tier === 2 ? TIER_COLORS.SILVER : TIER_COLORS.GOLD);
        const cpReward = challenge.cpRewards[tier - 1] || 0;
        const target = challenge.targets[tier - 1];
        const isMobileDevice = HudStore.getState().isMobileDevice;

        // Populate all DOM nodes before revealing the container
        if (headerLabelRef.current) headerLabelRef.current.style.color = tierColor.str;
        if (titleRef.current) titleRef.current.innerText = t(challenge.titleKey);
        if (tierRef.current) {
            tierRef.current.innerText = `[${t('ui.challenge_tier', { tier })}]`;
            tierRef.current.style.color = tierColor.str;
        }
        if (descRef.current) descRef.current.innerText = t(challenge.descriptionKey).replace('{target}', target.toString());
        if (cpRef.current) cpRef.current.innerText = `+${cpReward} CP`;
        if (badgeRef.current) badgeRef.current.innerText = isMobileDevice ? t('ui.tap') : 'ENTER';

        // Trigger animation (V8 reflow reset — same pattern as DiscoveryPopup)
        if (containerRef.current) {
            containerRef.current.style.setProperty('--tier-color', tierColor.str);
            containerRef.current.style.display = 'block';
            containerRef.current.style.animation = 'none';
            void containerRef.current.offsetHeight;
            containerRef.current.style.animation = 'challengePop 6000ms cubic-bezier(0.16, 1, 0.3, 1) forwards';
        }

        isVisibleRef.current = true;
        UISounds.playDiscovery();

        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(hide, 6000);
    }, [hide]);

    const handleInteraction = useCallback(() => {
        if (!isVisibleRef.current || !onOpenAdventureLog) return;
        UISounds.playDiscovery();
        onOpenAdventureLog(DiscoveryType.CHALLENGE, activeChallengeIdRef.current.toString());
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        hide();
    }, [onOpenAdventureLog, hide]);

    // UIEventBridge hot path — no allocations
    useUIEventBridge(useCallback((type, p1) => {
        if (type !== UIEventType.CHALLENGE_COMPLETE) return;
        if (settingsRef.current?.showChallengePopups === false) return;
        if (p1 === lastProcessedP1.current) return;
        lastProcessedP1.current = p1;

        const challengeId = p1 >> 8;
        const tier = p1 & 0xFF;
        show(challengeId, tier);
    }, [show]));

    // Keyboard confirm handler
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (isVisibleRef.current && INPUT_KEY_MAP[e.key] === InputAction.ENTER) {
                e.preventDefault();
                handleInteraction();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, [handleInteraction]);

    return (
        <div
            ref={containerRef}
            className="fixed top-1/4 right-8 z-[10000] pointer-events-auto"
            style={{ display: 'none', willChange: 'transform, opacity' }}
            onClick={handleInteraction}
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
                    <span ref={headerLabelRef} className="text-[10px] font-mono font-bold tracking-[0.3em] uppercase leading-none mb-2">
                        {t('ui.challenge_complete')}
                    </span>

                    <div className="flex flex-col items-center gap-1 mb-2">
                        <h3 ref={titleRef} className="text-xl font-mono font-black text-white uppercase tracking-widest leading-tight">-</h3>
                        <span ref={tierRef} className="text-[9px] font-mono font-bold uppercase tracking-widest opacity-80">-</span>
                    </div>

                    <p ref={descRef} className="text-[11px] text-zinc-300 font-mono leading-relaxed mb-4">-</p>

                    <div className="flex flex-col items-center gap-3 w-full">
                        <div className="bg-[#ef4444]/10 border border-[#ef4444]/20 px-3 py-1 rounded-sm shadow-[0_0_10px_rgba(239,68,68,0.1)]">
                            <span ref={cpRef} className="text-xs font-black text-[#ef4444] font-mono">-</span>
                        </div>
                        <div className="relative flex items-center justify-center min-w-[48px] h-8 border border-[#bfa979]/30 rounded bg-black/40 px-3 hover:bg-[#bfa979]/20 transition-all active:scale-95 shadow-[0_0_15px_rgba(0,0,0,0.5)]">
                            <span ref={badgeRef} className="text-[9px] font-mono font-bold text-[#bfa979] tracking-widest uppercase">-</span>
                        </div>
                    </div>
                </div>

                <div className="absolute top-2 right-2 opacity-5 pointer-events-none">
                    <span className="text-3xl">🏆</span>
                </div>
            </div>

            <style>{`
                @keyframes challengePop {
                    0%   { opacity: 0; transform: translateX(50px) scale(0.95); filter: blur(8px); }
                    10%  { opacity: 1; transform: translateX(0) scale(1); filter: blur(0px); }
                    90%  { opacity: 1; transform: translateX(0) scale(1); filter: blur(0px); }
                    100% { opacity: 0; transform: translateX(25px) translateY(-10px) scale(0.95); filter: blur(4px); }
                }
            `}</style>
        </div>
    );
};

export default ChallengePopup;