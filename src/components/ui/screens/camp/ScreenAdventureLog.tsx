import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { PlayerStats, PlayerStatID } from '../../../../entities/player/PlayerTypes';
import { t } from '../../../../utils/i18n';
import { useOrientation } from '../../../../hooks/useOrientation';
import ScreenModalLayout from '../../layout/ScreenModalLayout';
import CollectiblePreview from '../../core/CollectiblePreview';
import { UiSounds } from '../../../../utils/audio/AudioLib';
import { DiscoveryType } from '../../hud/HudTypes';
import { EnemyType } from '../../../../entities/enemies/EnemyTypes';
import { DataResolver } from '../../../../utils/ui/DataResolver';
import { PerkCategory, PerkColor } from '../../../../content/perks';

interface ScreenAdventureLogProps {
    stats: PlayerStats;
    onClose: () => void;
    onMarkCollectiblesViewed?: (collectibleIds: string[]) => void;
    isMobileDevice?: boolean;
    debugMode?: boolean;
    initialTab?: Tab;
    initialItemId?: string | null;
}

type Tab = 'stats' | 'perks' | 'collectibles' | 'clues' | 'poi' | 'enemy' | 'boss';

// --- ZERO-GC STATIC ARRAYS & CONFIGS ---
const EMPTY_ARRAY: any[] = [];
const TABS: { id: Tab, label: string }[] = [
    { id: 'stats', label: 'stations.stats' },
    { id: 'perks', label: 'ui.log_perks' },
    { id: 'collectibles', label: 'ui.log_collectibles' },
    { id: 'clues', label: 'ui.log_clues' },
    { id: 'poi', label: 'ui.log_poi' },
    { id: 'enemy', label: 'ui.log_enemies' },
    { id: 'boss', label: 'ui.log_bosses' },
];
const SECTORS = [0, 1, 2, 3];
const THEME_COLOR = '#16a34a'; // green-600

const darkenColor = (hex: string, percent: number) => {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) - amt;
    const G = (num >> 8 & 0x00FF) - amt;
    const B = (num & 0x0000FF) - amt;
    return '#' + (0x1000000 + (R < 255 ? R < 0 ? 0 : R : 255) * 0x10000 + (G < 255 ? G < 0 ? 0 : G : 255) * 0x100 + (B < 255 ? B < 0 ? 0 : B : 255)).toString(16).slice(1);
};

const ScreenAdventureLog: React.FC<ScreenAdventureLogProps> = ({ stats, onClose, onMarkCollectiblesViewed, isMobileDevice, debugMode, initialTab, initialItemId }) => {
    const { isLandscapeMode } = useOrientation();
    const effectiveLandscape = isLandscapeMode || !isMobileDevice;
    const [activeTab, setActiveTab] = useState<Tab>(initialTab || 'stats');

    const isDebugMode = (debugMode !== undefined ? debugMode : false) || (window as any).gameEngine?.sectorContext?.debugMode || (window as any).WD_DEBUG === true || localStorage.getItem('wd_debug') === 'true';

    // Mark all found collectibles as viewed when the log is opened
    useEffect(() => {
        const foundIds = stats.collectiblesDiscovered || EMPTY_ARRAY;
        const viewedIds = stats.viewedCollectibles || EMPTY_ARRAY;

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
    }, [stats.collectiblesDiscovered, stats.viewedCollectibles, onMarkCollectiblesViewed]);

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

    const handleTabChange = useCallback((tab: Tab) => {
        UiSounds.playClick();
        setActiveTab(tab);
    }, []);

    const handleDebugShowAll = useCallback(() => {
        switch (activeTab) {
            case 'collectibles': {
                const allIds = Object.keys(DataResolver.getCollectibles());
                stats.collectiblesDiscovered = [...new Set([...(stats.collectiblesDiscovered || []), ...allIds])];
                if (onMarkCollectiblesViewed) onMarkCollectiblesViewed(allIds);
                break;
            }
            case 'clues': {
                const allClueIds = Object.keys(DataResolver.getClues());
                stats.cluesFound = [...new Set([...(stats.cluesFound || []), ...allClueIds])];
                break;
            }
            case 'poi': {
                const allPois = DataResolver.getDiscoveryList(DiscoveryType.POI);
                const allPoiIds = allPois.map(p => p.id);
                stats.discoveredPOIs = [...new Set([...(stats.discoveredPOIs || []), ...allPoiIds])];
                break;
            }
            case 'enemy': {
                const allTypes = Object.values(EnemyType).filter(v => typeof v === 'number') as number[];
                stats.seenEnemies = [...new Set([...(stats.seenEnemies || []), ...allTypes])];
                if (!stats.killsByType) stats.killsByType = {};
                allTypes.forEach(typeSmi => {
                    if (stats.killsByType![typeSmi] === undefined) stats.killsByType![typeSmi] = 0;
                });
                break;
            }
            case 'boss': {
                const allBossIds = [0, 1, 2, 3];
                stats.seenBosses = [...new Set([...(stats.seenBosses || []), ...allBossIds])];
                stats.bossesDefeated = [...new Set([...(stats.bossesDefeated || []), ...allBossIds])];
                break;
            }
        }

        UiSounds.playConfirm();
        const current = activeTab;
        setActiveTab(current === 'poi' ? 'enemy' : 'poi');
        setTimeout(() => setActiveTab(current), 50);
    }, [activeTab, stats, onMarkCollectiblesViewed]);

    return (
        <ScreenModalLayout
            title={t('stations.adventure_log')}
            isMobileDevice={isMobileDevice}
            onClose={onClose}
            onCancel={onClose}
            cancelLabel={t('ui.close')}
            titleColorClass="text-green-600"
            debugAction={isDebugMode ? { label: "SHOW ALL (DEBUG)", action: handleDebugShowAll } : undefined}
            tabs={TABS.map(t => t.id)}
            activeTab={activeTab}
            onTabChange={handleTabChange}
            tabOrientation={effectiveLandscape ? 'vertical' : 'horizontal'}
        >
            <div className={`flex h-full ${effectiveLandscape ? 'flex-row gap-8' : 'flex-col gap-4'}`}>
                {/* Tabs Bar */}
                <div className={`relative shrink-0 ${effectiveLandscape ? 'w-1/3 flex flex-col gap-4 overflow-y-auto pl-safe custom-scrollbar' : ''}`}>
                    <div className={`${effectiveLandscape ? 'flex flex-col gap-4 pt-4 pr-10' : 'flex gap-2 border-b-2 border-zinc-800 pb-2 md:pb-4 overflow-x-auto px-4 pt-2 items-end scrollbar-hide'}`}>
                        {TABS.map(tab => {
                            const isActive = activeTab === tab.id;
                            return (
                                <button key={tab.id} onClick={() => handleTabChange(tab.id as Tab)}
                                    className={`px-3 md:px-6 py-1.5 md:py-4 transition-all duration-200 hover:scale-105 active:scale-95 whitespace-nowrap flex justify-between items-center border-2 border-zinc-700
                                        ${isActive ? 'text-white animate-tab-pulsate' : 'bg-black text-zinc-400 hover:bg-zinc-900'} 
                                        ${effectiveLandscape ? 'w-full text-left p-4 md:p-6 text-xl font-semibold uppercase tracking-wider mx-2' : 'text-[10px] md:text-lg font-bold uppercase tracking-widest'}
                                    `}
                                    style={isActive ? { backgroundColor: darkenColor(THEME_COLOR, 20), '--pulse-color': THEME_COLOR } as any : {}}
                                >
                                    <span>{t(tab.label)}</span>
                                    {isActive && effectiveLandscape && <span className="text-white font-bold ml-2">→</span>}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Content Area - DYNAMIC MOUNTING (Performance Fix 1) */}
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar relative">
                    {activeTab === 'stats' && (
                        <div className="h-full">
                            <StatsTab stats={stats} isMobileDevice={!effectiveLandscape} />
                        </div>
                    )}
                    {activeTab === 'perks' && (
                        <div>
                            <PerksTab stats={stats} color={THEME_COLOR} isMobileDevice={isMobileDevice} effectiveLandscape={effectiveLandscape} isDebug={isDebugMode} />
                        </div>
                    )}
                    {activeTab === 'enemy' && (
                        <div>
                            <EnemyTab stats={stats} color={THEME_COLOR} isMobileDevice={isMobileDevice} effectiveLandscape={effectiveLandscape} />
                        </div>
                    )}
                    {activeTab === 'boss' && (
                        <div>
                            <BossTab stats={stats} color={THEME_COLOR} isMobileDevice={isMobileDevice} effectiveLandscape={effectiveLandscape} isDebug={isDebugMode} />
                        </div>
                    )}
                    {activeTab === 'collectibles' && (
                        <div>
                            <CollectiblesTab stats={stats} isMobileDevice={!effectiveLandscape} effectiveLandscape={effectiveLandscape} isDebug={isDebugMode} />
                        </div>
                    )}
                    {activeTab === 'clues' && (
                        <div>
                            <CluesTab stats={stats} color={'#eab308'} isMobileDevice={isMobileDevice} effectiveLandscape={effectiveLandscape} isDebug={isDebugMode} />
                        </div>
                    )}
                    {activeTab === 'poi' && (
                        <div>
                            <PoiTab stats={stats} color={'#3b82f6'} isMobileDevice={isMobileDevice} effectiveLandscape={effectiveLandscape} isDebug={isDebugMode} />
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
            `}</style>
        </ScreenModalLayout>
    );
};

const StatsTab: React.FC<{ stats: PlayerStats, isMobileDevice?: boolean }> = React.memo(({ stats, isMobileDevice }) => {
    const sb = stats.statsBuffer;
    const level = Math.floor(sb[PlayerStatID.LEVEL]);
    const currentXp = Math.floor(sb[PlayerStatID.CURRENT_XP]);
    const nextLevelXp = Math.floor(sb[PlayerStatID.NEXT_LEVEL_XP]);
    const totalKills = Math.floor(sb[PlayerStatID.TOTAL_KILLS]);
    const dmgDealt = Math.floor(sb[PlayerStatID.TOTAL_DAMAGE_DEALT]);
    const dmgTaken = Math.floor(sb[PlayerStatID.TOTAL_DAMAGE_TAKEN]);
    const scrapTotal = Math.floor(sb[PlayerStatID.TOTAL_SCRAP_COLLECTED]);

    const getRank = (lvl: number) => {
        return t(DataResolver.getRankName(lvl));
    };

    const accuracy = stats.totalBulletsFired > 0
        ? ((stats.totalBulletsHit || 0) / stats.totalBulletsFired * 100).toFixed(1)
        : '0.0';

    const killsLabel = t('ui.kills');
    const displayKillsLabel = killsLabel.charAt(0).toUpperCase() + killsLabel.slice(1).toLowerCase();

    return (
        <div className={`flex h-full gap-6 md:gap-12 pb-12 ${isMobileDevice ? 'flex-col overflow-y-auto' : ''}`}>
            {/* LEFT COLUMN */}
            <div className={`${isMobileDevice ? 'w-full shrink-0' : 'w-1/3'} flex flex-col gap-6`}>
                {/* RANK BOX */}
                <div className="bg-blue-900/20 border-2 border-blue-500/50 p-6 flex flex-col items-center text-center">
                    <span className="text-blue-400 text-sm font-bold uppercase tracking-widest mb-2">{t('ui.current_rank')}</span>
                    <h1 className="text-4xl font-semibold text-white uppercase tracking-tighter mb-4">{getRank(level)}</h1>
                    <div className="w-full bg-black h-4 border border-blue-900 relative">
                        <div className="h-full bg-blue-500" style={{ width: `${nextLevelXp > 0 ? (currentXp / nextLevelXp) * 100 : 0}%` }}></div>
                    </div>
                    <div className="flex justify-between w-full mt-2 text-xs font-mono text-blue-300">
                        <span>{t('ui.lvl')} {level}</span>
                        <span>{currentXp} / {nextLevelXp} {t('ui.xp')}</span>
                    </div>
                </div>

                {/* FAMILY BOX */}
                <div className="bg-black border border-gray-800 p-6 h-fit">
                    <h3 className="text-xl font-semibold text-gray-400 uppercase tracking-wider mb-4 border-b border-gray-800 pb-2">{t('ui.family_header')}</h3>
                    <div className="space-y-3 text-sm">
                        <div className="flex justify-between items-end"><span className="text-gray-500">{t('ui.rescued_family_members')}</span><span className="text-white font-mono text-lg">{stats.familyFoundCount}</span></div>
                        <div className="flex justify-between items-end"><span className="text-gray-500">{t('ui.clues_found')}</span><span className="text-white font-mono text-lg">{stats.cluesFound?.length || 0}</span></div>
                    </div>
                </div>
            </div>

            {/* RIGHT COLUMN */}
            <div className={`flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 content-start ${isMobileDevice ? 'shrink-0' : ''}`}>
                {/* PERFORMANCE BOX */}
                <div className="bg-black border border-gray-800 p-6">
                    <h3 className="text-xl font-semibold text-gray-400 uppercase tracking-wider mb-4 border-b border-gray-800 pb-2">{t('ui.performance')}</h3>
                    <div className="space-y-3 text-sm">
                        <div className="flex justify-between items-end"><span className="text-gray-500">{t('ui.xp_earned')}</span><span className="text-blue-400 font-mono font-bold text-lg">{currentXp + ((level - 1) * 1000)}</span></div>
                        <div className="flex justify-between items-end"><span className="text-gray-500">{t('ui.sp_earned')}</span><span className="text-purple-400 font-mono font-bold text-lg">{stats.totalSkillPointsEarned}</span></div>
                        <div className="flex justify-between items-end"><span className="text-gray-500">{t('ui.scrap_scavenged')}</span><span className="text-yellow-500 font-mono text-lg">{scrapTotal.toLocaleString()}</span></div>
                        <div className="flex justify-between items-end"><span className="text-gray-500">{t('ui.sectors_completed')}</span><span className="text-white font-mono text-lg">{stats.sectorsCompleted}</span></div>
                        <div className="flex justify-between items-end"><span className="text-gray-500">{t('ui.chests_opened')}</span><span className="text-white font-mono text-lg">{stats.chestsOpened + stats.bigChestsOpened}</span></div>
                        <div className="h-px bg-gray-800 my-2"></div>
                        <div className="flex justify-between items-end"><span className="text-gray-500">{t('ui.incoming_damage')}</span><span className="text-white font-mono text-lg">{dmgTaken.toLocaleString()}</span></div>
                        <div className="flex justify-between items-end"><span className="text-gray-500">{t('ui.outgoing_damage')}</span><span className="text-white font-mono text-lg">{dmgDealt.toLocaleString()}</span></div>
                        <div className="h-px bg-gray-800 my-2"></div>
                        <div className="flex justify-between items-end"><span className="text-gray-500">{t('ui.shots_fired')}</span><span className="text-white font-mono text-lg">{stats.totalBulletsFired.toLocaleString()}</span></div>
                        <div className="flex justify-between items-end"><span className="text-gray-500">{t('ui.shots_hit')}</span><span className="text-white font-mono text-lg">{(stats.totalBulletsHit || 0).toLocaleString()}</span></div>
                        <div className="flex justify-between items-end"><span className="text-gray-500">{t('ui.accuracy')}</span><span className="text-blue-300 font-mono text-lg">{accuracy}%</span></div>
                    </div>
                </div>

                {/* COMBAT BOX */}
                <div className="bg-black border border-gray-800 p-6 flex-1">
                    <h3 className="text-xl font-semibold text-gray-400 uppercase tracking-wider mb-4 border-b border-gray-800 pb-2">{t('ui.combat')}</h3>
                    <div className="space-y-3 text-sm">
                        <div className="flex justify-between items-end"><span className="text-gray-500">{displayKillsLabel}</span><span className="text-white font-mono text-lg">{totalKills}</span></div>
                        <div className="flex justify-between items-end"><span className="text-gray-500">{t('ui.deaths')}</span><span className="text-white font-mono text-lg">{stats.deaths}</span></div>
                        <div className="flex justify-between items-end"><span className="text-gray-500">{t('ui.throwables_thrown')}</span><span className="text-white font-mono text-lg">{stats.totalThrowablesThrown || 0}</span></div>
                    </div>

                    <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mt-6 mb-2 border-b border-gray-800 pb-1">{t('ui.kill_log')}</h3>
                    <div className="overflow-y-auto max-h-[350px] custom-scrollbar pr-2">
                        {stats.killsByType && Object.entries(stats.killsByType).map(([type, count]) => (
                            <div key={type} className="flex justify-between items-end text-xs py-1 border-b border-gray-900">
                                <span className="text-gray-400 font-medium">
                                    {t(DataResolver.getZombieName(Number(type) as EnemyType))}
                                </span>
                                <span className="text-white font-mono text-lg">{count as number}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
});

const EnemyTab: React.FC<{ stats: PlayerStats, color: string, isMobileDevice?: boolean, effectiveLandscape?: boolean }> = React.memo(({ stats, color, isMobileDevice, effectiveLandscape }) => {
    // PERFORMANCE FIX 2: useMemo for static arrays
    const enemies = useMemo(() => DataResolver.getDiscoveryList(DiscoveryType.ENEMY), []);

    const getEnemyStory = (type: number) => {
        return t(DataResolver.getZombieStory(type as EnemyType));
    };

    return (
        <div className={`grid ${isMobileDevice ? 'grid-cols-1 gap-4' : 'grid-cols-2 gap-6'} pb-12`}>
            {enemies.map((data) => {
                const typeSmi = data.type; // Use the numeric type directly
                const key = data.id;
                const isSeen = (stats.seenEnemies || EMPTY_ARRAY).includes(typeSmi) || (stats.killsByType && stats.killsByType[typeSmi] > 0);
                if (!isSeen) return null;
                const itemColor = `#${data.color.toString(16).padStart(6, '0')}`;

                return (
                    <Card key={key} id={`log-item-${key}`} isLocked={!isSeen} color={itemColor}>
                        <div className="flex justify-between items-start mb-4 border-b-2 border-gray-800 pb-3">
                            <h3 className="text-3xl font-light uppercase tracking-tighter" style={{ color: isSeen ? itemColor : '#4b5563' }}>
                                {isSeen ? t(DataResolver.getZombieName(typeSmi)) : '???'}
                            </h3>
                            {isSeen && (
                                <div className="flex gap-4">
                                    <div className="flex flex-col items-end">
                                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{t('ui.kills')}</span>
                                        <span className="text-xl font-semibold text-white">{stats.killsByType?.[typeSmi] || 0}</span>
                                    </div>
                                    <div className="flex flex-col items-end pl-4 border-l border-gray-800">
                                        <span className="text-[10px] font-bold text-red-500/70 uppercase tracking-widest leading-tight text-right">{t('ui.killed_by_short')}</span>
                                        <span className="text-xl font-semibold text-red-500">{stats.deathsByEnemyType?.[typeSmi] || 0}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-2 bg-black/40 p-4 rounded border border-gray-800">
                                <div className="text-center">
                                    <div className="text-gray-500 text-[10px] font-black uppercase tracking-widest">{t('ui.health')}</div>
                                    <div className="text-2xl font-bold text-white font-mono">{data.hp}</div>
                                </div>
                                <div className="text-center border-l border-gray-800 ">
                                    <div className="text-gray-500 text-[10px] font-black uppercase tracking-widest">{t('ui.speed')}</div>
                                    <div className="text-2xl font-bold text-white font-mono">{data.speed.toFixed(1)}</div>
                                </div>
                                <div></div>
                            </div>

                            {data.attacks && data.attacks.length > 0 && (
                                <div className="space-y-2">
                                    <div className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                        <div className="h-[1px] flex-1 bg-gray-800"></div>
                                        {t('ui.combat')}
                                        <div className="h-[1px] flex-1 bg-gray-800"></div>
                                    </div>
                                    <div className="grid grid-cols-1 gap-2">
                                        {data.attacks.map((attack: any, idx: number) => {
                                            const attackSmi = attack.type;
                                            return (
                                                <div key={idx} className="flex flex-col bg-zinc-900/40 px-3 py-2 rounded border border-gray-800/50">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                                                            {t(DataResolver.getAttackName(attackSmi))}
                                                        </span>
                                                        <div className="flex gap-2">
                                                            <div className="flex items-center gap-1">
                                                                <span className="text-xs text-gray-600 uppercase font-black">{t('ui.damage')}</span>
                                                                <span className="text-xs font-mono text-red-400">{attack.damage}</span>
                                                            </div>
                                                            <div className="flex items-center gap-1">
                                                                <span className="text-xs text-gray-600 uppercase font-black">{t('ui.range')}</span>
                                                                <span className="text-xs font-mono text-blue-400">{attack.range}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <p className="text-[12px] text-gray-500 italic mt-1 line-clamp-3 leading-tight">
                                                        {t(DataResolver.getAttackDescription(attackSmi))}
                                                    </p>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <p className="text-sm text-gray-300 italic leading-relaxed pl-2 py-3">
                                        "{getEnemyStory(typeSmi)}"
                                    </p>
                                </div>
                            )}
                        </div>
                    </Card>
                );
            })}
        </div>
    );
});

const BossTab: React.FC<{ stats: PlayerStats, color: string, isMobileDevice?: boolean, effectiveLandscape?: boolean, isDebug?: boolean }> = React.memo(({ stats, color, isMobileDevice, effectiveLandscape, isDebug }) => {
    // PERFORMANCE FIX 2: useMemo for static arrays
    const sectorsList = useMemo(() => DataResolver.getSectors(), []);
    const themesList = useMemo(() => DataResolver.getSectorThemes(), []);
    const bossesList = useMemo(() => DataResolver.getDiscoveryList(DiscoveryType.BOSS), []);

    const getBossStory = (bossId: number) => {
        return t(DataResolver.getBossStory(bossId));
    };

    const getBossDeathStory = (bossId: number) => {
        return t(DataResolver.getBossDeathStory(bossId));
    };

    return (
        <div className="space-y-16 pb-12">
            {sectorsList.map(sectorIndex => {
                const boss = bossesList[sectorIndex];
                const theme = themesList[sectorIndex];
                const isSectorUnlocked = isDebug || stats.sectorsCompleted >= sectorIndex;
                const sectorName = isSectorUnlocked ? (theme ? t(DataResolver.getSectorName(sectorIndex)) : `Sector ${sectorIndex}`) : '???';

                const isSeen = boss && ((stats.seenBosses || EMPTY_ARRAY).includes(sectorIndex) || (stats.bossesDefeated || EMPTY_ARRAY).includes(sectorIndex));
                const isDefeated = (stats.bossesDefeated || EMPTY_ARRAY).includes(sectorIndex);
                const isBossUnlocked = boss && (isSeen || isDefeated || isDebug);

                return (
                    <div key={sectorIndex} className="space-y-6">
                        <div className="flex flex-col border-b-2 border-zinc-800 pb-2">
                            <h3 className="text-3xl font-light uppercase tracking-tighter text-white">
                                {sectorName}
                            </h3>
                        </div>

                        <div className={`grid ${isMobileDevice ? 'grid-cols-1 gap-4' : 'grid-cols-1 gap-8'}`}>
                            {isBossUnlocked ? (
                                <Card isLocked={false} color={boss ? `#${boss.color.toString(16).padStart(6, '0')}` : '#4b5563'} id={boss ? `log-item-${boss.name}` : undefined}>
                                    <div className="flex flex-col h-full">
                                        <div className="flex justify-between items-start mb-4 border-b-2 border-gray-800 pb-3">
                                            <div className="flex flex-col">
                                                <h3 className="text-3xl font-light uppercase tracking-tighter" style={{ color: boss ? `#${boss.color.toString(16).padStart(6, '0')}` : 'white' }}>
                                                    {t(DataResolver.getBossName(sectorIndex))}
                                                </h3>
                                            </div>
                                            <div className="flex flex-col items-end">
                                                <span className="text-[10px] font-bold text-red-500/70 uppercase tracking-widest leading-tight text-right">{t('ui.killed_by_short')}</span>
                                                <span className="text-xl font-semibold text-red-500">{stats.deathsByEnemyType?.[EnemyType.BOSS] || 0}</span>
                                            </div>
                                        </div>

                                        <div className="flex flex-col gap-6 flex-1">
                                            <div className="grid grid-cols-2 gap-2 bg-black/40 p-4 rounded border border-gray-800">
                                                <div className="text-center">
                                                    <div className="text-gray-500 text-[10px] font-black uppercase tracking-widest mb-1">{t('ui.health')}</div>
                                                    <div className="text-2xl font-bold text-white font-mono">{boss.hp}</div>
                                                </div>
                                                <div className="text-center border-l border-gray-800">
                                                    <div className="text-gray-500 text-[10px] font-black uppercase tracking-widest mb-1">{t('ui.speed')}</div>
                                                    <div className="text-2xl font-bold text-white font-mono">{boss.speed.toFixed(1)}</div>
                                                </div>
                                                <div></div>
                                            </div>
                                            <div className="space-y-4">
                                                <p className="text-gray-400 text-sm leading-relaxed">{getBossStory(sectorIndex)}</p>

                                                {isDefeated && (
                                                    <p className="text-lg italic leading-relaxed border-l-4 pl-4 py-1 text-gray-200" style={{ borderColor: color }}>
                                                        "{getBossDeathStory(sectorIndex)}"
                                                    </p>
                                                )}

                                                {boss.attacks && boss.attacks.length > 0 && (
                                                    <div className="space-y-2 mt-4">
                                                        <div className="text-[10px] font-black text-gray-600 uppercase tracking-widest flex items-center gap-2">
                                                            <div className="h-[1px] flex-1 bg-gray-800"></div>
                                                            {t('ui.combat')}
                                                            <div className="h-[1px] flex-1 bg-gray-800"></div>
                                                        </div>
                                                        <div className="grid grid-cols-1 gap-2">
                                                            {boss.attacks.map((attack: any, idx: number) => {
                                                                const attackSmi = attack.type;
                                                                return (
                                                                    <div key={idx} className="flex flex-col bg-zinc-900/40 px-3 py-2 rounded border border-gray-800/50">
                                                                        <div className="flex justify-between items-center">
                                                                            <div className="flex flex-col">
                                                                                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                                                                                    {t(DataResolver.getAttackName(attackSmi))}
                                                                                </span>
                                                                            </div>
                                                                            <div className="flex gap-4">
                                                                                <div className="flex items-center gap-1">
                                                                                    <span className="text-[8px] text-gray-600 uppercase font-black">{t('ui.damage')}</span>
                                                                                    <span className="text-xs font-mono text-red-400">{attack.damage}</span>
                                                                                </div>
                                                                                <div className="flex items-center gap-1">
                                                                                    <span className="text-[8px] text-gray-600 uppercase font-black">{t('ui.range')}</span>
                                                                                    <span className="text-xs font-mono text-blue-400">{attack.range}</span>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                        <p className="text-sm text-gray-500 italic mt-1 line-clamp-2 leading-tight">
                                                                            {t(DataResolver.getAttackDescription(attackSmi))}
                                                                        </p>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </Card>
                            ) : (
                                <div className="h-48 flex items-center justify-center border-2 border-dashed border-gray-800 bg-black/20 rounded grayscale opacity-50">
                                    <span className="text-gray-700 font-mono text-4xl tracking-[2rem] uppercase ml-8 mt-2">???</span>
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
});

const CollectiblesTab: React.FC<{ stats: PlayerStats, isMobileDevice?: boolean, effectiveLandscape?: boolean, isDebug?: boolean }> = React.memo(({ stats, isMobileDevice, effectiveLandscape, isDebug }) => {
    const foundIds = stats.collectiblesDiscovered || EMPTY_ARRAY;
    // PERFORMANCE FIX 2: useMemo for static arrays
    const COLLECTIBLES_ARRAY = useMemo(() => DataResolver.getDiscoveryList(DiscoveryType.COLLECTIBLE), []);
    const themesList = useMemo(() => DataResolver.getSectorThemes(), []);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-16 pb-12">
            {SECTORS.map(sectorId => {
                const sectorCollectibles = COLLECTIBLES_ARRAY.filter(c => c.sector === sectorId);
                const theme = themesList[sectorId];
                const isSectorUnlocked = isDebug || sectorId === 0 || stats.sectorsCompleted >= sectorId;
                const sectorName = isSectorUnlocked ? (theme ? t(DataResolver.getSectorName(sectorId)) : `Sector ${sectorId}`) : '???';

                let foundInSector = 0;
                for (let i = 0; i < sectorCollectibles.length; i++) {
                    if (foundIds.includes(sectorCollectibles[i].id)) foundInSector++;
                }

                return (
                    <div key={sectorId} className="space-y-6">
                        <div className="flex flex-col border-b-2 border-zinc-800 pb-2">
                            <h3 className="text-3xl font-light uppercase tracking-tighter text-white">
                                {sectorName}
                            </h3>
                            <span className="text-sm font-mono text-zinc-600 font-light uppercase mt-1">
                                {foundInSector} / {sectorCollectibles.length} {t('ui.collected')}
                            </span>
                        </div>

                        <div className={`grid ${effectiveLandscape ? 'grid-cols-2 gap-6' : 'grid-cols-1 gap-4'}`}>
                            {sectorCollectibles.map(item => {
                                const isFound = foundIds.includes(item.id);
                                return (
                                    <div key={item.id} id={`log-item-${item.id}`} className={`group relative flex flex-col border-2 transition-all duration-500 overflow-hidden ${isFound ? 'border-yellow-600/40 bg-zinc-900/40' : 'border-zinc-800 bg-black/20'} ${isMobileDevice ? 'mb-2' : ''}`}>
                                        <DescriptionExpansion item={item} isFound={isFound} isMobileDevice={isMobileDevice} />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
});

const CluesTab: React.FC<{ stats: PlayerStats, color: string, isMobileDevice?: boolean, effectiveLandscape?: boolean, isDebug?: boolean }> = React.memo(({ stats, color, isMobileDevice, effectiveLandscape, isDebug }) => {
    const cluesFound = stats.cluesFound || EMPTY_ARRAY;
    // PERFORMANCE FIX 2: useMemo for static arrays
    const CLUES_ARRAY = useMemo(() => DataResolver.getDiscoveryList(DiscoveryType.CLUE), []);
    const themesList = useMemo(() => DataResolver.getSectorThemes(), []);

    return (
        <div className="space-y-16 pb-12">
            {SECTORS.map(sectorId => {
                const theme = themesList[sectorId];
                const sectorClues = CLUES_ARRAY.filter(clue => clue.sector === sectorId);
                const isSectorUnlocked = isDebug || sectorId === 0 || stats.sectorsCompleted >= sectorId;
                const sectorName = isSectorUnlocked ? (theme ? t(DataResolver.getSectorName(sectorId)) : `Sector ${sectorId}`) : '???';

                let foundInSector = 0;
                for (let i = 0; i < sectorClues.length; i++) {
                    if (cluesFound.includes(sectorClues[i].id)) foundInSector++;
                }

                return (
                    <div key={sectorId} className="space-y-6">
                        <div className="flex flex-col border-b-2 border-zinc-800 pb-2">
                            <h3 className="text-3xl font-light uppercase tracking-tighter text-white">
                                {sectorName}
                            </h3>
                            {isSectorUnlocked && sectorClues.length > 0 && (
                                <span className="text-sm font-mono text-zinc-600 font-light uppercase mt-1">
                                    {foundInSector} / {sectorClues.length} {t('ui.discovered')}
                                </span>
                            )}
                        </div>

                        <div className={`grid ${effectiveLandscape ? 'grid-cols-2 gap-6' : 'grid-cols-1 gap-4'}`}>
                            {sectorClues.map((clue) => {
                                const clueId = clue.id;
                                const isFound = cluesFound.includes(clueId);
                                const isThought = clue.type === 'THOUGHT';
                                const type = clue.type;
                                const typeColor = isThought ? '#3b82f6' : '#eab308';

                                return (
                                    <div key={clueId} id={`log-item-${clueId}`} className={`group relative flex flex-col border-2 transition-all duration-500 overflow-hidden ${isFound ? 'border-yellow-600/40 bg-zinc-900/40' : 'border-zinc-800 bg-black/20'} ${isMobileDevice ? 'p-4' : 'p-6'}`}>
                                        <div className="flex flex-col gap-4">
                                            <div className="flex justify-between items-center border-b border-zinc-800/50 pb-2">
                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded text-white uppercase tracking-widest" style={{ backgroundColor: isFound ? typeColor : '#333' }}>
                                                    {isFound ? type : '???'}
                                                </span>
                                            </div>
                                            <p className={`text-lg italic leading-relaxed border-l-4 pl-4 py-1 ${isFound ? 'text-gray-200' : 'text-zinc-800'}`} style={{ borderColor: isFound ? typeColor : '#333' }}>
                                                {isFound ? `"${t(DataResolver.getClueReaction(clueId))}"` : '???'}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
});

const PoiTab: React.FC<{ stats: PlayerStats, color: string, isMobileDevice?: boolean, effectiveLandscape?: boolean, isDebug?: boolean }> = React.memo(({ stats, color, isMobileDevice, effectiveLandscape, isDebug }) => {
    const visitedList = stats.discoveredPOIs || EMPTY_ARRAY;
    // PERFORMANCE FIX 2: useMemo for static arrays
    const POIS_ARRAY = useMemo(() => DataResolver.getDiscoveryList(DiscoveryType.POI), []);
    const themesList = useMemo(() => DataResolver.getSectorThemes(), []);

    return (
        <div className="space-y-16 pb-12">
            {SECTORS.map(sectorId => {
                const theme = themesList[sectorId];
                const sectorPOIs = POIS_ARRAY.filter(poi => poi.sector === sectorId);
                const isSectorUnlocked = isDebug || sectorId === 0 || stats.sectorsCompleted >= sectorId;
                const sectorName = isSectorUnlocked ? (theme ? t(DataResolver.getSectorName(sectorId)) : `Sector ${sectorId}`) : '???';

                let foundInSector = 0;
                for (let i = 0; i < sectorPOIs.length; i++) {
                    if (visitedList.includes(sectorPOIs[i].id)) foundInSector++;
                }

                return (
                    <div key={sectorId} className="space-y-6">
                        <div className="flex flex-col border-b-2 border-zinc-800 pb-2">
                            <h3 className="text-3xl font-light uppercase tracking-tighter text-white">
                                {sectorName}
                            </h3>
                            {isSectorUnlocked && sectorPOIs.length > 0 && (
                                <span className="text-sm font-mono text-zinc-600 font-light uppercase mt-1">
                                    {foundInSector} / {sectorPOIs.length} {t('ui.discovered')}
                                </span>
                            )}
                        </div>

                        <div className={`grid ${effectiveLandscape ? 'grid-cols-2 gap-6' : 'grid-cols-1 gap-4'}`}>
                            {sectorPOIs.map((poi) => {
                                const poiId = poi.id;
                                const isFound = visitedList.includes(poiId);
                                return (
                                    <div key={poiId} id={`log-item-${poiId}`} className={`group relative flex flex-col border-2 transition-all duration-500 overflow-hidden ${isFound ? 'border-yellow-600/40 bg-zinc-900/40' : 'border-zinc-800 bg-black/20'} ${isMobileDevice ? 'p-4' : 'p-6'}`}>
                                        <div className="flex flex-col gap-4">
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
                                                    <p className="text-lg italic leading-relaxed border-l-4 pl-4 py-1 text-gray-200" style={{ borderColor: color }}>
                                                        "{t(DataResolver.getPoiReaction(poiId))}"
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
});

const PerksTab: React.FC<{ stats: PlayerStats, color: string, isMobileDevice?: boolean, effectiveLandscape?: boolean, isDebug?: boolean }> = React.memo(({ stats, color, isMobileDevice, effectiveLandscape, isDebug }) => {
    const discoveredList = stats.discoveredPerks || EMPTY_ARRAY;

    // PERFORMANCE FIX 2: useMemo for filtering
    const { buffs, debuffs, passives } = useMemo(() => {
        const perks = DataResolver.getPerks();
        const perksArray = Object.values(perks);
        return {
            buffs: perksArray.filter(p => p.category === PerkCategory.BUFF),
            debuffs: perksArray.filter(p => p.category === PerkCategory.DEBUFF),
            passives: perksArray.filter(p => p.category === PerkCategory.PASSIVE)
        };
    }, []);

    const renderPerk = (perk: any) => {
        const isFound = isDebug || discoveredList.includes(perk.id);

        return (
            <div key={perk.id} id={`log-item-${perk.id}`} className={`group relative flex flex-col border-2 transition-all duration-500 overflow-hidden ${isFound ? 'border-yellow-600/40 bg-zinc-900/40' : 'border-zinc-800 bg-black/20'} ${isMobileDevice ? 'p-4' : 'p-6'}`}>
                <div className="flex flex-col gap-4">
                    <div className="flex justify-between items-start border-b border-zinc-800/50 pb-3">
                        <div className="flex items-center gap-3">
                            <span className="text-2xl">{isFound ? perk.icon : '?'}</span>
                            <h3 className={`text-2xl font-semibold uppercase tracking-tighter ${isFound ? 'text-white' : 'text-zinc-800'}`}>
                                {isFound ? t(DataResolver.getPerkName(perk.id)) : '???'}
                            </h3>
                        </div>
                        {isFound && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded text-white uppercase tracking-widest"
                                style={{ backgroundColor: PerkColor[perk.category as keyof typeof PerkColor] }}>
                                {perk.category}
                            </span>
                        )}
                    </div>
                    <div className="space-y-3">
                        <p className={`text-sm leading-relaxed ${isFound ? 'text-zinc-400' : 'text-zinc-800'}`}>
                            {isFound ? t(DataResolver.getPerkDescription(perk.id)) : 'Perform specific tactical actions or rescue family members to unlock new perks.'}
                        </p>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-12 pb-12">
            <div className="space-y-6">
                <div className="border-b-2 border-zinc-800 pb-2">
                    <h3 className="text-3xl font-light uppercase tracking-tighter text-white">{t('ui.passive_abilities')}</h3>
                </div>
                <div className={`grid ${effectiveLandscape ? 'grid-cols-2 gap-6' : 'grid-cols-1 gap-4'}`}>
                    {passives.map(renderPerk)}
                </div>
            </div>
            <div className="space-y-6">
                <div className="border-b-2 border-zinc-800 pb-2">
                    <h3 className="text-3xl font-light uppercase tracking-tighter text-white">{t('ui.buffs')}</h3>
                </div>
                <div className={`grid ${effectiveLandscape ? 'grid-cols-2 gap-6' : 'grid-cols-1 gap-4'}`}>
                    {buffs.map(renderPerk)}
                </div>
            </div>
            <div className="space-y-6">
                <div className="border-b-2 border-zinc-800 pb-2">
                    <h3 className="text-3xl font-light uppercase tracking-tighter text-white">{t('ui.debuffs')}</h3>
                </div>
                <div className={`grid ${effectiveLandscape ? 'grid-cols-2 gap-6' : 'grid-cols-1 gap-4'}`}>
                    {debuffs.map(renderPerk)}
                </div>
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

export default ScreenAdventureLog;