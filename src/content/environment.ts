// --- MaterialType ---
// Used for physics material (footsteps, collisions, sound effects etc.)
export const MaterialType = {
    NONE: 'none',
    GENERIC: 'generic',
    FLESH: 'flesh',
    METAL: 'metal',
    CONCRETE: 'concrete',
    STONE: 'stone',
    DIRT: 'dirt',
    GRAVEL: 'gravel',
    ASPHALT: 'asphalt',
    WOOD: 'wood',
    GLASS: 'glass',
    PLANT: 'plant',
    SNOW: 'snow',
    WATER: 'water'
} as const;
export type MATERIAL_TYPE = typeof MaterialType[keyof typeof MaterialType];

// For footstep sounds
export const FOOTSTEP_MAP: Partial<Record<MATERIAL_TYPE, string>> = {
    [MaterialType.GENERIC]: 'step_generic',
    [MaterialType.SNOW]: 'step_snow',
    [MaterialType.WOOD]: 'step_wood',
    [MaterialType.METAL]: 'step_metal',
    [MaterialType.CONCRETE]: 'step',
    [MaterialType.STONE]: 'step',
    [MaterialType.DIRT]: 'step_dirt',
    [MaterialType.GRAVEL]: 'step_gravel',
    [MaterialType.ASPHALT]: 'step_asphalt',
    [MaterialType.WATER]: 'step_water'
};

// For impact sounds
export const IMPACT_MAP: Partial<Record<MATERIAL_TYPE, string>> = {
    [MaterialType.GENERIC]: 'impact_generic',
    [MaterialType.SNOW]: 'impact_snow',
    [MaterialType.WOOD]: 'impact_wood',
    [MaterialType.METAL]: 'impact_metal',
    [MaterialType.CONCRETE]: 'impact_concrete',
    [MaterialType.STONE]: 'impact_stone',
    [MaterialType.DIRT]: 'impact_dirt',
    [MaterialType.WATER]: 'impact_water',
    [MaterialType.FLESH]: 'impact_flesh'
};

// WeatherType
// Used by the weather system (and sectors definition)
export type WeatherType = 'none' | 'snow' | 'rain' | 'ash' | 'ember';

/**
 * Standardized vegetation types for environment generation
 */
export enum VEGETATION_TYPE {
    PINE = 'PINE',
    SPRUCE = 'SPRUCE',
    OAK = 'OAK',
    BIRCH = 'BIRCH',
    DEAD = 'DEAD',
    GRASS = 'GRASS',
    BUSH = 'BUSH',
    SUNFLOWER = 'SUNFLOWER',
    FLOWER = 'FLOWER',
    WHEAT = 'WHEAT'
}

/**
 * Standardized prop types for environment generation
 */
export enum PROP_TYPE {
    ROCK = 'ROCK',
    DEBRIS = 'DEBRIS',
    HEDGE = 'HEDGE',
    FENCE_WOOD = 'FENCE_WOOD',
    STONE_WALL = 'STONE_WALL',
    MESH_FENCE = 'MESH_FENCE'
}

