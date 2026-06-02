import { CareerStats, PlayerStatID, StatWeaponIndex, StatEnemyIndex, StatPerkIndex } from '../../types/CareerStats';
import { SectorStats } from '../../types/StateTypes';
import { LEVEL_CAP } from '../../content/constants';
import { SectorID } from '../session/SectorTypes';

/**
 * Aggregates sector performance into overall player statistics.
 * Handles XP leveling, scrap collection, and UNIQUE map-based SP rewards.
 * Optimized for minimal GC allocation during level transitions.
 * 100% Zero-GC standard with classic for-loops and Typed Arrays.
 */
export const aggregateStats = (
    prevStats: CareerStats,
    sectorStats: SectorStats,
    died: boolean,
    aborted: boolean,
    currentSector: number = 0,
    newUniqueAchievements: number = 0
): CareerStats => {
    if (currentSector === SectorID.PLAYGROUND) return prevStats;

    // Clone BOTH the object and the statsBuffer to ensure React immutability
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
        enemyKills: new Float64Array(prevStats.enemyKills),
        deathsByEnemyType: new Float64Array(prevStats.deathsByEnemyType),
        incomingDamageBuffer: new Float64Array(prevStats.incomingDamageBuffer),
        discoveredPerksMap: new Uint8Array(prevStats.discoveredPerksMap),
        challengeTiers: new Int32Array(prevStats.challengeTiers)
    };

    const sb = s.statsBuffer;

    // Shallow clone arrays/objects we will mutate to avoid mutating prevStats directly
    s.discoveredCollectibles = s.discoveredCollectibles ? s.discoveredCollectibles.slice() : [];
    s.discoveredClues = s.discoveredClues ? s.discoveredClues.slice() : [];
    s.discoveredPois = s.discoveredPois ? s.discoveredPois.slice() : [];
    s.discoveredBosses = s.discoveredBosses ? s.discoveredBosses.slice() : [];
    s.discoveredZombies = s.discoveredZombies ? s.discoveredZombies.slice() : [];
    s.deadBossIndices = s.deadBossIndices ? s.deadBossIndices.slice() : [];
    s.rescuedFamilyIndices = s.rescuedFamilyIndices ? s.rescuedFamilyIndices.slice() : [];
    s.trackedChallengeIds = s.trackedChallengeIds ? s.trackedChallengeIds.slice() : [];

    // 1. Sector Completion Progress
    if (!died && !aborted) {
        s.sectorsCompleted = Math.max(s.sectorsCompleted || 0, currentSector + 1);
        sb[PlayerStatID.TOTAL_SECTORS_COMPLETED] = s.sectorsCompleted | 0;
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
    sb[PlayerStatID.TOTAL_SHOTS_FIRED] += (sectorStats.shotsFired || 0);
    sb[PlayerStatID.TOTAL_SHOTS_HIT] += (sectorStats.shotsHit || 0);
    sb[PlayerStatID.TOTAL_THROWABLES_THROWN] += (sectorStats.throwablesThrown || 0);
    sb[PlayerStatID.TOTAL_GAME_TIME] += (sectorStats.timePlayed || 0);
    sb[PlayerStatID.TOTAL_SESSIONS_STARTED] += 1;

    // Analytics (Phase 12)
    sb[PlayerStatID.TOTAL_ENGAGEMENT_DISTANCE_SQ] += (sectorStats.engagementDistSqKills || 0);
    if (sectorStats.maxKillstreak > sb[PlayerStatID.LONGEST_KILLSTREAK]) {
        sb[PlayerStatID.LONGEST_KILLSTREAK] = sectorStats.maxKillstreak;
    }

    // New Analytics (Sector-to-Persistent)
    sb[PlayerStatID.TOTAL_DODGES] += (sectorStats.dodges || 0);
    sb[PlayerStatID.TOTAL_RUSHES] += (sectorStats.rushes || 0);
    sb[PlayerStatID.TOTAL_RUSH_DISTANCE] += (sectorStats.rushDistance || 0);
    sb[PlayerStatID.TOTAL_BUFF_TIME] += (sectorStats.buffTime || 0);
    sb[PlayerStatID.TOTAL_DEBUFFS_RESISTED] += (sectorStats.debuffsResisted || 0);
    sb[PlayerStatID.TOTAL_CRISIS_SAVES] += (sectorStats.crisisSaves || 0);
    sb[PlayerStatID.TOTAL_DEATHS] += (sectorStats.deaths || 0);

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
        s.deathsByEnemyType[i] += sectorStats.enemyDeaths[i];
    }

    // --- PERK PERFORMANCE AGGREGATION (Zero-GC Loop) ---
    for (let i = 0; i < StatPerkIndex.COUNT; i++) {
        s.perkTimesGained[i] += sectorStats.perkTimesGained[i];
        s.perkDamageAbsorbed[i] += sectorStats.perkDamageAbsorbed[i];
        s.perkDamageDealt[i] += sectorStats.perkDamageDealt[i];
        s.perkDebuffsCleansed[i] += sectorStats.perkDebuffsCleansed[i];

        // Merge discovery map to ensure UI visibility of newly found perks
        if (sectorStats.discoveredPerksMap && sectorStats.discoveredPerksMap[i] > 0) {
            s.discoveredPerksMap[i] = 1;
        }
    }

    // --- INCOMING DAMAGE AGGREGATION (Zero-GC) ---
    const inLen = s.incomingDamageBuffer.length;
    for (let i = 0; i < inLen; i++) {
        s.incomingDamageBuffer[i] += sectorStats.incomingDamageBuffer[i];
    }

    // 4. Scavenging Objectives
    sb[PlayerStatID.TOTAL_CHESTS_OPENED] += (sectorStats.chestsOpened || 0);
    sb[PlayerStatID.TOTAL_BIG_CHESTS_OPENED] += (sectorStats.bigChestsOpened || 0);
    sb[PlayerStatID.TOTAL_GIBBED] += (sectorStats.gibbedEnemies || 0);
    sb[PlayerStatID.TOTAL_UNIQUE_ENEMIES_HIT_BY_EXPLOSIVES] += (sectorStats.uniqueEnemiesHitByExplosives || 0);
    sb[PlayerStatID.TOTAL_LONG_RANGE_KILLS] += (sectorStats.engagementDistSqKills > 1000 ? 1 : 0); // Example threshold

    // 5. Discovery & Unique Items
    if (sectorStats.discoveredClues) {
        for (let i = 0; i < sectorStats.discoveredClues.length; i++) {
            const c = sectorStats.discoveredClues[i];
            const id = typeof c === 'string' ? c : c.id;
            if (typeof id === 'string') {
                if (!s.discoveredClues.includes(id)) {
                    s.discoveredClues.push(id);
                    sb[PlayerStatID.SKILL_POINTS]++;
                }
            }
        }
    }

    if (sectorStats.discoveredPois) {
        for (let i = 0; i < sectorStats.discoveredPois.length; i++) {
            const poi = sectorStats.discoveredPois[i];
            if (!s.discoveredPois.includes(poi)) {
                s.discoveredPois.push(poi);
                sb[PlayerStatID.SKILL_POINTS]++;
            }
        }
    }

    if (sectorStats.discoveredZombies) {
        for (let i = 0; i < sectorStats.discoveredZombies.length; i++) {
            const enemyId = sectorStats.discoveredZombies[i];
            if (!s.discoveredZombies.includes(enemyId)) s.discoveredZombies.push(enemyId);
        }
    }

    if (sectorStats.discoveredBosses) {
        for (let i = 0; i < sectorStats.discoveredBosses.length; i++) {
            const bossId = sectorStats.discoveredBosses[i];
            if (!s.discoveredBosses.includes(bossId)) s.discoveredBosses.push(bossId);
        }
    }

    if (sectorStats.discoveredCollectibles) {
        for (let i = 0; i < sectorStats.discoveredCollectibles.length; i++) {
            const collectible = sectorStats.discoveredCollectibles[i];
            if (!s.discoveredCollectibles.includes(collectible)) {
                s.discoveredCollectibles.push(collectible);
                sb[PlayerStatID.SKILL_POINTS]++;
            }
        }
    }

    if (sectorStats.discoveredPerksMap) {
        for (let i = 0; i < 256; i++) {
            if (sectorStats.discoveredPerksMap[i] === 1) s.discoveredPerksMap[i] = 1;
        }
    }

    // --- SYNC ACTIVE PERKS FOR UI (Bridge Int32Array to number[]) ---
    if (sectorStats.activePassives && sectorStats.activePassivesCount !== undefined) {
        s.activePassives = [];
        for (let i = 0; i < sectorStats.activePassivesCount; i++) s.activePassives.push(sectorStats.activePassives[i]);
    }
    if (sectorStats.activeBuffs && sectorStats.activeBuffsCount !== undefined) {
        s.activeBuffs = [];
        for (let i = 0; i < sectorStats.activeBuffsCount; i++) s.activeBuffs.push(sectorStats.activeBuffs[i]);
    }
    if (sectorStats.activeDebuffs && sectorStats.activeDebuffsCount !== undefined) {
        s.activeDebuffs = [];
        for (let i = 0; i < sectorStats.activeDebuffsCount; i++) s.activeDebuffs.push(sectorStats.activeDebuffs[i]);
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

    // Sync total skill points and challenge points earned for UI displays
    s.totalSkillPointsEarned = sb[PlayerStatID.SKILL_POINTS];
    s.totalChallengePoints = sb[PlayerStatID.TOTAL_CHALLENGE_POINTS];

    return s;
};
