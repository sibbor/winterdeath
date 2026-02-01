
import React from 'react';
import { PlayerStats } from '../../types';
import { t } from '../../utils/i18n';
import CampModalLayout from './CampModalLayout';
import { RANKS } from '../../content/constants';

interface ScreenStatisticsProps {
    stats: PlayerStats;
    onClose: () => void;
}

const ScreenStatistics: React.FC<ScreenStatisticsProps> = ({ stats, onClose }) => {

    const getRank = (level: number) => {
        const rankKey = Math.min(Math.max(0, level - 1), 19);
        const translated = t(`ranks.${rankKey}`);
        if (translated.startsWith('ranks.')) return RANKS[rankKey];
        return translated;
    };

    const formatDistance = (meters: number) => {
        if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
        return `${Math.floor(meters)} m`;
    };

    const accuracy = stats.totalBulletsFired > 0
        ? ((stats.totalBulletsHit || 0) / stats.totalBulletsFired * 100).toFixed(1)
        : "0.0";

    const killsLabel = t('ui.kills');
    // Format "KILLS" -> "Kills"
    const displayKillsLabel = killsLabel.charAt(0).toUpperCase() + killsLabel.slice(1).toLowerCase();

    return (
        <CampModalLayout
            title={t('stations.stats')} // STATISTICS
            borderColorClass="border-blue-600"
            onClose={onClose}
        >
            <div className="flex gap-12 h-full">
                {/* LEFT COLUMN */}
                <div className="w-1/3 flex flex-col gap-6">
                    {/* RANK BOX */}
                    <div className="bg-blue-900/20 border-2 border-blue-500/50 p-6 flex flex-col items-center text-center">
                        <span className="text-blue-400 text-sm font-bold uppercase tracking-widest mb-2">{t('ui.current_rank')}</span>
                        <h1 className="text-4xl font-black text-white uppercase tracking-tighter mb-4">{getRank(stats.level)}</h1>
                        <div className="w-full bg-black h-4 border border-blue-900 relative">
                            <div className="h-full bg-blue-500" style={{ width: `${(stats.currentXp / stats.nextLevelXp) * 100}%` }}></div>
                        </div>
                        <div className="flex justify-between w-full mt-2 text-xs font-mono text-blue-300">
                            <span>{t('ui.lvl')} {stats.level}</span>
                            <span>{stats.currentXp} / {stats.nextLevelXp} {t('ui.xp')}</span>
                        </div>
                    </div>

                    {/* FAMILY BOX (Swapped to Left) */}
                    <div className="bg-black border border-gray-800 p-6 h-fit">
                        <h3 className="text-xl font-bold text-gray-400 uppercase tracking-wider mb-4 border-b border-gray-800 pb-2">{t('ui.family_header')}</h3>
                        <div className="space-y-3 text-sm">
                            <div className="flex justify-between items-end"><span className="text-gray-500">{t('ui.rescued_family_members')}</span><span className="text-white font-mono text-lg">{stats.familyFoundCount}</span></div>
                            <div className="flex justify-between items-end"><span className="text-gray-500">{t('ui.clues_found')}</span><span className="text-white font-mono text-lg">{stats.cluesFound.length}</span></div>
                        </div>
                    </div>
                </div>

                {/* RIGHT COLUMN */}
                <div className="flex-1 grid grid-cols-2 gap-6 content-start">
                    {/* PERFORMANCE BOX */}
                    <div className="bg-black border border-gray-800 p-6">
                        <h3 className="text-xl font-bold text-gray-400 uppercase tracking-wider mb-4 border-b border-gray-800 pb-2">{t('ui.performance')}</h3>
                        <div className="space-y-3 text-sm">
                            <div className="flex justify-between items-end"><span className="text-gray-500">{t('ui.xp_earned')}</span><span className="text-blue-400 font-mono font-bold text-lg">{stats.currentXp + (stats.level * 1000)}</span></div>
                            <div className="flex justify-between items-end"><span className="text-gray-500">{t('ui.sp_earned')}</span><span className="text-purple-400 font-mono font-bold text-lg">{stats.totalSkillPointsEarned}</span></div>
                            <div className="flex justify-between items-end"><span className="text-gray-500">{t('ui.scrap_scavenged')}</span><span className="text-yellow-500 font-mono text-lg">{stats.totalScrapCollected}</span></div>
                            <div className="flex justify-between items-end"><span className="text-gray-500">{t('ui.sectors_completed')}</span><span className="text-white font-mono text-lg">{stats.sectorsCompleted}</span></div>
                            <div className="flex justify-between items-end"><span className="text-gray-500">{t('ui.chests_opened')}</span><span className="text-white font-mono text-lg">{stats.chestsOpened + stats.bigChestsOpened}</span></div>
                            <div className="h-px bg-gray-800 my-2"></div>
                            <div className="flex justify-between items-end"><span className="text-gray-500">{t('ui.incoming_damage')}</span><span className="text-white font-mono text-lg">{Math.floor(stats.totalDamageTaken)}</span></div>
                            <div className="flex justify-between items-end"><span className="text-gray-500">{t('ui.outgoing_damage')}</span><span className="text-white font-mono text-lg">{stats.totalDamageDealt.toLocaleString()}</span></div>
                            <div className="h-px bg-gray-800 my-2"></div>
                            <div className="flex justify-between items-end"><span className="text-gray-500">{t('ui.shots_fired')}</span><span className="text-white font-mono text-lg">{stats.totalBulletsFired.toLocaleString()}</span></div>
                            <div className="flex justify-between items-end"><span className="text-gray-500">{t('ui.shots_hit')}</span><span className="text-white font-mono text-lg">{(stats.totalBulletsHit || 0).toLocaleString()}</span></div>
                            <div className="flex justify-between items-end"><span className="text-gray-500">{t('ui.accuracy')}</span><span className="text-blue-300 font-mono text-lg">{accuracy}%</span></div>
                        </div>
                    </div>

                    {/* COMBAT BOX (Swapped to Right) */}
                    <div className="bg-black border border-gray-800 p-6 flex-1">
                        <h3 className="text-xl font-bold text-gray-400 uppercase tracking-wider mb-4 border-b border-gray-800 pb-2">{t('ui.combat')}</h3>
                        <div className="space-y-3 text-sm">
                            <div className="flex justify-between items-end"><span className="text-gray-500">{displayKillsLabel}</span><span className="text-white font-mono text-lg">{stats.kills}</span></div>
                            <div className="flex justify-between items-end"><span className="text-gray-500">{t('ui.deaths')}</span><span className="text-white font-mono text-lg">{stats.deaths}</span></div>
                            <div className="flex justify-between items-end"><span className="text-gray-500">{t('ui.throwables_thrown')}</span><span className="text-white font-mono text-lg">{stats.totalThrowablesThrown || 0}</span></div>
                        </div>

                        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mt-6 mb-2 border-b border-gray-800 pb-1">{t('ui.kill_log')}</h3>
                        <div className="overflow-y-auto max-h-[350px] custom-scrollbar pr-2">
                            {Object.entries(stats.killsByType).map(([type, count]) => (
                                <div key={type} className="flex justify-between items-end text-xs py-1 border-b border-gray-900">
                                    <span className="text-gray-400 font-medium">
                                        {type.charAt(0).toUpperCase() + type.slice(1).toLowerCase()}
                                    </span>
                                    <span className="text-white font-mono text-lg">{count as number}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </CampModalLayout>
    );
};

export default ScreenStatistics;
