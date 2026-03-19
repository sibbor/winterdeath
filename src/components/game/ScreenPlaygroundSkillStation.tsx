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
            onClose={onClose}
            onCancel={onClose}
            onConfirm={handleConfirm}
            confirmLabel={t('ui.apply_calibration')}
            isMobileDevice={isMobileDevice}
        >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 pb-8">
                {/* Stats Section */}
                <div className="space-y-4">
                    <h3 className="text-2xl font-light uppercase text-white mb-4 tracking-tighter border-b border-white/20 pb-2">
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
                                        <div className="text-3xl font-mono font-light text-green-400">{displayVal}</div>
                                        <button
                                            onClick={() => handleUpgradeSkill(skill.id, skill.value)}
                                            className="hud-touch-btn w-10 h-10 flex items-center justify-center text-xl font-black transition-all duration-200 hover:scale-105 active:scale-95"
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
                    <h3 className="text-2xl font-light uppercase text-white mb-4 tracking-tighter border-b border-white/20 pb-2">
                        {t('ui.temporary_modifiers')}
                    </h3>
                    <div className="space-y-4">
                        {/* Invincibility */}
                        <div
                            className={`hud-bar-container p-5 border-2 transition-all cursor-pointer !overflow-visible ${tempSectorState.isInvincible ? 'bg-zinc-800 border-zinc-700 text-black animate-tab-pulsate' : 'bg-black border-zinc-700 text-zinc-400 hover:bg-zinc-900'}`}
                            onClick={() => setTempSectorState({ ...tempSectorState, isInvincible: !tempSectorState.isInvincible })}
                        >
                            <div className="flex items-center gap-4">
                                <div className={`w-6 h-6 border flex items-center justify-center transition-all ${tempSectorState.isInvincible ? 'bg-black border-zinc-700 shadow-[0_0_10px_rgba(255,0,0,0.5)]' : 'border-zinc-800'}`}>
                                    {tempSectorState.isInvincible && <div className="text-red-500 font-black text-xs">✓</div>}
                                </div>
                                <div>
                                    <div className={`font-bold uppercase tracking-widest text-sm ${tempSectorState.isInvincible ? 'text-black' : 'text-zinc-400'}`}>
                                        {t('ui.invincible')}
                                    </div>
                                    <div className={`text-[9px] uppercase font-bold mt-1 ${tempSectorState.isInvincible ? 'text-black/60' : 'text-zinc-600'}`}>
                                        {t('ui.no_damage_hint')}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Unlimited Ammo / No Reload */}
                        <div
                            className={`hud-bar-container p-5 border-2 transition-all cursor-pointer !overflow-visible ${tempSectorState.unlimitedAmmo ? 'bg-zinc-800 border-zinc-700 text-black animate-tab-pulsate' : 'bg-black border-zinc-700 text-zinc-400 hover:bg-zinc-900'}`}
                            onClick={() => setTempSectorState({ ...tempSectorState, unlimitedAmmo: !tempSectorState.unlimitedAmmo, noReload: !tempSectorState.unlimitedAmmo })}
                        >
                            <div className="flex items-center gap-4">
                                <div className={`w-6 h-6 border flex items-center justify-center transition-all ${tempSectorState.unlimitedAmmo ? 'bg-black border-zinc-700 shadow-[0_0_10px_rgba(255,0,0,0.5)]' : 'border-zinc-800'}`}>
                                    {tempSectorState.unlimitedAmmo && <div className="text-red-500 font-black text-xs">✓</div>}
                                </div>
                                <div>
                                    <div className={`font-bold uppercase tracking-widest text-sm ${tempSectorState.unlimitedAmmo ? 'text-black' : 'text-zinc-400'}`}>
                                        {t('ui.unlimited_ammo_no_reload')}
                                    </div>
                                    <div className={`text-[9px] uppercase font-bold mt-1 ${tempSectorState.unlimitedAmmo ? 'text-black/60' : 'text-zinc-600'}`}>
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
