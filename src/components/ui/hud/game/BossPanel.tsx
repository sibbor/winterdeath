import React, { useRef, useEffect } from 'react';
import { HudStore } from '../../../../store/HudStore';
import { t } from '../../../../utils/i18n';

interface BossPanelProps {
    isMobileDevice: boolean;
    isBossIntro: boolean;
    bossHpBarRef: React.RefObject<HTMLDivElement | null>;
    bossHpTrailBarRef: React.RefObject<HTMLDivElement | null>;
}

// ZERO-GC: Pre-baked class strings — never allocate inside HudStore.subscribe
const BASE = "relative w-full flex justify-center pointer-events-none transition-all duration-1000 ease-out";
const CLASS_HIDDEN = `${BASE} opacity-0 -translate-y-6 blur-lg scale-95`;
const CLASS_APPEAR = `${BASE} animate-boss-appear`;
const CLASS_KILLED = `${BASE} animate-boss-killed`;

export const BossPanel: React.FC<BossPanelProps> = React.memo(({
    isMobileDevice,
    isBossIntro,
    bossHpBarRef,
    bossHpTrailBarRef
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const nameRef = useRef<HTMLHeadingElement>(null);

    // Stable ref keeps prop readable inside Zero-GC subscribe callback without closure staleness
    const isBossIntroRef = useRef(isBossIntro);

    // Sync prop → ref, then re-evaluate visibility without waiting for the next HudStore tick
    useEffect(() => {
        isBossIntroRef.current = isBossIntro;
        if (!containerRef.current) return;
        const state = HudStore.getState();
        const isVisible = state.bossActive && !isBossIntroRef.current;
        const next = isVisible ? (state.bossDefeated ? CLASS_KILLED : CLASS_APPEAR) : CLASS_HIDDEN;
        if (containerRef.current.className !== next) containerRef.current.className = next;
    }, [isBossIntro]);

    // Single HudStore.subscribe — no React re-renders, no useHudStore
    useEffect(() => {
        const prevName = { v: '' };

        return HudStore.subscribe((state) => {
            if (!containerRef.current) return;

            // Visibility class
            const isVisible = state.bossActive && !isBossIntroRef.current;
            const next = isVisible ? (state.bossDefeated ? CLASS_KILLED : CLASS_APPEAR) : CLASS_HIDDEN;
            if (containerRef.current.className !== next) {
                containerRef.current.className = next;
            }

            // Boss name (infrequent — only at spawn)
            if (state.bossName !== prevName.v && nameRef.current) {
                nameRef.current.innerText = t(state.bossName);
                prevName.v = state.bossName;
            }
        });
    }, []);

    return (
        <div ref={containerRef} className={CLASS_HIDDEN}>
            <div className="relative p-6 flex flex-col items-center justify-center w-full max-w-[600px] text-center">
                {/* SMOKY CINEMATIC BACKGROUND */}
                <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                        background: 'radial-gradient(50% 50% at 50% 50%, rgba(0, 0, 0, 0.95) 0%, rgba(0, 0, 0, 0.65) 60%, transparent 100%)',
                        filter: 'blur(16px)',
                        transform: 'scaleX(1.3) scaleY(1.15)'
                    }}
                />

                <div className="relative flex flex-col items-center z-10 w-full">
                    <h2 ref={nameRef} className={`font-mono ${isMobileDevice ? 'text-sm mb-2' : 'text-3xl font-black mb-3'} text-white tracking-widest uppercase drop-shadow-lg`}>
                    </h2>
                    <div className={`w-full bg-black/40 border border-white/10 rounded-sm shadow-md ${isMobileDevice ? 'max-w-[250px] h-2.5' : 'max-w-[500px] h-4'} overflow-hidden relative`}>
                        {/* Boss HP Damage highlight trail bar */}
                        <div
                            ref={bossHpTrailBarRef}
                            className="absolute inset-y-0 left-0 w-full origin-left bg-orange-400/40 z-10"
                            style={{ transform: 'scaleX(1)', transition: 'transform 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.2s' }}
                        />
                        {/* Main HP Bar */}
                        <div
                            ref={bossHpBarRef}
                            className="main-hp-bar absolute inset-y-0 left-0 w-full origin-left bg-gradient-to-r from-red-700 to-red-500 z-10"
                            style={{ transform: 'scaleX(1)', transition: 'transform 0.1s ease-out' }}
                        />
                        {/* Delimiters at 25%, 50%, 75% */}
                        <div className="absolute top-0 bottom-0 w-[1px] bg-white/40 border-l border-black/40 z-30 pointer-events-none" style={{ left: '25%' }} />
                        <div className="absolute top-0 bottom-0 w-[1px] bg-white/40 border-l border-black/40 z-30 pointer-events-none" style={{ left: '50%' }} />
                        <div className="absolute top-0 bottom-0 w-[1px] bg-white/40 border-l border-black/40 z-30 pointer-events-none" style={{ left: '75%' }} />
                    </div>
                </div>
            </div>
        </div>
    );
});