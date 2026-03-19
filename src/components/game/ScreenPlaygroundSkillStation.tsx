import React, { useState } from 'react';
import { PlayerStats, SectorState } from '../../types';
import { t } from '../../utils/i18n';
import { soundManager } from '../../utils/SoundManager';
import ScreenModalLayout from '../ui/ScreenModalLayout';

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
        <ScreenModalLayout
            title={t('stations.skills')}
            isMobileDevice={isMobileDevice}
            onClose={onClose}
            onConfirm={handleConfirm}
            confirmLabel={t('ui.apply_calibration')}
            isSmall={true}
            titleColorClass="text-green-600"
        >
            <div className="flex flex-col gap-8 p-2 max-w-xl mx-auto h-full overflow-y-auto pr-4 custom-scrollbar">
                {/* Stats Section */}
                <div className="flex flex-col gap-4">
                    <label className="text-zinc-500 uppercase text-xs font-bold tracking-widest">{t('ui.stat_calibration')}</label>
                    <div className="flex flex-col gap-2">
                        {SKILLS_CONFIG.map(skill => {
                            const val = (tempStats as any)[skill.id];
                            const displayVal = skill.id === 'speed' ? val.toFixed(2) : Math.round(val);

                            return (
                                <div key={skill.id} className="bg-zinc-900/40 border border-zinc-800 p-4 flex justify-between items-center group hover:bg-zinc-800/40 transition-all rounded-lg">
                                    <div className="flex-1">
                                        <div className="text-white font-black uppercase text-[10px] tracking-widest mb-1">{t(skill.labelKey)}</div>
                                        <div className="text-zinc-500 text-[9px] uppercase font-bold">{t(skill.descKey)}</div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="text-2xl font-mono font-light text-green-500">{displayVal}</div>
                                        <button
                                            onClick={() => handleUpgradeSkill(skill.id, skill.value)}
                                            className="w-10 h-10 flex items-center justify-center text-xl font-black bg-zinc-800 border border-zinc-700 hover:bg-green-600 hover:text-black hover:border-green-600 transition-all active:scale-95 text-green-500"
                                        >
                                            +
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Modifiers Section */}
                <div className="flex flex-col gap-4">
                    <label className="text-zinc-500 uppercase text-xs font-bold tracking-widest">{t('ui.temporary_modifiers')}</label>
                    <div className="grid grid-cols-1 gap-3">
                        {/* Invincibility */}
                        <div
                            className={`p-4 border-2 transition-all cursor-pointer flex items-center gap-4 rounded-lg
                                ${tempSectorState.isInvincible ? 'bg-red-950/20 border-red-600 text-red-500 shadow-[0_0_15px_rgba(220,38,38,0.2)]' : 'bg-black border-zinc-800 text-zinc-500 hover:border-zinc-700'}
                            `}
                            onClick={() => { soundManager.playUiClick(); setTempSectorState({ ...tempSectorState, isInvincible: !tempSectorState.isInvincible }); }}
                        >
                            <div className={`w-6 h-6 border flex items-center justify-center transition-all ${tempSectorState.isInvincible ? 'bg-red-600 border-red-600' : 'border-zinc-800'}`}>
                                {tempSectorState.isInvincible && <div className="text-black font-black text-xs">✓</div>}
                            </div>
                            <div>
                                <div className="font-black uppercase tracking-widest text-xs">{t('ui.invincible')}</div>
                                <div className="text-[9px] uppercase font-bold opacity-60 mt-1">{t('ui.no_damage_hint')}</div>
                            </div>
                        </div>

                        {/* Unlimited Ammo */}
                        <div
                            className={`p-4 border-2 transition-all cursor-pointer flex items-center gap-4 rounded-lg
                                ${tempSectorState.unlimitedAmmo ? 'bg-zinc-100 border-zinc-100 text-black' : 'bg-black border-zinc-800 text-zinc-500 hover:border-zinc-700'}
                            `}
                            onClick={() => { soundManager.playUiClick(); setTempSectorState({ ...tempSectorState, unlimitedAmmo: !tempSectorState.unlimitedAmmo, noReload: !tempSectorState.unlimitedAmmo }); }}
                        >
                            <div className={`w-6 h-6 border flex items-center justify-center transition-all ${tempSectorState.unlimitedAmmo ? 'bg-black border-black' : 'border-zinc-800'}`}>
                                {tempSectorState.unlimitedAmmo && <div className="text-zinc-100 font-black text-xs">✓</div>}
                            </div>
                            <div>
                                <div className="font-black uppercase tracking-widest text-xs">{t('ui.unlimited_ammo_no_reload')}</div>
                                <div className="text-[9px] uppercase font-bold opacity-60 mt-1">{t('ui.playground_only')}</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-4 text-center pb-4">
                    <p className="text-[9px] text-zinc-600 font-bold uppercase tracking-[0.2em] leading-tight">
                        {t('ui.playground_disclaimer')}
                    </p>
                </div>
            </div>
        </ScreenModalLayout>
    );
};

export default ScreenPlaygroundSkillStation;
