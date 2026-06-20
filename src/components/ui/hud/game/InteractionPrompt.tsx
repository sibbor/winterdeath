import React, { useRef, useCallback, useEffect } from 'react';
import { t } from '../../../../utils/i18n';
import { InteractionType, InteractionPromptId } from '../../../../systems/ui/UIEventBridge';
import { HudStore } from '../../../../store/HudStore';

interface InteractionPromptProps {
    isMobileDevice?: boolean;
}

interface PromptConfig {
    key: string;
    fullContainerClass: string; // ZERO-GC: Holds pre-baked concatenated string
    fullKeyClass: string;       // ZERO-GC: Holds pre-baked concatenated string
}

// PERFORMANCE: Pre-allocated base strings to protect frame layout boundaries
const CONTAINER_BASE_CLASS = "relative px-5 py-2 flex items-center gap-3 overflow-hidden font-mono font-bold tracking-widest uppercase z-10";
const KEY_BASE_CLASS = "min-w-[24px] h-6 flex items-center justify-center text-[10px] font-mono font-bold rounded bg-black/50 border shadow-[0_0_10px_rgba(0,0,0,0.5)] px-1.5 transition-all";

// ============================================================================
// PERFORMANCE: SMI-to-Object Fixed Lookup Map
// Pre-calculates the complete class combinations at compile time.
// Guarantees absolute Zero-GC execution loops by passing raw references.
// ============================================================================
const PROMPT_CONFIG_MAP: Record<number, PromptConfig> = {
    [InteractionPromptId.NONE]: {
        key: 'ui.interact',
        fullContainerClass: CONTAINER_BASE_CLASS + " text-white",
        fullKeyClass: KEY_BASE_CLASS + " border-white/30 text-white"
    },
    [InteractionPromptId.INTERACT]: {
        key: 'ui.interact',
        fullContainerClass: CONTAINER_BASE_CLASS + " text-white",
        fullKeyClass: KEY_BASE_CLASS + " border-white/30 text-white"
    },
    [InteractionPromptId.ENTER_VEHICLE]: {
        key: 'ui.enter_vehicle',
        fullContainerClass: CONTAINER_BASE_CLASS + " text-blue-400",
        fullKeyClass: KEY_BASE_CLASS + " border-blue-500/30 text-blue-400"
    },
    [InteractionPromptId.EXIT_VEHICLE]: {
        key: 'ui.exit_vehicle',
        fullContainerClass: CONTAINER_BASE_CLASS + " text-blue-400",
        fullKeyClass: KEY_BASE_CLASS + " border-blue-500/30 text-blue-400"
    },
    [InteractionPromptId.PICKUP_COLLECTIBLE]: {
        key: 'ui.interact_pickup_collectible',
        fullContainerClass: CONTAINER_BASE_CLASS + " text-yellow-400",
        fullKeyClass: KEY_BASE_CLASS + " border-yellow-500/30 text-yellow-400"
    },
    [InteractionPromptId.OPEN_CHEST]: {
        key: 'ui.interact_open_chest',
        fullContainerClass: CONTAINER_BASE_CLASS + " text-orange-400",
        fullKeyClass: KEY_BASE_CLASS + " border-orange-500/30 text-orange-400"
    },
    [InteractionPromptId.PLANT_EXPLOSIVE]: {
        key: 'ui.plant_explosives',
        fullContainerClass: CONTAINER_BASE_CLASS + " text-red-500",
        fullKeyClass: KEY_BASE_CLASS + " border-red-500/30 text-red-500"
    },
    [InteractionPromptId.KNOCK_ON_PORT]: {
        key: 'ui.interact_knock_on_port',
        fullContainerClass: CONTAINER_BASE_CLASS + " text-white",
        fullKeyClass: KEY_BASE_CLASS + " border-white/30 text-white"
    }
};

const DEFAULT_CONFIG = PROMPT_CONFIG_MAP[InteractionPromptId.NONE];

const InteractionPrompt: React.FC<InteractionPromptProps> = ({ isMobileDevice }) => {
    // ============================================================================
    // HOT PATH DOM NODES: Direct ref manipulation, no React state
    // ============================================================================
    const shellRef = useRef<HTMLDivElement>(null);
    const labelRef = useRef<HTMLSpanElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const keyRef = useRef<HTMLSpanElement>(null);

    // ZERO-GC: Track prompt active state without re-renders
    const isActiveRef = useRef<boolean | null>(null);
    const clickTimeoutRef = useRef<number | null>(null);
    const isTouchInteraction = useRef(false);

    const scaleStr = isMobileDevice ? 'scale(1.5)' : 'scale(1)';

    // ============================================================================
    // HOT PATH: subscribeFastUpdate — owns all visibility + content updates
    // ============================================================================
    useEffect(() => {
        const handleFastUpdate = (data: any) => {
            if (!shellRef.current) return;

            if (data.interactionActive) {
                if (isActiveRef.current !== true) {
                    shellRef.current.style.opacity = '1';
                    shellRef.current.style.transform = `translate(-50%, 0px) ${scaleStr}`;
                    shellRef.current.style.pointerEvents = 'auto';
                    isActiveRef.current = true;
                }

                // Update content (Zero-GC: direct DOM mutation)
                if (labelRef.current && containerRef.current && keyRef.current) {
                    const id = data.interactionId !== undefined ? data.interactionId : InteractionPromptId.NONE;
                    const config = PROMPT_CONFIG_MAP[id] || DEFAULT_CONFIG;

                    let textKey = config.key;
                    if (data.interactionLabel && id === InteractionPromptId.NONE) textKey = data.interactionLabel;

                    let translatedText = t(textKey);
                    if (!translatedText || translatedText.trim() === '') translatedText = textKey;

                    if (labelRef.current.innerText !== translatedText) labelRef.current.innerText = translatedText;
                    if (containerRef.current.className !== config.fullContainerClass) containerRef.current.className = config.fullContainerClass;
                    if (keyRef.current.className !== config.fullKeyClass) keyRef.current.className = config.fullKeyClass;
                }
            } else {
                if (isActiveRef.current !== false) {
                    shellRef.current.style.opacity = '0';
                    shellRef.current.style.transform = `translate(-50%, 10px) ${scaleStr}`;
                    shellRef.current.style.pointerEvents = 'none';
                    isActiveRef.current = false;
                }
            }
        };

        return HudStore.subscribeFastUpdate(handleFastUpdate);
    }, [scaleStr]);

    // ============================================================================
    // INTERACTION HANDLERS (Cold path — only fires on user touch/click)
    // ============================================================================

    // ZERO-GC: Recycled release executor to protect the heap loop
    const executeClickRelease = useCallback(() => {
        HudStore.triggerInteraction(false);
        clickTimeoutRef.current = null;
    }, []);

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        e.stopPropagation();
        isTouchInteraction.current = true;
        HudStore.triggerInteraction(true);
    }, []);

    const handleTouchEnd = useCallback((e: React.TouchEvent) => {
        e.stopPropagation();
        if (e.cancelable) e.preventDefault();
        HudStore.triggerInteraction(false);
        setTimeout(() => { isTouchInteraction.current = false; }, 300);
    }, []);

    const handleClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        if (isTouchInteraction.current) return;
        HudStore.triggerInteraction(true);
        if (clickTimeoutRef.current !== null) clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = window.setTimeout(executeClickRelease, 50);
    }, [executeClickRelease]);

    const inputKey = isMobileDevice ? t('ui.tap') : "E";

    return (
        <div
            ref={shellRef}
            className="absolute id-prompt-layer pointer-events-none z-[200] transition-all duration-[150ms] ease-out opacity-0"
            style={{
                bottom: isMobileDevice ? '35%' : '16rem',
                left: '50%',
                transform: `translate(-50%, 10px) ${scaleStr}`
            }}
        >
            <div
                className={`flex flex-col items-center gap-2 pointer-events-auto z-[100] transition-transform duration-200 cursor-pointer select-none active:scale-90 ${isMobileDevice ? 'scale-50 origin-center' : 'scale-100'}`}
                onClick={handleClick}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
            >
                <div className="absolute inset-[-20px] pointer-events-auto" />

                {/* SMOKY CINEMATIC BACKGROUND */}
                <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                        background: 'radial-gradient(50% 50% at 50% 50%, rgba(0, 0, 0, 0.95) 0%, rgba(0, 0, 0, 0.65) 50%, transparent 100%)',
                        filter: 'blur(10px)',
                        transform: 'scaleX(1.4) scaleY(1.1)'
                    }}
                />

                <div ref={containerRef} className={DEFAULT_CONFIG.fullContainerClass}>
                    <span ref={keyRef} className={DEFAULT_CONFIG.fullKeyClass}>
                        {inputKey}
                    </span>
                    <span ref={labelRef} className="text-xs font-mono font-bold tracking-widest uppercase hud-text-glow">
                        {t(DEFAULT_CONFIG.key)}
                    </span>
                </div>
            </div>
        </div>
    );
};

export default InteractionPrompt;