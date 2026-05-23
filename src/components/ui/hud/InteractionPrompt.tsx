import React, { useCallback } from 'react';
import { t } from '../../../utils/i18n';
import { InteractionType, InteractionPromptId } from '../../../systems/ui/UIEventBridge';

interface InteractionPromptProps {
    type: InteractionType;
    label?: string | null;
    isMobileDevice?: boolean;
    onInteract?: (active: boolean) => void;
}

interface PromptConfig {
    key: string;
    color: string;
    keyColor: string;
}

// ============================================================================
// PERFORMANCE: SMI-to-Object Fixed Lookup Map
// Holds distinct style classes for both container and key indicators.
// Guarantees Zero-GC execution and enforces strict hidden-class shapes for V8.
// ============================================================================
const PROMPT_CONFIG_MAP: Record<number, PromptConfig> = {
    [InteractionPromptId.NONE]: {
        key: 'ui.interact',
        color: 'border-white/20 text-white shadow-[0_0_15px_rgba(255,255,255,0.8)]',
        keyColor: 'bg-white/10 border-white/20 text-white shadow-[inset_0_0_4px_rgba(255,255,255,0.8)]'
    },
    [InteractionPromptId.INTERACT]: {
        key: 'ui.interact',
        color: 'border-white/20 text-white shadow-[0_0_15px_rgba(255,255,255,0.8)]',
        keyColor: 'bg-white/10 border-white/20 text-white shadow-[inset_0_0_4px_rgba(255,255,255,0.8)]'
    },
    [InteractionPromptId.ENTER_VEHICLE]: {
        key: 'ui.enter_vehicle',
        color: 'border-blue-500/40 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.8)]',
        keyColor: 'bg-blue-500/10 border-blue-500/30 text-blue-400 shadow-[inset_0_0_4px_rgba(59,130,246,0.8)]'
    },
    [InteractionPromptId.EXIT_VEHICLE]: {
        key: 'ui.exit_vehicle',
        color: 'border-blue-500/40 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.8)]',
        keyColor: 'bg-blue-500/10 border-blue-500/30 text-blue-400 shadow-[inset_0_0_4px_rgba(59,130,246,0.8)]'
    },
    [InteractionPromptId.PICKUP_COLLECTIBLE]: {
        key: 'ui.interact_pickup_collectible',
        color: 'border-yellow-500/40 text-yellow-400 shadow-[0_0_15px_rgba(234,179,8,0.8)]',
        keyColor: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400 shadow-[inset_0_0_4px_rgba(234,179,8,0.8)]'
    },
    [InteractionPromptId.OPEN_CHEST]: {
        key: 'ui.interact_open_chest',
        color: 'border-orange-500/40 text-orange-400 shadow-[0_0_15px_rgba(249,115,22,0.8)]',
        keyColor: 'bg-orange-500/10 border-orange-500/30 text-orange-400 shadow-[inset_0_0_4px_rgba(249,115,22,0.8)]'
    },
    [InteractionPromptId.PLANT_EXPLOSIVE]: {
        key: 'ui.plant_explosives',
        color: 'border-red-500/40 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.8)]',
        keyColor: 'bg-red-500/10 border-red-500/30 text-red-400 shadow-[inset_0_0_4px_rgba(239,68,68,0.8)]'
    },
    [InteractionPromptId.KNOCK_ON_PORT]: {
        key: 'ui.interact_knock_on_port',
        color: 'border-white/20 text-white shadow-[0_0_15px_rgba(255,255,255,0.8)]',
        keyColor: 'bg-white/10 border-white/20 text-white shadow-[inset_0_0_4px_rgba(255,255,255,0.8)]'
    }
};

const DEFAULT_CONFIG = PROMPT_CONFIG_MAP[InteractionPromptId.NONE];

// PERFORMANCE: Pre-allocated strings to avoid incremental heap allocations inside the render loop.
const CONTAINER_BASE_CLASS = "hud-prompt-grit px-5 py-2.5 flex items-center gap-3 relative overflow-hidden";
const KEY_BASE_CLASS = "w-6 h-6 flex items-center justify-center text-xs font-mono font-black rounded-sm border";

const InteractionPrompt = React.forwardRef<any, InteractionPromptProps>(({
    isMobileDevice,
    onInteract
}, ref) => {
    const labelRef = React.useRef<HTMLSpanElement>(null);
    const containerRef = React.useRef<HTMLDivElement>(null);
    const keyRef = React.useRef<HTMLSpanElement>(null);

    React.useImperativeHandle(ref, () => ({
        update: (type: InteractionType, label: string, promptId?: InteractionPromptId) => {
            if (!labelRef.current || !containerRef.current || !keyRef.current) return;

            // Resolve lookup configuration object from fixed SMI table
            const id = promptId !== undefined ? promptId : InteractionPromptId.NONE;
            const config = PROMPT_CONFIG_MAP[id] || DEFAULT_CONFIG;

            // Resolve translation text asset localization
            let textKey = config.key;
            if (label && id === InteractionPromptId.NONE) {
                textKey = label;
            }

            let translatedText = t(textKey);
            if (!translatedText || translatedText.trim() === '') {
                translatedText = textKey;
            }

            // Direct DOM Mutation: Avoids heavy React reconciliation cycles entirely
            if (labelRef.current.innerText !== translatedText) {
                labelRef.current.innerText = translatedText;
            }

            // Atomic Class Mutators: Snap color properties instantly to prevent rendering interpolation bugs
            containerRef.current.className = CONTAINER_BASE_CLASS + " " + config.color;
            keyRef.current.className = KEY_BASE_CLASS + " " + config.keyColor;
        }
    }));

    const inputKey = isMobileDevice ? t('ui.tap') : "E";

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        e.stopPropagation();
        if (onInteract) onInteract(true);
    }, [onInteract]);

    const handleTouchEnd = useCallback((e: React.TouchEvent) => {
        e.stopPropagation();
        if (onInteract) onInteract(false);
    }, [onInteract]);

    const handleClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        if (onInteract) {
            onInteract(true);
            setTimeout(() => onInteract(false), 50);
        }
    }, [onInteract]);

    return (
        <div
            className={`flex flex-col items-center gap-2 pointer-events-auto z-[100] transition-transform duration-200 cursor-pointer select-none active:scale-90 ${isMobileDevice ? 'scale-70 origin-center' : 'scale-100'}`}
            onClick={handleClick}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
        >
            <div className="absolute inset-[-20px] pointer-events-auto" />

            <div ref={containerRef} className={`${CONTAINER_BASE_CLASS} z-10 ${DEFAULT_CONFIG.color}`}>
                <span ref={keyRef} className={`${KEY_BASE_CLASS} ${DEFAULT_CONFIG.keyColor}`}>
                    {inputKey}
                </span>
                <span ref={labelRef} className="text-xs font-black tracking-widest uppercase hud-text-glow">
                    {t(DEFAULT_CONFIG.key)}
                </span>
            </div>

            <style>{`
                .hud-prompt-grit {
                    background: repeating-linear-gradient(
                        0deg,
                        transparent,
                        transparent 2px,
                        rgba(255, 255, 255, 0.08) 2px,
                        rgba(255, 255, 255, 0.08) 4px
                    ),
                    linear-gradient(
                        rgba(24, 24, 27, 0.95),
                        rgba(24, 24, 27, 0.95)
                    );
                    border-style: solid;
                    border-width: 1px;
                }
            `}</style>
        </div>
    );
});

export default InteractionPrompt;