
import { PlayerStats, SectorStats, WeaponType, WeaponCategory } from '../types';
import { LEVEL_CAP, WEAPONS } from '../content/constants';

/**
 * Aggregates sector performance into overall player statistics.
 * Handles XP leveling, scrap collection, and UNIQUE map-based SP rewards.
 */
export const aggregateStats = (
    prevStats: PlayerStats,
    sectorStats: SectorStats,
    died: boolean,
    aborted: boolean,
    newUniqueAchievements: number = 0 // Number of NEW Boss + Family rewards to award
): PlayerStats => {
    const s = { ...prevStats };

    // Ensure lists exist
    s.collectiblesFound = s.collectiblesFound || [];
    s.cluesFound = s.cluesFound || [];
    s.killsByType = { ...(s.killsByType || {}) };

    // 1. Sector Completion Progress
    if (!died && !aborted) {
        s.sectorsCompleted = (s.sectorsCompleted || 0) + 1;
    }

    // 2. Resource Collection
    s.scrap = (s.scrap || 0) + (sectorStats.scrapLooted || 0);
    s.totalScrapCollected = (s.totalScrapCollected || 0) + (sectorStats.scrapLooted || 0);

    // 3. Combat & Performance
    const sectorKills = (Object.values(sectorStats.killsByType || {}) as number[]).reduce((a, b) => a + b, 0);
    s.kills = (s.kills || 0) + sectorKills;
    for (const [type, count] of Object.entries(sectorStats.killsByType || {})) {
        s.killsByType[type] = (s.killsByType[type] || 0) + (count as number);
    }
    s.totalBulletsFired = (s.totalBulletsFired || 0) + (sectorStats.shotsFired || 0);
    s.totalBulletsHit = (s.totalBulletsHit || 0) + (sectorStats.shotsHit || 0);
    s.totalThrowablesThrown = (s.totalThrowablesThrown || 0) + (sectorStats.throwablesThrown || 0);
    s.totalDamageDealt = (s.totalDamageDealt || 0) + (sectorStats.damageDealt || 0);
    s.totalDamageTaken = (s.totalDamageTaken || 0) + (sectorStats.damageTaken || 0);
    s.totalDistanceTraveled = (s.totalDistanceTraveled || 0) + (sectorStats.distanceTraveled || 0);

    if (died) {
        s.deaths = (s.deaths || 0) + 1;
    }

    // 4. Scavenging Objectives
    s.chestsOpened = (s.chestsOpened || 0) + (sectorStats.chestsOpened || 0);
    s.bigChestsOpened = (s.bigChestsOpened || 0) + (sectorStats.bigChestsOpened || 0);

    // 5. Discovery & Unique Items (SP Rewards)
    if (sectorStats.cluesFound && sectorStats.cluesFound.length > 0) {
        const newUniqueClues = sectorStats.cluesFound.filter(c => !s.cluesFound.includes(c));
        s.cluesFound = [...s.cluesFound, ...newUniqueClues];
    }

    // SP for Collectibles
    if (sectorStats.collectiblesFound && sectorStats.collectiblesFound.length > 0) {
        const newUnique = sectorStats.collectiblesFound.filter(c => !s.collectiblesFound.includes(c));
        s.collectiblesFound = [...s.collectiblesFound, ...newUnique];

        // Award SP for each new unique collectible
        s.skillPoints += newUnique.length;
        s.totalSkillPointsEarned += newUnique.length;
    }

    // 6. Mission Achievement SP (Boss & Family)
    // Awarded based on brand new map completions passed from App.tsx
    if (newUniqueAchievements > 0) {
        s.skillPoints += newUniqueAchievements;
        s.totalSkillPointsEarned += newUniqueAchievements;
    }

    // 7. Experience & Leveling
    let gainedXp = (sectorStats.xpGained || 0);
    while (gainedXp > 0 && s.level < LEVEL_CAP) {
        const needed = s.nextLevelXp - s.currentXp;
        if (gainedXp >= needed) {
            s.level++;
            s.skillPoints++;
            s.totalSkillPointsEarned++;
            gainedXp -= needed;
            s.currentXp = 0;
            s.nextLevelXp = Math.floor(s.nextLevelXp * 1.2);
        } else {
            s.currentXp += gainedXp;
            gainedXp = 0;
        }
    }

    return s;
};

export const randomizeLoadout = () => {
    const primaries = Object.values(WEAPONS).filter(w => w.category === WeaponCategory.PRIMARY).map(w => w.name);
    const secondaries = Object.values(WEAPONS).filter(w => w.category === WeaponCategory.SECONDARY).map(w => w.name);
    const throwables = Object.values(WEAPONS).filter(w => w.category === WeaponCategory.THROWABLE).map(w => w.name);

    return {
        primary: primaries[Math.floor(Math.random() * primaries.length)],
        secondary: secondaries[Math.floor(Math.random() * secondaries.length)],
        throwable: throwables[Math.floor(Math.random() * throwables.length)]
    };
};
