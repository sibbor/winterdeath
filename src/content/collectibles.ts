import { CollectibleModelType } from '../game/session/SectorTypes';

export interface CollectibleDefinition {
    id: string;
    sector: number;
    index: number;
    modelType: CollectibleModelType;
}

export const COLLECTIBLES: Record<string, CollectibleDefinition> = {
    // Sector 0
    's0_collectible_1': {
        id: 's0_collectible_1',
        sector: 0,
        index: 0,
        modelType: CollectibleModelType.PHONE
    },
    's0_collectible_2': {
        id: 's0_collectible_2',
        sector: 0,
        index: 1,
        modelType: CollectibleModelType.AXE
    },

    // Sector 1
    's1_collectible_1': {
        id: 's1_collectible_1',
        sector: 1,
        index: 0,
        modelType: CollectibleModelType.PACIFIER
    },
    's1_collectible_2': {
        id: 's1_collectible_2',
        sector: 1,
        index: 1,
        modelType: CollectibleModelType.TEDDY
    },

    // Sector 2
    's2_collectible_1': {
        id: 's2_collectible_1',
        sector: 2,
        index: 0,
        modelType: CollectibleModelType.DIARY
    },
    's2_collectible_2': {
        id: 's2_collectible_2',
        sector: 2,
        index: 1,
        modelType: CollectibleModelType.JACKET
    },

    // Sector 3
    's3_collectible_1': {
        id: 's3_collectible_1',
        sector: 3,
        index: 0,
        modelType: CollectibleModelType.RING
    },
    's3_collectible_2': {
        id: 's3_collectible_2',
        sector: 3,
        index: 1,
        modelType: CollectibleModelType.BADGE
    },

    // Sector 4 (Playground Test)
    'dummy_badge_test': {
        id: 'dummy_badge_test',
        sector: 4,
        index: 0,
        modelType: CollectibleModelType.BADGE
    }
};

export function getCollectibleById(id: string): CollectibleDefinition | undefined {
    return COLLECTIBLES[id];
}

export function getCollectiblesBySector(sector: number): CollectibleDefinition[] {
    return Object.values(COLLECTIBLES).filter(c => c.sector === sector);
}
