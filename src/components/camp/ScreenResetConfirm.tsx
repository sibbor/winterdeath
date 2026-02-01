
import React from 'react';
import { t } from '../../utils/i18n';
import { soundManager } from '../../utils/sound';
import CampModalLayout from './CampModalLayout';

interface ScreenResetConfirmProps {
    onConfirm: () => void;
    onCancel: () => void;
}

const ScreenResetConfirm: React.FC<ScreenResetConfirmProps> = ({ onConfirm, onCancel }) => {
    return (
        <CampModalLayout
            title={t('ui.reset_confirm_title')}
            borderColorClass="border-red-600"
            onClose={onCancel}
            showCancel={false}
            isSmall={true}
        >
            <div className="flex flex-col items-center justify-center py-4 max-w-xl mx-auto text-center space-y-8">
                <div className="bg-red-900/40 border-2 border-red-600 p-6 skew-x-[-5deg] shadow-[inset_0_0_20px_rgba(220,38,38,0.2)]">
                    <p className="text-red-100 text-lg font-black uppercase tracking-tight skew-x-[5deg] leading-tight">
                        {t('ui.reset_confirm_desc')}
                    </p>
                </div>

                <div className="flex gap-6">
                    <button
                        onClick={() => { soundManager.playUiClick(); onCancel(); }}
                        className="px-8 py-4 bg-gray-900 border-2 border-gray-600 text-white font-black uppercase tracking-widest hover:bg-gray-800 hover:border-white transition-all skew-x-[-5deg]"
                    >
                        <span className="block skew-x-[5deg]">{t('ui.no_cancel')}</span>
                    </button>

                    <button
                        onClick={() => { soundManager.playUiConfirm(); onConfirm(); }}
                        className="px-8 py-4 bg-red-700 border-2 border-red-500 text-white font-black uppercase tracking-widest hover:bg-red-600 hover:scale-105 transition-all skew-x-[-5deg] shadow-[0_0_20px_rgba(220,38,38,0.5)]"
                    >
                        <span className="block skew-x-[5deg]">{t('ui.yes_delete')}</span>
                    </button>
                </div>
            </div>
        </CampModalLayout>
    );
};

export default ScreenResetConfirm;
