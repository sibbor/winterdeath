import React, { useState, useRef, useMemo, useCallback, useEffect, useImperativeHandle, forwardRef } from 'react';
import { WeaponCategoryColors, WeaponCategory } from '../../../content/weapons';
import { WeaponID, ToolID } from '../../../entities/player/CombatTypes';
import { t } from '../../../utils/i18n';
import { useHudStore } from '../../../hooks/useHudStore';
import { useOrientation } from '../../../hooks/useOrientation';
import { HudStore } from '../../../store/HudStore';
import { PerkColor, PerkCategory } from '../../../content/perks';
import { DataResolver } from '../../../core/data/DataResolver';
import { UISounds } from '../../../utils/audio/AudioLib';
import ScreenEffect from './ScreenEffect';
import DiscoveryPopup from './DiscoveryPopup';
import InteractionPrompt from './InteractionPrompt';
import ChallengePopup from './ChallengePopup';
import ChatBubble from './ChatBubble';
import CombatLog from './CombatLog';
import LevelUpBanner from './LevelUpBanner';
import SectorBanner from './SectorBanner';
import { useUIEventBridge } from '../../../hooks/useUIEventBridge';
import { UIEventType } from '../../../systems/ui/UIEventRingBuffer';
import { StatusEffectID } from '../../../types/StatusEffects';
import { COLORS } from '../../../utils/ui/ColorUtils';

interface GameHUDProps {
    loadout: { primary: WeaponID; secondary: WeaponID; throwable: WeaponID; special: WeaponID; };
    weaponLevels?: Record<WeaponID, number>;
    debugMode?: boolean;
    isBossIntro?: boolean;
    isMobileDevice?: boolean;
    onTogglePause?: () => void;
    onToggleMap?: () => void;
    onSelectWeapon?: (slot: string) => void;
    onRotateCamera?: (dir: number) => void;
    onOpenAdventureLog?: (tab?: any, itemId?: string) => void;
    isSectorBannerActive?: boolean;
    onSectorBannerComplete?: () => void;
}

// --- PERFORMANCE: Static CSS ---
const HUD_WRAPPER = "absolute inset-0 pointer-events-none transition-all duration-500 ease-in z-[110]";
const BAR_WRAPPER = "hud-bar-container relative overflow-hidden";
const SLOT_BASE = "hud-slot flex items-center justify-center relative transition-transform duration-200 overflow-hidden pointer-events-auto hud-gritty-base hud-gritty-texture";

const _arrayCache: Record<number, number[]> = {};
const getCachedArray = (length: number): number[] => {
    if (!_arrayCache[length]) {
        _arrayCache[length] = [];
        for (let i = 0; i < length; i++) _arrayCache[length].push(i);
    }
    return _arrayCache[length];
};

const getStatusIcon = (type: StatusEffectID | string) => {
    if (typeof type === 'number') return DataResolver.getPerks()[type]?.icon || '❓';
    const n = type.toUpperCase();
    const perks = DataResolver.getPerks() as any;
    if (perks[n]) return perks[n].icon;
    return '❓';
};

const getPassiveIcon = (type: StatusEffectID | string) => {
    if (typeof type === 'string') {
        const n = type.toUpperCase();
        return getStatusIcon(n);
    }
    return DataResolver.getPerks()[type as StatusEffectID]?.icon || '❓';
};

// ============================================================================
// SUB-COMPONENTS (Refactored to accept Refs)
// ============================================================================

const ReloadGrittyFill = ({ reloadBarRef, catColor }: { reloadBarRef: React.RefObject<HTMLDivElement>, catColor: string }) => {
    return (
        <div ref={reloadBarRef}
            className="absolute inset-0 w-full h-full origin-bottom hud-gritty-blended-fill z-0 will-change-transform"
            style={{ backgroundColor: catColor, transform: 'scaleY(0)' }} />
    );
};

const FloatingReloadBar = ({ reloadBarRef, catColor, containerRef }: { reloadBarRef: React.RefObject<HTMLDivElement>, catColor: string, containerRef: React.RefObject<HTMLDivElement> }) => {
    return (
        <div className="fixed inset-0 pointer-events-none z-[100]">
            <div
                ref={containerRef}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 translate-y-10 w-16 h-2 overflow-hidden rounded-sm transition-opacity duration-100 hud-gritty-bar-container"
                style={{ opacity: 0, willChange: 'opacity' }}
            >
                <div
                    ref={reloadBarRef}
                    className="w-full h-full origin-left will-change-transform hud-gritty-blended-fill relative"
                    style={{ backgroundColor: catColor, transform: 'scaleX(0)' }}
                >
                    <div className="absolute inset-0 hud-noise-overlay opacity-20" />
                </div>
            </div>
        </div>
    );
};

const VitalsPanel = React.memo(({ isMobileDevice, isBossIntro, hpBarRef, hpTextRef, stBarRef, stTextRef, xpBarRef, xpTextRef }: any) => {
    return (
        <div className={`relative flex flex-col gap-2 p-4 ${isMobileDevice ? 'w-40' : 'w-80'} transition-opacity duration-500 ${isBossIntro ? 'opacity-0' : 'opacity-100'}`}>
            {/* SMOKY CINEMATIC BACKGROUND */}
            <div
                className="absolute inset-0 pointer-events-none animate-fadeIn"
                style={{
                    background: 'radial-gradient(50% 50% at 50% 50%, rgba(0, 0, 0, 0.95) 0%, rgba(0, 0, 0, 0.65) 60%, transparent 100%)',
                    filter: 'blur(16px)',
                    transform: 'scaleX(1.4) scaleY(1.15)'
                }}
            />

            {/* CONTENT wrapper */}
            <div className="relative flex flex-col gap-2 z-10 w-full">
                {/* HP BAR (No border) */}
                <div className={`w-full overflow-hidden bg-black/45 rounded-sm relative ${isMobileDevice ? 'h-5' : 'h-8'}`}>
                    <div ref={hpBarRef} className="w-full h-full origin-left will-change-transform" style={{ backgroundColor: COLORS.RED.str, transform: 'scaleX(0)' }} />
                    <div className="absolute inset-0 flex items-center justify-start px-3">
                        <span ref={hpTextRef} className={`${isMobileDevice ? 'text-[10px]' : 'text-[12px]'} text-white font-mono font-bold tracking-widest drop-shadow-md`}>
                            0 / 100
                        </span>
                    </div>
                </div>

                {/* STAMINA BAR (No border) */}
                <div className={`w-full overflow-hidden bg-black/45 rounded-sm relative ${isMobileDevice ? 'h-2' : 'h-3.5'}`}>
                    <div ref={stBarRef} className="w-full h-full origin-left will-change-transform" style={{ backgroundColor: COLORS.PURPLE.str, transform: 'scaleX(0)' }} />
                </div>

                {/* XP BAR (No border) */}
                <div className={`w-full overflow-hidden bg-black/45 rounded-sm relative ${isMobileDevice ? 'h-1.5' : 'h-2.5'}`}>
                    <div ref={xpBarRef} className="w-full h-full origin-left will-change-transform" style={{ backgroundColor: COLORS.CYAN.str, transform: 'scaleX(0)' }} />
                </div>
            </div>
        </div>
    );
});

// PERFORMANCE: Pre-allocated pool sizes for Zero-GC orchestration
const POOL_SIZE_PASSIVE = 8;
const POOL_SIZE_BUFF = 8;
const POOL_SIZE_DEBUFF = 8;

/**
 * FIXED DOM POOL for Status Icons.
 */
const StatusEffectIconPooled = forwardRef(({ index, isMobileDevice, isLandscapeMode, handleActionEnter, handleActionLeave }: any, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const iconRef = useRef<HTMLSpanElement>(null);
    const barRef = useRef<HTMLDivElement>(null);
    const currentPulse = useRef<string>(''); // Cache pulse state to prevent Layout Thrashing

    useImperativeHandle(ref, () => ({
        update: (type: StatusEffectID | null, progress: number, color: any, pulseClass: string) => {
            if (!containerRef.current || !iconRef.current || !barRef.current) return;

            if (type === null) {
                containerRef.current.style.display = 'none';
            } else {
                const colorStr = typeof color === 'string' ? color : (color?.str || '#ffffff');
                containerRef.current.style.display = 'flex';
                containerRef.current.style.borderColor = colorStr;

                // ZERO-GC Check: Only modify class lists on layout modifications frames
                if (currentPulse.current !== pulseClass) {
                    if (currentPulse.current) containerRef.current.classList.remove(currentPulse.current);
                    if (pulseClass && pulseClass.length > 0) containerRef.current.classList.add(pulseClass);
                    currentPulse.current = pulseClass;
                }

                const icon = getStatusIcon(type);
                if (iconRef.current.innerText !== icon) iconRef.current.innerText = icon;

                barRef.current.style.transform = `scaleX(${progress})`;
                barRef.current.style.backgroundColor = colorStr;

                const name = DataResolver.getPerkName(type);
                const desc = DataResolver.getPerkDescription(type);
                containerRef.current.dataset.tooltip = name ? `${t(name)}: ${t(desc)}` : type.toString();
            }
        }
    }));

    return (
        <div ref={containerRef} className={`shrink-0 ${isMobileDevice && isLandscapeMode ? 'w-10 h-10 text-xl' : 'w-10 h-10 text-[14px]'} flex items-center justify-center bg-black/80 border-2 rounded-sm relative cursor-help`}
            style={{ display: 'none' }}
            onTouchStart={isMobileDevice ? handleActionEnter : undefined}
            onMouseEnter={!isMobileDevice ? handleActionEnter : undefined}
            onMouseLeave={!isMobileDevice ? handleActionLeave : undefined}>
            <span ref={iconRef}>❓</span>
            <div className="absolute -bottom-2 left-0 w-full h-0.5 bg-black/40">
                <div ref={barRef} className="w-full h-full origin-left will-change-transform" style={{ transform: 'scaleX(1)' }} />
            </div>
        </div>
    );
});

// ZERO-GC: Permanent Pool for Passive Icons (No Bars)
const PassiveIconPooled = forwardRef(({ index, isMobileDevice, isLandscapeMode, handleActionEnter, handleActionLeave }: any, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const iconRef = useRef<HTMLSpanElement>(null);

    useImperativeHandle(ref, () => ({
        update: (id: StatusEffectID | null) => {
            if (!containerRef.current || !iconRef.current) return;
            if (id === null) {
                containerRef.current.style.display = 'none';
            } else {
                containerRef.current.style.display = 'flex';
                const icon = getPassiveIcon(id);
                if (iconRef.current.innerText !== icon) iconRef.current.innerText = icon;

                const name = DataResolver.getPerkName(id);
                const desc = DataResolver.getPerkDescription(id);
                containerRef.current.dataset.tooltip = name ? `${t(name)}: ${t(desc)}` : id.toString();
            }
        }
    }));

    return (
        <div ref={containerRef}
            className={`shrink-0 ${isMobileDevice && isLandscapeMode ? 'w-10 h-10 text-xl' : 'w-10 h-10 text-[14px]'} flex items-center justify-center bg-black/80 border-2 rounded-full transition-all cursor-help`}
            style={{ display: 'none', borderColor: PerkColor.PASSIVE.str, boxShadow: `0 0 10px ${PerkColor.PASSIVE.str}` }}
            onTouchStart={isMobileDevice ? handleActionEnter : undefined}
            onMouseEnter={!isMobileDevice ? handleActionEnter : undefined}
            onMouseLeave={!isMobileDevice ? handleActionLeave : undefined}>
            <span ref={iconRef}>❓</span>
        </div>
    );
});

const KillsPanel = React.memo(({ isMobileDevice, isLandscapeMode, isBossIntro, handlePauseInternal, killsTextRef }: any) => {
    return (
        <div className={`flex items-start ${isMobileDevice ? 'gap-4' : 'gap-8'} transition-opacity duration-500 ${isBossIntro ? 'opacity-0' : 'opacity-100'}`}>
            {isMobileDevice && (
                <button className="w-12 h-12 rounded-full border border-white/20 bg-black/60 text-white font-bold backdrop-blur-sm flex items-center justify-center active:scale-95 pointer-events-auto"
                    onTouchStart={handlePauseInternal}>
                    ||
                </button>
            )}
            <div className="flex flex-col items-center">
                <span ref={killsTextRef} className={`${isMobileDevice ? 'text-3xl' : 'text-7xl'} font-thin text-white font-mono leading-none hud-kill-text`}>
                    0
                </span>
                <span className={`${isMobileDevice ? 'text-[10px]' : 'text-sm'} font-bold tracking-widest uppercase opacity-80`} style={{ color: COLORS.RED.str }}>
                    {t('ui.kills')}
                </span>
            </div>
        </div>
    );
});

const CurrencyPanel = React.memo(({ isMobileDevice, isLandscapeMode, isBossIntro, scrapTextRef, spTextRef, scrapBoxRef, spBoxRef }: any) => {
    const size = isMobileDevice ? 'w-14 h-14' : 'w-20 h-20';

    return (
        <div className={`flex ${isMobileDevice && isLandscapeMode ? 'flex-row' : 'flex-col'} gap-3 transition-opacity duration-500 ${isBossIntro ? 'opacity-0' : 'opacity-100'}`}>
            {/* SCRAP BOX (CampHUD Style) */}
            <div ref={scrapBoxRef}
                className={`${size} aspect-square border bg-yellow-950/80 border-yellow-700 shadow-[0_0_15px_rgba(234,179,8,0.2)] flex flex-col items-center justify-center gap-0 transition-all pointer-events-auto`}>
                <span className={`${isMobileDevice ? 'text-[10px]' : 'text-[10px]'} block uppercase font-bold text-yellow-500 leading-tight`}>{t('ui.scrap')}</span>
                <span ref={scrapTextRef} className={`${isMobileDevice ? 'text-lg' : 'text-2xl'} font-bold font-mono text-yellow-500 leading-none`}>0</span>
            </div>

            {/* SP BOX (CampHUD Style) */}
            <div ref={spBoxRef}
                className={`${size} aspect-square border bg-purple-950/80 border-purple-700 shadow-[0_0_15px_rgba(168,85,247,0.2)] flex flex-col items-center justify-center gap-0 transition-all pointer-events-auto`}>
                <span className={`${isMobileDevice ? 'text-[10px]' : 'text-[10px]'} block uppercase font-bold text-purple-500 leading-tight`}>{t('ui.sp')}</span>
                <span ref={spTextRef} className={`${isMobileDevice ? 'text-lg' : 'text-2xl'} font-bold font-mono text-purple-500 leading-none`}>0</span>
            </div>
        </div>
    );
});

const BossPanel = React.memo(({ isMobileDevice, bossHpBarRef, bossHpTrailBarRef }: any) => {
    const bossActive = useHudStore(s => s.bossActive);
    const bossDefeated = useHudStore(s => s.bossDefeated);
    const bossName = useHudStore(s => s.bossActive ? s.bossName : '');

    const isVisible = bossActive;
    const isKilled = bossDefeated;

    return (
        <div className={`relative w-full flex flex-col items-center justify-center p-6 text-center pointer-events-none transition-all duration-1000 ease-out ${isVisible ? (isKilled ? 'animate-boss-killed' : 'animate-boss-appear') : 'opacity-0 -translate-y-6 blur-lg scale-95'}`}>
            {/* SMOKY CINEMATIC BACKGROUND */}
            <div
                className="absolute inset-0 pointer-events-none"
                style={{
                    background: 'radial-gradient(50% 50% at 50% 50%, rgba(0, 0, 0, 0.95) 0%, rgba(0, 0, 0, 0.65) 60%, transparent 100%)',
                    filter: 'blur(16px)',
                    transform: 'scaleX(1.6) scaleY(1.2)'
                }}
            />

            <div className="relative flex flex-col items-center z-10 w-full">
                <h2 className={`font-mono ${isMobileDevice ? 'text-sm mb-2' : 'text-3xl font-black mb-3'} text-white tracking-widest uppercase drop-shadow-lg`}>
                    {t(bossName)}
                </h2>
                <div className={`w-full bg-black/40 border border-white/10 rounded-sm shadow-md ${isMobileDevice ? 'max-w-[250px] h-2.5' : 'max-w-[500px] h-4'} overflow-hidden relative`}>
                    {/* Boss HP Damage highlight trail bar */}
                    <div
                        ref={bossHpTrailBarRef}
                        className="absolute inset-y-0 left-0 w-full origin-left bg-orange-400/40"
                        style={{ transform: 'scaleX(1)', transition: 'transform 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.2s' }}
                    />
                    {/* Main HP Bar */}
                    <div
                        ref={bossHpBarRef}
                        className="main-hp-bar absolute inset-y-0 left-0 w-full origin-left bg-gradient-to-r from-red-700 to-red-500"
                        style={{ transform: 'scaleX(1)', transition: 'transform 0.1s ease-out' }}
                    />
                    {/* Delimiters at 25%, 50%, 75% */}
                    <div className="absolute top-0 bottom-0 w-[1px] bg-white/20 border-l border-black/30 z-20 pointer-events-none" style={{ left: '25%' }} />
                    <div className="absolute top-0 bottom-0 w-[1px] bg-white/20 border-l border-black/30 z-20 pointer-events-none" style={{ left: '50%' }} />
                    <div className="absolute top-0 bottom-0 w-[1px] bg-white/20 border-l border-black/30 z-20 pointer-events-none" style={{ left: '75%' }} />
                </div>
            </div>
        </div>
    );
});

const EnemyWavePanel = React.memo(({ isMobileDevice, wavePanelRef, waveNameRef, waveBarRef, waveTrailBarRef, waveTextRef }: any) => {
    return (
        <div ref={wavePanelRef} className="relative w-full flex flex-col items-center justify-center p-6 text-center transition-all duration-700 ease-out opacity-0 -translate-y-4 blur-md pointer-events-none" style={{ display: 'none' }}>
            {/* SMOKY CINEMATIC BACKGROUND */}
            <div
                className="absolute inset-0 pointer-events-none"
                style={{
                    background: 'radial-gradient(50% 50% at 50% 50%, rgba(0, 0, 0, 0.95) 0%, rgba(0, 0, 0, 0.65) 60%, transparent 100%)',
                    filter: 'blur(16px)',
                    transform: 'scaleX(1.6) scaleY(1.2)'
                }}
            />

            <div className="relative flex flex-col items-center z-10 w-full">
                <h2 ref={waveNameRef} className={`hud-wave-title font-mono ${isMobileDevice ? 'text-sm mb-1.5' : 'text-2xl font-black mb-2'} text-white tracking-widest uppercase`}>
                    WAVE
                </h2>
                <div className={`w-full bg-black/40 border border-white/10 rounded-sm shadow-md ${isMobileDevice ? 'max-w-[220px] h-2.5' : 'max-w-[500px] h-4'} relative overflow-hidden`}>
                    {/* Trail / Highlight Bar */}
                    <div
                        ref={waveTrailBarRef}
                        className="absolute inset-y-0 left-0 w-full origin-left bg-orange-400/50"
                        style={{ transform: 'scaleX(1)', transition: 'transform 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.2s' }}
                    />
                    {/* Main Progress Bar (Zombies Remaining) */}
                    <div
                        ref={waveBarRef}
                        className="absolute inset-y-0 left-0 w-full origin-left bg-gradient-to-r from-orange-600 to-amber-500"
                        style={{ transform: 'scaleX(1)', transition: 'transform 0.1s ease-out' }}
                    />
                </div>
                <span ref={waveTextRef} className={`${isMobileDevice ? 'text-[10px]' : 'text-xs'} mt-2 text-zinc-300 font-mono tracking-[0.15em] drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]`}>
                    0 / 0
                </span>
            </div>
        </div>
    );
});

const ActionBarPanel = React.memo(({ isMobileDevice, isBossIntro, weaponSlots, handleSelectWeaponInternal, ammoTextRef, reloadBarRef, speedTextRef, speedArcRef, gasPedalRef, skidPedalRef, brakePedalRef, handleActionEnter, handleActionLeave }: any) => {
    const isDriving = useHudStore(s => s.isDriving);
    const activeWeapon = useHudStore(s => s.activeWeapon);
    const numThrowableAmmo = useHudStore(s => s.throwableAmmo);
    const familyFound = useHudStore(s => s.familyFound);
    const unlimitedAmmo = useHudStore(s => s.unlimitedAmmo);

    const weapon = DataResolver.getWeapons()[activeWeapon];

    // PERFORMANCE: Cached JSX slots generation to completely bypass array allocations on fast re-renders
    const slots = useMemo(() => {
        if (isDriving || !weaponSlots) return [];

        const result = [];
        const len = weaponSlots.length;
        for (let i = 0; i < len; i++) {
            const { slot, type } = weaponSlots[i];
            const wData = DataResolver.getWeapons()[Number(type)];
            if (!wData) continue;

            const isActive = activeWeapon === type;
            const isThrowable = wData.category === WeaponCategory.THROWABLE;
            const isRadio = type === ToolID.RADIO;
            const size = isMobileDevice ? "w-16 h-16" : "w-20 h-20";
            const cColor = WeaponCategoryColors[wData.category] || COLORS.WHITE;

            const dots = [];
            if (isThrowable) {
                const maxAmmo = wData.magSize || 0;
                for (let j = 0; j < maxAmmo; j++) {
                    dots.push(
                        <div key={j}
                            className="h-1 flex-1 border border-zinc-950"
                            style={{ backgroundColor: j < numThrowableAmmo ? cColor.str : 'transparent' }}
                        />);
                }
            }

            result.push(
                <button key={slot} data-slot={slot}
                    onClick={handleSelectWeaponInternal}
                    onMouseEnter={!isMobileDevice ? handleActionEnter : undefined}
                    onMouseLeave={!isMobileDevice ? handleActionLeave : undefined}
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
                            {dots}
                        </div>
                    )}

                    {isRadio && familyFound && <span className="absolute bottom-1 w-full text-center text-[10px] font-mono font-black uppercase text-blue-300 drop-shadow-md z-10">{t('ui.located')}</span>}
                </button>
            );
        }
        return result;
    }, [isDriving, weaponSlots, activeWeapon, numThrowableAmmo, familyFound, isMobileDevice, handleSelectWeaponInternal, reloadBarRef, handleActionEnter, handleActionLeave]);

    return (
        <div className={`absolute ${isMobileDevice ? 'bottom-2 pb-safe' : 'bottom-4'} left-1/2 -translate-x-1/2 flex flex-col items-center justify-center p-6 min-w-[320px] transition-opacity duration-500 ${isBossIntro ? 'opacity-0' : 'opacity-100'}`}>
            {/* SMOKY CINEMATIC BACKGROUND */}
            <div
                className="absolute inset-0 pointer-events-none"
                style={{
                    background: 'radial-gradient(50% 50% at 50% 50%, rgba(0, 0, 0, 0.95) 0%, rgba(0, 0, 0, 0.65) 60%, transparent 100%)',
                    filter: 'blur(16px)',
                    transform: 'scaleX(1.5) scaleY(1.15)'
                }}
            />

            <div className="relative flex flex-col items-center z-10 w-full">
                {!isDriving && weapon && weapon.category !== WeaponCategory.THROWABLE && activeWeapon !== ToolID.RADIO && (
                    <div className={`${isMobileDevice ? 'mb-2' : 'mb-3'} text-center animate-fadeIn flex items-baseline`}>
                        <span ref={ammoTextRef} className={`${isMobileDevice ? 'text-2xl' : 'text-4xl'} font-bold text-white tracking-tighter font-mono`}>
                            {unlimitedAmmo ? '∞' : '--'}
                        </span>
                        {!weapon.isEnergy && (
                            <span className={`${isMobileDevice ? 'text-[10px]' : 'text-xl'} font-bold text-white/30 ml-1 font-mono`}>/ {weapon.magSize || 0}</span>
                        )}
                    </div>
                )}

                {isDriving ? (
                    <div className="relative w-48 h-48 flex items-center justify-center bg-black/50 rounded-full border border-white/5 shadow-2xl p-2 animate-fadeIn">
                        {/* SVG Speedometer Dial */}
                        <svg className="w-full h-full overflow-visible" viewBox="0 0 200 200">
                            <defs>
                                <linearGradient id="speedGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" stopColor="#3b82f6" />    {/* Blue */}
                                    <stop offset="50%" stopColor="#22c55e" />   {/* Green */}
                                    <stop offset="100%" stopColor="#ef4444" />  {/* Reddish */}
                                </linearGradient>
                            </defs>

                            {/* Outer Circular Track Background */}
                            <path
                                d="M 40,145 A 75,75 0 1,1 160,145"
                                fill="none"
                                stroke="rgba(255,255,255,0.06)"
                                strokeWidth="8"
                                strokeLinecap="round"
                            />

                            {/* Active Speed Arc */}
                            <path
                                ref={speedArcRef}
                                d="M 40,145 A 75,75 0 1,1 160,145"
                                fill="none"
                                stroke="url(#speedGrad)"
                                strokeWidth="8"
                                strokeLinecap="round"
                                strokeDasharray="340"
                                strokeDashoffset="340"
                            />

                            {/* Inner thin dial border */}
                            <circle cx="100" cy="100" r="58" fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="1.5" />
                            <circle cx="100" cy="100" r="98" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1.5" />
                        </svg>

                        {/* Center Panel (Absolute overlay) */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center pt-2">
                            {/* Speed Number */}
                            <span ref={speedTextRef} className="text-4xl font-black font-mono text-white tracking-tighter leading-none block drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">
                                0
                            </span>
                            <span className="text-[10px] font-bold tracking-widest text-white/40 uppercase block mt-1">
                                {t('ui.speed_unit')}
                            </span>

                            {/* Integrated Gas / Skid / Brake Dot Indicators */}
                            <div className="flex items-center gap-1 mt-3 z-10">
                                {/* GAS Dot (Blue) */}
                                <div
                                    ref={gasPedalRef}
                                    className="w-2.5 h-2.5 rounded-full border border-white/10 bg-zinc-950/60 shadow-sm"
                                    title={t('ui.gas')}
                                />
                                {/* SKID Dot (Orange) */}
                                <div
                                    ref={skidPedalRef}
                                    className="w-2.5 h-2.5 rounded-full border border-white/10 bg-zinc-950/60 shadow-sm"
                                    title={t('ui.skid')}
                                />
                                {/* BRAKE Dot (Red) */}
                                <div
                                    ref={brakePedalRef}
                                    className="w-2.5 h-2.5 rounded-full border border-white/10 bg-zinc-950/60 shadow-sm"
                                    title={t('ui.brake')}
                                />
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className={`flex ${isMobileDevice ? 'gap-1.5' : 'gap-3'} pointer-events-auto`}>
                        {slots}
                    </div>
                )}
            </div>
        </div>
    );
});

// ============================================================================
// MAIN HUD LAYOUT
// ============================================================================

const GameHUD: React.FC<GameHUDProps> = React.memo(({
    loadout, isBossIntro = false, isMobileDevice = false,
    onTogglePause, onToggleMap, onSelectWeapon, onOpenAdventureLog,
    isSectorBannerActive = false, onSectorBannerComplete
}) => {
    const isDead = useHudStore(s => s.isDead);
    const isDisoriented = useHudStore(s => s.isDisoriented);
    const activeWeapon = useHudStore(s => s.activeWeapon);
    const { isLandscapeMode } = useOrientation();

    const [tooltipContent, setTooltipContent] = useState<string | null>(null);
    const tooltipTimeout = useRef<any>(null);

    // --- HIGH-FREQUENCY REFS ---
    const hpBarRef = useRef<HTMLDivElement>(null);
    const hpTextRef = useRef<HTMLSpanElement>(null);
    const staminaBarRef = useRef<HTMLDivElement>(null);
    const staminaTextRef = useRef<HTMLSpanElement>(null);
    const xpBarRef = useRef<HTMLDivElement>(null);
    const ammoTextRef = useRef<HTMLSpanElement>(null);
    const reloadBarRef = useRef<HTMLDivElement>(null);
    const floatingReloadBarRef = useRef<HTMLDivElement>(null);
    const floatingReloadBarContainerRef = useRef<HTMLDivElement>(null);
    const hudContainerRef = useRef<HTMLDivElement>(null);
    const speedTextRef = useRef<HTMLSpanElement>(null);
    const speedArcRef = useRef<SVGPathElement>(null);
    const gasPedalRef = useRef<HTMLDivElement>(null);
    const skidPedalRef = useRef<HTMLDivElement>(null);
    const brakePedalRef = useRef<HTMLDivElement>(null);
    const bossHpBarRef = useRef<HTMLDivElement>(null);
    const bossHpTrailBarRef = useRef<HTMLDivElement>(null);
    const wavePanelRef = useRef<HTMLDivElement>(null);
    const waveNameRef = useRef<HTMLHeadingElement>(null);
    const waveBarRef = useRef<HTMLDivElement>(null);
    const waveTrailBarRef = useRef<HTMLDivElement>(null);
    const waveTextRef = useRef<HTMLSpanElement>(null);
    const waveIndicatorRef = useRef<HTMLDivElement>(null);
    const killsTextRef = useRef<HTMLSpanElement>(null);
    const scrapTextRef = useRef<HTMLSpanElement>(null);
    const spTextRef = useRef<HTMLSpanElement>(null);
    const scrapBoxRef = useRef<HTMLDivElement>(null);
    const spBoxRef = useRef<HTMLDivElement>(null);
    const interactionRef = useRef<HTMLDivElement>(null);
    const interactionComponentRef = useRef<any>(null);

    // ZERO-GC Pooled Status Refs
    const passiveRefs = useRef<any[]>([]);
    const effectRefs = useRef<{ buffs: any[], debuffs: any[] }>({ buffs: [], debuffs: [] });

    // ZERO-GC: Internal check cache to guard from structural prompt styles layout thrashing
    const isInteractionPromptActive = useRef<boolean | null>(null);

    const prevTelemetry = useRef({
        hp: -999,
        maxHp: -999,
        stamina: -999,
        maxStamina: -999,
        xp: -999,
        maxXp: -999,
        ammo: '',
        kills: -999,
        scrap: -999,
        sp: -999,
        hasCriticalHp: false,
        reloadProgress: -999,
        bossHpP: -999,
        waveActive: false,
        waveName: '',
        waveProgress: -999,
        waveKills: -999,
        waveTarget: -999,
        waveIndicatorActive: false,
        waveIndicatorAngle: 0,
        isDriving: false,
        vehicleSpeed: -999,
        throttleState: -999,
        isSkidding: false
    });

    // --- ASYNCHRONOUS UI EVENT BRIDGE (VINTERDÖD HARDENING) ---
    useUIEventBridge(useCallback((type, p1, p2) => {
        switch (type) {
            case UIEventType.HUD_VISIBILITY:
                HudStore.setHudVisible(p1 === 1);
                break;

            case UIEventType.RELOAD_WEAPON:
                break;

            case UIEventType.AMMO_LOW:
                if (ammoTextRef.current) {
                    ammoTextRef.current.classList.remove('hud-ammo-low-pulse');
                    void ammoTextRef.current.offsetWidth;
                    ammoTextRef.current.classList.add('hud-ammo-low-pulse');
                }
                break;

            case UIEventType.LEVEL_UP:
                if (xpBarRef.current) {
                    xpBarRef.current.classList.remove('hud-level-up-shimmer');
                    void xpBarRef.current.offsetWidth;
                    xpBarRef.current.classList.add('hud-level-up-shimmer');
                }
                break;
        }
    }, []));

    // --- FAST HUD UPDATE LISTENER ---
    useEffect(() => {
        const handleFastUpdate = (data: any) => {
            const cache = prevTelemetry.current as any;

            // 1. HP Updates
            if (data.hp !== cache.hp || data.maxHp !== cache.maxHp) {
                if (hpBarRef.current) {
                    const hpRatio = data.maxHp > 0 ? (data.hp / data.maxHp) : 0;
                    hpBarRef.current.style.transform = `scaleX(${hpRatio})`;
                }
                if (hpTextRef.current) {
                    const text = `${Math.ceil(data.hp)} / ${data.maxHp}`;
                    hpTextRef.current.innerText = text;
                }
                cache.hp = data.hp;
                cache.maxHp = data.maxHp;
            }

            if (data.hasCriticalHp !== cache.hasCriticalHp) {
                if (hpBarRef.current) {
                    if (data.hasCriticalHp) {
                        hpBarRef.current.classList.add('hud-critical-pulse');
                    } else {
                        hpBarRef.current.classList.remove('hud-critical-pulse');
                    }
                }
                cache.hasCriticalHp = data.hasCriticalHp;
            }

            // 2. Stamina Updates
            if (data.stamina !== cache.stamina || data.maxStamina !== cache.maxStamina) {
                if (staminaBarRef.current) {
                    const stRatio = data.maxStamina > 0 ? (data.stamina / data.maxStamina) : 0;
                    staminaBarRef.current.style.transform = `scaleX(${stRatio})`;
                }
                if (staminaTextRef.current) {
                    const text = data.stamina < 30 ? t('ui.low') : t('ui.stamina');
                    if (staminaTextRef.current.innerText !== text) {
                        staminaTextRef.current.innerText = text;
                    }
                }
                cache.stamina = data.stamina;
                cache.maxStamina = data.maxStamina;
            }

            // 3. XP Updates
            if (data.currentXp !== cache.xp || data.nextLevelXp !== cache.maxXp) {
                if (xpBarRef.current) {
                    const xpRatio = data.nextLevelXp > 0 ? (data.currentXp / data.nextLevelXp) : 0;
                    xpBarRef.current.style.transform = `scaleX(${xpRatio})`;
                }
                cache.xp = data.currentXp;
                cache.maxXp = data.nextLevelXp;
            }

            // 4. Ammo Updates
            if (ammoTextRef.current) {
                const state = HudStore.getState();
                const activeId = state.activeWeapon;
                const wep = DataResolver.getWeapons()[activeId];
                const val = wep?.isEnergy
                    ? Math.floor(data.ammo) + '%'
                    : data.ammo.toString();

                if (cache.ammo !== val) {
                    ammoTextRef.current.innerText = val;
                    cache.ammo = val;
                }
            }

            // 5. Reload Updates
            if (data.reloadProgress !== cache.reloadProgress) {
                if (floatingReloadBarContainerRef.current) {
                    const isReloading = data.reloadProgress > 0 && data.reloadProgress < 1;
                    floatingReloadBarContainerRef.current.style.opacity = isReloading ? '1' : '0';
                }
                if (reloadBarRef.current) {
                    reloadBarRef.current.style.transform = `scaleY(${data.reloadProgress})`;
                }
                if (floatingReloadBarRef.current) {
                    floatingReloadBarRef.current.style.transform = `scaleX(${data.reloadProgress})`;
                }
                cache.reloadProgress = data.reloadProgress;
            }

            // 6. Boss HP Update
            if (data.bossHpP !== undefined && data.bossHpP !== cache.bossHpP) {
                if (bossHpBarRef.current && data.bossHpP >= 0) {
                    bossHpBarRef.current.style.transform = `scaleX(${Math.max(0, Math.min(1, data.bossHpP))})`;
                }
                if (bossHpTrailBarRef.current && data.bossHpP >= 0) {
                    bossHpTrailBarRef.current.style.transform = `scaleX(${Math.max(0, Math.min(1, data.bossHpP))})`;
                }
                cache.bossHpP = data.bossHpP;
            }

            // Wave HP/Kills Update
            if (data.waveActive) {
                if (wavePanelRef.current) {
                    if (wavePanelRef.current.style.display !== 'flex') {
                        wavePanelRef.current.style.display = 'flex';
                        void wavePanelRef.current.offsetHeight; // trigger reflow
                        wavePanelRef.current.classList.remove('opacity-0', '-translate-y-4', 'blur-md', 'animate-wave-disappear');
                        wavePanelRef.current.classList.add('animate-wave-appear');
                    }
                }
                const isCleared = data.waveProgress >= 1.0;
                if (waveNameRef.current && (data.waveName !== cache.waveName || isCleared !== cache.waveCleared)) {
                    if (isCleared) {
                        waveNameRef.current.innerText = t('ui.wave_cleared') || 'WAVE CLEARED';
                        waveNameRef.current.classList.add('hud-wave-cleared-text');
                    } else {
                        waveNameRef.current.innerText = t(data.waveName);
                        waveNameRef.current.classList.remove('hud-wave-cleared-text');
                    }
                    cache.waveName = data.waveName;
                    cache.waveCleared = isCleared;
                }

                // Draining meter: starts full (1.0) and drains to empty (0)
                const remaining = Math.max(0, Math.min(1, 1.0 - data.waveProgress));
                if (waveBarRef.current) {
                    waveBarRef.current.style.transform = `scaleX(${remaining})`;
                    if (isCleared) {
                        waveBarRef.current.classList.add('hud-wave-cleared-bar');
                    } else {
                        waveBarRef.current.classList.remove('hud-wave-cleared-bar');
                    }
                }
                if (waveTrailBarRef.current) {
                    waveTrailBarRef.current.style.transform = `scaleX(${remaining})`;
                }
                if (waveTextRef.current) {
                    waveTextRef.current.innerText = `${data.waveKills} / ${data.waveTarget}`;
                    if (isCleared) {
                        waveTextRef.current.classList.add('hud-wave-cleared-text');
                    } else {
                        waveTextRef.current.classList.remove('hud-wave-cleared-text');
                    }
                }
            } else {
                if (wavePanelRef.current && wavePanelRef.current.style.display !== 'none') {
                    wavePanelRef.current.classList.remove('animate-wave-appear');
                    wavePanelRef.current.classList.add('animate-wave-disappear');
                    const ref = wavePanelRef.current;
                    setTimeout(() => {
                        const curTelemetry = prevTelemetry.current as any;
                        if (!curTelemetry.waveActive && ref) {
                            ref.style.display = 'none';
                            ref.classList.remove('animate-wave-disappear');
                        }
                    }, 800);
                }
                if (waveNameRef.current) {
                    waveNameRef.current.classList.remove('hud-wave-cleared-text');
                }
                if (waveBarRef.current) {
                    waveBarRef.current.classList.remove('hud-wave-cleared-bar');
                }
                if (waveTextRef.current) {
                    waveTextRef.current.classList.remove('hud-wave-cleared-text');
                }
                cache.waveCleared = false;
            }

            // Wave Off-Screen Indicator
            if (data.waveIndicatorActive !== cache.waveIndicatorActive || (data.waveIndicatorActive && data.waveIndicatorAngle !== cache.waveIndicatorAngle)) {
                if (waveIndicatorRef.current) {
                    if (data.waveIndicatorActive) {
                        waveIndicatorRef.current.style.opacity = '1';

                        // Distance from center
                        const r = Math.min(window.innerWidth, window.innerHeight) * 0.45;
                        const cx = window.innerWidth / 2;
                        const cy = window.innerHeight / 2;

                        const x = cx + Math.cos(data.waveIndicatorAngle) * r;
                        const y = cy + Math.sin(data.waveIndicatorAngle) * r;
                        const rot = data.waveIndicatorAngle * (180 / Math.PI);

                        waveIndicatorRef.current.style.transform = `translate(${x}px, ${y}px) rotate(${rot}deg)`;
                    } else {
                        waveIndicatorRef.current.style.opacity = '0';
                    }
                }
                cache.waveIndicatorActive = data.waveIndicatorActive;
                cache.waveIndicatorAngle = data.waveIndicatorAngle;
            }

            // 7. Vehicle Speed & Throttle (Bypassed if not driving!)
            if (data.isDriving) {
                if (data.vehicleSpeed !== cache.vehicleSpeed) {
                    if (speedTextRef.current) {
                        const speed = Math.round(data.vehicleSpeed).toString();
                        speedTextRef.current.innerText = speed;
                    }

                    // Speedometer Arc and Dot animations
                    const maxSpeed = 160;
                    const speedRatio = Math.max(0, Math.min(1, data.vehicleSpeed / maxSpeed));

                    if (speedArcRef.current) {
                        const offset = 340 - (speedRatio * 340);
                        speedArcRef.current.style.strokeDashoffset = offset.toString();
                    }
                    cache.vehicleSpeed = data.vehicleSpeed;
                }

                if (data.throttleState !== cache.throttleState) {
                    if (gasPedalRef.current) {
                        const isGas = data.throttleState > 0;
                        gasPedalRef.current.style.borderColor = isGas ? '#3b82f6' : 'rgba(255,255,255,0.1)';
                        gasPedalRef.current.style.backgroundColor = isGas ? '#3b82f6' : 'rgba(0, 0, 0, 0.6)';
                        gasPedalRef.current.style.boxShadow = isGas ? '0 0 8px rgba(59, 130, 246, 0.8)' : 'none';
                    }
                    if (brakePedalRef.current) {
                        const isBrake = data.throttleState < 0;
                        brakePedalRef.current.style.borderColor = isBrake ? '#ef4444' : 'rgba(255,255,255,0.1)';
                        brakePedalRef.current.style.backgroundColor = isBrake ? '#ef4444' : 'rgba(0, 0, 0, 0.6)';
                        brakePedalRef.current.style.boxShadow = isBrake ? '0 0 8px rgba(239, 68, 68, 0.8)' : 'none';
                    }
                    cache.throttleState = data.throttleState;
                }

                if (data.isSkidding !== cache.isSkidding) {
                    if (skidPedalRef.current) {
                        const isSkid = !!data.isSkidding;
                        skidPedalRef.current.style.borderColor = isSkid ? '#f97316' : 'rgba(255,255,255,0.1)';
                        skidPedalRef.current.style.backgroundColor = isSkid ? '#f97316' : 'rgba(0, 0, 0, 0.6)';
                        skidPedalRef.current.style.boxShadow = isSkid ? '0 0 8px rgba(249, 115, 22, 0.8)' : 'none';
                    }
                    cache.isSkidding = data.isSkidding;
                }
            }

            // --- 8. TELEMETRY (Kills, Scrap, SP) ---
            if (data.kills !== undefined && data.kills !== cache.kills) {
                if (killsTextRef.current) {
                    killsTextRef.current.innerText = data.kills.toString();
                }
                cache.kills = data.kills;
            }

            if (data.scrap !== undefined && data.scrap !== cache.scrap) {
                if (scrapTextRef.current) {
                    scrapTextRef.current.innerText = data.scrap.toString();
                }
                if (data.scrap > cache.scrap && cache.scrap !== -999) {
                    if (scrapBoxRef.current) {
                        scrapBoxRef.current.classList.remove('hud-bling-pulse');
                        void scrapBoxRef.current.offsetWidth;
                        scrapBoxRef.current.classList.add('hud-bling-pulse');
                        UISounds.playPickUp();
                    }
                }
                cache.scrap = data.scrap;
            }

            if (data.spEarned !== undefined && data.spEarned !== cache.sp) {
                if (spTextRef.current) {
                    spTextRef.current.innerText = data.spEarned.toString();
                }
                if (data.spEarned > cache.sp && cache.sp !== -999) {
                    if (spBoxRef.current) {
                        spBoxRef.current.classList.remove('hud-bling-pulse-purple');
                        void spBoxRef.current.offsetWidth;
                        spBoxRef.current.classList.add('hud-bling-pulse-purple');
                        UISounds.playPickUp();
                    }
                }
                cache.sp = data.spEarned;
            }

            // --- 9. INTERACTION PROMPT ---
            if (interactionRef.current) {
                const scaleStr = isMobileDevice ? 'scale(1.5)' : 'scale(1)';
                if (data.interactionActive) {
                    // ZERO-GC Latch checking protects context switches layouts from slamming
                    if (isInteractionPromptActive.current !== true) {
                        interactionRef.current.style.opacity = '1';
                        interactionRef.current.style.transform = `translate(-50%, 0px) ${scaleStr}`;
                        interactionRef.current.style.pointerEvents = 'auto';
                        isInteractionPromptActive.current = true;
                    }
                    if (interactionComponentRef.current) {
                        interactionComponentRef.current.update(data.interactionType, data.interactionLabel, data.interactionId);
                    }
                } else {
                    if (isInteractionPromptActive.current !== false) {
                        interactionRef.current.style.opacity = '0';
                        interactionRef.current.style.transform = `translate(-50%, 10px) ${scaleStr}`;
                        interactionRef.current.style.pointerEvents = 'none';
                        isInteractionPromptActive.current = false;
                    }
                }
            }

            // --- 10. STATUS EFFECT POOL UPDATE (ZERO-GC) ---
            const hudState = HudStore.getState();

            // Passives
            const pPassives = hudState.activePassives;
            const pCount = hudState.activePassivesCount;
            for (let i = 0; i < POOL_SIZE_PASSIVE; i++) {
                const el = passiveRefs.current[i];
                if (el) el.update(i < pCount ? pPassives[i] : null);
            }

            // Buffs/Debuffs (Defensive case fallback checking integrated)
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
                const pulseC = isDebuff ? 'hud-debuff-pulse' : 'hud-buff-pulse';

                if (isDebuff) {
                    if (debuffIdx < POOL_SIZE_DEBUFF) {
                        const el = effectRefs.current.debuffs[debuffIdx];
                        if (el) el.update(type, progress, PerkColor.DEBUFF, pulseC);
                        debuffIdx++;
                    }
                } else {
                    if (buffIdx < POOL_SIZE_BUFF) {
                        const el = effectRefs.current.buffs[buffIdx];
                        if (el) el.update(type, progress, PerkColor.BUFF, pulseC);
                        buffIdx++;
                    }
                }
            }

            // Hide remaining pool slots
            for (let i = buffIdx; i < POOL_SIZE_BUFF; i++) {
                const el = effectRefs.current.buffs[i];
                if (el) el.update(null, 0, '', '');
            }
            for (let i = debuffIdx; i < POOL_SIZE_DEBUFF; i++) {
                const el = effectRefs.current.debuffs[i];
                if (el) el.update(null, 0, '', '');
            }
        };

        return HudStore.subscribeFastUpdate(handleFastUpdate);
    }, []);

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
        { slot: '5', type: ToolID.RADIO }
    ], [loadout.primary, loadout.secondary, loadout.throwable, loadout.special]);

    const handleSelectWeaponInternal = useCallback((e: React.MouseEvent<HTMLElement> | React.TouchEvent<HTMLElement>) => {
        e.stopPropagation();
        const slot = e.currentTarget.dataset.slot;
        if (slot && onSelectWeapon) {
            onSelectWeapon(slot);
            UISounds.playClick();
        }
    }, [onSelectWeapon]);

    const handlePauseInternal = useCallback((e: React.TouchEvent<HTMLElement>) => {
        e.stopPropagation();
        onTogglePause?.();
    }, [onTogglePause]);

    const catColor = COLORS.WHITE.str;
    const hudVisible = useHudStore(s => s.hudVisible);
    const showRestOfHUD = hudVisible && !isSectorBannerActive;

    // ZERO-GC: Pre-allocated arrays to assign pooled ref storage stably in render
    const passivePoolRefs = useMemo(() => getCachedArray(POOL_SIZE_PASSIVE).map(i => (el: any) => { if (el) passiveRefs.current[i] = el; }), []);
    const buffPoolRefs = useMemo(() => getCachedArray(POOL_SIZE_BUFF).map(i => (el: any) => { if (el) effectRefs.current.buffs[i] = el; }), []);
    const debuffPoolRefs = useMemo(() => getCachedArray(POOL_SIZE_DEBUFF).map(i => (el: any) => { if (el) effectRefs.current.debuffs[i] = el; }), []);

    return (
        <div ref={hudContainerRef} className="absolute inset-0 pointer-events-none">
            <ScreenEffect />

            <LevelUpBanner />

            <DiscoveryPopup onOpenAdventureLog={(tab, itemId) => {
                window.dispatchEvent(new CustomEvent('open-adventure-log', { detail: { tab, itemId } }));
            }} />

            <ChatBubble />

            <ChallengePopup onOpenAdventureLog={onOpenAdventureLog} />

            <SectorBanner active={isSectorBannerActive} onComplete={onSectorBannerComplete || (() => { })} />

            <div className={`${HUD_WRAPPER} ${!showRestOfHUD || isDead || isDisoriented || isBossIntro ? 'opacity-0 -translate-y-4 blur-[5px]' : 'opacity-100 translate-y-0 blur-0 animate-hudFadeIn'}`}>

                {/* --- GRADIENTS OVERLAY (TOP & BOTTOM) --- */}
                <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-black/80 to-transparent pointer-events-none z-0" />
                <div className={`absolute bottom-0 left-0 right-0 ${isMobileDevice ? 'h-32' : 'h-48'} bg-gradient-to-t from-black/90 to-transparent pointer-events-none z-0`} />
                {/* ----------------------------------------------- */}

                <div className={`absolute ${isMobileDevice ? 'top-4 left-4 right-4' : 'top-8 left-8 right-12'} flex justify-between items-start`}>

                    <div className={`flex flex-col gap-1.5 ${isMobileDevice ? 'w-40' : 'w-80'}`}>
                        <VitalsPanel
                            isMobileDevice={isMobileDevice}
                            isBossIntro={isBossIntro}
                            hpBarRef={hpBarRef}
                            hpTextRef={hpTextRef}
                            stBarRef={staminaBarRef}
                            stTextRef={staminaTextRef}
                            xpBarRef={xpBarRef}
                        />

                        {/* UNIFIED STATUS EFFECT POOL (Passives | Buffs | Debuffs) */}
                        <div className="flex flex-row items-center gap-2 mt-2 ml-1 pointer-events-auto overflow-visible whitespace-nowrap">
                            {/* 1. Passives (Circles) */}
                            {getCachedArray(POOL_SIZE_PASSIVE).map(i => (
                                <PassiveIconPooled
                                    key={`pass-pool-${i}`}
                                    ref={passivePoolRefs[i]}
                                    index={i}
                                    isMobileDevice={isMobileDevice}
                                    isLandscapeMode={isMobileDevice && isLandscapeMode}
                                    handleActionEnter={handleActionEnter}
                                    handleActionLeave={handleActionLeave}
                                />
                            ))}

                            {/* 2. Buffs (Squares) */}
                            {getCachedArray(POOL_SIZE_BUFF).map(i => (
                                <StatusEffectIconPooled
                                    key={`buff-pool-${i}`}
                                    ref={buffPoolRefs[i]}
                                    index={i}
                                    isMobileDevice={isMobileDevice}
                                    isLandscapeMode={isMobileDevice && isLandscapeMode}
                                    handleActionEnter={handleActionEnter}
                                    handleActionLeave={handleActionLeave}
                                />
                            ))}

                            {/* 3. Debuffs (Squares) */}
                            {getCachedArray(POOL_SIZE_DEBUFF).map(i => (
                                <StatusEffectIconPooled
                                    key={`debuff-pool-${i}`}
                                    ref={debuffPoolRefs[i]}
                                    index={i}
                                    isMobileDevice={isMobileDevice}
                                    isLandscapeMode={isMobileDevice && isLandscapeMode}
                                    handleActionEnter={handleActionEnter}
                                    handleActionLeave={handleActionLeave}
                                />
                            ))}
                        </div>
                    </div>

                    <div className="flex flex-col items-end gap-3 pointer-events-auto">
                        <KillsPanel isMobileDevice={isMobileDevice} isLandscapeMode={isLandscapeMode} isBossIntro={isBossIntro} handlePauseInternal={handlePauseInternal} killsTextRef={killsTextRef} />
                        <CurrencyPanel isMobileDevice={isMobileDevice} isLandscapeMode={isLandscapeMode} isBossIntro={isBossIntro} scrapTextRef={scrapTextRef} spTextRef={spTextRef} scrapBoxRef={scrapBoxRef} spBoxRef={spBoxRef} />
                    </div>
                </div>

                <div className={`absolute ${isMobileDevice ? 'top-20 px-12' : 'top-32'} left-1/2 -translate-x-1/2 flex flex-col items-center w-full max-w-[600px] gap-4`}>

                    <BossPanel
                        isMobileDevice={isMobileDevice}
                        bossHpBarRef={bossHpBarRef}
                        bossHpTrailBarRef={bossHpTrailBarRef}
                    />

                    <EnemyWavePanel
                        isMobileDevice={isMobileDevice}
                        wavePanelRef={wavePanelRef}
                        waveNameRef={waveNameRef}
                        waveBarRef={waveBarRef}
                        waveTrailBarRef={waveTrailBarRef}
                        waveTextRef={waveTextRef}
                    />
                </div>

                {/* UI RELOAD BAR OVER PLAYER HEAD */}
                <FloatingReloadBar reloadBarRef={floatingReloadBarRef} catColor={catColor} containerRef={floatingReloadBarContainerRef} />

                {/* VINTERDÖD: Offscreen Wave Enemy Indicator */}
                <div
                    ref={waveIndicatorRef}
                    className="fixed top-0 left-0 w-8 h-8 pointer-events-none will-change-transform z-[150]"
                    style={{ opacity: 0, transition: 'opacity 0.2s ease-out' }}
                >
                    {/* Blue Arrow head pointing right (default 0 deg) */}
                    <div className="w-0 h-0 border-y-8 border-y-transparent border-l-[16px] border-l-blue-500 drop-shadow-[0_0_12px_rgba(59,130,246,1.0)] -translate-x-1/2 -translate-y-1/2" />
                </div>

                {/* FLOATING TEXT NOTIFICATIONS (XP, SP, SCRAP, CP, BUFFS, DEBUFFS) */}
                <CombatLog />

                <ActionBarPanel
                    isMobileDevice={isMobileDevice}
                    isBossIntro={isBossIntro}
                    weaponSlots={weaponSlots}
                    handleSelectWeaponInternal={handleSelectWeaponInternal}
                    ammoTextRef={ammoTextRef}
                    reloadBarRef={reloadBarRef}
                    speedTextRef={speedTextRef}
                    speedArcRef={speedArcRef}
                    gasPedalRef={gasPedalRef}
                    skidPedalRef={skidPedalRef}
                    brakePedalRef={brakePedalRef}
                    handleActionEnter={handleActionEnter}
                    handleActionLeave={handleActionLeave}
                />

                {tooltipContent && (
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[1000] px-8 py-4 bg-zinc-950/90 border-2 border-white/20 backdrop-blur-3xl rounded-full shadow-[0_0_50px_rgba(0,0,0,0.8)] animate-in fade-in zoom-in duration-300">
                        <span className={`${isMobileDevice ? 'text-sm' : 'text-lg'} text-white font-bold uppercase tracking-widest whitespace-nowrap`}>
                            {tooltipContent}
                        </span>
                    </div>
                )}

                <style>{`
                    @keyframes hudFadeIn {
                        0% { opacity: 0; transform: translateY(-20px); filter: blur(10px); }
                        100% { opacity: 1; transform: translateY(0); filter: blur(0); }
                    }
                    @keyframes bar-shine {
                        0% { transform: translateX(-100%); }
                        100% { transform: translateX(100%); }
                    }
                    @keyframes level-up-shimmer {
                        0% { filter: brightness(1); box-shadow: 0 0 0px var(--hud-cyan); }
                        30% { filter: brightness(2.5); box-shadow: 0 0 20px var(--hud-cyan); }
                        100% { filter: brightness(1); box-shadow: 0 0 0px var(--hud-cyan); }
                    }
                    .hud-level-up-shimmer { animation: level-up-shimmer 1.5s ease-out; }
                    @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                    @keyframes buffPulse { 0%, 100% { box-shadow: 0 0 5px rgba(34,197,94,0.4); border-color: rgba(34,197,94,0.8); } 50% { box-shadow: 0 0 15px rgba(34,197,94,0.8); border-color: #22c55e; } }
                    @keyframes debuffPulse { 0%, 100% { box-shadow: 0 0 5px rgba(255,51,51,0.4); border-color: rgba(255,51,51,0.8); } 50% { box-shadow: 0 0 15px rgba(255,51,51,0.8); border-color: #ff3333; } }
                    
                    .hud-buff-pulse { animation: buffPulse 2s infinite ease-in-out; }
                    .hud-debuff-pulse { animation: debuffPulse 2s infinite ease-in-out; }
                    
                    .hud-noise-overlay {
                        background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
                        background-repeat: repeat;
                        background-size: 100px 100px;
                        pointer-events: none;
                    }

                    .hud-gritty-base {
                        background-color: rgba(15, 15, 15, 0.9);
                        box-shadow: inset 0 0 15px rgba(0, 0, 0, 0.9);
                        border: 1px solid rgba(255, 255, 255, 0.08);
                    }

                    .hud-gritty-texture { position: relative; }
                    .hud-gritty-texture::after {
                        content: '';
                        position: absolute;
                        inset: 0;
                        opacity: 0.1;
                        background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
                        background-repeat: repeat;
                        background-size: 100px 100px;
                        pointer-events: none;
                        z-index: 1;
                    }

                    .hud-gritty-bar-container {
                        background-color: rgba(10, 10, 10, 0.95);
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        box-shadow: 0 0 15px rgba(0,0,0,0.8), inset 0 0 5px rgba(0,0,0,0.9);
                    }

                    .hud-gritty-blended-fill {
                        filter: brightness(1.2) saturate(1.2);
                        box-shadow: inset 0 0 10px rgba(0,0,0,0.6); 
                    }

                    .hud-text-glow { text-shadow: 0 0 15px rgba(255,255,255,0.3); }
                    .hud-bar-glow { box-shadow: 0 0 10px rgba(255,255,255,0.2); }

                    @keyframes bling {
                        0% { transform: scale(1); filter: brightness(1); }
                        20% { transform: scale(1.2); filter: brightness(2) contrast(1.2); }
                        100% { transform: scale(1); filter: brightness(1); }
                    }
                    @keyframes bling-yellow {
                        0% { transform: scale(1); filter: brightness(1); box-shadow: 0 0 0px rgba(234,179,8,0); }
                        20% { transform: scale(1.1); filter: brightness(2); box-shadow: 0 0 30px rgba(234,179,8,0.8); }
                        100% { transform: scale(1); filter: brightness(1); box-shadow: 0 0 15px rgba(234,179,8,0.3); }
                    }
                    @keyframes bling-purple {
                        0% { transform: scale(1); filter: brightness(1); box-shadow: 0 0 0px rgba(168,85,247,0); }
                        20% { transform: scale(1.1); filter: brightness(2); box-shadow: 0 0 30px rgba(168,85,247,0.8); }
                        100% { transform: scale(1); filter: brightness(1); box-shadow: 0 0 15px rgba(168,85,247,0.3); }
                    }
                    @keyframes hud-critical-pulse {
                        0%, 100% { filter: brightness(1) saturate(1); box-shadow: 0 0 10px rgba(255,51,51,0.4); }
                        50% { filter: brightness(1.5) saturate(2); box-shadow: 0 0 30px rgba(255,51,51,0.8); }
                    }
                    .hud-critical-pulse { animation: hud-critical-pulse 0.5s infinite ease-in-out; }

                    .animate-bling { animation: bling 0.6s ease-out; }
                    .animate-bling-yellow { animation: bling-yellow 0.6s ease-out; }
                `}</style>
            </div>

            {/* Interaction Prompt (Highest Priority - Centered and scaled for mobile) */}
            <div
                ref={interactionRef}
                className={`absolute ${isMobileDevice ? 'bottom-[35%]' : 'bottom-64'} left-1/2 pointer-events-none z-[200] transition-all duration-[150ms] ease-out opacity-0`}
                style={{ transform: `translate(-50%, 10px) ${isMobileDevice ? 'scale(1.5)' : 'scale(1)'}` }}
            >
                <InteractionPrompt
                    ref={interactionComponentRef}
                    isMobileDevice={isMobileDevice}
                    onInteract={(active) => HudStore.triggerInteraction(active)}
                />
            </div>
            <style>{`
                .hud-passive-slot {
                    border-color: #2dd4bf;
                    box-shadow: 0 0 8px rgba(45, 212, 212, 0.4);
                }
                .hud-active-slot {
                    box-shadow: 0 0 20px -5px var(--slot-color), inset 0 0 15px rgba(0,0,0,0.9);
                }
            `}</style>
        </div>
    );
});

export default GameHUD;