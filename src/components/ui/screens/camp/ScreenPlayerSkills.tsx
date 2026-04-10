import React, { useState } from 'react';
import { PlayerStats, PlayerStatID } from '../../../../entities/player/PlayerTypes';;
import { t } from '../../../../utils/i18n';
import { soundManager } from '../../../../utils/audio/SoundManager';
import ScreenModalLayout from '../../layout/ScreenModalLayout';
import { LEVEL_CAP, PLAYER_BASE_SPEED } from '../../../../content/constants';
import { useOrientation } from '../../hooks/useOrientation';

const SKILLS_CONFIG = [
    { statId: PlayerStatID.MAX_HP,      labelKey: 'skills.vitality',  descKey: 'skills.vitality_desc',  cost: 1, value: 20,  base: 100  },
    { statId: PlayerStatID.MAX_STAMINA, labelKey: 'skills.adrenaline', descKey: 'skills.adrenaline_desc', cost: 1, value: 20,  base: 100  },
    { statId: PlayerStatID.SPEED,       labelKey: 'skills.reflex',    descKey: 'skills.reflex_desc',   cost: 2, value: 0.5, base: PLAYER_BASE_SPEED }
];

interface ScreenPlayerSkillsProps {
    stats: PlayerStats;
    onSave: (newStats: PlayerStats) => void;
    onClose: () => void;
    isMobileDevice?: boolean;
}

const ScreenPlayerSkills: React.FC<ScreenPlayerSkillsProps> = ({ stats, onSave, onClose, isMobileDevice }) => {
    const { isLandscapeMode } = useOrientation();
    const [tempStats, setTempStats] = useState({ ...stats });

    const handleUpgradeSkill = (statId: PlayerStatID, cost: number, value: number) => {
        soundManager.playUiClick();
        const sp = tempStats.statsBuffer[PlayerStatID.SKILL_POINTS];
        if (sp >= cost) {
            const newBuffer = new Float32Array(tempStats.statsBuffer);
            newBuffer[PlayerStatID.SKILL_POINTS] -= cost;
            newBuffer[statId] += value;
            setTempStats({ ...tempStats, statsBuffer: newBuffer });
        }
    };

    const handleConfirm = () => {
        onSave(tempStats);
        onClose();
    };

    const xpNeeded = stats.statsBuffer[PlayerStatID.NEXT_LEVEL_XP] - stats.statsBuffer[PlayerStatID.CURRENT_XP];
    const isMaxRank = stats.statsBuffer[PlayerStatID.LEVEL] >= LEVEL_CAP;
    const hasChanges = tempStats.statsBuffer[PlayerStatID.SKILL_POINTS] !== stats.statsBuffer[PlayerStatID.SKILL_POINTS];

    return (
        <ScreenModalLayout
            title={t('stations.skills')}
            isMobileDevice={isMobileDevice}
            onClose={onClose}
            onConfirm={handleConfirm}
            confirmLabel={t('ui.confirm_upgrades')}
            closeLabel={hasChanges ? t('ui.cancel') : t('ui.close')}
            canConfirm={hasChanges}
            showCancel={true}
            titleColorClass="text-purple-600"
        >
            <div className={`grid ${(!isMobileDevice || isLandscapeMode) ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1'} gap-4 md:gap-8 h-full ${isMobileDevice ? 'overflow-y-auto content-center' : ''}`}>
                {/* Header Section */}
                <div className="col-span-full text-center mb-4 md:mb-8">
                    <span className="text-purple-500 font-bold uppercase tracking-widest text-xs md:text-sm block mb-1">{t('ui.available_skill_points')}</span>
                    <span className={`${isMobileDevice ? 'text-4xl' : 'text-6xl'} font-mono text-white leading-none font-bold`}>{tempStats.statsBuffer[PlayerStatID.SKILL_POINTS]}</span>
                    <div className="">
                        <span className="text-purple-300 font-bold text-sm uppercase tracking-wider block max-w-2xl mx-auto">
                            {isMaxRank
                                ? t('ui.sp_hint_max')
                                : t('ui.sp_hint_rankup', { xp: xpNeeded })}
                        </span>
                    </div>
                </div>
                {SKILLS_CONFIG.map(skill => {
                    const currentVal = tempStats.statsBuffer[skill.statId];
                    const cost = skill.cost;
                    const canAfford = tempStats.statsBuffer[PlayerStatID.SKILL_POINTS] >= cost;

                    const baseVal = skill.base;
                    const upgradeVal = currentVal - baseVal;

                    // Format for display
                    const isSpeed = skill.statId === PlayerStatID.SPEED;
                    const displayBase    = isSpeed ? baseVal.toFixed(1)    : baseVal;
                    const displayUpgrade = isSpeed ? upgradeVal.toFixed(2) : upgradeVal;

                    return (
                        <div key={skill.statId} className={`${isMobileDevice ? 'p-4' : 'p-8'} bg-gray-900/40 border-2 border-purple-900/50 flex flex-col items-center text-center hover:border-purple-600/50 transition-colors relative group`}>
                            <h3 className={`${isMobileDevice ? 'text-xl mb-1' : 'text-3xl mb-4'} font-semibold text-white uppercase tracking-tighter`}>{t(skill.labelKey)}</h3>
                            <p className={`${isMobileDevice ? 'text-xs h-10 mb-2 leading-tight' : 'text-lg h-16 mb-2'} text-gray-400 leading-snug`}>{t(skill.descKey)}</p>

                            <div className={`flex flex-col items-center justify-center gap-0 mt-0 mb-4`}>
                                <div className="flex items-baseline gap-1">
                                    <span className={`${isMobileDevice ? 'text-2xl' : 'text-5xl'} font-mono text-purple-500 font-bold leading-none`}>
                                        {isSpeed ? currentVal.toFixed(2) : currentVal}
                                    </span>
                                    {isSpeed && <span className={`${isMobileDevice ? 'text-[9px]' : 'text-sm'} font-bold text-purple-400 opacity-60 uppercase tracking-widest`}>{t('ui.speed_unit')}</span>}
                                    {skill.statId === PlayerStatID.MAX_HP      && <span className={`${isMobileDevice ? 'text-[9px]' : 'text-sm'} font-bold text-purple-400 opacity-60 uppercase tracking-widest`}>HP</span>}
                                    {skill.statId === PlayerStatID.MAX_STAMINA && <span className={`${isMobileDevice ? 'text-[9px]' : 'text-sm'} font-bold text-purple-400 opacity-60 uppercase tracking-widest`}>STM</span>}
                                </div>
                                <span className={`${isMobileDevice ? 'text-[9px]' : 'text-sm'} font-mono text-white font-bold opacity-80`}>
                                    ({displayBase} + <span className="text-purple-400">{displayUpgrade}</span>)
                                </span>
                            </div>

                            <button
                                onClick={() => handleUpgradeSkill(skill.statId, cost, skill.value)}
                                disabled={!canAfford}
                                className={`w-full ${isMobileDevice ? 'py-2' : 'py-4'} font-bold uppercase tracking-wider border-2 transition-all ${canAfford
                                    ? 'bg-purple-900/20 border-purple-500 text-purple-400 hover:bg-purple-900/40'
                                    : 'bg-black border-gray-800 text-gray-600 cursor-not-allowed'}`}
                            >
                                <span className={`${isMobileDevice ? 'text-xs' : 'text-base'} block`}>{t('ui.upgrade')} ({cost} SP)</span>
                            </button>
                        </div>
                    );
                })}
            </div>
        </ScreenModalLayout>
    );
};

export default ScreenPlayerSkills;