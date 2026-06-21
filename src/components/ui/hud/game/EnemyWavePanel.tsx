import React, { useRef, useEffect } from 'react';
import { HudStore } from '../../../../store/HudStore';
import { t } from '../../../../utils/i18n';

interface EnemyWavePanelProps {
    isMobileDevice: boolean;
    wavePanelRef: React.RefObject<HTMLDivElement | null>;
    waveNameRef: React.RefObject<HTMLHeadingElement | null>;
    waveBarRef: React.RefObject<HTMLDivElement | null>;
    waveTrailBarRef: React.RefObject<HTMLDivElement | null>;
    waveTextRef: React.RefObject<HTMLSpanElement | null>;
}

export const EnemyWavePanel: React.FC<EnemyWavePanelProps> = React.memo(({
    isMobileDevice,
    wavePanelRef,
    waveNameRef,
    waveBarRef,
    waveTrailBarRef,
    waveTextRef
}) => {
    // Wave compass indicator — fully owned here
    const waveIndicatorRef = useRef<HTMLDivElement>(null);

    // ============================================================================
    // HOT PATH: Wave indicator DOM updates via subscribeFastUpdate
    // ============================================================================
    useEffect(() => {
        let currentAngle = 0;
        let isFirst = true;

        const handleFastUpdate = (data: any) => {
            if (waveIndicatorRef.current) {
                if (data.waveIndicatorActive) {
                    waveIndicatorRef.current.style.opacity = '1';
                    const targetAngle = data.waveIndicatorAngle;

                    if (isFirst) {
                        currentAngle = targetAngle;
                        isFirst = false;
                    } else {
                        // Shortest path angular lerp
                        let diff = targetAngle - currentAngle;
                        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
                        currentAngle += diff * 0.15; // Smooth interpolation speed
                    }

                    const r = 120; // Hover closely around the player at screen center
                    const cx = window.innerWidth / 2;
                    const cy = window.innerHeight / 2;
                    const x = cx + Math.cos(currentAngle) * r;
                    const y = cy + Math.sin(currentAngle) * r;
                    waveIndicatorRef.current.style.transform = `translate(${x}px, ${y}px) rotate(${(currentAngle * (180 / Math.PI)) + 90}deg)`;
                } else {
                    waveIndicatorRef.current.style.opacity = '0';
                    isFirst = true;
                }
            }
        };

        return HudStore.subscribeFastUpdate(handleFastUpdate);
    }, []);

    return (
        <>
            {/* WAVE PROGRESS PANEL */}
            <div ref={wavePanelRef} className="relative w-full flex justify-center transition-all duration-700 ease-out opacity-0 -translate-y-4 blur-md pointer-events-none" style={{ display: 'none' }}>
                <div className="relative p-6 flex flex-col items-center justify-center w-full min-w-[320px] max-w-[500px] text-center">
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
                        <h2 ref={waveNameRef} className={`hud-wave-title font-mono ${isMobileDevice ? 'text-sm mb-1.5' : 'text-2xl font-black mb-2'} text-white tracking-widest uppercase`}>
                            WAVE
                        </h2>
                        <div className={`w-full bg-black/40 border border-white/10 rounded-sm shadow-md ${isMobileDevice ? 'max-w-[220px] h-2.5' : 'max-w-[500px] h-4'} relative overflow-hidden`}>
                            {/* Trail / Highlight Bar */}
                            <div
                                ref={waveTrailBarRef}
                                className="absolute inset-y-0 left-0 w-full origin-left bg-orange-400/50"
                                style={{ transform: 'scaleX(1)', transition: 'transform 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.2s' }}
                            />
                            {/* Main Progress Bar (Zombies Remaining) */}
                            <div
                                ref={waveBarRef}
                                className="absolute inset-y-0 left-0 w-full origin-left bg-gradient-to-r from-orange-600 to-amber-500"
                                style={{ transform: 'scaleX(1)', transition: 'transform 0.1s ease-out' }}
                            />
                        </div>
                        <span ref={waveTextRef} className={`${isMobileDevice ? 'text-[10px]' : 'text-xs'} mt-2 text-zinc-300 font-mono tracking-[0.15em] drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]`}>
                            0 / 0
                        </span>
                    </div>
                </div>
            </div>

            {/* WAVE COMPASS INDICATOR — positioned absolutely over the viewport */}
            <div
                ref={waveIndicatorRef}
                className="fixed pointer-events-none z-[150] opacity-0 transition-opacity duration-300"
                style={{ top: 0, left: 0, willChange: 'transform, opacity' }}
            >
                <div className="w-6 h-6 flex items-center justify-center -translate-x-1/2 -translate-y-1/2">
                    <div className="w-0 h-0" style={{
                        borderLeft: '8px solid transparent',
                        borderRight: '8px solid transparent',
                        borderBottom: '16px solid rgba(251, 146, 60, 0.9)',
                        filter: 'drop-shadow(0 0 6px rgba(251, 146, 60, 0.8))'
                    }} />
                </div>
            </div>
        </>
    );
});