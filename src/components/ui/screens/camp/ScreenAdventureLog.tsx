import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { PlayerStats, StatEnemyIndex } from '../../../../entities/player/PlayerTypes';
import { t } from '../../../../utils/i18n';
import { useOrientation } from '../../../../hooks/useOrientation';
import ScreenModalLayout, { HORIZONTAL_HATCHING_STYLE, TacticalCard, TacticalTab } from '../../layout/ScreenModalLayout';
import CollectiblePreview from '../../core/CollectiblePreview';
import { UiSounds } from '../../../../utils/audio/AudioLib';
import { DiscoveryType } from '../../hud/HudTypes';
import { DataResolver } from '../../../../core/data/DataResolver';
import { SectorID } from '../../../../game/session/SectorTypes';
import { GAME_CHALLENGES, ChallengeCategory, ChallengeDef } from '../../../../content/ChallengeTypes';
import { InputAction, INPUT_KEY_MAP } from '../../../../core/engine/InputManager';
import { ColorPair, COLORS } from '../../../../utils/ui/ColorUtils';
import { StatsBridge } from '../../../../core/data/StatsBridge';
import { FormatUtils } from '../../../../utils/ui/FormatUtils';

interface ScreenAdventureLogProps {
    stats: PlayerStats;
    onClose: () => void;
    onMarkCollectiblesViewed?: (collectibleIds: string[]) => void;
    onToggleChallengeTracking?: (challengeId: number) => void;
    isMobileDevice?: boolean;
    debugMode?: boolean;
    initialTab?: DiscoveryType;
    initialItemId?: string | null;
}

// --- ZERO-GC STATIC ARRAYS & CONFIGS (PRESERVES REACT.MEMO STABILITY) ---
const TABS: { id: DiscoveryType, label: string }[] = [
    { id: DiscoveryType.CHALLENGE, label: 'challenges.title' },
    { id: DiscoveryType.CLUE, label: 'ui.log_clues' },
    { id: DiscoveryType.COLLECTIBLE, label: 'ui.log_collectibles' },
    { id: DiscoveryType.POI, label: 'ui.log_poi' },
    { id: DiscoveryType.ZOMBIE, label: 'ui.log_zombies' },
    { id: DiscoveryType.BOSS, label: 'ui.log_bosses' },
];
const SECTORS = [SectorID.VILLAGE, SectorID.MOUNTAIN_VAULT, SectorID.MAST, SectorID.SCRAPYARD];
const THEME_COLOR = '#16a34a'; // green-600

const ScreenAdventureLog: React.FC<ScreenAdventureLogProps> = ({ stats, onClose, onMarkCollectiblesViewed, onToggleChallengeTracking, isMobileDevice, debugMode, initialTab, initialItemId }) => {
    const { isLandscapeMode } = useOrientation();
    const effectiveLandscape = isLandscapeMode || !isMobileDevice;
    const [activeTab, setActiveTab] = useState<DiscoveryType>(initialTab ?? DiscoveryType.CHALLENGE);
    const [showAllData, setShowAllData] = useState(false);

    const isDebugMode = (debugMode !== undefined ? debugMode : false) || (window as any).gameEngine?.sectorContext?.debugMode || (window as any).WD_DEBUG === true || localStorage.getItem('wd_debug') === 'true';

    // Sync tab when initialTab changes (e.g. when opened from Pause Menu)
    useEffect(() => {
        if (initialTab !== undefined && initialTab !== null) {
            setActiveTab(initialTab);
        }
    }, [initialTab]);

    // Mark all found collectibles as viewed when the log is opened
    useEffect(() => {
        const foundIds = StatsBridge.getCollectiblesDiscovered(stats);
        const viewedIds = StatsBridge.getViewedCollectibles(stats);

        let hasNew = false;
        const newIds: string[] = [];

        for (let i = 0; i < foundIds.length; i++) {
            if (!viewedIds.includes(foundIds[i])) {
                newIds.push(foundIds[i]);
                hasNew = true;
            }
        }

        if (hasNew && onMarkCollectiblesViewed) {
            onMarkCollectiblesViewed(newIds);
        }
    }, [stats, onMarkCollectiblesViewed]);

    // Scroll to item if provided
    useEffect(() => {
        if (initialItemId) {
            // Need a slight delay to ensure rendering of the correct tab is complete
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
            const action = INPUT_KEY_MAP[e.key];
            if (action === InputAction.ESCAPE || action === InputAction.ENTER) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const handleTabChange = useCallback((tab: DiscoveryType) => {
        UiSounds.playClick();
        setActiveTab(tab);
    }, []);



    return (
        <ScreenModalLayout
            title={t('stations.adventure_log')}
            isMobileDevice={isMobileDevice}
            onClose={onClose}
            onCancel={onClose}
            cancelLabel={t('ui.close')}
            titleColorClass="text-green-600"
            extraHeaderContent={isDebugMode ? (
                <div className="flex items-center gap-3 bg-zinc-900/20 border border-zinc-800/50 px-4 py-2 rounded-sm cursor-pointer group/toggle hover:bg-zinc-800/40 transition-all"
                    onClick={() => {
                        UiSounds.playClick();
                        setShowAllData(!showAllData);
                    }}
                >
                    <div className={`w-5 h-5 border-2 flex items-center justify-center transition-all duration-300 relative ${showAllData ? 'border-green-500 bg-green-950/30' : 'border-zinc-700 bg-transparent'}`}>
                        {showAllData && (
                            <>
                                <div className="absolute inset-0 bg-green-500/20 animate-pulse" />
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="text-green-400 relative z-10">
                                    <polyline points="20 6 9 17 4 12"></polyline>
                                </svg>
                            </>
                        )}
                    </div>
                    <span className={`text-[10px] font-black uppercase tracking-widest transition-colors ${showAllData ? 'text-green-500' : 'text-zinc-500 group-hover/toggle:text-zinc-300'}`}>
                        {t('ui.debug_show_all')}
                    </span>
                </div>
            ) : undefined}
            tabs={TABS.map(t => t.id)}
            activeTab={activeTab}
            onTabChange={handleTabChange as any}
            tabOrientation={effectiveLandscape ? 'vertical' : 'horizontal'}
            noScroll={true}
            fullHeight={true}
        >
            <div className={`flex h-full ${effectiveLandscape ? 'flex-row gap-8' : 'flex-col gap-4'}`}>
                {/* Tabs Bar */}
                <div className={`relative shrink-0 ${effectiveLandscape ? 'w-1/3 flex flex-col gap-4 overflow-y-auto pl-safe custom-scrollbar' : ''}`}>
                    <div className={`${effectiveLandscape ? 'flex flex-col gap-4 pt-4 pr-10' : 'flex flex-nowrap gap-2 border-b-2 border-zinc-800 pb-2 md:pb-4 overflow-x-auto px-4 pt-2 items-end scrollbar-hide touch-auto cursor-pointer'}`}>
                        {TABS.map(tab => (
                            <TacticalTab
                                key={tab.id}
                                label={t(tab.label)}
                                isActive={activeTab === tab.id}
                                onClick={() => handleTabChange(tab.id)}
                                color={THEME_COLOR}
                                orientation={effectiveLandscape ? 'vertical' : 'horizontal'}
                            />
                        ))}
                    </div>
                </div>

                {/* Content Area - DYNAMIC MOUNTING */}
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar relative">
                    {activeTab === DiscoveryType.CHALLENGE && <ChallengesTab stats={stats} isMobileDevice={isMobileDevice} isDebug={showAllData} onToggleTracking={onToggleChallengeTracking} />}
                    {activeTab === DiscoveryType.ZOMBIE && <ZombiesTab stats={stats} isMobileDevice={isMobileDevice} isDebug={showAllData} />}
                    {activeTab === DiscoveryType.BOSS && <BossesTab stats={stats} isMobileDevice={isMobileDevice} isDebug={showAllData} />}
                    {activeTab === DiscoveryType.COLLECTIBLE && <CollectiblesTab stats={stats} isMobileDevice={!effectiveLandscape} effectiveLandscape={effectiveLandscape} isDebug={showAllData} />}
                    {activeTab === DiscoveryType.CLUE && <CluesTab stats={stats} isMobileDevice={isMobileDevice} effectiveLandscape={effectiveLandscape} isDebug={showAllData} />}
                    {activeTab === DiscoveryType.POI && <PoiTab stats={stats} isMobileDevice={isMobileDevice} effectiveLandscape={effectiveLandscape} isDebug={showAllData} />}
                </div>
            </div>

            <style>{`
                @keyframes discoveryFlash {
                    0%, 100% { box-shadow: 0 0 0px rgba(22, 163, 74, 0); border-color: inherit; }
                    50% { box-shadow: 0 0 30px rgba(22, 163, 74, 0.8), inset 0 0 15px rgba(22, 163, 74, 0.3); border-color: rgba(22, 163, 74, 1) !important; }
                }
                .animate-discovery-flash {
                    animation: discoveryFlash 1.25s ease-in-out 2 !important;
                    transition: border-color 1.0s;
                }
            `}</style>
        </ScreenModalLayout>
    );
};

const CHALLENGE_CATEGORY_COLORS: Record<number, ColorPair> = {
    [ChallengeCategory.WORLD]: COLORS.BLUE,
    [ChallengeCategory.COMBAT]: COLORS.RED,
    [ChallengeCategory.WEAPONS]: COLORS.YELLOW,
    [ChallengeCategory.TACTICS]: COLORS.PURPLE,
    [ChallengeCategory.PLAYER]: COLORS.GREEN,
};

const CHALLENGE_CATEGORIES = [
    { id: ChallengeCategory.WORLD, label: 'ui.category_world' },
    { id: ChallengeCategory.COMBAT, label: 'ui.category_combat' },
    { id: ChallengeCategory.WEAPONS, label: 'ui.category_weapons' },
    { id: ChallengeCategory.TACTICS, label: 'ui.category_tactics' },
    { id: ChallengeCategory.PLAYER, label: 'ui.category_player' },
];

const ChallengesTab: React.FC<{ stats: PlayerStats, isMobileDevice?: boolean, isDebug?: boolean, onToggleTracking?: (id: number) => void }> = React.memo(({ stats, isMobileDevice, isDebug, onToggleTracking }) => {
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

    const toggleCategory = useCallback((id: string) => {
        setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));
        UiSounds.playClick();
    }, []);

    const trackedIds = StatsBridge.getTrackedChallengeIds(stats);
    const trackedChallenges = useMemo(() => {
        return GAME_CHALLENGES.filter(c => trackedIds.includes(c.id));
    }, [trackedIds]);

    const categoryProgress = useMemo(() => {
        const progress: Record<string, number> = {};
        CHALLENGE_CATEGORIES.forEach(cat => {
            const catChallenges = GAME_CHALLENGES.filter(c => c.categoryId === cat.id);
            if (catChallenges.length === 0) {
                progress[cat.id] = 0;
                return;
            }

            const totalPossiblePoints = catChallenges.length * 3.0;
            let currentPoints = 0;

            catChallenges.forEach(c => {
                const tier = StatsBridge.getChallengeTier(stats, c.id);
                const value = StatsBridge.getChallengeValue(stats, c.id);

                currentPoints += tier;
                if (tier < 3) {
                    const prevTarget = tier > 0 ? c.targets[tier - 1] : 0;
                    const nextTarget = c.targets[tier];
                    const tierRange = nextTarget - prevTarget;

                    if (tierRange > 0) {
                        const tierProgress = (value - prevTarget) / tierRange;
                        currentPoints += Math.max(0, Math.min(1, isNaN(tierProgress) ? 0 : tierProgress));
                    }
                }
            });

            const rawProgress = (currentPoints / totalPossiblePoints) * 100;
            progress[cat.id] = isNaN(rawProgress) || !isFinite(rawProgress) ? 0 : Math.round(rawProgress);
        });
        return progress;
    }, [stats]);

    return (
        <div className="space-y-12 pb-24">
            {/* --- HERO SECTION: TRACKED CHALLENGES --- */}
            {trackedChallenges.length > 0 && (
                <div className="space-y-6">
                    <div className="border-b-2 border-green-600/50 pb-2 flex items-baseline gap-4">
                        <h3 className="text-2xl font-black uppercase tracking-tighter text-green-500">
                            {t('ui.tracked_challenges')}
                        </h3>
                        <span className="text-[10px] font-mono text-green-700 font-bold uppercase tracking-widest">
                            {trackedChallenges.length} / 3
                        </span>
                    </div>

                    <div className={`grid ${isMobileDevice ? 'grid-cols-1 gap-4' : 'grid-cols-1 md:grid-cols-2 gap-6'}`}>
                        {trackedChallenges.map(challenge => (
                            <ChallengeCard
                                key={`hero-${challenge.id}`}
                                challenge={challenge}
                                stats={stats}
                                isMobileDevice={isMobileDevice}
                                onToggleTracking={onToggleTracking}
                                isTracked={true}
                                isHero={true}
                            />
                        ))}
                    </div>
                </div>
            )}

            {CHALLENGE_CATEGORIES.map(cat => {
                const catChallenges = GAME_CHALLENGES.filter(c => c.categoryId === cat.id);
                if (catChallenges.length === 0) return null;

                const isCollapsed = collapsed[cat.id] || false;
                const progress = categoryProgress[cat.id];

                return (
                    <div key={cat.id} className="space-y-6">
                        <div
                            className="border-b-2 border-zinc-800 pb-2 flex justify-between items-end cursor-pointer group hover:border-zinc-600 transition-colors"
                            onClick={() => toggleCategory(cat.id)}
                        >
                            <div className="flex items-baseline gap-4">
                                <h3 className="text-2xl font-light uppercase tracking-tighter text-zinc-400 group-hover:text-zinc-200 transition-colors">
                                    {t(cat.label)}
                                </h3>
                                <span className="text-xs font-mono text-zinc-600 font-bold">
                                    {progress}%
                                </span>
                            </div>
                            <div className={`text-zinc-600 group-hover:text-zinc-400 transition-all duration-300 transform ${isCollapsed ? '-rotate-90' : 'rotate-0'}`}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="6 9 12 15 18 9"></polyline>
                                </svg>
                            </div>
                        </div>

                        {!isCollapsed && (
                            <div className={`grid ${isMobileDevice ? 'grid-cols-1 gap-4' : 'grid-cols-2 gap-4'}`}>
                                {catChallenges.map(challenge => (
                                    <ChallengeCard
                                        key={challenge.id}
                                        challenge={challenge}
                                        stats={stats}
                                        isMobileDevice={isMobileDevice}
                                        onToggleTracking={onToggleTracking}
                                        isTracked={trackedIds.includes(challenge.id)}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
});

const ChallengeCard: React.FC<{
    challenge: ChallengeDef;
    stats: PlayerStats;
    isMobileDevice?: boolean;
    isTracked: boolean;
    isHero?: boolean;
    onToggleTracking?: (id: number) => void;
}> = React.memo(({ challenge, stats, isMobileDevice, isTracked, isHero, onToggleTracking }) => {
    const tier = StatsBridge.getChallengeTier(stats, challenge.id);
    const value = StatsBridge.getChallengeValue(stats, challenge.id);
    const nextTier = tier < 3 ? tier + 1 : 3;
    const target = challenge.targets[nextTier - 1] || 1;
    const progress = Math.min(100, (value / target) * 100) || 0;
    const isMaxed = tier >= 3;
    const categoryColor = CHALLENGE_CATEGORY_COLORS[challenge.categoryId] || COLORS.GRAY;

    return (
        <TacticalCard
            id={`log-item-${challenge.id}`}
            showHover={true}
            color={categoryColor}
            className={`p-4 transition-all duration-300 cursor-pointer relative overflow-hidden ${isHero ? 'bg-zinc-900/80 border-white/20' : 'bg-zinc-900/50 border-white/5'}`}
            onClick={() => onToggleTracking?.(challenge.id)}
        >
            {(isHero || isMaxed) && (
                <div className="absolute inset-0 opacity-10 pointer-events-none" style={HORIZONTAL_HATCHING_STYLE} />
            )}

            <div className="flex justify-between items-start mb-2 relative z-10">
                <div className="flex flex-col">
                    <h4 className={`${isHero ? 'text-xl' : 'text-lg'} font-bold text-white uppercase tracking-tight`}>
                        {t(challenge.titleKey)}
                    </h4>
                    <p className={`${isHero ? 'text-xs' : 'text-[11px]'} text-zinc-500 italic mt-1 leading-tight max-w-[80%]`}>
                        {t(challenge.descriptionKey).replace('{target}', target.toString())}
                    </p>
                </div>

                {/* TRACKED INDICATOR (LED STYLE) */}
                {isTracked && (
                    <div className={`absolute top-[-1rem] right-[-1rem] ${isMobileDevice ? 'w-8 h-8' : 'w-10 h-10'} bg-zinc-950 border-l border-b border-white/10 flex items-center justify-center`}>
                        <div
                            className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full shadow-[0_0_10px_currentColor]"
                            style={{ backgroundColor: categoryColor.str, color: categoryColor.str }}
                        />
                    </div>
                )}

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

            <div className={`mt-4 space-y-1 relative z-10 ${isHero ? 'scale-105 origin-left' : ''}`}>
                <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                    <span className={isHero ? 'text-white font-bold' : ''}>{Math.floor(value || 0).toLocaleString()}</span>
                    <span>{target.toLocaleString()}</span>
                </div>
                <div className={`h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden ${isHero ? 'h-2 border border-white/10' : ''}`}>
                    <div
                        className={`h-full transition-all duration-1000 ${isMaxed ? 'bg-yellow-500' : ''}`}
                        style={{
                            width: `${progress}%`,
                            backgroundColor: !isMaxed ? categoryColor.str : undefined
                        }}
                    />
                </div>
            </div>
        </TacticalCard>
    );
});

const ZombiesTab: React.FC<{ stats: PlayerStats, isMobileDevice?: boolean, isDebug?: boolean }> = React.memo(({ stats, isMobileDevice, isDebug }) => {
    const zombies = useMemo(() => DataResolver.getDiscoveryList(DiscoveryType.ZOMBIE), []);

    const filteredZombies = useMemo(() => {
        const seenEnemies = StatsBridge.getSeenEnemies(stats);
        return zombies.filter(item => {
            const typeSmi = Number(item.id);
            const kills = StatsBridge.getEnemyKillCount(stats, typeSmi);
            return isDebug || seenEnemies.includes(typeSmi) || kills > 0;
        });
    }, [zombies, stats, isDebug]);

    if (filteredZombies.length === 0) {
        return <NoDataMessage />;
    }

    return (
        <div className={`grid ${isMobileDevice ? 'grid-cols-1 gap-4' : 'grid-cols-2 gap-6'} pb-12`}>
            {filteredZombies.map(item => {
                const typeSmi = Number(item.id);
                const kills = StatsBridge.getEnemyKillCount(stats, typeSmi);
                const deaths = StatsBridge.getEnemyDeathCount(stats, typeSmi);
                const key = `enemy-${typeSmi}`;
                const itemColor = item.color.str;

                // Determine discovery status. If isDebug is active (via 'Show All'), we treat as discovered.
                const isSeen = isDebug || StatsBridge.getSeenEnemies(stats).includes(typeSmi) || kills > 0;

                return (
                    <TacticalCard key={key} id={`log-item-${key}`} isLocked={!isSeen} color={item.color} showHatching={isSeen} showHover={true}>
                        <div className="flex justify-between items-start mb-4 border-b-2 border-gray-800 pb-3">
                            <h3 className="text-3xl font-light uppercase tracking-tighter" style={{ color: isSeen ? itemColor : COLORS.GRAY.str }}>
                                {isSeen ? t(DataResolver.getZombieName(typeSmi)) : '???'}
                            </h3>
                            {isSeen && (
                                <div className="flex gap-4">
                                    <div className="flex flex-col items-end">
                                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{t('ui.kills')}</span>
                                        <span className="text-xl font-semibold text-white">{kills}</span>
                                    </div>
                                    <div className="flex flex-col items-end pl-4 border-l border-gray-800">
                                        <span className="text-[10px] font-bold text-red-500/70 uppercase tracking-widest leading-tight text-right">{t('ui.killed_by_short')}</span>
                                        <span className="text-xl font-semibold text-red-500">{deaths}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="space-y-6">
                            <div className={`grid grid-cols-2 gap-2 bg-black/40 p-4 rounded border border-gray-800 ${!isSeen ? 'grayscale opacity-50' : ''}`}>
                                <div className="text-center">
                                    <div className="text-gray-500 text-[10px] font-black uppercase tracking-widest">{t('ui.health')}</div>
                                    <div className="text-2xl font-bold text-white font-mono">{isSeen ? item.hp : '???'}</div>
                                </div>
                                <div className="text-center border-l border-gray-800 ">
                                    <div className="text-gray-500 text-[10px] font-black uppercase tracking-widest">{t('ui.speed')}</div>
                                    <div className="text-2xl font-bold text-white font-mono">{isSeen ? FormatUtils.formatDecimal(item.speed, 1) : '???'}</div>
                                </div>
                            </div>

                            {!isSeen ? (
                                <p className="text-sm text-zinc-700 italic leading-relaxed text-center py-8">
                                    {t('ui.enemy_undiscovered_hint')}
                                </p>
                            ) : (
                                <div className="space-y-4">
                                    {item.attacks && item.attacks.length > 0 && (
                                        <div className="grid grid-cols-1 gap-2">
                                            {item.attacks.map((attack: any, idx: number) => {
                                                const attackSmi = attack.type;
                                                return (
                                                    <div key={idx} className="flex flex-col bg-zinc-900/40 px-3 py-2 rounded border border-gray-800/50">
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                                                                {t(DataResolver.getAttackName(attackSmi))}
                                                            </span>
                                                            <div className="flex gap-2">
                                                                <div className="flex items-center gap-1">
                                                                    <span className="text-[10px] text-gray-600 uppercase font-black">{t('ui.damage')}</span>
                                                                    <span className="text-xs font-mono text-red-400">{attack.damage}</span>
                                                                </div>
                                                                <div className="flex items-center gap-1 pl-2 border-l border-gray-800">
                                                                    <span className="text-[10px] text-gray-600 uppercase font-black">{t('ui.range')}</span>
                                                                    <span className="text-xs font-mono text-blue-400">{attack.range}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <p className="text-[11px] text-gray-500 italic mt-1 line-clamp-2">
                                                            {t(DataResolver.getAttackDescription(attackSmi))}
                                                        </p>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                    <p className="text-sm text-gray-300 italic leading-relaxed border-l-2 border-zinc-700 pl-4 py-1">
                                        "{t(DataResolver.getZombieStory(typeSmi))}"
                                    </p>
                                </div>
                            )}
                        </div>
                    </TacticalCard>
                );
            })}
        </div>
    );
});

const BossesTab: React.FC<{ stats: PlayerStats, isMobileDevice?: boolean, isDebug?: boolean }> = React.memo(({ stats, isMobileDevice, isDebug }) => {
    const sectorsList = useMemo(() => DataResolver.getSectors(), []);
    const themesList = useMemo(() => DataResolver.getSectorThemes(), []);
    const bossesList = useMemo(() => DataResolver.getDiscoveryList(DiscoveryType.BOSS), []);

    const filteredSectors = useMemo(() => {
        const seenBosses = StatsBridge.getSeenBosses(stats);
        const defeatedBosses = StatsBridge.getDeadBossIndices(stats);
        return sectorsList.filter(sectorIndex => {
            const boss = bossesList.find((b: any) => b.id === sectorIndex);
            const isSeen = boss && (seenBosses.includes(sectorIndex) || defeatedBosses.includes(sectorIndex));
            return isDebug || isSeen;
        });
    }, [sectorsList, bossesList, stats, isDebug]);

    if (filteredSectors.length === 0) {
        return <NoDataMessage />;
    }

    return (
        <div className="space-y-16 pb-12">
            {filteredSectors.map(sectorIndex => {
                const boss = bossesList.find((b: any) => b.id === sectorIndex);
                const theme = themesList[sectorIndex];
                const isSectorUnlocked = isDebug || StatsBridge.getSectorsCompleted(stats) >= sectorIndex;
                const sectorName = isSectorUnlocked ? (theme ? t(DataResolver.getSectorName(sectorIndex)) : `${t('ui.sector')} ${sectorIndex}`) : '???';

                const seenBosses = StatsBridge.getSeenBosses(stats);
                const defeatedBosses = StatsBridge.getDeadBossIndices(stats);
                const isBossUnlocked = isDebug || (boss && (seenBosses.includes(sectorIndex) || defeatedBosses.includes(sectorIndex)));
                const isDefeated = defeatedBosses.includes(sectorIndex);

                return (
                    <div key={sectorIndex} className="space-y-6">
                        <div className="flex flex-col border-b-2 border-zinc-800 pb-2">
                            <h3 className="text-3xl font-light uppercase tracking-tighter text-white">
                                {sectorName}
                            </h3>
                        </div>

                        <div className={`grid ${isMobileDevice ? 'grid-cols-1 gap-4' : 'grid-cols-1 gap-8'}`}>
                            <TacticalCard
                                isLocked={!isBossUnlocked}
                                color={boss ? boss.color : COLORS.GRAY}
                                id={boss ? `log-item-${boss.name}` : undefined}
                                showHatching={isBossUnlocked}
                                showHover={true}
                            >
                                {isBossUnlocked ? (
                                    <div className="flex flex-col h-full w-full">
                                        <div className={`flex justify-between items-start mb-4 border-b-2 border-gray-800 pb-3 ${!isBossUnlocked ? 'grayscale opacity-50' : ''}`}>
                                            <h3 className="text-3xl font-light uppercase tracking-tighter" style={{ color: boss ? boss.color.str : 'white' }}>
                                                {isBossUnlocked ? t(DataResolver.getBossName(sectorIndex)) : '???'}
                                            </h3>
                                            {isBossUnlocked && (
                                                <div className="flex flex-col items-end">
                                                    <span className="text-[10px] font-bold text-red-500/70 uppercase tracking-widest leading-tight text-right">{t('ui.killed_by_short')}</span>
                                                    <span className="text-xl font-semibold text-red-500">{StatsBridge.getEnemyDeathCount(stats, StatEnemyIndex.BOSS)}</span>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex flex-col gap-6 flex-1">
                                            <div className={`grid grid-cols-2 gap-2 bg-black/40 p-4 rounded border border-gray-800 ${!isBossUnlocked ? 'grayscale opacity-50' : ''}`}>
                                                <div className="text-center">
                                                    <div className="text-gray-500 text-[10px] font-black uppercase tracking-widest mb-1">{t('ui.health')}</div>
                                                    <div className="text-2xl font-bold text-white font-mono">{isBossUnlocked ? boss.hp : '???'}</div>
                                                </div>
                                                <div className="text-center border-l border-gray-800">
                                                    <div className="text-gray-500 text-[10px] font-black uppercase tracking-widest mb-1">{t('ui.speed')}</div>
                                                    <div className="text-2xl font-bold text-white font-mono">{isBossUnlocked ? FormatUtils.formatDecimal(boss.speed, 1) : '???'}</div>
                                                </div>
                                            </div>

                                            <div className="space-y-4">
                                                <p className="text-gray-400 text-sm leading-relaxed">{t(DataResolver.getBossStory(sectorIndex))}</p>
                                                {isDefeated && (
                                                    <p className="text-lg italic leading-relaxed border-l-4 border-green-600 pl-4 py-1 text-gray-200">
                                                        "{t(DataResolver.getBossDeathStory(sectorIndex))}"
                                                    </p>
                                                )}

                                                {boss.attacks && boss.attacks.length > 0 && (
                                                    <div className="grid grid-cols-1 gap-2 mt-4">
                                                        {boss.attacks.map((attack: any, idx: number) => {
                                                            const attackSmi = attack.type;
                                                            return (
                                                                <div key={idx} className="flex flex-col bg-zinc-900/40 px-3 py-2 rounded border border-gray-800/50">
                                                                    <div className="flex justify-between items-center">
                                                                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                                                                            {t(DataResolver.getAttackName(attackSmi))}
                                                                        </span>
                                                                        <div className="flex gap-4">
                                                                            <div className="flex items-center gap-1">
                                                                                <span className="text-[10px] text-gray-600 uppercase font-black">{t('ui.damage')}</span>
                                                                                <span className="text-xs font-mono text-red-400">{attack.damage}</span>
                                                                            </div>
                                                                            <div className="flex items-center gap-1 pl-2 border-l border-gray-800">
                                                                                <span className="text-[10px] text-gray-600 uppercase font-black">{t('ui.range')}</span>
                                                                                <span className="text-xs font-mono text-blue-400">{attack.range}</span>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    <p className="text-xs text-gray-500 italic mt-1">
                                                                        {t(DataResolver.getAttackDescription(attackSmi))}
                                                                    </p>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-sm text-zinc-700 italic leading-relaxed text-center py-8">
                                        {t('ui.boss_undiscovered_hint')}
                                    </p>
                                )}
                            </TacticalCard>
                        </div>
                    </div>
                );
            })}
        </div>
    );
});

const CollectiblesTab: React.FC<{ stats: PlayerStats, isMobileDevice?: boolean, effectiveLandscape?: boolean, isDebug?: boolean }> = React.memo(({ stats, isMobileDevice, effectiveLandscape, isDebug }) => {
    const foundIds = StatsBridge.getCollectiblesDiscovered(stats);
    const items = useMemo(() => DataResolver.getDiscoveryList(DiscoveryType.COLLECTIBLE), []);
    const themes = useMemo(() => DataResolver.getSectorThemes(), []);

    const sectorsCompleted = StatsBridge.getSectorsCompleted(stats);
    // Always show the sector list
    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-16 pb-12">
            {SECTORS.map(sectorId => {
                const sectorItems = items.filter(c => c.sector === sectorId);
                const isSectorUnlocked = isDebug || sectorId === SectorID.VILLAGE || sectorsCompleted >= sectorId;

                // Accurate found count regardless of data pollution (strings vs objects)
                const discoveredItems = sectorItems.filter(c => {
                    return foundIds.some(fid => DataResolver.resolveCollectibleID(fid) === c.id);
                });

                const itemsToShow = isDebug ? sectorItems : discoveredItems;

                // Always show the sector if it has items defined in the data
                if (sectorItems.length === 0) return null;

                // Enforce 0 count for locked sectors to avoid revealing progress early
                const foundCount = isSectorUnlocked ? discoveredItems.length : 0;

                return (
                    <div key={sectorId} className="space-y-6">
                        <div className="flex flex-col border-b-2 border-zinc-800 pb-2">
                            <h3 className="text-3xl font-light uppercase tracking-tighter text-white">
                                {isSectorUnlocked ? (themes[sectorId] ? t(DataResolver.getSectorName(sectorId)) : `${t('ui.sector')} ${sectorId}`) : '???'}
                            </h3>
                            <span className="text-sm font-mono text-zinc-600 font-light uppercase mt-1">
                                {foundCount} / {sectorItems.length} {t('ui.collected')}
                            </span>
                        </div>

                        {(isSectorUnlocked || isDebug) ? (
                            itemsToShow.length > 0 ? (
                                <div className={`grid ${effectiveLandscape ? 'grid-cols-2 gap-6' : 'grid-cols-1 gap-4'}`}>
                                    {itemsToShow.map(item => {
                                        const isFound = isDebug || foundIds.some(fid => DataResolver.resolveCollectibleID(fid) === item.id);
                                        return (
                                            <TacticalCard key={item.id} id={`log-item-${item.id}`} isLocked={!isFound} color={COLORS.YELLOW} className="p-0" showHover={isFound}>
                                                <DescriptionExpansion item={item} isFound={isFound} isMobileDevice={isMobileDevice} />
                                            </TacticalCard>
                                        );
                                    })}
                                </div>
                            ) : (
                                <NoDataMessage />
                            )
                        ) : (
                            <div className="py-8 flex flex-col items-center justify-center border border-dashed border-zinc-900 rounded-lg bg-zinc-900/10">
                                <span className="text-zinc-700 italic text-[10px] uppercase tracking-widest">{t('ui.sector_undiscovered_hint')}</span>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
});

const CluesTab: React.FC<{ stats: PlayerStats, isMobileDevice?: boolean, effectiveLandscape?: boolean, isDebug?: boolean }> = React.memo(({ stats, isMobileDevice, effectiveLandscape, isDebug }) => {
    const foundIds = StatsBridge.getCluesFound(stats);
    const items = useMemo(() => DataResolver.getDiscoveryList(DiscoveryType.CLUE), []);
    const themes = useMemo(() => DataResolver.getSectorThemes(), []);

    const sectorsCompleted = StatsBridge.getSectorsCompleted(stats);
    // Always show the sector list
    return (
        <div className="space-y-16 pb-12">
            {SECTORS.map(sectorId => {
                const sectorItems = items.filter(c => c.sector === sectorId);
                const isSectorUnlocked = isDebug || sectorId === SectorID.VILLAGE || sectorsCompleted >= sectorId;

                // Accurate found count regardless of data pollution (strings vs objects)
                const discoveredItems = sectorItems.filter(c => {
                    return foundIds.some(fid => DataResolver.resolveClueID(fid) === c.id);
                });

                const itemsToShow = isDebug ? sectorItems : discoveredItems;

                // Always show the sector if it has items defined in the data
                if (sectorItems.length === 0) return null;

                // Enforce 0 count for locked sectors to avoid revealing progress early
                const foundCount = isSectorUnlocked ? discoveredItems.length : 0;

                return (
                    <div key={sectorId} className="space-y-6">
                        <div className="flex flex-col border-b-2 border-zinc-800 pb-2">
                            <h3 className="text-3xl font-light uppercase tracking-tighter text-white">
                                {isSectorUnlocked ? (themes[sectorId] ? t(DataResolver.getSectorName(sectorId)) : `${t('ui.sector')} ${sectorId}`) : '???'}
                            </h3>
                            {isSectorUnlocked && (
                                <span className="text-sm font-mono text-zinc-600 font-light uppercase mt-1">
                                    {foundCount} / {sectorItems.length} {t('ui.discovered')}
                                </span>
                            )}
                        </div>

                        {(isSectorUnlocked || isDebug) ? (
                            itemsToShow.length > 0 ? (
                                <div className={`grid ${effectiveLandscape ? 'grid-cols-2 gap-6' : 'grid-cols-1 gap-4'}`}>
                                    {itemsToShow.map((clue) => {
                                        const isFound = isDebug || foundIds.some(fid => DataResolver.resolveClueID(fid) === clue.id);
                                        const isThought = clue.type === 'THOUGHT';
                                        const typeColor = isThought ? COLORS.BLUE : COLORS.YELLOW;
                                        return (
                                            <TacticalCard key={clue.id} id={`log-item-${clue.id}`} isLocked={!isFound} color={typeColor} showHover={isFound} className={`flex flex-col ${isMobileDevice ? 'p-4' : 'p-6'}`}>
                                                <div className="flex flex-col gap-4 relative z-10 w-full">
                                                    <div className="flex justify-between items-center border-b border-zinc-800/50 pb-2">
                                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded text-white uppercase tracking-widest" style={{ backgroundColor: isFound ? typeColor.str : '#333' }}>
                                                            {isFound ? clue.type : '???'}
                                                        </span>
                                                    </div>
                                                    <p className={`text-lg italic leading-relaxed border-l-4 pl-4 py-1 ${isFound ? 'text-gray-200' : 'text-zinc-800'}`} style={{ borderColor: isFound ? typeColor.str : '#333' }}>
                                                        {isFound ? `"${t(DataResolver.getClueReaction(clue.id))}"` : '???'}
                                                    </p>
                                                </div>
                                            </TacticalCard>
                                        );
                                    })}
                                </div>
                            ) : (
                                <NoDataMessage />
                            )
                        ) : (
                            <div className="py-8 flex flex-col items-center justify-center border border-dashed border-zinc-900 rounded-lg bg-zinc-900/10">
                                <span className="text-zinc-700 italic text-[10px] uppercase tracking-widest">{t('ui.clue_undiscovered_hint')}</span>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
});

const PoiTab: React.FC<{ stats: PlayerStats, isMobileDevice?: boolean, effectiveLandscape?: boolean, isDebug?: boolean }> = React.memo(({ stats, isMobileDevice, effectiveLandscape, isDebug }) => {
    const visitedList = StatsBridge.getDiscoveredPOIs(stats);
    const items = useMemo(() => DataResolver.getDiscoveryList(DiscoveryType.POI), []);
    const themes = useMemo(() => DataResolver.getSectorThemes(), []);

    const sectorsCompleted = StatsBridge.getSectorsCompleted(stats);
    // Removed hasAny check to always show the list of sectors

    return (
        <div className="space-y-16 pb-12">
            {SECTORS.map(sectorId => {
                const sectorItems = items.filter(poi => poi.sector === sectorId);
                const isSectorUnlocked = isDebug || sectorId === SectorID.VILLAGE || sectorsCompleted >= sectorId;

                // Normalize visitedList (POI IDs)
                const discoveredItems = sectorItems.filter(poi => {
                    return visitedList.some(fid => DataResolver.resolvePoiID(fid) === poi.id);
                });

                const itemsToShow = isDebug ? sectorItems : discoveredItems;

                // Always show the sector if it has items defined in the data
                if (sectorItems.length === 0) return null;

                // Enforce 0 count for locked sectors
                const foundCount = isSectorUnlocked ? discoveredItems.length : 0;

                return (
                    <div key={sectorId} className="space-y-6">
                        <div className="flex flex-col border-b-2 border-zinc-800 pb-2">
                            <h3 className="text-3xl font-light uppercase tracking-tighter text-white">
                                {isSectorUnlocked ? (themes[sectorId] ? t(DataResolver.getSectorName(sectorId)) : `${t('ui.sector')} ${sectorId}`) : '???'}
                            </h3>
                            {isSectorUnlocked && (
                                <span className="text-sm font-mono text-zinc-600 font-light uppercase mt-1">
                                    {foundCount} / {sectorItems.length} {t('ui.discovered')}
                                </span>
                            )}
                        </div>

                        {(isSectorUnlocked || isDebug) ? (
                            itemsToShow.length > 0 ? (
                                <div className={`grid ${effectiveLandscape ? 'grid-cols-2 gap-6' : 'grid-cols-1 gap-4'}`}>
                                    {itemsToShow.map((poi) => {
                                        const poiId = poi.id;
                                        const isFound = isDebug || visitedList.some(fid => DataResolver.resolvePoiID(fid) === poiId);
                                        return (
                                            <TacticalCard key={poiId} id={`log-item-${poiId}`} isLocked={!isFound} color={COLORS.YELLOW} showHover={isFound} className={isMobileDevice ? 'p-4' : 'p-6'}>
                                                <div className="flex flex-col gap-4 relative z-10 w-full">
                                                    <div className="flex justify-between items-start border-b border-zinc-800/50 pb-3">
                                                        <h3 className={`text-2xl font-semibold uppercase tracking-tighter ${isFound ? 'text-white' : 'text-zinc-800'}`}>
                                                            {isFound ? t(DataResolver.getPoiName(poiId)) : '???'}
                                                        </h3>
                                                    </div>
                                                    <div className="space-y-3">
                                                        <p className={`text-sm leading-relaxed ${isFound ? 'text-zinc-400' : 'text-zinc-800'}`}>
                                                            {isFound ? t(DataResolver.getPoiDescription(poiId)) : '???'}
                                                        </p>
                                                        {isFound && DataResolver.getPoiReaction(poiId) && (
                                                            <p className="text-lg italic leading-relaxed border-l-4 pl-4 py-1 border-blue-500 text-gray-200">
                                                                "{t(DataResolver.getPoiReaction(poiId))}"
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            </TacticalCard>
                                        );
                                    })}
                                </div>
                            ) : (
                                <NoDataMessage />
                            )
                        ) : (
                            <div className="py-8 flex flex-col items-center justify-center border border-dashed border-zinc-900 rounded-lg bg-zinc-900/10">
                                <span className="text-zinc-700 italic text-[10px] uppercase tracking-widest">{t('ui.sector_undiscovered_hint')}</span>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
});

// --- HELPER COMPONENTS ---
const NoDataMessage: React.FC<{ message?: string }> = ({ message }) => (
    <div className="flex flex-col items-center justify-center py-24 opacity-30">
        <span className="text-zinc-500 italic tracking-widest uppercase text-sm">
            {message || t('ui.no_data_available')}
        </span>
        <div className="w-12 h-0.5 bg-zinc-800 mt-4" />
    </div>
);

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
                    <p className="whitespace-pre-wrap text-[12px] text-zinc-400 leading-relaxed italic animate-in fade-in slide-in-from-top-1 duration-300">
                        {isFound ? t(DataResolver.getCollectibleDescription(item.id)) : '???'}
                    </p>
                )}
            </div>
        </div>
    );
};


export default ScreenAdventureLog;

