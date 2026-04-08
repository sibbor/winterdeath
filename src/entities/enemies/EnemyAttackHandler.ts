import * as THREE from 'three';
import { Enemy, ENEMY_ATTACK_RANGE } from '../../entities/enemies/EnemyTypes';
import { AttackDefinition, EnemyAttackType, DamageType, DamageID } from '../../entities/player/CombatTypes';
import { PerformanceMonitor } from '../../systems/PerformanceMonitor';
import { SoundID } from '../../utils/audio/AudioTypes';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export const EnemyAttackHandler = {
    executeAttack: (e: Enemy, att: AttackDefinition, distSq: number, playerPos: THREE.Vector3, callbacks: {
        onPlayerHit: (damage: number, attacker: any, type: DamageID, isDoT?: boolean, effect?: any, duration?: number, intensity?: number, attackName?: any) => void,
        playSound: (id: string | number) => void,
        spawnPart?: (x: number, y: number, z: number, type: string, count: number, mesh?: THREE.Object3D, vel?: THREE.Vector3, color?: number, scale?: number) => void,
        applyDamage?: (enemy: Enemy, amount: number, type: DamageID, isHighImpact?: boolean) => void
    }, delta: number, simTime: number, renderTime: number) => {

        if (PerformanceMonitor.getInstance().aiLoggingEnabled) {
            console.log(`[EnemyAttackHandler] ${e.type}_${e.id} attacking with ${att.type} (${att.damage} dmg)`);
        }

        // Store target position for procedural animator
        if (!e.mesh.userData.targetPos) e.mesh.userData.targetPos = new THREE.Vector3();
        e.mesh.userData.targetPos.copy(playerPos);

        if (e.attackCooldowns) {
            e.attackCooldowns[att.type] = att.cooldown;
        }

        if (att.type === EnemyAttackType.HIT) {
            EnemyAttackHandler.handleBasicHit(e, att, distSq, callbacks, delta, simTime, renderTime);
        } else {
            EnemyAttackHandler.handleSpecialAttack(e, att, distSq, playerPos, callbacks, delta, simTime, renderTime);
        }
    },

    handleBasicHit: (e: Enemy, att: AttackDefinition, distSq: number, callbacks: any, delta: number, simTime: number, renderTime: number) => {
        const range = att.range || ENEMY_ATTACK_RANGE[e.type];
        const inRange = distSq < (range * range);

        if (inRange) {
            callbacks.onPlayerHit(att.damage, e, DamageID.PHYSICAL, false, att.effect, att.effectDuration, att.effectDamage, att.type);
            const id = att.type === EnemyAttackType.HIT ? SoundID.ZOMBIE_ATTACK_HIT : SoundID.ZOMBIE_GROWL_WALKER;
            callbacks.playSound(id);
        }
    },

    handleSpecialAttack: (e: Enemy, att: AttackDefinition, distSq: number, playerPos: THREE.Vector3, callbacks: any, delta: number, simTime: number, renderTime: number) => {
        const pos = e.mesh.position;
        const effectiveRange = att.radius || att.range || ENEMY_ATTACK_RANGE[e.type];
        const inRange = distSq < (effectiveRange * effectiveRange);

        switch (att.type) {
            case EnemyAttackType.BITE:
                if (inRange) {
                    callbacks.onPlayerHit(att.damage, e, DamageID.BITE, false, att.effect, att.effectDuration, att.effectDamage, att.type);
                    if (callbacks.spawnPart) callbacks.spawnPart(playerPos.x, playerPos.y + 1.0, playerPos.z, 'blood', 3);
                }
                callbacks.playSound(SoundID.BITE);
                break;

            case EnemyAttackType.JUMP:
                if (inRange) callbacks.onPlayerHit(att.damage, e, DamageID.PHYSICAL, false, att.effect, att.effectDuration, att.effectDamage, att.type);
                callbacks.playSound(SoundID.ZOMBIE_ATTACK_SMASH);
                break;

            case EnemyAttackType.EXPLODE:
                if (inRange) callbacks.onPlayerHit(att.damage, e, DamageID.EXPLOSION, false, att.effect, att.effectDuration, att.effectDamage, att.type);
                if (callbacks.spawnPart) callbacks.spawnPart(pos.x, 1.0, pos.z, 'large_fire', 5);

                callbacks.playSound(SoundID.ZOMBIE_DEATH_EXPLODE);
                e.hp = 0;
                e.lastDamageType = DamageID.EXPLOSION;
                if (callbacks.applyDamage) callbacks.applyDamage(e, 9999, DamageID.EXPLOSION, true);
                break;

            case EnemyAttackType.SMASH:
            case EnemyAttackType.FREEZE_JUMP:
                if (inRange) {
                    const dType = att.type === EnemyAttackType.FREEZE_JUMP ? DamageID.ELECTRIC : DamageID.PHYSICAL;
                    callbacks.onPlayerHit(att.damage, e, dType, false, att.effect, att.effectDuration, att.effectDamage, att.type);
                }
                if (callbacks.spawnPart) {
                    callbacks.spawnPart(pos.x, 0.2, pos.z, 'ground_impact', 12);
                    callbacks.spawnPart(pos.x, 0.1, pos.z, 'shockwave', 1);
                    if (att.type === EnemyAttackType.FREEZE_JUMP) {
                        callbacks.spawnPart(pos.x, 0.5, pos.z, 'frost_nova', 8);
                    }
                }
                callbacks.playSound(SoundID.ZOMBIE_ATTACK_SMASH);
                break;

            case EnemyAttackType.SCREECH:
                if (inRange) callbacks.onPlayerHit(att.damage, e, DamageID.PHYSICAL, false, att.effect, att.effectDuration, att.effectDamage, att.type);
                if (callbacks.spawnPart) callbacks.spawnPart(pos.x, pos.y + 1.8, pos.z, 'screech_wave', 1);
                callbacks.playSound(SoundID.ZOMBIE_GROWL_RUNNER);
                break;

            case EnemyAttackType.ELECTRIC_BEAM:
            case EnemyAttackType.MAGNETIC_CHAIN:
                if (inRange) callbacks.onPlayerHit(att.damage, e, DamageID.ELECTRIC, false, att.effect, att.effectDuration, att.effectDamage, att.type);
                callbacks.playSound(SoundID.SHOT_ARC_CANNON);
                break;
        }
    },

    updateContinuousAttack: (e: Enemy, att: AttackDefinition, playerPos: THREE.Vector3, callbacks: any, delta: number, simTime: number, renderTime: number) => {
        const pos = e.mesh.position;
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
                    if (callbacks.spawnPart) callbacks.spawnPart(pos.x, pos.y + 1.5, pos.z, 'magnetic_sparks', 2);
                    callbacks.onPlayerHit(att.damage * delta, e, DamageType.PHYSICAL, true, att.effect, att.effectDuration, att.effectDamage, att.type);

                    if (callbacks.applyExternalForce) {
                        const dist = Math.sqrt(currentDistSq);
                        const invDist = dist > 0.0001 ? -1.0 / dist : 0.0;
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