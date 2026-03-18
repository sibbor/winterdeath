import React, { useEffect, useState } from 'react';
import InteractionPrompt from './InteractionPrompt';
import ChatBubblesUI from './ChatBubblesUI';
import { HudStore } from '../../core/systems/HudStore';

interface GameUIProps {
    onCloseClue: () => void;
    interactionType?: 'chest' | 'vehicle' | 'plant_explosive' | 'collectible' | 'knock_on_port' | 'sector_specific' | null;
    interactionLabel?: string;
    interactionScreenPos?: { x: number, y: number } | null; // Kept for backwards compatibility if needed
    isMobileDevice?: boolean;
    onInteract?: () => void;
}

const GameUI: React.FC<GameUIProps> = ({
    interactionType,
    interactionLabel,
    isMobileDevice,
    onInteract
}) => {
    // Local state for the interaction. 
    // Updating this only re-renders this tiny component, not the massive GameSession.
    const [interaction, setInteraction] = useState<{
        type: 'collectible' | 'chest' | 'plant_explosive' | 'knock_on_port' | 'sector_specific' | 'vehicle' | null,
        label: string | null,
        pos: { x: number, y: number } | null
    } | null>(null);

    useEffect(() => {
        // High-performance HudStore subscriber
        const unsubscribe = HudStore.subscribe((data) => {
            if (data.interactionPrompt) {
                setInteraction(data.interactionPrompt);
            } else {
                setInteraction(prev => prev !== null ? null : prev);
            }
        });

        return unsubscribe;
    }, []); // Empty dependency array ensures we only subscribe once on mount

    // Fallback to props if interaction is not driven by HudStore yet in some edge cases
    const currentType = interaction?.type || interactionType;
    const currentLabel = interaction?.label || interactionLabel;
    const currentPos = interaction?.pos || null;

    return (
        <>
            <ChatBubblesUI />
            {currentType && (
                <InteractionPrompt
                    type={currentType as any}
                    label={currentLabel}
                    screenPos={currentPos}
                    isMobileDevice={isMobileDevice}
                    onInteract={onInteract}
                />
            )}
        </>
    );
};

export default GameUI;