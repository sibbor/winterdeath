/**
 * Enemy Object Pool (Phase 6)
 * 
 * Implements a Zero-GC Swap-and-Go SoA (Structure of Arrays) for enemy data.
 * This ensures contiguous memory access and zero heap allocations during the main loop.
 */

import { POOL_ENEMY_MAX } from '../../content/constants';

export const ENEMY_POOL_SIZE = POOL_ENEMY_MAX;

export const EnemyPoolState = {
    activeCount: 0,

    // --- IDENTITY & STATS ---
    types: new Int8Array(ENEMY_POOL_SIZE),
    statusFlags: new Int32Array(ENEMY_POOL_SIZE),
    hp: new Float32Array(ENEMY_POOL_SIZE),
    maxHp: new Float32Array(ENEMY_POOL_SIZE),

    // --- TRANSFORM (SoA) ---
    posX: new Float32Array(ENEMY_POOL_SIZE),
    posY: new Float32Array(ENEMY_POOL_SIZE),
    posZ: new Float32Array(ENEMY_POOL_SIZE),
    rotY: new Float32Array(ENEMY_POOL_SIZE),

    // --- PHYSICS ---
    velX: new Float32Array(ENEMY_POOL_SIZE),
    velY: new Float32Array(ENEMY_POOL_SIZE),
    velZ: new Float32Array(ENEMY_POOL_SIZE),

    // --- STATE MACHINE ---
    aiState: new Int8Array(ENEMY_POOL_SIZE),
    deathState: new Int8Array(ENEMY_POOL_SIZE),
    deathTimer: new Float32Array(ENEMY_POOL_SIZE),

    // --- PERCEPTION ---
    awareness: new Float32Array(ENEMY_POOL_SIZE),
    lastSeenTime: new Float32Array(ENEMY_POOL_SIZE),

    // --- INTERNAL REFS ---
    meshIndex: new Int32Array(ENEMY_POOL_SIZE),
};
