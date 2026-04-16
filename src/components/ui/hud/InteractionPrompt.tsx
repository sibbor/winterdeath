import React, { useCallback } from 'react';
import { t } from '../../../utils/i18n';
import { InteractionType } from '../../../systems/InteractionTypes';

interface InteractionPromptProps {
    type: InteractionType;
    label?: string | null;
    isMobileDevice?: boolean;
    onInteract?: (active: boolean) => void;
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

const InteractionPrompt = React.forwardRef<any, InteractionPromptProps>(({
    isMobileDevice,
    onInteract
}, ref) => {
    const labelRef = React.useRef<HTMLSpanElement>(null);
    const containerRef = React.useRef<HTMLDivElement>(null);

    React.useImperativeHandle(ref, () => ({
        update: (type: InteractionType, label: string) => {
            if (!labelRef.current || !containerRef.current) return;
            
            const config = TYPE_CONFIG[type] || DEFAULT_CONFIG;
            const textKey = label ? label : config.key;
            
            let translatedText = t(textKey);
            if (!translatedText || translatedText.trim() === '') {
                translatedText = textKey;
            }
            
            if (labelRef.current.innerText !== translatedText) {
                labelRef.current.innerText = translatedText;
            }

            // Update color classes via direct className manipulation
            // Note: We're replacing the specific border/text colors
            const baseClass = "hud-bar-container bg-black/80 backdrop-blur-md px-4 py-2 border flex items-center gap-3 shadow-2xl";
            containerRef.current.className = `${baseClass} ${config.color}`;
        }
    }));

    const inputKey = isMobileDevice ? "TAP" : "E";

    // Handle touch for engine-level edge detection
    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        e.stopPropagation();
        if (onInteract) onInteract(true);
    }, [onInteract]);

    const handleTouchEnd = useCallback((e: React.TouchEvent) => {
        e.stopPropagation();
        if (onInteract) onInteract(false);
    }, [onInteract]);

    // Handle mouse click for desktop debugging/PC
    const handleClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        if (!isMobileDevice && onInteract) {
            onInteract(true);
            setTimeout(() => onInteract(false), 50);
        }
    }, [onInteract, isMobileDevice]);

    return (
        <div
            className="flex flex-col items-center gap-2 pointer-events-auto z-[100] transition-opacity duration-200 cursor-pointer select-none active:scale-95"
            onClick={handleClick}
            onTouchStart={isMobileDevice ? handleTouchStart : undefined}
            onTouchEnd={isMobileDevice ? handleTouchEnd : undefined}
        >
            <div ref={containerRef} className={`hud-bar-container bg-black/80 backdrop-blur-md px-4 py-2 border flex items-center gap-3 shadow-2xl ${DEFAULT_CONFIG.color}`}>
                <span className="w-6 h-6 flex items-center justify-center bg-white/20 border border-white/40 text-[10px] font-black text-white">
                    {inputKey}
                </span>
                <span ref={labelRef} className="text-xs font-black tracking-widest uppercase hud-text-glow">
                    {t(DEFAULT_CONFIG.key)}
                </span>
            </div>
        </div>
    );
});

export default InteractionPrompt;