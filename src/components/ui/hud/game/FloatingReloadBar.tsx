import React, { useRef, useEffect } from 'react';
import { HudStore } from '../../../../store/HudStore';
import { DataResolver } from '../../../../core/data/DataResolver';
import { WeaponCategoryColors } from '../../../../content/weapons';
import { COLORS } from '../../../../utils/ui/ColorUtils';

/**
 * FloatingReloadBar — Zero-GC, fully standalone.
 * Owns its own refs and subscribes to HudStore directly.
 * Resolves weapon color internally from activeWeapon.
 */
export const FloatingReloadBar: React.FC = React.memo(() => {
    const containerRef = useRef<HTMLDivElement>(null);
    const barRef = useRef<HTMLDivElement>(null);

    // ZERO-GC: Snapshot cache prevents redundant DOM writes
    const prevProgress = useRef(-1);
    const prevColor = useRef('');

    useEffect(() => {
        return HudStore.subscribeFastUpdate((data: any) => {
            if (data.reloadProgress === undefined) return;
            if (data.reloadProgress === prevProgress.current) return;
            prevProgress.current = data.reloadProgress;

            const active = data.reloadProgress < 1;

            if (containerRef.current) {
                containerRef.current.style.opacity = active ? '1' : '0';
            }

            if (barRef.current) {
                barRef.current.style.transform = `scaleX(${data.reloadProgress})`;

                // Resolve color from active weapon — only update if changed
                const state = HudStore.getState();
                const wep = DataResolver.getWeapons()[state.activeWeapon];
                const color = (wep ? WeaponCategoryColors[wep.category]?.str : null) || COLORS.WHITE.str;
                if (color !== prevColor.current) {
                    barRef.current.style.backgroundColor = color;
                    prevColor.current = color;
                }
            }
        });
    }, []);

    return (
        <div className="fixed inset-0 pointer-events-none z-[100]">
            <div
                ref={containerRef}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 translate-y-10 w-16 h-2 overflow-hidden rounded-sm transition-opacity duration-100 hud-gritty-bar-container"
                style={{ opacity: 0, willChange: 'opacity' }}
            >
                <div
                    ref={barRef}
                    className="w-full h-full origin-left will-change-transform hud-gritty-blended-fill relative"
                    style={{ backgroundColor: COLORS.WHITE.str, transform: 'scaleX(0)' }}
                >
                    <div className="absolute inset-0 hud-noise-overlay opacity-20" />
                </div>
            </div>
        </div>
    );
});