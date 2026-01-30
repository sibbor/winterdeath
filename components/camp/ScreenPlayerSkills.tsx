import React, { useState } from 'react';
import { PlayerStats } from '../../types';
import { t } from '../../utils/i18n';
import { soundManager } from '../../utils/sound';
import CampModalLayout from './CampModalLayout';
import { LEVEL_CAP } from '../../constants';

const SKILLS_CONFIG = [
  { id: 'maxHp', labelKey: 'skills.vitality', descKey: 'skills.vitality_desc', cost: 1, value: 20, base: 100 },
  { id: 'maxStamina', labelKey: 'skills.adrenaline', descKey: 'skills.adrenaline_desc', cost: 1, value: 20, base: 100 },
  { id: 'speed', labelKey: 'skills.reflex', descKey: 'skills.reflex_desc', cost: 2, value: 0.05, base: 1.0 }
];

interface ScreenPlayerSkillsProps {
    stats: PlayerStats;
    onSave: (newStats: PlayerStats) => void;
    onClose: () => void;
}

const ScreenPlayerSkills: React.FC<ScreenPlayerSkillsProps> = ({ stats, onSave, onClose }) => {
    const [tempStats, setTempStats] = useState({...stats});

    const handleUpgradeSkill = (skillId: string, cost: number, value: number) => {
        soundManager.playUiClick();
        if (tempStats.skillPoints >= cost) {
            const newVal = (tempStats as any)[skillId] + value;
            setTempStats({
                ...tempStats,
                skillPoints: tempStats.skillPoints - cost,
                [skillId]: newVal
            });
        }
    };

    const handleConfirm = () => {
        onSave(tempStats);
        onClose(); // Close the screen after confirming
    };

    const xpNeeded = stats.nextLevelXp - stats.currentXp;
    const isMaxRank = stats.level >= LEVEL_CAP;

    return (
        <CampModalLayout 
            title={t('stations.skills')} // PLAYER SKILLS
            borderColorClass="border-purple-600"
            onClose={onClose}
            onConfirm={handleConfirm}
            confirmLabel={t('ui.confirm_upgrades')}
            canConfirm={tempStats.skillPoints !== stats.skillPoints}
        >
             <div className="grid grid-cols-1 md:grid-cols-3 gap-8 h-full content-center">
                {/* Header Section */}
                <div className="col-span-full text-center mb-4 mt-4">
                    <span className="text-purple-500 font-bold uppercase tracking-widest text-sm block mb-1">{t('ui.available_skill_points')}</span>
                    <span className="text-6xl font-black text-white leading-none">{tempStats.skillPoints}</span>
                    <div className="mt-4">
                        <span className="text-purple-300 font-bold text-sm uppercase tracking-wider block max-w-2xl mx-auto">
                            {isMaxRank 
                                ? t('ui.sp_hint_max') 
                                : t('ui.sp_hint_rankup', { xp: xpNeeded })}
                        </span>
                    </div>
                </div>
                {SKILLS_CONFIG.map(skill => {
                    const currentVal = (tempStats as any)[skill.id];
                    const cost = skill.cost;
                    const canAfford = tempStats.skillPoints >= cost;
                    
                    const baseVal = skill.base;
                    const upgradeVal = currentVal - baseVal;
                    
                    // Format for display
                    const displayBase = skill.id === 'speed' ? baseVal.toFixed(1) : baseVal;
                    const displayUpgrade = skill.id === 'speed' ? upgradeVal.toFixed(2) : upgradeVal;

                    return (
                        <div key={skill.id} className="bg-gray-900/40 border-2 border-purple-900/50 p-8 flex flex-col items-center text-center hover:border-purple-600/50 transition-colors relative group">
                            <h3 className="text-3xl font-black text-white uppercase tracking-tighter mb-4">{t(skill.labelKey)}</h3>
                            {/* Reduced mb-6 to mb-2 */}
                            <p className="text-gray-400 text-lg leading-snug mb-2 h-16">{t(skill.descKey)}</p>
                            
                            <div className="flex items-baseline justify-center gap-2 mb-8">
                                <span className="text-5xl font-mono text-white font-bold">{displayBase}</span>
                                <span className="text-3xl font-mono text-purple-400 font-bold">+ {displayUpgrade}</span>
                            </div>
                            
                            <button 
                                onClick={() => handleUpgradeSkill(skill.id, cost, skill.value)}
                                disabled={!canAfford}
                                className={`w-full py-4 font-black uppercase tracking-wider border-2 transition-all ${canAfford ? 'bg-purple-900/20 border-purple-500 text-purple-400 hover:bg-purple-900/40' : 'bg-transparent border-gray-800 text-gray-700 cursor-not-allowed'}`}
                            >
                                {t('ui.upgrade')} ({cost} SP)
                            </button>
                        </div>
                    );
                })}
            </div>
        </CampModalLayout>
    );
};

export default ScreenPlayerSkills;