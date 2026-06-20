import React, { useState, useEffect } from 'react';
import { HudStore } from '../../../../store/HudStore';

interface DamagedObstacleHUD {
    id: string;
    x: number;
    y: number;
    progress: number;
}

/**
 * FloatingDurabilityBars — Zero-GC React interface for rendering floating durability meters.
 * Subscribes to the HudStore fast update loop and updates HTML overlays dynamically.
 */
export const FloatingDurabilityBars: React.FC = React.memo(() => {
    const [bars, setBars] = useState<DamagedObstacleHUD[]>([]);

    useEffect(() => {
        return HudStore.subscribeFastUpdate((data: any) => {
            if (data.damagedObstacles) {
                // To keep state updates to React minimal, we set the state
                setBars([...data.damagedObstacles]);
            } else if (bars.length > 0) {
                setBars([]);
            }
        });
    }, [bars.length]);

    if (bars.length === 0) return null;

    return (
        <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden">
            {bars.map((bar) => {
                const percent = Math.round(bar.progress * 100);
                return (
                    <div
                        key={bar.id}
                        className="absolute w-14 h-1.5 overflow-hidden rounded-sm transition-opacity duration-150 hud-gritty-bar-container"
                        style={{
                            left: `${bar.x}px`,
                            top: `${bar.y}px`,
                            transform: 'translate(-50%, -50%)',
                            opacity: bar.progress > 0 && bar.progress < 1 ? 1 : 0,
                            willChange: 'transform, opacity'
                        }}
                    >
                        <div
                            className="h-full origin-left bg-gradient-to-r from-red-600 via-orange-500 to-amber-400 relative"
                            style={{
                                width: '100%',
                                transform: `scaleX(${bar.progress})`,
                                transition: 'transform 0.1s ease-out',
                                willChange: 'transform'
                            }}
                        >
                            <div className="absolute inset-0 hud-noise-overlay opacity-20" />
                        </div>
                    </div>
                );
            })}
        </div>
    );
});
