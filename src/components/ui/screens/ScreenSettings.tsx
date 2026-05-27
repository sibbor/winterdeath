import React, { useState, useEffect, useCallback } from 'react';
import { t, setLocale, getLocale } from '../../../utils/i18n';
import { UiSounds } from '../../../utils/audio/AudioLib';
import { GameSettings } from '../../../core/engine/EngineTypes';
import { SHADOW_PRESETS } from '../../../content/constants';
import { useOrientation } from '../../../hooks/useOrientation';
import ModalLayout, { TacticalCard, TacticalButton, TacticalTab } from './ModalLayout';
import { InputAction, INPUT_KEY_MAP } from '../../../core/engine/InputManager';

// Zero-GC: static config arrays hoisted at module level
const SHADOW_QUALITY_PRESETS = [
    { key: 'ui.quality_low', preset: SHADOW_PRESETS.LOW },
    { key: 'ui.quality_med', preset: SHADOW_PRESETS.MEDIUM },
    { key: 'ui.quality_high', preset: SHADOW_PRESETS.HIGH },
];
const TEXTURE_QUALITY_PRESETS = [
    { val: 0.5, key: 'ui.quality_low' },
    { val: 0.75, key: 'ui.quality_med' },
    { val: 1.0, key: 'ui.quality_high' },
];
// Pre-truncated label keys — avoids .substring() in render
const RES_LABELS = [
    { key: 'ui.res_performance', chars: 4 },
    { key: 'ui.res_standard', chars: 3 },
    { key: 'ui.res_optimized', chars: 3 },
    { key: 'ui.res_native', chars: 6 },
];

interface ScreenSettingsProps {
    onClose: () => void;
    settings: GameSettings;
    onUpdateGraphics: (settings: GameSettings) => void;
    showFps?: boolean;
    onToggleShowFps?: () => void;
    isMobileDevice?: boolean;
}

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
            const action = INPUT_KEY_MAP[e.key];
            if (action === InputAction.ESCAPE) {
                e.stopPropagation();
                setShowReloadConfirm(false);
                UiSounds.playClick();
            } else if (action === InputAction.ENTER) {
                e.stopPropagation();
                confirmReload();
            }
        };

        window.addEventListener('keydown', handleKeys, { capture: true });
        return () => window.removeEventListener('keydown', handleKeys, { capture: true });
    }, [showReloadConfirm, confirmReload]);

    return (
        <ModalLayout
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
                    <div className={`${effectiveLandscape ? 'flex flex-col gap-4 pt-4 pr-10' : 'flex flex-nowrap gap-2 border-b-2 border-gray-800 pb-2 md:pb-4 overflow-x-auto px-4 pt-2 items-end scrollbar-hide touch-auto cursor-pointer'}`}>
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
        </ModalLayout>
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
            <TacticalCard color={0x3b82f6} className="w-full flex flex-col md:flex-row justify-between items-start md:items-center group gap-4 p-4 md:p-6">
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
                        <span className={tempGraphics.pixelRatio <= 0.5 ? 'text-white font-bold' : ''}>{t(RES_LABELS[0].key).slice(0, RES_LABELS[0].chars)}</span>
                        <span className={tempGraphics.pixelRatio > 0.5 && tempGraphics.pixelRatio <= 0.75 ? 'text-white font-bold' : ''}>{t(RES_LABELS[1].key).slice(0, RES_LABELS[1].chars)}</span>
                        <span className={tempGraphics.pixelRatio > 0.75 && tempGraphics.pixelRatio <= 0.85 ? 'text-white font-bold' : ''}>{t(RES_LABELS[2].key).slice(0, RES_LABELS[2].chars)}</span>
                        <span className={tempGraphics.pixelRatio > 0.85 ? 'text-white font-bold' : ''}>{t(RES_LABELS[3].key).slice(0, RES_LABELS[3].chars)}</span>
                    </div>
                </div>
            </TacticalCard>

            <TacticalCard color={0x3b82f6} className="w-full flex flex-col md:flex-row justify-between items-start md:items-center group gap-4 p-4 md:p-6">
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
                    {SHADOW_QUALITY_PRESETS.map(q => (
                        <TacticalButton
                            key={q.key}
                            onClick={() => { setTempGraphics(prev => ({ ...prev, ...q.preset })); }}
                            variant={tempGraphics.shadows && tempGraphics.shadowMapType === q.preset.shadowMapType ? 'primary' : 'secondary'}
                            className="px-4 py-2 text-xs"
                        >
                            {t(q.key)}
                        </TacticalButton>
                    ))}
                </div>
            </TacticalCard>

            <TacticalCard color={0x3b82f6} className="w-full flex flex-col md:flex-row justify-between items-start md:items-center group gap-4 p-4 md:p-6">
                <div>
                    <h3 className="text-xl font-semibold text-white uppercase tracking-wider mb-1 group-hover:text-blue-300 transition-colors">{t('ui.texture_quality')}</h3>
                    <p className="text-orange-400 text-xs font-mono uppercase font-bold mb-1">{t('ui.needs_reload')}</p>
                    <p className="text-gray-400 text-xs font-mono">{t('ui.texture_sub')}</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                    {TEXTURE_QUALITY_PRESETS.map(q => (
                        <TacticalButton
                            key={q.val}
                            onClick={() => { setTempGraphics(prev => ({ ...prev, textureQuality: q.val })); }}
                            variant={tempGraphics.textureQuality === q.val ? 'primary' : 'secondary'}
                            className="px-4 py-1"
                        >
                            {t(q.key)}
                        </TacticalButton>
                    ))}
                </div>
            </TacticalCard>

            <TacticalCard
                onClick={toggleVolumetricFog}
                color={0x3b82f6}
                className="w-full flex flex-col md:flex-row justify-between items-start md:items-center cursor-pointer group p-4 md:p-6"
            >
                <div>
                    <h3 className="text-xl font-semibold text-white uppercase tracking-wider mb-1 group-hover:text-blue-300 transition-colors">{t('ui.volumetric_fog')}</h3>
                    <p className="text-orange-400 text-xs font-mono uppercase font-bold mb-1">{t('ui.needs_reload')}</p>
                    <p className="text-gray-400 text-xs font-mono">{t('ui.volumetric_fog_sub')}</p>
                </div>
                <div className="flex gap-2">
                    <TacticalButton
                        onClick={(e) => { e.stopPropagation(); setTempGraphics(prev => ({ ...prev, volumetricFog: true })); UiSounds.playClick(); }}
                        variant={tempGraphics.volumetricFog ? 'primary' : 'secondary'}
                        className="px-6 py-1"
                    >
                        {t('ui.on')}
                    </TacticalButton>
                    <TacticalButton
                        onClick={(e) => { e.stopPropagation(); setTempGraphics(prev => ({ ...prev, volumetricFog: false })); UiSounds.playClick(); }}
                        variant={!tempGraphics.volumetricFog ? 'primary' : 'secondary'}
                        className="px-6 py-1"
                    >
                        {t('ui.off')}
                    </TacticalButton>
                </div>
            </TacticalCard>

            <TacticalCard
                onClick={toggleAntialias}
                color={0x3b82f6}
                className="w-full flex flex-col md:flex-row justify-between items-start md:items-center cursor-pointer group p-4 md:p-6"
            >
                <div>
                    <h3 className="text-xl font-semibold text-white uppercase tracking-wider mb-1 group-hover:text-blue-300 transition-colors">{t('ui.antialias')}</h3>
                    <p className="text-orange-400 text-xs font-mono uppercase font-bold mb-1">{t('ui.needs_reload')}</p>
                    <p className="text-gray-400 text-xs font-mono">{t('ui.antialias_sub')}</p>
                </div>
                <div className="flex gap-2">
                    <TacticalButton
                        onClick={(e) => { e.stopPropagation(); setTempGraphics(prev => ({ ...prev, antialias: true })); UiSounds.playClick(); }}
                        variant={tempGraphics.antialias ? 'primary' : 'secondary'}
                        className="px-6 py-1"
                    >
                        {t('ui.on')}
                    </TacticalButton>
                    <TacticalButton
                        onClick={(e) => { e.stopPropagation(); setTempGraphics(prev => ({ ...prev, antialias: false })); UiSounds.playClick(); }}
                        variant={!tempGraphics.antialias ? 'primary' : 'secondary'}
                        className="px-6 py-1"
                    >
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
            color={0x3b82f6}
            className="w-full flex flex-col md:flex-row justify-between items-start md:items-center cursor-pointer group p-4 md:p-6"
        >
            <div>
                <h3 className="text-xl font-semibold text-white uppercase tracking-wider mb-1 group-hover:text-blue-300 transition-colors">{t('ui.language')}</h3>
                <p className="text-gray-400 text-xs font-mono">{t('ui.language_sub')}</p>
            </div>
            <div className="flex gap-2">
                <TacticalButton variant={getLocale() === 'en' ? 'primary' : 'secondary'} onClick={(e) => { e.stopPropagation(); setLocale('en'); setTick(t => t + 1); UiSounds.playClick(); }} className="px-6 py-1">EN</TacticalButton>
                <TacticalButton variant={getLocale() === 'sv' ? 'primary' : 'secondary'} onClick={(e) => { e.stopPropagation(); setLocale('sv'); setTick(t => t + 1); UiSounds.playClick(); }} className="px-6 py-1">SV</TacticalButton>
            </div>
        </TacticalCard>

        <TacticalCard
            onClick={onToggleShowFps}
            color={0x3b82f6}
            className="w-full flex flex-col md:flex-row justify-between items-start md:items-center cursor-pointer group p-4 md:p-6"
        >
            <div>
                <h3 className="text-xl font-semibold text-white uppercase tracking-wider mb-1 group-hover:text-blue-300 transition-colors">{t('ui.show_fps')}</h3>
                <p className="text-gray-400 text-xs font-mono">{t('ui.show_fps_desc')}</p>
            </div>
            <div className="flex gap-2">
                <TacticalButton onClick={(e) => { e.stopPropagation(); if (!showFps && onToggleShowFps) onToggleShowFps(); }} variant={showFps ? 'primary' : 'secondary'} className="px-6 py-1">{t('ui.on')}</TacticalButton>
                <TacticalButton onClick={(e) => { e.stopPropagation(); if (showFps && onToggleShowFps) onToggleShowFps(); }} variant={!showFps ? 'primary' : 'secondary'} className="px-6 py-1">{t('ui.off')}</TacticalButton>
            </div>
        </TacticalCard>

        <TacticalCard
            onClick={() => { setTempGraphics(prev => ({ ...prev, showDiscoveryPopups: !prev.showDiscoveryPopups })); UiSounds.playClick(); }}
            color={0x3b82f6}
            className="w-full flex flex-col md:flex-row justify-between items-start md:items-center cursor-pointer group p-4 md:p-6"
        >
            <div>
                <h3 className="text-xl font-semibold text-white uppercase tracking-wider mb-1 group-hover:text-blue-300 transition-colors">{t('ui.discovery_popups')}</h3>
                <p className="text-gray-400 text-xs font-mono">{t('ui.discovery_popups_sub')}</p>
            </div>
            <div className="flex gap-2">
                <TacticalButton onClick={(e) => { e.stopPropagation(); setTempGraphics(prev => ({ ...prev, showDiscoveryPopups: true })); UiSounds.playClick(); }} variant={tempGraphics.showDiscoveryPopups ? 'primary' : 'secondary'} className="px-6 py-1">{t('ui.on')}</TacticalButton>
                <TacticalButton onClick={(e) => { e.stopPropagation(); setTempGraphics(prev => ({ ...prev, showDiscoveryPopups: false })); UiSounds.playClick(); }} variant={!tempGraphics.showDiscoveryPopups ? 'primary' : 'secondary'} className="px-6 py-1">{t('ui.off')}</TacticalButton>
            </div>
        </TacticalCard>
    </div>
));

export default ScreenSettings;
