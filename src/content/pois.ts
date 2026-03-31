
export interface PoiDefinition {
    id: string;
    sector: number;
    index: number;
}

export const POIS: Record<string, PoiDefinition> = {
    // Sector 1
    's1_poi_building_on_fire': { id: 's1_poi_building_on_fire', sector: 0, index: 0 },
    's1_poi_church': { id: 's1_poi_church', sector: 0, index: 1 },
    's1_poi_cafe': { id: 's1_poi_cafe', sector: 0, index: 2 },
    's1_poi_pizzeria': { id: 's1_poi_pizzeria', sector: 0, index: 3 },
    's1_poi_grocery': { id: 's1_poi_grocery', sector: 0, index: 4 },
    's1_poi_gym': { id: 's1_poi_gym', sector: 0, index: 5 },
    's1_poi_train_yard': { id: 's1_poi_train_yard', sector: 0, index: 6 },

    // Sector 2
    's2_poi_campfire': { id: 's2_poi_campfire', sector: 1, index: 0 },
    's2_poi_train_tunnel': { id: 's2_poi_train_tunnel', sector: 1, index: 1 },
    's2_poi_cave_entrance': { id: 's2_poi_cave_entrance', sector: 1, index: 2 },
    's2_poi_mountain_vault': { id: 's2_poi_mountain_vault', sector: 1, index: 3 },

    // Sector 3
    's3_poi_mast': { id: 's3_poi_mast', sector: 2, index: 0 },
    's3_poi_farm': { id: 's3_poi_farm', sector: 2, index: 1 },
    's3_poi_farmhouse': { id: 's3_poi_farmhouse', sector: 2, index: 2 },
    's3_poi_barn': { id: 's3_poi_barn', sector: 2, index: 3 },

    // Sector 4
    's4_poi_shed': { id: 's4_poi_shed', sector: 3, index: 0 },
    's4_poi_scrapyard': { id: 's4_poi_scrapyard', sector: 3, index: 1 }
};

export function getPoiById(id: string): PoiDefinition | undefined {
    return POIS[id];
}
