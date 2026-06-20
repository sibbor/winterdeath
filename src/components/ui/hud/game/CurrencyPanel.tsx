import React from 'react';
import { t } from '../../../../utils/i18n';

export const CurrencyPanel = React.memo(({ isMobileDevice, isLandscapeMode, scrapTextRef, spTextRef, scrapBoxRef, spBoxRef }: any) => {
    const size = isMobileDevice ? 'w-14 h-14' : 'w-20 h-20';

    return (
        <div className={`flex ${isMobileDevice && isLandscapeMode ? 'flex-row' : 'flex-col'} gap-3`}>
            {/* SCRAP BOX (CampHUD Style) */}
            <div ref={scrapBoxRef}
                className={`${size} aspect-square border bg-yellow-950/80 border-yellow-700 shadow-[0_0_15px_rgba(234,179,8,0.2)] flex flex-col items-center justify-center gap-0 transition-all pointer-events-auto`}>
                <span className={`${isMobileDevice ? 'text-[10px]' : 'text-[10px]'} block uppercase font-bold text-yellow-500 leading-tight`}>{t('ui.scrap')}</span>
                <span ref={scrapTextRef} className={`${isMobileDevice ? 'text-lg' : 'text-2xl'} font-bold font-mono text-yellow-500 leading-none`}>0</span>
            </div>

            {/* SP BOX (CampHUD Style) */}
            <div ref={spBoxRef}
                className={`${size} aspect-square border bg-purple-950/80 border-purple-700 shadow-[0_0_15px_rgba(168,85,247,0.2)] flex flex-col items-center justify-center gap-0 transition-all pointer-events-auto`}>
                <span className={`${isMobileDevice ? 'text-[10px]' : 'text-[10px]'} block uppercase font-bold text-purple-500 leading-tight`}>{t('ui.sp')}</span>
                <span ref={spTextRef} className={`${isMobileDevice ? 'text-lg' : 'text-2xl'} font-bold font-mono text-purple-500 leading-none`}>0</span>
            </div>
        </div>
    );
});