import React, { useRef, useEffect, useCallback } from 'react';
import { t } from '../../utils/i18n';
import { soundManager } from '../../utils/SoundManager';

interface CampModalLayoutProps {
    title: string;
    borderColorClass?: string;
    onClose: () => void;
    onConfirm?: () => void;
    confirmLabel?: string;
    closeLabel?: string;
    canConfirm?: boolean;
    children: React.ReactNode;
    isSettings?: boolean;
    showCancel?: boolean;
    isSmall?: boolean;
    isMobileDevice?: boolean;
    debugAction?: { label: string; action: () => void };
    titleColor?: string;
    primaryClose?: boolean;
    extraHeaderContent?: React.ReactNode;
    fullHeight?: boolean;
}

const CampModalLayout: React.FC<CampModalLayoutProps> = ({
    title,
    borderColorClass = 'border-gray-600',
    onClose,
    onConfirm,
    confirmLabel,
    closeLabel,
    canConfirm = true,
    children,
    isSettings = false,
    showCancel = true,
    isSmall = false,
    isMobileDevice = false,
    debugAction,
    titleColor = 'text-white',
    primaryClose = false,
    extraHeaderContent,
    fullHeight = false
}) => {
    const buttonStyle = "px-4 md:px-8 py-2 md:py-3 font-bold uppercase tracking-wider transition-all duration-200 border-2 shadow-lg text-xs md:text-base hover:scale-105 active:scale-95";

    const maxWidth = isSmall ? 'max-w-2xl' : 'max-w-7xl';
    const height = fullHeight
        ? (isSmall ? 'h-[85vh]' : 'h-[85vh] md:h-[90vh]')
        : (isSmall ? 'h-auto max-h-[85vh]' : 'h-fit max-h-[85vh] md:max-h-[90vh]');

    // --- ZERO-GC CALLBACK REFS ---
    const callbacksRef = useRef({ onClose, onConfirm, canConfirm });
    useEffect(() => {
        callbacksRef.current = { onClose, onConfirm, canConfirm };
    }, [onClose, onConfirm, canConfirm]);

    useEffect(() => {
        if (document.pointerLockElement) document.exitPointerLock();
        document.body.style.cursor = 'default';

        const handleKeys = (e: KeyboardEvent) => {
            const { onClose: currentClose, onConfirm: currentConfirm, canConfirm: currentCanConfirm } = callbacksRef.current;

            if (e.key === 'Escape') {
                e.stopPropagation();
                soundManager.playUiClick();
                currentClose();
            } else if (e.key === 'Enter' && currentConfirm && currentCanConfirm) {
                e.stopPropagation();
                e.preventDefault();
                soundManager.playUiConfirm();
                currentConfirm();
            }
        };

        window.addEventListener('keydown', handleKeys);
        return () => {
            window.removeEventListener('keydown', handleKeys);
            document.body.style.cursor = '';
        };
    }, []);

    // --- ZERO-GC CLICK HANDLERS ---
    const handleDebugClick = useCallback(() => {
        if (debugAction) {
            soundManager.playUiClick();
            debugAction.action();
        }
    }, [debugAction]);

    const handleCloseClick = useCallback(() => {
        soundManager.playUiClick();
        onClose();
    }, [onClose]);

    const handleConfirmClick = useCallback(() => {
        if (canConfirm && onConfirm) {
            soundManager.playUiConfirm();
            onConfirm();
        }
    }, [canConfirm, onConfirm]);

    const mobile = isMobileDevice;

    return (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-[80] p-0 md:p-4 backdrop-blur-2xl pointer-events-auto cursor-default font-mono overflow-hidden">
            <div className={`
                bg-zinc-950 border border-zinc-800 w-full ${maxWidth} ${height} flex flex-col shadow-[0_0_100px_rgba(0,0,0,0.8)] relative overflow-hidden
                ${mobile ? 'w-[95%] h-[85%] border-zinc-700' : `transform scale-50 md:scale-100 origin-center`}
            `}>
                
                {/* Hardware Details */}
                <div className="absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 border-zinc-700/50 z-20 pointer-events-none" />
                <div className="absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 border-zinc-700/50 z-20 pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 border-zinc-700/50 z-20 pointer-events-none" />
                <div className="absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 border-zinc-700/50 z-20 pointer-events-none" />

                {/* Decorative Lines */}
                <div className="absolute top-4 left-1/2 -translate-x-1/2 w-[80%] h-px bg-zinc-800/50 z-0" />
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[80%] h-px bg-zinc-800/50 z-0" />

                {/* Grid Background */}
                <div className="absolute inset-0 opacity-[0.05] pointer-events-none z-0" 
                     style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
                
                {/* Scanline Effect */}
                <div className="absolute inset-0 pointer-events-none z-10 opacity-[0.03] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%]" />

                {/* Header Container */}
                <div className={`p-8 md:p-12 pb-0 flex flex-col gap-4 relative z-20 pl-safe pr-safe shrink-0`}>
                    <div className="mb-8 border-b-2 border-zinc-800/80 pb-6 relative flex justify-between items-center w-full">
                        <div className="flex flex-col">
                            <h2 className={`text-5xl md:text-7xl font-black uppercase tracking-tighter inline-block ${titleColor} italic drop-shadow-[0_0_15px_rgba(0,0,0,0.5)]`}>
                                {title}
                            </h2>
                        </div>

                        <div className="flex items-center gap-6">
                            {extraHeaderContent && (
                                <div className="flex-shrink-0">
                                    {extraHeaderContent}
                                </div>
                            )}

                            {/* Desktop Buttons */}
                            <div className="hidden md:flex items-center gap-4">
                                {debugAction && (
                                    <button
                                        onClick={handleDebugClick}
                                        className="px-6 py-3 font-bold uppercase tracking-widest transition-all duration-200 border-2 border-red-500 text-red-500 hover:bg-red-500 hover:text-black hover:scale-105 active:scale-95 whitespace-nowrap text-sm"
                                    >
                                        {debugAction.label}
                                    </button>
                                )}
                                {showCancel && (
                                    <button
                                        onClick={handleCloseClick}
                                        className={`${buttonStyle} ${primaryClose ? 'border-white bg-white text-black' : 'border-zinc-700 text-zinc-400 bg-zinc-900'}`}
                                    >
                                        {closeLabel || t('ui.close')}
                                    </button>
                                )}
                                {onConfirm && (
                                    <button
                                        onClick={handleConfirmClick}
                                        disabled={!canConfirm}
                                        className={`${buttonStyle} ${canConfirm ? 'border-white bg-white text-black' : 'border-zinc-800 text-zinc-600 bg-zinc-900 cursor-not-allowed'}`}
                                    >
                                        {confirmLabel || t('ui.confirm')}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Mobile Buttons (Portrait) */}
                    <div className="flex md:hidden gap-4 w-full mb-6">
                        {showCancel && (
                            <button
                                onClick={handleCloseClick}
                                className={`${buttonStyle} flex-1 border-zinc-700 text-zinc-400 bg-zinc-900`}
                            >
                                {closeLabel || t('ui.close')}
                            </button>
                        )}
                        {onConfirm && (
                            <button
                                onClick={handleConfirmClick}
                                disabled={!canConfirm}
                                className={`${buttonStyle} flex-1 ${canConfirm ? 'border-white bg-white text-black' : 'border-zinc-800 text-zinc-600 bg-zinc-900 cursor-not-allowed'}`}
                            >
                                {confirmLabel || t('ui.confirm')}
                            </button>
                        )}
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto px-8 md:px-16 pb-12 custom-scrollbar bg-transparent touch-auto relative z-20 px-safe">
                    {children}
                </div>
            </div>
        </div>
    );
};

export default CampModalLayout;