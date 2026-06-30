import React, { useEffect, useState, useMemo } from 'react';
import { useHudStore } from '../../../../hooks/useHudStore';
import { DataResolver } from '../../../../core/data/DataResolver';
import { t } from '../../../../utils/i18n';

interface SideBannerProps {
    active: boolean;
    onComplete: () => void;
    isBossIntro: boolean;
    isMobileDevice: boolean;
}

const SideBanner: React.FC<SideBannerProps> = ({ active, onComplete, isBossIntro, isMobileDevice }) => {
    const [animationState, setAnimationState] = useState<'idle' | 'in' | 'visible' | 'out'>('idle');

    // ============================================================================
    // Banner content derived here — no longer delegated to GameHUD
    // ============================================================================
    const currentSector = useHudStore(s => s.currentSector);
    const sectorName = useHudStore(s => s.sectorName);
    const bossNameKey = useHudStore(s => s.bossName);

    const isSideBanner = active && !isBossIntro;

    const title = useMemo(() => {
        if (isSideBanner) return sectorName ? t(sectorName) : t(DataResolver.getSectorName(currentSector));
        if (isBossIntro) return bossNameKey ? t(bossNameKey) : t(DataResolver.getBossName(currentSector));
        return '';
    }, [isSideBanner, isBossIntro, currentSector, sectorName, bossNameKey]);

    const subtitle = useMemo(() => {
        if (isSideBanner) return `Sector ${String(currentSector).padStart(3, '0')}`;
        if (isBossIntro) return t('ui.boss_encounter');
        return '';
    }, [isSideBanner, isBossIntro, currentSector]);

    const onCompleteRef = React.useRef(onComplete);
    useEffect(() => {
        onCompleteRef.current = onComplete;
    }, [onComplete]);

    useEffect(() => {
        if (!active) {
            setAnimationState('idle');
            return;
        }

        setAnimationState('in');

        // Timing flow:
        // 0ms - 500ms: Slide-in and unblur
        // 500ms - 2000ms: Fully visible static display (1.5 seconds)
        // 2000ms - 2250ms: Fade out animation (250ms)
        // 2250ms: Complete and notify parent to show the rest of the HUD
        const t1 = setTimeout(() => {
            setAnimationState('visible');
        }, 1000);

        const t2 = setTimeout(() => {
            setAnimationState('out');
        }, 3000);

        const t3 = setTimeout(() => {
            onCompleteRef.current();
        }, 3250);

        return () => {
            clearTimeout(t1);
            clearTimeout(t2);
            clearTimeout(t3);
        };
    }, [active]);

    if (!active || animationState === 'idle') return null;

    let animationClass = '';
    if (animationState === 'in') {
        animationClass = 'animate-side-banner-in';
    } else if (animationState === 'out') {
        animationClass = 'animate-side-banner-out';
    } else if (animationState === 'visible') {
        animationClass = 'opacity-100 filter-none transform-none';
    }

    return (
        <div className={`fixed ${isMobileDevice ? 'bottom-16' : 'bottom-24'} left-0 z-[500] pointer-events-none ${animationClass}`}>
            <div className={`relative ${isMobileDevice ? 'p-4 min-w-[280px]' : 'p-8 min-w-[400px]'} flex flex-col items-start`}>
                {/* SMOKY GRADIENT BACKGROUND (Cinematic, fading to the right) */}
                <div
                    className="absolute inset-y-0 -left-16 right-0 pointer-events-none"
                    style={{
                        background: 'radial-gradient(ellipse at left center, rgba(0, 0, 0, 0.9) 0%, rgba(0, 0, 0, 0.7) 40%, rgba(0, 0, 0, 0.3) 70%, transparent 100%)',
                        filter: 'blur(20px)',
                        transform: 'scaleY(1.3)'
                    }}
                />

                {/* CONTENT */}
                <div className="relative z-10 flex flex-col items-start">
                    {/* TITLE (Gold/Yellow project color) */}
                    <span className={`font-mono ${isMobileDevice ? 'text-3xl' : 'text-4xl'} mb-3 font-black text-[#bfa979] tracking-widest uppercase drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]`}>
                        {title}
                    </span>

                    {/* DIVIDER LINE (Gold fading out with decorative tick on left) */}
                    <div className="w-full relative h-[1px] my-3 overflow-visible min-w-[300px]">
                        <div className="absolute inset-0 bg-gradient-to-r from-[#bfa979]/80 via-[#bfa979]/40 to-transparent" />
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-[#bfa979] rotate-45" />
                    </div>

                    {/* SUBTITLE (Teal/Cyan capsule indented) */}
                    {subtitle && subtitle.trim() !== '' && (
                        <div className="relative mt-1 ml-8 px-4 py-1 flex items-center justify-center rounded bg-[#132224]/90 border border-[#2dd4bf]/30 backdrop-blur-md shadow-[0_0_15px_rgba(45,212,212,0.15)]">
                            <span className="text-[11px] font-mono font-bold text-[#cccccc] tracking-[0.3em] uppercase">
                                {subtitle}
                            </span>
                        </div>
                    )}
                </div>
            </div>

            <style>{`
                @keyframes sideBannerIn {
                    0% { opacity: 0; filter: blur(20px); transform: translateX(-80px); }
                    100% { opacity: 1; filter: blur(0px); transform: translateX(0); }
                }
                @keyframes sideBannerOut {
                    0% { opacity: 1; filter: blur(0px); transform: translateX(0); }
                    100% { opacity: 0; filter: blur(10px); transform: translateX(-40px); }
                }
                .animate-side-banner-in {
                    animation: sideBannerIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                    will-change: transform, opacity;
                }
                .animate-side-banner-out {
                    animation: sideBannerOut 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                    will-change: transform, opacity;
                }
            `}</style>
        </div>
    );
};

export default SideBanner;