import React, { useState, useEffect } from 'react';
import { t } from '../../../../utils/i18n';
import { SectorStats } from '../../../../types/StateTypes';
import ScreenModalLayout, { TacticalCard, TacticalTab } from '../../layout/ScreenModalLayout';
import { DamageID } from '../../../../entities/player/CombatTypes';
import { UiSounds } from '../../../../utils/audio/AudioLib';
import { DataResolver } from '../../../../utils/ui/DataResolver';

interface ScreenSectorReportProps {
    stats: SectorStats;
    deathDetails: { killer: string } | null;
    onReturnCamp: () => void;
    onRestartSector: () => void;
    onRespawn: () => void;
    onNextSector?: () => void;
    currentSector: number;
    isMobileDevice?: boolean;
}

const formatTime = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, '0')}${t('report.time.unit_min')}`;
};

const formatDistance = (meters: number) => {
    if (meters >= 1000) return `${(meters / 1000).toFixed(2)}${t('report.distance.unit_km')}`;
    return `${Math.floor(meters)}${t('report.distance.unit_m')}`;
};

/**
 * [VINTERDÖD] Redesigned Sector Report
 * Features a paged layout for better clarity and hierarchy.
 */
const ScreenSectorReport: React.FC<ScreenSectorReportProps> = ({ stats, deathDetails, onReturnCamp, onRestartSector, onRespawn, onNextSector, currentSector, isMobileDevice }) => {
    const [activeTab, setActiveTab] = useState<0 | 1>(0);

    const isFailed = !!deathDetails;

    useEffect(() => {
        if (isFailed) {
            UiSounds.playDefeat();
        } else {
            UiSounds.playVictory();
        }
    }, [isFailed]);

    const sectorName = t(DataResolver.getSectorName(currentSector));

    // Sector Status Aggregation
    const isAborted = stats.aborted && !deathDetails;

    const statusKey = isFailed ? 'ui.failed' : (isAborted ? 'ui.aborted' : 'ui.completed');
    const statusColorClass = isFailed ? 'text-red-500' : (isAborted ? 'text-yellow-500' : 'text-green-500');

    const accuracy = stats.shotsFired > 0
        ? ((stats.shotsHit || 0) / stats.shotsFired * 100).toFixed(1)
        : "0.0";

    const totalKills = (Object.values(stats.killsByType || {}) as number[]).reduce((a, b) => a + b, 0);

    const bossKills = (stats.killsByType?.['Boss'] as number) || 0;
    const bossKilled = bossKills > 0;
    const familyStatusKey = (stats.familyFound || bossKilled) ? 'ui.family_member_rescued' : 'ui.family_member_missing';
    const bossStatusKey = bossKilled ? 'ui.boss_dead' : 'ui.boss_alive';

    // Buttons logic
    const showRespawn = isFailed || isAborted;
    const isFinished = !showRespawn;
    const isLastSector = currentSector >= 3;

    let confirmLabel: string | undefined;
    let confirmAction: (() => void) | undefined;
    let hideConfirm = false;

    if (showRespawn) {
        confirmLabel = t('ui.respawn');
        confirmAction = onRespawn;
    } else if (isFinished) {
        if (!isLastSector) {
            confirmLabel = t('ui.next_sector');
            confirmAction = onNextSector;
        } else {
            hideConfirm = true;
        }
    }

    const incomingData = Object.values(stats.incomingDamageBreakdown || {}) as any[];
    const totalIncoming = React.useMemo(() => incomingData.reduce((acc: number, enemyMap: any) => {
        const enemyVals = Object.values(enemyMap || {}) as number[];
        const sum = enemyVals.reduce((s: number, v: number) => s + (v || 0), 0);
        return acc + sum;
    }, 0), [incomingData]);

    const outgoingData = Object.values(stats.outgoingDamageBreakdown || {}) as number[];
    const totalOutgoing = React.useMemo(() => outgoingData.reduce((acc: number, val: number) => acc + (val || 0), 0), [outgoingData]);

    const handleTabChange = React.useCallback((index: 0 | 1) => {
        setActiveTab(index);
        UiSounds.playClick();
    }, []);

    return (
        <ScreenModalLayout
            title={sectorName.toUpperCase()}
            subtitle={`${t('ui.sector_report')}  |  ${t(statusKey)}`.toUpperCase()}
            subtitleClass={statusColorClass}
            isMobileDevice={isMobileDevice}
            onClose={onReturnCamp}
            onCancel={onReturnCamp}
            cancelLabel={t('ui.return_camp')}
            onConfirm={!hideConfirm ? confirmAction : undefined}
            confirmLabel={!hideConfirm ? confirmLabel : undefined}
            showCloseButton={true}
        >
            {/* Header / Pager */}
            <div className="flex justify-center mb-8 border-b border-gray-800">
                <TacticalTab
                    label={t('ui.summary')}
                    isActive={activeTab === 0}
                    onClick={() => handleTabChange(0)}
                />
                <TacticalTab
                    label={t('ui.details')}
                    isActive={activeTab === 1}
                    onClick={() => handleTabChange(1)}
                />
            </div>

            {activeTab === 0 ? (
                /* PAGE 1: OVERVIEW SUMMARY */
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-4 items-start">

                    {/* COL 1: PRESTATION */}
                    <div className="space-y-6">
                        <h3 className="text-white font-light uppercase text-xl border-b border-gray-800 pb-2 tracking-tighter">{t('ui.performance')}</h3>
                        <div className="pt-4 space-y-3">
                            <StatBox
                                label={t('ui.family_member')}
                                value={t(familyStatusKey)}
                                colorClass={stats.familyFound || bossKilled ? 'text-green-400' : 'text-red-400'}
                                borderColor={stats.familyFound || bossKilled ? 'border-green-500' : 'border-red-600'}
                                bgColor={stats.familyFound || bossKilled ? 'bg-green-900/10' : 'bg-red-900/10'}
                            />
                            <StatBox
                                label={t('ui.boss_status')}
                                value={t(bossStatusKey)}
                                colorClass={bossKilled ? 'text-green-400' : 'text-red-400'}
                                borderColor={bossKilled ? 'border-green-500' : 'border-red-600'}
                                bgColor={bossKilled ? 'bg-green-900/10' : 'bg-red-900/10'}
                            />
                        </div>

                        <div className="space-y-3">
                            <StatBox label={t('report.stats.xp')} value={`+${stats.xpGained}`} colorClass="text-blue-400" borderColor="border-blue-500" bgColor="bg-blue-900/10" />
                            <StatBox label={t('report.stats.sp')} value={`+${stats.spGained || 0}`} colorClass="text-purple-400" borderColor="border-purple-500" bgColor="bg-purple-900/10" />
                        </div>
                    </div>

                    {/* COL 2: PLUNDRING */}
                    <div className="space-y-6">
                        <h3 className="text-white font-light uppercase text-xl border-b border-gray-800 pb-2 tracking-tighter">{t('ui.scavenging')}</h3>
                        <div className="space-y-3">
                            <StatBox label={t('report.stats.scrap')} value={`+${stats.scrapLooted}`} colorClass="text-yellow-500" borderColor="border-yellow-500" bgColor="bg-yellow-900/10" />
                            <StatBox label={t('report.stats.chests')} value={stats.chestsOpened + stats.bigChestsOpened} colorClass="text-yellow-400" borderColor="border-yellow-600" bgColor="bg-yellow-900/10" />
                        </div>
                    </div>

                    {/* COL 3: EXPLORATION */}
                    <div className="space-y-6">
                        <h3 className="text-white font-light uppercase text-xl border-b border-gray-800 pb-2 tracking-tighter">{t('ui.exploration')}</h3>
                        <div className="space-y-3">
                            <StatBox label={t('ui.collectible')} value={`${stats.collectiblesDiscovered?.length || 0} / 2`} colorClass="text-orange-400" borderColor="border-orange-500" bgColor="bg-orange-900/10" />
                            <StatBox label={t('ui.clues_found')} value={stats.cluesFound?.length || 0} colorClass="text-orange-400" borderColor="border-orange-500" bgColor="bg-orange-900/10" />
                            <StatBox label={t('ui.pois_discovered')} value={stats.discoveredPOIs?.length || 0} colorClass="text-orange-400" borderColor="border-orange-500" bgColor="bg-orange-900/10" />
                        </div>
                        <div className="space-y-3">
                            <StatBox label={t('ui.time_elapsed')} value={formatTime(stats.timeElapsed)} colorClass="text-orange-400" borderColor="border-orange-500" bgColor="bg-orange-900/10" />
                            <StatBox label={t('ui.distance_traveled')} value={formatDistance(stats.distanceTraveled || 0)} colorClass="text-orange-400" borderColor="border-orange-500" bgColor="bg-orange-900/10" />
                        </div>
                    </div>

                    {/* COL 4: STRID */}
                    <div className="space-y-6">
                        <h3 className="text-white font-light uppercase text-xl border-b border-gray-800 pb-2 tracking-tighter">{t('ui.combat')}</h3>
                        <div className="space-y-3">
                            <StatBox label={t('report.stats.shots')} value={stats.shotsFired} colorClass="text-red-400" borderColor="border-red-500" bgColor="bg-red-900/10" />
                            <StatBox label={t('report.stats.accuracy')} value={`${accuracy}%`} colorClass="text-red-400" borderColor="border-red-500" bgColor="bg-red-900/10" />
                            <StatBox label={t('report.stats.kills')} value={totalKills} colorClass="text-red-500" borderColor="border-red-500" bgColor="bg-red-900/10" />
                            <StatBox label={t('report.stats.throwables')} value={stats.throwablesThrown || 0} colorClass="text-red-400" borderColor="border-red-600" bgColor="bg-red-900/10" />
                        </div>
                    </div>
                </div>
            ) : (
                /* PAGE 2: DETAILED COMBAT BREAKDOWN */
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-300 items-start">
                    <TacticalCard color="#ef4444" className="p-5">
                        <div className="flex justify-between items-end mb-4 border-b border-red-500/30 pb-2">
                            <h3 className="text-2xl font-black uppercase tracking-tighter text-red-500">{t('report.damage.incoming')}</h3>
                            <span className="text-xl font-mono text-red-400 font-bold">{Math.round(totalIncoming)}</span>
                        </div>
                        <div className="space-y-4 max-h-[450px] overflow-y-auto pr-2 custom-scrollbar">
                            {Object.entries(stats.incomingDamageBreakdown || {}).map(([enemyId, damageMap]) => {
                                const enemyMapTyped = damageMap as Record<string, number>;
                                const enemyDmg = Object.values(enemyMapTyped || {}).reduce((s: number, v: number) => s + (v || 0), 0);
                                if (enemyDmg <= 0) return null;

                                let attackerName = t('report.labels.unknown');
                                const id = parseInt(enemyId);

                                if (id === DamageID.BOSS) {
                                    attackerName = t('report.labels.boss');
                                } else if (id < 20) { 
                                    attackerName = t(DataResolver.getEnemyName(id as number));
                                } else {
                                    attackerName = t(DataResolver.getDamageName(id));
                                }

                                return (
                                    <div key={enemyId} className="bg-red-950/10 border border-red-500/20 p-3 rounded shadow-inner">
                                        <div className="flex justify-between items-center mb-2 border-b border-red-500/10 pb-1">
                                            <span className="text-red-400 text-xs font-black uppercase tracking-widest">{attackerName}</span>
                                            <span className="text-red-500 font-mono font-bold text-xs">{Math.round(enemyDmg)}</span>
                                        </div>
                                        <div className="space-y-1 pl-2 border-l-2 border-red-500/10">
                                            {Object.entries(enemyMapTyped).map(([attackId, dmg]) => {
                                                if (dmg <= 0) return null;
                                                const atkName = t(DataResolver.getAttackName(parseInt(attackId)));
                                                return <LineItem key={attackId} title={atkName.toUpperCase()} val={dmg} />;
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </TacticalCard>

                    <TacticalCard color="#22c55e" className="p-5">
                        <div className="flex justify-between items-end mb-4 border-b border-green-500/30 pb-2">
                            <h3 className="text-2xl font-black uppercase tracking-tighter text-green-500">{t('report.damage.outgoing')}</h3>
                            <span className="text-xl font-mono text-green-400 font-bold">{Math.round(totalOutgoing)}</span>
                        </div>
                        <div className="space-y-1 max-h-[450px] overflow-y-auto pr-2 custom-scrollbar">
                            {Object.entries(stats.outgoingDamageBreakdown || {}).sort((a: any, b: any) => (b[1] as number) - (a[1] as number)).map(([weaponId, damage]) => {
                                const dmgVal = (damage as number) || 0;
                                if (dmgVal <= 0) return null;

                                const instrumentId = parseInt(weaponId);
                                const name = t(DataResolver.getDamageName(instrumentId));

                                return <LineItem key={weaponId} title={name.toUpperCase()} val={dmgVal} />;
                            })}
                        </div>
                    </TacticalCard>
                </div>
            )}
        </ScreenModalLayout>
    );
};

// --- REUSABLE SUB-COMPONENTS (HOISTED) ---

const StatBox = React.memo(({ label, value, colorClass = 'text-white', borderColor = 'border-blue-500', bgColor = 'bg-blue-900/20' }: { label: string, value: string | number, colorClass?: string, borderColor?: string, bgColor?: string }) => (
    <TacticalCard
        color={borderColor.includes('blue') ? '#3b82f6' : (borderColor.includes('red') ? '#ef4444' : (borderColor.includes('green') ? '#22c55e' : (borderColor.includes('yellow') ? '#eab308' : '#3b82f6')))}
        className="flex flex-col justify-center min-h-[80px]"
    >
        <span className={`block text-[10px] uppercase font-black tracking-widest mb-1 opacity-70 ${colorClass}`}>{label}</span>
        <span className={`text-2xl font-bold uppercase ${colorClass}`}>{value}</span>
    </TacticalCard>
));

const SmallStat = React.memo(({ label, value, colorClass = 'text-slate-400' }: { label: string, value: string | number, colorClass?: string }) => (
    <div className="flex flex-col">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">{label}</span>
        <span className={`text-lg font-bold ${colorClass}`}>{value}</span>
    </div>
));

const LineItem = React.memo(({ title, val, isHeal = false }: { title: string, val: number, isHeal?: boolean }) => (
    <div className="flex justify-between text-sm py-1 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors px-1 rounded">
        <span className="text-white/80">{title}</span>
        <span className={isHeal ? "text-green-400 font-mono" : "text-white font-mono"}>{Math.round(val)}</span>
    </div>
));

export default ScreenSectorReport;