import React, { useRef, useEffect, useCallback } from 'react';
import { soundManager } from '../../utils/SoundManager';
import { t } from '../../utils/i18n';

interface GameModalLayoutProps {
    title: string | React.ReactNode;
    children: React.ReactNode;
    footer?: React.ReactNode;
    titleColorClass?: string;
    maxWidthClass?: string;
    contentClass?: string;
    transparent?: boolean;
    blurClass?: string;
    isMobileDevice?: boolean;
    onClose?: () => void;
    onConfirm?: () => void;
    showCloseButton?: boolean;
    heightClass?: string;
    onCancel?: () => void;
    confirmLabel?: string;
    cancelLabel?: string;
    canConfirm?: boolean;
    fullHeight?: boolean;
}

const GameModalLayout: React.FC<GameModalLayoutProps> = ({
    title,
    children,
    footer,
    titleColorClass = "text-white",
    maxWidthClass = "max-w-xl",
    heightClass,
    blurClass = "backdrop-blur-md",
    contentClass = "px-4 md:px-16 pb-8 md:pb-12 overflow-y-auto",
    isMobileDevice = false,
    transparent,
    onClose,
    onConfirm,
    onCancel,
    showCloseButton = true,
    confirmLabel,
    cancelLabel,
    canConfirm = true,
    fullHeight = false
}) => {

    const effectiveHeightClass = heightClass || (fullHeight ? "h-[90vh]" : "h-fit max-h-[90vh]");

    // --- ZERO-GC CALLBACK REFS ---
    const callbacksRef = useRef({ onClose, onConfirm, canConfirm });
    useEffect(() => {
        callbacksRef.current = { onClose, onConfirm, canConfirm };
    }, [onClose, onConfirm, canConfirm]);

    useEffect(() => {
        if (document.pointerLockElement) document.exitPointerLock();

        const handleKey = (e: KeyboardEvent) => {
            const { onClose: currentClose, onConfirm: currentConfirm, canConfirm: currentCanConfirm } = callbacksRef.current;

            if (e.key === 'Escape' && currentClose) {
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

        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, []);

    // --- ZERO-GC CLICK HANDLERS ---
    const handleCloseClick = useCallback(() => {
        if (onClose) {
            soundManager.playUiClick();
            onClose();
        }
    }, [onClose]);

    const handleConfirmClick = useCallback(() => {
        if (canConfirm && onConfirm) {
            soundManager.playUiConfirm();
            onConfirm();
        }
    }, [canConfirm, onConfirm]);

    return (
        <div className={`absolute inset-0 flex items-center justify-center z-[100] p-4 md:p-8 pointer-events-auto touch-auto ${transparent ? '' : `bg-black/80 ${blurClass}`}`}>
            <div className={`relative flex flex-col w-full ${maxWidthClass} ${effectiveHeightClass} bg-black border border-white/10 shadow-[0_0_100px_rgba(0,0,0,1)] overflow-hidden`}>
                <div className="absolute inset-0 opacity-[0.03] pointer-events-none mix-blend-overlay" />

                <div className={`p-6 md:p-10 relative z-20 shrink-0 bg-transparent flex flex-col gap-4 pl-safe pr-safe`}>

                    {/* TOP ROW: Title and Desktop/Landscape Buttons */}
                    <div className="flex justify-between items-center w-full">
                        {typeof title === 'string' ? (
                            <h2 className={`text-2xl md:text-5xl lg:text-7xl font-light uppercase tracking-tighter ${titleColorClass} truncate flex-1 ${isMobileDevice ? 'ml-10' : ''}`}>
                                {title}
                            </h2>
                        ) : (
                            <div className="flex-1">{title}</div>
                        )}

                        {/* Buttons (Desktop OR Landscape Mobile) - Handled entirely by CSS */}
                        <div className="hidden md:flex landscape:flex items-center gap-4 ml-8">
                            {onClose && showCloseButton && (
                                <button
                                    onClick={handleCloseClick}
                                    className="px-4 md:px-8 py-2 md:py-4 bg-zinc-900 border-2 border-zinc-700 text-zinc-400 font-bold uppercase tracking-widest hover:bg-zinc-800 transition-all duration-200 hover:scale-105 active:scale-95"
                                >
                                    {cancelLabel || t('ui.close')}
                                </button>
                            )}
                            {onConfirm && (
                                <button
                                    onClick={handleConfirmClick}
                                    disabled={!canConfirm}
                                    className={`px-4 md:px-8 py-2 md:py-4 font-bold uppercase tracking-widest transition-all duration-200
                                        ${canConfirm
                                            ? 'bg-zinc-100 border-2 border-zinc-100 text-black hover:bg-white hover:scale-105 active:scale-95'
                                            : 'bg-zinc-800 border-2 border-zinc-700 text-zinc-500 cursor-not-allowed'}
                                    `}
                                >
                                    {confirmLabel || t('ui.confirm')}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* BOTTOM ROW (Mobile Portrait Only): Buttons below the title */}
                    <div className="flex md:hidden landscape:hidden gap-4 w-full pl-10">
                        {onClose && showCloseButton && (
                            <button
                                onClick={handleCloseClick}
                                className="flex-1 px-4 py-2 bg-zinc-900 border-2 border-zinc-700 text-zinc-400 font-bold uppercase tracking-widest hover:bg-zinc-800 transition-all duration-200 hover:scale-105 active:scale-95"
                            >
                                {cancelLabel || t('ui.close')}
                            </button>
                        )}
                        {onConfirm && (
                            <button
                                onClick={handleConfirmClick}
                                disabled={!canConfirm}
                                className={`flex-1 px-4 py-2 font-bold uppercase tracking-widest transition-all duration-200
                                    ${canConfirm
                                        ? 'bg-zinc-100 border-2 border-zinc-100 text-black hover:scale-105 active:scale-95'
                                        : 'bg-zinc-800 border-2 border-zinc-700 text-zinc-500 cursor-not-allowed'}
                                `}
                            >
                                {confirmLabel || t('ui.confirm')}
                            </button>
                        )}
                    </div>
                </div>

                <div className={`relative z-10 ${contentClass} px-safe mt-4`}>
                    {children}
                </div>

                {/* Footer (Hidden on Mobile Portrait) */}
                {footer && (
                    <div className="hidden md:flex landscape:flex p-8 bg-white/[0.02] border-t border-white/10 justify-center gap-4 relative z-10 w-full">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
};

export default GameModalLayout;