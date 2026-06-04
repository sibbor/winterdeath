import React, { useState, useCallback, useMemo } from 'react';
import { CareerStats, StatID } from '../../../types/CareerStats';
import { StatsBridge } from '../../../core/data/StatsBridge';
import { t } from '../../../utils/i18n';
import { UiSounds } from '../../../utils/audio/AudioLib';
import { LEVEL_CAP, PLAYER } from '../../../content/constants';
import { useOrientation } from '../../../hooks/useOrientation';
import { COLORS } from '../../../utils/ui/ColorUtils';
import ModalLayout, { TacticalCard, TacticalButton, HORIZONTAL_HATCHING_STYLE } from './ModalLayout';

const SKILLS_CONFIG = [
    { statId: StatID.MAX_HP, labelKey: 'skills.vitality', descKey: 'skills.vitality_desc', cost: 1, value: 20, base: 100 },
    { statId: StatID.MAX_STAMINA, labelKey: 'skills.adrenaline', descKey: 'skills.adrenaline_desc', cost: 1, value: 20, base: 100 },
    { statId: StatID.SPEED, labelKey: 'skills.reflex', descKey: 'skills.reflex_desc', cost: 2, value: 0.5, base: PLAYER.BASE_SPEED }
];

interface ScreenSkillsProps {
    stats: CareerStats;
    onSave: (newStats: CareerStats) => void;
    onClose: () => void;
    isMobileDevice?: boolean;
}

const ScreenSkills: React.FC<ScreenSkillsProps> = React.memo(({ stats, onSave, onClose, isMobileDevice }) => {
    const { isLandscapeMode } = useOrientation();
    const [tempStats, setTempStats] = useState(() => StatsBridge.deepCloneStats(stats));

    // Upgrade Skill
    const handleUpgradeSkill = useCallback((statId: StatID, cost: number, value: number) => {
        UiSounds.playUpgrade();

        setTempStats(prevStats => {
            // Transactional boundary: Check and consume SP (Zero-GC)
            if (StatsBridge.consumeSkillPoints(prevStats, cost)) {

                // Fast modulo check to route to the correct V8-optimized mutator
                if (value % 1 === 0) {
                    StatsBridge.addStatInt(prevStats, statId, value);
                } else {
                    StatsBridge.addStatFloat(prevStats, statId, value);
                }

                // Shallow clone to trigger React UI re-render. 
                // GC allocation is acceptable here as it only triggers on explicit user click, not in the render loop.
                return { ...prevStats };
            }

            // Insufficient funds, return original reference (no re-render)
            return prevStats;
        });
    }, []);

    const handleConfirm = useCallback(() => {
        onSave(tempStats);
        onClose();
    }, [onSave, onClose, tempStats]);

    const xpNeeded = StatsBridge.getStatInt(stats, StatID.NEXT_LEVEL_XP) - StatsBridge.getStatInt(stats, StatID.CURRENT_XP);
    const isMaxRank = StatsBridge.getStatInt(stats, StatID.LEVEL) >= LEVEL_CAP;
    const hasChanges = StatsBridge.getStatInt(tempStats, StatID.SKILL_POINTS) !== StatsBridge.getStatInt(stats, StatID.SKILL_POINTS);

    const spSubtitle = useMemo(() => (
        <div className="flex flex-col gap-1 mt-2">
            <div className="flex items-center gap-4">
                <div className="px-3 py-1 bg-purple-950/40 border border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.2)] flex items-center gap-3 relative overflow-hidden">
                    <div className="absolute inset-0 pointer-events-none opacity-40 shimmer-overlay" />
                    <span className="text-[10px] font-black text-purple-400 uppercase tracking-widest relative z-10">{t('ui.sp')}</span>
                    <span className="text-xl font-mono font-black text-white relative z-10">{StatsBridge.getStatInt(tempStats, StatID.SKILL_POINTS)}</span>
                </div>
            </div>
        </div>
    ), [StatsBridge.getStatInt(tempStats, StatID.SKILL_POINTS), isMaxRank, xpNeeded]);

    return (
        <ModalLayout
            title={t('stations.skills')}
            subtitle={spSubtitle}
            isMobileDevice={isMobileDevice}
            onClose={onClose}
            onConfirm={handleConfirm}
            confirmLabel={t('ui.confirm_upgrades')}
            closeLabel={hasChanges ? t('ui.cancel') : t('ui.close')}
            canConfirm={hasChanges}
            showCancel={true}
            titleColorClass="text-purple-600"
        >

            <div className="hidden md:block">
                <span className="text-purple-300 font-bold text-sm uppercase tracking-wider block max-w-2xl mx-auto">
                    {isMaxRank
                        ? t('ui.sp_hint_max')
                        : t('ui.sp_hint_rankup', { xp: xpNeeded })}
                </span>
            </div>
            <div className={`grid ${(!isMobileDevice || isLandscapeMode) ? 'grid-cols-1 md:grid-cols-3 h-full' : 'grid-cols-1'} gap-6 md:gap-10 pt-8`}>
                {SKILLS_CONFIG.map(skill => (
                    <SkillCard
                        key={skill.statId}
                        skill={skill}
                        currentVal={StatsBridge.getStatFloat(tempStats, skill.statId)}
                        availableSP={StatsBridge.getStatInt(tempStats, StatID.SKILL_POINTS)}
                        isMobileDevice={isMobileDevice}
                        onUpgrade={handleUpgradeSkill}
                    />
                ))}
            </div>
        </ModalLayout>
    );
});

interface SkillCardProps {
    skill: any;
    currentVal: number;
    availableSP: number;
    isMobileDevice?: boolean;
    onUpgrade: (statId: StatID, cost: number, value: number) => void;
}

const UI_ICON_PATH = '/assets/icons/ui/';

const SkillCard: React.FC<SkillCardProps> = React.memo(({ skill, currentVal, availableSP, isMobileDevice, onUpgrade }) => {
    const cost = skill.cost;
    const canAfford = availableSP >= cost;
    const baseVal = skill.base;
    const upgradeVal = currentVal - baseVal;
    const isUpgraded = upgradeVal > 0;

    // Format for display
    const isSpeed = skill.statId === StatID.SPEED;
    const displayBase = isSpeed ? baseVal.toFixed(1) : baseVal;
    const displayUpgrade = isSpeed ? upgradeVal.toFixed(2) : upgradeVal;

    return (
        <TacticalCard
            color={COLORS.PURPLE}
            showHover={true}
            className={`flex flex-col p-0 border-white/5 bg-transparent transition-all duration-300 ${isUpgraded ? 'bg-purple-500/5' : ''}`}
            style={{
                borderColor: isUpgraded ? `${COLORS.PURPLE.str}44` : 'rgba(63, 63, 70, 0.3)',
                boxShadow: isUpgraded ? '0 0 20px rgba(168,85,247,0.1)' : 'none'
            }}
        >
            {isUpgraded && (
                <div className="absolute inset-0 opacity-5 pointer-events-none" style={HORIZONTAL_HATCHING_STYLE} />
            )}

            <div className="p-6 flex flex-col items-center text-center flex-1">
                <div className={`w-12 h-12 md:w-16 md:h-16 rounded-full border-2 mb-4 flex items-center justify-center transition-all duration-500 overflow-hidden ${isUpgraded ? 'border-purple-500 bg-purple-500/20 shadow-[0_0_20px_rgba(168,85,247,0.4)]' : 'border-zinc-800 bg-zinc-900/50'}`}>
                    {skill.statId === StatID.MAX_HP && <img src={`${UI_ICON_PATH}skill_vitality.png`} alt="" className="w-full h-full object-cover mix-blend-screen opacity-80" />}
                    {skill.statId === StatID.MAX_STAMINA && <img src={`${UI_ICON_PATH}skill_adrenaline.png`} alt="" className="w-full h-full object-cover mix-blend-screen opacity-80" />}
                    {skill.statId === StatID.SPEED && <img src={`${UI_ICON_PATH}skill_reflex.png`} alt="" className="w-full h-full object-cover mix-blend-screen opacity-80" />}
                </div>

                <h3 className={`${isMobileDevice ? 'text-lg mb-1' : 'text-xl mb-2'} font-bold text-white uppercase tracking-tight`}>{t(skill.labelKey)}</h3>
                <p className={`${isMobileDevice ? 'text-[10px] h-8 mb-2 leading-tight' : 'text-sm h-12 mb-4'} text-zinc-500 font-medium leading-relaxed`}>{t(skill.descKey)}</p>

                <div className="w-full bg-zinc-950/50 border border-white/5 p-4 mb-6 relative overflow-hidden">
                    <div className="flex flex-col items-center relative z-10">
                        <div className="flex items-baseline gap-2">
                            <span className={`${isMobileDevice ? 'text-2xl' : 'text-4xl'} font-mono text-white font-black leading-none`}>
                                {isSpeed ? currentVal.toFixed(2) : currentVal}
                            </span>
                            <span className="text-[10px] font-black text-purple-500 uppercase tracking-widest opacity-80">
                                {skill.statId === StatID.MAX_HP ? t('ui.hp') : (skill.statId === StatID.MAX_STAMINA ? t('ui.stamina_short') : t('ui.speed_unit'))}
                            </span>
                        </div>
                        {isUpgraded && (
                            <div className="mt-2 text-[10px] font-mono font-bold text-purple-400/60 uppercase">
                                {displayBase} + <span className="text-purple-400">{displayUpgrade}</span>
                            </div>
                        )}
                    </div>
                </div>

                <TacticalButton
                    onClick={() => onUpgrade(skill.statId, cost, skill.value)}
                    disabled={!canAfford}
                    variant={canAfford ? 'primary' : 'ghost'}
                    className="w-full h-12 text-xs border-none font-black"
                    style={canAfford ? { backgroundColor: 'rgba(168, 85, 247, 0.1)', color: COLORS.PURPLE.str } : { opacity: 0.3 }}
                >
                    <span className="opacity-60 mr-2">{t('ui.upgrade')}</span>
                    <span className="font-mono">[{cost} SP]</span>
                </TacticalButton>
            </div>
        </TacticalCard>
    );
});

export default ScreenSkills;
