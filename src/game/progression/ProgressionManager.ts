import { PlayerStats, PlayerStatID, StatWeaponIndex, StatEnemyIndex, StatPerkIndex } from '../../entities/player/PlayerTypes';
import { SectorStats } from '../../game/session/SessionTypes';
import { LEVEL_CAP } from '../../content/constants';


/**
 * Aggregates sector performance into overall player statistics.
 * Handles XP leveling, scrap collection, and UNIQUE map-based SP rewards.
 * Optimized for minimal GC allocation during level transitions.
 * VINTERDÖD: 100% Zero-GC standard with classic for-loops and Typed Arrays.
 */
export const aggregateStats = (
    prevStats: PlayerStats,
    sectorStats: SectorStats,
    died: boolean,
    aborted: boolean,
    newUniqueAchievements: number = 0
): PlayerStats => {
    // VINTERDÖD FIX: Clone BOTH the object and the statsBuffer to ensure React immutability
    const s = { 
        ...prevStats,
        statsBuffer: new Float32Array(prevStats.statsBuffer),
        
        // --- WEAPON PERFORMANCE BUFFERS (Zero-GC Clone) ---
        weaponKills: new Float64Array(prevStats.weaponKills),
        weaponDamageDealt: new Float64Array(prevStats.weaponDamageDealt),
        weaponShotsFired: new Float64Array(prevStats.weaponShotsFired),
        weaponShotsHit: new Float64Array(prevStats.weaponShotsHit),
        weaponTimeActive: new Float64Array(prevStats.weaponTimeActive),
        weaponEngagementDistSq: new Float64Array(prevStats.weaponEngagementDistSq),

        // --- PERK PERFORMANCE BUFFERS (Step 2 Clone) ---
        perkTimesGained: new Float64Array(prevStats.perkTimesGained),
        perkDamageAbsorbed: new Float64Array(prevStats.perkDamageAbsorbed),
        perkDamageDealt: new Float64Array(prevStats.perkDamageDealt),
        perkDebuffsCleansed: new Float64Array(prevStats.perkDebuffsCleansed),

        // --- ENEMY STATS BUFFERS (Step 2 Clone) ---
        enemyKills: new Float64Array(prevStats.enemyKills)
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
    s.incomingDamageBreakdown = { ...(s.incomingDamageBreakdown || {}) };
    s.outgoingDamageBreakdown = { ...(s.outgoingDamageBreakdown || {}) };

    // 1. Sector Completion Progress
    if (!died && !aborted) {
        s.sectorsCompleted = (s.sectorsCompleted || 0) + 1;
    }

    // 2. Resource Collection
    sb[PlayerStatID.SCRAP] += (sectorStats.scrapLooted || 0);
    sb[PlayerStatID.TOTAL_SCRAP_COLLECTED] += (sectorStats.scrapLooted || 0);
    sb[PlayerStatID.SCORE] += (sectorStats.score || 0);

    // 3. Combat & Performance
    sb[PlayerStatID.TOTAL_KILLS] += (sectorStats.kills || 0);
    sb[PlayerStatID.TOTAL_DAMAGE_DEALT] += (sectorStats.damageDealt || 0);
    sb[PlayerStatID.TOTAL_DAMAGE_TAKEN] += (sectorStats.damageTaken || 0);
    sb[PlayerStatID.TOTAL_DISTANCE_TRAVELED] += (sectorStats.distanceTraveled || 0);
    
    // Analytics (Phase 12)
    sb[PlayerStatID.TOTAL_ENGAGEMENT_DISTANCE_SQ] += (sectorStats.engagementDistSqKills || 0);
    if (sectorStats.maxKillstreak > sb[PlayerStatID.LONGEST_KILLSTREAK]) {
        sb[PlayerStatID.LONGEST_KILLSTREAK] = sectorStats.maxKillstreak;
    }

    if (sectorStats.killsByType) {
        for (const type in sectorStats.killsByType) {
            s.killsByType[type] = (s.killsByType[type] || 0) + sectorStats.killsByType[type];
        }
    }

    if (died) {
        s.deaths = (s.deaths || 0) + 1;
        const killer = sectorStats.killerType || 'Unknown';
        s.deathsByEnemyType[killer as any] = (s.deathsByEnemyType[killer as any] || 0) + 1;
    }

    // --- WEAPON PERFORMANCE AGGREGATION (Zero-GC Loop) ---
    for (let i = 0; i < StatWeaponIndex.COUNT; i++) {
        s.weaponKills[i] += sectorStats.weaponKills[i];
        s.weaponDamageDealt[i] += sectorStats.weaponDamageDealt[i];
        s.weaponShotsFired[i] += sectorStats.weaponShotsFired[i];
        s.weaponShotsHit[i] += sectorStats.weaponShotsHit[i];
        s.weaponTimeActive[i] += sectorStats.weaponTimeActive[i];
        s.weaponEngagementDistSq[i] += sectorStats.weaponEngagementDistSq[i];
    }

    // --- ENEMY PERFORMANCE AGGREGATION (Zero-GC Loop) ---
    for (let i = 0; i < StatEnemyIndex.COUNT; i++) {
        s.enemyKills[i] += sectorStats.enemyKills[i];
    }

    // --- PERK PERFORMANCE AGGREGATION (Zero-GC Loop) ---
    for (let i = 0; i < StatPerkIndex.COUNT; i++) {
        s.perkTimesGained[i] += sectorStats.perkTimesGained[i];
        s.perkDamageAbsorbed[i] += sectorStats.perkDamageAbsorbed[i];
        s.perkDamageDealt[i] += sectorStats.perkDamageDealt[i];
        s.perkDebuffsCleansed[i] += sectorStats.perkDebuffsCleansed[i];
    }

    if (sectorStats.incomingDamageBreakdown) {
        for (const source in sectorStats.incomingDamageBreakdown) {
            if (!s.incomingDamageBreakdown[source as any]) (s.incomingDamageBreakdown as any)[source] = {};
            const attacks = (sectorStats.incomingDamageBreakdown as any)[source];
            for (const attack in attacks) {
                (s.incomingDamageBreakdown as any)[source][attack] = ((s.incomingDamageBreakdown as any)[source][attack] || 0) + attacks[attack];
            }
        }
    }

    // 4. Scavenging Objectives
    s.chestsOpened = (s.chestsOpened || 0) + (sectorStats.chestsOpened || 0);
    s.bigChestsOpened = (s.bigChestsOpened || 0) + (sectorStats.bigChestsOpened || 0);
    sb[PlayerStatID.TOTAL_CHESTS_OPENED] += (sectorStats.chestsOpened || 0);
    sb[PlayerStatID.TOTAL_BIG_CHESTS_OPENED] += (sectorStats.bigChestsOpened || 0);

    // 5. Discovery & Unique Items
    if (sectorStats.cluesFound) {
        for (let i = 0; i < sectorStats.cluesFound.length; i++) {
            const c = sectorStats.cluesFound[i];
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

    if (sectorStats.collectiblesDiscovered) {
        for (let i = 0; i < sectorStats.collectiblesDiscovered.length; i++) {
            const collectible = sectorStats.collectiblesDiscovered[i];
            if (!s.collectiblesDiscovered.includes(collectible)) {
                s.collectiblesDiscovered.push(collectible);
                sb[PlayerStatID.SKILL_POINTS]++;
            }
        }
    }

    if (sectorStats.discoveredPerks) {
        if (!s.discoveredPerks) s.discoveredPerks = [];
        for (let i = 0; i < sectorStats.discoveredPerks.length; i++) {
            const perkId = sectorStats.discoveredPerks[i];
            if (!s.discoveredPerks.includes(perkId)) s.discoveredPerks.push(perkId);
        }
    }

    // Session SP
    const sessionSp = (sectorStats.spGained || 0);
    if (sessionSp > 0 || newUniqueAchievements > 0) {
        sb[PlayerStatID.SKILL_POINTS] += (sessionSp + newUniqueAchievements);
    }

    // 6. Experience & Leveling
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