/**
 * Centralized SMI (Small Integer) enums for the Audio and FX systems.
 * These are used to achieve O(1) contiguous array lookups and bypass string hashing.
 */
export const MAX_SOUND_ID = 512;

export enum SoundID {
    NONE = 0,

    // --- UI ---
    UI_HOVER = 1,
    UI_CLICK = 2,
    UI_CONFIRM = 3,
    UI_PICKUP = 4,
    UI_LEVEL_UP = 5,
    UI_CHIME = 6,

    // --- GAMEPLAY / WORLD ---
    FOOTSTEP_L = 10,
    FOOTSTEP_R = 11,
    IMPACT_FLESH = 12,
    IMPACT_METAL = 13,
    IMPACT_WOOD = 14,
    IMPACT_CONCRETE = 15,
    IMPACT_STONE = 16,
    IMPACT_WATER = 105,
    HEAVY_SMASH = 104,
    
    CHEST_OPEN = 17,
    LOOT_SCRAP = 18,
    DOOR_OPEN = 19,
    DOOR_SHUT = 20,
    DOOR_KNOCK = 21,
    
    EXPLOSION = 22,
    GRENADE_IMPACT = 23,
    MOLOTOV_IMPACT = 24,
    FLASHBANG_IMPACT = 25,
    WATER_EXPLOSION = 26,
    WATER_SPLASH = 27,

    // --- WEAPONS ---
    SHOT_PISTOL = 30,
    SHOT_SMG = 31,
    SHOT_RIFLE = 32,
    SHOT_REVOLVER = 33,
    SHOT_SHOTGUN = 34,
    SHOT_MINIGUN = 35,
    SHOT_ARC_CANNON = 36,
    SHOT_FLAMETHROWER = 37,
    SHOT_GRENADE_LAUNCHER = 38,
    
    WEAPON_EMPTY = 39,
    WEAPON_RELOAD = 40,
    WEAPON_SWITCH = 41,

    // --- ENEMIES ---
    ZOMBIE_GROWL_WALKER = 50,
    ZOMBIE_GROWL_RUNNER = 51,
    ZOMBIE_GROWL_TANK = 52,
    ZOMBIE_GROWL_BOMBER = 53,
    
    ZOMBIE_ATTACK_HIT = 54,
    ZOMBIE_ATTACK_BITE = 55,
    ZOMBIE_ATTACK_SMASH = 56,
    ZOMBIE_ATTACK_SCREECH = 57,
    
    ZOMBIE_DEATH_SHOT = 60,
    ZOMBIE_DEATH_EXPLODE = 61,
    ZOMBIE_DEATH_BURN = 62,

    // --- VOICE ---
    VO_PLAYER_HURT = 70,
    VO_PLAYER_DEATH = 71,
    VO_PLAYER_COUGH = 72,

    // --- AMBIENTS
    AMBIENT_WIND = 500,
    AMBIENT_STORM = 501,
    AMBIENT_CAVE = 502,
    AMBIENT_METAL = 503,
    AMBIENT_FIRE = 504,
    AMBIENT_RADIO = 505,

    DASH = 83,

    // --- VEHICLES ---
    VEHICLE_ENGINE_BOAT = 90,
    VEHICLE_ENGINE_CAR = 91,
    VEHICLE_SKID = 92,
    VEHICLE_IMPACT = 93,
    VEHICLE_HORN = 94,

    // --- WILDLIFE ---
    OWL_HOOT = 95,
    BIRD_AMBIENCE = 96,

    // --- MISC COMBAT ---
    BITE = 97,
    PASSIVE_GAINED = 98,
    BUFF_GAINED = 100,
    DEBUFF_GAINED = 101,
    STEAM_HISS = 99,
}

export enum FXID {
    NONE = 0,
    BLOOD_SPLATTER = 1,
    BLOOD_DRIP = 2,
    SPARK = 3,
    SMOKE = 4,
    FIRE_PULSE = 5,
    MUZZLE_FLASH = 6,
    GROUND_IMPACT = 7,
    SHOCKWAVE = 8,
    DASH_TRAIL = 9,
}

// --- MUSIC SMI ENUMS ---
export enum MusicID {
    NONE = 0,
    PROLOGUE_SAD = 1,
    GAMEPLAY_TENSE = 2,
    BOSS_FIGHT = 3,
    CAMP_CALM = 4,
    DEATH_SCREEN = 5
}
