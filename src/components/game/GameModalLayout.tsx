
import React from 'react';
import { soundManager } from '../../utils/SoundManager';
import { t } from '../../utils/i18n';
import { useOrientation } from '../../hooks/useOrientation';

interface GameModalLayoutProps {
    title: string | React.ReactNode;
    children: React.ReactNode;
    footer?: React.ReactNode;
    titleColorClass?: string;
    maxWidthClass?: string;
    contentClass?: string;
    transparent?: boolean;
    blurClass?: string;
    isMobile?: boolean;
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
    isMobile = false,
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
    const { isLandscapeMode } = useOrientation();
    const isMobilePortrait = isMobile && (!isLandscapeMode || (typeof window !== 'undefined' && window.innerWidth < 768));
    const effectiveHeightClass = heightClass || (fullHeight ? "h-[90vh]" : "h-fit max-h-[90vh]");

    React.useEffect(() => {
        if (document.pointerLockElement) document.exitPointerLock();
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && onClose) {
                e.stopPropagation();
                soundManager.playUiClick();
                onClose();
            } else if (e.key === 'Enter' && onConfirm && canConfirm) {
                e.stopPropagation();
                soundManager.playUiConfirm();
                onConfirm();
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [onClose, onConfirm, canConfirm]);

    return (
        <div className={`absolute inset-0 flex items-center justify-center z-[100] p-4 md:p-8 pointer-events-auto touch-auto ${transparent ? '' : 'bg-black/80 backdrop-blur-2xl'}`}>
            <div className={`relative flex flex-col w-full ${maxWidthClass} ${effectiveHeightClass} bg-black border border-white/10 shadow-[0_0_100px_rgba(0,0,0,1)] overflow-hidden`}>
                <div className="absolute inset-0 opacity-[0.03] pointer-events-none mix-blend-overlay" />

                <div className={`p-6 md:p-10 relative z-20 shrink-0 bg-transparent flex flex-col gap-4 pl-safe pr-safe`}>
                    <div className="flex justify-between items-center w-full">
                        {typeof title === 'string' ? (
                            <h2 className={`text-2xl md:text-5xl lg:text-7xl font-light uppercase tracking-tighter ${titleColorClass} truncate flex-1 ${isMobile ? 'ml-10' : ''}`}>
                                {title}
                            </h2>
                        ) : (
                            <div className="flex-1">{title}</div>
                        )}

                        {!isMobilePortrait && (
                            <div className="flex items-center gap-4 ml-8">
                                {onClose && showCloseButton && (
                                    <button
                                        onClick={() => { soundManager.playUiClick(); onClose(); }}
                                        className="px-4 md:px-8 py-2 md:py-4 bg-zinc-900 border-2 border-zinc-700 text-zinc-400 font-bold uppercase tracking-widest hover:bg-zinc-800 transition-all duration-200 hover:scale-105 active:scale-95"
                                    >
                                        {cancelLabel || t('ui.close')}
                                    </button>
                                )}
                                {onConfirm && (
                                    <button
                                        onClick={() => { if (canConfirm) { soundManager.playUiConfirm(); onConfirm(); } }}
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
                        )}
                    </div>

                    {isMobilePortrait && (onClose || onConfirm) && (
                        <div className="flex gap-4 w-full pl-10">
                            {onClose && showCloseButton && (
                                <button
                                    onClick={() => { soundManager.playUiClick(); onClose(); }}
                                    className="flex-1 px-4 py-2 bg-zinc-900 border-2 border-zinc-700 text-zinc-400 font-bold uppercase tracking-widest hover:bg-zinc-800 transition-all duration-200 hover:scale-105 active:scale-95"
                                >
                                    {cancelLabel || t('ui.close')}
                                </button>
                            )}
                            {onConfirm && (
                                <button
                                    onClick={() => { if (canConfirm) { soundManager.playUiConfirm(); onConfirm(); } }}
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
                    )}
                </div>

                <div className={`relative z-10 ${contentClass} px-safe mt-4`}>
                    {children}
                </div>

                {(footer && !isMobilePortrait) && (
                    <div className="p-8 bg-white/[0.02] border-t border-white/10 flex justify-center gap-4 relative z-10 w-full">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
};

export default GameModalLayout;
