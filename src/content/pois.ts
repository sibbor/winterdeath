
export enum PoiType {
    SMU = 0,
    CHURCH = 1,
    CAFE = 2,
    PIZZERIA = 3,
    GROCERY_STORE = 4,
    GYM = 5,
    TRAIN_YARD = 6,
    CAMPFIRE = 7,
    TRAIN_TUNNEL = 8,
    CAVE_ENTRANCE = 9,
    MOUNTAIN_VAULT = 10,
    MAST = 11,
    FARM = 12,
    EGG_FARM = 13,
    BARN = 14,
    DEALERSHIP = 15,
    SCRAPYARD = 16
}

export enum PoiID {
    // Sector 0 (0x00)
    S0_BUILDING_ON_FIRE = (0 << 8) | 0,
    S0_CHURCH = (0 << 8) | 1,
    S0_CAFE = (0 << 8) | 2,
    S0_PIZZERIA = (0 << 8) | 3,
    S0_GROCERY = (0 << 8) | 4,
    S0_GYM = (0 << 8) | 5,
    S0_TRAIN_YARD = (0 << 8) | 6,

    // Sector 1 (0x01)
    S1_CAMPFIRE = (1 << 8) | 0,
    S1_TRAIN_TUNNEL = (1 << 8) | 1,
    S1_CAVE_ENTRANCE = (1 << 8) | 2,
    S1_MOUNTAIN_VAULT = (1 << 8) | 3,

    // Sector 2 (0x02)
    S2_MAST = (2 << 8) | 0,
    S2_FARM = (2 << 8) | 1,
    S2_EGG_FARM = (2 << 8) | 2,
    S2_BARN = (2 << 8) | 3,

    // Sector 3 (0x03)
    S3_SHED = (3 << 8) | 0,
    S3_SCRAPYARD = (3 << 8) | 1
}

export interface PoiDefinition {
    id: PoiID;
    sector: number;
    index: number;
    type: PoiType;
    displayNameKey: string;
    descriptionKey: string;
    reactionKey: string;
}

export const POIS: Record<PoiID, PoiDefinition> = {
    // Sector 0
    [PoiID.S0_BUILDING_ON_FIRE]: { id: PoiID.S0_BUILDING_ON_FIRE, sector: 0, index: 0, type: PoiType.SMU, displayNameKey: 'pois.0.0.title', descriptionKey: 'pois.0.0.description', reactionKey: 'pois.0.0.reaction' },
    [PoiID.S0_CHURCH]: { id: PoiID.S0_CHURCH, sector: 0, index: 1, type: PoiType.CHURCH, displayNameKey: 'pois.0.1.title', descriptionKey: 'pois.0.1.description', reactionKey: 'pois.0.1.reaction' },
    [PoiID.S0_CAFE]: { id: PoiID.S0_CAFE, sector: 0, index: 2, type: PoiType.CAFE, displayNameKey: 'pois.0.2.title', descriptionKey: 'pois.0.2.description', reactionKey: 'pois.0.2.reaction' },
    [PoiID.S0_PIZZERIA]: { id: PoiID.S0_PIZZERIA, sector: 0, index: 3, type: PoiType.PIZZERIA, displayNameKey: 'pois.0.3.title', descriptionKey: 'pois.0.3.description', reactionKey: 'pois.0.3.reaction' },
    [PoiID.S0_GROCERY]: { id: PoiID.S0_GROCERY, sector: 0, index: 4, type: PoiType.GROCERY_STORE, displayNameKey: 'pois.0.4.title', descriptionKey: 'pois.0.4.description', reactionKey: 'pois.0.4.reaction' },
    [PoiID.S0_GYM]: { id: PoiID.S0_GYM, sector: 0, index: 5, type: PoiType.GYM, displayNameKey: 'pois.0.5.title', descriptionKey: 'pois.0.5.description', reactionKey: 'pois.0.5.reaction' },
    [PoiID.S0_TRAIN_YARD]: { id: PoiID.S0_TRAIN_YARD, sector: 0, index: 6, type: PoiType.TRAIN_YARD, displayNameKey: 'pois.0.6.title', descriptionKey: 'pois.0.6.description', reactionKey: 'pois.0.6.reaction' },

    // Sector 1
    [PoiID.S1_CAMPFIRE]: { id: PoiID.S1_CAMPFIRE, sector: 1, index: 0, type: PoiType.CAMPFIRE, displayNameKey: 'pois.1.0.title', descriptionKey: 'pois.1.0.description', reactionKey: 'pois.1.0.reaction' },
    [PoiID.S1_TRAIN_TUNNEL]: { id: PoiID.S1_TRAIN_TUNNEL, sector: 1, index: 1, type: PoiType.TRAIN_TUNNEL, displayNameKey: 'pois.1.1.title', descriptionKey: 'pois.1.1.description', reactionKey: 'pois.1.1.reaction' },
    [PoiID.S1_CAVE_ENTRANCE]: { id: PoiID.S1_CAVE_ENTRANCE, sector: 1, index: 2, type: PoiType.CAVE_ENTRANCE, displayNameKey: 'pois.1.2.title', descriptionKey: 'pois.1.2.description', reactionKey: 'pois.1.2.reaction' },
    [PoiID.S1_MOUNTAIN_VAULT]: { id: PoiID.S1_MOUNTAIN_VAULT, sector: 1, index: 3, type: PoiType.MOUNTAIN_VAULT, displayNameKey: 'pois.1.3.title', descriptionKey: 'pois.1.3.description', reactionKey: 'pois.1.3.reaction' },

    // Sector 2
    [PoiID.S2_MAST]: { id: PoiID.S2_MAST, sector: 2, index: 0, type: PoiType.MAST, displayNameKey: 'pois.2.0.title', descriptionKey: 'pois.2.0.description', reactionKey: 'pois.2.0.reaction' },
    [PoiID.S2_FARM]: { id: PoiID.S2_FARM, sector: 2, index: 1, type: PoiType.FARM, displayNameKey: 'pois.2.1.title', descriptionKey: 'pois.2.1.description', reactionKey: 'pois.2.1.reaction' },
    [PoiID.S2_EGG_FARM]: { id: PoiID.S2_EGG_FARM, sector: 2, index: 2, type: PoiType.EGG_FARM, displayNameKey: 'pois.2.2.title', descriptionKey: 'pois.2.2.description', reactionKey: 'pois.2.2.reaction' },
    [PoiID.S2_BARN]: { id: PoiID.S2_BARN, sector: 2, index: 3, type: PoiType.BARN, displayNameKey: 'pois.2.3.title', descriptionKey: 'pois.2.3.description', reactionKey: 'pois.2.3.reaction' },

    // Sector 3
    [PoiID.S3_SHED]: { id: PoiID.S3_SHED, sector: 3, index: 0, type: PoiType.DEALERSHIP, displayNameKey: 'pois.3.0.title', descriptionKey: 'pois.3.0.description', reactionKey: 'pois.3.0.reaction' },
    [PoiID.S3_SCRAPYARD]: { id: PoiID.S3_SCRAPYARD, sector: 3, index: 1, type: PoiType.SCRAPYARD, displayNameKey: 'pois.3.1.title', descriptionKey: 'pois.3.1.description', reactionKey: 'pois.3.1.reaction' }
};

export function getPoiById(id: PoiID): PoiDefinition | undefined {
    return POIS[id];
}
