
import { PlayerStats, MissionStats, WeaponType, WeaponCategory } from '../types';
import { LEVEL_CAP, WEAPONS } from '../content/constants';

export const aggregateStats = (prevStats: PlayerStats, missionStats: MissionStats, died: boolean, aborted: boolean): PlayerStats => {
    const s = { ...prevStats };
    if (!died && !aborted) s.missionsCompleted += 1;
    s.scrap += missionStats.scrapLooted;
    s.totalScrapCollected += missionStats.scrapLooted;
    const missionKills = (Object.values(missionStats.killsByType) as number[]).reduce((a, b) => a + b, 0);
    s.kills += missionKills;
    for (const [type, count] of Object.entries(missionStats.killsByType)) {
        s.killsByType[type] = (s.killsByType[type] || 0) + (count as number);
    }
    s.totalBulletsFired += missionStats.shotsFired;
    s.totalBulletsHit = (s.totalBulletsHit || 0) + (missionStats.shotsHit || 0);
    s.totalThrowablesThrown = (s.totalThrowablesThrown || 0) + (missionStats.throwablesThrown || 0);

    s.totalDamageDealt += missionStats.damageDealt;
    s.totalDamageTaken += missionStats.damageTaken;
    if (died) s.deaths += 1;
    s.chestsOpened = (s.chestsOpened || 0) + (missionStats.chestsOpened || 0);
    s.bigChestsOpened = (s.bigChestsOpened || 0) + (missionStats.bigChestsOpened || 0);
    s.totalDistanceTraveled = (s.totalDistanceTraveled || 0) + (missionStats.distanceTraveled || 0);

    if (missionStats.cluesFound && missionStats.cluesFound.length > 0) {
        const currentClues = s.cluesFound || [];
        const newUniqueClues = missionStats.cluesFound.filter(c => !currentClues.includes(c));
        s.cluesFound = [...currentClues, ...newUniqueClues];
    }

    if (missionStats.seenEnemies && missionStats.seenEnemies.length > 0) {
        const current = s.seenEnemies || [];
        const newUnique = missionStats.seenEnemies.filter(c => !current.includes(c));
        s.seenEnemies = [...current, ...newUnique];
    }

    if (missionStats.seenBosses && missionStats.seenBosses.length > 0) {
        const current = s.seenBosses || [];
        const newUnique = missionStats.seenBosses.filter(c => !current.includes(c));
        s.seenBosses = [...current, ...newUnique];
    }

    if (missionStats.visitedPOIs && missionStats.visitedPOIs.length > 0) {
        const current = s.visitedPOIs || [];
        const newUnique = missionStats.visitedPOIs.filter(c => !current.includes(c));
        s.visitedPOIs = [...current, ...newUnique];
    }

    let gainedXp = missionStats.xpGained + missionStats.bonusXp;
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
