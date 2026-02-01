
import React, { useEffect } from 'react';
import { SectorTrigger } from '../../types';
import { t } from '../../utils/i18n';
import { soundManager } from '../../utils/sound';

interface ScreenClueProps {
    clue: SectorTrigger;
    onClose: () => void;
}

const ScreenClue: React.FC<ScreenClueProps> = ({ clue, onClose }) => {

    useEffect(() => {
        soundManager.playUiConfirm();
    }, []);

    // Unified ESC handling is managed via useGlobalInput in App.tsx

    return (
        <div className="absolute inset-0 z-50 bg-black/40 backdrop-blur-md flex items-center justify-center p-8" onClick={(e) => e.stopPropagation()}>
            <div className="max-w-2xl w-full border-4 border-gray-800 bg-black p-12 shadow-[0_0_50px_rgba(255,255,0,0.2)] flex flex-col items-center text-center relative skew-x-[-2deg]">
                <h2 className="text-5xl font-black text-yellow-500 uppercase tracking-tighter mb-8 border-b-4 border-yellow-700 pb-2 inline-block skew-x-[-5deg]">
                    {t('ui.clue_found_title')}
                </h2>

                {clue.icon && (
                    <div className="text-6xl mb-4 animate-bounce">
                        {clue.icon}
                    </div>
                )}

                <h3 className="text-3xl font-black text-white uppercase tracking-tighter mb-4 border-b border-gray-700 pb-2">
                    {t(clue.content)}
                </h3>

                {clue.description && (
                    <p className="text-xl text-slate-300 font-mono mb-8 italic">
                        "{t(clue.description)}"
                    </p>
                )}

                <button
                    onClick={onClose}
                    className="px-8 py-3 bg-yellow-700 hover:bg-yellow-600 text-black font-black uppercase tracking-widest border-2 border-yellow-500 shadow-lg active:scale-95 transition-transform skew-x-[-5deg]"
                >
                    <span className="block skew-x-[5deg]">{t('ui.close')}</span>
                </button>
            </div>
        </div>
    );
};

export default ScreenClue;
