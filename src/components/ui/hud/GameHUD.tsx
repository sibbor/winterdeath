import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { WeaponType, WeaponCategoryColors } from '../../../content/weapons';
import { WEAPONS, RANKS, HEALTH_CRITICAL_THRESHOLD } from '../../../content/constants';
import { t } from '../../../utils/i18n';
import { HudStore } from '../../../core/systems/HudStore';
import DamageVignette from './DamageVignette';

interface GameHUDProps {
    loadout: { primary: WeaponType; secondary: WeaponType; throwable: WeaponType; special: WeaponType; };
    weaponLevels?: Record<WeaponType, number>;
    debugMode?: boolean;
    isBossIntro?: boolean;
    onTogglePause?: () => void;
    onToggleMap?: () => void;
}

// --- ZERO-GC HELPERS ---
// Pre-allocate arrays for loop mapping to avoid GC hit every frame.
const _arrayCache: Record<number, number[]> = {};
const getCachedArray = (length: number): number[] => {
    if (!_arrayCache[length]) {
        _arrayCache[length] = [];
        for (let i = 0; i < length; i++) {
            _arrayCache[length].push(i);
        }
    }
    return _arrayCache[length];
};

const GameHUD: React.FC<GameHUDProps> = React.memo(({
    loadout, weaponLevels, debugMode = false, isBossIntro = false, onTogglePause, onToggleMap
}) => {
    const [hud, setHud] = useState<any>(HudStore.getData());

    useEffect(() => {
        return HudStore.subscribe((data) => setHud(data));
    }, []);

    const {
        hp = 100, maxHp = 100, stamina = 100, maxStamina = 100, ammo = 0, magSize = 0, activeWeapon = WeaponType.PISTOL,
        isReloading = false, score = 0, scrap = 0, multiplier = 1, boss = null,
        throwableReadyTime = 0, throwableAmmo = 3, kills = 0, bossSpawned = false, bossDefeated = false,
        familyDistance = null, familySignal = 0, familyFound = false, level = 1, currentXp = 0, nextLevelXp = 100,
        reloadProgress = 0, skillPoints = 0, playerPos, distanceTraveled = 0, isDead = false,
        isDriving = false, vehicleSpeed = 0, throttleState = 0,
        sectorStats,
        fps = 0, debugInfo,
        statusEffects = [], isDisoriented = false,
        activePassives = [], activeBuffs = [], activeDebuffs = []
    } = hud;

    const [tooltipContent, setTooltipContent] = useState<string | null>(null);
    const tooltipTimeout = useRef<any>(null);

    const showTooltip = useCallback((text: string) => {
        if (tooltipTimeout.current) clearTimeout(tooltipTimeout.current);
        setTooltipContent(text);
        tooltipTimeout.current = setTimeout(() => {
            setTooltipContent(null);
        }, 3000);
    }, []);

    // Zero-GC Event Handlers
    const handleMouseEnter = useCallback((e: React.MouseEvent<HTMLElement>) => {
        const text = e.currentTarget.dataset.tooltip;
        if (text) showTooltip(text);
    }, [showTooltip]);

    const handleMouseLeave = useCallback(() => {
        setTooltipContent(null);
    }, []);

    const hpP = maxHp > 0 ? Math.max(0, (hp / maxHp) * 100) : 0;
    const stP = maxStamina > 0 ? Math.max(0, (stamina / maxStamina) * 100) : 0;
    const xpP = nextLevelXp > 0 ? Math.min(100, Math.max(0, (currentXp / nextLevelXp) * 100)) : 0;
    const speedKmH = Math.round(vehicleSpeed * 3.6);

    const [isShaking, setIsShaking] = useState(false);
    const [showLevelUp, setShowLevelUp] = useState(false);
    const [spGained, setSpGained] = useState(false);
    const [scrapGained, setScrapGained] = useState(false);

    const prevHp = useRef(hp);
    const prevLevel = useRef(level);
    const prevXp = useRef(currentXp);

    const [xpGainAmount, setXpGainAmount] = useState(0);
    const [xpGained, setXpGained] = useState(false);

    const prevSkillPoints = useRef(skillPoints);
    const prevScrap = useRef(scrap);
    const prevDistanceTraveled = useRef(distanceTraveled);
    const hasMounted = useRef(false);

    const [spGainAmount, setSpGainAmount] = useState(0);
    const [scrapGainAmount, setScrapGainAmount] = useState(0);

    useEffect(() => {
        hasMounted.current = true;
    }, []);

    useEffect(() => {
        if (hp < prevHp.current) {
            setIsShaking(true);
            setTimeout(() => setIsShaking(false), 200);
        }
        prevHp.current = hp;
    }, [hp]);

    useEffect(() => {
        const isLoad = prevDistanceTraveled.current < 5;
        if (level > prevLevel.current && (level - prevLevel.current === 1) && !isLoad) {
            setShowLevelUp(true);
            setTimeout(() => setShowLevelUp(false), 500);
        }
        prevLevel.current = level;
    }, [level, distanceTraveled]);

    useEffect(() => {
        const diff = (currentXp || 0) - (prevXp.current || 0);
        const isLoad = !hasMounted.current || distanceTraveled < 1.0;

        if (diff >= 250 && !isLoad) {
            setXpGainAmount(diff);
            setXpGained(true);
            const t = setTimeout(() => setXpGained(false), 3000);
            return () => clearTimeout(t);
        }
        prevXp.current = currentXp;
    }, [currentXp, distanceTraveled]);

    useEffect(() => {
        const diff = (skillPoints || 0) - (prevSkillPoints.current || 0);
        const isLoad = !hasMounted.current || distanceTraveled < 1.0;

        if (diff > 0 && diff < 10 && !isLoad) {
            setSpGainAmount(diff);
            setSpGained(true);
            setTimeout(() => setSpGained(false), 1000);
        }
        prevSkillPoints.current = skillPoints;
    }, [skillPoints, distanceTraveled]);

    useEffect(() => {
        const diff = scrap - prevScrap.current;
        const isLoad = !hasMounted.current || distanceTraveled < 1.0;

        if (diff > 0 && !isLoad) {
            setScrapGainAmount(diff);
            setScrapGained(true);
            setTimeout(() => setScrapGained(false), 1000);
        }
        prevScrap.current = scrap;
    }, [scrap, distanceTraveled]);

    useEffect(() => {
        prevDistanceTraveled.current = distanceTraveled;
    }, [distanceTraveled]);

    // Zero-GC Array creation for Action Slots
    const weaponSlots = useMemo(() => [
        { slot: '1', type: loadout.primary },
        { slot: '2', type: loadout.secondary },
        { slot: '3', type: loadout.throwable },
        { slot: '4', type: loadout.special },
        { slot: '5', type: WeaponType.RADIO }
    ], [loadout.primary, loadout.secondary, loadout.throwable, loadout.special]);

    const renderSegments = (current: number, max: number, colorClass: string = 'active') => {
        const totalSegments = 12;
        const activeSegments = Math.ceil((current / max) * totalSegments);
        return (
            <div className="segmented-health-bar">
                {getCachedArray(totalSegments).map((i) => (
                    <div
                        key={i}
                        className={`health-segment ${i < activeSegments ? colorClass : ''}`}
                    />
                ))}
            </div>
        );
    };

    const isBossActive = boss && boss.active && !bossDefeated;
    const wep = WEAPONS[activeWeapon];

    const getStatusIcon = (type: string) => {
        switch (type) {
            case 'FREEZING': return '❄️';
            case 'BURNING': return '🔥';
            case 'BLEEDING': return '🩸';
            case 'ELECTRIFIED': return '⚡';
            case 'SLOWED': return '🐌';
            case 'DISORIENTED': return '😵';
            default: return '❓';
        }
    };

    const getPassiveIcon = (name: string) => {
        switch (name.toLowerCase()) {
            case 'loke': return '⚡';
            case 'jordan': return '🎯';
            case 'esmeralda': return '🔫';
            case 'nathalie': return '🛡️';
            case 'sotis':
            case 'panter': return '🐱';
            default: return '👤';
        }
    };

    return (
        <>
            <DamageVignette hp={hp} maxHp={maxHp} threshold={HEALTH_CRITICAL_THRESHOLD} isDead={isDead} />
            <div className={`absolute inset-0 pointer-events-none transition-all duration-500 ease-in ${isDead || isDisoriented ? 'opacity-0 scale-110 blur-[5px]' : 'opacity-100 scale-100 blur-0'}`}>

                {/* 1. TOP-ROW: STATUS & KILLS */}
                <div className="absolute top-8 left-8 right-12 flex justify-between items-start">

                    {/* 1.1 TOP-LEFT: HP, STAMINA, XP */}
                    <div className={`flex flex-col gap-1.5 w-80 transition-opacity duration-500 ${isBossIntro ? 'opacity-0' : 'opacity-100'}`}>
                        {/* HP Bar */}
                        <div className="hud-bar-container h-10 w-full group">
                            <div className="h-full bg-red-900/20 relative">
                                <div
                                    className="h-full bg-[#ff3333] hud-bar-glow transition-all duration-300"
                                    style={{ width: `${hpP}%`, boxShadow: '0 0 15px rgba(255, 51, 51, 0.6)' }}
                                />
                                <div className="absolute inset-0 flex items-center justify-start px-3">
                                    <span className="text-[13px] text-white font-mono font-bold tracking-tighter">
                                        {Math.max(0, Math.ceil(hp || 0))} / {Math.max(0, Math.ceil(maxHp || 0))}
                                    </span>
                                </div>
                            </div>
                        </div>
                        {/* Stamina Bar */}
                        <div className="hud-bar-container h-4 w-full">
                            <div className="h-full bg-purple-900/20">
                                <div
                                    className="h-full bg-[#a855f7] hud-bar-glow transition-all duration-300"
                                    style={{ width: `${stP}%`, boxShadow: '0 0 10px rgba(168, 85, 247, 0.5)' }}
                                />
                            </div>
                        </div>
                        {/* XP Bar */}
                        <div className="hud-bar-container h-2.5 w-full mb-1">
                            <div className="h-full bg-cyan-900/20">
                                <div
                                    className="h-full bg-[#06b6d4] hud-bar-glow transition-all duration-300"
                                    style={{ width: `${xpP}%`, boxShadow: '0 0 8px rgba(6, 182, 212, 0.4)' }}
                                />
                            </div>
                        </div>

                        {/* Passives (Family Boosts) */}
                        <div className="flex gap-1.5 mt-1 ml-1">
                            {activePassives.map((name: string, i: number) => (
                                <div
                                    key={i}
                                    className="w-6 h-6 rounded-full border-2 border-green-500 bg-black/80 flex items-center justify-center text-[10px] shadow-[0_0_5px_rgba(34,197,94,0.3)] pointer-events-auto cursor-help"
                                    data-tooltip={t(`family.${name.toLowerCase()}`)}
                                    onMouseEnter={handleMouseEnter}
                                    onMouseLeave={handleMouseLeave}
                                >
                                    {getPassiveIcon(name)}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 1.2 TOP-RIGHT: KILL COUNTER */}
                    <div className={`flex flex-col items-center transition-opacity duration-500 ${isBossIntro ? 'opacity-0' : 'opacity-100'}`}>
                        <span className="text-7xl font-thin text-white font-mono hud-kill-text drop-shadow-[0_0_15px_rgba(255,255,255,0.2)] leading-none">
                            {kills}
                        </span>
                        <span className="text-sm font-bold text-[#ff3333] tracking-[0.3em] uppercase opacity-80">
                            {t('ui.kills')}
                        </span>
                    </div>
                </div>

                {/* 2. CENTER-TOP: BOSS / WAVE BAR */}
                <div className="absolute top-32 left-1/2 -translate-x-1/2 w-[600px] flex flex-col items-center">
                    {isBossActive ? (
                        <div className="w-full flex flex-col items-center animate-fadeIn">
                            <h2 className="text-5xl font-light text-white tracking-widest uppercase mb-4 opacity-80 hud-text-glow">
                                {t(boss!.name)}
                            </h2>
                            {renderSegments(boss!.hp, boss!.maxHp)}
                        </div>
                    ) : sectorStats?.zombieWaveActive ? (
                        <div className="w-full flex flex-col items-center animate-fadeIn">
                            <h2 className="text-4xl font-semibold text-[#ff3333] italic tracking-tighter uppercase mb-2 hud-text-glow">
                                {t('zombie_wave')}
                            </h2>
                            {renderSegments(1, 1, 'active')}
                        </div>
                    ) : null}
                </div>

                {/* 3. BOTTOMBAR: ACTIONBAR */}
                <div className={`absolute bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center transition-opacity duration-500 ${isBossIntro ? 'opacity-0' : 'opacity-100'}`}>

                    {!isDriving && wep && wep.category !== 'THROWABLE' && activeWeapon !== WeaponType.RADIO && (
                        <div className="mb-4 text-center animate-fadeIn">
                            <span className="text-4xl font-bold text-white tracking-tighter font-mono">
                                {sectorStats?.unlimitedAmmo ? '∞' : ammo}
                            </span>
                            <span className="text-xl font-bold text-white/30 ml-1 font-mono">/ {magSize}</span>
                        </div>
                    )}

                    {/* Slots */}
                    {isDriving ? (
                        <div className="flex flex-col items-center pt-8">
                            <div className="hud-bar-container px-12 py-4 shadow-2xl">
                                <span className="text-6xl font-semibold text-white tracking-tighter block hud-text-glow">
                                    {speedKmH}
                                </span>
                                <span className="text-[10px] font-medium text-white/40 uppercase tracking-[0.3em] block text-center mt-1">KM/H</span>
                            </div>
                            <div className="flex gap-4 mt-6">
                                <div className={`px-6 py-2 border border-white/10 transition-all ${throttleState > 0 ? 'bg-[#06b6d4]/20 border-[#06b6d4] text-cyan-200' : 'bg-black/80 text-white/20'}`}>
                                    <span className="text-xs font-black uppercase tracking-widest">{t('ui.gas')}</span>
                                </div>
                                <div className={`px-6 py-2 border border-white/10 transition-all ${throttleState < 0 ? 'bg-[#ff3333]/20 border-[#ff3333] text-red-200' : 'bg-black/80 text-white/20'}`}>
                                    <span className="text-xs font-black uppercase tracking-widest">{t('ui.brake')}</span>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex gap-3 pointer-events-auto">
                            {weaponSlots.map(({ slot, type }) => {
                                const wData = WEAPONS[type];
                                if (!wData) return <div key={slot} className="w-24 h-24 border-2 border-zinc-800 bg-black/50"></div>;

                                const isActive = activeWeapon === type;
                                const isThrowable = wData.category === 'THROWABLE';
                                const isRadio = type === WeaponType.RADIO;

                                let isDisabled = false;
                                let signalText = null;
                                let countDisplay = null;

                                if (isThrowable) {
                                    if (throwableAmmo !== undefined && throwableAmmo <= 0) isDisabled = true;
                                    const stackMax = wData.magSize || 0;
                                    const stackCurrent = throwableAmmo || 0;

                                    if (sectorStats?.unlimitedThrowables) {
                                        countDisplay = (
                                            <div className="absolute bottom-1 w-full text-center">
                                                <span className="text-2xl font-black text-white drop-shadow-[0_0_5px_rgba(255,255,255,0.5)]">∞</span>
                                            </div>
                                        );
                                    } else {
                                        countDisplay = (
                                            <div className="absolute bottom-0 left-0 w-full flex justify-center gap-0.5 px-1 pb-0.5">
                                                {getCachedArray(stackMax).map((i) => (
                                                    <div key={i}
                                                        className={`h-1.5 flex-1 ${i < stackCurrent ? 'shadow-sm' : 'bg-zinc-800 border border-zinc-700'}`}
                                                        style={{
                                                            backgroundColor: i < stackCurrent ? WeaponCategoryColors.THROWABLE : undefined,
                                                            boxShadow: i < stackCurrent ? `0 0 5px ${WeaponCategoryColors.THROWABLE}` : undefined
                                                        }}
                                                    />
                                                ))}
                                            </div>
                                        );
                                    }
                                }

                                if (isRadio && familyFound) {
                                    isDisabled = true;
                                    signalText = t('ui.located');
                                }

                                const borderColor = isActive ? (WeaponCategoryColors[wData.category as keyof typeof WeaponCategoryColors] || 'white') : 'rgba(255,255,255,0.1)';

                                return (
                                    <div
                                        key={slot}
                                        className={`hud-slot w-20 h-20 flex flex-col items-center justify-center relative border-2 transition-all overflow-hidden ${isActive ? 'scale-105 z-10 bg-zinc-950/80 shadow-[0_0_20px_rgba(0,0,0,0.5)]' : 'opacity-40 bg-black/40'} ${isDisabled ? 'grayscale' : ''}`}
                                        style={{ borderColor }}
                                    >
                                        {isActive && isReloading && (
                                            <div
                                                className="absolute bottom-0 left-0 w-full bg-white opacity-20 transition-all duration-100"
                                                style={{
                                                    height: `${reloadProgress * 100}%`,
                                                    backgroundColor: WeaponCategoryColors[wData.category as keyof typeof WeaponCategoryColors] || 'white'
                                                }}
                                            />
                                        )}

                                        <div className="w-10 h-10 flex items-center justify-center mb-1 relative z-10"
                                            style={{
                                                filter: isActive ? 'drop-shadow(0_0_2px_rgba(255,255,255,0.8))' : 'opacity(0.5)'
                                            }}
                                        >
                                            {wData.iconIsPng ? (
                                                <img src={wData.icon} alt="" className="w-full h-full object-contain filter brightness-0 invert" />
                                            ) : (
                                                <div className="w-full h-full text-white" dangerouslySetInnerHTML={{ __html: wData.icon }} />
                                            )}
                                        </div>

                                        <span className="absolute bottom-1 right-2 text-[10px] font-mono font-bold text-white/20 z-10">{slot}</span>

                                        <div className="w-full absolute bottom-0">{countDisplay}</div>
                                        {isRadio && signalText && <span className="absolute bottom-1 w-full text-center text-[9px] font-black uppercase text-blue-300">{signalText}</span>}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Status Effects (Bottom Left) — Passives → Buffs → Debuffs, always left-anchored */}
                <div className="absolute bottom-8 left-8 flex flex-col gap-3">
                    <div className="flex gap-2 mb-1">
                        {/* Passives (purple, no pulse — permanent) */}
                        {activePassives.map((type: string, i: number) => (
                            <div
                                key={`passive-${i}`}
                                className="w-8 h-8 flex items-center justify-center bg-black/80 border-2 border-purple-500 rounded-sm shadow-[0_0_8px_rgba(168,85,247,0.4)] pointer-events-auto cursor-help"
                                data-tooltip={t(`attacks.${type}.title`)}
                                onMouseEnter={handleMouseEnter}
                                onMouseLeave={handleMouseLeave}
                            >
                                <span className="text-sm">{getStatusIcon(type)}</span>
                            </div>
                        ))}
                        {/* Buffs (green) */}
                        {activeBuffs.map((type: string, i: number) => (
                            <div
                                key={`buff-${i}`}
                                className="w-8 h-8 flex items-center justify-center bg-black/80 border-2 border-green-500 rounded-sm shadow-[0_0_8px_rgba(34,197,94,0.4)] animate-pulse pointer-events-auto cursor-help"
                                data-tooltip={t(`attacks.${type}.title`)}
                                onMouseEnter={handleMouseEnter}
                                onMouseLeave={handleMouseLeave}
                            >
                                <span className="text-sm">{getStatusIcon(type)}</span>
                            </div>
                        ))}
                        {/* Debuffs (red) */}
                        {activeDebuffs.map((type: string, i: number) => (
                            <div
                                key={`debuff-${i}`}
                                className="w-8 h-8 flex items-center justify-center bg-black/80 border-2 border-red-500 rounded-sm shadow-[0_0_8px_rgba(239,68,68,0.4)] animate-pulse pointer-events-auto cursor-help"
                                data-tooltip={t(`attacks.${type}.title`)}
                                onMouseEnter={handleMouseEnter}
                                onMouseLeave={handleMouseLeave}
                            >
                                <span className="text-sm">{getStatusIcon(type)}</span>
                            </div>
                        ))}
                    </div>

                    {/* Detailed timers for active Debuffs */}
                    {statusEffects.map((eff: any, i: number) => (
                        <div
                            key={`timer-${i}`}
                            className="px-3 py-1 bg-black/60 border-l-2 border-red-500/50 flex items-center gap-2 animate-fadeIn max-w-[120px] pointer-events-auto cursor-help"
                            data-tooltip={t(`attacks.${eff.type}.title`)}
                            onMouseEnter={handleMouseEnter}
                            onMouseLeave={handleMouseLeave}
                        >
                            <span className="text-[9px] font-black text-red-500 uppercase tracking-tighter">
                                {eff.type.substring(0, 4)}
                            </span>
                            <div className="h-1 flex-1 bg-red-900/30 relative">
                                <div className="h-full bg-red-500" style={{ width: `${Math.min(100, (eff.duration / 5000) * 100)}%` }} />
                            </div>
                        </div>
                    ))}
                </div>


                {/* Tooltip Popup */}
                {tooltipContent && (
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[1000] px-8 py-4 bg-zinc-950/90 border-2 border-white/20 backdrop-blur-3xl rounded-full shadow-[0_0_50px_rgba(0,0,0,0.8)] animate-in fade-in zoom-in duration-300">
                        <span className="text-white font-bold uppercase tracking-widest text-lg whitespace-nowrap">
                            {tooltipContent}
                        </span>
                    </div>
                )}

                <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
            </div>
        </>
    );
});

export default GameHUD;