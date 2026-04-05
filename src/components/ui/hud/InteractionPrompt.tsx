import React, { useCallback } from 'react';
import { t } from '../../../utils/i18n';
import { InteractionType } from '../../../systems/InteractionTypes';

interface InteractionPromptProps {
    type: InteractionType;
    label?: string | null;
    screenPos?: { x: number, y: number } | null; // Kept for backwards compatibility
    isMobileDevice?: boolean;
    onInteract?: () => void;
}

// ============================================================================
// PERFORMANCE: Static Configuration Array (O(1) SMI Lookup)
// Replaced the Record/Map with a contiguous array for optimized memory access.
// VINTERDÖD: Ensures Zero-GC and prevents hidden-class deoptimization.
// ============================================================================
const TYPE_CONFIG = [
    { key: 'ui.interact', color: 'border-gray-400 text-white' }, // NONE (0)
    { key: 'ui.interact_pickup_collectible', color: 'border-green-400 text-green-100' }, // COLLECTIBLE (1)
    { key: 'ui.interact_open_chest', color: 'border-yellow-500 text-yellow-100' }, // CHEST (2)
    { key: 'ui.enter_vehicle', color: 'border-blue-400 text-blue-100' }, // VEHICLE (3)
    { key: 'ui.interact', color: 'border-gray-400 text-white' }, // SECTOR_SPECIFIC (4)
    { key: 'ui.interact', color: 'border-orange-400 text-white' }, // PLANT_EXPLOSIVE (5)
    { key: 'ui.interact', color: 'border-gray-400 text-white' }  // KNOCK_ON_PORT (6)
];

const DEFAULT_CONFIG = TYPE_CONFIG[0];

const InteractionPrompt: React.FC<InteractionPromptProps> = React.memo(({
    type,
    label,
    isMobileDevice,
    onInteract
}) => {
    if (type === InteractionType.NONE) return null;

    const inputKey = isMobileDevice ? "TAP" : "E";

    // Select color and default text key based on interaction type
    const config = TYPE_CONFIG[type] || DEFAULT_CONFIG;

    // Overrides logic: If a label is explicitly provided by the game system, ALWAYS use it
    const textKey = label ? label : config.key;
    const colorClass = config.color;

    // Failsafe: If i18n cannot find the word, show 'textKey' instead of an empty text box
    let translatedText = t(textKey);
    if (!translatedText || translatedText.trim() === '') {
        translatedText = textKey;
    }

    // ZERO-GC: Stable callback to prevent inline function allocation on every render
    const handleClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        if (onInteract) onInteract();
    }, [onInteract]);

    return (
        <div
            className="absolute flex flex-col items-center gap-2 pointer-events-auto z-40 transition-opacity duration-200 cursor-pointer"
            onClick={handleClick}
        >
            <div className={`hud-bar-container bg-black/80 backdrop-blur-md px-4 py-2 border flex items-center gap-3 shadow-2xl ${colorClass}`}>
                <span className="w-6 h-6 flex items-center justify-center bg-white/20 border border-white/40 text-[10px] font-black text-white">
                    {inputKey}
                </span>
                <span className="text-xs font-black tracking-widest uppercase hud-text-glow">
                    {translatedText}
                </span>
            </div>
        </div>
    );
});

export default InteractionPrompt;