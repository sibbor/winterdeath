import React, { useState, useEffect, useMemo } from 'react';
import { t } from '../../../utils/i18n';
import { SectorStats } from '../../../types/StateTypes';
import { CareerStats } from '../../../types/CareerStats';
import ModalLayout, { TacticalCard, TacticalTab, TacticalRow } from './ModalLayout';
import { StatWeaponIndex, TELEMETRY_SOURCES_COUNT, TELEMETRY_ATTACKS_PER_SOURCE } from '../../../types/CareerStats';
import { UiSounds } from '../../../utils/audio/AudioLib';
import { DataResolver } from '../../../core/data/DataResolver';
import { ColorPair, COLORS } from '../../../utils/ui/ColorUtils';
import { FormatUtils } from '../../../utils/ui/FormatUtils';
import { StatsBridge } from '../../../core/data/StatsBridge';
import { SectorID } from '../../../game/session/SectorTypes';
import { CHALLENGES, ChallengeCategory, ChallengeDef, ChallengeID } from '../../../content/ChallengeTypes';

interface ScreenSectorReportProps {
    stats: SectorStats;
    playerStats: CareerStats;
    deathDetails: { killer: string } | null;
    onReturnCamp: () => void;
    onRestartSector: () => void;
    onRespawn: () => void;
    onNextSector?: () => void;
    currentSector: number;
    isMobileDevice?: boolean;
}

/**
 * Redesigned Sector Report
 * Features a paged layout for better clarity and hierarchy.
 */
const ScreenSectorReport: React.FC<ScreenSectorReportProps> = ({ stats, playerStats, deathDetails, onReturnCamp, onRestartSector, onRespawn, onNextSector, currentSector, isMobileDevice }) => {
    const [activeTab, setActiveTab] = useState<0 | 1 | 2>(0);

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
    const shotsFired = StatsBridge.getShotsFired(stats);
    const shotsHit = StatsBridge.getShotsHit(stats);
    const accuracyNum = shotsFired > 0 ? Math.floor((shotsHit / shotsFired) * 100) : 0;
    const accuracy = String(accuracyNum);
    const totalKills = StatsBridge.getSectorKills(stats);
    const bossKilled = StatsBridge.isSectorBossDefeated(stats);
    const familyStatusKey = (StatsBridge.isSectorFamilyFound(stats) || bossKilled) ? 'ui.family_member_rescued' : 'ui.family_member_missing';
    const bossStatusKey = bossKilled ? 'ui.boss_dead' : 'ui.boss_alive';

    // Buttons logic
    const showRespawn = isFailed || isAborted;
    const isFinished = !showRespawn;
    const isLastSector = currentSector >= SectorID.SCRAPYARD;

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

    const handleTabChange = React.useCallback((index: 0 | 1 | 2) => {
        setActiveTab(index);
        UiSounds.playClick();
    }, []);

    // Sector-specific discovery totals — Zero-GC: for-loops, no Object.values allocations
    const sectorCollectibles = useMemo(() => {
        const all = DataResolver.getCollectibles();
        const result: any[] = [];
        for (const key in all) {
            if (all[key].sector === currentSector) result.push(all[key]);
        }
        return result;
    }, [currentSector]);

    const sectorClues = useMemo(() => {
        const all = DataResolver.getClues();
        const result: any[] = [];
        for (const key in all) {
            if (all[key].sector === currentSector) result.push(all[key]);
        }
        return result;
    }, [currentSector]);

    const sectorPOIs = useMemo(() => {
        const all = DataResolver.getPois();
        const result: any[] = [];
        for (const key in all) {
            if (all[key].sector === currentSector) result.push(all[key]);
        }
        return result;
    }, [currentSector]);

    const discoveredSectorCollectibles = useMemo(() => {
        const found = StatsBridge.getDiscoveredCollectibles(playerStats);
        const foundSet = new Set<number>();
        for (let i = 0; i < found.length; i++) if (found[i] === 1) foundSet.add(i);
        let count = 0;
        for (let i = 0; i < sectorCollectibles.length; i++) {
            if (foundSet.has(sectorCollectibles[i].id)) count++;
        }
        return count;
    }, [playerStats, sectorCollectibles]);

    const discoveredSectorClues = useMemo(() => {
        const found = StatsBridge.getDiscoveredClues(playerStats);
        const foundSet = new Set<number>();
        for (let i = 0; i < found.length; i++) if (found[i] === 1) foundSet.add(i);
        let count = 0;
        for (let i = 0; i < sectorClues.length; i++) {
            if (foundSet.has(sectorClues[i].id)) count++;
        }
        return count;
    }, [playerStats, sectorClues]);

    const discoveredSectorPOIs = useMemo(() => {
        const found = StatsBridge.getDiscoveredPois(playerStats);
        const foundSet = new Set<number>();
        for (let i = 0; i < found.length; i++) if (found[i] === 1) foundSet.add(i);
        let count = 0;
        for (let i = 0; i < sectorPOIs.length; i++) {
            if (foundSet.has(sectorPOIs[i].id)) count++;
        }
        return count;
    }, [playerStats, sectorPOIs]);

    return (
        <ModalLayout
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
                <TacticalTab
                    label={t('challenges.title')}
                    isActive={activeTab === 2}
                    onClick={() => handleTabChange(2)}
                />
            </div>

            {activeTab === 0 ? (
                /* PAGE 1: OVERVIEW SUMMARY */
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-4 items-start">

                    {/* COL 1: PRESTATION */}
                    <div className="space-y-6">
                        <h3 className="text-white font-light uppercase text-xl border-b border-gray-800 pb-2 tracking-tighter">{t('ui.performance')}</h3>
                        <div className="space-y-3">
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
                            <StatBox label={t('ui.collectibles_discovered')} value={`${discoveredSectorCollectibles} / ${sectorCollectibles.length}`} color={COLORS.ORANGE} />
                            <StatBox label={t('ui.clues_discovered')} value={`${discoveredSectorClues} / ${sectorClues.length}`} color={COLORS.ORANGE} />
                            <StatBox label={t('ui.pois_discovered')} value={`${discoveredSectorPOIs} / ${sectorPOIs.length}`} color={COLORS.ORANGE} />
                        </div>
                        <div className="space-y-3">
                            <StatBox label={t('ui.time_elapsed')} value={FormatUtils.formatTimeSmart(StatsBridge.getSectorTimeElapsed(stats))} color={COLORS.ORANGE} />
                            <StatBox label={t('ui.distance_traveled')} value={FormatUtils.formatDistanceSmart(StatsBridge.getSectorDistanceTraveled(stats))} color={COLORS.ORANGE} />
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
            ) : activeTab === 1 ? (
                /* PAGE 2: DETAILED COMBAT BREAKDOWN */
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-300 items-start">
                    <TacticalCard color={COLORS.RED} className="p-5">
                        <div className="flex justify-between items-end mb-4 border-b border-red-500/30 pb-2">
                            <h3 className="text-2xl font-black uppercase tracking-tighter text-red-500">{t('report.damage.incoming')}</h3>
                            <span className="text-xl font-mono text-red-400 font-bold">{Math.round(totalIncoming)}</span>
                        </div>
                        <div className="space-y-6 max-h-[450px] overflow-y-auto pr-2 custom-scrollbar">
                            {(() => {
                                const incomingCategories = ['ui.enemy', 'weapon', 'ability', 'vehicle', 'environment'];
                                const incomingLabels: Record<string, string> = {
                                    'ui.enemy': 'ui.enemies',
                                    'weapon': 'ui.category_weapons',
                                    'ability': 'ui.category_tactics',
                                    'vehicle': 'ui.transport',
                                    'environment': 'ui.environmental'
                                };

                                return incomingCategories.map(catKey => {
                                    const sourceItems: any[] = [];
                                    for (let sourceId = 0; sourceId < TELEMETRY_SOURCES_COUNT; sourceId++) {
                                        const sourceTotal = StatsBridge.getIncomingDamageTotalBySource(stats as any, sourceId);
                                        if (sourceTotal <= 0) continue;

                                        const sourceInfo = DataResolver.resolveIncomingSource(sourceId);
                                        if (sourceInfo.category === catKey) {
                                            sourceItems.push({ id: sourceId, info: sourceInfo, total: sourceTotal });
                                        }
                                    }

                                    if (sourceItems.length === 0) return null;

                                    return (
                                        <div key={catKey} className="space-y-3">
                                            <h4 className="text-[10px] font-black text-red-500/50 uppercase tracking-widest border-l-2 border-red-500/20 pl-2">
                                                {t(incomingLabels[catKey])}
                                            </h4>
                                            <div className="space-y-3">
                                                {sourceItems.map(item => (
                                                    <div key={item.id} className="bg-red-950/10 border border-red-500/20 p-3 rounded shadow-inner">
                                                        <div className="flex justify-between items-center mb-2 border-b border-red-500/10 pb-1">
                                                            <span className="text-red-400 text-xs font-black uppercase tracking-widest">{t(item.info.name)}</span>
                                                            <span className="text-red-500 font-mono font-bold text-xs">{Math.round(item.total)}</span>
                                                        </div>
                                                        <div className="space-y-1 pl-2 border-l-2 border-red-500/10">
                                                            {Array.from({ length: TELEMETRY_ATTACKS_PER_SOURCE }).map((_, attackId) => {
                                                                const dmg = StatsBridge.getIncomingDamage(stats, item.id, attackId);
                                                                if (dmg <= 0) return null;
                                                                const atkName = t(DataResolver.getAttackName(attackId));
                                                                return <LineItem key={attackId} title={atkName.toUpperCase()} val={dmg} color={COLORS.RED} />;
                                                            })}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                    </TacticalCard>

                    <TacticalCard color={COLORS.GREEN} className="p-5">
                        <div className="flex justify-between items-end mb-4 border-b border-green-500/30 pb-2">
                            <h3 className="text-2xl font-black uppercase tracking-tighter text-green-500">{t('report.damage.outgoing')}</h3>
                            <span className="text-xl font-mono text-green-400 font-bold">{Math.round(totalOutgoing)}</span>
                        </div>
                        <div className="space-y-6 max-h-[450px] overflow-y-auto pr-2 custom-scrollbar">
                            {(() => {
                                const categories = ['weapon', 'ability', 'vehicle', 'environment'];
                                const labels: Record<string, string> = {
                                    'weapon': 'ui.category_weapons',
                                    'ability': 'ui.category_tactics',
                                    'vehicle': 'ui.transport',
                                    'environment': 'report.labels.unknown'
                                };

                                return categories.map(cat => {
                                    const items: any[] = [];
                                    for (let i = 0; i < StatWeaponIndex.COUNT; i++) {
                                        const dmgVal = StatsBridge.getWeaponDamageDealt(stats, i);
                                        if (dmgVal <= 0) continue;
                                        const data = DataResolver.getDamageData(i);
                                        if (data.categoryName === cat) {
                                            items.push({ id: i, name: data.name, val: dmgVal });
                                        }
                                    }

                                    if (items.length === 0) return null;

                                    return (
                                        <div key={cat} className="space-y-2">
                                            <h4 className="text-[10px] font-black text-green-500/50 uppercase tracking-widest border-l-2 border-green-500/20 pl-2">
                                                {t(labels[cat])}
                                            </h4>
                                            <div className="space-y-1">
                                                {items.map(item => (
                                                    <LineItem key={item.id} title={t(item.name).toUpperCase()} val={item.val} color={COLORS.GREEN} />
                                                ))}
                                            </div>
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                    </TacticalCard>
                </div>
            ) : (
                <ChallengesProgressPage stats={stats} playerStats={playerStats} isMobileDevice={isMobileDevice} />
            )}
        </ModalLayout>
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

const CHALLENGE_CATEGORY_COLORS: Record<number, ColorPair> = {
    [ChallengeCategory.WORLD]: COLORS.BLUE,
    [ChallengeCategory.COMBAT]: COLORS.RED,
    [ChallengeCategory.WEAPONS]: COLORS.YELLOW,
    [ChallengeCategory.TACTICS]: COLORS.PURPLE,
    [ChallengeCategory.PLAYER]: COLORS.GREEN,
};

const ChallengesProgressPage: React.FC<{
    stats: SectorStats;
    playerStats: CareerStats;
    isMobileDevice?: boolean;
}> = React.memo(({ stats, playerStats, isMobileDevice }) => {
    const progressedChallenges = useMemo(() => {
        const list: Array<{
            def: ChallengeDef;
            startVal: number;
            currentVal: number;
            added: number;
            tier: number;
            target: number;
            prevTarget: number;
            categoryColor: ColorPair;
        }> = [];

        for (let i = 0; i < ChallengeID.COUNT; i++) {
            const def = CHALLENGES[i];
            const startVal = stats.challengeStartValues ? stats.challengeStartValues[i] : 0;
            const currentVal = StatsBridge.getChallengeValue(playerStats, i);
            const added = currentVal - startVal;

            if (added > 0.0001) {
                const tier = StatsBridge.getChallengeTier(playerStats, i);
                const nextTier = tier < 3 ? tier + 1 : 3;
                const target = def.targets[nextTier - 1] || 1;
                const prevTarget = tier > 0 ? def.targets[tier - 1] : 0;
                const categoryColor = CHALLENGE_CATEGORY_COLORS[def.categoryId] || COLORS.GRAY;

                list.push({ def, startVal, currentVal, added, tier, target, prevTarget, categoryColor });
            }
        }
        return list;
    }, [stats, playerStats]);

    if (progressedChallenges.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-zinc-800 rounded bg-zinc-950/20 text-center animate-in fade-in duration-300">
                <span className="text-zinc-500 font-mono text-xs uppercase tracking-widest">
                    {t('challenges.no_progress') || 'NO CHALLENGE PROGRESS REGISTERED THIS SESSION'}
                </span>
            </div>
        );
    }

    return (
        <div className={`grid ${isMobileDevice ? 'grid-cols-1 gap-4' : 'grid-cols-1 md:grid-cols-2 gap-6'} pb-12 animate-in fade-in duration-300`}>
            {progressedChallenges.map(({ def, startVal, currentVal, added, tier, target, prevTarget, categoryColor }) => {
                const nextTier = tier < 3 ? tier + 1 : 3;
                const isMaxed = tier >= 3;

                // Stacked progress calculations relative to current tier bracket
                const range = target - prevTarget;
                const startProgressPercent = Math.max(0, ((startVal - prevTarget) / range) * 100);
                const currentProgressPercent = Math.min(100, ((currentVal - prevTarget) / range) * 100);
                const sessionProgressPercent = Math.max(0, currentProgressPercent - startProgressPercent);

                return (
                    <TacticalCard
                        key={def.id}
                        showHover={true}
                        color={categoryColor}
                        className="p-4 bg-zinc-900/50 border-white/5 relative overflow-hidden"
                    >
                        <div className="flex justify-between items-start mb-2 relative z-10">
                            <div className="flex flex-col">
                                <h4 className="text-lg font-bold text-white uppercase tracking-tight">
                                    {t(def.titleKey)}
                                </h4>
                                <p className="text-[11px] text-zinc-500 italic mt-1 leading-tight max-w-[85%]">
                                    {t(def.descriptionKey).replace('{target}', target.toString())}
                                </p>
                            </div>

                            <div className="flex flex-col items-end">
                                <div className="flex gap-1">
                                    {[1, 2, 3].map(i => (
                                        <div
                                            key={i}
                                            className={`w-3 h-1.5 rounded-full ${i <= tier ? 'bg-yellow-500' : 'bg-zinc-800'}`}
                                        />
                                    ))}
                                </div>
                                <span className="text-[10px] font-black text-zinc-600 uppercase mt-1">
                                    {isMaxed ? t('ui.challenge_mastered') : t('ui.challenge_tier', { tier: nextTier })}
                                </span>
                            </div>
                        </div>

                        <div className="mt-4 space-y-1.5 relative z-10">
                            <div className="flex justify-between text-[10px] font-mono">
                                <div className="flex items-center gap-1 font-bold">
                                    <span className="text-white">{Math.floor(startVal).toLocaleString()}</span>
                                    <span className="text-yellow-500">+{Math.floor(added).toLocaleString()}</span>
                                </div>
                                <span className="text-zinc-400">{target.toLocaleString()}</span>
                            </div>
                            <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden flex">
                                {isMaxed ? (
                                    <div className="h-full w-full bg-yellow-500" />
                                ) : (
                                    <>
                                        {/* Start Value Progress segment */}
                                        {startProgressPercent > 0 && (
                                            <div
                                                style={{ width: `${startProgressPercent}%`, backgroundColor: categoryColor.str }}
                                                className="h-full opacity-40"
                                            />
                                        )}
                                        {/* Session Progress segment */}
                                        {sessionProgressPercent > 0 && (
                                            <div
                                                style={{ width: `${sessionProgressPercent}%` }}
                                                className="h-full bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.6)] animate-pulse"
                                            />
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </TacticalCard>
                );
            })}
        </div>
    );
});

export default ScreenSectorReport;

