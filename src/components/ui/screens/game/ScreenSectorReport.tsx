import React, { useState, useEffect, useMemo } from 'react';
import { t } from '../../../../utils/i18n';
import { SectorStats } from '../../../../types/StateTypes';
import ScreenModalLayout, { TacticalCard, TacticalTab, TacticalRow } from '../../layout/ScreenModalLayout';
import { StatWeaponIndex, StatEnemyIndex, TELEMETRY_SOURCES_COUNT, TELEMETRY_ATTACKS_PER_SOURCE } from '../../../../entities/player/PlayerTypes';
import { UiSounds } from '../../../../utils/audio/AudioLib';
import { DataResolver } from '../../../../utils/ui/DataResolver';
import { ColorPair, COLORS } from '../../../../utils/ui/ColorUtils';
import { FormatUtils } from '../../../../utils/ui/FormatUtils';
import { StatsBridge } from '../../../../core/data/StatsBridge';

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
    const isAborted = StatsBridge.isSectorAborted(stats) && !deathDetails;
    const statusKey = isFailed ? 'ui.failed' : (isAborted ? 'ui.aborted' : 'ui.completed');
    const statusColor = isFailed ? COLORS.RED : (isAborted ? COLORS.YELLOW : COLORS.GREEN);
    const accuracy = FormatUtils.formatAccuracy(StatsBridge.getShotsFired(stats), StatsBridge.getShotsHit(stats)).replace('%', '');
    const totalKills = StatsBridge.getSectorKills(stats);
    const bossKilled = StatsBridge.isSectorBossDefeated(stats);
    const familyStatusKey = (StatsBridge.isSectorFamilyFound(stats) || bossKilled) ? 'ui.family_member_rescued' : 'ui.family_member_missing';
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

    const totalIncoming = StatsBridge.getSectorDamageTaken(stats);
    const totalOutgoing = StatsBridge.getSectorDamageDealt(stats);

    const handleTabChange = React.useCallback((index: 0 | 1) => {
        setActiveTab(index);
        UiSounds.playClick();
    }, []);

    return (
        <ScreenModalLayout
            title={sectorName.toUpperCase()}
            subtitle={`${t('ui.sector_report')}  |  ${t(statusKey)}`.toUpperCase()}
            subtitleClass={statusColor.str}
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
                                color={StatsBridge.isSectorFamilyFound(stats) || bossKilled ? COLORS.GREEN : COLORS.RED}
                            />
                            <StatBox
                                label={t('ui.boss_status')}
                                value={t(bossStatusKey)}
                                color={bossKilled ? COLORS.GREEN : COLORS.RED}
                            />
                        </div>

                        <div className="space-y-3">
                            <StatBox label={t('report.stats.xp')} value={`+${StatsBridge.getSectorXPGained(stats)}`} color={COLORS.BLUE} />
                            <StatBox label={t('report.stats.sp')} value={`+${StatsBridge.getSectorSPGained(stats)}`} color={COLORS.PURPLE} />
                        </div>
                    </div>

                    {/* COL 2: PLUNDRING */}
                    <div className="space-y-6">
                        <h3 className="text-white font-light uppercase text-xl border-b border-gray-800 pb-2 tracking-tighter">{t('ui.scavenging')}</h3>
                        <div className="space-y-3">
                            <StatBox label={t('report.stats.scrap')} value={`+${StatsBridge.getSectorScrapLooted(stats)}`} color={COLORS.YELLOW} />
                            <StatBox label={t('report.stats.chests')} value={StatsBridge.getChestsOpened(stats) + StatsBridge.getBigChestsOpened(stats)} color={COLORS.YELLOW} />
                        </div>
                    </div>

                    {/* COL 3: EXPLORATION */}
                    <div className="space-y-6">
                        <h3 className="text-white font-light uppercase text-xl border-b border-gray-800 pb-2 tracking-tighter">{t('ui.exploration')}</h3>
                        <div className="space-y-3">
                            <StatBox label={t('ui.collectible')} value={`${StatsBridge.getCollectiblesDiscovered(stats as any)?.length || 0} / 2`} color={COLORS.ORANGE} />
                            <StatBox label={t('ui.clues_found')} value={StatsBridge.getCluesFound(stats as any)?.length || 0} color={COLORS.ORANGE} />
                            <StatBox label={t('ui.pois_discovered')} value={StatsBridge.getDiscoveredPOIs(stats as any)?.length || 0} color={COLORS.ORANGE} />
                        </div>
                        <div className="space-y-3">
                            <StatBox label={t('ui.time_elapsed')} value={FormatUtils.formatTimeMinutes(StatsBridge.getSectorTimeElapsed(stats))} color={COLORS.ORANGE} />
                            <StatBox label={t('ui.distance_traveled')} value={FormatUtils.formatDistance(StatsBridge.getSectorDistanceTraveled(stats))} color={COLORS.ORANGE} />
                        </div>
                    </div>

                    {/* COL 4: STRID */}
                    <div className="space-y-6">
                        <h3 className="text-white font-light uppercase text-xl border-b border-gray-800 pb-2 tracking-tighter">{t('ui.combat')}</h3>
                        <div className="space-y-3">
                            <StatBox label={t('report.stats.shots')} value={StatsBridge.getShotsFired(stats)} color={COLORS.RED} />
                            <StatBox label={t('report.stats.accuracy')} value={`${accuracy}%`} color={COLORS.RED} />
                            <StatBox label={t('report.stats.kills')} value={totalKills} color={COLORS.RED} />
                            <StatBox label={t('report.stats.gibbed')} value={StatsBridge.getGibbedEnemies(stats)} color={COLORS.RED} />
                            <StatBox label={t('report.stats.throwables')} value={StatsBridge.getThrowablesThrown(stats)} color={COLORS.RED} />
                            <StatBox label={t('report.stats.explosive_hits')} value={StatsBridge.getUniqueEnemiesHitByExplosives(stats)} color={COLORS.RED} />
                        </div>
                    </div>
                </div>
            ) : (
                /* PAGE 2: DETAILED COMBAT BREAKDOWN */
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-300 items-start">
                    <TacticalCard color={COLORS.RED} className="p-5">
                        <div className="flex justify-between items-end mb-4 border-b border-red-500/30 pb-2">
                            <h3 className="text-2xl font-black uppercase tracking-tighter text-red-500">{t('report.damage.incoming')}</h3>
                            <span className="text-xl font-mono text-red-400 font-bold">{Math.round(totalIncoming)}</span>
                        </div>
                        <div className="space-y-4 max-h-[450px] overflow-y-auto pr-2 custom-scrollbar">
                            {Array.from({ length: TELEMETRY_SOURCES_COUNT }).map((_, sourceId) => {
                                // 1. Calculate total for this source to see if we should render it
                                const sourceTotal = StatsBridge.getIncomingDamageTotalBySource(stats as any, sourceId);
                                if (sourceTotal <= 0) return null;

                                const sourceInfo = DataResolver.resolveIncomingSource(sourceId);
                                const attackerName = t(sourceInfo.name);
                                const offset = sourceId * TELEMETRY_ATTACKS_PER_SOURCE;

                                return (
                                    <div key={sourceId} className="bg-red-950/10 border border-red-500/20 p-3 rounded shadow-inner">
                                        <div className="flex justify-between items-center mb-2 border-b border-red-500/10 pb-1">
                                            <span className="text-red-400 text-xs font-black uppercase tracking-widest">{attackerName}</span>
                                            <span className="text-red-500 font-mono font-bold text-xs">{Math.round(sourceTotal)}</span>
                                        </div>
                                        <div className="space-y-1 pl-2 border-l-2 border-red-500/10">
                                            {Array.from({ length: TELEMETRY_ATTACKS_PER_SOURCE }).map((_, attackId) => {
                                                const dmg = StatsBridge.getIncomingDamage(stats, sourceId, attackId);
                                                if (dmg <= 0) return null;
                                                const atkName = t(DataResolver.getAttackName(attackId));
                                                return <LineItem key={attackId} title={atkName.toUpperCase()} val={dmg} color={COLORS.RED} />;
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </TacticalCard>

                    <TacticalCard color={COLORS.GREEN} className="p-5">
                        <div className="flex justify-between items-end mb-4 border-b border-green-500/30 pb-2">
                            <h3 className="text-2xl font-black uppercase tracking-tighter text-green-500">{t('report.damage.outgoing')}</h3>
                            <span className="text-xl font-mono text-green-400 font-bold">{Math.round(totalOutgoing)}</span>
                        </div>
                        <div className="space-y-1 max-h-[450px] overflow-y-auto pr-2 custom-scrollbar">
                            {Array.from({ length: StatWeaponIndex.COUNT }).map((_, idx) => {
                                const dmgVal = StatsBridge.getWeaponDamageDealt(stats, idx);
                                if (dmgVal <= 0) return null;

                                const instrumentId = idx;
                                const name = t(DataResolver.getDamageName(instrumentId));

                                return <LineItem key={idx} title={name.toUpperCase()} val={dmgVal} color={COLORS.GREEN} />;
                            })}
                        </div>
                    </TacticalCard>
                </div>
            )}
        </ScreenModalLayout>
    );
};

// --- REUSABLE SUB-COMPONENTS (HOISTED) ---

const StatBox = React.memo(({ label, value, color = COLORS.BLUE }: { label: string, value: string | number, color?: ColorPair }) => {
    return (
        <TacticalCard
            color={color}
            showHover={true}
            className="flex flex-col justify-center min-h-[80px]"
        >
            <span className="block text-[10px] uppercase font-black tracking-widest mb-1 opacity-70" style={{ color: color.str }}>{label}</span>
            <span className="text-2xl font-bold uppercase" style={{ color: color.str }}>{value}</span>
        </TacticalCard>
    );
});

const SmallStat = React.memo(({ label, value, colorClass = 'text-slate-400' }: { label: string, value: string | number, colorClass?: string }) => (
    <div className="flex flex-col">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">{label}</span>
        <span className={`text-lg font-bold ${colorClass}`}>{value}</span>
    </div>
));

const LineItem = React.memo(({ title, val, isHeal = false, color = COLORS.BLUE }: { title: string, val: number, isHeal?: boolean, color?: ColorPair | string }) => (
    <TacticalRow color={color} className="flex justify-between text-sm py-1 border-b border-white/5 last:border-0 px-1 rounded">
        <span className="text-white/80">{title}</span>
        <span className={isHeal ? "text-green-400 font-mono" : "text-white font-mono"}>{Math.round(val)}</span>
    </TacticalRow>
));

export default ScreenSectorReport;

