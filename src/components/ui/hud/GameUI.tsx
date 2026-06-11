import React, { useRef, useEffect } from 'react';
import { InteractionType } from '../../../systems/ui/UIEventBridge';

interface GameUIProps {
    onCloseClue: () => void;
    interactionType?: InteractionType;
    interactionLabel?: string;
    interactionScreenPos?: { x: number, y: number } | null; // Kept for backwards compatibility
    isMobileDevice?: boolean;
    onInteract?: () => void;
}

const GameUI: React.FC<GameUIProps> = React.memo(({
    isMobileDevice,
}) => {
    return (
        <>
        </>
    );
});

export default GameUI;