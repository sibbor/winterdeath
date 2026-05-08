import React, { useRef, useEffect } from 'react';
import { HudStore } from '../../../store/HudStore';
import { VIGNETTE_COLORS } from '../../../utils/ui/ColorUtils';

/**
 * ZERO-GC OPACITY POOL
 * Pre-allocated strings for 0.00 to 1.00 to avoid .toFixed() or .toString() in loops.
 */
const OPACITY_STRINGS = Array.from({ length: 101 }, (_, i) => (i / 100).toFixed(2));

/**
 * DamageVignette - ZERO-GC OPTIMIZED
 * Uses CSS Variables to eliminate 120FPS string-building allocations.
 */
const DamageVignette: React.FC = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const gradientRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // ZERO-GC: High-frequency HP monitoring via fast registry
        return HudStore.subscribeFastUpdate((data: any) => {
            if (!containerRef.current || !gradientRef.current) return;

            const state = HudStore.getState();
            const isGibMaster = state.isGibMaster;
            const isQuickFinger = state.isQuickFinger;
            const isCritical = state.isCritical;

            if (!isCritical && !isGibMaster && !isQuickFinger) {
                if (containerRef.current.style.opacity !== '0') {
                    containerRef.current.style.opacity = '0';
                }
                return;
            }

            if (containerRef.current.style.opacity !== '1') {
                containerRef.current.style.opacity = '1';
            }

            // ZERO-GC: Use pre-allocated strings for CSS variables
            if (isGibMaster) {
                gradientRef.current.style.setProperty('--vignette-color', VIGNETTE_COLORS.VIGNETTE_PURPLE);
                gradientRef.current.style.setProperty('--vignette-opacity', OPACITY_STRINGS[45]); // 0.45
            } else if (isQuickFinger) {
                gradientRef.current.style.setProperty('--vignette-color', VIGNETTE_COLORS.VIGNETTE_BLUE);
                gradientRef.current.style.setProperty('--vignette-opacity', OPACITY_STRINGS[45]); // 0.45
            } else if (isCritical) {
                const criticalSeverity = 1 - (data.hp / (data.maxHp * 0.3));
                const dynamicOpacity = 0.4 + (Math.max(0, Math.min(1, criticalSeverity)) * 0.4);
                const opacityIdx = Math.max(0, Math.min(100, Math.round(dynamicOpacity * 100)));

                gradientRef.current.style.setProperty('--vignette-color', VIGNETTE_COLORS.VIGNETTE_RED);
                gradientRef.current.style.setProperty('--vignette-opacity', OPACITY_STRINGS[opacityIdx]);
            }
        });
    }, []);

    return (
        <div
            ref={containerRef}
            className="absolute inset-0 pointer-events-none z-50 overflow-hidden"
            style={{ opacity: 0, transition: 'opacity 0.4s ease-in-out' }}
        >
            <div
                ref={gradientRef}
                className="absolute inset-0 animate-pulse-fast pointer-events-none"
                style={{
                    background: 'radial-gradient(circle, transparent 40%, rgba(var(--vignette-color, 220, 38, 38), var(--vignette-opacity, 0)) 100%)'
                }}
            />
            {/* Soft outer glow */}
            <div className="absolute inset-0 border-[20px] border-white/5 blur-3xl animate-pulse-slow pointer-events-none" />
        </div>
    );
};

export default React.memo(DamageVignette);
