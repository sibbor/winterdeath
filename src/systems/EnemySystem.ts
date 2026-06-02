import { System, SystemID } from './System';
import { GameSessionLogic } from '../game/session/GameSessionLogic';
import { EnemyManager } from '../entities/enemies/EnemyManager';
import { PlayerStatusFlags } from '../types/CareerStats';
import { INITIAL_ENEMY_POOL } from '../content/constants';
import { DamageID, DamageType, EnemyAttackType } from '../entities/player/CombatTypes';
import { StatusEffectID } from '../types/StatusEffects';
import { EnemyPoolState } from '../core/state/EnemyPool';
import { EnemyDeathState } from '../entities/enemies/EnemyTypes';

// --- TYPE DEFINITIONS ---
interface Callbacks {
    gainXp: (amount: number) => void;
    onBossKilled: (id: number) => void;
    onPlayerHit: (damage: number, attacker: any, damageType: DamageType, damageSource: DamageID, isDoT?: boolean, effectType?: StatusEffectID, duration?: number, intensity?: number, specificAttackType?: EnemyAttackType) => void;
}

/**
 * EnemySystem
 * Orchestrates the Zero-GC contiguous enemy pool and logic updates.
 */
export class EnemySystem implements System {
    readonly systemId = SystemID.ENEMY_SYSTEM;
    id = 'enemy_system';
    isFixedStep = true;

    private currentSession: GameSessionLogic | null = null;

    constructor(
        private callbacks: Callbacks,
        private initialPoolSize: number = INITIAL_ENEMY_POOL
    ) { }

    init(session: GameSessionLogic) {
        this.currentSession = session;
        EnemyManager.init(session, this.initialPoolSize);
    }

    update(session: GameSessionLogic, delta: number, simTime: number, renderTime: number) {
        this.currentSession = session;
        const state = session.state;

        if ((state.combat.statusFlags & PlayerStatusFlags.DEAD) !== 0) return;

        // --- PHASE 9: DEFERRED CLEANUP (Zero-GC sweep) ---
        // We clean up at the START of the frame before logic updates
        this.syncDeferredRecycle();

        // --- PHASE 6: CONTIGUOUS DRIVER ---
        // We delegate the heavy lifting to EnemyManager, which now uses a flat pool.
        EnemyManager.update(session, delta, simTime, renderTime);

        // Perform final animation processing and entity disposal
        EnemyManager.cleanupDeadEnemies(session, delta, simTime);
    }

    /**
     * PHASE 9: DEFERRED RECYCLE SWEEP
     * Iterates backwards through the active pool to safely perform Swap-and-Go on dead entities.
     */
    private syncDeferredRecycle() {
        const pool = EnemyPoolState;
        for (let i = pool.activeCount - 1; i >= 0; i--) {
            if (pool.deathState[i] === EnemyDeathState.DEAD) {
                EnemyManager.recycleEnemy(i);
            }
        }
    }

    clear() {
        this.currentSession = null;
        EnemyManager.clear();
    }
}
