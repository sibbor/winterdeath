
import React from 'react';
import { t } from '../../utils/i18n';
import GameModalLayout from './GameModalLayout';
import { BOSSES } from '../../content/constants';
import { SectorStats } from '../../types';

interface ScreenBossKilledProps {
    sectorIndex: number;
    onProceed: () => void;
    stats?: SectorStats;
    isMobileDevice?: boolean;
}

const ScreenBossKilled: React.FC<ScreenBossKilledProps> = ({ sectorIndex, onProceed, stats, isMobileDevice }) => {
    const bossData = BOSSES[sectorIndex];
    const buttonStyle = "px-8 py-4 font-black uppercase tracking-wider transition-all duration-200 border-2 shadow-lg hover:scale-105 active:scale-95 skew-x-[-10deg]";
    const bossName = t(bossData?.name || "ui.boss").toUpperCase();

    const titleNode = (
        <div className="flex flex-col items-center">
            <span className={`text-base md:text-2xl text-white font-light tracking-[0.2em] mb-1 md:mb-2 uppercase opacity-90`}>{t('ui.boss_killed')}</span>
            <span className={`${isMobileDevice ? 'text-4xl' : 'text-5xl md:text-7xl'} font-light text-white uppercase tracking-tighter`}>{bossName}</span>
        </div>
    );

    return (
        <GameModalLayout title={titleNode} maxWidthClass="max-w-4xl" blurClass="backdrop-blur-xl" isMobile={isMobileDevice}>
            <div className={`bg-black/50 ${isMobileDevice ? 'p-4' : 'p-8'} border-2 border-red-900 mb-6 md:mb-10 skew-x-[-5deg]`}>
                <div className="skew-x-[5deg]">
                    <p className={`${isMobileDevice ? 'text-lg' : 'text-2xl'} leading-relaxed font-light italic mb-4 md:mb-8 text-gray-200`}>
                        "{t(bossData?.deathStory || "The target has been eliminated.")}"
                    </p>

                    {stats && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 border-t border-red-900/50 pt-6">
                            {/* Damage Dealt (Outgoing) */}
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest mb-4 border-b border-blue-900/30 pb-1">{t('ui.damage_dealt')}</span>
                                <div className="space-y-1">
                                    {Object.entries(stats.outgoingDamageBreakdown || {})
                                        .sort((a, b) => (b[1] as any) - (a[1] as any))
                                        .map(([weapon, amount]) => (
                                        <div key={weapon} className="flex justify-between items-center text-[10px]">
                                            <span className="text-gray-400 uppercase font-bold">{t(`weapons.${weapon.toLowerCase()}`)}</span>
                                            <span className="text-white font-mono">{Math.floor(amount as any).toLocaleString()}</span>
                                        </div>
                                    ))}
                                    <div className="flex justify-between items-center pt-2 border-t border-gray-800 mt-2">
                                        <span className="text-xs font-black text-white uppercase">{t('ui.total')}</span>
                                        <span className="text-xl font-black text-blue-400">{Math.floor(stats.bossDamageDealt || 0).toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Damage Taken (Incoming) */}
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest mb-4 border-b border-red-900/30 pb-1">{t('ui.damage_taken')}</span>
                                <div className="space-y-1">
                                    {(stats.incomingDamageBreakdown?.['Boss'] ? Object.entries(stats.incomingDamageBreakdown['Boss']) : [])
                                        .sort((a, b) => (b[1] as any) - (a[1] as any))
                                        .map(([attack, amount]) => (
                                        <div key={attack} className="flex justify-between items-center text-[10px]">
                                            <span className="text-gray-400 uppercase font-bold">{attack}</span>
                                            <span className="text-white font-mono">{Math.floor(amount as any).toLocaleString()}</span>
                                        </div>
                                    ))}
                                    <div className="flex justify-between items-center pt-2 border-t border-gray-800 mt-2">
                                        <span className="text-xs font-black text-white uppercase">{t('ui.total')}</span>
                                        <span className="text-xl font-black text-red-400">{Math.floor(stats.bossDamageTaken || 0).toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            <div className="flex justify-center">
                <button onClick={onProceed} className={`${buttonStyle} bg-white text-black border-white hover:bg-slate-200`}>
                    <span className="block skew-x-[10deg]">{t('ui.continue')}</span>
                </button>
            </div>
        </GameModalLayout>
    );
};

export default ScreenBossKilled;
