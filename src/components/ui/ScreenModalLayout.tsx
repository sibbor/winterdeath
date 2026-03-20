import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { soundManager } from '../../utils/SoundManager';
import { t } from '../../utils/i18n';

interface ScreenModalLayoutProps {
    title: string | React.ReactNode;
    children: React.ReactNode;
    onClose: () => void;

    // Aesthetic / Layout
    isSmallScreen?: boolean;
    fullHeight?: boolean;
    transparent?: boolean;
    blurClass?: string;
    titleColorClass?: string;
    borderColorClass?: string;
    contentClass?: string;

    // Actions
    onConfirm?: () => void;
    confirmLabel?: string;
    canConfirm?: boolean;
    onCancel?: () => void;
    cancelLabel?: string;
    showCloseButton?: boolean;
    showCancel?: boolean;
    primaryClose?: boolean;

    // Special Content
    extraHeaderContent?: React.ReactNode;
    footer?: React.ReactNode;
    debugAction?: { label: string; action: () => void };

    // System & Responsiveness
    isMobileDevice?: boolean;
    isLandscapeMode?: boolean;

    // Tabs Navigation (Optional)
    tabs?: any[];
    activeTab?: any;
    onTabChange?: (tab: any) => void;
    tabOrientation?: 'vertical' | 'horizontal';
}

// ============================================================================
// PERFORMANCE: Static Constants
// Defined strictly outside the component to prevent GC allocation on render
// ============================================================================
const OVERLAY_BASE = "absolute inset-0 z-[100] flex items-center justify-center p-0 md:p-4 overflow-hidden font-mono pointer-events-auto touch-auto transition-opacity duration-300";
const MODAL_BOX_BASE = "bg-zinc-950 border shadow-[0_0_100px_rgba(0,0,0,0.8)] relative overflow-hidden flex flex-col transition-all duration-300 origin-center";
const HEADER_CONTAINER = "p-6 md:p-12 pb-0 relative z-20 shrink-0 pl-safe pr-safe";
const HEADER_INNER = "mb-4 md:mb-8 border-b-2 border-zinc-800/80 pb-4 md:pb-6 relative flex justify-between items-center w-full";
const CONTENT_AREA = "flex-1 overflow-y-auto custom-scrollbar bg-transparent touch-auto relative z-20 px-safe px-8 md:px-16 pb-12";
const FOOTER_CONTAINER = "bg-zinc-900/30 p-4 md:p-6 border-t border-zinc-800 flex justify-center gap-4 shrink-0 relative z-20 px-safe";

const BUTTON_STYLE = "px-4 md:px-8 py-2 md:py-4 font-black uppercase tracking-wider transition-all duration-200 border-2 shadow-lg text-xs md:text-base hover:scale-105 active:scale-95 whitespace-nowrap flex-1 md:flex-none";
const BTN_CONFIRM_ACTIVE = "bg-zinc-100 border-zinc-100 text-black";
const BTN_CONFIRM_DISABLED = "bg-zinc-800 border-zinc-700 text-zinc-500 cursor-not-allowed";
const BTN_CANCEL = "bg-zinc-900 border-zinc-700 text-zinc-400 hover:bg-zinc-800";
const BTN_DEBUG = "border-red-500 text-red-500 hover:bg-red-500 hover:text-black";

const HARDWARE_CORNER = "absolute w-8 h-8 md:w-12 md:h-12 border-zinc-700/50 z-20 pointer-events-none transition-opacity duration-500";
const DECOR_LINE = "absolute left-1/2 -translate-x-1/2 w-[80%] h-px bg-zinc-800/50 z-0";
const SCANLINE_EFFECT = "absolute inset-0 pointer-events-none z-10 opacity-[0.03] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%]";

// Extracted to prevent inline object creation during render (Zero-GC)
const BACKGROUND_PATTERN_STYLE: React.CSSProperties = {
    backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)',
    backgroundSize: '40px 40px'
};

const ScreenModalLayout: React.FC<ScreenModalLayoutProps> = React.memo(({
    title,
    children,
    onClose,
    onConfirm,
    confirmLabel,
    canConfirm = true,
    onCancel,
    cancelLabel,
    isSmallScreen = false,
    fullHeight = false,
    transparent = false,
    blurClass = "backdrop-blur-md",
    titleColorClass = "text-white",
    borderColorClass = "border-zinc-800",
    contentClass = "",
    showCloseButton = true,
    showCancel = true,
    extraHeaderContent,
    footer,
    debugAction,
    isMobileDevice = false,
    isLandscapeMode = false,
    tabs,
    activeTab,
    onTabChange,
    tabOrientation = 'vertical'
}) => {
    // --- ZERO-GC EVENT LISTENER PATTERN ---
    // Using refs to hold the latest closures allows the event listener to remain 
    // strictly bound once, without memory reallocation or missed updates.
    const callbacksRef = useRef({ onClose, onConfirm, canConfirm, onCancel, tabs, activeTab, onTabChange, tabOrientation });

    useEffect(() => {
        callbacksRef.current = { onClose, onConfirm, canConfirm, onCancel, tabs, activeTab, onTabChange, tabOrientation };
    }); // Runs safely on every render without teardown overhead

    useEffect(() => {
        // Break pointer lock when modal opens
        if (document.pointerLockElement) document.exitPointerLock();
        document.body.style.cursor = 'default';

        const handleKeys = (e: KeyboardEvent) => {
            const { onClose: currClose, onConfirm: currConfirm, canConfirm: currCanConfirm, onCancel: currCancel } = callbacksRef.current;

            if (e.key === 'Escape') {
                e.stopPropagation();
                soundManager.playUiClick();
                if (currCancel) currCancel();
                else currClose();
            } else if (e.key === 'Enter' && currConfirm && currCanConfirm) {
                e.stopPropagation();
                e.preventDefault();
                soundManager.playUiConfirm();
                currConfirm();
            } else {
                // --- Tab Navigation Logic ---
                const { tabs: currTabs, activeTab: currActive, onTabChange: currChange, tabOrientation: currOrient } = callbacksRef.current;

                if (currTabs && currActive !== undefined && currChange) {
                    const currentIndex = currTabs.indexOf(currActive);
                    if (currentIndex === -1) return;

                    let nextIndex = currentIndex;
                    if (currOrient === 'vertical') {
                        if (e.key === 'ArrowDown') nextIndex = (currentIndex + 1) % currTabs.length;
                        else if (e.key === 'ArrowUp') nextIndex = (currentIndex - 1 + currTabs.length) % currTabs.length;
                    } else {
                        if (e.key === 'ArrowRight') nextIndex = (currentIndex + 1) % currTabs.length;
                        else if (e.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + currTabs.length) % currTabs.length;
                    }

                    if (nextIndex !== currentIndex) {
                        e.stopPropagation();
                        e.preventDefault();
                        currChange(currTabs[nextIndex]);
                    }
                }
            }
        };

        window.addEventListener('keydown', handleKeys, { capture: true }); // Adding capture phase for better modal control
        return () => {
            window.removeEventListener('keydown', handleKeys, { capture: true });
            document.body.style.cursor = '';
        };
    }, []);

    // --- ZERO-GC HANDLERS ---
    const handleCloseInternal = useCallback(() => {
        soundManager.playUiClick();
        onClose();
    }, [onClose]);

    const handleCancelInternal = useCallback(() => {
        soundManager.playUiClick();
        if (onCancel) onCancel();
        else onClose();
    }, [onCancel, onClose]);

    const handleConfirmInternal = useCallback(() => {
        if (canConfirm && onConfirm) {
            soundManager.playUiConfirm();
            onConfirm();
        }
    }, [canConfirm, onConfirm]);

    const handleDebugInternal = useCallback(() => {
        if (debugAction) {
            soundManager.playUiClick();
            debugAction.action();
        }
    }, [debugAction]);

    // --- DYNAMIC CLASS COMPUTATION ---
    const maxWidthClass = isSmallScreen ? 'max-w-2xl' : 'max-w-7xl';

    // Adaptive Height Logic
    const adaptiveHeight = useMemo(() => {
        if (isMobileDevice) {
            return isLandscapeMode ? "h-[95vh]" : (fullHeight ? "h-full" : "h-[85vh]");
        }
        return fullHeight ? "h-[90vh]" : "h-fit max-h-[90vh]";
    }, [isMobileDevice, isLandscapeMode, fullHeight]);

    // Adaptive Width Logic
    const adaptiveWidth = useMemo(() => {
        if (isMobileDevice) {
            return "w-[95vw]";
        }
        return `w-full ${maxWidthClass}`;
    }, [isMobileDevice, maxWidthClass]);

    const mobileScaling = isMobileDevice ? "" : "transform scale-50 md:scale-100";

    return (
        <div className={`${OVERLAY_BASE} ${transparent ? '' : `bg-black/60 ${blurClass}`}`}>
            <div className={`${MODAL_BOX_BASE} ${borderColorClass} ${adaptiveWidth} ${adaptiveHeight} ${mobileScaling}`}>

                {/* Hardware Corners */}
                <div className={`${HARDWARE_CORNER} top-0 left-0 border-t-4 border-l-4`} />
                <div className={`${HARDWARE_CORNER} top-0 right-0 border-t-4 border-r-4`} />
                <div className={`${HARDWARE_CORNER} bottom-0 left-0 border-b-4 border-l-4`} />
                <div className={`${HARDWARE_CORNER} bottom-0 right-0 border-b-4 border-r-4`} />

                {/* Decorative Elements */}
                <div className={`${DECOR_LINE} top-4`} />
                <div className={`${DECOR_LINE} bottom-4`} />
                <div className={SCANLINE_EFFECT} />
                <div className="absolute inset-0 opacity-[0.05] pointer-events-none z-0" style={BACKGROUND_PATTERN_STYLE} />

                {/* Header Area */}
                <div className={HEADER_CONTAINER}>
                    <div className={HEADER_INNER}>
                        <div className="flex flex-col">
                            {typeof title === 'string' ? (
                                <h2 className={`text-4xl md:text-7xl font-mono uppercase inline-block ${titleColorClass} drop-shadow-[0_0_15px_rgba(0,0,0,0.5)]`}>
                                    {title}
                                </h2>
                            ) : title}
                        </div>

                        <div className="flex items-center gap-4 md:gap-6">
                            {extraHeaderContent && <div className="hidden sm:block flex-shrink-0">{extraHeaderContent}</div>}

                            {/* Desktop/Landscape Action Buttons */}
                            <div className="hidden md:flex items-center gap-4">
                                {debugAction && (
                                    <button onClick={handleDebugInternal} className={`${BUTTON_STYLE} ${BTN_DEBUG}`}>
                                        {debugAction.label}
                                    </button>
                                )}
                                {(onCancel || (onClose && showCloseButton)) && showCancel && (
                                    <button onClick={handleCancelInternal} className={`${BUTTON_STYLE} ${BTN_CANCEL}`}>
                                        {cancelLabel || (onCancel ? t('ui.cancel') : t('ui.close'))}
                                    </button>
                                )}
                                {onConfirm && (
                                    <button
                                        onClick={handleConfirmInternal}
                                        disabled={!canConfirm}
                                        className={`${BUTTON_STYLE} ${canConfirm ? BTN_CONFIRM_ACTIVE : BTN_CONFIRM_DISABLED}`}
                                    >
                                        {confirmLabel || t('ui.confirm')}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Mobile/Portrait Bottom Buttons */}
                    <div className={`flex md:hidden gap-4 w-full mb-6 ${isLandscapeMode ? 'hidden' : ''}`}>
                        {(onCancel || (onClose && showCloseButton)) && showCancel && (
                            <button onClick={handleCancelInternal} className={`${BUTTON_STYLE} ${BTN_CANCEL}`}>
                                {cancelLabel || t('ui.close')}
                            </button>
                        )}
                        {onConfirm && (
                            <button
                                onClick={handleConfirmInternal}
                                disabled={!canConfirm}
                                className={`${BUTTON_STYLE} ${canConfirm ? BTN_CONFIRM_ACTIVE : BTN_CONFIRM_DISABLED}`}
                            >
                                {confirmLabel || t('ui.confirm')}
                            </button>
                        )}
                    </div>
                </div>

                {/* Main Content Area */}
                <div className={`${CONTENT_AREA} ${contentClass}`}>
                    {children}
                </div>

                {/* Footer Area */}
                {footer && (
                    <div className={FOOTER_CONTAINER}>
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
});

export default ScreenModalLayout;