
import React, { useState } from 'react';
import { t, setLocale, getLocale } from '../../utils/i18n';
import { soundManager } from '../../utils/sound';
import { GraphicsSettings } from '../../types';
import { SHADOW_PRESETS } from '../../content/constants';
import CampModalLayout from './CampModalLayout';

interface ScreenSettingsProps {
    onClose: () => void;
    graphics: GraphicsSettings;
    onUpdateGraphics: (settings: GraphicsSettings) => void;
    isMobileDevice?: boolean;
}

const ScreenSettings: React.FC<ScreenSettingsProps> = ({ onClose, graphics, onUpdateGraphics, isMobileDevice }) => {
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
        onUpdateGraphics({ ...graphics, pixelRatio: ratio });
        soundManager.playUiClick();
    };


    const toggleAntialias = () => {
        onUpdateGraphics({ ...graphics, antialias: !graphics.antialias });
        soundManager.playUiClick();
    };

    return (
        <CampModalLayout
            title={t('ui.settings')}
            borderColorClass="border-white"
            onClose={onClose}
            onConfirm={onClose}
            confirmLabel={t('ui.close')}
            isSettings={true}
            showCancel={false}
            isMobile={isMobileDevice}
        >
            <div className="flex flex-col items-center justify-start h-full max-w-2xl mx-auto space-y-6 overflow-y-auto pr-4 custom-scrollbar py-4 px-2">
                {/* Language Selector */}
                <div onClick={toggleLocale} className="w-full bg-gray-900/50 p-4 md:p-6 border border-gray-700 flex flex-col md:flex-row justify-between items-start md:items-center transition-colors hover:border-white cursor-pointer group rounded-lg gap-4">
                    <div>
                        <h3 className="text-xl font-black text-white uppercase tracking-wider mb-1 group-hover:text-blue-300 transition-colors">{t('ui.language')}</h3>
                        <p className="text-gray-400 text-xs font-mono">{t('ui.language_sub')}</p>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={(e) => { e.stopPropagation(); setLocale('en'); setTick(t => t + 1); soundManager.playUiClick(); }} className={`px-4 py-1 font-bold uppercase border-2 transition-all ${getLocale() === 'en' ? 'bg-white text-black border-white' : 'bg-transparent text-gray-500 border-gray-700'}`}>EN</button>
                        <button onClick={(e) => { e.stopPropagation(); setLocale('sv'); setTick(t => t + 1); soundManager.playUiClick(); }} className={`px-4 py-1 font-bold uppercase border-2 transition-all ${getLocale() === 'sv' ? 'bg-white text-black border-white' : 'bg-transparent text-gray-500 border-gray-700'}`}>SV</button>
                    </div>
                </div>

                {/* Resolution / Pixel Ratio */}
                <div className="w-full bg-gray-900/50 p-4 md:p-6 border border-gray-700 flex flex-col md:flex-row justify-between items-start md:items-center transition-colors hover:border-white rounded-lg group gap-4">
                    <div className="flex-1">
                        <h3 className="text-xl font-black text-white uppercase tracking-wider mb-1 group-hover:text-blue-300 transition-colors">{t('ui.resolution')}</h3>
                        <p className="text-gray-400 text-xs font-mono">{t('ui.resolution_sub')}</p>
                    </div>

                    <div className="flex flex-col items-center md:items-end gap-2 w-full md:w-64">
                        <input
                            type="range"
                            min="0"
                            max="3"
                            step="1"
                            value={
                                graphics.pixelRatio <= 0.5 ? 0 :
                                    graphics.pixelRatio <= 0.75 ? 1 :
                                        graphics.pixelRatio <= 0.85 ? 2 : 3
                            }
                            onChange={(e) => {
                                const val = parseInt(e.target.value);
                                const ratios = [0.5, 0.75, 0.85, 1.0];
                                setPixelRatio(ratios[val]);
                            }}
                            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-white"
                        />
                        <div className="flex justify-between w-full text-[10px] font-mono text-gray-500 mt-1 uppercase">
                            <span className={graphics.pixelRatio <= 0.5 ? 'text-white font-bold' : ''}>{t('ui.res_performance').substring(0, 4)}</span>
                            <span className={graphics.pixelRatio > 0.5 && graphics.pixelRatio <= 0.75 ? 'text-white font-bold' : ''}>{t('ui.res_standard').substring(0, 3)}</span>
                            <span className={graphics.pixelRatio > 0.75 && graphics.pixelRatio <= 0.85 ? 'text-white font-bold' : ''}>{t('ui.res_optimized').substring(0, 3)}</span>
                            <span className={graphics.pixelRatio > 0.85 ? 'text-white font-bold' : ''}>{t('ui.res_native').substring(0, 6)}</span>
                        </div>
                        <div className="text-xs font-bold text-blue-400 uppercase tracking-widest bg-blue-900/20 px-2 py-0.5 rounded border border-blue-500/30">
                            {
                                graphics.pixelRatio <= 0.5 ? `${t('ui.res_performance')} (0.5x)` :
                                    graphics.pixelRatio <= 0.75 ? `${t('ui.res_standard')} (0.75x)` :
                                        graphics.pixelRatio <= 0.85 ? `${t('ui.res_optimized')} (0.85x)` : `${t('ui.res_native')} (1.0x)`
                            }
                        </div>
                    </div>
                </div>

                {/* Shadow Quality */}
                <div className="w-full bg-gray-900/50 p-4 md:p-6 border border-gray-700 flex flex-col md:flex-row justify-between items-start md:items-center transition-colors hover:border-white rounded-lg group gap-4">
                    <div>
                        <h3 className="text-xl font-black text-white uppercase tracking-wider mb-1 group-hover:text-blue-300 transition-colors">{t('ui.shadow_quality')}</h3>
                        <p className="text-gray-400 text-xs font-mono">{t('ui.shadow_sub')}</p>
                    </div>
                    <div className="flex gap-1 md:gap-2 flex-wrap">
                        <button
                            onClick={() => { onUpdateGraphics({ ...graphics, ...SHADOW_PRESETS.OFF }); soundManager.playUiClick(); }}
                            className={`px-3 py-1 text-xs md:text-base font-bold uppercase border-2 transition-all ${!graphics.shadows ? 'bg-white text-black border-white' : 'bg-transparent text-gray-500 border-gray-700'}`}
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
                                onClick={() => { onUpdateGraphics({ ...graphics, ...q.preset }); soundManager.playUiClick(); }}
                                className={`px-2 py-1 text-xs md:text-base font-bold uppercase border-2 transition-all ${graphics.shadows && graphics.shadowMapType === q.preset.shadowMapType ? 'bg-white text-black border-white' : 'bg-transparent text-gray-500 border-gray-700'}`}
                            >
                                {q.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Texture Quality */}
                <div className="w-full bg-gray-900/50 p-4 md:p-6 border border-gray-700 flex flex-col md:flex-row justify-between items-start md:items-center transition-colors hover:border-white rounded-lg group gap-4">
                    <div>
                        <h3 className="text-xl font-black text-white uppercase tracking-wider mb-1 group-hover:text-blue-300 transition-colors">{t('ui.texture_quality')}</h3>
                        <p className="text-gray-400 text-xs font-mono">{t('ui.texture_sub')}</p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        {[
                            { val: 0.5, label: t('ui.quality_low') },
                            { val: 0.75, label: t('ui.quality_med') },
                            { val: 1.0, label: t('ui.quality_high') }
                        ].map(q => (
                            <button key={q.val} onClick={() => { onUpdateGraphics({ ...graphics, textureQuality: q.val }); soundManager.playUiClick(); }} className={`px-3 py-1 font-bold uppercase border-2 transition-all ${graphics.textureQuality === q.val ? 'bg-white text-black border-white' : 'bg-transparent text-gray-500 border-gray-700'}`}>
                                {q.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Antialiasing (Needs Refresh) */}
                <div onClick={toggleAntialias} className="w-full bg-gray-900/50 p-4 md:p-6 border border-gray-700 flex flex-col md:flex-row justify-between items-start md:items-center transition-colors hover:border-blue-400 cursor-pointer group rounded-lg gap-4">
                    <div>
                        <h3 className="text-xl font-black text-white uppercase tracking-wider mb-1 group-hover:text-blue-300 transition-colors">{t('ui.antialias')}</h3>
                        <p className="text-gray-400 text-xs font-mono">{t('ui.antialias_sub')}</p>
                    </div>
                    <div className="flex gap-2">
                        <button className={`px-4 py-1 font-bold uppercase border-2 transition-all ${graphics.antialias ? 'bg-white text-black border-white' : 'bg-transparent text-gray-500 border-gray-700'}`}>{t('ui.on')}</button>
                        <button className={`px-4 py-1 font-bold uppercase border-2 transition-all ${!graphics.antialias ? 'bg-white text-black border-white' : 'bg-transparent text-gray-500 border-gray-700'}`}>{t('ui.off')}</button>
                    </div>
                </div>

            </div>
        </CampModalLayout>
    );
};

export default ScreenSettings;