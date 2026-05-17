import { CollectibleType } from '../game/session/SectorTypes';

export enum CollectibleID {
    // Sector 0 (0x00)
    S0_COLLECTIBLE_1 = (0 << 8) | 0,
    S0_COLLECTIBLE_2 = (0 << 8) | 1,

    // Sector 1 (0x01)
    S1_COLLECTIBLE_1 = (1 << 8) | 0,
    S1_COLLECTIBLE_2 = (1 << 8) | 1,

    // Sector 2 (0x02)
    S2_COLLECTIBLE_1 = (2 << 8) | 0,
    S2_COLLECTIBLE_2 = (2 << 8) | 1,

    // Sector 3 (0x03)
    S3_COLLECTIBLE_1 = (3 << 8) | 0,
    S3_COLLECTIBLE_2 = (3 << 8) | 1,

    // Sector 4 (Playground Test 0x04)
    DUMMY_BADGE_TEST = (4 << 8) | 0
}

export interface CollectibleDefinition {
    id: CollectibleID;
    sector: number;
    index: number;
    modelType: CollectibleType;
}

export const COLLECTIBLES: Record<CollectibleID, CollectibleDefinition> = {
    // Sector 0
    [CollectibleID.S0_COLLECTIBLE_1]: {
        id: CollectibleID.S0_COLLECTIBLE_1,
        sector: 0,
        index: 0,
        modelType: CollectibleType.PHONE
    },
    [CollectibleID.S0_COLLECTIBLE_2]: {
        id: CollectibleID.S0_COLLECTIBLE_2,
        sector: 0,
        index: 1,
        modelType: CollectibleType.AXE
    },

    // Sector 1
    [CollectibleID.S1_COLLECTIBLE_1]: {
        id: CollectibleID.S1_COLLECTIBLE_1,
        sector: 1,
        index: 0,
        modelType: CollectibleType.PACIFIER
    },
    [CollectibleID.S1_COLLECTIBLE_2]: {
        id: CollectibleID.S1_COLLECTIBLE_2,
        sector: 1,
        index: 1,
        modelType: CollectibleType.TEDDY
    },

    // Sector 2
    [CollectibleID.S2_COLLECTIBLE_1]: {
        id: CollectibleID.S2_COLLECTIBLE_1,
        sector: 2,
        index: 0,
        modelType: CollectibleType.DIARY
    },
    [CollectibleID.S2_COLLECTIBLE_2]: {
        id: CollectibleID.S2_COLLECTIBLE_2,
        sector: 2,
        index: 1,
        modelType: CollectibleType.JACKET
    },

    // Sector 3
    [CollectibleID.S3_COLLECTIBLE_1]: {
        id: CollectibleID.S3_COLLECTIBLE_1,
        sector: 3,
        index: 0,
        modelType: CollectibleType.RING
    },
    [CollectibleID.S3_COLLECTIBLE_2]: {
        id: CollectibleID.S3_COLLECTIBLE_2,
        sector: 3,
        index: 1,
        modelType: CollectibleType.BADGE
    },

    // Sector 4 (Playground Test)
    [CollectibleID.DUMMY_BADGE_TEST]: {
        id: CollectibleID.DUMMY_BADGE_TEST,
        sector: 4,
        index: 0,
        modelType: CollectibleType.BADGE
    }
};

export function getCollectibleById(id: CollectibleID): CollectibleDefinition | undefined {
    return COLLECTIBLES[id];
}

export function getCollectiblesBySector(sector: number): CollectibleDefinition[] {
    return Object.values(COLLECTIBLES).filter(c => c.sector === sector);
}

