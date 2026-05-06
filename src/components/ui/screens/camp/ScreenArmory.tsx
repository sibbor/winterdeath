import React, { useState, useMemo, useCallback } from 'react';
import { PlayerStats, PlayerStatID } from '../../../../entities/player/PlayerTypes';
import { WeaponType, WeaponCategory, WeaponCategoryColors, WeaponStats } from '../../../../content/weapons';
import { t } from '../../../../utils/i18n';
import { SCRAP_COST_BASE } from '../../../../content/constants';
import { UiSounds } from '../../../../utils/audio/AudioLib';
import { DataResolver } from '../../../../utils/ui/DataResolver';
import { useOrientation } from '../../../../hooks/useOrientation';
import ScreenModalLayout, { HORIZONTAL_HATCHING_STYLE, TacticalCard, TacticalButton } from '../../layout/ScreenModalLayout';

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

// PRESTANDA-OPTIMERING: Denna logik låg i loopen förut.
const darkenColor = (hex: string, percent: number) => {
    try {
        const h = hex.startsWith('#') ? hex : '#ffffff';
        const num = parseInt(h.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = (num >> 16) - amt;
        const G = (num >> 8 & 0x00FF) - amt;
        const B = (num & 0x0000FF) - amt;
        return '#' + (0x1000000 + (R < 255 ? R < 0 ? 0 : R : 255) * 0x10000 + (G < 255 ? G < 0 ? 0 : G : 255) * 0x100 + (B < 255 ? B < 0 ? 0 : B : 255)).toString(16).slice(1);
    } catch (e) { return hex; }
};

const ScreenArmory: React.FC<ScreenArmoryProps> = React.memo(({ stats, currentLoadout, weaponLevels, onSave, onClose, isMobileDevice }) => {
    const { isLandscapeMode } = useOrientation();
    const effectiveLandscape = isLandscapeMode || !isMobileDevice;
    const [activeTab, setActiveTab] = useState<WeaponCategory>(WeaponCategory.PRIMARY);

    // Vi behåller lokalt state så man kan ångra ("Cancel") innan man sparar.
    const [tempStats, setTempStats] = useState({ ...stats });
    const [tempLoadout, setTempLoadout] = useState({ ...currentLoadout });
    const [tempWeaponLevels, setTempWeaponLevels] = useState({ ...weaponLevels });

    // PERFORMANCE FIX: useCallback förhindrar att barn-komponenter renderas om i onödan.
    const handleUpgradeWeapon = useCallback((e: React.MouseEvent, weapon: WeaponType) => {
        e.stopPropagation();
        UiSounds.playUpgrade();

        // Use a functional state update to ensure we have the latest levels without needing it in the dependency array
        setTempWeaponLevels(prevLevels => {
            const level = prevLevels[weapon] || 1;
            const cost = SCRAP_COST_BASE * level;

            // Check scrap dynamically
            setTempStats(prevStats => {
                const scrap = prevStats.statsBuffer[PlayerStatID.SCRAP];
                if (scrap >= cost) {
                    const newStats = { ...prevStats };
                    newStats.statsBuffer = new Float32Array(prevStats.statsBuffer);
                    newStats.statsBuffer[PlayerStatID.SCRAP] -= cost;
                    return newStats;
                }
                return prevStats;
            });

            // Return updated or old levels based on scrap check (we rely on the component re-render to reflect the actual success)
            return { ...prevLevels, [weapon]: level + 1 };
        });
    }, []);

    const handleEquip = useCallback((weapon: WeaponType, category: WeaponCategory) => {
        if (category === WeaponCategory.TOOL) return;

        UiSounds.playConfirm();
        setTempLoadout(prev => {
            if (category === WeaponCategory.PRIMARY) return { ...prev, primary: weapon };
            if (category === WeaponCategory.SECONDARY) return { ...prev, secondary: weapon };
            if (category === WeaponCategory.THROWABLE) return { ...prev, throwable: weapon };
            if (category === WeaponCategory.SPECIAL) return { ...prev, special: weapon };
            return prev;
        });
    }, []);

    const hasChanges = useMemo(() => {
        if (tempStats.statsBuffer[PlayerStatID.SCRAP] !== stats.statsBuffer[PlayerStatID.SCRAP]) return true;
        if (tempLoadout.primary !== currentLoadout.primary) return true;
        if (tempLoadout.secondary !== currentLoadout.secondary) return true;
        if (tempLoadout.throwable !== currentLoadout.throwable) return true;
        if (tempLoadout.special !== currentLoadout.special) return true;

        const weaponIds = Object.keys(DataResolver.getWeapons()).map(Number) as unknown as WeaponType[];
        for (const k of weaponIds) {
            if ((tempWeaponLevels[k] || 1) !== (weaponLevels[k] || 1)) return true;
        }
        return false;
    }, [tempStats, tempLoadout, tempWeaponLevels, stats, currentLoadout, weaponLevels]);

    const handleConfirm = useCallback(() => {
        if (hasChanges) {
            onSave(tempStats, tempLoadout, tempWeaponLevels);
        } else {
            onClose();
        }
    }, [hasChanges, onSave, onClose, tempStats, tempLoadout, tempWeaponLevels]);

    const scrapSubtitle = useMemo(() => (
        <div className="flex flex-col gap-1 mt-2">
            <div className="px-3 py-1 bg-yellow-950/40 border border-yellow-500/50 shadow-[0_0_15px_rgba(234,179,8,0.2)] flex items-center gap-3 w-fit">
                <span className="text-[10px] font-black text-yellow-500 uppercase tracking-widest">{t('ui.scrap')}</span>
                <span className="text-xl font-mono font-black text-white">{tempStats.statsBuffer[PlayerStatID.SCRAP]}</span>
            </div>
        </div>
    ), [tempStats.statsBuffer[PlayerStatID.SCRAP]]);

    const TABS = [WeaponCategory.PRIMARY, WeaponCategory.SECONDARY, WeaponCategory.THROWABLE, WeaponCategory.SPECIAL, WeaponCategory.TOOL];

    return (
        <ScreenModalLayout
            title={t('stations.armory')}
            subtitle={scrapSubtitle}
            isMobileDevice={isMobileDevice}
            onClose={onClose}
            onConfirm={handleConfirm}
            confirmLabel={t('ui.confirm_loadout')}
            closeLabel={hasChanges ? t('ui.cancel') : t('ui.close')}
            canConfirm={hasChanges}
            titleColorClass="text-yellow-600"
            tabs={TABS}
            activeTab={activeTab}
            onTabChange={(cat) => { setActiveTab(cat as WeaponCategory); UiSounds.playClick(); }}
            tabOrientation={effectiveLandscape ? 'vertical' : 'horizontal'}
        >
            <div className={`flex h-full ${effectiveLandscape ? 'flex-row gap-8 pl-safe' : 'flex-col gap-4'}`}>
                {/* Tabs bar */}
                <div className={`relative shrink-0 ${effectiveLandscape ? 'w-1/3 flex flex-col gap-4 overflow-y-auto pl-safe custom-scrollbar' : ''}`}>
                    <div className={`${effectiveLandscape ? 'flex flex-col gap-4 pt-4 pr-10' : 'flex gap-2 border-b-2 border-gray-800 pb-2 md:pb-4 overflow-x-auto px-4 pt-2 items-end scrollbar-hide'}`}>
                        {TABS.map(cat => {
                            const isActive = activeTab === cat;
                            const catColor = WeaponCategoryColors[cat as keyof typeof WeaponCategoryColors] || '#ffffff';
                            const catName = DataResolver.getWeaponCategoryName(cat);

                            return (
                                <button
                                    key={cat}
                                    onClick={() => { setActiveTab(cat as WeaponCategory); UiSounds.playClick(); }}
                                    className={`relative px-3 md:px-6 py-1.5 md:py-4 transition-all duration-200 hover:scale-105 active:scale-95 whitespace-nowrap flex justify-between items-center border-2 border-zinc-700
                                        ${isActive
                                            ? 'text-white animate-tab-pulsate'
                                            : 'bg-transparent text-zinc-400 hover:bg-white/5 shadow-none'
                                        } 
                                        ${effectiveLandscape ? 'w-full text-left p-4 md:p-6 text-xl font-semibold uppercase tracking-wider mx-2' : 'text-[10px] md:text-lg font-bold uppercase tracking-widest'}
                                    `}
                                    style={isActive ? { backgroundColor: catColor + '33', '--pulse-color': catColor } as any : {}}
                                >
                                    {isActive && (
                                        <div className="absolute inset-0 opacity-20 transition-opacity"
                                            style={HORIZONTAL_HATCHING_STYLE}
                                        />
                                    )}
                                    <span className="relative z-10">{t(catName)}</span>
                                    {isActive && effectiveLandscape && <span className="text-white font-bold ml-2 relative z-10">→</span>}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="flex-1 flex flex-col min-w-0 pr-safe min-h-0">
                    <WeaponList
                        activeTab={activeTab}
                        tempWeaponLevels={tempWeaponLevels}
                        tempLoadout={tempLoadout}
                        scrapAmount={tempStats.statsBuffer[PlayerStatID.SCRAP]}
                        isMobileDevice={isMobileDevice}
                        isLandscapeMode={isLandscapeMode}
                        onEquip={handleEquip}
                        onUpgrade={handleUpgradeWeapon}
                    />
                </div>
            </div>
        </ScreenModalLayout>
    );
});

// --- SUB COMPONENTS (MEMOIZED FOR PERFORMANCE) ---

interface WeaponListProps {
    activeTab: WeaponCategory;
    tempWeaponLevels: Record<number, number>;
    tempLoadout: any;
    scrapAmount: number;
    isMobileDevice?: boolean;
    isLandscapeMode?: boolean;
    onEquip: (weapon: WeaponType, category: WeaponCategory) => void;
    onUpgrade: (e: React.MouseEvent, weapon: WeaponType) => void;
}

const WeaponList: React.FC<WeaponListProps> = React.memo(({ activeTab, tempWeaponLevels, tempLoadout, scrapAmount, isMobileDevice, isLandscapeMode, onEquip, onUpgrade }) => {
    // PERFORMANCE FIX: Sorterar och hämtar vapen endast när man byter flik, inte varje gång Scrap ändras.
    const filteredWeapons = useMemo(() => {
        return Object.values(DataResolver.getWeapons()).filter(w => w.category === activeTab && !w.isPseudoWeapon);
    }, [activeTab]);

    return (
        <div className={`${isMobileDevice && !isLandscapeMode ? 'flex flex-col gap-10' : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'} overflow-y-auto pb-8 pr-1 custom-scrollbar`}>
            {filteredWeapons.map((weapon) => {
                const level = tempWeaponLevels[weapon.name] || 1;
                const cost = SCRAP_COST_BASE * level;
                const isEquipped = tempLoadout.primary === weapon.name || tempLoadout.secondary === weapon.name || tempLoadout.throwable === weapon.name || tempLoadout.special === weapon.name;
                const canAfford = scrapAmount >= cost;
                const categoryColor = WeaponCategoryColors[weapon.category as keyof typeof WeaponCategoryColors];
                const isEquippable = weapon.category !== WeaponCategory.TOOL;
                const isUpgradeable = isEquippable;

                return (
                    <WeaponCard
                        key={weapon.name}
                        weapon={weapon}
                        level={level}
                        cost={cost}
                        isEquipped={isEquipped}
                        canAfford={canAfford}
                        categoryColor={categoryColor as string}
                        isEquippable={isEquippable}
                        isUpgradeable={isUpgradeable}
                        isMobileDevice={isMobileDevice}
                        onEquip={onEquip}
                        onUpgrade={onUpgrade}
                    />
                );
            })}
        </div>
    );
});

interface WeaponCardProps {
    weapon: WeaponStats;
    level: number;
    cost: number;
    isEquipped: boolean;
    canAfford: boolean;
    categoryColor: string;
    isEquippable: boolean;
    isUpgradeable: boolean;
    isMobileDevice?: boolean;
    onEquip: (weapon: WeaponType, category: WeaponCategory) => void;
    onUpgrade: (e: React.MouseEvent, weapon: WeaponType) => void;
}

const WeaponCard: React.FC<WeaponCardProps> = React.memo(({
    weapon, level, cost, isEquipped, canAfford, categoryColor,
    isEquippable, isUpgradeable, isMobileDevice, onEquip, onUpgrade
}) => {
    const isPrimaryColor = categoryColor.toLowerCase() === '#ff3333' || categoryColor.toLowerCase() === 'red';

    return (
        <TacticalCard
            onClick={() => !isEquipped && isEquippable && onEquip(weapon.name, weapon.category)}
            isLocked={!isEquipped && !isEquippable}
            color={categoryColor}
            showHover={!isEquipped}
            className={`flex flex-col p-0 transition-all duration-300 ${isEquipped ? 'cursor-default' : (isEquippable ? 'hover:bg-gray-800/40 cursor-pointer' : 'cursor-default')}`}
            style={{
                borderColor: isEquipped ? categoryColor : 'rgba(63, 63, 70, 0.5)',
                borderWidth: '2px',
                boxShadow: isEquipped ? `0 0 30px ${categoryColor}22, inset 0 0 20px ${categoryColor}11` : 'none',
                minHeight: isMobileDevice ? 'auto' : '300px',
                backgroundColor: isEquipped ? `${categoryColor}15` : 'transparent'
            }}
        >
            {isEquipped && (
                <div className="absolute inset-0 opacity-10 pointer-events-none" style={HORIZONTAL_HATCHING_STYLE} />
            )}

            {/* Top Side (Image & Level) */}
            <div
                className={`w-full flex flex-col border-b relative shrink-0 transition-colors duration-300`}
                style={{ borderColor: isEquipped ? `${categoryColor}44` : 'rgba(63, 63, 70, 0.5)' }}
            >
                <div className={`${isMobileDevice ? 'h-32 min-h-[128px]' : 'h-40'} border-b border-white/5 w-full flex items-center justify-center relative overflow-hidden`}>
                    {isEquipped && (
                        <div className="absolute inset-0 bg-gradient-to-t from-transparent via-white/5 to-transparent animate-pulse" />
                    )}
                    <div className="transition-transform group-hover:scale-110 duration-700 relative z-10">
                        {weapon.iconIsPng ? (
                            <img src={weapon.icon} alt="" className={`w-full h-full object-contain filter brightness-0 invert ${isEquipped ? 'opacity-100' : 'opacity-60'}`} />
                        ) : (
                            <div className={`w-16 h-16 md:w-24 md:h-24 ${isEquipped ? 'opacity-100' : 'opacity-60'}`} dangerouslySetInnerHTML={{ __html: weapon.icon }} style={{ color: categoryColor }} />
                        )}
                    </div>
                </div>

                {isUpgradeable && (
                    <TacticalButton
                        onClick={(e) => onUpgrade(e, weapon.name)}
                        disabled={!canAfford}
                        variant={canAfford ? 'primary' : 'ghost'}
                        className="w-full h-10 text-[10px] border-none font-mono"
                        style={canAfford ? { backgroundColor: 'rgba(234, 179, 8, 0.1)', color: '#eab308' } : { opacity: 0.4 }}
                    >
                        <span className="opacity-60 mr-1.5">{t('ui.upgrade')}</span>
                        <span className="font-bold">[{cost}]</span>
                    </TacticalButton>
                )}

                <div className={`absolute top-0 left-0 ${isMobileDevice ? 'text-[9px] px-2 py-1' : 'text-[11px] px-3 py-1.5'} font-mono font-bold bg-zinc-950 border-r border-b border-white/10 text-zinc-400 tracking-tighter uppercase`}>
                    {t('ui.lvl')} {level}
                </div>

                {isEquipped && (
                    <div className={`absolute top-0 right-0 ${isMobileDevice ? 'w-6 h-6' : 'w-8 h-8'} bg-zinc-950 border-l border-b border-white/10 flex items-center justify-center`}>
                        <div
                            className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full shadow-[0_0_10px_currentColor]"
                            style={{ backgroundColor: categoryColor, color: categoryColor }}
                        />
                    </div>
                )}
            </div>

            {/* Bottom Side (Stats) */}
            <div className={`flex-1 flex flex-col justify-between ${isMobileDevice ? 'p-3 min-w-0' : 'p-6 gap-4'}`}>
                <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                        <h3 className={`${isMobileDevice ? 'text-lg leading-tight' : 'text-xl'} font-bold uppercase tracking-tight truncate`}
                            style={{ color: isEquipped ? 'white' : 'rgba(255,255,255,0.7)' }}>
                            {t(DataResolver.getWeaponName(weapon.name))}
                        </h3>
                    </div>

                    <div className={`flex flex-col gap-y-1.5 ${isMobileDevice ? 'text-[11px]' : 'text-[13px]'} font-mono`}>
                        <div className="flex justify-between items-center py-1 border-b border-white/5">
                            <span className="text-zinc-500 uppercase text-[10px] tracking-widest">{t('ui.damage')}</span>
                            <div className="flex items-center gap-2">
                                <span className="text-yellow-500 font-bold">
                                    {Math.floor(weapon.damage + (weapon.damage * (level - 1) * 0.1))}
                                </span>
                                <span className="text-[9px] text-zinc-600 font-bold italic">
                                    +{Math.floor(weapon.damage * (level - 1) * 0.1)}
                                </span>
                            </div>
                        </div>
                        <div className="flex justify-between items-center py-1 border-b border-white/5">
                            <span className="text-zinc-500 uppercase text-[10px] tracking-widest">{t('ui.range')}</span>
                            <span className="text-zinc-300 font-bold">{weapon.range > 0 ? `${weapon.range}m` : '-'}</span>
                        </div>
                        {weapon.radius && weapon.radius > 0 && (
                            <div className="flex justify-between items-center py-1 border-b border-white/5">
                                <span className="text-zinc-500 uppercase text-[10px] tracking-widest">{t('ui.radius')}</span>
                                <span className="text-zinc-300 font-bold">{weapon.radius}m</span>
                            </div>
                        )}
                        {weapon.magSize && weapon.magSize > 0 && (
                            <div className="flex justify-between items-center py-1 border-b border-white/5">
                                <span className="text-zinc-500 uppercase text-[10px] tracking-widest">{t('ui.magazine')}</span>
                                <span className="text-zinc-300 font-bold">{weapon.magSize}</span>
                            </div>
                        )}
                        {weapon.reloadTime && weapon.reloadTime > 0 && (
                            <div className="flex justify-between items-center py-1 border-b border-white/5">
                                <span className="text-zinc-500 uppercase text-[10px] tracking-widest">{t('ui.reload')}</span>
                                <span className="text-zinc-300 font-bold">{(weapon.reloadTime / 1000).toFixed(1)}s</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </TacticalCard>
    );
});

export default ScreenArmory;