import React, { useState, useEffect, useMemo } from 'react';
import { t } from '../../utils/i18n';
import { MAP_THEMES, BOSSES, FAMILY_MEMBERS } from '../../content/constants';
import { getCollectiblesBySector } from '../../content/collectibles';
import { en } from '../../locales/en';
import CampModalLayout from './CampModalLayout';
import { PlayerStats } from '../../types';

interface ScreenSectorOverviewProps {
    currentMap: number;
    familyMembersFound: number[];
    bossesDefeated: number[];
    debugMode: boolean;
    stats: PlayerStats;
    onSelectMap: (mapIndex: number) => void;
    onStartSector: () => void;
    onClose: () => void;
    isMobileDevice?: boolean;
}

const ScreenSectorOverview: React.FC<ScreenSectorOverviewProps> = ({ currentMap, familyMembersFound, bossesDefeated, debugMode, stats, onSelectMap, onStartSector, onClose, isMobileDevice }) => {
    const [selectedMapIndex, setSelectedMapIndex] = useState(currentMap);
    const [briefingText, setBriefingText] = useState("");

    const mapTheme = MAP_THEMES[selectedMapIndex];
    const boss = BOSSES[selectedMapIndex] || BOSSES[0];
    const isRescued = familyMembersFound.includes(selectedMapIndex);
    const isCleared = bossesDefeated.includes(selectedMapIndex);
    const isLocked = !debugMode && (selectedMapIndex > 0 && !bossesDefeated.includes(selectedMapIndex - 1));

    // -- Briefing Text Logic --
    const fullBriefingText = useMemo(() => {
        const mapName = t(mapTheme.name);
        const bossName = t(boss.name);

        if (isRescued) { // Using isRescued similar to "isExtracted" in old sector briefing
            return t('story.extracted_briefing', { map: mapName, boss: bossName });
        }

        switch (selectedMapIndex) {
            case 0: return t('story.prologue_text');
            case 1: return t('story.intel_bunker_text');
            case 2: return t('story.intel_mast_text');
            case 3: return t('story.intel_scrap_text');
            case 4: return t('story.epilogue_text');
            default: return t('story.generic_briefing', { map: mapName, boss: bossName });
        }
    }, [isRescued, selectedMapIndex, mapTheme, boss]);

    useEffect(() => {
        // Reset and type-write text when selection changes
        setBriefingText("");
        let i = 0;
        const speed = 5; // Faster typing
        const interval = setInterval(() => {
            setBriefingText(fullBriefingText.slice(0, i));
            i++;
            if (i > fullBriefingText.length) clearInterval(interval);
        }, speed);
        return () => clearInterval(interval);
    }, [fullBriefingText]);

    // -- Stats Calculation --
    const { collectibles, clues, pois } = useMemo(() => {
        const sectorNum = selectedMapIndex + 1;

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
    }, [selectedMapIndex, stats]);


    const handleSelect = (index: number) => {
        if ((!debugMode && (index > 0 && !bossesDefeated.includes(index - 1)))) return; // Locked
        setSelectedMapIndex(index);
        onSelectMap(index);
    };

    const handleDeploy = () => {
        onSelectMap(selectedMapIndex);
        onStartSector();
    };


    // -- Status Status --
    let statusText = t('ui.status') + ": " + t('ui.not_completed');
    let statusColorClass = "text-red-500 border-red-600 bg-red-900/20";
    if (isCleared && isRescued) {
        statusText = t('ui.status') + ": " + t('ui.sector_cleared');
        statusColorClass = "text-green-500 border-green-600 bg-green-900/20";
    } else if (isCleared) {
        statusText = t('ui.status') + ": " + t('ui.threat_neutralized');
        statusColorClass = "text-yellow-500 border-yellow-600 bg-yellow-900/20";
    } else if (isRescued) {
        statusText = t('ui.status') + ": " + t('ui.target_extracted');
        statusColorClass = "text-blue-500 border-blue-600 bg-blue-900/20";
    }

    return (
        <CampModalLayout
            title={t('stations.sectors')}
            borderColorClass="border-red-600"
            onClose={onClose}
            onConfirm={handleDeploy}
            confirmLabel={t('ui.deploy_sector')}
            canConfirm={!(!debugMode && (selectedMapIndex > 0 && !bossesDefeated.includes(selectedMapIndex - 1)))} // Lock logic
            isMobile={isMobileDevice}
        >
            <div className={`flex h-full gap-4 md:gap-8 ${isMobileDevice ? 'flex-col overflow-y-auto' : ''}`}>
                {/* LEFT: Sector List */}
                <div className={`${isMobileDevice ? 'w-full shrink-0 flex gap-2 overflow-x-auto pb-4 px-2' : 'w-1/3 flex flex-col gap-4 overflow-y-auto pr-2 pl-6'} custom-scrollbar`}>
                    {MAP_THEMES.map((map, i) => {
                        const isSel = selectedMapIndex === i;
                        // re-eval locked for list
                        const locked = !debugMode && (i > 0 && !bossesDefeated.includes(i - 1));

                        return (
                            <button
                                key={i}
                                onClick={() => handleSelect(i)}
                                disabled={locked}
                                className={`text-left p-4 md:p-6 border-l-4 transition-all group relative overflow-hidden shrink-0 whitespace-nowrap md:whitespace-normal
                                    ${locked ? 'opacity-50 cursor-not-allowed bg-black border-gray-800' : 'cursor-pointer hover:bg-red-900/10'}
                                    ${isSel ? 'bg-red-900/20 border-red-500' : 'border-gray-800'}
                                    ${isMobileDevice ? 'border-l-0 border-b-4 min-w-[150px]' : ''}
                                `}
                            >
                                <h3 className={`text-base md:text-xl font-black uppercase tracking-wider ${isSel ? 'text-white' : (locked ? 'text-gray-600' : 'text-gray-400')}`}>
                                    {locked ? `${t('ui.sector')} ${i + 1} - ${t('ui.locked')}` : t(map.name)}
                                </h3>
                            </button>
                        );
                    })}
                </div>

                {/* RIGHT: Detail View */}
                <div className={`flex-1 flex flex-col bg-black/40 border-2 border-gray-800 p-4 md:p-8 relative ${isMobileDevice ? 'min-h-[300px]' : ''}`}>
                    {/* Header */}
                    <div className="flex flex-col gap-4 mb-6 border-b border-gray-800 pb-4">
                        <div>
                            <h2 className="text-2xl md:text-4xl font-black uppercase tracking-tighter text-gray-400 mb-2">
                                {t(mapTheme.name)}
                            </h2>
                            {/* Stats Row */}
                            <div className="flex flex-wrap gap-2 md:gap-4 text-sm md:text-lg font-bold font-mono text-gray-400 mt-1">
                                <span>{t('ui.log_collectibles')}: <span className="text-white">{collectibles.found}/{collectibles.total || '?'}</span></span>
                                <span className={`${isMobileDevice ? 'hidden' : 'text-gray-600'}`}>|</span>
                                <span>{t('ui.log_clues')}: <span className="text-white">{clues.found}/{clues.total || '?'}</span></span>
                                <span className={`${isMobileDevice ? 'hidden' : 'text-gray-600'}`}>|</span>
                                <span>{t('ui.log_poi')}: <span className="text-white">{pois.found}/{pois.total || '?'}</span></span>
                            </div>
                        </div>

                        <div className="flex flex-col md:flex-row gap-2 md:gap-4 items-start">
                            {/* Sector Status Check */}
                            <div className={`px-4 py-1 md:py-2 text-xs md:text-sm font-black uppercase border tracking-wider ${statusColorClass} text-center md:min-w-[180px] whitespace-nowrap`}>
                                {statusText}
                            </div>

                            {/* Family Status Check */}
                            {selectedMapIndex < 4 && (
                                <div className={`px-4 py-1 md:py-2 text-xs md:text-sm font-black uppercase border tracking-wider text-center md:min-w-[180px] whitespace-nowrap
                                    ${isRescued ? 'text-green-500 border-green-600 bg-green-900/20' : 'text-red-500 border-red-600 bg-red-900/20'}
                                `}>
                                    {t('ui.family_member')}: {isRescued ? t(FAMILY_MEMBERS[selectedMapIndex]?.name || 'Unknown') : '???'}
                                    <span className="text-[10px] md:text-xs ml-1 md:ml-2 opacity-70">
                                        ({isRescued ? t('ui.rescued') : t('ui.missing')})
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Briefing Text */}
                    <div className="flex-1 bg-black overflow-y-auto mb-4 md:mb-6 shadow-inner font-mono text-sm md:text-xl leading-relaxed text-gray-300 whitespace-pre-wrap">
                        {briefingText}
                        <span className="animate-pulse inline-block w-2 h-4 bg-red-500 ml-1 align-middle"></span>
                    </div>

                    {/* Footer Actions Removed (Moved to Header) */}
                </div>
            </div>
        </CampModalLayout>
    );
};

export default ScreenSectorOverview;
