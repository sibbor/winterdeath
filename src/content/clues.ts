
export interface ClueDefinition {
    id: string;
    sector: number;
    index: number;
    type: 'THOUGHT' | 'SPEAK';
}

export const CLUES: Record<string, ClueDefinition> = {
    // Sector 0
    's0_start_tracks': { id: 's0_start_tracks', sector: 0, index: 0, type: 'THOUGHT' },
    's0_blood_stains': { id: 's0_blood_stains', sector: 0, index: 1, type: 'THOUGHT' },
    's0_they_must_be_scared': { id: 's0_they_must_be_scared', sector: 0, index: 2, type: 'THOUGHT' },
    's0_still_tracking': { id: 's0_still_tracking', sector: 0, index: 3, type: 'THOUGHT' },
    's0_town_center': { id: 's0_town_center', sector: 0, index: 4, type: 'THOUGHT' },
    's0_event_tunnel_blocked': { id: 's0_event_tunnel_blocked', sector: 0, index: 5, type: 'SPEAK' },
    's0_event_tunnel_whats_happening': { id: 's0_event_tunnel_whats_happening', sector: 0, index: 6, type: 'THOUGHT' },
    's0_event_tunnel_plant_explosives': { id: 's0_event_tunnel_plant_explosives', sector: 0, index: 7, type: 'SPEAK' },
    's0_event_tunnel_cleared': { id: 's0_event_tunnel_cleared', sector: 0, index: 8, type: 'SPEAK' },
    's0_event_tunnel_explosion_attracted_zombies': { id: 's0_event_tunnel_explosion_attracted_zombies', sector: 0, index: 9, type: 'SPEAK' },

    // Sector 1
    's1_start': { id: 's1_start', sector: 1, index: 0, type: 'THOUGHT' },
    's1_combat': { id: 's1_combat', sector: 1, index: 1, type: 'SPEAK' },
    's1_cave_lights': { id: 's1_cave_lights', sector: 1, index: 2, type: 'SPEAK' },
    's1_cave_loot': { id: 's1_cave_loot', sector: 1, index: 3, type: 'SPEAK' },
    's1_cave_loot_more': { id: 's1_cave_loot_more', sector: 1, index: 4, type: 'SPEAK' },

    // Sector 2
    's2_forest_noise': { id: 's2_forest_noise', sector: 2, index: 0, type: 'SPEAK' },
    's2_tractor': { id: 's2_tractor', sector: 2, index: 1, type: 'SPEAK' },

    // Sector 3
    's3_creepy_noise': { id: 's3_creepy_noise', sector: 3, index: 0, type: 'THOUGHT' }
};

export function getClueById(id: string): ClueDefinition | undefined {
    return CLUES[id];
}