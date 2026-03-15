import React, { useState, useMemo } from 'react';
import { PlayerStats, SectorState } from '../../types';
import { WeaponType, WeaponCategory, WEAPONS as WEAPON_DEFS, WeaponCategoryColors } from '../../content/weapons';
import { t } from '../../utils/i18n';
import { WEAPONS, SCRAP_COST_BASE } from '../../content/constants';
import { soundManager } from '../../utils/SoundManager';
import GameModalLayout from './GameModalLayout';

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
        soundManager.playUiClick();
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
        // Only allow equipping for the main slots and special
        if (category === WeaponCategory.TOOL) {
            return;
        }

        soundManager.playUiConfirm();
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

        const keys = Object.keys(WEAPONS) as WeaponType[];
        for (const k of keys) {
            if ((tempWeaponLevels[k] || 1) !== (weaponLevels[k] || 1)) return true;
        }
        return false;
    }, [tempStats, tempLoadout, tempWeaponLevels, tempSectorState, stats, currentLoadout, weaponLevels, sectorState]);

    const handleConfirm = () => {
        if (hasChanges) {
            onSave(tempStats, tempLoadout, tempWeaponLevels, tempSectorState);
        } else {
            onClose();
        }
    };

    const scrapYellow = '#eab308'; // Tailwind yellow-500


    return (
        <GameModalLayout
            title={t('stations.armory')}
            onClose={onClose}
            onCancel={onClose}
            onConfirm={onClose}
            confirmLabel={t('ui.close')}
            fullHeight={true}
            canConfirm={hasChanges}
            isMobile={isMobileDevice}
            maxWidthClass="max-w-7xl"
            transparent={true}
            showCloseButton={false}
            extraHeaderContent={
                <div className={`px-4 py-2 border bg-yellow-900/20 border-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.3)] flex items-center gap-4`}>
                    <span className={`text-[10px] block uppercase font-bold text-yellow-500`}>{t('ui.scrap')}</span>
                    <span className={`text-2xl font-bold font-mono text-yellow-400`}>{(tempStats as any).collectedScrap !== undefined ? (tempStats as any).collectedScrap : tempStats.scrap}</span>
                </div>
            }
        >
            <div className={`flex flex-col h-full overflow-hidden ${isMobileDevice ? 'gap-4' : 'gap-8'}`}>

                <div className="flex justify-center gap-8 px-3 py-4 border-y border-yellow-900/30 bg-yellow-900/5 shrink-0">
                    <label className="flex items-center gap-3 cursor-pointer group">
                        <div
                            className={`w-6 h-6 border-2 flex items-center justify-center transition-colors ${tempSectorState.unlimitedThrowables ? 'bg-yellow-500 border-yellow-500' : 'border-gray-600 group-hover:border-yellow-500'}`}
                            onClick={() => setTempSectorState({ ...tempSectorState, unlimitedThrowables: !tempSectorState.unlimitedThrowables })}
                        >
                            {tempSectorState.unlimitedThrowables && <span className="text-black font-black text-xs">✓</span>}
                        </div>
                        <span className={`text-lg font-black uppercase tracking-wider ${tempSectorState.unlimitedThrowables ? 'text-yellow-500' : 'text-gray-500'}`}>
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
                        <span className={`text-lg font-light uppercase tracking-wider ${tempSectorState.noReload ? 'text-yellow-500' : 'text-gray-500'}`}>
                            {t('ui.no_reloading')}
                        </span>
                    </label>
                </div>

                {/* Tabs bar - Ensure horizontal scroll on mobile */}
                <div className="relative shrink-0">
                    <div className="absolute left-0 top-0 bottom-0 w-4 bg-gradient-to-r from-black via-black/50 to-transparent z-10 pointer-events-none" />
                    <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-black via-black/50 to-transparent z-10 pointer-events-none" />
                    <div className="flex gap-2 md:gap-4 border-b-2 border-gray-800 pb-2 md:pb-4 overflow-x-auto no-scrollbar pl-2 pt-2 min-h-[50px] md:min-h-[80px] items-end scroll-smooth">
                        {[WeaponCategory.PRIMARY, WeaponCategory.SECONDARY, WeaponCategory.THROWABLE, WeaponCategory.SPECIAL, WeaponCategory.TOOL].map(cat => {
                            const isActive = activeTab === cat;
                            const catColor = WeaponCategoryColors[cat as keyof typeof WeaponCategoryColors] || '#ffffff';
                            const catKey = 'categories.' + cat.toLowerCase();

                            return (
                                <button 
                                    key={cat} 
                                    onClick={() => { setActiveTab(cat as WeaponCategory); soundManager.playUiClick(); }}
                                    className={`px-4 md:px-8 py-2 md:py-4 transition-all duration-200 hover:scale-105 active:scale-95 flex items-center gap-3 group whitespace-nowrap
                                        ${isActive 
                                            ? 'bg-white text-black font-black italic' 
                                            : 'bg-zinc-900/40 text-zinc-500 hover:bg-zinc-800'
                                        }
                                    `}
                                >
                                    <span className="text-[10px] md:text-sm uppercase tracking-widest">{cat}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Main Content Area - constrained height handled by GameModalLayout's container, but we need inner scroll */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6 overflow-y-auto pb-4 pr-1 custom-scrollbar max-h-[60vh]">
                    {Object.values(WEAPONS).filter(w => w.category === activeTab).map((weapon) => {
                        const level = tempWeaponLevels[weapon.name] || 1;
                        const cost = SCRAP_COST_BASE * level;
                        const isEquipped = tempLoadout.primary === weapon.name || tempLoadout.secondary === weapon.name || tempLoadout.throwable === weapon.name || tempLoadout.special === weapon.name;
                        const canAfford = tempStats.scrap >= cost;
                        const categoryColor = WeaponCategoryColors[weapon.category as keyof typeof WeaponCategoryColors];
                        const isEquippable = weapon.category !== WeaponCategory.TOOL;
                        const isUpgradeable = isEquippable;

                        return (
                            <div
                                key={weapon.name}
                                onClick={() => !isEquipped && isEquippable && handleEquip(weapon.name, weapon.category)}
                                className={`relative border-2 transition-all group overflow-hidden flex ${isMobileDevice ? 'flex-row h-32' : 'flex-col min-h-[300px]'} 
                                    ${isEquipped ? 'cursor-default' : (isEquippable ? 'hover:bg-gray-800/60 cursor-pointer' : 'cursor-default')}
                                `}
                                style={{
                                    borderColor: isEquipped ? categoryColor : '#1f2937',
                                    backgroundColor: isEquipped ? `${categoryColor}15` : 'rgba(17, 24, 39, 0.4)',
                                }}
                            >
                                {/* Left Side (Image) on Mobile, Top Side on Desktop */}
                                <div
                                    className={`${isMobileDevice ? 'w-32 h-full' : 'w-full h-40'} border-r md:border-r-0 md:border-b flex items-center justify-center relative shrink-0 bg-black/40`}
                                    style={{ borderColor: isEquipped ? categoryColor : '#374151' }}
                                >
                                    <img
                                        src={weapon.icon}
                                        alt={weapon.name}
                                        className={`${isMobileDevice ? 'w-20 h-20' : 'w-24 h-24'} object-contain transition-transform group-hover:scale-110 duration-500`}
                                        style={{ filter: isEquipped ? 'none' : 'grayscale(1) brightness(0.5)' }}
                                    />

                                    <div className={`absolute top-0 left-0 bg-gray-900/80 ${isMobileDevice ? 'text-[9px] px-1.5 py-0.5' : 'text-sm px-3 py-1'} font-bold text-gray-400 border-r border-b border-gray-700`}>
                                        {t('ui.lvl')} {level}
                                    </div>

                                    {isEquipped && (
                                        <div className={`absolute bottom-0 left-0 w-full text-center ${isMobileDevice ? 'text-[8px] py-0.5' : 'text-[10px] py-1'} font-black uppercase tracking-tighter`} style={{ backgroundColor: categoryColor, color: '#000' }}>
                                            {t('ui.equipped')}
                                        </div>
                                    )}
                                </div>

                                {/* Right Side (Stats & Actions) on Mobile, Bottom Side on Desktop */}
                                <div className={`flex-1 flex flex-col justify-between ${isMobileDevice ? 'p-2 min-w-0' : 'p-5 gap-4'}`}>
                                    <div className="min-w-0">
                                        <h3 className={`${isMobileDevice ? 'text-lg leading-tight' : 'text-2xl'} font-black uppercase tracking-tighter truncate mb-1`}
                                            style={{ color: isEquipped ? categoryColor : 'white' }}>
                                            {t(weapon.displayName)}
                                        </h3>

                                        <div className={`grid grid-cols-2 gap-x-2 gap-y-1 ${isMobileDevice ? 'text-[9px]' : 'text-xs'} font-mono text-gray-400`}>
                                            <div className="flex justify-between border-b border-gray-800/50 pb-0.5">
                                                <span className="opacity-60">{t('ui.damage')}</span>
                                                <span className="text-white font-bold">{Math.floor(weapon.baseDamage * (1 + (level - 1) * 0.1))}</span>
                                            </div>
                                            <div className="flex justify-between border-b border-gray-800/50 pb-0.5">
                                                <span className="opacity-60">{t('ui.range')}</span>
                                                <span className="text-white font-bold">{weapon.range > 0 ? `${weapon.range}m` : '-'}</span>
                                            </div>
                                                    <div className="flex justify-between border-b border-gray-800/50 pb-0.5">
                                                        <span className="opacity-60">{t('ui.magazine')}</span>
                                                        <span className="text-white font-bold">{weapon.magSize > 0 ? weapon.magSize : '-'}</span>
                                                    </div>
                                                    <div className="flex justify-between border-b border-gray-800/50 pb-0.5">
                                                        <span className="opacity-60">{t('ui.reload')}</span>
                                                        <span className="text-white font-bold">{weapon.reloadTime > 0 ? `${(weapon.reloadTime / 1000).toFixed(1)}s` : '-'}</span>
                                                    </div>
                                        </div>
                                    </div>

                                    <div className="flex gap-2 items-center mt-auto">
                                        {isUpgradeable && (
                                            <button
                                                onClick={(e) => handleUpgradeWeapon(e, weapon.name)}
                                                disabled={!canAfford}
                                                className={`flex-1 ${isMobileDevice ? 'h-8' : 'h-12'} font-black uppercase border-2 transition-all flex flex-col items-center justify-center transform active:scale-95
                                                    ${canAfford 
                                                        ? 'bg-yellow-950/20 text-yellow-500 border-yellow-500 hover:bg-yellow-950/40 shadow-[0_0_15px_rgba(234,179,8,0.2)]'
                                                        : 'bg-black text-gray-600 border-gray-800 cursor-not-allowed'
                                                    }
                                                `}
                                            >
                                                <span className={`${isMobileDevice ? 'text-[10px]' : 'text-sm'} leading-none`}>
                                                    {t('ui.upgrade')} ({cost} {t('ui.scrap')})
                                                </span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </GameModalLayout>
    );
};

export default ScreenPlaygroundArmoryStation;
