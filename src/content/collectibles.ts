
export interface CollectibleDefinition {
    id: string;
    sector: number;
    index: number;
    modelType: 'phone' | 'pacifier' | 'axe' | 'scarf' | 'jacket' | 'badge' | 'diary' | 'ring' | 'teddy';
}

export const COLLECTIBLES: Record<string, CollectibleDefinition> = {
    // Sector 0
    's0_collectible_1': {
        id: 's0_collectible_1',
        sector: 0,
        index: 0,
        modelType: 'phone'
    },
    's0_collectible_2': {
        id: 's0_collectible_2',
        sector: 0,
        index: 1,
        modelType: 'axe'
    },

    // Sector 1
    's1_collectible_1': {
        id: 's1_collectible_1',
        sector: 1,
        index: 0,
        modelType: 'pacifier'
    },
    's1_collectible_2': {
        id: 's1_collectible_2',
        sector: 1,
        index: 1,
        modelType: 'teddy'
    },

    // Sector 2
    's2_collectible_1': {
        id: 's2_collectible_1',
        sector: 2,
        index: 0,
        modelType: 'diary'
    },
    's2_collectible_2': {
        id: 's2_collectible_2',
        sector: 2,
        index: 1,
        modelType: 'jacket'
    },

    // Sector 3
    's3_collectible_1': {
        id: 's3_collectible_1',
        sector: 3,
        index: 0,
        modelType: 'ring'
    },
    's3_collectible_2': {
        id: 's3_collectible_2',
        sector: 3,
        index: 1,
        modelType: 'badge'
    },

    // Sector 4 (Playground Test)
    'dummy_badge_test': {
        id: 'dummy_badge_test',
        sector: 4,
        index: 0,
        modelType: 'badge'
    }
};

export function getCollectibleById(id: string): CollectibleDefinition | undefined {
    return COLLECTIBLES[id];
}

export function getCollectiblesBySector(sector: number): CollectibleDefinition[] {
    return Object.values(COLLECTIBLES).filter(c => c.sector === sector);
}
