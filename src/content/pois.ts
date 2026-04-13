
export enum POI_TYPE {
    SMU = 'SMU',
    CHURCH = 'CHURCH',
    CAFE = 'CAFE',
    PIZZERIA = 'PIZZERIA',
    GROCERY_STORE = 'GROCERY_STORE',
    GYM = 'GYM',
    TRAIN_YARD = 'TRAIN_YARD',
    CAMPFIRE = 'CAMPFIRE',
    TRAIN_TUNNEL = 'TRAIN_TUNNEL',
    CAVE_ENTRANCE = 'CAVE_ENTRANCE',
    MOUNTAIN_VAULT = 'MOUNTAIN_VAULT',
    MAST = 'MAST',
    FARM = 'FARM',
    EGG_FARM = 'FARMHOUSE',
    BARN = 'BARN',
    DEALERSHIP = 'DEALERSHIP',
    SCRAPYARD = 'SCRAPYARD'
}

export interface PoiDefinition {
    id: string;
    sector: number;
    index: number;
    type: POI_TYPE;
    displayNameKey: string;
    descriptionKey: string;
    reactionKey: string;
}

export const POIS: Record<string, PoiDefinition> = {
    // Sector 0
    's0_poi_building_on_fire': { id: 's0_poi_building_on_fire', sector: 0, index: 0, type: POI_TYPE.SMU, displayNameKey: 'pois.0.0.title', descriptionKey: 'pois.0.0.description', reactionKey: 'pois.0.0.reaction' },
    's0_poi_church': { id: 's0_poi_church', sector: 0, index: 1, type: POI_TYPE.CHURCH, displayNameKey: 'pois.0.1.title', descriptionKey: 'pois.0.1.description', reactionKey: 'pois.0.1.reaction' },
    's0_poi_cafe': { id: 's0_poi_cafe', sector: 0, index: 2, type: POI_TYPE.CAFE, displayNameKey: 'pois.0.2.title', descriptionKey: 'pois.0.2.description', reactionKey: 'pois.0.2.reaction' },
    's0_poi_pizzeria': { id: 's0_poi_pizzeria', sector: 0, index: 3, type: POI_TYPE.PIZZERIA, displayNameKey: 'pois.0.3.title', descriptionKey: 'pois.0.3.description', reactionKey: 'pois.0.3.reaction' },
    's0_poi_grocery': { id: 's0_poi_grocery', sector: 0, index: 4, type: POI_TYPE.GROCERY_STORE, displayNameKey: 'pois.0.4.title', descriptionKey: 'pois.0.4.description', reactionKey: 'pois.0.4.reaction' },
    's0_poi_gym': { id: 's0_poi_gym', sector: 0, index: 5, type: POI_TYPE.GYM, displayNameKey: 'pois.0.5.title', descriptionKey: 'pois.0.5.description', reactionKey: 'pois.0.5.reaction' },
    's0_poi_train_yard': { id: 's0_poi_train_yard', sector: 0, index: 6, type: POI_TYPE.TRAIN_YARD, displayNameKey: 'pois.0.6.title', descriptionKey: 'pois.0.6.description', reactionKey: 'pois.0.6.reaction' },

    // Sector 1
    's1_poi_campfire': { id: 's1_poi_campfire', sector: 1, index: 0, type: POI_TYPE.CAMPFIRE, displayNameKey: 'pois.1.0.title', descriptionKey: 'pois.1.0.description', reactionKey: 'pois.1.0.reaction' },
    's1_poi_train_tunnel': { id: 's1_poi_train_tunnel', sector: 1, index: 1, type: POI_TYPE.TRAIN_TUNNEL, displayNameKey: 'pois.1.1.title', descriptionKey: 'pois.1.1.description', reactionKey: 'pois.1.1.reaction' },
    's1_poi_cave_entrance': { id: 's1_poi_cave_entrance', sector: 1, index: 2, type: POI_TYPE.CAVE_ENTRANCE, displayNameKey: 'pois.1.2.title', descriptionKey: 'pois.1.2.description', reactionKey: 'pois.1.2.reaction' },
    's1_poi_mountain_vault': { id: 's1_poi_mountain_vault', sector: 1, index: 3, type: POI_TYPE.MOUNTAIN_VAULT, displayNameKey: 'pois.1.3.title', descriptionKey: 'pois.1.3.description', reactionKey: 'pois.1.3.reaction' },

    // Sector 2
    's2_poi_mast': { id: 's2_poi_mast', sector: 2, index: 0, type: POI_TYPE.MAST, displayNameKey: 'pois.2.0.title', descriptionKey: 'pois.2.0.description', reactionKey: 'pois.2.0.reaction' },
    's2_poi_farm': { id: 's2_poi_farm', sector: 2, index: 1, type: POI_TYPE.FARM, displayNameKey: 'pois.2.1.title', descriptionKey: 'pois.2.1.description', reactionKey: 'pois.2.1.reaction' },
    's2_poi_egg_farm': { id: 's2_poi_egg_farm', sector: 2, index: 2, type: POI_TYPE.EGG_FARM, displayNameKey: 'pois.2.2.title', descriptionKey: 'pois.2.2.description', reactionKey: 'pois.2.2.reaction' },
    's2_poi_barn': { id: 's2_poi_barn', sector: 2, index: 3, type: POI_TYPE.BARN, displayNameKey: 'pois.2.3.title', descriptionKey: 'pois.2.3.description', reactionKey: 'pois.2.3.reaction' },

    // Sector 3
    's3_poi_shed': { id: 's3_poi_shed', sector: 3, index: 0, type: POI_TYPE.DEALERSHIP, displayNameKey: 'pois.3.0.title', descriptionKey: 'pois.3.0.description', reactionKey: 'pois.3.0.reaction' },
    's3_poi_scrapyard': { id: 's3_poi_scrapyard', sector: 3, index: 1, type: POI_TYPE.SCRAPYARD, displayNameKey: 'pois.3.1.title', descriptionKey: 'pois.3.1.description', reactionKey: 'pois.3.1.reaction' }
};

export function getPoiById(id: string): PoiDefinition | undefined {
    return POIS[id];
}
