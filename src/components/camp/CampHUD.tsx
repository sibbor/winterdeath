
import React from 'react';
import { PlayerStats } from '../../types';
import { t } from '../../utils/i18n';
import { RANKS } from '../../content/constants';
import { soundManager } from '../../utils/sound';

interface CampHUDProps {
    stats: PlayerStats;
    hoveredStation: string | null;
    currentMapName: string;
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

const STATIONS = [
    { id: 'armory', labelKey: 'stations.armory' },
    { id: 'sectors', labelKey: 'stations.sectors' },
    { id: 'skills', labelKey: 'stations.skills' },
    { id: 'adventure_log', labelKey: 'stations.adventure_log' },
    { id: 'stats', labelKey: 'stations.stats' }, // Statistics
];

const CampHUD: React.FC<CampHUDProps> = ({
    stats, hoveredStation, currentMapName, hasCheckpoint, isIdle, currentLoadoutNames,
    onOpenStats, onOpenArmory, onOpenSkills, onOpenSettings, onStartSector,
    debugMode, onToggleDebug, onResetGame, onDebugScrap, onDebugSkill, fpsRef, isMobileDevice
}) => {

    const uiFadeClass = `transition-opacity ${isIdle ? 'duration-[2000ms] opacity-0' : 'duration-300 opacity-100'}`;

    const getRank = (level: number) => {
        const rankKey = Math.min(Math.max(0, level - 1), 19);
        const translated = t(`ranks.${rankKey}`);
        if (translated.startsWith('ranks.')) return RANKS[rankKey];
        return translated;
    };

    const getLabelPos = (id: string) => {
        switch (id) {
            case 'armory': return { left: '20%', top: '30%' };
            case 'adventure_log': return { left: '40%', top: '35%' };
            case 'sectors': return { left: '60%', top: '35%' };
            case 'skills': return { left: '80%', top: '30%' };
            case 'stats': return { left: '15%', top: '15%' }; // If hovered over stats box? Usually not handled by hoveredStation but checking just in case
            default: return { left: '50%', top: '40%' };
        }
    };

    const getStationColorClass = (id: string) => {
        switch (id) {
            case 'armory': return 'bg-yellow-700 border-yellow-500';
            case 'sectors': return 'bg-red-700 border-red-500'; // Red
            case 'skills': return 'bg-purple-700 border-purple-500';
            case 'adventure_log': return 'bg-green-700 border-green-500'; // Green
            case 'stats': return 'bg-blue-700 border-blue-500';
            default: return 'bg-red-700 border-white/20';
        }
    };

    return (
        <>
            {/* Top Left Stats / Buttons */}
            <div
                className={`absolute top-0 left-0 p-8 z-30 flex flex-col gap-4 items-start pointer-events-none ${uiFadeClass} ${isMobileDevice ? 'camp-hud-mobile-scale' : ''}`}
            >

                {/* Clicking level/dossier now opens Statistics (onOpenStats) */}
                <div
                    className={`bg-slate-900/95 p-4 border-l-4 border-blue-500 shadow-2xl cursor-pointer pointer-events-auto hover:bg-slate-800 transition-colors w-[320px]`}
                    onClick={onOpenStats}
                >
                    <h1 className="text-4xl font-black text-white tracking-tighter leading-none uppercase" style={{ fontSize: '2.25rem', fontWeight: 900 }}>{getRank(stats.level)}</h1>
                    <div className="flex items-center gap-4 mt-2">
                        <span className="text-blue-400 font-bold text-sm">{t('ui.lvl')} {stats.level}</span>
                        <div className="flex-1 h-1.5 bg-blue-900"><div className="h-full bg-blue-400" style={{ width: `${(stats.currentXp / stats.nextLevelXp) * 100}%` }} /></div>
                    </div>
                </div>

                <div className="flex gap-4 pointer-events-auto">
                    {/* Clicking SP now opens the Upgrade screen (via onOpenSkills theoretically, but here mapped to onOpenSkills call) */}
                    <div onClick={() => { if (debugMode) onDebugSkill(); else onOpenSkills(); }}
                        className={`px-4 py-2 border backdrop-blur-sm cursor-pointer transition-all hover:scale-105 hover:border-purple-500 ${stats.skillPoints > 0 ? 'bg-purple-900/20 border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.5)]' : 'bg-black/80 border-slate-700'}`}>
                        <span className={`text-[10px] block uppercase font-black ${stats.skillPoints > 0 ? 'text-purple-500' : 'text-slate-500'}`}>{t('ui.sp')}</span>
                        <span className={`text-2xl font-black ${stats.skillPoints > 0 ? 'text-purple-400' : 'text-white'}`}>{stats.skillPoints}</span>
                    </div>

                    <div onClick={() => { if (debugMode) onDebugScrap(); else onOpenArmory(); }}
                        className={`px-4 py-2 border backdrop-blur-sm cursor-pointer transition-all hover:scale-105 hover:border-yellow-500 ${stats.scrap > 0 ? 'bg-yellow-900/20 border-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.5)]' : 'bg-black/80 border-slate-700'}`}>
                        <span className={`text-[10px] block uppercase font-black ${stats.scrap > 0 ? 'text-yellow-500' : 'text-slate-500'}`}>{t('ui.scrap')}</span>
                        <span className={`text-2xl font-black ${stats.scrap > 0 ? 'text-yellow-400' : 'text-white'}`}>{stats.scrap}</span>
                    </div>
                </div>
            </div>

            {/* 3D Floating Labels */}
            {hoveredStation && !hoveredStation.startsWith('family_') && !hoveredStation.startsWith('player_') && !isIdle && (
                <div className={`absolute transform -translate-x-1/2 pointer-events-none z-20 ${uiFadeClass} ${isMobileDevice ? 'scale-75' : ''}`} style={{ ...getLabelPos(hoveredStation) }}>
                    <div className={`${getStationColorClass(hoveredStation)} text-white px-4 md:px-8 py-1 md:py-2 text-lg md:text-2xl font-black uppercase tracking-widest border-2 shadow-2xl mb-2`}>{t(STATIONS.find(s => s.id === hoveredStation)?.labelKey || '')}</div>
                    {hoveredStation === 'armory' && (
                        <div className="bg-black/80 text-slate-300 px-4 py-2 border border-slate-700 text-center text-[10px] md:text-xs font-bold uppercase whitespace-nowrap">
                            <div className="flex gap-2 md:gap-4"><span>{t('ui.pri')}: {currentLoadoutNames.pri}</span><span>{t('ui.sec')}: {currentLoadoutNames.sec}</span><span>{t('ui.thr')}: {currentLoadoutNames.thr}</span></div>
                        </div>
                    )}
                </div>
            )}

            {/* Bottom Actions */}
            <div className={`absolute bottom-10 left-1/2 -translate-x-1/2 z-40 pointer-events-auto flex flex-col items-center gap-4 ${uiFadeClass} ${isMobileDevice ? 'camp-hud-bottom-scale' : ''}`}>

                <div className="flex gap-4">
                    <div onClick={onOpenSettings} className="flex items-center gap-2 cursor-pointer bg-black/80 px-4 py-2 border border-gray-500 hover:border-white transition-colors">
                        <span className="text-xs uppercase text-gray-300 font-bold tracking-widest">{t('ui.settings')}</span>
                    </div>

                    <div onClick={() => { soundManager.playUiClick(); onToggleDebug(!debugMode); }} className={`flex items-center gap-2 cursor-pointer px-4 py-2 border transition-colors ${debugMode ? 'bg-green-900/50 border-green-500' : 'bg-black/80 border-gray-500 hover:border-white'}`}>
                        <span className={`text-xs uppercase font-bold tracking-widest ${debugMode ? 'text-green-400' : 'text-gray-300'}`}>{t('ui.debug_mode')}</span>
                    </div>

                    <div onClick={() => { soundManager.playUiClick(); onResetGame(); }} className="flex items-center gap-2 cursor-pointer bg-black/80 px-4 py-2 border border-red-900 hover:border-red-500 hover:bg-red-900/20 transition-colors">
                        <span className="text-xs uppercase text-red-500 font-bold tracking-widest">{t('ui.delete_save_data')}</span>
                    </div>

                </div>
            </div>

            {/* Top Right Logo */}
            <div className={`absolute top-0 right-0 p-8 flex flex-col items-end pointer-events-none z-30 transition-opacity duration-300 opacity-100 ${isMobileDevice ? 'scale-75 origin-top-right' : ''}`}>
                <div className="mb-4 text-right">
                    <h1 className="text-6xl font-black text-white italic tracking-tighter drop-shadow-lg leading-none">VINTER</h1>
                    <h1 className="text-6xl font-black text-red-600 italic tracking-tighter drop-shadow-lg leading-none">DÖD</h1>
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
};

export default CampHUD;
