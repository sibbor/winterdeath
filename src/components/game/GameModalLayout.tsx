
import React from 'react';

interface GameModalLayoutProps {
    title: string | React.ReactNode;
    children: React.ReactNode;
    footer?: React.ReactNode;
    titleColorClass?: string;
    maxWidthClass?: string;
    contentClass?: string;   // Override the content wrapper classes
    transparent?: boolean;
    blurClass?: string;
    isMobile?: boolean;
    onClose?: () => void;
    onConfirm?: () => void; // Called when ENTER is pressed
    showCloseButton?: boolean;
    heightClass?: string;
}

import { soundManager } from '../../utils/SoundManager';
import { t } from '../../utils/i18n';

const GameModalLayout: React.FC<GameModalLayoutProps> = ({
    title,
    children,
    footer,
    titleColorClass = "text-white",
    maxWidthClass = "max-w-xl",
    heightClass = "max-h-[90vh] md:max-h-none",
    blurClass = "backdrop-blur-md",
    contentClass = "px-4 md:px-16 pb-8 md:pb-12 overflow-y-auto",
    isMobile = false,
    transparent,
    onClose,
    onConfirm,
    showCloseButton = true
}) => {
    const borderColorClass = titleColorClass.replace('text-', 'border-').replace('white', 'gray-800'); // Simple derivation

    React.useEffect(() => {
        // FORCE cursor capability
        if (document.pointerLockElement) document.exitPointerLock();

        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && onClose) {
                e.stopPropagation();
                soundManager.playUiClick();
                onClose();
            } else if (e.key === 'Enter' && onConfirm) {
                e.stopPropagation();
                soundManager.playUiConfirm();
                onConfirm();
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => {
            window.removeEventListener('keydown', handleKey);
        };
    }, [onClose, onConfirm]);

    return (
        <div className={`absolute inset-0 flex items-center justify-center z-[100] p-4 md:p-8 pointer-events-auto touch-auto ${transparent ? '' : 'bg-black/80 backdrop-blur-2xl'}`}>
            <div className={`relative flex flex-col w-full ${maxWidthClass} ${heightClass} bg-black border border-white/10 shadow-[0_0_100px_rgba(0,0,0,1)] overflow-hidden`}>

                {/* Gritty Overlay Decoration */}
                <div className="absolute inset-0 opacity-[0.03] pointer-events-none mix-blend-overlay" 
                     style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/dark-leather.png")' }} />

                {/* Header */}
                <div className="p-6 md:p-10 pb-0 relative z-10 shrink-0">
                    <div className={`mb-4 md:mb-8 border-b border-white/10 pb-6 flex justify-between items-center`}>
                        {typeof title === 'string' ? (
                            <h2 className={`text-4xl md:text-6xl font-medium uppercase tracking-tighter hud-text-glow ${titleColorClass}`}>
                                {title}
                            </h2>
                        ) : (
                            title
                        )}

                        {onClose && showCloseButton && (
                            <button
                                onClick={() => { soundManager.playUiClick(); onClose(); }}
                                className="hud-touch-btn px-6 py-2 text-xs font-bold tracking-widest uppercase transition-all"
                            >
                                {t('ui.close')}
                            </button>
                        )}
                    </div>
                </div>

                {/* Content */}
                <div className={`relative z-10 ${contentClass}`}>
                    {children}
                </div>

                {/* Footer */}
                {footer && (
                    <div className={`${isMobile ? 'p-6' : 'p-8'} bg-white/[0.02] border-t border-white/10 flex justify-center gap-4 relative z-10`}>
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
};

export default GameModalLayout;
