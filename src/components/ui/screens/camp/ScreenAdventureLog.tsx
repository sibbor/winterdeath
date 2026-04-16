import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { PlayerStats, StatEnemyIndex } from '../../../../entities/player/PlayerTypes';
import { t } from '../../../../utils/i18n';
import { useOrientation } from '../../../../hooks/useOrientation';
import ScreenModalLayout, { HORIZONTAL_HATCHING_STYLE, TacticalCard, TacticalTab } from '../../layout/ScreenModalLayout';
import CollectiblePreview from '../../core/CollectiblePreview';
import { UiSounds } from '../../../../utils/audio/AudioLib';
import { DiscoveryType } from '../../hud/HudTypes';
import { EnemyType } from '../../../../entities/enemies/EnemyTypes';
import { DataResolver } from '../../../../utils/ui/DataResolver';

interface ScreenAdventureLogProps {
    stats: PlayerStats;
    onClose: () => void;
    onMarkCollectiblesViewed?: (collectibleIds: string[]) => void;
    isMobileDevice?: boolean;
    debugMode?: boolean;
    initialTab?: Tab;
    initialItemId?: string | null;
}

type Tab = 'collectibles' | 'clues' | 'poi' | 'zombies' | 'bosses';

// --- ZERO-GC STATIC ARRAYS & CONFIGS (PRESERVES REACT.MEMO STABILITY) ---
const EMPTY_ARRAY: any[] = [];
const TABS: { id: Tab, label: string }[] = [
    { id: 'clues', label: 'ui.log_clues' },
    { id: 'collectibles', label: 'ui.log_collectibles' },
    { id: 'poi', label: 'ui.log_poi' },
    { id: 'zombies', label: 'ui.log_zombies' },
    { id: 'bosses', label: 'ui.log_bosses' },
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
    const [activeTab, setActiveTab] = useState<Tab>(initialTab || 'clues');

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
            case 'zombies': {
                const allTypes = Object.values(EnemyType).filter(v => typeof v === 'number') as number[];
                stats.seenEnemies = [...new Set([...(stats.seenEnemies || []), ...allTypes])];
                break;
            }
            case 'bosses': {
                const allBossIds = [0, 1, 2, 3];
                stats.seenBosses = [...new Set([...(stats.seenBosses || []), ...allBossIds])];
                stats.bossesDefeated = [...new Set([...(stats.bossesDefeated || []), ...allBossIds])];
                break;
            }
        }

        UiSounds.playConfirm();
        const current = activeTab;
        setActiveTab(current === 'poi' ? 'zombies' : 'poi');
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
            debugAction={isDebugMode ? { label: t('ui.debug_show_all'), action: handleDebugShowAll } : undefined}
            tabs={TABS.map(t => t.id)}
            activeTab={activeTab}
            onTabChange={handleTabChange}
            tabOrientation={effectiveLandscape ? 'vertical' : 'horizontal'}
        >
            <div className={`flex h-full ${effectiveLandscape ? 'flex-row gap-8' : 'flex-col gap-4'}`}>
                {/* Tabs Bar */}
                <div className={`relative shrink-0 ${effectiveLandscape ? 'w-1/3 flex flex-col gap-4 overflow-y-auto pl-safe custom-scrollbar' : ''}`}>
                    <div className={`${effectiveLandscape ? 'flex flex-col gap-4 pt-4 pr-10' : 'flex gap-2 border-b-2 border-zinc-800 pb-2 md:pb-4 overflow-x-auto px-4 pt-2 items-end scrollbar-hide'}`}>
                        {TABS.map(tab => (
                            <TacticalTab
                                key={tab.id}
                                label={t(tab.label)}
                                isActive={activeTab === tab.id}
                                onClick={() => handleTabChange(tab.id as Tab)}
                                orientation={effectiveLandscape ? 'vertical' : 'horizontal'}
                            />
                        ))}
                    </div>
                </div>

                {/* Content Area - DYNAMIC MOUNTING */}
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar relative">
                    {activeTab === 'zombies' && <ZombiesTab stats={stats} isMobileDevice={isMobileDevice} isDebug={isDebugMode} />}
                    {activeTab === 'bosses' && <BossesTab stats={stats} isMobileDevice={isMobileDevice} isDebug={isDebugMode} />}
                    {activeTab === 'collectibles' && <CollectiblesTab stats={stats} isMobileDevice={!effectiveLandscape} effectiveLandscape={effectiveLandscape} isDebug={isDebugMode} />}
                    {activeTab === 'clues' && <CluesTab stats={stats} isMobileDevice={isMobileDevice} effectiveLandscape={effectiveLandscape} isDebug={isDebugMode} />}
                    {activeTab === 'poi' && <PoiTab stats={stats} isMobileDevice={isMobileDevice} effectiveLandscape={effectiveLandscape} isDebug={isDebugMode} />}
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

// --- SUB-COMPONENTS (MEMOIZED FOR PERFORMANCE) ---

const ZombiesTab: React.FC<{ stats: PlayerStats, isMobileDevice?: boolean, isDebug?: boolean }> = React.memo(({ stats, isMobileDevice, isDebug }) => {
    const zombies = useMemo(() => DataResolver.getDiscoveryList(DiscoveryType.ENEMY), []);

    return (
        <div className={`grid ${isMobileDevice ? 'grid-cols-1 gap-4' : 'grid-cols-2 gap-6'} pb-12`}>
            {zombies.map((data) => {
                const typeSmi = data.type;
                const key = data.id;
                const kills = Math.max(stats.enemyKills[typeSmi] || 0, stats.killsByType?.[typeSmi] || 0);
                const isSeen = isDebug || (stats.seenEnemies || EMPTY_ARRAY).includes(typeSmi) || kills > 0;
                const itemColor = `#${data.color.toString(16).padStart(6, '0')}`;

                return (
                    <TacticalCard key={key} id={`log-item-${key}`} isLocked={!isSeen} color={itemColor} showHatching={isSeen}>
                        <div className="flex justify-between items-start mb-4 border-b-2 border-gray-800 pb-3">
                            <h3 className="text-3xl font-light uppercase tracking-tighter" style={{ color: isSeen ? itemColor : '#4b5563' }}>
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
                                        <span className="text-xl font-semibold text-red-500">{stats.deathsByEnemyType?.[typeSmi] || 0}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="space-y-6">
                            <div className={`grid grid-cols-2 gap-2 bg-black/40 p-4 rounded border border-gray-800 ${!isSeen ? 'grayscale opacity-50' : ''}`}>
                                <div className="text-center">
                                    <div className="text-gray-500 text-[10px] font-black uppercase tracking-widest">{t('ui.health')}</div>
                                    <div className="text-2xl font-bold text-white font-mono">{isSeen ? data.hp : '???'}</div>
                                </div>
                                <div className="text-center border-l border-gray-800 ">
                                    <div className="text-gray-500 text-[10px] font-black uppercase tracking-widest">{t('ui.speed')}</div>
                                    <div className="text-2xl font-bold text-white font-mono">{isSeen ? data.speed.toFixed(1) : '???'}</div>
                                </div>
                            </div>

                            {!isSeen ? (
                                <p className="text-sm text-zinc-700 italic leading-relaxed text-center py-8">
                                    {t('ui.enemy_undiscovered_hint')}
                                </p>
                            ) : (
                                <div className="space-y-4">
                                    {data.attacks && data.attacks.length > 0 && (
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
                                                                    <span className="text-[8px] text-gray-600 uppercase font-black">{t('ui.damage')}</span>
                                                                    <span className="text-xs font-mono text-red-400">{attack.damage}</span>
                                                                </div>
                                                                <div className="flex items-center gap-1 pl-2 border-l border-gray-800">
                                                                    <span className="text-[8px] text-gray-600 uppercase font-black">{t('ui.range')}</span>
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

    return (
        <div className="space-y-16 pb-12">
            {sectorsList.map(sectorIndex => {
                const boss = bossesList[sectorIndex];
                const theme = themesList[sectorIndex];
                const isSectorUnlocked = isDebug || stats.sectorsCompleted >= sectorIndex;
                const sectorName = isSectorUnlocked ? (theme ? t(DataResolver.getSectorName(sectorIndex)) : `${t('ui.sector')} ${sectorIndex}`) : '???';

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
                            <TacticalCard 
                                isLocked={!isBossUnlocked} 
                                color={boss ? `#${boss.color.toString(16).padStart(6, '0')}` : '#4b5563'} 
                                id={boss ? `log-item-${boss.name}` : undefined}
                                className={!isBossUnlocked ? "h-48 flex items-center justify-center grayscale opacity-50" : ""}
                                showHatching={isBossUnlocked}
                            >
                                {isBossUnlocked ? (
                                    <div className="flex flex-col h-full w-full">
                                        <div className="flex justify-between items-start mb-4 border-b-2 border-gray-800 pb-3">
                                            <h3 className="text-3xl font-light uppercase tracking-tighter" style={{ color: boss ? `#${boss.color.toString(16).padStart(6, '0')}` : 'white' }}>
                                                {t(DataResolver.getBossName(sectorIndex))}
                                            </h3>
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
                                                                                <span className="text-[8px] text-gray-600 uppercase font-black">{t('ui.damage')}</span>
                                                                                <span className="text-xs font-mono text-red-400">{attack.damage}</span>
                                                                            </div>
                                                                            <div className="flex items-center gap-1 pl-2 border-l border-gray-800">
                                                                                <span className="text-[8px] text-gray-600 uppercase font-black">{t('ui.range')}</span>
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
                                    <span className="text-gray-700 font-mono text-4xl tracking-[2rem] uppercase ml-8 mt-2">???</span>
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
    const foundIds = stats.collectiblesDiscovered || EMPTY_ARRAY;
    const items = useMemo(() => DataResolver.getDiscoveryList(DiscoveryType.COLLECTIBLE), []);
    const themes = useMemo(() => DataResolver.getSectorThemes(), []);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-16 pb-12">
            {SECTORS.map(sectorId => {
                const sectorItems = useMemo(() => items.filter(c => c.sector === sectorId), [items, sectorId]);
                const isSectorUnlocked = isDebug || sectorId === 0 || stats.sectorsCompleted >= sectorId;
                if (sectorItems.length === 0) return null;

                const foundCount = sectorItems.filter(c => foundIds.includes(c.id)).length;

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

                        <div className={`grid ${effectiveLandscape ? 'grid-cols-2 gap-6' : 'grid-cols-1 gap-4'}`}>
                            {sectorItems.map(item => {
                                const isFound = foundIds.includes(item.id);
                                return (
                                    <TacticalCard key={item.id} id={`log-item-${item.id}`} isLocked={!isFound} color="#eab308" className="p-0">
                                        <DescriptionExpansion item={item} isFound={isFound} isMobileDevice={isMobileDevice} />
                                    </TacticalCard>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
});

const CluesTab: React.FC<{ stats: PlayerStats, isMobileDevice?: boolean, effectiveLandscape?: boolean, isDebug?: boolean }> = React.memo(({ stats, isMobileDevice, effectiveLandscape, isDebug }) => {
    const foundIds = stats.cluesFound || EMPTY_ARRAY;
    const items = useMemo(() => DataResolver.getDiscoveryList(DiscoveryType.CLUE), []);
    const themes = useMemo(() => DataResolver.getSectorThemes(), []);

    return (
        <div className="space-y-16 pb-12">
            {SECTORS.map(sectorId => {
                const sectorItems = useMemo(() => items.filter(c => c.sector === sectorId), [items, sectorId]);
                const isSectorUnlocked = isDebug || sectorId === 0 || stats.sectorsCompleted >= sectorId;
                if (sectorItems.length === 0) return null;

                const foundCount = sectorItems.filter(c => foundIds.includes(c.id)).length;

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

                        <div className={`grid ${effectiveLandscape ? 'grid-cols-2 gap-6' : 'grid-cols-1 gap-4'}`}>
                            {sectorItems.map((clue) => {
                                const isFound = foundIds.includes(clue.id);
                                const isThought = clue.type === 'THOUGHT';
                                const typeColor = isThought ? '#3b82f6' : '#eab308';
                                return (
                                    <TacticalCard key={clue.id} id={`log-item-${clue.id}`} isLocked={!isFound} color={typeColor} className={`flex flex-col ${isMobileDevice ? 'p-4' : 'p-6'}`}>
                                        {/* Discovery-specific hover pulse preserved */}
                                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full scale-0 group-hover:scale-[6] transition-transform duration-700 pointer-events-none"
                                            style={{ backgroundColor: isFound ? `${typeColor}1a` : 'rgba(22, 163, 74, 0.1)' }}
                                        />
                                        <div className="flex flex-col gap-4 relative z-10 w-full">
                                            <div className="flex justify-between items-center border-b border-zinc-800/50 pb-2">
                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded text-white uppercase tracking-widest" style={{ backgroundColor: isFound ? typeColor : '#333' }}>
                                                    {isFound ? clue.type : '???'}
                                                </span>
                                            </div>
                                            <p className={`text-lg italic leading-relaxed border-l-4 pl-4 py-1 ${isFound ? 'text-gray-200' : 'text-zinc-800'}`} style={{ borderColor: isFound ? typeColor : '#333' }}>
                                                {isFound ? `"${t(DataResolver.getClueReaction(clue.id))}"` : '???'}
                                            </p>
                                        </div>
                                    </TacticalCard>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
});

const PoiTab: React.FC<{ stats: PlayerStats, isMobileDevice?: boolean, effectiveLandscape?: boolean, isDebug?: boolean }> = React.memo(({ stats, isMobileDevice, effectiveLandscape, isDebug }) => {
    const visitedList = stats.discoveredPOIs || EMPTY_ARRAY;
    const items = useMemo(() => DataResolver.getDiscoveryList(DiscoveryType.POI), []);
    const themes = useMemo(() => DataResolver.getSectorThemes(), []);

    return (
        <div className="space-y-16 pb-12">
            {SECTORS.map(sectorId => {
                const sectorItems = useMemo(() => items.filter(poi => poi.sector === sectorId), [items, sectorId]);
                const isSectorUnlocked = isDebug || sectorId === 0 || stats.sectorsCompleted >= sectorId;
                if (sectorItems.length === 0) return null;

                const foundCount = sectorItems.filter(poi => visitedList.includes(poi.id)).length;

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

                        <div className={`grid ${effectiveLandscape ? 'grid-cols-2 gap-6' : 'grid-cols-1 gap-4'}`}>
                            {sectorItems.map((poi) => {
                                const poiId = poi.id;
                                const isFound = visitedList.includes(poiId);
                                return (
                                    <TacticalCard key={poiId} id={`log-item-${poiId}`} isLocked={!isFound} color="#eab308" className={isMobileDevice ? 'p-4' : 'p-6'}>
                                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full scale-0 group-hover:scale-[6] transition-transform duration-700 pointer-events-none"
                                            style={{ backgroundColor: isFound ? 'rgba(234, 179, 8, 0.1)' : 'rgba(22, 163, 74, 0.1)' }}
                                        />
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
                    </div>
                );
            })}
        </div>
    );
});

// --- HELPER COMPONENTS ---

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