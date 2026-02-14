import React, { useState, useMemo } from 'react';
import { PlayerStats } from '../../types';
import { WeaponType, WeaponCategory } from '../../content/weapons';
import { t } from '../../utils/i18n';
import { WEAPONS, SCRAP_COST_BASE } from '../../content/constants';
import { soundManager } from '../../utils/sound';
import CampModalLayout from './CampModalLayout';

interface ScreenArmoryProps {
    stats: PlayerStats;
    currentLoadout: { primary: WeaponType; secondary: WeaponType; throwable: WeaponType; special: WeaponType; };
    weaponLevels: Record<WeaponType, number>;
    onSave: (
        newStats: PlayerStats,
        newLoadout: { primary: WeaponType; secondary: WeaponType; throwable: WeaponType; special: WeaponType; },
        newLevels: Record<WeaponType, number>
    ) => void;
    onClose: () => void;
    isMobileDevice?: boolean;
}

const CATEGORY_COLORS: Record<string, string> = {
    [WeaponCategory.PRIMARY]: '#ef4444',   // Red-500
    [WeaponCategory.SECONDARY]: '#fbbf24', // Yellow-400
    [WeaponCategory.THROWABLE]: '#10b981', // Emerald-500
    [WeaponCategory.SPECIAL]: '#3b82f6',   // Blue-500
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
        if (tempStats.scrap !== stats.scrap) return true;
        if (tempLoadout.primary !== currentLoadout.primary) return true;
        if (tempLoadout.secondary !== currentLoadout.secondary) return true;
        if (tempLoadout.throwable !== currentLoadout.throwable) return true;
        if (tempLoadout.special !== currentLoadout.special) return true;

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
                {/* Tabs bar - Ensure horizontal scroll on mobile */}
                <div className="flex gap-2 md:gap-4 border-b-2 border-gray-800 pb-2 md:pb-4 overflow-x-auto no-scrollbar pl-2 pt-2 min-h-[50px] md:min-h-[80px] items-end shrink-0 scroll-smooth">
                    {[WeaponCategory.PRIMARY, WeaponCategory.SECONDARY, WeaponCategory.THROWABLE, WeaponCategory.SPECIAL, WeaponCategory.TOOL].map(cat => {
                        const isActive = activeTab === cat;
                        const catColor = CATEGORY_COLORS[cat] || '#ffffff';
                        const catKey = 'categories.' + cat.toLowerCase();

                        return (
                            <button key={cat} onClick={() => { setActiveTab(cat as WeaponCategory); soundManager.playUiClick(); }}
                                className={`px-3 md:px-6 py-1.5 md:py-4 text-[10px] md:text-lg font-black uppercase tracking-widest transition-all skew-x-[-10deg] border-2 hover:brightness-110 whitespace-nowrap inline-block`}
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
                </div>

                {isMobileDevice && (
                    <div className="flex justify-between items-center bg-yellow-900/10 px-3 py-2 border border-yellow-500/30 shrink-0">
                        <span className="text-[10px] font-bold text-yellow-500 uppercase">{t('ui.scrap')}</span>
                        <div className="flex items-center gap-2">
                            <span className="text-lg font-black text-white">{tempStats.scrap}</span>
                        </div>
                    </div>
                )}

                {/* Main Content Area */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6 overflow-y-auto pb-4 pr-1 custom-scrollbar">
                    {Object.values(WEAPONS).filter(w => w.category === activeTab).map((weapon) => {
                        const level = tempWeaponLevels[weapon.name] || 1;
                        const cost = SCRAP_COST_BASE * level;
                        const isEquipped = tempLoadout.primary === weapon.name || tempLoadout.secondary === weapon.name || tempLoadout.throwable === weapon.name || tempLoadout.special === weapon.name;
                        const canAfford = tempStats.scrap >= cost;
                        const categoryColor = CATEGORY_COLORS[weapon.category];
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
                                    <div className={`${isMobileDevice ? 'w-20 h-20' : 'w-24 h-24'} transition-transform group-hover:scale-110 duration-500`} dangerouslySetInnerHTML={{ __html: weapon.icon }} style={{ color: categoryColor }} />

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
                                            {!isMobileDevice && (
                                                <>
                                                    <div className="flex justify-between border-b border-gray-800/50 pb-0.5">
                                                        <span className="opacity-60">{t('ui.magazine')}</span>
                                                        <span className="text-white font-bold">{weapon.magSize > 0 ? weapon.magSize : '-'}</span>
                                                    </div>
                                                    <div className="flex justify-between border-b border-gray-800/50 pb-0.5">
                                                        <span className="opacity-60">{t('ui.reload')}</span>
                                                        <span className="text-white font-bold">{weapon.reloadTime > 0 ? `${(weapon.reloadTime / 1000).toFixed(1)}s` : '-'}</span>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex gap-2 items-center mt-auto">
                                        {isUpgradeable && (
                                            <button
                                                onClick={(e) => handleUpgradeWeapon(e, weapon.name)}
                                                disabled={!canAfford}
                                                className={`flex-1 ${isMobileDevice ? 'h-8' : 'h-12'} font-black uppercase border-2 transition-all flex flex-col items-center justify-center transform active:scale-95`}
                                                style={{
                                                    borderColor: canAfford ? scrapYellow : '#1f2937',
                                                    color: canAfford ? '#fff' : '#4b5563',
                                                    cursor: canAfford ? 'pointer' : 'not-allowed',
                                                    backgroundColor: canAfford ? `${scrapYellow}20` : 'transparent'
                                                }}
                                            >
                                                <span className={`${isMobileDevice ? 'text-[10px]' : 'text-sm'} leading-none`}>{t('ui.upgrade')}</span>
                                                <span className={`${isMobileDevice ? 'text-[7px]' : 'text-[9px]'} font-bold text-yellow-500`}>{cost}</span>
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
