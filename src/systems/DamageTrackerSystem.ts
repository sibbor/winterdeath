import { GameSessionLogic } from '../game/session/GameSessionLogic';
import { System, SystemID } from './System';
import { DamageID } from '../entities/player/CombatTypes';
import { StatWeaponIndex, StatID, StatEnemyIndex, TELEMETRY_SOURCES_COUNT, TELEMETRY_ATTACKS_PER_SOURCE, TELEMETRY_BUFFER_SIZE, TelemetrySourceOffset } from '../types/CareerStats';
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
        session.damageTracker = this;
    }

    update(session: GameSessionLogic, delta: number, simTime: number, renderTime: number) {
        if (!session || !session.engine || !session.state || session.state.world.isPlayground) return;
        // --- TRACK WEAPON USAGE (TIME ACTIVE) ---
        const state = session.state;
        const activeWeapon = state.combat.activeWeapon;
        if ((activeWeapon as number) !== 0) {
            const idx = activeWeapon as number;
            //  HARDENING: Strict bounds check (64 slots)
            if (idx >= 0 && idx < StatWeaponIndex.COUNT) {
                state.sessionStats.outgoingTimeActiveBuffer[idx] += delta;
                if (state.combat.outgoingTimeActiveBuffer) {
                    state.combat.outgoingTimeActiveBuffer[idx] += delta;
                }
            }
        }
    }

    /**
     * Guards against recording TOOL/RADIO stats.
     */
    private isTechnical(id: DamageID): boolean {
        return id === DamageID.NONE;
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
        if (!session || !session.state || session.state.world.isPlayground) return;
        if (this.isTechnical(sourceId)) return;

        const state = session.state;
        const stats = state.sessionStats;
        const playerStats = state.player.statsBuffer;

        stats.damageTaken += amount;
        playerStats[StatID.TOTAL_DAMAGE_TAKEN] += amount;

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
            if (state.careerStats?.incomingDamageBuffer) {
                state.careerStats.incomingDamageBuffer[bufferIdx] += amount;
            }
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
        if (!session || !session.state || session.state.world.isPlayground) return;
        if (this.isTechnical(weaponId)) return;

        const stats = session.state.sessionStats;
        const playerStats = session.state.player.statsBuffer;

        stats.damageDealt += amount;
        playerStats[StatID.TOTAL_DAMAGE_DEALT] += amount;

        if (isBoss) stats.bossDamageDealt += amount;

        const idx = weaponId as number;
        if (idx >= 0 && idx < StatWeaponIndex.COUNT) {
            stats.outgoingDamageBuffer[idx] += amount;
            if (session.state.combat.outgoingDamageBuffer) {
                session.state.combat.outgoingDamageBuffer[idx] += amount;
            }
        }
    }

    /**
     * Records a shot fired by the player.
     */
    recordShot(session: GameSessionLogic, weaponId: DamageID) {
        if (!session || !session.state || session.state.world.isPlayground) return;
        if (this.isTechnical(weaponId)) return;

        const stats = session.state.sessionStats;
        const playerStats = session.state.player.statsBuffer;

        stats.shotsFired++;
        playerStats[StatID.TOTAL_SHOTS_FIRED]++;

        const idx = weaponId as number;
        if (idx >= 0 && idx < StatWeaponIndex.COUNT) {
            stats.outgoingShotsFiredBuffer[idx]++;
            if (session.state.combat.outgoingShotsFiredBuffer) {
                session.state.combat.outgoingShotsFiredBuffer[idx]++;
            }
        }
    }

    /**
     * Records a shot hit by the player.
     */
    recordHit(session: GameSessionLogic, weaponId: DamageID) {
        if (!session || !session.state || session.state.world.isPlayground) return;
        if (this.isTechnical(weaponId)) return;

        const stats = session.state.sessionStats;
        const playerStats = session.state.player.statsBuffer;

        stats.shotsHit++;
        playerStats[StatID.TOTAL_SHOTS_HIT]++;

        const idx = weaponId as number;
        if (idx >= 0 && idx < StatWeaponIndex.COUNT) {
            stats.outgoingShotsHitBuffer[idx]++;
            if (session.state.combat.outgoingShotsHitBuffer) {
                session.state.combat.outgoingShotsHitBuffer[idx]++;
            }
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
        if (!session || !session.state || session.state.world.isPlayground) return;
        if (weaponId !== undefined && this.isTechnical(weaponId)) {
            // Still record the general kill, but skip the weapon-specific kill count
            const stats = session.state.sessionStats;
            const playerStats = session.state.player.statsBuffer;

            stats.kills++;
            playerStats[StatID.TOTAL_KILLS]++;

            this.currentKillstreak++;
            const maxK = playerStats[StatID.LONGEST_KILLSTREAK];
            if (this.currentKillstreak > maxK) {
                playerStats[StatID.LONGEST_KILLSTREAK] = this.currentKillstreak;
                stats.maxKillstreak = this.currentKillstreak;
            }

            if (enemyType >= 0 && enemyType < StatEnemyIndex.COUNT) {
                stats.enemyKills[enemyType]++;
                session.state.enemies.enemyKills[enemyType]++;
            }
            return;
        }

        const stats = session.state.sessionStats;
        const playerStats = session.state.player.statsBuffer;

        stats.kills++;
        playerStats[StatID.TOTAL_KILLS]++;

        // Long Range Kill: > 25m (625 units squared)
        if (distSq !== undefined && distSq > COMBAT.LONG_RANGE_SQ) {
            playerStats[StatID.TOTAL_LONG_RANGE_KILLS]++;
        }

        // Killstreak handling
        this.currentKillstreak++;
        const maxK = playerStats[StatID.LONGEST_KILLSTREAK];
        if (this.currentKillstreak > maxK) {
            playerStats[StatID.LONGEST_KILLSTREAK] = this.currentKillstreak;
            stats.maxKillstreak = this.currentKillstreak;
        }

        // Engagement distance (Squared)
        if (distSq !== undefined) {
            stats.engagementDistSqKills += distSq;
            playerStats[StatID.TOTAL_ENGAGEMENT_DISTANCE_SQ] += distSq;
        }

        if (weaponId && (weaponId as number) !== DamageID.NONE) {
            const idx = weaponId as number;
            if (idx >= 0 && idx < StatWeaponIndex.COUNT) {
                stats.outgoingKillsBuffer[idx]++;
                if (session.state.combat.outgoingKillsBuffer) {
                    session.state.combat.outgoingKillsBuffer[idx]++;
                }
                if (distSq !== undefined) {
                    stats.outgoingEngagementDistSqBuffer[idx] += distSq;
                    if (session.state.combat.outgoingEngagementDistSqBuffer) {
                        session.state.combat.outgoingEngagementDistSqBuffer[idx] += distSq;
                    }
                }
            }
        }

        if (enemyType >= 0 && enemyType < StatEnemyIndex.COUNT) {
            stats.enemyKills[enemyType]++;
            session.state.enemies.enemyKills[enemyType]++;
        }

        if (isBoss && bossId !== undefined) {
            // Bosses also count in the enemyKills buffer under BOSS index
            if (StatEnemyIndex.BOSS >= 0 && StatEnemyIndex.BOSS < StatEnemyIndex.COUNT) {
                stats.enemyKills[StatEnemyIndex.BOSS]++;
                session.state.enemies.enemyKills[StatEnemyIndex.BOSS]++;
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
        if (!session || !session.state || session.state.world.isPlayground) return;
        const stats = session.state.sessionStats;
        const playerStats = session.state.player.statsBuffer;
        const globalStats = session.state;

        playerStats[StatID.TOTAL_DEATHS]++;

        // sourceId < 16 usually indicates an enemy type (EnemyType enum)
        let enemyTypeIdx = -1;
        if (sourceId < TelemetrySourceOffset.BOSS) {
            enemyTypeIdx = sourceId;
        } else if (sourceId < TelemetrySourceOffset.ENVIRONMENT) {
            enemyTypeIdx = StatEnemyIndex.BOSS;
        }

        if (enemyTypeIdx >= 0 && enemyTypeIdx < StatEnemyIndex.COUNT) {
            stats.enemyDeaths[enemyTypeIdx]++;
            globalStats.enemies.deathsByEnemyType[enemyTypeIdx]++;
        }
    }

    /**
     * Resets killstreak (e.g. on player hit or session start)
     */
    resetKillstreak() {
        this.currentKillstreak = 0;
    }


    /**
     * Records a throwable thrown by the player.
     */
    recordThrowable(session: GameSessionLogic, weaponId: DamageID) {
        if (!session || !session.state || session.state.world.isPlayground) return;
        if (this.isTechnical(weaponId)) return;

        const stats = session.state.sessionStats;
        const playerStats = session.state.player.statsBuffer;

        stats.throwablesThrown++;
        playerStats[StatID.TOTAL_THROWABLES_THROWN]++;

        const idx = weaponId as number;
        if (idx >= 0 && idx < StatWeaponIndex.COUNT) {
            stats.outgoingShotsFiredBuffer[idx]++; // For throwables, fired = hit attempt
            if (session.state.combat.outgoingShotsFiredBuffer) {
                session.state.combat.outgoingShotsFiredBuffer[idx]++;
            }
        }
    }

    /**
     * Records how many unique enemies were hit by a single explosive.
     */
    recordUniqueEnemiesHitByExplosive(session: GameSessionLogic, count: number) {
        if (!session || !session.state || session.state.world.isPlayground) return;
        session.state.sessionStats.uniqueEnemiesHitByExplosives += count;
        session.state.player.statsBuffer[StatID.TOTAL_UNIQUE_ENEMIES_HIT_BY_EXPLOSIVES] += count;
    }

    /**
     * Records an enemy being gibbed.
     */
    recordGib(session: GameSessionLogic, damageType?: DamageID) {
        if (!session || !session.state || session.state.world.isPlayground) return;
        session.state.sessionStats.gibbedEnemies++;
        session.state.player.statsBuffer[StatID.TOTAL_GIBBED]++;
        if (damageType === DamageID.SHOTGUN || damageType === DamageID.REVOLVER) {
            session.state.player.statsBuffer[StatID.TOTAL_GIBBED_BY_REVOLVER_SHOTGUN]++;
        }
    }

    /**
     * Records a dodge performed by the player.
     */
    recordDodge(session: GameSessionLogic) {
        if (!session || !session.state || session.state.world.isPlayground) return;
        session.state.sessionStats.dodges++;
        session.state.player.statsBuffer[StatID.TOTAL_DODGES]++;
    }

    /**
     * Records a rush initiation by the player.
     */
    recordRush(session: GameSessionLogic) {
        if (!session || !session.state || session.state.world.isPlayground) return;
        session.state.sessionStats.rushes++;
        session.state.player.statsBuffer[StatID.TOTAL_RUSHES]++;
    }

    /**
     * Records rush distance traveled.
     */
    recordRushDistance(session: GameSessionLogic, distance: number) {
        if (!session || !session.state || session.state.world.isPlayground) return;
        session.state.sessionStats.rushDistance += distance;
        session.state.player.statsBuffer[StatID.TOTAL_RUSH_DISTANCE] += distance;
    }

    /**
     * Records total distance traveled.
     */
    recordDistance(session: GameSessionLogic, distance: number) {
        if (!session || !session.state || session.state.world.isPlayground) return;
        session.state.sessionStats.distanceTraveled += distance;
        session.state.player.statsBuffer[StatID.TOTAL_DISTANCE_TRAVELED] += distance;
    }

    /**
     * Records a crisis save (adrenaline patch trigger).
     */
    recordCrisisSave(session: GameSessionLogic) {
        if (!session || !session.state || session.state.world.isPlayground) return;
        session.state.sessionStats.crisisSaves++;
        session.state.player.statsBuffer[StatID.TOTAL_CRISIS_SAVES]++;
    }

    /**
     * Records buff time.
     */
    recordBuffTime(session: GameSessionLogic, delta: number) {
        if (!session || !session.state || session.state.world.isPlayground) return;
        session.state.sessionStats.buffTime += delta;
        session.state.player.statsBuffer[StatID.TOTAL_BUFF_TIME] += delta;
    }

    /**
     * Records debuffs resisted/cleansed.
     */
    recordDebuffsResisted(session: GameSessionLogic, count: number) {
        if (!session || !session.state || session.state.world.isPlayground) return;
        session.state.sessionStats.debuffsResisted += count;
        session.state.player.statsBuffer[StatID.TOTAL_DEBUFFS_RESISTED] += count;
    }

    clear() {
        // System state is held in session.state, no local cleanup needed
    }
}
