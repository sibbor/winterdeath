import * as THREE from 'three';
import { Enemy, AIState, EnemyEffectType, EnemyDeathState, DEFAULT_ATTACK_RANGE, EnemyType } from '../../entities/enemies/EnemyTypes';
import { DamageType, EnemyAttackType } from '../../entities/player/CombatTypes';
import { EnemyAttackHandler } from './EnemyAttackHandler';
import { applyCollisionResolution } from '../../core/world/CollisionResolution';
import { SpatialGrid } from '../../core/world/SpatialGrid';
import { WeaponType, WEAPONS } from '../../content/weapons';
import { haptic } from '../../utils/HapticManager';
import { soundManager } from '../../utils/SoundManager';
import { WaterSystem, _buoyancyResult } from '../../systems/WaterSystem';
import { PerformanceMonitor } from '../../systems/PerformanceMonitor';
import { EnemyAnimator } from './EnemyAnimator';
import { NoiseType } from '../../systems/NoiseSystem';

// Search timers (seconds) for different noise types
const SEARCH_TIMERS: Record<string, number> = {
    [NoiseType.PLAYER_WALK]: 2.0,
    [NoiseType.PLAYER_RUSH]: 2.0,
    [NoiseType.PLAYER_ROLLING]: 2.0,
    [NoiseType.PLAYER_SWIM]: 2.0,
    [NoiseType.GUNSHOT]: 5.0,
    [NoiseType.GRENADE]: 8.0,
    [NoiseType.MOLOTOV]: 8.0,
    [NoiseType.FLASHBANG]: 8.0,
    [NoiseType.OTHER]: 3.0
};

const _waterCheckResult = { flatDepth: 0 };

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3();
const _v6 = new THREE.Vector3();

function logAI(msg: string) {
    if (PerformanceMonitor.getInstance().aiLoggingEnabled) {
        console.log(msg);
    }
}

function logStateChange(e: Enemy, newState: AIState, reason?: string) {
    if (e.state !== newState) {
        const reasonStr = reason ? ` (${reason})` : '';
        logAI(`[EnemyAI] ${e.type}_${e.id} changed state: ${AIState[e.state]} -> ${AIState[newState]}${reasonStr}`);
    }
}

export const EnemyAI = {
    updateEnemy: (
        e: Enemy,
        now: number,
        delta: number,
        playerPos: THREE.Vector3,
        collisionGrid: SpatialGrid,
        noiseEvents: any[],
        isDead: boolean,
        callbacks: {
            onPlayerHit: (damage: number, attacker: any, type: string, effect?: any, effectDuration?: number, effectIntensity?: number) => void;
            applyDamage: (enemy: Enemy, amount: number, type: string, isHighImpact?: boolean) => void;
            onEffectTick: (e: Enemy, type: EnemyEffectType) => void;
            playSound: (id: string) => void;
            spawnBubble: (text: string, duration: number) => void;
            spawnPart?: (x: number, y: number, z: number, type: string, count: number) => void;
            makeNoise?: (pos: THREE.Vector3, radius: number, type: NoiseType) => void;
        },
        water?: WaterSystem
    ) => {
        if (e.deathState === EnemyDeathState.DEAD || !e.mesh) return;

        // --- 0. DISTANCE CULLING (AI SLEEP) ---
        const dx = playerPos.x - e.mesh.position.x;
        const dz = playerPos.z - e.mesh.position.z;
        const distSq = dx * dx + dz * dz;

        if (distSq > 10000 &&
            e.deathState === EnemyDeathState.ALIVE &&
            !e.isBurning &&
            !e.isDrowning &&
            (!e.knockbackVel || e.knockbackVel.lengthSq() < 0.1) &&
            (!e.stunTimer || e.stunTimer <= 0)
        ) {
            if (e.state === AIState.CHASE || e.state === AIState.SEARCH) {
                e.state = AIState.IDLE;
            }
            return;
        }

        // --- 1. HANDLE INITIAL DEATH TRIGGER ---
        if (e.hp <= 0 && e.deathState === EnemyDeathState.ALIVE) {
            const dmgType = e.lastDamageType || '';
            const weapon = WEAPONS[dmgType as WeaponType];

            // O(1) Dictionary lookup instead of Object.values().includes()
            const isWeapon = !!weapon;
            const cause = isWeapon ? `Weapon (${e.lastDamageType})` : `Effect (${e.lastDamageType})`;
            logAI(`[AI] ${e.type}_${e.id} killed by: ${cause}`);
            e.deathTimer = now;

            const baseScale = e.originalScale || 1.0;
            const widthScale = e.widthScale || 1.0;
            e.mesh.scale.set(baseScale * widthScale, baseScale, baseScale * widthScale);

            const isHighImpact = e.lastHitWasHighImpact;
            let weaponImpact = EnemyDeathState.SHOT;
            if (weapon && weapon.impactType) {
                weaponImpact = weapon.impactType;
            }

            if (weaponImpact === EnemyDeathState.ELECTRIFIED || dmgType === WeaponType.ARC_CANNON) {
                e.deathState = EnemyDeathState.ELECTRIFIED;
                e.deathVel.set(0, 0, 0);
            }
            else if (e.isBurning || dmgType === WeaponType.MOLOTOV || dmgType === WeaponType.FLAMETHROWER || dmgType === DamageType.BURN) {
                e.deathState = EnemyDeathState.BURNED;
            }
            else if (dmgType === WeaponType.GRENADE || e.type === EnemyType.BOMBER || e.isBoss) {
                e.deathState = EnemyDeathState.EXPLODED;
                if (dmgType !== WeaponType.GRENADE) {
                    soundManager.playExplosion();
                    haptic.explosion();
                }
            }
            else if (weaponImpact === EnemyDeathState.GIBBED && isHighImpact) {
                e.deathState = EnemyDeathState.GIBBED;
                e.mesh.userData.gibbed = true;
            }
            else if (weapon) {
                e.deathState = EnemyDeathState.SHOT;

                if (e.deathVel) {
                    _v1.subVectors(e.mesh.position, playerPos).normalize();
                    // Eliminated .clone() hidden in dot product
                    _v2.copy(_v1).negate();
                    const forwardMomentum = e.velocity.dot(_v2);
                    e.fallForward = forwardMomentum > 1.5;

                    e.deathVel.copy(e.velocity).multiplyScalar(0.1);
                    const impactForce = weapon.damage * 0.15;
                    e.deathVel.addScaledVector(_v1, impactForce).setY(weapon.damage > 20 ? 3.5 : 2.0);
                }

                e.mesh.userData.spinDir = (Math.random() - 0.5) * 5.0;
            }
            else {
                e.deathState = EnemyDeathState.GENERIC;
                if (e.deathVel) {
                    _v1.subVectors(e.mesh.position, playerPos).normalize();
                    _v2.copy(_v1).negate();
                    const forwardMomentum = e.velocity.dot(_v2);
                    e.fallForward = forwardMomentum > 1.5;
                    e.deathVel.copy(_v1).multiplyScalar(8.0).setY(3.0);
                }
                e.mesh.userData.spinDir = (Math.random() - 0.5) * 6.0;
            }

            return; // Hand over control to EnemyManager
        }

        // AI only processes ALIVE enemies from here on
        if (e.deathState !== EnemyDeathState.ALIVE) return;

        // --- 2. POOLING SCALE RECOVERY ---
        const targetScaleY = e.originalScale || 1.0;
        if (Math.abs(e.mesh.scale.y - targetScaleY) > 0.05) {
            const w = e.widthScale || 1.0;
            e.mesh.scale.set(targetScaleY * w, targetScaleY, targetScaleY * w);
            e.mesh.visible = true;
        }

        // --- 3. STATUS EFFECTS ---
        handleStatusEffects(e, delta, now, callbacks);

        let isPhysicallyAirborne = false;

        // --- 4. MASS-BASED KNOCKBACK PHYSICS ---
        if (e.knockbackVel && e.knockbackVel.lengthSq() > 0.01) {
            if (!e.mesh.userData.wasKnockedBack) {
                e.mesh.userData.wasKnockedBack = true;
            }

            isPhysicallyAirborne = true;
            const mass = (e.originalScale || 1.0) * (e.widthScale || 1.0);
            const moveInertia = delta / Math.max(0.5, mass);

            e.mesh.position.addScaledVector(e.knockbackVel, moveInertia);
            e.knockbackVel.y -= 50 * delta;

            const friction = 1.0 + (mass * 2.0);
            e.knockbackVel.multiplyScalar(Math.max(0, 1 - friction * delta));

            if (e.mesh.position.y > e.fallStartY) {
                e.fallStartY = e.mesh.position.y;
            }
            e.isAirborne = true;

            if (e.mesh.position.y <= 0) {
                const peakY = e.fallStartY;
                e.isAirborne = false;
                e.fallStartY = 0;

                if (water) water.checkBuoyancy(e.mesh.position.x, e.mesh.position.y, e.mesh.position.z);

                if (_buoyancyResult.inWater) {
                    water?.spawnRipple(e.mesh.position.x, e.mesh.position.z, 1.5);
                } else if (peakY > 1.5) {
                    const fallDamage = Math.min(e.maxHp * 0.6, peakY * 8);
                    e.hp -= fallDamage;
                    if (callbacks.applyDamage) callbacks.applyDamage(e, fallDamage, DamageType.FALL, true);

                    callbacks.spawnPart?.(e.mesh.position.x, 0.2, e.mesh.position.z, 'blood', 20);
                    if (e.hp <= 0 && e.deathState === EnemyDeathState.ALIVE) {
                        logAI(`[AI] ${e.type}_${e.id} killed by: Environment (FALL)`);
                        e.deathState = EnemyDeathState.FALL;
                    }
                }

                e.mesh.position.y = 0;
                e.knockbackVel.set(0, 0, 0);
            }
        } else {
            e.mesh.userData.wasKnockedBack = false;
            if (e.isAirborne) {
                e.isAirborne = false;
                e.fallStartY = 0;
            }
        }

        // --- 5. WATER STATE EVALUATION ---
        if (water) {
            water.checkBuoyancy(e.mesh.position.x, e.mesh.position.y, e.mesh.position.z);
            if (_buoyancyResult.inWater) {
                _waterCheckResult.flatDepth = _buoyancyResult.baseWaterLevel - _buoyancyResult.groundY;
                e.isInWater = true;
                e.isWading = _waterCheckResult.flatDepth > 0.4 && _waterCheckResult.flatDepth <= 1.25;
                e.isDrowning = _waterCheckResult.flatDepth > 1.25;
            } else {
                e.isInWater = false;
                e.isWading = false;
                e.isDrowning = false;
                if (e.mesh.position.y < 0) {
                    e.mesh.position.y = THREE.MathUtils.lerp(e.mesh.position.y, 0, 8 * delta);
                    if (e.mesh.position.y > -0.01) e.mesh.position.y = 0;
                }
            }
        }

        // --- 6. DROWNING ---
        if (e.isDrowning && e.deathState === EnemyDeathState.ALIVE) {
            e.drownTimer += delta;

            if (water) {
                const targetY = _buoyancyResult.groundY;
                e.mesh.position.y = THREE.MathUtils.lerp(e.mesh.position.y, targetY, 3 * delta);
            }

            const dj = delta * 60;
            e.mesh.position.x += (Math.random() - 0.5) * 0.18 * dj;
            e.mesh.position.z += (Math.random() - 0.5) * 0.18 * dj;
            e.mesh.rotation.x += (Math.random() - 0.5) * 0.3 * dj;
            e.mesh.rotation.z += (Math.random() - 0.5) * 0.3 * dj;

            e.drownDmgTimer += delta;
            if (e.drownDmgTimer >= 0.15) {
                e.drownDmgTimer = 0;
                water?.spawnRipple(e.mesh.position.x, e.mesh.position.z, 0.9);
                callbacks.spawnPart?.(e.mesh.position.x, _buoyancyResult.waterLevel, e.mesh.position.z, 'splash', 2);

                const tickDmg = e.maxHp * 0.25 * 0.15;
                e.hp -= tickDmg;
                if (callbacks.applyDamage) callbacks.applyDamage(e, tickDmg, DamageType.DROWNING);

                if (e.hp <= 0 && e.deathState === EnemyDeathState.ALIVE) {
                    logAI(`[AI] ${e.type}_${e.id} killed by: Environment (DROWNED)`);
                    e.deathState = EnemyDeathState.DROWNED;
                    e.velocity.set(0, 0, 0);
                    e.knockbackVel.set(0, 0, 0);
                }
            }
            return;
        }

        // --- 7. STUNS & RAGDOLLS ---
        if (e.stunTimer && e.stunTimer > 0) {
            if (!e.mesh.userData.wasStunned) e.mesh.userData.wasStunned = true;
            e.stunTimer -= delta;

            if (e.mesh.userData.isRagdolling && e.mesh.userData.spinVel) {
                isPhysicallyAirborne = true;
                e.mesh.rotation.x += e.mesh.userData.spinVel.x * delta;
                e.mesh.rotation.y += e.mesh.userData.spinVel.y * delta;
                e.mesh.rotation.z += e.mesh.userData.spinVel.z * delta;
                e.mesh.quaternion.setFromEuler(e.mesh.rotation);

                if (e.mesh.position.y <= 0.1) {
                    e.mesh.userData.spinVel.x *= Math.max(0, 1 - 6.0 * delta);
                    e.mesh.userData.spinVel.y *= Math.max(0, 1 - 6.0 * delta);
                    e.mesh.userData.spinVel.z *= Math.max(0, 1 - 6.0 * delta);
                }

                if (e.stunTimer < 0.6) {
                    const recoveryProgress = 1.0 - (e.stunTimer / 0.6);
                    e.mesh.rotation.x = THREE.MathUtils.lerp(e.mesh.rotation.x, 0, recoveryProgress);
                    e.mesh.rotation.z = THREE.MathUtils.lerp(e.mesh.rotation.z, 0, recoveryProgress);
                    e.mesh.quaternion.setFromEuler(e.mesh.rotation);
                }
            } else {
                if (e.mesh.userData.baseY === undefined) e.mesh.userData.baseY = e.mesh.position.y;
                const jitterScale = delta * 60;
                e.mesh.position.x += (Math.random() - 0.5) * 0.2 * jitterScale;
                e.mesh.position.z += (Math.random() - 0.5) * 0.2 * jitterScale;
                e.mesh.rotation.y += (Math.random() - 0.5) * 0.5 * jitterScale;
            }

            if (Math.random() < 0.1) callbacks.onEffectTick(e, EnemyEffectType.STUN);

            if (e.stunTimer <= 0) {
                logStateChange(e, AIState.CHASE);
                e.state = AIState.CHASE;
                e.mesh.userData.isRagdolling = false;
                e.mesh.rotation.x = 0;
                e.mesh.rotation.z = 0;
                e.mesh.quaternion.setFromEuler(e.mesh.rotation);
            }
            return;
        } else {
            e.mesh.userData.wasStunned = false;
        }

        if (e.blindTimer && e.blindTimer > 0) { e.blindTimer -= delta; return; }

        // --- 8. SENSORS & SEPARATION ---
        const canSeePlayer = distSq < 900;
        _v6.set(0, 0, 0);

        const separationRadius = 1.5;
        const separationRadiusSq = separationRadius * separationRadius;

        if (e.state !== AIState.ATTACK_CHARGE && e.state !== AIState.ATTACKING) {
            const nearbyEnemies = collisionGrid.getNearbyEnemies(e.mesh.position, separationRadius);
            for (let i = 0; i < nearbyEnemies.length; i++) {
                const other = nearbyEnemies[i];
                if (other === e || other.deathState !== EnemyDeathState.ALIVE) continue;

                const odx = e.mesh.position.x - other.mesh.position.x;
                const odz = e.mesh.position.z - other.mesh.position.z;
                const odSq = odx * odx + odz * odz;

                if (odSq < separationRadiusSq && odSq > 0.001) {
                    const od = Math.sqrt(odSq);
                    const invOd = 1.0 / od; // Inlined division optimization
                    const pushStrength = (separationRadius - od) / separationRadius;
                    _v6.x += (odx * invOd) * pushStrength * 1.5;
                    _v6.z += (odz * invOd) * pushStrength * 1.5;
                }
            }
            if (_v6.lengthSq() > 9.0) _v6.normalize().multiplyScalar(3.0);
        }

        let heardNoise = false;
        let noisePos: THREE.Vector3 | null = null;

        if (!canSeePlayer && noiseEvents.length > 0) {
            for (let i = 0; i < noiseEvents.length; i++) {
                const n = noiseEvents[i];
                if (!n.active) continue;

                // Inlined distanceToSquared
                const ndx = e.mesh.position.x - n.pos.x;
                const ndz = e.mesh.position.z - n.pos.z;
                const nDistSq = ndx * ndx + ndz * ndz;

                if (nDistSq < (n.radius * n.radius)) {
                    heardNoise = true;
                    noisePos = n.pos;
                    e.lastHeardNoiseType = n.type;
                    break;
                }
            }
        }

        // --- 9. STATE MACHINE ---
        switch (e.state) {
            case AIState.IDLE:
                e.idleTimer -= delta;
                if (canSeePlayer) {
                    logStateChange(e, AIState.CHASE);
                    e.state = AIState.CHASE;
                    updateLastSeen(e, playerPos, now);
                } else if (heardNoise && noisePos) {
                    logStateChange(e, AIState.CHASE);
                    e.state = AIState.CHASE;
                    updateLastSeen(e, noisePos, now);
                } else if (e.idleTimer <= 0) {
                    logStateChange(e, AIState.WANDER);
                    e.state = AIState.WANDER;
                    const angle = Math.random() * Math.PI * 2;
                    _v1.set(e.spawnPos.x + Math.cos(angle) * 6, 0, e.spawnPos.z + Math.sin(angle) * 6);
                    e.velocity.subVectors(_v1, e.mesh.position).normalize().multiplyScalar(e.speed * 5);
                    e.searchTimer = 2.0 + Math.random() * 3.0;
                }
                break;

            case AIState.WANDER:
                e.searchTimer -= delta;
                _v1.set(e.mesh.position.x + e.velocity.x * delta, e.mesh.position.y + e.velocity.y * delta, e.mesh.position.z + e.velocity.z * delta);
                moveEntity(e, _v1, delta, e.speed * 0.5, collisionGrid, _v6);

                if (canSeePlayer) {
                    logStateChange(e, AIState.CHASE);
                    e.state = AIState.CHASE;
                    updateLastSeen(e, playerPos, now);
                } else if (heardNoise && noisePos) {
                    logStateChange(e, AIState.CHASE);
                    e.state = AIState.CHASE;
                    updateLastSeen(e, noisePos, now);
                } else if (e.searchTimer <= 0) {
                    logStateChange(e, AIState.IDLE);
                    e.state = AIState.IDLE; e.idleTimer = 1.0 + Math.random() * 2.0;
                }

                const wanderStepInterval = 1200;
                if (now > (e.lastStepTime || 0) + wanderStepInterval) {
                    e.lastStepTime = now;
                }
                break;

            case AIState.SEARCH:
                e.searchTimer -= delta;
                if (e.lastSeenPos && e.mesh.position.distanceToSquared(e.lastSeenPos) > 1.5) {
                    moveEntity(e, e.lastSeenPos, delta, e.speed * 0.8, collisionGrid, _v6);
                } else {
                    e.mesh.rotation.y += delta * 2.5;
                }

                if (canSeePlayer) {
                    logStateChange(e, AIState.CHASE);
                    e.state = AIState.CHASE;
                    updateLastSeen(e, playerPos, now);
                } else if (heardNoise && noisePos) {
                    logStateChange(e, AIState.CHASE);
                    e.state = AIState.CHASE;
                    updateLastSeen(e, noisePos, now);
                } else if (e.searchTimer <= 0) {
                    logStateChange(e, AIState.IDLE);
                    e.state = AIState.IDLE;
                }
                break;

            case AIState.CHASE:
                if (canSeePlayer) {
                    updateLastSeen(e, playerPos, now);
                } else if (heardNoise && noisePos) {
                    updateLastSeen(e, noisePos, now);
                }

                if ((!canSeePlayer && now - (e.lastSeenTime || 0) > 5000) || distSq > 2500) {
                    logStateChange(e, AIState.SEARCH);
                    e.state = AIState.SEARCH;

                    // Pick the search duration based on what was heard (or default to 5s if strictly visual)
                    const baseTime = e.lastHeardNoiseType ? (SEARCH_TIMERS[e.lastHeardNoiseType] || 5.0) : 5.0;
                    e.searchTimer = baseTime;
                }
                else {
                    // If player is dead, stop chasing
                    if (isDead) {
                        logStateChange(e, AIState.SEARCH);
                        e.state = AIState.SEARCH;
                        e.searchTimer = 3.0;
                        return;
                    }

                    const target = canSeePlayer ? playerPos : e.lastSeenPos!;
                    const chaseSpeed = e.isWading ? e.speed * 0.6 : e.speed;
                    moveEntity(e, target, delta, chaseSpeed, collisionGrid, _v6);

                    const chaseStepInterval = e.type === EnemyType.RUNNER ? 250 : 400;
                    if (now > (e.lastStepTime || 0) + chaseStepInterval) {
                        e.lastStepTime = now;
                    }

                    // --- MULTI-ATTACK SYSTEM ---
                    if (e.attacks && e.attacks.length > 0) {
                        let bestAttackIndex = -1;
                        for (let i = 0; i < e.attacks.length; i++) {
                            const att = e.attacks[i];
                            const cooldown = e.attackCooldowns[att.type] || 0;
                            if (cooldown > 0) continue;

                            // Fallback range for HIT (combat.ts: DEFAULT_ATTACK_RANGE)
                            const range = (att.type === EnemyAttackType.HIT && !att.range) ? DEFAULT_ATTACK_RANGE : (att.range || DEFAULT_ATTACK_RANGE);
                            const rangeSq = range * range;

                            if (distSq < rangeSq) {
                                // If we found a special attack, take it. Otherwise keep looking.
                                if (att.type !== EnemyAttackType.HIT) {
                                    bestAttackIndex = i;
                                    break;
                                } else {
                                    bestAttackIndex = i;
                                }
                            }
                        }

                        if (bestAttackIndex !== -1) {
                            const att = e.attacks[bestAttackIndex];
                            e.currentAttackIndex = bestAttackIndex;

                            if (att.chargeTime && att.chargeTime > 0) {
                                logStateChange(e, AIState.ATTACK_CHARGE);
                                e.state = AIState.ATTACK_CHARGE;
                                e.attackTimer = att.chargeTime / 1000;
                            } else {
                                EnemyAttackHandler.executeAttack(e, att, distSq, playerPos, callbacks);
                                logStateChange(e, AIState.ATTACKING);
                                e.state = AIState.ATTACKING;
                                e.attackTimer = (att.activeTime || 500) / 1000;
                            }
                        }
                    }
                }
                break;


            case AIState.ATTACK_CHARGE:
                if (e.attackTimer !== undefined) {
                    e.attackTimer -= delta;
                    const att = e.attacks![e.currentAttackIndex!];

                    // Orient towards player logically
                    _v5.set(playerPos.x, e.mesh.position.y, playerPos.z);
                    e.mesh.lookAt(_v5);

                    // ALL VISUAL DEFORMATION AND TELEGRAPHING HAPPENS HERE
                    EnemyAnimator.updateAttackAnim(e, now, delta);

                    if (e.attackTimer <= 0) {
                        logStateChange(e, AIState.ATTACKING);
                        e.state = AIState.ATTACKING;
                        e.attackTimer = (att.activeTime || 100) / 1000;
                        EnemyAttackHandler.executeAttack(e, att, distSq, playerPos, callbacks);
                    }
                }
                break;

            case AIState.ATTACKING:
                if (e.attackTimer !== undefined) {
                    e.attackTimer -= delta;
                    const att = e.attacks?.[e.currentAttackIndex!];

                    // Orient towards player logically
                    _v5.set(playerPos.x, e.mesh.position.y, playerPos.z);
                    e.mesh.lookAt(_v5);

                    // Continuous logic for boss attacks (Beam, Chain)
                    if (att && att.activeTime) {
                        EnemyAttackHandler.updateContinuousAttack(e, att, delta, playerPos, callbacks);
                    }

                    // ALL VISUAL DEFORMATION HAPPENS HERE
                    EnemyAnimator.updateAttackAnim(e, now, delta);

                    if (e.attackTimer <= 0) {
                        logStateChange(e, AIState.CHASE);
                        e.state = AIState.CHASE;
                    }
                }
                break;
        }

        // --- 10. COOLDOWNS & BOUNCE ANIMATION ---

        // Zero-GC: Using array iteration instead of slow for...in
        if (e.attacks) {
            for (let i = 0; i < e.attacks.length; i++) {
                const atkType = e.attacks[i].type;
                const cd = e.attackCooldowns[atkType];
                if (cd !== undefined && cd > 0) {
                    e.attackCooldowns[atkType] = Math.max(0, cd - delta * 1000);
                }
            }
        }

        if (e.slowTimer > 0) e.slowTimer -= delta;

        if (!isPhysicallyAirborne && e.state !== AIState.ATTACK_CHARGE) {
            if (e.mesh.userData.baseY === undefined) e.mesh.userData.baseY = e.mesh.position.y;
            e.mesh.position.y = e.mesh.userData.baseY + Math.abs(Math.sin(now * (e.state === AIState.CHASE ? 0.018 : 0.009))) * 0.12;
        }
    }
};

// --- HELPERS ---
function moveEntity(e: Enemy, target: THREE.Vector3, delta: number, speed: number, collisionGrid: SpatialGrid, sepForce: THREE.Vector3) {
    _v1.set(target.x, e.mesh.position.y, target.z);
    _v2.subVectors(_v1, e.mesh.position);
    const dist = _v2.length();
    if (dist < 0.01) return;

    // Inlined division
    const invDist = 1.0 / dist;
    _v2.x *= invDist;
    _v2.y *= invDist;
    _v2.z *= invDist;

    let curSpeed = speed * 10;
    if (e.slowTimer > 0) curSpeed *= 0.55;

    _v3.copy(_v2).multiplyScalar(curSpeed * delta);

    if (sepForce.lengthSq() > 0) {
        _v3.addScaledVector(sepForce, delta * 5.0);
    }

    e.velocity.copy(_v2).multiplyScalar(curSpeed);

    // Inlined vector addition
    _v4.set(
        e.mesh.position.x + _v3.x,
        e.mesh.position.y + _v3.y,
        e.mesh.position.z + _v3.z
    );

    const baseScale = e.originalScale || 1.0;
    const hitRadius = 0.5 * baseScale * (e.widthScale || 1.0);

    const nearby = collisionGrid.getNearbyObstacles(_v4, hitRadius + 1.5);
    for (let i = 0; i < nearby.length; i++) {
        applyCollisionResolution(_v4, hitRadius, nearby[i]);
    }

    const groundY = 1.0 * (e.originalScale || 1.0);
    _v4.y = groundY;

    e.mesh.position.copy(_v4);

    _v5.set(_v1.x, e.mesh.position.y, _v1.z);
    e.mesh.lookAt(_v5);
}

function updateLastSeen(e: Enemy, pos: THREE.Vector3, now: number) {
    if (e.lastSeenPos) {
        e.lastSeenPos.copy(pos);
        e.lastSeenTime = now;
    }
}

function handleStatusEffects(e: Enemy, delta: number, now: number, callbacks: any) {
    if (e.isBurning) {
        if (Math.random() > 0.4) callbacks.onEffectTick(e, EnemyEffectType.FLAME);

        if (e.burnTimer > 0) {
            e.burnTimer -= delta;
            if (e.burnTimer <= 0) {
                e.hp -= 6;
                e.lastDamageType = DamageType.BURN;
                if (callbacks.applyDamage) callbacks.applyDamage(e, 6, DamageType.BURN);
                e.burnTimer = 0.5;
            }
        }
        if (e.afterburnTimer > 0) {
            e.afterburnTimer -= delta;
            if (e.afterburnTimer <= 0) e.isBurning = false;
        }
    }

    if (e.stunTimer > 0 && e.lastDamageType === WeaponType.ARC_CANNON) {
        if (Math.random() < 0.25) callbacks.onEffectTick(e, EnemyEffectType.SPARK);
    }
}