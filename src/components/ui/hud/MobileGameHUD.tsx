import React, { useEffect, useState, useRef } from 'react';
import { WeaponType } from '../../../content/weapons';
import { WEAPONS, RANKS } from '../../../content/constants';
import { t } from '../../../utils/i18n';

interface MobileGameHUDProps {
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
    loadout: { primary: WeaponType; secondary: WeaponType; throwable: WeaponType };
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
    debugMode?: boolean;
    isBossIntro?: boolean;
    debugInfo?: any;
    onTogglePause?: () => void;
    onToggleMap?: () => void;
    onSelectWeapon?: (slot: string) => void;
    onRotateCamera?: (dir: number) => void;
}

const MobileGameHUD: React.FC<MobileGameHUDProps> = React.memo(({
    hp, maxHp, stamina, maxStamina, ammo, magSize, activeWeapon, isReloading, score, scrap = 0, multiplier, loadout, boss,
    throwableReadyTime = 0, throwableAmmo = 3, kills = 0, bossSpawned = false, bossDefeated = false,
    familyDistance = null, familySignal = 0, familyFound = false, level = 1, currentXp = 0, nextLevelXp = 100,
    reloadProgress = 0, skillPoints = 0, weaponLevels, playerPos, distanceTraveled = 0, isDead = false, debugMode = false, isBossIntro = false,
    debugInfo, onTogglePause, onToggleMap, onSelectWeapon, onRotateCamera
}) => {
    const hpP = Math.max(0, (hp / maxHp) * 100);
    const stP = Math.max(0, (stamina / maxStamina) * 100);
    const xpP = Math.min(100, Math.max(0, (currentXp / nextLevelXp) * 100));

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
            setTimeout(() => setShowLevelUp(false), 1000); // Extended for animation
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
        if (!wData) return <div key={slot} className="w-12 h-12 border-2 border-zinc-800 bg-black/50 skew-x-[-10deg]"></div>;

        const isThrowable = wData.category === 'THROWABLE';
        const isRadio = weapon === WeaponType.RADIO;
        let countDisplay = null;
        let isDisabled = false;
        let signalText = null;

        const borderColor = isActive ? wData.color : '#27272a'; // zinc-800 fallback

        if (isThrowable) {
            if (throwableAmmo !== undefined && throwableAmmo <= 0) isDisabled = true;
            // Stack Graphics
            const stackMax = wData.magSize;
            const stackCurrent = throwableAmmo || 0;

            countDisplay = (
                <div className="absolute bottom-0 left-0 w-full flex justify-center gap-0.5 px-1 pb-0.5">
                    {Array.from({ length: stackMax }).map((_, i) => (
                        <div key={i}
                            className={`h-1.5 flex-1 skew-x-[10deg] ${i < stackCurrent ? 'shadow-sm' : 'bg-zinc-800 border border-zinc-700'}`}
                            style={{ backgroundColor: i < stackCurrent ? wData.color : undefined, boxShadow: i < stackCurrent ? `0 0 5px ${wData.color}` : undefined }}
                        />
                    ))}
                </div>
            );
        }

        if (isRadio) {
            if (familyFound) {
                isDisabled = true;
                signalText = t('ui.located');
            }
        }

        return (

            <button key={slot}
                onClick={(e) => { e.stopPropagation(); onSelectWeapon && onSelectWeapon(slot); }}
                onTouchStart={(e) => {
                    e.stopPropagation();
                    if (onSelectWeapon) onSelectWeapon(slot);
                }} /* Capture touch immediately on mobile */
                className={`w-12 h-12 border-2 flex flex-col items-center justify-center relative transition-all overflow-hidden skew-x-[-10deg] pointer-events-auto ${isActive ? 'bg-zinc-950 text-white shadow-lg z-10 scale-105' : 'bg-black/90 text-zinc-600'} ${isDisabled ? 'opacity-40 grayscale' : ''} active:scale-95`}
                style={{ borderColor: borderColor }}
            >
                <div className="w-6 h-6 skew-x-[10deg]" dangerouslySetInnerHTML={{ __html: wData.icon }}
                    style={{
                        filter: isActive ? 'drop-shadow(0 0 2px rgba(255,255,255,0.8))' : 'opacity(0.5)',
                        transform: isActive ? 'scale(1.1)' : 'scale(1.0)'
                    }}
                />

                <span className="hidden text-[9px] uppercase font-black text-center w-full px-1 skew-x-[10deg] tracking-wider mb-3 leading-none whitespace-normal">{t(wData.displayName)}</span>

                <span className="text-[8px] absolute top-0.5 left-1.5 font-bold skew-x-[10deg] text-zinc-500">{slot}</span>

                <div className="skew-x-[10deg] w-full">{countDisplay}</div>

                {isRadio && signalText && <span className={`absolute bottom-1 w-full text-center text-[9px] font-black uppercase text-blue-300 skew-x-[10deg]`}>{signalText}</span>}
            </button>
        );
    };

    const isBossActive = boss && boss.active && !bossDefeated;
    const currentWeaponLevel = (weaponLevels && activeWeapon && weaponLevels[activeWeapon]) ? weaponLevels[activeWeapon] : 1;
    const wep = WEAPONS[activeWeapon];
    const isThrowableActive = wep && wep.category === 'THROWABLE';
    const isRadioActive = activeWeapon === WeaponType.RADIO;

    return (
        <div className={`absolute inset-0 pointer-events-none transition-all duration-1000 ease-in ${isDead ? 'opacity-0 scale-110 blur-[2px] rotate-1 translate-y-8' : 'opacity-100 scale-100 blur-0 rotate-0 translate-y-0'}`}>
            {/* Top Gradient Background (Behind UI) */}
            <div className="fixed top-0 left-0 w-full h-32 pointer-events-none z-0"
                style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 30%, rgba(0,0,0,0) 100%)' }}>
            </div>

            {/* Bottom Gradient Background (Behind UI) */}
            <div className="fixed bottom-0 left-0 w-full h-32 pointer-events-none z-0"
                style={{ background: 'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 30%, rgba(0,0,0,0) 100%)' }}>
            </div>

            <div className={`absolute inset-0 pointer-events-none p-4 flex flex-col justify-between font-sans z-[80]`}>

                {/* Top Header */}
                <div className="flex justify-between items-start">
                    {/* Ranking & Resource Group (Top Left) */}
                    <div className={`flex flex-col gap-2 items-start transition-opacity duration-500 ${isBossIntro ? 'opacity-0' : 'opacity-100'}`}>
                        {/* Rank Box (Matches CampHUD) */}
                        <div className={`bg-slate-900/95 p-2 border-l-4 border-blue-500 shadow-2xl w-[200px] backdrop-blur-sm relative group`}>
                            {/* Rank Title Animation */}
                            <div className="relative overflow-hidden">
                                {showLevelUp ? (
                                    <h1 className="text-xl font-black text-white tracking-tighter leading-none uppercase animate-[revealRight_1s_ease-out_forwards]" style={{ fontWeight: 900 }}>
                                        {getRank(level)}
                                    </h1>
                                ) : (
                                    <h1 className="text-xl font-black text-white tracking-tighter leading-none uppercase" style={{ fontWeight: 900 }}>
                                        {getRank(level)}
                                    </h1>
                                )}
                            </div>

                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-blue-400 font-bold text-[10px] tracking-widest">{t('ui.lvl')} {level}</span>
                                <div className="flex-1 h-1 bg-blue-900/40">
                                    <div className="h-full bg-blue-400 transition-all duration-500" style={{ width: `${xpP}%` }} />
                                    {/* Large XP Gain Indicator */}
                                    {xpGained && (
                                        <div className="absolute top-0 right-0 h-full flex items-center justify-end pr-2 overflow-visible">
                                            <span className="text-[8px] font-black text-blue-300 animate-[ping_0.5s_cubic-bezier(0,0,0.2,1)] absolute right-0">+{xpGainAmount} XP</span>
                                            <span className="text-[8px] font-black text-white drop-shadow-[0_0_5px_rgba(59,130,246,1)] animate-pulse relative z-10">+{xpGainAmount} XP</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Mobile HP/Stamina - Nested inside Rank Box for compact layout */}
                            <div className="mt-2 w-full flex flex-col gap-1">
                                {/* HP Bar */}
                                <div className="relative w-full h-3 bg-red-950/60 z-10 border border-red-900/30">
                                    <div className="h-full bg-red-700 transition-all duration-200 ease-out" style={{ width: `${hpP}%` }} />
                                </div>
                                {/* Stamina Bar */}
                                <div className="relative w-full h-2 bg-emerald-950/60 z-10 border border-emerald-900/30 -mt-0.5">
                                    <div className="h-full bg-emerald-600 transition-all duration-200 ease-out" style={{ width: `${stP}%` }} />
                                </div>
                            </div>

                            {/* Level Up Notification Overlay */}
                            {showLevelUp && (
                                <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none bg-black/60 backdrop-blur-[1px]">
                                    <span className="text-blue-400 text-xl font-black tracking-[0.2em] animate-[pulse_0.5s_ease-in-out_infinite] uppercase drop-shadow-[0_0_10px_rgba(59,130,246,0.8)] border-y-2 border-blue-500 py-1 bg-black/80 w-full text-center transform -skew-x-6">
                                        {t('ui.level_up')}
                                    </span>
                                </div>
                            )}
                        </div>

                        <div className="flex flex-row gap-4 items-start">
                            {/* Skill Points (Left, Narrow) - Animated */}
                            <div className={`relative transition-all duration-300 transform origin-left ${spGained ? 'animate-[resource-boom_0.5s_ease-out] z-10' : ''}`}>
                                <div className={`px-2 py-1 border backdrop-blur-sm transition-all duration-300 ${skillPoints > 0 || spGained ? 'bg-purple-900/20 border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.5)]' : 'bg-black/80 border-slate-700'}`}>
                                    <div className="flex flex-col">
                                        <div className="flex justify-between items-baseline gap-2 relative">
                                            <span className={`text-[8px] uppercase font-black block tracking-widest transition-colors ${skillPoints > 0 || spGained ? 'text-purple-500' : 'text-slate-500'}`}>{t('ui.sp')}</span>
                                        </div>
                                        <div className="relative">
                                            <span className={`text-base font-black transition-colors ${skillPoints > 0 || spGained ? 'text-purple-400' : 'text-white'}`}>{skillPoints}</span>
                                            {spGained && (
                                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                                    <span className="text-xl font-black text-white drop-shadow-[0_0_10px_rgba(168,85,247,1)] animate-[pop_0.4s_ease-out] z-20 absolute">+{spGainAmount}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Scrap (Right) - Animated on gain */}
                            <div className={`transition-all duration-200 transform origin-left ${scrapGained ? 'animate-[resource-boom_0.5s_ease-out] z-10' : ''}`}>
                                <div className={`px-2 py-1 border backdrop-blur-sm transition-all duration-300 ${scrap > 0 || scrapGained ? 'bg-yellow-900/20 border-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.5)]' : 'bg-black/80 border-slate-700'}`}>
                                    <div className="flex flex-col">
                                        <div className="flex justify-between items-baseline gap-2 relative">
                                            <span className={`text-[8px] uppercase font-black block tracking-widest ${scrap > 0 || scrapGained ? 'text-yellow-500' : 'text-slate-500'}`}>{t('ui.scrap')}</span>
                                        </div>
                                        <div className="relative">
                                            <span className={`text-base font-black ${scrap > 0 || scrapGained ? 'text-yellow-400' : 'text-white'}`}>{scrap}</span>
                                            {scrapGained && (
                                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                                    <span className="text-xl font-black text-white drop-shadow-[0_0_10px_rgba(234,179,8,1)] animate-[pop_0.4s_ease-out] z-20 absolute">+{scrapGainAmount}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Boss Bar or Kill Tracker */}
                    {isBossActive ? (
                        <div className={`absolute top-4 left-1/2 -translate-x-1/2 w-[300px] text-center`}>
                            <h3 className="text-white font-black text-sm uppercase tracking-tighter drop-shadow-lg mb-1">{t(boss!.name)}</h3>
                            <div className="h-2 bg-black/90 border border-red-900 overflow-hidden shadow-2xl skew-x-[-10deg]">
                                <div className="h-full bg-red-700 transition-all duration-300" style={{ width: `${(boss!.hp / boss!.maxHp) * 100}%` }} />
                            </div>
                        </div>
                    ) : (
                        <div className={`absolute top-4 right-4 bg-black/90 border border-red-900/50 px-4 py-1 skew-x-[-10deg] transition-opacity duration-500 ${isBossIntro ? 'opacity-0' : 'opacity-100'} flex flex-col items-end`}>
                            <span className="text-red-700 font-black text-sm tracking-[0.2em] block skew-x-[10deg] uppercase">
                                {kills} {t('ui.kills')}
                            </span>


                        </div>
                    )}

                    {/* Top Right Actions (Boss Mode only) - Kept existing */}
                    {isBossActive && !isBossIntro && (
                        <div className="absolute top-4 right-4 flex gap-2 pointer-events-auto">
                            <button onClick={onToggleMap} className="w-10 h-10 bg-zinc-900/80 border border-zinc-700 text-white flex items-center justify-center skew-x-[-10deg] active:bg-zinc-800">
                                <span className="skew-x-[10deg] text-[8px] font-black uppercase">MAP</span>
                            </button>
                            <button onClick={onTogglePause} className="w-10 h-10 bg-zinc-900/80 border border-zinc-700 text-white flex items-center justify-center skew-x-[-10deg] active:bg-zinc-800">
                                <span className="skew-x-[10deg] text-[8px] font-black uppercase">||</span>
                            </button>
                        </div>
                    )}

                    {/* Camera Rotation Controls (Only Visible in Debug Mode) */}
                    {debugMode && !isBossIntro && (
                        <div className="absolute top-20 right-4 flex translate-y-10 gap-2 pointer-events-auto">
                            <button onClick={() => onRotateCamera && onRotateCamera(1)} className="w-10 h-10 rounded-full bg-zinc-900/60 border border-zinc-500 text-white flex items-center justify-center active:bg-zinc-700 backdrop-blur-sm shadow-lg">
                                <span className="text-lg font-black">↺</span>
                            </button>
                            <button onClick={() => onRotateCamera && onRotateCamera(-1)} className="w-10 h-10 rounded-full bg-zinc-900/60 border border-zinc-500 text-white flex items-center justify-center active:bg-zinc-700 backdrop-blur-sm shadow-lg">
                                <span className="text-lg font-black">↻</span>
                            </button>
                        </div>
                    )}
                </div>

                {/* Bottom Interface */}
                <div className={`flex justify-between items-end relative w-full transition-opacity duration-500 ${isBossIntro ? 'opacity-0' : 'opacity-100'}`}>

                    {/* Placeholder for Bottom-Left Action (Empty on Mobile for symmetry) */}
                    <div className="w-4"></div>

                    {/* Centered Action Bar (Weapons) -- MOVED TO BOTTOM LEFT FOR MOBILE */}
                    <div className={`absolute bottom-0 left-4 transform`}>
                        <div className={`gap-2 flex items-end pb-2 pointer-events-auto`}>
                            {/* Clickable for mobile weapon switching */}
                            {renderSlot('1', loadout.primary, activeWeapon === loadout.primary)}
                            {renderSlot('2', loadout.secondary, activeWeapon === loadout.secondary)}
                            {renderSlot('3', loadout.throwable, activeWeapon === loadout.throwable)}
                            {renderSlot('4', WeaponType.RADIO, activeWeapon === WeaponType.RADIO)}
                        </div>
                    </div>

                    {/* Right Weapon Details */}
                    <div className={`flex flex-col items-end gap-2 mb-2 justify-end right-4 absolute bottom-0`}>
                        {wep && (
                            <>
                                {/* Weapon Name & Level (or Signal Strength for Radio) */}
                                <div className="flex flex-col items-end mb-1">
                                    <h2 className={`text-sm font-black uppercase tracking-widest italic drop-shadow-md text-right leading-none ${isRadioActive ? 'text-white' : 'text-zinc-200'}`}>
                                        {isRadioActive ? t('weapons.radio') : t(wep.displayName)}
                                    </h2>
                                    {!isRadioActive ? (
                                        <div className="text-[8px] font-bold text-zinc-500 bg-black/90 px-1 py-0.5 border-b-2 border-zinc-800 uppercase tracking-[0.2em] mt-1">
                                            {t('ui.level')} {currentWeaponLevel}
                                        </div>
                                    ) : (
                                        /* Radio Signal Label */
                                        <div className="text-[8px] font-bold text-zinc-500 bg-black/90 px-1 py-0.5 border-b-2 border-zinc-800 uppercase tracking-[0.2em] mt-1">
                                            {t('ui.signal_strength')}
                                        </div>
                                    )}
                                </div>

                                {/* Status Box (Ammo or Radio) */}
                                <div className={`relative bg-zinc-950 border-2 p-2 min-w-[80px] h-10 flex items-center justify-center shadow-2xl overflow-hidden skew-x-[-10deg]`}
                                    style={{ borderColor: wep.color }}>

                                    {/* Reloading Fill - Behind Content */}
                                    {isReloading && (
                                        <div className="absolute inset-0 z-0 pointer-events-none">
                                            <div className="w-full h-full origin-bottom transition-transform duration-100 ease-linear"
                                                style={{
                                                    transform: `scaleY(${reloadProgress})`,
                                                    backgroundColor: wep.color,
                                                    opacity: 0.5
                                                }}>
                                            </div>
                                        </div>
                                    )}

                                    {/* Content (Ammo or Radio) */}
                                    <div className="skew-x-[10deg] w-full text-center relative z-10">
                                        {isRadioActive ? (
                                            familyFound ? (
                                                <div className="flex flex-col items-center leading-none">
                                                    <span className={`text-blue-300 font-black uppercase tracking-widest text-[8px] animate-pulse`}>{isBossActive ? t('ui.defeat_boss') : t('ui.target_located')}</span>
                                                    {isBossActive && <span className={`text-[6px] text-red-500 font-bold uppercase tracking-[0.2em] mt-1`}>{t('ui.protect_family')}</span>}
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-center justify-center">
                                                    {/* Signal Strength Value Only */}
                                                    {familySignal > 0.05 ? (
                                                        <span className={`text-base font-black text-white tracking-wider`}>{Math.floor(familySignal * 100)}%</span>
                                                    ) : (
                                                        <span className={`text-[10px] font-bold text-blue-500/50 animate-pulse tracking-widest`}>{t('ui.scanning')}</span>
                                                    )}
                                                </div>
                                            )
                                        ) : (
                                            <div className="flex items-baseline justify-center">
                                                <span className={`text-2xl font-black text-white tracking-tighter leading-none`}>
                                                    {ammo}
                                                </span>
                                                {!isThrowableActive && (
                                                    <span className={`text-sm font-bold text-zinc-600 ml-1`}>
                                                        /{magSize}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
});

export default MobileGameHUD;
