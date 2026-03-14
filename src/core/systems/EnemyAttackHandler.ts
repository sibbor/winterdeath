import * as THREE from 'three';
import { Enemy, DEFAULT_ATTACK_RANGE } from '../../types/enemy';
import { AttackDefinition, EnemyAttackType, DamageType } from '../../types/combat';
import { PerformanceMonitor } from './PerformanceMonitor';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _vTarget = new THREE.Vector3();

export const EnemyAttackHandler = {
    /**
     * Huvudfunktion som anropas när `chargeTime` är slut och attacken faktiskt utlöses.
     */
    executeAttack: (e: Enemy, att: AttackDefinition, distSq: number, playerPos: THREE.Vector3, callbacks: any) => {
        if (PerformanceMonitor.getInstance().aiLoggingEnabled) {
            console.log(`[EnemyAttackHandler] ${e.type}_${e.id} performed attack ${att.type} for ${att.damage} dmg`);
        }

        // 1. Sätt cooldown direkt för denna specifika attack
        if (e.attackCooldowns) {
            e.attackCooldowns[att.type] = att.cooldown;
        }

        // 2. Dela upp logiken
        if (att.type === EnemyAttackType.HIT) {
            EnemyAttackHandler.handleBasicHit(e, att, distSq, callbacks);
        } else {
            EnemyAttackHandler.handleSpecialAttack(e, att, distSq, playerPos, callbacks);
        }
    },

    /**
     * Hanterar vanliga melee-slag (Walkers, Runners etc).
     */
    handleBasicHit: (e: Enemy, att: AttackDefinition, distSq: number, callbacks: any) => {
        const range = att.range || DEFAULT_ATTACK_RANGE;
        const rangeSq = range * range;

        if (distSq < rangeSq) {
            callbacks.onPlayerHit(att.damage, e, DamageType.PHYSICAL, false, att.effect, att.effectDuration, att.effectDamage, att.type);
            callbacks.playSound(att.type)
        }
    },

    /**
     * Hanterar engångs-specialattacker och AoE-attacker (Explosion, Smash, Jump).
     */
    handleSpecialAttack: (e: Enemy, att: AttackDefinition, distSq: number, playerPos: THREE.Vector3, callbacks: any) => {
        const pos = e.mesh.position;
        _vTarget.copy(playerPos);

        // Om attacken har en radius (AoE) använder vi den, annars range, annars default.
        const effectiveRange = att.radius || att.range || DEFAULT_ATTACK_RANGE;
        const inRange = distSq < (effectiveRange * effectiveRange);

        switch (att.type) {
            case EnemyAttackType.BITE:
                if (inRange) {
                    callbacks.onPlayerHit(att.damage, e, DamageType.BITE, false, att.effect, att.effectDuration, att.effectDamage, att.type);
                    if (callbacks.spawnPart) callbacks.spawnPart(_vTarget.x, _vTarget.y + 1.0, _vTarget.z, 'blood', 3);
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

                // BOMBERNS SJÄLVMORD - Måste döda zombien!
                e.hp = 0;
                e.lastDamageType = 'EXPLOSION';
                if (callbacks.applyDamage) callbacks.applyDamage(e, 9999, DamageType.EXPLOSION, true);
                break;

            case EnemyAttackType.SMASH:
            case EnemyAttackType.FREEZE_JUMP:
                if (inRange) {
                    const dType = att.type === EnemyAttackType.FREEZE_JUMP ? DamageType.PHYSICAL : DamageType.PHYSICAL; // Both are physical impact
                    callbacks.onPlayerHit(att.damage, e, dType, false, att.effect, att.effectDuration, att.effectDamage, att.type);
                }
                if (callbacks.spawnPart) {
                    callbacks.spawnPart(pos.x, 0.2, pos.z, 'ground_impact', 12);
                    callbacks.spawnPart(pos.x, 0.1, pos.z, 'shockwave', 1);
                    if (att.type === EnemyAttackType.FREEZE_JUMP) {
                        callbacks.spawnPart(pos.x, 0.5, pos.z, 'frost_nova', 8); // Speciell boss-effekt
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
                // Dessa är kontinuerliga. executeAttack körs bara när charge är klar (eller när attacken startar).
                // Spelljud för uppstarten kan läggas här.
                callbacks.playSound(`${att.type}_start`);
                break;
        }
    },

    /**
     * Körs VARJE frame under AIState.ATTACKING om attacken är kontinuerlig.
     */
    updateContinuousAttack: (e: Enemy, att: AttackDefinition, delta: number, playerPos: THREE.Vector3, callbacks: any) => {
        const pos = e.mesh.position;
        _v1.subVectors(playerPos, pos);
        const currentDistSq = _v1.lengthSq();
        const rangeSq = (att.range || 10.0) ** 2;

        switch (att.type) {
            case EnemyAttackType.ELECTRIC_BEAM:
                // Partiklar för beam
                if (callbacks.spawnPart) {
                    _v2.copy(_v1).normalize().multiplyScalar(5.0); // Riktning
                    callbacks.spawnPart(pos.x, pos.y + 1.8, pos.z, 'electric_beam', 1, undefined, _v2);

                    if (currentDistSq < rangeSq) {
                        callbacks.spawnPart(playerPos.x, playerPos.y + 1.0, playerPos.z, 'electric_flash', 1);
                        // Strålen delar ut skada över tid
                        callbacks.onPlayerHit(att.damage * delta, e, DamageType.ELECTRIC, true, att.effect, att.effectDuration, att.effectDamage, att.type);
                    }
                }
                break;

            case EnemyAttackType.MAGNETIC_CHAIN:
                if (currentDistSq < rangeSq) {
                    if (callbacks.spawnPart) {
                        callbacks.spawnPart(pos.x, pos.y + 1.5, pos.z, 'magnetic_sparks', 2);
                    }

                    // Skada över tid (5 dmg/sec)
                    callbacks.onPlayerHit(att.damage * delta, e, DamageType.PHYSICAL, true, att.effect, att.effectDuration, att.effectDamage, att.type);

                    // Här dras spelaren framåt rent fysiskt (du måste implementera applyExternalForce i din callback eller PlayerStatsSystem)
                    if (callbacks.applyExternalForce) {
                        _v2.copy(_v1).normalize().negate(); // Vektor från spelare MOT bossen
                        callbacks.applyExternalForce(_v2, 0.9); // Dra med 90% styrka
                    }
                }
                break;
        }
    }
};