import React, { useRef, useCallback } from 'react';
import { useUIEventBridge } from '../../../../hooks/useUIEventBridge';
import { UIEventType } from '../../../../systems/ui/UIEventRingBuffer';
import { t } from '../../../../utils/i18n';

/**
 * LevelUpBanner - Zero-GC presentation overlay.
 * Directly mutates the DOM to prevent React re-renders and heap allocations.
 */
const LevelUpBanner: React.FC = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const levelTextRef = useRef<HTMLSpanElement>(null);
    const timeoutRef = useRef<any>(null);

    const handleLevelUp = useCallback((type: UIEventType, level: any) => {
        if (type !== UIEventType.LEVEL_UP) return;

        if (levelTextRef.current) {
            levelTextRef.current.innerText = `LEVEL ${level}`;
        }

        if (containerRef.current) {
            containerRef.current.style.display = 'block';
            containerRef.current.style.animation = 'none';
            void containerRef.current.offsetHeight; // Force DOM reflow
            containerRef.current.style.animation = 'level-pop 4000ms cubic-bezier(0.25, 1, 0.5, 1) forwards';
        }

        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
            if (containerRef.current) {
                containerRef.current.style.display = 'none';
            }
        }, 4000);
    }, []);

    useUIEventBridge(handleLevelUp);

    return (
        <div
            ref={containerRef}
            className="fixed top-12 left-1/2 -translate-x-1/2 z-[10000] pointer-events-none"
            style={{ display: 'none', willChange: 'transform, opacity' }}
        >
            <div className="relative p-8 flex flex-col items-center justify-center min-w-[450px] text-center">
                {/* SMOKY CINEMATIC BACKGROUND */}
                <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                        background: 'radial-gradient(50% 50% at 50% 50%, rgba(0, 0, 0, 0.95) 0%, rgba(0, 0, 0, 0.65) 50%, transparent 100%)',
                        filter: 'blur(16px)',
                        transform: 'scaleX(1.3) scaleY(1.1)'
                    }}
                />

                <div className="relative flex flex-col items-center z-10 w-full">
                    <div className="flex items-center gap-3 mb-2 animate-pulse">
                        <span className="text-[13px] font-mono font-bold text-[#bfa979] tracking-[0.3em] uppercase leading-none drop-shadow-md">
                            {t('ui.level_up')}
                        </span>
                    </div>

                    <span ref={levelTextRef} className="text-3xl font-mono font-black text-white uppercase tracking-widest leading-tight drop-shadow-lg">
                        LEVEL --
                    </span>
                </div>
            </div>

            <style>{`
                @keyframes level-pop {
                    0% { opacity: 0; transform: translateX(-50%) translateY(40px) scale(0.85); filter: blur(10px); }
                    10% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1.05); filter: blur(0px); }
                    15% { transform: translateX(-50%) scale(1); filter: blur(0px); }
                    85% { opacity: 1; transform: translateX(-50%) translateY(-5px) scale(1); filter: blur(0px); }
                    100% { opacity: 0; transform: translateX(-50%) translateY(-25px) scale(0.95); }
                }
            `}</style>
        </div>
    );
};

export default React.memo(LevelUpBanner);
