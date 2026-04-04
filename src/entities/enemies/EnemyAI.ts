import * as THREE from 'three';
import { Enemy, AIState, EnemyEffectType, EnemyDeathState, DEFAULT_ATTACK_RANGE, EnemyType, SEARCH_TIMERS } from '../../entities/enemies/EnemyTypes';
import { DamageType, EnemyAttackType } from '../../entities/player/CombatTypes';
import { EnemyAttackHandler } from './EnemyAttackHandler';
import { SpatialGrid } from '../../core/world/SpatialGrid';
import { WeaponType, WEAPONS } from '../../content/weapons';
import { haptic } from '../../utils/HapticManager';
import { soundManager } from '../../utils/audio/SoundManager';
import { WaterSystem, _buoyancyResult } from '../../systems/WaterSystem';
import { PerformanceMonitor } from '../../systems/PerformanceMonitor';
import { EnemyAnimator } from './EnemyAnimator';
import { NoiseType } from './EnemyTypes';

const _waterCheckResult = { flatDepth: 0 };

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3();
const _v6 = new THREE.Vector3();

// --- PRE-CALCULATED CONSTANTS ---
const TWO_PI = Math.PI * 2;
const SEPARATION_RADIUS = 1.5;
const SEPARATION_RADIUS_SQ = SEPARATION_RADIUS * SEPARATION_RADIUS;
const INV_SEPARATION_RADIUS = 1.0 / SEPARATION_RADIUS;
const KPH_TO_MS = 1.0 / 3.6; // Convert kph to meters per second for world-scale physics

function logStateChange(now: number, e: Enemy, newState: AIState, reason?: string) {
    if (PerformanceMonitor.getInstance().aiLoggingEnabled && e.state !== newState) {
        const oldState = e.state;
        const reasonStr = reason ? ` (${reason})` : '';
        console.log(`[EnemyAI] ${e.type}_${e.id} changed state: ${AIState[oldState]} -> ${AIState[newState]}${reasonStr}`);
    }
}

export const EnemyAI = {

    updateEnemy: (
        e: Enemy,
        simTime: number,
        renderTime: number,
        simDelta: number,
        playerPos: THREE.Vector3,
        collisionGrid: SpatialGrid,
        isDead: boolean,
        callbacks: {
            onPlayerHit: (damage: number, attacker: any, type: string, effect?: any, effectDuration?: number, effectIntensity?: number) => void;
            applyDamage: (enemy: Enemy, amount: number, type: string, isHighImpact?: boolean) => void;
            onEffectTick: (e: Enemy, type: EnemyEffectType) => void;
            playSound: (id: string) => void;
            spawnBubble: (text: string, duration: number) => void;
            spawnPart: (x: number, y: number, z: number, type: string, count: number) => void;
        },
        water: WaterSystem | null
    ) => {
        if (e.deathState === EnemyDeathState.DEAD || !e.mesh) return;

        // --- 0. DISTANCE CULLING (AI SLEEP) ---
        const dx = playerPos.x - e.mesh.position.x;
        const dz = playerPos.z - e.mesh.position.z;
        const distSq = dx * dx + dz * dz;

        // --- AI LoD (Level of Detail) TIERS (+50% Distance) ---
        // 1406 = ~37.5u, 5625 = 75u, 14400 = 120u, 22500 = 150u
        const isTier1 = distSq < 1406;
        const isTier2 = !isTier1 && distSq < 5625;
        const isTier3 = !isTier1 && !isTier2 && distSq < 14400;
        const isTier4 = !isTier1 && !isTier2 && !isTier3 && distSq <= 22500;

        // Amortization (Spread load across frames)
        const frameTick = Math.floor(simTime * 0.06); // Approx division by 16.6ms (1/16.6 ~= 0.06)
        const frameOffset = (frameTick + (e.poolId % 60));

        // 22500 = 150 units distance
        if (distSq > 22500 &&
            e.deathState === EnemyDeathState.ALIVE &&
            !e.isBurning &&
            !e.isDrowning &&
            (Math.abs(e.knockbackVel.x) < 0.1 && Math.abs(e.knockbackVel.z) < 0.1) &&
            e.stunTimer <= 0
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

            // Zero-GC: String evaluation guarded by flag
            if (PerformanceMonitor.getInstance().aiLoggingEnabled) {
                const isWeapon = !!weapon;
                const cause = isWeapon ? `Weapon (${e.lastDamageType})` : `Effect (${e.lastDamageType})`;
                console.log(`[AI] ${e.type}_${e.id} killed by: ${cause}`);
            }

            e.deathTimer = simTime;

            const baseScale = e.originalScale;
            const widthScale = e.widthScale;
            e.mesh.scale.set(baseScale * widthScale, baseScale, baseScale * widthScale);

            const isHighImpact = e.lastHitWasHighImpact;
            let weaponImpact = EnemyDeathState.SHOT;
            if (weapon && weapon.impactType) {
                weaponImpact = weapon.impactType;
            }

            if (weaponImpact === EnemyDeathState.ELECTROCUTED || dmgType === WeaponType.ARC_CANNON) {
                e.deathState = EnemyDeathState.ELECTROCUTED;
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
                _v1.subVectors(e.mesh.position, playerPos).normalize();
                _v2.copy(_v1).negate();

                const forwardMomentum = e.velocity.dot(_v2);
                e.fallForward = forwardMomentum > 1.5;
                e.deathVel.copy(e.velocity).multiplyScalar(0.1);

                const impactForce = weapon.damage * 0.15;
                e.deathVel.addScaledVector(_v1, impactForce).setY(weapon.damage > 20 ? 3.5 : 2.0);

                e.mesh.userData.spinDir = (Math.random() - 0.5) * 5.0;
            }
            else {
                e.deathState = EnemyDeathState.GENERIC;
                _v1.subVectors(e.mesh.position, playerPos).normalize();
                _v2.copy(_v1).negate();

                const forwardMomentum = e.velocity.dot(_v2);
                e.fallForward = forwardMomentum > 1.5;
                e.deathVel.copy(_v1).multiplyScalar(8.0).setY(3.0);

                e.mesh.userData.spinDir = (Math.random() - 0.5) * 6.0;
            }
            return;
        }

        if (e.deathState !== EnemyDeathState.ALIVE) return;

        // --- 2. POOLING SCALE RECOVERY ---
        const targetScaleY = e.originalScale;
        if (Math.abs(e.mesh.scale.y - targetScaleY) > 0.05) {
            const w = e.widthScale;
            e.mesh.scale.set(targetScaleY * w, targetScaleY, targetScaleY * w);
            e.mesh.visible = true;
        }

        // --- 3. STATUS EFFECTS ---
        handleStatusEffects(e, simDelta, simTime, callbacks);

        // Zero-GC flag to avoid double-dipping in the water mat
        let checkedWaterThisFrame = false;

        // --- 4. MASS-BASED KNOCKBACK PHYSICS ---
        // Use lengthSq() to catch movement on all axes (including Y straight up)
        if (e.knockbackVel.lengthSq() > 0.001) {
            if (!e.mesh.userData.wasKnockedBack) {
                e.mesh.userData.wasKnockedBack = true;
            }

            const mass = e.originalScale * e.widthScale;
            const moveInertia = simDelta / Math.max(0.5, mass);

            e.mesh.position.addScaledVector(e.knockbackVel, moveInertia);
            e.knockbackVel.y -= 50 * simDelta; // Gravitation

            // Apply friction only on X and Z (horizontally)
            const friction = 1.0 + (mass * 2.0);
            const drag = Math.max(0, 1 - friction * simDelta);
            e.knockbackVel.x *= drag;
            e.knockbackVel.z *= drag;

            if (e.mesh.position.y > e.fallStartY) {
                e.fallStartY = e.mesh.position.y;
            }
            e.isAirborne = true;

            if (e.mesh.position.y <= 0) {
                const peakY = e.fallStartY;
                e.isAirborne = false;
                e.fallStartY = 0;

                if (water) {
                    // We just landed (y <= 0), so we KNOW we are below the 2.0 limit. Run the check!
                    water.checkBuoyancy(e.mesh.position.x, e.mesh.position.y, e.mesh.position.z, renderTime);
                    checkedWaterThisFrame = true; // Mark that we already calculated this
                }

                // Lands in water
                if (water) {
                    water.spawnRipple(e.mesh.position.x, e.mesh.position.z, 1.5);
                } else if (peakY > 1.5) {
                    // FALL DAMAGE
                    const fallDamage = Math.min(e.maxHp * 0.6, peakY * 8);
                    e.hp -= fallDamage;
                    callbacks.applyDamage(e, fallDamage, DamageType.FALL, true);

                    callbacks.spawnPart(e.mesh.position.x, 0.2, e.mesh.position.z, 'blood', 20);
                    if (e.hp <= 0 && e.deathState === EnemyDeathState.ALIVE) {
                        if (PerformanceMonitor.getInstance().aiLoggingEnabled) {
                            console.log(`[AI] ${e.type}_${e.id} killed by: Environment (FALL)`);
                        }
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
            // Y-axis Broadphase & Double-Dip Prevention
            if (!checkedWaterThisFrame) {
                if (e.mesh.position.y < 2.0) {
                    // Zombie is on the ground/near the ground. Do the heavy math.
                    water.checkBuoyancy(e.mesh.position.x, e.mesh.position.y, e.mesh.position.z, renderTime);
                } else {
                    // Broadphase Early-Out: Zombie is flying high!
                    // MUST be reset manually otherwise we inherit another zombie's water status
                    _buoyancyResult.inWater = false;
                }
            }

            if (_buoyancyResult.inWater) {
                _waterCheckResult.flatDepth = _buoyancyResult.baseWaterLevel - _buoyancyResult.groundY;
                e.isInWater = true;
                e.isWading = _waterCheckResult.flatDepth > 0.4 && _waterCheckResult.flatDepth <= 1.25;

                // --- TIRING SWIM MECHANIC ---
                const inDeepWater = _waterCheckResult.flatDepth > 1.25;
                if (inDeepWater && !e.isDrowning) {
                    // Accumulate distance swum (multiply length by simDelta for meters)
                    e.swimDistance += e.velocity.length() * simDelta;
                    if (e.swimDistance > e.maxSwimDistance) {
                        e.isDrowning = true;
                    }
                } else if (!inDeepWater) {
                    // Reset swim distance if they reach shallow water
                    e.swimDistance = 0;
                    e.isDrowning = false;
                }
            } else {
                e.isInWater = false;
                e.isWading = false;
                e.isDrowning = false;
                e.swimDistance = 0;
                if (e.mesh.position.y < 0) {
                    e.mesh.position.y = THREE.MathUtils.lerp(e.mesh.position.y, 0, 8 * simDelta);
                    if (e.mesh.position.y > -0.01) e.mesh.position.y = 0;
                }
            }
        }

        // --- 6. DROWNING ---
        if (e.isDrowning && e.deathState === EnemyDeathState.ALIVE) {
            e.drownTimer += simDelta;

            if (water) {
                // FLOAT ON SURFACE (Grit choice: Drowning enemies stay at water level)
                const targetY = _buoyancyResult.waterLevel - 0.2;
                e.mesh.position.y = THREE.MathUtils.lerp(e.mesh.position.y, targetY, 3 * simDelta);
            }

            const dj = simDelta * 60;
            e.mesh.position.x += (Math.random() - 0.5) * 0.18 * dj;
            e.mesh.position.z += (Math.random() - 0.5) * 0.18 * dj;
            e.mesh.rotation.x += (Math.random() - 0.5) * 0.3 * dj;
            e.mesh.rotation.z += (Math.random() - 0.5) * 0.3 * dj;

            e.drownDmgTimer += simDelta;
            if (e.drownDmgTimer >= 0.15) {
                e.drownDmgTimer = 0;
                // Use a larger, more visible ripple for the struggle
                if (water) water.spawnRipple(e.mesh.position.x, e.mesh.position.z, 0.9, 1.2);
                callbacks.spawnPart(e.mesh.position.x, _buoyancyResult.waterLevel, e.mesh.position.z, 'splash', 4);

                const tickDmg = e.maxHp * 0.05; // 5% damage per struggle tick
                e.hp -= tickDmg;
                // VINTERDÖD: DamageType.DROWNING signals EnemyManager to skip blood
                callbacks.applyDamage(e, tickDmg, DamageType.DROWNING);

                if (e.hp <= 0 && e.deathState === EnemyDeathState.ALIVE) {
                    if (PerformanceMonitor.getInstance().aiLoggingEnabled) {
                        console.log(`[AI] ${e.type}_${e.id} killed by: Environment (DROWNED)`);
                    }
                    e.deathState = EnemyDeathState.DROWNED;
                    e.velocity.set(0, 0, 0);
                    e.knockbackVel.set(0, 0, 0);
                }
            }
            return;
        }

        // --- 7. STUNS & RAGDOLLS ---
        if (e.stunTimer > 0) {
            if (!e.mesh.userData.wasStunned) e.mesh.userData.wasStunned = true;
            e.stunTimer -= simDelta;

            if (e.mesh.userData.isRagdolling && e.mesh.userData.spinVel) {
                e.mesh.rotation.x += e.mesh.userData.spinVel.x * simDelta;
                e.mesh.rotation.y += e.mesh.userData.spinVel.y * simDelta;
                e.mesh.rotation.z += e.mesh.userData.spinVel.z * simDelta;
                e.mesh.quaternion.setFromEuler(e.mesh.rotation);

                if (e.mesh.position.y <= 0.1) {
                    e.mesh.userData.spinVel.x *= Math.max(0, 1 - 6.0 * simDelta);
                    e.mesh.userData.spinVel.y *= Math.max(0, 1 - 6.0 * simDelta);
                    e.mesh.userData.spinVel.z *= Math.max(0, 1 - 6.0 * simDelta);
                }

                if (e.stunTimer < 0.6) {
                    const recoveryProgress = 1.0 - (e.stunTimer / 0.6);
                    e.mesh.rotation.x = THREE.MathUtils.lerp(e.mesh.rotation.x, 0, recoveryProgress);
                    e.mesh.rotation.z = THREE.MathUtils.lerp(e.mesh.rotation.z, 0, recoveryProgress);
                    e.mesh.quaternion.setFromEuler(e.mesh.rotation);
                }
            } else {
                const jitterScale = simDelta * 60;
                e.mesh.position.x += (Math.random() - 0.5) * 0.2 * jitterScale;
                e.mesh.position.z += (Math.random() - 0.5) * 0.2 * jitterScale;
                e.mesh.rotation.y += (Math.random() - 0.5) * 0.5 * jitterScale;
            }

            if (Math.random() < 0.1) callbacks.onEffectTick(e, EnemyEffectType.STUN);

            if (e.stunTimer <= 0) {
                logStateChange(simTime, e, AIState.CHASE);
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

        if (e.blindTimer > 0) { e.blindTimer -= simDelta; return; }

        // --- 8. SENSORS & SEPARATION ---
        const isFullyAware = e.awareness >= 0.9;
        const seesPlayer = isFullyAware && e.lastKnownPosition.distanceToSquared(playerPos) < 2.0;

        _v6.set(0, 0, 0);

        // LoD: Throttled separation queries
        let shouldCheckSeparation = isTier1;
        if (isTier2) shouldCheckSeparation = (frameOffset % 5 === 0);
        if (isTier3) shouldCheckSeparation = false; // Skip entirely at Tier 3+

        if (shouldCheckSeparation && e.state !== AIState.ATTACK_CHARGE && e.state !== AIState.ATTACKING) {
            const nearbyEnemies = collisionGrid.getNearbyEnemies(e.mesh.position, SEPARATION_RADIUS);
            for (let i = 0; i < nearbyEnemies.length; i++) {
                const other = nearbyEnemies[i];
                if (other === e || other.deathState !== EnemyDeathState.ALIVE) continue;

                const odx = e.mesh.position.x - other.mesh.position.x;
                const odz = e.mesh.position.z - other.mesh.position.z;
                const odSq = odx * odx + odz * odz;

                if (odSq < SEPARATION_RADIUS_SQ && odSq > 0.001) {
                    const od = Math.sqrt(odSq);
                    const invOd = 1.0 / od;
                    const pushStrength = (SEPARATION_RADIUS - od) * INV_SEPARATION_RADIUS;
                    _v6.x += (odx * invOd) * pushStrength * 1.5;
                    _v6.z += (odz * invOd) * pushStrength * 1.5;
                }
            }
            if (Math.abs(_v6.x) > 0.001 || Math.abs(_v6.z) > 0.001) {
                if (_v6.lengthSq() > 9.0) _v6.normalize().multiplyScalar(3.0);
            }
        }

        // --- 9. STATE MACHINE ---
        switch (e.state) {
            case AIState.IDLE:
                e.idleTimer -= simDelta;
                if (seesPlayer) {
                    logStateChange(simTime, e, AIState.CHASE, 'VISUAL');
                    e.state = AIState.CHASE;
                    updateLastSeen(e, playerPos, simTime);
                } else if (e.awareness > 0) {
                    logStateChange(simTime, e, AIState.SEARCH, 'AWARE');
                    e.state = AIState.SEARCH;
                    e.searchTimer = 5.0;
                } else if (e.idleTimer <= 0) {
                    logStateChange(simTime, e, AIState.WANDER);
                    e.state = AIState.WANDER;

                    const angle = Math.random() * TWO_PI;
                    _v1.set(e.spawnPos.x + Math.cos(angle) * 6, 0, e.spawnPos.z + Math.sin(angle) * 6);
                    e.velocity.subVectors(_v1, e.mesh.position).normalize().multiplyScalar(e.speed * KPH_TO_MS * 5);
                    e.searchTimer = 2.0 + Math.random() * 3.0;
                }
                break;

            case AIState.WANDER:
                e.searchTimer -= simDelta;
                _v1.set(e.mesh.position.x + e.velocity.x * simDelta, e.mesh.position.y + e.velocity.y * simDelta, e.mesh.position.z + e.velocity.z * simDelta);

                // Tier 4: Minimal updates, skip movement physics
                if (!isTier4) {
                    moveEntity(e, _v1, simDelta, e.speed * KPH_TO_MS * 0.5, collisionGrid, _v6, simTime, renderTime, false, isTier1, isTier2, frameOffset);
                }

                if (seesPlayer) {
                    logStateChange(simTime, e, AIState.CHASE, 'VISUAL');
                    e.state = AIState.CHASE;
                    updateLastSeen(e, playerPos, simTime);
                } else if (e.awareness > 0) {
                    logStateChange(simTime, e, AIState.SEARCH, 'AWARE');
                    e.state = AIState.SEARCH;
                    e.searchTimer = 5.0;
                } else if (e.searchTimer <= 0) {
                    logStateChange(simTime, e, AIState.IDLE);
                    e.state = AIState.IDLE;
                    e.idleTimer = 1.0 + Math.random() * 2.0;
                }
                break;

            case AIState.SEARCH:
                e.searchTimer -= simDelta;

                if (seesPlayer) {
                    logStateChange(simTime, e, AIState.CHASE, 'VISUAL');
                    e.state = AIState.CHASE;
                    updateLastSeen(e, playerPos, simTime);
                } else if (e.awareness === 1.0) {
                    updateLastSeen(e, e.lastKnownPosition, simTime);
                    e.searchTimer = e.lastHeardNoiseType !== NoiseType.NONE ? (SEARCH_TIMERS[e.lastHeardNoiseType] || 5.0) : 5.0;
                } else if (e.searchTimer <= 0) {
                    logStateChange(simTime, e, AIState.IDLE);
                    e.state = AIState.IDLE;
                    e.idleTimer = 1.0 + Math.random() * 2.0;
                } else if (e.mesh.position.distanceToSquared(e.lastKnownPosition) > 1.5) {
                    if (!isTier4) {
                        moveEntity(e, e.lastKnownPosition, simDelta, e.speed * KPH_TO_MS * 0.8, collisionGrid, _v6, simTime, renderTime, false, isTier1, isTier2, frameOffset);
                    }
                } else {
                    e.mesh.rotation.y += simDelta * 2.5; // Spin around looking
                }
                break;

            case AIState.CHASE:
                if (seesPlayer) {
                    updateLastSeen(e, playerPos, simTime);
                } else if (e.awareness === 1.0) {
                    updateLastSeen(e, e.lastKnownPosition, simTime);
                }

                if ((!seesPlayer && simTime - e.lastSeenTime > 5000) || distSq > 2500) {
                    logStateChange(simTime, e, AIState.SEARCH);
                    e.state = AIState.SEARCH;
                    const baseTime = e.lastHeardNoiseType !== NoiseType.NONE ? (SEARCH_TIMERS[e.lastHeardNoiseType] || 5.0) : 5.0;
                    e.searchTimer = baseTime;
                }
                else {
                    if (isDead) {
                        logStateChange(simTime, e, AIState.SEARCH);
                        e.state = AIState.SEARCH;
                        e.searchTimer = 3.0;
                        return;
                    }

                    const target = (seesPlayer) ? playerPos : e.lastKnownPosition;
                    let chaseSpeed = (e.isWading ? e.speed * 0.6 : e.speed) * KPH_TO_MS;

                    if (!isTier4) {
                        moveEntity(e, target, simDelta, chaseSpeed, collisionGrid, _v6, simTime, renderTime, true, isTier1, isTier2, frameOffset);
                    }

                    const chaseStepInterval = e.type === EnemyType.RUNNER ? 250 : 400;
                    if (simTime > e.lastStepTime + chaseStepInterval) {
                        e.lastStepTime = simTime;
                    }

                    // --- MULTI-ATTACK SYSTEM ---
                    if (e.attacks.length > 0) {
                        let bestAttackIndex = -1;
                        for (let i = 0; i < e.attacks.length; i++) {
                            const att = e.attacks[i];
                            const cooldown = e.attackCooldowns[att.type] || 0;
                            if (cooldown > 0) continue;

                            const range = (att.type === EnemyAttackType.HIT && !att.range) ? DEFAULT_ATTACK_RANGE : (att.range || DEFAULT_ATTACK_RANGE);
                            const rangeSq = range * range;

                            if (distSq < rangeSq) {
                                bestAttackIndex = i;
                                if (att.type !== EnemyAttackType.HIT) {
                                    break;
                                }
                            }
                        }

                        if (bestAttackIndex !== -1) {
                            const att = e.attacks[bestAttackIndex];
                            e.currentAttackIndex = bestAttackIndex;

                            if (att.chargeTime && att.chargeTime > 0) {
                                logStateChange(simTime, e, AIState.ATTACK_CHARGE);
                                e.state = AIState.ATTACK_CHARGE;
                                e.attackTimer = att.chargeTime * 0.001;
                            } else {
                                EnemyAttackHandler.executeAttack(e, att, distSq, playerPos, callbacks);
                                logStateChange(simTime, e, AIState.ATTACKING);
                                e.state = AIState.ATTACKING;
                                e.attackTimer = (att.activeTime || 500) * 0.001;
                            }
                        }
                    }
                }
                break;

            case AIState.ATTACK_CHARGE:
                if (e.attackTimer !== -1) {
                    e.attackTimer -= simDelta;
                    const att = e.attacks[e.currentAttackIndex!];

                    // Slowly follow/face player during charge
                    if (!isTier4) {
                        moveEntity(e, playerPos, simDelta, e.speed * KPH_TO_MS * 0.25, collisionGrid, _v6, simTime, renderTime, true, isTier1, isTier2, frameOffset);
                    }

                    if (e.attackTimer <= 0) {
                        logStateChange(simTime, e, AIState.ATTACKING);
                        e.state = AIState.ATTACKING;
                        e.attackTimer = (att.activeTime || 100) * 0.001;
                        EnemyAttackHandler.executeAttack(e, att, distSq, playerPos, callbacks);
                    }
                }
                break;

            case AIState.ATTACKING:
                if (e.attackTimer !== -1) {
                    e.attackTimer -= simDelta;
                    const att = e.attacks[e.currentAttackIndex!];

                    // Limited movement during active attack frame
                    if (!isTier4) {
                        moveEntity(e, playerPos, simDelta, e.speed * KPH_TO_MS * 0.15, collisionGrid, _v6, simTime, renderTime, true, isTier1, isTier2, frameOffset);
                    }

                    if (att && att.activeTime) {
                        EnemyAttackHandler.updateContinuousAttack(e, att, simDelta, playerPos, callbacks);
                    }

                    if (e.attackTimer <= 0) {
                        logStateChange(simTime, e, AIState.CHASE, 'VISUAL');
                        e.state = AIState.CHASE;
                    }
                }
                break;
        }

        // --- 10. PROCEDURAL ANIMATION ---
        EnemyAnimator.updateAttackAnim(e, simTime, renderTime, simDelta);

        // --- 11. COOLDOWNS ---
        for (let i = 0; i < e.attacks.length; i++) {
            const atkType = e.attacks[i].type;
            const cd = e.attackCooldowns[atkType];
            if (cd !== undefined && cd > 0) {
                e.attackCooldowns[atkType] = Math.max(0, cd - simDelta * 1000);
            }
        }

        if (e.slowTimer > 0) e.slowTimer -= simDelta;
    }
};

// --- HELPERS ---
function moveEntity(e: Enemy, target: THREE.Vector3, simDelta: number, speed: number, collisionGrid: SpatialGrid, sepForce: THREE.Vector3, simTime: number, renderTime: number, isChasing: boolean, isTier1: boolean, isTier2: boolean, frameOffset: number) {
    _v1.set(target.x, e.mesh.position.y, target.z);
    _v2.subVectors(_v1, e.mesh.position);
    const dist = _v2.length();
    if (dist < 0.01) return;

    const invDist = 1.0 / dist;
    _v2.x *= invDist;
    _v2.y *= invDist;
    _v2.z *= invDist;

    // Use multiplication instead of division (speed * 0.277777... is approx speed/3.6)
    let curSpeed = speed * 0.2777777777777778;
    if (e.slowTimer > 0) curSpeed *= 0.55;

    _v3.copy(_v2).multiplyScalar(curSpeed * simDelta);

    if (Math.abs(sepForce.x) > 0.001 || Math.abs(sepForce.z) > 0.001) {
        _v3.addScaledVector(sepForce, simDelta * 5.0);
    }

    e.velocity.copy(_v2).multiplyScalar(curSpeed);

    _v4.set(
        e.mesh.position.x + _v3.x,
        e.mesh.position.y + _v3.y,
        e.mesh.position.z + _v3.z
    );

    // Ground bounce applied directly here (Zero-GC)
    const baseScale = e.originalScale;
    const hitRadius = 0.5 * baseScale * e.widthScale;

    // --- PROCEDURAL ANIMATION SCALING (Zero-GC) ---
    // Frequency should scale with current movement speed to match visual stride with physical displacement
    const speedRatio = speed / (22.5 * KPH_TO_MS); // Normalized to standard Walker speed
    const animFreq = isChasing ? 0.055 * speedRatio : 0.035 * speedRatio;
    const bounceOffset = Math.abs(Math.sin(renderTime * animFreq)) * 0.12;
    _v4.y = (1.0 * baseScale) + bounceOffset;

    e.mesh.position.copy(_v4);

    _v5.set(_v1.x, e.mesh.position.y, _v1.z);
    e.mesh.lookAt(_v5);
}

function updateLastSeen(e: Enemy, playerPosition: THREE.Vector3, simTime: number) {
    e.lastKnownPosition.copy(playerPosition);
    e.lastSeenTime = simTime;
}

function handleStatusEffects(e: Enemy, simDelta: number, simTime: number, callbacks: any) {
    if (e.isBurning) {
        if (Math.random() > 0.4) callbacks.onEffectTick(e, EnemyEffectType.FLAME);

        if (e.burnTimer > 0) {
            e.burnTimer -= simDelta;
            if (e.burnTimer <= 0) {
                e.hp -= 6;
                e.lastDamageType = DamageType.BURN;
                callbacks.applyDamage(e, 6, DamageType.BURN);
                e.burnTimer = 0.5;
            }
        }
        if (e.afterburnTimer > 0) {
            e.afterburnTimer -= simDelta;
            if (e.afterburnTimer <= 0) e.isBurning = false;
        }
    }

    if (e.stunTimer > 0 && e.lastDamageType === WeaponType.ARC_CANNON) {
        if (Math.random() < 0.25) callbacks.onEffectTick(e, EnemyEffectType.SPARK);
    }
}