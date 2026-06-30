import React, { useMemo, useCallback, useState, useRef, useEffect } from 'react';
import { WeaponCategoryColors, WeaponCategory } from '../../../../content/weapons';
import { WeaponID, ToolID } from '../../../../entities/player/CombatTypes';
import { t } from '../../../../utils/i18n';
import { useHudStore } from '../../../../hooks/useHudStore';
import { DataResolver } from '../../../../core/data/DataResolver';
import { COLORS } from '../../../../utils/ui/ColorUtils';
import { UISounds } from '../../../../utils/audio/AudioLib';

interface ActionBarPanelProps {
    loadout: { primary: WeaponID; secondary: WeaponID; throwable: WeaponID; special: WeaponID; };
    isMobileDevice: boolean;
    onSelectWeapon?: (slot: string) => void;
    showTooltip: (text: string) => void;
    clearTooltip: () => void;
    ammoTextRef: React.RefObject<HTMLSpanElement | null>;
    reloadBarRef: React.RefObject<HTMLDivElement | null>;
}

export const ActionBarPanel: React.FC<ActionBarPanelProps> = React.memo(({
    loadout,
    isMobileDevice,
    onSelectWeapon,
    ammoTextRef,
    reloadBarRef
}) => {
    const activeWeapon = useHudStore(s => s.activeWeapon);
    const numThrowableAmmo = useHudStore(s => s.throwableAmmo);
    const familyFound = useHudStore(s => s.familyFound);
    const unlimitedAmmo = useHudStore(s => s.unlimitedAmmo);
    const weapon = DataResolver.getWeapons()[activeWeapon];

    // Local tooltip state for slot anchoring (PC only)
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
    const [hoveredText, setHoveredText] = useState<string | null>(null);

    // INTERNAL SOURCE OF TRUTH: Slot layout maps directly coupled to visual definitions
    const weaponSlots = useMemo(() => [
        { slot: '1', type: loadout.primary },
        { slot: '2', type: loadout.secondary },
        { slot: '3', type: loadout.throwable },
        { slot: '4', type: loadout.special },
        { slot: '5', type: ToolID.RADIO }
    ], [loadout.primary, loadout.secondary, loadout.throwable, loadout.special]);

    // Refs to each slot button for imperative shimmer triggering (e.g. on keyboard selection)
    const slotButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);

    // Fire shimmer whenever activeWeapon changes (covers keyboard [1-5] on PC)
    useEffect(() => {
        const idx = weaponSlots.findIndex(s => s.type === activeWeapon);
        if (idx < 0) return;
        const btn = slotButtonRefs.current[idx];
        if (!btn) return;
        btn.classList.remove('hud-slot-shimmer');
        void btn.offsetWidth; // Force reflow
        btn.classList.add('hud-slot-shimmer');
    }, [activeWeapon, weaponSlots]);

    // ENCAPSULATED ACTIONS: Click handlers kept local to action bar concerns
    const handleSelectWeaponInternal = useCallback((e: React.MouseEvent<HTMLElement> | React.TouchEvent<HTMLElement>) => {
        e.stopPropagation();
        if (e.cancelable) e.preventDefault();
        const slot = e.currentTarget.dataset.slot;

        // Trigger Shimmer Visual
        const button = e.currentTarget;
        if (button) {
            button.classList.remove('hud-slot-shimmer');
            void button.offsetWidth; // Force Reflow
            button.classList.add('hud-slot-shimmer');
        }

        if (slot && onSelectWeapon) {
            onSelectWeapon(slot);
            UISounds.playClick();
        }
    }, [onSelectWeapon]);

    const handleActionEnter = useCallback((index: number, text: string) => {
        if (isMobileDevice) return;
        setHoveredIndex(index);
        setHoveredText(text);
    }, [isMobileDevice]);

    const handleActionLeave = useCallback(() => {
        setHoveredIndex(null);
        setHoveredText(null);
    }, []);

    return (
        <div className={`absolute ${isMobileDevice ? 'bottom-2 pb-safe' : 'bottom-4'} left-1/2 -translate-x-1/2 flex flex-col items-center justify-center p-6 min-w-[320px]`}>
            {/* Shimmer + Hover Glow CSS — hoisted once outside the render loop */}
            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes slotsShimmer {
                    0%   { transform: translateX(-150%) skewX(-15deg); }
                    100% { transform: translateX(250%)  skewX(-15deg); }
                }
                .hud-slot-shimmer-overlay {
                    position: absolute;
                    inset: 0;
                    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent);
                    width: 60%;
                    height: 100%;
                    transform: translateX(-150%) skewX(-15deg);
                    pointer-events: none;
                    z-index: 5;
                }
                .hud-slot-shimmer .hud-slot-shimmer-overlay {
                    animation: slotsShimmer 0.45s ease-out forwards;
                }
                .hud-slot-hovered {
                    box-shadow: 0 0 10px rgba(251, 146, 60, 0.5);
                    outline: 1.5px solid rgba(251, 146, 60, 0.7);
                }
            `}} />

            <div className="absolute inset-0 pointer-events-none"
                style={{
                    background: 'radial-gradient(50% 50% at 50% 50%, rgba(0, 0, 0, 0.95) 0%, rgba(0, 0, 0, 0.65) 60%, transparent 100%)',
                    filter: 'blur(16px)',
                    transform: 'scaleX(1.5) scaleY(1.15)'
                }}
            />

            <div className="relative flex flex-col items-center z-10 w-full">
                {weapon && activeWeapon !== ToolID.RADIO && (
                    <div className={`${isMobileDevice ? 'mb-2' : 'mb-3'} text-center animate-fadeIn flex items-baseline`}>
                        <span ref={ammoTextRef} className={`${isMobileDevice ? 'text-2xl' : 'text-4xl'} font-bold text-white tracking-tighter font-mono`}>
                            {unlimitedAmmo ? '∞' : '--'}
                        </span>
                        {!weapon.isEnergy && (
                            <span className={`${isMobileDevice ? 'text-[10px]' : 'text-xl'} font-bold text-white/30 ml-1 font-mono`}>/ {weapon.magSize || 0}</span>
                        )}
                    </div>
                )}

                <div className={`flex ${isMobileDevice ? 'gap-1.5' : 'gap-3'} pointer-events-auto`}>
                    {weaponSlots.map(({ slot, type }, idx) => {
                        const wData = DataResolver.getWeapons()[Number(type)];
                        if (!wData) return null;

                        const isActive = activeWeapon === type;
                        const isThrowable = wData.category === WeaponCategory.THROWABLE;
                        const isRadio = type === ToolID.RADIO;
                        const size = isMobileDevice ? "w-16 h-16" : "w-20 h-20";
                        const cColor = WeaponCategoryColors[wData.category] || COLORS.WHITE;
                        const tText = wData.displayName ? t(wData.displayName) : wData.id.toString();
                        const isHovered = hoveredIndex === idx;

                        return (
                            <div key={slot} className="relative">
                                {/* Local Tooltip (PC only, anchored to this specific slot relative to its parent) */}
                                {!isMobileDevice && isHovered && hoveredText && (
                                    <div
                                        className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-zinc-950/90 border border-white/10 backdrop-blur-md rounded-md shadow-lg pointer-events-none z-30 animate-fadeIn"
                                        style={{
                                            width: 'max-content',
                                            maxWidth: '200px'
                                        }}
                                    >
                                        <p className="text-white leading-tight font-mono text-[13px] text-center tracking-wide text-wrap break-words">
                                            <strong className="font-extrabold text-orange-400">{hoveredText}</strong>
                                        </p>
                                    </div>
                                )}

                                <button data-slot={slot}
                                    ref={el => { slotButtonRefs.current[idx] = el; }}
                                    onClick={handleSelectWeaponInternal}
                                    onTouchStart={handleSelectWeaponInternal}
                                    onMouseEnter={(e) => {
                                        if (!isMobileDevice) {
                                            handleActionEnter(idx, tText);
                                            e.currentTarget.classList.add('hud-slot-hovered');
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        handleActionLeave();
                                        e.currentTarget.classList.remove('hud-slot-hovered', 'hud-slot-shimmer');
                                    }}
                                    className={`flex items-center justify-center relative transition-transform duration-200 overflow-hidden pointer-events-auto rounded-sm ${size} ${isActive ? 'scale-[1.12] z-20' : 'opacity-70 hover:opacity-95'}`}
                                    style={{
                                        backgroundColor: 'transparent',
                                        '--slot-color': cColor.str
                                    } as any}>

                                    {/* Shimmer overlay element — animated by .hud-slot-shimmer class on the button */}
                                    <div className="hud-slot-shimmer-overlay" />

                                    {/* Custom Bottom Border with Left-to-Right Reloading Fill */}
                                    <div className="absolute bottom-0 left-0 w-full bg-white/10" style={{ height: isActive ? '5px' : '2px' }}>
                                        <div
                                            ref={isActive ? reloadBarRef : undefined}
                                            className="h-full w-full origin-left will-change-transform"
                                            style={{
                                                backgroundColor: cColor.str,
                                                transform: 'scaleX(1)'
                                            }}
                                        />
                                    </div>

                                    <div className={`${isMobileDevice ? 'w-8 h-8' : 'w-10 h-10'} flex items-center justify-center mb-1 relative z-10`}
                                        style={{ filter: isActive ? 'drop-shadow(0_0_2px_rgba(255,255,255,0.8))' : 'opacity(0.8)' }}>
                                        {wData.iconIsPng ? <img src={wData.icon} alt="" className="w-full h-full object-contain filter brightness-0 invert" /> : <div className="w-full h-full text-white" dangerouslySetInnerHTML={{ __html: wData.icon }} />}
                                    </div>

                                    {!isMobileDevice && <span className="absolute bottom-1.5 right-2 text-[10px] font-mono font-bold text-white/20 z-10">{slot}</span>}

                                    {isThrowable && (
                                        <div className="absolute bottom-2 left-1 right-1 flex justify-center gap-0.5 z-10 px-1">
                                            {Array.from({ length: wData.magSize || 0 }).map((_, j) => (
                                                <div key={j}
                                                    className="h-1 flex-1 border border-zinc-950"
                                                    style={{ backgroundColor: j < numThrowableAmmo ? cColor.str : 'transparent' }} />
                                            ))}
                                        </div>
                                    )}

                                    {isRadio && familyFound && <span className="absolute bottom-1 w-full text-center text-[10px] font-mono font-black uppercase text-blue-300 drop-shadow-md z-10">{t('ui.located')}</span>}
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
});