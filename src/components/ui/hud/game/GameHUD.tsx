import React, { useState, useRef, useCallback, useEffect } from 'react';
import { WeaponID } from '../../../../entities/player/CombatTypes';
import { t } from '../../../../utils/i18n';
import { useHudStore } from '../../../../hooks/useHudStore';
import { useOrientation } from '../../../../hooks/useOrientation';
import { HudStore } from '../../../../store/HudStore';
import { DataResolver } from '../../../../core/data/DataResolver';
import { UISounds } from '../../../../utils/audio/AudioLib';
import { useUIEventBridge } from '../../../../hooks/useUIEventBridge';
import { UIEventType } from '../../../../systems/ui/UIEventRingBuffer';

// ============================================================================
// MODULAR SUB-PANELS (Same-Folder Telemetry Layout Components)
// ============================================================================
import { ActionBarPanel } from './ActionBarPanel';
import { VitalsPanel } from './VitalsPanel';
import { CurrencyPanel } from './CurrencyPanel';
import { KillsPanel } from './KillsPanel';
import { BossPanel } from './BossPanel';
import { EnemyWavePanel } from './EnemyWavePanel';
import { PerksPanel } from './PerksPanel';
import { FloatingReloadBar } from './FloatingReloadBar';
import { FloatingDurabilityBars } from './FloatingDurabilityBars';

// ============================================================================
// DECOUPLED STANDALONE SYSTEMS / WIDGET OVERLAYS
// ============================================================================
import ScreenEffect from './ScreenEffect';
import DiscoveryPopup from './DiscoveryPopup';
import InteractionPrompt from './InteractionPrompt';
import ChallengePopup from './ChallengePopup';
import ChatBubble from './ChatBubble';
import CombatLog from './CombatLog';
import LevelUpBanner from './LevelUpBanner';
import SideBanner from './SideBanner';


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

const HUD_WRAPPER = "absolute inset-0 pointer-events-none transition-all duration-500 ease-in z-[110]";

const GameHUD: React.FC<GameHUDProps> = React.memo(({
    loadout, isBossIntro = false, isMobileDevice = false,
    onTogglePause, onToggleMap, onSelectWeapon, onOpenAdventureLog,
    isSectorBannerActive = false, onSectorBannerComplete
}) => {
    const isDead = useHudStore(s => s.isDead);
    const isDisoriented = useHudStore(s => s.isDisoriented);
    const { isLandscapeMode } = useOrientation();

    // Context tooltips state (Cold Path — allocated during hovering interactions only)
    const [tooltipContent, setTooltipContent] = useState<string | null>(null);
    const tooltipTimeout = useRef<any>(null);

    // ============================================================================
    // HOT PATH DOM NODES: Pre-allocated pointers for Direct Ref Manipulation
    // ============================================================================
    const hpBarRef = useRef<HTMLDivElement>(null);
    const hpTextRef = useRef<HTMLSpanElement>(null);
    const staminaBarRef = useRef<HTMLDivElement>(null);
    const staminaTextRef = useRef<HTMLSpanElement>(null);
    const xpBarRef = useRef<HTMLDivElement>(null);
    const ammoTextRef = useRef<HTMLSpanElement>(null);
    const reloadBarRef = useRef<HTMLDivElement>(null);
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
    const killsTextRef = useRef<HTMLSpanElement>(null);
    const scrapTextRef = useRef<HTMLSpanElement>(null);
    const spTextRef = useRef<HTMLSpanElement>(null);
    const scrapBoxRef = useRef<HTMLDivElement>(null);
    const spBoxRef = useRef<HTMLDivElement>(null);

    // ============================================================================
    // TELEMETRY SNAPSHOT CACHE: Guards engine frames from redundant layout writes
    // ============================================================================
    const prevTelemetry = useRef({
        hp: -999, maxHp: -999, stamina: -999, maxStamina: -999, xp: -999, maxXp: -999,
        ammo: '', kills: -999, scrap: -999, sp: -999, hasCriticalHp: false, reloadProgress: -999,
        bossHpP: -999, waveActive: false, waveName: '', waveProgress: -999, waveKills: -999,
        waveTarget: -999, isDriving: false, vehicleSpeed: -999, throttleState: -999, isSkidding: false
    });

    useUIEventBridge(useCallback((type, p1, p2) => {
        switch (type) {
            case UIEventType.HUD_VISIBILITY:
                HudStore.setHudVisible(p1 === 1);
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

    // --- ZERO-GC: RUNTIME HIGH FREQUENCY STREAM SUBSCRIPTION LOOP ---
    useEffect(() => {
        const handleFastUpdate = (data: any) => {
            const cache = prevTelemetry.current as any;

            if (data.hp !== cache.hp || data.maxHp !== cache.maxHp) {
                if (hpBarRef.current) hpBarRef.current.style.transform = `scaleX(${data.maxHp > 0 ? (data.hp / data.maxHp) : 0})`;
                if (hpTextRef.current) hpTextRef.current.innerText = `${Math.ceil(data.hp)} / ${data.maxHp}`;
                cache.hp = data.hp; cache.maxHp = data.maxHp;
            }

            if (data.hasCriticalHp !== cache.hasCriticalHp) {
                if (hpBarRef.current) {
                    if (data.hasCriticalHp) hpBarRef.current.classList.add('hud-critical-pulse');
                    else hpBarRef.current.classList.remove('hud-critical-pulse');
                }
                cache.hasCriticalHp = data.hasCriticalHp;
            }

            if (data.stamina !== cache.stamina || data.maxStamina !== cache.maxStamina) {
                if (staminaBarRef.current) staminaBarRef.current.style.transform = `scaleX(${data.maxStamina > 0 ? (data.stamina / data.maxStamina) : 0})`;
                if (staminaTextRef.current) {
                    const text = data.stamina < 30 ? t('ui.low') : t('ui.stamina');
                    if (staminaTextRef.current.innerText !== text) staminaTextRef.current.innerText = text;
                }
                cache.stamina = data.stamina; cache.maxStamina = data.maxStamina;
            }

            if (data.currentXp !== cache.xp || data.nextLevelXp !== cache.maxXp) {
                if (xpBarRef.current) xpBarRef.current.style.transform = `scaleX(${data.nextLevelXp > 0 ? (data.currentXp / data.nextLevelXp) : 0})`;
                cache.xp = data.currentXp; cache.maxXp = data.nextLevelXp;
            }

            if (ammoTextRef.current) {
                const state = HudStore.getState();
                const activeId = state.activeWeapon;
                const wep = DataResolver.getWeapons()[activeId];
                const val = wep?.isEnergy ? Math.floor(data.ammo) + '%' : data.ammo.toString();
                if (cache.ammo !== val) { ammoTextRef.current.innerText = val; cache.ammo = val; }
            }

            if (data.reloadProgress !== cache.reloadProgress) {
                if (reloadBarRef.current) reloadBarRef.current.style.transform = `scaleY(${data.reloadProgress})`;
                cache.reloadProgress = data.reloadProgress;
            }

            if (data.bossHpP !== undefined && data.bossHpP !== cache.bossHpP) {
                if (bossHpBarRef.current && data.bossHpP >= 0) bossHpBarRef.current.style.transform = `scaleX(${Math.max(0, Math.min(1, data.bossHpP))})`;
                if (bossHpTrailBarRef.current && data.bossHpP >= 0) bossHpTrailBarRef.current.style.transform = `scaleX(${Math.max(0, Math.min(1, data.bossHpP))})`;
                cache.bossHpP = data.bossHpP;
            }

            if (data.waveActive) {
                if (wavePanelRef.current && wavePanelRef.current.style.display !== 'flex') {
                    wavePanelRef.current.style.display = 'flex';
                    void wavePanelRef.current.offsetHeight;
                    wavePanelRef.current.classList.remove('opacity-0', '-translate-y-4', 'blur-md', 'animate-wave-disappear');
                    wavePanelRef.current.classList.add('animate-wave-appear');
                }
                const isCleared = data.waveProgress >= 1.0;
                if (waveNameRef.current && (data.waveName !== cache.waveName || isCleared !== cache.waveCleared)) {
                    waveNameRef.current.innerText = isCleared ? (t('ui.wave_cleared') || 'WAVE CLEARED') : t(data.waveName);
                    if (isCleared) waveNameRef.current.classList.add('hud-wave-cleared-text');
                    else waveNameRef.current.classList.remove('hud-wave-cleared-text');
                    cache.waveName = data.waveName; cache.waveCleared = isCleared;
                }
                const remaining = Math.max(0, Math.min(1, 1.0 - data.waveProgress));
                if (waveBarRef.current) {
                    waveBarRef.current.style.transform = `scaleX(${remaining})`;
                    if (isCleared) waveBarRef.current.classList.add('hud-wave-cleared-bar');
                    else waveBarRef.current.classList.remove('hud-wave-cleared-bar');
                }
                if (waveTrailBarRef.current) waveTrailBarRef.current.style.transform = `scaleX(${remaining})`;
                if (waveTextRef.current) {
                    waveTextRef.current.innerText = `${data.waveKills} / ${data.waveTarget}`;
                    if (isCleared) waveTextRef.current.classList.add('hud-wave-cleared-text');
                    else waveTextRef.current.classList.remove('hud-wave-cleared-text');
                }
            } else {
                if (wavePanelRef.current && wavePanelRef.current.style.display !== 'none') {
                    wavePanelRef.current.classList.remove('animate-wave-appear');
                    wavePanelRef.current.classList.add('animate-wave-disappear');
                    const ref = wavePanelRef.current;
                    setTimeout(() => { if (!prevTelemetry.current.waveActive && ref) { ref.style.display = 'none'; ref.classList.remove('animate-wave-disappear'); } }, 800);
                }
                if (waveNameRef.current) waveNameRef.current.classList.remove('hud-wave-cleared-text');
                if (waveBarRef.current) waveBarRef.current.classList.remove('hud-wave-cleared-bar');
                if (waveTextRef.current) waveTextRef.current.classList.remove('hud-wave-cleared-text');
                cache.waveCleared = false;
            }

            if (data.isDriving) {
                if (data.vehicleSpeed !== cache.vehicleSpeed) {
                    if (speedTextRef.current) speedTextRef.current.innerText = Math.round(data.vehicleSpeed).toString();
                    if (speedArcRef.current) speedArcRef.current.style.strokeDashoffset = (340 - (Math.max(0, Math.min(1, data.vehicleSpeed / 160)) * 340)).toString();
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

            if (data.kills !== undefined && data.kills !== cache.kills) {
                if (killsTextRef.current) killsTextRef.current.innerText = data.kills.toString();
                cache.kills = data.kills;
            }

            if (data.scrap !== undefined && data.scrap !== cache.scrap) {
                if (scrapTextRef.current) scrapTextRef.current.innerText = data.scrap.toString();
                if (data.scrap > cache.scrap && cache.scrap !== -999 && scrapBoxRef.current) {
                    scrapBoxRef.current.classList.remove('hud-bling-pulse'); void scrapBoxRef.current.offsetWidth;
                    scrapBoxRef.current.classList.add('hud-bling-pulse'); UISounds.playPickUp();
                }
                cache.scrap = data.scrap;
            }

            if (data.spEarned !== undefined && data.spEarned !== cache.sp) {
                if (spTextRef.current) spTextRef.current.innerText = data.spEarned.toString();
                if (data.spEarned > cache.sp && cache.sp !== -999 && spBoxRef.current) {
                    spBoxRef.current.classList.remove('hud-bling-pulse-purple'); void spBoxRef.current.offsetWidth;
                    spBoxRef.current.classList.add('hud-bling-pulse-purple'); UISounds.playPickUp();
                }
                cache.sp = data.spEarned;
            }
        };

        return HudStore.subscribeFastUpdate(handleFastUpdate);
    }, []);

    const showTooltip = useCallback((text: string) => {
        if (tooltipTimeout.current) clearTimeout(tooltipTimeout.current);
        setTooltipContent(text);
        tooltipTimeout.current = setTimeout(() => setTooltipContent(null), isMobileDevice ? 2000 : 3000);
    }, [isMobileDevice]);

    const clearTooltip = useCallback(() => setTooltipContent(null), []);

    const showRestOfHUD = useHudStore(s => s.hudVisible) && !isSectorBannerActive;

    useEffect(() => { HudStore.setHudVisible(!isSectorBannerActive); }, [isSectorBannerActive]);

    return (
        <div ref={hudContainerRef} className="absolute inset-0 pointer-events-none">
            {/* SCREEN EFFECTS */}
            <ScreenEffect />

            {/* CHAT BUBBLE */}
            <ChatBubble />

            {/* COMBAT LOG */}
            <CombatLog />

            {/* LEVEL UP BANNER */}
            <LevelUpBanner />

            {/* FLOATING RELOAD BAR */}
            <FloatingReloadBar />

            {/* FLOATING DURABILITY BARS */}
            <FloatingDurabilityBars />

            {/* DISCOVERY POPUP */}
            <DiscoveryPopup onOpenAdventureLog={onOpenAdventureLog} />

            {/* CHALLENGE POPUP */}
            <ChallengePopup onOpenAdventureLog={onOpenAdventureLog} />

            {/* SIDE BANNERS */}
            <SideBanner
                active={isSectorBannerActive || isBossIntro}
                onComplete={isBossIntro ? (() => { }) : (onSectorBannerComplete || (() => { }))}
                isBossIntro={isBossIntro}
                isMobileDevice={isMobileDevice} />

            <div className={`${HUD_WRAPPER} ${!showRestOfHUD || isDead || isDisoriented || isBossIntro ? 'opacity-0 -translate-y-4 blur-[5px]' : 'opacity-100 translate-y-0 blur-0 animate-hudFadeIn'}`}>
                <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-black/80 to-transparent pointer-events-none z-0" />
                <div className={`absolute bottom-0 left-0 right-0 ${isMobileDevice ? 'h-32' : 'h-48'} bg-gradient-to-t from-black/90 to-transparent pointer-events-none z-0`} />

                <div className={`absolute ${isMobileDevice ? 'top-4 left-4 right-4' : 'top-8 left-8 right-12'} flex justify-between items-start`}>
                    <div className={`flex flex-col gap-1.5 ${isMobileDevice ? 'w-40' : 'w-80'}`}>
                        {/* VITALS PANEL */}
                        <VitalsPanel
                            isMobileDevice={isMobileDevice}
                            hpBarRef={hpBarRef}
                            hpTextRef={hpTextRef}
                            stBarRef={staminaBarRef}
                            stTextRef={staminaTextRef}
                            xpBarRef={xpBarRef}
                        />

                        {/* PERKS PANEL */}
                        <PerksPanel
                            isMobileDevice={isMobileDevice}
                            isLandscapeMode={isLandscapeMode}
                            showTooltip={showTooltip}
                            clearTooltip={clearTooltip}
                        />
                    </div>

                    <div className="flex flex-col items-end gap-3 pointer-events-auto">
                        {/* KILLS PANEL */}
                        <KillsPanel
                            isMobileDevice={isMobileDevice}
                            killsTextRef={killsTextRef} />

                        {/* CURRENCY PANEL */}
                        <CurrencyPanel
                            isMobileDevice={isMobileDevice}
                            isLandscapeMode={isLandscapeMode}
                            scrapTextRef={scrapTextRef}
                            spTextRef={spTextRef}
                            scrapBoxRef={scrapBoxRef}
                            spBoxRef={spBoxRef} />
                    </div>
                </div>

                <div className={`absolute ${isMobileDevice ? 'top-20 px-12' : 'top-32'} left-1/2 -translate-x-1/2 flex flex-col items-center w-full max-w-[600px] gap-4`}>
                    {/* BOSS PANEL */}
                    <BossPanel
                        isMobileDevice={isMobileDevice}
                        isBossIntro={isBossIntro}
                        bossHpBarRef={bossHpBarRef}
                        bossHpTrailBarRef={bossHpTrailBarRef} />

                    {/* ENEMY WAVE PANEL */}
                    <EnemyWavePanel
                        isMobileDevice={isMobileDevice}
                        wavePanelRef={wavePanelRef}
                        waveNameRef={waveNameRef}
                        waveBarRef={waveBarRef}
                        waveTrailBarRef={waveTrailBarRef}
                        waveTextRef={waveTextRef} />
                </div>

                {/* ACTION BAR PANEL */}
                <ActionBarPanel
                    loadout={loadout}
                    isMobileDevice={isMobileDevice}
                    onSelectWeapon={onSelectWeapon}
                    showTooltip={showTooltip}
                    clearTooltip={clearTooltip}
                    ammoTextRef={ammoTextRef}
                    reloadBarRef={reloadBarRef}
                    speedTextRef={speedTextRef}
                    speedArcRef={speedArcRef}
                    gasPedalRef={gasPedalRef}
                    skidPedalRef={skidPedalRef}
                    brakePedalRef={brakePedalRef}
                />

                {/* TOOLTIP */}
                {tooltipContent && (
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[1000] px-8 py-4 bg-zinc-950/90 border-2 border-white/20 backdrop-blur-3xl rounded-full shadow-[0_0_50px_rgba(0,0,0,0.8)] animate-in fade-in zoom-in duration-300">
                        <span className={`${isMobileDevice ? 'text-sm' : 'text-lg'} text-white font-bold uppercase tracking-widest whitespace-nowrap`}>{tooltipContent}</span>
                    </div>
                )}
            </div>

            {/* INTERACTION PROMPT — fully self-driving */}
            <InteractionPrompt isMobileDevice={isMobileDevice} />
        </div>
    );
});

export default GameHUD;