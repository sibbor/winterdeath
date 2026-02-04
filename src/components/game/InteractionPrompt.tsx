import React from 'react';
import { t } from '../../utils/i18n';

interface InteractionPromptProps {
    type: 'collectible' | 'chest' | 'plant_explosive' | 'knock_on_port' | null;
    screenPos?: { x: number, y: number } | null;
}

const InteractionPrompt: React.FC<InteractionPromptProps> = ({ type, screenPos }) => {
    if (!type) return null;

    let textKey = '';
    let colorClass = '';

    if (type === 'collectible') {
        textKey = 'ui.interact_pickup_collectible';
        colorClass = 'border-green-300 text-white';
    } else if (type === 'chest') {
        textKey = 'ui.interact_open_chest';
        colorClass = 'border-yellow-500 text-yellow-500';
    } else if (type === 'plant_explosive') {
        textKey = 'ui.interact_plant_explosive';
        colorClass = 'border-red-500 text-red-500';
    } else if (type === 'knock_on_port') {
        textKey = 'ui.interact_knock_on_port';
        colorClass = 'border-white-500 text-white-500';
    } else {
        textKey = 'ui.interact';
        colorClass = 'border-white-500 text-white-500';
    }

    const style: React.CSSProperties = screenPos ? {
        left: `${screenPos.x + 4}%`,
        top: `${screenPos.y + 5}%`,
        transform: 'translate(-50%, -50%)',
        position: 'absolute'
    } : {
        bottom: '8rem',
        left: '50%',
        transform: 'translateX(-50%)',
        position: 'absolute'
    };

    return (
        <div
            style={style}
            className="flex flex-col items-center gap-2 pointer-events-none z-40 transition-opacity duration-200"
        >
            <div className={`bg-black/90 border-2 ${colorClass} px-4 py-1 font-bold uppercase tracking-wide text-sm`}>
                {t(textKey)}
            </div>

        </div>
    );
};

export default InteractionPrompt;