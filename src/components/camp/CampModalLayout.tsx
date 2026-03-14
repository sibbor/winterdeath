
import React from 'react';
import { t } from '../../utils/i18n';
import { soundManager } from '../../utils/SoundManager';
import { useOrientation } from '../../hooks/useOrientation';

interface CampModalLayoutProps {
    title: string;
    borderColorClass?: string; // e.g. 'border-yellow-500'
    onClose: () => void;
    onConfirm?: () => void;
    confirmLabel?: string;
    closeLabel?: string;
    canConfirm?: boolean;
    children: React.ReactNode;
    isSettings?: boolean;
    showCancel?: boolean;
    isSmall?: boolean;
    isMobile?: boolean;
    debugAction?: { label: string; action: () => void };
    titleColor?: string; // e.g. 'text-purple-500'
    primaryClose?: boolean;
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
    isMobile = false,
    debugAction,
    titleColor = 'text-white',
    primaryClose = false
}) => {
    const { isLandscapeMode } = useOrientation();
    const effectiveLandscape = isLandscapeMode || !isMobile;

    // Removed mb-8 to mb-4, removed skew and underline
    const headerStyle = "text-3xl md:text-6xl font-light uppercase tracking-tighter shrink-0";
    const buttonStyle = "px-4 md:px-8 py-2 md:py-3 font-bold uppercase tracking-wider transition-all duration-200 hover:scale-105 active:scale-95 border-2 shadow-lg text-xs md:text-base";

    const maxWidth = isSmall ? 'max-w-2xl' : 'max-w-7xl';
    const height = isSmall ? 'h-auto max-h-[85vh]' : 'h-[85vh] md:h-[90vh]';

    React.useEffect(() => {
        // FORCE cursor capability
        if (document.pointerLockElement) document.exitPointerLock();
        document.body.style.cursor = 'default';

        const handleKeys = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                soundManager.playUiClick();
                onClose();
            } else if (e.key === 'Enter') {
                if (onConfirm && canConfirm) {
                    e.stopPropagation();
                    e.preventDefault();
                    soundManager.playUiConfirm();
                    onConfirm();
                } else if (!onConfirm && onClose) {
                    // Fallback: If no confirm action, Enter performs Close
                    e.stopPropagation();
                    e.preventDefault();
                    soundManager.playUiClick();
                    onClose();
                }
            }
        };

        window.addEventListener('keydown', handleKeys);
        return () => {
            window.removeEventListener('keydown', handleKeys);
            document.body.style.cursor = '';
        };
    }, [onClose, onConfirm, canConfirm]);

    return (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-[80] p-4 md:p-8 backdrop-blur-2xl pointer-events-auto cursor-default">
            <div className={`bg-black border border-white/10 w-full ${maxWidth} ${height} flex flex-col shadow-[0_0_100px_rgba(0,0,0,0.8)] relative overflow-hidden`}>
                {/* Gritty Overlay Decoration */}
                <div className="absolute inset-0 opacity-[0.03] pointer-events-none mix-blend-overlay" 
                     style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/dark-leather.png")' }} />
                {/* Header Row */}
                <div className={`p-4 md:p-6 flex ${effectiveLandscape ? 'flex-row' : 'flex-col'} justify-between items-center bg-transparent shrink-0 gap-4 relative z-20 pl-safe pr-safe`}>
                    <h2 className={`${headerStyle} ${titleColor} ${effectiveLandscape ? '' : 'text-center'}`}>
                        {title}
                    </h2>
                    <div className={`flex gap-2 md:gap-6 items-center ${effectiveLandscape ? '' : 'grid grid-cols-2 w-full content-center gap-2'}`}>
                        {debugAction && (
                            <button
                                onClick={() => { soundManager.playUiClick(); debugAction.action(); }}
                                className={`px-3 md:px-6 py-1.5 md:py-3 font-bold uppercase tracking-widest transition-all skew-x-[-10deg] border-2 border-red-500 text-red-500 hover:bg-red-500 hover:text-black whitespace-nowrap mr-2 md:mr-4 text-[10px] md:text-sm`}
                            >
                                <span className="block skew-x-[10deg]">{debugAction.label}</span>
                            </button>
                        )}

                        {showCancel && (
                            <button
                                onClick={() => { soundManager.playUiClick(); onClose(); }}
                                className={`${buttonStyle} ${effectiveLandscape ? '' : 'w-full'} ${primaryClose 
                                    ? 'border-white bg-white text-black hover:bg-gray-200' 
                                    : 'border-gray-600 text-gray-400 hover:text-white hover:border-white bg-black'}`}
                            >
                                {isSettings ? t('ui.cancel') : (closeLabel || t('ui.close'))}
                            </button>
                        )}

                        {onConfirm && (
                            <button
                                onClick={() => {
                                    if (canConfirm) {
                                        soundManager.playUiConfirm();
                                        onConfirm();
                                    } else {
                                        soundManager.playUiClick();
                                    }
                                }}
                                disabled={!canConfirm}
                                className={`${buttonStyle} ${effectiveLandscape ? '' : 'w-full'} ${canConfirm
                                    ? 'border-white bg-white text-black hover:bg-gray-200'
                                    : 'border-gray-800 text-gray-600 bg-black cursor-not-allowed'
                                    }`}
                            >
                                {confirmLabel || t('ui.confirm_selection')}
                            </button>
                        )}
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-transparent touch-auto relative z-10 px-safe">
                    {children}
                </div>
            </div>
        </div>
    );
};

export default CampModalLayout;