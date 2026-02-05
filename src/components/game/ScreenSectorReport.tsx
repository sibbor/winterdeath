
import React from 'react';
import { t } from '../../utils/i18n';
import { SectorStats } from '../../types';
import GameModalLayout from './GameModalLayout';
import { BOSSES } from '../../content/constants';
import { getCollectibleById, getCollectiblesBySector } from '../../content/collectibles';

interface ScreenSectorReportProps {
    stats: SectorStats;
    deathDetails: { killer: string } | null;
    onReturnCamp: () => void;
    onRetry: () => void;
    currentMap: number;
    isMobileDevice?: boolean;
}

const formatTime = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, '0')} min`;
};

const formatDistance = (meters: number) => {
    if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
    return `${Math.floor(meters)} m`;
};

const ScreenSectorReport: React.FC<ScreenSectorReportProps> = ({ stats, deathDetails, onReturnCamp, onRetry, currentMap, isMobileDevice }) => {

    const buttonStyle = "flex-1 max-w-xs py-4 font-black uppercase tracking-widest transition-colors skew-x-[-10deg] border-2 shadow-[0_0_20px_rgba(220,38,38,0.4)]";

    const accuracy = stats.shotsFired > 0
        ? ((stats.shotsHit || 0) / stats.shotsFired * 100).toFixed(1)
        : "0.0";

    const totalKills = (Object.values(stats.killsByType) as number[]).reduce((a, b) => a + b, 0);

    const bossKilled = (stats.killsByType && (stats.killsByType['Boss'] as number) > 0);
    const bossName = t(BOSSES[currentMap]?.name || "Boss");

    // Family Status Logic
    let statusKey = 'ui.missing';
    let statusBoxClass = 'border-red-600 bg-red-900/20';
    let statusTitleColor = 'text-red-500';

    if (stats.familyExtracted) {
        statusKey = 'ui.rescued';
        statusBoxClass = 'border-green-500 bg-green-900/20';
        statusTitleColor = 'text-green-500';
    } else if (stats.familyFound) {
        statusKey = 'ui.found';
        statusBoxClass = 'border-yellow-500 bg-yellow-900/20';
        statusTitleColor = 'text-yellow-500';
    } else {
        statusKey = 'ui.missing';
        statusBoxClass = 'border-red-600 bg-red-900/20';
        statusTitleColor = 'text-red-500';
    }

    // Boss Status Logic
    const bossStatusKey = bossKilled ? 'ui.eliminated' : 'ui.alive';
    const bossBoxClass = bossKilled
        ? 'border-green-500 bg-green-900/20'
        : 'border-red-600 bg-red-900/20';
    const bossTitleColor = bossKilled ? 'text-green-500' : 'text-red-500';

    const showRespawn = !!deathDetails || !!stats.aborted;

    const Footer = (
        <div className="w-full flex justify-end gap-6">
            {!showRespawn ? (
                <button onClick={onReturnCamp} className={`${buttonStyle} bg-red-700 hover:bg-red-600 text-white border-red-500`}>
                    <span className="block skew-x-[10deg]">{t('ui.return_camp')}</span>
                </button>
            ) : (
                <>
                    <button onClick={onReturnCamp} className={`${buttonStyle} bg-transparent hover:bg-gray-900 text-gray-500 hover:text-white border-gray-700 hover:border-white shadow-none`}>
                        <span className="block skew-x-[10deg]">{t('ui.return_camp')}</span>
                    </button>
                    <button onClick={onRetry} className={`${buttonStyle} bg-red-700 hover:bg-red-600 text-white border-red-500`}>
                        <span className="block skew-x-[10deg]">{t('ui.respawn')}</span>
                    </button>
                </>
            )}
        </div>
    );

    // Helper for Stat Blocks (Time elapsed style)
    const StatBlock = ({ label, value, color }: { label: string, value: string | number, color: string }) => (
        <div>
            <span className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">{label}</span>
            <span className={`text-2xl font-black ${color}`}>{value}</span>
        </div>
    );

    let displayKiller = deathDetails ? deathDetails.killer : "";
    if (displayKiller === 'Boss') {
        displayKiller = bossName;
    }

    return (
        <GameModalLayout title="SECTOR REPORT" maxWidthClass="max-w-7xl" footer={Footer} isMobile={isMobileDevice}>

            {/* Aborted Banner */}
            {stats.aborted && !deathDetails && (
                <div className={`mb-4 md:mb-6 w-full border-4 border-yellow-900 bg-yellow-900/20 ${isMobileDevice ? 'p-3' : 'p-6'} skew-x-[-5deg] text-center`}>
                    <h3 className={`${isMobileDevice ? 'text-lg' : 'text-2xl'} font-bold text-yellow-500 uppercase tracking-widest`}>{t('ui.sector_aborted')}</h3>
                </div>
            )}

            {/* Responsive Grid Layout */}
            <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-8 mb-6 ${isMobileDevice ? 'overflow-y-auto' : ''}`}>

                {/* 1. Performance (Blue) */}
                <div className="flex flex-col space-y-6">
                    <h3 className="text-white font-black uppercase text-2xl border-b-4 border-blue-500 bg-blue-900/60 py-4 px-4 skew-x-[-10deg] tracking-tighter shadow-lg">{t('ui.performance')}</h3>
                    <div className="space-y-4 px-2">
                        {/* XP Box */}
                        <div className="bg-blue-900/20 p-4 border-l-4 border-blue-500 shadow-lg">
                            <span className="block text-xs font-bold text-blue-400 uppercase tracking-widest mb-1">{t('ui.xp_earned')}</span>
                            <span className="text-4xl font-black text-white">+{stats.xpGained}</span>
                        </div>

                        {/* SP Box */}
                        <div className="bg-purple-900/20 p-4 border-l-4 border-purple-500 shadow-lg">
                            <span className="block text-xs font-bold text-purple-400 uppercase tracking-widest mb-1">{t('ui.sp_earned')}</span>
                            <span className="text-4xl font-black text-white">+{stats.spEarned || 0}</span>
                        </div>

                        <div className="pt-2 space-y-4">
                            <StatBlock label={t('ui.time_elapsed')} value={formatTime(stats.timeElapsed)} color="text-blue-400" />
                            <div className="border-b border-gray-800"></div>
                            <StatBlock label={t('ui.distance_traveled')} value={formatDistance(stats.distanceTraveled || 0)} color="text-blue-400" />
                        </div>
                    </div>
                </div>

                {/* 2. Scavenging (Yellow) */}
                <div className="flex flex-col space-y-6">
                    <h3 className="text-white font-black uppercase text-2xl border-b-4 border-yellow-500 bg-yellow-900/60 py-4 px-4 skew-x-[-10deg] tracking-tighter shadow-lg">{t('ui.scavenging')}</h3>
                    <div className="space-y-4 flex flex-col px-2">
                        {/* Scrap Box */}
                        <div className="bg-yellow-900/20 p-4 border-l-4 border-yellow-500 shadow-lg">
                            <span className="block text-xs font-bold text-yellow-400 uppercase tracking-widest mb-1">{t('ui.scrap_earned')}</span>
                            <span className="text-4xl font-black text-white">+{stats.scrapLooted}</span>
                        </div>

                        {/* Chests info */}
                        <div className="mt-4 pt-2 border-t border-gray-800/30">
                            <StatBlock label={t('ui.chests')} value={stats.chestsOpened + stats.bigChestsOpened} color="text-yellow-400" />
                        </div>

                        {/* Grid Layout: Collectibles Found (L) / Clues Found (R) */}
                        <div className="grid grid-cols-2 gap-4 border-b border-gray-800 pb-4">
                            <StatBlock
                                label={t('ui.log_collectibles')}
                                value={`${stats.collectiblesFound?.length || 0} / ${getCollectiblesBySector(currentMap + 1).length}`}
                                color="text-yellow-400"
                            />
                            <StatBlock label={t('ui.clues_found')} value={stats.cluesFound.length} color="text-yellow-400" />
                        </div>

                        {/* Two column list for Clues and Collectibles */}
                        <div className="grid grid-cols-2 gap-4 pt-2">
                            {/* Collectibles List */}
                            <div className="overflow-y-auto custom-scrollbar text-left max-h-48">
                                {stats.collectiblesFound && stats.collectiblesFound.length > 0 ? (
                                    <ul className="space-y-2">
                                        {stats.collectiblesFound.map((id, i) => {
                                            const def = getCollectibleById(id);
                                            return (
                                                <li key={i} className="text-xs font-bold uppercase tracking-widest text-yellow-200">
                                                    {def ? t(def.nameKey) : id}
                                                </li>
                                            );
                                        })}
                                    </ul>
                                ) : (
                                    <span className="text-gray-600 font-mono text-xs uppercase">{t('ui.none')}</span>
                                )}
                            </div>

                            {/* Clues List */}
                            <div className="overflow-y-auto custom-scrollbar text-left max-h-48">
                                {stats.cluesFound && stats.cluesFound.length > 0 ? (
                                    <ul className="space-y-2">
                                        {stats.cluesFound.slice(0, 3).map((clue, i) => (
                                            <li key={i} className="text-xs font-bold uppercase tracking-widest text-yellow-200">
                                                {t(clue) === clue ? clue : t(clue)}
                                            </li>
                                        ))}
                                        {stats.cluesFound.length > 3 && <li className="text-xs text-gray-500 font-bold uppercase tracking-widest">...</li>}
                                    </ul>
                                ) : (
                                    <span className="text-gray-600 font-mono text-xs uppercase">{t('ui.none')}</span>
                                )}
                            </div>
                        </div>

                    </div>
                </div>

                {/* 3. Combat (Red) */}
                <div className="flex flex-col space-y-6">
                    <h3 className="text-white font-black uppercase text-2xl border-b-4 border-red-500 bg-red-900/60 py-4 px-4 skew-x-[-10deg] tracking-tighter shadow-lg">{t('ui.combat')}</h3>
                    <div className="space-y-6 px-2">

                        {/* Damage Stats Row */}
                        <div className="grid grid-cols-2 gap-4 border-b border-gray-800 pb-4">
                            <StatBlock label={t('ui.damage_dealt')} value={stats.damageDealt.toLocaleString()} color="text-red-400" />
                            <StatBlock label={t('ui.damage_taken')} value={Math.floor(stats.damageTaken)} color="text-red-400" />
                        </div>

                        {/* Shooting Stats Row */}
                        <div className="grid grid-cols-2 gap-4 border-b border-gray-800 pb-4">
                            <StatBlock label={t('ui.shots_fired')} value={stats.shotsFired} color="text-red-400" />
                            <StatBlock label={t('ui.accuracy')} value={`${accuracy}%`} color="text-red-400" />
                        </div>

                        {/* Main Stats Grid: Zombies Killed (L) / Throwables Used (R) */}
                        <div className="grid grid-cols-2 gap-4 border-b border-gray-800 pb-4">
                            <StatBlock label={t('ui.kill_confirmed')} value={totalKills} color="text-red-400" />
                            <StatBlock label={t('ui.throwables_used')} value={stats.throwablesThrown || 0} color="text-red-400" />
                        </div>
                    </div>

                    {/* Kill Breakdown List */}
                    {totalKills > 0 && (
                        <div className="flex flex-col min-h-0 px-2 overflow-y-auto custom-scrollbar max-h-32">
                            {(Object.entries(stats.killsByType) as [string, number][]).map(([type, count]) => (
                                <div key={type} className="flex justify-between text-gray-400 pb-1 border-b border-gray-800/30 border-dashed text-xs font-bold uppercase tracking-widest">
                                    {type === 'Boss' ? (
                                        <span className="text-red-300">{bossName} (BOSS)</span>
                                    ) : (
                                        <span className="text-white">{type}</span>
                                    )}
                                    <span className="font-mono text-red-500">{count}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* 4. Outcome (Green) */}
                <div className="flex flex-col space-y-6">
                    <h3 className="text-white font-black uppercase text-2xl border-b-4 border-green-500 bg-green-900/60 py-4 px-4 skew-x-[-10deg] tracking-tighter shadow-lg">{t('ui.outcome')}</h3>
                    <div className="space-y-6 px-2">

                        {/* Family Member Box */}
                        <div className={`p-4 border-l-4 shadow-lg ${statusBoxClass}`}>
                            <span className={`block text-xs font-bold uppercase tracking-widest mb-1 opacity-90 ${statusTitleColor}`}>{t('ui.family_member')}</span>
                            <span className="text-3xl font-black uppercase text-white">{t(statusKey)}</span>
                        </div>

                        {/* Boss Status Box */}
                        <div className={`p-4 border-l-4 shadow-lg ${bossBoxClass}`}>
                            <span className={`block text-xs font-bold uppercase tracking-widest mb-1 opacity-90 ${bossTitleColor}`}>{t('ui.boss_status')}</span>
                            <span className="text-3xl font-black uppercase text-white">{t(bossStatusKey)}</span>
                        </div>

                    </div>
                </div>
            </div>
        </GameModalLayout>
    );
};

export default ScreenSectorReport;
