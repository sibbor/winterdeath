
import React from 'react';
import { t } from '../../utils/i18n';
import { soundManager } from '../../utils/SoundManager';
import GameModalLayout from './GameModalLayout';

interface ScreenPauseProps {
    onResume: () => void;
    onAbort: () => void;
    onOpenMap: () => void;
    onOpenSettings: () => void;
    onOpenAdventureLog: () => void;
    isMobileDevice?: boolean;
}

const ScreenPause: React.FC<ScreenPauseProps> = ({ onResume, onAbort, onOpenMap, onOpenSettings, onOpenAdventureLog, isMobileDevice }) => {
    const buttonStyle = `w-full ${isMobileDevice ? 'py-3 text-sm' : 'py-4'} font-black uppercase tracking-wider transition-all duration-200 border-2 shadow-lg hover:scale-105 active:scale-95 skew-x-[-10deg]`;
    return (
        <GameModalLayout title={t('ui.paused')} isMobile={isMobileDevice} onClose={onResume} showCloseButton={false}>
            <div className="space-y-6">
                <button onClick={() => { soundManager.playUiClick(); onResume(); }} className={`${buttonStyle} bg-white text-black border-white hover:bg-gray-200`}>
                    <span className="block skew-x-[10deg]">{t('ui.continue')}</span>
                </button>
                <button
                    onClick={() => { soundManager.playUiClick(); onOpenAdventureLog(); }}
                    className={`${buttonStyle} bg-transparent text-gray-400 border-gray-600 hover:text-white hover:border-white`}
                >
                    <span className="block skew-x-[10deg]">{t('ui.adventure_log')}</span>
                </button>
                <button
                    onClick={() => { soundManager.playUiClick(); onOpenMap(); }}
                    className={`${buttonStyle} bg-transparent text-gray-400 border-gray-600 hover:text-white hover:border-white`}
                >
                    <span className="block skew-x-[10deg]">{t('ui.map_btn')}</span>
                </button>
                <button
                    onClick={() => { soundManager.playUiClick(); onOpenSettings(); }}
                    className={`${buttonStyle} bg-transparent text-gray-400 border-gray-600 hover:text-white hover:border-white`}
                >
                    <span className="block skew-x-[10deg]">{t('ui.settings')}</span>
                </button>
                <button onClick={() => { soundManager.playUiClick(); onAbort(); }} className={`${buttonStyle} bg-black text-red-600 border-red-600 hover:bg-red-900/10`}>
                    <span className="block skew-x-[10deg]">{t('ui.end_game')}</span>
                </button>
            </div>
        </GameModalLayout>
    );
};

export default ScreenPause;
