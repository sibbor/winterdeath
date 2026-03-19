import React from 'react';
import { t } from '../../utils/i18n';
import { SectorStats } from '../../types';
import ScreenModalLayout from '../ui/ScreenModalLayout';
import { BOSSES } from '../../content/constants';
import { getCollectibleById, getCollectiblesBySector } from '../../content/collectibles';

interface ScreenSectorReportProps {
    stats: SectorStats;
    deathDetails: { killer: string } | null;
    onReturnCamp: () => void;
    onRetry: () => void;
    currentSector: number;
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

const ScreenSectorReport: React.FC<ScreenSectorReportProps> = ({ stats, deathDetails, onReturnCamp, onRetry, currentSector, isMobileDevice }) => {

    const accuracy = stats.shotsFired > 0
        ? ((stats.shotsHit || 0) / stats.shotsFired * 100).toFixed(1)
        : "0.0";

    const totalKills = (Object.values(stats.killsByType || {}) as number[]).reduce((a, b) => a + b, 0);

    const bossKilled = (stats.killsByType && (stats.killsByType['Boss'] as number) > 0);
    const bossName = t(BOSSES[currentSector]?.name || "Boss");

    // Family Status Logic
    let familyStatusKey = 'ui.family_member_missing';
    let familyBoxClass = 'border-red-600 bg-red-900/20';
    let familyTitleColor = 'text-red-500';

    if (stats.familyFound || bossKilled) {
        familyStatusKey = 'ui.family_member_rescued';
        familyBoxClass = 'border-green-500 bg-green-900/20';
        familyTitleColor = 'text-green-500';
    }

    // Boss Status Logic
    const bossStatusKey = bossKilled ? 'ui.boss_dead' : 'ui.boss_alive';
    const bossBoxClass = bossKilled
        ? 'border-green-500 bg-green-900/20'
        : 'border-red-600 bg-red-900/20';
    const bossTitleColor = bossKilled ? 'text-green-500' : 'text-red-500';

    const showRespawn = !!deathDetails || !!stats.aborted;


    // Helper for Stat Blocks (Time elapsed style)
    const StatBlock = ({ label, value, color }: { label: string, value: string | number, color: string }) => (
        <div>
            <span className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">{label}</span>
            <span className={`text-2xl font-semibold ${color}`}>{value}</span>
        </div>
    );

    return (
        <ScreenModalLayout
            title={t('ui.sector_report')}
            isMobileDevice={isMobileDevice}
            onClose={showRespawn ? onReturnCamp : undefined}
            onCancel={showRespawn ? onReturnCamp : undefined}
            cancelLabel={showRespawn ? t('ui.return_camp') : undefined}
            onConfirm={showRespawn ? onRetry : onReturnCamp}
            confirmLabel={showRespawn ? t('ui.respawn') : t('ui.return_camp')}
            showCloseButton={showRespawn}
        >
            {/* Aborted Banner */}
            {stats.aborted && !deathDetails && (
                <div className={`mb-4 md:mb-6 w-full border-4 border-yellow-900 bg-yellow-900/20 ${isMobileDevice ? 'p-3' : 'p-6'} text-center`}>
                    <h3 className={`${isMobileDevice ? 'text-lg' : 'text-2xl'} font-bold text-yellow-500 uppercase tracking-widest`}>{t('ui.sector_aborted')}</h3>
                </div>
            )}

            {/* Responsive Grid Layout */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-8 mb-6">

                {/* 1. Performance (Blue) */}
                <div className="flex flex-col space-y-6">
                    <h3 className="text-white font-light uppercase text-2xl border-b border-white py-2 tracking-tighter">{t('ui.performance')}</h3>
                    <div className="space-y-4 px-2">
                        {/* XP Box */}
                        <div className="bg-blue-900/20 p-4 border-l-4 border-blue-500 shadow-lg">
                            <span className="block text-xs font-bold text-blue-400 uppercase tracking-widest mb-1">{t('ui.xp_earned')}</span>
                            <span className="text-4xl font-semibold text-white">+{stats.xpGained}</span>
                        </div>

                        {/* SP Box */}
                        <div className="bg-purple-900/20 p-4 border-l-4 border-purple-500 shadow-lg">
                            <span className="block text-xs font-bold text-purple-400 uppercase tracking-widest mb-1">{t('ui.sp_earned')}</span>
                            <span className="text-4xl font-semibold text-white">+{stats.spEarned || 0}</span>
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
                    <h3 className="text-white font-light uppercase text-2xl border-b border-white py-2 tracking-tighter">{t('ui.scavenging')}</h3>
                    <div className="space-y-4 flex flex-col px-2">
                        {/* Scrap Box */}
                        <div className="bg-yellow-900/20 p-4 border-l-4 border-yellow-500 shadow-lg">
                            <span className="block text-xs font-bold text-yellow-400 uppercase tracking-widest mb-1">{t('ui.scrap_earned')}</span>
                            <span className="text-4xl font-semibold text-white">+{stats.scrapLooted}</span>
                        </div>

                        {/* Chests info */}
                        <div className="mt-4 pt-2 border-t border-gray-800/30">
                            <StatBlock label={t('ui.chests')} value={stats.chestsOpened + stats.bigChestsOpened} color="text-yellow-400" />
                        </div>

                        {/* Grid Layout: Collectibles Found (L) / Clues Found (R) */}
                        <div className="grid grid-cols-2 gap-4 border-b border-gray-800 pb-4">
                            <StatBlock
                                label={t('ui.log_collectibles')}
                                value={`${stats.collectiblesDiscovered?.length || 0} / ${getCollectiblesBySector(currentSector + 1).length}`}
                                color="text-yellow-400"
                            />
                            <StatBlock label={t('ui.clues_found')} value={stats.cluesFound?.length || 0} color="text-yellow-400" />
                        </div>

                        {/* Two column list for Clues and Collectibles */}
                        <div className="grid grid-cols-2 gap-4 pt-2">
                            {/* Collectibles List */}
                            <div className="overflow-y-auto custom-scrollbar text-left max-h-48">
                                {stats.collectiblesDiscovered && stats.collectiblesDiscovered.length > 0 ? (
                                    <ul className="space-y-2">
                                        {stats.collectiblesDiscovered.map((id, i) => {
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
                    <h3 className="text-white font-light uppercase text-2xl border-b border-white py-2 tracking-tighter">{t('ui.combat')}</h3>
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
                    <h3 className="text-white font-light uppercase text-2xl border-b border-white py-2 tracking-tighter">{t('ui.outcome')}</h3>
                    <div className="space-y-6 px-2">

                        {/* Family Member Box */}
                        <div className={`p-4 border-l-4 shadow-lg ${familyBoxClass}`}>
                            <span className={`block text-xs font-bold uppercase tracking-widest mb-1 opacity-90 ${familyTitleColor}`}>{t('ui.family_member')}</span>
                            <span className="text-3xl font-semibold uppercase text-white">{t(familyStatusKey)}</span>
                        </div>

                        {/* Boss Status Box */}
                        <div className={`p-4 border-l-4 shadow-lg ${bossBoxClass}`}>
                            <span className={`block text-xs font-bold uppercase tracking-widest mb-1 opacity-90 ${bossTitleColor}`}>{t('ui.boss_status')}</span>
                            <span className="text-3xl font-semibold uppercase text-white">{t(bossStatusKey)}</span>
                        </div>

                    </div>
                </div>

                {/* 5. Damage Breakdown (Full Width) */}
                <div className="lg:col-span-4 grid grid-cols-1 md:grid-cols-2 gap-8 border-t border-gray-800 pt-8 mt-4">
                    {/* Incoming Breakdown */}
                    <div className="flex flex-col h-full">
                        <h4 className="text-red-500 font-bold uppercase text-sm tracking-widest mb-4 flex items-center gap-2">
                            <div className="w-2 h-2 bg-red-500"></div>
                            {t('ui.incoming_damage_breakdown')}
                        </h4>
                        <div className="space-y-2 overflow-y-auto max-h-48 custom-scrollbar pr-2 flex-1">
                            {Object.keys(stats.incomingDamageBreakdown || {}).length > 0 ? (
                                Object.entries(stats.incomingDamageBreakdown!).map(([source, attacks]) => (
                                    <div key={source} className="mb-3">
                                        <div className="text-xs font-black text-white uppercase tracking-tighter mb-1 border-b border-gray-800 pb-1">
                                            {source === 'Boss' ? bossName : (source === 'Other' ? t('ui.other') : (t(`enemies.${source.toUpperCase()}.name`) !== `enemies.${source.toUpperCase()}.name` ? t(`enemies.${source.toUpperCase()}.name`) : source))}
                                        </div>
                                        {Object.entries(attacks).map(([attack, amount]) => {
                                            const attackKey = attack.toUpperCase();
                                            const localizedAttack = t(`attacks.${attackKey}.title`) !== `attacks.${attackKey}.title` ? t(`attacks.${attackKey}.title`) : attack;
                                            return (
                                                <div key={attack} className="flex justify-between text-[10px] font-mono text-gray-400 ml-2">
                                                    <span>{localizedAttack}</span>
                                                    <span className="text-red-400">-{Math.floor(amount as any)}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ))
                            ) : (
                                <div className="text-xs text-gray-700 font-mono uppercase italic">{t('ui.none')}</div>
                            )}
                        </div>
                        {Object.keys(stats.incomingDamageBreakdown || {}).length > 0 && (
                            <div className="flex justify-between items-center pt-2 border-t border-gray-800 mt-4 px-2">
                                <span className="text-xs font-black text-white uppercase">{t('ui.total')}</span>
                                <span className="text-xl font-black text-red-500">-{Math.floor(stats.damageTaken || 0)}</span>
                            </div>
                        )}
                    </div>

                    {/* Outgoing Breakdown */}
                    <div className="flex flex-col h-full">
                        <h4 className="text-green-500 font-bold uppercase text-sm tracking-widest mb-4 flex items-center gap-2">
                            <div className="w-2 h-2 bg-green-500"></div>
                            {t('ui.outgoing_damage_breakdown')}
                        </h4>
                        <div className="space-y-1 overflow-y-auto max-h-48 custom-scrollbar pr-2 flex-1">
                            {Object.keys(stats.outgoingDamageBreakdown || {}).length > 0 ? (
                                Object.entries(stats.outgoingDamageBreakdown!)
                                    .sort((a, b) => (b[1] as any) - (a[1] as any))
                                    .map(([weapon, amount]) => (
                                        <div key={weapon} className="flex justify-between items-center py-1 border-b border-gray-800/30 border-dashed">
                                            <span className="text-xs font-bold text-white uppercase tracking-tighter">
                                                {t(`weapons.${weapon.toLowerCase()}`) !== `weapons.${weapon.toLowerCase()}` ? t(`weapons.${weapon.toLowerCase()}`) : weapon}
                                            </span>
                                            <span className="text-sm font-mono text-green-400">+{Math.floor(amount as any)}</span>
                                        </div>
                                    ))
                            ) : (
                                <div className="text-xs text-gray-700 font-mono uppercase italic">{t('ui.none')}</div>
                            )}
                        </div>
                        {Object.keys(stats.outgoingDamageBreakdown || {}).length > 0 && (
                            <div className="flex justify-between items-center pt-2 border-t border-gray-800 mt-4 px-2">
                                <span className="text-xs font-black text-white uppercase">{t('ui.total')}</span>
                                <span className="text-xl font-black text-green-500">+{Math.floor(stats.damageDealt || 0)}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </ScreenModalLayout>
    );
};

export default ScreenSectorReport;
