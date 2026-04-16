import React, { useState, useMemo } from 'react';
import { PlayerStats } from '../../../../entities/player/PlayerTypes';
import { SectorState } from '../../../../game/session/SessionTypes';;
import { WeaponType, WeaponCategory, WeaponCategoryColors } from '../../../../content/weapons';
import { t } from '../../../../utils/i18n';
import { SCRAP_COST_BASE } from '../../../../content/constants';
import { UiSounds } from '../../../../utils/audio/AudioLib';
import { DataResolver } from '../../../../utils/ui/DataResolver';
import ScreenModalLayout, { TacticalTab } from '../../layout/ScreenModalLayout';

interface ScreenPlaygroundArmoryStationProps {
    stats: PlayerStats;
    sectorState: SectorState;
    currentLoadout: { primary: WeaponType; secondary: WeaponType; throwable: WeaponType; special: WeaponType; };
    weaponLevels: Record<WeaponType, number>;
    onSave: (
        newStats: PlayerStats,
        newLoadout: { primary: WeaponType; secondary: WeaponType; throwable: WeaponType; special: WeaponType; },
        newLevels: Record<WeaponType, number>,
        newSectorState: SectorState
    ) => void;
    onClose: () => void;
    isMobileDevice?: boolean;
}

const ScreenPlaygroundArmoryStation: React.FC<ScreenPlaygroundArmoryStationProps> = ({ stats, sectorState, currentLoadout, weaponLevels, onSave, onClose, isMobileDevice }) => {
    const [activeTab, setActiveTab] = useState<WeaponCategory>(WeaponCategory.PRIMARY);
    const [tempStats, setTempStats] = useState({ ...stats });
    const [tempLoadout, setTempLoadout] = useState({ ...currentLoadout });
    const [tempWeaponLevels, setTempWeaponLevels] = useState({ ...weaponLevels });
    const [tempSectorState, setTempSectorState] = useState({ ...sectorState });

    const handleUpgradeWeapon = (e: React.MouseEvent, weapon: WeaponType) => {
        e.stopPropagation();
        UiSounds.playClick();
        const level = tempWeaponLevels[weapon] || 1;
        const cost = SCRAP_COST_BASE * level;
        const currentScrap = (tempStats as any).collectedScrap !== undefined ? (tempStats as any).collectedScrap : tempStats.scrap;
        if (currentScrap >= cost) {
            if ((tempStats as any).collectedScrap !== undefined) {
                setTempStats({ ...tempStats, collectedScrap: (tempStats as any).collectedScrap - cost });
            } else {
                setTempStats({ ...tempStats, scrap: tempStats.scrap - cost });
            }
            setTempWeaponLevels({ ...tempWeaponLevels, [weapon]: level + 1 });
        }
    };

    const handleEquip = (weapon: WeaponType, category: WeaponCategory) => {
        if (category === WeaponCategory.TOOL) return;

        UiSounds.playConfirm();
        if (category === WeaponCategory.PRIMARY) setTempLoadout({ ...tempLoadout, primary: weapon });
        else if (category === WeaponCategory.SECONDARY) setTempLoadout({ ...tempLoadout, secondary: weapon });
        else if (category === WeaponCategory.THROWABLE) setTempLoadout({ ...tempLoadout, throwable: weapon });
        else if (category === WeaponCategory.SPECIAL) setTempLoadout({ ...tempLoadout, special: weapon });
    };

    const hasChanges = useMemo(() => {
        const currentScrap = (tempStats as any).collectedScrap !== undefined ? (tempStats as any).collectedScrap : tempStats.scrap;
        const originalScrap = (stats as any).collectedScrap !== undefined ? (stats as any).collectedScrap : stats.scrap;
        if (currentScrap !== originalScrap) return true;
        if (tempLoadout.primary !== currentLoadout.primary) return true;
        if (tempLoadout.secondary !== currentLoadout.secondary) return true;
        if (tempLoadout.throwable !== currentLoadout.throwable) return true;
        if (tempLoadout.special !== currentLoadout.special) return true;

        if (tempSectorState.unlimitedThrowables !== sectorState.unlimitedThrowables) return true;
        if (tempSectorState.noReload !== sectorState.noReload) return true;

        const weapons = Object.values(DataResolver.getWeapons()).filter(Boolean);
        for (const w of weapons) {
            const k = w.name;
            if ((tempWeaponLevels[k] || 1) !== (weaponLevels[k] || 1)) return true;
        }

        return false;
    }, [tempStats, tempLoadout, tempWeaponLevels, tempSectorState, stats, currentLoadout, weaponLevels, sectorState]);

    const handleConfirm = () => {
        onSave(tempStats, tempLoadout, tempWeaponLevels, tempSectorState);
        onClose();
    };

    const scrapHeader = (
        <div className={`px-4 py-1.5 border bg-black border-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.3)] flex flex-col items-start gap-0`}>
            <span className={`text-[9px] block uppercase font-bold text-yellow-500 leading-tight opacity-70`}>{t('ui.scrap')}</span>
            <span className={`text-xl md:text-2xl font-bold font-mono text-yellow-400 leading-none`}>{(tempStats as any).collectedScrap !== undefined ? (tempStats as any).collectedScrap : tempStats.scrap}</span>
        </div>
    );

    return (
        <ScreenModalLayout
            title={t('stations.armory')}
            isMobileDevice={isMobileDevice}
            onClose={onClose}
            onConfirm={handleConfirm}
            confirmLabel={t('ui.close')}
            extraHeaderContent={scrapHeader}
            titleColorClass="text-yellow-600"
            tabs={[WeaponCategory.PRIMARY, WeaponCategory.SECONDARY, WeaponCategory.THROWABLE, WeaponCategory.SPECIAL, WeaponCategory.TOOL]}
            activeTab={activeTab}
            onTabChange={(cat) => { setActiveTab(cat as WeaponCategory); UiSounds.playClick(); }}
            tabOrientation="horizontal"
        >
            <div className="flex flex-col h-full overflow-hidden gap-4 md:gap-8">
                {/* Debug Modifiers */}
                <div className="flex justify-center gap-4 md:gap-8 px-3 py-4 border-y border-yellow-900/30 bg-yellow-900/5 shrink-0">
                    <label className="flex items-center gap-3 cursor-pointer group">
                        <div
                            className={`w-6 h-6 border-2 flex items-center justify-center transition-colors ${tempSectorState.unlimitedThrowables ? 'bg-yellow-500 border-yellow-500' : 'border-gray-600 group-hover:border-yellow-500'}`}
                            onClick={() => setTempSectorState({ ...tempSectorState, unlimitedThrowables: !tempSectorState.unlimitedThrowables })}
                        >
                            {tempSectorState.unlimitedThrowables && <span className="text-black font-black text-xs">✓</span>}
                        </div>
                        <span className={`text-sm md:text-lg font-black uppercase tracking-wider ${tempSectorState.unlimitedThrowables ? 'text-yellow-500' : 'text-gray-500'}`}>
                            {t('ui.unlimited_throwables')}
                        </span>
                    </label>

                    <label className="flex items-center gap-3 cursor-pointer group">
                        <div
                            className={`w-6 h-6 border-2 flex items-center justify-center transition-colors ${tempSectorState.noReload ? 'bg-yellow-500 border-yellow-500' : 'border-gray-600 group-hover:border-yellow-500'}`}
                            onClick={() => setTempSectorState({ ...tempSectorState, noReload: !tempSectorState.noReload, unlimitedAmmo: !tempSectorState.noReload })}
                        >
                            {tempSectorState.noReload && <span className="text-black font-black text-xs">✓</span>}
                        </div>
                        <span className={`text-sm md:text-lg font-light uppercase tracking-wider ${tempSectorState.noReload ? 'text-yellow-500' : 'text-gray-500'}`}>
                            {t('ui.no_reloading')}
                        </span>
                    </label>
                </div>

                {/* Tabs bar */}
                <div className="relative shrink-0">
                    <div className="flex gap-2 md:gap-4 border-b-2 border-gray-800 pb-2 md:pb-4 overflow-x-auto no-scrollbar pt-2 min-h-[50px] md:min-h-[80px] items-end scroll-smooth">
                        {[WeaponCategory.PRIMARY, WeaponCategory.SECONDARY, WeaponCategory.THROWABLE, WeaponCategory.SPECIAL, WeaponCategory.TOOL].map(cat => (
                            <TacticalTab
                                key={cat}
                                label={t(`categories.${WeaponCategory[cat].toLowerCase()}`)}
                                isActive={activeTab === cat}
                                onClick={() => { setActiveTab(cat as WeaponCategory); UiSounds.playClick(); }}
                            />
                        ))}
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6 overflow-y-auto pb-4 pr-1 custom-scrollbar">
                    {Object.values(DataResolver.getWeapons()).filter(w => w.category === activeTab).map((weapon) => {
                        const level = tempWeaponLevels[weapon.name] || 1;
                        const cost = SCRAP_COST_BASE * level;
                        const isEquipped = tempLoadout.primary === weapon.name || tempLoadout.secondary === weapon.name || tempLoadout.throwable === weapon.name || tempLoadout.special === weapon.name;
                        const categoryColor = WeaponCategoryColors[weapon.category as keyof typeof WeaponCategoryColors];
                        const isEquippable = weapon.category !== WeaponCategory.TOOL;
                        const currentScrap = (tempStats as any).collectedScrap !== undefined ? (tempStats as any).collectedScrap : tempStats.scrap;
                        const canAfford = currentScrap >= cost;

                        return (
                            <div
                                key={weapon.name}
                                onClick={() => !isEquipped && isEquippable && handleEquip(weapon.name, weapon.category)}
                                className={`relative border-2 transition-all group overflow-hidden flex flex-col
                                    ${isEquipped ? 'cursor-default' : (isEquippable ? 'hover:bg-gray-800/60 cursor-pointer' : 'cursor-default')}
                                `}
                                style={{
                                    borderColor: isEquipped ? categoryColor : '#374151',
                                    backgroundColor: isEquipped ? `${categoryColor}15` : 'rgba(17, 24, 39, 0.4)',
                                    minHeight: isMobileDevice ? 'auto' : '300px'
                                }}
                            >
                                <div className={`w-full flex flex-col border-b relative shrink-0 bg-black/40`} style={{ borderColor: isEquipped ? categoryColor : '#374151' }}>
                                    <div className={`${isMobileDevice ? 'h-32' : 'h-40'} border-b border-gray-800/50 w-full flex items-center justify-center transition-transform group-hover:scale-110 duration-500`}>
                                        <img src={weapon.icon} alt="" className={`${isMobileDevice ? 'w-20 h-20' : 'w-24 h-24'} object-contain filter brightness-0 invert`} />
                                    </div>
                                    {isEquippable && (
                                        <button
                                            onClick={(e) => handleUpgradeWeapon(e, weapon.name)}
                                            disabled={!canAfford}
                                            className={`w-full py-2.5 px-2 text-[10px] font-bold uppercase transition-all duration-200 hover:scale-105 active:scale-95 flex items-center justify-center transform ${canAfford
                                                ? 'bg-yellow-950/20 text-yellow-500 hover:bg-yellow-950/40'
                                                : 'bg-black text-gray-700 cursor-not-allowed'
                                                }`}
                                        >
                                            {t('ui.upgrade')} ({cost})
                                        </button>
                                    )}
                                    <div className={`absolute top-0 left-0 bg-gray-900/80 ${isMobileDevice ? 'text-[9px] px-1.5 py-0.5' : 'text-sm px-3 py-1'} font-bold text-gray-400 border-r border-b border-gray-700`}>
                                        {t('ui.lvl')} {level}
                                    </div>
                                    {isEquipped && (
                                        <div className={`absolute top-0 right-0 px-1.5 py-0.5 bg-white text-black font-bold uppercase tracking-tighter text-[10px] border-b border-l border-black shadow-lg z-20`}>
                                            {t('ui.equipped')}
                                        </div>
                                    )}
                                </div>

                                <div className={`flex-1 flex flex-col justify-between ${isMobileDevice ? 'p-2 min-w-0' : 'p-5 gap-4'}`}>
                                    <div className="min-w-0">
                                        <h3 className={`${isMobileDevice ? 'text-lg leading-tight' : 'text-2xl'} font-semibold uppercase tracking-tighter truncate mb-1`} style={{ color: isEquipped ? categoryColor : 'white' }}>
                                            {t(weapon.displayName)}
                                        </h3>
                                        <div className={`flex flex-col gap-y-1 ${isMobileDevice ? 'text-[9px]' : 'text-xs'} font-mono text-gray-400`}>
                                            <div className="flex justify-between border-b border-gray-800/50 pb-0.5">
                                                <span className="opacity-60">{t('ui.damage')}</span>
                                                <span className="text-white font-bold">{Math.floor(weapon.damage * (1 + (level - 1) * 0.1))}</span>
                                            </div>
                                            <div className="flex justify-between border-b border-gray-800/50 pb-0.5">
                                                <span className="opacity-60">{t('ui.range')}</span>
                                                <span className="text-white font-bold">{weapon.range > 0 ? `${weapon.range}m` : '-'}</span>
                                            </div>
                                            {weapon.radius && weapon.radius > 0 && (
                                                <div className="flex justify-between border-b border-gray-800/50 pb-0.5">
                                                    <span className="opacity-60">{t('ui.radius')}</span>
                                                    <span className="text-white font-bold">{weapon.radius}m</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </ScreenModalLayout>
    );
};

export default ScreenPlaygroundArmoryStation;
