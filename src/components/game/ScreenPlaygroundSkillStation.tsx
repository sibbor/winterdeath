import React, { useState } from 'react';
import { PlayerStats, SectorState } from '../../types';
import { t } from '../../utils/i18n';
import { soundManager } from '../../utils/SoundManager';
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
                    <h3 className="text-2xl font-black uppercase text-green-500 mb-4 tracking-tighter italic border-b border-green-900/50 pb-2 hud-text-glow">
                        {t('ui.stat_calibration')}
                    </h3>
                    <div className="grid grid-cols-1 gap-4">
                        {SKILLS_CONFIG.map(skill => {
                            const val = (tempStats as any)[skill.id];
                            const displayVal = skill.id === 'speed' ? val.toFixed(2) : Math.round(val);

                            return (
                                <div key={skill.id} className="hud-bar-container bg-black/60 border border-green-900/20 p-5 flex justify-between items-center group hover:bg-green-900/10 transition-all">
                                    <div className="flex-1">
                                        <div className="text-white font-black uppercase text-xs tracking-widest mb-1">{t(skill.labelKey)}</div>
                                        <div className="text-white/30 text-[10px] uppercase font-bold">{t(skill.descKey)}</div>
                                    </div>
                                    <div className="flex items-center gap-6">
                                        <div className="text-3xl font-mono font-black text-green-400 hud-text-glow">{displayVal}</div>
                                        <button
                                            onClick={() => handleUpgradeSkill(skill.id, skill.value)}
                                            className="hud-touch-btn w-10 h-10 flex items-center justify-center text-xl font-black transition-all active:scale-90"
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
                    <h3 className="text-2xl font-black uppercase text-blue-500 mb-4 tracking-tighter italic border-b border-blue-900/50 pb-2 hud-text-glow">
                        {t('ui.temporary_modifiers')}
                    </h3>
                    <div className="space-y-4">
                        {/* Invincibility */}
                        <div
                            className={`hud-bar-container p-5 border transition-all cursor-pointer ${tempSectorState.isInvincible ? 'bg-blue-900/20 border-blue-500/50' : 'bg-black/60 border-white/5 hover:border-blue-900/50'}`}
                            onClick={() => setTempSectorState({ ...tempSectorState, isInvincible: !tempSectorState.isInvincible })}
                        >
                            <div className="flex items-center gap-4">
                                <div className={`w-6 h-6 border flex items-center justify-center transition-all ${tempSectorState.isInvincible ? 'bg-blue-500 border-blue-500 shadow-[0_0_10px_#3b82f6]' : 'border-white/20'}`}>
                                    {tempSectorState.isInvincible && <div className="text-black font-black text-xs">✓</div>}
                                </div>
                                <div>
                                    <div className={`font-black uppercase tracking-widest text-sm ${tempSectorState.isInvincible ? 'text-blue-400 hud-text-glow' : 'text-white/40'}`}>
                                        {t('ui.invincible')}
                                    </div>
                                    <div className="text-[9px] text-white/20 uppercase font-bold mt-1">
                                        {t('ui.no_damage_hint')}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Unlimited Ammo / No Reload */}
                        <div
                            className={`hud-bar-container p-5 border transition-all cursor-pointer ${tempSectorState.unlimitedAmmo ? 'bg-orange-900/20 border-orange-500/50' : 'bg-black/60 border-white/5 hover:border-orange-900/50'}`}
                            onClick={() => setTempSectorState({ ...tempSectorState, unlimitedAmmo: !tempSectorState.unlimitedAmmo, noReload: !tempSectorState.unlimitedAmmo })}
                        >
                            <div className="flex items-center gap-4">
                                <div className={`w-6 h-6 border flex items-center justify-center transition-all ${tempSectorState.unlimitedAmmo ? 'bg-orange-500 border-orange-500 shadow-[0_0_10px_#f97316]' : 'border-white/20'}`}>
                                    {tempSectorState.unlimitedAmmo && <div className="text-black font-black text-xs">✓</div>}
                                </div>
                                <div>
                                    <div className={`font-black uppercase tracking-widest text-sm ${tempSectorState.unlimitedAmmo ? 'text-orange-400 hud-text-glow' : 'text-white/40'}`}>
                                        {t('ui.unlimited_ammo_no_reload')}
                                    </div>
                                    <div className="text-[9px] text-white/20 uppercase font-bold mt-1">
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
