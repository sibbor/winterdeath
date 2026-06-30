import React, { useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { HudStore } from '../../../../store/HudStore';

// ─── Compass geometry constants ───────────────────────────────────────────────
const RING_RADIUS   = 100; // px — half the ring's diameter (200px)
const ARROW_HEIGHT  = 15;  // px — CSS border-bottom of the triangle
const ARROW_HALF_W  = 7;   // px — CSS border-left / border-right of the triangle

// ─── Module-Level Zero-GC Scratchpad ─────────────────────────────────────────
// Only a rotate() string is needed now — one numeric slot, joined once per frame.
const _tb = ['rotate(', 0, 'deg)'];

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
    // compassPivotRef: sits permanently at viewport center, only its rotation changes.
    // The arrow child is offset at -(RING_RADIUS + ARROW_HEIGHT) from it, so the
    // arrow's base rides on the ring edge and its tip always points outward.
    const compassPivotRef = useRef<HTMLDivElement>(null);
    const waveTrackRef    = useRef<HTMLDivElement>(null);

    // ============================================================================
    // HOT PATH: Wave indicator DOM updates (60 fps, zero GC)
    // ============================================================================
    useEffect(() => {
        let currentAngle = 0;
        let isFirst = true;

        const handleFastUpdate = (data: any) => {
            const pivot = compassPivotRef.current;
            const track = waveTrackRef.current;
            if (!pivot) return;

            if (data.waveIndicatorActive) {
                pivot.style.opacity = '1';
                if (track) track.style.opacity = '1';

                const targetAngle = data.waveIndicatorAngle;
                if (isFirst) {
                    currentAngle = targetAngle;
                    isFirst = false;
                } else {
                    // Shortest-path angular lerp (zero-GC)
                    let diff = targetAngle - currentAngle;
                    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
                    currentAngle += diff * 0.15;
                }

                // The pivot sits at the viewport center via CSS (top:50%, left:50%).
                // Only rotate it — no position calculation needed, no translate, no drift.
                // +90° maps trig angle 0 (→ east) to CSS 90° (pointing east from a "top" pivot).
                _tb[1] = (currentAngle * (180 / Math.PI)) + 90;
                pivot.style.transform = _tb.join('');
            } else {
                pivot.style.opacity = '0';
                if (track) track.style.opacity = '0';
                isFirst = true;
            }
        };

        return HudStore.subscribeFastUpdate(handleFastUpdate);
    }, []);

    // ============================================================================
    // PORTAL: document.body — no transformed ancestor, fixed = true viewport coords
    // ============================================================================
    const compassPortal = ReactDOM.createPortal(
        <>
            {/* WAVE COMPASS TRACK RING — grey, 3px border, 10% opacity */}
            <div
                ref={waveTrackRef}
                style={{
                    position:     'fixed',
                    top:          '50%',
                    left:         '50%',
                    width:        `${RING_RADIUS * 2}px`,
                    height:       `${RING_RADIUS * 2}px`,
                    marginTop:    `${-RING_RADIUS}px`,
                    marginLeft:   `${-RING_RADIUS}px`,
                    borderRadius: '50%',
                    border:       '3px solid rgba(160, 160, 160, 0.1)',
                    pointerEvents: 'none',
                    zIndex:       9998,
                    opacity:      0,
                    transition:   'opacity 0.3s'
                }}
            />

            {/*
             * WAVE COMPASS PIVOT
             *
             * Strategy: a 0×0 div permanently anchored at the viewport center
             * (top:50%, left:50%). Only its CSS `rotate()` changes each frame.
             * `transform-origin: 0 0` makes rotation happen around the 50%/50%
             * viewport point (the pivot's own top-left after positioning).
             *
             * The arrow child uses `position:absolute; top:-(RING_RADIUS+ARROW_HEIGHT)`
             * so its BASE (wide end of ▲) sits exactly on the ring edge and its TIP
             * always points radially outward. Geometry is invariant as the pivot rotates.
             *
             * Angle mapping (currentAngle is standard math atan2):
             *   currentAngle = 0     → east  (3 o'clock) → pivotDeg = 90
             *   currentAngle = PI/2  → south (6 o'clock) → pivotDeg = 180
             *   currentAngle = PI    → west  (9 o'clock) → pivotDeg = 270
             *   currentAngle = -PI/2 → north (12 o'clock) → pivotDeg = 0
             */}
            <div
                ref={compassPivotRef}
                style={{
                    position:        'fixed',
                    top:             '50%',
                    left:            '50%',
                    width:           0,
                    height:          0,
                    transformOrigin: '0 0',
                    pointerEvents:   'none',
                    zIndex:          9999,
                    opacity:         0,
                    transition:      'opacity 0.3s',
                    willChange:      'transform, opacity'
                }}
            >
                {/*
                 * Arrow: ▲ tip at top, base at bottom.
                 * `top: -(RING_RADIUS + ARROW_HEIGHT)` → tip at (RING_RADIUS + ARROW_HEIGHT) above pivot.
                 * `left: -ARROW_HALF_W` → horizontally centers the (ARROW_HALF_W*2)-wide triangle on the pivot.
                 * After the pivot rotates, the tip points away from screen center.
                 */}
                <div style={{
                    position:    'absolute',
                    top:         `${-(RING_RADIUS + ARROW_HEIGHT)}px`,
                    left:        `${-ARROW_HALF_W}px`,
                    width:       0,
                    height:      0,
                    borderLeft:  `${ARROW_HALF_W}px solid transparent`,
                    borderRight: `${ARROW_HALF_W}px solid transparent`,
                    borderBottom:`${ARROW_HEIGHT}px solid rgba(220, 38, 38, 0.95)`,
                    filter:      'drop-shadow(0 0 10px rgba(220,38,38,0.6))',
                }} />
            </div>
        </>,
        document.body
    );

    return (
        <>
            {compassPortal}

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
                            {/* Main Progress Bar */}
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
        </>
    );
});