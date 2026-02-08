
export interface CollectibleDefinition {
    id: string;
    nameKey: string;
    descriptionKey: string;
    sector: number;
    modelType: 'phone' | 'pacifier' | 'axe' | 'scarf' | 'jacket' | 'badge' | 'diary' | 'ring' | 'teddy';
    reward: {
        sp: number;
    };
}

export const COLLECTIBLES: Record<string, CollectibleDefinition> = {
    // Sector 1
    's1_collectible_1': {
        id: 's1_collectible_1',
        nameKey: 'clues.s1_collectible_1_title',
        descriptionKey: 'clues.s1_collectible_1_description',
        sector: 1,
        modelType: 'phone',
        reward: { sp: 1 }
    },
    's1_collectible_2': {
        id: 's1_collectible_2',
        nameKey: 'clues.s1_collectible_2_title',
        descriptionKey: 'clues.s1_collectible_2_description',
        sector: 1,
        modelType: 'axe',
        reward: { sp: 1 }
    },

    // Sector 2
    's2_collectible_1': {
        id: 's2_collectible_1',
        nameKey: 'clues.s2_collectible_1_title',
        descriptionKey: 'clues.s2_collectible_1_description',
        sector: 2,
        modelType: 'pacifier',
        reward: { sp: 1 }
    },
    's2_collectible_2': {
        id: 's2_collectible_2',
        nameKey: 'clues.s2_collectible_2_title',
        descriptionKey: 'clues.s2_collectible_2_description',
        sector: 2,
        modelType: 'teddy',
        reward: { sp: 1 }
    },

    // Sector 3
    's3_collectible_1': {
        id: 's3_collectible_1',
        nameKey: 'clues.s3_collectible_1_title',
        descriptionKey: 'clues.s3_collectible_1_description',
        sector: 3,
        modelType: 'diary',
        reward: { sp: 1 }
    },
    's3_collectible_2': {
        id: 's3_collectible_2',
        nameKey: 'clues.s3_collectible_2_title',
        descriptionKey: 'clues.s3_collectible_2_description',
        sector: 3,
        modelType: 'jacket',
        reward: { sp: 1 }
    },

    // Sector 4
    's4_collectible_1': {
        id: 's4_collectible_1',
        nameKey: 'clues.s4_collectible_1_title',
        descriptionKey: 'clues.s4_collectible_1_description',
        sector: 4,
        modelType: 'ring',
        reward: { sp: 1 }
    },
    's4_collectible_2': {
        id: 's4_collectible_2',
        nameKey: 'clues.s4_collectible_2_title',
        descriptionKey: 'clues.s4_collectible_2_description',
        sector: 4,
        modelType: 'badge',
        reward: { sp: 1 }
    }
};

export function getCollectibleById(id: string): CollectibleDefinition | undefined {
    return COLLECTIBLES[id];
}

export function getCollectiblesBySector(sector: number): CollectibleDefinition[] {
    return Object.values(COLLECTIBLES).filter(c => c.sector === sector);
}
