import React, { useMemo } from 'react';
import { t } from '../../../../utils/i18n';
import ScreenModalLayout, { TacticalButton, HORIZONTAL_HATCHING_STYLE } from '../../layout/ScreenModalLayout';
import { PlayerStats } from '../../../../entities/player/PlayerTypes';
import { PERKS, PerkColors } from '../../../../content/perks';
import { GAME_CHALLENGES } from '../../../../content/ChallengeTypes';
import { ColorPair, COLORS } from '../../../../utils/ui/ColorUtils';
import { StatsBridge } from '../../../../core/data/StatsBridge';

interface ScreenPauseProps {
    onResume: () => void;
    onAbort: () => void;
    onOpenMap: () => void;
    onOpenSettings: () => void;
    onOpenAdventureLog: () => void;
    onOpenStatistics: () => void;
    stats: PlayerStats;
    isMobileDevice?: boolean;
}

const CHALLENGE_CATEGORY_COLORS: Record<number, ColorPair> = {
    0: COLORS.GREEN,
    1: COLORS.RED,
    2: COLORS.PURPLE,
    3: COLORS.BLUE,
    4: COLORS.YELLOW,
};

const ScreenPause: React.FC<ScreenPauseProps> = ({ onResume, onAbort, onOpenMap, onOpenSettings, onOpenAdventureLog, onOpenStatistics, stats, isMobileDevice }) => {
    const [tooltipContent, setTooltipContent] = React.useState<string | null>(null);
    const tooltipTimeout = React.useRef<any>(null);

    const showTooltip = React.useCallback((text: string) => {
        if (tooltipTimeout.current) clearTimeout(tooltipTimeout.current);
        setTooltipContent(text);
        tooltipTimeout.current = setTimeout(() => setTooltipContent(null), isMobileDevice ? 2000 : 3000);
    }, [isMobileDevice]);

    const handleActionEnter = React.useCallback((e: React.MouseEvent<HTMLElement>) => {
        const text = e.currentTarget.dataset.tooltip;
        if (text) showTooltip(text);
    }, [showTooltip]);

    const handleActionLeave = React.useCallback(() => setTooltipContent(null), []);

    const activePerks = useMemo(() => {
        const list = [];
        // Add active passives
        const passives = StatsBridge.getActivePassives(stats);
        for (let i = 0; i < passives.length; i++) {
            const perk = PERKS[passives[i]];
            if (perk) list.push(perk);
        }
        // Add active buffs
        const buffs = StatsBridge.getActiveBuffs(stats);
        for (let i = 0; i < buffs.length; i++) {
            const perk = PERKS[buffs[i]];
            if (perk) list.push(perk);
        }
        // Add active debuffs
        const debuffs = StatsBridge.getActiveDebuffs(stats);
        for (let i = 0; i < debuffs.length; i++) {
            const perk = PERKS[debuffs[i]];
            if (perk) list.push(perk);
        }
        return list;
    }, [stats]);

    const trackedChallenges = useMemo(() => {
        const trackedIds = StatsBridge.getTrackedChallengeIds(stats);
        return GAME_CHALLENGES.filter(c => trackedIds.includes(c.id));
    }, [stats]);

    return (
        <ScreenModalLayout
            title={t('ui.paused')}
            isMobileDevice={isMobileDevice}
            onClose={onResume}
            showCloseButton={false}
            isSmallScreen={true}
        >
            <div className={`flex flex-col h-full ${isMobileDevice ? 'gap-4' : 'gap-8'}`}>
                {/* --- MAIN MENU --- */}
                <div className={`grid grid-cols-1 gap-2 md:gap-4 shrink-0`}>
                    <TacticalButton onClick={onResume} className="w-full">
                        {t('ui.continue')}
                    </TacticalButton>

                    <div className="grid grid-cols-2 gap-2 md:gap-4">
                        <TacticalButton onClick={onOpenAdventureLog} variant="secondary" className="w-full">
                            {t('ui.adventure_log')}
                        </TacticalButton>

                        <TacticalButton onClick={onOpenStatistics} variant="secondary" className="w-full">
                            {t('ui.statistics')}
                        </TacticalButton>
                    </div>

                    <div className="grid grid-cols-2 gap-2 md:gap-4">
                        <TacticalButton onClick={onOpenMap} variant="secondary" className="w-full">
                            {t('ui.map_btn')}
                        </TacticalButton>

                        <TacticalButton onClick={onOpenSettings} variant="secondary" className="w-full">
                            {t('ui.settings')}
                        </TacticalButton>
                    </div>

                    <TacticalButton onClick={onAbort} variant="danger" className="w-full mt-2">
                        {t('ui.end_game')}
                    </TacticalButton>
                </div>

                {/* --- STATUS OVERVIEW --- */}
                <div className="flex-1 flex flex-col gap-6 overflow-y-auto custom-scrollbar pr-2 min-h-0 pb-12">

                    {/* ACTIVE PERKS */}
                    {activePerks.length > 0 && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-4">
                                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500 whitespace-nowrap">
                                    {t('ui.active_perks')}
                                </h3>
                                <div className="h-px w-full bg-zinc-800" />
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {activePerks.map(perk => {
                                    const colorPair = PerkColors[perk.category] || COLORS.GRAY;
                                    return (
                                        <div
                                            key={perk.id}
                                            data-tooltip={t(perk.displayName)}
                                            onMouseEnter={handleActionEnter}
                                            onMouseLeave={handleActionLeave}
                                            className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 flex items-center gap-2 rounded shadow-inner group relative overflow-hidden cursor-help"
                                        >
                                            <div className="absolute inset-0 opacity-5" style={HORIZONTAL_HATCHING_STYLE} />
                                            <span className="text-lg relative z-10">{perk.icon}</span>
                                            <span className="text-[10px] font-bold text-zinc-200 uppercase tracking-tight relative z-10">{t(perk.displayName)}</span>
                                            <div className="w-1.5 h-1.5 rounded-full relative z-10" style={{ backgroundColor: colorPair.str, boxShadow: `0 0 5px ${colorPair.str}` }} />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* TRACKED CHALLENGES */}
                    {trackedChallenges.length > 0 && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-4">
                                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500 whitespace-nowrap">
                                    {t('ui.tracked_challenges')}
                                </h3>
                                <div className="h-px w-full bg-zinc-800" />
                            </div>
                            <div className="space-y-2">
                                {trackedChallenges.map(challenge => {
                                    const tier = StatsBridge.getChallengeTier(stats, challenge.id);
                                    const value = StatsBridge.getChallengeValue(stats, challenge.id);
                                    const nextTier = tier < 3 ? tier + 1 : 3;
                                    const target = challenge.targets[nextTier - 1] || 1;
                                    const progress = Math.min(100, (value / target) * 100) || 0;
                                    const colorPair = CHALLENGE_CATEGORY_COLORS[challenge.categoryId] || COLORS.GRAY;

                                    return (
                                        <div key={challenge.id} className="bg-zinc-950/50 border border-zinc-800/50 p-3 flex flex-col gap-2 relative group overflow-hidden">
                                            <div className="absolute inset-0 opacity-5 pointer-events-none" style={HORIZONTAL_HATCHING_STYLE} />
                                            <div className="flex justify-between items-center relative z-10">
                                                <h4 className="text-[11px] font-bold text-zinc-300 uppercase tracking-tight truncate pr-4">
                                                    {t(challenge.titleKey)}
                                                </h4>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-mono text-zinc-500">
                                                        {Math.floor(value).toLocaleString()} / {target.toLocaleString()}
                                                    </span>
                                                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: colorPair.str, boxShadow: `0 0 5px ${colorPair.str}` }} />
                                                </div>
                                            </div>
                                            <div className="h-1 w-full bg-zinc-900 rounded-full overflow-hidden relative z-10">
                                                <div
                                                    className="h-full transition-all duration-1000"
                                                    style={{ width: `${progress}%`, backgroundColor: colorPair.str }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* TOOLTIP OVERLAY */}
            {tooltipContent && (
                <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[1000] px-6 py-3 bg-zinc-950/90 border border-white/20 backdrop-blur-xl rounded-full shadow-2xl animate-in fade-in zoom-in duration-200 pointer-events-none">
                    <span className="text-sm text-white font-bold uppercase tracking-widest whitespace-nowrap">
                        {tooltipContent}
                    </span>
                </div>
            )}
        </ScreenModalLayout>
    );
};

export default ScreenPause;

