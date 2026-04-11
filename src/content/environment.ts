// --- MaterialType ---
// Used for physics material (footsteps, collisions, sound effects etc.)
export enum MaterialType {
    NONE = 0,
    GENERIC = 1,
    FLESH = 2,
    METAL = 3,
    CONCRETE = 4,
    STONE = 5,
    DIRT = 6,
    GRAVEL = 7,
    ASPHALT = 8,
    WOOD = 9,
    GLASS = 10,
    PLANT = 11,
    SNOW = 12,
    WATER = 13
}
export type MATERIAL_TYPE = MaterialType;

import { SoundID } from '../utils/audio/AudioTypes';

// For footstep sounds
export const FOOTSTEP_MAP: Partial<Record<MATERIAL_TYPE, SoundID>> = {
    [MaterialType.GENERIC]: SoundID.FOOTSTEP_L,
    [MaterialType.SNOW]: SoundID.FOOTSTEP_SNOW,
    [MaterialType.WOOD]: SoundID.FOOTSTEP_WOOD,
    [MaterialType.METAL]: SoundID.FOOTSTEP_METAL,
    [MaterialType.CONCRETE]: SoundID.FOOTSTEP_L,
    [MaterialType.STONE]: SoundID.FOOTSTEP_L,
    [MaterialType.DIRT]: SoundID.FOOTSTEP_DIRT,
    [MaterialType.GRAVEL]: SoundID.FOOTSTEP_GRAVEL,
    [MaterialType.ASPHALT]: SoundID.FOOTSTEP_L,
    [MaterialType.WATER]: SoundID.FOOTSTEP_WATER
};

// For impact sounds
export const IMPACT_MAP: Partial<Record<MATERIAL_TYPE, SoundID>> = {
    [MaterialType.GENERIC]: SoundID.IMPACT_STONE,
    [MaterialType.SNOW]: SoundID.FOOTSTEP_L,
    [MaterialType.WOOD]: SoundID.IMPACT_WOOD,
    [MaterialType.METAL]: SoundID.IMPACT_METAL,
    [MaterialType.CONCRETE]: SoundID.IMPACT_STONE,
    [MaterialType.STONE]: SoundID.IMPACT_STONE,
    [MaterialType.DIRT]: SoundID.IMPACT_STONE,
    [MaterialType.WATER]: SoundID.IMPACT_WATER,
    [MaterialType.FLESH]: SoundID.IMPACT_FLESH
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
    DEAD_TREE = 'DEAD_TREE',
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

