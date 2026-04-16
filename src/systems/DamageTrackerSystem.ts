import { GameSessionLogic } from '../game/session/GameSessionLogic';
import { System } from './System';
import { EnemyType } from '../entities/enemies/EnemyTypes';
import { DamageID } from '../entities/player/CombatTypes';
import { StatWeaponIndex, PlayerStatID } from '../entities/player/PlayerTypes';

// Zero-GC: Pre-allocate boss keys to prevent template literal string allocations during runtime
const MAX_BOSS_IDS = 32;
const _bossKeyCache: string[] = new Array(MAX_BOSS_IDS);
for (let i = 0; i < MAX_BOSS_IDS; i++) {
    _bossKeyCache[i] = `Boss_${i}`;
}

export class DamageTrackerSystem implements System {
    id = 'damage_tracker_system';

    private currentKillstreak = 0;

    init(session: GameSessionLogic) {
        this.currentKillstreak = 0;
    }

    update(session: GameSessionLogic, delta: number, simTime: number, renderTime: number) {
        // --- TRACK WEAPON USAGE (TIME ACTIVE) ---
        const state = session.state;
        const activeWeapon = state.activeWeapon;
        if (activeWeapon !== DamageID.NONE && activeWeapon !== DamageID.RADIO) {
            const idx = activeWeapon - 1;
            if (idx >= 0 && idx < StatWeaponIndex.COUNT) {
                state.sessionStats.weaponTimeActive[idx] += delta;
            }
        }
    }

    /**
     * Guards against recording TOOL/RADIO stats.
     */
    private isTechnical(id: DamageID): boolean {
        return id === DamageID.RADIO || id === DamageID.NONE;
    }

    /**
     * Records damage taken by the player.
     */
    recordIncomingDamage(
        session: GameSessionLogic,
        amount: number,
        sourceName: DamageID,
        attackType: number,
        isBoss: boolean = false
    ) {
        if (this.isTechnical(sourceName)) return;

        const stats = session.state.sessionStats;
        stats.damageTaken += amount;
        if (isBoss) stats.bossDamageTaken += amount;

        const breakdown = stats.incomingDamageBreakdown;
        if (!breakdown[sourceName]) {
            breakdown[sourceName] = {};
        }
        const source = breakdown[sourceName];

        if (source) {
            if (source[attackType] !== undefined) {
                source[attackType] += amount;
            } else {
                source[attackType] = amount;
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
        if (this.isTechnical(weaponId)) return;

        const stats = session.state.sessionStats;
        stats.damageDealt += amount;
        if (isBoss) stats.bossDamageDealt += amount;

        const idx = weaponId - 1;
        if (idx >= 0 && idx < StatWeaponIndex.COUNT) {
            stats.weaponDamageDealt[idx] += amount;
        }

        // Track specific weapon breakdown for the report
        if (stats.outgoingDamageBreakdown[weaponId] !== undefined) {
            stats.outgoingDamageBreakdown[weaponId] += amount;
        } else {
            stats.outgoingDamageBreakdown[weaponId] = amount;
        }
    }

    /**
     * Records a shot fired by the player.
     */
    recordShot(session: GameSessionLogic, weaponId: DamageID) {
        if (this.isTechnical(weaponId)) return;

        const stats = session.state.sessionStats;
        stats.shotsFired++;

        const idx = weaponId - 1;
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
        stats.shotsHit++;

        const idx = weaponId - 1;
        if (idx >= 0 && idx < StatWeaponIndex.COUNT) {
            stats.weaponShotsHit[idx]++;
        }
    }

    /**
     * Records an enemy kill.
     */
    recordKill(
        session: GameSessionLogic,
        enemyType: number | string,
        isBoss: boolean = false,
        bossId?: number,
        weaponId?: DamageID,
        distSq?: number
    ) {
        const stats = session.state.sessionStats;
        stats.kills++;

        // Killstreak handling
        this.currentKillstreak++;
        if (this.currentKillstreak > stats.maxKillstreak) {
            stats.maxKillstreak = this.currentKillstreak;
        }

        // Engagement distance (Squared)
        if (distSq !== undefined) {
            stats.engagementDistSqKills += distSq;
        }

        if (weaponId && !this.isTechnical(weaponId)) {
            const idx = weaponId - 1;
            if (idx >= 0 && idx < StatWeaponIndex.COUNT) {
                stats.weaponKills[idx]++;
                if (distSq !== undefined) {
                    stats.weaponEngagementDistSq[idx] += distSq;
                }
            }
        }

        let key = typeof enemyType === 'number' ? EnemyType[enemyType] : enemyType;

        if (isBoss && bossId !== undefined) {
            key = bossId < MAX_BOSS_IDS ? _bossKeyCache[bossId] : `Boss_${bossId}`;
            if (stats.killsByType['Boss'] !== undefined) {
                stats.killsByType['Boss']++;
            } else {
                stats.killsByType['Boss'] = 1;
            }
        }

        if (key && stats.killsByType[key] !== undefined) {
            stats.killsByType[key]++;
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
    }

    /**
     * Records SP earned during the session.
     */
    recordSp(session: GameSessionLogic, amount: number) {
        session.state.sessionStats.spGained += amount;
    }

    /**
     * Records a throwable thrown by the player.
     */
    recordThrowable(session: GameSessionLogic, weaponId: DamageID) {
        if (this.isTechnical(weaponId)) return;

        const stats = session.state.sessionStats;
        stats.throwablesThrown++;

        const idx = weaponId - 1;
        if (idx >= 0 && idx < StatWeaponIndex.COUNT) {
            stats.weaponShotsFired[idx]++; // For throwables, fired = hit attempt
        }
    }

    clear() {
        // System state is held in session.state, no local cleanup needed
    }
}