
import React, { useState } from 'react';
import { t } from '../../utils/i18n';
import { MAP_THEMES } from '../../content/constants';
import CampModalLayout from './CampModalLayout';

interface ScreenSectorOverviewProps {
    currentMap: number;
    familyMembersFound: number[];
    bossesDefeated: number[];
    debugMode: boolean;
    onSelectMap: (mapIndex: number) => void;
    onClose: () => void;
}

const ScreenSectorOverview: React.FC<ScreenSectorOverviewProps> = ({ currentMap, familyMembersFound, bossesDefeated, debugMode, onSelectMap, onClose }) => {
    const [selectedMapIndex, setSelectedMapIndex] = useState(currentMap);

    const handleConfirm = () => {
        onSelectMap(selectedMapIndex);
    };

    return (
        <CampModalLayout
            title={t('stations.missions')}
            borderColorClass="border-green-600"
            onClose={onClose}
            onConfirm={handleConfirm}
            confirmLabel={t('ui.play_sector')}
        >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {MAP_THEMES.map((map, i) => {
                    const isSelected = selectedMapIndex === i;
                    const isRescued = familyMembersFound.includes(i);
                    const isCleared = bossesDefeated.includes(i);
                    const isLocked = !debugMode && (i > 0 && !bossesDefeated.includes(i - 1));

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

                    const familyStatusText = isRescued ? t('ui.found') : t('ui.missing');
                    const familyBoxColor = !isRescued
                        ? "text-red-500 border-red-600 bg-red-900/20"
                        : "text-green-500 border-green-600 bg-green-900/20";

                    return (
                        <div key={i} onClick={() => !isLocked && setSelectedMapIndex(i)}
                            className={`relative p-8 border-4 transition-all skew-x-[-5deg] group overflow-hidden ${isLocked ? 'border-gray-900 bg-gray-950 opacity-60 cursor-not-allowed' : 'cursor-pointer hover:border-gray-600'} ${isSelected && !isLocked ? 'border-green-500 bg-green-900/20' : (!isLocked ? 'border-gray-800 bg-gray-900/40' : '')}`}>

                            {isSelected && !isLocked && <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-green-500 to-transparent opacity-50"></div>}

                            {isLocked && (
                                <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/60">
                                    <div className="skew-x-[5deg] border-2 border-red-900 bg-black/80 px-6 py-3 text-red-700 font-black uppercase tracking-widest text-xl flex items-center gap-3">
                                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" /></svg>
                                        {t('ui.locked')}
                                    </div>
                                </div>
                            )}

                            <div className="skew-x-[5deg] relative z-10">
                                <div className="flex justify-between items-start mb-4">
                                    <h3 className={`text-3xl font-black uppercase ${isLocked ? 'text-gray-700' : (isSelected ? 'text-green-400' : 'text-white')}`}>{isLocked ? `${t('ui.sector')} ${i + 1}` : t(map.name)}</h3>
                                </div>

                                <p className={`font-mono text-sm mb-6 leading-relaxed border-l-2 pl-4 ${isLocked ? 'text-gray-800 border-gray-800' : 'text-slate-400 border-gray-700'}`}>
                                    {isLocked ? t('ui.complete_prev') : t(map.description)}
                                </p>

                                {!isLocked && (
                                    <div className="flex flex-row flex-wrap gap-2">
                                        <div className={`px-2 py-1 text-[10px] font-bold uppercase border tracking-wider ${statusColorClass}`}>
                                            {statusText}
                                        </div>
                                        <div className={`px-2 py-1 text-[10px] font-bold uppercase border tracking-wider ${familyBoxColor}`}>
                                            {t('ui.unknown_family')} - {familyStatusText}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </CampModalLayout>
    );
};

export default ScreenSectorOverview;
