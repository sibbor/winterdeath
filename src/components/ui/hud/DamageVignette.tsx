import React, { useRef, useEffect } from 'react';
import { HudStore } from '../../../store/HudStore';
import { PlayerStatID, PlayerStatusFlags } from '../../../entities/player/PlayerTypes';

const DamageVignette: React.FC = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const gradientRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        return HudStore.subscribe(() => {
            const state = HudStore.getState();
            if (!containerRef.current || !gradientRef.current) return;

            const stats = state.statsBuffer;
            const hp = stats[PlayerStatID.HP];
            const maxHp = stats[PlayerStatID.MAX_HP];
            const isDead = (state.statusFlags & PlayerStatusFlags.DEAD) !== 0;

            // Threshold is currently hardcoded to 0.3 globally for vignette
            const isCritical = hp > 0 && hp <= maxHp * 0.3 && !isDead;
            
            if (!isCritical) {
                containerRef.current.style.opacity = '0';
                return;
            }

            containerRef.current.style.opacity = '1';

            const criticalHpTarget = maxHp * 0.3;
            const criticalSeverity = 1 - (hp / criticalHpTarget);
            const dynamicOpacity = 0.4 + (criticalSeverity * 0.4);

            gradientRef.current.style.background = `radial-gradient(circle, transparent 40%, rgba(220,38,38,${dynamicOpacity}) 100%)`;
        });
    }, []);

    // Component mounts invisibly, entirely controlled by Zero-GC observer
    return (
        <div 
            ref={containerRef} 
            className="absolute inset-0 pointer-events-none z-50 overflow-hidden" 
            style={{ opacity: 0, transition: 'opacity 0.3s ease-in-out' }}
        >
            <div
                ref={gradientRef}
                className="absolute inset-0 animate-pulse-fast pointer-events-none"
            />
            <div className="absolute inset-0 border-[20px] border-red-600/20 blur-2xl animate-pulse-slow pointer-events-none" />
        </div>
    );
};

export default React.memo(DamageVignette);