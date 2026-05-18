/**
 * Strictly typed numeric enum for engine systems.
 * Use explicit integers to ensure dense array allocation in WinterEngine.
 */
export enum SystemID {
    NONE = 0,

    // Sector (Core Game Loop & State)
    SECTOR = 1,
    CINEMATIC = 2,
    HUD = 3,
    PERFORMANCE_MONITOR = 4,
    ASSET_PRELOADER = 5,

    // Environmental (Atmosphere & Materials)
    ENVIRONMENT_MANAGER = 6,
    SKY = 7,
    WIND = 8,
    WEATHER = 9,
    FOG = 10,
    WATER = 11,
    GROUND = 12,
    LIGHT = 13,

    // Sector & World (Spatial & Physics Core)
    CAMERA = 14,
    INPUT = 15,
    SPATIAL_GRID = 16,
    WORLD_STREAMER = 17,
    NAVIGATION = 18,
    OCCLUSION = 19,
    TRIGGER_HANDLER = 20,
    TRIGGER_SYSTEM = 21,
    LOOT = 22,
    FX = 23,
    PARTICLE = 24,
    FOOTPRINT = 25,

    // Player & Family (Movement, Progression & Followers)
    PLAYER_STATS = 26,
    PLAYER_MOVEMENT = 27,
    PLAYER_COMBAT = 28,
    INTERACTION = 29,
    PERK_SYSTEM = 30,
    FAMILY = 31,

    // Vehicles
    VEHICLE_MANAGER = 32,
    VEHICLE_MOVEMENT = 33,

    // Combat & Weapon (Balancing & Telemetry)
    WEAPON_HANDLER = 34,
    PROJECTILE = 35,
    CHALLENGE_TRACKER = 36,
    DAMAGE_NUMBER = 37,
    DAMAGE_TRACKER = 38,

    // Enemies (Threats & AI Behavior)
    ENEMY_MANAGER = 39,
    ENEMY_SYSTEM = 40,
    ENEMY_AI = 41,
    ENEMY_DETECTION = 42,
    DEATH = 43,

    // Camp (Safe Zone Subsystems)
    CAMP_EFFECT_MANAGER = 44,
    CAMP_CHATTER = 45,
    CAMP_FAMILY_ANIMATION = 46,

    COUNT = 47
}

export const getSystemName = (id: SystemID): string => {
    return SystemID[id] || 'UNKNOWN_SYSTEM';
};
