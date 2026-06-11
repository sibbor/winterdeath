import React, { useEffect, useState } from 'react';
import { useHudStore } from '../../../hooks/useHudStore';
import { DataResolver } from '../../../core/data/DataResolver';
import { t } from '../../../utils/i18n';

interface SectorBannerProps {
    active: boolean;
    onComplete: () => void;
}

const SectorBanner: React.FC<SectorBannerProps> = ({ active, onComplete }) => {
    const sectorNameKey = useHudStore(s => s.sectorName);
    const currentSector = useHudStore(s => s.currentSector);

    const [animationState, setAnimationState] = useState<'idle' | 'in' | 'visible' | 'out'>('idle');

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
        }, 500);

        const t2 = setTimeout(() => {
            setAnimationState('out');
        }, 2000);

        const t3 = setTimeout(() => {
            onComplete();
        }, 2250);

        return () => {
            clearTimeout(t1);
            clearTimeout(t2);
            clearTimeout(t3);
        };
    }, [active, onComplete]);

    if (!active || animationState === 'idle') return null;

    const name = sectorNameKey ? t(sectorNameKey) : t(DataResolver.getSectorName(currentSector));
    const sectorIndexFormatted = String(currentSector).padStart(3, '0');
    const indexText = `Sector ${sectorIndexFormatted}`;

    let animationClass = '';
    if (animationState === 'in') {
        animationClass = 'animate-sector-banner-in';
    } else if (animationState === 'out') {
        animationClass = 'animate-sector-banner-out';
    } else if (animationState === 'visible') {
        animationClass = 'opacity-100 filter-none transform-none';
    }

    return (
        <div className={`fixed bottom-24 left-16 z-[500] pointer-events-none ${animationClass}`}>
            <div className="relative p-8 flex flex-col items-start min-w-[400px]">
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
                    {/* SECTOR NAME (Gold/Yellow project color) */}
                    <span className="text-4xl font-mono font-black text-[#bfa979] tracking-[0.25em] uppercase drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                        {name}
                    </span>

                    {/* DIVIDER LINE (Gold fading out with decorative tick on left) */}
                    <div className="w-full relative h-[1px] my-3 overflow-visible min-w-[300px]">
                        <div className="absolute inset-0 bg-gradient-to-r from-[#bfa979]/80 via-[#bfa979]/40 to-transparent" />
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-[#bfa979] rotate-45" />
                    </div>

                    {/* SECTOR INDEX (Teal/Cyan capsule indented) */}
                    <div className="relative mt-1 ml-8 px-4 py-1 flex items-center justify-center rounded bg-[#132224]/90 border border-[#2dd4bf]/30 backdrop-blur-md shadow-[0_0_15px_rgba(45,212,212,0.15)]">
                        <span className="text-[11px] font-mono font-bold text-[#2dd4bf] tracking-[0.3em] uppercase">
                            {indexText}
                        </span>
                    </div>
                </div>
            </div>

            <style>{`
                @keyframes sectorBannerIn {
                    0% { opacity: 0; filter: blur(20px); transform: translateX(-80px); }
                    100% { opacity: 1; filter: blur(0px); transform: translateX(0); }
                }
                @keyframes sectorBannerOut {
                    0% { opacity: 1; filter: blur(0px); transform: translateX(0); }
                    100% { opacity: 0; filter: blur(10px); transform: translateX(-40px); }
                }
                .animate-sector-banner-in {
                    animation: sectorBannerIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                }
                .animate-sector-banner-out {
                    animation: sectorBannerOut 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                }
            `}</style>
        </div>
    );
};

export default SectorBanner;
