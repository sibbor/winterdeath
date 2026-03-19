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
    maxWidthClass = "max-w-7xl",
    heightClass,
    blurClass = "backdrop-blur-md",
    contentClass = "px-4 md:px-16 pb-8 md:pb-12 overflow-y-auto",
    isMobileDevice = false,
    transparent,
    onClose,
    onConfirm,
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

    const mobile = isMobileDevice;

    return (
        <div className={`absolute inset-0 z-[100] flex items-center justify-center p-0 md:p-4 overflow-hidden font-mono pointer-events-auto touch-auto ${transparent ? '' : `bg-black/60 ${blurClass}`}`}>
            <div className={`
                text-center bg-zinc-950 border border-zinc-800 shadow-[0_0_100px_rgba(0,0,0,0.8)] relative overflow-hidden flex flex-col
                ${mobile ? 'w-[90%] h-[80%] border-zinc-700' : `md:w-full md:${maxWidthClass} w-[180%] transform scale-50 md:scale-100 origin-center`}
                ${effectiveHeightClass}
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

                {/* Header */}
                <div className="p-8 md:p-12 pb-0 relative z-20 shrink-0">
                    <div className={`mb-8 border-b-2 border-zinc-800/80 pb-6 relative flex justify-between items-center`}>
                        {typeof title === 'string' ? (
                            <h2 className={`text-5xl md:text-7xl font-black uppercase tracking-tighter inline-block ${titleColorClass} italic drop-shadow-[0_0_15px_rgba(0,0,0,0.5)]`}>
                                {title}
                            </h2>
                        ) : (
                            title
                        )}

                        {/* Desktop Buttons in Header Area */}
                        <div className="hidden md:flex items-center gap-4">
                            {onClose && showCloseButton && (
                                <button
                                    onClick={handleCloseClick}
                                    className="px-8 py-4 bg-zinc-900 border-2 border-zinc-700 text-zinc-400 font-bold uppercase tracking-widest hover:bg-zinc-800 transition-all duration-200 hover:scale-105 active:scale-95"
                                >
                                    {cancelLabel || t('ui.close')}
                                </button>
                            )}
                            {onConfirm && (
                                <button
                                    onClick={handleConfirmClick}
                                    disabled={!canConfirm}
                                    className={`px-8 py-4 font-bold uppercase tracking-widest transition-all duration-200
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

                    {/* Mobile Buttons below title */}
                    <div className="flex md:hidden gap-4 w-full mb-6">
                        {onClose && showCloseButton && (
                            <button
                                onClick={handleCloseClick}
                                className="flex-1 px-4 py-3 bg-zinc-900 border-2 border-zinc-700 text-zinc-400 font-bold uppercase tracking-widest hover:bg-zinc-800 transition-all duration-200 active:scale-95"
                            >
                                {cancelLabel || t('ui.close')}
                            </button>
                        )}
                        {onConfirm && (
                            <button
                                onClick={handleConfirmClick}
                                disabled={!canConfirm}
                                className={`flex-1 px-4 py-3 font-bold uppercase tracking-widest transition-all duration-200
                                    ${canConfirm
                                        ? 'bg-zinc-100 border-2 border-zinc-100 text-black active:scale-95'
                                        : 'bg-zinc-800 border-2 border-zinc-700 text-zinc-500 cursor-not-allowed'}
                                `}
                            >
                                {confirmLabel || t('ui.confirm')}
                            </button>
                        )}
                    </div>
                </div>

                {/* Content */}
                <div className={`px-8 md:px-16 pb-12 relative z-20 flex-1 overflow-y-auto custom-scrollbar ${contentClass}`}>
                    {children}
                </div>

                {/* Footer */}
                {footer && (
                    <div className={`bg-zinc-900/30 p-6 border-t border-zinc-800 flex justify-center gap-4 shrink-0 relative z-20 ${mobile ? 'pb-8' : ''}`}>
                        {React.Children.map(footer, child => {
                            if (React.isValidElement(child) && mobile) {
                                return React.cloneElement(child as React.ReactElement<any>, {
                                    className: `${(child.props as any).className || ''} h-16 text-lg`
                                });
                            }
                            return child;
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default GameModalLayout;