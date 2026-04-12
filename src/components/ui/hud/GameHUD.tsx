import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { WeaponType, WeaponCategoryColors, WeaponCategory } from '../../../content/weapons';
import { t } from '../../../utils/i18n';
import { useHudStore } from '../../../hooks/useHudStore';
import { useOrientation } from '../../../hooks/useOrientation';
import { HudStore } from '../../../store/HudStore';
import { StatusEffectType, PerkColor } from '../../../content/perks';
import { DataResolver } from '../../../utils/ui/DataResolver';
import { UiSounds } from '../../../utils/audio/AudioLib';
import DamageVignette from './DamageVignette';
import DiscoveryPopup from './DiscoveryPopup';
import InteractionPrompt from './InteractionPrompt';
import { InteractionType } from '../../../systems/InteractionTypes';

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

// --- PERFORMANCE: Static CSS ---
const HUD_WRAPPER = "absolute inset-0 pointer-events-none transition-all duration-500 ease-in z-[60]";
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

const getStatusIcon = (type: StatusEffectType | string) => {
    // If it's a number (numeric SMI enum), direct index
    if (typeof type === 'number') return DataResolver.getPerks()[type]?.icon || '❓';
    // If it's a string (legacy or pet name), lookup by keys
    const n = type.toUpperCase();
    const perks = DataResolver.getPerks() as any;
    if (perks[n]) return perks[n].icon;
    return '❓';
};

const getPassiveIcon = (type: StatusEffectType | string) => {
    // Special cases for pets (which might still be names)
    if (typeof type === 'string') {
        const n = type.toUpperCase();
        if (n === 'SOTIS' || n === 'PANTER') return '🐱';
        return getStatusIcon(n);
    }

    // Direct enum lookup
    return DataResolver.getPerks()[type]?.icon || '❓';
};


// ============================================================================
// SUB-COMPONENTS (Refactored to accept Refs)
// ============================================================================

const StatusEffectIcon = React.memo(({ type, isDebuff, isMobileDevice, isLandscapeMode, handleActionEnter }: any) => {
    const barRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const unsubscribe = HudStore.subscribe((state) => {
            if (!barRef.current) return;
            let progress = 0;
            const effect = state.statusEffects.find(e => e.type === type);
            if (effect) {
                const max = effect.maxDuration || 5000;
                progress = Math.max(0, Math.min(1.0, effect.duration / max));
            }
            barRef.current.style.transform = `scaleX(${progress})`;
        });
        return unsubscribe;
    }, [type]);

    const color = isDebuff ? PerkColor.DEBUFF : PerkColor.BUFF;
    const pulseClass = isDebuff ? 'hud-debuff-pulse' : 'hud-buff-pulse';

    const tooltip = DataResolver.getPerkName(type) ? `${t(DataResolver.getPerkName(type))}: ${t(DataResolver.getPerkDescription(type))}` : type.toString();

    return (
        <div className={`${isMobileDevice && isLandscapeMode ? 'w-10 h-10 text-xl' : 'w-10 h-10 text-[14px]'} flex items-center justify-center bg-black/80 border-2 rounded-sm ${pulseClass} relative cursor-help`}
            style={{ borderColor: color }}
            data-tooltip={tooltip}
            onTouchStart={isMobileDevice ? handleActionEnter : undefined}>
            <span>{getStatusIcon(type)}</span>
            <div className="absolute -bottom-2 left-0 w-full h-0.5 bg-black/40">
                <div ref={barRef} className="w-full h-full origin-left will-change-transform" style={{ backgroundColor: color, transform: 'scaleX(1)' }} />
            </div>
        </div>
    );
});

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

const VitalsPanel = React.memo(({ isMobileDevice, isBossIntro, hpBarRef, hpTextRef, stBarRef, xpBarRef }: any) => {
    return (
        <div className={`flex flex-col gap-1.5 ${isMobileDevice ? 'w-40' : 'w-80'} transition-opacity duration-500 ${isBossIntro ? 'opacity-0' : 'opacity-100'}`}>
            <div className={`${BAR_WRAPPER} ${isMobileDevice ? 'h-5' : 'h-10'} w-full border border-red-500/30`}>
                <div className="h-full bg-red-900/20 relative">
                    <div ref={hpBarRef} className="w-full h-full bg-[#ff3333] transition-transform duration-300 origin-left will-change-transform hud-bar-glow" style={{ transform: 'scaleX(0)' }} />
                    <div className="absolute inset-0 flex items-center justify-start px-3">
                        <span ref={hpTextRef} className={`${isMobileDevice ? 'text-[10px]' : 'text-[13px]'} text-white font-mono font-bold tracking-tighter`}>
                            0 / 100
                        </span>
                    </div>
                </div>
            </div>

            <div className={`${BAR_WRAPPER} ${isMobileDevice ? 'h-2' : 'h-4'} w-full border border-purple-500/30`}>
                <div className="h-full bg-purple-900/20 relative">
                    <div ref={stBarRef} className="w-full h-full bg-[#a855f7] transition-transform duration-300 origin-left will-change-transform hud-bar-glow" style={{ transform: 'scaleX(0)' }} />
                </div>
            </div>

            <div className={`${BAR_WRAPPER} ${isMobileDevice ? 'h-1.5' : 'h-2.5'} w-full border border-cyan-500/30`}>
                <div className="h-full bg-cyan-900/20 relative">
                    <div ref={xpBarRef} className="w-full h-full bg-[#06b6d4] transition-transform duration-300 origin-left will-change-transform hud-bar-glow" style={{ transform: 'scaleX(0)' }} />
                </div>
            </div>
        </div>
    );
});

const StatusEffectsPanel = React.memo(({ isMobileDevice, isLandscapeMode, handleActionEnter, handleActionLeave }: any) => {
    const activePassives = useHudStore(s => s.activePassives, true);
    const activeBuffs = useHudStore(s => s.activeBuffs, true);
    const activeDebuffs = useHudStore(s => s.activeDebuffs, true);

    return (
        <div className={isMobileDevice && isLandscapeMode ? "absolute top-24 left-0 flex flex-col gap-2 pl-safe pointer-events-auto" : "flex flex-wrap gap-2 mt-1 ml-1 pointer-events-auto"}>
            {activePassives.map((id, i) => {
                const tooltip = DataResolver.getPerkName(id) ? `${t(DataResolver.getPerkName(id))}: ${t(DataResolver.getPerkDescription(id))}` : id.toString();
                return (
                    <div key={`p-${i}`}
                        className={`${isMobileDevice && isLandscapeMode ? 'w-10 h-10 text-xl' : 'w-7 h-7 text-[11px]'} flex items-center justify-center bg-black/80 border-2 rounded-full transition-all cursor-help`}
                        style={{
                            borderColor: PerkColor.PASSIVE,
                            boxShadow: `0 0 8px ${PerkColor.PASSIVE}66` // Add 40% opacity (66 in hex)
                        }}
                        data-tooltip={tooltip}
                        onMouseEnter={!isMobileDevice ? handleActionEnter : undefined}
                        onMouseLeave={!isMobileDevice ? handleActionLeave : undefined}
                        onTouchStart={isMobileDevice ? handleActionEnter : undefined}>
                        <span>{getPassiveIcon(id)}</span>
                    </div>
                );
            })}

            {activeBuffs.map((type, i) => (
                <StatusEffectIcon
                    key={`b-${i}`}
                    type={type}
                    isDebuff={false}
                    isMobileDevice={isMobileDevice}
                    isLandscapeMode={isLandscapeMode}
                    handleActionEnter={handleActionEnter}
                />
            ))}
            {activeDebuffs.map((type, i) => (
                <StatusEffectIcon
                    key={`d-${i}`}
                    type={type}
                    isDebuff={true}
                    isMobileDevice={isMobileDevice}
                    isLandscapeMode={isLandscapeMode}
                    handleActionEnter={handleActionEnter}
                />
            ))}
        </div>
    );
});

const KillsPanel = React.memo(({ isMobileDevice, isBossIntro, handlePauseInternal, killsTextRef }: any) => {

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
                <span className={`${isMobileDevice ? 'text-[9px]' : 'text-sm'} font-bold text-[#ff3333] tracking-widest uppercase opacity-80`}>
                    {t('ui.kills')}
                </span>
            </div>
        </div>
    );
});

const CurrencyPanel = React.memo(({ isMobileDevice, isBossIntro, scrapTextRef, spTextRef, scrapBoxRef, spBoxRef }: any) => {
    const size = isMobileDevice ? 'w-14 h-14' : 'w-20 h-20';

    return (
        <div className={`flex flex-col gap-3 transition-opacity duration-500 ${isBossIntro ? 'opacity-0' : 'opacity-100'}`}>
            {/* SCRAP BOX (CampHUD Style) */}
            <div ref={scrapBoxRef} 
                 className={`${size} aspect-square border bg-yellow-950/80 border-yellow-700 shadow-[0_0_15px_rgba(234,179,8,0.2)] flex flex-col items-center justify-center gap-0 transition-all pointer-events-auto`}>
                <span className={`${isMobileDevice ? 'text-[7px]' : 'text-[10px]'} block uppercase font-bold text-yellow-500 leading-tight`}>{t('ui.scrap')}</span>
                <span ref={scrapTextRef} className={`${isMobileDevice ? 'text-lg' : 'text-2xl'} font-bold font-mono text-yellow-500 leading-none`}>0</span>
            </div>

            {/* SP BOX (CampHUD Style) */}
            <div ref={spBoxRef} 
                 className={`${size} aspect-square border bg-purple-950/80 border-purple-700 shadow-[0_0_15px_rgba(168,85,247,0.2)] flex flex-col items-center justify-center gap-0 transition-all pointer-events-auto`}>
                <span className={`${isMobileDevice ? 'text-[7px]' : 'text-[10px]'} block uppercase font-bold text-purple-500 leading-tight`}>{t('ui.sp')}</span>
                <span ref={spTextRef} className={`${isMobileDevice ? 'text-lg' : 'text-2xl'} font-bold font-mono text-purple-500 leading-none`}>0</span>
            </div>
        </div>
    );
});

const BossWavePanel = React.memo(({ isMobileDevice, bossHpBarRef }: any) => {
    // IMPORTANT: We only listen to static/slow values (active, name, maxHp). 
    // We NEVER listen to current HP here. That is handled by the DOM ref.
    const bossActive = useHudStore(s => s.boss?.active || false);
    const bossName = useHudStore(s => s.boss?.name || '');
    const bossDefeated = useHudStore(s => s.bossDefeated);
    const sectorStats = useHudStore(s => s.sectorStats);

    const waveActive = sectorStats?.zombieWaveActive || false;
    const isWave = !bossActive && waveActive;

    if (!bossActive && !waveActive) return null;
    if (bossActive && bossDefeated) return null;

    const displayName = bossActive ? bossName : 'zombie_wave';

    return (
        <div className="w-full flex flex-col items-center animate-fadeIn pointer-events-none">
            <h2 className={`${isMobileDevice ? 'text-sm mb-2 opacity-60' : 'text-5xl font-light mb-4 opacity-80'} text-white tracking-widest uppercase hud-text-glow ${isWave ? 'text-[#ff3333] italic font-semibold' : ''}`}>
                {t(displayName)}
            </h2>
            <div className={`w-full bg-black/90 border border-red-900 shadow-2xl skew-x-[-10deg] ${isMobileDevice ? 'max-w-[250px] h-2' : 'max-w-[600px] h-4'}`}>
                {/* HARDWARE ACCELERATED BOSS BAR */}
                <div
                    ref={bossHpBarRef}
                    className="h-full bg-[#ff3333] origin-left will-change-transform"
                    style={{ transform: 'scaleX(1)' }}
                />
            </div>
        </div>
    );
});

const BottomActionPanel = React.memo(({ isMobileDevice, isBossIntro, weaponSlots, handleSelectWeaponInternal, ammoTextRef, reloadBarRef, speedTextRef, gasPedalRef, brakePedalRef }: any) => {
    const isDriving = useHudStore(s => s.isDriving);
    const activeWeapon = useHudStore(s => s.activeWeapon);
    const throwableAmmo = useHudStore(s => s.throwableAmmo);
    const familyFound = useHudStore(s => s.familyFound);
    const unlimitedAmmo = useHudStore(s => s.sectorStats?.unlimitedAmmo || false);

    const wep = DataResolver.getWeapons()[activeWeapon];

    const interactionActive = useHudStore(s => s.interactionPrompt.active);
    const interactionType = useHudStore(s => s.interactionPrompt.type);
    const interactionLabel = useHudStore(s => s.interactionPrompt.label);

    return (
        <div className={`absolute ${isMobileDevice ? 'bottom-4' : 'bottom-4'} left-1/2 -translate-x-1/2 flex flex-col items-center transition-opacity duration-500 ${isBossIntro ? 'opacity-0' : 'opacity-100'}`}>
            {interactionActive && interactionType !== InteractionType.NONE && (
                <div className="mb-4 animate-in fade-in slide-in-from-bottom-2 duration-300 pointer-events-auto">
                    <InteractionPrompt 
                        type={interactionType} 
                        label={interactionLabel} 
                        isMobileDevice={isMobileDevice} 
                        onInteract={(active) => HudStore.triggerInteraction(active)}
                    />
                </div>
            )}

            {!isDriving && wep && wep.category !== WeaponCategory.THROWABLE && activeWeapon !== WeaponType.RADIO && (
                <div className={`${isMobileDevice ? 'mb-2' : 'mb-4'} text-center animate-fadeIn flex items-baseline`}>
                    <span ref={ammoTextRef} className={`${isMobileDevice ? 'text-2xl' : 'text-4xl'} font-bold text-white tracking-tighter font-mono`}>
                        {unlimitedAmmo ? '∞' : '--'}
                    </span>
                    {!wep.isEnergy && (
                        <span className={`${isMobileDevice ? 'text-[10px]' : 'text-xl'} font-bold text-white/30 ml-1 font-mono`}>/ {wep.magSize || 0}</span>
                    )}
                </div>
            )}

            {isDriving ? (
                <div className={`flex flex-col items-center ${isMobileDevice ? 'pt-2' : 'pt-8'}`}>
                    <div className={`${BAR_WRAPPER} hud-gritty-base hud-gritty-texture ${isMobileDevice ? 'px-8 py-2' : 'px-12 py-4'} shadow-2xl`}>
                        <span ref={speedTextRef} className={`${isMobileDevice ? 'text-4xl' : 'text-6xl'} font-semibold text-white tracking-tighter block hud-text-glow text-center`}>
                            0
                        </span>
                        <span className="text-[10px] font-medium text-white/40 uppercase tracking-[0.3em] block text-center mt-1">{t('ui.speed_unit')}</span>
                    </div>
                    <div className="flex gap-4 mt-4">
                        <div ref={gasPedalRef} className="px-6 py-2 border transition-all bg-black/80 border-white/10 text-white/20">
                            <span className="text-xs font-black uppercase tracking-widest">{t('ui.gas')}</span>
                        </div>
                        <div ref={brakePedalRef} className="px-6 py-2 border transition-all bg-black/80 border-white/10 text-white/20">
                            <span className="text-xs font-black uppercase tracking-widest">{t('ui.brake')}</span>
                        </div>
                    </div>
                </div>
            ) : (
                <div className={`flex ${isMobileDevice ? 'gap-1.5' : 'gap-3'} pointer-events-auto`}>
                    {weaponSlots.map(({ slot, type }: any) => {
                        const wData = DataResolver.getWeapons()[Number(type)];
                        if (!wData) return null;

                        const isActive = activeWeapon === type;

                        // Special fix for Slot 4 (Special) highlight if type matching is ambiguous 
                        // or if the engine state requires a more explicit check.
                        const isSpecialSlot = slot === '4';

                        const isThrowable = wData.category === WeaponCategory.THROWABLE;
                        const isRadio = type === WeaponType.RADIO;
                        const size = isMobileDevice ? "w-16 h-16" : "w-20 h-20";
                        const catColor = WeaponCategoryColors[wData.category] || 'white';


                        return (
                            <button key={slot} data-slot={slot}
                                onClick={!isMobileDevice ? handleSelectWeaponInternal : undefined}
                                onTouchStart={isMobileDevice ? handleSelectWeaponInternal : undefined}
                                className={`${SLOT_BASE} ${size} ${isActive ? 'scale-[1.15] z-20 border-[3px]' : 'opacity-80 border border-white/20 hover:opacity-80'} 
                                               ${(isRadio && familyFound) || (isThrowable && throwableAmmo <= 0) ? 'grayscale' : ''}`}
                                style={{
                                    borderColor: isActive ? catColor : undefined,
                                    boxShadow: isActive ? `0 0 20px -5px ${catColor}, inset 0 0 15px rgba(0,0,0,0.9)` : undefined
                                }}>

                                {isActive && <ReloadGrittyFill reloadBarRef={reloadBarRef} catColor={catColor} />}

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
    loadout, debugMode = false, isBossIntro = false, isMobileDevice = false,
    onTogglePause, onToggleMap, onSelectWeapon
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
    const xpBarRef = useRef<HTMLDivElement>(null);
    const ammoTextRef = useRef<HTMLSpanElement>(null);
    const reloadBarRef = useRef<HTMLDivElement>(null);
    const floatingReloadBarRef = useRef<HTMLDivElement>(null);
    const floatingReloadBarContainerRef = useRef<HTMLDivElement>(null);
    const hudContainerRef = useRef<HTMLDivElement>(null);
    const xpGainContainerRef = useRef<HTMLDivElement>(null);
    const xpGainTextRef = useRef<HTMLSpanElement>(null);
    const speedTextRef = useRef<HTMLSpanElement>(null);
    const gasPedalRef = useRef<HTMLDivElement>(null);
    const brakePedalRef = useRef<HTMLDivElement>(null);
    const bossHpBarRef = useRef<HTMLDivElement>(null);
    const killsTextRef = useRef<HTMLSpanElement>(null);
    const scrapTextRef = useRef<HTMLSpanElement>(null);
    const spTextRef = useRef<HTMLSpanElement>(null);
    const scrapBoxRef = useRef<HTMLDivElement>(null);
    const spBoxRef = useRef<HTMLDivElement>(null);

    const prevTelemetry = useRef({ kills: 0, scrap: 0, sp: 0 });

    // --- FAST HUD UPDATE LISTENER ---
    useEffect(() => {
        const handleFastUpdate = (e: any) => {
            const data = e.detail;

            // 1. HP Updates
            if (hpBarRef.current) {
                const hpRatio = data.maxHp > 0 ? (data.hp / data.maxHp) : 0;
                hpBarRef.current.style.transform = `scaleX(${hpRatio})`;
            }
            if (hpTextRef.current) {
                hpTextRef.current.innerText = `${Math.ceil(data.hp)} / ${data.maxHp}`;
            }

            // 2. Stamina Updates
            if (staminaBarRef.current) {
                const stRatio = data.maxStamina > 0 ? (data.stamina / data.maxStamina) : 0;
                staminaBarRef.current.style.transform = `scaleX(${stRatio})`;
            }

            // 3. XP Updates
            if (xpBarRef.current) {
                const xpRatio = data.nextLevelXp > 0 ? (data.currentXp / data.nextLevelXp) : 0;
                xpBarRef.current.style.transform = `scaleX(${xpRatio})`;
            }

            // 4. Ammo Updates
            if (ammoTextRef.current) {
                const wep = DataResolver.getWeapons()[HudStore.getState().activeWeapon];
                const val = wep?.isEnergy 
                    ? Math.floor(data.ammo) + '%' 
                    : data.ammo.toString();

                if (ammoTextRef.current.innerText !== val) {
                    ammoTextRef.current.innerText = val;
                }
            }

            // 5. Reload Updates
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

            // 6. Boss HP Update
            if (bossHpBarRef.current && data.bossHpP !== undefined) {
                if (data.bossHpP >= 0) {
                    bossHpBarRef.current.style.transform = `scaleX(${Math.max(0, Math.min(1, data.bossHpP))})`;
                }
            }

            // 7. Vehicle Speed & Throttle
            if (speedTextRef.current) {
                const speed = Math.round(data.vehicleSpeed).toString();
                if (speedTextRef.current.innerText !== speed) {
                    speedTextRef.current.innerText = speed;
                }
            }
            if (gasPedalRef.current) {
                const isGas = data.throttleState > 0;
                gasPedalRef.current.style.backgroundColor = isGas ? 'rgba(6, 182, 212, 0.2)' : 'rgba(0, 0, 0, 0.8)';
                gasPedalRef.current.style.borderColor = isGas ? '#06b6d4' : 'rgba(255, 255, 255, 0.1)';
                gasPedalRef.current.style.color = isGas ? '#a5f3fc' : 'rgba(255, 255, 255, 0.2)';
            }
            if (brakePedalRef.current) {
                const isBrake = data.throttleState < 0;
                brakePedalRef.current.style.backgroundColor = isBrake ? 'rgba(255, 51, 51, 0.2)' : 'rgba(0, 0, 0, 0.8)';
                brakePedalRef.current.style.borderColor = isBrake ? '#ff3333' : 'rgba(255, 255, 255, 0.1)';
                brakePedalRef.current.style.color = isBrake ? '#fecaca' : 'rgba(255, 255, 255, 0.2)';
            }

            // --- 8. TELEMETRY (Kills, Scrap, SP) ---
            if (killsTextRef.current && data.kills !== undefined) {
                killsTextRef.current.innerText = data.kills.toString();
            }

            if (scrapTextRef.current && data.scrap !== undefined) {
                scrapTextRef.current.innerText = data.scrap.toString();
                if (data.scrap > prevTelemetry.current.scrap) {
                    if (scrapBoxRef.current) {
                        scrapBoxRef.current.classList.remove('hud-bling-pulse');
                        void scrapBoxRef.current.offsetWidth;
                        scrapBoxRef.current.classList.add('hud-bling-pulse');

                        // Reset to theme base (Zero-GC bypass for 60fps responsiveness)
                        scrapBoxRef.current.style.backgroundColor = 'rgba(66, 32, 6, 0.8)'; // dark yellow
                        scrapBoxRef.current.style.borderColor = '#a16207'; // yellow-700
 
                        UiSounds.playPickUp();
                    }
                }
                prevTelemetry.current.scrap = data.scrap;
            }

            if (spTextRef.current && data.spEarned !== undefined) {
                spTextRef.current.innerText = data.spEarned.toString();
                if (data.spEarned > prevTelemetry.current.sp) {
                    if (spBoxRef.current) {
                        spBoxRef.current.classList.remove('hud-bling-pulse-purple');
                        void spBoxRef.current.offsetWidth;
                        spBoxRef.current.classList.add('hud-bling-pulse-purple');

                        spBoxRef.current.style.backgroundColor = 'rgba(88, 28, 135, 0.8)'; // dark purple
                        spBoxRef.current.style.borderColor = '#7e22ce'; // purple-700
 
                        UiSounds.playPickUp();
                    }
                }
                prevTelemetry.current.sp = data.spEarned;
            }
        };

        window.addEventListener('hud-fast-update', handleFastUpdate);
        return () => window.removeEventListener('hud-fast-update', handleFastUpdate);
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
        { slot: '5', type: WeaponType.RADIO }
    ], [loadout.primary, loadout.secondary, loadout.throwable, loadout.special]);

    const handleSelectWeaponInternal = useCallback((e: React.MouseEvent<HTMLElement> | React.TouchEvent<HTMLElement>) => {
        e.stopPropagation();
        const slot = e.currentTarget.dataset.slot;
        if (slot && onSelectWeapon) {
            onSelectWeapon(slot);
            UiSounds.playClick();
        }
    }, [onSelectWeapon]);

    const handlePauseInternal = useCallback((e: React.TouchEvent<HTMLElement>) => {
        e.stopPropagation();
        onTogglePause?.();
    }, [onTogglePause]);

    const wep = DataResolver.getWeapons()[activeWeapon];
    const catColor = wep ? WeaponCategoryColors[wep.category] || 'white' : 'white';


    const hudVisible = useHudStore(s => s.hudVisible);

    return (
        <div ref={hudContainerRef} className="absolute inset-0 pointer-events-none">
            <DamageVignette />
            <DiscoveryPopup onOpenAdventureLog={(tab, itemId) => {
                // We assume there's a prop or global way to open it, 
                // but usually GameHUD is used inside a screen that handles this.
                // In winterdeath, we often use CustomEvents or props.
                window.dispatchEvent(new CustomEvent('open-adventure-log', { detail: { tab, itemId } }));
            }} />

            <div className={`${HUD_WRAPPER} ${!hudVisible || isDead || isDisoriented ? 'opacity-0 -translate-y-4 blur-[5px]' : 'opacity-100 translate-y-0 blur-0 animate-hudFadeIn'}`}>

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
                            xpBarRef={xpBarRef}
                        />
                        {(!isMobileDevice || !isLandscapeMode) && (
                            <StatusEffectsPanel isMobileDevice={isMobileDevice} isLandscapeMode={false} handleActionEnter={handleActionEnter} handleActionLeave={handleActionLeave} />
                        )}
                    </div>

                    <div className="flex flex-col items-end gap-12">
                        <KillsPanel isMobileDevice={isMobileDevice} isBossIntro={isBossIntro} handlePauseInternal={handlePauseInternal} killsTextRef={killsTextRef} />
                        <CurrencyPanel isMobileDevice={isMobileDevice} isBossIntro={isBossIntro} scrapTextRef={scrapTextRef} spTextRef={spTextRef} scrapBoxRef={scrapBoxRef} spBoxRef={spBoxRef} />
                    </div>

                    {isMobileDevice && isLandscapeMode && (
                        <StatusEffectsPanel isMobileDevice={isMobileDevice} isLandscapeMode={true} handleActionEnter={handleActionEnter} handleActionLeave={handleActionLeave} />
                    )}
                </div>

                <div className={`absolute ${isMobileDevice ? 'top-20 px-12' : 'top-32'} left-1/2 -translate-x-1/2 flex flex-col items-center w-full max-w-[600px]`}>
                    <BossWavePanel isMobileDevice={isMobileDevice} bossHpBarRef={bossHpBarRef} />
                </div>

                {/* UI RELOAD BAR OVER PLAYER HEAD */}
                <FloatingReloadBar reloadBarRef={floatingReloadBarRef} catColor={catColor} containerRef={floatingReloadBarContainerRef} />

                <BottomActionPanel
                    isMobileDevice={isMobileDevice}
                    isBossIntro={isBossIntro}
                    weaponSlots={weaponSlots}
                    handleSelectWeaponInternal={handleSelectWeaponInternal}
                    ammoTextRef={ammoTextRef}
                    reloadBarRef={reloadBarRef}
                    speedTextRef={speedTextRef}
                    gasPedalRef={gasPedalRef}
                    brakePedalRef={brakePedalRef}
                />

                {/* XP GAIN DISPLAY (DOM placeholder) */}
                <div ref={xpGainContainerRef} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[200px] opacity-0 pointer-events-none">
                    <span ref={xpGainTextRef} className="text-cyan-400 font-bold text-2xl drop-shadow-lg font-mono">+0 XP</span>
                </div>

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
                    .hud-bling-pulse { animation: bling-yellow 0.4s ease-out; }
                    .hud-bling-pulse-purple { animation: bling-purple 0.4s ease-out; }

                    .animate-bling { animation: bling 0.6s ease-out; }
                    .animate-bling-yellow { animation: bling-yellow 0.6s ease-out; }
                `}</style>
            </div>
        </div>
    );
});

export default GameHUD;