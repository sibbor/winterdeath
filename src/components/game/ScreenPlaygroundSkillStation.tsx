import React, { useState } from 'react';
import { PlayerStats, SectorState } from '../../types';
import { t } from '../../utils/i18n';
import { soundManager } from '../../utils/sound';
import GameModalLayout from './GameModalLayout';

const SKILLS_CONFIG = [
    { id: 'maxHp', labelKey: 'skills.vitality', descKey: 'skills.vitality_desc', value: 20 },
    { id: 'maxStamina', labelKey: 'skills.adrenaline', descKey: 'skills.adrenaline_desc', value: 20 },
    { id: 'speed', labelKey: 'skills.reflex', descKey: 'skills.reflex_desc', value: 0.1 }
];

interface ScreenPlaygroundSkillStationProps {
    stats: PlayerStats;
    sectorState: SectorState;
    onSave: (newStats: PlayerStats, newSectorState: SectorState) => void;
    onClose: () => void;
    isMobileDevice?: boolean;
}

const ScreenPlaygroundSkillStation: React.FC<ScreenPlaygroundSkillStationProps> = ({ stats, sectorState, onSave, onClose, isMobileDevice }) => {
    const [tempStats, setTempStats] = useState({ ...stats });
    const [tempSectorState, setTempSectorState] = useState({ ...sectorState });

    const handleUpgradeSkill = (skillId: string, value: number) => {
        soundManager.playUiClick();
        const newVal = (tempStats as any)[skillId] + value;
        setTempStats({
            ...tempStats,
            [skillId]: newVal
        });
    };

    const handleConfirm = () => {
        onSave(tempStats, tempSectorState);
        onClose();
    };

    return (
        <GameModalLayout
            title={t('stations.skills')}
            titleColorClass="text-green-500"
            onClose={onClose}
            onConfirm={handleConfirm}
            isMobile={isMobileDevice}
            maxWidthClass="max-w-4xl"
        >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 pb-8">
                {/* Stats Section */}
                <div className="space-y-4">
                    <h3 className="text-2xl font-black uppercase text-green-700 mb-4 tracking-tighter italic border-b-2 border-green-900 pb-2">
                        {t('ui.stat_calibration')}
                    </h3>
                    <div className="grid grid-cols-1 gap-3">
                        {SKILLS_CONFIG.map(skill => {
                            const val = (tempStats as any)[skill.id];
                            const displayVal = skill.id === 'speed' ? val.toFixed(2) : Math.round(val);

                            return (
                                <div key={skill.id} className="bg-gray-900/40 border border-green-900/30 p-4 flex justify-between items-center group hover:bg-green-900/10 transition-colors">
                                    <div className="flex-1">
                                        <div className="text-white font-bold uppercase text-sm tracking-wider">{t(skill.labelKey)}</div>
                                        <div className="text-gray-500 text-xs">{t(skill.descKey)}</div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="text-2xl font-mono font-black text-green-400">{displayVal}</div>
                                        <button
                                            onClick={() => handleUpgradeSkill(skill.id, skill.value)}
                                            className="bg-green-600 hover:bg-green-500 text-black font-black w-8 h-8 flex items-center justify-center transition-transform active:scale-90"
                                        >
                                            +
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Cheats / Temporary Effects Section */}
                <div className="space-y-4">
                    <h3 className="text-2xl font-black uppercase text-blue-500 mb-4 tracking-tighter italic border-b-2 border-blue-900 pb-2">
                        {t('ui.temporary_modifiers')}
                    </h3>
                    <div className="space-y-3">
                        {/* Invincibility */}
                        <div
                            className={`p-4 border select-none cursor-pointer transition-all ${tempSectorState.isInvincible ? 'bg-blue-900/30 border-blue-500' : 'bg-gray-900/40 border-gray-800 hover:border-blue-900'}`}
                            onClick={() => setTempSectorState({ ...tempSectorState, isInvincible: !tempSectorState.isInvincible })}
                        >
                            <div className="flex items-center gap-3">
                                <div className={`w-6 h-6 border-2 flex items-center justify-center ${tempSectorState.isInvincible ? 'bg-blue-500 border-blue-500' : 'border-gray-600'}`}>
                                    {tempSectorState.isInvincible && <div className="text-black font-black text-xs">✓</div>}
                                </div>
                                <div>
                                    <div className={`font-black uppercase tracking-wider ${tempSectorState.isInvincible ? 'text-blue-400' : 'text-gray-400'}`}>
                                        {t('ui.invincible')}
                                    </div>
                                    <div className="text-[10px] text-gray-500 uppercase leading-none mt-1">
                                        {t('ui.no_damage_hint')}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Unlimited Ammo / No Reload could also be here, or kept in Armory as per earlier plan */}
                        {/* Letting the user decide where they want them, but I'll add them here as well for playground convenience */}
                        <div
                            className={`p-4 border select-none cursor-pointer transition-all ${tempSectorState.unlimitedAmmo ? 'bg-orange-900/30 border-orange-500' : 'bg-gray-900/40 border-gray-800 hover:border-orange-900'}`}
                            onClick={() => setTempSectorState({ ...tempSectorState, unlimitedAmmo: !tempSectorState.unlimitedAmmo, noReload: !tempSectorState.unlimitedAmmo })}
                        >
                            <div className="flex items-center gap-3">
                                <div className={`w-6 h-6 border-2 flex items-center justify-center ${tempSectorState.unlimitedAmmo ? 'bg-orange-500 border-orange-500' : 'border-gray-600'}`}>
                                    {tempSectorState.unlimitedAmmo && <div className="text-black font-black text-xs">✓</div>}
                                </div>
                                <div>
                                    <div className={`font-black uppercase tracking-wider ${tempSectorState.unlimitedAmmo ? 'text-orange-400' : 'text-gray-400'}`}>
                                        {t('ui.unlimited_ammo_no_reload')}
                                    </div>
                                    <div className="text-[10px] text-gray-500 uppercase leading-none mt-1">
                                        {t('ui.playground_only')}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer / Confirm moved into Layout via onConfirm */}
            <div className="mt-4 text-center">
                <p className="text-[10px] text-gray-600 font-bold uppercase tracking-[0.2em]">
                    {t('ui.playground_disclaimer')}
                </p>
            </div>
        </GameModalLayout>
    );
};

export default ScreenPlaygroundSkillStation;
