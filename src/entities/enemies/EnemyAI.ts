import * as THREE from 'three';
import {
    Enemy,
    AIState,
    EnemyEffectType,
    EnemyDeathState,
    EnemyType,
    SEARCH_TIMERS,
    EnemyFlags,
    ENEMY_MAX_HP,
    ENEMY_BASE_SPEED,
    ENEMY_SCALE,
    ENEMY_WIDTH_SCALE,
    ENEMY_ATTACK_RANGE
} from '../../entities/enemies/EnemyTypes';
import { DamageID, EnemyAttackType } from '../../entities/player/CombatTypes';
import { EnemyAttackHandler } from './EnemyAttackHandler';
import { SpatialGrid } from '../../core/world/SpatialGrid';
import { WEAPONS } from '../../content/weapons';
import { haptic } from '../../utils/HapticManager';
import { WeaponSounds, EnemySounds } from '../../utils/audio/AudioLib';
import { WaterSystem, _buoyancyResult } from '../../systems/WaterSystem';
import { PerformanceMonitor } from '../../systems/PerformanceMonitor';
import { EnemyAnimator } from './EnemyAnimator';
import { NoiseType } from '../../entities/enemies/EnemyTypes';
import { SoundID } from '../../utils/audio/AudioTypes';

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

function logStateChange(simTime: number, e: Enemy, newState: AIState, reason?: string) {
    if (PerformanceMonitor.getInstance().aiLoggingEnabled && e.state !== newState) {
        const oldState = e.state;
        const reasonStr = reason ? ` (${reason})` : '';
        console.log(`[EnemyAI] ${e.type}_${e.id} changed state: ${AIState[oldState]} -> ${AIState[newState]}${reasonStr}`);
    }
}

export const EnemyAI = {

    updateEnemy: (
        e: Enemy,
        playerPos: THREE.Vector3,
        collisionGrid: SpatialGrid,
        isDead: boolean,
        callbacks: {
            onPlayerHit: (damage: number, attacker: any, type: DamageID, isDoT?: boolean, effect?: any, duration?: number, intensity?: number) => void;
            applyDamage: (enemy: Enemy, amount: number, type: DamageID, isHighImpact?: boolean) => void;
            onEffectTick: (e: Enemy, type: EnemyEffectType) => void;
            playSound: (id: SoundID) => void;
            spawnBubble: (text: string, duration: number) => void;
            spawnPart: (x: number, y: number, z: number, type: string, count: number) => void;
        },
        water: WaterSystem | null,
        delta: number,
        simTime: number,
        renderTime: number
    ) => {
        if (e.deathState === EnemyDeathState.DEAD || !e.mesh) return;

        // --- 0. DISTANCE CULLING (AI SLEEP) ---
        const dx = playerPos.x - e.mesh.position.x;
        const dz = playerPos.z - e.mesh.position.z;
        const distSq = dx * dx + dz * dz;

        // --- AI LoD (Level of Detail) TIERS (+50% Distance) ---
        const isTier1 = distSq < 1406;
        const isTier2 = !isTier1 && distSq < 5625;
        const isTier3 = !isTier1 && !isTier2 && distSq < 14400;
        const isTier4 = !isTier1 && !isTier2 && !isTier3 && distSq <= 22500;

        const frameTick = Math.floor(simTime * 0.06);
        const frameOffset = (frameTick + (e.poolId % 60));

        if (distSq > 22500 &&
            e.deathState === EnemyDeathState.ALIVE &&
            (e.statusFlags & (EnemyFlags.BURNING | EnemyFlags.DROWNING)) === 0 &&
            (Math.abs(e.knockbackVel.x) < 0.1 && Math.abs(e.knockbackVel.z) < 0.1) &&
            e.stunDuration <= 0
        ) {
            if (e.state === AIState.CHASE || e.state === AIState.SEARCH) {
                e.state = AIState.IDLE;
            }
            return;
        }

        // --- 1. HANDLE INITIAL DEATH TRIGGER ---
        if (e.hp <= 0 && e.deathState === EnemyDeathState.ALIVE) {
            const dmgType = e.lastDamageType;
            const weapon = (typeof dmgType === 'number' && dmgType < WEAPONS.length) ? WEAPONS[dmgType as number] : null;

            if (PerformanceMonitor.getInstance().aiLoggingEnabled) {
                const isWeapon = !!weapon;
                const cause = isWeapon ? `Weapon (${dmgType})` : `Effect (${dmgType})`;
                console.log(`[AI] ${EnemyType[e.type]}_${e.id} killed by: ${cause}`);
            }

            e.deathTimer = simTime;

            const baseScale = e.originalScale;
            const widthScale = e.widthScale;
            e.mesh.scale.set(baseScale * widthScale, baseScale, baseScale * widthScale);

            const isHighImpact = e.lastHitWasHighImpact;
            let weaponImpact = EnemyDeathState.SHOT;
            if (weapon && weapon.impactType !== undefined) {
                weaponImpact = weapon.impactType;
            }

            if (weaponImpact === EnemyDeathState.ELECTROCUTED || dmgType === DamageID.ARC_CANNON) {
                e.deathState = EnemyDeathState.ELECTROCUTED;
                e.deathVel.set(0, 0, 0);
            }
            else if ((e.statusFlags & EnemyFlags.BURNING) !== 0 || dmgType === DamageID.MOLOTOV || dmgType === DamageID.FLAMETHROWER || dmgType === DamageID.BURN) {
                e.deathState = EnemyDeathState.BURNED;
            }
            else if (dmgType === DamageID.GRENADE || e.type === EnemyType.BOMBER || (e.statusFlags & EnemyFlags.BOSS) !== 0) {
                e.deathState = EnemyDeathState.EXPLODED;
                if (dmgType !== DamageID.GRENADE) {
                    WeaponSounds.playExplosion(e.mesh.position);
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
        handleStatusEffects(e, delta, simTime, callbacks);

        let checkedWaterThisFrame = false;

        // --- 4. MASS-BASED KNOCKBACK PHYSICS ---
        if (e.knockbackVel.lengthSq() > 0.001) {
            if (!e.mesh.userData.wasKnockedBack) {
                e.mesh.userData.wasKnockedBack = true;
            }

            // --- FIX: Apply pure velocity (EnemyManager already divided by mass!) ---
            e.mesh.position.addScaledVector(e.knockbackVel, delta);

            // --- Snappy, heavy gravity ---
            e.knockbackVel.y -= 50 * delta;

            // --- Friction (Horizontal only) ---
            const mass = e.originalScale * e.widthScale;
            const friction = 1.0 + (mass * 2.0);
            const drag = Math.max(0, 1 - friction * delta);
            e.knockbackVel.x *= drag;
            e.knockbackVel.z *= drag;

            // Track peak height for fall damage
            if (e.mesh.position.y > (e.fallStartY || 0)) {
                e.fallStartY = e.mesh.position.y;
            }
            e.statusFlags |= EnemyFlags.AIRBORNE;

            // 4. Floor Collision & Landing Logic
            const isRagdolling = e.mesh.userData.isRagdolling === true || e.deathState !== EnemyDeathState.ALIVE;
            const floorY = isRagdolling ? 0.2 : e.originalScale;

            if (e.mesh.position.y <= floorY) {
                const peakY = e.fallStartY || floorY;
                e.mesh.position.y = floorY;
                e.statusFlags &= ~EnemyFlags.AIRBORNE;
                e.fallStartY = 0;

                // Interaction: Water splashes or Fall damage
                if (water) {
                    water.checkBuoyancy(e.mesh.position.x, e.mesh.position.y, e.mesh.position.z, renderTime);
                    checkedWaterThisFrame = true;
                    if (_buoyancyResult.inWater) {
                        water.spawnRipple(e.mesh.position.x, e.mesh.position.z, 1.5);
                    }
                }

                // Apply fall damage if not in water
                if ((!water || !_buoyancyResult.inWater) && peakY > floorY + 1.5) {
                    const fallDamage = Math.min(e.maxHp * 0.6, (peakY - floorY) * 8);
                    e.hp -= fallDamage;
                    callbacks.applyDamage(e, fallDamage, DamageID.FALL, true);
                    callbacks.spawnPart(e.mesh.position.x, 0.2, e.mesh.position.z, 'blood', 20);

                    if (e.hp <= 0 && e.deathState === EnemyDeathState.ALIVE) {
                        e.deathState = EnemyDeathState.FALL;
                    }
                }

                // --- RESTORED OLD BEHAVIOR: Instant hard stop on landing ---
                e.knockbackVel.set(0, 0, 0);
                e.mesh.userData.isRagdolling = false;
            }
        } else {
            e.mesh.userData.wasKnockedBack = false;
            if ((e.statusFlags & EnemyFlags.AIRBORNE) !== 0) {
                e.statusFlags &= ~EnemyFlags.AIRBORNE;
                e.fallStartY = 0;
            }
        }

        // --- 5. WATER STATE EVALUATION ---
        if (water) {
            if (!checkedWaterThisFrame) {
                if (e.mesh.position.y < 2.0) {
                    water.checkBuoyancy(e.mesh.position.x, e.mesh.position.y, e.mesh.position.z, renderTime);
                } else {
                    _buoyancyResult.inWater = false;
                }
            }

            if (_buoyancyResult.inWater) {
                _waterCheckResult.flatDepth = _buoyancyResult.baseWaterLevel - _buoyancyResult.groundY;
                e.statusFlags |= EnemyFlags.IN_WATER;
                if (_waterCheckResult.flatDepth > 0.4 && _waterCheckResult.flatDepth <= 1.25) e.statusFlags |= EnemyFlags.WADING;
                else e.statusFlags &= ~EnemyFlags.WADING;

                const inDeepWater = _waterCheckResult.flatDepth > 1.25;
                if (inDeepWater && (e.statusFlags & EnemyFlags.DROWNING) === 0) {
                    e.swimDistance += e.velocity.length() * delta;
                    if (e.swimDistance > e.maxSwimDistance) {
                        e.statusFlags |= EnemyFlags.DROWNING;
                    }
                } else if (!inDeepWater) {
                    e.swimDistance = 0;
                    e.statusFlags &= ~EnemyFlags.DROWNING;
                }
            } else {
                e.statusFlags &= ~(EnemyFlags.IN_WATER | EnemyFlags.WADING | EnemyFlags.DROWNING);
                e.swimDistance = 0;
                if (e.mesh.position.y < 0) {
                    e.mesh.position.y = THREE.MathUtils.lerp(e.mesh.position.y, 0, 8 * delta);
                    if (e.mesh.position.y > -0.01) e.mesh.position.y = 0;
                }
            }
        }

        // --- 6. DROWNING ---
        if ((e.statusFlags & EnemyFlags.DROWNING) !== 0 && e.deathState === EnemyDeathState.ALIVE) {
            e.drownTimer += delta;

            if (water) {
                const targetY = _buoyancyResult.waterLevel - 0.2;
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
                if (water) water.spawnRipple(e.mesh.position.x, e.mesh.position.z, 0.9, 1.2);
                callbacks.spawnPart(e.mesh.position.x, _buoyancyResult.waterLevel, e.mesh.position.z, 'splash', 4);

                const tickDmg = e.maxHp * 0.05;
                e.hp -= tickDmg;
                callbacks.applyDamage(e, tickDmg, DamageID.DROWNING);

                if (e.hp <= 0 && e.deathState === EnemyDeathState.ALIVE) {
                    if (PerformanceMonitor.getInstance().aiLoggingEnabled) {
                        console.log(`[AI] ${EnemyType[e.type]}_${e.id} killed by: Environment (DROWNED)`);
                    }
                    e.deathState = EnemyDeathState.DROWNED;
                    e.velocity.set(0, 0, 0);
                    e.knockbackVel.set(0, 0, 0);
                }
            }
            return;
        }

        // --- 6.5 STATUS TIMERS & COOLDOWNS ---
        if (e.slowDuration > 0) e.slowDuration -= delta;
        if (e.blindDuration > 0) e.blindDuration -= delta;

        for (let i = 0; i < e.attacks.length; i++) {
            const atkType = e.attacks[i].type;
            const cd = e.attackCooldowns[atkType];
            if (cd !== 0) {
                e.attackCooldowns[atkType] = Math.max(0, cd - delta * 1000);
            }
        }

        // --- 7. STUNS & RAGDOLLS ---
        if (e.stunDuration > 0) {
            if (!e.mesh.userData.wasStunned) e.mesh.userData.wasStunned = true;
            e.stunDuration -= delta;

            if (e.mesh.userData.isRagdolling && e.mesh.userData.spinVel) {
                e.mesh.rotation.x += e.mesh.userData.spinVel.x * delta;
                e.mesh.rotation.y += e.mesh.userData.spinVel.y * delta;
                e.mesh.rotation.z += e.mesh.userData.spinVel.z * delta;
                e.mesh.quaternion.setFromEuler(e.mesh.rotation);

                if (e.mesh.position.y <= 0.1) {
                    e.mesh.userData.spinVel.x *= Math.max(0, 1 - 6.0 * delta);
                    e.mesh.userData.spinVel.y *= Math.max(0, 1 - 6.0 * delta);
                    e.mesh.userData.spinVel.z *= Math.max(0, 1 - 6.0 * delta);
                }

                if (e.stunDuration < 0.6) {
                    const recoveryProgress = 1.0 - (e.stunDuration / 0.6);
                    e.mesh.rotation.x = THREE.MathUtils.lerp(e.mesh.rotation.x, 0, recoveryProgress);
                    e.mesh.rotation.z = THREE.MathUtils.lerp(e.mesh.rotation.z, 0, recoveryProgress);
                    e.mesh.quaternion.setFromEuler(e.mesh.rotation);
                }
            } else {
                const jitterScale = delta * 60;
                e.mesh.position.x += (Math.random() - 0.5) * 0.05 * jitterScale;
                e.mesh.position.z += (Math.random() - 0.5) * 0.05 * jitterScale;
                e.mesh.rotation.y += (Math.random() - 0.5) * 0.5 * jitterScale;
            }

            if (Math.random() < 0.1) callbacks.onEffectTick(e, EnemyEffectType.STUN);

            if (e.stunDuration <= 0) {
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

        // --- 8. SENSORS & SEPARATION ---
        const isFullyAware = e.awareness >= 0.9;
        const seesPlayer = isFullyAware && distSq < 2500;

        _v6.set(0, 0, 0);

        let shouldCheckSeparation = isTier1;
        if (isTier2) shouldCheckSeparation = (frameOffset % 5 === 0);
        if (isTier3) shouldCheckSeparation = false;

        if (shouldCheckSeparation && e.state !== AIState.ATTACK_CHARGE && e.state !== AIState.ATTACKING) {
            const nearbyEnemies = collisionGrid.getNearbyEnemies(e.mesh.position, SEPARATION_RADIUS);
            for (let i = 0; i < nearbyEnemies.length; i++) {
                const other = nearbyEnemies[i];
                if (other === e || other.deathState !== EnemyDeathState.ALIVE) continue;

                const odx = e.mesh.position.x - other.mesh.position.x;
                const odz = e.mesh.position.z - other.mesh.position.z;
                const odSq = odx * odx + odz * odz;

                if (odSq < SEPARATION_RADIUS_SQ && odSq > 0.001) {
                    // VINTERDÖD: Sqrt Purge! 
                    // Using squared falloff for push strength. No sqrt needed.
                    // (1.0 - (odSq / SEPARATION_RADIUS_SQ)) * 5.0 (tuning factor)
                    const pushFactor = (1.0 - (odSq / SEPARATION_RADIUS_SQ)) * 5.0;
                    _v6.x += odx * pushFactor;
                    _v6.z += odz * pushFactor;
                }
            }
            if (Math.abs(_v6.x) > 0.001 || Math.abs(_v6.z) > 0.001) {
                // Limit the shove force using lengthSq
                const shoveSq = _v6.x * _v6.x + _v6.z * _v6.z;
                if (shoveSq > 16.0) { // Limit to 4.0 units
                    const invShove = 4.0 / Math.sqrt(shoveSq); // Still one sqrt but only once per enemy, NOT per neighbor!
                    _v6.x *= invShove;
                    _v6.z *= invShove;
                }
            }
        }

        // AI Movement Lock: Do not allow base AI movement if currently being heavily displaced by physics.
        // Optimized: Bypassing null-check since V8 shape guarantees knockbackVel exists.
        // Using inline lengthSq on X and Z to avoid Math.sqrt() and Y-axis jumping interference.
        const isKnockedBackH = (e.knockbackVel.x * e.knockbackVel.x + e.knockbackVel.z * e.knockbackVel.z) > 0.05;

        // --- 9. STATE MACHINE ---
        switch (e.state) {
            case AIState.IDLE:
                e.idleTimer -= delta;
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

                    const angle = Math.random() * (TWO_PI);
                    _v1.set(e.spawnPos.x + Math.cos(angle) * 6, 0, e.spawnPos.z + Math.sin(angle) * 6);
                    e.velocity.subVectors(_v1, e.mesh.position).normalize().multiplyScalar(e.speed * 0.5);
                    e.searchTimer = 2.0 + Math.random() * 3.0;
                }
                break;

            case AIState.WANDER:
                e.searchTimer -= delta;
                _v1.set(e.mesh.position.x + e.velocity.x * delta, e.mesh.position.y + e.velocity.y * delta, e.mesh.position.z + e.velocity.z * delta);

                // Movement Lock Guard applied ONLY to physical displacement
                if (!isTier4 && !isKnockedBackH) {
                    moveEntity(e, _v1, delta, e.speed * 0.5, collisionGrid, _v6, simTime, renderTime, false, isTier1, isTier2, frameOffset);
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
                e.searchTimer -= delta;

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
                    // Movement Lock Guard
                    if (!isTier4 && !isKnockedBackH) {
                        moveEntity(e, e.lastKnownPosition, delta, e.speed * 0.8, collisionGrid, _v6, simTime, renderTime, false, isTier1, isTier2, frameOffset);
                    }
                } else {
                    e.mesh.rotation.y += delta * 2.5;
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
                    let chaseSpeed = ((e.statusFlags & EnemyFlags.WADING) !== 0 ? e.speed * 0.6 : e.speed);

                    // Movement Lock Guard
                    if (!isTier4 && !isKnockedBackH) {
                        moveEntity(e, target, delta, chaseSpeed, collisionGrid, _v6, simTime, renderTime, true, isTier1, isTier2, frameOffset);
                    }

                    const chaseStepInterval = e.type === EnemyType.RUNNER ? 250 : 400;
                    if (simTime > e.lastStepTime + chaseStepInterval) {
                        e.lastStepTime = simTime;
                    }

                    if (e.attacks.length > 0) {
                        let bestAttackIndex = -1;
                        for (let i = 0; i < e.attacks.length; i++) {
                            const att = e.attacks[i];
                            const cooldown = e.attackCooldowns[att.type] || 0;
                            if (cooldown > 0) continue;

                            const range = (att.type === EnemyAttackType.HIT && !att.range) ? ENEMY_ATTACK_RANGE[e.type] : (att.range || ENEMY_ATTACK_RANGE[e.type]);
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
                                EnemyAttackHandler.executeAttack(e, att, distSq, playerPos, callbacks, delta, simTime, renderTime);
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
                    const att = e.attacks[e.currentAttackIndex!];

                    // Movement Lock Guard
                    if (!isTier4 && !isKnockedBackH) {
                        moveEntity(e, playerPos, delta, e.speed * 0.25, collisionGrid, _v6, simTime, renderTime, true, isTier1, isTier2, frameOffset);
                    }

                    if (e.attackTimer <= 0) {
                        logStateChange(simTime, e, AIState.ATTACKING);
                        e.state = AIState.ATTACKING;
                        e.attackTimer = (att.activeTime || 100) * 0.001;
                        EnemyAttackHandler.executeAttack(e, att, distSq, playerPos, callbacks, delta, simTime, renderTime);
                    }
                }
                break;

            case AIState.ATTACKING:
                if (e.attackTimer !== -1) {
                    const att = e.attacks[e.currentAttackIndex!];

                    // Movement Lock Guard
                    if (!isTier4 && !isKnockedBackH) {
                        moveEntity(e, playerPos, delta, e.speed * 0.15, collisionGrid, _v6, simTime, renderTime, true, isTier1, isTier2, frameOffset);
                    }

                    if (att && att.activeTime) {
                        EnemyAttackHandler.updateContinuousAttack(e, att, playerPos, callbacks, delta, simTime, renderTime);
                    }

                    if (e.attackTimer <= 0) {
                        logStateChange(simTime, e, AIState.CHASE, 'VISUAL');
                        e.state = AIState.CHASE;
                    }
                }
                break;
        }

        // --- 10. PROCEDURAL ANIMATION ---
        EnemyAnimator.updateAttackAnim(e, simTime, renderTime, delta);
    }
};

// --- HELPERS ---
function moveEntity(e: Enemy, target: THREE.Vector3, delta: number, speed: number, collisionGrid: SpatialGrid, sepForce: THREE.Vector3, simTime: number, renderTime: number, isChasing: boolean, isTier1: boolean, isTier2: boolean, frameOffset: number) {
    _v1.set(target.x, e.mesh.position.y, target.z);
    _v2.subVectors(_v1, e.mesh.position);
    const dist = _v2.length();
    if (dist < 0.01) return;

    // Normalize directional vector
    const invDist = 1.0 / dist;
    _v2.x *= invDist;
    _v2.y *= invDist;
    _v2.z *= invDist;

    // Apply Status Effect Slows (50% reduction)
    if (e.slowDuration > 0 || (e.statusFlags & EnemyFlags.SLOWED) !== 0) {
        speed *= 0.5;
    }

    // 2. Set Base Velocity Vector
    _v3.copy(_v2).multiplyScalar(speed);

    // 3. Apply Separation Force (if any)
    if (Math.abs(sepForce.x) > 0.001 || Math.abs(sepForce.z) > 0.001) {
        _v3.addScaledVector(sepForce, 1.2);

        // ZERO-GC CLAMP: Prevent "Crowd Surfing"
        if (_v3.lengthSq() > speed * speed) {
            _v3.normalize().multiplyScalar(speed);
        }
    }

    // Save actual physics velocity for other systems
    e.velocity.copy(_v3);

    // 4. Convert velocity to frame delta displacement
    _v3.multiplyScalar(delta);

    _v4.set(
        e.mesh.position.x + _v3.x,
        e.mesh.position.y + _v3.y,
        e.mesh.position.z + _v3.z
    );

    // 5. ANIMATION & ROTATION
    if (isChasing) e.mesh.rotation.y = Math.atan2(_v2.x, _v2.z);
    else e.mesh.rotation.y = THREE.MathUtils.lerp(e.mesh.rotation.y, Math.atan2(_v2.x, _v2.z), 5 * delta);

    const speedRatio = speed / (e.speed || 1);
    const animFreq = isChasing ? 0.055 * speedRatio : 0.035 * speedRatio;
    const bounceOffset = Math.abs(Math.sin(renderTime * animFreq)) * 0.12;

    const baseScale = e.originalScale;
    const widthScale = e.widthScale;

    const hijackY = e.state === AIState.ATTACK_CHARGE || e.state === AIState.ATTACKING;
    if ((e.statusFlags & EnemyFlags.AIRBORNE) === 0 && !hijackY) {
        _v4.y = (1.0 * baseScale) + bounceOffset;
    }

    e.mesh.position.copy(_v4);
}

function updateLastSeen(e: Enemy, pos: THREE.Vector3, simTime: number) {
    e.lastKnownPosition.copy(pos);
    e.lastSeenTime = simTime;
}

function handleStatusEffects(e: Enemy, delta: number, simTime: number, callbacks: any) {
    if ((e.statusFlags & EnemyFlags.BURNING) !== 0) {
        if (simTime > (e.lastBurnTick || 0) + 500) {
            const dmg = 5;
            e.hp -= dmg;
            callbacks.onEffectTick(e, EnemyEffectType.FLAME);
            callbacks.applyDamage(e, dmg, DamageID.BURN);
            e.lastBurnTick = simTime;
        }
    }
}