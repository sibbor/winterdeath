/**
 * Centralized SMI (Small Integer) enums for the Audio and FX systems.
 * These are used to achieve O(1) contiguous array lookups and bypass string hashing.
 * * Group allocation intervals:
 * [1 - 39]   : UI Systems
 * [40 - 59]  : General Gameplay & World Interactions
 * [60 - 79]  : Explosions & Elemental Hazards
 * [80 - 119] : Weapons, Fire Modes & Ammunition
 * [120 - 159]: Footstep Materials
 * [160 - 199]: Surface Impact Decal Responses
 * [200 - 249]: Enemy Entities & AI Vocals
 * [250 - 299]: Player System State Vocals
 * [300 - 349]: Vehicles, Machinery & Mechanical Components
 * [350 - 399]: Ambient Environments & Loops
 */
export const MAX_SOUND_ID = 512;

export enum SoundID {
    NONE = 0,

    // --- INTERVAL [1 - 39]: SYSTEM USER INTERFACE ---
    UI_HOVER = 1,
    UI_CLICK = 2,
    UI_CONFIRM = 3,
    UI_PICKUP = 4,
    LEVEL_UP = 5,
    UI_UPGRADE = 6,
    UI_OPEN_SCREEN = 7,
    UI_CLOSE_SCREEN = 8,
    UI_CHIME = 9,
    UI_VICTORY = 10,
    UI_DEFEAT = 11,
    UI_DISCOVERY = 12,
    UI_CHALLENGE = 13,

    // --- INTERVAL [40 - 59]: GENERAL GAMEPLAY & WORLD ---
    CHEST_OPEN = 40,
    LOOT_SCRAP = 41,
    DOOR_OPEN = 42,
    DOOR_SHUT = 43,
    DOOR_KNOCK = 44,
    OWL_HOOT = 45,
    BIRD_AMBIENCE = 46,

    // --- INTERVAL [60 - 79]: EXPLOSIONS & ELEMENTAL HAZARDS ---
    EXPLOSION = 60,
    GRENADE_IMPACT = 61,
    MOLOTOV_IMPACT = 62,
    FLASHBANG_IMPACT = 63,
    WATER_EXPLOSION = 64,
    WATER_SPLASH = 65,

    // --- INTERVAL [80 - 119]: WEAPONS, BALLISTICS & SYSTEMS ---
    SHOT_PISTOL = 80,
    SHOT_SMG = 81,
    SHOT_RIFLE = 82,
    SHOT_REVOLVER = 83,
    SHOT_SHOTGUN = 84,
    SHOT_MINIGUN = 85,
    SHOT_ARC_CANNON = 86,
    SHOT_FLAMETHROWER = 87,
    WEAPON_EMPTY = 88,
    WEAPON_RELOAD = 89,
    WEAPON_SWITCH = 90,
    PASSIVE_GAINED = 91,
    BUFF_GAINED = 92,
    DEBUFF_GAINED = 93,
    STEAM_HISS = 94,
    HEARTBEAT = 95,
    DODGE = 96,

    // --- INTERVAL [120 - 159]: GAMEPLAY FOOTSTEPS ---
    FOOTSTEP_SNOW = 120,
    FOOTSTEP_METAL = 121,
    FOOTSTEP_WOOD = 122,
    FOOTSTEP_WATER = 123,
    FOOTSTEP_DIRT = 124,
    FOOTSTEP_GRAVEL = 125,
    FOOTSTEP_VEGETATION = 126,

    // --- INTERVAL [160 - 199]: GAMEPLAY SURFACE IMPACTS ---
    IMPACT_FLESH = 160,
    IMPACT_METAL = 161,
    IMPACT_WOOD = 162,
    IMPACT_CONCRETE = 163,
    IMPACT_STONE = 164,
    IMPACT_WATER = 165,

    // --- INTERVAL [200 - 249]: ENEMY ENTITIES & AI VOCALS ---
    ZOMBIE_GROWL_WALKER = 200,
    ZOMBIE_GROWL_RUNNER = 201,
    ZOMBIE_GROWL_TANK = 202,
    ZOMBIE_GROWL_BLOATER = 203,
    ZOMBIE_ATTACK_HIT = 204,
    ZOMBIE_ATTACK_BITE = 205,
    ZOMBIE_ATTACK_SMASH = 206,
    ZOMBIE_ATTACK_SCREECH = 207,
    ZOMBIE_DEATH_SHOT = 208,
    ZOMBIE_DEATH_EXPLODE = 209,
    ZOMBIE_DEATH_BURN = 210,

    // --- INTERVAL [250 - 299]: PLAYER & NPC STATE VOCALS ---
    VO_PLAYER_HURT = 250,
    VO_PLAYER_DEATH = 251,
    VO_PLAYER_COUGH = 252,
    VO_FAMILY_CRY = 253,
    VO_FAMILY_CHEER = 254,
    VO_FAMILY_KISS = 255,

    // --- INTERVAL [300 - 349]: VEHICLES & MACHINERY ---
    VEHICLE_ENGINE_BOAT = 300,
    VEHICLE_ENGINE_CAR = 301,
    VEHICLE_SKID = 302,
    VEHICLE_IMPACT = 303,

    // --- INTERVAL [350 - 399]: ENVIRONMENTAL LOOP AMBIENTS ---
    AMBIENT_WIND = 350,
    AMBIENT_STORM = 351,
    AMBIENT_CAVE = 352,
    AMBIENT_METAL = 353,
    AMBIENT_FIRE = 354,
    RADIO = 355,
    AMBIENT_FOREST = 356
}

export enum ToneType {
    SINE = 0,
    SQUARE = 1,
    SAWTOOTH = 2,
    TRIANGLE = 3
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
    DASH_TRAIL = 9
}

export enum MusicID {
    NONE = 0,
    PROLOGUE = 1,
    EPILOGUE = 2,
    GAMEPLAY_TENSE = 3,
    BOSS_FIGHT = 4,
    CAMP_CALM = 5,
    DEATH_SCREEN = 6
}