
import React from 'react';
import { t } from '../../utils/i18n';
import CampModalLayout from './CampModalLayout';

interface ScreenResetConfirmProps {
    onConfirm: () => void;
    onCancel: () => void;
}

const ScreenResetConfirm: React.FC<ScreenResetConfirmProps> = ({ onConfirm, onCancel }) => {
    return (
        <CampModalLayout
            title={t('ui.reset_confirm_title')}
            onClose={onCancel}
            onConfirm={onConfirm}
            confirmLabel={t('ui.yes_delete')}
            closeLabel={t('ui.no_cancel')}
            showCancel={true}
            isSmall={true}
        >
            <div className="flex flex-col items-center justify-center py-4 max-w-xl mx-auto text-center space-y-8">
                <div className="bg-red-900/40 border-2 border-red-600 p-6 shadow-[inset_0_0_20px_rgba(220,38,38,0.2)]">
                    <p className="text-red-100 text-lg font-semibold uppercase tracking-tight leading-tight">
                        {t('ui.reset_confirm_desc')}
                    </p>
                </div>
            </div>
        </CampModalLayout>
    );
};

export default ScreenResetConfirm;
