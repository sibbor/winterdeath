
import { FAMILY_MEMBERS, PLAYER_CHARACTER } from '../content/constants';

export * from './assets/geometry';
export * from './assets/materials';
export * from './assets/textures';
export * from './assets/models';

export const getSpeakerColor = (name: string): string => {
    if (!name) return '#9ca3af';
    const lower = name.toLowerCase();

    // Player
    if (lower === 'robert') return '#' + PLAYER_CHARACTER.color.toString(16).padStart(6, '0');

    // Family Members
    const member = FAMILY_MEMBERS.find(m => lower.includes(m.name.toLowerCase()));
    if (member) {
        return '#' + member.color.toString(16).padStart(6, '0');
    }

    // Narrator/Action
    if (lower === 'narrator') return '#ef4444'; // Red (Used for fallback/box color, not text override)

    // Unknowns
    if (['okänd', 'unknown', 'röst', 'radio', 'mannen'].some(k => lower.includes(k))) return '#9ca3af'; // Grey

    return '#000000'; // Default Black
};
