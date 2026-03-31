import React, { useState, useEffect, useRef, useCallback } from 'react';
import { t, setLocale, getLocale } from '../../../../utils/i18n';
import { soundManager } from '../../../../utils/audio/SoundManager';
import { GameSettings } from '../../../../core/engine/EngineTypes';
import { SHADOW_PRESETS } from '../../../../content/constants';
import ScreenModalLayout from '../../layout/ScreenModalLayout';
import { useOrientation } from '../../../../hooks/useOrientation';

interface ScreenSettingsProps {
    onClose: () => void;
    settings: GameSettings;
    onUpdateGraphics: (settings: GameSettings) => void;
    showFps?: boolean;
    onToggleShowFps?: () => void;
    isMobileDevice?: boolean;
}

const ScreenSettings: React.FC<ScreenSettingsProps> = ({ onClose, settings, onUpdateGraphics, showFps, onToggleShowFps, isMobileDevice }) => {
    const { isLandscapeMode } = useOrientation();
    const effectiveLandscape = isLandscapeMode || !isMobileDevice;
    const [activeTab, setActiveTab] = useState<'graphics' | 'general'>('graphics');

    // --- BUFFERED STATE ---
    const [tempGraphics, setTempGraphics] = useState<GameSettings>({ ...settings });
    const [showReloadConfirm, setShowReloadConfirm] = useState(false);
    const prevTempGraphics = useRef<GameSettings>(tempGraphics);

    // Force update to re-render when language changes
    const [, setTick] = useState(0);

    const toggleLocale = () => {
        const current = getLocale();
        const next = current === 'en' ? 'sv' : 'en';
        setLocale(next);
        soundManager.playUiClick();
        setTick(t => t + 1);
    };

    const setPixelRatio = (ratio: number) => {
        setTempGraphics({ ...tempGraphics, pixelRatio: ratio });
        soundManager.playUiClick();
    };

    const toggleAntialias = () => {
        setTempGraphics({ ...tempGraphics, antialias: !tempGraphics.antialias });
        soundManager.playUiClick();
    };

    const toggleVolumetricFog = () => {
        setTempGraphics({ ...tempGraphics, volumetricFog: !tempGraphics.volumetricFog });
        soundManager.playUiClick();
    };

    const handleSave = () => {
        const needsReload =
            tempGraphics.antialias !== settings.antialias ||
            tempGraphics.shadows !== settings.shadows ||
            tempGraphics.shadowMapType !== settings.shadowMapType ||
            tempGraphics.textureQuality !== settings.textureQuality ||
            tempGraphics.volumetricFog !== settings.volumetricFog;

        // Save settings instantly
        onUpdateGraphics(tempGraphics);

        if (needsReload) {
            setShowReloadConfirm(true);
        } else {
            onClose();
        }
    };

    const confirmReload = useCallback(() => {
        soundManager.playUiConfirm();
        onUpdateGraphics(tempGraphics);

        // We force a hard reload to kill all old WebGL contexts.
        // Since onUpdateGraphics just triggered a saveGameState(), the game will
        // boot up with the new settings lightning fast when the page reloads.
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
                soundManager.playUiClick();
            } else if (e.key === 'Enter') {
                e.stopPropagation();
                confirmReload();
            }
        };

        window.addEventListener('keydown', handleKeys, { capture: true });
        return () => window.removeEventListener('keydown', handleKeys, { capture: true });
    }, [showReloadConfirm, confirmReload]);

    const darkenColor = (hex: string, percent: number) => {
        const num = parseInt(hex.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = (num >> 16) - amt;
        const G = (num >> 8 & 0x00FF) - amt;
        const B = (num & 0x0000FF) - amt;
        return '#' + (0x1000000 + (R < 255 ? R < 0 ? 0 : R : 255) * 0x10000 + (G < 255 ? G < 0 ? 0 : G : 255) * 0x100 + (B < 255 ? B < 0 ? 0 : B : 255)).toString(16).slice(1);
    };

    const renderGraphicsTab = () => (
        <div className="flex flex-col items-center justify-start h-full max-w-2xl mx-auto space-y-6 overflow-y-auto pr-4 custom-scrollbar py-4 px-2">
            {/* Resolution / Pixel Ratio */}
            <div className="w-full bg-gray-900/50 p-4 md:p-6 border border-gray-700 flex flex-col md:flex-row justify-between items-start md:items-center transition-colors hover:border-white rounded-lg group gap-4">
                <div className="flex-1">
                    <h3 className="text-xl font-semibold text-white uppercase tracking-wider mb-1 group-hover:text-blue-300 transition-colors">{t('ui.resolution')}</h3>
                    <p className="text-gray-400 text-xs font-mono">{t('ui.resolution_sub')}</p>
                </div>

                <div className="flex flex-col items-center md:items-end gap-2 w-full md:w-64">
                    <input
                        type="range"
                        min="0"
                        max="3"
                        step="1"
                        value={
                            tempGraphics.pixelRatio <= 0.5 ? 0 :
                                tempGraphics.pixelRatio <= 0.75 ? 1 :
                                    tempGraphics.pixelRatio <= 0.85 ? 2 : 3
                        }
                        onChange={(e) => {
                            const val = parseInt(e.target.value);
                            const ratios = [0.5, 0.75, 0.85, 1.0];
                            setPixelRatio(ratios[val]);
                        }}
                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-white"
                    />
                    <div className="flex justify-between w-full text-[10px] font-mono text-gray-500 mt-1 uppercase">
                        <span className={tempGraphics.pixelRatio <= 0.5 ? 'text-white font-bold' : ''}>{t('ui.res_performance').substring(0, 4)}</span>
                        <span className={tempGraphics.pixelRatio > 0.5 && tempGraphics.pixelRatio <= 0.75 ? 'text-white font-bold' : ''}>{t('ui.res_standard').substring(0, 3)}</span>
                        <span className={tempGraphics.pixelRatio > 0.75 && tempGraphics.pixelRatio <= 0.85 ? 'text-white font-bold' : ''}>{t('ui.res_optimized').substring(0, 3)}</span>
                        <span className={tempGraphics.pixelRatio > 0.85 ? 'text-white font-bold' : ''}>{t('ui.res_native').substring(0, 6)}</span>
                    </div>
                    <div className="text-xs font-bold text-blue-400 uppercase tracking-widest bg-blue-900/20 px-2 py-0.5 rounded border border-blue-500/30">
                        {
                            tempGraphics.pixelRatio <= 0.5 ? `${t('ui.res_performance')} (0.5x)` :
                                tempGraphics.pixelRatio <= 0.75 ? `${t('ui.res_standard')} (0.75x)` :
                                    tempGraphics.pixelRatio <= 0.85 ? `${t('ui.res_optimized')} (0.85x)` : `${t('ui.res_native')} (1.0x)`
                        }
                    </div>
                </div>
            </div>

            {/* Shadow Quality */}
            <div className="w-full bg-gray-900/50 p-4 md:p-6 border border-gray-700 flex flex-col md:flex-row justify-between items-start md:items-center transition-colors hover:border-white rounded-lg group gap-4">
                <div>
                    <h3 className="text-xl font-semibold text-white uppercase tracking-wider mb-1 group-hover:text-blue-300 transition-colors">{t('ui.shadow_quality')}</h3>
                    <p className="text-orange-400 text-xs font-mono uppercase font-bold mb-1">(Needs reload)</p>
                    <p className="text-gray-400 text-xs font-mono">{t('ui.shadow_sub')}</p>
                </div>
                <div className="flex gap-1 md:gap-2 flex-wrap">
                    <button
                        onClick={() => { setTempGraphics({ ...tempGraphics, ...SHADOW_PRESETS.OFF }); soundManager.playUiClick(); }}
                        className={`px-3 py-1 text-xs md:text-base font-bold uppercase border-2 transition-all ${!tempGraphics.shadows ? 'bg-white text-black border-white' : 'bg-black text-gray-500 border-gray-700'}`}
                    >
                        {t('ui.off')}
                    </button>
                    {[
                        { label: t('ui.quality_low'), preset: SHADOW_PRESETS.LOW },
                        { label: t('ui.quality_med'), preset: SHADOW_PRESETS.MEDIUM },
                        { label: t('ui.quality_high'), preset: SHADOW_PRESETS.HIGH },
                        { label: t('ui.quality_vhigh'), preset: SHADOW_PRESETS.VERYHIGH }
                    ].map(q => (
                        <button
                            key={q.label}
                            onClick={() => { setTempGraphics({ ...tempGraphics, ...q.preset }); soundManager.playUiClick(); }}
                            className={`px-2 py-1 text-xs md:text-base font-bold uppercase border-2 transition-all ${tempGraphics.shadows && tempGraphics.shadowMapType === q.preset.shadowMapType ? 'bg-white text-black border-white' : 'bg-black text-gray-500 border-gray-700'}`}
                        >
                            {q.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Texture Quality */}
            <div className="w-full bg-gray-900/50 p-4 md:p-6 border border-gray-700 flex flex-col md:flex-row justify-between items-start md:items-center transition-colors hover:border-white rounded-lg group gap-4">
                <div>
                    <h3 className="text-xl font-semibold text-white uppercase tracking-wider mb-1 group-hover:text-blue-300 transition-colors">{t('ui.texture_quality')}</h3>
                    <p className="text-orange-400 text-xs font-mono uppercase font-bold mb-1">(Needs reload)</p>
                    <p className="text-gray-400 text-xs font-mono">{t('ui.texture_sub')}</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                    {[
                        { val: 0.5, label: t('ui.quality_low') },
                        { val: 0.75, label: t('ui.quality_med') },
                        { val: 1.0, label: t('ui.quality_high') }
                    ].map(q => (
                        <button key={q.val} onClick={() => { setTempGraphics({ ...tempGraphics, textureQuality: q.val }); soundManager.playUiClick(); }} className={`px-3 py-1 font-bold uppercase border-2 transition-all ${tempGraphics.textureQuality === q.val ? 'bg-white text-black border-white' : 'bg-black text-gray-500 border-gray-700'}`}>
                            {q.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Volumetric Fog */}
            <div onClick={toggleVolumetricFog} className="w-full bg-gray-900/50 p-4 md:p-6 border border-gray-700 flex flex-col md:flex-row justify-between items-start md:items-center transition-colors hover:border-blue-400 cursor-pointer group rounded-lg gap-4">
                <div>
                    <h3 className="text-xl font-semibold text-white uppercase tracking-wider mb-1 group-hover:text-blue-300 transition-colors">{t('ui.volumetric_fog')}</h3>
                    <p className="text-orange-400 text-xs font-mono uppercase font-bold mb-1">(Needs reload)</p>
                    <p className="text-gray-400 text-xs font-mono">{t('ui.volumetric_fog_sub')}</p>
                </div>
                <div className="flex gap-2">
                    <button className={`px-4 py-1 font-bold uppercase border-2 transition-all ${tempGraphics.volumetricFog ? 'bg-white text-black border-white' : 'bg-black text-gray-500 border-gray-700'}`}>{t('ui.on')}</button>
                    <button className={`px-4 py-1 font-bold uppercase border-2 transition-all ${!tempGraphics.volumetricFog ? 'bg-white text-black border-white' : 'bg-black text-gray-500 border-gray-700'}`}>{t('ui.off')}</button>
                </div>
            </div>

            {/* Antialiasing (Needs Refresh) */}
            <div onClick={toggleAntialias} className="w-full bg-gray-900/50 p-4 md:p-6 border border-gray-700 flex flex-col md:flex-row justify-between items-start md:items-center transition-colors hover:border-blue-400 cursor-pointer group rounded-lg gap-4">
                <div>
                    <h3 className="text-xl font-semibold text-white uppercase tracking-wider mb-1 group-hover:text-blue-300 transition-colors">{t('ui.antialias')}</h3>
                    <p className="text-orange-400 text-xs font-mono uppercase font-bold mb-1">(Needs reload)</p>
                    <p className="text-gray-400 text-xs font-mono">{t('ui.antialias_sub')}</p>
                </div>
                <div className="flex gap-2">
                    <button className={`px-4 py-1 font-bold uppercase border-2 transition-all ${tempGraphics.antialias ? 'bg-white text-black border-white' : 'bg-black text-gray-500 border-gray-700'}`}>{t('ui.on')}</button>
                    <button className={`px-4 py-1 font-bold uppercase border-2 transition-all ${!tempGraphics.antialias ? 'bg-white text-black border-white' : 'bg-black text-gray-500 border-gray-700'}`}>{t('ui.off')}</button>
                </div>
            </div>
        </div>
    );

    const renderGeneralTab = () => (
        <div className="flex flex-col items-center justify-start h-full max-w-2xl mx-auto space-y-6 overflow-y-auto pr-4 custom-scrollbar py-4 px-2">
            {/* Language Selector */}
            <div onClick={toggleLocale} className="w-full bg-gray-900/50 p-4 md:p-6 border border-gray-700 flex flex-col md:flex-row justify-between items-start md:items-center transition-colors hover:border-white cursor-pointer group rounded-lg gap-4">
                <div>
                    <h3 className="text-xl font-semibold text-white uppercase tracking-wider mb-1 group-hover:text-blue-300 transition-colors">{t('ui.language')}</h3>
                    <p className="text-gray-400 text-xs font-mono">{t('ui.language_sub')}</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={(e) => { e.stopPropagation(); setLocale('en'); setTick(t => t + 1); soundManager.playUiClick(); }} className={`px-4 py-1 font-bold uppercase border-2 transition-all ${getLocale() === 'en' ? 'bg-white text-black border-white' : 'bg-black text-gray-500 border-gray-700'}`}>EN</button>
                    <button onClick={(e) => { e.stopPropagation(); setLocale('sv'); setTick(t => t + 1); soundManager.playUiClick(); }} className={`px-4 py-1 font-bold uppercase border-2 transition-all ${getLocale() === 'sv' ? 'bg-white text-black border-white' : 'bg-black text-gray-500 border-gray-700'}`}>SV</button>
                </div>
            </div>

            {/* Show FPS Toggle */}
            <div onClick={onToggleShowFps} className="w-full bg-gray-900/50 p-4 md:p-6 border border-gray-700 flex flex-col md:flex-row justify-between items-start md:items-center transition-colors hover:border-white cursor-pointer group rounded-lg gap-4">
                <div>
                    <h3 className="text-xl font-semibold text-white uppercase tracking-wider mb-1 group-hover:text-blue-300 transition-colors">Show FPS</h3>
                    <p className="text-gray-400 text-xs font-mono">Display current frames per second in the top-right corner.</p>
                </div>
                <div className="flex gap-2">
                    <button className={`px-4 py-1 font-bold uppercase border-2 transition-all ${showFps ? 'bg-white text-black border-white' : 'bg-black text-gray-500 border-gray-700'}`}>{t('ui.on')}</button>
                    <button className={`px-4 py-1 font-bold uppercase border-2 transition-all ${!showFps ? 'bg-white text-black border-white' : 'bg-black text-gray-500 border-gray-700'}`}>{t('ui.off')}</button>
                </div>
            </div>

            {/* Discovery Popups Toggle */}
            <div onClick={() => { setTempGraphics({ ...tempGraphics, showDiscoveryPopups: !tempGraphics.showDiscoveryPopups }); soundManager.playUiClick(); }} className="w-full bg-gray-900/50 p-4 md:p-6 border border-gray-700 flex flex-col md:flex-row justify-between items-start md:items-center transition-colors hover:border-white cursor-pointer group rounded-lg gap-4">
                <div>
                    <h3 className="text-xl font-semibold text-white uppercase tracking-wider mb-1 group-hover:text-blue-300 transition-colors">{t('ui.discovery_popups')}</h3>
                    <p className="text-gray-400 text-xs font-mono">{t('ui.discovery_popups_sub')}</p>
                </div>
                <div className="flex gap-2">
                    <button className={`px-4 py-1 font-bold uppercase border-2 transition-all ${tempGraphics.showDiscoveryPopups ? 'bg-white text-black border-white' : 'bg-black text-gray-500 border-gray-700'}`}>{t('ui.on')}</button>
                    <button className={`px-4 py-1 font-bold uppercase border-2 transition-all ${!tempGraphics.showDiscoveryPopups ? 'bg-white text-black border-white' : 'bg-black text-gray-500 border-gray-700'}`}>{t('ui.off')}</button>
                </div>
            </div>
        </div>
    );

    return (
        <ScreenModalLayout
            title={t('ui.settings')}
            isMobileDevice={isMobileDevice}
            onClose={onClose}
            onConfirm={handleSave}
            confirmLabel={t('ui.save_settings') || 'Save settings'}
            cancelLabel={t('ui.cancel') || 'Cancel'}
            isSmall={true}
            titleColorClass="text-blue-600"
            tabs={['graphics', 'general']}
            activeTab={activeTab}
            onTabChange={(tab: any) => { setActiveTab(tab); soundManager.playUiClick(); }}
            tabOrientation={effectiveLandscape ? 'vertical' : 'horizontal'}
        >
            <div className={`flex h-full ${effectiveLandscape ? 'flex-row gap-8 pl-safe' : 'flex-col gap-4'}`}>
                {/* Tabs bar */}
                <div className={`relative shrink-0 ${effectiveLandscape ? 'w-1/3 flex flex-col gap-4 overflow-y-auto pl-safe custom-scrollbar' : ''}`}>
                    <div className={`${effectiveLandscape ? 'flex flex-col gap-4 pt-4 pr-10' : 'flex gap-2 border-b-2 border-gray-800 pb-2 md:pb-4 overflow-x-auto px-4 pt-2 items-end scrollbar-hide'}`}>
                        {['graphics', 'general'].map(tab => {
                            const isActive = activeTab === tab;
                            const tabColor = '#3b82f6'; // Blue for settings
                            const tabKey = 'ui.' + tab;

                            return (
                                <button key={tab} onClick={() => { setActiveTab(tab as 'graphics' | 'general'); soundManager.playUiClick(); }}
                                    className={`px-3 md:px-6 py-1.5 md:py-4 transition-all duration-200 hover:scale-105 active:scale-95 whitespace-nowrap flex justify-between items-center border-2 border-zinc-700
                                        ${isActive
                                            ? 'text-white animate-tab-pulsate'
                                            : 'bg-black text-zinc-400 hover:bg-zinc-900 shadow-none'
                                        } 
                                        ${effectiveLandscape ? 'w-full text-left p-4 md:p-6 text-xl font-semibold uppercase tracking-wider mx-2' : 'text-[10px] md:text-lg font-bold uppercase tracking-widest'}
                                    `}
                                    style={isActive ? {
                                        backgroundColor: darkenColor(tabColor, 20),
                                        '--pulse-color': tabColor
                                    } as any : {}}
                                >
                                    <span>{t(tabKey)}</span>
                                    {isActive && effectiveLandscape && <span className="text-white font-bold ml-2">→</span>}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="flex-1 flex flex-col min-w-0 pr-safe min-h-0">
                    {activeTab === 'graphics' ? renderGraphicsTab() : renderGeneralTab()}
                </div>
            </div>

            {/* RELOAD CONFIRMATION MODAL */}
            {showReloadConfirm && (
                <div className="absolute inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-md font-mono">
                    <div className="bg-zinc-950 border-2 border-blue-600 p-8 md:p-12 max-w-xl w-full mx-4 shadow-[0_0_50px_rgba(37,99,235,0.3)] flex flex-col gap-6 scale-animation origin-center">
                        <h2 className="text-3xl md:text-5xl font-black uppercase text-blue-600 tracking-tighter leading-none italic">
                            {t('ui.reload_required')}
                        </h2>
                        <p className="text-gray-300 text-sm md:text-lg font-bold uppercase tracking-widest py-2">
                            {t('ui.reload_desc')}
                        </p>

                        <div className="flex gap-4 mt-4">
                            <button
                                onClick={() => { soundManager.playUiClick(); confirmReload(); }}
                                className="px-8 py-3 bg-zinc-800 border-2 border-zinc-700 text-zinc-400 font-black uppercase tracking-widest hover:bg-zinc-700 transition-all"
                            >
                                {t('ui.reload_now')}
                            </button>
                            <button
                                onClick={() => { soundManager.playUiClick(); setShowReloadConfirm(false); onClose(); }}
                                className="px-8 py-3 bg-zinc-100 border-2 border-zinc-100 text-black font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-[0_0_20px_rgba(255,255,255,0.2)]"
                            >
                                {t('ui.reload_later')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </ScreenModalLayout>
    );
};

export default ScreenSettings;