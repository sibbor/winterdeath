import * as THREE from 'three';
import { WinterEngine } from '../../core/engine/WinterEngine';
import {
    Enemy,
    AIState,
    EnemyEffectType,
    EnemyDeathState,
    EnemyType,
    SEARCH_TIMERS,
    EnemyFlags,
    ENEMY_ATTACK_RANGE
} from '../../entities/enemies/EnemyTypes';
import { DamageID, EnemyAttackType } from '../../entities/player/CombatTypes';
import { EnemyAttackHandler } from './EnemyAttackHandler';
import { SpatialGrid } from '../../core/world/SpatialGrid';
import { WEAPONS } from '../../content/weapons';
import { haptic } from '../../utils/HapticManager';
import { WeaponSounds } from '../../utils/audio/AudioLib';
import { WaterSystem, _buoyancyResult } from '../../systems/WaterSystem';
import { PerformanceMonitor } from '../../systems/PerformanceMonitor';
import { EnemyAnimator } from './EnemyAnimator';
import { NoiseType } from '../../entities/enemies/EnemyTypes';
import { SoundID } from '../../utils/audio/AudioTypes';
import { DataResolver } from '../../utils/ui/DataResolver';
import { NavigationSystem } from '../../systems/NavigationSystem';
import { applyCollisionResolution } from '../../core/world/CollisionResolution';

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

export const logStateChange = (simTime: number, e: Enemy, newState: AIState, reason?: string) => {
    if (!PerformanceMonitor.getInstance().aiLoggingEnabled) return;
    const typeName = DataResolver.getEnemyName(e.type, e.bossId, true);
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
        collisionGrid: SpatialGrid,
        isDead: boolean,
        callbacks: {
            onPlayerHit: (damage: number, attacker: any, type: DamageID, isDoT?: boolean, effect?: any, duration?: number, intensity?: number, attackName?: string) => void;
            applyDamage: (enemy: Enemy, amount: number, type: DamageID, isHighImpact?: boolean) => void;
            onEffectTick: (e: Enemy, type: EnemyEffectType) => void;
            playSound: (id: SoundID) => void;
            spawnBubble: (text: string, duration: number) => void;
            spawnParticle: (x: number, y: number, z: number, type: string, count: number, mesh?: THREE.Object3D, vel?: THREE.Vector3, color?: number, scale?: number) => void;
            queryEnemies?: (pos: THREE.Vector3, radius: number) => Enemy[];
        },
        water: WaterSystem | null,
        delta: number,
        simTime: number,
        renderTime: number
    ) => {
        const distSq = e.mesh.position.distanceToSquared(playerPos);
        const radius = e.originalScale * 0.5;

        if (e.deathState === EnemyDeathState.DEAD || !e.mesh) return;

        // --- 0. DISTANCE CULLING (AI SLEEP) ---
        const dx = playerPos.x - e.mesh.position.x;
        const dz = playerPos.z - e.mesh.position.z;

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
                callbacks.playSound(SoundID.ZOMBIE_DEATH_BURN);
            }
            else if (dmgType === DamageID.GRENADE || e.type === EnemyType.BOMBER || (e.statusFlags & EnemyFlags.BOSS) !== 0) {
                e.deathState = EnemyDeathState.EXPLODED;
                if (dmgType !== DamageID.GRENADE) {
                    const pos = e.mesh.position;
                    WeaponSounds.playExplosion(pos);
                    haptic.explosion();

                    // VINTERDÖD: Bomber Death Detonation (Chain Reaction)
                    if (e.type === EnemyType.BOMBER && callbacks.queryEnemies && callbacks.applyDamage) {
                        const radius = 10.0;
                        const damage = 60.0;
                        const nearby = callbacks.queryEnemies(pos, radius + 3.0);
                        const nLen = nearby.length;
                        const radSq = radius * radius;

                        for (let i = 0; i < nLen; i++) {
                            const other = nearby[i];
                            if (other === e || other.hp <= 0) continue;

                            _v1.subVectors(other.mesh.position, pos);
                            const dSq = _v1.lengthSq();
                            const totalRad = radius + (other.originalScale * 0.5);

                            if (dSq < totalRad * totalRad) {
                                callbacks.applyDamage(other, damage, DamageID.EXPLOSION, true);

                                // Apply knockback
                                const force = 25.0 * (1.0 - Math.min(1.0, dSq / radSq));
                                const mass = other.originalScale * other.widthScale;
                                _v2.copy(_v1).normalize().multiplyScalar(force / mass).setY(2.0);
                                other.knockbackVel.add(_v2);
                            }
                        }
                    }

                    // VINTERDÖD: Hit-stop for Bomber/Boss detonations
                    WinterEngine.getInstance()?.triggerHitStop(e.type === EnemyType.BOMBER ? 40 : 50);
                }
            }
            else if (weaponImpact === EnemyDeathState.GIBBED && (isHighImpact || (playerStatusFlags & (1 << 11)) !== 0)) {
                e.deathState = EnemyDeathState.GIBBED;
                e.statusFlags |= EnemyFlags.GIBBED;
                callbacks.playSound(SoundID.ZOMBIE_DEATH_SHOT);
            }
            else if (weapon) {
                e.deathState = EnemyDeathState.SHOT;
                callbacks.playSound(SoundID.ZOMBIE_DEATH_SHOT);
                _v1.subVectors(e.mesh.position, playerPos).normalize();
                _v2.copy(_v1).negate();

                const forwardMomentum = e.velocity.dot(_v2);
                e.fallForward = forwardMomentum > 1.5;
                e.deathVel.copy(e.velocity).multiplyScalar(0.1);

                const impactForce = weapon.damage * 0.15;
                e.deathVel.addScaledVector(_v1, impactForce).setY(weapon.damage > 20 ? 3.5 : 2.0);
            }
            else {
                e.deathState = EnemyDeathState.GENERIC;
                callbacks.playSound(SoundID.ZOMBIE_DEATH_SHOT);
                _v1.subVectors(e.mesh.position, playerPos).normalize();
                _v2.copy(_v1).negate();

                const forwardMomentum = e.velocity.dot(_v2);
                e.fallForward = forwardMomentum > 1.5;
                e.deathVel.copy(_v1).multiplyScalar(8.0).setY(3.0);
            }

            // VINTERDÖD: Heavy Kill Hit-stop for Tanks
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

            // --- Snappy, heavy gravity ---
            e.knockbackVel.y -= 50 * delta;

            // --- Friction (Horizontal only) ---
            const mass = e.originalScale * e.widthScale;
            // VINTERDÖD: Increase friction significantly if ragdolling on ground to prevent "ice-skating"
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
                const fallHeight = peakY - floorY;
                if ((!water || !_buoyancyResult.inWater) && fallHeight > 0.5) {
                    // VINTERDÖD: Quadratic fall damage for high-impact RUSH feel
                    const fallRatio = fallHeight;
                    const fallDamage = Math.min(e.maxHp * 0.95, fallRatio * fallRatio * 15);

                    e.hp -= fallDamage;
                    callbacks.applyDamage(e, fallDamage, DamageID.FALL, true);

                    // High Fall Landing Stun (Stay Down)
                    if (fallHeight > 2.5) {
                        e.stunDuration = Math.max(e.stunDuration, 2.0);
                        if (callbacks.playSound) callbacks.playSound(SoundID.IMPACT_METAL);
                    }

                    if (callbacks.spawnParticle) {
                        callbacks.spawnParticle(e.mesh.position.x, 0.5, e.mesh.position.z, 'blood_splatter', Math.floor(fallHeight * 4));
                    }

                    if (e.hp <= 0 && e.deathState === EnemyDeathState.ALIVE) {
                        e.deathState = EnemyDeathState.FALL;
                    }
                }

                // --- VINTERDÖD: Stay Down Mechanic ---
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
                callbacks.spawnParticle(e.mesh.position.x, _buoyancyResult.waterLevel, e.mesh.position.z, 'splash', 4);

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

        // VINTERDÖD FIX: Decoupled Attack & Ability timers (Standardized to seconds)
        if (e.attackTimer > 0) e.attackTimer = Math.max(0, e.attackTimer - delta);
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
                // VINTERDÖD: Immediate interruption of all attacks on stun start
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

        _v6.set(0, 0, 0);

        let shouldCheckSeparation = isTier1;
        if (isTier2) shouldCheckSeparation = (frameOffset % 5 === 0);
        if (isTier3) shouldCheckSeparation = false;

        if (shouldCheckSeparation && e.state !== AIState.ATTACK_CHARGE && e.state !== AIState.ATTACKING && e.state !== AIState.GRAPPLE) {
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
                                // VINTERDÖD: State-Guard to prevent GRAPPLE being overwritten
                                const prevState = e.state;
                                EnemyAttackHandler.executeAttack(e, att, distSq, playerPos, callbacks, delta, simTime, renderTime);

                                if (e.state === prevState) {
                                    logStateChange(simTime, e, AIState.ATTACKING);
                                    e.state = AIState.ATTACKING;
                                    e.attackTimer = (att.activeTime || 500) * 0.001;
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
                        moveEntity(e, playerPos, delta, e.speed * 0.25, collisionGrid, _v6, simTime, renderTime, true, isTier1, isTier2, frameOffset);
                    }

                    if (e.attackTimer <= 0) {
                        // VINTERDÖD: State-Guard for charge-finish
                        const prevState = e.state;
                        EnemyAttackHandler.executeAttack(e, att, distSq, playerPos, callbacks, delta, simTime, renderTime);

                        if (e.state === prevState) {
                            logStateChange(simTime, e, AIState.ATTACKING);
                            e.state = AIState.ATTACKING;
                            e.attackTimer = (att.activeTime || 100) * 0.001;
                        }
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

            case AIState.GRAPPLE:
                // VINTERDÖD: Advanced attachment & Inertia-driven Pendulum
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

                // VINTERDÖD FIX: Check for reset marker (y = -1000) to prevent first-frame physics explosion
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
                    callbacks.onPlayerHit(4, e, DamageID.BITE, true, undefined, undefined, undefined, 'GRAPPLE_BITE');

                    if (callbacks.spawnParticle) {
                        // VINTERDÖD: Improved blood feedback for grapple
                        callbacks.spawnParticle(playerPos.x, 1.5, playerPos.z, 'blood_splatter', 6);
                    }
                }
                break;
        }

        // --- 10. PROCEDURAL ANIMATION ---
        EnemyAnimator.updateAttackAnim(e, renderTime, delta);
    }
};

// --- HELPERS ---
function moveEntity(e: Enemy, target: THREE.Vector3, delta: number, speed: number, collisionGrid: SpatialGrid, sepForce: THREE.Vector3, simTime: number, renderTime: number, isChasing: boolean, isTier1: boolean, isTier2: boolean, frameOffset: number) {
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

    // 2. STATUS EFFECTS: Apply Slows (50% reduction)
    if (e.slowDuration > 0 || (e.statusFlags & EnemyFlags.SLOWED) !== 0) {
        speed *= 0.5;
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
    // Use Tier-based distance to optimize collision query
    // TODO: accept a "scratchpad-array" as an argument
    // (ex: collisionGrid.getNearbyObstacles(_v4, 4.0, _reusableArray))
    const nearbyObs = collisionGrid.getNearbyObstacles(_v4, 4.0);
    const rad = (e.originalScale || 1.0) * (e.widthScale || 1.0) * 0.5;
    for (let i = 0; i < nearbyObs.length; i++) {
        applyCollisionResolution(_v4, rad, nearbyObs[i]);
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
        _v4.y = (1.0 * (e.originalScale || 1.0)) + bounceOffset;
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