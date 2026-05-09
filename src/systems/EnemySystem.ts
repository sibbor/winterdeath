import * as THREE from 'three';
import { System, SystemID } from './System';
import { EnemyFlags } from '../entities/enemies/EnemyBase';
import { ENTITY_STATUS } from '../content/constants';
import { GameSessionLogic } from '../game/session/GameSessionLogic';
import { EnemyManager } from '../entities/enemies/EnemyManager';
import { PlayerStatusFlags } from '../entities/player/PlayerTypes';
import { INITIAL_ENEMY_POOL } from '../content/constants';
import { FXParticleType, FXDecalType } from '../types/FXTypes';
import { FXSystem } from './FXSystem';
import { DamageID } from '../entities/player/CombatTypes';
import { Enemy } from '../entities/enemies/EnemyTypes';
import { WorldLootSystem } from './WorldLootSystem';
import { GRID_CELL_POWER, GRID_RESOLUTION, GRID_OFFSET } from '../content/constants';
import { EnemyPoolState } from '../core/state/EnemyPool';

// --- TYPE DEFINITIONS ---
interface Callbacks {
    gainXp: (amount: number) => void;
    onBossKilled: (id: number) => void;
    onPlayerHit: (damage: number, attacker: any, type: DamageID, isDoT?: boolean, effect?: any, effectDuration?: number, effectIntensity?: number, attackName?: string) => void;
    onDiscovery?: (type: string, id: string, titleKey: string, detailsKey: string, payload?: any) => void;
    spawnBubble: (text: string, duration?: number) => void;
}

export class EnemySystem implements System {
    readonly systemId = SystemID.ENEMY_SYSTEM;
    id = 'enemy_system';
    isFixedStep = true;

    private currentSession: GameSessionLogic | null = null;
    private updateCallbacks: any;
    private cleanupCallbacks: any;

    constructor(
        private callbacks: Callbacks,
        private initialPoolSize: number = INITIAL_ENEMY_POOL
    ) {
        this.updateCallbacks = {
            spawnParticle: (x: number, y: number, z: number, t: FXParticleType, c: number, m?: THREE.Object3D, v?: THREE.Vector3, col?: number, s?: number) => {
                if (this.currentSession) this.spawnParticle(this.currentSession, x, y, z, t, c, m, v, col, s);
            },
            spawnDecal: (x: number, z: number, s: number, mat: THREE.Material, type: FXDecalType = FXDecalType.DECAL) => {
                if (this.currentSession) this.spawnDecal(this.currentSession, x, z, s, mat, type);
            },
            applyDamage: (enemy: Enemy, amount: number, type: DamageID, isHighImpact: boolean = false, attributionOverride?: DamageID) => {
                if (!this.currentSession) return;
                const state = this.currentSession.state;
                if (state.applyDamage) {
                    state.applyDamage(enemy, amount, type, isHighImpact, attributionOverride);
                }
            },
            spawnBubble: (text: string, duration?: number) => {
                if (this.currentSession) this.callbacks.spawnBubble(text, duration);
            }
        };

        this.cleanupCallbacks = {
            spawnParticle: this.updateCallbacks.spawnParticle,
            spawnDecal: this.updateCallbacks.spawnDecal,
            spawnScrap: (x: number, z: number, amt: number) => {
                if (!this.currentSession) return;
                WorldLootSystem.spawnScrapExplosion(this.currentSession.engine.scene, x, z, amt);
            },
            gainXp: (amount: number) => this.callbacks.gainXp(amount),
            onBossKilled: (id: number) => this.callbacks.onBossKilled(id),
            getSession: () => this.currentSession
        };
    }

    init(session: GameSessionLogic) {
        this.currentSession = session;
        EnemyManager.init(session, this.initialPoolSize);
    }

    update(session: GameSessionLogic, delta: number, simTime: number, renderTime: number) {
        this.currentSession = session;
        const state = session.state;

        if ((state.statusFlags & PlayerStatusFlags.DEAD) !== 0) return;

        // --- PHASE 9: DEFERRED CLEANUP (Zero-GC sweep) ---
        // We clean up at the START of the frame before the spatial grid is built
        this.cleanupDeadEnemies();

        // --- PHASE 6: CONTIGUOUS DRIVER ---
        // We delegate the heavy lifting to EnemyManager, which now uses a flat pool.
        EnemyManager.update(session, delta, simTime, renderTime);

        EnemyManager.cleanupDeadEnemies(
            session.engine.scene,
            state.enemies,
            state,
            this.cleanupCallbacks,
            delta,
            simTime
        );

        // --- PHASE 7: SPATIAL GRID UPDATE ---
        this.updateSpatialGrid();
    }

    /**
     * Rebuilds the spatial hash grid using bit-shifting and a linked list.
     * ZERO-GC hot path.
     */
    private updateSpatialGrid() {
        const pool = EnemyPoolState;
        const activeCount = pool.activeCount;
        const heads = pool.gridHeads;
        const next = pool.gridNext;

        // 1. Reset all grid heads (Zero-GC)
        heads.fill(-1);

        // 2. Iterate through active enemies and link them to the grid
        for (let i = 0; i < activeCount; i++) {
            const x = pool.posX[i];
            const z = pool.posZ[i];

            const ix = (x + GRID_OFFSET) >> GRID_CELL_POWER;
            const iz = (z + GRID_OFFSET) >> GRID_CELL_POWER;

            // Bounds check using GRID_RESOLUTION (64)
            if (ix >= 0 && ix < GRID_RESOLUTION && iz >= 0 && iz < GRID_RESOLUTION) {
                const gridIndex = ix + (iz * GRID_RESOLUTION);

                next[i] = heads[gridIndex];
                heads[gridIndex] = i;
            } else {
                next[i] = -1;
            }
        }
    }

    private spawnParticle(session: GameSessionLogic, x: number, y: number, z: number, type: FXParticleType, count: number, mesh?: THREE.Object3D, vel?: THREE.Vector3, color?: number, scale?: number) {
        if (!session.state.particles) return;
        FXSystem.spawnParticle(session.engine.scene, session.state.particles, x, y, z, type, count, mesh, vel, color, scale);
    }

    private spawnDecal(session: GameSessionLogic, x: number, z: number, scale: number, mat?: THREE.Material, type: FXDecalType = FXDecalType.DECAL) {
        if (!session.state.bloodDecals) return;
        FXSystem.spawnDecal(session.engine.scene, session.state.bloodDecals, x, z, scale, mat, type);
    }

    /**
     * PHASE 9: DEFERRED CLEANUP SWEEP
     * Iterates backwards to safely perform Swap-and-Go on dead entities.
     */
    private cleanupDeadEnemies() {
        const pool = EnemyPoolState;
        for (let i = pool.activeCount - 1; i >= 0; i--) {
            if ((pool.statusFlags[i] & ENTITY_STATUS.DEAD) !== 0) {
                this.despawnEnemy(i);
            }
        }
    }

    private despawnEnemy(index: number) {
        // Delegate to the contiguous recycle logic in EnemyManager
        EnemyManager.recycleEnemy(index);
    }

    clear() {
        this.currentSession = null;
        EnemyManager.clear();
    }
}

/**
 * PHASE 9: SPATIAL GRID QUERY
 * Rapidly resolves which enemy (if any) is at a world position.
 * ZERO-GC: No allocations, uses the per-frame linked-list grid.
 */
export function getEnemyAt(x: number, z: number, radius: number = 1.0): number {
    // Bit-shifting spatial hash lookup using 256m chunk bounds
    const ix = (x + GRID_OFFSET) >> GRID_CELL_POWER;
    const iz = (z + GRID_OFFSET) >> GRID_CELL_POWER;

    if (ix < 0 || ix >= GRID_RESOLUTION || iz < 0 || iz >= GRID_RESOLUTION) return -1;

    const gridIndex = ix + (iz * GRID_RESOLUTION);
    const heads = EnemyPoolState.gridHeads;
    const next = EnemyPoolState.gridNext;
    const posX = EnemyPoolState.posX;
    const posZ = EnemyPoolState.posZ;
    const status = EnemyPoolState.statusFlags;
    const radiusSq = radius * radius;

    let current = heads[gridIndex];

    while (current !== -1) {
        if (!(status[current] & (EnemyFlags.DEAD | EnemyFlags.EXPLODED))) {
            const dx = posX[current] - x;
            const dz = posZ[current] - z;
            const distSq = dx * dx + dz * dz;

            if (distSq <= radiusSq) {
                return current;
            }
        }

        current = next[current];
    }

    return -1;
}
