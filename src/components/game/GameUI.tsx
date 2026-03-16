import React, { useEffect, useState } from 'react';
import InteractionPrompt from './InteractionPrompt';

interface GameUIProps {
    onCloseClue: () => void;
    interactionType: 'chest' | 'vehicle' | 'plant_explosive' | 'collectible' | 'knock_on_port' | 'sector_specific' | null;
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
    // Local state for the interaction position. 
    // Updating this only re-renders this tiny component, not the massive GameSession.
    const [screenPos, setScreenPos] = useState<{ x: number, y: number } | null>(null);

    useEffect(() => {
        // High-performance event listener hooked up to the engine's direct dispatches
        const handleUpdatePos = (e: CustomEvent<{ x: number, y: number } | null>) => {
            setScreenPos(e.detail);
        };

        window.addEventListener('update_interaction_pos', handleUpdatePos as EventListener);

        return () => {
            window.removeEventListener('update_interaction_pos', handleUpdatePos as EventListener);
        };
    }, []);

    // 1. Dialogue: CinematicBubble is handled in GameSession currently
    // 2. Interactions
    // These render *on top* of the game but don't block input usually.
    return (
        <InteractionPrompt
            type={interactionType}
            label={interactionLabel}
            screenPos={screenPos}
            isMobileDevice={isMobileDevice}
            onInteract={onInteract}
        />
    );
};

export default GameUI;