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

    return (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-[80] p-4 md:p-8 backdrop-blur-2xl pointer-events-auto cursor-default">
            <div className={`bg-black border border-white/10 w-full ${maxWidth} ${height} flex flex-col shadow-[0_0_100px_rgba(0,0,0,0.8)] relative overflow-hidden`}>
                <div className="absolute inset-0 opacity-[0.03] pointer-events-none mix-blend-overlay" />

                {/* Header Container */}
                <div className={`p-4 md:p-8 flex flex-col gap-4 relative z-20 pl-safe pr-safe`}>

                    {/* TOP ROW: Title and Scrap */}
                    <div className="flex justify-between items-center w-full">
                        <h2 className={`text-2xl md:text-5xl lg:text-7xl font-light uppercase tracking-tighter ${titleColor} truncate ${isMobileDevice ? 'ml-10' : ''}`}>
                            {title}
                        </h2>

                        {extraHeaderContent && (
                            <div className="flex-shrink-0 ml-4">
                                {extraHeaderContent}
                            </div>
                        )}

                        {/* Buttons (Desktop OR Landscape Mobile) - Sköts helt av CSS! */}
                        <div className="hidden md:flex landscape:flex items-center gap-4 ml-8">
                            {debugAction && (
                                <button
                                    onClick={handleDebugClick}
                                    className="px-3 md:px-6 py-1.5 md:py-3 font-bold uppercase tracking-widest transition-all duration-200 border-2 border-red-500 text-red-500 hover:bg-red-500 hover:text-black hover:scale-105 active:scale-95 whitespace-nowrap text-[10px] md:text-sm"
                                >
                                    {debugAction.label}
                                </button>
                            )}
                            {showCancel && (
                                <button
                                    onClick={handleCloseClick}
                                    className={`${buttonStyle} ${primaryClose ? 'border-white bg-white text-black' : 'border-gray-600 text-gray-400 bg-black'}`}
                                >
                                    {closeLabel || t('ui.close')}
                                </button>
                            )}
                            {onConfirm && (
                                <button
                                    onClick={handleConfirmClick}
                                    disabled={!canConfirm}
                                    className={`${buttonStyle} ${canConfirm ? 'border-white bg-white text-black' : 'border-gray-800 text-gray-600 bg-black cursor-not-allowed'}`}
                                >
                                    {confirmLabel || t('ui.confirm')}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* BOTTOM ROW (Mobile Portrait Only): Buttons below the title */}
                    <div className="flex md:hidden landscape:hidden gap-4 w-full pl-10">
                        {showCancel && (
                            <button
                                onClick={handleCloseClick}
                                className={`${buttonStyle} flex-1 border-gray-600 text-gray-400 bg-black`}
                            >
                                {closeLabel || t('ui.close')}
                            </button>
                        )}
                        {onConfirm && (
                            <button
                                onClick={handleConfirmClick}
                                disabled={!canConfirm}
                                className={`${buttonStyle} flex-1 ${canConfirm ? 'border-white bg-white text-black' : 'border-gray-800 text-gray-600 bg-black cursor-not-allowed'}`}
                            >
                                {confirmLabel || t('ui.confirm')}
                            </button>
                        )}
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar bg-transparent touch-auto relative z-10 px-safe">
                    {children}
                </div>
            </div>
        </div>
    );
};

export default CampModalLayout;