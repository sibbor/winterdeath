import * as THREE from 'three';
import { Enemy, AIState, EnemyEffectType, EnemyDeathState } from '../../types/enemy';
import { DamageType } from '../../types/combat';
import { applyCollisionResolution } from '../world/CollisionResolution';
import { SpatialGrid } from '../world/SpatialGrid';
import { WeaponType, WEAPONS } from '../../content/weapons';
import { haptic } from '../../utils/HapticManager';
import { soundManager } from '../../utils/SoundManager';
import { WaterSystem, _buoyancyResult } from '../systems/WaterSystem';
import { PerformanceMonitor } from '../systems/PerformanceMonitor';

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
        logAI(`[AI] ${e.type}_${e.id} changed state: ${AIState[e.state]} -> ${AIState[newState]}${reasonStr}`);
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
            applyDamage: (amount: number, enemy: Enemy) => void;
            onEffectTick: (e: Enemy, type: EnemyEffectType) => void;
            playSound: (id: string) => void;
            spawnBubble: (text: string, duration: number) => void;
            spawnPart?: (x: number, y: number, z: number, type: string, count: number) => void;
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
            const isWeapon = Object.values(WeaponType).includes(e.lastDamageType as WeaponType);
            const cause = isWeapon ? `Weapon (${e.lastDamageType})` : `Effect (${e.lastDamageType})`;
            logAI(`[AI] ${e.type}_${e.id} killed by: ${cause}`);
            e.deathTimer = now;

            const baseScale = e.originalScale || 1.0;
            const widthScale = e.widthScale || 1.0;
            e.mesh.scale.set(baseScale * widthScale, baseScale, baseScale * widthScale);

            const dmgType = e.lastDamageType || '';
            const isHighImpact = e.lastHitWasHighImpact;
            const weapon = WEAPONS[dmgType as WeaponType];

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
            else if (dmgType === WeaponType.GRENADE || e.type === 'BOMBER' || e.isBoss) {
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
                    const forwardMomentum = e.velocity.dot(_v1.clone().negate());
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
                    const forwardMomentum = e.velocity.dot(_v1.clone().negate());
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
                    if (callbacks.applyDamage) callbacks.applyDamage(fallDamage, e);

                    callbacks.spawnPart?.(e.mesh.position.x, 0.2, e.mesh.position.z, 'blood', 20);
                    if (e.hp <= 0 && e.deathState === 'ALIVE') {
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
        if (e.isDrowning && e.deathState === 'ALIVE') {
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
                if (callbacks.applyDamage) callbacks.applyDamage(tickDmg, e);

                if (e.hp <= 0 && e.deathState === 'ALIVE') {
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
                    e.mesh.userData.spinVel.multiplyScalar(Math.max(0, 1 - 6.0 * delta));
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

        if (e.state !== AIState.BITING) {
            const nearbyEnemies = collisionGrid.getNearbyEnemies(e.mesh.position, separationRadius);
            for (let i = 0; i < nearbyEnemies.length; i++) {
                const other = nearbyEnemies[i];
                if (other === e || other.deathState !== 'ALIVE') continue;

                const odx = e.mesh.position.x - other.mesh.position.x;
                const odz = e.mesh.position.z - other.mesh.position.z;
                const odSq = odx * odx + odz * odz;

                if (odSq < separationRadiusSq && odSq > 0.001) {
                    const od = Math.sqrt(odSq);
                    const pushStrength = (separationRadius - od) / separationRadius;
                    _v6.x += (odx / od) * pushStrength * 1.5;
                    _v6.z += (odz / od) * pushStrength * 1.5;
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
                if (e.mesh.position.distanceToSquared(n.pos) < (n.radius * n.radius)) {
                    heardNoise = true; noisePos = n.pos; break;
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
                _v1.copy(e.mesh.position).addScaledVector(e.velocity, delta);
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

            case AIState.CHASE:
                if (canSeePlayer) {
                    updateLastSeen(e, playerPos, now);
                } else if (heardNoise && noisePos) {
                    updateLastSeen(e, noisePos, now);
                }

                if ((!canSeePlayer && now - (e.lastSeenTime || 0) > 5000) || distSq > 2500) {
                    logStateChange(e, AIState.SEARCH);
                    e.state = AIState.SEARCH;
                    e.searchTimer = 5.0;
                }
                else {
                    const target = canSeePlayer ? playerPos : e.lastSeenPos!;
                    if (e.type === 'BOMBER' && distSq < 12.0) {
                        logStateChange(e, AIState.EXPLODING);
                        e.state = AIState.EXPLODING;
                        e.explosionTimer = 1.5;
                        return;
                    }

                    // If player is dead, stop chasing
                    if (isDead) {
                        logStateChange(e, AIState.SEARCH);
                        e.state = AIState.SEARCH;
                        e.searchTimer = 3.0;
                        return;
                    }

                    const chaseSpeed = e.isWading ? e.speed * 0.6 : e.speed;
                    moveEntity(e, target, delta, chaseSpeed, collisionGrid, _v6);

                    const chaseStepInterval = e.type === 'RUNNER' ? 250 : 400;
                    if (now > (e.lastStepTime || 0) + chaseStepInterval) {
                        e.lastStepTime = now;
                    }

                    // --- MULTI-ATTACK SYSTEM ---
                    if (e.attacks && e.attacks.length > 0 && e.attackCooldown <= 0) {
                        // Select best attack (simple: find first in range)
                        let bestAttackIndex = -1;
                        for (let i = 0; i < e.attacks.length; i++) {
                            const att = e.attacks[i];
                            const rangeSq = att.range * att.range;
                            if (distSq < rangeSq) {
                                bestAttackIndex = i;
                                // If it's a special attack (with cooldown), prefer it over HIT
                                if (att.type !== 'HIT' || bestAttackIndex === -1) {
                                    break; 
                                }
                            }
                        }

                        if (bestAttackIndex !== -1) {
                            const att = e.attacks[bestAttackIndex];
                            e.currentAttackIndex = bestAttackIndex;
                            e.attackCooldown = att.cooldown;

                            if (att.chargeTime && att.chargeTime > 0) {
                                logStateChange(e, AIState.CHARGING);
                                e.state = AIState.CHARGING;
                                e.attackTimer = att.chargeTime / 1000;
                            } else if (att.activeTime && att.activeTime > 0) {
                                logStateChange(e, AIState.ATTACKING);
                                e.state = AIState.ATTACKING;
                                e.attackTimer = att.activeTime / 1000;
                                // Start attack logic immediately if no charge
                                performAttack(e, att, distSq, callbacks);
                            } else {
                                // Instant attack
                                performAttack(e, att, distSq, callbacks);
                                // Stay in CHASE or brief ATTACKING state?
                                // For visual feedback, let's enter ATTACKING briefly
                                logStateChange(e, AIState.ATTACKING);
                                e.state = AIState.ATTACKING;
                                e.attackTimer = 0.5; // Brief pose
                            }
                        }
                    } 
                    // Fallback for legacy hardcoded attacks if no attacks defined
                    else if (!e.attacks || e.attacks.length === 0) {
                        const attackRangeSq = e.type === 'TANK' ? 12.0 : 6.5;
                        if (distSq < attackRangeSq && e.attackCooldown <= 0) {
                            if (e.type === 'TANK') {
                                e.attackCooldown = 3000;
                                callbacks.onPlayerHit(e.damage, e, 'TANK_SMASH');
                                logAI(`[AI] ${e.type}_${e.id} hit player for ${e.damage} dmg (TANK_SMASH)`);
                            } else {
                                logStateChange(e, AIState.BITING);
                                e.state = AIState.BITING;
                                e.grappleTimer = 0.8;
                                e.attackCooldown = 1500;
                                e.mesh.userData.hasBittenThisCycle = false;
                            }
                        }
                    }
                }
                break;

            case AIState.BITING:
                e.grappleTimer -= delta;

                if (e.grappleTimer > 0.4) {
                    if (distSq > 1.5) moveEntity(e, playerPos, delta, e.speed * 3.0, collisionGrid, _v6);
                }

                _v5.set(playerPos.x, e.mesh.position.y, playerPos.z);
                e.mesh.lookAt(_v5);

                if (e.grappleTimer > 0.4) e.mesh.rotateX(-0.5);

                if (e.grappleTimer <= 0.4 && !e.mesh.userData.hasBittenThisCycle) {
                    if (distSq < 10.0 && !isDead) {
                        callbacks.onPlayerHit(e.damage, e, 'BITING');
                        callbacks.playSound('impact_flesh');

                        logAI(`[AI] ${e.type}_${e.id} bit player for ${e.damage} dmg (BITING)`);
                    }
                    e.mesh.userData.hasBittenThisCycle = true;
                }

                if (e.grappleTimer <= 0 || isDead) {
                    logStateChange(e, AIState.CHASE);
                    e.state = AIState.CHASE;
                    e.attackCooldown = 1000;
                    e.mesh.userData.hasBittenThisCycle = false;
                }
                break;

            case AIState.EXPLODING:
                e.explosionTimer -= delta;

                const progress = Math.max(0, 1.5 - e.explosionTimer);
                const speed = 10.0 + progress * 20.0;
                const bounceHeight = 0.3 + progress * 0.2;

                const sineVal = Math.abs(Math.sin(now * 0.001 * speed));
                e.mesh.position.y = (e.mesh.userData.baseY || 0) + sineVal * bounceHeight;

                const breatheScale = 1.0 + sineVal * 0.4;
                e.mesh.scale.setScalar(breatheScale);

                e.mesh.visible = true;
                e.mesh.matrixAutoUpdate = true;

                if (e.indicatorRing) {
                    e.indicatorRing.visible = true;
                    e.indicatorRing.matrixAutoUpdate = true;
                    e.indicatorRing.position.set(0, -e.mesh.position.y + 0.05, 0);

                    const targetRadius = 12.0 + Math.sin(now * 0.01) * 1.0;
                    e.indicatorRing.scale.setScalar(targetRadius / breatheScale);

                    const flashSpeed = (1.6 - e.explosionTimer) * 30;
                    const pulse = 0.5 + 0.5 * Math.sin(now * 0.01 * flashSpeed);

                    if (e.indicatorRing.material) {
                        const mat = e.indicatorRing.material as any;
                        mat.opacity = 0.3 + (1.0 - (e.explosionTimer / 1.5)) * 0.6;
                        mat.color.setHex(pulse > 0.5 ? 0xffffff : 0xff0000);
                    }
                }

                if (e.explosionTimer <= 0) {
                    logAI(`[AI] ${e.type}_${e.id} exploded itself`);

                    if (e.mesh.position.distanceToSquared(playerPos) < 144.0) {
                        // Use defined attack if available, else fallback
                        if (e.attacks && e.attacks[0]) {
                            performAttack(e, e.attacks[0], distSq, callbacks);
                        } else {
                            callbacks.onPlayerHit(60, e, DamageType.EXPLOSION);
                        }
                    }

                    e.hp = 0;
                    e.deathState = EnemyDeathState.EXPLODED;
                    e.deathVel.set(0, 10.0, 0);

                    soundManager.playExplosion();
                    haptic.explosion();
                }
                break;

            case AIState.CHARGING:
                if (e.attackTimer !== undefined) {
                    e.attackTimer -= delta;

                    // Face player during charge
                    _v5.set(playerPos.x, e.mesh.position.y, playerPos.z);
                    e.mesh.lookAt(_v5);

                    // Visual feedback for charging (vibration/scaling)
                    const jitter = 0.05 * (1.0 - (e.attackTimer / 1.0)); // Jitter increases
                    e.mesh.position.x += (Math.random() - 0.5) * jitter;
                    e.mesh.position.z += (Math.random() - 0.5) * jitter;

                    if (e.attackTimer <= 0) {
                        const att = e.attacks![e.currentAttackIndex!];
                        logStateChange(e, AIState.ATTACKING);
                        e.state = AIState.ATTACKING;
                        e.attackTimer = (att.activeTime || 500) / 1000;
                        performAttack(e, att, distSq, callbacks);
                    }
                }
                break;

            case AIState.ATTACKING:
                if (e.attackTimer !== undefined) {
                    e.attackTimer -= delta;

                    // Some attacks might need per-frame logic (e.g. beam)
                    const att = e.attacks?.[e.currentAttackIndex!];
                    if (att && att.type === 'ELECTRIC_BEAM') {
                        // Beam logic: continuous hit?
                        // For now keep it simple: one hit at start of state
                    }

                    if (e.attackTimer <= 0) {
                        logStateChange(e, AIState.CHASE);
                        e.state = AIState.CHASE;
                    }
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
        }

        // --- 10. COOLDOWNS & BOUNCE ANIMATION ---
        if (e.attackCooldown > 0) e.attackCooldown -= delta * 1000;
        if (e.slowTimer > 0) e.slowTimer -= delta;

        if (!isPhysicallyAirborne && e.state !== AIState.EXPLODING) {
            if (e.mesh.userData.baseY === undefined) e.mesh.userData.baseY = e.mesh.position.y;
            e.mesh.position.y = e.mesh.userData.baseY + Math.abs(Math.sin(now * (e.state === AIState.CHASE ? 0.018 : 0.009))) * 0.12;
        }
    }
};

// --- HELPERS ---

function performAttack(e: Enemy, att: any, distSq: number, callbacks: any) {
    if (distSq < att.range * att.range) {
        callbacks.onPlayerHit(att.damage, e, att.type, att.effect, att.effectDuration, att.effectIntensity);
        logAI(`[AI] ${e.type}_${e.id} performed attack ${att.type} for ${att.damage} dmg`);

        if (att.soundImpact) callbacks.playSound(att.soundImpact);
        else callbacks.playSound(att.type); // Fallback to type as sound ID

        // --- VFX TRIGGERING ---
        if (callbacks.spawnPart) {
            const pos = e.mesh.position;
            const target = _v5; // playerPos is usually what e looks at in ATTACKING/BITING

            if (att.vfx) {
                callbacks.spawnPart(pos.x, pos.y + 1.5, pos.z, att.vfx, 5);
            } else {
                // Procedural fallbacks for standard types
                switch (att.type) {
                    case 'ELECTRIC_BEAM':
                        // Directional beam effect
                        _v1.subVectors(target, pos).normalize().multiplyScalar(5.0);
                        callbacks.spawnPart(pos.x, pos.y + 1.8, pos.z, 'electric_beam', 1, undefined, _v1);
                        callbacks.spawnPart(target.x, target.y + 1.0, target.z, 'electric_flash', 3);
                        break;
                    case 'SMASH':
                        callbacks.spawnPart(pos.x, 0.2, pos.z, 'ground_impact', 12);
                        callbacks.spawnPart(pos.x, 0.1, pos.z, 'shockwave', 1);
                        break;
                    case 'SCREECH':
                        callbacks.spawnPart(pos.x, pos.y + 1.8, pos.z, 'screech_wave', 1);
                        break;
                    case 'BITE':
                        callbacks.spawnPart(target.x, target.y + 1.0, target.z, 'blood', 3);
                        break;
                    case 'EXPLODE':
                        // Handled by death state usually, but for consistency:
                        callbacks.spawnPart(pos.x, 1.0, pos.z, 'large_fire', 5);
                        break;
                }
            }
        }
    }
}

function moveEntity(e: Enemy, target: THREE.Vector3, delta: number, speed: number, collisionGrid: SpatialGrid, sepForce: THREE.Vector3) {
    _v1.set(target.x, e.mesh.position.y, target.z);
    _v2.subVectors(_v1, e.mesh.position);
    const dist = _v2.length();
    if (dist < 0.01) return;

    _v2.divideScalar(dist);
    let curSpeed = speed * 10;
    if (e.slowTimer > 0) curSpeed *= 0.55;

    _v3.copy(_v2).multiplyScalar(curSpeed * delta);

    if (sepForce.lengthSq() > 0) {
        _v3.addScaledVector(sepForce, delta * 5.0);
    }

    e.velocity.copy(_v2).multiplyScalar(curSpeed);
    _v4.copy(e.mesh.position).add(_v3);

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
    if (!e.lastSeenPos) e.lastSeenPos = new THREE.Vector3();
    e.lastSeenPos.copy(pos);
    e.lastSeenTime = now;
}

function handleStatusEffects(e: Enemy, delta: number, now: number, callbacks: any) {
    if (e.isBurning) {
        if (Math.random() > 0.4) callbacks.onEffectTick(e, EnemyEffectType.FLAME);

        if (e.burnTimer > 0) {
            e.burnTimer -= delta;
            if (e.burnTimer <= 0) {
                e.hp -= 6;
                e.lastDamageType = DamageType.BURN;
                if (callbacks.applyDamage) callbacks.applyDamage(6, e);
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