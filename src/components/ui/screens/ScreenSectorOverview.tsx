import React, { useState, useEffect, useMemo, useRef } from 'react';
import { t } from '../../../utils/i18n';
import { useOrientation } from '../../../hooks/useOrientation';
import ModalLayout, { TacticalCard, TacticalTab } from './ModalLayout';
import { PlayerStats } from '../../../entities/player/PlayerTypes';
import { UiSounds } from '../../../utils/audio/AudioLib';
import { DataResolver } from '../../../core/data/DataResolver';
import { COLORS } from '../../../utils/ui/ColorUtils';
import { SectorID } from '../../../game/session/SectorTypes';
import { StatsBridge } from '../../../core/data/StatsBridge';
import { PoiID } from '../../../content/pois';

// Zero-GC: Sector index array built once at module level, not per render
const SECTOR_INDICES: number[] = DataResolver.getSectorThemes().map((_, i) => i);

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

    const boss = DataResolver.getBosses()[selectedSectorIndex];
    const isRescued = rescuedFamilyIndices.includes(selectedSectorIndex);
    const isCleared = deadBossIndices.includes(selectedSectorIndex);

    // -- Briefing Text Logic --
    const briefingData = useMemo(() => {
        const sectorName = t(DataResolver.getSectorName(selectedSectorIndex));
        const sectorBriefing = t(DataResolver.getSectorDescription(selectedSectorIndex));
        const bossName = boss ? t(DataResolver.getBossName(selectedSectorIndex)) : '';

        return { map: sectorName, boss: bossName, briefing: sectorBriefing };
    }, [selectedSectorIndex, boss]);

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

    // -- Stats Calculation -- Zero-GC: for-loops replacing Object.values+filter chains
    const { collectibles, clues, pois } = useMemo(() => {
        const foundCollectiblesSet = new Set<number>(StatsBridge.getDiscoveredCollectibles(stats).map(Number));
        const foundCluesRaw = StatsBridge.getDiscoveredClues(stats);
        const foundCluesSet = new Set<string>(foundCluesRaw.map((c: any) => String(typeof c === 'string' ? c : c.id)));
        const foundPoisSet = new Set<number>(StatsBridge.getDiscoveredPois(stats).map(Number));

        const allCollectibles = DataResolver.getCollectibles();
        let collTotal = 0;
        let collFound = 0;
        for (const key in allCollectibles) {
            const c = allCollectibles[key];
            if (c.sector === selectedSectorIndex) {
                collTotal++;
                if (foundCollectiblesSet.has(c.id)) collFound++;
            }
        }

        const allClues = DataResolver.getClues();
        let clueTotal = 0;
        let clueFound = 0;
        for (const key in allClues) {
            const c = allClues[key];
            if (c.sector === selectedSectorIndex) {
                clueTotal++;
                if (foundCluesSet.has(String(c.id))) clueFound++;
            }
        }

        const allPois = DataResolver.getPois();
        let poiTotal = 0;
        let poiFound = 0;
        for (const key in allPois) {
            const p = allPois[key];
            if (p.sector === selectedSectorIndex) {
                poiTotal++;
                if (foundPoisSet.has(p.id as number)) poiFound++;
            }
        }

        return {
            collectibles: { found: collFound, total: collTotal },
            clues: { found: clueFound, total: clueTotal },
            pois: { found: poiFound, total: poiTotal }
        };
    }, [selectedSectorIndex, stats]);


    const handleSelect = (index: number) => {
        if (!debugMode && (index > SectorID.VILLAGE && index !== SectorID.PLAYGROUND && !deadBossIndices.includes(index - 1))) return;
        UiSounds.playClick();
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
        <ModalLayout
            title={t('stations.sectors')}
            isMobileDevice={isMobileDevice}
            onClose={onClose}
            onConfirm={handleDeploy}
            confirmLabel={t('ui.deploy_sector')}
            canConfirm={!(!debugMode && (selectedSectorIndex > SectorID.VILLAGE && selectedSectorIndex !== SectorID.PLAYGROUND && !deadBossIndices.includes(selectedSectorIndex - 1)))}
            showCancel={true}
            titleColorClass="text-red-600"
            tabs={SECTOR_INDICES}
            activeTab={selectedSectorIndex}
            onTabChange={handleSelect}
            tabOrientation={effectiveLandscape ? 'vertical' : 'horizontal'}
        >
            <div className={`flex h-full gap-4 md:gap-8 ${effectiveLandscape ? 'flex-row' : 'flex-col overflow-y-auto touch-auto'}`}>
                {/* LEFT: Sector List */}
                <div className={`${effectiveLandscape ? 'w-1/3 flex flex-col gap-4 overflow-y-auto pl-safe custom-scrollbar' : 'w-full shrink-0 relative'}`}>
                    <div className={`${!effectiveLandscape ? 'flex flex-nowrap gap-2 overflow-x-auto pb-4 px-10 snap-x snap-mandatory pt-2 scrollbar-hide touch-auto cursor-pointer' : 'flex flex-col gap-4 pt-4 pr-10'}`}>
                        {SECTOR_INDICES.map((i) => {
                            const locked = !debugMode && (i > SectorID.VILLAGE && i !== SectorID.PLAYGROUND && !deadBossIndices.includes(i - 1));
                            return (
                                <TacticalTab
                                    key={i}
                                    label={
                                        <div className="flex flex-col items-start leading-none gap-1 py-1">
                                            <span className="text-[10px] text-zinc-500 font-black uppercase tracking-[0.25em]">
                                                {t('ui.sector')} {String(i).padStart(3, '0')}
                                            </span>
                                            <span className={`${isMobileDevice ? 'text-sm' : 'text-xl'} font-mono font-bold text-zinc-400 uppercase tracking-tighter`}>
                                                {locked ? '???' : t(DataResolver.getSectorName(i))}
                                            </span>
                                        </div>
                                    }
                                    isActive={selectedSectorIndex === i}
                                    onClick={() => handleSelect(i)}
                                    color={COLORS.RED}
                                    orientation={effectiveLandscape ? 'vertical' : 'horizontal'}
                                    className={locked ? 'opacity-50 cursor-not-allowed' : ''}
                                />
                            );
                        })}
                    </div>
                </div>

                {/* RIGHT: Detail View */}
                <TacticalCard color={COLORS.RED} className={`flex-1 flex flex-col p-4 md:p-8 relative pr-safe ${!effectiveLandscape ? 'min-h-[300px]' : ''}`}>
                    {/* Header */}
                    <div className="flex flex-col gap-4 mb-6 border-b border-gray-800 pb-4">
                        <div>
                            <h2 className={`${isMobileDevice ? 'text-xl' : 'text-5xl'} font-light uppercase tracking-tighter text-white mb-2`}>
                                {t(DataResolver.getSectorName(selectedSectorIndex))}
                            </h2>
                            {/* Stats Row */}
                            {(collectibles.total > 0 || clues.total > 0 || pois.total > 0) && (
                                <div className={`flex flex-wrap gap-2 md:gap-4 ${isMobileDevice ? 'text-xs' : 'text-lg'} font-bold font-mono text-gray-400 mt-1`}>
                                    {collectibles.total > 0 && <span>{t('ui.log_collectibles')}: <span className="text-white">{collectibles.found}/{collectibles.total}</span></span>}
                                    {clues.total > 0 && (
                                        <>
                                            <span className={`${isMobileDevice ? 'hidden' : 'text-gray-600'}`}>|</span>
                                            <span>{t('ui.log_clues')}: <span className="text-white">{clues.found}/{clues.total}</span></span>
                                        </>
                                    )}
                                    {pois.total > 0 && (
                                        <>
                                            <span className={`${isMobileDevice ? 'hidden' : 'text-gray-600'}`}>|</span>
                                            <span>{t('ui.log_poi')}: <span className="text-white">{pois.found}/{pois.total}</span></span>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Boss & Family Status Check */}
                        {boss && (
                            <div className="grid grid-cols-2 md:flex-row gap-2 md:gap-4 items-start">
                                <div className={`${isMobileDevice ? 'px-2 py-1 text-[10px]' : 'px-4 py-2 text-sm'} font-bold uppercase border tracking-wider text-center md:min-w-[180px] whitespace-nowrap ${bossStatusColor}`}>
                                    {t('ui.boss_status')}: {t(bossStatusKey)}
                                </div>

                                {DataResolver.getSectorFamilyMemberId(selectedSectorIndex) !== undefined && (
                                    <div className={`${isMobileDevice ? 'px-2 py-1 text-[10px]' : 'px-4 py-2 text-sm'} font-bold uppercase border tracking-wider text-center md:min-w-[180px] whitespace-nowrap ${familyStatusColor}`}>
                                        {t('ui.family_member')}: {isRescued
                                            ? t(DataResolver.getFamilyMemberName(DataResolver.getSectorFamilyMemberId(selectedSectorIndex)!))
                                            : t(familyStatusKey)}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Briefing Text */}
                    <div className={`flex-1 bg-black p-4 mb-4 md:mb-6 shadow-inner font-mono text-sm md:text-xl leading-relaxed text-gray-300 whitespace-pre-wrap ${!effectiveLandscape ? 'min-h-[150px]' : 'overflow-y-auto'}`}>
                        <span ref={textRef}></span>
                        <span className="animate-pulse inline-block w-2 h-4 bg-red-500 ml-1 align-middle"></span>
                    </div>
                </TacticalCard>
            </div>
        </ModalLayout>
    );
};

export default ScreenSectorOverview;

