import React, { useMemo } from 'react';
import { PlayerStats, PlayerStatID } from '../../../entities/player/PlayerTypes';
import { t } from '../../../utils/i18n';
import { UiSounds } from '../../../utils/audio/AudioLib';

interface CampHUDProps {
    stats: PlayerStats;
    hoveredStation: string | null;
    currentSectorName: string;
    hasCheckpoint: boolean;
    isIdle: boolean;
    currentLoadoutNames: { pri: string, sec: string, thr: string };

    onOpenStats: () => void;
    onOpenArmory: () => void;
    onOpenSkills: () => void;
    onOpenSettings: () => void;
    onStartSector: () => void;

    // Debug actions
    debugMode: boolean;
    onToggleDebug: (val: boolean) => void;
    onResetGame: () => void;
    onDebugScrap: () => void;
    onDebugSkill: () => void;
    isMobileDevice?: boolean;
}

// PERFORMANCE FIX: En anpassad jämförelsefunktion för React.memo
// Denna hindrar HUD:en från att ritas om 60 gånger i sekunden bara för att
// en obskyr statistik (typ "tid spelad") uppdateras i stats-objektet.
const areEqual = (prevProps: CampHUDProps, nextProps: CampHUDProps) => {
    // Om UI-state ändras, måste vi rita om
    if (prevProps.isIdle !== nextProps.isIdle) return false;
    if (prevProps.debugMode !== nextProps.debugMode) return false;
    if (prevProps.isMobileDevice !== nextProps.isMobileDevice) return false;
    if (prevProps.currentSectorName !== nextProps.currentSectorName) return false;
    if (prevProps.hoveredStation !== nextProps.hoveredStation) return false;

    // Kritiska stats som visas i CampHUD
    const pb = prevProps.stats.statsBuffer;
    const nb = nextProps.stats.statsBuffer;

    return pb[PlayerStatID.LEVEL] === nb[PlayerStatID.LEVEL] &&
        pb[PlayerStatID.CURRENT_XP] === nb[PlayerStatID.CURRENT_XP] &&
        pb[PlayerStatID.SKILL_POINTS] === nb[PlayerStatID.SKILL_POINTS] &&
        pb[PlayerStatID.SCRAP] === nb[PlayerStatID.SCRAP];
};

const CampHUD: React.FC<CampHUDProps> = React.memo(({
    stats, hoveredStation, currentSectorName, hasCheckpoint, isIdle, currentLoadoutNames,
    onOpenStats, onOpenArmory, onOpenSkills, onOpenSettings, onStartSector,
    debugMode, onToggleDebug, onResetGame, onDebugScrap, onDebugSkill, isMobileDevice
}) => {

    const uiFadeClass = `transition-opacity ${isIdle ? 'duration-[2000ms] opacity-0' : 'duration-300 opacity-100'}`;

    const getRank = (level: number) => {
        const rankKey = Math.min(Math.max(0, level - 1), 19);
        return t(`ranks.${rankKey}`);
    };

    return (
        <>
            {/* Top Left Stats / Buttons */}
            <div
                className={`absolute top-0 left-0 p-8 z-30 flex flex-col gap-4 items-start pointer-events-none ${uiFadeClass} ${isMobileDevice ? 'camp-hud-mobile-scale' : ''}`}
            >
                {/* Level / Dossier */}
                <div
                    className={`bg-slate-900/95 p-4 border-l-4 border-blue-500 shadow-2xl cursor-pointer pointer-events-auto hover:bg-slate-800 transition-colors w-[320px]`}
                    onClick={onOpenStats}
                >
                    <h1 className="text-4xl font-semibold text-white tracking-tighter leading-none uppercase" style={{ fontSize: '2.25rem' }}>
                        {getRank(stats.statsBuffer[PlayerStatID.LEVEL])}
                    </h1>
                    <div className="flex items-center gap-4 mt-2">
                        <span className="text-blue-400 font-bold text-sm">{t('ui.lvl')} {stats.statsBuffer[PlayerStatID.LEVEL]}</span>
                        <div className="flex-1 h-1.5 bg-blue-900">
                            <div className="h-full bg-blue-400" style={{ width: `${(stats.statsBuffer[PlayerStatID.CURRENT_XP] / Math.max(1, stats.statsBuffer[PlayerStatID.NEXT_LEVEL_XP])) * 100}%` }} />
                        </div>
                    </div>
                </div>

                <div className="flex gap-4 pointer-events-auto">
                    {/* Skill Points */}
                    <div onClick={() => { if (debugMode) onDebugSkill(); else onOpenSkills(); }}
                        className={`w-20 h-20 aspect-square border backdrop-blur-sm cursor-pointer transition-all hover:scale-105 flex flex-col items-center justify-center ${stats.statsBuffer[PlayerStatID.SKILL_POINTS] > 0 ? 'bg-purple-950/40 border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.3)]' : 'bg-black/80 border-slate-700'}`}>
                        <span className={`text-[10px] block uppercase font-bold ${stats.statsBuffer[PlayerStatID.SKILL_POINTS] > 0 ? 'text-purple-600' : 'text-slate-500'}`}>{t('ui.sp')}</span>
                        <span className={`text-2xl font-bold font-mono ${stats.statsBuffer[PlayerStatID.SKILL_POINTS] > 0 ? 'text-purple-500' : 'text-white'}`}>{stats.statsBuffer[PlayerStatID.SKILL_POINTS]}</span>
                    </div>

                    {/* Scrap */}
                    <div onClick={() => { if (debugMode) onDebugScrap(); else onOpenArmory(); }}
                        className={`w-20 h-20 aspect-square border backdrop-blur-sm cursor-pointer transition-all hover:scale-105 flex flex-col items-center justify-center ${stats.statsBuffer[PlayerStatID.SCRAP] > 0 ? 'bg-yellow-950/40 border-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.3)]' : 'bg-black/80 border-slate-700'}`}>
                        <span className={`text-[10px] block uppercase font-bold ${stats.statsBuffer[PlayerStatID.SCRAP] > 0 ? 'text-yellow-600' : 'text-slate-500'}`}>{t('ui.scrap')}</span>
                        <span className={`text-2xl font-bold font-mono ${stats.statsBuffer[PlayerStatID.SCRAP] > 0 ? 'text-yellow-500' : 'text-white'}`}>{stats.statsBuffer[PlayerStatID.SCRAP]}</span>
                    </div>
                </div>
            </div>

            {/* Bottom Actions */}
            <div className={`absolute bottom-10 left-1/2 -translate-x-1/2 z-40 pointer-events-auto flex flex-col items-center gap-4 ${uiFadeClass} ${isMobileDevice ? 'camp-hud-bottom-scale' : ''}`}>
                <div className="flex gap-4">
                    <div onClick={onOpenSettings} className="flex items-center gap-2 cursor-pointer bg-black px-4 py-2 border border-gray-500 hover:border-white transition-colors">
                        <span className="text-xs uppercase text-gray-300 font-bold tracking-widest">{t('ui.settings')}</span>
                    </div>

                    <div onClick={() => { UiSounds.playClick(); onToggleDebug(!debugMode); }} className={`flex items-center gap-2 cursor-pointer px-4 py-2 border transition-colors ${debugMode ? 'bg-green-900/50 border-green-500' : 'bg-black border-gray-500 hover:border-white'}`}>
                        <span className={`text-xs uppercase font-bold tracking-widest ${debugMode ? 'text-green-400' : 'text-gray-300'}`}>{t('ui.debug_mode')}</span>
                    </div>

                    <div onClick={() => { UiSounds.playClick(); onResetGame(); }} className="flex items-center gap-2 cursor-pointer bg-black px-4 py-2 border border-red-900 hover:border-red-500 hover:bg-red-900/20 transition-colors">
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
                .camp-hud-mobile-scale {
                    transform: scale(0.65);
                    transform-origin: top left;
                }
                .camp-hud-bottom-scale {
                    transform: translateX(-50%) scale(0.8);
                    transform-origin: bottom center;
                }
            `}</style>
        </>
    );
}, areEqual);

export default CampHUD;