import React, { useRef, useEffect } from 'react';
import { HudStore } from '../../../../store/HudStore';
import { VIGNETTE_COLORS } from '../../../../utils/ui/ColorUtils';
import { PlayerStatusFlags } from '../../../../types/CareerStats';

/**
 * ZERO-GC: Pre-allocated opacity string pool.
 * Eliminates .toFixed() / .toString() calls in the subscriber.
 */
const OPACITY_STRINGS = Array.from({ length: 101 }, (_, i) => (i / 100).toFixed(2));

/**
 * ZERO-GC: Interned effect state tokens.
 * Referential equality (===) on module-level string constants is guaranteed
 * to be pointer comparison in V8 — no string content scanning on every frame.
 */
const EFFECT_NONE = '';
const EFFECT_DISORIENTED = 'disoriented';
const EFFECT_BURNING = 'burning';
const EFFECT_BLEEDING = 'bleeding';
const EFFECT_GIB_MASTER = 'gibmaster';
const EFFECT_ADRENALINE = 'adrenaline';
const EFFECT_REFLEX = 'reflex';
const EFFECT_QUICK_FINGER = 'quickfinger';
const EFFECT_CRITICAL = 'critical';

const ScreenEffect: React.FC = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const gradientRef = useRef<HTMLDivElement>(null);
    const blurOverlayRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // ZERO-GC: Snapshot locals — allocated once per mount, mutated in place
        let prevEffect = EFFECT_NONE;
        let prevCriticalOpacityIdx = -1;

        return HudStore.subscribeFastUpdate((data: any) => {
            if (!containerRef.current || !gradientRef.current) return;

            // ================================================================
            // HOT PATH: Bitmask evaluation — zero GC, zero string allocation
            // ================================================================
            const flags = data.statusFlags || 0;
            const hasDisoriented = (flags & PlayerStatusFlags.DISORIENTED) !== 0;
            const hasBurning = (flags & PlayerStatusFlags.BURNING) !== 0;
            const hasBleeding = (flags & PlayerStatusFlags.BLEEDING) !== 0;
            const hasGibMaster = (flags & PlayerStatusFlags.GIB_MASTER) !== 0;
            const hasAdrenaline = (flags & PlayerStatusFlags.ADRENALINE_PATCH) !== 0;
            const hasReflexShield = (flags & PlayerStatusFlags.REFLEX_SHIELD) !== 0;
            const hasQuickFinger = (flags & PlayerStatusFlags.QUICK_FINGER) !== 0;
            const hasCriticalHp = data.hasCriticalHp as boolean;

            // Priority-ordered ternary — resolves to an interned string constant
            // V8 treats module-level string literals as pointer-equal: zero allocation
            const effect =
                hasDisoriented ? EFFECT_DISORIENTED :
                    hasBurning ? EFFECT_BURNING :
                        hasBleeding ? EFFECT_BLEEDING :
                            hasGibMaster ? EFFECT_GIB_MASTER :
                                hasAdrenaline ? EFFECT_ADRENALINE :
                                    hasReflexShield ? EFFECT_REFLEX :
                                        hasQuickFinger ? EFFECT_QUICK_FINGER :
                                            hasCriticalHp ? EFFECT_CRITICAL :
                                                EFFECT_NONE;

            // ================================================================
            // INFREQUENT PATH: fires only on effect type transitions.
            // All DOM writes, class mutations, and CSS property sets live here.
            // Continuous visual animation is delegated to CSS keyframes —
            // no JS string allocation at 60fps.
            // ================================================================
            if (effect !== prevEffect) {
                const c = containerRef.current!;
                const g = gradientRef.current!;
                const b = blurOverlayRef.current;

                // 1. Hard reset to neutral DOM state
                c.style.opacity = effect === EFFECT_NONE ? '0' : '1';
                c.style.transform = 'none';
                c.style.filter = 'none';
                c.className = 'absolute inset-0 pointer-events-none z-50 overflow-hidden transition-opacity duration-300 ease-out';

                g.className = 'absolute inset-0 pointer-events-none';
                g.style.opacity = '0';
                g.style.animation = 'none';

                if (b) {
                    b.style.opacity = '0';
                    b.style.transform = 'scale(1)';
                    b.style.animation = 'none';
                    b.className = 'absolute inset-0 pointer-events-none transition-all duration-700 ease-out';
                }

                // 2. Apply new effect — CSS keyframes drive continuous animation,
                //    JS only sets the class once
                switch (effect) {
                    case EFFECT_DISORIENTED:
                        c.classList.add('screen-fx-disoriented');
                        g.style.setProperty('--vignette-color', VIGNETTE_COLORS.VIGNETTE_PURPLE);
                        g.classList.add('screen-fx-vignette-disoriented');
                        if (b) b.classList.add('screen-fx-blur-disoriented');
                        break;

                    case EFFECT_BURNING:
                        c.classList.add('screen-fx-burning');
                        g.style.setProperty('--vignette-color', '249, 115, 22');
                        g.classList.add('screen-fx-vignette-burning');
                        if (b) b.classList.add('screen-fx-blur-burning');
                        break;

                    case EFFECT_BLEEDING:
                        c.classList.add('screen-fx-bleeding');
                        g.style.setProperty('--vignette-color', VIGNETTE_COLORS.VIGNETTE_RED);
                        g.classList.add('screen-fx-vignette-bleeding');
                        break;

                    case EFFECT_GIB_MASTER:
                        g.style.setProperty('--vignette-color', VIGNETTE_COLORS.VIGNETTE_PURPLE);
                        g.style.opacity = OPACITY_STRINGS[45];
                        break;

                    case EFFECT_ADRENALINE:
                        g.style.setProperty('--vignette-color', VIGNETTE_COLORS.VIGNETTE_GREEN);
                        g.style.opacity = OPACITY_STRINGS[45];
                        break;

                    case EFFECT_REFLEX:
                        g.style.setProperty('--vignette-color', VIGNETTE_COLORS.VIGNETTE_YELLOW);
                        g.style.opacity = OPACITY_STRINGS[45];
                        break;

                    case EFFECT_QUICK_FINGER:
                        g.style.setProperty('--vignette-color', VIGNETTE_COLORS.VIGNETTE_BLUE);
                        g.style.opacity = OPACITY_STRINGS[45];
                        if (b) { b.style.opacity = '1'; b.style.transform = 'scale(1.03)'; }
                        break;

                    case EFFECT_CRITICAL:
                        g.style.setProperty('--vignette-color', VIGNETTE_COLORS.VIGNETTE_RED);
                        g.style.opacity = OPACITY_STRINGS[40]; // initial — updated below
                        prevCriticalOpacityIdx = -1;           // force re-evaluation
                        break;

                    case EFFECT_NONE:
                    default:
                        break;
                }

                prevEffect = effect;
            }

            // ================================================================
            // CRITICAL HP: dynamic opacity tied to live HP value.
            // This is NOT per-frame — it only triggers when HP changes.
            // ================================================================
            if (prevEffect === EFFECT_CRITICAL) {
                const criticalSeverity = 1 - (data.hp / (data.maxHp * 0.3));
                const opacityIdx = Math.max(0, Math.min(100,
                    Math.round((0.4 + Math.max(0, Math.min(1, criticalSeverity)) * 0.4) * 100)
                ));
                if (opacityIdx !== prevCriticalOpacityIdx) {
                    gradientRef.current!.style.opacity = OPACITY_STRINGS[opacityIdx];
                    prevCriticalOpacityIdx = opacityIdx;
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
            {/* VIGNETTE GRADIENT — color set via CSS custom property, intensity via element opacity */}
            <div
                ref={gradientRef}
                className="absolute inset-0 pointer-events-none"
                style={{
                    background: 'radial-gradient(circle, transparent 40%, rgba(var(--vignette-color, 220, 38, 38), 0.9) 100%)',
                    opacity: 0
                }}
            />

            {/* BLUR OVERLAY — additive blur ring, used by disoriented + quickfinger */}
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

            <style>{`
                /* ============================================================
                   CSS KEYFRAME EFFECTS
                   All continuous animation is delegated here — zero JS string
                   allocation per frame. JS only toggles a class once on start/end.
                   ============================================================ */

                /* DISORIENTED: full-screen wobble + hue-rotate */
                .screen-fx-disoriented {
                    animation: screen-disoriented-wobble 3.2s ease-in-out infinite;
                    will-change: transform, filter;
                }
                @keyframes screen-disoriented-wobble {
                    0%   { transform: rotate(0deg)    scale(1.010); filter: contrast(1.4) saturate(1.7) hue-rotate(0deg);   }
                    25%  { transform: rotate(1.8deg)  scale(1.040); filter: contrast(1.4) saturate(1.7) hue-rotate(15deg);  }
                    50%  { transform: rotate(0deg)    scale(1.025); filter: contrast(1.4) saturate(1.7) hue-rotate(-5deg);  }
                    75%  { transform: rotate(-1.8deg) scale(1.040); filter: contrast(1.4) saturate(1.7) hue-rotate(-15deg); }
                    100% { transform: rotate(0deg)    scale(1.010); filter: contrast(1.4) saturate(1.7) hue-rotate(0deg);   }
                }

                /* DISORIENTED: pulsing purple vignette */
                .screen-fx-vignette-disoriented {
                    animation: screen-vignette-disoriented 3.2s ease-in-out infinite;
                    will-change: opacity;
                }
                @keyframes screen-vignette-disoriented {
                    0%, 100% { opacity: 0.50; }
                    50%       { opacity: 0.85; }
                }

                /* DISORIENTED: blur overlay pulse */
                .screen-fx-blur-disoriented {
                    opacity: 0.55 !important;
                    animation: screen-blur-disoriented 3.2s ease-in-out infinite;
                    will-change: transform;
                }
                @keyframes screen-blur-disoriented {
                    0%, 100% { transform: scale(1.005); }
                    50%       { transform: scale(1.015); }
                }

                /* BLEEDING: static greyscale + pulsing red vignette */
                .screen-fx-bleeding {
                    filter: grayscale(0.2) contrast(1.15);
                }
                .screen-fx-vignette-bleeding {
                    animation: screen-vignette-bleeding 2.8s ease-in-out infinite;
                    will-change: opacity;
                }
                @keyframes screen-vignette-bleeding {
                    0%, 100% { opacity: 0.20; }
                    50%       { opacity: 0.70; }
                }

                /* BURNING: static contrast + pulsing orange vignette + blur */
                .screen-fx-burning {
                    filter: contrast(1.25) saturate(1.5);
                }
                .screen-fx-vignette-burning {
                    animation: screen-vignette-burning 1.1s ease-in-out infinite;
                    will-change: opacity;
                }
                @keyframes screen-vignette-burning {
                    0%, 100% { opacity: 0.30; }
                    50%       { opacity: 0.60; }
                }
                .screen-fx-blur-burning {
                    opacity: 0.4 !important;
                    animation: screen-blur-burning 1.1s ease-in-out infinite;
                    will-change: transform;
                }
                @keyframes screen-blur-burning {
                    0%, 100% { transform: scale(1.010); }
                    50%       { transform: scale(1.020); }
                }
            `}</style>
        </div>
    );
};

export default React.memo(ScreenEffect);