
import React from 'react';

interface GameModalLayoutProps {
    title: string | React.ReactNode;
    children: React.ReactNode;
    footer?: React.ReactNode;
    titleColorClass?: string; // e.g. text-red-600
    maxWidthClass?: string; // e.g. max-w-4xl
    transparent?: boolean;
    blurClass?: string; // e.g. backdrop-blur-xl
    isMobile?: boolean;
    onClose?: () => void; // Added for ESC handling
    showCloseButton?: boolean;
    heightClass?: string; // e.g. h-[80vh]
}

import { soundManager } from '../../utils/sound';
import { t } from '../../utils/i18n';

const GameModalLayout: React.FC<GameModalLayoutProps> = ({
    title,
    children,
    footer,
    titleColorClass = "text-white",
    maxWidthClass = "max-w-xl",
    heightClass = "max-h-[90vh] md:max-h-none",
    blurClass = "backdrop-blur-md",
    isMobile = false,
    transparent,
    onClose,
    showCloseButton = true
}) => {
    const borderColorClass = titleColorClass.replace('text-', 'border-').replace('white', 'gray-800'); // Simple derivation

    React.useEffect(() => {
        // FORCE cursor capability
        if (document.pointerLockElement) document.exitPointerLock();

        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && onClose) {
                e.stopPropagation();
                soundManager.playUiClick();
                onClose();
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => {
            window.removeEventListener('keydown', handleEsc);
        };
    }, [onClose]);

    return (
        <div className={`absolute inset-0 flex items-center justify-center z-[100] p-4 md:p-8 pointer-events-auto touch-auto ${transparent ? '' : 'bg-black/30 backdrop-blur-lg'}`}>
            <div className={`relative flex flex-col w-full ${maxWidthClass} ${heightClass} bg-black shadow-2xl border-2 ${borderColorClass} shadow-[0_0_50px_rgba(220,38,38,0.2)] overflow-hidden`}>

                {/* Background Decoration */}
                <div className="absolute top-0 right-0 opacity-10 pointer-events-none">
                    <svg viewBox="0 0 100 100" width="300" height="300" fill="red"><path d="M10 10 L90 10 L50 90 Z" /></svg>
                </div>

                {/* Header */}
                <div className="p-4 md:p-8 pb-0 relative z-10 shrink-0">
                    <div className={`mb-4 md:mb-8 border-b-4 pb-4 flex justify-between items-end ${titleColorClass.includes('blue') ? 'border-blue-600' : 'border-red-900'}`}>
                        {typeof title === 'string' ? (
                            <h2 className={`text-4xl md:text-6xl font-black uppercase tracking-tighter inline-block skew-x-[-10deg] ${titleColorClass}`}>
                                {title}
                            </h2>
                        ) : (
                            title
                        )}

                        {onClose && showCloseButton && (
                            <button
                                onClick={() => { soundManager.playUiClick(); onClose(); }}
                                className="px-4 md:px-8 py-2 md:py-3 font-black uppercase tracking-wider transition-all duration-200 hover:scale-105 active:scale-95 border-2 border-gray-600 text-gray-400 hover:text-white hover:border-white skew-x-[-10deg] mb-2"
                            >
                                <span className="block skew-x-[10deg]">{t('ui.close')}</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* Content */}
                <div className="px-4 md:px-16 pb-8 md:pb-12 relative z-10 overflow-y-auto">
                    {children}
                </div>

                {/* Footer */}
                {footer && (
                    <div className={`${isMobile ? 'p-4' : 'p-6'} bg-gray-900/50 border-t-2 border-gray-800 flex justify-center gap-4`}>
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
};

export default GameModalLayout;
