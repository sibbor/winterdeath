import React, { useRef, useEffect } from 'react';
import InteractionPrompt from './InteractionPrompt';
import ChatBubblesUI from './ChatBubblesUI';
import { useHudStore } from '../../../hooks/useHudStore';
import { HudStore } from '../../../store/HudStore';

interface GameUIProps {
    onCloseClue: () => void;
    interactionType?: 'collectible' | 'chest' | 'vehicle' | 'sector_specific' | null;
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
    // Vi hämtar ENDAST primitiver. React kommer nu stanna helt i vila
    // under kamerarörelser, och bara rendera om när prompten faktiskt slås av/på!
    // ============================================================================
    const isActive = useHudStore(s => s.interactionPrompt.active);
    const storeType = useHudStore(s => s.interactionPrompt.type);
    const storeLabel = useHudStore(s => s.interactionPrompt.label);

    // Fallback to props if interaction is not driven by HudStore yet in edge cases
    const currentType = isActive ? storeType : (interactionType || null);
    const currentLabel = isActive ? storeLabel : interactionLabel;

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

            // Zero-GC Coordinate Fetching
            const targetX = state.interactionPrompt.x;
            const targetY = state.interactionPrompt.y;

            // Zero-GC Delta check: Only touch the DOM if it actually moved
            if (targetX !== lastX || targetY !== lastY) {
                // translate3d forces hardware acceleration on the GPU
                wrapperRef.current.style.transform = `translate3d(${targetX}px, ${targetY}px, 0)`;
                lastX = targetX;
                lastY = targetY;
            }
        });

        return unsubscribe;
        // Notera: Tog bort interactionScreenPos från deps eftersom store hanterar detta nu,
        // vilket förhindrar ytterligare onödiga re-renders.
    }, [currentType]);

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