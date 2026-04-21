import React, { useState } from 'react';
import { PlayerStatID } from '../../../../entities/player/PlayerTypes';
import { PlayerStats, SectorState } from '../../../../types/StateTypes';
import { t } from '../../../../utils/i18n';
import { UiSounds } from '../../../../utils/audio/AudioLib';
import ScreenModalLayout, { TacticalButton, TacticalCard } from '../../layout/ScreenModalLayout';

const SKILLS_CONFIG = [
    { id: PlayerStatID.MAX_HP, labelKey: 'skills.vitality', descKey: 'skills.vitality_desc', value: 20 },
    { id: PlayerStatID.MAX_STAMINA, labelKey: 'skills.adrenaline', descKey: 'skills.adrenaline_desc', value: 20 },
    { id: PlayerStatID.SPEED, labelKey: 'skills.reflex', descKey: 'skills.reflex_desc', value: 0.1 }
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

    const handleUpgradeSkill = (skillId: PlayerStatID, value: number) => {
        UiSounds.playClick();
        
        // Zero-GC: Clone the buffer for the state update to trigger React re-render
        const newStats = { ...tempStats };
        const newBuffer = new Float32Array(tempStats.statsBuffer);
        newBuffer[skillId] += value;
        newStats.statsBuffer = newBuffer;
        
        setTempStats(newStats);
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
                    <label className="text-zinc-500 uppercase text-sm font-bold tracking-widest">{t('ui.stat_calibration')}</label>
                    <div className="flex flex-col gap-2">
                        {SKILLS_CONFIG.map(skill => {
                            const val = tempStats.statsBuffer[skill.id];
                            const displayVal = skill.id === PlayerStatID.SPEED ? val.toFixed(2) : Math.round(val);

                            return (
                                <TacticalCard key={skill.id} showHatching={true} className="flex justify-between items-center group transition-all rounded-lg p-4">
                                    <div className="flex-1">
                                        <div className="text-white font-black uppercase text-[13px] tracking-widest mb-1">{t(skill.labelKey)}</div>
                                        <div className="text-zinc-500 text-[11px] uppercase font-bold">{t(skill.descKey)}</div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="text-2xl font-mono font-light text-green-500">{displayVal}</div>
                                        <TacticalButton
                                            onClick={() => handleUpgradeSkill(skill.id, skill.value)}
                                            className="w-10 h-10 flex items-center justify-center p-0"
                                            variant="secondary"
                                        >
                                            +
                                        </TacticalButton>
                                    </div>
                                </TacticalCard>
                            );
                        })}
                    </div>
                </div>

                {/* Modifiers Section */}
                <div className="flex flex-col gap-4">
                    <label className="text-zinc-500 uppercase text-sm font-bold tracking-widest">{t('ui.temporary_modifiers')}</label>
                    <div className="grid grid-cols-1 gap-3">
                        {/* Invincibility */}
                        <TacticalButton
                            onClick={() => { UiSounds.playClick(); setTempSectorState({ ...tempSectorState, isInvincible: !tempSectorState.isInvincible }); }}
                            variant={tempSectorState.isInvincible ? 'danger' : 'secondary'}
                            className="p-4 h-auto flex flex-row items-center gap-4 justify-start text-left"
                        >
                            <div className={`w-6 h-6 border flex items-center justify-center transition-all shrink-0 ${tempSectorState.isInvincible ? 'bg-red-600 border-red-600' : 'border-zinc-800'}`}>
                                {tempSectorState.isInvincible && <div className="text-black font-black text-xs">✓</div>}
                            </div>
                            <div>
                                <div className="font-black uppercase tracking-widest text-sm">{t('ui.invincible')}</div>
                                <div className="text-[11px] uppercase font-bold opacity-60 mt-1">{t('ui.no_damage_hint')}</div>
                            </div>
                        </TacticalButton>

                        {/* Unlimited Ammo */}
                        <TacticalButton
                            onClick={() => { UiSounds.playClick(); setTempSectorState({ ...tempSectorState, unlimitedAmmo: !tempSectorState.unlimitedAmmo, noReload: !tempSectorState.unlimitedAmmo }); }}
                            variant={tempSectorState.unlimitedAmmo ? 'primary' : 'secondary'}
                            className="p-4 h-auto flex flex-row items-center gap-4 justify-start text-left"
                        >
                            <div className={`w-6 h-6 border flex items-center justify-center transition-all shrink-0 ${tempSectorState.unlimitedAmmo ? 'bg-black border-black' : 'border-zinc-800'}`}>
                                {tempSectorState.unlimitedAmmo && <div className="text-zinc-500/50 font-black text-xs">✓</div>}
                            </div>
                            <div>
                                <div className="font-black uppercase tracking-widest text-sm">{t('ui.unlimited_ammo_no_reload')}</div>
                                <div className="text-[11px] uppercase font-bold opacity-60 mt-1">{t('ui.playground_only')}</div>
                            </div>
                        </TacticalButton>
                    </div>
                </div>

                <div className="mt-4 text-center pb-4">
                    <p className="text-[11px] text-zinc-600 font-bold uppercase tracking-[0.2em] leading-tight">
                        {t('ui.playground_disclaimer')}
                    </p>
                </div>
            </div>
        </ScreenModalLayout>
    );
};

export default ScreenPlaygroundSkillStation;
