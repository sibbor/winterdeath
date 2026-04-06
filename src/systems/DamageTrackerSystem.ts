import { GameSessionLogic } from '../game/session/GameSessionLogic';
import { System } from './System';
import { EnemyType } from '../entities/enemies/EnemyTypes';
import { DamageID } from '../entities/player/CombatTypes';

export class DamageTrackerSystem implements System {
    id = 'damage_tracker_system';

    init(session: GameSessionLogic) {
        // Breakdowns are now pre-allocated in GameSessionLogic.createInitialState
    }

    update(session: GameSessionLogic, dt: number, now: number) {
        // Passive logger: No per-frame logic required
    }

    /**
     * Records damage taken by the player.
     * V8-Opt: Keys are pre-allocated in GameSessionLogic.
     */
    recordIncomingDamage(
        session: GameSessionLogic,
        amount: number,
        sourceName: DamageID,
        attackType: number,
        isBoss: boolean = false
    ) {
        const stats = session.state.sessionStats;
        stats.damageTaken += amount;
        if (isBoss) stats.bossDamageTaken += amount;

        const breakdown = stats.incomingDamageBreakdown;
        const source = (breakdown as any)[sourceName];
        if (source) {
            source[attackType] = (source[attackType] || 0) + amount;
        }
    }

    /**
     * Records damage dealt by the player to actors.
     */
    recordOutgoingDamage(
        session: GameSessionLogic,
        amount: number,
        weaponName: string,
        isBoss: boolean = false
    ) {
        const stats = session.state.sessionStats;
        stats.damageDealt += amount;
        if (isBoss) stats.bossDamageDealt += amount;

        const breakdown = stats.outgoingDamageBreakdown;
        // Weapon keys are pre-allocated for all known types
        if (breakdown[weaponName] !== undefined) {
            breakdown[weaponName] += amount;
        }
    }

    /**
     * Records a shot fired by the player.
     */
    recordShot(session: GameSessionLogic, weaponName: string) {
        const stats = session.state.sessionStats;
        stats.shotsFired++;
    }

    /**
     * Records a shot hit by the player.
     */
    recordHit(session: GameSessionLogic, weaponName: string) {
        const stats = session.state.sessionStats;
        stats.shotsHit++;
    }

    /**
     * Records an enemy kill.
     */
    recordKill(session: GameSessionLogic, enemyType: number | string, isBoss: boolean = false, bossId?: number) {
        const stats = session.state.sessionStats;
        stats.kills++;
        
        let key = typeof enemyType === 'number' ? EnemyType[enemyType] : enemyType;
        
        if (isBoss && bossId !== undefined) {
            key = `Boss_${bossId}`;
            // Also update the legacy generic boss stat for backward compatibility if needed
            stats.killsByType['Boss'] = (stats.killsByType['Boss'] || 0) + 1;
        }

        if (key && stats.killsByType[key] !== undefined) {
            stats.killsByType[key]++;
        }
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
    recordThrowable(session: GameSessionLogic) {
        session.state.sessionStats.throwablesThrown++;
    }

    clear() {
    }
}
