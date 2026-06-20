import React from 'react';
import { COLORS } from '../../../../utils/ui/ColorUtils';

export const VitalsPanel = React.memo(({ isMobileDevice, hpBarRef, hpTextRef, stBarRef, stTextRef, xpBarRef, xpTextRef }: any) => {
    return (
        <div className={`relative flex flex-col gap-2 p-4 ${isMobileDevice ? 'w-40' : 'w-80'}`}>
            {/* SMOKY CINEMATIC BACKGROUND */}
            <div
                className="absolute inset-0 pointer-events-none animate-fadeIn"
                style={{
                    background: 'radial-gradient(50% 50% at 50% 50%, rgba(0, 0, 0, 0.95) 0%, rgba(0, 0, 0, 0.65) 60%, transparent 100%)',
                    filter: 'blur(16px)',
                    transform: 'scaleX(1.4) scaleY(1.15)'
                }}
            />

            {/* CONTENT wrapper */}
            <div className="relative flex flex-col gap-2 z-10 w-full">
                {/* HP BAR (No border) */}
                <div className={`w-full overflow-hidden bg-black/45 rounded-sm relative ${isMobileDevice ? 'h-5' : 'h-8'}`}>
                    <div ref={hpBarRef} className="w-full h-full origin-left will-change-transform" style={{ backgroundColor: COLORS.RED.str, transform: 'scaleX(0)' }} />
                    <div className="absolute inset-0 flex items-center justify-start px-3">
                        <span ref={hpTextRef} className={`${isMobileDevice ? 'text-[10px]' : 'text-[12px]'} text-white font-mono font-bold tracking-widest drop-shadow-md`}>
                            0 / 100
                        </span>
                    </div>
                </div>

                {/* STAMINA BAR (No border) */}
                <div className={`w-full overflow-hidden bg-black/45 rounded-sm relative ${isMobileDevice ? 'h-2' : 'h-3.5'}`}>
                    <div ref={stBarRef} className="w-full h-full origin-left will-change-transform" style={{ backgroundColor: COLORS.PURPLE.str, transform: 'scaleX(0)' }} />
                </div>

                {/* XP BAR (No border) */}
                <div className={`w-full overflow-hidden bg-black/45 rounded-sm relative ${isMobileDevice ? 'h-1.5' : 'h-2.5'}`}>
                    <div ref={xpBarRef} className="w-full h-full origin-left will-change-transform" style={{ backgroundColor: COLORS.CYAN.str, transform: 'scaleX(0)' }} />
                </div>
            </div>
        </div>
    );
});