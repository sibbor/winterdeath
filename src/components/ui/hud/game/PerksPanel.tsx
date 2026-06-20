import React, { useRef, useImperativeHandle, forwardRef, useEffect, useMemo } from 'react';
import { t } from '../../../../utils/i18n';
import { DataResolver } from '../../../../core/data/DataResolver';
import { StatusEffectID } from '../../../../types/StatusEffects';
import { HudStore } from '../../../../store/HudStore';
import { PerkCategory, PerkColor } from '../../../../content/perks';
import { MAX_PASSIVES, MAX_BUFFS, MAX_DEBUFFS } from './HudTypes';

// ============================================================================
// GLOBAL CORE ALLOCATION CACHE (moved from GameHUD — perks-only concern)
// ============================================================================
const _arrayCache: Record<number, number[]> = {};
const getCachedArray = (length: number): number[] => {
    if (!_arrayCache[length]) {
        _arrayCache[length] = [];
        for (let i = 0; i < length; i++) _arrayCache[length].push(i);
    }
    return _arrayCache[length];
};

const getPerkIcon = (type: StatusEffectID | string) => {
    if (typeof type === 'number') return DataResolver.getPerks()[type]?.icon || '❓';
    const n = type.toUpperCase();
    const perks = DataResolver.getPerks() as any;
    if (perks[n]) return perks[n].icon;
    return '❓';
};

interface PooledPerkBubbleProps {
    isPassive?: boolean;
    isMobileDevice: boolean;
    isLandscapeMode: boolean;
    showTooltip: (text: string) => void;
    clearTooltip: () => void;
}

const PooledPerkBubble = forwardRef(({ isPassive, isMobileDevice, isLandscapeMode, showTooltip, clearTooltip }: PooledPerkBubbleProps, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const iconRef = useRef<HTMLSpanElement>(null);
    const barRef = useRef<HTMLDivElement>(null);
    const currentPulse = useRef<string>('');

    useImperativeHandle(ref, () => ({
        // color is just a string we are told to apply
        update: (type: StatusEffectID | null, progress: number, color: string, pulseClass: string) => {
            if (!containerRef.current || !iconRef.current) return;

            if (type === null) {
                containerRef.current.style.display = 'none';
            } else {
                containerRef.current.style.display = 'flex';
                containerRef.current.style.borderColor = color;

                if (currentPulse.current !== pulseClass) {
                    if (currentPulse.current) containerRef.current.classList.remove(currentPulse.current);
                    if (pulseClass && pulseClass.length > 0) containerRef.current.classList.add(pulseClass);
                    currentPulse.current = pulseClass;
                }

                const icon = getPerkIcon(type);
                if (iconRef.current.innerText !== icon) iconRef.current.innerText = icon;

                if (barRef.current) {
                    barRef.current.style.transform = `scaleX(${progress})`;
                    barRef.current.style.backgroundColor = color;
                }

                const name = DataResolver.getPerkName(type);
                const desc = DataResolver.getPerkDescription(type);
                containerRef.current.dataset.tooltip = name ? `${t(name)}: ${t(desc)}` : type.toString();
            }
        }
    }));

    const handleEnter = () => {
        const text = containerRef.current?.dataset.tooltip;
        if (text) showTooltip(text);
    };

    const handleTouch = (e: React.TouchEvent) => {
        e.preventDefault();
        const text = containerRef.current?.dataset.tooltip;
        if (text) showTooltip(text);
    };

    return (
        <div ref={containerRef}
            className={`shrink-0 ${isMobileDevice && isLandscapeMode ? 'w-10 h-10 text-xl' : 'w-10 h-10 text-[14px]'} flex items-center justify-center bg-black/80 border-2 ${isPassive ? 'rounded-full' : 'rounded-sm'} relative cursor-help`}
            style={{ display: 'none' }}
            onMouseEnter={!isMobileDevice ? handleEnter : undefined}
            onMouseLeave={!isMobileDevice ? clearTooltip : undefined}
            onTouchStart={isMobileDevice ? handleTouch : undefined}>
            <span ref={iconRef}>❓</span>
            {!isPassive && (
                <div className="absolute -bottom-2 left-0 w-full h-0.5 bg-black/40">
                    <div ref={barRef} className="w-full h-full origin-left will-change-transform" style={{ transform: 'scaleX(1)' }} />
                </div>
            )}
        </div>
    );
});

interface PerksPanelProps {
    isMobileDevice: boolean;
    isLandscapeMode: boolean;
    showTooltip: (text: string) => void;
    clearTooltip: () => void;
}

export const PerksPanel: React.FC<PerksPanelProps> = React.memo(({
    isMobileDevice,
    isLandscapeMode,
    showTooltip,
    clearTooltip
}) => {
    // ============================================================================
    // POOL REFS — all owned here, not in GameHUD
    // ============================================================================
    const passiveRefs = useRef<any[]>([]);
    const effectRefs = useRef<{ buffs: any[]; debuffs: any[] }>({ buffs: [], debuffs: [] });

    // Stable ref callback arrays — never reallocated after mount
    const passivePoolRefs = useMemo(() =>
        getCachedArray(MAX_PASSIVES).map(i => (el: any) => { if (el) passiveRefs.current[i] = el; }), []);
    const buffPoolRefs = useMemo(() =>
        getCachedArray(MAX_BUFFS).map(i => (el: any) => { if (el) effectRefs.current.buffs[i] = el; }), []);
    const debuffPoolRefs = useMemo(() =>
        getCachedArray(MAX_DEBUFFS).map(i => (el: any) => { if (el) effectRefs.current.debuffs[i] = el; }), []);

    // ============================================================================
    // HOT PATH: Perk bubble updates via subscribeFastUpdate
    // Mirrors the Zero-GC loop that previously lived in GameHUD.handleFastUpdate
    // ============================================================================
    useEffect(() => {
        const handleFastUpdate = (_data: any) => {
            const hudState = HudStore.getState();

            // 1. Passives
            for (let i = 0; i < MAX_PASSIVES; i++) {
                const el = passiveRefs.current[i];
                if (el) {
                    el.update(
                        i < hudState.activePassivesCount ? hudState.activePassives[i] : null,
                        0,
                        PerkColor.PASSIVE.str,
                        ''
                    );
                }
            }

            // 2. Buffs & Debuffs
            const effCount = hudState.statusEffectsCount;
            const effTypes = hudState.StatusEffectIDs || (hudState as any).statusEffectIds;
            const effProgs = hudState.statusEffectProgress;

            let buffIdx = 0;
            let debuffIdx = 0;

            for (let i = 0; i < effCount; i++) {
                const type = effTypes[i];
                const progress = effProgs[i];
                const perk = DataResolver.getPerks()[type];
                const isDebuff = perk?.category === PerkCategory.DEBUFF;

                if (isDebuff) {
                    if (debuffIdx < MAX_DEBUFFS) {
                        const el = effectRefs.current.debuffs[debuffIdx];
                        if (el) el.update(type, progress, PerkColor.DEBUFF.str, 'hud-debuff-pulse');
                        debuffIdx++;
                    }
                } else {
                    if (buffIdx < MAX_BUFFS) {
                        const el = effectRefs.current.buffs[buffIdx];
                        if (el) el.update(type, progress, PerkColor.BUFF.str, 'hud-buff-pulse');
                        buffIdx++;
                    }
                }
            }

            // 3. Clear remaining slots (Zero-GC cleanup)
            for (let i = buffIdx; i < MAX_BUFFS; i++) {
                const el = effectRefs.current.buffs[i];
                if (el) el.update(null, 0, '', '');
            }
            for (let i = debuffIdx; i < MAX_DEBUFFS; i++) {
                const el = effectRefs.current.debuffs[i];
                if (el) el.update(null, 0, '', '');
            }
        };

        return HudStore.subscribeFastUpdate(handleFastUpdate);
    }, []);

    return (
        <div className="flex flex-row items-center gap-2 mt-2 ml-1 pointer-events-auto overflow-visible whitespace-nowrap">
            {passivePoolRefs.map((refPointer, i) => (
                <PooledPerkBubble
                    isPassive
                    key={`pass-pool-${i}`}
                    ref={refPointer}
                    isMobileDevice={isMobileDevice}
                    isLandscapeMode={isLandscapeMode}
                    showTooltip={showTooltip}
                    clearTooltip={clearTooltip}
                />
            ))}
            {buffPoolRefs.map((refPointer, i) => (
                <PooledPerkBubble
                    key={`buff-pool-${i}`}
                    ref={refPointer}
                    isMobileDevice={isMobileDevice}
                    isLandscapeMode={isLandscapeMode}
                    showTooltip={showTooltip}
                    clearTooltip={clearTooltip}
                />
            ))}
            {debuffPoolRefs.map((refPointer, i) => (
                <PooledPerkBubble
                    key={`debuff-pool-${i}`}
                    ref={refPointer}
                    isMobileDevice={isMobileDevice}
                    isLandscapeMode={isLandscapeMode}
                    showTooltip={showTooltip}
                    clearTooltip={clearTooltip}
                />
            ))}
        </div>
    );
});