import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { WeaponType, WeaponCategoryColors } from '../../../content/weapons';
import { WEAPONS, HEALTH_CRITICAL_THRESHOLD } from '../../../content/constants';
import { t } from '../../../utils/i18n';
import { useHudStore } from '../../../hooks/useHudStore';
import { useOrientation } from '../../../hooks/useOrientation';
import { HudStore } from '../../../store/HudStore';
import { StatusEffectType } from '../../../types/combat';
import DamageVignette from './DamageVignette';

interface GameHUDProps {
    loadout: { primary: WeaponType; secondary: WeaponType; throwable: WeaponType; special: WeaponType; };
    weaponLevels?: Record<WeaponType, number>;
    debugMode?: boolean;
    isBossIntro?: boolean;
    isMobileDevice?: boolean;
    onTogglePause?: () => void;
    onToggleMap?: () => void;
    onSelectWeapon?: (slot: string) => void;
    onRotateCamera?: (dir: number) => void;
}

// --- ENUMS FOR TYPE SAFETY ---
export enum FamilyMember {
    LOKE = 'LOKE',
    JORDAN = 'JORDAN',
    ESMERALDA = 'ESMERALDA',
    NATHALIE = 'NATHALIE',
    SOTIS = 'SOTIS',
    PANTER = 'PANTER'
}

// --- PERFORMANCE: Static CSS and Zero-GC helpers ---
const HUD_WRAPPER = "absolute inset-0 pointer-events-none transition-all duration-500 ease-in";
const BAR_WRAPPER = "hud-bar-container relative overflow-hidden";

// --- WINTER DEATH THEME: Add 'hud-gritty-base' and 'hud-gritty-texture' for grunge look ---
const SLOT_BASE = "hud-slot flex items-center justify-center relative transition-transform duration-200 overflow-hidden pointer-events-auto hud-gritty-base hud-gritty-texture";

const _arrayCache: Record<number, number[]> = {};
const getCachedArray = (length: number): number[] => {
    if (!_arrayCache[length]) {
        _arrayCache[length] = [];
        for (let i = 0; i < length; i++) _arrayCache[length].push(i);
    }
    return _arrayCache[length];
};

const getStatusIcon = (type: StatusEffectType | string) => {
    switch (type) {
        case StatusEffectType.FREEZING: return '❄️';
        case StatusEffectType.BURNING: return '🔥';
        case StatusEffectType.BLEEDING: return '🩸';
        case StatusEffectType.ELECTRIFIED: return '⚡';
        case StatusEffectType.SLOWED: return '🐌';
        case StatusEffectType.DISORIENTED: return '😵';
        default: return '❓';
    }
};

const getPassiveIcon = (name: string) => {
    const n = name.toUpperCase();
    switch (n) {
        case FamilyMember.LOKE: return '⚡';
        case FamilyMember.JORDAN: return '🎯';
        case FamilyMember.ESMERALDA: return '🔫';
        case FamilyMember.NATHALIE: return '🛡️';
        case FamilyMember.SOTIS:
        case FamilyMember.PANTER: return '🐱';
        default: return getStatusIcon(name as StatusEffectType);
    }
};

const isFamilyMember = (name: string) => {
    return Object.values(FamilyMember).includes(name.toUpperCase() as FamilyMember);
};

// ============================================================================
// HIGH-FREQUENCY DOM MUTATORS (Bypassing React Render Cycle)
// ============================================================================

const BuffIcon = React.memo(({ type, isMobileDevice, isLandscapeMode, handleActionEnter }: any) => {
    const barRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let lastProgress = -1; // Delta cache
        const unsubscribe = HudStore.subscribe((state) => {
            if (!barRef.current) return;
            let progress = 0;
            for (let i = 0; i < state.statusEffects.length; i++) {
                if (state.statusEffects[i].type === type) {
                    progress = Math.min(1.0, state.statusEffects[i].duration / 5000);
                    break;
                }
            }
            if (progress !== lastProgress) {
                barRef.current.style.transform = `scaleX(${progress})`;
                lastProgress = progress;
            }
        });
        return unsubscribe;
    }, [type]);

    return (
        <div className={`${isMobileDevice && isLandscapeMode ? 'w-10 h-10 text-xl' : 'w-7 h-7 text-[11px]'} flex items-center justify-center bg-black/80 border-2 rounded-sm hud-buff-pulse relative cursor-help border-purple-500`}
            data-tooltip={t(`attacks.${type}.title`)}
            onTouchStart={isMobileDevice ? handleActionEnter : undefined}>
            <span>{getStatusIcon(type)}</span>
            <div className="absolute -bottom-1 left-0 w-full h-0.5 bg-black/40">
                <div ref={barRef} className="w-full h-full bg-purple-500 origin-left" style={{ transform: 'scaleX(1)' }} />
            </div>
        </div>
    );
});

// ============================================================================
// RELOAD GRITTY FILL
// Blends weapon color with grunge texture, filling from bottom up.
// ============================================================================
const ReloadGrittyFill = React.memo(({ isActive, catColor }: { isActive: boolean, catColor: string }) => {
    const barRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isActive) return;
        let lastProgress = -1; // Delta cache
        const unsubscribe = HudStore.subscribe((state) => {
            if (barRef.current && state.reloadProgress !== lastProgress) {
                barRef.current.style.transform = `scaleY(${state.reloadProgress})`;
                lastProgress = state.reloadProgress;
            }
        });
        return unsubscribe;
    }, [isActive]);

    if (!isActive) return null;

    return (
        <div ref={barRef}
            className="absolute inset-0 w-full h-full origin-bottom hud-gritty-blended-fill z-0 will-change-transform"
            style={{ backgroundColor: catColor, transform: 'scaleY(0)' }} />
    );
});

// ============================================================================
// FLOATING RELOAD BAR (GPU Accelerated CSS - Fixed Center - Gritty)
// ============================================================================
const FloatingReloadBar = React.memo(({ activeWeapon }: { activeWeapon: WeaponType }) => {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const fillRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let lastProgress = -1;
        let lastVisible = false;

        const unsubscribe = HudStore.subscribe((state) => {
            if (!wrapperRef.current || !fillRef.current) return;

            // 1. Handle Visibility
            const isVisible = state.isReloading;
            if (isVisible !== lastVisible) {
                wrapperRef.current.style.opacity = isVisible ? '1' : '0';
                lastVisible = isVisible;
            }

            // 2. Handle Progress Fill
            if (isVisible && state.reloadProgress !== lastProgress) {
                fillRef.current.style.transform = `scaleX(${state.reloadProgress})`;
                lastProgress = state.reloadProgress;
            }
        });

        return unsubscribe;
    }, []);

    const wep = WEAPONS[activeWeapon];
    const catColor = wep ? (WeaponCategoryColors as any)[wep.category] || 'white' : 'white';

    return (
        <div className="fixed inset-0 pointer-events-none z-[100]">
            <div
                ref={wrapperRef}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 translate-y-10 w-16 h-2 overflow-hidden rounded-sm transition-opacity duration-100 hud-gritty-bar-container"
                style={{ opacity: 0, willChange: 'opacity' }}
            >
                <div
                    ref={fillRef}
                    className="w-full h-full origin-left will-change-transform hud-gritty-blended-fill relative"
                    style={{ backgroundColor: catColor, transform: 'scaleX(0)' }}
                >
                    <div className="absolute inset-0 hud-noise-overlay opacity-20" />
                </div>
            </div>
        </div>
    );
});

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

const VitalsPanel = React.memo(({ isMobileDevice, isBossIntro }: { isMobileDevice: boolean, isBossIntro: boolean }) => {
    const hpBarRef = useRef<HTMLDivElement>(null);
    const hpTextRef = useRef<HTMLSpanElement>(null);
    const stBarRef = useRef<HTMLDivElement>(null);
    const xpBarRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let lastHpScale = -1;
        let lastHpValue = -1;
        let lastMaxHpValue = -1;
        let lastStScale = -1;
        let lastXpScale = -1;

        const unsubscribe = HudStore.subscribe((state) => {
            const hpScale = state.maxHp > 0 ? Math.max(0, state.hp / state.maxHp) : 0;
            if (hpScale !== lastHpScale) {
                if (hpBarRef.current) hpBarRef.current.style.transform = `scaleX(${hpScale})`;
                lastHpScale = hpScale;
            }

            const roundedHp = Math.max(0, Math.ceil(state.hp));
            if (roundedHp !== lastHpValue || state.maxHp !== lastMaxHpValue) {
                const hpText = `${roundedHp} / ${state.maxHp}`;
                if (hpTextRef.current) hpTextRef.current.textContent = hpText;
                lastHpValue = roundedHp;
                lastMaxHpValue = state.maxHp;
            }

            const stScale = state.maxStamina > 0 ? Math.max(0, state.stamina / state.maxStamina) : 0;
            if (stScale !== lastStScale) {
                if (stBarRef.current) stBarRef.current.style.transform = `scaleX(${stScale})`;
                lastStScale = stScale;
            }

            const xpScale = state.nextLevelXp > 0 ? Math.min(1, Math.max(0, state.currentXp / state.nextLevelXp)) : 0;
            if (xpScale !== lastXpScale) {
                if (xpBarRef.current) xpBarRef.current.style.transform = `scaleX(${xpScale})`;
                lastXpScale = xpScale;
            }
        });
        return unsubscribe;
    }, []);

    return (
        <div className={`flex flex-col gap-1.5 ${isMobileDevice ? 'w-40' : 'w-80'} transition-opacity duration-500 ${isBossIntro ? 'opacity-0' : 'opacity-100'}`}>
            <div className={`${BAR_WRAPPER} ${isMobileDevice ? 'h-5' : 'h-10'} w-full border border-red-500/30`}>
                <div className="h-full bg-red-900/20 relative">
                    <div ref={hpBarRef} className="w-full h-full bg-[#ff3333] transition-transform duration-300 origin-left hud-bar-glow" style={{ transform: 'scaleX(0)' }} />
                    <div className="absolute inset-0 flex items-center justify-start px-3">
                        <span ref={hpTextRef} className={`${isMobileDevice ? 'text-[10px]' : 'text-[13px]'} text-white font-mono font-bold tracking-tighter`}>
                            0 / 100
                        </span>
                    </div>
                </div>
            </div>

            <div className={`${BAR_WRAPPER} ${isMobileDevice ? 'h-2' : 'h-4'} w-full border border-purple-500/30`}>
                <div className="h-full bg-purple-900/20 relative">
                    <div ref={stBarRef} className="w-full h-full bg-[#a855f7] transition-transform duration-300 origin-left hud-bar-glow" style={{ transform: 'scaleX(0)' }} />
                </div>
            </div>

            <div className={`${BAR_WRAPPER} ${isMobileDevice ? 'h-1.5' : 'h-2.5'} w-full border border-cyan-500/30`}>
                <div className="h-full bg-cyan-900/20 relative">
                    <div ref={xpBarRef} className="w-full h-full bg-[#06b6d4] transition-transform duration-300 origin-left hud-bar-glow" style={{ transform: 'scaleX(0)' }} />
                </div>
            </div>
        </div>
    );
});

const StatusEffectsPanel = React.memo(({ isMobileDevice, isLandscapeMode, handleActionEnter, handleActionLeave }: any) => {
    const activePassives = useHudStore(s => s.activePassives);
    const activeBuffs = useHudStore(s => s.activeBuffs);

    return (
        <div className={isMobileDevice && isLandscapeMode ? "absolute top-24 left-0 flex flex-col gap-2 pl-safe pointer-events-auto" : "flex flex-wrap gap-2 mt-1 ml-1 pointer-events-auto"}>
            {activePassives.map((name, i) => (
                <div key={`p-${i}`}
                    className={`${isMobileDevice && isLandscapeMode ? 'w-10 h-10 text-xl' : 'w-7 h-7 text-[11px]'} flex items-center justify-center bg-black/80 border-2 rounded-full border-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)] transition-all cursor-help`}
                    data-tooltip={isFamilyMember(name) ? t(`family.${name.toLowerCase()}`) : t(`attacks.${name}.title`)}
                    onMouseEnter={!isMobileDevice ? handleActionEnter : undefined}
                    onMouseLeave={!isMobileDevice ? handleActionLeave : undefined}
                    onTouchStart={isMobileDevice ? handleActionEnter : undefined}>
                    <span>{getPassiveIcon(name)}</span>
                </div>
            ))}
            {activeBuffs.map((type, i) => (
                <BuffIcon
                    key={`b-${i}`}
                    type={type}
                    isMobileDevice={isMobileDevice}
                    isLandscapeMode={isLandscapeMode}
                    handleActionEnter={handleActionEnter}
                />
            ))}
        </div>
    );
});

const KillsPanel = React.memo(({ isMobileDevice, isBossIntro, handlePauseInternal }: any) => {
    const kills = useHudStore(s => s.kills);

    return (
        <div className={`flex items-start ${isMobileDevice ? 'gap-4' : 'gap-8'} transition-opacity duration-500 ${isBossIntro ? 'opacity-0' : 'opacity-100'}`}>
            {isMobileDevice && (
                <button className="w-12 h-12 rounded-full border border-white/20 bg-black/60 text-white font-bold backdrop-blur-sm flex items-center justify-center active:scale-95 pointer-events-auto"
                    onTouchStart={handlePauseInternal}>
                    ||
                </button>
            )}
            <div className="flex flex-col items-center">
                <span className={`${isMobileDevice ? 'text-3xl' : 'text-7xl'} font-thin text-white font-mono leading-none hud-kill-text`}>
                    {kills}
                </span>
                <span className={`${isMobileDevice ? 'text-[9px]' : 'text-sm'} font-bold text-[#ff3333] tracking-widest uppercase opacity-80`}>
                    {t('ui.kills')}
                </span>
            </div>
        </div>
    );
});

const BossWavePanel = React.memo(({ isMobileDevice }: { isMobileDevice: boolean }) => {
    const bossActive = useHudStore(s => s.boss?.active || false);
    const bossName = useHudStore(s => s.boss?.name || '');
    const bossHp = useHudStore(s => s.boss?.hp || 0);
    const bossMaxHp = useHudStore(s => s.boss?.maxHp || 1);
    const bossDefeated = useHudStore(s => s.bossDefeated);

    const waveActive = useHudStore(s => s.sectorStats?.zombieWaveActive || false);
    const waveKills = useHudStore(s => s.sectorStats?.zombiesKilled || 0);
    const waveTarget = useHudStore(s => (s.sectorStats?.zombiesKillTarget || s.sectorStats?.hordeTarget) || 1);

    const renderSegments = (current: number, max: number, colorClass: string = 'active') => {
        const total = isMobileDevice ? 10 : 12;
        const active = Math.ceil((current / max) * total);
        return (
            <div className={`segmented-health-bar ${isMobileDevice ? 'max-w-[200px] gap-1' : ''}`}>
                {getCachedArray(total).map((i) => (
                    <div key={i} className={`health-segment ${i < active ? colorClass : ''} ${isMobileDevice ? 'h-1.5' : ''}`} />
                ))}
            </div>
        );
    };

    if (bossActive && !bossDefeated) {
        return (
            <div className="w-full flex flex-col items-center animate-fadeIn">
                <h2 className={`${isMobileDevice ? 'text-sm mb-2 opacity-60' : 'text-5xl font-light mb-4 opacity-80'} text-white tracking-widest uppercase hud-text-glow`}>
                    {t(bossName)}
                </h2>
                {renderSegments(bossHp, bossMaxHp)}
            </div>
        );
    }

    if (waveActive) {
        return (
            <div className="w-full flex flex-col items-center animate-fadeIn">
                <h2 className={`${isMobileDevice ? 'text-xs mb-1' : 'text-4xl mb-2'} font-semibold text-[#ff3333] italic tracking-tighter uppercase hud-text-glow`}>
                    {t('zombie_wave')}
                </h2>
                {renderSegments(waveKills, waveTarget, 'active')}
            </div>
        );
    }

    return null;
});

const BottomActionPanel = React.memo(({ isMobileDevice, isBossIntro, weaponSlots, handleSelectWeaponInternal }: any) => {
    const isDriving = useHudStore(s => s.isDriving);
    const vehicleSpeed = useHudStore(s => s.vehicleSpeed);
    const throttleState = useHudStore(s => s.throttleState);
    const ammo = useHudStore(s => s.ammo);
    const magSize = useHudStore(s => s.magSize);
    const activeWeapon = useHudStore(s => s.activeWeapon);
    const isReloading = useHudStore(s => s.isReloading);
    const throwableAmmo = useHudStore(s => s.throwableAmmo);
    const familyFound = useHudStore(s => s.familyFound);
    const unlimitedAmmo = useHudStore(s => s.sectorStats?.unlimitedAmmo || false);

    const speedKmH = Math.round(vehicleSpeed * 3.6);
    const wep = WEAPONS[activeWeapon];

    return (
        <div className={`absolute ${isMobileDevice ? 'bottom-4' : 'bottom-12'} left-1/2 -translate-x-1/2 flex flex-col items-center transition-opacity duration-500 ${isBossIntro ? 'opacity-0' : 'opacity-100'}`}>
            {!isDriving && wep && wep.category !== 'THROWABLE' && activeWeapon !== WeaponType.RADIO && (
                <div className={`${isMobileDevice ? 'mb-2' : 'mb-4'} text-center animate-fadeIn flex items-baseline`}>
                    <span className={`${isMobileDevice ? 'text-2xl' : 'text-4xl'} font-bold text-white tracking-tighter font-mono`}>
                        {unlimitedAmmo ? '∞' : ammo}
                    </span>
                    <span className={`${isMobileDevice ? 'text-[10px]' : 'text-xl'} font-bold text-white/30 ml-1 font-mono`}>/ {magSize}</span>
                </div>
            )}

            {isDriving ? (
                <div className={`flex flex-col items-center ${isMobileDevice ? 'pt-2' : 'pt-8'}`}>
                    <div className={`${BAR_WRAPPER} hud-gritty-base hud-gritty-texture ${isMobileDevice ? 'px-8 py-2' : 'px-12 py-4'} shadow-2xl`}>
                        <span className={`${isMobileDevice ? 'text-4xl' : 'text-6xl'} font-semibold text-white tracking-tighter block hud-text-glow text-center`}>
                            {speedKmH}
                        </span>
                        <span className="text-[10px] font-medium text-white/40 uppercase tracking-[0.3em] block text-center mt-1">KM/H</span>
                    </div>
                    <div className="flex gap-4 mt-4">
                        <div className={`px-6 py-2 border transition-all ${throttleState > 0 ? 'bg-[#06b6d4]/20 border-[#06b6d4] text-cyan-200' : 'bg-black/80 border-white/10 text-white/20'}`}>
                            <span className="text-xs font-black uppercase tracking-widest">{t('ui.gas')}</span>
                        </div>
                        <div className={`px-6 py-2 border transition-all ${throttleState < 0 ? 'bg-[#ff3333]/20 border-[#ff3333] text-red-200' : 'bg-black/80 border-white/10 text-white/20'}`}>
                            <span className="text-xs font-black uppercase tracking-widest">{t('ui.brake')}</span>
                        </div>
                    </div>
                </div>
            ) : (
                <div className={`flex ${isMobileDevice ? 'gap-1.5' : 'gap-3'} pointer-events-auto`}>
                    {weaponSlots.map(({ slot, type }: any) => {
                        const wData = WEAPONS[type];
                        if (!wData) return null;

                        const isActive = activeWeapon === type;
                        const isThrowable = wData.category === 'THROWABLE';
                        const isRadio = type === WeaponType.RADIO;
                        const size = isMobileDevice ? "w-16 h-16" : "w-20 h-20";
                        const catColor = WeaponCategoryColors[wData.category as keyof typeof WeaponCategoryColors] || 'white';

                        return (
                            <button key={slot} data-slot={slot}
                                onClick={!isMobileDevice ? handleSelectWeaponInternal : undefined}
                                onTouchStart={isMobileDevice ? handleSelectWeaponInternal : undefined}
                                // Use transform: scale() so it enlarges visibly without shifting flex items
                                className={`${SLOT_BASE} ${size} ${isActive ? 'scale-[1.15] z-20 border-[3px]' : 'opacity-80 border border-white/20 hover:opacity-80'} 
                                               ${(isRadio && familyFound) || (isThrowable && throwableAmmo <= 0) ? 'grayscale' : ''}`}
                                style={{
                                    borderColor: isActive ? catColor : undefined,
                                    // Combine color accent glow with the dark inner-shadow
                                    boxShadow: isActive ? `0 0 20px -5px ${catColor}, inset 0 0 15px rgba(0,0,0,0.9)` : undefined
                                }}>

                                {/* Gritty fill behind the weapon icon */}
                                <ReloadGrittyFill isActive={isActive && isReloading} catColor={catColor} />

                                {/* Static noise overlay to sit behind the weapon icon but inside the slot */}
                                <div className="absolute inset-0 hud-noise-overlay opacity-20 mix-blend-overlay z-0" />

                                <div className={`${isMobileDevice ? 'w-8 h-8' : 'w-10 h-10'} flex items-center justify-center mb-1 relative z-10`}
                                    style={{ filter: isActive ? 'drop-shadow(0_0_2px_rgba(255,255,255,1.0))' : 'opacity(0.8)' }}>
                                    {wData.iconIsPng ? <img src={wData.icon} alt="" className="w-full h-full object-contain filter brightness-0 invert" /> : <div className="w-full h-full text-white" dangerouslySetInnerHTML={{ __html: wData.icon }} />}
                                </div>

                                {!isMobileDevice && <span className="absolute bottom-1 right-2 text-[10px] font-mono font-bold text-white/20 z-10">{slot}</span>}

                                {isThrowable && (
                                    <div className="absolute bottom-1 left-1 right-1 flex justify-center gap-0.5 z-10 px-1">
                                        {getCachedArray(wData.magSize || 0).map(i => (
                                            <div key={i} className={`h-1 flex-1 ${i < throwableAmmo ? 'shadow-sm' : 'bg-zinc-800 border border-zinc-700'}`}
                                                style={{ backgroundColor: i < throwableAmmo ? catColor : undefined }} />
                                        ))}
                                    </div>
                                )}

                                {isRadio && familyFound && <span className="absolute bottom-1 w-full text-center text-[9px] font-black uppercase text-blue-300 drop-shadow-md z-10">{t('ui.located')}</span>}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
});

// ============================================================================
// MAIN HUD LAYOUT
// ============================================================================

const GameHUD: React.FC<GameHUDProps> = React.memo(({
    loadout, weaponLevels, debugMode = false, isBossIntro = false, isMobileDevice = false,
    onTogglePause, onToggleMap, onSelectWeapon, onRotateCamera
}) => {
    // Only fetch layout-breaking states at the top level
    const hp = useHudStore(s => s.hp);
    const maxHp = useHudStore(s => s.maxHp);
    const isDead = useHudStore(s => s.isDead);
    const isDisoriented = useHudStore(s => s.isDisoriented);
    const activeWeapon = useHudStore(s => s.activeWeapon);
    const { isLandscapeMode } = useOrientation();

    const [tooltipContent, setTooltipContent] = useState<string | null>(null);
    const tooltipTimeout = useRef<any>(null);

    const showTooltip = useCallback((text: string) => {
        if (tooltipTimeout.current) clearTimeout(tooltipTimeout.current);
        setTooltipContent(text);
        tooltipTimeout.current = setTimeout(() => setTooltipContent(null), isMobileDevice ? 2000 : 3000);
    }, [isMobileDevice]);

    const handleActionEnter = useCallback((e: React.MouseEvent<HTMLElement> | React.TouchEvent<HTMLElement>) => {
        if ('targetTouches' in e) e.stopPropagation();
        const text = e.currentTarget.dataset.tooltip;
        if (text) showTooltip(text);
    }, [showTooltip]);

    const handleActionLeave = useCallback(() => setTooltipContent(null), []);

    const weaponSlots = useMemo(() => [
        { slot: '1', type: loadout.primary },
        { slot: '2', type: loadout.secondary },
        { slot: '3', type: loadout.throwable },
        { slot: '4', type: loadout.special },
        { slot: '5', type: WeaponType.RADIO }
    ], [loadout.primary, loadout.secondary, loadout.throwable, loadout.special]);

    const handleSelectWeaponInternal = useCallback((e: React.MouseEvent<HTMLElement> | React.TouchEvent<HTMLElement>) => {
        e.stopPropagation();
        const slot = e.currentTarget.dataset.slot;
        if (slot && onSelectWeapon) onSelectWeapon(slot);
    }, [onSelectWeapon]);

    const handlePauseInternal = useCallback((e: React.TouchEvent<HTMLElement>) => {
        e.stopPropagation();
        onTogglePause?.();
    }, [onTogglePause]);

    return (
        <>
            <DamageVignette hp={hp} maxHp={maxHp} threshold={HEALTH_CRITICAL_THRESHOLD} isDead={isDead} />

            <div className={`${HUD_WRAPPER} ${isDead || isDisoriented ? 'opacity-0 scale-110 blur-[5px]' : 'opacity-100 scale-100 blur-0'}`}>

                <div className={`absolute ${isMobileDevice ? 'top-4 left-4 right-4' : 'top-8 left-8 right-12'} flex justify-between items-start`}>

                    <div className={`flex flex-col gap-1.5 ${isMobileDevice ? 'w-40' : 'w-80'}`}>
                        <VitalsPanel isMobileDevice={isMobileDevice} isBossIntro={isBossIntro} />
                        {(!isMobileDevice || !isLandscapeMode) && (
                            <StatusEffectsPanel isMobileDevice={isMobileDevice} isLandscapeMode={false} handleActionEnter={handleActionEnter} handleActionLeave={handleActionLeave} />
                        )}
                    </div>

                    <KillsPanel isMobileDevice={isMobileDevice} isBossIntro={isBossIntro} handlePauseInternal={handlePauseInternal} />

                    {isMobileDevice && isLandscapeMode && (
                        <StatusEffectsPanel isMobileDevice={isMobileDevice} isLandscapeMode={true} handleActionEnter={handleActionEnter} handleActionLeave={handleActionLeave} />
                    )}
                </div>

                <div className={`absolute ${isMobileDevice ? 'top-20 px-12' : 'top-32'} left-1/2 -translate-x-1/2 flex flex-col items-center w-full max-w-[600px]`}>
                    <BossWavePanel isMobileDevice={isMobileDevice} />
                </div>

                {/* UI RELOAD BAR OVER PLAYER HEAD */}
                <FloatingReloadBar activeWeapon={activeWeapon} />

                <BottomActionPanel isMobileDevice={isMobileDevice} isBossIntro={isBossIntro} weaponSlots={weaponSlots} handleSelectWeaponInternal={handleSelectWeaponInternal} />

                {tooltipContent && (
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[1000] px-8 py-4 bg-zinc-950/90 border-2 border-white/20 backdrop-blur-3xl rounded-full shadow-[0_0_50px_rgba(0,0,0,0.8)] animate-in fade-in zoom-in duration-300">
                        <span className={`${isMobileDevice ? 'text-sm' : 'text-lg'} text-white font-bold uppercase tracking-widest whitespace-nowrap`}>
                            {tooltipContent}
                        </span>
                    </div>
                )}

                {/* --- WINTER DEATH GRITTY CSS --- */}
                <style>{`
                    @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                    @keyframes buffPulse { 0%, 100% { box-shadow: 0 0 5px rgba(168,85,247,0.4); border-color: rgba(168,85,247,0.8); } 50% { box-shadow: 0 0 15px rgba(168,85,247,0.8); border-color: #a855f7; } }
                    @keyframes debuffPulse { 0%, 100% { box-shadow: 0 0 5px rgba(239,68,68,0.4); border-color: rgba(239,68,68,0.8); } 50% { box-shadow: 0 0 15px rgba(239,68,68,0.8); border-color: #ef4444; } }
                    
                    .hud-buff-pulse { animation: buffPulse 2s infinite ease-in-out; }
                    .hud-debuff-pulse { animation: debuffPulse 2s infinite ease-in-out; }
                    
                    /* --- Winter Death noise texture base64 --- */
                    .hud-noise-overlay {
                        background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
                        background-repeat: repeat;
                        background-size: 100px 100px;
                        pointer-events: none;
                    }

                    /* General grungy base for panels */
                    .hud-gritty-base {
                        background-color: rgba(15, 15, 15, 0.9);
                        box-shadow: inset 0 0 15px rgba(0, 0, 0, 0.9);
                        border: 1px solid rgba(255, 255, 255, 0.08);
                    }

                    /* Add the texture layer as an ::after element so it sits above backgrounds but below content */
                    .hud-gritty-texture { position: relative; }
                    .hud-gritty-texture::after {
                        content: '';
                        position: absolute;
                        inset: 0;
                        opacity: 0.1; /* Subtle grime */
                        background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
                        background-repeat: repeat;
                        background-size: 100px 100px;
                        pointer-events: none;
                        z-index: 1; /* Sit above the solid fill z-0 */
                    }

                    /* Styling for the floating reload bar container */
                    .hud-gritty-bar-container {
                        background-color: rgba(10, 10, 10, 0.95);
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        box-shadow: 0 0 15px rgba(0,0,0,0.8), inset 0 0 5px rgba(0,0,0,0.9);
                    }

                    /* Special blending for reloading fills (darker, grungier) */
.hud-gritty-blended-fill {
    filter: brightness(1.2) saturate(1.2);
    box-shadow: inset 0 0 10px rgba(0,0,0,0.6); 
}

                    .hud-text-glow { text-shadow: 0 0 15px rgba(255,255,255,0.3); }
                    .hud-bar-glow { box-shadow: 0 0 10px rgba(255,255,255,0.2); }
                `}</style>
            </div>
        </>
    );
});

export default GameHUD;