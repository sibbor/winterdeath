import { PlayerStats, PlayerStatID } from '../../entities/player/PlayerTypes';
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
    // VINTERDÖD FIX: Clone BOTH the object and the statsBuffer to ensure React immutability
    const s = { 
        ...prevStats,
        statsBuffer: new Float32Array(prevStats.statsBuffer) 
    };

    const sb = s.statsBuffer;


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
    sb[PlayerStatID.SCRAP] += (sectorStats.scrapLooted || 0);
    sb[PlayerStatID.TOTAL_SCRAP_COLLECTED] += (sectorStats.scrapLooted || 0);
    sb[PlayerStatID.SCORE] += (sectorStats.score || 0);

    // 3. Combat & Performance
    let sectorKills = 0;
    if (sectorStats.killsByType) {
        for (const type in sectorStats.killsByType) {
            const count = sectorStats.killsByType[type];
            sectorKills += count;
            s.killsByType[type] = (s.killsByType[type] || 0) + count;
        }
    }
    sb[PlayerStatID.TOTAL_KILLS] += sectorKills;

    sb[PlayerStatID.TOTAL_DAMAGE_DEALT] += (sectorStats.damageDealt || 0);
    sb[PlayerStatID.TOTAL_DAMAGE_TAKEN] += (sectorStats.damageTaken || 0);
    sb[PlayerStatID.TOTAL_DISTANCE_TRAVELED] += (sectorStats.distanceTraveled || 0);

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
            const c = sectorStats.cluesFound[i] as any;
            const id = typeof c === 'string' ? c : c.id;

            if (typeof id === 'string') {
                if (!s.cluesFound.includes(id)) s.cluesFound.push(id);
            }
        }
    }

    if (sectorStats.discoveredPOIs) {
        for (let i = 0; i < sectorStats.discoveredPOIs.length; i++) {
            const poi = sectorStats.discoveredPOIs[i];
            if (!s.discoveredPOIs.includes(poi)) s.discoveredPOIs.push(poi);
        }
    }

    // 6. Enemy & Boss Discovery
    if (sectorStats.seenEnemies) {
        for (let i = 0; i < sectorStats.seenEnemies.length; i++) {
            const enemyId = sectorStats.seenEnemies[i];
            if (!s.seenEnemies.includes(enemyId)) s.seenEnemies.push(enemyId);
        }
    }

    if (sectorStats.seenBosses) {
        for (let i = 0; i < sectorStats.seenBosses.length; i++) {
            const bossId = sectorStats.seenBosses[i];
            if (!s.seenBosses.includes(bossId)) s.seenBosses.push(bossId);
        }
    }

    // SP for Collectibles
    if (sectorStats.collectiblesDiscovered) {
        for (let i = 0; i < sectorStats.collectiblesDiscovered.length; i++) {
            const collectible = sectorStats.collectiblesDiscovered[i];
            if (!s.collectiblesDiscovered.includes(collectible)) {
                s.collectiblesDiscovered.push(collectible);
                sb[PlayerStatID.SKILL_POINTS]++;
            }
        }
    }

    // 6. Mission Achievement & Session SP
    const sessionSp = (sectorStats.spGained || 0);
    if (sessionSp > 0 || newUniqueAchievements > 0) {
        sb[PlayerStatID.SKILL_POINTS] += (sessionSp + newUniqueAchievements);
    }

    // 7. Experience & Leveling
    let gainedXp = (sectorStats.xpGained || 0);
    while (gainedXp > 0 && sb[PlayerStatID.LEVEL] < LEVEL_CAP) {
        const needed = sb[PlayerStatID.NEXT_LEVEL_XP] - sb[PlayerStatID.CURRENT_XP];
        if (gainedXp >= needed) {
            sb[PlayerStatID.LEVEL]++;
            sb[PlayerStatID.SKILL_POINTS]++;
            gainedXp -= needed;
            sb[PlayerStatID.CURRENT_XP] = 0;
            sb[PlayerStatID.NEXT_LEVEL_XP] = Math.floor(sb[PlayerStatID.NEXT_LEVEL_XP] * 1.2);
        } else {
            sb[PlayerStatID.CURRENT_XP] += gainedXp;
            gainedXp = 0;
        }
    }

    return s;
};