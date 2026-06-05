import * as THREE from 'three';
import { WinterEngine } from '../../core/engine/WinterEngine';
import { Enemy, AIState, EnemyEffectType, EnemyDeathState, EnemyType, EnemyFlags, ENEMY_ATTACK_RANGE, SEARCH_TIMERS } from '../../entities/enemies/EnemyTypes';
import { DamageID, EnemyAttackType } from '../../entities/player/CombatTypes';
import { EnemyAttackHandler } from './EnemyAttackHandler';
import { WorldStreamer } from '../../core/world/WorldStreamer';
import { WEAPONS } from '../../content/weapons';
import { haptic } from '../../utils/HapticManager';
import { WeaponSounds } from '../../utils/audio/AudioLib';
import { WaterSystem, _buoyancyResult } from '../../systems/WaterSystem';
import { PerformanceMonitor } from '../../systems/PerformanceMonitor';
import { PlayerStatusFlags } from '../../types/CareerStats';
import { SoundID } from '../../utils/audio/AudioTypes';
import { EnemyAnimator } from './EnemyAnimator';
import { NoiseType } from '../../entities/enemies/EnemyTypes';
import { DataResolver } from '../../core/data/DataResolver';
import { DamageType } from '../../entities/player/CombatTypes';
import { NavigationSystem } from '../../systems/NavigationSystem';
import { applyCollisionResolution } from '../../core/world/CollisionResolution';
import { FXParticleType } from '../../types/FXTypes';
import { StatusEffectID } from '../../types/StatusEffects';
import { COMBAT, MAX_ENTITIES, AI_LOD } from '../../content/constants';
import { ENEMY_DETECTION } from '../../entities/enemies/EnemyTypes';

const _waterCheckResult = { flatDepth: 0 };

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3();

// --- PRE-CALCULATED CONSTANTS ---
const TWO_PI = Math.PI * 2;
const SEPARATION_RADIUS = 1.5;
const SEPARATION_RADIUS_SQ = SEPARATION_RADIUS * SEPARATION_RADIUS;
const INV_SEPARATION_RADIUS = 1.0 / SEPARATION_RADIUS;

export const logStateChange = (simTime: number, e: Enemy, newState: AIState, reason?: string) => {
    if (!PerformanceMonitor.getInstance().aiLoggingEnabled) return;
    const typeName = DataResolver.getEnemyName(e.type, e.bossId);
    console.log(`[EnemyAI] ${typeName} ${e.id} changed state: ${AIState[e.state]} -> ${AIState[newState]} ${reason ? `(${reason})` : ''}`);
};

import { SystemID } from '../../systems/SystemID';

export const EnemyAI = {
    systemId: SystemID.ENEMY_AI,
    id: 'enemy_ai',

    updateEnemy: (
        e: Enemy,
        playerPos: THREE.Vector3,
        playerStatusFlags: number,
        streamer: WorldStreamer,
        isDead: boolean,
        callbacks: {
            onPlayerHit: (damage: number, attacker: any, damageType: DamageType, damageSource: DamageID, isDoT?: boolean, effectType?: StatusEffectID, duration?: number, intensity?: number, specificAttackType?: EnemyAttackType) => void;
            applyDamage: (enemy: Enemy, amount: number, damageType: DamageType, damageSource: DamageID, isHighImpact?: boolean, attributionOverride?: DamageID) => boolean;
            onEffectTick: (e: Enemy, type: EnemyEffectType) => void;
            playSound: (id: SoundID) => void;
            spawnParticle: (x: number, y: number, z: number, type: FXParticleType, count: number, mesh?: THREE.Object3D | null, vel?: THREE.Vector3, color?: number, scale?: number, life?: number) => void;
            applyExternalForce?: (force: THREE.Vector3, factor: number) => void;
            queryEnemies?: (pos: THREE.Vector3, radius: number, outPoolIdx: number) => void;
        },
        water: WaterSystem | null,
        ground: any, // GroundSystem
        session: any,
        delta: number,
        simTime: number,
        renderTime: number
    ) => {
        const dx0 = e.mesh.position.x - playerPos.x;
        const dz0 = e.mesh.position.z - playerPos.z;
        let distSq = dx0 * dx0 + dz0 * dz0;


        if (e.deathState === EnemyDeathState.DEAD || !e.mesh) return;

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
                const enemyName = DataResolver.getEnemyName(e.type, e.bossId);
                const cause = isWeapon
                    ? `Weapon (${DataResolver.getWeaponName(dmgType as any)})`
                    : `Effect (${DataResolver.getEffectName(dmgType as any)})`;
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

            // Unified Death Dispatcher
            let finalDeathState = EnemyDeathState.GENERIC;

            switch (dmgType) {
                case DamageID.ARC_CANNON:
                    finalDeathState = EnemyDeathState.ELECTROCUTED;
                    break;

                case DamageID.MOLOTOV:
                case DamageID.FLAMETHROWER:
                case DamageID.BURN:
                    finalDeathState = EnemyDeathState.BURNED;
                    break;

                case DamageID.GRENADE:
                case DamageID.EXPLOSION:
                    finalDeathState = EnemyDeathState.EXPLODED;
                    break;

                default:
                    // Priority-based fallback for complex flags and weapon impact
                    if (weaponImpact === EnemyDeathState.ELECTROCUTED) {
                        finalDeathState = EnemyDeathState.ELECTROCUTED;
                    } else if ((e.statusFlags & EnemyFlags.BURNING) !== 0) {
                        finalDeathState = EnemyDeathState.BURNED;
                    } else if (e.type === EnemyType.BLOATER || (e.statusFlags & EnemyFlags.BOSS) !== 0) {
                        finalDeathState = EnemyDeathState.EXPLODED;
                    } else if ((playerStatusFlags & PlayerStatusFlags.GIB_MASTER) !== 0 && weapon) {
                        // GIB_MASTER Perk allows ALL shots from ALL projectile weapons to GIB enemies on kill!
                        finalDeathState = EnemyDeathState.GIBBED;
                    } else if (weaponImpact === EnemyDeathState.GIBBED) {
                        // Weapons that NATIVELY GIB (Shotgun, Revolver)
                        if (isHighImpact) {
                            finalDeathState = EnemyDeathState.GIBBED;
                        } else {
                            finalDeathState = EnemyDeathState.SHOT;
                        }
                    } else if (weapon) {
                        finalDeathState = EnemyDeathState.SHOT;
                    }
                    break;
            }

            e.deathState = finalDeathState;

            // --- Apply Visual & Physics side effects based on final state ---
            switch (finalDeathState) {
                case EnemyDeathState.ELECTROCUTED:
                    e.deathVel.set(0, 0, 0);
                    break;

                case EnemyDeathState.BURNED:
                    callbacks.playSound(SoundID.ZOMBIE_DEATH_BURN);
                    break;

                case EnemyDeathState.EXPLODED:
                    // Bloater/Boss Detonation Logic
                    if (dmgType !== DamageID.GRENADE) {
                        const pos = e.mesh.position;
                        WeaponSounds.playExplosion(pos);
                        haptic.explosion();

                        if (e.type === EnemyType.BLOATER && callbacks.queryEnemies && callbacks.applyDamage) {
                            const radius = 10.0;
                            const damage = 60.0;

                            const pool = streamer.getEnemyPool();
                            const poolIdx = pool.nextIndex();
                            callbacks.queryEnemies(pos, radius + 3.0, poolIdx);

                            const nearby = pool.getPool(poolIdx);
                            const nearCount = pool.getCount(poolIdx);
                            const radSq = radius * radius;

                            for (let i = 0; i < nearCount; i++) {
                                const other = nearby[i];
                                if (other === e || other.hp <= 0) continue;

                                _v1.subVectors(other.mesh.position, pos);
                                const dSq = _v1.lengthSq();
                                const totalRad = radius + (other.originalScale * 0.5);

                                if (dSq < totalRad * totalRad) {
                                    if (callbacks.applyDamage) callbacks.applyDamage(other, damage, DamageType.EXPLOSION, DamageID.EXPLOSION, true);
                                    const force = 25.0 * (1.0 - Math.min(1.0, dSq / radSq));
                                    const mass = other.originalScale * other.widthScale;
                                    _v2.copy(_v1).normalize().multiplyScalar(force / mass).setY(2.0);
                                    other.knockbackVel.add(_v2);
                                }
                            }
                        }
                        WinterEngine.getInstance()?.triggerHitStop(e.type === EnemyType.BLOATER ? 40 : 50);
                    }
                    break;

                case EnemyDeathState.GIBBED:
                    e.statusFlags |= EnemyFlags.GIBBED;
                    callbacks.playSound(SoundID.ZOMBIE_DEATH_SHOT);
                    break;

                case EnemyDeathState.SHOT:
                    callbacks.playSound(SoundID.ZOMBIE_DEATH_SHOT);
                    _v1.subVectors(e.mesh.position, playerPos).normalize();
                    _v2.copy(_v1).negate();

                    const forwardMomentum = e.velocity.dot(_v2);
                    e.fallForward = forwardMomentum > 1.5;
                    e.deathVel.copy(e.velocity).multiplyScalar(0.1);

                    const impactForce = weapon ? weapon.damage * 0.15 : 2.0;
                    e.deathVel.addScaledVector(_v1, impactForce).setY((weapon && weapon.damage > 20) ? 3.5 : 2.0);
                    break;

                default:
                    callbacks.playSound(SoundID.ZOMBIE_DEATH_SHOT);
                    _v1.subVectors(e.mesh.position, playerPos).normalize();
                    _v2.copy(_v1).negate();
                    const fwdMomentum = e.velocity.dot(_v2);
                    e.fallForward = fwdMomentum > 1.5;
                    e.deathVel.copy(_v1).multiplyScalar(8.0).setY(3.0);
                    break;
            }

            // Heavy Kill Hit-stop for Tanks
            if (e.type === EnemyType.TANK) {
                WinterEngine.getInstance()?.triggerHitStop(45);
                haptic.impact(0.8);
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
            if (!(e.statusFlags & EnemyFlags.KNOCKED_BACK)) {
                e.statusFlags |= EnemyFlags.KNOCKED_BACK;
            }

            // --- Apply pure velocity (EnemyManager already divided by mass!) ---
            e.mesh.position.addScaledVector(e.knockbackVel, delta);

            // --- Snappy, heavy gravity (Increased to 65 for grit) ---
            e.knockbackVel.y -= 65 * delta;

            // --- Friction (Horizontal only) ---
            const mass = e.originalScale * e.widthScale;
            // Increase friction significantly if ragdolling on ground to prevent "ice-skating"
            const frictionMult = ((e.statusFlags & EnemyFlags.RAGDOLLING) || !(e.statusFlags & EnemyFlags.AIRBORNE)) ? 12.0 : 2.5;
            const friction = 1.0 + (mass * frictionMult);
            const drag = Math.max(0, 1 - friction * delta);
            e.knockbackVel.x *= drag;
            e.knockbackVel.z *= drag;

            // Track peak height for fall damage
            if (e.mesh.position.y > (e.fallStartY || 0)) {
                e.fallStartY = e.mesh.position.y;
            }
            e.statusFlags |= EnemyFlags.AIRBORNE;

            // 4. Floor Collision & Landing Logic
            const isRagdolling = (e.statusFlags & EnemyFlags.RAGDOLLING) !== 0 || e.deathState !== EnemyDeathState.ALIVE;
            const floorY = ground.getGroundHeight(e.mesh.position.x, e.mesh.position.z, session);
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
                        callbacks.spawnParticle(e.mesh.position.x, _buoyancyResult.waterLevel, e.mesh.position.z, FXParticleType.SPLASH, 8);
                    }
                }

                // Apply fall damage if not in water
                const fallHeight = peakY - floorY;
                if ((!water || !_buoyancyResult.inWater) && fallHeight > 0.5) {
                    // Quadratic fall damage for high-impact RUSH feel
                    const fallRatio = fallHeight;
                    const fallDamage = Math.min(e.maxHp * 0.95, fallRatio * fallRatio * 15);

                    const sourceId = (e.lastKnockback === DamageID.RUSH || e.lastKnockback === DamageID.DODGE)
                        ? e.lastKnockback
                        : DamageID.PHYSICAL;

                    if (callbacks.applyDamage) {
                        callbacks.applyDamage(e, fallDamage, DamageType.PHYSICAL, sourceId, true);
                    } else {
                        e.hp -= fallDamage;
                    }

                    // High Fall Landing Stun (Stay Down)
                    if (fallHeight > 2.5) {
                        e.stunDuration = Math.max(e.stunDuration, 2.0);
                        if (callbacks.playSound) callbacks.playSound(SoundID.IMPACT_METAL);
                    }

                    if (callbacks.spawnParticle) {
                        callbacks.spawnParticle(e.mesh.position.x, floorY + 0.5, e.mesh.position.z, FXParticleType.BLOOD_SPLATTER, Math.floor(fallHeight * 4));
                    }

                    if (e.hp <= 0 && e.deathState === EnemyDeathState.ALIVE) {
                        e.deathState = EnemyDeathState.FALL;
                    }
                }

                e.knockbackVel.set(0, 0, 0);
            }
        } else {
            e.statusFlags &= ~EnemyFlags.KNOCKED_BACK;
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
                e.statusFlags &= ~EnemyFlags.DROWNING;
                const groundY = ground.getGroundHeight(e.mesh.position.x, e.mesh.position.z, session);
                if (e.mesh.position.y < groundY) {
                    e.mesh.position.y = THREE.MathUtils.lerp(e.mesh.position.y, groundY, 8 * delta);
                    if (e.mesh.position.y > groundY - 0.01) e.mesh.position.y = groundY;
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
                callbacks.spawnParticle(e.mesh.position.x, _buoyancyResult.waterLevel, e.mesh.position.z, FXParticleType.SPLASH, 4);

                const tickDmg = e.maxHp * 0.05;
                e.hp -= tickDmg;
                if (callbacks.applyDamage) callbacks.applyDamage(e, tickDmg, DamageType.DROWNING, DamageID.DROWNING);

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

        // Decoupled Attack & Ability timers (Standardized to seconds)
        if (e.attackTimer > 0) {
            e.attackTimer -= (delta * (session.state.isTimeFrozen ? 0 : 1));
            if (isNaN(e.attackTimer)) e.attackTimer = 0; // NaN Guard
            if (e.attackTimer < 0) e.attackTimer = 0;
        }

        // --- VINTERDÖD STABILIZATION: PERCEPTION UPDATE (Visual + Noise) ---
        // Staggered perception check (once every 15 frames) to minimize CPU overhead
        if ((e.poolId + Math.floor(simTime * 60)) % 15 === 0 && e.hp > 0) {
            const dx = playerPos.x - e.mesh.position.x;
            const dz = playerPos.z - e.mesh.position.z;
            const distSq = dx * dx + dz * dz;

            // Visual Perception
            if (distSq < ENEMY_DETECTION.VISUAL_RANGE_SQ) {
                const detectionSys = (session as any).detectionSystem;
                if (detectionSys && detectionSys.canSeePlayer(e, playerPos, streamer)) {
                    e.awareness = 1.0;
                    e.lastSeenTime = simTime;
                    e.lastKnownPosition.copy(playerPos);
                }
            }
        }

        // Decay awareness over time if player is lost
        if (e.awareness > 0 && !session.state.isTimeFrozen) {
            e.awareness = Math.max(0, e.awareness - delta * 0.15);
        }

        if (e.abilityCooldown > 0) e.abilityCooldown = Math.max(0, e.abilityCooldown - delta);

        for (let i = 0; i < e.attacks.length; i++) {
            const atkType = e.attacks[i].type;
            const cd = e.attackCooldowns[atkType];
            if (cd !== 0) {
                e.attackCooldowns[atkType] = Math.max(0, cd - delta * 1000);
            }
        }

        // --- 7. STUNS & RAGDOLLS ---
        if (e.stunDuration > 0) {
            if (!(e.statusFlags & EnemyFlags.STUNNED)) {
                e.statusFlags |= EnemyFlags.STUNNED;
                // Immediate interruption of all attacks on stun start
                if (e.state === AIState.ATTACK_CHARGE || e.state === AIState.ATTACKING) {
                    e.state = AIState.IDLE;
                    e.attackTimer = 0;
                    if (e.indicatorRing) {
                        e.indicatorRing.visible = false;
                        e.indicatorRing.matrixAutoUpdate = false;
                    }
                }
            }
            e.stunDuration -= delta;

            if ((e.statusFlags & EnemyFlags.RAGDOLLING)) {
                const sVel = e.spinVel;
                e.mesh.rotation.x += sVel.x * delta;
                e.mesh.rotation.y += sVel.y * delta;
                e.mesh.rotation.z += sVel.z * delta;
                e.mesh.quaternion.setFromEuler(e.mesh.rotation);

                if (e.mesh.position.y <= 0.1) {
                    sVel.x *= Math.max(0, 1 - 6.0 * delta);
                    sVel.y *= Math.max(0, 1 - 6.0 * delta);
                    sVel.z *= Math.max(0, 1 - 6.0 * delta);
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
                e.statusFlags &= ~(EnemyFlags.RAGDOLLING | EnemyFlags.STUNNED);
                e.mesh.rotation.x = 0;
                e.mesh.rotation.z = 0;
                e.mesh.quaternion.setFromEuler(e.mesh.rotation);
            }
            return;
        } else {
            e.statusFlags &= ~EnemyFlags.STUNNED;
        }

        // --- 8. SENSORS & SEPARATION ---
        const isFullyAware = e.awareness >= 0.9;
        const seesPlayer = isFullyAware && distSq < 2500;

        _v5.set(0, 0, 0);

        let shouldCheckSeparation = isTier1;
        if (isTier2) shouldCheckSeparation = (frameOffset % 5 === 0);
        if (isTier3) shouldCheckSeparation = false;

        if (shouldCheckSeparation && e.state !== AIState.ATTACK_CHARGE && e.state !== AIState.ATTACKING && e.state !== AIState.GRAPPLE) {
            const pool = streamer.getEnemyPool();
            const poolIdx = pool.nextIndex();
            streamer.getNearbyEnemies(e.mesh.position.x, e.mesh.position.z, SEPARATION_RADIUS, poolIdx);

            const nearbyEnemies = pool.getPool(poolIdx);
            const nearCount = pool.getCount(poolIdx);

            for (let i = 0; i < nearCount; i++) {
                const other = nearbyEnemies[i];
                if (other === e || other.deathState !== EnemyDeathState.ALIVE) continue;

                const odx = e.mesh.position.x - other.mesh.position.x;
                const odz = e.mesh.position.z - other.mesh.position.z;
                const odSq = odx * odx + odz * odz;

                if (odSq < SEPARATION_RADIUS_SQ && odSq > 0.001) {
                    // Sqrt Purge! 
                    // Using squared falloff for push strength. No sqrt needed.
                    // (1.0 - (odSq / SEPARATION_RADIUS_SQ)) * 5.0 (tuning factor)
                    const pushFactor = (1.0 - (odSq / SEPARATION_RADIUS_SQ)) * 5.0;
                    _v5.x += odx * pushFactor;
                    _v5.z += odz * pushFactor;
                }
            }
            if (Math.abs(_v5.x) > 0.001 || Math.abs(_v5.z) > 0.001) {
                // Limit the shove force using lengthSq
                const shoveSq = _v5.x * _v5.x + _v5.z * _v5.z;
                if (shoveSq > 16.0) { // Limit to 4.0 units
                    const invShove = 4.0 / Math.sqrt(shoveSq); // Still one sqrt but only once per enemy, NOT per neighbor!
                    _v5.x *= invShove;
                    _v5.z *= invShove;
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

                    // Choose a wander target within 5 to 10 meters of spawnPos
                    const angle = Math.random() * (TWO_PI);
                    const wanderRadius = 5.0 + Math.random() * 5.0; // 5-10 meters
                    const spawnY = ground.getGroundHeight(e.spawnPos.x, e.spawnPos.z, session);
                    _v1.set(e.spawnPos.x + Math.cos(angle) * wanderRadius, spawnY, e.spawnPos.z + Math.sin(angle) * wanderRadius);
                    e.velocity.subVectors(_v1, e.mesh.position).normalize().multiplyScalar(e.speed * 0.5);
                    e.searchTimer = 2.0 + Math.random() * 3.0;
                }
                break;

            case AIState.WANDER:
                e.searchTimer -= delta;
                _v1.set(e.mesh.position.x + e.velocity.x * delta, e.mesh.position.y + e.velocity.y * delta, e.mesh.position.z + e.velocity.z * delta);

                // Movement Lock Guard applied ONLY to physical displacement
                if (!isTier4 && !isKnockedBackH) {
                    moveEntity(e, _v1, delta, e.speed * 0.5, streamer, ground, session, _v5, simTime, renderTime, false, isTier1, isTier2, frameOffset);
                }

                // If wandering takes us too far from spawn pos, return towards it
                const distToSpawnSq = e.mesh.position.distanceToSquared(e.spawnPos);
                if (distToSpawnSq > 144.0) { // 12m limit threshold (squared)
                    e.velocity.subVectors(e.spawnPos, e.mesh.position).normalize().multiplyScalar(e.speed * 0.5);
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
                } else {
                    const distToLastSq = e.mesh.position.distanceToSquared(e.lastKnownPosition);
                    if (distToLastSq > 4.0) { // 2.0m threshold (squared)
                        // Movement Lock Guard
                        if (!isTier4 && !isKnockedBackH) {
                            moveEntity(e, e.lastKnownPosition, delta, e.speed * 0.8, streamer, ground, session, _v5, simTime, renderTime, false, isTier1, isTier2, frameOffset);
                        }
                    } else {
                        // Once they reach the player's last known location, they wander locally within 4-8m of it searching
                        if (!e.localSearchTarget) {
                            e.localSearchTarget = new THREE.Vector3();
                        }
                        
                        const timeInSec = Math.floor(simTime / 1000);
                        if (e.localSearchTarget.lengthSq() === 0 || (timeInSec % 3 === 0 && Math.random() > 0.7)) {
                            const angle = Math.random() * (TWO_PI);
                            const searchRad = 4.0 + Math.random() * 4.0;
                            const searchY = ground.getGroundHeight(e.lastKnownPosition.x, e.lastKnownPosition.z, session);
                            e.localSearchTarget.set(
                                e.lastKnownPosition.x + Math.cos(angle) * searchRad,
                                searchY,
                                e.lastKnownPosition.z + Math.sin(angle) * searchRad
                            );
                        }

                        if (!isTier4 && !isKnockedBackH) {
                            moveEntity(e, e.localSearchTarget, delta, e.speed * 0.6, streamer, ground, session, _v5, simTime, renderTime, false, isTier1, isTier2, frameOffset);
                        }
                        e.mesh.rotation.y += delta * 1.5;
                    }
                }
                break;

            case AIState.CHASE:
                if (seesPlayer) {
                    updateLastSeen(e, playerPos, simTime);
                } else if (e.awareness === 1.0) {
                    updateLastSeen(e, e.lastKnownPosition, simTime);
                }

                if (!e.isWaveEnemy && ((!seesPlayer && simTime - e.lastSeenTime > 5000) || distSq > 2500)) {
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
                        moveEntity(e, target, delta, chaseSpeed, streamer, ground, session, _v5, simTime, renderTime, true, isTier1, isTier2, frameOffset);

                        const dx = e.mesh.position.x - playerPos.x;
                        const dz = e.mesh.position.z - playerPos.z;
                        distSq = dx * dx + dz * dz;
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

                            const rawRange = (att.type === EnemyAttackType.HIT && !att.range) ? ENEMY_ATTACK_RANGE[e.type] : (att.range || ENEMY_ATTACK_RANGE[e.type]);
                            // VINTERDÖD STABILIZATION: buffer prevents "running-in-place" stalls
                            const bufferedRangeSq = (rawRange * COMBAT.HYSTERESIS) * (rawRange * COMBAT.HYSTERESIS);

                            if (distSq < bufferedRangeSq) {
                                bestAttackIndex = i;
                                // Prioritize special attacks (Bite, Smash, etc.)
                                if (att.type !== EnemyAttackType.HIT) break;
                            }
                        }

                        if (bestAttackIndex !== -1) {
                            const att = e.attacks[bestAttackIndex];
                            e.currentAttackIndex = bestAttackIndex;
                            e.targetPos.copy(playerPos);
                            e.animStartPos.copy(e.mesh.position);

                            if (att.chargeTime && att.chargeTime > 0) {
                                logStateChange(simTime, e, AIState.ATTACK_CHARGE);
                                e.state = AIState.ATTACK_CHARGE;
                                e.attackTimer = Math.max(0.016, att.chargeTime * 0.001); // Harden: Ensure timer is non-zero (min 1 frame)
                            } else {
                                // Immediate execution for 0-charge attacks (HIT, etc.)
                                const success = EnemyAttackHandler.executeAttack(e, att, distSq, playerPos, streamer, callbacks, delta, simTime, renderTime);

                                // Ensure we transition to ATTACKING if executeAttack succeeded and didn't switch to a special state (like GRAPPLE)
                                if (success && e.state === AIState.CHASE) {
                                    logStateChange(simTime, e, AIState.ATTACKING);
                                    e.state = AIState.ATTACKING;
                                    e.attackTimer = Math.max(0.016, (att.activeTime || 500) * 0.001); // Harden: Min 1 frame active
                                }
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
                        moveEntity(e, playerPos, delta, e.speed * 0.25, streamer, ground, session, _v5, simTime, renderTime, true, isTier1, isTier2, frameOffset);

                        const dx = e.mesh.position.x - playerPos.x;
                        const dz = e.mesh.position.z - playerPos.z;
                        distSq = dx * dx + dz * dz;
                    }

                    if (e.attackTimer <= 0) {
                        // State-Guard for charge-finish
                        const prevState = e.state;
                        const success = EnemyAttackHandler.executeAttack(e, att, distSq, playerPos, streamer, callbacks, delta, simTime, renderTime);

                        if (success && e.state === prevState) {
                            logStateChange(simTime, e, AIState.ATTACKING);
                            e.state = AIState.ATTACKING;
                            e.attackTimer = Math.max(0.016, (att.activeTime || 100) * 0.001); // Harden: Min 1 frame active
                        } else if (!success && e.state === prevState) {
                            // If attack failed (out of range?), go back to chase
                            logStateChange(simTime, e, AIState.CHASE, 'ATTACK_FAILED_RANGE');
                            e.state = AIState.CHASE;
                        }
                    }
                }
                break;

            case AIState.ATTACKING:
                if (e.attackTimer !== -1) {
                    const att = e.attacks[e.currentAttackIndex!];

                    // Movement Lock Guard
                    if (!isTier4 && !isKnockedBackH) {
                        moveEntity(e, playerPos, delta, e.speed * 0.15, streamer, ground, session, _v5, simTime, renderTime, true, isTier1, isTier2, frameOffset);

                        const dx = e.mesh.position.x - playerPos.x;
                        const dz = e.mesh.position.z - playerPos.z;
                        distSq = dx * dx + dz * dz;
                    }

                    if (att && att.activeTime) {
                        EnemyAttackHandler.updateContinuousAttack(e, att, playerPos, callbacks, delta, simTime, renderTime);
                    }

                    if (e.attackTimer <= 0) {
                        if (att && att.type === EnemyAttackType.JUMP) {
                            if (distSq < (att.range || 6) * (att.range || 6)) {
                                callbacks.onPlayerHit(att.damage, e, DamageType.PHYSICAL, DamageID.PHYSICAL, false, att.effect, att.effectDuration, att.effectDamage, att.type);
                                if (e.type === EnemyType.RUNNER) {
                                    logStateChange(simTime, e, AIState.GRAPPLE, 'JUMP_LANDED');
                                    e.state = AIState.GRAPPLE;
                                    e.statusFlags |= EnemyFlags.GRAPPLING;
                                    e.grappleDuration = 1.5 + Math.random() * 0.5;
                                    e.attackTimer = -1; // Yield control to Grapple system
                                    e.attackCooldowns[att.type] = att.cooldown;
                                    break;
                                }
                            }
                        }

                        logStateChange(simTime, e, AIState.CHASE, 'VISUAL');
                        e.state = AIState.CHASE;
                    }
                }
                break;

            case AIState.GRAPPLE:
                // Advanced attachment & Inertia-driven Pendulum
                e.grappleDuration -= delta;

                // 1. Break Check (Rush = 1<<4, Dodge = 1<<8)
                const isRushing = (playerStatusFlags & 16) !== 0;
                const isDodging = (playerStatusFlags & 256) !== 0;

                if (isRushing || isDodging || e.grappleDuration <= 0 || isDead) {
                    const reason = isRushing ? 'STRUGGLED_FREE' : (isDodging ? 'DODGED_FREE' : (isDead ? 'DIED' : 'TIMEOUT'));
                    logStateChange(simTime, e, AIState.CHASE, reason);

                    e.state = AIState.CHASE;
                    e.statusFlags &= ~EnemyFlags.GRAPPLING;
                    e.grappleDuration = 0;
                    e.attackCooldowns[EnemyAttackType.BITE] = 3000;
                    e.mesh.rotation.x = 0;
                    _v1.copy(e.mesh.position);
                    _v2.copy(e.prevP);
                    e.prevP.copy(_v1);
                    e.prevP.set(0, -1000, 0); // Reset inertia marker
                    break;
                }

                // 2. High-Fidelity Physics (Zero-GC Pendulum)
                // Pivot point: Neck Region (playerPos + 1.6 height)
                const neckHeight = 1.6;
                const orbitDist = e.attackOffset;

                // Track player displacement for inertia
                const prevP = e.prevP;

                // Check for reset marker (y = -1000) to prevent first-frame physics explosion
                if (prevP.y < -500) {
                    prevP.copy(playerPos);
                    _v1.set(0, 0, 0);
                } else {
                    _v1.subVectors(playerPos, prevP); // _v1 = frame displacement
                    prevP.copy(playerPos);
                }

                // Pivot direction (Horizontal plane)
                _v2.subVectors(e.mesh.position, playerPos);
                _v2.y = 0;

                // V8/Math Optimization: NaN Safety Check (Prevents disappearing enemies)
                const currentDistSq = _v2.lengthSq();
                if (currentDistSq > 0.0001) {
                    _v2.divideScalar(Math.sqrt(currentDistSq));
                } else {
                    // Fallback to current forward or random if overlapping
                    _v2.set(0, 0, 1);
                }

                // Target position (Horizontal orbit)
                _v3.copy(_v2).multiplyScalar(orbitDist).add(playerPos);

                // Inertia: Calculate "Hanging" angle based on player motion
                const dot = _v1.dot(_v2); // Positive if player moves away from zombie
                const sideDot = _v1.x * _v2.z - _v1.z * _v2.x; // Cross-product (Vertical component proxy)

                // Update swing angles (Smoothed pendulum)
                const targetTilt = -dot * 3.5;
                const targetSwing = -sideDot * 5.0;

                // V8/Math Optimization: NaN Safety Check
                if (isNaN(e.swingX)) e.swingX = 0;
                if (isNaN(e.swingZ)) e.swingZ = 0;

                e.swingX = THREE.MathUtils.lerp(e.swingX, targetTilt, 5.0 * delta);
                e.swingZ = THREE.MathUtils.lerp(e.swingZ, targetSwing, 5.0 * delta);

                // 3. Final Mesh Transform
                e.mesh.position.set(_v3.x, playerPos.y + neckHeight, _v3.z);

                // Rotation: Look at player (Y-axis facing)
                // Note: X and Z tilt is handled by EnemyAnimator.updateAttackAnim using swingX/Z
                e.mesh.rotation.y = Math.atan2(playerPos.x - e.mesh.position.x, playerPos.z - e.mesh.position.z);

                // Vertical offset so zombie head is at pivot point
                e.mesh.position.y -= (e.originalScale * 0.82);

                // FINAL SAFETY: Clamp Y to ground to prevent "disappearing" below floor
                if (e.mesh.position.y < -0.5) e.mesh.position.y = 0.1;

                // 4. Periodic Damage & Visuals
                if (simTime > (e.lastGrappleDmg || 0) + 600) {
                    e.lastGrappleDmg = simTime;
                    callbacks.onPlayerHit(4, e, DamageType.PHYSICAL, DamageID.BITE, true, undefined, undefined, undefined, EnemyAttackType.GRAPPLE_BITE);

                    if (callbacks.spawnParticle) {
                        // Improved blood feedback for grapple
                        callbacks.spawnParticle(playerPos.x, 1.5, playerPos.z, FXParticleType.BLOOD_SPLATTER, 6);
                    }
                }
                break;
        }

        // --- 10. PROCEDURAL ANIMATION ---
        EnemyAnimator.updateAttackAnim(e, renderTime, delta);

        // --- 11. PROCESS STATUS EFFECTS ---
        //handleStatusEffects(e, delta, simTime, callbacks);
    }
};

// --- HELPERS ---
function moveEntity(e: Enemy, target: THREE.Vector3, delta: number, speed: number, streamer: WorldStreamer, ground: any, session: any, sepForce: THREE.Vector3, simTime: number, renderTime: number, isChasing: boolean, isTier1: boolean, isTier2: boolean, frameOffset: number) {
    // 1. NAVIGATION: Get desired steering vector from FlowField
    NavigationSystem.getFlowVector(e.mesh.position.x, e.mesh.position.z, _v1);

    // Fallback to straight-line to target if outside flow grid or target reached
    if (_v1.x === 0 && _v1.z === 0) {
        _v1.set(target.x, e.mesh.position.y, target.z);
        _v1.sub(e.mesh.position);
        _v1.y = 0;
        const distSq = _v1.lengthSq();
        if (distSq > 0.0001) _v1.normalize();
    }

    // 2. STATUS EFFECTS: Apply Slows (50% reduction for materials/flags, 20% for projectile slowDuration)
    const isSlowingMaterial = (e.statusFlags & (EnemyFlags.SLOWED | EnemyFlags.WADING)) !== 0;
    if (isSlowingMaterial) {
        speed *= 0.5;
    } else if (e.slowDuration > 0) {
        speed *= 0.8; // 20% slower
    }

    // 3. SET BASE VELOCITY (Steering Vector * Target Speed)
    _v3.copy(_v1).multiplyScalar(speed);

    // 4. SEPARATION: Apply push force from neighboring enemies
    if (Math.abs(sepForce.x) > 0.001 || Math.abs(sepForce.z) > 0.001) {
        _v3.addScaledVector(sepForce, 1.2);

        // CLAMP: Prevent "Crowd Surfing" at high density
        if (_v3.lengthSq() > speed * speed) {
            _v3.normalize().multiplyScalar(speed);
        }
    }

    // Save actual physics velocity for other systems (FX, ragdolls)
    e.velocity.copy(_v3);

    // 5. DISPLACEMENT: Velocity -> Frame Delta
    _v3.multiplyScalar(delta);

    // New Trial position (_v4)
    _v4.set(
        e.mesh.position.x + _v3.x,
        e.mesh.position.y + _v3.y,
        e.mesh.position.z + _v3.z
    );

    // 6. COLLISION RESOLUTION: Harden path against world obstacles
    // Throttle queries: only re-query spatial grid if enemy moved >0.5m (0.25m^2)
    const dqx = _v4.x - e.lastObsQueryPos.x;
    const dqz = _v4.z - e.lastObsQueryPos.z;
    if (dqx * dqx + dqz * dqz > 0.25 || e.lastObsQueryPos.y < -500) {
        const obsPool = streamer.getObstaclePool();
        const poolIdx = obsPool.nextIndex();
        streamer.getNearbyObstacles(_v4.x, _v4.z, 4.0, poolIdx);

        const nearbyObs = obsPool.getPool(poolIdx);
        const obsCount = obsPool.getCount(poolIdx);
        const limit = Math.min(obsCount, 16);
        for (let i = 0; i < limit; i++) {
            e.cachedObstacles[i] = nearbyObs[i];
        }
        e.cachedObstacleCount = limit;
        e.lastObsQueryPos.copy(_v4);
    }

    const rad = (e.originalScale || 1.0) * (e.widthScale || 1.0) * 0.5;
    const count = e.cachedObstacleCount;
    for (let i = 0; i < count; i++) {
        const obs = e.cachedObstacles[i];
        if (obs) applyCollisionResolution(_v4, rad, obs);
    }

    // 7. ANIMATION & ROTATION
    // Steering direction (_v1) is already normalized and reliable for rotation
    if (isChasing) e.mesh.rotation.y = Math.atan2(_v1.x, _v1.z);
    else e.mesh.rotation.y = THREE.MathUtils.lerp(e.mesh.rotation.y, Math.atan2(_v1.x, _v1.z), 5 * delta);

    const speedRatio = speed / (e.speed || 1);
    const animFreq = isChasing ? 0.055 * speedRatio : 0.035 * speedRatio;
    const bounceOffset = Math.abs(Math.sin(renderTime * animFreq)) * 0.12;

    const hijackY = e.state === AIState.ATTACK_CHARGE || e.state === AIState.ATTACKING;
    if ((e.statusFlags & EnemyFlags.AIRBORNE) === 0 && !hijackY) {
        const groundHeight = ground.getGroundHeight(_v4.x, _v4.z, session);
        _v4.y = groundHeight + bounceOffset;
    }

    e.mesh.position.copy(_v4);
}

function updateLastSeen(e: Enemy, pos: THREE.Vector3, simTime: number) {
    e.lastKnownPosition.copy(pos);
    e.lastSeenTime = simTime;
}

function handleStatusEffects(e: Enemy, delta: number, simTime: number, callbacks: any) {
    const flags = e.statusFlags;

    // 1. BURNING: Damage + Flame Particles
    if ((flags & EnemyFlags.BURNING) !== 0) {
        if (Math.random() < 0.3) {
            if (callbacks.spawnParticle) {
                const s = e.originalScale * 1.5;
                callbacks.spawnParticle(e.mesh.position.x + (Math.random() - 0.5) * s, e.mesh.position.y + s, e.mesh.position.z + (Math.random() - 0.5) * s, FXParticleType.ENEMY_EFFECT_FLAME, 1);
            }
        }
        if (simTime > (e.lastBurnTick || 0) + 500) {
            const dmg = 5;
            e.hp -= dmg;
            if (callbacks.onEffectTick) callbacks.onEffectTick(e, EnemyEffectType.FLAME);
            if (callbacks.applyDamage) callbacks.applyDamage(e, dmg, DamageType.BURN, e.burnSource || DamageID.BURN, false);
            e.lastBurnTick = simTime;
        }
    }

    // 2. STUNNED: Constant visual check (not damage)
    if ((flags & EnemyFlags.STUNNED) !== 0) {
        if (Math.random() < 0.1) {
            if (callbacks.onEffectTick) callbacks.onEffectTick(e, EnemyEffectType.STUN);
            if (callbacks.spawnParticle) {
                callbacks.spawnParticle(e.mesh.position.x, e.mesh.position.y + e.originalScale * 1.8, e.mesh.position.z, FXParticleType.ENEMY_EFFECT_STUN, 1);
            }
        }
    }

    // 3. ELECTROCUTED: Spark particles
    if ((flags & EnemyFlags.ELECTROCUTED) !== 0) {
        if (Math.random() < 0.2) {
            if (callbacks.onEffectTick) callbacks.onEffectTick(e, EnemyEffectType.SPARK);
            if (callbacks.spawnParticle) {
                const s = e.originalScale * 1.5;
                callbacks.spawnParticle(e.mesh.position.x + (Math.random() - 0.5) * s, e.mesh.position.y + s, e.mesh.position.z + (Math.random() - 0.5) * s, FXParticleType.ENEMY_EFFECT_SPARK, 1);
            }
        }
    }
}
