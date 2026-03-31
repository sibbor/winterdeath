import React, { useState, useEffect, useMemo, useRef } from 'react';
import { t } from '../../../../utils/i18n';
import { BOSSES, FAMILY_MEMBERS } from '../../../../content/constants';
import { SECTOR_THEMES } from '../../../../content/sectors/sector_themes';
import { getCollectiblesBySector } from '../../../../content/collectibles';
import { CLUES } from '../../../../content/clues';
import { POIS } from '../../../../content/pois';
import { useOrientation } from '../../../../hooks/useOrientation';
import ScreenModalLayout from '../../layout/ScreenModalLayout';
import { PlayerStats } from '../../../../entities/player/PlayerTypes';
import { soundManager } from '../../../../utils/audio/SoundManager';

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
    const { isLandscapeMode } = useOrientation();
    const effectiveLandscape = isLandscapeMode || !isMobileDevice;
    const [selectedSectorIndex, setSelectedSectorIndex] = useState(currentSector);
    const textRef = useRef<HTMLSpanElement>(null);

    const sectorTheme = SECTOR_THEMES[selectedSectorIndex];
    const boss = BOSSES[selectedSectorIndex];
    const isRescued = rescuedFamilyIndices.includes(selectedSectorIndex);
    const isCleared = deadBossIndices.includes(selectedSectorIndex);

    // -- Briefing Text Logic --
    const briefingData = useMemo(() => {
        const sectorName = t(sectorTheme.name);
        const sectorBriefing = t(sectorTheme.briefing);
        const bossName = t(boss.name);

        return { map: sectorName, boss: bossName, briefing: sectorBriefing };
    }, [selectedSectorIndex, sectorTheme, boss]);

    useEffect(() => {
        // Reset and type-write text directly to the DOM for Zero-GC
        if (textRef.current) textRef.current.innerText = "";
        let i = 0;
        const speed = 5; // Faster typing
        const briefingTextStr = briefingData.briefing;

        const interval = setInterval(() => {
            if (textRef.current) {
                textRef.current.innerText = briefingTextStr.slice(0, i);
            }
            i++;
            if (i > briefingTextStr.length) clearInterval(interval);
        }, speed);
        return () => clearInterval(interval);
    }, [briefingData]);

    // -- Stats Calculation --
    const { collectibles, clues, pois } = useMemo(() => {
        // Accurate Collectible Count
        const sectorCollectibles = getCollectiblesBySector(selectedSectorIndex);
        const foundCollectiblesCount = (stats.collectiblesDiscovered || []).filter(id =>
            sectorCollectibles.some(c => c.id === id)
        ).length;

        // Accurate Clue Count (using CLUES constant)
        const sectorClueIds = Object.values(CLUES)
            .filter(c => c.sector === selectedSectorIndex)
            .map(c => c.id);
        const foundCluesCount = (stats.cluesFound || []).filter(clueObj => {
            const id = typeof clueObj === 'string' ? clueObj : (clueObj as any).id;
            return sectorClueIds.includes(id);
        }).length;

        // Accurate POI Count (using POIS constant)
        const sectorPoiIds = Object.values(POIS)
            .filter(p => p.sector === selectedSectorIndex)
            .map(p => p.id);
        const foundPoisCount = (stats.discoveredPOIs || []).filter(id => sectorPoiIds.includes(id)).length;

        return {
            collectibles: { found: foundCollectiblesCount, total: sectorCollectibles.length },
            clues: { found: foundCluesCount, total: sectorClueIds.length },
            pois: { found: foundPoisCount, total: sectorPoiIds.length }
        };
    }, [selectedSectorIndex, stats]);


    const handleSelect = (index: number) => {
        if ((!debugMode && (index >= 0 && !deadBossIndices.includes(index)))) return;
        soundManager.playUiClick();
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
            title={t('stations.sectors')}
            isMobileDevice={isMobileDevice}
            onClose={onClose}
            onConfirm={handleDeploy}
            confirmLabel={t('ui.deploy_sector')}
            canConfirm={!(!debugMode && (selectedSectorIndex > 0 && !deadBossIndices.includes(selectedSectorIndex - 1)))}
            showCancel={true}
            titleColorClass="text-red-600"
            tabs={SECTOR_THEMES.map((_, i) => i)}
            activeTab={selectedSectorIndex}
            onTabChange={handleSelect}
            tabOrientation={effectiveLandscape ? 'vertical' : 'horizontal'}
        >
            <div className={`flex h-full gap-4 md:gap-8 ${effectiveLandscape ? 'flex-row' : 'flex-col overflow-y-auto touch-auto'}`}>
                {/* LEFT: Sector List */}
                <div className={`${effectiveLandscape ? 'w-1/3 flex flex-col gap-4 overflow-y-auto pl-safe custom-scrollbar' : 'w-full shrink-0 relative'}`}>
                    <div className={`${!effectiveLandscape ? 'flex gap-2 overflow-x-auto pb-4 px-10 snap-x snap-mandatory pt-2 scrollbar-hide' : 'flex flex-col gap-4 pt-4 pr-10'}`}>
                        {SECTOR_THEMES.map((map, i) => {
                            const isSel = selectedSectorIndex === i;
                            const locked = !debugMode && (i > 0 && !deadBossIndices.includes(i - 1));
                            const pulseColor = '#ef4444';

                            return (
                                <button
                                    key={i}
                                    onClick={() => handleSelect(i)}
                                    disabled={locked}
                                    className={`
                                        text-left p-4 md:p-6 group relative shrink-0 
                                        whitespace-nowrap md:whitespace-normal snap-center 
                                        flex flex-col justify-center items-start 
                                        border-2 border-zinc-700 transition-all duration-200
                                        ${locked ? 'opacity-50 cursor-not-allowed bg-black text-zinc-600' : 'cursor-pointer hover:bg-zinc-900 hover:scale-[1.02] active:scale-95'}
                                        ${isSel && !locked ? 'text-white animate-tab-pulsate' : (locked ? '' : 'bg-black text-zinc-400')}
                                        ${!effectiveLandscape ? 'min-w-[120px] py-3 px-4' : 'mx-2'}
    `}
                                    style={isSel && !locked ? {
                                        backgroundColor: darkenColor(pulseColor, 20),
                                        '--pulse-color': pulseColor
                                    } as any : {}}
                                >
                                    {/* Sector Number (placed above name) */}
                                    <h2 className={`${isMobileDevice ? 'text-[8px]' : 'text-xs'} font-light uppercase tracking-tighter opacity-80 mb-1`}>
                                        {t('ui.sector')} 00{i}
                                    </h2>

                                    {/* Sector Name */}
                                    <h3 className={`${isMobileDevice ? 'text-[10px]' : 'text-xl'} font-semibold uppercase tracking-wider`}>
                                        {locked ? '???' : t(map.name)}
                                    </h3>

                                    {/* Selection Indicator Arrow */}
                                    {isSel && !locked && effectiveLandscape && (
                                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white font-bold">
                                            →
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* RIGHT: Detail View */}
                <div className={`flex-1 flex flex-col bg-black/40 border-2 border-gray-800 p-4 md:p-8 relative pr-safe ${!effectiveLandscape ? 'min-h-[300px]' : ''}`}>
                    {/* Header */}
                    <div className="flex flex-col gap-4 mb-6 border-b border-gray-800 pb-4">
                        <div>
                            <h2 className={`${isMobileDevice ? 'text-xl' : 'text-5xl'} font-light uppercase tracking-tighter text-white mb-2`}>
                                {t(sectorTheme.name)}
                            </h2>
                            {/* Stats Row */}
                            <div className={`flex flex-wrap gap-2 md:gap-4 ${isMobileDevice ? 'text-xs' : 'text-lg'} font-bold font-mono text-gray-400 mt-1`}>
                                <span>{t('ui.log_collectibles')}: <span className="text-white">{collectibles.found}/{collectibles.total}</span></span>
                                <span className={`${isMobileDevice ? 'hidden' : 'text-gray-600'}`}>|</span>
                                <span>{t('ui.log_clues')}: <span className="text-white">{clues.found}/{clues.total}</span></span>
                                <span className={`${isMobileDevice ? 'hidden' : 'text-gray-600'}`}>|</span>
                                <span>{t('ui.log_poi')}: <span className="text-white">{pois.found}/{pois.total}</span></span>
                            </div>
                        </div>

                        {/* Boss & Family Status Check */}
                        {selectedSectorIndex < 4 && (
                            <div className="grid grid-cols-2 md:flex-row gap-2 md:gap-4 items-start">

                                <div className={`${isMobileDevice ? 'px-2 py-1 text-[10px]' : 'px-4 py-2 text-sm'} font-bold uppercase border tracking-wider text-center md:min-w-[180px] whitespace-nowrap ${bossStatusColor}`}>
                                    {t('ui.boss_status')}: {t(bossStatusKey)}
                                </div>

                                <div className={`${isMobileDevice ? 'px-2 py-1 text-[10px]' : 'px-4 py-2 text-sm'} font-bold uppercase border tracking-wider text-center md:min-w-[180px] whitespace-nowrap ${familyStatusColor}`}>
                                    {t('ui.family_member')}: {isRescued
                                        ? t(FAMILY_MEMBERS[selectedSectorIndex]?.name)
                                        : t(familyStatusKey)}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Briefing Text */}
                    <div className={`flex-1 bg-black p-4 mb-4 md:mb-6 shadow-inner font-mono text-sm md:text-xl leading-relaxed text-gray-300 whitespace-pre-wrap ${!effectiveLandscape ? 'min-h-[150px]' : 'overflow-y-auto'}`}>
                        <span ref={textRef}></span>
                        <span className="animate-pulse inline-block w-2 h-4 bg-red-500 ml-1 align-middle"></span>
                    </div>
                </div>
            </div>
        </ScreenModalLayout>
    );
};

export default ScreenSectorOverview;
