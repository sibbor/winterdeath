/**
 * Challenge System Data Layer
 * 
 * This file defines the static registry for all game challenges.
 * Designed for O(1) lookups and zero heap allocations during runtime.
 */

/**
 * SMI Category Enum
 */
export enum ChallengeCategory {
    WORLD = 0,
    COMBAT = 1,
    WEAPONS = 2,
    TACTICS = 3,
    PLAYER = 4,
    COUNT
}

export const MAX_CHALLENGE_TIER = 3;
export const CP_REWARD_GOLD = 100;

/**
 * SMI Challenge ID Enum
 * Must be sequential for direct array indexing.
 */
export enum ChallengeID {
    // WORLD
    MARATHON = 0,
    SCRAPPER = 1,
    EXPLORER = 2,
    TREASURE_HUNTER = 3,
    SCAVENGER = 4,

    // COMBAT
    ZOMBIE_HUNTER = 5,
    WALKER_EXTERMINATOR = 6,
    KNEE_CAPPER = 7,
    TANK_BUSTER = 8,
    BLOATER_GORE = 9,
    BOSS_SLAYER = 10,

    // WEAPONS/TACTICS
    BRAWLER = 11,
    SHARPSHOOTER = 12,
    GIBBER = 13,
    PYROMANIAC = 14,
    SHOCK_THERAPY = 15,
    DEMOLITION_EXPERT = 16,

    // PLAYER
    SURVIVOR = 17,
    VETERAN = 18,
    UNTOUCHABLE = 19,

    // NUMBER OF CHALLENGES
    COUNT = 20
}

/**
 * Static Challenge Definition
 * targets/cpRewards represent Bronze, Silver, Gold tiers.
 */
export interface ChallengeDef {
    readonly id: ChallengeID;
    readonly categoryId: ChallengeCategory;
    readonly titleKey: string;
    readonly descriptionKey: string;
    readonly targets: ReadonlyArray<number>;
    readonly cpRewards: ReadonlyArray<number>;
}

/**
 * Master Challenge Registry
 * INDEX MUST MATCH ChallengeID ENUM EXACTLY.
 */
export const CHALLENGES: ReadonlyArray<ChallengeDef> = [
    // --- WORLD ---
    {
        id: ChallengeID.MARATHON,
        categoryId: ChallengeCategory.WORLD,
        titleKey: 'challenges.marathon.title',
        descriptionKey: 'challenges.marathon.desc',
        targets: [5000, 21098, 42195],
        cpRewards: [10, 25, 100]
    },
    {
        id: ChallengeID.SCRAPPER,
        categoryId: ChallengeCategory.WORLD,
        titleKey: 'challenges.scrapper.title',
        descriptionKey: 'challenges.scrapper.desc',
        targets: [1000, 5000, 25000],
        cpRewards: [10, 25, 100]
    },
    {
        id: ChallengeID.EXPLORER,
        categoryId: ChallengeCategory.WORLD,
        titleKey: 'challenges.explorer.title',
        descriptionKey: 'challenges.explorer.desc',
        targets: [5, 15, 50],
        cpRewards: [15, 30, 150]
    },
    {
        id: ChallengeID.TREASURE_HUNTER,
        categoryId: ChallengeCategory.WORLD,
        titleKey: 'challenges.treasure_hunter.title',
        descriptionKey: 'challenges.treasure_hunter.desc',
        targets: [10, 50, 200],
        cpRewards: [10, 25, 100]
    },
    {
        id: ChallengeID.SCAVENGER,
        categoryId: ChallengeCategory.WORLD,
        titleKey: 'challenges.scavenger.title',
        descriptionKey: 'challenges.scavenger.desc',
        targets: [100, 500, 2500],
        cpRewards: [5, 15, 50]
    },

    // --- COMBAT ---
    {
        id: ChallengeID.ZOMBIE_HUNTER,
        categoryId: ChallengeCategory.COMBAT,
        titleKey: 'challenges.zombie_hunter.title',
        descriptionKey: 'challenges.zombie_hunter.desc',
        targets: [25, 100, 400],
        cpRewards: [5, 15, 50]
    },
    {
        id: ChallengeID.WALKER_EXTERMINATOR,
        categoryId: ChallengeCategory.COMBAT,
        titleKey: 'challenges.walker_exterminator.title',
        descriptionKey: 'challenges.walker_exterminator.desc',
        targets: [10, 50, 100],
        cpRewards: [15, 50, 150]
    },
    {
        id: ChallengeID.KNEE_CAPPER,
        categoryId: ChallengeCategory.COMBAT,
        titleKey: 'challenges.knee_capper.title',
        descriptionKey: 'challenges.knee_capper.desc',
        targets: [10, 50, 100],
        cpRewards: [15, 50, 150]
    },
    {
        id: ChallengeID.TANK_BUSTER,
        categoryId: ChallengeCategory.COMBAT,
        titleKey: 'challenges.tank_buster.title',
        descriptionKey: 'challenges.tank_buster.desc',
        targets: [5, 15, 30],
        cpRewards: [15, 50, 150]
    },
    {
        id: ChallengeID.BLOATER_GORE,
        categoryId: ChallengeCategory.COMBAT,
        titleKey: 'challenges.bloater_gore.title',
        descriptionKey: 'challenges.bloater_gore.desc',
        targets: [5, 15, 30],
        cpRewards: [15, 50, 150]
    },
    {
        id: ChallengeID.BOSS_SLAYER,
        categoryId: ChallengeCategory.COMBAT,
        titleKey: 'challenges.boss_slayer.title',
        descriptionKey: 'challenges.boss_slayer.desc',
        targets: [1, 4],
        cpRewards: [50, 250]
    },

    // --- WEAPONS ---
    {
        id: ChallengeID.BRAWLER,
        categoryId: ChallengeCategory.WEAPONS,
        titleKey: 'challenges.brawler.title',
        descriptionKey: 'challenges.brawler.desc',
        targets: [5, 25, 50],
        cpRewards: [15, 50, 200]
    },
    {
        id: ChallengeID.SHARPSHOOTER,
        categoryId: ChallengeCategory.WEAPONS,
        titleKey: 'challenges.sharpshooter.title',
        descriptionKey: 'challenges.sharpshooter.desc',
        targets: [10, 25, 50],
        cpRewards: [20, 60, 250]
    },
    {
        id: ChallengeID.GIBBER,
        categoryId: ChallengeCategory.WEAPONS,
        titleKey: 'challenges.gibber.title',
        descriptionKey: 'challenges.gibber.desc',
        targets: [10, 25, 50],
        cpRewards: [15, 40, 150]
    },

    // --- TACTICS ---
    {
        id: ChallengeID.PYROMANIAC,
        categoryId: ChallengeCategory.TACTICS,
        titleKey: 'challenges.pyromaniac.title',
        descriptionKey: 'challenges.pyromaniac.desc',
        targets: [10, 25, 50],
        cpRewards: [15, 40, 150]
    },
    {
        id: ChallengeID.SHOCK_THERAPY,
        categoryId: ChallengeCategory.TACTICS,
        titleKey: 'challenges.shock_therapy.title',
        descriptionKey: 'challenges.shock_therapy.desc',
        targets: [10, 25, 50],
        cpRewards: [15, 40, 150]
    },
    {
        id: ChallengeID.DEMOLITION_EXPERT,
        categoryId: ChallengeCategory.TACTICS,
        titleKey: 'challenges.demolition_expert.title',
        descriptionKey: 'challenges.demolition_expert.desc',
        targets: [10, 25, 50],
        cpRewards: [15, 40, 150]
    },

    // --- PLAYER ---
    {
        id: ChallengeID.SURVIVOR,
        categoryId: ChallengeCategory.PLAYER,
        titleKey: 'challenges.survivor.title',
        descriptionKey: 'challenges.survivor.desc',
        targets: [30, 60, 120],
        cpRewards: [25, 100, 500]
    },
    {
        id: ChallengeID.VETERAN,
        categoryId: ChallengeCategory.PLAYER,
        titleKey: 'challenges.veteran.title',
        descriptionKey: 'challenges.veteran.desc',
        targets: [5, 10, 20],
        cpRewards: [50, 150, 300]
    },
    {
        id: ChallengeID.UNTOUCHABLE,
        categoryId: ChallengeCategory.PLAYER,
        titleKey: 'challenges.untouchable.title',
        descriptionKey: 'challenges.untouchable.desc',
        targets: [5, 10, 20],
        cpRewards: [20, 50, 200]
    }
];
