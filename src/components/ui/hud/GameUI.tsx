import React, { useRef, useEffect } from 'react';
import ChatBubblesUI from './ChatBubblesUI';
import { InteractionType } from '../../../systems/InteractionTypes';

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
            <ChatBubblesUI />
        </>
    );
});

export default GameUI;
