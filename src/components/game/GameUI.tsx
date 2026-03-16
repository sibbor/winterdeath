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
    // Local state for the interaction. 
    // Updating this only re-renders this tiny component, not the massive GameSession.
    const [interaction, setInteraction] = useState<{
        type: 'collectible' | 'chest' | 'plant_explosive' | 'knock_on_port' | 'sector_specific' | 'vehicle' | null,
        label: string | null,
        pos: { x: number, y: number } | null
    } | null>(null);

    useEffect(() => {
        // High-performance event listener hooked up to the engine's direct dispatches
        const handleUpdateInteraction = (e: CustomEvent<{
            type: any,
            label: string | null,
            pos: { x: number, y: number } | null
        } | null>) => {
            setInteraction(e.detail);
        };

        window.addEventListener('update_interaction', handleUpdateInteraction as EventListener);

        return () => {
            window.removeEventListener('update_interaction', handleUpdateInteraction as EventListener);
        };
    }, []);

    if (!interaction) return null;

    return (
        <InteractionPrompt
            type={interaction.type}
            label={interaction.label || interactionLabel}
            screenPos={interaction.pos}
            isMobileDevice={isMobileDevice}
            onInteract={onInteract}
        />
    );
};

export default GameUI;