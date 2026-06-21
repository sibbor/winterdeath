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
import { COMBAT, PHYSICS } from '../../content/constants';
import { ENEMY_DETECTION } from '../../entities/enemies/EnemyTypes';
import { SystemID } from '../../systems/SystemID';

const _waterCheckResult = { flatDepth: 0 };

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3();
const _wanderTarget = new THREE.Vector3();

// --- PRE-CALCULATED CONSTANTS ---
const TWO_PI = Math.PI * 2;
const SEPARATION_RADIUS = 1.5;
const SEPARATION_RADIUS_SQ = SEPARATION_RADIUS * SEPARATION_RADIUS;

export const logStateChange = (simTime: number, e: Enemy, newState: AIState, reason?: string) => {
    const engine = WinterEngine.getInstance();

    if (!(engine.systems.performanceMonitor?.aiLoggingEnabled ?? true)) return;
    const typeName = DataResolver.getEnemyName(e.type, e.bossId);
    console.log(`[EnemyAI] ${typeName} ${e.id} changed state: ${AIState[e.state]} -> ${AIState[newState]} ${reason ? `(${reason})` : ''}`);
};

export const EnemyAI = {
    systemId: SystemID.ENEMY_AI,
    id: 'enemy_ai',

    updateEnemy: (
        enemy: Enemy,
        playerPos: THREE.Vector3,
        playerStatusFlags: number,
        streamer: WorldStreamer,
        isDead: boolean,
        callbacks: {
            handlePlayerHit: (damage: number, attacker: any, damageType: DamageType, damageSource: DamageID, isDoT?: boolean, effectType?: StatusEffectID, duration?: number, intensity?: number, specificAttackType?: EnemyAttackType) => boolean;
            handleEnemyHit: (enemy: Enemy, amount: number, damageType: DamageType, damageSource: DamageID, isHighImpact?: boolean, attributionOverride?: DamageID) => boolean;
            onEffectTick: (e: Enemy, type: EnemyEffectType) => void;
            playSound: (id: SoundID) => void;
            spawnParticle: (x: number, y: number, z: number, type: FXParticleType, count: number, mesh?: THREE.Object3D | null, vel?: THREE.Vector3, color?: number, scale?: number, life?: number, weight?: number) => void;
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
        const engine = session.engine;

        const dx0 = enemy.mesh.position.x - playerPos.x;
        const dz0 = enemy.mesh.position.z - playerPos.z;
        let distSq = dx0 * dx0 + dz0 * dz0;


        if (enemy.deathState === EnemyDeathState.DEAD || !enemy.mesh) return;

        // --- AI LoD (Level of Detail) TIERS (+50% Distance) ---
        const isTier1 = distSq < 1406;
        const isTier2 = !isTier1 && distSq < 5625;
        const isTier3 = !isTier1 && !isTier2 && distSq < 14400;
        const isTier4 = !isTier1 && !isTier2 && !isTier3 && distSq <= 22500;

        const frameTick = Math.floor(simTime * 0.06);
        const frameOffset = (frameTick + (enemy.poolId % 60));

        if (distSq > 22500 &&
            enemy.deathState === EnemyDeathState.ALIVE &&
            (enemy.statusFlags & (EnemyFlags.BURNING | EnemyFlags.DROWNING)) === 0 &&
            (Math.abs(enemy.knockbackVel.x) < 0.1 && Math.abs(enemy.knockbackVel.z) < 0.1) &&
            enemy.stunDuration <= 0
        ) {
            if (enemy.state === AIState.CHASE || enemy.state === AIState.SEARCH) {
                enemy.state = AIState.IDLE;
            }
            return;
        }

        // --- 1. HANDLE INITIAL DEATH TRIGGER ---
        if (enemy.hp <= 0 && enemy.deathState === EnemyDeathState.ALIVE) {
            const dmgType = enemy.lastDamageType;
            const weapon = (typeof dmgType === 'number' && dmgType < WEAPONS.length) ? WEAPONS[dmgType as number] : null;

            if (engine.systems.performanceMonitor?.aiLoggingEnabled ?? true) {
                const isWeapon = !!weapon;
                const enemyName = DataResolver.getEnemyName(enemy.type, enemy.bossId);
                const cause = isWeapon
                    ? `Weapon (${DataResolver.getWeaponName(dmgType as any)})`
                    : `Effect (${DataResolver.getEffectName(dmgType as any)})`;
                console.log(`[AI] ${EnemyType[enemy.type]}_${enemy.id} killed by: ${cause}`);
            }

            enemy.deathTimer = simTime;

            const baseScale = enemy.originalScale;
            const widthScale = enemy.widthScale;
            enemy.mesh.scale.set(baseScale * widthScale, baseScale, baseScale * widthScale);

            const isHighImpact = enemy.lastHitWasHighImpact;
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
                    } else if ((enemy.statusFlags & EnemyFlags.BURNING) !== 0) {
                        finalDeathState = EnemyDeathState.BURNED;
                    } else if (enemy.type === EnemyType.BLOATER || (enemy.statusFlags & EnemyFlags.BOSS) !== 0) {
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
            }

            if ((enemy.statusFlags & EnemyFlags.BOSS) !== 0) {
                finalDeathState = EnemyDeathState.GIBBED;
            }

            enemy.deathState = finalDeathState;

            // --- Apply Visual & Physics side effects based on final state ---
            switch (finalDeathState) {
                case EnemyDeathState.ELECTROCUTED:
                    enemy.deathVel.set(0, 0, 0);
                    break;

                case EnemyDeathState.BURNED:
                    callbacks.playSound(SoundID.ZOMBIE_DEATH_BURN);
                    break;

                case EnemyDeathState.EXPLODED:
                    // Bloater/Boss Detonation Logic
                    if (dmgType !== DamageID.GRENADE) {
                        const pos = enemy.mesh.position;
                        WeaponSounds.playExplosion(pos);
                        haptic.explosion();

                        if (enemy.type === EnemyType.BLOATER && callbacks.queryEnemies && callbacks.handleEnemyHit) {
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
                                if (other === enemy || other.hp <= 0) continue;

                                _v1.subVectors(other.mesh.position, pos);
                                const dSq = _v1.lengthSq();
                                const totalRad = radius + (other.originalScale * 0.5);

                                if (dSq < totalRad * totalRad) {
                                    if (callbacks.handleEnemyHit) callbacks.handleEnemyHit(other, damage, DamageType.EXPLOSION, DamageID.EXPLOSION, true);
                                    const force = 25.0 * (1.0 - Math.min(1.0, dSq / radSq));
                                    const mass = other.originalScale * other.widthScale;
                                    _v2.copy(_v1).normalize().multiplyScalar(force / mass).setY(2.0);
                                    other.knockbackVel.add(_v2);
                                }
                            }
                        }
                        engine?.triggerHitStop(enemy.type === EnemyType.BLOATER ? 40 : 50);
                    }
                    break;

                case EnemyDeathState.GIBBED:
                    enemy.statusFlags |= EnemyFlags.GIBBED;
                    callbacks.playSound(SoundID.ZOMBIE_DEATH_SHOT);
                    break;

                case EnemyDeathState.SHOT:
                default:
                    callbacks.playSound(SoundID.ZOMBIE_DEATH_SHOT);
                    _v1.subVectors(enemy.mesh.position, playerPos).normalize();
                    _v2.copy(_v1).negate();

                    const forwardMomentum = enemy.velocity.dot(_v2);
                    enemy.fallForward = forwardMomentum > 1.5;
                    enemy.deathVel.copy(enemy.velocity).multiplyScalar(0.1);

                    const impactForce = weapon ? weapon.damage * 0.15 : 2.0;
                    enemy.deathVel.addScaledVector(_v1, impactForce).setY((weapon && weapon.damage > 20) ? 3.5 : 2.0);
                    break;
            }

            // Heavy Kill Hit-stop for Tanks
            if (enemy.type === EnemyType.TANK) {
                engine?.triggerHitStop(45);
                haptic.impact(0.8);
            }

            return;
        }

        if (enemy.deathState !== EnemyDeathState.ALIVE) return;

        // --- 2. POOLING SCALE RECOVERY ---
        const targetScaleY = enemy.originalScale;
        if (Math.abs(enemy.mesh.scale.y - targetScaleY) > 0.05) {
            const w = enemy.widthScale;
            enemy.mesh.scale.set(targetScaleY * w, targetScaleY, targetScaleY * w);
            enemy.mesh.visible = true;
        }

        // --- 3. STATUS EFFECTS ---
        handleStatusEffects(enemy, delta, simTime, callbacks);

        let checkedWaterThisFrame = false;

        // --- 4. MASS-BASED KNOCKBACK PHYSICS ---
        if (enemy.knockbackVel.lengthSq() > 0.001) {
            if (!(enemy.statusFlags & EnemyFlags.KNOCKED_BACK)) {
                enemy.statusFlags |= EnemyFlags.KNOCKED_BACK;
            }

            // --- Apply pure velocity (EnemyManager already divided by mass!) ---
            enemy.mesh.position.addScaledVector(enemy.knockbackVel, delta);

            // --- Snappy, heavy gravity (Increased to 65 for grit) ---
            enemy.knockbackVel.y -= 65 * delta;

            // --- Friction (Horizontal only) ---
            const mass = enemy.bodyMass;
            // Increase friction significantly if ragdolling on ground to prevent "ice-skating"
            const frictionMult = ((enemy.statusFlags & EnemyFlags.RAGDOLLING) || !(enemy.statusFlags & EnemyFlags.AIRBORNE)) ? 12.0 : 2.5;
            const friction = 1.0 + (mass * frictionMult);
            const drag = Math.max(0, 1 - friction * delta);
            enemy.knockbackVel.x *= drag;
            enemy.knockbackVel.z *= drag;

            // Track peak height for fall damage
            if (enemy.mesh.position.y > (enemy.fallStartY || 0)) {
                enemy.fallStartY = enemy.mesh.position.y;
            }
            enemy.statusFlags |= EnemyFlags.AIRBORNE;

            // 4. Floor Collision & Landing Logic
            const isRagdolling = (enemy.statusFlags & EnemyFlags.RAGDOLLING) !== 0 || enemy.deathState !== EnemyDeathState.ALIVE;
            const floorY = ground.getGroundHeight(enemy.mesh.position.x, enemy.mesh.position.z, session);
            if (enemy.mesh.position.y <= floorY) {
                const peakY = enemy.fallStartY || floorY;
                enemy.mesh.position.y = floorY;
                enemy.statusFlags &= ~EnemyFlags.AIRBORNE;
                enemy.fallStartY = 0;

                // Interaction: Water splashes or Fall damage
                if (water) {
                    water.checkBuoyancy(enemy.mesh.position.x, enemy.mesh.position.y, enemy.mesh.position.z, renderTime);
                    checkedWaterThisFrame = true;
                    if (_buoyancyResult.inWater) {
                        water.spawnRipple(enemy.mesh.position.x, enemy.mesh.position.z, 1.5);
                        callbacks.spawnParticle(enemy.mesh.position.x, _buoyancyResult.waterLevel, enemy.mesh.position.z, FXParticleType.SPLASH, 8);
                    }
                }

                // Apply fall damage if not in water
                const fallHeight = peakY - floorY;
                if (isRagdolling && (!water || !_buoyancyResult.inWater) && fallHeight > 0.5) {
                    // Quadratic fall damage for high-impact RUSH feel scaled by body weight
                    const fallRatio = fallHeight * (enemy.bodyWeight / 75.0);
                    const fallDamage = Math.min(enemy.maxHp * 0.95, fallRatio * fallRatio * 15);

                    const isAttributedSource = (
                        enemy.lastKnockback === DamageID.RUSH ||
                        enemy.lastKnockback === DamageID.DODGE ||
                        enemy.lastKnockback === DamageID.VEHICLE ||
                        enemy.lastKnockback === DamageID.VEHICLE_RAM ||
                        enemy.lastKnockback === DamageID.VEHICLE_PUSH ||
                        enemy.lastKnockback === DamageID.VEHICLE_SPLATTER
                    );
                    const sourceId = isAttributedSource ? enemy.lastKnockback : DamageID.PHYSICAL;

                    if (callbacks.handleEnemyHit) {
                        callbacks.handleEnemyHit(enemy, fallDamage, DamageType.PHYSICAL, sourceId, true);
                    } else {
                        enemy.hp -= fallDamage;
                    }

                    // High Fall Landing Stun (Stay Down)
                    if (fallHeight > 2.5) {
                        enemy.stunDuration = Math.max(enemy.stunDuration, 2.0);
                        if (callbacks.playSound) callbacks.playSound(SoundID.IMPACT_METAL);
                    }

                    if (callbacks.spawnParticle) {
                        callbacks.spawnParticle(enemy.mesh.position.x, floorY + 0.5, enemy.mesh.position.z, FXParticleType.BLOOD_SPLATTER, Math.floor(fallHeight * 4));
                    }

                    if (enemy.hp <= 0 && enemy.deathState === EnemyDeathState.ALIVE) {
                        enemy.deathState = EnemyDeathState.FALL;
                    }
                }

                enemy.knockbackVel.set(0, 0, 0);
            }
        } else {
            enemy.statusFlags &= ~EnemyFlags.KNOCKED_BACK;
            if ((enemy.statusFlags & EnemyFlags.AIRBORNE) !== 0) {
                enemy.statusFlags &= ~EnemyFlags.AIRBORNE;
                enemy.fallStartY = 0;
            }
        }

        // --- 5. WATER STATE EVALUATION ---
        if (water) {
            if (!checkedWaterThisFrame) {
                if (enemy.mesh.position.y < 2.0) {
                    water.checkBuoyancy(enemy.mesh.position.x, enemy.mesh.position.y, enemy.mesh.position.z, renderTime);
                } else {
                    _buoyancyResult.inWater = false;
                }
            }

            if (_buoyancyResult.inWater) {
                _waterCheckResult.flatDepth = _buoyancyResult.baseWaterLevel - _buoyancyResult.groundY;
                enemy.statusFlags |= EnemyFlags.IN_WATER;
                if (_waterCheckResult.flatDepth > 0.4 && _waterCheckResult.flatDepth <= 1.25) enemy.statusFlags |= EnemyFlags.WADING;
                else enemy.statusFlags &= ~EnemyFlags.WADING;

                const inDeepWater = _waterCheckResult.flatDepth > 1.25;
                if (inDeepWater && (enemy.statusFlags & EnemyFlags.DROWNING) === 0) {
                    enemy.swimDistance += enemy.velocity.length() * delta;
                    if (enemy.swimDistance > enemy.maxSwimDistance) {
                        enemy.statusFlags |= EnemyFlags.DROWNING;
                    }
                } else if (!inDeepWater) {
                    enemy.swimDistance = 0;
                    enemy.statusFlags &= ~EnemyFlags.DROWNING;
                }
            } else {
                enemy.statusFlags &= ~(EnemyFlags.IN_WATER | EnemyFlags.WADING | EnemyFlags.DROWNING);
                enemy.swimDistance = 0;
                enemy.statusFlags &= ~EnemyFlags.DROWNING;
                const groundY = ground.getGroundHeight(enemy.mesh.position.x, enemy.mesh.position.z, session);
                if (enemy.mesh.position.y < groundY) {
                    enemy.mesh.position.y = THREE.MathUtils.lerp(enemy.mesh.position.y, groundY, 8 * delta);
                    if (enemy.mesh.position.y > groundY - 0.01) enemy.mesh.position.y = groundY;
                }
            }
        }

        // --- 6. DROWNING ---
        if ((enemy.statusFlags & EnemyFlags.DROWNING) !== 0 && enemy.deathState === EnemyDeathState.ALIVE) {
            enemy.drownTimer += delta;

            if (water) {
                const targetY = _buoyancyResult.waterLevel - 0.2;
                enemy.mesh.position.y = THREE.MathUtils.lerp(enemy.mesh.position.y, targetY, 3 * delta);
            }

            const dj = delta * 60;
            enemy.mesh.position.x += (Math.random() - 0.5) * 0.18 * dj;
            enemy.mesh.position.z += (Math.random() - 0.5) * 0.18 * dj;
            enemy.mesh.rotation.x += (Math.random() - 0.5) * 0.3 * dj;
            enemy.mesh.rotation.z += (Math.random() - 0.5) * 0.3 * dj;

            enemy.drownDmgTimer += delta;
            if (enemy.drownDmgTimer >= 0.15) {
                enemy.drownDmgTimer = 0;
                if (water) water.spawnRipple(enemy.mesh.position.x, enemy.mesh.position.z, 0.9, 1.2);
                callbacks.spawnParticle(enemy.mesh.position.x, _buoyancyResult.waterLevel, enemy.mesh.position.z, FXParticleType.SPLASH, 4);

                const tickDmg = enemy.maxHp * 0.05;
                enemy.hp -= tickDmg;
                if (callbacks.handleEnemyHit) callbacks.handleEnemyHit(enemy, tickDmg, DamageType.DROWNING, DamageID.DROWNING);

                if (enemy.hp <= 0 && enemy.deathState === EnemyDeathState.ALIVE) {
                    if (engine.systems.performanceMonitor?.aiLoggingEnabled ?? true) {
                        console.log(`[AI] ${EnemyType[enemy.type]}_${enemy.id} killed by: Environment (DROWNED)`);
                    }
                    enemy.deathState = EnemyDeathState.DROWNED;
                    enemy.velocity.set(0, 0, 0);
                    enemy.knockbackVel.set(0, 0, 0);
                }
            }
            return;
        }

        // --- 6.5 STATUS TIMERS & COOLDOWNS ---
        if (enemy.slowDuration > 0) enemy.slowDuration -= delta;
        if (enemy.blindDuration > 0) enemy.blindDuration -= delta;
        if (enemy.burnDuration > 0) {
            enemy.burnDuration -= delta;
            if (enemy.burnDuration <= 0) {
                // Bitwise extinguish when duration expires
                enemy.statusFlags &= ~EnemyFlags.BURNING;
            }
        }

        // Decoupled Attack & Ability timers (Standardized to seconds)
        if (enemy.attackTimer > 0) {
            enemy.attackTimer -= (delta * (session.state.isTimeFrozen ? 0 : 1));
            if (isNaN(enemy.attackTimer)) enemy.attackTimer = 0; // NaN Guard
            if (enemy.attackTimer < 0) enemy.attackTimer = 0;
        }

        // --- VINTERDÖD STABILIZATION: PERCEPTION UPDATE (Visual + Noise) ---
        // Staggered perception check (once every 15 frames) to minimize CPU overhead
        const waveDisabled = enemy.isWaveEnemy && session.state?.sectorState?.waveDisabled;
        if (!waveDisabled && (enemy.poolId + Math.floor(simTime * 60)) % 15 === 0 && enemy.hp > 0) {
            const dx = playerPos.x - enemy.mesh.position.x;
            const dz = playerPos.z - enemy.mesh.position.z;
            const distSq = dx * dx + dz * dz;

            // Visual Perception
            if (distSq < ENEMY_DETECTION.VISUAL_RANGE_SQ) {
                const enemyDetectionSystem = session.systems.enemyDetection;
                if (enemyDetectionSystem && enemyDetectionSystem.canSeePlayer(enemy, playerPos, streamer)) {
                    enemy.awareness = 1.0;
                    enemy.lastSeenTime = simTime;
                    enemy.lastKnownPosition.copy(playerPos);
                }
            }
        }

        // Decay awareness over time if player is lost
        if (enemy.awareness > 0 && !session.state.isTimeFrozen) {
            enemy.awareness = Math.max(0, enemy.awareness - delta * 0.15);
        }

        if (enemy.abilityCooldown > 0) enemy.abilityCooldown = Math.max(0, enemy.abilityCooldown - delta);

        for (let i = 0; i < enemy.attacks.length; i++) {
            const atkType = enemy.attacks[i].type;
            const cd = enemy.attackCooldowns[atkType];
            if (cd !== 0) {
                enemy.attackCooldowns[atkType] = Math.max(0, cd - delta * 1000);
            }
        }

        // --- 7. STUNS & RAGDOLLS ---
        if (enemy.stunDuration > 0) {
            if (!(enemy.statusFlags & EnemyFlags.STUNNED)) {
                enemy.statusFlags |= EnemyFlags.STUNNED;
                // Immediate interruption of all attacks on stun start
                if (enemy.state === AIState.ATTACK_CHARGE || enemy.state === AIState.ATTACKING) {
                    enemy.state = AIState.IDLE;
                    enemy.attackTimer = 0;
                    if (enemy.indicatorRing) {
                        enemy.indicatorRing.visible = false;
                        enemy.indicatorRing.matrixAutoUpdate = false;
                    }
                }
            }
            enemy.stunDuration -= delta;

            if ((enemy.statusFlags & EnemyFlags.RAGDOLLING)) {
                const sVel = enemy.spinVel;
                enemy.mesh.rotation.x += sVel.x * delta;
                enemy.mesh.rotation.y += sVel.y * delta;
                enemy.mesh.rotation.z += sVel.z * delta;
                enemy.mesh.quaternion.setFromEuler(enemy.mesh.rotation);

                if (enemy.mesh.position.y <= 0.1) {
                    sVel.x *= Math.max(0, 1 - 6.0 * delta);
                    sVel.y *= Math.max(0, 1 - 6.0 * delta);
                    sVel.z *= Math.max(0, 1 - 6.0 * delta);
                }

                if (enemy.stunDuration < 0.6) {
                    const recoveryProgress = 1.0 - (enemy.stunDuration / 0.6);
                    enemy.mesh.rotation.x = THREE.MathUtils.lerp(enemy.mesh.rotation.x, 0, recoveryProgress);
                    enemy.mesh.rotation.z = THREE.MathUtils.lerp(enemy.mesh.rotation.z, 0, recoveryProgress);
                    enemy.mesh.quaternion.setFromEuler(enemy.mesh.rotation);
                }
            } else {
                const jitterScale = delta * 60;
                enemy.mesh.position.x += (Math.random() - 0.5) * 0.05 * jitterScale;
                enemy.mesh.position.z += (Math.random() - 0.5) * 0.05 * jitterScale;
                enemy.mesh.rotation.y += (Math.random() - 0.5) * 0.5 * jitterScale;
            }

            if (Math.random() < 0.1) callbacks.onEffectTick(enemy, EnemyEffectType.STUN);

            if (enemy.stunDuration <= 0) {
                logStateChange(simTime, enemy, AIState.CHASE);
                enemy.state = AIState.CHASE;
                enemy.statusFlags &= ~(EnemyFlags.RAGDOLLING | EnemyFlags.STUNNED);
                enemy.mesh.rotation.x = 0;
                enemy.mesh.rotation.z = 0;
                enemy.mesh.quaternion.setFromEuler(enemy.mesh.rotation);
            }
            return;
        } else {
            enemy.statusFlags &= ~EnemyFlags.STUNNED;
        }

        // --- 8. SENSORS & SEPARATION ---
        let seesPlayer = (simTime - (enemy.lastSeenTime || 0) < 500) && enemy.awareness > 0.8 && distSq < 2500;

        // VINTERDÖD: Event tether logic for wave enemies (50m radius)
        const isTethered = enemy.isWaveEnemy && enemy.mesh.position.distanceToSquared(enemy.spawnPos) > 2500.0;
        if (isTethered) {
            seesPlayer = false; // Ignore player while returning to event area
        }

        _v5.set(0, 0, 0);

        let shouldCheckSeparation = isTier1;
        if (isTier2) shouldCheckSeparation = (frameOffset % 5 === 0);
        if (isTier3) shouldCheckSeparation = false;

        if (shouldCheckSeparation && enemy.state !== AIState.ATTACK_CHARGE && enemy.state !== AIState.ATTACKING && enemy.state !== AIState.GRAPPLE) {
            const pool = streamer.getEnemyPool();
            const poolIdx = pool.nextIndex();
            streamer.getNearbyEnemies(enemy.mesh.position.x, enemy.mesh.position.z, SEPARATION_RADIUS, poolIdx);

            const nearbyEnemies = pool.getPool(poolIdx);
            const nearCount = pool.getCount(poolIdx);

            for (let i = 0; i < nearCount; i++) {
                const other = nearbyEnemies[i];
                if (other === enemy || other.deathState !== EnemyDeathState.ALIVE) continue;

                const odx = enemy.mesh.position.x - other.mesh.position.x;
                const odz = enemy.mesh.position.z - other.mesh.position.z;
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
        const isKnockedBackH = (enemy.knockbackVel.x * enemy.knockbackVel.x + enemy.knockbackVel.z * enemy.knockbackVel.z) > 0.05;

        // --- 9. STATE MACHINE ---
        if (waveDisabled) {
            enemy.awareness = 0;
            if (enemy.state !== AIState.IDLE && enemy.state !== AIState.WANDER) {
                enemy.state = AIState.IDLE;
                enemy.idleTimer = 1.0;
            }
        }
        switch (enemy.state) {
            case AIState.IDLE:
                enemy.idleTimer -= delta;
                if (seesPlayer) {
                    logStateChange(simTime, enemy, AIState.CHASE, 'VISUAL');
                    enemy.state = AIState.CHASE;
                    updateLastSeen(enemy, playerPos, simTime);
                } else if (enemy.awareness > 0) {
                    logStateChange(simTime, enemy, AIState.SEARCH, 'AWARE');
                    enemy.state = AIState.SEARCH;
                    enemy.searchTimer = 5.0;
                } else if (enemy.idleTimer <= 0) {
                    logStateChange(simTime, enemy, AIState.WANDER);
                    enemy.state = AIState.WANDER;

                    // Choose a wander target within 5 to 10 meters of spawnPos
                    const angle = Math.random() * (TWO_PI);
                    const wanderRadius = 5.0 + Math.random() * 5.0; // 5-10 meters
                    const spawnY = ground.getGroundHeight(enemy.spawnPos.x, enemy.spawnPos.z, session);
                    _v1.set(enemy.spawnPos.x + Math.cos(angle) * wanderRadius, spawnY, enemy.spawnPos.z + Math.sin(angle) * wanderRadius);
                    enemy.velocity.subVectors(_v1, enemy.mesh.position).normalize().multiplyScalar(enemy.speed * 0.5);
                    enemy.searchTimer = 2.0 + Math.random() * 3.0;
                }
                break;

            case AIState.WANDER:
                enemy.searchTimer -= delta;
                _wanderTarget.set(enemy.mesh.position.x + enemy.velocity.x * delta, enemy.mesh.position.y + enemy.velocity.y * delta, enemy.mesh.position.z + enemy.velocity.z * delta);

                // Movement Lock Guard applied ONLY to physical displacement
                if (!isTier4 && !isKnockedBackH) {
                    moveEntity(enemy, _wanderTarget, delta, enemy.speed * 0.5, streamer, ground, session, _v5, simTime, renderTime, false, isTier1, isTier2, frameOffset);
                }

                // If wandering takes us too far from spawn pos, return towards it
                const distToSpawnSq = enemy.mesh.position.distanceToSquared(enemy.spawnPos);
                if (distToSpawnSq > 144.0) { // 12m limit threshold (squared)
                    enemy.velocity.subVectors(enemy.spawnPos, enemy.mesh.position).normalize().multiplyScalar(enemy.speed * 0.5);
                }

                if (seesPlayer) {
                    logStateChange(simTime, enemy, AIState.CHASE, 'VISUAL');
                    enemy.state = AIState.CHASE;
                    updateLastSeen(enemy, playerPos, simTime);
                } else if (enemy.awareness > 0) {
                    logStateChange(simTime, enemy, AIState.SEARCH, 'AWARE');
                    enemy.state = AIState.SEARCH;
                    enemy.searchTimer = 5.0;
                } else if (enemy.searchTimer <= 0) {
                    logStateChange(simTime, enemy, AIState.IDLE);
                    enemy.state = AIState.IDLE;
                    enemy.idleTimer = 1.0 + Math.random() * 2.0;
                }
                break;

            case AIState.SEARCH:
                enemy.searchTimer -= delta;

                if (seesPlayer) {
                    logStateChange(simTime, enemy, AIState.CHASE, 'VISUAL');
                    enemy.state = AIState.CHASE;
                    updateLastSeen(enemy, playerPos, simTime);
                } else if (enemy.awareness === 1.0) {
                    enemy.searchTimer = enemy.lastHeardNoiseType !== NoiseType.NONE ? (SEARCH_TIMERS[enemy.lastHeardNoiseType] || 5.0) : 5.0;
                    enemy.awareness = 0.99;
                } else if (enemy.searchTimer <= 0) {
                    logStateChange(simTime, enemy, AIState.IDLE);
                    enemy.state = AIState.IDLE;
                    enemy.idleTimer = 1.0 + Math.random() * 2.0;
                } else {
                    const distToLastSq = enemy.mesh.position.distanceToSquared(enemy.lastKnownPosition);
                    if (distToLastSq > 4.0) { // 2.0m threshold (squared)
                        // Movement Lock Guard
                        if (!isTier4 && !isKnockedBackH) {
                            moveEntity(enemy, enemy.lastKnownPosition, delta, enemy.speed * 0.8, streamer, ground, session, _v5, simTime, renderTime, false, isTier1, isTier2, frameOffset);
                        }
                    } else {
                        // Once they reach the player's last known location, they wander locally within 4-8m of it searching
                        if (!enemy.localSearchTarget) {
                            enemy.localSearchTarget = new THREE.Vector3();
                        }

                        const timeInSec = Math.floor(simTime / 1000);
                        if (enemy.localSearchTarget.lengthSq() === 0 || (timeInSec % 3 === 0 && Math.random() > 0.7)) {
                            const angle = Math.random() * (TWO_PI);
                            const searchRad = 4.0 + Math.random() * 4.0;
                            const searchY = ground.getGroundHeight(enemy.lastKnownPosition.x, enemy.lastKnownPosition.z, session);
                            enemy.localSearchTarget.set(
                                enemy.lastKnownPosition.x + Math.cos(angle) * searchRad,
                                searchY,
                                enemy.lastKnownPosition.z + Math.sin(angle) * searchRad
                            );
                        }

                        if (!isTier4 && !isKnockedBackH) {
                            moveEntity(enemy, enemy.localSearchTarget, delta, enemy.speed * 0.6, streamer, ground, session, _v5, simTime, renderTime, false, isTier1, isTier2, frameOffset);
                        }
                        enemy.mesh.rotation.y += delta * 1.5;
                    }
                }
                break;

            case AIState.CHASE:
                if (seesPlayer) {
                    updateLastSeen(enemy, playerPos, simTime);
                } else if (enemy.isWaveEnemy && !isTethered && enemy.mesh.position.distanceToSquared(enemy.lastKnownPosition) < 100.0) {
                    // Wave enemies become hyper-aggressive and lock onto the player 
                    // once they reach their initial attractor location.
                    updateLastSeen(enemy, playerPos, simTime);
                } else if (enemy.awareness === 1.0) {
                    updateLastSeen(enemy, enemy.lastKnownPosition, simTime);
                }

                const shouldGiveUp = isTethered || (!enemy.isWaveEnemy && ((!seesPlayer && simTime - enemy.lastSeenTime > 5000) || distSq > 2500));

                if (shouldGiveUp) {
                    logStateChange(simTime, enemy, AIState.SEARCH);
                    enemy.state = AIState.SEARCH;
                    if (isTethered) {
                        enemy.lastKnownPosition.copy(enemy.spawnPos); // Walk back to event area
                    }
                    const baseTime = enemy.lastHeardNoiseType !== NoiseType.NONE ? (SEARCH_TIMERS[enemy.lastHeardNoiseType] || 5.0) : 5.0;
                    enemy.searchTimer = isTethered ? 15.0 : baseTime; // Give plenty of time to return
                }
                else {
                    if (isDead) {
                        logStateChange(simTime, enemy, AIState.SEARCH);
                        enemy.state = AIState.SEARCH;
                        enemy.searchTimer = 3.0;
                        return;
                    }

                    const target = (seesPlayer) ? playerPos : enemy.lastKnownPosition;
                    let chaseSpeed = ((enemy.statusFlags & EnemyFlags.WADING) !== 0 ? enemy.speed * 0.6 : enemy.speed);

                    // Movement Lock Guard
                    if (!isTier4 && !isKnockedBackH) {
                        moveEntity(enemy, target, delta, chaseSpeed, streamer, ground, session, _v5, simTime, renderTime, true, isTier1, isTier2, frameOffset);

                        const dx = enemy.mesh.position.x - playerPos.x;
                        const dz = enemy.mesh.position.z - playerPos.z;
                        distSq = dx * dx + dz * dz;
                    }

                    const chaseStepInterval = enemy.type === EnemyType.RUNNER ? 250 : 400;
                    if (simTime > enemy.lastStepTime + chaseStepInterval) {
                        enemy.lastStepTime = simTime;
                    }

                    if (enemy.attacks.length > 0) {
                        let bestAttackIndex = -1;
                        for (let i = 0; i < enemy.attacks.length; i++) {
                            const att = enemy.attacks[i];
                            const cooldown = enemy.attackCooldowns[att.type] || 0;
                            if (cooldown > 0) continue;

                            const rawRange = (att.type === EnemyAttackType.HIT && !att.range) ? ENEMY_ATTACK_RANGE[enemy.type] : (att.range || ENEMY_ATTACK_RANGE[enemy.type]);
                            // VINTERDÖD STABILIZATION: buffer prevents "running-in-place" stalls
                            const bufferedRangeSq = (rawRange * COMBAT.HYSTERESIS) * (rawRange * COMBAT.HYSTERESIS);

                            if (distSq < bufferedRangeSq) {
                                bestAttackIndex = i;
                                // Prioritize special attacks (Bite, Smash, etc.)
                                if (att.type !== EnemyAttackType.HIT) break;
                            }
                        }

                        if (bestAttackIndex !== -1) {
                            const att = enemy.attacks[bestAttackIndex];
                            enemy.currentAttackIndex = bestAttackIndex;
                            enemy.targetPos.copy(playerPos);
                            enemy.animStartPos.copy(enemy.mesh.position);

                            if (att.chargeTime && att.chargeTime > 0) {
                                logStateChange(simTime, enemy, AIState.ATTACK_CHARGE);
                                enemy.state = AIState.ATTACK_CHARGE;
                                enemy.attackTimer = Math.max(0.016, att.chargeTime * 0.001); // Harden: Ensure timer is non-zero (min 1 frame)
                            } else {
                                // Immediate execution for 0-charge attacks (HIT, etc.)
                                const success = EnemyAttackHandler.executeAttack(enemy, att, distSq, playerPos, streamer, callbacks, delta, simTime, renderTime);

                                // Ensure we transition to ATTACKING if executeAttack succeeded and didn't switch to a special state (like GRAPPLE)
                                if (success && enemy.state === AIState.CHASE) {
                                    logStateChange(simTime, enemy, AIState.ATTACKING);
                                    enemy.state = AIState.ATTACKING;
                                    enemy.attackTimer = Math.max(0.016, (att.activeTime || 500) * 0.001); // Harden: Min 1 frame active
                                }
                            }
                        }
                    }
                }
                break;

            case AIState.ATTACK_CHARGE:
                if (enemy.attackTimer !== -1) {
                    const att = enemy.attacks[enemy.currentAttackIndex!];

                    // Movement Lock Guard
                    if (!isTier4 && !isKnockedBackH) {
                        moveEntity(enemy, playerPos, delta, enemy.speed * 0.25, streamer, ground, session, _v5, simTime, renderTime, true, isTier1, isTier2, frameOffset);

                        const dx = enemy.mesh.position.x - playerPos.x;
                        const dz = enemy.mesh.position.z - playerPos.z;
                        distSq = dx * dx + dz * dz;
                    }

                    if (enemy.attackTimer <= 0) {
                        // State-Guard for charge-finish
                        const prevState = enemy.state;
                        const success = EnemyAttackHandler.executeAttack(enemy, att, distSq, playerPos, streamer, callbacks, delta, simTime, renderTime);

                        if (success && enemy.state === prevState) {
                            logStateChange(simTime, enemy, AIState.ATTACKING);
                            enemy.state = AIState.ATTACKING;
                            enemy.attackTimer = Math.max(0.016, (att.activeTime || 100) * 0.001); // Harden: Min 1 frame active
                        } else if (!success && enemy.state === prevState) {
                            // If attack failed (out of range?), go back to chase
                            logStateChange(simTime, enemy, AIState.CHASE, 'ATTACK_FAILED_RANGE');
                            enemy.state = AIState.CHASE;
                        }
                    }
                }
                break;

            case AIState.ATTACKING:
                if (enemy.attackTimer !== -1) {
                    const att = enemy.attacks[enemy.currentAttackIndex!];

                    // Movement Lock Guard
                    if (!isTier4 && !isKnockedBackH) {
                        moveEntity(enemy, playerPos, delta, enemy.speed * 0.15, streamer, ground, session, _v5, simTime, renderTime, true, isTier1, isTier2, frameOffset);

                        const dx = enemy.mesh.position.x - playerPos.x;
                        const dz = enemy.mesh.position.z - playerPos.z;
                        distSq = dx * dx + dz * dz;
                    }

                    if (att && att.activeTime) {
                        EnemyAttackHandler.updateContinuousAttack(enemy, att, playerPos, callbacks, delta, simTime, renderTime);
                    }

                    if (enemy.attackTimer <= 0) {
                        if (att && att.type === EnemyAttackType.JUMP) {
                            if (distSq < (att.range || 6) * (att.range || 6)) {
                                callbacks.handlePlayerHit(att.damage, enemy, DamageType.PHYSICAL, DamageID.PHYSICAL, false, att.effect, att.effectDuration, att.effectDamage, att.type);
                                if (enemy.type === EnemyType.RUNNER) {
                                    logStateChange(simTime, enemy, AIState.GRAPPLE, 'JUMP_LANDED');
                                    enemy.state = AIState.GRAPPLE;
                                    enemy.statusFlags |= EnemyFlags.GRAPPLING;
                                    enemy.grappleDuration = 1.5 + Math.random() * 0.5;
                                    enemy.attackTimer = -1; // Yield control to Grapple system
                                    enemy.attackCooldowns[att.type] = att.cooldown;
                                    break;
                                }
                            }
                        }

                        logStateChange(simTime, enemy, AIState.CHASE, 'VISUAL');
                        enemy.state = AIState.CHASE;
                    }
                }
                break;

            case AIState.GRAPPLE:
                // Advanced attachment & Inertia-driven Pendulum
                enemy.grappleDuration -= delta;

                // 1. Break Check (Rush = 1<<4, Dodge = 1<<8)
                const isRushing = (playerStatusFlags & 16) !== 0;
                const isDodging = (playerStatusFlags & 256) !== 0;

                if (isRushing || isDodging || enemy.grappleDuration <= 0 || isDead) {
                    const reason = isRushing ? 'STRUGGLED_FREE' : (isDodging ? 'DODGED_FREE' : (isDead ? 'DIED' : 'TIMEOUT'));
                    logStateChange(simTime, enemy, AIState.CHASE, reason);

                    enemy.state = AIState.CHASE;
                    enemy.statusFlags &= ~EnemyFlags.GRAPPLING;
                    enemy.grappleDuration = 0;
                    enemy.attackCooldowns[EnemyAttackType.BITE] = 3000;
                    enemy.mesh.rotation.x = 0;
                    _v1.copy(enemy.mesh.position);
                    _v2.copy(enemy.prevP);
                    enemy.prevP.copy(_v1);
                    enemy.prevP.set(0, -1000, 0); // Reset inertia marker
                    break;
                }

                // 2. High-Fidelity Physics (Zero-GC Pendulum)
                // Pivot point: Neck Region (playerPos + 1.6 height)
                const neckHeight = 1.6;
                const orbitDist = enemy.attackOffset;

                // Track player displacement for inertia
                const prevP = enemy.prevP;

                // Check for reset marker (y = -1000) to prevent first-frame physics explosion
                if (prevP.y < -500) {
                    prevP.copy(playerPos);
                    _v1.set(0, 0, 0);
                } else {
                    _v1.subVectors(playerPos, prevP); // _v1 = frame displacement
                    prevP.copy(playerPos);
                }

                // Pivot direction (Horizontal plane)
                _v2.subVectors(enemy.mesh.position, playerPos);
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
                if (isNaN(enemy.swingX)) enemy.swingX = 0;
                if (isNaN(enemy.swingZ)) enemy.swingZ = 0;

                enemy.swingX = THREE.MathUtils.lerp(enemy.swingX, targetTilt, 5.0 * delta);
                enemy.swingZ = THREE.MathUtils.lerp(enemy.swingZ, targetSwing, 5.0 * delta);

                // 3. Final Mesh Transform
                enemy.mesh.position.set(_v3.x, playerPos.y + neckHeight, _v3.z);

                // Rotation: Look at player (Y-axis facing)
                // Note: X and Z tilt is handled by EnemyAnimator.updateAttackAnim using swingX/Z
                enemy.mesh.rotation.y = Math.atan2(playerPos.x - enemy.mesh.position.x, playerPos.z - enemy.mesh.position.z);

                // Vertical offset so zombie head is at pivot point
                enemy.mesh.position.y -= (enemy.originalScale * 0.82);

                // FINAL SAFETY: Clamp Y to ground to prevent "disappearing" below floor
                if (enemy.mesh.position.y < -0.5) enemy.mesh.position.y = 0.1;

                // 4. Periodic Damage & Visuals
                if (simTime > (enemy.lastGrappleDmg || 0) + 600) {
                    enemy.lastGrappleDmg = simTime;
                    callbacks.handlePlayerHit(4, enemy, DamageType.PHYSICAL, DamageID.BITE, true, undefined, undefined, undefined, EnemyAttackType.GRAPPLE_BITE);

                    if (callbacks.spawnParticle) {
                        // Improved blood feedback for grapple
                        callbacks.spawnParticle(playerPos.x, 1.5, playerPos.z, FXParticleType.BLOOD_SPLATTER, 6);
                    }
                }
                break;
        }

        // --- 10. PROCEDURAL ANIMATION ---
        EnemyAnimator.updateAttackAnim(enemy, renderTime, delta);
    }
};

// --- HELPERS ---
function moveEntity(e: Enemy, target: THREE.Vector3, delta: number, speed: number, streamer: WorldStreamer, ground: any, session: any, sepForce: THREE.Vector3, simTime: number, renderTime: number, isChasing: boolean, isTier1: boolean, isTier2: boolean, frameOffset: number) {
    // 1. NAVIGATION: Get desired steering vector from FlowField (only when actively chasing the player)
    if (isChasing) {
        NavigationSystem.getFlowVector(e.mesh.position.x, e.mesh.position.z, _v1);
    } else {
        _v1.set(0, 0, 0);
    }

    // Fallback to straight-line to target if outside flow grid, target reached, or not chasing
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

    // --- PLAYER COLLISION RESOLUTION (Soft Shove Parity) ---
    if (session && session.state && session.state.player) {
        const playerPos = session.state.player.position;
        const pdx = _v4.x - playerPos.x;
        const pdz = _v4.z - playerPos.z;
        const pDistSq = pdx * pdx + pdz * pdz;
        if (pDistSq < PHYSICS.SOFT_SHOVE_RADIUS_SQ && pDistSq > 0.0001) {
            const overlap = (PHYSICS.SOFT_SHOVE_RADIUS_SQ - pDistSq) * PHYSICS.SOFT_SHOVE_FORCE;
            const pDist = Math.sqrt(pDistSq);
            _v4.x += (pdx / pDist) * overlap;
            _v4.z += (pdz / pDist) * overlap;
        }
    }

    // 6. COLLISION RESOLUTION: Harden path against world obstacles
    // Throttle queries: only re-query spatial grid if enemy moved >0.5m (0.25m^2)
    const dqx = _v4.x - e.lastObsQueryPos.x;
    const dqz = _v4.z - e.lastObsQueryPos.z;
    if (dqx * dqx + dqz * dqz > 0.25 || e.lastObsQueryPos.y < -500) {
        const obsPool = streamer.getObstaclePool();
        const poolIdx = obsPool.nextIndex();
        streamer.getNearbyObstacles(_v4.x, _v4.z, 12.0, poolIdx);

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
            if (callbacks.handleEnemyHit) callbacks.handleEnemyHit(e, dmg, DamageType.BURN, e.burnSource || DamageID.BURN, false);
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
