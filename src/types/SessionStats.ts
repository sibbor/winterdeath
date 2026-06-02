/**
 * SessionStats Interface
 * Tracks temporary gameplay statistics accrued exclusively during the current sector session.
 * Initialized to zero at the beginning of each sector run, and aggregated into CareerStats upon completion.
 */
export interface SessionStats {
    kills: number;
    damageDealt: number;
    damageTaken: number;
    timePlayed: number;
    timeElapsed: number;
    accuracy: number;
    itemsCollected: number;
    scrapLooted: number;
    shotsFired: number;
    shotsHit: number;
    throwablesThrown: number;
    distanceTraveled: number;
    score: number;
    bossDamageDealt: number;
    bossDamageTaken: number;
    chestsOpened: number;
    bigChestsOpened: number;

    maxKillstreak: number;
    engagementDistSqKills: number;

    // --- SESSION ANALYTICS ---
    dodges: number;
    rushes: number;
    rushDistance: number;
    buffTime: number;
    debuffsResisted: number;
    crisisSaves: number;
    deaths: number;
    gibbedEnemies: number;
    uniqueEnemiesHitByExplosives: number;

    // --- WEAPON PERFORMANCE BUFFERS ---
    weaponKills: Float64Array;
    weaponDamageDealt: Float64Array;
    weaponShotsFired: Float64Array;
    weaponShotsHit: Float64Array;
    weaponTimeActive: Float64Array;
    weaponEngagementDistSq: Float64Array;

    // --- PERK PERFORMANCE BUFFERS ---
    perkTimesGained: Float64Array;
    perkDamageAbsorbed: Float64Array;
    perkDamageDealt: Float64Array;
    perkDebuffsCleansed: Float64Array;

    // --- ENEMY STATS BUFFERS ---
    enemyKills: Float64Array;
    enemyDeaths: Float64Array;
    incomingDamageBuffer: Float64Array;

    activePassives: Int32Array;
    activePassivesCount: number;
    activeBuffs: Int32Array;
    activeBuffsCount: number;
    activeDebuffs: Int32Array;
    activeDebuffsCount: number;

    discoveredClues: any[];
    discoveredPois: string[];
    discoveredZombies: number[];
    discoveredBosses: number[];
    xpGained: number;
    spGained: number;
    killerType?: number;
    killingBlowWeapon?: number;
    killingBlowSource?: number;
    discoveredCollectibles: string[];
    aborted: boolean;
    familyFound: boolean;
    familyExtracted: boolean;
    isExtraction: boolean;
    discoveredPerksMap: Uint8Array;
}
