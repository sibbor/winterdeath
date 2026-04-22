/**
 * Strictly typed numeric enum for engine systems.
 * Use explicit integers to ensure dense array allocation in WinterEngine.
 */
export enum SystemID {
    NONE = 0,

    // Core Engine
    CAMERA = 1, INPUT = 2, LIGHT = 3, WIND = 4, WEATHER = 5,
    FOG = 6, WATER = 7, PERFORMANCE_MONITOR = 8, HUD = 9,
    ASSET_PRELOADER = 10,

    // World & Sector
    SECTOR = 11, SPATIAL_GRID = 12, TRIGGER_HANDLER = 13,
    NAVIGATION = 14, WORLD_LOOT = 15, OCCLUSION = 16, FX = 17,

    // Player
    PLAYER_STATS = 20, PLAYER_MOVEMENT = 21, PLAYER_COMBAT = 22, PLAYER_INTERACTION = 23,

    // Combat & Enemies
    PROJECTILE = 30, WEAPON_HANDLER = 31, ENEMY_MANAGER = 33,
    ENEMY_DETECTION = 34, DAMAGE_NUMBER = 35, DAMAGE_TRACKER = 36, DEATH = 37,
    ENEMY_AI = 38, ENEMY_SYSTEM = 39,
    
    // Vehicles
    VEHICLE_MANAGER = 40, VEHICLE_MOVEMENT = 41,

    // Misc
    FAMILY = 50, CINEMATIC = 51, CAMP_EFFECT_MANAGER = 52,
    FOOTPRINT = 54,

    CAMP_CHATTER = 61, FAMILY_ANIMATION = 62,
    
    COUNT = 70
}

export const getSystemName = (id: SystemID): string => {
    return SystemID[id] || 'UNKNOWN_SYSTEM';
};