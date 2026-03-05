import * as THREE from 'three';
import { Enemy, AIState, EnemyEffectType } from '../../types/enemy';
import { applyCollisionResolution } from '../world/CollisionResolution';
import { SpatialGrid } from '../world/SpatialGrid';
import { WeaponType, WEAPONS } from '../../content/weapons';
import { haptic } from '../../utils/HapticManager';
import { soundManager } from '../../utils/sound';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3();
const _v6 = new THREE.Vector3();
const _white = new THREE.Color(0xffffff);
const _flashColor = new THREE.Color();

/**
 * EnemyAI System
 * Handles behavioral logic, mass-based physics, and context-sensitive death transitions.
 */
export const EnemyAI = {
    updateEnemy: (
        e: Enemy,
        now: number,
        delta: number,
        playerPos: THREE.Vector3,
        collisionGrid: SpatialGrid,
        noiseEvents: any[],
        shakeIntensity: number,
        callbacks: {
            onPlayerHit: (damage: number, attacker: any, type: string) => void;
            onDamageDealt: (amount: number, enemy: Enemy) => void;
            onDeath: (e: Enemy, type: string) => void;
            onEffectTick: (e: Enemy, type: EnemyEffectType) => void;
            playSound: (id: string) => void;
            spawnBubble: (text: string, duration: number) => void;
        }
    ) => {
        if (e.deathState === 'DEAD' || !e.mesh) return;

        // --- 1. HANDLE INITIAL DEATH TRIGGER ---
        if (e.hp <= 0 && e.deathState === 'ALIVE') {
            e.deathTimer = now;

            // BUG FIX: RESET FLASH/SCALE STATES BEFORE HANDOFF
            // Prevent enemies from freezing in their "damage flash" (white and scaled up) 
            // when handing them over to the DeathSystem.
            const baseScale = e.originalScale || 1.0;
            const widthScale = e.widthScale || 1.0;
            e.mesh.scale.set(baseScale * widthScale, baseScale, baseScale * widthScale);

            // Safely reset color if it was flashed white.
            // e.mesh is typically a THREE.Group, so we iterate through its children (zero-GC)
            if (e.color !== undefined) {
                for (let i = 0; i < e.mesh.children.length; i++) {
                    const child = e.mesh.children[i] as any;
                    if (child.isMesh && child.material && child.material.color) {
                        child.material.color.setHex(e.color);
                    }
                }
            }

            const dmgType = e.lastDamageType || '';
            const isHighImpact = e.lastHitWasHighImpact;
            const fallForward = Math.random() > 0.5;

            // Data-driven death states from Weapon Metadata
            const weapon = WEAPONS[dmgType];

            // Normalize weapon impact type (Zero-GC, avoiding .toUpperCase() string allocations)
            let weaponImpact = 'SHOT';
            if (weapon && weapon.impactType) {
                // Cast to string to bypass TypeScript's strict union overlap check
                const rawImpact = weapon.impactType as string;
                if (rawImpact === 'gib' || rawImpact === 'GIB' || rawImpact === 'GIBBED') weaponImpact = 'GIBBED';
                else if (rawImpact === 'burning' || rawImpact === 'BURNING' || rawImpact === 'BURNED') weaponImpact = 'BURNED';
                else if (rawImpact === 'electrified' || rawImpact === 'ELECTRIFIED') weaponImpact = 'ELECTRIFIED';
            }

            // 1. Electrocution Deaths (Arc-Cannon) - Highest Priority
            if (weaponImpact === 'ELECTRIFIED' || dmgType === WeaponType.ARC_CANNON) {
                e.deathState = 'ELECTRIFIED';
                e.deathVel.set(0, 0, 0); // Kill all momentum so they stiffen and fall flat
            }
            // 2. Fire Deaths (Molotov, Flamethrower, or dying while actively on fire)
            // Priority: Fire takes precedence over self-destruction for regular enemies (e.g. Bombers)
            else if (e.isBurning || dmgType === WeaponType.MOLOTOV || dmgType === WeaponType.FLAMETHROWER || dmgType === 'BURN') {
                e.deathState = 'BURNED';
            }
            // 3. Explosions (Grenades, Bombers, Bosses)
            else if (dmgType === WeaponType.GRENADE || e.type === 'BOMBER' || e.isBoss) {
                e.deathState = 'EXPLODED';
                if (dmgType !== WeaponType.GRENADE) {
                    soundManager.playExplosion();
                    haptic.explosion();
                }
            }
            // 4. High-Impact Gibbing (Shotgun/Revolver at close range)
            else if (weaponImpact === 'GIBBED' && isHighImpact) {
                e.deathState = 'GIBBED';
                e.mesh.userData.gibbed = true;
            }
            // 5. Standard Weapon Shots (SMG, Rifle, Pistol)
            else if (weapon) {
                e.deathState = 'SHOT';

                if (e.deathVel) {
                    _v1.subVectors(e.mesh.position, playerPos).normalize();

                    // How fast was the zombie running straight at us? (Dot product)
                    const forwardMomentum = e.velocity.dot(_v1.clone().negate());

                    // If they ran fast towards us (> 1.5 m/s), they stumble forward!
                    e.fallForward = forwardMomentum > 1.5;

                    // Hard brake their run speed (legs die) and apply shot force
                    e.deathVel.copy(e.velocity).multiplyScalar(0.1);
                    const impactForce = weapon.damage * 0.15;

                    // Pop them up slightly for some hang time
                    e.deathVel.addScaledVector(_v1, impactForce).setY(weapon.damage > 20 ? 3.5 : 2.0);
                }

                e.mesh.userData.spinDir = (Math.random() - 0.5) * 5.0;
            }
            // 6. Default generic death (Melee, Vehicle ram, etc)
            else {
                e.deathState = 'GENERIC';
                if (e.deathVel) {
                    _v1.subVectors(e.mesh.position, playerPos).normalize();
                    const forwardMomentum = e.velocity.dot(_v1.clone().negate());
                    e.fallForward = forwardMomentum > 1.5;

                    e.deathVel.copy(_v1).multiplyScalar(8.0).setY(3.0);
                }
                e.mesh.userData.spinDir = (Math.random() - 0.5) * 6.0;
            }
        }

        // --- 2. HANDLE DEATH ANIMATIONS ---
        if (e.deathState !== 'ALIVE') {
            handleDeathAnimation(e, delta, now, callbacks);
            return; // Hand over to DeathSystem, AI loop stops here
        }

        // --- 3. POOLING SCALE RECOVERY ---
        const targetScaleY = e.originalScale || 1.0;
        if (Math.abs(e.mesh.scale.y - targetScaleY) > 0.05) {
            const w = e.widthScale || 1.0;
            e.mesh.scale.set(targetScaleY * w, targetScaleY, targetScaleY * w);
            e.mesh.visible = true;
        }

        // --- 4. STATUS EFFECTS ---
        handleStatusEffects(e, delta, now, callbacks);

        // --- 5. MASS-BASED KNOCKBACK PHYSICS ---
        // This must run BEFORE the stun return so ragdolling enemies actually fly backwards
        if (e.knockbackVel && e.knockbackVel.lengthSq() > 0.01) {
            const mass = (e.originalScale || 1.0) * (e.widthScale || 1.0);
            const moveInertia = delta / Math.max(0.5, mass);

            e.mesh.position.addScaledVector(e.knockbackVel, moveInertia);
            e.knockbackVel.y -= 50 * delta;

            const friction = 1.0 + (mass * 2.0);
            e.knockbackVel.multiplyScalar(Math.max(0, 1 - friction * delta));

            if (e.mesh.position.y <= 0) {
                e.mesh.position.y = 0;
                e.knockbackVel.set(0, 0, 0);
            }
        }

        // --- 6. STUNS & RAGDOLLS (Early Returns) ---
        if (e.stunTimer && e.stunTimer > 0) {
            e.stunTimer -= delta;

            // --- RAGDOLL PHYSICS ---
            if (e.mesh.userData.isRagdolling && e.mesh.userData.spinVel) {
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
                // --- STANDARD STUN (Twitch) ---
                if (e.mesh.userData.baseY === undefined) e.mesh.userData.baseY = e.mesh.position.y;
                const twitchX = (Math.random() - 0.5) * 0.2;
                const twitchZ = (Math.random() - 0.5) * 0.2;
                e.mesh.position.x += twitchX;
                e.mesh.position.z += twitchZ;
                e.mesh.rotation.y += (Math.random() - 0.5) * 0.5;
            }

            if (Math.random() < 0.1) {
                callbacks.onEffectTick(e, 'STUN');
            }

            if (e.stunTimer <= 0) {
                e.state = AIState.CHASE;
                e.mesh.userData.isRagdolling = false;
                e.mesh.rotation.x = 0;
                e.mesh.rotation.z = 0;
                e.mesh.quaternion.setFromEuler(e.mesh.rotation);
            }
            return;
        }

        if (e.blindTimer && e.blindTimer > 0) { e.blindTimer -= delta; return; }

        // --- 7. SENSORS & SEPARATION ---
        const dx = playerPos.x - e.mesh.position.x;
        const dz = playerPos.z - e.mesh.position.z;
        const distSq = dx * dx + dz * dz;
        const canSeePlayer = distSq < 900;

        _v6.set(0, 0, 0);
        const separationRadiusSq = 1.0;
        const nearbyEnemies = collisionGrid.getNearbyEnemies(e.mesh.position, 1.5);

        let other: Enemy, odx: number, odz: number, odSq: number, od: number;
        for (let i = 0; i < nearbyEnemies.length; i++) {
            other = nearbyEnemies[i];
            if (other === e || other.deathState !== 'ALIVE') continue;

            odx = e.mesh.position.x - other.mesh.position.x;
            odz = e.mesh.position.z - other.mesh.position.z;
            odSq = odx * odx + odz * odz;

            if (odSq < separationRadiusSq && odSq > 0.001) {
                od = Math.sqrt(odSq);
                _v6.x += (odx / od) / od;
                _v6.z += (odz / od) / od;
            }
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

        // --- 8. STATE MACHINE ---
        switch (e.state) {
            case AIState.IDLE:
                e.idleTimer -= delta;
                if (canSeePlayer) {
                    e.state = AIState.CHASE;
                    updateLastSeen(e, playerPos, now);
                } else if (heardNoise && noisePos) {
                    e.state = AIState.CHASE;
                    updateLastSeen(e, noisePos, now);
                } else if (e.idleTimer <= 0) {
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
                    e.state = AIState.CHASE;
                    updateLastSeen(e, playerPos, now);
                } else if (heardNoise && noisePos) {
                    e.state = AIState.CHASE;
                    updateLastSeen(e, noisePos, now);
                } else if (e.searchTimer <= 0) {
                    e.state = AIState.IDLE; e.idleTimer = 1.0 + Math.random() * 2.0;
                }

                const wanderStepInterval = 1200;
                if (now > (e.lastStepTime || 0) + wanderStepInterval) {
                    e.lastStepTime = now;
                }
                break;

            case AIState.CHASE:
                // Om vi ser spelaren, sikta direkt på dem.
                // Om vi inte ser dem men HÖR dem, uppdatera målet till ljudkällan så vi fortsätter springa!
                if (canSeePlayer) {
                    updateLastSeen(e, playerPos, now);
                } else if (heardNoise && noisePos) {
                    updateLastSeen(e, noisePos, now);
                }

                // Om vi tappat bort spelaren/ljudet för mer än 5 sekunder sedan -> Börja leta.
                if ((!canSeePlayer && now - (e.lastSeenTime || 0) > 5000) || distSq > 2500) {
                    e.state = AIState.SEARCH;
                    e.searchTimer = 5.0;
                }
                else {
                    const target = canSeePlayer ? playerPos : e.lastSeenPos!;
                    if (e.type === 'BOMBER' && distSq < 12.0) {
                        e.state = AIState.EXPLODING;
                        e.explosionTimer = 1.5;
                        return;
                    }

                    moveEntity(e, target, delta, e.speed, collisionGrid, _v6);

                    const chaseStepInterval = e.type === 'RUNNER' ? 250 : 400;
                    if (now > (e.lastStepTime || 0) + chaseStepInterval) {
                        e.lastStepTime = now;
                    }

                    const attackRangeSq = e.type === 'TANK' ? 9.0 : 4.5;
                    if (distSq < attackRangeSq && e.attackCooldown <= 0) {
                        if (e.type === 'TANK') {
                            e.attackCooldown = 3000;
                            callbacks.onPlayerHit(e.damage, e, 'TANK_SMASH');
                        } else {
                            e.state = AIState.BITING;
                            e.grappleTimer = 2.0;
                            e.attackCooldown = 2000;

                            if (e.mesh) {
                                e.mesh.userData.biteAngle = Math.atan2(e.mesh.position.x - playerPos.x, e.mesh.position.z - playerPos.z);
                            }
                        }
                    }
                }
                break;

            case AIState.BITING:
                e.grappleTimer -= delta * (shakeIntensity > 1.0 ? 6.0 : 1.0);

                const biteAngle = e.mesh.userData.biteAngle || 0;
                const grappleDist = 1.2;

                e.mesh.position.x = playerPos.x + Math.sin(biteAngle) * grappleDist;
                e.mesh.position.z = playerPos.z + Math.cos(biteAngle) * grappleDist;

                _v5.set(playerPos.x, e.mesh.position.y, playerPos.z);
                e.mesh.lookAt(_v5);

                if (now % 500 < 30) {
                    callbacks.onPlayerHit(e.damage * 0.2, e, 'BITING');
                    callbacks.playSound('impact_flesh');
                }

                if (e.grappleTimer <= 0) {
                    e.state = AIState.CHASE;
                    e.attackCooldown = 1000;

                    _v1.subVectors(e.mesh.position, playerPos).normalize().multiplyScalar(2.5);
                    if (!e.knockbackVel) e.knockbackVel = new THREE.Vector3();
                    e.knockbackVel.copy(_v1);
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

                if (e.indicatorRing) {
                    e.indicatorRing.visible = true;

                    // [VINTERDÖD FIX] Ringen är ett barn till zombien. Eftersom zombien studsar UPP 
                    // i luften, måste vi flytta ringen NER exakt lika mycket lokalt så den slickar golvet.
                    e.indicatorRing.position.set(0, -e.mesh.position.y + 0.05, 0);

                    // Reversera zombiens 'breatheScale' så inte varningsringen svajar i storlek
                    const targetRadius = 12.0 + Math.sin(now * 0.01) * 1.0;
                    e.indicatorRing.scale.setScalar(targetRadius / breatheScale);

                    const flashSpeed = (1.6 - e.explosionTimer) * 30;
                    const pulse = 0.5 + 0.5 * Math.sin(now * 0.01 * flashSpeed);

                    if (e.indicatorRing.material) {
                        const mat = e.indicatorRing.material as any;
                        // Vi har nu garanterat att mat är clone:ad och transparent
                        mat.opacity = 0.3 + (1.0 - (e.explosionTimer / 1.5)) * 0.6;
                        mat.color.setHex(pulse > 0.5 ? 0xffffff : 0xff0000);
                    }
                }

                if (e.explosionTimer <= 0) {
                    if (e.mesh.position.distanceToSquared(playerPos) < 144.0) {
                        callbacks.onPlayerHit(60, e, 'BOMBER_EXPLOSION');
                    }
                    e.hp = 0;
                    e.deathState = 'EXPLODED';
                    e.deathVel.set(0, 10.0, 0);

                    soundManager.playExplosion();
                    haptic.explosion();
                }
                break;

            case AIState.SEARCH:
                e.searchTimer -= delta;
                if (e.lastSeenPos && e.mesh.position.distanceToSquared(e.lastSeenPos) > 1.5) {
                    moveEntity(e, e.lastSeenPos, delta, e.speed * 0.8, collisionGrid, _v6);
                } else {
                    e.mesh.rotation.y += delta * 2.5;
                }

                // Om vi hittar ett nytt spår, kasta oss in i CHASE!
                if (canSeePlayer) {
                    e.state = AIState.CHASE;
                    updateLastSeen(e, playerPos, now);
                } else if (heardNoise && noisePos) {
                    e.state = AIState.CHASE;
                    updateLastSeen(e, noisePos, now);
                } else if (e.searchTimer <= 0) {
                    e.state = AIState.IDLE;
                }
                break;
        }

        // --- 9. FINAL UPDATES ---
        if (e.attackCooldown > 0) e.attackCooldown -= delta * 1000;

        // Hit Flash Logic (For Bosses/Non-instanced)
        if (e.isBoss && e.mesh && e.color !== undefined) {
            const timeSinceHit = now - e.hitTime;
            if (timeSinceHit < 100) {
                const isArc = e.lastDamageType === WeaponType.ARC_CANNON;
                e.mesh.traverse((child: any) => {
                    if (child.isMesh && child.material && child.material.color) {
                        if (isArc) _flashColor.set(0x00ffff).lerp(_white, 0.4);
                        else _flashColor.set(0xffffff);
                        child.material.color.copy(_flashColor);
                    }
                });
            } else {
                e.mesh.traverse((child: any) => {
                    if (child.isMesh && child.material && child.material.color) {
                        child.material.color.setHex(e.color);
                    }
                });
            }
        }

        if (e.slowTimer > 0) e.slowTimer -= delta;

        if (e.mesh.userData.baseY === undefined) e.mesh.userData.baseY = e.mesh.position.y;
        e.mesh.position.y = e.mesh.userData.baseY + Math.abs(Math.sin(now * (e.state === AIState.CHASE ? 0.018 : 0.009))) * 0.12;
    },
};

// --- HELPERS ---

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
        if (Math.random() > 0.4) {
            callbacks.onEffectTick(e, 'FLAME');
        }
        if (e.burnTimer > 0) {
            e.burnTimer -= delta;
            if (e.burnTimer <= 0) { e.hp -= 6; e.lastDamageType = 'BURN'; callbacks.onDamageDealt(6, e); e.burnTimer = 0.5; }
        }
        if (e.afterburnTimer > 0) {
            e.afterburnTimer -= delta;
            if (e.afterburnTimer <= 0) e.isBurning = false;
        }
    }

    if (e.stunTimer > 0 && e.lastDamageType === WeaponType.ARC_CANNON) {
        if (Math.random() < 0.25) {
            callbacks.onEffectTick(e, 'SPARK');
        }
    }
}

function handleDeathAnimation(e: Enemy, delta: number, now: number, callbacks: any) {
    callbacks.onDeath(e, e.deathState);
}