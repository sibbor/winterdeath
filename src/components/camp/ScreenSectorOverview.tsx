import React, { useState, useEffect, useMemo } from 'react';
import { t } from '../../utils/i18n';
import { MAP_THEMES, BOSSES, FAMILY_MEMBERS } from '../../content/constants';
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
    onStartMission: () => void;
    onClose: () => void;
}

const ScreenSectorOverview: React.FC<ScreenSectorOverviewProps> = ({ currentMap, familyMembersFound, bossesDefeated, debugMode, stats, onSelectMap, onStartMission, onClose }) => {
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

        if (isRescued) { // Using isRescued similar to "isExtracted" in old briefing
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
        // This is a rough estimation based on naming conventions in en.ts
        // In a real scenario, we'd have a structured list of all IDs per sector.
        // We'll scan en.clues keys.
        const sectorPrefix = `s${selectedMapIndex + 1}_`;

        const allKeys = Object.keys(en.clues);
        const sectorKeys = allKeys.filter(k => k.startsWith(sectorPrefix));

        const collectibleKeys = sectorKeys.filter(k => k.includes('collectible') && !k.endsWith('_description') && !k.endsWith('_icon'));
        const clueKeys = sectorKeys.filter(k => !k.includes('collectible') && !k.includes('poi')); // "Tracks", "Blood", etc are narrative clues
        const poiKeys = sectorKeys.filter(k => k.includes('poi'));

        // Count found
        const foundCollectibles = (stats.cluesFound || []).filter(id => collectibleKeys.includes(id)).length;
        const foundClues = (stats.cluesFound || []).filter(id => clueKeys.includes(id)).length;
        const foundPois = (stats.visitedPOIs || []).filter(id => poiKeys.includes(id)).length;

        return {
            collectibles: { found: foundCollectibles, total: collectibleKeys.length || 0 }, // Fallback if 0 keys (e.g. S3/4 might be empty in en.ts)
            clues: { found: foundClues, total: clueKeys.length || 0 },
            pois: { found: foundPois, total: poiKeys.length || 0 }
        };
    }, [selectedMapIndex, stats]);


    const handleSelect = (index: number) => {
        if ((!debugMode && (index > 0 && !bossesDefeated.includes(index - 1)))) return; // Locked
        setSelectedMapIndex(index);
        onSelectMap(index);
    };

    const handleDeploy = () => {
        onSelectMap(selectedMapIndex);
        onStartMission();
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
            title={t('stations.missions')}
            borderColorClass="border-red-600"
            onClose={onClose}
            onConfirm={handleDeploy}
            confirmLabel={t('ui.deploy_sector')}
            canConfirm={!(!debugMode && (selectedMapIndex > 0 && !bossesDefeated.includes(selectedMapIndex - 1)))} // Lock logic
        >
            <div className="flex h-full gap-8">
                {/* LEFT: Sector List */}
                <div className="w-1/3 flex flex-col gap-4 overflow-y-auto pr-2 custom-scrollbar">
                    {MAP_THEMES.map((map, i) => {
                        const isSel = selectedMapIndex === i;
                        // re-eval locked for list
                        const locked = !debugMode && (i > 0 && !bossesDefeated.includes(i - 1));

                        return (
                            <button
                                key={i}
                                onClick={() => handleSelect(i)}
                                disabled={locked}
                                className={`text-left p-6 border-l-4 transition-all group relative overflow-hidden shrink-0
                                    ${locked ? 'opacity-50 cursor-not-allowed bg-black border-gray-800' : 'cursor-pointer hover:bg-red-900/10'}
                                    ${isSel ? 'bg-red-900/20 border-red-500' : 'border-gray-800'}
                                `}
                            >
                                <h3 className={`text-xl font-black uppercase tracking-wider ${isSel ? 'text-red-400' : (locked ? 'text-gray-600' : 'text-gray-400')}`}>
                                    {locked ? `${t('ui.sector')} ${i + 1} - ${t('ui.locked')}` : t(map.name)}
                                </h3>
                                {/* No description as requested */}
                                {isSel && <div className="absolute right-0 top-0 bottom-0 w-2 bg-red-500"></div>}
                            </button>
                        );
                    })}
                </div>

                {/* RIGHT: Detail View */}
                <div className="flex-1 flex flex-col bg-black/40 border-2 border-red-900/50 p-8 relative">
                    {/* Header */}
                    <div className="flex flex-col gap-4 mb-6 border-b border-gray-800 pb-4">
                        <div>
                            <h2 className="text-4xl font-black uppercase tracking-tighter text-gray-400 mb-2">
                                {t(mapTheme.name)}
                            </h2>
                            {/* Stats Row */}
                            <div className="flex gap-4 text-sm font-bold font-mono text-gray-400 mt-1">
                                <span>{t('ui.log_collectibles')}: <span className="text-white">{collectibles.found}/{collectibles.total || '?'}</span></span>
                                <span className="text-gray-600">|</span>
                                <span>{t('ui.log_clues')}: <span className="text-white">{clues.found}/{clues.total || '?'}</span></span>
                                <span className="text-gray-600">|</span>
                                <span>{t('ui.log_poi')}: <span className="text-white">{pois.found}/{pois.total || '?'}</span></span>
                            </div>
                        </div>

                        <div className="flex gap-4 items-start">
                            {/* Mission Status Check */}
                            <div className={`px-4 py-2 text-sm font-black uppercase border tracking-wider ${statusColorClass} text-center min-w-[180px] whitespace-nowrap`}>
                                {statusText}
                            </div>

                            {/* Family Status Check */}
                            {selectedMapIndex < 4 && (
                                <div className={`px-4 py-2 text-sm font-black uppercase border tracking-wider text-center min-w-[180px] whitespace-nowrap
                                    ${isRescued ? 'text-green-500 border-green-600 bg-green-900/20' : 'text-red-500 border-red-600 bg-red-900/20'}
                                `}>
                                    {t('ui.family_member')}: {isRescued ? t(FAMILY_MEMBERS[selectedMapIndex]?.name || 'Unknown') : '???'}
                                    <span className="text-xs ml-2 opacity-70">
                                        ({isRescued ? t('ui.rescued') : t('ui.missing')})
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Briefing Text */}
                    <div className="flex-1 bg-gray-950/50 p-6 border border-gray-600 overflow-y-auto mb-6 shadow-inner font-mono text-base leading-relaxed text-gray-300">
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
