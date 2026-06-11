import React, { useState, useMemo, useCallback } from 'react';
import { SectorState } from '../../../types/StateTypes';
import { CareerStats } from '../../../types/CareerStats';
import { WeaponCategory, WeaponCategoryColors } from '../../../content/weapons';
import { WeaponStats } from '../../../content/weapons';
import { WeaponID } from '../../../entities/player/CombatTypes';
import { t } from '../../../utils/i18n';
import { SCRAP_COST_BASE } from '../../../content/constants';
import { UISounds } from '../../../utils/audio/AudioLib';
import { DataResolver } from '../../../core/data/DataResolver';
import ModalLayout, { TacticalTab } from './ModalLayout';
import { StatsBridge } from '../../../core/data/StatsBridge';

interface ArmoryTerminalProps {
    stats: CareerStats;
    sectorState: SectorState;
    currentLoadout: { primary: WeaponID; secondary: WeaponID; throwable: WeaponID; special: WeaponID; };
    weaponLevels: Record<WeaponID, number>;
    onSave: (
        newStats: CareerStats,
        newLoadout: { primary: WeaponID; secondary: WeaponID; throwable: WeaponID; special: WeaponID; },
        newLevels: Record<WeaponID, number>,
        newSectorState: SectorState
    ) => void;
    onClose: () => void;
    isMobileDevice?: boolean;
}

const ScreenTerminalArmory: React.FC<ArmoryTerminalProps> = ({ stats, sectorState, currentLoadout, weaponLevels, onSave, onClose, isMobileDevice }) => {
    const [activeTab, setActiveTab] = useState<WeaponCategory>(WeaponCategory.PRIMARY);
    const [tempStats, setTempStats] = useState(() => StatsBridge.deepCloneStats(stats));
    const [tempLoadout, setTempLoadout] = useState(() => ({ ...currentLoadout }));
    const [tempWeaponLevels, setTempWeaponLevels] = useState(() => ({ ...weaponLevels }));
    const [tempSectorState, setTempSectorState] = useState(() => ({ ...sectorState }));

    // Transactional upgrade — mirrors ScreenArmory pattern (GC allocation acceptable on explicit user click)
    const handleUpgradeWeapon = useCallback((e: React.MouseEvent, weapon: WeaponID) => {
        e.stopPropagation();
        UISounds.playClick();

        setTempStats(prevStats => {
            const level = tempWeaponLevels[weapon] || 1;
            const cost = SCRAP_COST_BASE * level;
            if (StatsBridge.consumeScrap(prevStats, cost)) {
                setTempWeaponLevels(prev => ({ ...prev, [weapon]: level + 1 }));
                return { ...prevStats };
            }
            return prevStats;
        });
    }, [tempWeaponLevels]);

    const handleEquip = useCallback((weapon: WeaponID, category: WeaponCategory) => {
        UISounds.playConfirm();
        setTempLoadout(prev => {
            if (category === WeaponCategory.PRIMARY) return { ...prev, primary: weapon };
            if (category === WeaponCategory.SECONDARY) return { ...prev, secondary: weapon };
            if (category === WeaponCategory.THROWABLE) return { ...prev, throwable: weapon };
            if (category === WeaponCategory.SPECIAL) return { ...prev, special: weapon };
            return prev;
        });
    }, []);

    const hasChanges = useMemo(() => {
        if (StatsBridge.getScrap(tempStats) !== StatsBridge.getScrap(stats)) return true;
        if (tempLoadout.primary !== currentLoadout.primary) return true;
        if (tempLoadout.secondary !== currentLoadout.secondary) return true;
        if (tempLoadout.throwable !== currentLoadout.throwable) return true;
        if (tempLoadout.special !== currentLoadout.special) return true;
        if (tempSectorState.unlimitedThrowables !== sectorState.unlimitedThrowables) return true;
        if (tempSectorState.noReload !== sectorState.noReload) return true;

        // Zero-GC: iterate via for-loop, no Object.values allocation
        const allWeapons = DataResolver.getWeapons();
        for (let i = 0; i < allWeapons.length; i++) {
            if (!allWeapons[i]) continue;
            const k = allWeapons[i].id;
            if ((tempWeaponLevels[k] || 1) !== (weaponLevels[k] || 1)) return true;
        }

        return false;
    }, [tempStats, tempLoadout, tempWeaponLevels, tempSectorState, stats, currentLoadout, weaponLevels, sectorState]);

    const handleConfirm = useCallback(() => {
        onSave(tempStats, tempLoadout, tempWeaponLevels, tempSectorState);
        onClose();
    }, [tempStats, tempLoadout, tempWeaponLevels, tempSectorState, onSave, onClose]);

    const scrapHeader = (
        <div className={`px-4 py-1.5 border bg-black border-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.3)] flex flex-col items-start gap-0`}>
            <span className={`text-[10px] block uppercase font-bold text-yellow-500 leading-tight opacity-70`}>{t('ui.scrap')}</span>
            <span className={`text-xl md:text-2xl font-bold font-mono text-yellow-400 leading-none`}>{StatsBridge.getScrap(tempStats)}</span>
        </div>
    );

    return (
        <ModalLayout
            title={t('stations.armory')}
            isMobileDevice={isMobileDevice}
            onClose={onClose}
            onConfirm={handleConfirm}
            confirmLabel={t('ui.close')}
            extraHeaderContent={scrapHeader}
            titleColorClass="text-yellow-600"
            tabs={[WeaponCategory.PRIMARY, WeaponCategory.SECONDARY, WeaponCategory.THROWABLE, WeaponCategory.SPECIAL]}
            activeTab={activeTab}
            onTabChange={(cat) => { setActiveTab(cat as WeaponCategory); UISounds.playClick(); }}
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
                    <div className="flex flex-nowrap gap-2 md:gap-4 border-b-2 border-gray-800 pb-2 md:pb-4 overflow-x-auto no-scrollbar pt-2 min-h-[50px] md:min-h-[80px] items-end scroll-smooth">
                        <TacticalTab key={WeaponCategory.PRIMARY} label={t(DataResolver.getWeaponCategoryName(WeaponCategory.PRIMARY))} isActive={activeTab === WeaponCategory.PRIMARY} onClick={() => { setActiveTab(WeaponCategory.PRIMARY); UISounds.playClick(); }} />
                        <TacticalTab key={WeaponCategory.SECONDARY} label={t(DataResolver.getWeaponCategoryName(WeaponCategory.SECONDARY))} isActive={activeTab === WeaponCategory.SECONDARY} onClick={() => { setActiveTab(WeaponCategory.SECONDARY); UISounds.playClick(); }} />
                        <TacticalTab key={WeaponCategory.THROWABLE} label={t(DataResolver.getWeaponCategoryName(WeaponCategory.THROWABLE))} isActive={activeTab === WeaponCategory.THROWABLE} onClick={() => { setActiveTab(WeaponCategory.THROWABLE); UISounds.playClick(); }} />
                        <TacticalTab key={WeaponCategory.SPECIAL} label={t(DataResolver.getWeaponCategoryName(WeaponCategory.SPECIAL))} isActive={activeTab === WeaponCategory.SPECIAL} onClick={() => { setActiveTab(WeaponCategory.SPECIAL); UISounds.playClick(); }} />
                    </div>
                </div>

                {/* Main Content Area */}
                <TerminalWeaponList
                    activeTab={activeTab}
                    tempWeaponLevels={tempWeaponLevels}
                    tempLoadout={tempLoadout}
                    scrapAmount={StatsBridge.getScrap(tempStats)}
                    isMobileDevice={isMobileDevice}
                    onEquip={handleEquip}
                    onUpgrade={handleUpgradeWeapon}
                />
            </div>
        </ModalLayout>
    );
};

// --- SUB-COMPONENTS (MEMOIZED) ---

interface TerminalWeaponListProps {
    activeTab: WeaponCategory;
    tempWeaponLevels: Record<number, number>;
    tempLoadout: { primary: WeaponID; secondary: WeaponID; throwable: WeaponID; special: WeaponID; };
    scrapAmount: number;
    isMobileDevice?: boolean;
    onEquip: (weapon: WeaponID, category: WeaponCategory) => void;
    onUpgrade: (e: React.MouseEvent, weapon: WeaponID) => void;
}

const TerminalWeaponList: React.FC<TerminalWeaponListProps> = React.memo(({ activeTab, tempWeaponLevels, tempLoadout, scrapAmount, isMobileDevice, onEquip, onUpgrade }) => {
    // Zero-GC: Filtered list only recomputes when tab changes, not on scrap changes
    const filteredWeapons = useMemo(() => {
        const all = DataResolver.getWeapons();
        const result: WeaponStats[] = [];
        for (let i = 0; i < all.length; i++) {
            if (all[i] && all[i].category === activeTab) result.push(all[i]);
        }
        return result;
    }, [activeTab]);

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6 overflow-y-auto pb-4 pr-1 custom-scrollbar">
            {filteredWeapons.map(weapon => {
                const level = tempWeaponLevels[weapon.id] || 1;
                const cost = SCRAP_COST_BASE * level;
                const isEquipped = tempLoadout.primary === weapon.id || tempLoadout.secondary === weapon.id || tempLoadout.throwable === weapon.id || tempLoadout.special === weapon.id;
                const categoryColor = WeaponCategoryColors[weapon.category as keyof typeof WeaponCategoryColors];
                const canAfford = scrapAmount >= cost;

                return (
                    <div
                        key={weapon.id}
                        onClick={() => !isEquipped && onEquip(weapon.id, weapon.category)}
                        className={`relative border-2 transition-all group overflow-hidden flex flex-col ${isEquipped ? 'cursor-default' : 'hover:bg-gray-800/60 cursor-pointer'}`}
                        style={{
                            borderColor: isEquipped ? categoryColor : '#374151',
                            backgroundColor: isEquipped ? `${categoryColor}15` : 'rgba(17, 24, 39, 0.4)',
                            minHeight: isMobileDevice ? 'auto' : '300px'
                        }}
                    >
                        <div className="w-full flex flex-col border-b relative shrink-0 bg-black/40" style={{ borderColor: isEquipped ? categoryColor : '#374151' }}>
                            <div className={`${isMobileDevice ? 'h-32' : 'h-40'} border-b border-gray-800/50 w-full flex items-center justify-center transition-transform group-hover:scale-110 duration-500`}>
                                <img src={weapon.icon} alt="" className={`${isMobileDevice ? 'w-20 h-20' : 'w-24 h-24'} object-contain filter brightness-0 invert`} />
                            </div>
                            <button
                                onClick={(e) => onUpgrade(e, weapon.id)}
                                disabled={!canAfford}
                                className={`w-full py-2.5 px-2 text-[10px] font-bold uppercase transition-all duration-200 hover:scale-105 active:scale-95 flex items-center justify-center transform ${canAfford ? 'bg-yellow-950/20 text-yellow-500 hover:bg-yellow-950/40' : 'bg-black text-gray-700 cursor-not-allowed'}`}
                            >
                                {t('ui.upgrade')} ({cost})
                            </button>
                            <div className={`absolute top-0 left-0 bg-gray-900/80 ${isMobileDevice ? 'text-[10px] px-1.5 py-0.5' : 'text-sm px-3 py-1'} font-bold text-gray-400 border-r border-b border-gray-700`}>
                                {t('ui.lvl')} {level}
                            </div>
                            {isEquipped && (
                                <div className="absolute top-0 right-0 px-1.5 py-0.5 bg-white text-black font-bold uppercase tracking-tighter text-[10px] border-b border-l border-black shadow-lg z-20">
                                    {t('ui.equipped')}
                                </div>
                            )}
                        </div>
                        <div className={`flex-1 flex flex-col justify-between ${isMobileDevice ? 'p-2 min-w-0' : 'p-5 gap-4'}`}>
                            <div className="min-w-0">
                                <h3 className={`${isMobileDevice ? 'text-lg leading-tight' : 'text-2xl'} font-semibold uppercase tracking-tighter truncate mb-1`} style={{ color: isEquipped ? categoryColor : 'white' }}>
                                    {t(weapon.displayName)}
                                </h3>
                                <div className={`flex flex-col gap-y-1 ${isMobileDevice ? 'text-[10px]' : 'text-xs'} font-mono text-gray-400`}>
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
    );
});

export default ScreenTerminalArmory;