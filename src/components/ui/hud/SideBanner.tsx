import React, { useEffect, useState } from 'react';

interface SideBannerProps {
    active: boolean;
    onComplete: () => void;
}

const SideBanner: React.FC<SideBannerProps> = ({ active, onComplete }) => {

    const [animationState, setAnimationState] = useState<'idle' | 'in' | 'visible' | 'out'>('idle');
    const [title, setTitle] = useState<string | null>(null);
    const [subtitle, setSubtitle] = useState<string | null>(null);

    useEffect(() => {
        const handlePreview = (e: Event) => {
            const customEvent = e as CustomEvent;
            if (customEvent.detail) {
                setTitle(customEvent.detail.title || null);
                setSubtitle(customEvent.detail.subtitle || null);
            }
        };
        window.addEventListener('trigger-side-banner-preview', handlePreview);
        return () => window.removeEventListener('trigger-side-banner-preview', handlePreview);
    }, []);

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
            // Reset custom title and subtitle after animation finishes
            setTitle(null);
            setSubtitle(null);
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
        <div className={`fixed bottom-24 left-0 z-[500] pointer-events-none ${animationClass}`}>
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
                    {/* TITLE (Gold/Yellow project color) */}
                    <span className="text-4xl font-mono font-black text-[#bfa979] tracking-[0.25em] uppercase drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                        {title}
                    </span>

                    {/* DIVIDER LINE (Gold fading out with decorative tick on left) */}
                    <div className="w-full relative h-[1px] my-3 overflow-visible min-w-[300px]">
                        <div className="absolute inset-0 bg-gradient-to-r from-[#bfa979]/80 via-[#bfa979]/40 to-transparent" />
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-[#bfa979] rotate-45" />
                    </div>

                    {/* SUBTITLE (Teal/Cyan capsule indented) */}
                    <div className="relative mt-1 ml-8 px-4 py-1 flex items-center justify-center rounded bg-[#132224]/90 border border-[#2dd4bf]/30 backdrop-blur-md shadow-[0_0_15px_rgba(45,212,212,0.15)]">
                        <span className="text-[11px] font-mono font-bold text-[#cccccc] tracking-[0.3em] uppercase">
                            {subtitle}
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
                .animate-side-banner-in {
                    animation: sectorBannerIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                    will-change: transform, opacity;
                }
                .animate-side-banner-out {
                    animation: sectorBannerOut 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                    will-change: transform, opacity;
                }
            `}</style>
        </div>
    );
};

export default SideBanner;
