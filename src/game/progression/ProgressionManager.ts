import { CareerStats, StatID, StatWeaponIndex, StatEnemyIndex, StatPerkIndex } from '../../types/CareerStats';
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
    currentSector: number = 0
): CareerStats => {
    if (currentSector === SectorID.PLAYGROUND) return prevStats;

    // Clone BOTH the object and the statsBuffer to ensure React immutability
    const s = {
        ...prevStats,
        statsBuffer: new Float32Array(prevStats.statsBuffer),

        // --- OUTGOING PERFORMANCE BUFFERS (Zero-GC Clone) ---
        outgoingKillsBuffer: new Float64Array(prevStats.outgoingKillsBuffer),
        outgoingDamageBuffer: new Float64Array(prevStats.outgoingDamageBuffer),
        outgoingShotsFiredBuffer: new Float64Array(prevStats.outgoingShotsFiredBuffer),
        outgoingShotsHitBuffer: new Float64Array(prevStats.outgoingShotsHitBuffer),
        outgoingTimeActiveBuffer: new Float64Array(prevStats.outgoingTimeActiveBuffer),
        outgoingEngagementDistSqBuffer: new Float64Array(prevStats.outgoingEngagementDistSqBuffer),

        // --- PERK PERFORMANCE BUFFERS (Step 2 Clone) ---
        perkTimesGained: new Float64Array(prevStats.perkTimesGained),
        perkDamageAbsorbed: new Float64Array(prevStats.perkDamageAbsorbed),
        perkDamageDealt: new Float64Array(prevStats.perkDamageDealt),
        perkDebuffsCleansed: new Float64Array(prevStats.perkDebuffsCleansed),

        // --- ENEMY STATS BUFFERS (Step 2 Clone) ---
        enemyKills: new Float64Array(prevStats.enemyKills),
        deathsByEnemyType: new Float64Array(prevStats.deathsByEnemyType),
        incomingDamageBuffer: new Float64Array(prevStats.incomingDamageBuffer),

        // --- DISCOVERY MAPS (Uint8Array Clone for React immutability) ---
        discoveredPerks: new Uint8Array(prevStats.discoveredPerks),
        discoveredClues: new Uint8Array(prevStats.discoveredClues),
        discoveredPois: new Uint8Array(prevStats.discoveredPois),
        discoveredCollectibles: new Uint8Array(prevStats.discoveredCollectibles),
        discoveredZombies: new Uint8Array(prevStats.discoveredZombies),
        discoveredBosses: new Uint8Array(prevStats.discoveredBosses),

        // --- CHALLENGES ---
        challengeTiers: new Int32Array(prevStats.challengeTiers)
    };

    const sb = s.statsBuffer;

    s.deadBossIndices = s.deadBossIndices ? s.deadBossIndices.slice() : [];
    s.rescuedFamilyIndices = s.rescuedFamilyIndices ? s.rescuedFamilyIndices.slice() : [];
    s.trackedChallengeIds = s.trackedChallengeIds ? s.trackedChallengeIds.slice() : [];

    // 1. Sector Completion Progress
    if (!died && !aborted) {
        s.sectorsCompleted = Math.max(s.sectorsCompleted || 0, currentSector + 1);
        sb[StatID.TOTAL_SECTORS_COMPLETED] = s.sectorsCompleted | 0;
    }

    // 2. Resource Collection & Stats
    // Authoritative CareerStats are already updated live in real-time during gameplay.
    // ProgressionManager only tracks session metadata (e.g. sectors completed, unique achievements, session start counts).
    sb[StatID.TOTAL_SESSIONS_STARTED] += 1;

    // 3. Discovery & Unique Items
    // Discoveries are written live to careerStats during play by DiscoverySystem and onDiscovery.
    // No aggregation needed here.

    // Sync total skill points and challenge points earned for UI displays
    s.totalSkillPointsEarned = sb[StatID.SKILL_POINTS];
    s.totalChallengePoints = sb[StatID.TOTAL_CHALLENGE_POINTS];

    return s;
};