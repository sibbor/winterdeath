import React from 'react';

interface DamageVignetteProps {
    hp: number;
    maxHp: number;
    threshold: number;
    isDead?: boolean;
}

const DamageVignette: React.FC<DamageVignetteProps> = ({ hp, maxHp, threshold, isDead }) => {
    const isCritical = hp > 0 && hp <= maxHp * threshold && !isDead;

    if (!isCritical) return null;

    // Räkna ut hur djupt in i "kritiska zonen" vi är (0.0 till 1.0)
    const criticalHpTarget = maxHp * threshold;
    const criticalSeverity = 1 - (hp / criticalHpTarget);

    // Bas-opacitet + extra opacitet ju närmare 0 HP vi kommer
    const baseOpacity = 0.4;
    const dynamicOpacity = baseOpacity + (criticalSeverity * 0.4);

    return (
        <div className="absolute inset-0 pointer-events-none z-50 overflow-hidden">
            <div
                className="absolute inset-0 animate-pulse-fast pointer-events-none"
                style={{
                    background: `radial-gradient(circle, transparent 40%, rgba(220,38,38,${dynamicOpacity}) 100%)`
                }}
            />
            <div className="absolute inset-0 border-[20px] border-red-600/20 blur-2xl animate-pulse-slow pointer-events-none" />
        </div>
    );
};

export default DamageVignette;