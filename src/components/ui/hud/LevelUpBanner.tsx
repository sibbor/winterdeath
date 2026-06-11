import React, { useRef, useCallback } from 'react';
import { useUIEventBridge } from '../../../hooks/useUIEventBridge';
import { UIEventType } from '../../../systems/ui/UIEventRingBuffer';
import { t } from '../../../utils/i18n';

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
            containerRef.current.style.display = 'flex';
            containerRef.current.style.animation = 'none';
            void containerRef.current.offsetHeight; // Force DOM reflow
            containerRef.current.style.animation = 'level-up-pop 4000ms cubic-bezier(0.16, 1, 0.3, 1) forwards';
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
            className="fixed inset-x-0 top-1/3 z-[11000] pointer-events-none flex flex-col items-center justify-center"
            style={{ display: 'none' }}
        >
            <div className="relative flex flex-col items-center px-12 py-6 bg-black/95 border-y-2 border-yellow-500/80 shadow-[0_0_50px_rgba(234,179,8,0.3)] backdrop-blur-md min-w-[320px] text-center overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-yellow-500/5 to-transparent pointer-events-none" />
                <div className="absolute inset-0 hud-noise-overlay opacity-10 pointer-events-none" />
                
                <span className="text-sm font-black text-yellow-500 uppercase tracking-[0.5em] mb-1 animate-pulse">
                    {t('ui.level_up')}
                </span>
                
                <h1 className="text-4xl font-black text-white italic uppercase tracking-wider leading-none select-none drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">
                    <span ref={levelTextRef}>LEVEL --</span>
                </h1>
            </div>
            
            <style>{`
                @keyframes level-up-pop {
                    0% { opacity: 0; transform: scale(0.8) translateY(20px); filter: blur(10px); }
                    10% { opacity: 1; transform: scale(1.05) translateY(0); filter: blur(0px); }
                    13% { transform: scale(1); }
                    87% { opacity: 1; transform: scale(1) translateY(0); filter: blur(0px); }
                    100% { opacity: 0; transform: scale(0.95) translateY(-20px); filter: blur(5px); }
                }
            `}</style>
        </div>
    );
};

export default React.memo(LevelUpBanner);
