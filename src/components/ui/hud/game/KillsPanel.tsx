import React from 'react';
import { t } from '../../../../utils/i18n';
import { COLORS } from '../../../../utils/ui/ColorUtils';

export const KillsPanel = React.memo(({ isMobileDevice, killsTextRef }: any) => {
    return (
        <div className="flex items-start">
            <div className="flex flex-col items-center">
                <span ref={killsTextRef} className={`${isMobileDevice ? 'text-2xl' : 'text-4xl'} font-thin text-white font-mono leading-none hud-kill-text`}>
                    0
                </span>
                <span className={`${isMobileDevice ? 'text-[10px]' : 'text-sm'} font-bold tracking-widest uppercase opacity-80`} style={{ color: COLORS.RED.str }}>
                    {t('ui.kills')}
                </span>
            </div>
        </div>
    );
});