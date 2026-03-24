import * as THREE from 'three';
import { Enemy, DEFAULT_ATTACK_RANGE } from '../../entities/enemies/EnemyTypes';
import { AttackDefinition, EnemyAttackType, DamageType } from '../../entities/player/CombatTypes';
import { PerformanceMonitor } from '../../systems/PerformanceMonitor';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

// Zero-GC String Cache to prevent heap allocations on concatenated sound names
const _soundNameCache: Record<string, string> = {};
function getStartSoundName(type: string): string {
    if (!_soundNameCache[type]) {
        _soundNameCache[type] = type + '_start';
    }
    return _soundNameCache[type];
}

export const EnemyAttackHandler = {
    /**
     * Main function called when `chargeTime` finishes and the attack executes.
     */
    executeAttack: (e: Enemy, att: AttackDefinition, distSq: number, playerPos: THREE.Vector3, callbacks: any) => {
        if (PerformanceMonitor.getInstance().aiLoggingEnabled) {
            console.log(`[EnemyAttackHandler] ${e.type}_${e.id} attacking with ${att.type} (${att.damage} dmg)`);
        }

        // 1. Set cooldown immediately for this specific attack
        if (e.attackCooldowns) {
            e.attackCooldowns[att.type] = att.cooldown;
        }

        // 2. Route to appropriate handler
        if (att.type === EnemyAttackType.HIT) {
            EnemyAttackHandler.handleBasicHit(e, att, distSq, callbacks);
        } else {
            EnemyAttackHandler.handleSpecialAttack(e, att, distSq, playerPos, callbacks);
        }
    },

    /**
     * Handles basic melee strikes (Walkers, Runners, etc).
     */
    handleBasicHit: (e: Enemy, att: AttackDefinition, distSq: number, callbacks: any) => {
        const range = att.range || DEFAULT_ATTACK_RANGE;
        const rangeSq = range * range;
        const inRange = distSq < rangeSq;

        if (PerformanceMonitor.getInstance().aiLoggingEnabled) {
            console.log(`[EnemyAttackHandler] BASIC HIT | IN RANGE: ${inRange} | ${e.type}_${e.id} attacking with ${att.type} (${att.damage} dmg)`);
        }

        if (inRange) {
            callbacks.onPlayerHit(att.damage, e, DamageType.PHYSICAL, false, att.effect, att.effectDuration, att.effectDamage, att.type);
            callbacks.playSound(att.type);
        }
    },

    /**
     * Handles one-off special attacks and AoE (Explosion, Smash, Jump).
     */
    handleSpecialAttack: (e: Enemy, att: AttackDefinition, distSq: number, playerPos: THREE.Vector3, callbacks: any) => {
        const pos = e.mesh.position;

        // Use defined radius (AoE), then range, then default fallback.
        const effectiveRange = att.radius || att.range || DEFAULT_ATTACK_RANGE;
        const inRange = distSq < (effectiveRange * effectiveRange);

        if (PerformanceMonitor.getInstance().aiLoggingEnabled) {
            console.log(`[EnemyAttackHandler] SPECIAL ATTACK | IN RANGE: ${inRange} | ${e.type}_${e.id} attacking with ${att.type} (${att.damage} dmg)`);
        }

        switch (att.type) {
            case EnemyAttackType.BITE:
                if (inRange) {
                    callbacks.onPlayerHit(att.damage, e, DamageType.BITE, false, att.effect, att.effectDuration, att.effectDamage, att.type);
                    if (callbacks.spawnPart) callbacks.spawnPart(playerPos.x, playerPos.y + 1.0, playerPos.z, 'blood', 3);
                }
                callbacks.playSound(att.type);
                break;

            case EnemyAttackType.JUMP:
                if (inRange) {
                    callbacks.onPlayerHit(att.damage, e, DamageType.PHYSICAL, false, att.effect, att.effectDuration, att.effectDamage, att.type);
                }
                callbacks.playSound('jump_impact');
                break;

            case EnemyAttackType.EXPLODE:
                if (inRange) {
                    callbacks.onPlayerHit(att.damage, e, DamageType.EXPLOSION, false, att.effect, att.effectDuration, att.effectDamage, att.type);
                }
                if (callbacks.spawnPart) callbacks.spawnPart(pos.x, 1.0, pos.z, 'large_fire', 5);

                // BOMBER SUICIDE - Must kill the zombie!
                e.hp = 0;
                e.lastDamageType = DamageType.EXPLOSION;
                if (callbacks.applyDamage) callbacks.applyDamage(e, 9999, DamageType.EXPLOSION, true);
                break;

            case EnemyAttackType.SMASH:
            case EnemyAttackType.FREEZE_JUMP:
                if (inRange) {
                    const dType = att.type === EnemyAttackType.FREEZE_JUMP ? DamageType.PHYSICAL : DamageType.PHYSICAL;
                    callbacks.onPlayerHit(att.damage, e, dType, false, att.effect, att.effectDuration, att.effectDamage, att.type);
                }
                if (callbacks.spawnPart) {
                    callbacks.spawnPart(pos.x, 0.2, pos.z, 'ground_impact', 12);
                    callbacks.spawnPart(pos.x, 0.1, pos.z, 'shockwave', 1);
                    if (att.type === EnemyAttackType.FREEZE_JUMP) {
                        callbacks.spawnPart(pos.x, 0.5, pos.z, 'frost_nova', 8); // Special boss effect
                    }
                }
                callbacks.playSound('heavy_smash');
                break;

            case EnemyAttackType.SCREECH:
                if (inRange) {
                    callbacks.onPlayerHit(att.damage, e, DamageType.PHYSICAL, false, att.effect, att.effectDuration, att.effectDamage, att.type);
                }
                if (callbacks.spawnPart) callbacks.spawnPart(pos.x, pos.y + 1.8, pos.z, 'screech_wave', 1);
                callbacks.playSound('screech');
                break;

            case EnemyAttackType.ELECTRIC_BEAM:
            case EnemyAttackType.MAGNETIC_CHAIN:
                // These are continuous. executeAttack runs only when charge completes.
                callbacks.playSound(getStartSoundName(att.type));
                break;
        }
    },

    /**
     * Executes EVERY frame during AIState.ATTACKING for continuous attacks.
     * Highly optimized for V8 execution speed.
     */
    updateContinuousAttack: (e: Enemy, att: AttackDefinition, delta: number, playerPos: THREE.Vector3, callbacks: any) => {
        const pos = e.mesh.position;

        // Inlined vector subtraction and distance calculation
        const dx = playerPos.x - pos.x;
        const dy = playerPos.y - pos.y;
        const dz = playerPos.z - pos.z;
        const currentDistSq = dx * dx + dy * dy + dz * dz;

        const r = att.range || 10.0;
        const rangeSq = r * r;

        switch (att.type) {
            case EnemyAttackType.ELECTRIC_BEAM:
                if (callbacks.spawnPart) {
                    const dist = Math.sqrt(currentDistSq);

                    // Branchless math to avoid CPU prediction misses
                    const invDist = dist > 0.0001 ? 5.0 / dist : 0.0;
                    if (invDist > 0.0) {
                        _v2.set(dx * invDist, dy * invDist, dz * invDist);
                        callbacks.spawnPart(pos.x, pos.y + 1.8, pos.z, 'electric_beam', 1, undefined, _v2);
                    }

                    if (currentDistSq < rangeSq) {
                        callbacks.spawnPart(playerPos.x, playerPos.y + 1.0, playerPos.z, 'electric_flash', 1);
                        callbacks.onPlayerHit(att.damage * delta, e, DamageType.ELECTRIC, true, att.effect, att.effectDuration, att.effectDamage, att.type);
                    }
                }
                break;

            case EnemyAttackType.MAGNETIC_CHAIN:
                if (currentDistSq < rangeSq) {
                    if (callbacks.spawnPart) {
                        callbacks.spawnPart(pos.x, pos.y + 1.5, pos.z, 'magnetic_sparks', 2);
                    }

                    // Damage over time (5 dmg/sec)
                    callbacks.onPlayerHit(att.damage * delta, e, DamageType.PHYSICAL, true, att.effect, att.effectDuration, att.effectDamage, att.type);

                    if (callbacks.applyExternalForce) {
                        const dist = Math.sqrt(currentDistSq);
                        const invDist = dist > 0.0001 ? -1.0 / dist : 0.0;

                        if (invDist !== 0.0) {
                            _v2.set(dx * invDist, dy * invDist, dz * invDist);
                            callbacks.applyExternalForce(_v2, 0.9); // Pull with 90% strength
                        }
                    }
                }
                break;
        }
    }
};