import { System, SystemID } from './System';
import { ParticlePool, ParticlePoolState } from '../core/pools/ParticlePool';

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

    update(context: any, delta: number) {
        const pool = ParticlePoolState;
        const gravity = -60; // Slightly stronger gravity for punchy grit

        // --- PHASE 10: CONTIGUOUS SIMULATION SWEEP ---
        for (let i = 0; i < pool.activeCount; i++) {
            // 1. Life Decay
            pool.life[i] -= delta;
            if (pool.life[i] <= 0) {
                ParticlePool.despawnParticle(i);
                i--; // Swap-and-Go: check the new occupant of this index
                continue;
            }

            // Calculate particle age ratio (0 at spawn, 1 at death)
            const age = 1.0 - (pool.life[i] / pool.maxLife[i]);

            // Distinguish flamethrower fire particles by color (orange/yellow/red, i.e., R > 0.5 and B < 0.3)
            const isFlame = pool.colorR[i] > 0.5 && pool.colorB[i] < 0.3;

            if (isFlame) {
                // Flames rise and spread organically
                pool.velY[i] += 10.0 * delta; // Upward acceleration
                pool.velX[i] *= 1.0 - (2.0 * delta); // Lateral air friction
                pool.velZ[i] *= 1.0 - (2.0 * delta);

                // Grow scale over time (starts small, expands significantly)
                pool.scale[i] = pool.initialScale[i] * (0.3 + age * 3.5);

                // Dynamic color fading: vibrant yellow -> orange -> red -> dark red/black
                if (age < 0.25) {
                    // Bright Yellow core
                    pool.colorR[i] = 1.0;
                    pool.colorG[i] = 0.95 - age * 0.8;
                    pool.colorB[i] = 0.05;
                } else if (age < 0.65) {
                    // Vibrant Orange
                    pool.colorR[i] = 1.0;
                    pool.colorG[i] = 0.45 - (age - 0.25) * 1.0;
                    pool.colorB[i] = 0.0;
                } else {
                    // Saturated Red fading to black
                    const fade = Math.max(0, (1.0 - age) / 0.35);
                    pool.colorR[i] = 0.9 * fade;
                    pool.colorG[i] = 0.0;
                    pool.colorB[i] = 0.0;
                }
            } else {
                // 2. Physics (Euler Integration for normal sparks/muzzle)
                pool.velY[i] += gravity * delta;
            }

            pool.posX[i] += pool.velX[i] * delta;
            pool.posY[i] += pool.velY[i] * delta;
            pool.posZ[i] += pool.velZ[i] * delta;

            // 3. Simple Floor Collision (for non-flame particles only)
            if (!isFlame && pool.posY[i] < 0) {
                pool.posY[i] = 0;
                pool.velY[i] *= -0.4; // Bounce Factor
                pool.velX[i] *= 0.7;  // Ground Friction
                pool.velZ[i] *= 0.7;
            }
        }
    }
}
