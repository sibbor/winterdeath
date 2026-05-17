import { ToolID } from '../entities/player/CombatTypes';

export interface ToolStats {
    name: ToolID;
    displayName: string;
    icon: string;
    iconIsPng: boolean;
    useTime?: number; // Hur lång tid den tar att använda
}

const PNG_PATH = '/assets/icons/weapons/'; // Kanske byta till /tools/ i framtiden

export const TOOLS: ToolStats[] = [];

TOOLS[ToolID.RADIO] = {
    name: ToolID.RADIO,
    displayName: 'weapons.radio', // Din nuvarande översättningsnyckel
    icon: PNG_PATH + 'radio.png',
    iconIsPng: true,
    useTime: 1000
};