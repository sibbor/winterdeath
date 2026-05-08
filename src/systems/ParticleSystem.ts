import { System, SystemID } from './System';
import { ParticlePool, ParticlePoolState } from '../core/state/ParticlePool';

/**
 * Instanced Particle System (Phase 10)
 * 
 * Handles high-frequency VFX simulation using a pure SoA logic sweep.
 * Optimized for Euler integration and simple floor physics.
 */
export class ParticleSystem implements System {
    readonly systemId = SystemID.PARTICLE;
    id = 'particle_system';
    isFixedStep = true;

    update(context: any, dt: number) {
        const pool = ParticlePoolState;
        const gravity = -60; // Slightly stronger gravity for punchy grit

        // --- PHASE 10: CONTIGUOUS SIMULATION SWEEP ---
        for (let i = 0; i < pool.activeCount; i++) {
            // 1. Life Decay
            pool.life[i] -= dt;
            if (pool.life[i] <= 0) {
                ParticlePool.despawnParticle(i);
                i--; // Swap-and-Go: check the new occupant of this index
                continue;
            }

            // 2. Physics (Euler Integration)
            pool.velY[i] += gravity * dt;
            pool.posX[i] += pool.velX[i] * dt;
            pool.posY[i] += pool.velY[i] * dt;
            pool.posZ[i] += pool.velZ[i] * dt;

            // 3. Simple Floor Collision
            if (pool.posY[i] < 0) {
                pool.posY[i] = 0;
                pool.velY[i] *= -0.4; // Bounce Factor
                pool.velX[i] *= 0.7;  // Ground Friction
                pool.velZ[i] *= 0.7;
            }
        }
    }
}
