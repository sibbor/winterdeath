import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { PlayerStats, PlayerStatID, StatEnemyIndex } from '../../../../entities/player/PlayerTypes';
import { DamageID } from '../../../../entities/player/CombatTypes';
import { t } from '../../../../utils/i18n';
import { useOrientation } from '../../../../hooks/useOrientation';
import ScreenModalLayout, {
    HORIZONTAL_HATCHING_STYLE,
    TacticalCard,
    TacticalButton,
    GRITTY_HEADER_TITLE_STYLE
} from '../../layout/ScreenModalLayout';
import CollectiblePreview from '../../core/CollectiblePreview';
import { UiSounds } from '../../../../utils/audio/AudioLib';
import { DataResolver } from '../../../../utils/ui/DataResolver';
import { PERKS, PerkCategory } from '../../../../content/perks';
import { WEAPONS, WeaponCategory } from '../../../../content/weapons';

interface ScreenStatisticsProps {
    stats: PlayerStats;
    onClose: () => void;
    onOpenDiscovery?: () => void;
    onMarkCollectiblesViewed?: (collectibleIds: string[]) => void;
    isMobileDevice?: boolean;
    debugMode?: boolean;
    initialTab?: 'overview' | 'performance' | 'combat' | 'weapons' | 'perks';
    initialItemId?: string | null;
}

type Tab = 'overview' | 'performance' | 'combat' | 'weapons' | 'perks';

// --- ZERO-GC STATIC ARRAYS & CONFIGS ---
const TABS: { id: Tab, label: string }[] = [
    { id: 'overview', label: 'ui.overview' },
    { id: 'performance', label: 'ui.performance' },
    { id: 'combat', label: 'ui.combat' },
    { id: 'weapons', label: 'ui.weapons' },
    { id: 'perks', label: 'ui.perks' },
];

const THEME_COLOR = '#3b82f6'; // blue-500

const darkenColor = (hex: string, percent: number) => {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) - amt;
    const G = (num >> 8 & 0x00FF) - amt;
    const B = (num & 0x0000FF) - amt;
    return '#' + (0x1000000 + (R < 255 ? R < 0 ? 0 : R : 255) * 0x10000 + (G < 255 ? G < 0 ? 0 : G : 255) * 0x100 + (B < 255 ? B < 0 ? 0 : B : 255)).toString(16).slice(1);
};

// --- ANALYTICAL HELPERS (Zero-GC / DPI-Safe) ---
const findSignatureWeapon = (killsBuffer: Float64Array) => {
    let maxKills = -1;
    let signatureIdx = -1;
    for (let i = 0; i < killsBuffer.length; i++) {
        if (killsBuffer[i] > maxKills) {
            maxKills = killsBuffer[i];
            signatureIdx = i;
        }
    }
    return { id: signatureIdx, count: maxKills };
};

const findComfortWeapon = (timeBuffer: Float64Array) => {
    let maxTime = -1;
    let comfortIdx = -1;
    for (let i = 0; i < timeBuffer.length; i++) {
        if (timeBuffer[i] > maxTime) {
            maxTime = timeBuffer[i];
            comfortIdx = i;
        }
    }
    return { id: comfortIdx, time: maxTime };
};

const findNemesis = (deathsRecord: Record<number, number>) => {
    let maxDeaths = -1;
    let nemesisIdx = -1;
    const keys = Object.keys(deathsRecord);
    for (let i = 0; i < keys.length; i++) {
        const id = parseInt(keys[i]);
        if (deathsRecord[id] > maxDeaths) {
            maxDeaths = deathsRecord[id];
            nemesisIdx = id;
        }
    }
    return { id: nemesisIdx, count: maxDeaths };
};

const ScreenStatistics: React.FC<ScreenStatisticsProps> = ({ stats, onClose, onOpenDiscovery, isMobileDevice, debugMode, initialTab, initialItemId }) => {
    const { isLandscapeMode } = useOrientation();
    const effectiveLandscape = isLandscapeMode || !isMobileDevice;
    const [activeTab, setActiveTab] = useState<Tab>(initialTab || 'overview');

    const { level, currentXp, nextLevelXp } = useMemo(() => ({
        level: Math.floor(stats.statsBuffer[PlayerStatID.LEVEL]),
        currentXp: Math.floor(stats.statsBuffer[PlayerStatID.CURRENT_XP]),
        nextLevelXp: Math.floor(stats.statsBuffer[PlayerStatID.NEXT_LEVEL_XP])
    }), [stats.statsBuffer]);

    // Scroll to item if provided
    useEffect(() => {
        if (initialItemId) {
            setTimeout(() => {
                const el = document.getElementById(`log-item-${initialItemId}`);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    el.classList.add('animate-discovery-flash');
                    setTimeout(() => el.classList.remove('animate-discovery-flash'), 2500);
                }
            }, 100);
        }
    }, [initialItemId, activeTab]);

    // Keyboard support for closing
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' || e.key === 'Enter') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const handleTabChange = useCallback((tab: Tab) => {
        UiSounds.playClick();
        setActiveTab(tab);
    }, []);

    return (
        <ScreenModalLayout
            title={t('ui.statistics')}
            isMobileDevice={isMobileDevice}
            onClose={onClose}
            onCancel={onClose}
            cancelLabel={t('ui.close')}
            titleColorClass="text-blue-500"
            tabs={TABS.map(t => t.id)}
            activeTab={activeTab}
            onTabChange={handleTabChange}
            tabOrientation={effectiveLandscape ? 'vertical' : 'horizontal'}
        >
            <div className={`flex h-full dossier-bg p-4 rounded-lg overflow-hidden ${effectiveLandscape ? 'flex-row gap-8' : 'flex-col gap-4'}`}>
                <div className={`relative shrink-0 ${effectiveLandscape ? 'w-1/3 flex flex-col gap-4 overflow-y-auto pl-safe custom-scrollbar' : ''}`}>
                    <div className={`${effectiveLandscape ? 'flex flex-col gap-4 pt-4 pr-10' : 'flex gap-2 border-b-2 border-zinc-800 pb-2 md:pb-4 overflow-x-auto px-4 pt-2 items-end scrollbar-hide'}`}>
                        {TABS.map(tab => {
                            const isActive = activeTab === tab.id;
                            return (
                                <button key={tab.id} onClick={() => handleTabChange(tab.id as Tab)}
                                    className={`px-3 md:px-6 py-1.5 md:py-4 transition-all duration-200 hover:scale-105 active:scale-95 whitespace-nowrap flex justify-between items-center border-2 relative overflow-hidden group/tab
                                        ${isActive ? 'text-white animate-tab-pulsate border-white' : 'bg-transparent text-zinc-400 hover:bg-white/5 border-zinc-700'} 
                                        ${effectiveLandscape ? 'w-full text-left p-4 md:p-6 text-xl font-semibold uppercase tracking-wider mx-2' : 'text-[10px] md:text-lg font-bold uppercase tracking-widest'}
                                    `}
                                    style={isActive ? { backgroundColor: darkenColor(THEME_COLOR, 20), '--pulse-color': THEME_COLOR } as any : {}}
                                >
                                    {isActive && (
                                        <div className="absolute inset-0 opacity-20 transition-opacity"
                                            style={HORIZONTAL_HATCHING_STYLE}
                                        />
                                    )}
                                    <span className="relative z-10">{t(tab.label)}</span>
                                    {isActive && effectiveLandscape && <span className="text-white font-bold ml-2 relative z-10">→</span>}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar relative">
                    {activeTab === 'overview' && (
                        <OverviewTab
                            stats={stats}
                            currentXp={currentXp}
                            nextLevelXp={nextLevelXp}
                            level={level}
                            isMobileDevice={!effectiveLandscape}
                            onOpenDiscovery={onOpenDiscovery}
                        />
                    )}
                    {activeTab === 'performance' && (
                        <PerformanceTab
                            stats={stats}
                            level={level}
                            currentXp={currentXp}
                            onOpenDiscovery={onOpenDiscovery}
                            isMobileDevice={!effectiveLandscape}
                        />
                    )}
                    {activeTab === 'combat' && (
                        <CombatTab
                            stats={stats}
                            isMobileDevice={!effectiveLandscape}
                        />
                    )}
                    {activeTab === 'weapons' && (
                        <div>
                            <WeaponsTab stats={stats} color={THEME_COLOR} isMobileDevice={!effectiveLandscape} />
                        </div>
                    )}
                    {activeTab === 'perks' && (
                        <div>
                            <PerksTab
                                stats={stats}
                                t={t}
                                effectiveLandscape={effectiveLandscape}
                            />
                        </div>
                    )}
                </div>
            </div>

            <style>{`
                @keyframes discoveryFlash {
                    0%, 100% { box-shadow: 0 0 0px rgba(220, 38, 38, 0); border-color: inherit; }
                    50% { box-shadow: 0 0 30px rgba(220, 38, 38, 0.8), inset 0 0 15px rgba(220, 38, 38, 0.3); border-color: rgba(220, 38, 38, 1) !important; }
                }
                .animate-discovery-flash {
                    animation: discoveryFlash 1.25s ease-in-out 2 !important;
                    transition: border-color 1.0s;
                }
                .dossier-bg {
                    background-image: 
                        linear-gradient(rgba(18, 18, 20, 0.95), rgba(18, 18, 20, 0.98)),
                        linear-gradient(rgba(59, 130, 246, 0.03) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(59, 130, 246, 0.03) 1px, transparent 1px);
                    background-size: 100% 100%, 30px 30px, 30px 30px;
                    position: relative;
                }
                .dossier-bg::before {
                    content: "";
                    position: absolute;
                    inset: 0;
                    background: linear-gradient(rgba(18, 18, 20, 0) 50%, rgba(0, 0, 0, 0.15) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.02), rgba(0, 255, 0, 0.01), rgba(0, 0, 255, 0.02));
                    background-size: 100% 4px, 3px 100%;
                    pointer-events: none;
                    z-index: 50;
                    opacity: 0.3;
                }
            `}</style>
        </ScreenModalLayout>
    );
};

const OverviewTab: React.FC<{ stats: PlayerStats, level: number, currentXp: number, nextLevelXp: number, isMobileDevice?: boolean, onOpenDiscovery?: () => void }> = React.memo(({ stats, level, currentXp, nextLevelXp, isMobileDevice, onOpenDiscovery }) => {
    const sb = stats.statsBuffer;

    const {
        scrapTotal, avgDistance, avgTime,
        totalDistanceKm, totalTimeH, discoveryPoints, marathonProgress
    } = useMemo(() => {
        const ST = Math.floor(sb[PlayerStatID.TOTAL_SCRAP_COLLECTED]);
        const SESS = Math.max(1, sb[PlayerStatID.TOTAL_SESSIONS_STARTED]);
        const totalDist = sb[PlayerStatID.TOTAL_DISTANCE_TRAVELED] || 0;
        const totalTime = sb[PlayerStatID.TOTAL_GAME_TIME] || 0;
        const discPoints = (stats.discoveredPOIs?.length || 0) + (stats.discoveredCollectibles?.length || 0) + (stats.cluesFound?.length || 0);

        return {
            scrapTotal: ST,
            avgDistance: (totalDist / SESS).toFixed(2),
            avgTime: (totalTime / SESS / 60).toFixed(1),
            totalDistanceKm: totalDist.toFixed(2),
            totalTimeH: (totalTime / 3600).toFixed(1),
            discoveryPoints: discPoints,
            marathonProgress: Math.min(100, (totalDist / 42.195) * 100).toFixed(1)
        };
    }, [sb, stats.discoveredPOIs, stats.discoveredCollectibles, stats.cluesFound]);

    const getRank = (lvl: number) => t(DataResolver.getRankName(lvl));
    const FAMILY_MEMBERS = DataResolver.getFamilyMembers();

    return (
        <div className="flex flex-col h-full gap-6 pb-12 overflow-y-auto pr-2 custom-scrollbar bg-zinc-950/20 backdrop-blur-sm rounded-lg p-1">
            <div className={`grid ${isMobileDevice ? 'grid-cols-1' : 'grid-cols-2'} gap-6`}>
                <TacticalCard color="#3b82f6" className="flex flex-col items-center text-center shadow-[inset_0_0_50px_rgba(59,130,246,0.1)]">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-blue-500/5 rounded-full scale-0 group-hover:scale-[6] transition-transform duration-700 pointer-events-none" />
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500/50 to-transparent opacity-50 relative z-10" />
                    <span className="text-blue-500/60 text-[10px] font-black uppercase tracking-[0.3em] mb-3">{t('ui.current_rank')}</span>
                    <h1 className="text-4xl font-light text-white uppercase tracking-tighter mb-4 leading-none">{getRank(level)}</h1>

                    <div className="w-full bg-blue-950/40 h-1.5 border border-blue-900/50 relative mb-2">
                        <div className="h-full bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.6)] transition-all duration-1000" style={{ width: `${nextLevelXp > 0 ? (currentXp / nextLevelXp) * 100 : 0}%` }} />
                    </div>

                    <div className="flex justify-between w-full text-[10px] font-mono font-bold text-blue-400/80 mb-2 px-1">
                        <span className="bg-blue-500/10 px-2 py-0.5 rounded italic">{t('ui.lvl')} {level}</span>
                        <span className="tracking-tighter">{currentXp.toLocaleString()} / {nextLevelXp.toLocaleString()} XP</span>
                    </div>

                    <div className="flex items-center justify-between w-full text-[10px] font-mono font-bold px-1 border-t border-blue-500/10 pt-2 opacity-80">
                        <span className="text-blue-500/60 uppercase tracking-widest">{t('ui.next_rank')}</span>
                        <span className="text-white uppercase tracking-tighter">{getRank(level + 1)}</span>
                    </div>
                </TacticalCard>
                <TacticalCard color="#3b82f6" className="group shadow-inner">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-blue-500/5 rounded-full scale-0 group-hover:scale-[6] transition-transform duration-700 pointer-events-none" />
                    <h3 className="text-xl font-light text-white uppercase tracking-wider mb-6 border-b border-zinc-800 pb-3 relative z-10">{t('ui.family_header')}</h3>
                    <div className="flex flex-col gap-4 relative z-10">
                        <div className="flex flex-wrap items-baseline gap-2">
                            <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest shrink-0">{t('ui.rescued')}:</span>
                            <span className="text-sm font-bold tracking-tight text-white/90">
                                {FAMILY_MEMBERS.filter(m => stats.rescuedFamilyIds.includes(m.id)).map(m => m.name).join(', ') || t('ui.none')}
                            </span>
                        </div>
                        <div className="flex flex-wrap items-baseline gap-2 pt-2 border-t border-zinc-800/50">
                            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest shrink-0">{t('ui.missing')}:</span>
                            <span className="text-sm font-medium text-zinc-500 italic">
                                {FAMILY_MEMBERS.filter(m => !stats.rescuedFamilyIds.includes(m.id)).map(m => m.name).join(', ') || t('ui.none')}
                            </span>
                        </div>
                    </div>
                </TacticalCard>
            </div>

            {/* HERO ROW: CAREER MILESTONES */}
            <div className={`grid ${isMobileDevice ? 'grid-cols-2' : 'grid-cols-4'} gap-4`}>
                <div className="bg-blue-900/10 border-2 border-blue-500/20 p-4 flex flex-col relative group overflow-hidden">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 bg-blue-500/5 rounded-full scale-0 group-hover:scale-[6] transition-transform duration-700 pointer-events-none" />
                    <span className="text-blue-500/60 text-[9px] font-black uppercase tracking-[0.2em] mb-1 relative z-10">{t('ui.global_explorer')}</span>
                    <span className="text-3xl font-light text-white font-mono relative z-10">{totalDistanceKm} <span className="text-xs">{t('ui.km')}</span></span>

                    <div className="mt-auto pt-2 relative z-10">
                        <div className="w-full bg-blue-950/40 h-1 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 shadow-[0_0_5px_rgba(59,130,246,1)]" style={{ width: `${marathonProgress}%` }}></div>
                        </div>
                        <span className="text-[8px] font-bold text-blue-400/50 uppercase mt-1 block">{t('ui.marathon_progress')}: {marathonProgress}%</span>
                    </div>
                </div>

                <div className="bg-blue-950/10 border-2 border-blue-500/20 p-4 flex flex-col relative group overflow-hidden">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 bg-blue-500/5 rounded-full scale-0 group-hover:scale-[6] transition-transform duration-700 pointer-events-none" />
                    <span className="text-blue-500/60 text-[9px] font-black uppercase tracking-[0.2em] mb-1 relative z-10">{t('ui.survival_legacy')}</span>
                    <span className="text-3xl font-light text-white font-mono relative z-10">{totalTimeH} <span className="text-xs">{t('ui.hrs')}</span></span>
                    <span className="mt-auto text-[9px] font-black text-blue-500/30 uppercase tracking-widest relative z-10">{t('ui.on_field_time')}</span>
                </div>

                <div className="bg-blue-950/10 border-2 border-blue-500/20 p-4 flex flex-col relative group overflow-hidden">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 bg-blue-500/5 rounded-full scale-0 group-hover:scale-[6] transition-transform duration-700 pointer-events-none" />
                    <span className="text-blue-500/60 text-[9px] font-black uppercase tracking-[0.2em] mb-1 relative z-10">{t('ui.world_discovery')}</span>
                    <span className="text-3xl font-light text-white font-mono relative z-10">{discoveryPoints}</span>
                    <span className="mt-auto text-[9px] font-black text-blue-500/30 uppercase tracking-widest relative z-10">{t('ui.total_intel_found')}</span>
                </div>

                <div className="bg-blue-950/10 border-2 border-blue-500/20 p-4 flex flex-col relative group overflow-hidden">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 bg-blue-500/5 rounded-full scale-0 group-hover:scale-[6] transition-transform duration-700 pointer-events-none" />
                    <span className="text-blue-500/60 text-[9px] font-black uppercase tracking-[0.2em] mb-1 relative z-10">{t('ui.family_savior')}</span>
                    <span className="text-3xl font-light text-white font-mono relative z-10">{stats.familyFoundCount}</span>
                    <span className="mt-auto text-[9px] font-black text-blue-500/30 uppercase tracking-widest relative z-10">{t('ui.members_protected')}</span>
                </div>
            </div>
        </div>
    );
});

const PerformanceTab: React.FC<{ stats: PlayerStats, level: number, currentXp: number, onOpenDiscovery?: () => void, isMobileDevice?: boolean }> = React.memo(({ stats, level, currentXp, onOpenDiscovery, isMobileDevice }) => {
    const sb = stats.statsBuffer;
    const totalDodges = Math.floor(sb[PlayerStatID.TOTAL_DODGES] || 0);
    const totalRushes = Math.floor(sb[PlayerStatID.TOTAL_RUSHES] || 0);
    const totalRushDistance = (sb[PlayerStatID.TOTAL_RUSH_DISTANCE] || 0).toFixed(1);
    const hasData = stats.sectorsCompleted > 0 || stats.totalSkillPointsEarned > 0 || sb[PlayerStatID.TOTAL_GAME_TIME] > 10;

    const scrapDensity = stats.sectorsCompleted > 0 ? (sb[PlayerStatID.TOTAL_SCRAP_COLLECTED] / stats.sectorsCompleted).toFixed(0) : '0';

    if (!hasData) {
        return (
            <div className="flex flex-col items-center justify-center p-20 border-2 border-dashed border-zinc-800 bg-zinc-900/10">
                <span className="text-zinc-600 font-black text-xs uppercase tracking-[0.4em] mb-2 text-center">{t('ui.no_intel_gained')}</span>
                <span className="text-zinc-400 font-light text-sm text-center uppercase tracking-widest">{t('ui.continue_to_play_performance')}</span>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full gap-6 pb-12 overflow-y-auto pr-2 custom-scrollbar">
            <div className="bg-zinc-900/20 border border-zinc-800 p-8 w-full">
                <h3 className="text-2xl font-light text-white uppercase tracking-tighter mb-8 border-b-2 border-zinc-800 pb-4">{t('ui.performance')}</h3>
                <div className={`grid ${isMobileDevice ? 'grid-cols-2' : 'grid-cols-4'} gap-4 mb-8`}>
                    <div className="bg-blue-900/10 border-2 border-blue-500/20 p-6 flex flex-col items-center justify-center relative group overflow-hidden shadow-inner">
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 bg-blue-500/5 rounded-full scale-0 group-hover:scale-[6] transition-transform duration-700 pointer-events-none" />
                        <span className="text-blue-500/60 text-[10px] font-black uppercase tracking-[0.2em] mb-2 relative z-10">{t('ui.xp_earned')}</span>
                        <span className="text-2xl font-light text-white font-mono relative z-10">{(currentXp + ((level - 1) * 1000)).toLocaleString()}</span>
                    </div>
                    <div className="bg-purple-900/10 border-2 border-purple-500/20 p-6 flex flex-col items-center justify-center relative group overflow-hidden shadow-inner">
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 bg-purple-500/5 rounded-full scale-0 group-hover:scale-[6] transition-transform duration-700 pointer-events-none" />
                        <span className="text-purple-500/60 text-[10px] font-black uppercase tracking-[0.2em] mb-2 relative z-10">{t('ui.sp_earned')}</span>
                        <span className="text-2xl font-light text-white font-mono relative z-10">{stats.totalSkillPointsEarned}</span>
                    </div>
                    <div className="bg-yellow-900/10 border-2 border-yellow-500/20 p-6 flex flex-col items-center justify-center relative group overflow-hidden shadow-inner">
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 bg-yellow-500/5 rounded-full scale-0 group-hover:scale-[6] transition-transform duration-700 pointer-events-none" />
                        <span className="text-yellow-500/60 text-[10px] font-black uppercase tracking-[0.2em] mb-2 relative z-10">{t('ui.scrap_scavenged')}</span>
                        <span className="text-2xl font-light text-white font-mono relative z-10">{Math.floor(sb[PlayerStatID.TOTAL_SCRAP_COLLECTED] || 0).toLocaleString()}</span>
                    </div>
                    <div className="bg-green-900/10 border-2 border-green-500/20 p-6 flex flex-col items-center justify-center relative group overflow-hidden shadow-inner">
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 bg-green-500/5 rounded-full scale-0 group-hover:scale-[6] transition-transform duration-700 pointer-events-none" />
                        <span className="text-green-500/60 text-[10px] font-black uppercase tracking-[0.2em] mb-2 relative z-10">{t('ui.scrap_density')}</span>
                        <span className="text-2xl font-light text-white font-mono relative z-10">{scrapDensity}</span>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-6 bg-black/20 p-6 border border-zinc-800/50">
                    <div className="flex justify-between items-end border-b border-zinc-800 pb-2">
                        <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">{t('ui.sectors_completed')}</span>
                        <span className="text-white font-mono text-lg">{stats.sectorsCompleted}</span>
                    </div>
                    <div className="flex justify-between items-end border-b border-zinc-800 pb-2">
                        <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">{t('ui.chests_opened')}</span>
                        <span className="text-white font-mono text-lg">{stats.chestsOpened + stats.bigChestsOpened}</span>
                    </div>
                    <div className="flex justify-between items-end border-b border-zinc-800 pb-2">
                        <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">{t('ui.total_game_time')}</span>
                        <span className="text-white font-mono text-lg">{(sb[PlayerStatID.TOTAL_GAME_TIME] / 3600).toFixed(1)} {t('ui.h')}</span>
                    </div>
                    <div className="flex justify-between items-end border-b border-zinc-800 pb-2">
                        <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">{t('ui.times_dodged')}</span>
                        <span className="text-white font-mono text-lg">{totalDodges}</span>
                    </div>
                    <div className="flex justify-between items-end border-b border-zinc-800 pb-2">
                        <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">{t('ui.times_rushed')}</span>
                        <span className="text-white font-mono text-lg">{totalRushes}</span>
                    </div>
                    <div className="flex justify-between items-end border-b border-zinc-800 pb-2">
                        <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">{t('ui.rushed_distance')}</span>
                        <span className="text-white font-mono text-lg">{totalRushDistance} {t('report.distance.unit_m')}</span>
                    </div>
                </div>
            </div>
        </div>
    );
});

const CombatTab: React.FC<{ stats: PlayerStats, isMobileDevice?: boolean }> = React.memo(({ stats, isMobileDevice }) => {
    const sb = stats.statsBuffer;

    const { efficiency, kdRatio, lethality, longestKillstreak, crisisSaves, nemesis, peakAggression, time } = useMemo(() => {
        const kills = Math.floor(sb[PlayerStatID.TOTAL_KILLS] || 0);
        const deaths = Math.max(1, stats.deaths);
        const time = sb[PlayerStatID.TOTAL_GAME_TIME] || 1;
        const shots = stats.totalBulletsFired || 1;
        const hits = stats.totalBulletsHit || 0;

        const accuracy = (hits / shots) * 100;
        const efficiency = (kills / (time / 60));
        const crisisSaves = Math.floor(sb[PlayerStatID.TOTAL_CRISIS_SAVES] || 0);
        const peakAggression = Math.floor(sb[PlayerStatID.LONGEST_KILLSTREAK] || 0);

        const nemesisData = findNemesis(stats.deathsByEnemyType);
        const nemesisName = nemesisData.id !== -1 ? DataResolver.getEnemyName(nemesisData.id, -1, true) : t('ui.none');

        return {
            efficiency: efficiency.toFixed(1),
            kdRatio: (kills / deaths).toFixed(2),
            lethality: `${accuracy.toFixed(1)}%`,
            longestKillstreak: peakAggression.toString(),
            crisisSaves: crisisSaves.toLocaleString(),
            nemesis: { name: nemesisName, count: nemesisData.count },
            peakAggression: peakAggression.toLocaleString(),
            time
        };
    }, [sb, stats.deaths, stats.totalBulletsFired, stats.totalBulletsHit, stats.deathsByEnemyType]);

    const killLogData = useMemo(() => {
        const result = [];
        for (let i = 0; i < StatEnemyIndex.COUNT; i++) {
            const count = Math.max(stats.enemyKills[i] || 0, stats.killsByType ? (stats.killsByType[i] || 0) : 0);
            if (count > 0) result.push({ type: i, count, label: t(DataResolver.getZombieName(i)) });
        }
        return result;
    }, [stats.enemyKills, stats.killsByType]);

    return (
        <div className={`flex flex-col h-full gap-8 pb-12 ${isMobileDevice ? 'overflow-y-auto' : ''} custom-scrollbar`}>
            {/* NEW HERO ROW: COMBAT DIAGNOSTICS */}
            <div className={`grid ${isMobileDevice ? 'grid-cols-1' : 'grid-cols-3'} gap-4`}>
                <div className="group relative p-6 border-2 border-zinc-800 bg-zinc-900/40 overflow-hidden">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-blue-500/5 rounded-full scale-0 group-hover:scale-[6] transition-transform duration-700 pointer-events-none" />
                    <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1 relative z-10">{t('ui.crisis_averted')}</h4>
                    <span className="text-3xl font-light text-white font-mono relative z-10">{crisisSaves}</span>
                    <span className="block text-[9px] text-zinc-600 uppercase font-black tracking-tighter mt-1 relative z-10">{t('ui.adrenaline_mgmt')}</span>
                </div>
                <div className="group relative p-6 border-2 border-red-900/20 bg-red-950/5 overflow-hidden">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-red-500/5 rounded-full scale-0 group-hover:scale-[6] transition-transform duration-700 pointer-events-none" />
                    <h4 className="text-[10px] font-black text-red-500/40 uppercase tracking-widest mb-1 relative z-10">{t('ui.nemesis_id')}</h4>
                    <div className="flex flex-col relative z-10">
                        <span className="text-xl font-bold text-red-500 uppercase tracking-tighter truncate">{nemesis.name}</span>
                        {nemesis.count > 0 && <span className="text-[10px] text-zinc-500 font-mono italic">{t('ui.killed_most_by')} ({nemesis.count})</span>}
                    </div>
                </div>
                <div className="group relative p-6 border-2 border-zinc-800 bg-zinc-900/40 overflow-hidden">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-blue-500/5 rounded-full scale-0 group-hover:scale-[6] transition-transform duration-700 pointer-events-none" />
                    <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1 relative z-10">{t('ui.peak_aggression')}</h4>
                    <span className="text-3xl font-light text-white font-mono relative z-10">{peakAggression}</span>
                    <span className="block text-[9px] text-zinc-600 uppercase font-black tracking-tighter mt-1 relative z-10">{t('ui.longest_killstreak')}</span>
                </div>
            </div>

            <div className={`grid ${isMobileDevice ? 'grid-cols-2' : 'grid-cols-4'} gap-4`}>
                <div className="bg-zinc-900/20 border border-zinc-800 p-4 flex flex-col items-center justify-center relative group overflow-hidden">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 bg-blue-500/5 rounded-full scale-0 group-hover:scale-[6] transition-transform duration-700 pointer-events-none" />
                    <span className="text-zinc-500 text-[9px] font-black uppercase tracking-[0.2em] mb-1 relative z-10">{t('ui.combat_efficiency')}</span>
                    <span className="text-2xl font-light text-white font-mono relative z-10">{efficiency}</span>
                </div>
                <div className="bg-zinc-900/20 border border-zinc-800 p-4 flex flex-col items-center justify-center relative group overflow-hidden">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 bg-blue-500/5 rounded-full scale-0 group-hover:scale-[6] transition-transform duration-700 pointer-events-none" />
                    <span className="text-zinc-500 text-[9px] font-black uppercase tracking-[0.2em] mb-1 relative z-10">{t('ui.kd_ratio')}</span>
                    <span className="text-2xl font-light text-white font-mono relative z-10">{kdRatio}</span>
                </div>
                <div className="bg-zinc-900/20 border border-zinc-800 p-4 flex flex-col items-center justify-center relative group overflow-hidden">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 bg-blue-500/5 rounded-full scale-0 group-hover:scale-[6] transition-transform duration-700 pointer-events-none" />
                    <span className="text-zinc-500 text-[9px] font-black uppercase tracking-[0.2em] mb-1 relative z-10">{t('ui.lethality')}</span>
                    <span className="text-2xl font-light text-white font-mono relative z-10">{lethality}</span>
                </div>
                <div className="bg-zinc-900/20 border border-zinc-800 p-4 flex flex-col items-center justify-center relative group overflow-hidden">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 bg-blue-500/5 rounded-full scale-0 group-hover:scale-[6] transition-transform duration-700 pointer-events-none" />
                    <span className="text-zinc-500 text-[9px] font-black uppercase tracking-[0.2em] mb-1 relative z-10">{t('ui.on_field_time')}</span>
                    <span className="text-2xl font-light text-white font-mono relative z-10">{(time / 3600).toFixed(1)}H</span>
                </div>
            </div>

            {killLogData.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-zinc-800 bg-zinc-900/10">
                    <span className="text-zinc-600 font-black text-xs uppercase tracking-[0.4em] mb-2 text-center">{t('ui.no_intel_gained')}</span>
                    <span className="text-zinc-400 font-light text-sm text-center uppercase tracking-widest">{t('ui.continue_to_play_combat')}</span>
                </div>
            ) : (
                <div className="bg-zinc-900/10 border border-zinc-800 p-6">
                    <h3 className="text-[10px] font-black text-blue-500/40 uppercase tracking-[0.5em] mb-6">{t('ui.kill_log')}</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {killLogData.map(entry => (
                            <div key={entry.type} className="flex flex-col p-3 bg-zinc-950/40 border border-zinc-900/80">
                                <span className="text-zinc-600 text-[9px] font-black uppercase tracking-widest mb-1">{entry.label}</span>
                                <span className="text-white font-mono text-xl">{entry.count.toLocaleString()}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}); const WeaponsTab: React.FC<{ stats: PlayerStats, color: string, isMobileDevice?: boolean }> = React.memo(({ stats, isMobileDevice }) => {
    const { weaponItems, signature, comfort, throwables } = useMemo(() => {
        const items = WEAPONS.filter(w => w && w.name !== DamageID.RADIO && (stats.weaponDamageDealt[w.name - 1] || 0) > 0);

        const sig = findSignatureWeapon(stats.weaponKills);
        const com = findComfortWeapon(stats.weaponTimeActive);

        const sigData = sig.id !== -1 ? WEAPONS[sig.id] : null;
        const comData = com.id !== -1 ? WEAPONS[com.id] : null;

        return {
            weaponItems: items,
            signature: sigData ? { name: t(sigData.displayName), icon: sigData.icon, isPng: sigData.iconIsPng, count: sig.count } : null,
            comfort: comData ? { name: t(comData.displayName), icon: comData.icon, isPng: comData.iconIsPng } : null,
            throwables: (stats.totalThrowablesThrown || 0).toLocaleString()
        };
    }, [stats.weaponDamageDealt, stats.weaponKills, stats.weaponTimeActive, stats.totalThrowablesThrown]);

    return (
        <div className="space-y-8 pb-12">
            {!weaponItems.length ? (
                <div className="flex flex-col items-center justify-center p-20 border-2 border-dashed border-zinc-800 bg-zinc-900/10">
                    <span className="text-zinc-600 font-black text-xs uppercase tracking-[0.4em] mb-2 text-center">{t('ui.no_weapon_data')}</span>
                    <span className="text-zinc-400 font-light text-sm text-center uppercase tracking-widest">{t('ui.continue_to_play_weapons')}</span>
                </div>
            ) : (
                <>
                    {/* NEW HERO ROW: DOSSIER HIGHLIGHTS */}
                    <div className={`grid ${isMobileDevice ? 'grid-cols-1' : 'grid-cols-3'} gap-4`}>
                        <div className="group relative p-6 border-2 border-zinc-800 bg-zinc-900/40 overflow-hidden">
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-blue-500/5 rounded-full scale-0 group-hover:scale-[6] transition-transform duration-700 pointer-events-none" />
                            <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2 relative z-10">{t('ui.tactical_usage')}</h4>
                            <span className="text-3xl font-light text-white font-mono relative z-10">{throwables}</span>
                            <span className="block text-[9px] text-zinc-600 uppercase font-black tracking-tighter mt-1 relative z-10">{t('ui.throwables_thrown')}</span>
                        </div>
                        <div className="group relative p-6 border-2 border-blue-900/20 bg-blue-950/10 overflow-hidden">
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-blue-500/5 rounded-full scale-0 group-hover:scale-[6] transition-transform duration-700 pointer-events-none" />
                            <h4 className="text-[10px] font-black text-blue-500/40 uppercase tracking-widest mb-2 relative z-10">{t('ui.signature_weapon')}</h4>
                            <div className="flex items-center gap-4 relative z-10">
                                <div className="w-12 h-12 bg-black/40 border border-blue-500/20 flex items-center justify-center p-1">
                                    {signature?.isPng ? <img src={signature.icon} alt="" className="w-full h-full object-contain" /> : <span className="text-2xl">{signature?.icon || '—'}</span>}
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-lg font-bold text-white uppercase tracking-tighter leading-none">{signature?.name || t('ui.none')}</span>
                                    {signature && <span className="text-[9px] text-blue-400/60 font-mono mt-1 uppercase">{signature.count.toLocaleString()} {t('ui.kills')}</span>}
                                </div>
                            </div>
                        </div>
                        <div className="group relative p-6 border-2 border-zinc-800 bg-zinc-900/40 overflow-hidden">
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-blue-500/5 rounded-full scale-0 group-hover:scale-[6] transition-transform duration-700 pointer-events-none" />
                            <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2 relative z-10">{t('ui.comfort_weapon')}</h4>
                            <div className="flex items-center gap-4 relative z-10">
                                <div className="w-12 h-12 bg-black/40 border border-zinc-800 flex items-center justify-center p-1">
                                    {comfort?.isPng ? <img src={comfort.icon} alt="" className="w-full h-full object-contain" /> : <span className="text-2xl">{comfort?.icon || '—'}</span>}
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-lg font-bold text-white uppercase tracking-tighter leading-none">{comfort?.name || t('ui.none')}</span>
                                    <span className="text-[9px] text-zinc-500 font-mono mt-1 uppercase">{t('ui.on_field_choice')}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-zinc-900/20 border border-zinc-800 p-8 w-full">
                        <h3 className="text-xl font-light text-white uppercase tracking-tighter mb-8 border-b-2 border-zinc-800 pb-4">{t('ui.weapon_performance_log')}</h3>
                        <div className="flex flex-col gap-2">
                            {weaponItems.map(wep => {
                                const idx = wep.name - 1;
                                const fired = stats.weaponShotsFired[idx] || 0;
                                const hit = stats.weaponShotsHit[idx] || 0;
                                const dmg = stats.weaponDamageDealt[idx] || 0;
                                const accuracy = fired > 0 ? ((hit / fired) * 100).toFixed(1) : '0.0';
                                return (
                                    <div key={wep.name} className="flex justify-between items-center px-4 py-3 bg-zinc-950/20 border border-transparent hover:border-blue-500/20 transition-all relative group overflow-hidden">
                                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 bg-blue-500/5 rounded-full scale-0 group-hover:scale-[8] transition-transform duration-700 pointer-events-none" />
                                        <div className="flex-1 flex items-center gap-4 relative z-10">
                                            <div className="w-10 h-10 bg-black/50 border border-zinc-800 flex items-center justify-center p-1">
                                                {wep.iconIsPng ? <img src={wep.icon} alt={t(wep.displayName)} className="w-full h-full object-contain" /> : <span className="text-xl">{wep.icon}</span>}
                                            </div>
                                            <span className="text-sm font-bold text-zinc-200 uppercase">{t(wep.displayName)}</span>
                                        </div>
                                        <span className="w-48 text-right font-mono text-zinc-300 text-lg">{Math.floor(dmg).toLocaleString()}</span>
                                        <span className="w-32 text-right font-mono text-blue-400 font-bold text-lg">{wep.category === WeaponCategory.THROWABLE ? `${fired} ${t('ui.thrown')}` : `${accuracy}%`}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
});

const PerksTab: React.FC<{ stats: PlayerStats, t: (key: string) => string, effectiveLandscape: boolean }> = React.memo(({ stats, t, effectiveLandscape }) => {
    const sb = stats.statsBuffer;

    const { uptime, resilience, roiDealt, roiAbsorb, totalROI } = useMemo(() => {
        const time = sb[PlayerStatID.TOTAL_GAME_TIME] || 1;
        const uptime = Math.min(100, ((sb[PlayerStatID.TOTAL_BUFF_TIME] || 0) / time) * 100);
        const resisted = Math.floor(sb[PlayerStatID.TOTAL_DEBUFFS_RESISTED] || 0);

        // Sum total perk ROI
        let dealt = 0;
        let absorb = 0;
        for (let i = 0; i < 32; i++) {
            dealt += stats.perkDamageDealt[i] || 0;
            absorb += stats.perkDamageAbsorbed[i] || 0;
        }

        return {
            uptime: uptime.toFixed(1),
            resilience: resisted.toLocaleString(),
            roiDealt: Math.floor(dealt).toLocaleString(),
            roiAbsorb: Math.floor(absorb).toLocaleString(),
            totalROI: Math.floor(dealt + absorb).toLocaleString()
        };
    }, [sb, stats.perkDamageDealt, stats.perkDamageAbsorbed]);

    const buffs = useMemo(() => PERKS.filter(p => p.category === PerkCategory.BUFF && (stats.discoveredPerks.includes(p.id) || stats.perkTimesGained[p.id] > 0)), [stats.discoveredPerks, stats.perkTimesGained]);
    const debuffs = useMemo(() => PERKS.filter(p => p.category === PerkCategory.DEBUFF && (stats.discoveredPerks.includes(p.id) || stats.perkTimesGained[p.id] > 0)), [stats.discoveredPerks, stats.perkTimesGained]);
    const passives = useMemo(() => PERKS.filter(p => p.category === PerkCategory.PASSIVE && (stats.discoveredPerks.includes(p.id) || stats.perkTimesGained[p.id] > 0)), [stats.discoveredPerks, stats.perkTimesGained]);

    const renderPerk = (perk: any) => {
        return (
            <div key={perk.id} id={`log-item-${perk.id}`} className="bg-zinc-900/40 border border-zinc-800 p-6 relative group overflow-hidden">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 bg-blue-500/5 rounded-full scale-0 group-hover:scale-[6] transition-transform duration-700 pointer-events-none" />
                <div className="flex flex-col relative z-10">
                    <div className="flex justify-between items-start mb-4 border-b border-zinc-800 pb-2">
                        <div className="flex flex-col">
                            <span className="text-blue-500/80 text-[10px] font-black uppercase tracking-widest mb-1">{t(perk.displayName)}</span>
                            <span className="text-[9px] text-zinc-500 uppercase font-bold tracking-tighter">
                                {t(perk.category === PerkCategory.PASSIVE ? 'ui.passive' : (perk.category === PerkCategory.BUFF ? 'ui.buff' : 'ui.debuff'))}
                            </span>
                        </div>
                        <div className="flex flex-col items-end">
                            <span className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">{t('ui.activations')}</span>
                            <span className="text-lg font-mono text-white">{stats.perkTimesGained[perk.id]}</span>
                        </div>
                    </div>
                    <p className="text-sm text-zinc-400 italic mb-6">"{t(perk.description)}"</p>
                    {(stats.perkDamageAbsorbed[perk.id] > 0 || stats.perkDamageDealt[perk.id] > 0 || stats.perkDebuffsCleansed[perk.id] > 0) && (
                        <div className="grid grid-cols-3 gap-4 border-t border-zinc-800 pt-4">
                            {stats.perkDamageAbsorbed[perk.id] > 0 && (
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-black text-blue-500/70 uppercase tracking-wider">{t('ui.damage_absorbed')}</span>
                                    <span className="text-sm font-mono text-blue-400">{Math.floor(stats.perkDamageAbsorbed[perk.id]).toLocaleString()}</span>
                                </div>
                            )}
                            {stats.perkDamageDealt[perk.id] > 0 && (
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-black text-red-500/70 uppercase tracking-wider">{t('ui.damage_dealt')}</span>
                                    <span className="text-sm font-mono text-red-400">{Math.floor(stats.perkDamageDealt[perk.id]).toLocaleString()}</span>
                                </div>
                            )}
                            {stats.perkDebuffsCleansed[perk.id] > 0 && (
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-black text-green-500/70 uppercase tracking-wider">{t('ui.debuffs_cleansed')}</span>
                                    <span className="text-sm font-mono text-green-400">{stats.perkDebuffsCleansed[perk.id]}</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const hasData = buffs.length > 0 || debuffs.length > 0 || passives.length > 0;

    if (!hasData) {
        return (
            <div className="flex flex-col items-center justify-center p-20 border-2 border-dashed border-zinc-800 bg-zinc-900/10">
                <span className="text-zinc-600 font-black text-xs uppercase tracking-[0.4em] mb-2 text-center">{t('ui.no_intel_gained')}</span>
                <span className="text-zinc-400 font-light text-sm text-center uppercase tracking-widest">{t('ui.continue_to_play_perks')}</span>
            </div>
        );
    }

    return (
        <div className="space-y-12 pb-12 h-full overflow-y-auto pr-2 custom-scrollbar">
            {/* HERO HIGHLIGHTS: AUGMENTATION ROI */}
            <div className={`grid ${effectiveLandscape ? 'grid-cols-3' : 'grid-cols-1'} gap-4`}>
                <div className="group relative p-6 border-2 border-zinc-800 bg-zinc-900/40 overflow-hidden">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-blue-500/5 rounded-full scale-0 group-hover:scale-[6] transition-transform duration-700 pointer-events-none" />
                    <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2 relative z-10">{t('ui.enhanced_state')}</h4>
                    <span className="text-3xl font-light text-white font-mono relative z-10">{uptime}%</span>
                    <span className="block text-[9px] text-zinc-600 uppercase font-black tracking-tighter mt-1 relative z-10">{t('ui.buff_uptime')}</span>
                </div>
                <div className="group relative p-6 border-2 border-zinc-800 bg-zinc-900/40 overflow-hidden">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-blue-500/5 rounded-full scale-0 group-hover:scale-[6] transition-transform duration-700 pointer-events-none" />
                    <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2 relative z-10">{t('ui.resilience')}</h4>
                    <span className="text-3xl font-light text-white font-mono relative z-10">{resilience}</span>
                    <span className="block text-[9px] text-zinc-600 uppercase font-black tracking-tighter mt-1 relative z-10">{t('ui.debuffs_neutralized')}</span>
                </div>
                <div className="group relative p-6 border-2 border-blue-900/20 bg-blue-950/10 overflow-hidden">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-blue-500/10 rounded-full scale-0 group-hover:scale-[6] transition-transform duration-700 pointer-events-none" />
                    <h4 className="text-[10px] font-black text-blue-500/40 uppercase tracking-widest mb-2 relative z-10">{t('ui.perk_roi')}</h4>
                    <span className="text-3xl font-light text-white font-mono relative z-10">{totalROI}</span>
                    <div className="flex gap-3 relative z-10 mt-1">
                        <span className="text-[9px] text-red-400 uppercase font-black tracking-tighter">{t('ui.perk_damage_dealt_short')}: {roiDealt}</span>
                        <span className="text-[9px] text-blue-400 uppercase font-black tracking-tighter">{t('ui.perk_damage_absorbed_short')}: {roiAbsorb}</span>
                    </div>
                </div>
            </div>

            <div className="space-y-12">
                {passives.length > 0 && (
                    <div className="space-y-6">
                        <div className="border-b-2 border-zinc-800 pb-2">
                            <h3 className="text-3xl font-light uppercase tracking-tighter text-white">{t('ui.passive_abilities')}</h3>
                        </div>
                        <div className={`grid ${effectiveLandscape ? 'grid-cols-2 gap-6' : 'grid-cols-1 gap-4'}`}>
                            {passives.map(renderPerk)}
                        </div>
                    </div>
                )}
                {buffs.length > 0 && (
                    <div className="space-y-6">
                        <div className="border-b-2 border-zinc-800 pb-2">
                            <h3 className="text-3xl font-light uppercase tracking-tighter text-white">{t('ui.buffs')}</h3>
                        </div>
                        <div className={`grid ${effectiveLandscape ? 'grid-cols-2 gap-6' : 'grid-cols-1 gap-4'}`}>
                            {buffs.map(renderPerk)}
                        </div>
                    </div>
                )}
                {debuffs.length > 0 && (
                    <div className="space-y-6">
                        <div className="border-b-2 border-zinc-800 pb-2">
                            <h3 className="text-3xl font-light uppercase tracking-tighter text-white">{t('ui.debuffs')}</h3>
                        </div>
                        <div className={`grid ${effectiveLandscape ? 'grid-cols-2 gap-6' : 'grid-cols-1 gap-4'}`}>
                            {debuffs.map(renderPerk)}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
});

const Card: React.FC<{ children: React.ReactNode, isLocked?: boolean, color?: string, id?: string, className?: string }> = React.memo(({ children, isLocked, color = '#6b7280', id, className = '' }) => (
    <div id={id} className={`p-6 border-2 relative overflow-hidden transition-all duration-300 bg-black/60 backdrop-blur-md shadow-2xl active:scale-[0.98] ${isLocked ? 'border-zinc-800' : ''} ${className}`}
        style={{ borderColor: isLocked ? '#1f2937' : `${color}66` }}
    >
        <div className="">
            {children}
        </div>
    </div>
));

const DescriptionExpansion: React.FC<{ item: any, isFound: boolean, isMobileDevice?: boolean }> = ({ item, isFound, isMobileDevice }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <div className="flex flex-col h-full cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
            <div className={`w-full bg-zinc-900 relative border-b border-zinc-800/50 ${isMobileDevice ? 'h-24' : 'aspect-square'}`}>
                <CollectiblePreview type={item.modelType} isLocked={!isFound} />
            </div>
            <div className={`${isMobileDevice ? 'p-2' : 'p-4'} flex-1 flex flex-col`}>
                <h4 className={`text-sm font-bold uppercase tracking-wider mb-2 ${isFound ? 'text-white' : 'text-zinc-700'}`}>
                    {isFound ? t(DataResolver.getCollectibleName(item.id)) : '???'}
                </h4>
                {isExpanded && (
                    <p className="text-[10px] text-zinc-400 leading-relaxed italic animate-in fade-in slide-in-from-top-1 duration-300">
                        {isFound ? t(DataResolver.getCollectibleDescription(item.id)) : '???'}
                    </p>
                )}
            </div>
        </div>
    );
};

export default ScreenStatistics;