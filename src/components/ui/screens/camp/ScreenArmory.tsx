import React, { useState, useMemo } from 'react';
import { PlayerStats } from '../../../../entities/player/PlayerTypes';;
import { WeaponType, WeaponCategory, WeaponCategoryColors } from '../../../../content/weapons';
import { t } from '../../../../utils/i18n';
import { WEAPONS, SCRAP_COST_BASE } from '../../../../content/constants';
import { soundManager } from '../../../../utils/SoundManager';
import { useOrientation } from '../../../../hooks/useOrientation';
import ScreenModalLayout from '../../layout/ScreenModalLayout';

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

const ScreenArmory: React.FC<ScreenArmoryProps> = ({ stats, currentLoadout, weaponLevels, onSave, onClose, isMobileDevice }) => {
    const { isLandscapeMode } = useOrientation();
    const effectiveLandscape = isLandscapeMode || !isMobileDevice;
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

    const scrapHeader = (
        <div className={`px-4 py-1.5 border bg-black border-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.3)] flex flex-col items-start gap-0`}>
            <span className={`text-[9px] block uppercase font-bold text-yellow-500 leading-tight opacity-70`}>{t('ui.scrap')}</span>
            <span className={`text-xl md:text-2xl font-bold font-mono text-yellow-400 leading-none`}>{tempStats.scrap}</span>
        </div>
    );

    const darkenColor = (hex: string, percent: number) => {
        const num = parseInt(hex.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = (num >> 16) - amt;
        const G = (num >> 8 & 0x00FF) - amt;
        const B = (num & 0x0000FF) - amt;
        return '#' + (0x1000000 + (R < 255 ? R < 0 ? 0 : R : 255) * 0x10000 + (G < 255 ? G < 0 ? 0 : G : 255) * 0x100 + (B < 255 ? B < 0 ? 0 : B : 255)).toString(16).slice(1);
    };

    return (
        <ScreenModalLayout
            title={t('stations.armory')}
            isMobileDevice={isMobileDevice}
            onClose={onClose}
            onConfirm={handleConfirm}
            confirmLabel={t('ui.confirm_loadout')}
            closeLabel={hasChanges ? t('ui.cancel') : t('ui.close')}
            canConfirm={hasChanges}
            extraHeaderContent={scrapHeader}
            titleColorClass="text-yellow-600"
            tabs={[WeaponCategory.PRIMARY, WeaponCategory.SECONDARY, WeaponCategory.THROWABLE, WeaponCategory.SPECIAL, WeaponCategory.TOOL]}
            activeTab={activeTab}
            onTabChange={(cat) => { setActiveTab(cat as WeaponCategory); soundManager.playUiClick(); }}
            tabOrientation={effectiveLandscape ? 'vertical' : 'horizontal'}
        >
            <div className={`flex h-full ${effectiveLandscape ? 'flex-row gap-8 pl-safe' : 'flex-col gap-4'}`}>
                {/* Tabs bar */}
                <div className={`relative shrink-0 ${effectiveLandscape ? 'w-1/3 flex flex-col gap-4 overflow-y-auto pl-safe custom-scrollbar' : ''}`}>
                    <div className={`${effectiveLandscape ? 'flex flex-col gap-4 pt-4 pr-10' : 'flex gap-2 border-b-2 border-gray-800 pb-2 md:pb-4 overflow-x-auto px-4 pt-2 items-end scrollbar-hide'}`}>
                        {[WeaponCategory.PRIMARY, WeaponCategory.SECONDARY, WeaponCategory.THROWABLE, WeaponCategory.SPECIAL, WeaponCategory.TOOL].map(cat => {
                            const isActive = activeTab === cat;
                            const catColor = WeaponCategoryColors[cat as keyof typeof WeaponCategoryColors] || '#ffffff';
                            const catKey = 'categories.' + cat.toLowerCase();

                            return (
                                <button key={cat} onClick={() => { setActiveTab(cat as WeaponCategory); soundManager.playUiClick(); }}
                                    className={`px-3 md:px-6 py-1.5 md:py-4 transition-all duration-200 hover:scale-105 active:scale-95 whitespace-nowrap flex justify-between items-center border-2 border-zinc-700
                                        ${isActive
                                            ? 'text-white animate-tab-pulsate'
                                            : 'bg-black text-zinc-400 hover:bg-zinc-900 shadow-none'
                                        } 
                                        ${effectiveLandscape ? 'w-full text-left p-4 md:p-6 text-xl font-semibold uppercase tracking-wider mx-2' : 'text-[10px] md:text-lg font-bold uppercase tracking-widest'}
                                    `}
                                    style={isActive ? { 
                                        backgroundColor: darkenColor(catColor, 20),
                                        '--pulse-color': catColor 
                                    } as any : {}}
                                >
                                    <span>{t(catKey)}</span>
                                    {isActive && effectiveLandscape && <span className="text-white font-bold ml-2">→</span>}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="flex-1 flex flex-col min-w-0 pr-safe min-h-0">
                     {/* Main Content Area */}
                    <div className={`${isMobileDevice && !isLandscapeMode ? 'flex flex-col gap-10' : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'} overflow-y-auto pb-8 pr-1 custom-scrollbar`}>
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
                                className={`relative border-2 transition-all group overflow-hidden flex self-start flex-col
                                    ${isEquipped ? 'cursor-default' : (isEquippable ? 'hover:bg-gray-800/60 cursor-pointer' : 'cursor-default')}
                                `}
                                style={{
                                    borderColor: isEquipped ? categoryColor : '#374151',
                                    backgroundColor: isEquipped ? `${categoryColor}15` : 'rgba(17, 24, 39, 0.4)',
                                    boxShadow: isEquipped ? `0 0 15px ${categoryColor}44` : 'none',
                                    minHeight: isMobileDevice ? 'auto' : '300px'
                                }}
                            >
                                {/* Top Side (Image & Level) */}
                                 <div
                                    className={`w-full flex flex-col border-b relative shrink-0 bg-black/40`}
                                    style={{ borderColor: isEquipped ? categoryColor : '#374151' }}
                                >
                                    <div className={`${isMobileDevice ? 'h-32 min-h-[128px]' : 'h-40'} border-b border-gray-800/50 w-full flex items-center justify-center transition-transform group-hover:scale-110 duration-500`}>
                                        {weapon.iconIsPng ? (
                                            <img src={weapon.icon} alt="" className="w-full h-full object-contain filter brightness-0 invert" />
                                        ) : (
                                            <div className="w-16 h-16 md:w-24 md:h-24" dangerouslySetInnerHTML={{ __html: weapon.icon }} style={{ color: categoryColor }} />
                                        )}
                                    </div>


                                    {/* Upgrade Button UNDER image */}
                                    {isUpgradeable && (
                                        <button
                                            onClick={(e) => handleUpgradeWeapon(e, weapon.name)}
                                            disabled={!canAfford}
                                            className={`w-full py-2.5 px-2 text-[10px] font-bold uppercase transition-all duration-200 hover:scale-105 active:scale-95 flex items-center justify-center transform ${canAfford
                                                ? 'bg-yellow-950/20 text-yellow-500 hover:bg-yellow-950/40 shadow-inner'
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

                                {/* Bottom Side (Stats) */}
                                <div className={`flex-1 flex flex-col justify-between ${isMobileDevice ? 'p-2 min-w-0' : 'p-5 gap-4'}`}>
                                    <div className="min-w-0">
                                        <h3 className={`${isMobileDevice ? 'text-lg leading-tight' : 'text-2xl'} font-semibold uppercase tracking-tighter truncate mb-1`}
                                            style={{ color: isEquipped ? categoryColor : 'white' }}>
                                            {t(weapon.displayName)}
                                        </h3>

                                        <div className={`flex flex-col gap-y-2 ${isMobileDevice ? 'text-xs' : 'text-sm'} font-mono text-gray-400`}>
                                            <div className="flex justify-between border-b border-gray-800/50 pb-1">
                                                <span className="opacity-60">{t('ui.damage')}</span>
                                                <div className="flex items-baseline gap-1.5">
                                                    <span className="text-yellow-500 font-bold text-lg leading-none">
                                                        {Math.floor(weapon.baseDamage + (weapon.baseDamage * (level - 1) * 0.1))}
                                                    </span>
                                                    <span className="text-white text-[10px] font-bold opacity-80 whitespace-nowrap">
                                                        ({Math.floor(weapon.baseDamage)} + <span className="text-yellow-500">{Math.floor(weapon.baseDamage * (level - 1) * 0.1)}</span>)
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex justify-between border-b border-gray-800/50 pb-1">
                                                <span className="opacity-60">{t('ui.range')}</span>
                                                <span className="text-white font-bold">{weapon.range > 0 ? `${weapon.range}m` : '-'}</span>
                                            </div>
                                            {(isMobileDevice || weapon.category !== WeaponCategory.THROWABLE) && (
                                                <>
                                                    <div className="flex justify-between border-b border-gray-800/50 pb-1">
                                                        <span className="opacity-60">{t('ui.magazine')}</span>
                                                        <span className="text-white font-bold">{weapon.magSize > 0 ? weapon.magSize : '-'}</span>
                                                    </div>
                                                    <div className="flex justify-between border-b border-gray-800/50 pb-1">
                                                        <span className="opacity-60">{t('ui.reload')}</span>
                                                        <span className="text-white font-bold">{weapon.reloadTime > 0 ? `${(weapon.reloadTime / 1000).toFixed(1)}s` : '-'}</span>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    </div>
                </div>
            </div>
        </ScreenModalLayout>
    );
};

export default ScreenArmory;
