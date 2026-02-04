
import React from 'react';
import InteractionPrompt from './InteractionPrompt';
// ScreenDialogue is now deprecated by CinematicBubble in GameCanvas, removing the import/logic
// import ScreenDialogue from './ScreenDialogue';

interface GameUIProps {
    onCloseClue: () => void;

    interactionType: 'chest' | 'plant_explosive' | 'collectible' | 'knock_on_port' | null;
    interactionScreenPos?: { x: number, y: number } | null;

    // Legacy Dialogue Props (Can be ignored or cleaned up later)
    dialogueOpen: boolean;
    dialogueLine: any;
    foundMemberName: string;
    isLastLine: boolean;
    onNextDialogue: () => void;
    onPrevDialogue: () => void;
    onCloseDialogue: () => void;
}

const GameUI: React.FC<GameUIProps> = ({
    interactionType,
    interactionScreenPos
}) => {
    // 1. Dialogue: CinematicBubble.

    // 2. Interactions
    // These render *on top* of the game but don't block input usually, 
    // unless mapped to keys. They are purely visual prompts here.
    return (
        <InteractionPrompt type={interactionType} screenPos={interactionScreenPos} />
    );
};

export default GameUI;
