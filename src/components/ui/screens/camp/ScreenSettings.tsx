import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { t, setLocale, getLocale } from '../../../../utils/i18n';
import { UiSounds } from '../../../../utils/audio/AudioLib';
import { GameSettings } from '../../../../core/engine/EngineTypes';
import { SHADOW_PRESETS } from '../../../../content/constants';
import { useOrientation } from '../../../../hooks/useOrientation';
import ScreenModalLayout, { HORIZONTAL_HATCHING_STYLE, TacticalCard, TacticalButton, TacticalTab } from '../../layout/ScreenModalLayout';

interface ScreenSettingsProps {
    onClose: () => void;
    settings: GameSettings;
    onUpdateGraphics: (settings: GameSettings) => void;
    showFps?: boolean;
    onToggleShowFps?: () => void;
    isMobileDevice?: boolean;
}

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

const ScreenSettings: React.FC<ScreenSettingsProps> = React.memo(({ onClose, settings, onUpdateGraphics, showFps, onToggleShowFps, isMobileDevice }) => {
    const { isLandscapeMode } = useOrientation();
    const effectiveLandscape = isLandscapeMode || !isMobileDevice;
    const [activeTab, setActiveTab] = useState<'graphics' | 'general'>('graphics');

    const [tempGraphics, setTempGraphics] = useState<GameSettings>({ ...settings });
    const [showReloadConfirm, setShowReloadConfirm] = useState(false);
    const [, setTick] = useState(0);

    const handleSave = useCallback(() => {
        const needsReload =
            tempGraphics.antialias !== settings.antialias ||
            tempGraphics.shadows !== settings.shadows ||
            tempGraphics.shadowMapType !== settings.shadowMapType ||
            tempGraphics.textureQuality !== settings.textureQuality ||
            tempGraphics.volumetricFog !== settings.volumetricFog;

        onUpdateGraphics(tempGraphics);

        if (needsReload) {
            setShowReloadConfirm(true);
        } else {
            onClose();
        }
    }, [tempGraphics, settings, onUpdateGraphics, onClose]);

    const confirmReload = useCallback(() => {
        UiSounds.playConfirm();
        onUpdateGraphics(tempGraphics);
        setTimeout(() => {
            window.location.reload();
        }, 100);
    }, [tempGraphics, onUpdateGraphics]);

    useEffect(() => {
        if (!showReloadConfirm) return;

        const handleKeys = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                setShowReloadConfirm(false);
                UiSounds.playClick();
            } else if (e.key === 'Enter') {
                e.stopPropagation();
                confirmReload();
            }
        };

        window.addEventListener('keydown', handleKeys, { capture: true });
        return () => window.removeEventListener('keydown', handleKeys, { capture: true });
    }, [showReloadConfirm, confirmReload]);

    return (
        <ScreenModalLayout
            title={t('ui.settings')}
            isMobileDevice={isMobileDevice}
            onClose={onClose}
            onConfirm={handleSave}
            confirmLabel={t('ui.save_settings')}
            showCancel={true}
            cancelLabel={t('ui.cancel')}
            titleColorClass="text-blue-600"
            tabs={['graphics', 'general']}
            activeTab={activeTab}
            onTabChange={(tab: any) => { setActiveTab(tab); UiSounds.playClick(); }}
            tabOrientation={effectiveLandscape ? 'vertical' : 'horizontal'}
        >
            <div className={`flex h-full ${effectiveLandscape ? 'flex-row gap-8 pl-safe' : 'flex-col gap-4'}`}>
                <div className={`relative shrink-0 ${effectiveLandscape ? 'w-1/3 flex flex-col gap-4 overflow-y-auto pl-safe custom-scrollbar' : ''}`}>
                    <div className={`${effectiveLandscape ? 'flex flex-col gap-4 pt-4 pr-10' : 'flex gap-2 border-b-2 border-gray-800 pb-2 md:pb-4 overflow-x-auto px-4 pt-2 items-end scrollbar-hide'}`}>
                        {['graphics', 'general'].map(tab => (
                            <TacticalTab
                                key={tab}
                                label={t('ui.' + tab)}
                                isActive={activeTab === tab}
                                onClick={() => { setActiveTab(tab as 'graphics' | 'general'); UiSounds.playClick(); }}
                                orientation={effectiveLandscape ? 'vertical' : 'horizontal'}
                            />
                        ))}
                    </div>
                </div>

                <div className="flex-1 flex flex-col min-w-0 pr-safe min-h-0">
                    {activeTab === 'graphics' ? (
                        <GraphicsTab tempGraphics={tempGraphics} setTempGraphics={setTempGraphics} />
                    ) : (
                        <GeneralTab showFps={showFps} onToggleShowFps={onToggleShowFps} tempGraphics={tempGraphics} setTempGraphics={setTempGraphics} setTick={setTick} />
                    )}
                </div>
            </div>

            {showReloadConfirm && (
                <div className="absolute inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm font-mono">
                    <div className="bg-zinc-950 border-2 border-blue-600 p-8 md:p-12 max-w-xl w-full mx-4 shadow-[0_0_50px_rgba(37,99,235,0.3)] flex flex-col gap-6 scale-animation origin-center">
                        <h2 className="text-3xl md:text-5xl font-black uppercase text-blue-600 tracking-tighter leading-none italic">
                            {t('ui.reload_required')}
                        </h2>
                        <p className="text-gray-300 text-sm md:text-lg font-bold uppercase tracking-widest py-2">
                            {t('ui.reload_desc')}
                        </p>
                        <div className="flex gap-4 mt-4">
                            <TacticalButton onClick={confirmReload} className="px-8 py-3">
                                {t('ui.reload_now')}
                            </TacticalButton>
                            <TacticalButton onClick={() => { setShowReloadConfirm(false); onClose(); }} variant="secondary" className="px-8 py-3">
                                {t('ui.reload_later')}
                            </TacticalButton>
                        </div>
                    </div>
                </div>
            )}
        </ScreenModalLayout>
    );
});

// --- SUB-COMPONENTS (HOISTED) ---

interface GraphicsTabProps {
    tempGraphics: GameSettings;
    setTempGraphics: React.Dispatch<React.SetStateAction<GameSettings>>;
}

const GraphicsTab: React.FC<GraphicsTabProps> = React.memo(({ tempGraphics, setTempGraphics }) => {

    const setPixelRatio = useCallback((ratio: number) => {
        setTempGraphics(prev => ({ ...prev, pixelRatio: ratio }));
        UiSounds.playClick();
    }, [setTempGraphics]);

    const toggleVolumetricFog = useCallback(() => {
        setTempGraphics(prev => ({ ...prev, volumetricFog: !prev.volumetricFog }));
        UiSounds.playClick();
    }, [setTempGraphics]);

    const toggleAntialias = useCallback(() => {
        setTempGraphics(prev => ({ ...prev, antialias: !prev.antialias }));
        UiSounds.playClick();
    }, [setTempGraphics]);

    return (
        <div className="flex flex-col items-center justify-start h-full max-w-2xl mx-auto space-y-6 overflow-y-auto pr-4 custom-scrollbar py-4 px-2">
            <TacticalCard color="#3b82f6" className="w-full flex flex-col md:flex-row justify-between items-start md:items-center group gap-4 p-4 md:p-6">
                <div className="flex-1">
                    <h3 className="text-xl font-semibold text-white uppercase tracking-wider mb-1 group-hover:text-blue-300 transition-colors">{t('ui.resolution')}</h3>
                    <p className="text-gray-400 text-xs font-mono">{t('ui.resolution_sub')}</p>
                </div>
                <div className="flex flex-col items-center md:items-end gap-2 w-full md:w-64">
                    <input
                        type="range" min="0" max="3" step="1"
                        value={
                            tempGraphics.pixelRatio <= 0.5 ? 0 :
                                tempGraphics.pixelRatio <= 0.75 ? 1 :
                                    tempGraphics.pixelRatio <= 0.85 ? 2 : 3
                        }
                        onChange={(e) => {
                            const ratios = [0.5, 0.75, 0.85, 1.0];
                            setPixelRatio(ratios[parseInt(e.target.value)]);
                        }}
                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-white"
                    />
                    <div className="flex justify-between w-full text-[10px] font-mono text-gray-500 mt-1 uppercase">
                        <span className={tempGraphics.pixelRatio <= 0.5 ? 'text-white font-bold' : ''}>{t('ui.res_performance').substring(0, 4)}</span>
                        <span className={tempGraphics.pixelRatio > 0.5 && tempGraphics.pixelRatio <= 0.75 ? 'text-white font-bold' : ''}>{t('ui.res_standard').substring(0, 3)}</span>
                        <span className={tempGraphics.pixelRatio > 0.75 && tempGraphics.pixelRatio <= 0.85 ? 'text-white font-bold' : ''}>{t('ui.res_optimized').substring(0, 3)}</span>
                        <span className={tempGraphics.pixelRatio > 0.85 ? 'text-white font-bold' : ''}>{t('ui.res_native').substring(0, 6)}</span>
                    </div>
                </div>
            </TacticalCard>

            <TacticalCard color="#3b82f6" className="w-full flex flex-col md:flex-row justify-between items-start md:items-center group gap-4 p-4 md:p-6">
                <div>
                    <h3 className="text-xl font-semibold text-white uppercase tracking-wider mb-1 group-hover:text-blue-300 transition-colors">{t('ui.shadow_quality')}</h3>
                    <p className="text-orange-400 text-xs font-mono uppercase font-bold mb-1">{t('ui.needs_reload')}</p>
                    <p className="text-gray-400 text-xs font-mono">{t('ui.shadow_sub')}</p>
                </div>
                <div className="flex gap-1 md:gap-2 flex-wrap">
                    <TacticalButton
                        onClick={() => { setTempGraphics(prev => ({ ...prev, ...SHADOW_PRESETS.OFF })); }}
                        variant={!tempGraphics.shadows ? 'primary' : 'secondary'}
                        className="px-4 py-2 text-xs"
                    >
                        {t('ui.off')}
                    </TacticalButton>
                    {[
                        { label: t('ui.quality_low'), preset: SHADOW_PRESETS.LOW },
                        { label: t('ui.quality_med'), preset: SHADOW_PRESETS.MEDIUM },
                        { label: t('ui.quality_high'), preset: SHADOW_PRESETS.HIGH },
                        { label: t('ui.quality_vhigh'), preset: SHADOW_PRESETS.VERYHIGH }
                    ].map(q => (
                        <TacticalButton
                            key={q.label}
                            onClick={() => { setTempGraphics(prev => ({ ...prev, ...q.preset })); }}
                            variant={tempGraphics.shadows && tempGraphics.shadowMapType === q.preset.shadowMapType ? 'primary' : 'secondary'}
                            className="px-4 py-2 text-xs"
                        >
                            {q.label}
                        </TacticalButton>
                    ))}
                </div>
            </TacticalCard>

            <TacticalCard color="#3b82f6" className="w-full flex flex-col md:flex-row justify-between items-start md:items-center group gap-4 p-4 md:p-6">
                <div>
                    <h3 className="text-xl font-semibold text-white uppercase tracking-wider mb-1 group-hover:text-blue-300 transition-colors">{t('ui.texture_quality')}</h3>
                    <p className="text-orange-400 text-xs font-mono uppercase font-bold mb-1">{t('ui.needs_reload')}</p>
                    <p className="text-gray-400 text-xs font-mono">{t('ui.texture_sub')}</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                    {[
                        { val: 0.5, label: t('ui.quality_low') },
                        { val: 0.75, label: t('ui.quality_med') },
                        { val: 1.0, label: t('ui.quality_high') }
                    ].map(q => (
                        <TacticalButton
                            key={q.val}
                            onClick={() => { setTempGraphics(prev => ({ ...prev, textureQuality: q.val })); }}
                            variant={tempGraphics.textureQuality === q.val ? 'primary' : 'secondary'}
                            className="px-4 py-1"
                        >
                            {q.label}
                        </TacticalButton>
                    ))}
                </div>
            </TacticalCard>

            <TacticalCard
                onClick={toggleVolumetricFog}
                color="#3b82f6"
                className="w-full flex flex-col md:flex-row justify-between items-start md:items-center cursor-pointer group p-4 md:p-6"
            >
                <div>
                    <h3 className="text-xl font-semibold text-white uppercase tracking-wider mb-1 group-hover:text-blue-300 transition-colors">{t('ui.volumetric_fog')}</h3>
                    <p className="text-orange-400 text-xs font-mono uppercase font-bold mb-1">{t('ui.needs_reload')}</p>
                    <p className="text-gray-400 text-xs font-mono">{t('ui.volumetric_fog_sub')}</p>
                </div>
                <div className="flex gap-2">
                    <TacticalButton variant={tempGraphics.volumetricFog ? 'primary' : 'secondary'} className="px-6 py-1">
                        {t('ui.on')}
                    </TacticalButton>
                    <TacticalButton variant={!tempGraphics.volumetricFog ? 'primary' : 'secondary'} className="px-6 py-1">
                        {t('ui.off')}
                    </TacticalButton>
                </div>
            </TacticalCard>

            <TacticalCard
                onClick={toggleAntialias}
                color="#3b82f6"
                className="w-full flex flex-col md:flex-row justify-between items-start md:items-center cursor-pointer group p-4 md:p-6"
            >
                <div>
                    <h3 className="text-xl font-semibold text-white uppercase tracking-wider mb-1 group-hover:text-blue-300 transition-colors">{t('ui.antialias')}</h3>
                    <p className="text-orange-400 text-xs font-mono uppercase font-bold mb-1">{t('ui.needs_reload')}</p>
                    <p className="text-gray-400 text-xs font-mono">{t('ui.antialias_sub')}</p>
                </div>
                <div className="flex gap-2">
                    <TacticalButton variant={tempGraphics.antialias ? 'primary' : 'secondary'} className="px-6 py-1">
                        {t('ui.on')}
                    </TacticalButton>
                    <TacticalButton variant={!tempGraphics.antialias ? 'primary' : 'secondary'} className="px-6 py-1">
                        {t('ui.off')}
                    </TacticalButton>
                </div>
            </TacticalCard>
        </div>
    );
});

interface GeneralTabProps {
    showFps?: boolean;
    onToggleShowFps?: () => void;
    tempGraphics: GameSettings;
    setTempGraphics: React.Dispatch<React.SetStateAction<GameSettings>>;
    setTick: React.Dispatch<React.SetStateAction<number>>;
}

const GeneralTab: React.FC<GeneralTabProps> = React.memo(({ showFps, onToggleShowFps, tempGraphics, setTempGraphics, setTick }) => (
    <div className="flex flex-col items-center justify-start h-full max-w-2xl mx-auto space-y-6 overflow-y-auto pr-4 custom-scrollbar py-4 px-2">
        <TacticalCard
            onClick={() => { const current = getLocale(); setLocale(current === 'en' ? 'sv' : 'en'); setTick(t => t + 1); UiSounds.playClick(); }}
            color="#3b82f6"
            className="w-full flex flex-col md:flex-row justify-between items-start md:items-center cursor-pointer group p-4 md:p-6"
        >
            <div>
                <h3 className="text-xl font-semibold text-white uppercase tracking-wider mb-1 group-hover:text-blue-300 transition-colors">{t('ui.language')}</h3>
                <p className="text-gray-400 text-xs font-mono">{t('ui.language_sub')}</p>
            </div>
            <div className="flex gap-2">
                <TacticalButton variant={getLocale() === 'en' ? 'primary' : 'secondary'} onClick={() => { setLocale('en'); setTick(t => t + 1); }} className="px-6 py-1">EN</TacticalButton>
                <TacticalButton variant={getLocale() === 'sv' ? 'primary' : 'secondary'} onClick={() => { setLocale('sv'); setTick(t => t + 1); }} className="px-6 py-1">SV</TacticalButton>
            </div>
        </TacticalCard>

        <TacticalCard
            onClick={onToggleShowFps}
            color="#3b82f6"
            className="w-full flex flex-col md:flex-row justify-between items-start md:items-center cursor-pointer group p-4 md:p-6"
        >
            <div>
                <h3 className="text-xl font-semibold text-white uppercase tracking-wider mb-1 group-hover:text-blue-300 transition-colors">{t('ui.show_fps')}</h3>
                <p className="text-gray-400 text-xs font-mono">{t('ui.show_fps_desc')}</p>
            </div>
            <div className="flex gap-2">
                <TacticalButton variant={showFps ? 'primary' : 'secondary'} className="px-6 py-1">{t('ui.on')}</TacticalButton>
                <TacticalButton variant={!showFps ? 'primary' : 'secondary'} className="px-6 py-1">{t('ui.off')}</TacticalButton>
            </div>
        </TacticalCard>

        <TacticalCard
            onClick={() => { setTempGraphics(prev => ({ ...prev, showDiscoveryPopups: !prev.showDiscoveryPopups })); UiSounds.playClick(); }}
            color="#3b82f6"
            className="w-full flex flex-col md:flex-row justify-between items-start md:items-center cursor-pointer group p-4 md:p-6"
        >
            <div>
                <h3 className="text-xl font-semibold text-white uppercase tracking-wider mb-1 group-hover:text-blue-300 transition-colors">{t('ui.discovery_popups')}</h3>
                <p className="text-gray-400 text-xs font-mono">{t('ui.discovery_popups_sub')}</p>
            </div>
            <div className="flex gap-2">
                <TacticalButton variant={tempGraphics.showDiscoveryPopups ? 'primary' : 'secondary'} className="px-6 py-1">{t('ui.on')}</TacticalButton>
                <TacticalButton variant={!tempGraphics.showDiscoveryPopups ? 'primary' : 'secondary'} className="px-6 py-1">{t('ui.off')}</TacticalButton>
            </div>
        </TacticalCard>
    </div>
));

export default ScreenSettings;