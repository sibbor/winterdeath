import { GameSessionLogic } from '../game/session/GameSessionLogic';
import { System } from './System';

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
     * V8-Opt: Keys are pre-allocated.
     */
    recordIncomingDamage(
        session: GameSessionLogic,
        amount: number,
        sourceName: string,
        attackName: string,
        isBoss: boolean = false
    ) {
        const stats = session.state.sessionStats;
        stats.damageTaken += amount;

        const breakdown = stats.incomingDamageBreakdown;
        const source = breakdown[sourceName];
        if (source) {
            // attackName can be dynamic from enemy logic, but we pre-allocated common ones.
            // If it's missing, we add it (V8 dictionary penalty once, better than missing data).
            source[attackName] = (source[attackName] || 0) + amount;
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
    recordKill(session: GameSessionLogic, enemyType: string, isBoss: boolean = false) {
        const stats = session.state.sessionStats;
        stats.kills++;
        
        // Generic generic boss tracker
        if (isBoss) {
            stats.killsByType['Boss'] = (stats.killsByType['Boss'] || 0) + 1;
        }

        // Specific type tracker (Pre-allocated keys)
        if (stats.killsByType[enemyType] !== undefined) {
            stats.killsByType[enemyType]++;
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
