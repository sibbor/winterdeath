
import React, { useState } from 'react';
import { t, setLocale, getLocale } from '../../utils/i18n';
import { soundManager } from '../../utils/sound';
import CampModalLayout from './CampModalLayout';

interface ScreenSettingsProps {
    onClose: () => void;
    showFps: boolean;
    onToggleFps: (val: boolean) => void;
}

const ScreenSettings: React.FC<ScreenSettingsProps> = ({ onClose, showFps, onToggleFps }) => {
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

    return (
        <CampModalLayout 
            title={t('ui.settings')} 
            borderColorClass="border-white"
            onClose={onClose}
            onConfirm={onClose}
            confirmLabel={t('ui.close')}
            isSettings={true}
        >
             <div className="flex flex-col items-center justify-center h-full max-w-2xl mx-auto space-y-12">
                {/* Language Selector */}
                <div 
                    onClick={toggleLocale}
                    className="w-full bg-gray-900/50 p-8 border border-gray-700 flex justify-between items-center transition-colors hover:border-white cursor-pointer group"
                >
                    <div>
                        <h3 className="text-2xl font-black text-white uppercase tracking-wider mb-2 group-hover:text-blue-300 transition-colors">{t('ui.language')}</h3>
                        <p className="text-gray-400 text-sm font-mono">English / Svenska</p>
                    </div>
                    <div className="flex gap-4">
                        <button 
                            onClick={(e) => { e.stopPropagation(); setLocale('en'); soundManager.playUiClick(); setTick(t => t + 1); }}
                            className={`px-6 py-2 font-bold uppercase border-2 transition-all ${getLocale() === 'en' ? 'bg-white text-black border-white' : 'bg-transparent text-gray-500 border-gray-700'}`}
                        >
                            EN
                        </button>
                        <button 
                            onClick={(e) => { e.stopPropagation(); setLocale('sv'); soundManager.playUiClick(); setTick(t => t + 1); }}
                            className={`px-6 py-2 font-bold uppercase border-2 transition-all ${getLocale() === 'sv' ? 'bg-white text-black border-white' : 'bg-transparent text-gray-500 border-gray-700'}`}
                        >
                            SV
                        </button>
                    </div>
                </div>

                {/* Show FPS Toggle */}
                <div 
                    onClick={toggleFps}
                    className="w-full bg-gray-900/50 p-8 border border-gray-700 flex justify-between items-center transition-colors hover:border-white cursor-pointer group"
                >
                    <div>
                        <h3 className="text-2xl font-black text-white uppercase tracking-wider mb-2 group-hover:text-blue-300 transition-colors">{t('ui.show_fps')}</h3>
                        <p className="text-gray-400 text-sm font-mono">ON / OFF</p>
                    </div>
                    <div className="flex gap-4">
                        <button 
                            onClick={(e) => { e.stopPropagation(); onToggleFps(true); soundManager.playUiClick(); }}
                            className={`px-6 py-2 font-bold uppercase border-2 transition-all ${showFps ? 'bg-white text-black border-white' : 'bg-transparent text-gray-500 border-gray-700'}`}
                        >
                            ON
                        </button>
                        <button 
                            onClick={(e) => { e.stopPropagation(); onToggleFps(false); soundManager.playUiClick(); }}
                            className={`px-6 py-2 font-bold uppercase border-2 transition-all ${!showFps ? 'bg-white text-black border-white' : 'bg-transparent text-gray-500 border-gray-700'}`}
                        >
                            OFF
                        </button>
                    </div>
                </div>
            </div>
        </CampModalLayout>
    );
};

export default ScreenSettings;