import React from 'react';
import { t } from '../../../../utils/i18n';
import { UiSounds } from '../../../../utils/audio/AudioLib';
import ScreenModalLayout, { TacticalButton } from '../../layout/ScreenModalLayout';

interface ScreenPauseProps {
    onResume: () => void;
    onAbort: () => void;
    onOpenMap: () => void;
    onOpenSettings: () => void;
    onOpenAdventureLog: () => void;
    onOpenStatistics: () => void;
    onQuit: () => void;
    isMobileDevice?: boolean;
}

const ScreenPause: React.FC<ScreenPauseProps> = ({ onResume, onAbort, onOpenMap, onOpenSettings, onOpenAdventureLog, onOpenStatistics, isMobileDevice, onQuit }) => {
    const buttonStyle = `w-full ${isMobileDevice ? 'py-3 text-sm' : 'py-4'} font-black uppercase tracking-wider transition-all duration-200 border-2 shadow-lg hover:scale-105 active:scale-95`;

    return (
        <ScreenModalLayout
            title={t('ui.paused')}
            isMobileDevice={isMobileDevice}
            onClose={onResume}
            showCloseButton={false}
            isSmallScreen={true}
        >
            <div className={`space-y-4 md:space-y-6 ${isMobileDevice ? 'px-2' : ''}`}>
                <TacticalButton onClick={onResume} className="w-full">
                    {t('ui.continue')}
                </TacticalButton>

                <TacticalButton onClick={onOpenAdventureLog} variant="secondary" className="w-full">
                    {t('ui.adventure_log')}
                </TacticalButton>

                <TacticalButton onClick={onOpenStatistics} variant="secondary" className="w-full">
                    {t('ui.statistics')}
                </TacticalButton>

                <TacticalButton onClick={onOpenMap} variant="secondary" className="w-full">
                    {t('ui.map_btn')}
                </TacticalButton>

                <TacticalButton onClick={onOpenSettings} variant="secondary" className="w-full">
                    {t('ui.settings')}
                </TacticalButton>

                <TacticalButton onClick={onAbort} variant="danger" className="w-full mt-4 md:mt-8">
                    {t('ui.end_game')}
                </TacticalButton>
            </div>
        </ScreenModalLayout>
    );
};

export default ScreenPause;
