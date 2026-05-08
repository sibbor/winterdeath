import { PlayerStats, PlayerStatID, StatEnemyIndex, StatWeaponIndex, TELEMETRY_ATTACKS_PER_SOURCE } from '../../entities/player/PlayerTypes';
import { ChallengeID } from '../../content/ChallengeTypes';

// Use a union type to allow both PlayerStats and SectorStats for generic telemetry.
// Replace 'any' with 'SectorStats' if it is explicitly imported in your architecture.
export type AnyStatsEntity = PlayerStats | any;

/**
 * StatsBridge
 * 
 * A Zero-GC interface to safely extract and mutate data from the PlayerStats 
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

    public static getCoreStat(stats: PlayerStats, statId: PlayerStatID): number {
        return stats.statsBuffer[statId];
    }

    public static getStatsBuffer(stats: PlayerStats): Float32Array { return stats.statsBuffer; }

    /**
     * Safely retrieves an integer stat from the buffer with zero allocation.
     * Uses bitwise OR to force V8 to truncate to a 32-bit integer.
     */
    public static getStatInt(stats: PlayerStats, statId: PlayerStatID): number {
        return stats.statsBuffer[statId] | 0;
    }

    /**
     * Safely retrieves a floating-point stat from the buffer.
     */
    public static getStatFloat(stats: PlayerStats, statId: PlayerStatID): number {
        return stats.statsBuffer[statId] || 0.0;
    }

    // ========================================================================
    // SECTOR STATS (Generic Property Accessors)
    // ========================================================================

    public static getSectorKills(stats: any): number { return stats.kills | 0; }
    public static getSectorDamageDealt(stats: any): number { return stats.damageDealt || 0.0; }
    public static getSectorDamageTaken(stats: any): number { return stats.damageTaken || 0.0; }
    public static getSectorXPGained(stats: any): number { return stats.xpGained | 0; }
    public static getSectorSPGained(stats: any): number { return stats.spGained | 0; }
    public static getSectorScrapLooted(stats: any): number { return stats.scrapLooted | 0; }
    public static getSectorTimeElapsed(stats: any): number { return stats.timeElapsed || 0.0; }
    public static getSectorDistanceTraveled(stats: any): number { return stats.distanceTraveled || 0.0; }
    public static isSectorBossDefeated(stats: any): boolean {
        return (stats.enemyKills && stats.enemyKills[StatEnemyIndex.BOSS] > 0) || !!stats.bossKilled;
    }
    public static isSectorFamilyFound(stats: any): boolean { return !!stats.familyFound; }
    public static isSectorAborted(stats: any): boolean { return !!stats.aborted; }

    public static getGibbedEnemies(stats: any): number { return stats.gibbedEnemies | 0; }
    public static getUniqueEnemiesHitByExplosives(stats: any): number { return stats.uniqueEnemiesHitByExplosives | 0; }
    public static getThrowablesThrown(stats: any): number { return stats.throwablesThrown | 0; }
    public static getShotsFired(stats: any): number { return stats.shotsFired | 0; }
    public static getShotsHit(stats: any): number { return stats.shotsHit | 0; }
    public static getChestsOpened(stats: any): number { return stats.chestsOpened | 0; }
    public static getBigChestsOpened(stats: any): number { return stats.bigChestsOpened | 0; }

    // ========================================================================
    // ANALYTICAL LOGIC (Zero-GC)
    // ========================================================================

    /**
     * Finds the enemy that has killed the player the most.
     * Returns a static Int32Array: [EnemyIndex, DeathCount]
     */
    public static getNemesis(stats: PlayerStats): Int32Array {
        let maxDeaths = -1;
        let nemesisIdx = -1;
        const buffer = stats.deathsByEnemyType;

        // Cache-friendly contiguous memory scan
        for (let i = 0; i < buffer.length; i++) {
            if (buffer[i] > maxDeaths) {
                maxDeaths = buffer[i];
                nemesisIdx = i;
            }
        }

        StatsBridge._nemesisResult[0] = nemesisIdx;
        StatsBridge._nemesisResult[1] = maxDeaths > 0 ? maxDeaths : 0;
        return StatsBridge._nemesisResult;
    }

    /**
     * Finds the weapon with the most kills.
     * Returns a static Int32Array: [WeaponIndex, KillCount]
     */
    public static getSignatureWeapon(stats: PlayerStats): Int32Array {
        let maxKills = -1;
        let signatureIdx = -1;
        const buffer = stats.weaponKills;

        for (let i = 0; i < buffer.length; i++) {
            if (buffer[i] > maxKills) {
                maxKills = buffer[i];
                signatureIdx = i;
            }
        }

        StatsBridge._signatureResult[0] = signatureIdx;
        StatsBridge._signatureResult[1] = maxKills > 0 ? maxKills : 0;
        return StatsBridge._signatureResult;
    }

    /**
     * Finds the weapon with the most active field time.
     * Returns a static Float64Array: [WeaponIndex, TimeActive]
     */
    public static getComfortWeapon(stats: PlayerStats): Float64Array {
        let maxTime = -1;
        let comfortIdx = -1;
        const buffer = stats.weaponTimeActive;

        for (let i = 0; i < buffer.length; i++) {
            if (buffer[i] > maxTime) {
                maxTime = buffer[i];
                comfortIdx = i;
            }
        }

        StatsBridge._comfortResult[0] = comfortIdx;
        StatsBridge._comfortResult[1] = maxTime > 0 ? maxTime : 0;
        return StatsBridge._comfortResult;
    }

    /**
     * Calculates the raw combat efficiency (kills per minute).
     */
    public static getCombatEfficiency(stats: PlayerStats): number {
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
    public static getIncomingDamageTotalBySource(stats: PlayerStats, sourceId: number): number {
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
    public static getChallengeValue(stats: PlayerStats, id: ChallengeID): number {
        const buffer = stats.statsBuffer;
        const wk = stats.weaponKills;
        const ek = stats.enemyKills;

        switch (id) {
            case ChallengeID.MARATHON: return StatsBridge.getStatFloat(stats, PlayerStatID.TOTAL_DISTANCE_TRAVELED);
            case ChallengeID.SCRAPPER: return StatsBridge.getStatInt(stats, PlayerStatID.TOTAL_SCRAP_COLLECTED);
            case ChallengeID.EXPLORER: return stats.discoveredPOIs.length;
            case ChallengeID.TREASURE_HUNTER: return StatsBridge.getStatInt(stats, PlayerStatID.TOTAL_CHESTS_OPENED);
            case ChallengeID.SCAVENGER: return StatsBridge.getStatInt(stats, PlayerStatID.TOTAL_ITEMS_COLLECTED);
            case ChallengeID.ZOMBIE_HUNTER: return StatsBridge.getStatInt(stats, PlayerStatID.TOTAL_KILLS);
            case ChallengeID.WALKER_EXTERMINATOR: return ek[StatEnemyIndex.WALKER];
            case ChallengeID.KNEE_CAPPER: return ek[StatEnemyIndex.RUNNER];
            case ChallengeID.TANK_BUSTER: return ek[StatEnemyIndex.TANK];
            case ChallengeID.BOSS_SLAYER: return ek[StatEnemyIndex.BOSS];
            case ChallengeID.GIBBER: return StatsBridge.getStatInt(stats, PlayerStatID.TOTAL_GIBBED);
            case ChallengeID.PYROMANIAC: return wk[StatWeaponIndex.FIRE] + wk[StatWeaponIndex.BURN] + wk[StatWeaponIndex.MOLOTOV] + wk[StatWeaponIndex.FLAMETHROWER];
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

    public static getWeaponKillCount(stats: AnyStatsEntity, weaponIdx: number): number {
        return stats.weaponKills[weaponIdx] | 0;
    }

    public static getWeaponDamageDealt(stats: AnyStatsEntity, weaponIdx: number): number {
        return stats.weaponDamageDealt[weaponIdx] || 0.0;
    }

    public static getWeaponShotsFired(stats: AnyStatsEntity, weaponIdx: number): number {
        return stats.weaponShotsFired[weaponIdx] | 0;
    }

    public static getWeaponShotsHit(stats: AnyStatsEntity, weaponIdx: number): number {
        return stats.weaponShotsHit[weaponIdx] | 0;
    }

    public static getEnemyKillCount(stats: AnyStatsEntity, enemyIdx: number): number {
        return stats.enemyKills[enemyIdx] | 0;
    }

    public static getEnemyDeathCount(stats: AnyStatsEntity, enemyIdx: number): number {
        // Handle discrepancy between PlayerStats (deathsByEnemyType) and SectorStats (enemyDeaths)
        const deaths = stats.deathsByEnemyType || stats.enemyDeaths;
        return deaths ? (deaths[enemyIdx] | 0) : 0;
    }

    public static getPerkDamageDealt(stats: PlayerStats, perkIdx: number): number {
        return stats.perkDamageDealt[perkIdx] || 0.0;
    }

    public static getPerkDamageAbsorbed(stats: PlayerStats, perkIdx: number): number {
        return stats.perkDamageAbsorbed[perkIdx] || 0.0;
    }

    public static getPerkTimesGained(stats: PlayerStats, perkIdx: number): number {
        return stats.perkTimesGained[perkIdx] | 0;
    }

    public static getPerkDebuffsCleansed(stats: PlayerStats, perkIdx: number): number {
        return stats.perkDebuffsCleansed[perkIdx] | 0;
    }

    public static getPerkDiscoveredMap(stats: PlayerStats): Uint8Array { return stats.discoveredPerksMap; }
    public static getPerkTimesGainedMap(stats: PlayerStats): Float64Array { return stats.perkTimesGained; }

    public static isPerkDiscovered(stats: PlayerStats, perkId: number): boolean {
        return (stats.discoveredPerksMap && stats.discoveredPerksMap[perkId] > 0) || false;
    }

    public static getCollectiblesDiscoveredLength(stats: PlayerStats): number {
        return stats.collectiblesDiscovered ? (stats.collectiblesDiscovered.length | 0) : 0;
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
     * 
     * @param stats The active player stats entity.
     * @param amount The cost to deduct.
     * @returns true if successful, false if insufficient SP.
     */
    public static consumeSkillPoints(stats: PlayerStats, amount: number): boolean {
        const currentSp = stats.statsBuffer[PlayerStatID.SKILL_POINTS] | 0;
        const cost = amount | 0;

        if (currentSp >= cost) {
            // Successful transaction: deduct and force SMI write
            stats.statsBuffer[PlayerStatID.SKILL_POINTS] = (currentSp - cost) | 0;
            return true;
        }

        return false;
    }

    /**
     * Transactional mutator: Attempts to consume Scrap for an upgrade/purchase.
     * Enforces zero-GC boundary and performs a strict balance check.
     * 
     * @param stats The active player stats entity.
     * @param amount The cost to deduct.
     * @returns true if successful, false if insufficient Scrap.
     */
    public static consumeScrap(stats: PlayerStats, amount: number): boolean {
        const currentScrap = stats.statsBuffer[PlayerStatID.SCRAP] | 0;
        const cost = amount | 0;

        if (currentScrap >= cost) {
            // Successful transaction: deduct and force SMI write
            stats.statsBuffer[PlayerStatID.SCRAP] = (currentScrap - cost) | 0;
            return true;
        }

        return false;
    }

    /**
     * Transactional mutator: Attempts to consume Challenge Points for an upgrade/purchase.
     * Enforces zero-GC boundary and performs a strict balance check.
     * 
     * @param stats The active player stats entity.
     * @param amount The cost to deduct.
     * @returns true if successful, false if insufficient Challenge Points.
     */
    public static consumeChallengePoints(stats: PlayerStats, amount: number): boolean {
        const currentCp = stats.statsBuffer[PlayerStatID.CHALLENGE_POINTS] | 0;
        const cost = amount | 0;

        if (currentCp >= cost) {
            // Successful transaction: deduct and force SMI write
            stats.statsBuffer[PlayerStatID.CHALLENGE_POINTS] = (currentCp - cost) | 0;
            return true;
        }

        return false;
    }

    /**
     * Increments an integer stat in the buffer.
     * Uses bitwise OR to maintain SMI (Small Integer) optimization in V8.
     */
    public static addStatInt(stats: PlayerStats, statId: PlayerStatID, amount: number): void {
        const current = stats.statsBuffer[statId] | 0;
        stats.statsBuffer[statId] = (current + (amount | 0)) | 0;
    }

    /**
     * Increments a floating-point stat in the buffer.
     */
    public static addStatFloat(stats: PlayerStats, statId: PlayerStatID, amount: number): void {
        const current = stats.statsBuffer[statId] || 0.0;
        stats.statsBuffer[statId] = current + amount;
    }

    // ========================================================================
    // DISCOVERY & PROGRESSION ARRAYS
    // ========================================================================

    public static getCollectiblesDiscovered(stats: PlayerStats): string[] { return stats.collectiblesDiscovered; }
    public static getViewedCollectibles(stats: PlayerStats): string[] { return stats.viewedCollectibles || []; }
    public static getCluesFound(stats: PlayerStats): string[] { return stats.cluesFound; }
    public static getDiscoveredPOIs(stats: PlayerStats): string[] { return stats.discoveredPOIs; }
    public static getSeenEnemies(stats: PlayerStats): number[] { return stats.seenEnemies; }
    public static getSeenBosses(stats: PlayerStats): number[] { return stats.seenBosses; }
    public static getDeadBossIndices(stats: PlayerStats): number[] { return stats.deadBossIndices || []; }
    public static getRescuedFamilyIndices(stats: PlayerStats): number[] { return stats.rescuedFamilyIndices; }
    public static getTrackedChallengeIds(stats: PlayerStats): number[] { return stats.trackedChallengeIds; }
    public static getChallengeTier(stats: PlayerStats, id: ChallengeID): number { return stats.challengeTiers[id] | 0; }
    public static getActivePassives(stats: PlayerStats): number[] { return stats.activePassives; }
    public static getActiveBuffs(stats: PlayerStats): number[] { return stats.activeBuffs; }
    public static getActiveDebuffs(stats: PlayerStats): number[] { return stats.activeDebuffs; }
    public static getFamilyFoundCount(stats: PlayerStats): number { return stats.familyFoundCount | 0; }
    public static getTotalSkillPointsEarned(stats: PlayerStats): number { return stats.totalSkillPointsEarned | 0; }

    // ========================================================================
    // CORE STAT SHORTHANDS
    // ========================================================================

    public static getLevel(stats: PlayerStats): number { return StatsBridge.getStatInt(stats, PlayerStatID.LEVEL); }
    public static getExperience(stats: PlayerStats): number { return StatsBridge.getStatInt(stats, PlayerStatID.CURRENT_XP); }
    public static getNextLevelExperience(stats: PlayerStats): number { return StatsBridge.getStatInt(stats, PlayerStatID.NEXT_LEVEL_XP); }
    public static getScrap(stats: PlayerStats): number { return StatsBridge.getStatInt(stats, PlayerStatID.SCRAP); }
    public static getSkillPoints(stats: PlayerStats): number { return StatsBridge.getStatInt(stats, PlayerStatID.SKILL_POINTS); }
    public static getChallengePoints(stats: PlayerStats): number { return StatsBridge.getStatInt(stats, PlayerStatID.CHALLENGE_POINTS); }
    public static getTotalChallengePoints(stats: PlayerStats): number { return StatsBridge.getStatInt(stats, PlayerStatID.TOTAL_CHALLENGE_POINTS); }
    public static getSectorsCompleted(stats: PlayerStats): number { return stats.sectorsCompleted | 0; }
    public static getTotalKills(stats: PlayerStats): number { return StatsBridge.getStatInt(stats, PlayerStatID.TOTAL_KILLS); }
    public static getTotalGameTime(stats: PlayerStats): number { return StatsBridge.getStatFloat(stats, PlayerStatID.TOTAL_GAME_TIME); }
    public static getMaxHP(stats: PlayerStats): number { return StatsBridge.getStatInt(stats, PlayerStatID.MAX_HP); }
    public static getMaxStamina(stats: PlayerStats): number { return StatsBridge.getStatInt(stats, PlayerStatID.MAX_STAMINA); }
    public static getSpeed(stats: PlayerStats): number { return StatsBridge.getStatFloat(stats, PlayerStatID.SPEED); }

    /**
     * Creates a deep clone of the PlayerStats object, including all TypedArrays.
     * Essential for UI transactional state (e.g. Camp stations) to allow "Cancel" functionality
     * without polluting the original engine-level telemetry buffers.
     */
    public static deepCloneStats(stats: PlayerStats): PlayerStats {
        const clone = { ...stats } as PlayerStats;

        // PERFORMANCE FIX: Use .slice() instead of new TypedArray() to invoke fast C++ memcpy in V8
        clone.statsBuffer = stats.statsBuffer.slice();
        clone.effectDurations = stats.effectDurations.slice();
        clone.effectMaxDurations = stats.effectMaxDurations.slice();
        clone.effectIntensities = stats.effectIntensities.slice();

        clone.weaponKills = stats.weaponKills.slice();
        clone.weaponDamageDealt = stats.weaponDamageDealt.slice();
        clone.weaponShotsFired = stats.weaponShotsFired.slice();
        clone.weaponShotsHit = stats.weaponShotsHit.slice();
        clone.weaponTimeActive = stats.weaponTimeActive.slice();
        clone.weaponEngagementDistSq = stats.weaponEngagementDistSq.slice();

        clone.perkTimesGained = stats.perkTimesGained.slice();
        clone.perkDamageAbsorbed = stats.perkDamageAbsorbed.slice();
        clone.perkDamageDealt = stats.perkDamageDealt.slice();
        clone.perkDebuffsCleansed = stats.perkDebuffsCleansed.slice();

        clone.enemyKills = stats.enemyKills.slice();
        clone.deathsByEnemyType = stats.deathsByEnemyType.slice();
        clone.incomingDamageBuffer = stats.incomingDamageBuffer.slice();

        clone.challengeTiers = stats.challengeTiers.slice();
        clone.discoveredPerksMap = stats.discoveredPerksMap.slice();

        // PERFORMANCE FIX: Use .slice() instead of spread operator [...] to avoid JS iterator overhead
        clone.activePassives = stats.activePassives.slice();
        clone.activeBuffs = stats.activeBuffs.slice();
        clone.activeDebuffs = stats.activeDebuffs.slice();
        clone.collectiblesDiscovered = stats.collectiblesDiscovered.slice();
        clone.viewedCollectibles = stats.viewedCollectibles ? stats.viewedCollectibles.slice() : [];
        clone.cluesFound = stats.cluesFound.slice();
        clone.seenEnemies = stats.seenEnemies.slice();
        clone.seenBosses = stats.seenBosses.slice();
        clone.discoveredPOIs = stats.discoveredPOIs.slice();
        clone.rescuedFamilyIndices = stats.rescuedFamilyIndices.slice();
        clone.trackedChallengeIds = stats.trackedChallengeIds.slice();

        // Clone Three.js objects
        // In UI context, .clone() is acceptable since it only happens once upon opening the menu.
        clone.velocity = stats.velocity.clone();

        return clone;
    }

}