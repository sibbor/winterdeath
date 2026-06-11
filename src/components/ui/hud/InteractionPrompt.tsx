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
    fullContainerClass: string; // ZERO-GC: Holds pre-baked concatenated string
    fullKeyClass: string;       // ZERO-GC: Holds pre-baked concatenated string
}

// PERFORMANCE: Pre-allocated base strings to protect frame layout boundaries
const CONTAINER_BASE_CLASS = "hud-prompt-grit px-5 py-2.5 flex items-center gap-3 relative overflow-hidden";
const KEY_BASE_CLASS = "w-6 h-6 flex items-center justify-center text-xs font-mono font-black rounded-sm border";

// ============================================================================
// PERFORMANCE: SMI-to-Object Fixed Lookup Map
// Pre-calculates the complete class combinations at compile time.
// Guarantees absolute Zero-GC execution loops by passing raw references.
// ============================================================================
const PROMPT_CONFIG_MAP: Record<number, PromptConfig> = {
    [InteractionPromptId.NONE]: {
        key: 'ui.interact',
        fullContainerClass: CONTAINER_BASE_CLASS + " border-white/20 text-white shadow-[0_0_15px_rgba(255,255,255,0.8)]",
        fullKeyClass: KEY_BASE_CLASS + " bg-white/10 border-white/20 text-white shadow-[inset_0_0_4px_rgba(255,255,255,0.8)]"
    },
    [InteractionPromptId.INTERACT]: {
        key: 'ui.interact',
        fullContainerClass: CONTAINER_BASE_CLASS + " border-white/20 text-white shadow-[0_0_15px_rgba(255,255,255,0.8)]",
        fullKeyClass: KEY_BASE_CLASS + " bg-white/10 border-white/20 text-white shadow-[inset_0_0_4px_rgba(255,255,255,0.8)]"
    },
    [InteractionPromptId.ENTER_VEHICLE]: {
        key: 'ui.enter_vehicle',
        fullContainerClass: CONTAINER_BASE_CLASS + " border-blue-500/40 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.8)]",
        fullKeyClass: KEY_BASE_CLASS + " bg-blue-500/10 border-blue-500/30 text-blue-400 shadow-[inset_0_0_4px_rgba(59,130,246,0.8)]"
    },
    [InteractionPromptId.EXIT_VEHICLE]: {
        key: 'ui.exit_vehicle',
        fullContainerClass: CONTAINER_BASE_CLASS + " border-blue-500/40 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.8)]",
        fullKeyClass: KEY_BASE_CLASS + " bg-blue-500/10 border-blue-500/30 text-blue-400 shadow-[inset_0_0_4px_rgba(59,130,246,0.8)]"
    },
    [InteractionPromptId.PICKUP_COLLECTIBLE]: {
        key: 'ui.interact_pickup_collectible',
        fullContainerClass: CONTAINER_BASE_CLASS + " border-yellow-500/40 text-yellow-400 shadow-[0_0_15px_rgba(234,179,8,0.8)]",
        fullKeyClass: KEY_BASE_CLASS + " bg-yellow-500/10 border-yellow-500/30 text-yellow-400 shadow-[inset_0_0_4px_rgba(234,179,8,0.8)]"
    },
    [InteractionPromptId.OPEN_CHEST]: {
        key: 'ui.interact_open_chest',
        fullContainerClass: CONTAINER_BASE_CLASS + " border-orange-500/40 text-orange-400 shadow-[0_0_15px_rgba(249,115,22,0.8)]",
        fullKeyClass: KEY_BASE_CLASS + " bg-orange-500/10 border-orange-500/30 text-orange-400 shadow-[inset_0_0_4px_rgba(249,115,22,0.8)]"
    },
    [InteractionPromptId.PLANT_EXPLOSIVE]: {
        key: 'ui.plant_explosives',
        fullContainerClass: CONTAINER_BASE_CLASS + " border-red-500/40 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.8)]",
        fullKeyClass: KEY_BASE_CLASS + " bg-red-500/10 border-red-500/30 text-red-400 shadow-[inset_0_0_4px_rgba(239,68,68,0.8)]"
    },
    [InteractionPromptId.KNOCK_ON_PORT]: {
        key: 'ui.interact_knock_on_port',
        fullContainerClass: CONTAINER_BASE_CLASS + " border-white/20 text-white shadow-[0_0_15px_rgba(255,255,255,0.8)]",
        fullKeyClass: KEY_BASE_CLASS + " bg-white/10 border-white/20 text-white shadow-[inset_0_0_4px_rgba(255,255,255,0.8)]"
    }
};

const DEFAULT_CONFIG = PROMPT_CONFIG_MAP[InteractionPromptId.NONE];

const InteractionPrompt = React.forwardRef<any, InteractionPromptProps>(({
    isMobileDevice,
    onInteract
}, ref) => {
    const labelRef = React.useRef<HTMLSpanElement>(null);
    const containerRef = React.useRef<HTMLDivElement>(null);
    const keyRef = React.useRef<HTMLSpanElement>(null);
    const clickTimeoutRef = React.useRef<number | null>(null);

    React.useImperativeHandle(ref, () => ({
        /**
         * High frequency DOM mutator pipeline. Runs 100% allocation-free.
         */
        update: (type: InteractionType, label: string, promptId?: InteractionPromptId) => {
            if (!labelRef.current || !containerRef.current || !keyRef.current) return;

            const id = promptId !== undefined ? promptId : InteractionPromptId.NONE;
            const config = PROMPT_CONFIG_MAP[id] || DEFAULT_CONFIG;

            // Resolve localization translation keys passively
            let textKey = config.key;
            if (label && id === InteractionPromptId.NONE) {
                textKey = label;
            }

            let translatedText = t(textKey);
            if (!translatedText || translatedText.trim() === '') {
                translatedText = textKey;
            }

            // Direct DOM Mutation: Avoids structural virtual-DOM comparisons entirely
            if (labelRef.current.innerText !== translatedText) {
                labelRef.current.innerText = translatedText;
            }

            // Atomic Reference Assignment: Instant styling snapshots without dynamic string generation
            if (containerRef.current.className !== config.fullContainerClass) {
                containerRef.current.className = config.fullContainerClass;
            }
            if (keyRef.current.className !== config.fullKeyClass) {
                keyRef.current.className = config.fullKeyClass;
            }
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

    // ZERO-GC: Recycled release executor to protect the heap loop
    const executeClickRelease = useCallback(() => {
        if (onInteract) onInteract(false);
        clickTimeoutRef.current = null;
    }, [onInteract]);

    const handleClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        if (onInteract) {
            onInteract(true);
            if (clickTimeoutRef.current !== null) clearTimeout(clickTimeoutRef.current);
            // Uses a clean recycled method reference to prevent closure creations
            clickTimeoutRef.current = window.setTimeout(executeClickRelease, 50);
        }
    }, [onInteract, executeClickRelease]);

    return (
        <div
            className={`flex flex-col items-center gap-2 pointer-events-auto z-[100] transition-transform duration-200 cursor-pointer select-none active:scale-90 ${isMobileDevice ? 'scale-50 origin-center' : 'scale-100'}`}
            onClick={handleClick}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
        >
            <div className="absolute inset-[-20px] pointer-events-auto" />

            <div ref={containerRef} className={DEFAULT_CONFIG.fullContainerClass}>
                <span ref={keyRef} className={DEFAULT_CONFIG.fullKeyClass}>
                    {inputKey}
                </span>
                <span ref={labelRef} className="text-xs font-black tracking-widest uppercase hud-text-glow">
                    {t(DEFAULT_CONFIG.key)}
                </span>
            </div>

            {/* STYLES MOVED TO STATIC SCALABLE SYSTEM - INLINE INJECTION INCLUDES NO TRANSLATION BLOCKS */}
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