import React from 'react';
import { t } from '../../../../utils/i18n';
import ScreenModalLayout from '../../layout/ScreenModalLayout';

interface ScreenResetConfirmProps {
    onConfirm: () => void;
    onCancel: () => void;
    isMobileDevice?: boolean;
}

const ScreenResetConfirm: React.FC<ScreenResetConfirmProps> = ({ onConfirm, onCancel, isMobileDevice }) => {
    return (
        <ScreenModalLayout
            title={t('ui.reset_confirm_title')}
            isMobileDevice={isMobileDevice}
            onClose={onCancel}
            onCancel={onCancel}
            cancelLabel={t('ui.no_cancel')}
            onConfirm={onConfirm}
            confirmLabel={t('ui.yes_delete')}
            isSmall={true}
            titleColorClass="text-red-600"
        >
            <div className="flex flex-col items-center justify-center py-4 max-w-xl mx-auto text-center space-y-8">
                <div className="bg-red-900/40 border-2 border-red-600 p-6 shadow-[inset_0_0_20px_rgba(220,38,38,0.2)]">
                    <p className="text-red-100 text-lg font-semibold uppercase tracking-tight leading-tight">
                        {t('ui.reset_confirm_desc')}
                    </p>
                </div>
            </div>
        </ScreenModalLayout>
    );
};

export default ScreenResetConfirm;
