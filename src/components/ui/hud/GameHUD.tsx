import React, { useEffect, useState, useRef } from 'react';
import { WeaponType, WeaponCategoryColors } from '../../../content/weapons';
import { WEAPONS, RANKS } from '../../../content/constants';
import { t } from '../../../utils/i18n';

interface GameHUDProps {
    hp: number;
    maxHp: number;
    stamina: number;
    maxStamina: number;
    ammo: number;
    magSize: number;
    activeWeapon: WeaponType;
    isReloading: boolean;
    score: number;
    scrap: number;
    multiplier: number;
    loadout: { primary: WeaponType; secondary: WeaponType; throwable: WeaponType; special: WeaponType; };
    boss: { active: boolean, name: string, hp: number, maxHp: number } | null;
    throwableReadyTime?: number;
    throwableAmmo?: number;
    kills?: number;
    bossSpawned?: boolean;
    bossDefeated?: boolean;
    familyDistance?: number | null;
    familySignal?: number; // 0.0 to 1.0 (1.0 = strong)
    familyFound?: boolean;
    level?: number;
    currentXp?: number;
    nextLevelXp?: number;
    reloadProgress?: number;
    skillPoints?: number;
    weaponLevels?: Record<WeaponType, number>;
    playerPos?: { x: number, z: number };
    familyPos?: { x: number, z: number } | null;
    bossPos?: { x: number, z: number } | null;
    distanceTraveled?: number;
    isDead?: boolean; // New prop for death effect
    isBossIntro?: boolean;
    isDriving?: boolean;
    vehicleSpeed?: number;
    throttleState?: number;
    sectorStats?: any;
    debugMode?: boolean;
    fps?: number;
    debugInfo?: any;
    onTogglePause?: () => void;
    onToggleMap?: () => void;
    statusEffects?: Array<{ type: string, duration: number, intensity: number }>;
    isDisoriented?: boolean;
    activePassives?: string[]; // Names of family members
    activeBuffs?: string[];    // StatusEffectType enums
    activeDebuffs?: string[];  // StatusEffectType enums
}

const GameHUD: React.FC<GameHUDProps> = React.memo(({
    hp, maxHp, stamina, maxStamina, ammo, magSize, activeWeapon, isReloading, score, scrap = 0, multiplier, loadout, boss,
    throwableReadyTime = 0, throwableAmmo = 3, kills = 0, bossSpawned = false, bossDefeated = false,
    familyDistance = null, familySignal = 0, familyFound = false, level = 1, currentXp = 0, nextLevelXp = 100,
    reloadProgress = 0, skillPoints = 0, weaponLevels, playerPos, distanceTraveled = 0, isDead = false, isBossIntro = false,
    isDriving = false, vehicleSpeed = 0, throttleState = 0,
    sectorStats,
    fps = 0, debugInfo, onTogglePause, onToggleMap, debugMode = false,
    statusEffects = [], isDisoriented = false,
    activePassives = [], activeBuffs = [], activeDebuffs = []
}) => {
    const [tooltipContent, setTooltipContent] = useState<string | null>(null);
    const tooltipTimeout = useRef<any>(null);

    const showTooltip = (text: string) => {
        if (tooltipTimeout.current) clearTimeout(tooltipTimeout.current);
        setTooltipContent(text);
        tooltipTimeout.current = setTimeout(() => {
            setTooltipContent(null);
        }, 3000);
    };

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

    // New state for XP Gain
    const [xpGainAmount, setXpGainAmount] = useState(0);
    const [xpGained, setXpGained] = useState(false);

    const getRank = (lvl: number) => {
        const rankKey = Math.min(Math.max(0, lvl - 1), 19);
        const translated = t(`ranks.${rankKey}`);
        if (translated.startsWith('ranks.')) return RANKS[rankKey] || 'SURVIVOR';
        return translated;
    };
    const prevSkillPoints = useRef(skillPoints);
    const prevScrap = useRef(scrap);
    const prevDistanceTraveled = useRef(distanceTraveled);
    const hasMounted = useRef(false);

    useEffect(() => {
        hasMounted.current = true;
    }, []);

    const [spGainAmount, setSpGainAmount] = useState(0);
    const [scrapGainAmount, setScrapGainAmount] = useState(0);

    useEffect(() => {
        if (hp < prevHp.current) {
            setIsShaking(true);
            setTimeout(() => setIsShaking(false), 200);
        }
        prevHp.current = hp;
    }, [hp]);

    useEffect(() => {
        // Suppress on load (Distance jumped from 0 to > 20)
        const isLoad = prevDistanceTraveled.current < 5;

        if (level > prevLevel.current && (level - prevLevel.current === 1) && !isLoad) {
            setShowLevelUp(true);
            setTimeout(() => setShowLevelUp(false), 500);
        }
        prevLevel.current = level;
    }, [level, distanceTraveled]);

    useEffect(() => {
        const diff = (currentXp || 0) - (prevXp.current || 0);
        // Suppress on load or at spawn
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
        // Suppress on load or at spawn
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
        // Suppress on load or at spawn
        const isLoad = !hasMounted.current || distanceTraveled < 1.0;

        if (diff > 0 && !isLoad) {
            setScrapGainAmount(diff);
            setScrapGained(true);
            setTimeout(() => setScrapGained(false), 1000);
        }
        prevScrap.current = scrap;
    }, [scrap, distanceTraveled]);

    // Track distance for load detection (Must be last effect)
    useEffect(() => {
        prevDistanceTraveled.current = distanceTraveled;
    }, [distanceTraveled]);

    const renderSlot = (slot: string, weapon: WeaponType, isActive: boolean) => {
        const wData = WEAPONS[weapon];
        if (!wData) return <div key={slot} className="w-24 h-24 border-2 border-zinc-800 bg-black/50"></div>;

        const isThrowable = wData.category === 'THROWABLE';
        const isRadio = weapon === WeaponType.RADIO;
        let countDisplay = null;
        let isDisabled = false;
        let signalText = null;

        const borderColor = isActive ? WeaponCategoryColors[wData.category as keyof typeof WeaponCategoryColors] : '#27272a'; // zinc-800 fallback

        if (isThrowable) {
            if (throwableAmmo !== undefined && throwableAmmo <= 0) isDisabled = true;
            // Stack Graphics
            const stackMax = wData.magSize;
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
                        {Array.from({ length: stackMax }).map((_, i) => (
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

        if (isRadio) {
            if (familyFound) {
                isDisabled = true;
                signalText = t('ui.located');
            }
        }

        return (
            <div key={slot}
                className={`w-24 h-24 border-2 flex flex-col items-center justify-center relative transition-all overflow-hidden ${isActive ? 'bg-zinc-950 text-white shadow-lg z-10 scale-105' : 'bg-black/90 text-zinc-600'} ${isDisabled ? 'opacity-40 grayscale' : ''}`}
                style={{ borderColor: borderColor }}
            >
                <div className="w-12 h-12 flex items-center justify-center"
                    style={{
                        filter: isActive ? 'drop-shadow(0_0_2px_rgba(255,255,255,0.8))' : 'opacity(0.5)',
                        transform: isActive ? 'scale(1.1)' : 'scale(1.0)'
                    }}
                >
                    {wData.iconIsPng ? (
                        <img src={wData.icon} alt="" className="w-full h-full object-contain" />
                    ) : (
                        <div className="w-full h-full" dangerouslySetInnerHTML={{ __html: wData.icon }} />
                    )}
                </div>

                <span className="text-[9px] uppercase font-black text-center w-full px-1 tracking-wider mb-3 leading-none whitespace-normal">{t(wData.displayName)}</span>

                <span className="text-[10px] absolute top-0.5 left-1.5 font-bold text-zinc-500">{slot}</span>

                <div className="w-full">{countDisplay}</div>

                {isRadio && signalText && <span className={`absolute bottom-1 w-full text-center text-[9px] font-black uppercase text-blue-300`}>{signalText}</span>}
            </div>
        );
    };

    // Helper for segmented bar
    const renderSegments = (current: number, max: number, colorClass: string = 'active') => {
        const totalSegments = 12;
        const activeSegments = Math.ceil((current / max) * totalSegments);
        return (
            <div className="segmented-health-bar">
                {Array.from({ length: totalSegments }).map((_, i) => (
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
            case 'loke': return '⚡'; // Reload
            case 'jordan': return '🎯'; // Range
            case 'esmeralda': return '🔫'; // Fire Rate
            case 'nathalie': return '🛡️'; // Resist
            case 'sotis':
            case 'panter': return '🐱';
            default: return '👤';
        }
    };

    return (
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

                    {/* Passives (Family Boosts) - Small Circles under HP bars */}
                    <div className="flex gap-1.5 mt-1 ml-1">
                        {activePassives.map((name, i) => (
                            <div
                                key={i}
                                className="w-6 h-6 rounded-full border-2 border-green-500 bg-black/80 flex items-center justify-center text-[10px] shadow-[0_0_5px_rgba(34,197,94,0.3)] pointer-events-auto cursor-help"
                                onMouseEnter={() => showTooltip(t(`family.${name.toLowerCase()}`))}
                                onMouseLeave={() => setTooltipContent(null)}
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
                        {/* Wave progress placeholder segment style */}
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
                        {[
                            { slot: '1', type: loadout.primary },
                            { slot: '2', type: loadout.secondary },
                            { slot: '3', type: loadout.throwable },
                            { slot: '4', type: loadout.special },
                            { slot: '5', type: WeaponType.RADIO }
                        ].map(({ slot, type }) => {
                            const wData = WEAPONS[type];
                            const isActive = activeWeapon === type;
                            return (
                                <div
                                    key={slot}
                                    className={`hud-slot w-20 h-20 flex flex-col items-center justify-center relative border-2 transition-all overflow-hidden ${isActive ? 'scale-105 z-10 bg-zinc-950/80 shadow-[0_0_20px_rgba(0,0,0,0.5)]' : 'opacity-40 bg-black/40'}`}
                                    style={{ borderColor: isActive ? (WeaponCategoryColors[wData.category as keyof typeof WeaponCategoryColors] || 'white') : 'rgba(255,255,255,0.1)' }}
                                >
                                    {/* Reload Progress Overlay */}
                                    {isActive && isReloading && (
                                        <div
                                            className="absolute bottom-0 left-0 w-full bg-white opacity-20 transition-all duration-100"
                                            style={{
                                                height: `${reloadProgress * 100}%`,
                                                backgroundColor: WeaponCategoryColors[wData.category as keyof typeof WeaponCategoryColors] || 'white'
                                            }}
                                        />
                                    )}

                                    {/* Icon */}
                                    {wData && (
                                        <div className="w-10 h-10 flex items-center justify-center mb-1 relative z-10">
                                            {wData.iconIsPng ? (
                                                <img src={wData.icon} alt="" className="w-full h-full object-contain filter brightness-0 invert" />
                                            ) : (
                                                <div className="w-full h-full text-white" dangerouslySetInnerHTML={{ __html: wData.icon }} />
                                            )}
                                        </div>
                                    )}
                                    {/* Slot Number */}
                                    <span className="absolute bottom-1 right-2 text-[10px] font-mono font-bold text-white/20 z-10">{slot}</span>

                                    {/* Throwable ammo dots */}
                                    {wData?.category === 'THROWABLE' && (
                                        <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1 px-2 z-10">
                                            {Array.from({ length: wData.magSize }).map((_, i) => {
                                                const catColor = WeaponCategoryColors.THROWABLE;
                                                return (
                                                    <div key={i} className={`h-1 flex-1 ${i < (throwableAmmo || 0) ? 'shadow-[0_0_5px_currentColor]' : 'bg-white/10'}`} style={{ backgroundColor: i < (throwableAmmo || 0) ? catColor : undefined, color: catColor }} />
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Status Effects (Bottom Left) */}
            <div className="absolute bottom-8 left-8 flex flex-col gap-3">
                {/* Buffs and Debuffs Icons (Squares) */}
                <div className="flex gap-2 mb-1">
                    {/* Buffs: Green Borders */}
                    {activeBuffs.map((type, i) => (
                        <div
                            key={`buff-${i}`}
                            className="w-8 h-8 flex items-center justify-center bg-black/80 border-2 border-green-500 rounded-sm shadow-[0_0_8px_rgba(34,197,94,0.4)] animate-pulse pointer-events-auto cursor-help"
                            onMouseEnter={() => showTooltip(t(`attacks.${type}.title`))}
                            onMouseLeave={() => setTooltipContent(null)}
                        >
                            <span className="text-sm">{getStatusIcon(type)}</span>
                        </div>
                    ))}
                    {/* Debuffs: Red Borders */}
                    {activeDebuffs.map((type, i) => (
                        <div
                            key={`debuff-${i}`}
                            className="w-8 h-8 flex items-center justify-center bg-black/80 border-2 border-red-500 rounded-sm shadow-[0_0_8px_rgba(239,68,68,0.4)] animate-pulse pointer-events-auto cursor-help"
                            onMouseEnter={() => showTooltip(t(`attacks.${type}.title`))}
                            onMouseLeave={() => setTooltipContent(null)}
                        >
                            <span className="text-sm">{getStatusIcon(type)}</span>
                        </div>
                    ))}
                </div>

                {/* Detailed timers for Debuffs (Original style) */}
                {statusEffects.map((eff, i) => (
                    <div
                        key={`timer-${i}`}
                        className="px-3 py-1 bg-black/60 border-l-2 border-red-500/50 flex items-center gap-2 animate-fadeIn max-w-[120px] pointer-events-auto cursor-help"
                        onMouseEnter={() => showTooltip(t(`attacks.${eff.type}.title`))}
                        onMouseLeave={() => setTooltipContent(null)}
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
    );
});

export default GameHUD;