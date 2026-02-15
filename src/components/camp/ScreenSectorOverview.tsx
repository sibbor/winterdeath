import React, { useState, useEffect, useMemo } from 'react';
import { t } from '../../utils/i18n';
import { SECTOR_THEMES, BOSSES, FAMILY_MEMBERS } from '../../content/constants';
import { getCollectiblesBySector } from '../../content/collectibles';
import { en } from '../../locales/en';
import CampModalLayout from './CampModalLayout';
import { PlayerStats } from '../../types';

interface ScreenSectorOverviewProps {
    currentSector: number;
    rescuedFamilyIndices: number[];
    deadBossIndices: number[];
    debugMode: boolean;
    stats: PlayerStats;
    onSelectSector: (sectorIndex: number) => void;
    onStartSector: () => void;
    onClose: () => void;
    isMobileDevice?: boolean;
}

const ScreenSectorOverview: React.FC<ScreenSectorOverviewProps> = ({ currentSector, rescuedFamilyIndices, deadBossIndices, debugMode, stats, onSelectSector, onStartSector, onClose, isMobileDevice }) => {
    const [selectedSectorIndex, setSelectedSectorIndex] = useState(currentSector);
    const [briefingText, setBriefingText] = useState("");

    const sectorTheme = SECTOR_THEMES[selectedSectorIndex];
    const boss = BOSSES[selectedSectorIndex] || BOSSES[0];
    const isRescued = rescuedFamilyIndices.includes(selectedSectorIndex);
    const isCleared = deadBossIndices.includes(selectedSectorIndex);
    const isLocked = !debugMode && (selectedSectorIndex > 0 && !deadBossIndices.includes(selectedSectorIndex - 1));

    // -- Briefing Text Logic --
    const briefingData = useMemo(() => {
        const sectorName = t(sectorTheme.name);
        const sectorBriefing = t(sectorTheme.briefing);
        const bossName = t(boss.name);

        return { map: sectorName, boss: bossName, briefing: sectorBriefing };
    }, [selectedSectorIndex, sectorTheme, boss]);

    useEffect(() => {
        // Reset and type-write text when selection changes
        setBriefingText("");
        let i = 0;
        const speed = 5; // Faster typing
        const briefingText = briefingData.briefing;
        const interval = setInterval(() => {
            setBriefingText(briefingText.slice(0, i));
            i++;
            if (i > briefingText.length) clearInterval(interval);
        }, speed);
        return () => clearInterval(interval);
    }, [briefingData]);

    // -- Stats Calculation --
    const { collectibles, clues, pois } = useMemo(() => {
        const sectorNum = selectedSectorIndex + 1;

        // Accurate Collectible Count
        const sectorCollectibles = getCollectiblesBySector(sectorNum);
        const foundCollectibles = (stats.collectiblesFound || []).filter(id =>
            sectorCollectibles.some(c => c.id === id)
        ).length;

        // Clues & POIs (Still based on prefix but more robust)
        const sectorPrefix = `s${sectorNum}_`;
        const allKeys = Object.keys(en.clues);
        const sectorKeys = allKeys.filter(k => k.startsWith(sectorPrefix));

        const clueKeys = sectorKeys.filter(k => !k.includes('collectible') && !k.includes('poi') && !k.endsWith('_description'));
        const poiKeys = sectorKeys.filter(k => k.includes('poi'));

        const foundCluesCount = (stats.cluesFound || []).filter(id => clueKeys.includes(id)).length;
        const foundPoisCount = (stats.visitedPOIs || []).filter(id => poiKeys.includes(id)).length;

        return {
            collectibles: { found: foundCollectibles, total: sectorCollectibles.length },
            clues: { found: foundCluesCount, total: clueKeys.length },
            pois: { found: foundPoisCount, total: poiKeys.length }
        };
    }, [selectedSectorIndex, stats]);


    const handleSelect = (index: number) => {
        if ((!debugMode && (index > 0 && !deadBossIndices.includes(index - 1)))) return; // Locked
        setSelectedSectorIndex(index);
        onSelectSector(index);
    };

    const handleDeploy = () => {
        onSelectSector(selectedSectorIndex);
        onStartSector();
    };

    const bossStatusKey = isCleared ? 'ui.boss_dead' : 'ui.boss_alive';
    const bossStatusColor = isCleared ? 'text-green-500 border-green-600 bg-green-900/20' : 'text-red-500 border-red-600 bg-red-900/20';

    const familyStatusKey = isRescued ? 'ui.family_member_rescued' : 'ui.family_member_missing';
    const familyStatusColor = isRescued ? 'text-green-500 border-green-600 bg-green-900/20' : 'text-red-500 border-red-600 bg-red-900/20';

    return (
        <CampModalLayout
            title={t('stations.sectors')}
            borderColorClass="border-red-600"
            onClose={onClose}
            onConfirm={handleDeploy}
            confirmLabel={t('ui.deploy_sector')}
            canConfirm={!(!debugMode && (selectedSectorIndex > 0 && !deadBossIndices.includes(selectedSectorIndex - 1)))} // Lock logic
            isMobile={isMobileDevice}
        >
            <div className={`flex h-full gap-4 md:gap-8 ${isMobileDevice ? 'flex-col overflow-y-auto touch-auto' : ''}`}>
                {/* LEFT: Sector List */}
                <div className={`${isMobileDevice ? 'w-full shrink-0 relative' : 'w-1/3 flex flex-col gap-4 overflow-y-auto pr-2 pl-6'} custom-scrollbar shadow-inner`}>
                    {isMobileDevice && (
                        <>
                            <div className="absolute left-0 top-0 bottom-0 w-4 bg-gradient-to-r from-black via-black/50 to-transparent z-10 pointer-events-none" />
                            <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-black via-black/50 to-transparent z-10 pointer-events-none" />
                        </>
                    )}
                    <div className={`${isMobileDevice ? 'flex gap-2 overflow-x-auto pb-4 px-2 snap-x snap-mandatory' : 'flex flex-col gap-4'}`} style={isMobileDevice ? { WebkitOverflowScrolling: 'touch' } : {}}>
                        {SECTOR_THEMES.map((map, i) => {
                            const isSel = selectedSectorIndex === i;
                            // re-eval locked for list
                            const locked = !debugMode && (i > 0 && !deadBossIndices.includes(i - 1));

                            return (
                                <button
                                    key={i}
                                    onClick={() => handleSelect(i)}
                                    disabled={locked}
                                    className={`text-left p-4 md:p-6 border-l-4 transition-all group relative overflow-hidden shrink-0 whitespace-nowrap md:whitespace-normal snap-center
                                        ${locked ? 'opacity-50 cursor-not-allowed bg-black border-gray-800' : 'cursor-pointer hover:bg-red-900/10'}
                                        ${isSel ? 'bg-red-900/20 border-red-500' : 'border-gray-800'}
                                        ${isMobileDevice ? 'border-l-0 border-b-4 min-w-[120px] py-3 px-4' : ''}
                                    `}
                                >
                                    <h3 className={`${isMobileDevice ? 'text-[10px]' : 'text-xl'} font-black uppercase tracking-wider ${isSel ? 'text-white' : (locked ? 'text-gray-600' : 'text-gray-400')}`}>
                                        {locked ? `${t('ui.sector')} ${i + 1} - ${t('ui.locked')}` : t(map.name)}
                                    </h3>
                                    {isMobileDevice && isSel && <div className="absolute bottom-0 left-0 w-full h-1 bg-red-500 animate-pulse" />}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Mobile Paging Indicators */}
                {isMobileDevice && (
                    <div className="flex justify-center gap-1 mb-2">
                        {SECTOR_THEMES.map((_, i) => (
                            <div key={i} className={`h-1 w-4 transition-colors ${selectedSectorIndex === i ? 'bg-red-500' : 'bg-gray-800'}`} />
                        ))}
                    </div>
                )}

                {/* RIGHT: Detail View */}
                <div className={`flex-1 flex flex-col bg-black/40 border-2 border-gray-800 p-4 md:p-8 relative ${isMobileDevice ? 'min-h-[300px] overflow-visible' : ''}`}>
                    {/* Header */}
                    <div className="flex flex-col gap-4 mb-6 border-b border-gray-800 pb-4">
                        <div>
                            <h2 className={`${isMobileDevice ? 'text-xl' : 'text-4xl'} font-black uppercase tracking-tighter text-gray-400 mb-2`}>
                                {t(sectorTheme.name)}
                            </h2>
                            {/* Stats Row */}
                            <div className={`flex flex-wrap gap-2 md:gap-4 ${isMobileDevice ? 'text-xs' : 'text-lg'} font-bold font-mono text-gray-400 mt-1`}>
                                <span>{t('ui.log_collectibles')}: <span className="text-white">{collectibles.found}/{collectibles.total || '?'}</span></span>
                                <span className={`${isMobileDevice ? 'hidden' : 'text-gray-600'}`}>|</span>
                                <span>{t('ui.log_clues')}: <span className="text-white">{clues.found}/{clues.total || '?'}</span></span>
                                <span className={`${isMobileDevice ? 'hidden' : 'text-gray-600'}`}>|</span>
                                <span>{t('ui.log_poi')}: <span className="text-white">{pois.found}/{pois.total || '?'}</span></span>
                            </div>
                        </div>

                        <div className="flex flex-col md:flex-row gap-2 md:gap-4 items-start">
                            {/* Boss Status Check */}
                            <div className={`${isMobileDevice ? 'px-2 py-1 text-[10px]' : 'px-4 py-2 text-sm'} font-black uppercase border tracking-wider text-center md:min-w-[180px] whitespace-nowrap ${bossStatusColor}`}>
                                {t('ui.boss_status')}: {t(bossStatusKey)}
                            </div>

                            {/* Family Status Check */}
                            {selectedSectorIndex < 4 && (
                                <div className={`${isMobileDevice ? 'px-2 py-1 text-[10px]' : 'px-4 py-2 text-sm'} font-black uppercase border tracking-wider text-center md:min-w-[180px] whitespace-nowrap ${familyStatusColor}`}>
                                    {t('ui.family_member')}: {isRescued ? t(FAMILY_MEMBERS[selectedSectorIndex]?.name || 'Unknown') : '???'}
                                    <span className="text-[10px] md:text-xs ml-1 md:ml-2 opacity-100">
                                        ({t(familyStatusKey)})
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Briefing Text */}
                    <div className={`flex-1 bg-black ${isMobileDevice ? 'overflow-visible' : 'overflow-y-auto'} mb-4 md:mb-6 shadow-inner font-mono text-sm md:text-xl leading-relaxed text-gray-300 whitespace-pre-wrap`}>
                        {briefingText}
                        <span className="animate-pulse inline-block w-2 h-4 bg-red-500 ml-1 align-middle"></span>
                    </div>
                </div>
            </div>
        </CampModalLayout>
    );
};

export default ScreenSectorOverview;
