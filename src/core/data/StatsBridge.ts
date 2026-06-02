import { CareerStats, PlayerStatID, StatEnemyIndex, StatWeaponIndex, TELEMETRY_ATTACKS_PER_SOURCE } from '../../types/CareerStats';
import { SessionStats } from '../../types/SessionStats';
import { ChallengeID } from '../../content/ChallengeTypes';

export type AnyStatsEntity = CareerStats | SessionStats;

/**
 * StatsBridge
 * 
 * A Zero-GC interface to safely extract and mutate data from the CareerStats 
 * Data-Oriented (DOD) buffers. Isolates React UI and gameplay logic from raw memory structures.
 * Enforces V8 SMI (Small Integer) optimizations and prevents garbage collection overhead.
 */
export class StatsBridge {

    // ========================================================================
    // ZERO-GC STATIC BUFFERS
    // Pre-allocated typed arrays for returning multiple values without instantiating objects.
    // Index 0 = Entity ID, Index 1 = Count/Value
    // ========================================================================
    private static _nemesisResult = new Int32Array([-1, 0]);
    private static _signatureResult = new Int32Array([-1, 0]);
    private static _comfortResult = new Float64Array([-1, 0]);

    // ========================================================================
    // CORE STATS
    // ========================================================================

    public static getCoreStat(stats: CareerStats, statId: PlayerStatID): number {
        return stats.statsBuffer[statId];
    }

    public static getStatsBuffer(stats: CareerStats): Float32Array { return stats.statsBuffer; }

    /**
     * Safely retrieves an integer stat from the buffer with zero allocation.
     * Uses bitwise OR to force V8 to truncate to a 32-bit integer.
     */
    public static getStatInt(stats: CareerStats, statId: PlayerStatID): number {
        return stats.statsBuffer[statId] | 0;
    }

    /**
     * Safely retrieves a floating-point stat from the buffer.
     */
    public static getStatFloat(stats: CareerStats, statId: PlayerStatID): number {
        return stats.statsBuffer[statId] || 0.0;
    }

    // ========================================================================
    // SESSION STATS (Generic Property Accessors)
    // ========================================================================

    public static getSectorKills(stats: SessionStats): number { return stats.kills | 0; }
    public static getSectorDamageDealt(stats: SessionStats): number { return stats.damageDealt || 0.0; }
    public static getSectorDamageTaken(stats: SessionStats): number { return stats.damageTaken || 0.0; }
    public static getSectorXPGained(stats: SessionStats): number { return stats.xpGained | 0; }
    public static getSectorSPGained(stats: SessionStats): number {
        return (stats.spGained | 0) + (stats?.discoveredCollectibles?.length || 0) + (stats?.discoveredPois?.length || 0);
    }
    public static getSectorScrapLooted(stats: SessionStats): number { return stats.scrapLooted | 0; }
    public static getSectorTimeElapsed(stats: SessionStats): number { return stats.timeElapsed || 0.0; }
    public static getSectorDistanceTraveled(stats: SessionStats): number { return stats.distanceTraveled || 0.0; }
    public static isSectorBossDefeated(stats: SessionStats): boolean {
        return (stats.enemyKills && stats.enemyKills[StatEnemyIndex.BOSS] > 0) || !!stats.killingBlowWeapon;
    }
    public static isSectorFamilyFound(stats: SessionStats): boolean { return !!stats.familyFound; }
    public static isSectorAborted(stats: SessionStats): boolean { return !!stats.aborted; }

    public static getGibbedEnemies(stats: SessionStats): number { return stats.gibbedEnemies | 0; }
    public static getUniqueEnemiesHitByExplosives(stats: SessionStats): number { return stats.uniqueEnemiesHitByExplosives | 0; }
    public static getThrowablesThrown(stats: SessionStats): number { return stats.throwablesThrown | 0; }
    public static getShotsFired(stats: SessionStats): number { return stats.shotsFired | 0; }
    public static getShotsHit(stats: SessionStats): number { return stats.shotsHit | 0; }
    public static getChestsOpened(stats: SessionStats): number { return stats.chestsOpened | 0; }
    public static getBigChestsOpened(stats: SessionStats): number { return stats.bigChestsOpened | 0; }

    // ========================================================================
    // ANALYTICAL LOGIC (Zero-GC)
    // ========================================================================

    public static hasPerk(stats: AnyStatsEntity, perkId: number): boolean {
        return (stats.discoveredPerksMap && stats.discoveredPerksMap[perkId] > 0) || false;
    }

    public static isEffectActive(stats: { effectDurations: Float32Array }, perkId: number): boolean {
        return stats.effectDurations[perkId] > 0;
    }

    /**
     * Resolves the "Nemesis" enemy (the one that has killed the player most often).
     * Returns a static Int32Array: [EnemyIndex, DeathCount]
     */
    public static getNemesis(stats: CareerStats): Int32Array {
        let maxDeaths = 0;
        let nemesisIdx = -1;
        const buffer = stats.deathsByEnemyType;

        // Cache-friendly contiguous memory scan
        for (let i = 0; i < buffer.length; i++) {
            if (buffer[i] > maxDeaths) {
                maxDeaths = buffer[i];
                nemesisIdx = i;
            }
        }

        // VINTERDÖD FIX: If maxDeaths is 0, we have no nemesis. Force -1.
        if (maxDeaths <= 0) nemesisIdx = -1;

        StatsBridge._nemesisResult[0] = nemesisIdx;
        StatsBridge._nemesisResult[1] = maxDeaths > 0 ? maxDeaths : 0;
        return StatsBridge._nemesisResult;
    }

    /**
     * Finds the weapon with the most kills.
     * Returns a static Int32Array: [WeaponIndex, KillCount]
     */
    public static getSignatureWeapon(stats: CareerStats): Int32Array {
        let maxKills = 0;
        let signatureIdx = -1;
        const buffer = stats.weaponKills;

        for (let i = 0; i < buffer.length; i++) {
            // Skip technical/move indices and environmental/tactical indices
            if (i === StatWeaponIndex.NONE || 
                i === StatWeaponIndex.RADIO || 
                (i >= StatWeaponIndex.RUSH && i < StatWeaponIndex.PHYSICAL) || // Abilities/Vehicles
                i >= StatWeaponIndex.PHYSICAL) continue;      // Environment

            if (buffer[i] > maxKills) {
                maxKills = buffer[i];
                signatureIdx = i;
            }
        }

        // VINTERDÖD FIX: If maxKills is 0, we have no signature weapon. Force -1.
        if (maxKills <= 0) signatureIdx = -1;

        StatsBridge._signatureResult[0] = signatureIdx;
        StatsBridge._signatureResult[1] = maxKills > 0 ? maxKills : 0;
        return StatsBridge._signatureResult;
    }

    /**
     * Finds the weapon with the most active field time.
     * Returns a static Float64Array: [WeaponIndex, TimeActive]
     */
    public static getComfortWeapon(stats: CareerStats): Float64Array {
        let maxTime = 0;
        let comfortIdx = -1;
        const buffer = stats.weaponTimeActive;

        for (let i = 0; i < buffer.length; i++) {
            // Skip technical/move indices
            if (i === StatWeaponIndex.NONE || 
                i === StatWeaponIndex.RADIO || 
                (i >= StatWeaponIndex.RUSH && i < StatWeaponIndex.PHYSICAL) || 
                i >= StatWeaponIndex.PHYSICAL) continue;

            if (buffer[i] > maxTime) {
                maxTime = buffer[i];
                comfortIdx = i;
            }
        }

        // VINTERDÖD FIX: If maxTime is 0, we have no comfort weapon. Force -1.
        if (maxTime <= 0) comfortIdx = -1;

        StatsBridge._comfortResult[0] = comfortIdx;
        StatsBridge._comfortResult[1] = maxTime > 0 ? maxTime : 0;
        return StatsBridge._comfortResult;
    }

    /**
     * Calculates the raw combat efficiency (kills per minute).
     */
    public static getCombatEfficiency(stats: CareerStats): number {
        const kills = StatsBridge.getStatInt(stats, PlayerStatID.TOTAL_KILLS);
        const timeSeconds = StatsBridge.getStatFloat(stats, PlayerStatID.TOTAL_GAME_TIME) || 1.0;
        return kills / (timeSeconds / 60);
    }

    // ========================================================================
    // TELEMETRY AGGREGATION
    // ========================================================================

    /**
     * Safely aggregates incoming damage from a specific source without triggering
     * V8 array iteration functions in the UI thread.
     */
    public static getIncomingDamageTotalBySource(stats: CareerStats, sourceId: number): number {
        let total = 0;
        const offset = sourceId * TELEMETRY_ATTACKS_PER_SOURCE;
        const buffer = stats.incomingDamageBuffer;

        for (let i = 0; i < TELEMETRY_ATTACKS_PER_SOURCE; i++) {
            total += buffer[offset + i];
        }
        return total;
    }

    // ========================================================================
    // CHALLENGES
    // ========================================================================

    /**
     * Resolves the current numeric value for a specific challenge.
     * O(1) buffer read.
     */
    public static getChallengeValue(stats: CareerStats, id: ChallengeID): number {
        const buffer = stats.statsBuffer;
        const wk = stats.weaponKills;
        const ek = stats.enemyKills;

        switch (id) {
            case ChallengeID.MARATHON: return StatsBridge.getStatFloat(stats, PlayerStatID.TOTAL_DISTANCE_TRAVELED);
            case ChallengeID.SCRAPPER: return StatsBridge.getStatInt(stats, PlayerStatID.TOTAL_SCRAP_COLLECTED);
            case ChallengeID.EXPLORER: return stats?.discoveredPois.length;
            case ChallengeID.TREASURE_HUNTER: return StatsBridge.getStatInt(stats, PlayerStatID.TOTAL_CHESTS_OPENED);
            case ChallengeID.SCAVENGER: return StatsBridge.getStatInt(stats, PlayerStatID.TOTAL_ITEMS_COLLECTED);
            case ChallengeID.ZOMBIE_HUNTER: return StatsBridge.getStatInt(stats, PlayerStatID.TOTAL_KILLS);
            case ChallengeID.WALKER_EXTERMINATOR: return ek[StatEnemyIndex.WALKER];
            case ChallengeID.KNEE_CAPPER: return ek[StatEnemyIndex.RUNNER];
            case ChallengeID.TANK_BUSTER: return ek[StatEnemyIndex.TANK];
            case ChallengeID.BOSS_SLAYER: return ek[StatEnemyIndex.BOSS];
            case ChallengeID.GIBBER: return StatsBridge.getStatInt(stats, PlayerStatID.TOTAL_GIBBED);
            case ChallengeID.PYROMANIAC: return wk[StatWeaponIndex.BURN] + wk[StatWeaponIndex.MOLOTOV] + wk[StatWeaponIndex.FLAMETHROWER];
            case ChallengeID.SHOCK_THERAPY: return wk[StatWeaponIndex.ELECTRIC] + wk[StatWeaponIndex.ARC_CANNON];
            case ChallengeID.DEMOLITION_EXPERT: return wk[StatWeaponIndex.EXPLOSION] + wk[StatWeaponIndex.GRENADE];
            case ChallengeID.BRAWLER: return wk[StatWeaponIndex.RUSH] + wk[StatWeaponIndex.PHYSICAL] + wk[StatWeaponIndex.DODGE];
            case ChallengeID.SHARPSHOOTER: return StatsBridge.getStatInt(stats, PlayerStatID.TOTAL_LONG_RANGE_KILLS);
            case ChallengeID.SURVIVOR: return StatsBridge.getStatInt(stats, PlayerStatID.TOTAL_SECTORS_COMPLETED);
            case ChallengeID.VETERAN: return StatsBridge.getStatInt(stats, PlayerStatID.LEVEL);
            case ChallengeID.UNTOUCHABLE: return StatsBridge.getStatInt(stats, PlayerStatID.LONGEST_KILLSTREAK);
            default: return 0;
        }
    }

    // ========================================================================
    // TELEMETRY GETTERS (Enforces Abstraction)
    // ========================================================================

    public static getWeaponKillCount(stats: AnyStatsEntity, weaponIdx: StatWeaponIndex): number {
        return (stats.weaponKills && stats.weaponKills[weaponIdx]) | 0;
    }

    public static getWeaponDamageDealt(stats: AnyStatsEntity, weaponIdx: StatWeaponIndex): number {
        return (stats.weaponDamageDealt && stats.weaponDamageDealt[weaponIdx]) || 0.0;
    }

    public static getWeaponShotsFired(stats: AnyStatsEntity, weaponIdx: StatWeaponIndex): number {
        return (stats.weaponShotsFired && stats.weaponShotsFired[weaponIdx]) | 0;
    }

    public static getWeaponShotsHit(stats: AnyStatsEntity, weaponIdx: StatWeaponIndex): number {
        return (stats.weaponShotsHit && stats.weaponShotsHit[weaponIdx]) | 0;
    }

    public static getEnemyKillCount(stats: AnyStatsEntity, enemyIdx: StatEnemyIndex): number {
        return (stats.enemyKills && stats.enemyKills[enemyIdx]) | 0;
    }

    public static getEnemyDeathCount(stats: AnyStatsEntity, enemyIdx: number): number {
        const deaths = (stats as any).deathsByEnemyType || (stats as SessionStats).enemyDeaths;
        return deaths ? (deaths[enemyIdx] | 0) : 0;
    }

    public static getPerkDamageDealt(stats: CareerStats, perkIdx: number): number {
        return stats.perkDamageDealt[perkIdx] || 0.0;
    }

    public static getPerkDamageAbsorbed(stats: CareerStats, perkIdx: number): number {
        return stats.perkDamageAbsorbed[perkIdx] || 0.0;
    }

    public static getPerkTimesGained(stats: CareerStats, perkIdx: number): number {
        return stats.perkTimesGained[perkIdx] | 0;
    }

    public static getPerkDebuffsCleansed(stats: CareerStats, perkIdx: number): number {
        return stats.perkDebuffsCleansed[perkIdx] | 0;
    }

    public static getPerkDiscoveredMap(stats: CareerStats): Uint8Array { return stats.discoveredPerksMap; }
    public static getPerkTimesGainedMap(stats: CareerStats): Float64Array { return stats.perkTimesGained; }

    public static isPerkDiscovered(stats: CareerStats, perkId: number): boolean {
        return (stats.discoveredPerksMap && stats.discoveredPerksMap[perkId] > 0) || false;
    }

    public static getCollectiblesDiscoveredLength(stats: CareerStats): number {
        return stats?.discoveredCollectibles ? (stats?.discoveredCollectibles.length | 0) : 0;
    }

    public static getIncomingDamage(stats: AnyStatsEntity, sourceId: number, attackId: number): number {
        const offset = sourceId * TELEMETRY_ATTACKS_PER_SOURCE;
        return stats.incomingDamageBuffer[offset + attackId] || 0.0;
    }

    // ========================================================================
    // TRANSACTIONAL MUTATORS (Zero-GC)
    // ========================================================================

    /**
     * Transactional mutator: Attempts to consume Skill Points (SP) for an upgrade.
     * Enforces zero-GC boundary and performs a strict balance check.
     */
    public static consumeSkillPoints(stats: CareerStats, amount: number): boolean {
        const currentSp = stats.statsBuffer[PlayerStatID.SKILL_POINTS] | 0;
        const cost = amount | 0;

        if (currentSp >= cost) {
            stats.statsBuffer[PlayerStatID.SKILL_POINTS] = (currentSp - cost) | 0;
            return true;
        }

        return false;
    }

    /**
     * Transactional mutator: Attempts to consume Scrap for an upgrade/purchase.
     * Enforces zero-GC boundary and performs a strict balance check.
     */
    public static consumeScrap(stats: CareerStats, amount: number): boolean {
        const currentScrap = stats.statsBuffer[PlayerStatID.SCRAP] | 0;
        const cost = amount | 0;

        if (currentScrap >= cost) {
            stats.statsBuffer[PlayerStatID.SCRAP] = (currentScrap - cost) | 0;
            return true;
        }

        return false;
    }

    /**
     * Transactional mutator: Attempts to consume Challenge Points for an upgrade/purchase.
     * Enforces zero-GC boundary and performs a strict balance check.
     */
    public static consumeChallengePoints(stats: CareerStats, amount: number): boolean {
        const currentCp = stats.statsBuffer[PlayerStatID.CHALLENGE_POINTS] | 0;
        const cost = amount | 0;

        if (currentCp >= cost) {
            stats.statsBuffer[PlayerStatID.CHALLENGE_POINTS] = (currentCp - cost) | 0;
            return true;
        }

        return false;
    }

    /**
     * Increments an integer stat in the buffer.
     * Uses bitwise OR to maintain SMI (Small Integer) optimization in V8.
     */
    public static addStatInt(stats: CareerStats, statId: PlayerStatID, amount: number): void {
        const current = stats.statsBuffer[statId] | 0;
        stats.statsBuffer[statId] = (current + (amount | 0)) | 0;
    }

    /**
     * Increments a floating-point stat in the buffer.
     */
    public static addStatFloat(stats: CareerStats, statId: PlayerStatID, amount: number): void {
        const current = stats.statsBuffer[statId] || 0.0;
        stats.statsBuffer[statId] = current + amount;
    }

    // ========================================================================
    // DISCOVERY & PROGRESSION ARRAYS
    // ========================================================================

    public static getDiscoveredCollectibles(stats: CareerStats): string[] { return stats?.discoveredCollectibles || []; }
    public static getViewedCollectibles(stats: CareerStats): string[] { return stats?.viewedCollectibles || []; }
    public static getDiscoveredClues(stats: CareerStats): string[] { return stats?.discoveredClues || []; }
    public static getDiscoveredPois(stats: CareerStats): string[] { return stats?.discoveredPois || []; }
    public static getDiscoveredZombies(stats: CareerStats): number[] { return stats?.discoveredZombies || []; }
    public static getDiscoveredBosses(stats: CareerStats): number[] { return stats?.discoveredBosses || []; }
    public static getDeadBossIndices(stats: CareerStats): number[] { return stats?.deadBossIndices || []; }
    public static getRescuedFamilyIndices(stats: CareerStats): number[] { return stats?.rescuedFamilyIndices || []; }
    public static getTrackedChallengeIds(stats: CareerStats): number[] { return stats?.trackedChallengeIds || []; }
    public static getChallengeTier(stats: CareerStats, id: ChallengeID): number { return stats?.challengeTiers[id] | 0; }
    
    public static getActivePassives(stats: any): number[] {
        if (stats.activePassivesCount !== undefined && stats.activePassives instanceof Int32Array) {
            const result = new Array(stats.activePassivesCount);
            for (let i = 0; i < stats.activePassivesCount; i++) result[i] = stats.activePassives[i];
            return result;
        }
        return stats.activePassives || [];
    }

    public static getActiveBuffs(stats: any): number[] {
        if (stats.activeBuffsCount !== undefined && stats.activeBuffs instanceof Int32Array) {
            const result = new Array(stats.activeBuffsCount);
            for (let i = 0; i < stats.activeBuffsCount; i++) result[i] = stats.activeBuffs[i];
            return result;
        }
        return stats.activeBuffs || [];
    }

    public static getActiveDebuffs(stats: any): number[] {
        if (stats.activeDebuffsCount !== undefined && stats.activeDebuffs instanceof Int32Array) {
            const result = new Array(stats.activeDebuffsCount);
            for (let i = 0; i < stats.activeDebuffsCount; i++) result[i] = stats.activeDebuffs[i];
            return result;
        }
        return stats.activeDebuffs || [];
    }
    
    public static getFamilyFoundCount(stats: CareerStats): number { return stats.familyFoundCount | 0; }
    public static getTotalSkillPointsEarned(stats: CareerStats): number { return stats.totalSkillPointsEarned | 0; }

    // ========================================================================
    // CORE STAT SHORTHANDS
    // ========================================================================

    public static getLevel(stats: CareerStats): number { return StatsBridge.getStatInt(stats, PlayerStatID.LEVEL); }
    public static getExperience(stats: CareerStats): number { return StatsBridge.getStatInt(stats, PlayerStatID.CURRENT_XP); }
    public static getNextLevelExperience(stats: CareerStats): number { return StatsBridge.getStatInt(stats, PlayerStatID.NEXT_LEVEL_XP); }
    public static getScrap(stats: CareerStats): number { return StatsBridge.getStatInt(stats, PlayerStatID.SCRAP); }
    public static getSkillPoints(stats: CareerStats): number { return StatsBridge.getStatInt(stats, PlayerStatID.SKILL_POINTS); }
    public static getChallengePoints(stats: CareerStats): number { return StatsBridge.getStatInt(stats, PlayerStatID.CHALLENGE_POINTS); }
    public static getTotalChallengePoints(stats: CareerStats): number { return StatsBridge.getStatInt(stats, PlayerStatID.TOTAL_CHALLENGE_POINTS); }
    public static getSectorsCompleted(stats: CareerStats): number { return stats.sectorsCompleted | 0; }
    public static getTotalKills(stats: CareerStats): number { return StatsBridge.getStatInt(stats, PlayerStatID.TOTAL_KILLS); }
    public static getTotalGameTime(stats: CareerStats): number { return StatsBridge.getStatFloat(stats, PlayerStatID.TOTAL_GAME_TIME); }
    public static getMaxHP(stats: CareerStats): number { return StatsBridge.getStatInt(stats, PlayerStatID.MAX_HP); }
    public static getMaxStamina(stats: CareerStats): number { return StatsBridge.getStatInt(stats, PlayerStatID.MAX_STAMINA); }
    public static getSpeed(stats: CareerStats): number { return StatsBridge.getStatFloat(stats, PlayerStatID.SPEED); }

    /**
     * Compatibility alias for deepCloneCareerStats to resolve UI-level invocations.
     */
    public static deepCloneStats(stats: CareerStats): CareerStats {
        return StatsBridge.deepCloneCareerStats(stats);
    }

    /**
     * Creates a deep clone of the CareerStats object, including all TypedArrays.
     * Essential for UI transactional state (e.g. Camp stations) to allow "Cancel" functionality
     * without polluting the original engine-level telemetry buffers.
     */
    public static deepCloneCareerStats(stats: CareerStats): CareerStats {
        const clone = { ...stats } as CareerStats;

        // PERFORMANCE FIX: Use .slice() instead of new TypedArray() to invoke fast C++ memcpy in V8
        if (stats.statsBuffer) clone.statsBuffer = stats.statsBuffer.slice();
        if (stats.effectDurations) clone.effectDurations = stats.effectDurations.slice();
        if (stats.effectMaxDurations) clone.effectMaxDurations = stats.effectMaxDurations.slice();
        if (stats.effectIntensities) clone.effectIntensities = stats.effectIntensities.slice();

        if (stats.weaponKills) clone.weaponKills = stats.weaponKills.slice();
        if (stats.weaponDamageDealt) clone.weaponDamageDealt = stats.weaponDamageDealt.slice();
        if (stats.weaponShotsFired) clone.weaponShotsFired = stats.weaponShotsFired.slice();
        if (stats.weaponShotsHit) clone.weaponShotsHit = stats.weaponShotsHit.slice();
        if (stats.weaponTimeActive) clone.weaponTimeActive = stats.weaponTimeActive.slice();
        if (stats.weaponEngagementDistSq) clone.weaponEngagementDistSq = stats.weaponEngagementDistSq.slice();

        if (stats.perkTimesGained) clone.perkTimesGained = stats.perkTimesGained.slice();
        if (stats.perkDamageAbsorbed) clone.perkDamageAbsorbed = stats.perkDamageAbsorbed.slice();
        if (stats.perkDamageDealt) clone.perkDamageDealt = stats.perkDamageDealt.slice();
        if (stats.perkDebuffsCleansed) clone.perkDebuffsCleansed = stats.perkDebuffsCleansed.slice();

        if (stats.enemyKills) clone.enemyKills = stats.enemyKills.slice();
        if (stats.deathsByEnemyType) clone.deathsByEnemyType = stats.deathsByEnemyType.slice();
        if (stats.incomingDamageBuffer) clone.incomingDamageBuffer = stats.incomingDamageBuffer.slice();

        if (stats?.challengeTiers) clone.challengeTiers = stats?.challengeTiers.slice();
        if (stats.discoveredPerksMap) clone.discoveredPerksMap = stats.discoveredPerksMap.slice();

        // PERFORMANCE FIX: Use .slice() instead of spread operator [...] to avoid JS iterator overhead
        if (stats.activePassives) clone.activePassives = stats.activePassives.slice();
        if (stats.activeBuffs) clone.activeBuffs = stats.activeBuffs.slice();
        if (stats.activeDebuffs) clone.activeDebuffs = stats.activeDebuffs.slice();
        if (stats?.discoveredCollectibles) clone.discoveredCollectibles = stats?.discoveredCollectibles.slice();
        clone.viewedCollectibles = stats?.viewedCollectibles ? stats?.viewedCollectibles.slice() : [];
        if (stats?.discoveredClues) clone.discoveredClues = stats?.discoveredClues.slice();
        if (stats?.discoveredZombies) clone.discoveredZombies = stats?.discoveredZombies.slice();
        if (stats?.discoveredBosses) clone.discoveredBosses = stats?.discoveredBosses.slice();
        if (stats?.discoveredPois) clone.discoveredPois = stats?.discoveredPois.slice();
        if (stats?.rescuedFamilyIndices) clone.rescuedFamilyIndices = stats?.rescuedFamilyIndices.slice();
        if (stats?.trackedChallengeIds) clone.trackedChallengeIds = stats?.trackedChallengeIds.slice();

        return clone;
    }

}
