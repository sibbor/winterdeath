
import React, { useState, useMemo } from 'react';
import { PlayerStats, WeaponType, WeaponCategory } from '../../types';
import { t } from '../../utils/i18n';
import { WEAPONS, SCRAP_COST_BASE } from '../../content/constants';
import { soundManager } from '../../utils/sound';
import CampModalLayout from './CampModalLayout';

interface ScreenArmoryProps {
    stats: PlayerStats;
    currentLoadout: { primary: WeaponType; secondary: WeaponType; throwable: WeaponType };
    weaponLevels: Record<WeaponType, number>;
    onSave: (
        newStats: PlayerStats,
        newLoadout: { primary: WeaponType; secondary: WeaponType; throwable: WeaponType },
        newLevels: Record<WeaponType, number>
    ) => void;
    onClose: () => void;
    isMobileDevice?: boolean;
}

const CATEGORY_COLORS: Record<string, string> = {
    [WeaponCategory.PRIMARY]: '#ef4444',   // Red-500
    [WeaponCategory.SECONDARY]: '#f59e0b', // Amber-500
    [WeaponCategory.THROWABLE]: '#10b981', // Emerald-500
    [WeaponCategory.SPECIAL]: '#a855f7',   // Purple-500
    [WeaponCategory.TOOL]: '#3b82f6',      // Blue-500
};

const ScreenArmory: React.FC<ScreenArmoryProps> = ({ stats, currentLoadout, weaponLevels, onSave, onClose, isMobileDevice }) => {
    const [activeTab, setActiveTab] = useState<WeaponCategory>(WeaponCategory.PRIMARY);
    const [tempStats, setTempStats] = useState({ ...stats });
    const [tempLoadout, setTempLoadout] = useState({ ...currentLoadout });
    const [tempWeaponLevels, setTempWeaponLevels] = useState({ ...weaponLevels });

    const handleUpgradeWeapon = (e: React.MouseEvent, weapon: WeaponType) => {
        e.stopPropagation();
        soundManager.playUiClick();
        const level = tempWeaponLevels[weapon] || 1;
        const cost = SCRAP_COST_BASE * level;
        if (tempStats.scrap >= cost) {
            setTempStats({ ...tempStats, scrap: tempStats.scrap - cost });
            setTempWeaponLevels({ ...tempWeaponLevels, [weapon]: level + 1 });
        }
    };

    const handleEquip = (weapon: WeaponType, category: WeaponCategory) => {
        // Only allow equipping for the main 3 slots
        if (category === WeaponCategory.SPECIAL || category === WeaponCategory.TOOL) {
            return;
        }

        soundManager.playUiConfirm();
        if (category === WeaponCategory.PRIMARY) setTempLoadout({ ...tempLoadout, primary: weapon });
        else if (category === WeaponCategory.SECONDARY) setTempLoadout({ ...tempLoadout, secondary: weapon });
        else if (category === WeaponCategory.THROWABLE) setTempLoadout({ ...tempLoadout, throwable: weapon });
    };

    const hasChanges = useMemo(() => {
        if (tempStats.scrap !== stats.scrap) return true;
        if (tempLoadout.primary !== currentLoadout.primary) return true;
        if (tempLoadout.secondary !== currentLoadout.secondary) return true;
        if (tempLoadout.throwable !== currentLoadout.throwable) return true;

        // Deep compare weapon levels if any upgrade happened
        const keys = Object.keys(WEAPONS) as WeaponType[];
        for (const k of keys) {
            if ((tempWeaponLevels[k] || 1) !== (weaponLevels[k] || 1)) return true;
        }
        return false;
    }, [tempStats, tempLoadout, tempWeaponLevels, stats, currentLoadout, weaponLevels]);

    const handleConfirm = () => {
        if (hasChanges) {
            onSave(tempStats, tempLoadout, tempWeaponLevels);
        } else {
            onClose();
        }
    };

    const scrapYellow = '#eab308'; // Tailwind yellow-500

    return (
        <CampModalLayout
            title={t('stations.armory')}
            borderColorClass="border-yellow-500"
            onClose={onClose}
            onConfirm={handleConfirm}
            confirmLabel={t('ui.confirm_loadout')}
            canConfirm={hasChanges}
            isMobile={isMobileDevice}
        >
            <div className={`flex flex-col h-full ${isMobileDevice ? 'gap-4' : 'gap-8'}`}>
                {/* Tabs bar with left padding to prevent cutoff */}
                <div className="flex gap-2 md:gap-4 border-b-2 border-gray-800 pb-2 md:pb-4 overflow-x-auto pl-2 pt-2 min-h-[60px] md:min-h-[80px] items-end shrink-0">
                    {[WeaponCategory.PRIMARY, WeaponCategory.SECONDARY, WeaponCategory.THROWABLE, WeaponCategory.SPECIAL, WeaponCategory.TOOL].map(cat => {
                        const isActive = activeTab === cat;
                        const catColor = CATEGORY_COLORS[cat] || '#ffffff';
                        const catKey = 'categories.' + cat.toLowerCase();

                        return (
                            <button key={cat} onClick={() => { setActiveTab(cat as WeaponCategory); soundManager.playUiClick(); }}
                                className={`px-4 md:px-6 py-2 md:py-4 text-xs md:text-lg font-black uppercase tracking-widest transition-all skew-x-[-10deg] border-2 hover:brightness-110 whitespace-nowrap`}
                                style={{
                                    borderColor: isActive ? catColor : 'transparent',
                                    backgroundColor: isActive ? catColor : 'transparent',
                                    color: isActive ? 'black' : '#6b7280'
                                }}
                            >
                                <span className="block skew-x-[10deg]">{t(catKey)}</span>
                            </button>
                        );
                    })}
                    {!isMobileDevice && (
                        <div className="flex-1 flex justify-end items-center">
                            <div className="bg-yellow-900/20 px-4 py-2 border border-yellow-500">
                                <span className="text-[10px] font-bold text-yellow-500 uppercase block">{t('ui.scrap')}</span>
                                <span className="text-2xl font-black text-white">{tempStats.scrap}</span>
                            </div>
                        </div>
                    )}
                </div>

                {isMobileDevice && (
                    <div className="flex justify-between items-center bg-yellow-900/10 p-2 border-b-2 border-yellow-900/20">
                        <span className="text-xs font-bold text-yellow-500 uppercase">{t('ui.scrap')}</span>
                        <span className="text-xl font-black text-yellow-500">{tempStats.scrap}</span>
                    </div>
                )}

                {/* 3 Columns Layout */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto pb-4">
                    {Object.values(WEAPONS).filter(w => w.category === activeTab).map((weapon) => {
                        const level = tempWeaponLevels[weapon.name] || 1;
                        const cost = SCRAP_COST_BASE * level;
                        const isEquipped = tempLoadout.primary === weapon.name || tempLoadout.secondary === weapon.name || tempLoadout.throwable === weapon.name;
                        const canAfford = tempStats.scrap >= cost;
                        const categoryColor = CATEGORY_COLORS[weapon.category];
                        const isEquippable = weapon.category !== WeaponCategory.SPECIAL && weapon.category !== WeaponCategory.TOOL;
                        const isUpgradeable = isEquippable;

                        return (
                            <div
                                key={weapon.name}
                                onClick={() => !isEquipped && isEquippable && handleEquip(weapon.name, weapon.category)}
                                className={`relative border-2 flex flex-col transition-all group overflow-hidden
                                    ${isEquipped
                                        ? 'cursor-default'
                                        : (isEquippable ? 'hover:bg-gray-800 cursor-pointer' : 'cursor-default')}
                                `}
                                style={{
                                    borderColor: isEquipped ? categoryColor : '#1f2937', // gray-800
                                    backgroundColor: isEquipped ? `${categoryColor}20` : 'rgba(17, 24, 39, 0.4)',
                                }}
                            >
                                {/* Image at top, full width */}
                                <div
                                    className={`w-full h-40 border-b flex items-center justify-center relative shrink-0 transition-colors bg-black`}
                                    style={{ borderColor: isEquipped ? categoryColor : '#374151' }}
                                >
                                    <div className="w-24 h-24" dangerouslySetInnerHTML={{ __html: weapon.icon }} style={{ color: categoryColor }} />
                                    <div className="absolute top-0 right-0 bg-gray-800 text-lg font-black px-4 py-2 text-gray-400">{t('ui.lvl')} {level}</div>
                                    {isEquipped && <span className="absolute bottom-0 left-0 text-black text-xs font-bold px-3 py-1 uppercase tracking-widest" style={{ backgroundColor: categoryColor }}>{t('ui.equipped')}</span>}
                                </div>

                                <div className="flex-1 flex flex-col justify-between p-5 gap-6">
                                    <div>
                                        <div className="flex justify-between items-start mb-4">
                                            <h3 className="text-3xl font-black uppercase tracking-tighter truncate leading-none" style={{ color: isEquipped ? categoryColor : 'white' }}>{t(weapon.displayName)}</h3>
                                        </div>
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-base font-mono text-gray-400">
                                            <div className="flex justify-between border-b border-gray-800 pb-1"><span>{t('ui.damage')}</span><span className="text-white font-bold">{Math.floor(weapon.baseDamage * (1 + (level - 1) * 0.1))}</span></div>
                                            <div className="flex justify-between border-b border-gray-800 pb-1"><span>{t('ui.magazine')}</span><span className="text-white font-bold">{weapon.magSize > 0 ? weapon.magSize : '-'}</span></div>
                                            <div className="flex justify-between border-b border-gray-800 pb-1"><span>{t('ui.range')}</span><span className="text-white font-bold">{weapon.range > 0 ? `${weapon.range}m` : '-'}</span></div>
                                            <div className="flex justify-between border-b border-gray-800 pb-1"><span>{t('ui.reload')}</span><span className="text-white font-bold">{weapon.reloadTime > 0 ? `${(weapon.reloadTime / 1000).toFixed(1)}s` : '-'}</span></div>
                                        </div>
                                    </div>
                                    <div className="flex justify-end">
                                        {isUpgradeable && (
                                            <button
                                                onClick={(e) => handleUpgradeWeapon(e, weapon.name)}
                                                disabled={!canAfford}
                                                className={`w-1/2 h-16 font-black uppercase border-2 transition-all flex flex-col items-center justify-center`}
                                                style={{
                                                    borderColor: canAfford ? scrapYellow : '#1f2937',
                                                    color: canAfford ? scrapYellow : '#4b5563',
                                                    cursor: canAfford ? 'pointer' : 'not-allowed',
                                                    backgroundColor: 'transparent'
                                                }}
                                                onMouseEnter={(e) => { if (canAfford) e.currentTarget.style.backgroundColor = `${scrapYellow}33`; }}
                                                onMouseLeave={(e) => { if (canAfford) e.currentTarget.style.backgroundColor = 'transparent'; }}
                                            >
                                                <span className="text-xl leading-none mb-1">{t('ui.upgrade')}</span>
                                                <span className="text-xs font-bold">{cost} {t('ui.scrap')}</span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </CampModalLayout>
    );
};

export default ScreenArmory;
