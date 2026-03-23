import { GameSessionLogic } from '../game/session/GameSessionLogic';
import { System } from './System';

export class DamageTrackerSystem implements System {
    id = 'DamageTrackerSystem';

    init(session: GameSessionLogic) {
        // Initialization if needed
    }

    update(session: GameSessionLogic, dt: number, now: number) {
        // Continuous tracking logic if needed (e.g. DoT aggregation)
    }

    /**
     * Records damage taken by the player.
     */
    recordIncomingDamage(
        session: GameSessionLogic,
        amount: number,
        sourceName: string,
        attackName: string,
        isBoss: boolean = false
    ) {
        const state = session.state;

        // Update Session State
        state.damageTaken += amount;
        if (isBoss) state.bossDamageTaken += amount;

        if (!state.incomingDamageBreakdown) state.incomingDamageBreakdown = {};
        if (!state.incomingDamageBreakdown[sourceName]) state.incomingDamageBreakdown[sourceName] = {};

        state.incomingDamageBreakdown[sourceName][attackName] = (state.incomingDamageBreakdown[sourceName][attackName] || 0) + amount;

        // Update Persistence Stats
        if (state.stats) {
            const pStats = state.stats as any;
            if (!pStats.incomingDamageBreakdown) pStats.incomingDamageBreakdown = {};
            if (!pStats.incomingDamageBreakdown[sourceName]) pStats.incomingDamageBreakdown[sourceName] = {};

            pStats.incomingDamageBreakdown[sourceName][attackName] = (pStats.incomingDamageBreakdown[sourceName][attackName] || 0) + amount;
            pStats.totalDamageTaken += amount;
        }
    }

    /**
     * Records damage dealt by the player to enemies.
     */
    recordOutgoingDamage(
        session: GameSessionLogic,
        amount: number,
        weaponName: string,
        isBoss: boolean = false
    ) {
        const state = session.state;

        // Update Session State
        state.damageDealt += amount;
        if (isBoss) state.bossDamageDealt += amount;

        if (!state.outgoingDamageBreakdown) state.outgoingDamageBreakdown = {};
        state.outgoingDamageBreakdown[weaponName] = (state.outgoingDamageBreakdown[weaponName] || 0) + amount;

        // Reward XP (1 XP per point of damage)
        if (state.callbacks?.gainXp) {
            state.callbacks.gainXp(Math.ceil(amount));
        }

        // Update Persistence Stats
        if (state.stats) {
            const pStats = state.stats as any;
            if (!pStats.outgoingDamageBreakdown) pStats.outgoingDamageBreakdown = {};
            pStats.outgoingDamageBreakdown[weaponName] = (pStats.outgoingDamageBreakdown[weaponName] || 0) + amount;
            pStats.totalDamageDealt += amount;
        }
    }

    clear() {
    }
}
