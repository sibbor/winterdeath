import React, { useRef, useEffect } from 'react';
import { HudStore } from '../../../store/HudStore';
import { PlayerStatusFlags } from '../../../entities/player/PlayerTypes';

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
            const isGibMaster = (state.statusFlags & PlayerStatusFlags.GIB_MASTER) !== 0;
            const isQuickFinger = (state.statusFlags & PlayerStatusFlags.QUICK_FINGER) !== 0;

            if (!data.isCritical && !isGibMaster && !isQuickFinger) {
                if (containerRef.current.style.opacity !== '0') {
                    containerRef.current.style.opacity = '0';
                }
                return;
            }

            if (containerRef.current.style.opacity !== '1') {
                containerRef.current.style.opacity = '1';
            }

            // Optimization: We use standard CSS variables for color and opacity 
            // to avoid re-calculating the entire radial-gradient string.
            if (isGibMaster) {
                gradientRef.current.style.setProperty('--vignette-color', '139, 92, 246'); // Purple
                gradientRef.current.style.setProperty('--vignette-opacity', '0.45');
            } else if (isQuickFinger) {
                gradientRef.current.style.setProperty('--vignette-color', '59, 130, 246'); // Blue
                gradientRef.current.style.setProperty('--vignette-opacity', '0.45');
            } else if (data.isCritical) {
                const criticalSeverity = 1 - (data.hp / (data.maxHp * 0.3));
                const dynamicOpacity = 0.4 + (Math.max(0, Math.min(1, criticalSeverity)) * 0.4);
                
                gradientRef.current.style.setProperty('--vignette-color', '220, 38, 38'); // Red
                gradientRef.current.style.setProperty('--vignette-opacity', dynamicOpacity.toString());
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