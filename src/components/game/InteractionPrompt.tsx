import React from 'react';
import { t } from '../../utils/i18n';

interface InteractionPromptProps {
    type: 'chest' | 'bus' | null;
}

const InteractionPrompt: React.FC<InteractionPromptProps> = ({ type }) => {
    if (!type) return null;

    let textKey = '';
    let colorClass = '';

    if (type === 'chest') {
        textKey = 'ui.open_chest';
        colorClass = 'border-yellow-500 text-yellow-500';
    } else if (type === 'bus') {
        textKey = 'ui.travel';
        colorClass = 'border-blue-500 text-blue-500';
    }

    return (
        <div className="absolute bottom-32 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none">
            <div className={`bg-black/80 border-2 ${colorClass} px-6 py-2 font-black uppercase tracking-widest animate-pulse shadow-lg`}>
                {t(textKey)}
            </div>
        </div>
    );
};

export default InteractionPrompt;