import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { UISounds } from '../../../utils/audio/AudioLib';
import { t } from '../../../utils/i18n';
import { ColorPair, COLORS, adjustColor } from '../../../utils/ui/ColorUtils';
import { InputAction, INPUT_KEY_MAP } from '../../../core/engine/InputManager';

// --- SHARED TACTICAL STYLE TOKENS (One Place to Rule Them All) ---
export const BACKGROUND_PATTERN_STYLE: React.CSSProperties = {
    backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.08) 1.5px, transparent 1.5px)',
    backgroundSize: '24px 24px'
};

export const HORIZONTAL_HATCHING_STYLE: React.CSSProperties = {
    backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.08) 2px, rgba(255,255,255,0.08) 4px)'
};

export const GRITTY_HEADER_TITLE_STYLE: React.CSSProperties = {
    background: 'linear-gradient(to bottom, #ffffff, #d1d1d6)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    textShadow: `
        0 2px 4px rgba(0, 0, 0, 0.5),
        0 0 10px rgba(255, 255, 255, 0.05)
    `,
    filter: 'drop-shadow(0 0 1px rgba(255, 255, 255, 0.1))',
    letterSpacing: '-0.03em'
};

export const HORIZONTAL_HATCHING_STYLE_DARK: React.CSSProperties = {
    backgroundImage: 'repeating-linears-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)'
};

interface ModalLayoutProps {
    title: string | React.ReactNode;
    subtitle?: string | React.ReactNode;
    subtitleClass?: string;
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
    noScroll?: boolean;

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
const MODAL_BOX_BASE = "bg-zinc-950 border shadow-[0_0_50px_rgba(0,0,0,0.8)] relative overflow-hidden flex flex-col transition-all duration-300 origin-center";
const HEADER_CONTAINER = "p-6 md:p-12 pb-0 relative z-20 shrink-0 pl-3 pr-3";
const HEADER_INNER = "border-b-2 border-zinc-800/80 pb-4 md:pb-6 relative flex justify-between items-center w-full";
const CONTENT_AREA = "flex-1 min-h-0 overflow-y-auto custom-scrollbar bg-transparent touch-auto relative z-20 px-safe px-4 md:px-14 pb-6";
const FOOTER_CONTAINER = "bg-zinc-900/30 p-4 md:p-6 border-t border-zinc-800 flex justify-center gap-4 shrink-0 relative z-20 px-safe";

const BUTTON_STYLE = "px-4 md:px-8 py-3 md:py-4 font-black uppercase tracking-wider transition-all duration-200 border-2 shadow-lg text-xs md:text-base hover:scale-105 active:scale-95 whitespace-nowrap flex-1 md:flex-none relative overflow-hidden group/btn";
const BTN_CONFIRM_ACTIVE = "bg-zinc-100 border-zinc-100 text-black";
const BTN_CONFIRM_DISABLED = "bg-zinc-800 border-zinc-700 text-zinc-500 cursor-not-allowed";
const BTN_CANCEL = "bg-zinc-900 border-zinc-700 text-zinc-400 hover:bg-zinc-900";
const BTN_DEBUG = "border-red-500 text-red-500 hover:bg-red-950/20";

const HARDWARE_CORNER = "absolute w-8 h-8 md:w-12 md:h-12 border-zinc-700/50 z-20 pointer-events-none transition-opacity duration-500";
const DECOR_LINE = "absolute left-1/2 -translate-x-1/2 w-[80%] h-px bg-zinc-800/50 z-0";
const SCANLINE_EFFECT = "absolute inset-0 pointer-events-none z-10 opacity-[0.03] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%]";

// Internal styles (now using exported tokens for centralization)
const BUTTON_HATCHING_STYLE = HORIZONTAL_HATCHING_STYLE;
const BUTTON_HATCHING_STYLE_DARK = HORIZONTAL_HATCHING_STYLE_DARK;

const ModalLayout: React.FC<ModalLayoutProps> = React.memo(({
    title,
    subtitle,
    subtitleClass = "text-zinc-500",
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
    blurClass = "backdrop-blur-sm",
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
    tabOrientation = 'vertical',
    noScroll = false
}) => {
    // --- ZERO-GC EVENT LISTENER PATTERN ---
    // Using refs to hold the latest closures allows the event listener to remain 
    // strictly bound once, without memory reallocation or missed updates.
    const callbacksRef = useRef<any>(null);
    callbacksRef.current = { onClose, onConfirm, canConfirm, onCancel, tabs, activeTab, onTabChange, tabOrientation };

    useEffect(() => {
        // Break pointer lock when modal opens
        if (document.pointerLockElement) document.exitPointerLock();
        document.body.style.cursor = 'default';

        const handleKeys = (e: KeyboardEvent) => {
            const { onClose: currClose, onConfirm: currConfirm, canConfirm: currCanConfirm, onCancel: currCancel } = callbacksRef.current;
            const action = INPUT_KEY_MAP[e.key];

            if (action === InputAction.ESCAPE) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                //UISounds.playClick();
                if (currCancel) currCancel();
                else currClose();
            } else if (action === InputAction.ENTER && currConfirm && currCanConfirm) {
                e.stopPropagation();
                e.preventDefault();
                //UISounds.playConfirm();
                currConfirm();
            } else {
                // --- Tab Navigation Logic ---
                const { tabs: currTabs, activeTab: currActive, onTabChange: currChange, tabOrientation: currOrient } = callbacksRef.current;

                if (currTabs && currActive !== undefined && currChange) {
                    const currentIndex = currTabs.indexOf(currActive);
                    if (currentIndex === -1) return;

                    let nextIndex = currentIndex;
                    if (currOrient === 'vertical') {
                        if (action === InputAction.DOWN || action === InputAction.ARROW_DOWN) nextIndex = (currentIndex + 1) % currTabs.length;
                        else if (action === InputAction.UP || action === InputAction.ARROW_UP) nextIndex = (currentIndex - 1 + currTabs.length) % currTabs.length;
                    } else {
                        if (action === InputAction.RIGHT || action === InputAction.ARROW_RIGHT) nextIndex = (currentIndex + 1) % currTabs.length;
                        else if (action === InputAction.LEFT || action === InputAction.ARROW_LEFT) nextIndex = (currentIndex - 1 + currTabs.length) % currTabs.length;
                    }

                    if (nextIndex !== currentIndex) {
                        e.stopPropagation();
                        e.preventDefault();
                        UISounds.playClick();
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
        //UISounds.playClick();
        UISounds.playCloseScreen();

        onClose();
    }, [onClose]);

    const handleCancelInternal = useCallback(() => {
        UISounds.playClick();
        UISounds.playCloseScreen();

        if (onCancel) onCancel();
        else onClose();
    }, [onCancel, onClose]);

    const handleConfirmInternal = useCallback(() => {
        if (canConfirm && onConfirm) {
            UISounds.playConfirm();
            onConfirm();
        }
    }, [canConfirm, onConfirm]);

    const handleDebugInternal = useCallback(() => {
        if (debugAction) {
            UISounds.playHover();
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
                <style>{`
                    @keyframes shimmer {
                        0% { transform: translateX(-150%) skewX(-15deg); }
                        100% { transform: translateX(250%) skewX(-15deg); }
                    }
                    .shimmer-overlay {
                        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.25), transparent);
                        width: 70%;
                        height: 100%;
                        animation: shimmer 2s infinite linear;
                    }
                `}</style>

                {/* Hardware Corners */}
                <div className={`${HARDWARE_CORNER} top-0 left-0 border-t-4 border-l-4`} />
                <div className={`${HARDWARE_CORNER} top-0 right-0 border-t-4 border-r-4`} />
                <div className={`${HARDWARE_CORNER} bottom-0 left-0 border-b-4 border-l-4`} />
                <div className={`${HARDWARE_CORNER} bottom-0 right-0 border-b-4 border-r-4`} />

                {/* Decorative Elements */}
                <div className={`${DECOR_LINE} top-2`} />
                <div className={`${DECOR_LINE} bottom-2`} />
                <div className={SCANLINE_EFFECT} />
                <div className="absolute inset-0 opacity-100 pointer-events-none z-0" style={BACKGROUND_PATTERN_STYLE} />

                {/* Header Area */}
                <div className={HEADER_CONTAINER}>
                    <div className={HEADER_INNER}>
                        <div className="flex flex-col">
                            {typeof title === 'string' ? (
                                <h1
                                    className={`text-2xl md:text-5xl font-black uppercase tracking-tighter transition-all duration-300 ${titleColorClass} relative`}
                                    style={GRITTY_HEADER_TITLE_STYLE}
                                >
                                    {title}
                                    <div className="absolute -inset-1 bg-white/5 blur-xl pointer-events-none opacity-20" />
                                </h1>
                            ) : title}
                            {subtitle && (
                                <div className={`text-sm md:text-xl font-bold uppercase tracking-[0.2em] mt-1 ${subtitleClass}`}>
                                    {subtitle}
                                </div>
                            )}
                        </div>

                        <div className="flex items-center gap-4 md:gap-6">
                            {extraHeaderContent && <div className="hidden sm:block flex-shrink-0">{extraHeaderContent}</div>}

                            {/* Desktop/Landscape Action Buttons */}
                            <div className={`hidden md:flex items-center gap-4 ${isLandscapeMode ? '!flex' : ''}`}>
                                {debugAction && (
                                    <button onClick={handleDebugInternal} className={`${BUTTON_STYLE} ${BTN_DEBUG}`}>
                                        <div className="absolute inset-0 opacity-20 group-hover/btn:opacity-40 transition-opacity" style={BUTTON_HATCHING_STYLE} />
                                        <span className="relative z-10">{debugAction.label}</span>
                                    </button>
                                )}
                                {(onCancel || (onClose && showCloseButton)) && showCancel && (
                                    <button onClick={handleCancelInternal} className={`${BUTTON_STYLE} ${BTN_CANCEL}`}>
                                        <div className="absolute inset-0 opacity-10 group-hover/btn:opacity-20 transition-opacity" style={BUTTON_HATCHING_STYLE} />
                                        <span className="relative z-10">{cancelLabel || (onCancel ? t('ui.cancel') : t('ui.close'))}</span>
                                    </button>
                                )}
                                {onConfirm && (
                                    <button
                                        onClick={handleConfirmInternal}
                                        disabled={!canConfirm}
                                        className={`${BUTTON_STYLE} ${canConfirm ? BTN_CONFIRM_ACTIVE : BTN_CONFIRM_DISABLED}`}
                                    >
                                        <div className="absolute inset-0 opacity-10 group-hover/btn:opacity-30 transition-opacity" style={BUTTON_HATCHING_STYLE_DARK} />
                                        <span className="relative z-10">{confirmLabel || t('ui.confirm')}</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Mobile/Portrait Bottom Buttons */}
                    <div className={`flex md:hidden gap-4 w-full mb-6 ${isLandscapeMode ? 'hidden' : ''}`}>
                        {debugAction && (
                            <button onClick={handleDebugInternal} className={`${BUTTON_STYLE} ${BTN_DEBUG}`}>
                                <div className="absolute inset-0 opacity-20" style={BUTTON_HATCHING_STYLE} />
                                <span className="relative z-10">{debugAction.label}</span>
                            </button>
                        )}
                        {(onCancel || (onClose && showCloseButton)) && showCancel && (
                            <button onClick={handleCancelInternal} className={`${BUTTON_STYLE} ${BTN_CANCEL}`}>
                                <div className="absolute inset-0 opacity-10" style={BUTTON_HATCHING_STYLE} />
                                <span className="relative z-10">{cancelLabel || t('ui.close')}</span>
                            </button>
                        )}
                        {onConfirm && (
                            <button
                                onClick={handleConfirmInternal}
                                disabled={!canConfirm}
                                className={`${BUTTON_STYLE} ${canConfirm ? BTN_CONFIRM_ACTIVE : BTN_CONFIRM_DISABLED}`}
                            >
                                <div className="absolute inset-0 opacity-10" style={BUTTON_HATCHING_STYLE_DARK} />
                                <span className="relative z-10">{confirmLabel || t('ui.confirm')}</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* Main Content Area */}
                <div className={`${CONTENT_AREA} ${noScroll ? '!overflow-hidden' : ''} ${contentClass}`}>
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

// ============================================================================
// CENTRALIZED TACTICAL COMPONENTS
// Hardened against iOS WebKit flexbox compression (shrink)
// ============================================================================

export const TacticalButton: React.FC<{
    onClick: () => void;
    children: React.ReactNode;
    className?: string;
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
    disabled?: boolean;
    style?: React.CSSProperties;
    showHatching?: boolean;
}> = React.memo(({ onClick, children, className = '', variant = 'primary', disabled = false, style, showHatching = true }) => {
    // VINTERDÖD HARDENING: Added shrink-0 as a baseline default for critical tactile buttons
    const baseStyle = "group/tbtn relative px-8 py-4 font-black uppercase tracking-wider transition-all duration-200 border-2 shadow-lg hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden shrink-0";

    let variantClasses = "";
    let hatchingStyle = HORIZONTAL_HATCHING_STYLE;

    switch (variant) {
        case 'primary':
            variantClasses = "bg-white text-black border-white hover:bg-zinc-200";
            hatchingStyle = HORIZONTAL_HATCHING_STYLE_DARK;
            break;
        case 'secondary':
            variantClasses = "bg-zinc-900 text-zinc-400 border-zinc-700 hover:text-white hover:border-white";
            break;
        case 'danger':
            variantClasses = "bg-black text-red-600 border-red-800 hover:bg-red-900/10 shadow-[0_0_20px_rgba(220,38,38,0.2)]";
            break;
        case 'ghost':
            variantClasses = "bg-transparent text-zinc-500 border-transparent hover:text-zinc-300";
            break;
    }

    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`${baseStyle} ${variantClasses} ${className}`}
            style={style}
        >
            {showHatching && !disabled && (
                <div className="absolute inset-0 opacity-20 group-hover/tbtn:opacity-40 transition-opacity pointer-events-none" style={hatchingStyle} />
            )}
            <span className="relative z-10">{children}</span>
        </button>
    );
});

export const TacticalCard: React.FC<{
    children: React.ReactNode,
    isLocked?: boolean,
    color?: ColorPair | string,
    id?: string,
    className?: string,
    showHatching?: boolean,
    showHover?: boolean,
    onClick?: () => void,
    style?: React.CSSProperties
}> = React.memo(({ children, isLocked, color = COLORS.BLUE, id, className = '', showHatching = false, showHover = false, onClick, style }) => {
    const colorStr = typeof color === 'string' ? color : color.str;

    // VINTERDÖD HARDENING: Check if the consumer explicitly specified a shrink utility.
    // If not, we default to shrink-0 to guarantee that cards do not compress on iOS Safari viewports.
    const hasExplicitShrink = className.includes('shrink-') || className.includes('flex-shrink-');
    const defaultShrinkClass = hasExplicitShrink ? '' : 'shrink-0';

    return (
        <div
            id={id}
            onClick={onClick}
            className={`p-6 border-2 relative overflow-hidden transition-all duration-300 backdrop-blur-md shadow-2xl active:scale-[0.98] ${defaultShrinkClass} ${isLocked ? 'border-zinc-800 bg-black/60' : ''} ${onClick ? 'cursor-pointer' : ''} group/tcard ${className}`}
            style={{
                borderColor: isLocked ? '#1f2937' : `${colorStr}66`,
                backgroundColor: isLocked ? undefined : `${colorStr}0A`,
                ...style
            }}
        >
            {showHover && !isLocked && (
                <div
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full scale-0 group-hover/tcard:scale-[6] transition-transform duration-700 pointer-events-none"
                    style={{ backgroundColor: `${colorStr}15` }}
                />
            )}
            {showHatching && (
                <div className="absolute inset-0 opacity-20 pointer-events-none" style={HORIZONTAL_HATCHING_STYLE} />
            )}
            <div className="relative z-10">
                {children}
            </div>
        </div>
    );
});

export const TacticalTab: React.FC<{
    label: string | React.ReactNode,
    isActive: boolean,
    onClick: () => void,
    color?: ColorPair | string,
    orientation?: 'vertical' | 'horizontal',
    className?: string
}> = React.memo(({ label, isActive, onClick, color = COLORS.GREEN, orientation = 'horizontal', className = '' }) => {
    const baseStyle = "shrink-0 px-6 py-2 md:py-4 transition-all duration-200 hover:scale-105 active:scale-95 whitespace-nowrap flex justify-between items-center border-2 border-zinc-700 relative overflow-hidden group/tab font-bold uppercase tracking-widest transition-all";
    const activeStyle = isActive ? "text-white animate-tab-pulsate" : "bg-transparent text-zinc-400 hover:bg-white/5 border-zinc-700";
    const orientationStyle = orientation === 'vertical' ? "w-full text-left p-3 md:p-6 text-sm md:text-xl tracking-wider mx-0 md:mx-2" : "text-[10px] md:text-lg";

    const colorStr = typeof color === 'string' ? color : color.str;

    return (
        <button
            onClick={onClick}
            className={`${baseStyle} ${activeStyle} ${orientationStyle} ${className}`}
            style={isActive ? {
                backgroundColor: colorStr + '33',
                borderColor: typeof color !== 'string' ? adjustColor(color.num, -60) : color,
                '--pulse-color': colorStr
            } as any : {}}
        >
            {isActive && (
                <>
                    <div className="absolute inset-0 opacity-25 pointer-events-none" style={HORIZONTAL_HATCHING_STYLE} />
                    <div className="absolute inset-0 pointer-events-none opacity-60 shimmer-overlay" />
                </>
            )}
            <span className="relative z-10">{label}</span>
            {isActive && orientation === 'vertical' && <span className="text-white font-bold ml-2 relative z-10">→</span>}
        </button>
    );
});

export const TacticalRow: React.FC<{
    children: React.ReactNode,
    onClick?: () => void,
    color?: ColorPair | string,
    className?: string,
    showHover?: boolean
}> = React.memo(({ children, onClick, color = COLORS.BLUE, className = '', showHover = true }) => {
    const colorStr = typeof color === 'string' ? color : color.str;
    return (
        <div
            onClick={onClick}
            className={`relative overflow-hidden group/trow transition-colors ${onClick ? 'cursor-pointer' : ''} ${className}`}
        >
            {showHover && (
                <div
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full scale-0 group-hover/trow:scale-[10] transition-transform duration-700 pointer-events-none opacity-0 group-hover/trow:opacity-100"
                    style={{ backgroundColor: `${colorStr}0D` }}
                />
            )}
            <div className="relative z-10 w-full h-full">
                {children}
            </div>
        </div>
    );
});

export default ModalLayout;
