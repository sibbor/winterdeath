import React, { useRef, useEffect } from 'react';
import { HudStore } from '../../../store/HudStore';
import { StatusStore } from '../../../store/StatusStore';
import { COLORS, VIGNETTE_COLORS } from '../../../utils/ui/ColorUtils';
import { PlayerStatusFlags } from '../../../entities/player/PlayerTypes';

/**
 * ZERO-GC OPACITY POOL
 * Pre-allocated strings for 0.00 to 1.00 to avoid .toFixed() or .toString() in loops.
 */
const OPACITY_STRINGS = Array.from({ length: 101 }, (_, i) => (i / 100).toFixed(2));

const ScreenEffect: React.FC = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const gradientRef = useRef<HTMLDivElement>(null);
    const blurOverlayRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // ZERO-GC: High-frequency HP monitoring via fast registry
        return HudStore.subscribeFastUpdate((data: any) => {
            if (!containerRef.current || !gradientRef.current) return;

            const state = HudStore.getState();

            // HP
            const hasCriticalHp = state.hasCriticalHp;

            // Perks & Debuffs
            const flags = StatusStore.getStatusFlags();
            const hasReflexShield = (flags & PlayerStatusFlags.REFLEX_SHIELD) !== 0;
            const hasAdrenalinePatch = (flags & PlayerStatusFlags.ADRENALINE_PATCH) !== 0;
            const hasGibMaster = (flags & PlayerStatusFlags.GIB_MASTER) !== 0;
            const hasQuickFinger = (flags & PlayerStatusFlags.QUICK_FINGER) !== 0;
            const hasBleeding = (flags & PlayerStatusFlags.BLEEDING) !== 0;
            const hasBurning = (flags & PlayerStatusFlags.BURNING) !== 0;
            const hasDisoriented = (flags & PlayerStatusFlags.DISORIENTED) !== 0;

            const hasAnyEffect = hasCriticalHp || hasQuickFinger || hasReflexShield
                || hasGibMaster || hasAdrenalinePatch || hasBleeding || hasBurning || hasDisoriented;

            if (!hasAnyEffect) {
                if (containerRef.current.style.opacity !== '0') {
                    containerRef.current.style.opacity = '0';
                    containerRef.current.style.filter = 'none';
                    containerRef.current.style.transform = 'none';
                    if (blurOverlayRef.current) {
                        blurOverlayRef.current.style.opacity = '0';
                        blurOverlayRef.current.style.transform = 'scale(1.0)';
                    }
                }
                return;
            }

            if (containerRef.current.style.opacity !== '1') {
                containerRef.current.style.opacity = '1';
            }

            // Reset dynamic attributes to default state
            containerRef.current.style.filter = 'none';
            containerRef.current.style.transform = 'none';
            if (blurOverlayRef.current) {
                blurOverlayRef.current.style.opacity = '0';
                blurOverlayRef.current.style.transform = 'scale(1.0)';
            }

            // ZERO-GC: Use pre-allocated strings for CSS variables
            if (hasDisoriented) {
                // Purple vignette + high-contrast hue rotate + zoom wiggle
                gradientRef.current.style.setProperty('--vignette-color', VIGNETTE_COLORS.VIGNETTE_PURPLE);
                gradientRef.current.style.setProperty('--vignette-opacity', OPACITY_STRINGS[60]);

                const t = Date.now() * 0.01;
                const wobbleScale = 1.025 + Math.sin(t * 1.5) * 0.015;
                const wobbleRot = Math.cos(t) * 1.8;
                containerRef.current.style.transform = `rotate(${wobbleRot}deg) scale(${wobbleScale})`;
                containerRef.current.style.filter = `contrast(1.4) saturate(1.7) hue-rotate(${Math.sin(t * 0.8) * 15}deg)`;

                if (blurOverlayRef.current) {
                    blurOverlayRef.current.style.opacity = '0.55';
                    blurOverlayRef.current.style.transform = 'scale(1.01)';
                }
            } else if (hasBurning) {
                // Intense Orange vignette + rapid heat flutter + high saturation
                const heat = 0.45 + Math.sin(Date.now() * 0.04) * 0.15;
                const heatIdx = Math.max(0, Math.min(100, Math.round(heat * 100)));

                gradientRef.current.style.setProperty('--vignette-color', '249, 115, 22'); // Warm Fire Orange
                gradientRef.current.style.setProperty('--vignette-opacity', OPACITY_STRINGS[heatIdx]);

                containerRef.current.style.filter = 'contrast(1.25) saturate(1.5)';
                if (blurOverlayRef.current) {
                    blurOverlayRef.current.style.opacity = '0.4';
                    blurOverlayRef.current.style.transform = `scale(${1.01 + Math.sin(Date.now() * 0.02) * 0.01})`;
                }
            } else if (hasBleeding) {
                // Crimson Red vignette + throbbing heartbeat pulse + muted desaturated backdrop
                const throb = 0.45 + Math.sin(Date.now() * 0.007) * 0.25;
                const throbIdx = Math.max(0, Math.min(100, Math.round(throb * 100)));

                gradientRef.current.style.setProperty('--vignette-color', VIGNETTE_COLORS.VIGNETTE_RED);
                gradientRef.current.style.setProperty('--vignette-opacity', OPACITY_STRINGS[throbIdx]);

                containerRef.current.style.filter = 'grayscale(0.2) contrast(1.15)';
            } else if (hasGibMaster) {
                gradientRef.current.style.setProperty('--vignette-color', VIGNETTE_COLORS.VIGNETTE_PURPLE);
                gradientRef.current.style.setProperty('--vignette-opacity', OPACITY_STRINGS[45]);
            } else if (hasAdrenalinePatch) {
                gradientRef.current.style.setProperty('--vignette-color', VIGNETTE_COLORS.VIGNETTE_GREEN);
                gradientRef.current.style.setProperty('--vignette-opacity', OPACITY_STRINGS[45]);
            } else if (hasReflexShield) {
                gradientRef.current.style.setProperty('--vignette-color', VIGNETTE_COLORS.VIGNETTE_YELLOW);
                gradientRef.current.style.setProperty('--vignette-opacity', OPACITY_STRINGS[45]);
            } else if (hasQuickFinger) {
                gradientRef.current.style.setProperty('--vignette-color', VIGNETTE_COLORS.VIGNETTE_BLUE);
                gradientRef.current.style.setProperty('--vignette-opacity', OPACITY_STRINGS[45]);

                // Slow-Mo visual lens edge blur
                if (blurOverlayRef.current) {
                    blurOverlayRef.current.style.opacity = '1';
                    blurOverlayRef.current.style.transform = 'scale(1.03)';
                }
            } else if (hasCriticalHp) {
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
            className="absolute inset-0 pointer-events-none z-50 overflow-hidden transition-all duration-300"
            style={{ opacity: 0 }}
        >
            <div
                ref={gradientRef}
                className="absolute inset-0 animate-pulse-fast pointer-events-none"
                style={{
                    background: 'radial-gradient(circle, transparent 40%, rgba(var(--vignette-color, 220, 38, 38), var(--vignette-opacity, 0)) 100%)'
                }}
            />
            {/* Smooth Edge-Blur overlay for Slow-Mo focus and Disorientation shimmers */}
            <div
                ref={blurOverlayRef}
                className="absolute inset-0 pointer-events-none transition-all duration-700 ease-out"
                style={{
                    opacity: 0,
                    backdropFilter: 'blur(5px)',
                    WebkitBackdropFilter: 'blur(5px)',
                    maskImage: 'radial-gradient(circle, transparent 35%, black 80%)',
                    WebkitMaskImage: 'radial-gradient(circle, transparent 35%, black 80%)',
                    transform: 'scale(1.0)'
                }}
            />
        </div>
    );
};

export default React.memo(ScreenEffect);
