
import React, { useState } from 'react';
import { t, setLocale, getLocale } from '../../utils/i18n';
import { soundManager } from '../../utils/sound';
import CampModalLayout from './CampModalLayout';

interface GraphicsSettings {
    pixelRatio: number;
    antialias: boolean;
    shadows: boolean;
    shadowMapType: number;
}

interface ScreenSettingsProps {
    onClose: () => void;
    showFps: boolean;
    onToggleFps: (val: boolean) => void;
    graphics: GraphicsSettings;
    onUpdateGraphics: (settings: GraphicsSettings) => void;
}

const ScreenSettings: React.FC<ScreenSettingsProps> = ({ onClose, showFps, onToggleFps, graphics, onUpdateGraphics }) => {
    // Force update to re-render when language changes
    const [, setTick] = useState(0);

    const toggleLocale = () => {
        const current = getLocale();
        const next = current === 'en' ? 'sv' : 'en';
        setLocale(next);
        soundManager.playUiClick();
        setTick(t => t + 1);
    };

    const toggleFps = () => {
        onToggleFps(!showFps);
        soundManager.playUiClick();
    };

    const setPixelRatio = (ratio: number) => {
        onUpdateGraphics({ ...graphics, pixelRatio: ratio });
        soundManager.playUiClick();
    };

    const toggleShadows = () => {
        onUpdateGraphics({ ...graphics, shadows: !graphics.shadows });
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
        >
            <div className="flex flex-col items-center justify-start h-full max-w-2xl mx-auto space-y-6 overflow-y-auto pr-4 custom-scrollbar py-4 px-2">
                {/* Language Selector */}
                <div onClick={toggleLocale} className="w-full bg-gray-900/50 p-6 border border-gray-700 flex justify-between items-center transition-colors hover:border-white cursor-pointer group rounded-lg">
                    <div>
                        <h3 className="text-xl font-black text-white uppercase tracking-wider mb-1 group-hover:text-blue-300 transition-colors">{t('ui.language')}</h3>
                        <p className="text-gray-400 text-xs font-mono">English / Svenska</p>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={(e) => { e.stopPropagation(); setLocale('en'); setTick(t => t + 1); soundManager.playUiClick(); }} className={`px-4 py-1 font-bold uppercase border-2 transition-all ${getLocale() === 'en' ? 'bg-white text-black border-white' : 'bg-transparent text-gray-500 border-gray-700'}`}>EN</button>
                        <button onClick={(e) => { e.stopPropagation(); setLocale('sv'); setTick(t => t + 1); soundManager.playUiClick(); }} className={`px-4 py-1 font-bold uppercase border-2 transition-all ${getLocale() === 'sv' ? 'bg-white text-black border-white' : 'bg-transparent text-gray-500 border-gray-700'}`}>SV</button>
                    </div>
                </div>

                {/* Resolution / Pixel Ratio */}
                <div className="w-full bg-gray-900/50 p-6 border border-gray-700 flex justify-between items-center transition-colors hover:border-white rounded-lg group">
                    <div>
                        <h3 className="text-xl font-black text-white uppercase tracking-wider mb-1 group-hover:text-blue-300 transition-colors">Resolution</h3>
                        <p className="text-gray-400 text-xs font-mono">Performance vs Sharpness</p>
                    </div>
                    <div className="flex gap-2">
                        {[0.75, 1.0, 1.25].map(ratio => (
                            <button key={ratio} onClick={() => setPixelRatio(ratio)} className={`px-3 py-1 font-bold uppercase border-2 transition-all ${graphics.pixelRatio === ratio ? 'bg-white text-black border-white' : 'bg-transparent text-gray-500 border-gray-700'}`}>
                                {ratio === 0.75 ? 'Low' : ratio === 1.0 ? 'Med' : 'High'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Shadow Quality */}
                <div className="w-full bg-gray-900/50 p-6 border border-gray-700 flex justify-between items-center transition-colors hover:border-white rounded-lg group">
                    <div>
                        <h3 className="text-xl font-black text-white uppercase tracking-wider mb-1 group-hover:text-blue-300 transition-colors">Shadow Quality</h3>
                        <p className="text-gray-400 text-xs font-mono">Dynamic Campfire Shadows</p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => { onUpdateGraphics({ ...graphics, shadows: false }); soundManager.playUiClick(); }}
                            className={`px-3 py-1 font-bold uppercase border-2 transition-all ${!graphics.shadows ? 'bg-white text-black border-white' : 'bg-transparent text-gray-500 border-gray-700'}`}
                        >
                            Off
                        </button>
                        {[
                            { label: 'Low', type: 0 },
                            { label: 'Med', type: 1 },
                            { label: 'High', type: 2 }
                        ].map(q => (
                            <button
                                key={q.label}
                                onClick={() => { onUpdateGraphics({ ...graphics, shadows: true, shadowMapType: q.type }); soundManager.playUiClick(); }}
                                className={`px-3 py-1 font-bold uppercase border-2 transition-all ${graphics.shadows && graphics.shadowMapType === q.type ? 'bg-white text-black border-white' : 'bg-transparent text-gray-500 border-gray-700'}`}
                            >
                                {q.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Antialiasing (Needs Refresh) */}
                <div onClick={toggleAntialias} className="w-full bg-gray-900/50 p-6 border border-gray-700 flex justify-between items-center transition-colors hover:border-blue-400 cursor-pointer group rounded-lg">
                    <div>
                        <h3 className="text-xl font-black text-white uppercase tracking-wider mb-1 group-hover:text-blue-300 transition-colors">Antialiasing</h3>
                        <p className="text-gray-400 text-xs font-mono">Smooth out jagged edges</p>
                    </div>
                    <div className="flex gap-2">
                        <button className={`px-4 py-1 font-bold uppercase border-2 transition-all ${graphics.antialias ? 'bg-white text-black border-white' : 'bg-transparent text-gray-500 border-gray-700'}`}>ON</button>
                        <button className={`px-4 py-1 font-bold uppercase border-2 transition-all ${!graphics.antialias ? 'bg-white text-black border-white' : 'bg-transparent text-gray-500 border-gray-700'}`}>OFF</button>
                    </div>
                </div>

                {/* FPS Toggle */}
                <div onClick={toggleFps} className="w-full bg-gray-900/50 p-6 border border-gray-700 flex justify-between items-center transition-colors hover:border-white cursor-pointer group rounded-lg">
                    <div>
                        <h3 className="text-xl font-black text-white uppercase tracking-wider mb-1 group-hover:text-blue-300 transition-colors">{t('ui.show_fps')}</h3>
                        <p className="text-gray-400 text-sm font-mono tracking-tighter">Diagnostic Overlay</p>
                    </div>
                    <div className="flex gap-2">
                        <button className={`px-4 py-1 font-bold uppercase border-2 transition-all ${showFps ? 'bg-white text-black border-white' : 'bg-transparent text-gray-500 border-gray-700'}`}>ON</button>
                        <button className={`px-4 py-1 font-bold uppercase border-2 transition-all ${!showFps ? 'bg-white text-black border-white' : 'bg-transparent text-gray-500 border-gray-700'}`}>OFF</button>
                    </div>
                </div>
            </div>
        </CampModalLayout>
    );
};

export default ScreenSettings;