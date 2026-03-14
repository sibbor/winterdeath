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
    debugMode?: boolean;
    isBossIntro?: boolean;
    isDriving?: boolean;
    vehicleSpeed?: number;
    throttleState?: number;
    sectorStats?: any;
    debugInfo?: any;
    onTogglePause?: () => void;
    onToggleMap?: () => void;
    onSelectWeapon?: (slot: string) => void;
    onRotateCamera?: (dir: number) => void;
    statusEffects?: Array<{ type: string, duration: number, intensity: number }>;
    isDisoriented?: boolean;
}

const MobileGameHUD: React.FC<MobileGameHUDProps> = React.memo(({
    hp, maxHp, stamina, maxStamina, ammo, magSize, activeWeapon, isReloading, score, scrap = 0, multiplier, loadout, boss,
    throwableReadyTime = 0, throwableAmmo = 3, kills = 0, bossSpawned = false, bossDefeated = false,
    familyDistance = null, familySignal = 0, familyFound = false, level = 1, currentXp = 0, nextLevelXp = 100,
    reloadProgress = 0, skillPoints = 0, weaponLevels, playerPos, distanceTraveled = 0, isDead = false, debugMode = false, isBossIntro = false,
    isDriving = false, vehicleSpeed = 0, throttleState = 0,
    sectorStats,
    debugInfo, onTogglePause, onToggleMap, onSelectWeapon, onRotateCamera,
    statusEffects = [], isDisoriented = false
}) => {
    const hpP = Math.max(0, (hp / maxHp) * 100);
    const stP = Math.max(0, (stamina / maxStamina) * 100);
    const xpP = Math.min(100, Math.max(0, (currentXp / nextLevelXp) * 100));
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


    const isBossActive = boss && boss.active && !bossDefeated;
    const wep = WEAPONS[activeWeapon];

    const renderSegments = (current: number, max: number, colorClass: string = 'active') => {
        const totalSegments = 10;
        const activeSegments = Math.ceil((current / max) * totalSegments);
        return (
            <div className="flex gap-1 w-full max-w-[200px]">
                {Array.from({ length: totalSegments }).map((_, i) => (
                    <div 
                        key={i} 
                        className={`h-1.5 flex-1 border border-white/10 transition-all ${i < activeSegments ? 'bg-[#fb923c] shadow-[0_0_5px_#fb923c]' : 'bg-white/5'}`}
                    />
                ))}
            </div>
        );
    };

    return (
        <div className={`absolute inset-0 pointer-events-none transition-all duration-500 ease-in ${isDead || isDisoriented ? 'opacity-0 scale-110 blur-[5px]' : 'opacity-100 scale-100 blur-0'}`}>
            
            {/* Top Row */}
            <div className="absolute top-4 left-4 right-4 flex justify-between items-start">
                
                {/* Top Left: Bars */}
                <div className={`flex flex-col gap-1 w-40 transition-opacity duration-500 ${isBossIntro ? 'opacity-0' : 'opacity-100'}`}>
                    <div className="hud-bar-container h-5 w-full">
                        <div className="h-full bg-red-900/20 relative">
                            <div className="h-full bg-[#ff3333] hud-bar-glow" style={{ width: `${hpP}%` }} />
                            <div className="absolute inset-0 flex items-center justify-start px-2">
                                <span className="text-[10px] text-white font-mono font-bold tracking-tighter">
                                    {Math.ceil(hp)} / {maxHp}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="hud-bar-container h-2 w-full">
                        <div className="h-full bg-purple-900/20 relative">
                            <div className="h-full bg-[#a855f7] hud-bar-glow" style={{ width: `${stP}%` }} />
                        </div>
                    </div>
                    <div className="hud-bar-container h-1.5 w-full">
                        <div className="h-full bg-cyan-900/20 relative">
                            <div className="h-full bg-[#06b6d4] hud-bar-glow" style={{ width: `${xpP}%` }} />
                        </div>
                    </div>
                </div>

                {/* Top Right: Kills */}
                <div className={`flex flex-col items-center transition-opacity duration-500 ${isBossIntro ? 'opacity-0' : 'opacity-100'}`}>
                    <span className="text-3xl font-bold text-white font-mono leading-none">
                        {kills}
                    </span>
                    <span className="text-[9px] font-bold text-[#ff3333] tracking-[0.2em] uppercase opacity-80">
                        {t('ui.kills')}
                    </span>
                </div>
            </div>

            {/* Boss / Wave Bar Center Top */}
            <div className="absolute top-20 left-1/2 -translate-x-1/2 flex flex-col items-center w-full px-12">
                {isBossActive ? (
                    <div className="w-full flex flex-col items-center">
                        <h2 className="text-xs font-bold text-white tracking-widest uppercase mb-2 opacity-60">{t(boss!.name)}</h2>
                        {renderSegments(boss!.hp, boss!.maxHp)}
                    </div>
                ) : sectorStats?.zombieWaveActive ? (
                    <div className="w-full flex flex-col items-center">
                        <h2 className="text-xs font-semibold text-[#ff3333] tracking-tighter uppercase mb-1">{t('zombie_wave')}</h2>
                        {renderSegments(
                            sectorStats.zombiesKilled || 0, 
                            sectorStats.zombiesKillTarget || sectorStats.hordeTarget || 1
                        )}
                    </div>
                ) : null}
            </div>

            {/* Bottom Centered Action Bar */}
            <div className={`absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center transition-opacity duration-500 ${isBossIntro ? 'opacity-0' : 'opacity-100'}`}>
                
                {/* Ammo Display */}
                {!isDriving && wep && wep.category !== 'THROWABLE' && activeWeapon !== WeaponType.RADIO && (
                    <div className="mb-2 flex items-baseline font-mono">
                         <span className="text-2xl font-bold text-white leading-none">{sectorStats?.unlimitedAmmo ? '∞' : ammo}</span>
                         <span className="text-[10px] font-bold text-white/30 ml-1">/{magSize}</span>
                    </div>
                )}

                <div className="flex gap-1.5 pointer-events-auto">
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
                            <button 
                                key={slot}
                                onClick={() => onSelectWeapon && onSelectWeapon(slot)}
                                onTouchStart={(e) => { e.stopPropagation(); onSelectWeapon && onSelectWeapon(slot); }}
                                className={`hud-slot w-10 h-10 flex items-center justify-center relative border transition-all overflow-hidden ${isActive ? 'bg-zinc-950/80' : 'opacity-40 bg-black/40'}`}
                                style={{ borderColor: isActive ? (wData?.color || 'white') : 'rgba(255,255,255,0.1)' }}
                            >
                                {/* Reload Progress Overlay */}
                                {isActive && isReloading && (
                                    <div 
                                        className="absolute bottom-0 left-0 w-full bg-white opacity-20 transition-all duration-100"
                                        style={{ 
                                            height: `${reloadProgress * 100}%`,
                                            backgroundColor: wData?.color || 'white'
                                        }}
                                    />
                                )}

                                {wData && (
                                    <div className="w-6 h-6 flex items-center justify-center relative z-10">
                                        {wData.iconIsPng ? (
                                            <img src={wData.icon} alt="" className="w-full h-full object-contain filter brightness-0 invert" />
                                        ) : (
                                            <div className="w-full h-full text-white" dangerouslySetInnerHTML={{ __html: wData.icon }} />
                                        )}
                                    </div>
                                )}
                                {wData?.category === 'THROWABLE' && (
                                    <div className="absolute bottom-0.5 left-0.5 right-0.5 flex justify-center gap-0.5 z-10">
                                        {Array.from({ length: wData.magSize }).map((_, i) => (
                                            <div key={i} className={`h-0.5 flex-1 ${i < (throwableAmmo || 0) ? 'shadow-[0_0_2px_currentColor]' : 'bg-white/10'}`} style={{ backgroundColor: i < (throwableAmmo || 0) ? wData.color : undefined, color: wData.color }} />
                                        ))}
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Driving HUD */}
            {isDriving && (
                <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex flex-col items-center">
                    <div className="hud-bar-container px-6 py-2">
                         <span className="text-3xl font-semibold text-white">{speedKmH}</span>
                         <span className="text-[8px] font-medium text-white/40 block text-center uppercase">KM/H</span>
                    </div>
                </div>
            )}
        </div>
    );
});

export default MobileGameHUD;