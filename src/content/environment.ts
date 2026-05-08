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
    [MaterialType.GENERIC]: SoundID.FOOTSTEP_SNOW,
    [MaterialType.SNOW]: SoundID.FOOTSTEP_SNOW,
    [MaterialType.WOOD]: SoundID.FOOTSTEP_WOOD,
    [MaterialType.METAL]: SoundID.FOOTSTEP_METAL,
    [MaterialType.CONCRETE]: SoundID.FOOTSTEP_SNOW,
    [MaterialType.STONE]: SoundID.FOOTSTEP_SNOW,
    [MaterialType.DIRT]: SoundID.FOOTSTEP_DIRT,
    [MaterialType.GRAVEL]: SoundID.FOOTSTEP_GRAVEL,
    [MaterialType.ASPHALT]: SoundID.FOOTSTEP_SNOW,
    [MaterialType.WATER]: SoundID.FOOTSTEP_WATER,
    [MaterialType.PLANT]: SoundID.FOOTSTEP_VEGETATION
};

// For impact sounds
export const IMPACT_MAP: Partial<Record<MATERIAL_TYPE, SoundID>> = {
    [MaterialType.GENERIC]: SoundID.IMPACT_STONE,
    [MaterialType.SNOW]: SoundID.NONE,
    [MaterialType.WOOD]: SoundID.IMPACT_WOOD,
    [MaterialType.METAL]: SoundID.IMPACT_METAL,
    [MaterialType.CONCRETE]: SoundID.IMPACT_STONE,
    [MaterialType.STONE]: SoundID.IMPACT_STONE,
    [MaterialType.DIRT]: SoundID.IMPACT_STONE,
    [MaterialType.WATER]: SoundID.IMPACT_WATER,
    [MaterialType.FLESH]: SoundID.IMPACT_FLESH
};

/**
 * Standardized vegetation types for environment generation
 */
export enum VEGETATION_TYPE {
    PINE = 0,
    SPRUCE = 1,
    OAK = 2,
    BIRCH = 3,
    DEAD_TREE = 4,
    GRASS = 5,
    BUSH = 6,
    SUNFLOWER = 7,
    FLOWER = 8,
    WHEAT = 9
}

export enum PROP_TYPE {
    ROCK = 0,
    DEBRIS = 1,
    HEDGE = 2,
    FENCE_WOOD = 3,
    STONE_WALL = 4,
    MESH_FENCE = 5
}
