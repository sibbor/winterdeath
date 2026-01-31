
import React from 'react';
import { t } from '../../utils/i18n';
import { soundManager } from '../../utils/sound';

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
    showCancel = true
}) => {
    // Reduced mb-8 to mb-4
    const headerStyle = "text-6xl font-black text-white uppercase tracking-tighter mb-4 border-b-8 pb-4 inline-block skew-x-[-10deg]";
    const buttonStyle = "px-8 py-3 font-black uppercase tracking-wider transition-all duration-200 hover:scale-105 active:scale-95 border-2 shadow-lg";

    return (
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center z-50 p-4 md:p-8 backdrop-blur-lg pointer-events-auto">
            <div className={`bg-black/95 border-4 border-gray-800 w-full max-w-7xl h-[90vh] flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.5)] relative`}>
                {/* Reduced padding p-8 to p-6 */}
                <div className="p-6 border-b-2 border-gray-800 flex justify-between items-center bg-transparent shrink-0">
                    <h2 className={`${headerStyle} ${borderColorClass}`}>
                        {title}
                    </h2>
                    <div className="flex gap-6">
                        {showCancel && (
                            <button
                                onClick={() => { soundManager.playUiClick(); onClose(); }}
                                className={`${buttonStyle} border-gray-600 text-gray-400 hover:text-white hover:border-white bg-transparent`}
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
                                        soundManager.playUiClick(); // Fail sound?
                                    }
                                }}
                                disabled={!canConfirm}
                                className={`${buttonStyle} ${isSettings
                                    ? 'border-white bg-white text-black hover:bg-gray-200'
                                    : (canConfirm
                                        ? 'border-red-600 bg-red-700/80 text-white hover:bg-red-600 hover:border-red-400'
                                        : 'border-gray-800 text-gray-700 bg-gray-900 cursor-not-allowed')
                                    }`}
                            >
                                {confirmLabel || t('ui.confirm_selection')}
                            </button>
                        )}
                    </div>
                </div>

                {/* Reduced padding p-12 to p-6 */}
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-transparent">
                    {children}
                </div>
            </div>
        </div>
    );
};

export default CampModalLayout;
