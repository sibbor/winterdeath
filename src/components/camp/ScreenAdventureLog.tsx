import React, { useState, useEffect } from 'react';
import { PlayerStats } from '../../types';
import { t } from '../../utils/i18n';
import { ZOMBIE_TYPES, BOSSES, SECTOR_THEMES } from '../../content/constants';
import { soundManager } from '../../utils/SoundManager';
import { COLLECTIBLES } from '../../content/collectibles';
import CampModalLayout from './CampModalLayout';
import CollectiblePreview from '../ui/core/CollectiblePreview';

interface ScreenAdventureLogProps {
    stats: PlayerStats;
    onClose: () => void;
    onMarkCollectiblesViewed?: (collectibleIds: string[]) => void;
    isMobileDevice?: boolean;
    debugMode?: boolean;
}


type Tab = 'collectibles' | 'clues' | 'poi' | 'boss' | 'enemy';

const ScreenAdventureLog: React.FC<ScreenAdventureLogProps> = ({ stats, onClose, onMarkCollectiblesViewed, isMobileDevice, debugMode }) => {
    const [activeTab, setActiveTab] = useState<Tab>('collectibles');

    // Mark all found collectibles as viewed when the log is opened
    useEffect(() => {
        const foundIds = stats.collectiblesDiscovered || [];
        const viewedIds = stats.viewedCollectibles || [];
        const newIds = foundIds.filter(id => !viewedIds.includes(id));

        if (newIds.length > 0 && onMarkCollectiblesViewed) {
            onMarkCollectiblesViewed(newIds);
        }
    }, []); // Only run on mount

    const handleTabChange = (tab: Tab) => {
        soundManager.playUiClick();
        setActiveTab(tab);
    };

    const tabs: { id: Tab, label: string }[] = [
        { id: 'collectibles', label: t('ui.log_collectibles') },
        { id: 'clues', label: t('ui.log_clues') },
        { id: 'poi', label: t('ui.log_poi') },
        { id: 'enemy', label: t('ui.log_enemies') },
        { id: 'boss', label: t('ui.log_bosses') },
    ];

    const themeColor = '#16a34a'; // green-600

    const isDebugMode = (debugMode !== undefined ? debugMode : false) || (window as any).gameEngine?.sectorContext?.debugMode || (window as any).WD_DEBUG === true || localStorage.getItem('wd_debug') === 'true';

    const handleDebugShowAll = () => {
        switch (activeTab) {
            case 'collectibles': {
                const allIds = Object.keys(COLLECTIBLES);
                stats.collectiblesDiscovered = [...new Set([...(stats.collectiblesDiscovered || []), ...allIds])];
                if (onMarkCollectiblesViewed) onMarkCollectiblesViewed(allIds);
                break;
            }
            case 'boss': {
                stats.bossesDefeated = Object.keys(BOSSES).map(id => parseInt(id));
                break;
            }
            case 'enemy': {
                stats.seenEnemies = Object.keys(ZOMBIE_TYPES);
                if (!stats.killsByType) stats.killsByType = {};
                Object.keys(ZOMBIE_TYPES).forEach(k => stats.killsByType![k] = 99);
                break;
            }
            case 'clues': {
                stats.cluesFound = [
                    's1_start_tracks', 's1_blood_stains', 's1_they_must_be_scared', 's1_still_tracking', 's1_town_center',
                    's2_start', 's2_campfire', 's2_combat', 's3_forest_noise', 's4_noise'
                ];
                break;
            }
            case 'poi': {
                stats.discoveredPOIs = [
                    's1_poi_building_on_fire', 's1_poi_church', 's1_poi_cafe', 's1_poi_pizzeria', 's1_poi_grocery', 's1_poi_gym', 's1_poi_train_yard',
                    's2_poi_campfire', 's2_poi_train_tunnel', 's2_poi_cave_entrance', 's2_poi_mountain_vault',
                    's3_poi_farm', 's3_poi_farmhouse', 's3_poi_barn', 's3_poi_mast', 's4_poi_shed', 's4_poi_scrapyard'
                ];
                break;
            }
        }

        // Force refresh by toggling tab back and forth quickly
        soundManager.playUiConfirm();
        const current = activeTab;
        setActiveTab(current === 'poi' ? 'enemy' : 'poi');
        setTimeout(() => setActiveTab(current), 50);
    };

    return (
        <CampModalLayout
            titleColor="text-green-500"
            onClose={onClose}
            onConfirm={onClose}
            confirmLabel={t('ui.close')}
            showCancel={false}
            isMobile={isMobileDevice}
            debugAction={isDebugMode ? { label: '[DEBUG] SHOW ALL', action: handleDebugShowAll } : undefined}
        >
            <div className={`flex flex-col h-full ${isMobileDevice ? 'gap-4' : 'gap-8'}`}>
                {/* Tabs Bar */}
                {/* Tabs Bar */}
                <div className="relative shrink-0">
                    <div className="absolute left-0 top-0 bottom-0 w-4 bg-gradient-to-r from-black via-black/50 to-transparent z-10 pointer-events-none" />
                    <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-black via-black/50 to-transparent z-10 pointer-events-none" />
                    <div className="flex gap-2 md:gap-4 border-b-2 border-gray-800 pb-2 md:pb-4 overflow-x-auto pl-2 pt-2 min-h-[50px] md:min-h-[80px] items-end">
                        {tabs.map(tab => {
                            const isActive = activeTab === tab.id;
                            return (
                                <button key={tab.id} onClick={() => handleTabChange(tab.id)}
                                    className={`px-3 md:px-6 py-1.5 md:py-4 text-[10px] md:text-lg font-bold uppercase tracking-widest transition-all skew-x-[-10deg] border-2 whitespace-nowrap ${isActive
                                        ? 'bg-white text-black border-white'
                                        : 'bg-black text-green-600 border-green-800 hover:border-green-500 hover:text-green-300'
                                    }`}
                                >
                                    <span className="block skew-x-[10deg]">{tab.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                    {activeTab === 'enemy' && <EnemyTab stats={stats} color={themeColor} />}
                    {activeTab === 'boss' && <BossTab stats={stats} color={themeColor} />}
                    {activeTab === 'collectibles' && <CollectiblesTab stats={stats} isMobile={isMobileDevice} />}
                    {activeTab === 'clues' && <CluesTab stats={stats} color={'#eab308'} />}
                    {activeTab === 'poi' && <PoiTab stats={stats} color={'#3b82f6'} />}
                </div>
            </div>
        </CampModalLayout>
    );
};

const EnemyTab: React.FC<{ stats: PlayerStats, color: string }> = ({ stats, color }) => {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {Object.entries(ZOMBIE_TYPES).map(([key, data]) => {
                const isSeen = (stats.seenEnemies || []).includes(key) || (stats.killsByType && stats.killsByType[key] > 0);
                if (!isSeen) return null;
                const itemColor = `#${data.color.toString(16).padStart(6, '0')}`;

                return (
                    <Card key={key} isLocked={!isSeen} color={itemColor}>
                        <div className="flex justify-between items-start mb-4 border-b-2 border-gray-800 pb-3">
                            <h3 className="text-3xl font-light uppercase tracking-tighter" style={{ color: isSeen ? 'white' : '#4b5563' }}>
                                {isSeen ? key : '???'}
                            </h3>
                            {isSeen && (
                                <div className="flex flex-col items-end">
                                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{t('ui.kills')}</span>
                                    <span className="text-xl font-semibold text-white">{stats.killsByType?.[key] || 0}</span>
                                </div>
                            )}
                        </div>
                        <div className="space-y-6">
                            <div className="grid grid-cols-3 gap-3 bg-black/40 p-4 rounded border border-gray-800">
                                <div className="text-center">
                                    <div className="text-gray-500 text-[10px] font-black uppercase tracking-widest">{t('ui.health')}</div>
                                    <div className="text-2xl font-bold text-white font-mono">{data.hp}</div>
                                </div>
                                <div className="text-center border-x border-gray-800">
                                    <div className="text-gray-500 text-[10px] font-black uppercase tracking-widest">{t('ui.damage')}</div>
                                    <div className="text-2xl font-bold text-white font-mono">{data.damage}</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-gray-500 text-[10px] font-black uppercase tracking-widest">{t('ui.speed')}</div>
                                    <div className="text-2xl font-bold text-white font-mono">{data.speed.toFixed(1)}</div>
                                </div>
                            </div>
                            <p className="text-base text-gray-300 italic leading-relaxed border-l-4 pl-4 py-1" style={{ borderColor: itemColor }}>
                                "{getEnemyDescription(key)}"
                            </p>

                            {data.attacks && data.attacks.length > 0 && (
                                <div className="space-y-2">
                                    <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                        <div className="h-[1px] flex-1 bg-gray-800"></div>
                                        {t('ui.combat')}
                                        <div className="h-[1px] flex-1 bg-gray-800"></div>
                                    </div>
                                    <div className="grid grid-cols-1 gap-2">
                                        {data.attacks.map((attack, idx) => (
                                            <div key={idx} className="flex justify-between items-center bg-zinc-900/40 px-3 py-2 rounded border border-gray-800/50">
                                                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{attack.type}</span>
                                                <div className="flex gap-4">
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-[9px] text-gray-600 uppercase font-black">{t('ui.damage')}</span>
                                                        <span className="text-xs font-mono text-red-400">{attack.damage}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-[9px] text-gray-600 uppercase font-black">{t('ui.range')}</span>
                                                        <span className="text-xs font-mono text-blue-400">{attack.range}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </Card>
                );
            })}
        </div>
    );
};

const BossTab: React.FC<{ stats: PlayerStats, color: string }> = ({ stats, color }) => {
    const sectors = [0, 1, 2, 3]; // Sectors with bosses

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pb-12">
            {sectors.map(sectorIndex => {
                const boss = BOSSES[sectorIndex];
                if (!boss) return null;

                const isSeen = (stats.seenBosses || []).includes(boss.name) || (stats.bossesDefeated || []).includes(sectorIndex);
                const isDefeated = (stats.bossesDefeated || []).includes(sectorIndex);
                const isUnlocked = isSeen || isDefeated;

                // User requested: Only list data for encountered/discovered bosses
                if (!isUnlocked) return null;

                const itemColor = `#${boss.color.toString(16).padStart(6, '0')}`;

                const theme = SECTOR_THEMES[sectorIndex];
                const sectorName = theme ? t(theme.name) : `Sector ${sectorIndex + 1}`;

                return (
                    <Card key={sectorIndex} isLocked={!isUnlocked} color={isUnlocked ? itemColor : '#4b5563'}>
                        <div className="flex flex-col h-full">
                            <div className="flex justify-between items-start mb-4 border-b-2 border-gray-800 pb-3">
                                <div className="flex flex-col">
                                    <h3 className="text-3xl font-light uppercase tracking-tighter" style={{ color: isUnlocked ? 'white' : '#4b5563' }}>
                                        {isUnlocked ? t(boss.name) : t('ui.unknown_threat')}
                                    </h3>
                                    <span className="text-[10px] text-gray-500 font-black uppercase tracking-widest mt-1">{sectorName}</span>
                                </div>
                            </div>

                            {isUnlocked && (
                                <div className="flex flex-col gap-6 flex-1">
                                    <div className="grid grid-cols-3 gap-3 bg-black/40 p-4 rounded border border-gray-800">
                                        <div className="text-center">
                                            <div className="text-gray-500 text-[10px] font-black uppercase tracking-widest mb-1">{t('ui.health')}</div>
                                            <div className="text-2xl font-bold text-white font-mono">{boss.hp}</div>
                                        </div>
                                        <div className="text-center border-x border-gray-800">
                                            <div className="text-gray-500 text-[10px] font-black uppercase tracking-widest mb-1">{t('ui.damage')}</div>
                                            <div className="text-2xl font-bold text-white font-mono">{boss.damage}</div>
                                        </div>
                                        <div className="text-center">
                                            <div className="text-gray-500 text-[10px] font-black uppercase tracking-widest mb-1">{t('ui.speed')}</div>
                                            <div className="text-2xl font-bold text-white font-mono">{boss.speed.toFixed(1)}</div>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <p className="text-gray-400 text-sm leading-relaxed">{getBossDescription(boss.name)}</p>

                                        {boss.attacks && boss.attacks.length > 0 && (
                                            <div className="space-y-2 mt-4">
                                                <div className="text-[10px] font-black text-gray-600 uppercase tracking-widest flex items-center gap-2">
                                                    <div className="h-[1px] flex-1 bg-gray-800"></div>
                                                    {t('ui.combat')}
                                                    <div className="h-[1px] flex-1 bg-gray-800"></div>
                                                </div>
                                                <div className="grid grid-cols-1 gap-2">
                                                    {boss.attacks.map((attack, idx) => (
                                                        <div key={idx} className="flex justify-between items-center bg-zinc-900/40 px-3 py-2 rounded border border-gray-800/50">
                                                            <div className="flex flex-col">
                                                                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{attack.type}</span>
                                                                {attack.effect && (
                                                                    <span className="text-[8px] text-red-500/80 uppercase font-black">{attack.effect}</span>
                                                                )}
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
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                    </div>
                                </div>
                            )}
                        </div>
                    </Card>
                );
            })}
        </div>
    );
};

const CollectiblesTab: React.FC<{ stats: PlayerStats, isMobile?: boolean }> = ({ stats, isMobile }) => {
    const foundIds = stats.collectiblesDiscovered || [];
    const viewedIds = stats.viewedCollectibles || [];

    // Group collectibles by sector for better organization - ascending
    const sectors = [1, 2, 3, 4, 5];

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-16 pb-12">
            {sectors.map(sectorId => {
                const sectorCollectibles = Object.values(COLLECTIBLES).filter(c => c.sector === sectorId);
                const theme = SECTOR_THEMES[sectorId - 1];
                const sectorName = theme ? t(theme.name) : `Sector ${sectorId}`;
                const foundInSector = sectorCollectibles.filter(c => foundIds.includes(c.id)).length;

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

                        <div className={`grid ${isMobile ? 'grid-cols-2 gap-2' : 'grid-cols-1 md:grid-cols-2 gap-6'}`}>
                            {sectorCollectibles.map(item => {
                                const isFound = foundIds.includes(item.id);
                                const isNew = isFound && !viewedIds.includes(item.id);
                                return (
                                    <div key={item.id} className={`group relative flex flex-col border-2 transition-all duration-500 overflow-hidden ${isFound ? 'border-yellow-600/40 bg-zinc-900/40' : 'border-zinc-800 bg-black/20'}`}>
                                        <DescriptionExpansion item={item} isFound={isFound} isMobile={isMobile} />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

const CluesTab: React.FC<{ stats: PlayerStats, color: string }> = ({ stats, color }) => {
    const cluesFound = stats.cluesFound || [];
    const sectors = [1, 2, 3, 4, 5, 6];

    return (
        <div className="space-y-16 pb-12">
            {sectors.map(sectorId => {
                const theme = SECTOR_THEMES[sectorId - 1];
                const sectorName = theme ? t(theme.name) : `Sector ${sectorId}`;

                // Filter clues for this sector from cluesFound
                // Clues shouldn't include collectibles, POI story keys, or event tags
                const sectorClues = cluesFound.filter(id =>
                    id.startsWith(`s${sectorId}_`) &&
                    !id.includes('_collectible_') &&
                    !id.includes('_poi_') &&
                    !id.includes('_event_') &&
                    !id.endsWith('_title') &&
                    !id.endsWith('_description') &&
                    !id.endsWith('_story')
                );

                return (
                    <div key={sectorId} className="space-y-6">
                        <div className="flex flex-col border-b-2 border-zinc-800 pb-2">
                            <h3 className="text-3xl font-light uppercase tracking-tighter text-white">
                                {sectorName}
                            </h3>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {sectorClues.length > 0 ? sectorClues.map((clueId) => {
                                // Default detection of THOUGHT vs SPEAK
                                const isThought = clueId.includes('thought');
                                const type = isThought ? 'THOUGHT' : 'SPEAK';
                                const typeColor = isThought ? '#3b82f6' : '#eab308';

                                return (
                                    <Card key={clueId} isLocked={false} color={typeColor}>
                                        <div className="flex flex-col gap-4">
                                            <div className="flex justify-between items-center border-b border-gray-800 pb-2">
                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded text-white uppercase tracking-widest skew-x-[-10deg]" style={{ backgroundColor: typeColor }}>
                                                    {type}
                                                </span>
                                            </div>
                                            <p className="text-lg text-gray-200 italic leading-relaxed border-l-4 pl-4 py-1" style={{ borderColor: typeColor }}>
                                                "{t(`clues.${clueId}`)}"
                                            </p>
                                        </div>
                                    </Card>
                                );
                            }) : (
                                <div className="col-span-full h-24 flex items-center justify-center border-2 border-dashed border-gray-800 rounded">
                                    <span className="text-gray-700 font-mono tracking-widest uppercase">???</span>
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

// --- POI TAB ---
const PoiTab: React.FC<{ stats: PlayerStats, color: string }> = ({ stats, color }) => {
    const visitedList = stats.discoveredPOIs || [];
    const sectors = [1, 2, 3, 4, 5, 6];

    return (
        <div className="space-y-16 pb-12">
            {sectors.map(sectorId => {
                const theme = SECTOR_THEMES[sectorId - 1];
                const sectorName = theme ? t(theme.name) : `Sector ${sectorId}`;

                // Filter POIs for this sector from visited list
                const sectorPOIs = visitedList.filter(id => id.startsWith(`s${sectorId}_poi_`));

                return (
                    <div key={sectorId} className="space-y-6">
                        <div className="flex flex-col border-b-2 border-zinc-800 pb-2">
                            <h3 className="text-3xl font-light uppercase tracking-tighter text-white">
                                {sectorName}
                            </h3>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {sectorPOIs.length > 0 ? sectorPOIs.map((poiId) => {
                                return (
                                    <Card key={poiId} isLocked={false} color={color}>
                                        <div className="flex flex-col gap-4">
                                            <div className="flex justify-between items-start border-b border-gray-800 pb-3">
                                                <h3 className="text-2xl font-semibold uppercase tracking-tighter text-white">
                                                    {t(`poi.${poiId}_title`)}
                                                </h3>
                                                <span className="text-[10px] bg-blue-900/40 text-blue-400 px-3 py-1 rounded border border-blue-900 font-black tracking-widest skew-x-[-10deg]">POI</span>
                                            </div>
                                            <p className="text-lg text-gray-200 italic leading-relaxed border-l-4 pl-4 py-1" style={{ borderColor: color }}>
                                                {t(`poi.${poiId}_story`)}
                                            </p>
                                        </div>
                                    </Card>
                                );
                            }) : (
                                <div className="col-span-full h-24 flex items-center justify-center border-2 border-dashed border-gray-800 rounded">
                                    <span className="text-gray-700 font-mono tracking-widest uppercase">???</span>
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

const Card: React.FC<{ children: React.ReactNode, isLocked?: boolean, color?: string }> = ({ children, isLocked, color = '#6b7280' }) => (
    <div className={`p-6 border-l-8 border-2 relative overflow-hidden transition-all duration-300 bg-black/60 shadow-2xl active:scale-[0.98] ${isLocked ? 'border-gray-800' : ''}`}
        style={{ borderColor: isLocked ? '#1f2937' : color, boxShadow: isLocked ? 'none' : `inset 0 0 20px ${color}11` }}
    >
        <div className="">
            {isLocked && (
                <div className="absolute inset-0 z-10 bg-[url('/assets/noise.png')] opacity-10 pointer-events-none"></div>
            )}
            {children}
        </div>
    </div>
);

// --- Helpers for Lore ---
const getEnemyDescription = (type: string) => {
    const key = `enemies.${type}.description`;
    const loc = t(key);
    if (loc === key) {
        // Fallback for types not strictly in the en.enemies map
        switch (type) {
            case 'WALKER': return "Standard reanimated combatant. Low threat individually, dangerous in swarms.";
            case 'RUNNER': return "Hyper-aggressive mutation. Closing speed is extreme.";
            case 'TANK': return "Heavily armored juggernaut. Absorbs significant small-arms fire.";
            case 'BOMBER': return "Unstable biological payload. Explodes on proximity.";
            default: return t('enemies.unknown');
        }
    }
    return loc;
};

const getBossDescription = (bossNameKey: string) => {
    // BossNameKey is like 'bosses.0.name'
    const index = bossNameKey.split('.')[1];
    return t(`bosses.${index}.lore`);
};

const DescriptionExpansion: React.FC<{ item: any, isFound: boolean, isMobile?: boolean }> = ({ item, isFound, isMobile }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <div className="flex flex-col h-full cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
            {/* 3D Preview Area */}
            <div className={`w-full bg-zinc-900 relative border-b border-zinc-800/50 ${isMobile ? 'h-24' : 'aspect-square'}`}>
                <CollectiblePreview type={item.modelType} isLocked={!isFound} />
            </div>

            {/* Info Area */}
            <div className={`${isMobile ? 'p-2' : 'p-4'} flex-1 flex flex-col`}>
                <h4 className={`${isMobile ? 'text-xs' : 'text-lg'} font-semibold uppercase tracking-tighter mb-1 truncate ${isFound ? 'text-yellow-500' : 'text-zinc-700'}`}>
                    {isFound ? t(item.nameKey) : '???'}
                </h4>
                <p className={`text-xs font-mono leading-relaxed ${isExpanded ? '' : 'line-clamp-3'} ${isFound ? 'text-zinc-400 italic' : 'text-zinc-800'}`}>
                    {isFound ? t(item.descriptionKey) : ''}
                </p>
                {isFound && !isExpanded && !isMobile && (
                    <span className="text-[10px] text-zinc-600 mt-2 uppercase font-bold tracking-widest">[ Click to expand ]</span>
                )}
            </div>

            {/* Hover Overlay */}
            {!isFound && (
                <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors pointer-events-none"></div>
            )}
        </div>
    );
};

export default ScreenAdventureLog;
