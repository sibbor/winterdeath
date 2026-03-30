import { PlayerStats } from '../../entities/player/PlayerTypes';
import { SectorStats } from '../../game/session/SessionTypes';
import { LEVEL_CAP } from '../../content/constants';

/**
 * Aggregates sector performance into overall player statistics.
 * Handles XP leveling, scrap collection, and UNIQUE map-based SP rewards.
 * Optimized for minimal GC allocation during level transitions.
 */
export const aggregateStats = (
    prevStats: PlayerStats,
    sectorStats: SectorStats,
    died: boolean,
    aborted: boolean,
    newUniqueAchievements: number = 0 // Number of NEW Boss + Family rewards to award
): PlayerStats => {
    // Shallow clone the base object to respect React state immutability
    const s = { ...prevStats };

    // Shallow clone arrays/objects we will mutate to avoid mutating prevStats directly
    s.collectiblesDiscovered = s.collectiblesDiscovered ? s.collectiblesDiscovered.slice() : [];
    s.cluesFound = s.cluesFound ? s.cluesFound.slice() : [];
    s.discoveredPOIs = s.discoveredPOIs ? s.discoveredPOIs.slice() : [];
    s.seenBosses = s.seenBosses ? s.seenBosses.slice() : [];
    s.seenEnemies = s.seenEnemies ? s.seenEnemies.slice() : [];
    s.killsByType = { ...(s.killsByType || {}) };
    s.deathsByEnemyType = { ...(s.deathsByEnemyType || {}) };
    s.outgoingDamageBreakdown = { ...(s.outgoingDamageBreakdown || {}) };
    s.incomingDamageBreakdown = { ...(s.incomingDamageBreakdown || {}) }; // Source -> Attack -> Amount

    // 1. Sector Completion Progress
    if (!died && !aborted) {
        s.sectorsCompleted = (s.sectorsCompleted || 0) + 1;
    }

    // 2. Resource Collection
    s.scrap = (s.scrap || 0) + (sectorStats.scrapLooted || 0);
    s.totalScrapCollected = (s.totalScrapCollected || 0) + (sectorStats.scrapLooted || 0);

    // 3. Combat & Performance
    let sectorKills = 0;
    if (sectorStats.killsByType) {
        for (const type in sectorStats.killsByType) {
            const count = sectorStats.killsByType[type];
            sectorKills += count;
            s.killsByType[type] = (s.killsByType[type] || 0) + count;
        }
    }
    s.kills = (s.kills || 0) + sectorKills;

    s.totalBulletsFired = (s.totalBulletsFired || 0) + (sectorStats.shotsFired || 0);
    s.totalBulletsHit = (s.totalBulletsHit || 0) + (sectorStats.shotsHit || 0);
    s.totalThrowablesThrown = (s.totalThrowablesThrown || 0) + (sectorStats.throwablesThrown || 0);
    s.totalDamageDealt = (s.totalDamageDealt || 0) + (sectorStats.damageDealt || 0);
    s.totalDamageTaken = (s.totalDamageTaken || 0) + (sectorStats.damageTaken || 0);
    s.totalDistanceTraveled = (s.totalDistanceTraveled || 0) + (sectorStats.distanceTraveled || 0);

    if (died) {
        s.deaths = (s.deaths || 0) + 1;
        // Record who killed us (VINTERDÖD FIX)
        const killer = sectorStats.killerType || 'Unknown';
        s.deathsByEnemyType[killer] = (s.deathsByEnemyType[killer] || 0) + 1;
    }

    // New Breakdown Aggregation
    if (sectorStats.outgoingDamageBreakdown) {
        for (const weapon in sectorStats.outgoingDamageBreakdown) {
            s.outgoingDamageBreakdown[weapon] = (s.outgoingDamageBreakdown[weapon] || 0) + sectorStats.outgoingDamageBreakdown[weapon];
        }
    }

    if (sectorStats.incomingDamageBreakdown) {
        for (const source in sectorStats.incomingDamageBreakdown) {
            if (!s.incomingDamageBreakdown[source]) s.incomingDamageBreakdown[source] = {};
            const attacks = sectorStats.incomingDamageBreakdown[source];
            for (const attack in attacks) {
                s.incomingDamageBreakdown[source][attack] = (s.incomingDamageBreakdown[source][attack] || 0) + attacks[attack];
            }
        }
    }

    // 4. Scavenging Objectives
    s.chestsOpened = (s.chestsOpened || 0) + (sectorStats.chestsOpened || 0);
    s.bigChestsOpened = (s.bigChestsOpened || 0) + (sectorStats.bigChestsOpened || 0);

    // 5. Discovery & Unique Items (SP Rewards)
    if (sectorStats.cluesFound) {
        for (let i = 0; i < sectorStats.cluesFound.length; i++) {
            const c = sectorStats.cluesFound[i] as any; // Tvinga TypeScript att acceptera båda
            const id = typeof c === 'string' ? c : c.id;

            if (typeof id === 'string') {
                let found = false;
                for (let j = 0; j < s.cluesFound.length; j++) {
                    if (s.cluesFound[j] === id) { found = true; break; }
                }
                if (!found) s.cluesFound.push(id);
            }
        }
    }

    if (sectorStats.discoveredPOIs) {
        for (let i = 0; i < sectorStats.discoveredPOIs.length; i++) {
            const poi = sectorStats.discoveredPOIs[i];
            let found = false;
            for (let j = 0; j < s.discoveredPOIs.length; j++) {
                if (s.discoveredPOIs[j] === poi) { found = true; break; }
            }
            if (!found) s.discoveredPOIs.push(poi);
        }
    }

    // 6. Enemy & Boss Discovery
    if (sectorStats.seenEnemies) {
        for (let i = 0; i < sectorStats.seenEnemies.length; i++) {
            const enemyId = sectorStats.seenEnemies[i];
            let found = false;
            for (let j = 0; j < s.seenEnemies.length; j++) {
                if (s.seenEnemies[j] === enemyId) { found = true; break; }
            }
            if (!found) s.seenEnemies.push(enemyId);
        }
    }

    if (sectorStats.seenBosses) {
        for (let i = 0; i < sectorStats.seenBosses.length; i++) {
            const bossId = sectorStats.seenBosses[i];
            let found = false;
            for (let j = 0; j < s.seenBosses.length; j++) {
                if (s.seenBosses[j] === bossId) { found = true; break; }
            }
            if (!found) s.seenBosses.push(bossId);
        }
    }

    // SP for Collectibles
    if (sectorStats.collectiblesDiscovered) {
        for (let i = 0; i < sectorStats.collectiblesDiscovered.length; i++) {
            const collectible = sectorStats.collectiblesDiscovered[i];
            let found = false;
            for (let j = 0; j < s.collectiblesDiscovered.length; j++) {
                if (s.collectiblesDiscovered[j] === collectible) { found = true; break; }
            }
            if (!found) {
                s.collectiblesDiscovered.push(collectible);
                s.skillPoints++;
                s.totalSkillPointsEarned++;
            }
        }
    }

    // 6. Mission Achievement & Session SP
    const sessionSp = (sectorStats.spGained || 0);
    if (sessionSp > 0 || newUniqueAchievements > 0) {
        const totalAdd = sessionSp + newUniqueAchievements;
        s.skillPoints += totalAdd;
        s.totalSkillPointsEarned += totalAdd;
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