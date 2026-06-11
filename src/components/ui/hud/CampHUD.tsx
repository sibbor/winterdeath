import React, { useMemo } from 'react';
import { CareerStats } from '../../../types/CareerStats';
import { t } from '../../../utils/i18n';
import { UISounds } from '../../../utils/audio/AudioLib';
import { DiscoveryType } from '../hud/HudTypes';
import { StatsBridge } from '../../../core/data/StatsBridge';
import { FormatUtils } from '../../../utils/ui/FormatUtils';

interface CampHUDProps {
    stats: CareerStats;
    hoveredStation: string | null;
    currentSectorName: string;
    hasCheckpoint: boolean;
    isIdle: boolean;
    currentLoadoutNames: { pri: string, sec: string, thr: string };

    onOpenStats: () => void;
    onOpenArmory: () => void;
    onOpenSkills: () => void;
    onOpenAdventureLog: (tab?: DiscoveryType) => void;
    onOpenSettings: () => void;
    onStartSector: () => void;

    // Debug actions
    debugMode: boolean;
    onToggleDebug: (val: boolean) => void;
    onResetGame: () => void;
    onDebugScrap: () => void;
    onDebugSkill: () => void;
    onDebugCP: () => void;
    isMobileDevice?: boolean;
}

// PERFORMANCE FIX: A custom comparison function for React.memo.
// This prevents the HUD from re-rendering 60 times per second just because
// an obscure statistic (such as "time played") is updated in the stats object.
const areEqual = (prevProps: CampHUDProps, nextProps: CampHUDProps) => {
    // If UI state changes, we must re-render
    if (prevProps.isIdle !== nextProps.isIdle) return false;
    if (prevProps.isMobileDevice !== nextProps.isMobileDevice) return false;
    if (prevProps.currentSectorName !== nextProps.currentSectorName) return false;
    if (prevProps.hoveredStation !== nextProps.hoveredStation) return false;

    // PERFORMANCE FIX: Stats and DebugMode are now handled via useRef bypass.
    return prevProps.stats === nextProps.stats;
};

const CampHUD: React.FC<CampHUDProps> = React.memo(({
    stats, hoveredStation, currentSectorName, hasCheckpoint, isIdle, currentLoadoutNames,
    onOpenStats, onOpenArmory, onOpenSkills, onOpenAdventureLog, onOpenSettings, onStartSector,
    debugMode, onToggleDebug, onResetGame, onDebugScrap, onDebugSkill, onDebugCP, isMobileDevice
}) => {
    const spRef = React.useRef<HTMLSpanElement>(null);
    const scrapRef = React.useRef<HTMLSpanElement>(null);
    const cpRef = React.useRef<HTMLSpanElement>(null);
    const debugBtnRef = React.useRef<HTMLDivElement>(null);
    const debugTextRef = React.useRef<HTMLSpanElement>(null);
    const debugModeRef = React.useRef(debugMode);

    // Sync ref with prop for click handlers
    React.useEffect(() => { debugModeRef.current = debugMode; }, [debugMode]);

    // Direct DOM Injection (Phase 13)
    React.useEffect(() => {
        const unsubscribe = (window as any).HudStore?.subscribeFastUpdate((data: any) => {
            if (data.sp !== undefined && spRef.current) spRef.current.innerText = Math.floor(data.sp).toString();
            if (data.scrap !== undefined && scrapRef.current) scrapRef.current.innerText = Math.floor(data.scrap).toString();
            if (data.cp !== undefined && cpRef.current) cpRef.current.innerText = Math.floor(data.cp).toString();

            if (data.debugMode !== undefined) {
                debugModeRef.current = data.debugMode;
                if (debugBtnRef.current) {
                    debugBtnRef.current.classList.toggle('debug-active', data.debugMode);
                }
            }
        });
        return unsubscribe;
    }, []);

    // Sync initial state and prop changes
    React.useEffect(() => {
        if (spRef.current) spRef.current.innerText = StatsBridge.getSkillPoints(stats).toString();
        if (scrapRef.current) scrapRef.current.innerText = StatsBridge.getScrap(stats).toString();
        if (cpRef.current) cpRef.current.innerText = StatsBridge.getTotalChallengePoints(stats).toString();

        // Initial debug state sync
        if (debugBtnRef.current) {
            debugBtnRef.current.classList.toggle('debug-active', debugMode);
        }
    }, [stats, debugMode]);

    const uiFadeClass = `transition-opacity ${isIdle ? 'duration-[2000ms] opacity-0' : 'duration-300 opacity-100'}`;

    const getRank = (level: number) => {
        const rankKey = Math.min(Math.max(0, level - 1), 19);
        return t(`ranks.${rankKey}`);
    };

    const [isHovered, setIsHovered] = React.useState(false);

    const statsSummary = useMemo(() => {
        const time = StatsBridge.getTotalGameTime(stats);
        const kills = StatsBridge.getTotalKills(stats);

        return {
            kills: kills.toLocaleString(),
            time: FormatUtils.formatTimeSmart(time),
        };
    }, [stats]);

    return (
        <>
            {/* Top Left Stats / Buttons */}
            <div
                className={`absolute top-0 left-0 p-8 z-30 flex flex-col gap-4 pointer-events-none ${uiFadeClass} ${isMobileDevice ? 'camp-hud-mobile-scale' : ''}`}
            >
                {/* Level / Dossier (Player Card) */}
                <div
                    className={`bg-slate-900/95 p-4 border-l-4 border-blue-500 shadow-2xl cursor-pointer pointer-events-auto hover:bg-slate-800 transition-all duration-300 w-[320px] relative overflow-hidden group ${isHovered ? 'scale-[1.02] border-l-blue-400' : ''}`}
                    onClick={onOpenStats}
                    onMouseEnter={() => { setIsHovered(true); UISounds.playHover(); }}
                    onMouseLeave={() => setIsHovered(false)}
                >
                    {/* Shimmer Effect (Always visible, intensifies on hover) */}
                    <div className="absolute inset-0 pointer-events-none opacity-40 group-hover:opacity-100 transition-opacity duration-700 shimmer-overlay" />

                    <h1 className="text-4xl font-semibold text-white tracking-tighter leading-none uppercase relative z-10 font-mono" style={{ fontSize: '2.25rem' }}>
                        {getRank(StatsBridge.getLevel(stats))}
                    </h1>
                    <div className="flex items-center gap-4 mt-2 relative z-10">
                        <span className="text-blue-400 font-bold text-sm">{t('ui.lvl')} {StatsBridge.getLevel(stats)}</span>
                        <div className="flex-1 h-1.5 bg-blue-900">
                            <div className="h-full bg-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.5)]" style={{ width: `${(StatsBridge.getExperience(stats) / Math.max(1, StatsBridge.getNextLevelExperience(stats))) * 100}%` }} />
                        </div>
                    </div>

                    {/* Statistics - brief data */}
                    <div className="mt-3 pt-3 border-t border-blue-500/20 transition-all relative overflow-hidden bg-blue-500/5 backdrop-blur-sm rounded-md p-2">
                        {/* Shimmer overlay for premium look */}
                        <div className="absolute inset-0 pointer-events-none opacity-20 shimmer-overlay" />

                        <div className="flex flex-col gap-1 relative z-10">
                            <div className="flex items-center gap-2">
                                {/* Pulse Animation - Always visible now */}
                                <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shadow-[0_0_8px_rgba(96,165,250,0.8)]" />
                                <span className="text-[12px] font-black text-gray-400 uppercase tracking-widest">{t('ui.statistics')}</span>
                            </div>

                            <div className="flex font-mono items-center gap-2 text-[12px] uppercase tracking-tighter whitespace-nowrap overflow-hidden font-bold">
                                <span><span className="text-gray-400/60">{t('ui.kills')}:</span> <span className="ml-1 text-white">{statsSummary.kills}</span></span>
                                <span className="text-gray-500/40">|</span>
                                <span><span className="text-gray-400/60">{t('ui.time_played')}:</span> <span className="ml-1 text-white">{statsSummary.time}</span></span>
                            </div>
                        </div>
                    </div>

                </div>

                <div className="flex gap-4 pointer-events-auto">
                    {/* Skill Points */}
                    <div onClick={() => { if (debugMode) onDebugSkill(); else onOpenSkills(); }}
                        className={`w-20 h-20 aspect-square border-2 backdrop-blur-sm cursor-pointer transition-all hover:scale-110 flex flex-col items-center justify-center bg-purple-950/40 hover:bg-purple-900/60 border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.2)] relative overflow-hidden group`}>
                        <div className="absolute inset-0 pointer-events-none opacity-20 group-hover:opacity-100 transition-opacity duration-700 shimmer-overlay" />
                        <span className={`text-[10px] block uppercase font-bold text-purple-400 opacity-70 relative z-10`}>{t('ui.sp')}</span>
                        <span ref={spRef} className={`text-2xl font-bold font-mono text-purple-500 relative z-10`}>{StatsBridge.getSkillPoints(stats)}</span>
                    </div>

                    {/* Scrap */}
                    <div onClick={() => { if (debugMode) onDebugScrap(); else onOpenArmory(); }}
                        className={`w-20 h-20 aspect-square border-2 backdrop-blur-sm cursor-pointer transition-all hover:scale-110 flex flex-col items-center justify-center bg-yellow-950/40 hover:bg-yellow-900/60 border-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.2)] relative overflow-hidden group`}>
                        <div className="absolute inset-0 pointer-events-none opacity-20 group-hover:opacity-100 transition-opacity duration-700 shimmer-overlay" />
                        <span className={`text-[10px] block uppercase font-bold text-yellow-500 opacity-70 relative z-10`}>{t('ui.scrap')}</span>
                        <span ref={scrapRef} className={`text-2xl font-bold font-mono text-yellow-500 relative z-10`}>{StatsBridge.getScrap(stats)}</span>
                    </div>

                    {/* Challenge Points (CP) */}
                    <div onClick={() => { if (debugMode) onDebugCP(); else onOpenAdventureLog(DiscoveryType.CHALLENGE); }}
                        className={`w-20 h-20 aspect-square border-2 backdrop-blur-sm cursor-pointer transition-all hover:scale-110 flex flex-col items-center justify-center bg-red-950/40 hover:bg-red-900/60 border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.2)] relative overflow-hidden group`}>
                        <div className="absolute inset-0 pointer-events-none opacity-20 group-hover:opacity-100 transition-opacity duration-700 shimmer-overlay" />
                        <span className={`text-[10px] block uppercase font-bold text-red-500 opacity-70 relative z-10`}>CP</span>
                        <span ref={cpRef} className={`text-2xl font-bold font-mono text-red-500 relative z-10`}>{StatsBridge.getTotalChallengePoints(stats)}</span>
                    </div>
                </div>
            </div>

            {/* Bottom Actions */}
            <div className={`absolute bottom-10 left-1/2 -translate-x-1/2 z-40 pointer-events-auto flex flex-col items-center gap-4 ${uiFadeClass} ${isMobileDevice ? 'camp-hud-bottom-scale' : ''}`}>
                <div className="flex gap-4">
                    <div onClick={onOpenSettings} className="flex items-center gap-2 cursor-pointer bg-black px-4 py-2 border border-gray-500 hover:border-white transition-colors">
                        <span className="text-xs uppercase text-gray-300 font-bold tracking-widest">{t('ui.settings')}</span>
                    </div>

                    <div ref={debugBtnRef} onClick={() => {
                        UISounds.playClick();
                        const cur = (window as any).HudStore?.getState().debugMode ?? debugModeRef.current;
                        const next = !cur;
                        (window as any).HudStore?.patch({ debugMode: next }); // Use patch to notify everyone
                        onToggleDebug(next);
                    }} className="flex items-center gap-2 cursor-pointer px-4 py-2 border border-gray-500 hover:border-white bg-black transition-colors debug-btn">
                        <span ref={debugTextRef} className="text-xs uppercase font-bold tracking-widest text-gray-300 debug-text">{t('ui.debug_mode')}</span>
                    </div>

                    <div onClick={() => { UISounds.playClick(); onResetGame(); }} className="flex items-center gap-2 cursor-pointer bg-black px-4 py-2 border border-red-900 hover:border-red-500 hover:bg-red-900/20 transition-colors">
                        <span className="text-xs uppercase text-red-500 font-bold tracking-widest">{t('ui.delete_save_data')}</span>
                    </div>
                </div>
            </div>

            {/* Top Right Logo */}
            <div className={`absolute top-0 right-0 p-8 flex flex-col items-end pointer-events-none z-30 transition-opacity duration-300 opacity-100 ${isMobileDevice ? 'scale-75 origin-top-right' : ''}`}>
                <div className="mb-4 text-right">
                    <h1 className="text-6xl font-mono text-white drop-shadow-lg leading-none">{t('ui.game_title_1')}</h1>
                    <h1 className="text-6xl font-mono text-red-600 drop-shadow-lg leading-none">{t('ui.game_title_2')}</h1>
                </div>
            </div>

            <style>{`
                @keyframes shimmer {
                    0% { transform: translateX(-100%) skewX(-15deg); }
                    100% { transform: translateX(200%) skewX(-15deg); }
                }
                .shimmer-overlay {
                    background: linear-gradient(90deg, transparent, rgba(59, 130, 246, 0.1), transparent);
                    width: 50%;
                    height: 100%;
                    animation: shimmer 3s infinite;
                }
                .camp-hud-mobile-scale {
                    transform: scale(0.65);
                    transform-origin: top left;
                }
                .camp-hud-bottom-scale {
                    transform: translateX(-50%) scale(0.8);
                    transform-origin: bottom center;
                }
                .debug-btn.debug-active {
                    background-color: rgba(20, 83, 45, 0.5); /* bg-green-900/50 */
                    border-color: #22c55e; /* border-green-500 */
                }
                .debug-btn.debug-active .debug-text {
                    color: #4ade80; /* text-green-400 */
                }
            `}</style>
        </>
    );
}, areEqual);

export default CampHUD;

