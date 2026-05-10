import { GameSessionLogic } from '../game/session/GameSessionLogic';
import { System, SystemID } from './System';
import { DamageID } from '../entities/player/CombatTypes';
import { StatWeaponIndex, PlayerStatID, StatEnemyIndex, TELEMETRY_SOURCES_COUNT, TELEMETRY_ATTACKS_PER_SOURCE, TELEMETRY_BUFFER_SIZE, TelemetrySourceOffset } from '../entities/player/PlayerTypes';
import { COMBAT, MAX_ENTITIES } from '../content/constants';

// Zero-GC: Pre-allocate boss keys to prevent template literal string allocations during runtime
const MAX_BOSS_IDS = MAX_ENTITIES.MAX_BOSS_IDS;
const _bossKeyCache: string[] = new Array(MAX_BOSS_IDS);
for (let i = 0; i < MAX_BOSS_IDS; i++) {
    _bossKeyCache[i] = `Boss_${i}`;
}

export class DamageTrackerSystem implements System {
    readonly systemId = SystemID.DAMAGE_TRACKER;
    id = 'damage_tracker_system';
    enabled = true;
    persistent = false;

    private currentKillstreak = 0;

    init(session: GameSessionLogic) {
        this.currentKillstreak = 0;
    }

    update(session: GameSessionLogic, delta: number, simTime: number, renderTime: number) {
        if (!session || !session.engine || !session.state) return;
        // --- TRACK WEAPON USAGE (TIME ACTIVE) ---
        const state = session.state;
        const activeWeapon = state.activeWeapon;
        if (activeWeapon !== DamageID.NONE) {
            const idx = activeWeapon as number;
            //  HARDENING: Strict bounds check (64 slots)
            if (idx >= 0 && idx < StatWeaponIndex.COUNT) {
                state.sessionStats.weaponTimeActive[idx] += delta;
            }
        }
    }

    /**
     * Guards against recording TOOL/RADIO stats.
     */
    private isTechnical(id: DamageID): boolean {
        return id === DamageID.RADIO || id === DamageID.NONE || 
               id === DamageID.RUSH || id === DamageID.DODGE || 
               id === DamageID.VEHICLE;
    }

    /**
     * Records damage taken by the player.
     */
    recordIncomingDamage(
        session: GameSessionLogic,
        amount: number,
        sourceId: DamageID,
        attackId: number,
        isBoss: boolean = false
    ) {
        if (this.isTechnical(sourceId)) return;

        const state = session.state;
        const stats = state.sessionStats;
        const playerStats = state.statsBuffer;

        stats.damageTaken += amount;
        playerStats[PlayerStatID.TOTAL_DAMAGE_TAKEN] += amount;

        if (isBoss) stats.bossDamageTaken += amount;

        // --- NEW BUFFERED TELEMETRY (Zero-GC) ---
        // Mapping: 
        // Sources (TelemetrySourceOffset.ENEMY): EnemyType (0-15)
        // Sources (TelemetrySourceOffset.BOSS): BossID (16-23)
        // Sources (TelemetrySourceOffset.ENVIRONMENT): DamageID (24-63)

        //  HARDENING: Strict clamping for SourceID and AttackID
        const sIdx = sourceId < 0 ? 0 : (sourceId >= TELEMETRY_SOURCES_COUNT ? TELEMETRY_SOURCES_COUNT - 1 : sourceId);
        const aIdx = attackId < 0 ? 0 : (attackId >= TELEMETRY_ATTACKS_PER_SOURCE ? TELEMETRY_ATTACKS_PER_SOURCE - 1 : attackId);
        const bufferIdx = (sIdx * TELEMETRY_ATTACKS_PER_SOURCE) + aIdx;

        // Final sanity check before write
        if (bufferIdx >= 0 && bufferIdx < TELEMETRY_BUFFER_SIZE) {
            stats.incomingDamageBuffer[bufferIdx] += amount;
            state.incomingDamageBuffer[bufferIdx] += amount;
        }
    }

    /**
     * Records damage dealt by the player to actors.
     */
    recordOutgoingDamage(
        session: GameSessionLogic,
        amount: number,
        weaponId: DamageID,
        isBoss: boolean = false
    ) {
        if (this.isTechnical(weaponId)) return;

        const stats = session.state.sessionStats;
        const playerStats = session.state.statsBuffer;

        stats.damageDealt += amount;
        playerStats[PlayerStatID.TOTAL_DAMAGE_DEALT] += amount;

        if (isBoss) stats.bossDamageDealt += amount;

        const idx = weaponId as number;
        if (idx >= 0 && idx < StatWeaponIndex.COUNT) {
            stats.weaponDamageDealt[idx] += amount;
        }
    }

    /**
     * Records a shot fired by the player.
     */
    recordShot(session: GameSessionLogic, weaponId: DamageID) {
        if (this.isTechnical(weaponId)) return;

        const stats = session.state.sessionStats;
        const playerStats = session.state.statsBuffer;

        stats.shotsFired++;
        playerStats[PlayerStatID.TOTAL_SHOTS_FIRED]++;

        const idx = weaponId as number;
        if (idx >= 0 && idx < StatWeaponIndex.COUNT) {
            stats.weaponShotsFired[idx]++;
        }
    }

    /**
     * Records a shot hit by the player.
     */
    recordHit(session: GameSessionLogic, weaponId: DamageID) {
        if (this.isTechnical(weaponId)) return;

        const stats = session.state.sessionStats;
        const playerStats = session.state.statsBuffer;

        stats.shotsHit++;
        playerStats[PlayerStatID.TOTAL_SHOTS_HIT]++;

        const idx = weaponId as number;
        if (idx >= 0 && idx < StatWeaponIndex.COUNT) {
            stats.weaponShotsHit[idx]++;
        }
    }

    /**
     * Records an enemy kill.
     */
    recordKill(
        session: GameSessionLogic,
        enemyType: number,
        isBoss: boolean = false,
        bossId?: number,
        weaponId?: DamageID,
        distSq?: number
    ) {
        if (weaponId !== undefined && this.isTechnical(weaponId)) {
            // Still record the general kill, but skip the weapon-specific kill count
            const stats = session.state.sessionStats;
            const playerStats = session.state.statsBuffer;

            stats.kills++;
            playerStats[PlayerStatID.TOTAL_KILLS]++;
            
            this.currentKillstreak++;
            const maxK = playerStats[PlayerStatID.LONGEST_KILLSTREAK];
            if (this.currentKillstreak > maxK) {
                playerStats[PlayerStatID.LONGEST_KILLSTREAK] = this.currentKillstreak;
                stats.maxKillstreak = this.currentKillstreak;
            }

            if (enemyType >= 0 && enemyType < StatEnemyIndex.COUNT) {
                stats.enemyKills[enemyType]++;
                session.state.enemyKills[enemyType]++;
            }
            return;
        }

        const stats = session.state.sessionStats;
        const playerStats = session.state.statsBuffer;

        stats.kills++;
        playerStats[PlayerStatID.TOTAL_KILLS]++;

        // Long Range Kill: > 25m (625 units squared)
        if (distSq !== undefined && distSq > COMBAT.LONG_RANGE_SQ) {
            playerStats[PlayerStatID.TOTAL_LONG_RANGE_KILLS]++;
        }

        // Killstreak handling
        this.currentKillstreak++;
        const maxK = playerStats[PlayerStatID.LONGEST_KILLSTREAK];
        if (this.currentKillstreak > maxK) {
            playerStats[PlayerStatID.LONGEST_KILLSTREAK] = this.currentKillstreak;
            stats.maxKillstreak = this.currentKillstreak;
        }

        // Engagement distance (Squared)
        if (distSq !== undefined) {
            stats.engagementDistSqKills += distSq;
            playerStats[PlayerStatID.TOTAL_ENGAGEMENT_DISTANCE_SQ] += distSq;
        }

        if (weaponId && (weaponId as number) !== DamageID.NONE) {
            const idx = weaponId as number;
            if (idx >= 0 && idx < StatWeaponIndex.COUNT) {
                stats.weaponKills[idx]++;
                if (distSq !== undefined) {
                    stats.weaponEngagementDistSq[idx] += distSq;
                }
            }
        }

        if (enemyType >= 0 && enemyType < StatEnemyIndex.COUNT) {
            stats.enemyKills[enemyType]++;
            session.state.enemyKills[enemyType]++;
        }

        if (isBoss && bossId !== undefined) {
            // Bosses also count in the enemyKills buffer under BOSS index
            if (StatEnemyIndex.BOSS >= 0 && StatEnemyIndex.BOSS < StatEnemyIndex.COUNT) {
                stats.enemyKills[StatEnemyIndex.BOSS]++;
                session.state.enemyKills[StatEnemyIndex.BOSS]++;
            }
            // Record killing blow details for the victory screen
            stats.killingBlowWeapon = weaponId;
            stats.killingBlowSource = enemyType as number;
        }
    }

    /**
     * Records a player death.
     */
    recordPlayerDeath(session: GameSessionLogic, sourceId: number, attackId: number) {
        const stats = session.state.sessionStats;
        const playerStats = session.state.statsBuffer;
        const globalStats = session.state;

        playerStats[PlayerStatID.TOTAL_DEATHS]++;

        // sourceId < 16 usually indicates an enemy type (EnemyType enum)
        let enemyTypeIdx = -1;
        if (sourceId < TelemetrySourceOffset.BOSS) {
            enemyTypeIdx = sourceId;
        } else if (sourceId < TelemetrySourceOffset.ENVIRONMENT) {
            enemyTypeIdx = StatEnemyIndex.BOSS;
        }

        if (enemyTypeIdx >= 0 && enemyTypeIdx < StatEnemyIndex.COUNT) {
            stats.enemyDeaths[enemyTypeIdx]++;
            globalStats.deathsByEnemyType[enemyTypeIdx]++;
        }
    }

    /**
     * Resets killstreak (e.g. on player hit or session start)
     */
    resetKillstreak() {
        this.currentKillstreak = 0;
    }

    /**
     * Records XP gained during the session.
     */
    recordXp(session: GameSessionLogic, amount: number) {
        session.state.sessionStats.xpGained += amount;
        // Global XP is handled by PlayerStatsSystem or LevelSystem
    }

    /**
     * Records SP earned during the session.
     */
    recordSp(session: GameSessionLogic, amount: number) {
        session.state.sessionStats.spGained += amount;
        session.state.statsBuffer[PlayerStatID.SKILL_POINTS] += amount;
    }

    /**
     * Records a throwable thrown by the player.
     */
    recordThrowable(session: GameSessionLogic, weaponId: DamageID) {
        if (this.isTechnical(weaponId)) return;

        const stats = session.state.sessionStats;
        const playerStats = session.state.statsBuffer;

        stats.throwablesThrown++;
        playerStats[PlayerStatID.TOTAL_THROWABLES_THROWN]++;

        const idx = weaponId as number;
        if (idx >= 0 && idx < StatWeaponIndex.COUNT) {
            stats.weaponShotsFired[idx]++; // For throwables, fired = hit attempt
        }
    }

    /**
     * Records how many unique enemies were hit by a single explosive.
     */
    recordUniqueEnemiesHitByExplosive(session: GameSessionLogic, count: number) {
        session.state.sessionStats.uniqueEnemiesHitByExplosives += count;
        session.state.statsBuffer[PlayerStatID.TOTAL_UNIQUE_ENEMIES_HIT_BY_EXPLOSIVES] += count;
    }

    /**
     * Records an enemy being gibbed.
     */
    recordGib(session: GameSessionLogic) {
        session.state.sessionStats.gibbedEnemies++;
        session.state.statsBuffer[PlayerStatID.TOTAL_GIBBED]++;
    }

    /**
     * Records a dodge performed by the player.
     */
    recordDodge(session: GameSessionLogic) {
        session.state.sessionStats.dodges++;
        session.state.statsBuffer[PlayerStatID.TOTAL_DODGES]++;
    }

    /**
     * Records a rush initiation by the player.
     */
    recordRush(session: GameSessionLogic) {
        session.state.sessionStats.rushes++;
        session.state.statsBuffer[PlayerStatID.TOTAL_RUSHES]++;
    }

    /**
     * Records rush distance traveled.
     */
    recordRushDistance(session: GameSessionLogic, distance: number) {
        session.state.sessionStats.rushDistance += distance;
        session.state.statsBuffer[PlayerStatID.TOTAL_RUSH_DISTANCE] += distance;
    }

    /**
     * Records total distance traveled.
     */
    recordDistance(session: GameSessionLogic, distance: number) {
        session.state.sessionStats.distanceTraveled += distance;
        session.state.statsBuffer[PlayerStatID.TOTAL_DISTANCE_TRAVELED] += distance;
    }

    /**
     * Records a crisis save (adrenaline patch trigger).
     */
    recordCrisisSave(session: GameSessionLogic) {
        session.state.sessionStats.crisisSaves++;
        session.state.statsBuffer[PlayerStatID.TOTAL_CRISIS_SAVES]++;
    }

    /**
     * Records buff time.
     */
    recordBuffTime(session: GameSessionLogic, delta: number) {
        session.state.sessionStats.buffTime += delta;
        session.state.statsBuffer[PlayerStatID.TOTAL_BUFF_TIME] += delta;
    }

    /**
     * Records debuffs resisted/cleansed.
     */
    recordDebuffsResisted(session: GameSessionLogic, count: number) {
        session.state.sessionStats.debuffsResisted += count;
        session.state.statsBuffer[PlayerStatID.TOTAL_DEBUFFS_RESISTED] += count;
    }

    clear() {
        // System state is held in session.state, no local cleanup needed
    }
}
