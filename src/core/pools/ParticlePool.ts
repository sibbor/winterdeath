import { POOL_PARTICLE_MAX } from '../../content/constants';

/**
 * Particle Object Pool (Phase 10)
 * 
 * Implements a Zero-GC Swap-and-Go SoA (Structure of Arrays) for high-frequency VFX.
 * This ensures that particle updates remain in the CPU L1/L2 cache and do not trigger GC.
 */

export const ParticlePoolState = {
    activeCount: 0,

    // TRANSFORM (SoA)
    posX: new Float32Array(POOL_PARTICLE_MAX),
    posY: new Float32Array(POOL_PARTICLE_MAX),
    posZ: new Float32Array(POOL_PARTICLE_MAX),

    // PHYSICS
    velX: new Float32Array(POOL_PARTICLE_MAX),
    velY: new Float32Array(POOL_PARTICLE_MAX),
    velZ: new Float32Array(POOL_PARTICLE_MAX),

    // VISUALS & LIFECYCLE
    scale: new Float32Array(POOL_PARTICLE_MAX),
    initialScale: new Float32Array(POOL_PARTICLE_MAX),
    life: new Float32Array(POOL_PARTICLE_MAX),
    maxLife: new Float32Array(POOL_PARTICLE_MAX),

    // COLOR (SoA)
    colorR: new Float32Array(POOL_PARTICLE_MAX),
    colorG: new Float32Array(POOL_PARTICLE_MAX),
    colorB: new Float32Array(POOL_PARTICLE_MAX),
};

export const ParticlePool = {
    /**
     * Spawns a new particle into the pool.
     * ZERO-GC: No allocations.
     */
    spawnParticle: (x: number, y: number, z: number, vx: number, vy: number, vz: number, scale: number, life: number, r: number = 1, g: number = 1, b: number = 1) => {
        if (ParticlePoolState.activeCount >= POOL_PARTICLE_MAX) return;

        const i = ParticlePoolState.activeCount;
        ParticlePoolState.posX[i] = x;
        ParticlePoolState.posY[i] = y;
        ParticlePoolState.posZ[i] = z;
        ParticlePoolState.velX[i] = vx;
        ParticlePoolState.velY[i] = vy;
        ParticlePoolState.velZ[i] = vz;
        ParticlePoolState.scale[i] = scale;
        ParticlePoolState.initialScale[i] = scale;
        ParticlePoolState.life[i] = life;
        ParticlePoolState.maxLife[i] = life;
        ParticlePoolState.colorR[i] = r;
        ParticlePoolState.colorG[i] = g;
        ParticlePoolState.colorB[i] = b;

        ParticlePoolState.activeCount++;
    },

    /**
     * Removes a particle using Swap-and-Go logic.
     * O(1) performance.
     */
    despawnParticle: (index: number) => {
        const last = ParticlePoolState.activeCount - 1;
        if (index !== last) {
            ParticlePoolState.posX[index] = ParticlePoolState.posX[last];
            ParticlePoolState.posY[index] = ParticlePoolState.posY[last];
            ParticlePoolState.posZ[index] = ParticlePoolState.posZ[last];
            ParticlePoolState.velX[index] = ParticlePoolState.velX[last];
            ParticlePoolState.velY[index] = ParticlePoolState.velY[last];
            ParticlePoolState.velZ[index] = ParticlePoolState.velZ[last];
            ParticlePoolState.scale[index] = ParticlePoolState.scale[last];
            ParticlePoolState.initialScale[index] = ParticlePoolState.initialScale[last];
            ParticlePoolState.life[index] = ParticlePoolState.life[last];
            ParticlePoolState.maxLife[index] = ParticlePoolState.maxLife[last];
            ParticlePoolState.colorR[index] = ParticlePoolState.colorR[last];
            ParticlePoolState.colorG[index] = ParticlePoolState.colorG[last];
            ParticlePoolState.colorB[index] = ParticlePoolState.colorB[last];
        }
        ParticlePoolState.activeCount--;
    }
};

export function clearParticles(): void {
    ParticlePoolState.activeCount = 0;
}
