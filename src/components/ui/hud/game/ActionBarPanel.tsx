import React, { useMemo, useCallback } from 'react';
import { WeaponCategoryColors, WeaponCategory } from '../../../../content/weapons';
import { WeaponID, ToolID } from '../../../../entities/player/CombatTypes';
import { t } from '../../../../utils/i18n';
import { useHudStore } from '../../../../hooks/useHudStore';
import { DataResolver } from '../../../../core/data/DataResolver';
import { COLORS } from '../../../../utils/ui/ColorUtils';
import { UISounds } from '../../../../utils/audio/AudioLib';

const ReloadGrittyFill = ({ reloadBarRef, catColor }: { reloadBarRef: React.RefObject<HTMLDivElement | null>, catColor: string }) => {
    return (
        <div ref={reloadBarRef}
            className="absolute inset-0 w-full h-full origin-bottom hud-gritty-blended-fill z-0 will-change-transform"
            style={{ backgroundColor: catColor, transform: 'scaleY(0)' }} />
    );
};

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
    showTooltip,
    clearTooltip,
    ammoTextRef,
    reloadBarRef
}) => {
    const activeWeapon = useHudStore(s => s.activeWeapon);
    const numThrowableAmmo = useHudStore(s => s.throwableAmmo);
    const familyFound = useHudStore(s => s.familyFound);
    const unlimitedAmmo = useHudStore(s => s.unlimitedAmmo);
    const weapon = DataResolver.getWeapons()[activeWeapon];

    // INTERNAL SOURCE OF TRUTH: Slot layout maps directly coupled to visual definitions
    const weaponSlots = useMemo(() => [
        { slot: '1', type: loadout.primary },
        { slot: '2', type: loadout.secondary },
        { slot: '3', type: loadout.throwable },
        { slot: '4', type: loadout.special },
        { slot: '5', type: ToolID.RADIO }
    ], [loadout.primary, loadout.secondary, loadout.throwable, loadout.special]);

    // ENCAPSULATED ACTIONS: Click handlers kept local to action bar concerns
    const handleSelectWeaponInternal = useCallback((e: React.MouseEvent<HTMLElement> | React.TouchEvent<HTMLElement>) => {
        e.stopPropagation();
        if (e.cancelable) e.preventDefault();
        const slot = e.currentTarget.dataset.slot;
        if (slot && onSelectWeapon) {
            onSelectWeapon(slot);
            UISounds.playClick();
        }
    }, [onSelectWeapon]);

    const handleActionEnter = useCallback((e: React.MouseEvent<HTMLElement> | React.TouchEvent<HTMLElement>) => {
        if ('targetTouches' in e) e.stopPropagation();
        const text = e.currentTarget.dataset.tooltip;
        if (text) showTooltip(text);
    }, [showTooltip]);

    return (
        <div className={`absolute ${isMobileDevice ? 'bottom-2 pb-safe' : 'bottom-4'} left-1/2 -translate-x-1/2 flex flex-col items-center justify-center p-6 min-w-[320px]`}>
            <div className="absolute inset-0 pointer-events-none"
                style={{
                    background: 'radial-gradient(50% 50% at 50% 50%, rgba(0, 0, 0, 0.95) 0%, rgba(0, 0, 0, 0.65) 60%, transparent 100%)',
                    filter: 'blur(16px)',
                    transform: 'scaleX(1.5) scaleY(1.15)'
                }}
            />

            <div className="relative flex flex-col items-center z-10 w-full">
                {weapon && weapon.category !== WeaponCategory.THROWABLE && activeWeapon !== ToolID.RADIO && (
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
                    {weaponSlots.map(({ slot, type }) => {
                        const wData = DataResolver.getWeapons()[Number(type)];
                        if (!wData) return null;

                        const isActive = activeWeapon === type;
                        const isThrowable = wData.category === WeaponCategory.THROWABLE;
                        const isRadio = type === ToolID.RADIO;
                        const size = isMobileDevice ? "w-16 h-16" : "w-20 h-20";
                        const cColor = WeaponCategoryColors[wData.category] || COLORS.WHITE;

                        return (
                            <button key={slot} data-slot={slot}
                                onClick={handleSelectWeaponInternal}
                                onTouchStart={handleSelectWeaponInternal}
                                onMouseEnter={!isMobileDevice ? handleActionEnter : undefined}
                                onMouseLeave={!isMobileDevice ? clearTooltip : undefined}
                                data-tooltip={wData.displayName ? t(wData.displayName) : wData.id}
                                className={`flex items-center justify-center relative transition-transform duration-200 overflow-hidden pointer-events-auto rounded-sm ${size} ${isActive ? 'scale-[1.12] z-20 shadow-lg' : 'opacity-70 hover:opacity-95'}`}
                                style={{
                                    borderBottom: isActive ? `5px solid ${cColor.str}` : `2px solid ${cColor.str}`,
                                    backgroundColor: isActive ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0.25)',
                                    '--slot-color': cColor.str
                                } as any}>
                                <div className={`absolute inset-0 bg-gradient-to-t ${isActive ? 'from-white/10 to-transparent' : 'from-black/60 to-black/20'}`} />

                                {isActive && <ReloadGrittyFill reloadBarRef={reloadBarRef} catColor={cColor.str} />}

                                <div className="absolute inset-0 hud-noise-overlay opacity-20 mix-blend-overlay z-0" />

                                <div className={`${isMobileDevice ? 'w-8 h-8' : 'w-10 h-10'} flex items-center justify-center mb-1 relative z-10`}
                                    style={{ filter: isActive ? 'drop-shadow(0_0_2px_rgba(255,255,255,0.8))' : 'opacity(0.8)' }}>
                                    {wData.iconIsPng ? <img src={wData.icon} alt="" className="w-full h-full object-contain filter brightness-0 invert" /> : <div className="w-full h-full text-white" dangerouslySetInnerHTML={{ __html: wData.icon }} />}
                                </div>

                                {!isMobileDevice && <span className="absolute bottom-1 right-2 text-[10px] font-mono font-bold text-white/20 z-10">{slot}</span>}

                                {isThrowable && (
                                    <div className="absolute bottom-1.5 left-1 right-1 flex justify-center gap-0.5 z-10 px-1">
                                        {Array.from({ length: wData.magSize || 0 }).map((_, j) => (
                                            <div key={j}
                                                className="h-1 flex-1 border border-zinc-950"
                                                style={{ backgroundColor: j < numThrowableAmmo ? cColor.str : 'transparent' }} />
                                        ))}
                                    </div>
                                )}

                                {isRadio && familyFound && <span className="absolute bottom-1 w-full text-center text-[10px] font-mono font-black uppercase text-blue-300 drop-shadow-md z-10">{t('ui.located')}</span>}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
});