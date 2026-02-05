import React, { useState, useEffect } from 'react';
import { PlayerStats } from '../../types';
import { t } from '../../utils/i18n';
import { ZOMBIE_TYPES, BOSSES, MAP_THEMES } from '../../content/constants';
import { soundManager } from '../../utils/sound';
import { COLLECTIBLES } from '../../content/collectibles';
import CampModalLayout from './CampModalLayout';
import CollectiblePreview from '../ui/core/CollectiblePreview';

interface ScreenAdventureLogProps {
    stats: PlayerStats;
    onClose: () => void;
    onMarkCollectiblesViewed?: (collectibleIds: string[]) => void;
    isMobileDevice?: boolean;
}

type Tab = 'collectibles' | 'clues' | 'poi' | 'boss' | 'enemy';

const ScreenAdventureLog: React.FC<ScreenAdventureLogProps> = ({ stats, onClose, onMarkCollectiblesViewed, isMobileDevice }) => {
    const [activeTab, setActiveTab] = useState<Tab>('collectibles');

    // Mark all found collectibles as viewed when the log is opened
    useEffect(() => {
        const foundIds = stats.collectiblesFound || [];
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

    return (
        <CampModalLayout
            title={t('ui.adventure_log')}
            borderColorClass="border-green-600"
            onClose={onClose}
            isMobile={isMobileDevice}
        >
            <div className={`flex flex-col h-full ${isMobileDevice ? 'gap-4' : 'gap-8'}`}>
                {/* Tabs Bar */}
                <div className="flex gap-2 md:gap-4 border-b-2 border-gray-800 pb-2 md:pb-4 overflow-x-auto pl-2 pt-2 min-h-[60px] md:min-h-[80px] items-end shrink-0">
                    {tabs.map(tab => {
                        const isActive = activeTab === tab.id;
                        return (
                            <button key={tab.id} onClick={() => handleTabChange(tab.id)}
                                className={`px-4 md:px-6 py-2 md:py-4 text-xs md:text-lg font-black uppercase tracking-widest transition-all skew-x-[-10deg] border-2 hover:brightness-110 whitespace-nowrap`}
                                style={{
                                    borderColor: isActive ? themeColor : 'transparent',
                                    backgroundColor: isActive ? themeColor : 'transparent',
                                    color: isActive ? 'black' : '#6b7280'
                                }}
                            >
                                <span className="block skew-x-[10deg]">{tab.label}</span>
                            </button>
                        );
                    })}
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                    {activeTab === 'enemy' && <EnemyTab stats={stats} color={themeColor} />}
                    {activeTab === 'boss' && <BossTab stats={stats} color={themeColor} />}
                    {activeTab === 'collectibles' && <CollectiblesTab stats={stats} />}
                    {activeTab === 'clues' && <CluesTab stats={stats} color={themeColor} />}
                    {activeTab === 'poi' && <PoiTab stats={stats} />}
                </div>
            </div>
        </CampModalLayout>
    );
};

const EnemyTab: React.FC<{ stats: PlayerStats, color: string }> = ({ stats, color }) => {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Object.entries(ZOMBIE_TYPES).map(([key, data]) => {
                const isSeen = (stats.seenEnemies || []).includes(key) || (stats.killsByType && stats.killsByType[key] > 0);

                return (
                    <Card key={key} isLocked={!isSeen} color={color}>
                        <div className="flex justify-between items-start mb-4 border-b border-gray-800 pb-2">
                            <h3 className="text-2xl font-black uppercase tracking-tighter" style={{ color: isSeen ? color : '#4b5563' }}>
                                {isSeen ? key : '???'}
                            </h3>
                            {isSeen && <span className="text-xs font-mono font-bold bg-gray-800 px-2 py-1 rounded text-gray-300">KILLS: {stats.killsByType?.[key] || 0}</span>}
                        </div>
                        {isSeen ? (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-2 text-xs font-mono text-gray-400">
                                    <div className="flex justify-between border-b border-gray-900 pb-1"><span>HP</span><span className="text-white">{data.hp}</span></div>
                                    <div className="flex justify-between border-b border-gray-900 pb-1"><span>DMG</span><span className="text-white">{data.damage}</span></div>
                                    <div className="flex justify-between border-b border-gray-900 pb-1"><span>SPD</span><span className="text-white">{data.speed}</span></div>
                                    <div className="flex justify-between border-b border-gray-900 pb-1"><span>PTS</span><span className="text-white">{data.score}</span></div>
                                </div>
                                <p className="text-sm text-gray-300 italic leading-relaxed border-l-2 pl-3" style={{ borderColor: color }}>
                                    "{getEnemyDescription(key)}"
                                </p>
                            </div>
                        ) : (
                            <div className="h-20 flex items-center justify-center text-gray-600 font-mono text-sm uppercase tracking-widest">
                                [ DATA LOCKED ]
                            </div>
                        )}
                    </Card>
                );
            })}
        </div>
    );
};

const BossTab: React.FC<{ stats: PlayerStats, color: string }> = ({ stats, color }) => {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {Object.entries(BOSSES).map(([mapIdStr, boss]) => {
                const mapId = parseInt(mapIdStr);
                const isSeen = (stats.seenBosses || []).includes(boss.name) || (stats.bossesDefeated || []).includes(mapId);
                const isDefeated = (stats.bossesDefeated || []).includes(mapId);
                const isUnlocked = isSeen || isDefeated;

                return (
                    <Card key={mapId} isLocked={!isUnlocked} color={isDefeated ? '#10b981' : '#ef4444'}> {/* Green if dead, Red if alive */}
                        <div className="flex justify-between items-start mb-4 border-b border-gray-800 pb-2">
                            <div className="flex flex-col">
                                <h3 className="text-2xl font-black uppercase tracking-tighter" style={{ color: isUnlocked ? (isDefeated ? '#10b981' : '#ef4444') : '#4b5563' }}>
                                    {isUnlocked ? t(boss.name) : 'Unknown Threat'}
                                </h3>
                                <span className="text-xs text-gray-500 uppercase tracking-widest">{t(MAP_THEMES[mapId]?.name || 'Unknown Sector')}</span>
                            </div>
                            {isDefeated && <span className="text-xs bg-emerald-900/40 text-emerald-400 px-3 py-1 rounded border border-emerald-900 font-bold uppercase tracking-wider">Eliminated</span>}
                        </div>
                        {isUnlocked ? (
                            <div className="flex flex-col gap-4">
                                <div className="grid grid-cols-3 gap-2 text-xs font-mono text-gray-400 bg-black/40 p-3 rounded">
                                    <div className="text-center"><div className="text-gray-600 text-[10px] uppercase">Health</div><div className="text-lg font-bold text-white">{boss.hp}</div></div>
                                    <div className="text-center"><div className="text-gray-600 text-[10px] uppercase">Damage</div><div className="text-lg font-bold text-white">{boss.damage}</div></div>
                                    <div className="text-center"><div className="text-gray-600 text-[10px] uppercase">Speed</div><div className="text-lg font-bold text-white">{boss.speed}</div></div>
                                </div>
                                <div>
                                    <p className="text-white italic mb-2 font-serif text-lg">"{t('bosses.intro_default')}"</p>
                                    <p className="text-sm text-gray-400 border-l-2 pl-3 border-gray-700">{getBossDescription(boss.name)}</p>
                                </div>
                            </div>
                        ) : (
                            <div className="h-32 flex items-center justify-center text-gray-600 font-mono text-sm uppercase tracking-widest">
                                [ CLASSIFIED - SECTOR {mapId + 1} ]
                            </div>
                        )}
                    </Card>
                );
            })}
        </div>
    );
};

const CollectiblesTab: React.FC<{ stats: PlayerStats }> = ({ stats }) => {
    const foundIds = stats.collectiblesFound || [];
    const viewedIds = stats.viewedCollectibles || [];

    // Group collectibles by sector for better organization - ascending
    const sectors = [1, 2, 3, 4, 5];

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-16 pb-12">
            {sectors.map(sectorId => {
                const sectorCollectibles = Object.values(COLLECTIBLES).filter(c => c.sector === sectorId);
                const theme = MAP_THEMES[sectorId - 1]; // Fix: MAP_THEMES is 0-indexed, sectorId is 1-indexed
                const sectorName = theme ? t(theme.name) : `Sector ${sectorId}`;
                const foundInSector = sectorCollectibles.filter(c => foundIds.includes(c.id)).length;

                return (
                    <div key={sectorId} className="space-y-6">
                        <div className="flex flex-col border-b-2 border-zinc-800 pb-2">
                            <h3 className="text-3xl font-black uppercase tracking-tighter text-zinc-500">
                                {sectorName}
                            </h3>
                            <span className="text-sm font-mono text-zinc-600 font-bold uppercase mt-1">
                                {foundInSector} / {sectorCollectibles.length} {t('ui.collected')}
                            </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {sectorCollectibles.map(item => {
                                const isFound = foundIds.includes(item.id);
                                const isNew = isFound && !viewedIds.includes(item.id);
                                return (
                                    <div key={item.id} className={`group relative flex flex-col border-2 transition-all duration-500 overflow-hidden ${isFound ? 'border-yellow-600/40 bg-zinc-900/40' : 'border-zinc-800 bg-black/20'}`}>

                                        {/* 3D Preview Area */}
                                        <div className="aspect-square w-full bg-black/40 relative border-b border-zinc-800/50">
                                            <CollectiblePreview type={item.modelType} isLocked={!isFound} />

                                            {/* NEW Badge - Only shows for unviewed collectibles */}
                                            {isNew && (
                                                <div className="absolute top-2 right-2 bg-yellow-600 text-black text-[10px] font-black px-2 py-0.5 uppercase tracking-tighter skew-x-[-10deg] shadow-lg">
                                                    {t('ui.new')}
                                                </div>
                                            )}
                                        </div>

                                        {/* Info Area */}
                                        <div className="p-4 flex flex-col h-32">
                                            <h4 className={`text-lg font-black uppercase tracking-tighter mb-1 truncate ${isFound ? 'text-yellow-500' : 'text-zinc-700'}`}>
                                                {isFound ? t(item.nameKey) : '???'}
                                            </h4>
                                            <p className={`text-xs font-mono leading-relaxed line-clamp-3 ${isFound ? 'text-zinc-400 italic' : 'text-zinc-800'}`}>
                                                {isFound ? t(item.descriptionKey) : 'Data encrypted. Item location unknown.'}
                                            </p>
                                        </div>

                                        {/* Hover Overlay */}
                                        {!isFound && (
                                            <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors pointer-events-none"></div>
                                        )}
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
    const clues = stats.cluesFound || [];

    return (
        <div className="space-y-4">
            {clues.length === 0 && (
                <div className="text-center py-20 text-gray-500 font-mono uppercase tracking-widest">No intel gathered.</div>
            )}
            {clues.map((clueId, idx) => (
                <div key={idx} className="bg-black/40 border-l-4 p-4 hover:bg-black/60 transition-colors" style={{ borderColor: color }}>
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="text-lg font-bold uppercase tracking-wider text-white">Intel Fragment #{idx + 1}</h3>
                        <span className="text-xs font-mono text-gray-600">ID: {clueId}</span>
                    </div>
                    <p className="text-sm text-gray-400 font-mono">
                        [ Decrypted Data Segment {idx + 1}-{clueId.substring(0, 4)}... ]
                    </p>
                </div>
            ))}
        </div>
    );
};

const PoiTab: React.FC<{ stats: PlayerStats }> = ({ stats }) => (
    <div className="flex flex-col items-center justify-center h-full opacity-50">
        <div className="text-6xl mb-4 grayscale opacity-20">📍</div>
        <h3 className="text-xl font-bold text-gray-500 uppercase tracking-widest mb-2">{t('ui.wip')}</h3>
        <p className="text-gray-600 font-mono">Travel logs empty or unreadable.</p>
    </div>
);

const Card: React.FC<{ children: React.ReactNode, isLocked?: boolean, color?: string }> = ({ children, isLocked, color = '#6b7280' }) => (
    <div className={`p-6 border-2 relative overflow-hidden transition-all bg-black/60 ${isLocked ? 'border-gray-800' : ''}`}
        style={{ borderColor: isLocked ? '#1f2937' : color }}
    >
        {isLocked && (
            <div className="absolute inset-0 z-10 bg-[url('/assets/noise.png')] opacity-10 pointer-events-none"></div>
        )}
        {children}
    </div>
);

// --- Helpers for Lore ---
const getEnemyDescription = (type: string) => {
    switch (type) {
        case 'WALKER': return "Standard reanimated combatant. Low threat individually, dangerous in swarms. Aim for the head.";
        case 'RUNNER': return "Hyper-aggressive mutation. Closing speed is extreme. Prioritize targets immediately.";
        case 'TANK': return "Heavily armored juggernaut. Absorbs significant small-arms fire. Explosives recommended.";
        case 'BOMBER': return "Unstable biological payload. Explodes on proximity. Keep safe distance.";
        default: return "Unknown biological anomaly.";
    }
};

const getBossDescription = (id: string) => {
    switch (id) {
        case 'butcher': return "Entity identified in Sector 1 (Forest). wields crude heavy weaponry. High physical resilience.";
        case 'ghost': return "Entity identified in Sector 2 (Graveyard). Capabilities include optical camouflage and rapid repositioning.";
        case 'abomination': return "Entity identified in Sector 3 (Sewers). Emits toxic biological agents. Environmental hazard.";
        case 'colossus': return "Entity identified in Sector 4 (City). Massive bio-mechanical structure. Extreme threat level.";
        default: return "Classified threat data.";
    }
};

export default ScreenAdventureLog;
