
import { PlayerStats, SectorStats, WeaponType, WeaponCategory } from '../types';
import { LEVEL_CAP, WEAPONS } from '../content/constants';

export const aggregateStats = (prevStats: PlayerStats, sectorStats: SectorStats, died: boolean, aborted: boolean): PlayerStats => {
    const s = { ...prevStats };
    if (!died && !aborted) s.sectorsCompleted += 1;
    s.scrap += sectorStats.scrapLooted;
    s.totalScrapCollected += sectorStats.scrapLooted;
    const missionKills = (Object.values(sectorStats.killsByType) as number[]).reduce((a, b) => a + b, 0);
    s.kills += missionKills;
    for (const [type, count] of Object.entries(sectorStats.killsByType)) {
        s.killsByType[type] = (s.killsByType[type] || 0) + (count as number);
    }
    s.totalBulletsFired += sectorStats.shotsFired;
    s.totalBulletsHit = (s.totalBulletsHit || 0) + (sectorStats.shotsHit || 0);
    s.totalThrowablesThrown = (s.totalThrowablesThrown || 0) + (sectorStats.throwablesThrown || 0);

    s.totalDamageDealt += sectorStats.damageDealt;
    s.totalDamageTaken += sectorStats.damageTaken;
    if (died) s.deaths += 1;
    s.chestsOpened = (s.chestsOpened || 0) + (sectorStats.chestsOpened || 0);
    s.bigChestsOpened = (s.bigChestsOpened || 0) + (sectorStats.bigChestsOpened || 0);
    s.totalDistanceTraveled = (s.totalDistanceTraveled || 0) + (sectorStats.distanceTraveled || 0);

    if (sectorStats.cluesFound && sectorStats.cluesFound.length > 0) {
        const currentClues = s.cluesFound || [];
        const newUniqueClues = sectorStats.cluesFound.filter(c => !currentClues.includes(c));
        s.cluesFound = [...currentClues, ...newUniqueClues];
    }

    if (sectorStats.seenEnemies && sectorStats.seenEnemies.length > 0) {
        const current = s.seenEnemies || [];
        const newUnique = sectorStats.seenEnemies.filter(c => !current.includes(c));
        s.seenEnemies = [...current, ...newUnique];
    }

    if (sectorStats.seenBosses && sectorStats.seenBosses.length > 0) {
        const current = s.seenBosses || [];
        const newUnique = sectorStats.seenBosses.filter(c => !current.includes(c));
        s.seenBosses = [...current, ...newUnique];
    }

    if (sectorStats.visitedPOIs && sectorStats.visitedPOIs.length > 0) {
        const current = s.visitedPOIs || [];
        const newUnique = sectorStats.visitedPOIs.filter(c => !current.includes(c));
        s.visitedPOIs = [...current, ...newUnique];
    }

    let gainedXp = sectorStats.xpGained + sectorStats.bonusXp;
    while (gainedXp > 0 && s.level < LEVEL_CAP) {
        const needed = s.nextLevelXp - s.currentXp;
        if (gainedXp >= needed) {
            s.level++;
            s.skillPoints++; // Award SP on Level Up
            s.totalSkillPointsEarned++;
            gainedXp -= needed; s.currentXp = 0;
            s.nextLevelXp = Math.floor(s.nextLevelXp * 1.2);
        } else {
            s.currentXp += gainedXp; gainedXp = 0;
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
