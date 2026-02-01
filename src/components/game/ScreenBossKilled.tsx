
import React from 'react';
import { t } from '../../utils/i18n';
import GameModalLayout from './GameModalLayout';
import { BOSSES } from '../../content/constants';
import { SectorStats } from '../../types';

interface ScreenBossKilledProps {
    mapIndex: number;
    onProceed: () => void;
    stats?: SectorStats;
}

const ScreenBossKilled: React.FC<ScreenBossKilledProps> = ({ mapIndex, onProceed, stats }) => {
    const bossData = BOSSES[mapIndex];
    const buttonStyle = "px-8 py-4 font-black uppercase tracking-wider transition-all duration-200 border-2 shadow-lg hover:scale-105 active:scale-95 skew-x-[-10deg]";
    const bossName = t(bossData?.name || "ui.boss").toUpperCase();

    const titleNode = (
        <div className="flex flex-col items-center">
            <span className="text-xl md:text-2xl text-white font-bold tracking-[0.2em] mb-2 uppercase opacity-90">{t('ui.boss_killed')}</span>
            <span className="text-5xl md:text-7xl font-black text-red-600 uppercase tracking-tighter skew-x-[-10deg] drop-shadow-lg">{bossName}</span>
        </div>
    );

    return (
        <GameModalLayout title={titleNode} titleColorClass="text-red-600" maxWidthClass="max-w-4xl">
            <div className="bg-black/50 p-8 border-2 border-red-900 mb-10 skew-x-[-5deg]">
                <div className="skew-x-[5deg]">
                    <p className="text-slate-300 text-2xl leading-relaxed font-light italic mb-8">
                        "{t(bossData?.deathStory || "The target has been eliminated.")}"
                    </p>

                    {stats && (
                        <div className="grid grid-cols-2 gap-8 border-t border-red-900/50 pt-6">
                            <div className="flex flex-col items-center">
                                <span className="text-sm font-bold text-blue-500 uppercase tracking-widest mb-1">{t('ui.damage_dealt')}</span>
                                <span className="text-3xl font-black text-white">{Math.floor(stats.bossDamageDealt || 0).toLocaleString()}</span>
                            </div>
                            <div className="flex flex-col items-center">
                                <span className="text-sm font-bold text-red-500 uppercase tracking-widest mb-1">{t('ui.damage_taken')}</span>
                                <span className="text-3xl font-black text-white">{Math.floor(stats.bossDamageTaken || 0).toLocaleString()}</span>
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
