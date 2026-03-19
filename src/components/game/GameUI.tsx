import React, { useMemo, useRef, useEffect } from 'react';
import InteractionPrompt from './InteractionPrompt';
import ChatBubblesUI from './ChatBubblesUI';
import { useHudStore } from '../../hooks/useHudStore';
import { HudStore } from '../../store/HudStore';

interface GameUIProps {
    onCloseClue: () => void;
    interactionType?: 'chest' | 'vehicle' | 'plant_explosive' | 'collectible' | 'knock_on_port' | 'sector_specific' | null;
    interactionLabel?: string;
    interactionScreenPos?: { x: number, y: number } | null; // Kept for backwards compatibility
    isMobileDevice?: boolean;
    onInteract?: () => void;
}

const GameUI: React.FC<GameUIProps> = React.memo(({
    interactionType,
    interactionLabel,
    interactionScreenPos,
    isMobileDevice,
    onInteract
}) => {
    // ============================================================================
    // ZERO-GC PRIMITIVE SELECTORS
    // We ONLY subscribe to state changes that dictate VISIBILITY or TEXT.
    // We completely remove X/Y coordinates from React's awareness to prevent 
    // the component from re-rendering at 60 FPS during camera movement.
    // ============================================================================

    const storeType = useHudStore(s => s.interactionPrompt?.type || null);
    const storeLabel = useHudStore(s => s.interactionPrompt?.label || null);

    // Fallback to props if interaction is not driven by HudStore yet in edge cases
    const currentType = storeType || interactionType;
    const currentLabel = storeLabel || interactionLabel;

    // ============================================================================
    // HIGH-FREQUENCY DOM MUTATOR (GPU Accelerated Positioning)
    // ============================================================================
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!currentType) return; // Only subscribe to the 60FPS loop if prompt is visible

        let lastX = -1;
        let lastY = -1;

        const unsubscribe = HudStore.subscribe((state) => {
            if (!wrapperRef.current) return;

            const pos = state.interactionPrompt?.pos;

            // Fallback to prop positions if the store doesn't have them
            const targetX = pos?.x ?? interactionScreenPos?.x ?? 0;
            const targetY = pos?.y ?? interactionScreenPos?.y ?? 0;

            // Zero-GC Delta check: Only touch the DOM and allocate strings if it actually moved
            if (targetX !== lastX || targetY !== lastY) {
                // translate3d forces hardware acceleration on the GPU
                wrapperRef.current.style.transform = `translate3d(${targetX}px, ${targetY}px, 0)`;
                lastX = targetX;
                lastY = targetY;
            }
        });

        return unsubscribe;
    }, [currentType, interactionScreenPos]);

    return (
        <>
            <ChatBubblesUI />

            {currentType && (
                <div
                    ref={wrapperRef}
                    className="absolute top-0 left-0 w-0 h-0 pointer-events-none z-50"
                    style={{ willChange: 'transform' }} // Hint to browser for GPU optimization
                >
                    {/* Inner wrapper centers the prompt at the translated origin */}
                    <div className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2">
                        <InteractionPrompt
                            type={currentType as any}
                            label={currentLabel || undefined}
                            screenPos={null} // Passed as null! InteractionPrompt now renders at local (0,0)
                            isMobileDevice={isMobileDevice}
                            onInteract={onInteract}
                        />
                    </div>
                </div>
            )}
        </>
    );
});

export default GameUI;