import React, { useRef, useMemo } from 'react';
import { useUIEventBridge } from '../../../../hooks/useUIEventBridge';
import { UIEventType } from '../../../../systems/ui/UIEventRingBuffer';
import { COLORS } from '../../../../utils/ui/ColorUtils';
import { PERKS } from '../../../../content/perks';
import { t } from '../../../../utils/i18n';

const POOL_SIZE = 8;

// ZERO-GC: Pre-allocated static index array outside the render block
// This prevents React/V8 from allocating a new array wrapper on the heap at mount
const POOL_INDICES = [0, 1, 2, 3, 4, 5, 6, 7];

interface ActiveNode {
    type: UIEventType;
    amount: number;
    idx: number;
    spawnTime: number;
    active: boolean;
}

const CombatLog: React.FC = () => {
    const poolRefs = useRef<HTMLDivElement[]>([]);
    const nextIdx = useRef(0);

    // ZERO-GC: Structural layout array instantiated directly without inline Array.from passes
    const activeNodes = useRef<ActiveNode[]>(null!);
    if (!activeNodes.current) {
        activeNodes.current = [
            { type: UIEventType.NONE, amount: 0, idx: -1, spawnTime: 0, active: false },
            { type: UIEventType.NONE, amount: 0, idx: -1, spawnTime: 0, active: false },
            { type: UIEventType.NONE, amount: 0, idx: -1, spawnTime: 0, active: false },
            { type: UIEventType.NONE, amount: 0, idx: -1, spawnTime: 0, active: false },
            { type: UIEventType.NONE, amount: 0, idx: -1, spawnTime: 0, active: false },
            { type: UIEventType.NONE, amount: 0, idx: -1, spawnTime: 0, active: false },
            { type: UIEventType.NONE, amount: 0, idx: -1, spawnTime: 0, active: false },
            { type: UIEventType.NONE, amount: 0, idx: -1, spawnTime: 0, active: false }
        ];
    }

    // ZERO-GC: Stable ref callbacks — pre-allocated once at mount, never re-created in .map()
    const poolRefCallbacks = useMemo(
        () => POOL_INDICES.map(i => (el: HTMLDivElement | null) => { if (el) poolRefs.current[i] = el; }),
        []
    );

    const spawn = (text: string, color: string) => {
        const idx = nextIdx.current;
        nextIdx.current = (idx + 1) % POOL_SIZE;

        const el = poolRefs.current[idx];
        if (!el) return;

        el.innerText = text;
        el.style.color = color;

        // Random horizontal jitter to prevent overlays stacking exactly
        const jitterX = Math.random() * 80 - 40;

        // Reset element animation by reflowing
        el.style.animation = 'none';
        void el.offsetHeight; // trigger reflow

        el.style.setProperty('--jitter-x', `${jitterX}px`);
        el.style.display = 'block';
        el.style.animation = 'combat-float 1.8s cubic-bezier(0.25, 1, 0.5, 1) forwards';
    };

    const spawnAccumulated = (type: UIEventType, amount: number, label: string, color: string) => {
        const now = Date.now();

        let existing = null;
        for (let i = 0; i < POOL_SIZE; i++) {
            const node = activeNodes.current[i];
            if (node.active && now - node.spawnTime >= 1800) {
                node.active = false;
            }
            if (node.active && node.type === type) {
                existing = node;
            }
        }

        if (existing) {
            existing.amount += amount;
            existing.spawnTime = now;

            const el = poolRefs.current[existing.idx];
            if (el) {
                el.innerText = `+${existing.amount} ${label}`;
                el.style.animation = 'none';
                void el.offsetHeight;
                el.style.animation = 'combat-float 1.8s cubic-bezier(0.25, 1, 0.5, 1) forwards';
            }
            return;
        }

        const idx = nextIdx.current;
        nextIdx.current = (idx + 1) % POOL_SIZE;

        const el = poolRefs.current[idx];
        if (!el) return;

        // Deactivate any old node using this slot index
        for (let i = 0; i < POOL_SIZE; i++) {
            const node = activeNodes.current[i];
            if (node.idx === idx) {
                node.active = false;
            }
        }

        // Reuse an inactive slot in the structural array
        let slot = null;
        for (let i = 0; i < POOL_SIZE; i++) {
            if (!activeNodes.current[i].active) {
                slot = activeNodes.current[i];
                break;
            }
        }
        if (!slot) {
            slot = activeNodes.current[0]; // Fallback
        }

        slot.active = true;
        slot.type = type;
        slot.amount = amount;
        slot.idx = idx;
        slot.spawnTime = now;

        el.innerText = `+${amount} ${label}`;
        el.style.color = color;

        const jitterX = Math.random() * 80 - 40;
        el.style.animation = 'none';
        void el.offsetHeight;
        el.style.setProperty('--jitter-x', `${jitterX}px`);
        el.style.display = 'block';
        el.style.animation = 'combat-float 1.8s cubic-bezier(0.25, 1, 0.5, 1) forwards';
    };

    useUIEventBridge((type, p1) => {
        // UNTOUCHED: Optimized JIT Jump-Table branch mapping execution hot-path
        switch (type) {
            case UIEventType.XP_GAIN:
                spawnAccumulated(type, p1, 'XP', COLORS.BLUE.str);
                break;
            case UIEventType.SP_GAIN:
                spawnAccumulated(type, p1, 'SP', COLORS.PURPLE.str);
                break;
            case UIEventType.SCRAP_GAIN:
                spawnAccumulated(type, p1, 'SCRAP', COLORS.ORANGE.str);
                break;
            case UIEventType.CP_GAIN:
                spawnAccumulated(type, p1, 'CP', COLORS.RED.str);
                break;
            case UIEventType.BUFF_GAIN: {
                const perk = PERKS[p1];
                if (perk) {
                    spawn(`BUFF: ${t(perk.displayName)}`, COLORS.GREEN.str);
                }
                break;
            }
            case UIEventType.DEBUFF_GAIN: {
                const perk = PERKS[p1];
                if (perk) {
                    spawn(`DEBUFF: ${t(perk.displayName)}`, COLORS.RED.str);
                }
                break;
            }
        }
    });

    return (
        <div className="fixed inset-0 pointer-events-none z-[1000] select-none font-black tracking-tighter uppercase text-center font-mono" style={{ contain: 'layout paint' }}>
            <div className="absolute left-1/2 top-[55%] -translate-x-1/2">
                {POOL_INDICES.map((i) => (
                    <div
                        key={i}
                        ref={poolRefCallbacks[i]}
                        className="absolute left-1/2 top-0 whitespace-nowrap drop-shadow-[0_4px_12px_rgba(0,0,0,1)]"
                        style={{
                            display: 'none',
                            willChange: 'transform, opacity',
                            textShadow: '0 0 10px rgba(0,0,0,0.8), -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000'
                        }}
                    />
                ))}
            </div>

            <style>{`
            @keyframes combat-float {
                0% {
                opacity: 0;
                transform: translate(calc(-50% + var(--jitter-x)), 20px) scale(0.6);
                }
                10% {
                opacity: 1;
                transform: translate(calc(-50% + var(--jitter-x)), 20px) scale(1.15);
                }
                25% {
                transform: translate(calc(-50% + var(--jitter-x)), 30px) scale(1.0);
                }
                100% {
                opacity: 0;
                transform: translate(calc(-50% + var(--jitter-x)), 120px) scale(0.85);
                }
            }
            `}</style>
        </div>
    );
};

export default CombatLog;