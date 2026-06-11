import React, { useRef, useEffect } from 'react';
import { HudStore } from '../../../store/HudStore';
import { StatusStore } from '../../../store/StatusStore';
import { VIGNETTE_COLORS } from '../../../utils/ui/ColorUtils';
import { PlayerStatusFlags } from '../../../types/CareerStats';

/**
 * ZERO-GC OPACITY POOL
 * Pre-allocated strings for 0.00 to 1.00 to avoid .toFixed() or .toString() in loops.
 */
const OPACITY_STRINGS = Array.from({ length: 101 }, (_, i) => (i / 100).toFixed(2));

const ScreenEffect: React.FC = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const gradientRef = useRef<HTMLDivElement>(null);
    const blurOverlayRef = useRef<HTMLDivElement>(null);

    // ZERO-GC: Structural style cache latch to prevent DOM write thrashing
    const styleCache = useRef({
        opacity: '-1',
        transform: '',
        filter: '',
        vignetteColor: '',
        vignetteOpacity: '',
        blurOpacity: '-1',
        blurTransform: ''
    });

    useEffect(() => {
        // High-frequency frame monitoring loop
        return HudStore.subscribeFastUpdate((data: any) => {
            if (!containerRef.current || !gradientRef.current) return;

            const state = HudStore.getState();
            const cache = styleCache.current;

            // HP Evaluation
            const hasCriticalHp = state.hasCriticalHp;

            // Perks & Debuffs Evaluation via bitmask jump
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

            // --- BRANCH 1: NO ACTIVE EFFECTS (PASSIVE RESET PATH) ---
            if (!hasAnyEffect) {
                if (cache.opacity !== '0') {
                    cache.opacity = '0';
                    containerRef.current.style.opacity = '0';

                    cache.filter = 'none';
                    containerRef.current.style.filter = 'none';

                    cache.transform = 'none';
                    containerRef.current.style.transform = 'none';

                    if (blurOverlayRef.current) {
                        cache.blurOpacity = '0';
                        blurOverlayRef.current.style.opacity = '0';

                        cache.blurTransform = 'scale(1)';
                        blurOverlayRef.current.style.transform = 'scale(1)';
                    }
                }
                return;
            }

            // --- BRANCH 2: COMPUTE HIGH FREQUENCY VISUAL METRICS ---
            if (cache.opacity !== '1') {
                cache.opacity = '1';
                containerRef.current.style.opacity = '1';
            }

            // Set frame-local layout fallbacks to avoid cumulative frame bleed
            let nextTransform = 'none';
            let nextFilter = 'none';
            let nextVignetteColor = '';
            let nextVignetteOpacity = '';
            let nextBlurOpacity = '0';
            let nextBlurTransform = 'scale(1)';

            if (hasDisoriented) {
                nextVignetteColor = VIGNETTE_COLORS.VIGNETTE_PURPLE;
                nextVignetteOpacity = OPACITY_STRINGS[60];

                const t = Date.now() * 0.01;
                const wobbleScale = 1.025 + Math.sin(t * 1.5) * 0.015;
                const wobbleRot = Math.cos(t) * 1.8;

                nextTransform = `rotate(${wobbleRot}deg) scale(${wobbleScale})`;
                nextFilter = `contrast(1.4) saturate(1.7) hue-rotate(${Math.sin(t * 0.8) * 15}deg)`;
                nextBlurOpacity = '0.55';
                nextBlurTransform = 'scale(1.01)';
            }
            else if (hasBurning) {
                const heat = 0.45 + Math.sin(Date.now() * 0.04) * 0.15;
                const heatIdx = Math.max(0, Math.min(100, Math.round(heat * 100)));

                nextVignetteColor = '249, 115, 22';
                nextVignetteOpacity = OPACITY_STRINGS[heatIdx];
                nextFilter = 'contrast(1.25) saturate(1.5)';
                nextBlurOpacity = '0.4';
                nextBlurTransform = `scale(${1.01 + Math.sin(Date.now() * 0.02) * 0.01})`;
            }
            else if (hasBleeding) {
                const throb = 0.45 + Math.sin(Date.now() * 0.007) * 0.25;
                const throbIdx = Math.max(0, Math.min(100, Math.round(throb * 100)));

                nextVignetteColor = VIGNETTE_COLORS.VIGNETTE_RED;
                nextVignetteOpacity = OPACITY_STRINGS[throbIdx];
                nextFilter = 'grayscale(0.2) contrast(1.15)';
            }
            else if (hasGibMaster) {
                nextVignetteColor = VIGNETTE_COLORS.VIGNETTE_PURPLE;
                nextVignetteOpacity = OPACITY_STRINGS[45];
            }
            else if (hasAdrenalinePatch) {
                nextVignetteColor = VIGNETTE_COLORS.VIGNETTE_GREEN;
                nextVignetteOpacity = OPACITY_STRINGS[45];
            }
            else if (hasReflexShield) {
                nextVignetteColor = VIGNETTE_COLORS.VIGNETTE_YELLOW;
                nextVignetteOpacity = OPACITY_STRINGS[45];
            }
            else if (hasQuickFinger) {
                nextVignetteColor = VIGNETTE_COLORS.VIGNETTE_BLUE;
                nextVignetteOpacity = OPACITY_STRINGS[45];
                nextBlurOpacity = '1';
                nextBlurTransform = 'scale(1.03)';
            }
            else if (hasCriticalHp) {
                const criticalSeverity = 1 - (data.hp / (data.maxHp * 0.3));
                const dynamicOpacity = 0.4 + (Math.max(0, Math.min(1, criticalSeverity)) * 0.4);
                const opacityIdx = Math.max(0, Math.min(100, Math.round(dynamicOpacity * 100)));

                nextVignetteColor = VIGNETTE_COLORS.VIGNETTE_RED;
                nextVignetteOpacity = OPACITY_STRINGS[opacityIdx];
            }

            // --- BRANCH 3: ATOMIC DIRTY CHECKING & DOM FLUSHING ---
            // Only mutate style properties if the layout parameters actually changed
            if (cache.transform !== nextTransform) {
                cache.transform = nextTransform;
                containerRef.current.style.transform = nextTransform;
            }
            if (cache.filter !== nextFilter) {
                cache.filter = nextFilter;
                containerRef.current.style.filter = nextFilter;
            }
            if (cache.vignetteColor !== nextVignetteColor) {
                cache.vignetteColor = nextVignetteColor;
                gradientRef.current.style.setProperty('--vignette-color', nextVignetteColor);
            }
            if (cache.vignetteOpacity !== nextVignetteOpacity) {
                cache.vignetteOpacity = nextVignetteOpacity;
                gradientRef.current.style.setProperty('--vignette-opacity', nextVignetteOpacity);
            }

            if (blurOverlayRef.current) {
                if (cache.blurOpacity !== nextBlurOpacity) {
                    cache.blurOpacity = nextBlurOpacity;
                    blurOverlayRef.current.style.opacity = nextBlurOpacity;
                }
                if (cache.blurTransform !== nextBlurTransform) {
                    cache.blurTransform = nextBlurTransform;
                    blurOverlayRef.current.style.transform = nextBlurTransform;
                }
            }
        });
    }, []);

    return (
        <div
            ref={containerRef}
            className="absolute inset-0 pointer-events-none z-50 overflow-hidden transition-opacity duration-300 ease-out"
            style={{ opacity: 0 }}
        >
            <div
                ref={gradientRef}
                className="absolute inset-0 animate-pulse-fast pointer-events-none"
                style={{
                    background: 'radial-gradient(circle, transparent 40%, rgba(var(--vignette-color, 220, 38, 38), var(--vignette-opacity, 0)) 100%)'
                }}
            />
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