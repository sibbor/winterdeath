import * as THREE from 'three';
import { Enemy, ENEMY_ATTACK_RANGE, EnemyType, AIState, EnemyFlags } from '../../entities/enemies/EnemyTypes';
import { AttackDefinition, EnemyAttackType, DamageID } from '../../entities/player/CombatTypes';
import { WinterEngine } from '../../core/engine/WinterEngine';
import { SoundID } from '../../utils/audio/AudioTypes';
import { DataResolver } from '../../core/data/DataResolver';
import { DamageType } from '../../entities/player/CombatTypes';
import { StatusEffectID } from '../../types/StatusEffects';
import { FXParticleType } from '../../types/FXTypes';
import { WorldStreamer } from '../../core/world/WorldStreamer';
import { COMBAT } from '../../content/constants';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export const EnemyAttackHandler = {

    executeAttack: (e: Enemy, att: AttackDefinition, distSq: number, playerPos: THREE.Vector3, streamer: WorldStreamer, callbacks: {
        handlePlayerHit: (damage: number, attacker: Enemy | null, damageType: DamageType, damageSource: DamageID, isDoT?: boolean, effectType?: StatusEffectID, duration?: number, intensity?: number, specificAttackType?: EnemyAttackType) => boolean,
        playSound: (id: SoundID) => void,
        spawnParticle: (x: number, y: number, z: number, type: FXParticleType, count: number, mesh?: THREE.Object3D | null, vel?: THREE.Vector3, color?: number, scale?: number, life?: number) => void,
        handleEnemyHit: (enemy: Enemy, amount: number, damageType: DamageType, damageSource: DamageID, isHighImpact?: boolean, attributionOverride?: DamageID) => boolean,
        queryEnemies?: (pos: THREE.Vector3, radius: number, outPoolIdx: number) => void,
        applyExternalForce?: (force: THREE.Vector3, factor: number) => void
    }, delta: number, simTime: number, renderTime: number): boolean => {
        if (WinterEngine.getInstance().systems.performanceMonitor?.aiLoggingEnabled ?? true) {
            const attackName = DataResolver.getAttackName(att.type, true);
            const enemyName = DataResolver.getEnemyName(e.type, e.bossId, true);
            console.log(`[EnemyAttackHandler] ${enemyName} ${e.id} attacking with ${attackName} (${att.damage} dmg)`);
        }

        // Store target position for procedural animator
        e.targetPos.copy(playerPos);

        if (e.attackCooldowns) {
            e.attackCooldowns[att.type] = att.cooldown;
        }

        switch (att.type) {
            case EnemyAttackType.HIT:
                return EnemyAttackHandler.handleBasicHit(e, att, distSq, callbacks, delta, simTime, renderTime);
            default:
                return EnemyAttackHandler.handleSpecialAttack(e, att, distSq, playerPos, streamer, callbacks, delta, simTime, renderTime);
        }
    },

    handleBasicHit: (e: Enemy, att: AttackDefinition, distSq: number, callbacks: {
        handlePlayerHit: (damage: number, attacker: Enemy | null, damageType: DamageType, damageSource: DamageID, isDoT?: boolean, effectType?: StatusEffectID, duration?: number, intensity?: number, specificAttackType?: EnemyAttackType) => boolean,
        playSound: (id: SoundID) => void
    }, delta: number, simTime: number, renderTime: number): boolean => {
        const range = att.range || ENEMY_ATTACK_RANGE[e.type];
        // VINTERDÖD STABILIZATION: 15% hysteresis buffer prevents "chase-stall"
        const bufferedRange = range * COMBAT.HYSTERESIS;
        const inRange = distSq < (bufferedRange * bufferedRange);

        if (inRange) {
            callbacks.handlePlayerHit(att.damage, e, DamageType.PHYSICAL, DamageID.PHYSICAL, false, att.effect, att.effectDuration, att.effectDamage, att.type);
            const id = att.type === EnemyAttackType.HIT ? SoundID.ZOMBIE_ATTACK_HIT : SoundID.ZOMBIE_GROWL_WALKER;
            callbacks.playSound(id);
            return true;
        }
        return false;
    },

    handleSpecialAttack: (e: Enemy, att: AttackDefinition, distSq: number, playerPos: THREE.Vector3, streamer: WorldStreamer, callbacks: {
        handlePlayerHit: (damage: number, attacker: Enemy | null, damageType: DamageType, damageSource: DamageID, isDoT?: boolean, effectType?: StatusEffectID, duration?: number, intensity?: number, specificAttackType?: EnemyAttackType) => boolean,
        playSound: (id: SoundID) => void,
        spawnParticle: (x: number, y: number, z: number, type: FXParticleType, count: number, mesh?: THREE.Object3D | null, vel?: THREE.Vector3, color?: number, scale?: number, life?: number) => void,
        handleEnemyHit: (enemy: Enemy, amount: number, damageType: DamageType, damageSource: DamageID, isHighImpact?: boolean, attributionOverride?: DamageID) => boolean,
        queryEnemies?: (pos: THREE.Vector3, radius: number, outPoolIdx: number) => void
    }, delta: number, simTime: number, renderTime: number): boolean => {
        const pos = e.mesh.position;
        const effectiveRange = att.radius || att.range || ENEMY_ATTACK_RANGE[e.type];
        // VINTERDÖD STABILIZATION: 15% hysteresis buffer prevents "chase-stall"
        const bufferedRange = effectiveRange * COMBAT.HYSTERESIS;
        const inRange = distSq < (bufferedRange * bufferedRange);

        switch (att.type) {
            case EnemyAttackType.BITE:
                if (inRange) {
                    callbacks.handlePlayerHit(att.damage, e, DamageType.PHYSICAL, DamageID.BITE, false, att.effect, att.effectDuration, att.effectDamage, att.type);

                    // Walker Grapple Mechanic
                    if (e.type === EnemyType.WALKER) {
                        e.state = AIState.GRAPPLE;
                        e.statusFlags |= EnemyFlags.GRAPPLING;
                        e.grappleDuration = 2.0 + Math.random() * 1.0;
                        e.attackTimer = -1; // Yield control to Grapple system
                    }

                    if (callbacks.spawnParticle) {
                        // Use high-fidelity blood_splatter physics particles
                        callbacks.spawnParticle(playerPos.x, playerPos.y + 1.0, playerPos.z, FXParticleType.BLOOD_SPLATTER, 5);
                    }
                }
                callbacks.playSound(SoundID.ZOMBIE_ATTACK_BITE);
                break;

            case EnemyAttackType.JUMP:
                // Damage and Grapple state transition is deferred to EnemyAI at the end of the ATTACKING phase (when attackTimer <= 0).
                callbacks.playSound(SoundID.ZOMBIE_ATTACK_SMASH);
                break;

            case EnemyAttackType.EXPLODE:
                if (inRange) callbacks.handlePlayerHit(att.damage, e, DamageType.EXPLOSION, DamageID.EXPLOSION, false, att.effect, att.effectDuration, att.effectDamage, att.type);
                if (callbacks.spawnParticle) callbacks.spawnParticle(pos.x, 1.0, pos.z, FXParticleType.LARGE_FIRE, 5);

                callbacks.playSound(SoundID.ZOMBIE_DEATH_EXPLODE);

                // AOE EXPLOSION: Damage surrounding enemies
                const radius = att.radius || 10.0;
                if (callbacks.queryEnemies && callbacks.handleEnemyHit) {
                    const pool = streamer.getEnemyPool();
                    const poolIdx = pool.nextIndex();
                    callbacks.queryEnemies(pos, radius + 3.0, poolIdx);

                    const nearby = pool.getPool(poolIdx);
                    const nLen = pool.getCount(poolIdx);
                    const radSq = radius * radius;

                    for (let i = 0; i < nLen; i++) {
                        const other = nearby[i];
                        if (other === e || other.hp <= 0) continue;

                        _v1.subVectors(other.mesh.position, pos);
                        const dSq = _v1.lengthSq();
                        const totalRad = radius + (other.originalScale * 0.5);

                        if (dSq < totalRad * totalRad) {
                            callbacks.handleEnemyHit(other, att.damage, DamageType.EXPLOSION, DamageID.EXPLOSION, true);

                            // Apply knockback (physics)
                            const force = att.force * (1.0 - Math.min(1.0, dSq / radSq));
                            const mass = other.originalScale * other.widthScale;
                            _v2.copy(_v1).normalize().multiplyScalar(force / mass).setY(2.0);
                            other.knockbackVel.add(_v2);
                        }
                    }
                }

                e.hp = 0;
                e.lastDamageType = DamageID.EXPLOSION;
                if (callbacks.handleEnemyHit) callbacks.handleEnemyHit(e, COMBAT.LETHAL_DAMAGE, DamageType.EXPLOSION, DamageID.EXPLOSION, true);
                break;

            case EnemyAttackType.SMASH:
            case EnemyAttackType.FREEZE_JUMP:
                if (inRange) {
                    const dType = att.type === EnemyAttackType.FREEZE_JUMP ? DamageType.ELECTRIC : DamageType.PHYSICAL;
                    const dSource = att.type === EnemyAttackType.FREEZE_JUMP ? DamageID.ELECTRIC : DamageID.PHYSICAL;
                    callbacks.handlePlayerHit(att.damage, e, dType, dSource, false, att.effect, att.effectDuration, att.effectDamage, att.type);
                }
                if (callbacks.spawnParticle) {
                    callbacks.spawnParticle(pos.x, 0.2, pos.z, FXParticleType.GROUND_IMPACT, 12);
                    callbacks.spawnParticle(pos.x, 0.1, pos.z, FXParticleType.SHOCKWAVE, 1);
                    if (att.type === EnemyAttackType.FREEZE_JUMP) {
                        callbacks.spawnParticle(pos.x, 0.5, pos.z, FXParticleType.FROST_NOVA, 8);
                    }
                }
                callbacks.playSound(SoundID.ZOMBIE_ATTACK_SMASH);
                break;

            case EnemyAttackType.SCREECH:
                if (inRange) callbacks.handlePlayerHit(att.damage, e, DamageType.PHYSICAL, DamageID.PHYSICAL, false, att.effect, att.effectDuration, att.effectDamage, att.type);
                if (callbacks.spawnParticle) callbacks.spawnParticle(pos.x, pos.y + 1.8, pos.z, FXParticleType.SCREECH_WAVE, 1);
                callbacks.playSound(SoundID.ZOMBIE_GROWL_RUNNER);
                break;

            case EnemyAttackType.ELECTRIC_BEAM:
            case EnemyAttackType.MAGNETIC_CHAIN:
                if (inRange) callbacks.handlePlayerHit(att.damage, e, DamageType.ELECTRIC, DamageID.ELECTRIC, false, att.effect, att.effectDuration, att.effectDamage, att.type);
                callbacks.playSound(SoundID.SHOT_ARC_CANNON);
                break;
        }

        return inRange;
    },

    updateContinuousAttack: (e: Enemy, att: AttackDefinition, playerPos: THREE.Vector3, callbacks: {
        handlePlayerHit: (damage: number, attacker: Enemy | null, damageType: DamageType, damageSource: DamageID, isDoT?: boolean, effectType?: StatusEffectID, duration?: number, intensity?: number, specificAttackType?: EnemyAttackType) => boolean,
        spawnParticle: (x: number, y: number, z: number, type: FXParticleType, count: number, mesh?: THREE.Object3D | null, vel?: THREE.Vector3, color?: number, scale?: number, life?: number) => void,
        applyExternalForce?: (force: THREE.Vector3, factor: number) => void
    }, delta: number, simTime: number, renderTime: number) => {
        const pos = e.mesh.position;
        const dx = playerPos.x - pos.x;
        const dy = playerPos.y - pos.y;
        const dz = playerPos.z - pos.z;
        const currentDistSq = dx * dx + dy * dy + dz * dz;

        const r = att.range || 10.0;
        const rangeSq = r * r;

        // Hoist distance calc if within potential range
        let dist = -1;
        if (currentDistSq < rangeSq * 2.25) { // 1.5x range buffer
            dist = Math.sqrt(currentDistSq);
        }

        switch (att.type) {
            case EnemyAttackType.ELECTRIC_BEAM:
                if (callbacks.spawnParticle) {
                    const invDist = (dist > 0.0001) ? 5.0 / dist : 0.0;
                    if (invDist > 0.0) {
                        _v2.set(dx * invDist, dy * invDist, dz * invDist);
                        callbacks.spawnParticle(pos.x, pos.y + 1.8, pos.z, FXParticleType.ELECTRIC_BEAM, 1, undefined, _v2);
                    }
                    if (currentDistSq < rangeSq) {
                        callbacks.spawnParticle(playerPos.x, playerPos.y + 1.0, playerPos.z, FXParticleType.ELECTRIC_FLASH, 1);
                        callbacks.handlePlayerHit(att.damage * delta, e, DamageType.ELECTRIC, DamageID.ELECTRIC, true, att.effect, att.effectDuration, att.effectDamage, att.type);
                    }
                }
                break;

            case EnemyAttackType.MAGNETIC_CHAIN:
                if (currentDistSq < rangeSq) {
                    if (callbacks.spawnParticle) callbacks.spawnParticle(pos.x, pos.y + 1.5, pos.z, FXParticleType.MAGNETIC_SPARKS, 2);
                    callbacks.handlePlayerHit(att.damage * delta, e, DamageType.PHYSICAL, DamageID.PHYSICAL, true, att.effect, att.effectDuration, att.effectDamage, att.type);

                    if (callbacks.applyExternalForce) {
                        const invDist = (dist > 0.0001) ? -1.0 / dist : 0.0;
                        if (invDist !== 0.0) {
                            _v2.set(dx * invDist, dy * invDist, dz * invDist);
                            callbacks.applyExternalForce(_v2, 0.9);
                        }
                    }
                }
                break;
        }
    }
};
