import React, { useMemo, useCallback } from 'react';
import { t } from '../../../../utils/i18n';

interface VehiclePanelProps {
    isMobileDevice: boolean;
    speedTextRef: React.RefObject<HTMLSpanElement | null>;
    speedArcRef: React.RefObject<SVGPathElement | null>;
    gasPedalRef: React.RefObject<HTMLDivElement | null>;
    skidPedalRef: React.RefObject<HTMLDivElement | null>;
    brakePedalRef: React.RefObject<HTMLDivElement | null>;
}

export const VehiclePanel: React.FC<VehiclePanelProps> = React.memo(({
    isMobileDevice,
    speedTextRef,
    speedArcRef,
    gasPedalRef,
    skidPedalRef,
    brakePedalRef
}) => {
    return (
        <div className={`absolute ${isMobileDevice ? 'bottom-2 pb-safe' : 'bottom-4'} left-1/2 -translate-x-1/2 flex flex-col items-center justify-center p-6 min-w-[320px]`}>
            <div className="absolute inset-0 pointer-events-none"
                style={{
                    background: 'radial-gradient(50% 50% at 50% 50%, rgba(0, 0, 0, 0.95) 0%, rgba(0, 0, 0, 0.65) 60%, transparent 100%)',
                    filter: 'blur(16px)',
                    transform: 'scaleX(1.5) scaleY(1.15)'
                }}
            />

            <div className="relative flex flex-col items-center z-10 w-full">
                <div className="relative w-48 h-48 flex items-center justify-center bg-black/50 rounded-full border border-white/5 shadow-2xl p-2 animate-fadeIn">
                    <svg className="w-full h-full overflow-visible" viewBox="0 0 200 200">
                        <defs>
                            <linearGradient id="speedGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor="#3b82f6" />
                                <stop offset="50%" stopColor="#22c55e" />
                                <stop offset="100%" stopColor="#ef4444" />
                            </linearGradient>
                        </defs>
                        <path d="M 40,145 A 75,75 0 1,1 160,145" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" strokeLinecap="round" />
                        <path ref={speedArcRef} d="M 40,145 A 75,75 0 1,1 160,145" fill="none" stroke="url(#speedGrad)" strokeWidth="8" strokeLinecap="round" strokeDasharray="340" strokeDashoffset="340" />
                        <circle cx="100" cy="100" r="58" fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="1.5" />
                        <circle cx="100" cy="100" r="98" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1.5" />
                    </svg>

                    <div className="absolute inset-0 flex flex-col items-center justify-center pt-2">
                        <span ref={speedTextRef} className="text-4xl font-black font-mono text-white tracking-tighter leading-none block drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">0</span>
                        <span className="text-[10px] font-bold tracking-widest text-white/40 uppercase block mt-1">{t('ui.speed_unit')}</span>
                        <div className="flex items-center gap-1 mt-3 z-10">
                            <div ref={gasPedalRef} className="w-2.5 h-2.5 rounded-full border border-white/10 bg-zinc-950/60 shadow-sm" title={t('ui.gas')} />
                            <div ref={skidPedalRef} className="w-2.5 h-2.5 rounded-full border border-white/10 bg-zinc-950/60 shadow-sm" title={t('ui.skid')} />
                            <div ref={brakePedalRef} className="w-2.5 h-2.5 rounded-full border border-white/10 bg-zinc-950/60 shadow-sm" title={t('ui.brake')} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});