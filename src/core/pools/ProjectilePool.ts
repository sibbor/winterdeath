import { POOL_PROJECTILE_MAX } from '../../content/constants';

/**
 * Projectile Object Pool (Phase 8)
 * 
 * Implements a Zero-GC SoA (Structure of Arrays) for projectiles.
 * Optimized for massive numbers of bullets with minimal CPU/GPU overhead.
 */

export const MAX_PROJECTILES = POOL_PROJECTILE_MAX;

export const ProjectilePoolState = {
    activeCount: 0,

    // --- TRANSFORM (SoA) ---
    posX: new Float32Array(MAX_PROJECTILES),
    posY: new Float32Array(MAX_PROJECTILES),
    posZ: new Float32Array(MAX_PROJECTILES),

    // --- PHYSICS ---
    velX: new Float32Array(MAX_PROJECTILES),
    velY: new Float32Array(MAX_PROJECTILES),
    velZ: new Float32Array(MAX_PROJECTILES),

    // --- LIFECYCLE ---
    life: new Float32Array(MAX_PROJECTILES),
    damage: new Float32Array(MAX_PROJECTILES),
    weaponId: new Int32Array(MAX_PROJECTILES), // DamageID SMI

    // --- BEHAVIOR ---
    hasGravity: new Int8Array(MAX_PROJECTILES), // 1 if gravity applies
    type: new Int8Array(MAX_PROJECTILES), // 0: Bullet, 1: Throwable, 2: Continuous

    // --- FLAGS & METADATA ---
    isPlayer: new Int8Array(MAX_PROJECTILES), // 1 if player-owned, 0 otherwise
    pierceCount: new Int8Array(MAX_PROJECTILES), // Tracks number of hits
};

export function clearProjectiles(): void {
    ProjectilePoolState.activeCount = 0;
    ProjectilePoolState.pierceCount.fill(0);
}
