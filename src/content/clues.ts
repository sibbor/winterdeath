
export interface ClueDefinition {
    id: string;
    sector: number;
    index: number;
    type: 'THOUGHT' | 'SPEAK';
}

export const CLUES: Record<string, ClueDefinition> = {
    // Sector 1
    's1_start_tracks': { id: 's1_start_tracks', sector: 1, index: 0, type: 'THOUGHT' },
    's1_blood_stains': { id: 's1_blood_stains', sector: 1, index: 1, type: 'THOUGHT' },
    's1_they_must_be_scared': { id: 's1_they_must_be_scared', sector: 1, index: 2, type: 'THOUGHT' },
    's1_still_tracking': { id: 's1_still_tracking', sector: 1, index: 3, type: 'THOUGHT' },
    's1_town_center': { id: 's1_town_center', sector: 1, index: 4, type: 'THOUGHT' },
    's1_event_tunnel_blocked': { id: 's1_event_tunnel_blocked', sector: 1, index: 5, type: 'SPEAK' },
    's1_event_tunnel_whats_happening': { id: 's1_event_tunnel_whats_happening', sector: 1, index: 6, type: 'THOUGHT' },
    's1_event_tunnel_plant_explosives': { id: 's1_event_tunnel_plant_explosives', sector: 1, index: 7, type: 'SPEAK' },
    's1_event_tunnel_cleared': { id: 's1_event_tunnel_cleared', sector: 1, index: 8, type: 'SPEAK' },
    's1_event_tunnel_explosion_attracted_zombies': { id: 's1_event_tunnel_explosion_attracted_zombies', sector: 1, index: 9, type: 'SPEAK' },

    // Sector 2
    's2_start': { id: 's2_start', sector: 2, index: 0, type: 'THOUGHT' },
    's2_combat': { id: 's2_combat', sector: 2, index: 1, type: 'SPEAK' },
    's2_cave_lights': { id: 's2_cave_lights', sector: 2, index: 2, type: 'SPEAK' },
    's2_cave_loot': { id: 's2_cave_loot', sector: 2, index: 3, type: 'SPEAK' },
    's2_cave_loot_more': { id: 's2_cave_loot_more', sector: 2, index: 4, type: 'SPEAK' },

    // Sector 3
    's3_forest_noise': { id: 's3_forest_noise', sector: 3, index: 0, type: 'SPEAK' },
    's3_tractor': { id: 's3_tractor', sector: 3, index: 1, type: 'SPEAK' },

    // Sector 4
    's4_creepy_noise': { id: 's4_creepy_noise', sector: 4, index: 0, type: 'THOUGHT' }
};

export function getClueById(id: string): ClueDefinition | undefined {
    return CLUES[id];
}
