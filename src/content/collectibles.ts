
export interface CollectibleDefinition {
    id: string;
    sector: number;
    index: number;
    modelType: 'phone' | 'pacifier' | 'axe' | 'scarf' | 'jacket' | 'badge' | 'diary' | 'ring' | 'teddy';
    reward: {
        sp: number;
    };
}

export const COLLECTIBLES: Record<string, CollectibleDefinition> = {
    // Sector 1
    's1_collectible_1': {
        id: 's1_collectible_1',
        sector: 1,
        index: 0,
        modelType: 'phone',
        reward: { sp: 1 }
    },
    's1_collectible_2': {
        id: 's1_collectible_2',
        sector: 1,
        index: 1,
        modelType: 'axe',
        reward: { sp: 1 }
    },

    // Sector 2
    's2_collectible_1': {
        id: 's2_collectible_1',
        sector: 2,
        index: 0,
        modelType: 'pacifier',
        reward: { sp: 1 }
    },
    's2_collectible_2': {
        id: 's2_collectible_2',
        sector: 2,
        index: 1,
        modelType: 'teddy',
        reward: { sp: 1 }
    },

    // Sector 3
    's3_collectible_1': {
        id: 's3_collectible_1',
        sector: 3,
        index: 0,
        modelType: 'diary',
        reward: { sp: 1 }
    },
    's3_collectible_2': {
        id: 's3_collectible_2',
        sector: 3,
        index: 1,
        modelType: 'jacket',
        reward: { sp: 1 }
    },

    // Sector 4
    's4_collectible_1': {
        id: 's4_collectible_1',
        sector: 4,
        index: 0,
        modelType: 'ring',
        reward: { sp: 1 }
    },
    's4_collectible_2': {
        id: 's4_collectible_2',
        sector: 4,
        index: 1,
        modelType: 'badge',
        reward: { sp: 1 }
    },

    // Sector 6 (Playground Test)
    'dummy_badge_test': {
        id: 'dummy_badge_test',
        sector: 6,
        index: 0,
        modelType: 'badge',
        reward: { sp: 0 }
    }
};

export function getCollectibleById(id: string): CollectibleDefinition | undefined {
    return COLLECTIBLES[id];
}

export function getCollectiblesBySector(sector: number): CollectibleDefinition[] {
    return Object.values(COLLECTIBLES).filter(c => c.sector === sector);
}
