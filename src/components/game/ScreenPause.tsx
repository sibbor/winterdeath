
import React from 'react';
import { t } from '../../utils/i18n';
import { soundManager } from '../../utils/sound';
import GameModalLayout from './GameModalLayout';

interface ScreenPauseProps {
    onResume: () => void;
    onAbort: () => void;
    onOpenMap: () => void;
    onOpenSettings: () => void;
}

const ScreenPause: React.FC<ScreenPauseProps> = ({ onResume, onAbort, onOpenMap, onOpenSettings }) => {
    const buttonStyle = "w-full py-4 font-black uppercase tracking-wider transition-all duration-200 border-2 shadow-lg hover:scale-105 active:scale-95 skew-x-[-10deg]";

    // Unified ESC handling is managed via useGlobalInput in App.tsx

    return (
        <GameModalLayout title={t('ui.paused')}>
            <div className="space-y-6">
                <button onClick={onResume} className={`${buttonStyle} bg-white text-black border-white hover:bg-slate-300`}>
                    <span className="block skew-x-[10deg]">{t('ui.continue')}</span>
                </button>
                <button
                    onClick={() => { soundManager.playUiClick(); onOpenSettings(); }}
                    className={`${buttonStyle} bg-slate-800 text-white border-slate-600 hover:bg-slate-700`}
                >
                    <span className="block skew-x-[10deg]">{t('ui.settings')}</span>
                </button>
                <button onClick={onAbort} className={`${buttonStyle} bg-black text-red-600 border-red-600 hover:bg-red-900/20`}>
                    <span className="block skew-x-[10deg]">{t('ui.end_mission')}</span>
                </button>
            </div>
        </GameModalLayout>
    );
};

export default ScreenPause;
