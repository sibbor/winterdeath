import React, { useState, useEffect } from 'react';
import { PlayerStats } from '../../types';
import { t } from '../../utils/i18n';
import { ZOMBIE_TYPES, BOSSES, SECTOR_THEMES, RANKS } from '../../content/constants';
import { soundManager } from '../../utils/SoundManager';
import { COLLECTIBLES } from '../../content/collectibles';
import { useOrientation } from '../../hooks/useOrientation';
import { EnemyType } from '../../types/enemy';
import ScreenModalLayout from '../ui/ScreenModalLayout';
import CollectiblePreview from '../ui/core/CollectiblePreview';

interface ScreenAdventureLogProps {
    stats: PlayerStats;
    onClose: () => void;
    onMarkCollectiblesViewed?: (collectibleIds: string[]) => void;
    isMobileDevice?: boolean;
    debugMode?: boolean;
}


type Tab = 'stats' | 'collectibles' | 'clues' | 'poi' | 'boss' | 'enemy';

const ScreenAdventureLog: React.FC<ScreenAdventureLogProps> = ({ stats, onClose, onMarkCollectiblesViewed, isMobileDevice, debugMode }) => {
    const { isLandscapeMode } = useOrientation();
    const effectiveLandscape = isLandscapeMode || !isMobileDevice;
    const [activeTab, setActiveTab] = useState<Tab>('stats');

    // Mark all found collectibles as viewed when the log is opened
    useEffect(() => {
        const foundIds = stats.collectiblesDiscovered || [];
        const viewedIds = stats.viewedCollectibles || [];
        const newIds = foundIds.filter(id => !viewedIds.includes(id));

        if (newIds.length > 0 && onMarkCollectiblesViewed) {
            onMarkCollectiblesViewed(newIds);
        }
    }, [stats.collectiblesDiscovered, stats.viewedCollectibles, onMarkCollectiblesViewed]);

    const handleTabChange = (tab: Tab) => {
        soundManager.playUiClick();
        setActiveTab(tab);
    };

    const tabs: { id: Tab, label: string }[] = [
        { id: 'stats', label: t('stations.stats') },
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

    const darkenColor = (hex: string, percent: number) => {
        const num = parseInt(hex.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = (num >> 16) - amt;
        const G = (num >> 8 & 0x00FF) - amt;
        const B = (num & 0x0000FF) - amt;
        return '#' + (0x1000000 + (R < 255 ? R < 0 ? 0 : R : 255) * 0x10000 + (G < 255 ? G < 0 ? 0 : G : 255) * 0x100 + (B < 255 ? B < 0 ? 0 : B : 255)).toString(16).slice(1);
    };

    return (
        <ScreenModalLayout
            title={t('stations.adventure_log')}
            isMobileDevice={isMobileDevice}
            onClose={onClose}
            onCancel={onClose}
            cancelLabel={t('ui.close')}
            titleColorClass="text-green-600"
            debugAction={isDebugMode ? { label: "SHOW ALL (DEBUG)", action: handleDebugShowAll } : undefined}
            tabs={tabs.map(t => t.id)}
            activeTab={activeTab}
            onTabChange={handleTabChange}
            tabOrientation={effectiveLandscape ? 'vertical' : 'horizontal'}
        >
            <div className={`flex h-full ${effectiveLandscape ? 'flex-row gap-8' : 'flex-col gap-4'}`}>
                {/* Tabs Bar */}
                <div className={`relative shrink-0 ${effectiveLandscape ? 'w-1/3 flex flex-col gap-4 overflow-y-auto pl-safe custom-scrollbar' : ''}`}>
                    <div className={`${effectiveLandscape ? 'flex flex-col gap-4 pt-4 pr-10' : 'flex gap-2 border-b-2 border-gray-800 pb-2 md:pb-4 overflow-x-auto px-4 pt-2 items-end scrollbar-hide'}`}>
                        {tabs.map(tab => {
                            const isActive = activeTab === tab.id;
                            const pulseColor = themeColor; 
                            return (
                                <button key={tab.id} onClick={() => handleTabChange(tab.id)}
                                    className={`px-3 md:px-6 py-1.5 md:py-4 transition-all duration-200 hover:scale-105 active:scale-95 whitespace-nowrap flex justify-between items-center border-2 border-zinc-700
                                        ${isActive
                                            ? 'text-white animate-tab-pulsate'
                                            : 'bg-black text-zinc-400 hover:bg-zinc-900'
                                        } 
                                        ${effectiveLandscape ? 'w-full text-left p-4 md:p-6 text-xl font-semibold uppercase tracking-wider mx-2' : 'text-[10px] md:text-lg font-bold uppercase tracking-widest'}
                                    `}
                                    style={isActive ? {
                                        backgroundColor: darkenColor(pulseColor, 20), 
                                        '--pulse-color': pulseColor 
                                    } as any : {}}
                                >
                                    <span>{tab.label}</span>
                                    {isActive && effectiveLandscape && <span className="text-white font-bold ml-2">→</span>}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                    {activeTab === 'stats' && <StatsTab stats={stats} isMobileDevice={!effectiveLandscape} />}
                    {activeTab === 'enemy' && <EnemyTab stats={stats} color={themeColor} isMobileDevice={isMobileDevice} effectiveLandscape={effectiveLandscape} />}
                    {activeTab === 'boss' && <BossTab stats={stats} color={themeColor} isMobileDevice={isMobileDevice} effectiveLandscape={effectiveLandscape} isDebug={isDebugMode} />}
                    {activeTab === 'collectibles' && <CollectiblesTab stats={stats} isMobileDevice={!effectiveLandscape} effectiveLandscape={effectiveLandscape} isDebug={isDebugMode} />}
                    {activeTab === 'clues' && <CluesTab stats={stats} color={'#eab308'} isMobileDevice={isMobileDevice} effectiveLandscape={effectiveLandscape} isDebug={isDebugMode} />}
                    {activeTab === 'poi' && <PoiTab stats={stats} color={'#3b82f6'} isMobileDevice={isMobileDevice} effectiveLandscape={effectiveLandscape} isDebug={isDebugMode} />}
                </div>
            </div>
        </ScreenModalLayout>
    );
};

const StatsTab: React.FC<{ stats: PlayerStats, isMobileDevice?: boolean }> = ({ stats, isMobileDevice }) => {
    const getRank = (level: number) => {
        const rankKey = Math.min(Math.max(0, level - 1), 19);
        const translated = t(`ranks.${rankKey}`);
        if (translated.startsWith('ranks.')) return RANKS[rankKey];
        return translated;
    };

    const accuracy = stats.totalBulletsFired > 0
        ? ((stats.totalBulletsHit || 0) / stats.totalBulletsFired * 100).toFixed(1)
        : "0.0";

    const killsLabel = t('ui.kills');
    const displayKillsLabel = killsLabel.charAt(0).toUpperCase() + killsLabel.slice(1).toLowerCase();

    return (
        <div className={`flex h-full gap-6 md:gap-12 pb-12 ${isMobileDevice ? 'flex-col overflow-y-auto' : ''}`}>
            {/* LEFT COLUMN */}
            <div className={`${isMobileDevice ? 'w-full shrink-0' : 'w-1/3'} flex flex-col gap-6`}>
                {/* RANK BOX */}
                <div className="bg-blue-900/20 border-2 border-blue-500/50 p-6 flex flex-col items-center text-center">
                    <span className="text-blue-400 text-sm font-bold uppercase tracking-widest mb-2">{t('ui.current_rank')}</span>
                    <h1 className="text-4xl font-semibold text-white uppercase tracking-tighter mb-4">{getRank(stats.level)}</h1>
                    <div className="w-full bg-black h-4 border border-blue-900 relative">
                        <div className="h-full bg-blue-500" style={{ width: `${(stats.currentXp / stats.nextLevelXp) * 100}%` }}></div>
                    </div>
                    <div className="flex justify-between w-full mt-2 text-xs font-mono text-blue-300">
                        <span>{t('ui.lvl')} {stats.level}</span>
                        <span>{stats.currentXp} / {stats.nextLevelXp} {t('ui.xp')}</span>
                    </div>
                </div>

                {/* FAMILY BOX */}
                <div className="bg-black border border-gray-800 p-6 h-fit">
                    <h3 className="text-xl font-semibold text-gray-400 uppercase tracking-wider mb-4 border-b border-gray-800 pb-2">{t('ui.family_header')}</h3>
                    <div className="space-y-3 text-sm">
                        <div className="flex justify-between items-end"><span className="text-gray-500">{t('ui.rescued_family_members')}</span><span className="text-white font-mono text-lg">{stats.familyFoundCount}</span></div>
                        <div className="flex justify-between items-end"><span className="text-gray-500">{t('ui.clues_found')}</span><span className="text-white font-mono text-lg">{stats.cluesFound.length}</span></div>
                    </div>
                </div>
            </div>

            {/* RIGHT COLUMN */}
            <div className={`flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 content-start ${isMobileDevice ? 'shrink-0' : ''}`}>
                {/* PERFORMANCE BOX */}
                <div className="bg-black border border-gray-800 p-6">
                    <h3 className="text-xl font-semibold text-gray-400 uppercase tracking-wider mb-4 border-b border-gray-800 pb-2">{t('ui.performance')}</h3>
                    <div className="space-y-3 text-sm">
                        <div className="flex justify-between items-end"><span className="text-gray-500">{t('ui.xp_earned')}</span><span className="text-blue-400 font-mono font-bold text-lg">{stats.currentXp + ((stats.level - 1) * 1000)}</span></div>
                        <div className="flex justify-between items-end"><span className="text-gray-500">{t('ui.sp_earned')}</span><span className="text-purple-400 font-mono font-bold text-lg">{stats.totalSkillPointsEarned}</span></div>
                        <div className="flex justify-between items-end"><span className="text-gray-500">{t('ui.scrap_scavenged')}</span><span className="text-yellow-500 font-mono text-lg">{stats.totalScrapCollected}</span></div>
                        <div className="flex justify-between items-end"><span className="text-gray-500">{t('ui.sectors_completed')}</span><span className="text-white font-mono text-lg">{stats.sectorsCompleted}</span></div>
                        <div className="flex justify-between items-end"><span className="text-gray-500">{t('ui.chests_opened')}</span><span className="text-white font-mono text-lg">{stats.chestsOpened + stats.bigChestsOpened}</span></div>
                        <div className="h-px bg-gray-800 my-2"></div>
                        <div className="flex justify-between items-end"><span className="text-gray-500">{t('ui.incoming_damage')}</span><span className="text-white font-mono text-lg">{Math.floor(stats.totalDamageTaken)}</span></div>
                        <div className="flex justify-between items-end"><span className="text-gray-500">{t('ui.outgoing_damage')}</span><span className="text-white font-mono text-lg">{stats.totalDamageDealt.toLocaleString()}</span></div>
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
                        <div className="flex justify-between items-end"><span className="text-gray-500">{displayKillsLabel}</span><span className="text-white font-mono text-lg">{stats.kills}</span></div>
                        <div className="flex justify-between items-end"><span className="text-gray-500">{t('ui.deaths')}</span><span className="text-white font-mono text-lg">{stats.deaths}</span></div>
                        <div className="flex justify-between items-end"><span className="text-gray-500">{t('ui.throwables_thrown')}</span><span className="text-white font-mono text-lg">{stats.totalThrowablesThrown || 0}</span></div>
                    </div>

                    <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mt-6 mb-2 border-b border-gray-800 pb-1">{t('ui.kill_log')}</h3>
                    <div className="overflow-y-auto max-h-[350px] custom-scrollbar pr-2">
                        {stats.killsByType && Object.entries(stats.killsByType).map(([type, count]) => (
                            <div key={type} className="flex justify-between items-end text-xs py-1 border-b border-gray-900">
                                <span className="text-gray-400 font-medium">
                                    {type.charAt(0).toUpperCase() + type.slice(1).toLowerCase()}
                                </span>
                                <span className="text-white font-mono text-lg">{count as number}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

const EnemyTab: React.FC<{ stats: PlayerStats, color: string, isMobileDevice?: boolean, effectiveLandscape?: boolean }> = ({ stats, color, isMobileDevice, effectiveLandscape }) => {
    return (
        <div className={`grid ${isMobileDevice ? 'grid-cols-1 gap-4' : 'grid-cols-2 gap-6'} pb-12`}>
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
                                <div className="text-center border-l border-gray-800">
                                    <div className="text-gray-500 text-[10px] font-black uppercase tracking-widest">{t('ui.speed')}</div>
                                    <div className="text-2xl font-bold text-white font-mono">{data.speed.toFixed(1)}</div>
                                </div>
                                <div></div>
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
                                        {data.attacks.map((attack, idx) => {
                                            const attackKey = attack.type.toUpperCase();
                                            const hasDesc = t(`attacks.${attackKey}.description`) !== `attacks.${attackKey}.description`;
                                            return (
                                                <div key={idx} className="flex flex-col bg-zinc-900/40 px-3 py-2 rounded border border-gray-800/50">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                                                            {t(`attacks.${attackKey}.title`) !== `attacks.${attackKey}.title` ? t(`attacks.${attackKey}.title`) : attack.type}
                                                        </span>
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
                                                    {hasDesc && (
                                                        <p className="text-[10px] text-gray-500 italic mt-1 line-clamp-2 leading-tight">
                                                            {t(`attacks.${attackKey}.description`)}
                                                        </p>
                                                    )}
                                                </div>
                                            );
                                        })}
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

const BossTab: React.FC<{ stats: PlayerStats, color: string, isMobileDevice?: boolean, effectiveLandscape?: boolean, isDebug?: boolean }> = ({ stats, color, isMobileDevice, effectiveLandscape, isDebug }) => {
    const sectors = [0, 1, 2, 3];

    return (
        <div className="space-y-16 pb-12">
            {sectors.map(sectorIndex => {
                const boss = BOSSES[sectorIndex];
                const theme = SECTOR_THEMES[sectorIndex];
                const isSectorUnlocked = isDebug || stats.sectorsCompleted >= sectorIndex;
                const sectorName = isSectorUnlocked ? (theme ? t(theme.name) : `Sector ${sectorIndex + 1}`) : '???';

                const isSeen = boss && ((stats.seenBosses || []).includes(boss.name) || (stats.bossesDefeated || []).includes(sectorIndex));
                const isDefeated = (stats.bossesDefeated || []).includes(sectorIndex);
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
                                <Card isLocked={false} color={boss ? `#${boss.color.toString(16).padStart(6, '0')}` : '#4b5563'}>
                                    <div className="flex flex-col h-full">
                                        <div className="flex justify-between items-start mb-4 border-b-2 border-gray-800 pb-3">
                                            <div className="flex flex-col">
                                                <h3 className="text-3xl font-light uppercase tracking-tighter text-white">
                                                    {t(boss.name)}
                                                </h3>
                                                {isDefeated && <span className="text-[10px] text-green-500 font-black uppercase tracking-widest mt-1">{t('ui.defeated')}</span>}
                                            </div>
                                        </div>

                                        <div className="flex flex-col gap-6 flex-1">
                                            <div className="grid grid-cols-3 gap-3 bg-black/40 p-4 rounded border border-gray-800">
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
                                                <p className="text-gray-400 text-sm leading-relaxed">{getBossDescription(boss.name)}</p>

                                                {boss.attacks && boss.attacks.length > 0 && (
                                                    <div className="space-y-2 mt-4">
                                                        <div className="text-[10px] font-black text-gray-600 uppercase tracking-widest flex items-center gap-2">
                                                            <div className="h-[1px] flex-1 bg-gray-800"></div>
                                                            {t('ui.combat')}
                                                            <div className="h-[1px] flex-1 bg-gray-800"></div>
                                                        </div>
                                                        <div className="grid grid-cols-1 gap-2">
                                                            {boss.attacks.map((attack, idx) => {
                                                                const attackKey = attack.type.toUpperCase();
                                                                const hasDesc = t(`attacks.${attackKey}.description`) !== `attacks.${attackKey}.description`;
                                                                return (
                                                                    <div key={idx} className="flex flex-col bg-zinc-900/40 px-3 py-2 rounded border border-gray-800/50">
                                                                        <div className="flex justify-between items-center">
                                                                            <div className="flex flex-col">
                                                                                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                                                                                    {t(`attacks.${attackKey}.title`) !== `attacks.${attackKey}.title` ? t(`attacks.${attackKey}.title`) : attack.type}
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
                                                                        {hasDesc && (
                                                                            <p className="text-[10px] text-gray-500 italic mt-1 line-clamp-2 leading-tight">
                                                                                {t(`attacks.${attackKey}.description`)}
                                                                            </p>
                                                                        )}
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
};

const CollectiblesTab: React.FC<{ stats: PlayerStats, isMobileDevice?: boolean, effectiveLandscape?: boolean, isDebug?: boolean }> = ({ stats, isMobileDevice, effectiveLandscape, isDebug }) => {
    const foundIds = stats.collectiblesDiscovered || [];
    const sectors = [1, 2, 3, 4, 5, 6];

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-16 pb-12">
            {sectors.map(sectorId => {
                const sectorCollectibles = Object.values(COLLECTIBLES).filter(c => c.sector === sectorId);
                const theme = SECTOR_THEMES[sectorId - 1];
                const isSectorUnlocked = isDebug || stats.sectorsCompleted >= (sectorId - 1);
                const sectorName = isSectorUnlocked ? (theme ? t(theme.name) : `Sector ${sectorId}`) : '???';
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

                        <div className={`grid ${effectiveLandscape ? 'grid-cols-2 gap-6' : 'grid-cols-1 gap-4'}`}>
                            {sectorCollectibles.map(item => {
                                const isFound = foundIds.includes(item.id);
                                return (
                                    <div key={item.id} className={`group relative flex flex-col border-2 transition-all duration-500 overflow-hidden ${isFound ? 'border-yellow-600/40 bg-zinc-900/40' : 'border-zinc-800 bg-black/20'} ${isMobileDevice ? 'mb-2' : ''}`}>
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
};

const CluesTab: React.FC<{ stats: PlayerStats, color: string, isMobileDevice?: boolean, effectiveLandscape?: boolean, isDebug?: boolean }> = ({ stats, color, isMobileDevice, effectiveLandscape, isDebug }) => {
    const cluesFound = stats.cluesFound || [];
    const sectors = [1, 2, 3, 4, 5, 6];

    return (
        <div className="space-y-16 pb-12">
            {sectors.map(sectorId => {
                const theme = SECTOR_THEMES[sectorId - 1];
                const isSectorUnlocked = isDebug || stats.sectorsCompleted >= (sectorId - 1);
                const sectorName = isSectorUnlocked ? (theme ? t(theme.name) : `Sector ${sectorId}`) : '???';

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

                        <div className={`grid ${effectiveLandscape ? 'grid-cols-2 gap-6' : 'grid-cols-1 gap-4'}`}>
                            {sectorClues.length > 0 ? sectorClues.map((clueId) => {
                                const isThought = clueId.includes('thought');
                                const type = isThought ? 'THOUGHT' : 'SPEAK';
                                const typeColor = isThought ? '#3b82f6' : '#eab308';

                                return (
                                    <Card key={clueId} isLocked={false} color={typeColor}>
                                        <div className="flex flex-col gap-4">
                                            <div className="flex justify-between items-center border-b border-gray-800 pb-2">
                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded text-white uppercase tracking-widest" style={{ backgroundColor: typeColor }}>
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

const PoiTab: React.FC<{ stats: PlayerStats, color: string, isMobileDevice?: boolean, effectiveLandscape?: boolean, isDebug?: boolean }> = ({ stats, color, isMobileDevice, effectiveLandscape, isDebug }) => {
    const visitedList = stats.discoveredPOIs || [];
    const sectors = [1, 2, 3, 4, 5, 6];

    return (
        <div className="space-y-16 pb-12">
            {sectors.map(sectorId => {
                const theme = SECTOR_THEMES[sectorId - 1];
                const isSectorUnlocked = isDebug || stats.sectorsCompleted >= (sectorId - 1);
                const sectorName = isSectorUnlocked ? (theme ? t(theme.name) : `Sector ${sectorId}`) : '???';

                const sectorPOIs = visitedList.filter(id => id.startsWith(`s${sectorId}_poi_`));

                return (
                    <div key={sectorId} className="space-y-6">
                        <div className="flex flex-col border-b-2 border-zinc-800 pb-2">
                            <h3 className="text-3xl font-light uppercase tracking-tighter text-white">
                                {sectorName}
                            </h3>
                        </div>

                        <div className={`grid ${effectiveLandscape ? 'grid-cols-2 gap-6' : 'grid-cols-1 gap-4'}`}>
                            {sectorPOIs.length > 0 ? sectorPOIs.map((poiId) => {
                                return (
                                    <Card key={poiId} isLocked={false} color={color}>
                                        <div className="flex flex-col gap-4">
                                            <div className="flex justify-between items-start border-b border-gray-800 pb-3">
                                                <h3 className="text-2xl font-semibold uppercase tracking-tighter text-white">
                                                    {t(`poi.${poiId}_title`)}
                                                </h3>
                                                <span className="text-[10px] bg-blue-900/40 text-blue-400 px-3 py-1 rounded border border-blue-900 font-black tracking-widest">POI</span>
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
            {children}
        </div>
    </div>
);

const getEnemyDescription = (type: string) => {
    const key = `enemies.${type}.description`;
    const loc = t(key);
    if (loc === key) {
        switch (type) {
            case EnemyType.WALKER: return "Standard reanimated combatant. Low threat individually, dangerous in swarms.";
            case EnemyType.RUNNER: return "Hyper-aggressive mutation. Closing speed is extreme.";
            case EnemyType.TANK: return "Heavily armored juggernaut. Absorbs significant small-arms fire.";
            case EnemyType.BOMBER: return "Unstable biological payload. Explodes on proximity.";
            default: return t('enemies.unknown');
        }
    }
    return loc;
};

const getBossDescription = (bossNameKey: string) => {
    const index = bossNameKey.split('.')[1];
    return t(`bosses.${index}.lore`);
};

const DescriptionExpansion: React.FC<{ item: any, isFound: boolean, isMobileDevice?: boolean }> = ({ item, isFound, isMobileDevice }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <div className="flex flex-col h-full cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
            <div className={`w-full bg-zinc-900 relative border-b border-zinc-800/50 ${isMobileDevice ? 'h-24' : 'aspect-square'}`}>
                <CollectiblePreview type={item.modelType} isLocked={!isFound} />
            </div>

            <div className={`${isMobileDevice ? 'p-2' : 'p-4'} flex-1 flex flex-col`}>
                <h4 className={`${isMobileDevice ? 'text-xs' : 'text-lg'} font-semibold uppercase tracking-tighter mb-1 truncate ${isFound ? 'text-yellow-500' : 'text-zinc-700'}`}>
                    {isFound ? t(item.nameKey) : '???'}
                </h4>
                <p className={`text-xs font-mono leading-relaxed ${isExpanded ? '' : 'line-clamp-3'} ${isFound ? 'text-zinc-400 italic' : 'text-zinc-800'}`}>
                    {isFound ? t(item.descriptionKey) : ''}
                </p>
                {isFound && !isExpanded && !isMobileDevice && (
                    <span className="text-[10px] text-zinc-600 mt-2 uppercase font-bold tracking-widest">[ Click to expand ]</span>
                )}
            </div>
        </div>
    );
};

export default ScreenAdventureLog;
