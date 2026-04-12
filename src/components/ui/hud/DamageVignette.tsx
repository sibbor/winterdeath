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
            const isCritical = hp > 0 && hp < maxHp * 0.25;
            const isGibMaster = (state.statusFlags & PlayerStatusFlags.GIB_MASTER) !== 0;
            const isQuickFinger = (state.statusFlags & PlayerStatusFlags.QUICK_FINGER) !== 0;

            if (!isCritical && !isGibMaster && !isQuickFinger) {
                containerRef.current.style.opacity = '0';
                return;
            }

            containerRef.current.style.opacity = '1';

            if (isGibMaster) {
                gradientRef.current.style.background = `radial-gradient(circle, transparent 30%, rgba(139, 92, 246, 0.45) 100%)`;
            } else if (isQuickFinger) {
                gradientRef.current.style.background = `radial-gradient(circle, transparent 30%, rgba(59, 130, 246, 0.45) 100%)`;
            } else if (isCritical) {
                const criticalHpTarget = maxHp * 0.3;
                const criticalSeverity = 1 - (hp / criticalHpTarget);
                const dynamicOpacity = 0.4 + (criticalSeverity * 0.4);
                gradientRef.current.style.background = `radial-gradient(circle, transparent 40%, rgba(220,38,38,${dynamicOpacity}) 100%)`;
            }
        });
    }, []);

    // Component mounts invisibly, entirely controlled by Zero-GC observer
    return (
        <div 
            ref={containerRef} 
            className="absolute inset-0 pointer-events-none z-50 overflow-hidden" 
            style={{ opacity: 0, transition: 'opacity 0.4s ease-in-out' }}
        >
            <div
                ref={gradientRef}
                className="absolute inset-0 animate-pulse-fast pointer-events-none"
            />
            {/* Soft outer glow */}
            <div className="absolute inset-0 border-[20px] border-white/5 blur-3xl animate-pulse-slow pointer-events-none" />
        </div>
    );
};

export default React.memo(DamageVignette);