
import * as THREE from 'three';
import { Enemy, AIState } from '../../types/enemy';
import { Obstacle, resolveCollision } from '../../utils/physics';
import { MATERIALS } from '../../utils/assets';
import { SpatialGrid } from '../world/SpatialGrid';

export const EnemyAI = {
    updateEnemy: (
        e: Enemy,
        now: number,
        delta: number,
        playerPos: THREE.Vector3,
        collisionGrid: SpatialGrid,
        noiseEvents: { pos: THREE.Vector3, radius: number, time: number }[],
        allEnemies: Enemy[],
        shakeIntensity: number,
        callbacks: {
            onPlayerHit: (damage: number, attacker: any, type: string) => void;
            spawnPart: (x: number, y: number, z: number, type: string, count: number, mesh?: THREE.Mesh, vel?: THREE.Vector3, color?: number) => void;
            spawnDecal: (x: number, z: number, scale: number, mat?: any) => void;
            onDamageDealt: (amount: number) => void;
            playSound: (id: string) => void;
            spawnBubble: (text: string, duration: number) => void; // Debug
            onAshStart: (e: Enemy) => void;
        }
    ) => {
        if (e.dead) return;

        // --- Handle Death States (Falling/Ash) ---
        if (e.deathState !== 'alive') {
            handleDeathAnimation(e, delta, now, callbacks);
            return;
        }

        // Standard HP Check
        if (e.hp <= 0) {
            if (e.isBurning) {
                e.deathState = 'dying_ash';
                e.deathTimer = now; // Store start time
                e.mesh.visible = true; // Show individual mesh for animation
                callbacks.onAshStart(e);
            } else {
                // Use falling animation for standard death instead of disappearing
                e.deathState = 'falling';
                e.deathTimer = now;
                e.mesh.visible = true;
                e.deathVel = e.velocity.clone().multiplyScalar(0.5);
                e.deathVel.y = 2.0;
                e.fallForward = Math.random() > 0.5;
            }
            return;
        }

        // --- Status Effects ---
        handleStatusEffects(e, delta, now, callbacks);
        if (e.isBlinded) return; // Stunned/Blinded logic inside handleStatusEffects handles visual, we just skip movement here

        // --- SENSORS: LINE OF SIGHT & SOUND ---
        const distSq = e.mesh.position.distanceToSquared(playerPos);
        const dist = Math.sqrt(distSq);

        // DEBUG: Trace first enemy
        //if (allEnemies.length > 0 && allEnemies[0] === e) {
        //    if (Math.random() < 0.05) console.log(`Enemy 0: State=${e.state} Dist=${dist.toFixed(2)} Player=${playerPos.x.toFixed(1)},${playerPos.z.toFixed(1)}`);
        //}

        // 1. Line Of Sight (Raycast Simulation)
        let canSeePlayer = false;
        if (dist < 30) { // Increased from 15m to 30m
            canSeePlayer = true;
        }

        // 2. Sound Detection
        let heardNoise = false;
        let noisePos: THREE.Vector3 | null = null;
        if (!canSeePlayer && noiseEvents && noiseEvents.length > 0) {
            for (const n of noiseEvents) {
                const age = now - n.time;
                if (age > 2000) continue; // Noise is too old

                const noiseDist = e.mesh.position.distanceTo(n.pos);
                // Hearing sensitivity check
                if (noiseDist < n.radius * (e.hearingThreshold || 1.0)) {
                    heardNoise = true;
                    noisePos = n.pos.clone();
                    break;
                }
            }
        }

        // --- KNOCKBACK PHYSICS ---
        if (e.knockbackVel.lengthSq() > 0.01) {
            e.mesh.position.add(e.knockbackVel.clone().multiplyScalar(delta));

            // Gravity
            e.knockbackVel.y -= 25 * delta;

            // Friction (XZ)
            const friction = Math.max(0, 1 - 2 * delta);
            e.knockbackVel.x *= friction;
            e.knockbackVel.z *= friction;

            // Ground collision
            if (e.mesh.position.y <= 0) {
                e.mesh.position.y = 0;
                e.knockbackVel.y = 0;
                e.knockbackVel.multiplyScalar(0.7); // Bounciness/Friction
            }
        }

        // --- STATE MACHINE ---

        switch (e.state) {
            case AIState.IDLE:
                // Behavior: Stand still, look around
                e.idleTimer -= delta;
                if (canSeePlayer) {
                    e.state = AIState.CHASE;
                    e.lastSeenPos = playerPos.clone();
                    e.lastSeenTime = now;
                } else if (heardNoise && noisePos) {
                    e.state = AIState.SEARCH;
                    e.lastSeenPos = noisePos;
                    e.lastSeenTime = now;
                    e.searchTimer = 5.0;
                } else if (e.idleTimer <= 0) {
                    // Pick random point to wander
                    e.state = AIState.WANDER;
                    const wanderRadius = 5; // Reduced from 10m to 5m
                    const angle = Math.random() * Math.PI * 2;
                    const wx = e.spawnPos.x + Math.cos(angle) * wanderRadius * Math.random();
                    const wz = e.spawnPos.z + Math.sin(angle) * wanderRadius * Math.random();
                    e.velocity.set(wx - e.mesh.position.x, 0, wz - e.mesh.position.z).normalize().multiplyScalar(e.speed * 0.5);
                    e.searchTimer = 2.0 + Math.random() * 2.0;
                }
                break;

            case AIState.WANDER:
                // Behavior: Walk forward (velocity set in IDLE transition)
                e.searchTimer -= delta;

                // Physics Move
                e.mesh.position.add(e.velocity.clone().multiplyScalar(delta));
                e.mesh.rotation.y = Math.atan2(e.velocity.x, e.velocity.z); // Face move dir

                if (canSeePlayer) {
                    e.state = AIState.CHASE;
                    e.lastSeenPos = playerPos.clone();
                    e.lastSeenTime = now;
                } else if (heardNoise && noisePos) {
                    e.state = AIState.SEARCH;
                    e.lastSeenPos = noisePos;
                    e.lastSeenTime = now;
                    e.searchTimer = 5.0;
                } else if (e.searchTimer <= 0) {
                    e.state = AIState.IDLE;
                    e.idleTimer = 1.0 + Math.random() * 2.0;
                }
                break;

            case AIState.CHASE:
                // Update Knowledge
                if (canSeePlayer) {
                    e.lastSeenPos = playerPos.clone();
                    e.lastSeenTime = now;
                }

                // Lost Track Condition: (LOS broken for > 5s) OR (Dist > 50m)
                const timeSinceSeen = now - e.lastSeenTime;
                if ((!canSeePlayer && timeSinceSeen > 5000) || dist > 50) { // Increased from 25m to 50m
                    e.state = AIState.SEARCH;
                    e.searchTimer = 5.0; // Search for 5 seconds
                } else {
                    // MOVEMENT: Run to Player (or last seen)
                    const target = canSeePlayer ? playerPos : e.lastSeenPos!;

                    // Random Groan/Scream (Low chance)
                    if (Math.random() < 0.005) {
                        if (e.type === 'RUNNER') callbacks.playSound('runner_scream');
                        else if (e.type === 'TANK') callbacks.playSound('tank_roar');
                        else callbacks.playSound('walker_groan');
                    }

                    // --- BOMBER LOGIC ---
                    if (e.type === 'BOMBER' && dist < 3.0) {
                        e.state = AIState.EXPLODING;
                        e.explosionTimer = 2.0;
                        e.velocity.set(0, 0, 0);
                        // SFX: Fuse sound?
                        return; // Stop processing chase
                    }

                    moveEntity(e, target, delta, e.speed, collisionGrid);

                    // ATTACK LOGIC
                    if (e.type === 'TANK') {
                        // Tank Smash (Shared Logic for Boss and Tank)
                        if (dist < 2.5 && e.attackCooldown <= 0) {
                            e.attackCooldown = 3000; // 3s cooldown

                            if (e.isBoss && e.bossId !== undefined) {
                                callbacks.onPlayerHit(e.damage, e, 'Boss');
                                callbacks.playSound('boss_attack_' + e.bossId);
                            } else {
                                callbacks.onPlayerHit(20, e, 'TANK_SMASH');
                                callbacks.playSound('tank_smash');
                                callbacks.playSound('tank_roar');
                            }

                            for (const other of allEnemies) {
                                if (other === e || other.dead) continue;
                                if (other.mesh.position.distanceTo(e.mesh.position) < 3.0) {
                                    other.hp -= other.maxHp ? other.maxHp * 0.1 : 10;
                                    other.slowTimer = 2.0;
                                    callbacks.onDamageDealt(10);
                                    const away = new THREE.Vector3().subVectors(other.mesh.position, e.mesh.position).normalize();
                                    other.mesh.position.add(away.multiplyScalar(0.5));
                                }
                            }
                            callbacks.spawnDecal(e.mesh.position.x, e.mesh.position.z, 1.2, MATERIALS.bloodDecal);
                            callbacks.spawnPart(e.mesh.position.x, 0.1, e.mesh.position.z, 'muck', 20);
                        }
                    } else {
                        // Standard Attack (Walker/Runner)
                        // Increased range from 1.2 to 1.8 to ensure they can hit even with collision buffer
                        if (dist < 1.8 && e.attackCooldown <= 0) {
                            e.state = AIState.BITING;
                            e.grappleTimer = 2.0;
                            e.attackCooldown = 2000;
                            // Trigger attack sound immediately
                            if (e.type === 'RUNNER') callbacks.playSound('runner_scream');
                            else callbacks.playSound('walker_attack');
                        }
                    }
                }
                break;

            case AIState.BITING:
                // Behavior: Stick to player, deal DoT
                let drain = delta;
                if (shakeIntensity > 1.0) drain += delta * 4.0; // 5x speed if shaking hard
                else if (shakeIntensity > 0.1) drain += delta * 1.5;

                e.grappleTimer = (e.grappleTimer || 0) - drain;

                // Stick to player (Visual)
                // We don't have direct control of player pos, but we can move enemy TO player.
                // Offset slightly front/side
                const attachOffset = new THREE.Vector3(0, 0, 0.5).applyQuaternion(e.mesh.quaternion);
                e.mesh.position.copy(playerPos).add(attachOffset);

                // DoT
                if (now % 500 < 20) {
                    callbacks.onPlayerHit(e.damage * 0.2, e, 'BITING');
                    // Use specific bite/attack sound
                    if (e.type === 'RUNNER') callbacks.playSound('runner_attack');
                    else callbacks.playSound('walker_attack');
                }

                // Break conditions handled by Player (Knockback/Rush)
                // But also timeout:
                if (e.grappleTimer <= 0) {
                    e.state = AIState.CHASE;
                    // Knockback self slightly
                    e.spawnPos.copy(e.mesh.position);
                    const back = new THREE.Vector3(0, 0, 1).applyQuaternion(e.mesh.quaternion);
                    e.mesh.position.add(back);
                }
                break;

            case AIState.EXPLODING:
                // Behavior: Stand still, flash red, explode
                e.explosionTimer = (e.explosionTimer || 0) - delta;

                // Indicator Ring Logic
                if (e.indicatorRing) {
                    e.indicatorRing.visible = true;
                    e.indicatorRing.position.copy(e.mesh.position);
                    e.indicatorRing.position.y = 0.15; // Slightly above ground

                    // Pulse matching the beep/scale
                    const pulse = 0.3 + Math.abs(Math.sin(now * 0.01)) * 0.4;
                    if (e.indicatorRing.material instanceof THREE.Material) {
                        e.indicatorRing.material.opacity = pulse;
                    }
                }

                // Flash Red
                const flash = Math.sin(now * 0.02) > 0;
                const bodyPulse = 1.0 + Math.sin(now * 0.05) * 0.2;
                e.mesh.scale.setScalar(e.originalScale * bodyPulse);

                // Beeping sound for bomber
                if (Math.random() < 0.05) callbacks.playSound('bomber_beep');

                if (e.explosionTimer <= 0) {
                    // BOOM
                    const boomDist = e.mesh.position.distanceTo(playerPos);
                    if (boomDist < 5.0) {
                        callbacks.onPlayerHit(50, e, 'BOMBER_EXPLOSION');
                    }
                    callbacks.playSound('bomber_explode');

                    // Cleanup Ring
                    if (e.indicatorRing) {
                        const scene = e.indicatorRing.parent;
                        if (scene) scene.remove(e.indicatorRing);
                        e.indicatorRing = undefined;
                    }

                    // Damage other zombies
                    for (const other of allEnemies) {
                        if (other === e || other.dead) continue;
                        if (other.mesh.position.distanceTo(e.mesh.position) < 5.0) {
                            other.hp -= 500;
                            callbacks.onDamageDealt(500);
                        }
                    }

                    // Self Destruct
                    e.hp = 0;
                    e.dead = true;
                    e.mesh.userData.forceExplode = true;
                }
                break;

            case AIState.STUNNED:
                // Behavior: Stand still, shake
                // Recovery handled in handleStatusEffects
                e.velocity.set(0, 0, 0);
                // Visual shake in handleStatusEffects or here
                e.mesh.rotation.y += Math.sin(now * 0.1) * 0.2;
                break;

            case AIState.SEARCH:
                // Behavior: Go to last seen pos, then look around

                let arrived = false;
                if (e.lastSeenPos && e.mesh.position.distanceTo(e.lastSeenPos) > 2.0) {
                    moveEntity(e, e.lastSeenPos, delta, e.speed * 0.8, collisionGrid);
                } else {
                    arrived = true;
                    // Reached spot, look around (spin)
                    e.mesh.rotation.y += delta * 2.0;
                }

                // Only burn search timer if we have arrived at the disturbance
                if (arrived) {
                    e.searchTimer -= delta;
                }

                if (canSeePlayer) {
                    e.state = AIState.CHASE;
                    e.lastSeenPos = playerPos.clone();
                    e.lastSeenTime = now;
                } else if (e.searchTimer <= 0) {
                    e.state = AIState.WANDER;
                    // Set spawn pos to current pos? Or return to original? 
                    // "wander around last seen location" -> Update spawnPos anchor
                    e.spawnPos.copy(e.mesh.position);
                }
                break;
        }

        // Cooldowns
        if (e.attackCooldown > 0) e.attackCooldown -= delta * 1000;
        if (e.slowTimer > 0) e.slowTimer -= delta;

        // Bobbing
        const bob = Math.sin(now * 0.01 * (e.state === AIState.CHASE ? 1.5 : 0.5));
        e.mesh.position.y = (e.mesh.userData.baseY || 1.0) + Math.abs(bob) * 0.1;
    }
};

// --- HELPERS ---

function moveEntity(e: Enemy, target: THREE.Vector3, delta: number, speed: number, collisionGrid: SpatialGrid) {
    // Flatten target Y
    const flatTarget = target.clone();
    flatTarget.y = e.mesh.position.y;

    // Direction
    const dir = new THREE.Vector3().subVectors(flatTarget, e.mesh.position).normalize();

    // Speed Modifiers
    let currentSpeed = speed * 10; // Base speed multiplier
    if (e.slowTimer > 0) currentSpeed *= 0.5;

    const moveVec = dir.multiplyScalar(currentSpeed * delta);

    // Apply Velocity for Physics readouts
    e.velocity.copy(dir).multiplyScalar(currentSpeed);

    const testPos = e.mesh.position.clone().add(moveVec);

    // Collision
    const nearby = collisionGrid.getNearby(testPos, 2.0);
    for (const obs of nearby) {
        const push = resolveCollision(testPos, 0.5, obs, 2.0, 1.0); // height 2.0, offset 1.0 (centered)
        if (push) testPos.add(push);
    }

    e.mesh.position.copy(testPos);
    e.mesh.lookAt(target.x, e.mesh.position.y, target.z);
}

function handleStatusEffects(e: Enemy, delta: number, now: number, callbacks: any) {
    // Burning
    if (e.isBurning) {
        // High frequency burn particles (at least 1 per frame, often 2)
        // Bosses get more particles scaled by their size
        const baseParticles = e.isBoss ? 4 : 1;
        const particleCount = baseParticles + Math.floor(Math.random() * 2);
        const effectRadius = e.isBoss ? (e.originalScale * 1.2) : 0.6;

        for (let i = 0; i < particleCount; i++) {
            const px = e.mesh.position.x + (Math.random() - 0.5) * effectRadius;
            const pz = e.mesh.position.z + (Math.random() - 0.5) * effectRadius;
            // Rise up from body center, scale height for bosses
            const pyBase = e.mesh.position.y + (e.isBoss ? 1.0 : 0.5);
            callbacks.spawnPart(px, pyBase + Math.random() * (e.isBoss ? 2.0 : 1.0), pz, 'campfire_flame', 1);
        }

        if (e.burnTimer > 0) {
            e.burnTimer -= delta;
            if (e.burnTimer <= 0) {
                e.hp -= 5;
                callbacks.onDamageDealt(5);
                e.burnTimer = 0.5;
            }
        }
        if (e.afterburnTimer > 0) {
            e.afterburnTimer -= delta;
            if (e.afterburnTimer <= 0) e.isBurning = false;
        }
    }

    // Blinded (Visuals only, movement handled in Update)
    if (e.isBlinded) {
        if (now > e.blindUntil) {
            e.isBlinded = false;
            e.mesh.scale.setScalar(e.originalScale);
        } else {
            // Shake/Cower
            e.mesh.rotation.y += Math.sin(now * 0.05) * 0.3;
            // ... (rest of visual logic)
        }
    }

    // Stunned
    if (e.stunTimer && e.stunTimer > 0) {
        e.stunTimer -= delta;

        // Visual Feedback: Shake
        e.mesh.position.x += Math.sin(now * 0.1) * 0.05;
        e.mesh.position.z += Math.cos(now * 0.1) * 0.05;

        // Visual Feedback: Stars
        if (now % 100 < 20) {
            // Spawn stars above head
            callbacks.spawnPart(e.mesh.position.x, e.mesh.position.y + (e.isBoss ? 4 : 2.2), e.mesh.position.z, 'stun_star', 1);
        }

        if (e.stunTimer <= 0) {
            e.stunTimer = 0;
            // Transition back to CHASE if player exists, otherwise IDLE
            e.state = AIState.CHASE;
        }
    }
}

function handleDeathAnimation(e: Enemy, delta: number, now: number, callbacks: any) {
    // Copied from original logic (Falling / Ash)
    // ... (To avoid massive file size, I will trust the user to keep the existing death logic or I can inline it if strictly needed. 
    // I replaced the whole function so I MUST include it.)

    if (e.deathState === 'falling') {
        const age = now - e.deathTimer;
        const totalDuration = 2000; // ms

        if (e.mesh) e.mesh.visible = true;

        if (e.deathVel) {
            e.deathVel.y -= 30 * delta;
            e.mesh.position.add(e.deathVel.clone().multiplyScalar(delta));
            if (e.mesh.position.y <= 0.2) {
                e.mesh.position.y = 0.2;
                e.deathVel.y = 0;
                e.deathVel.x *= 0.9; // Friction
                e.deathVel.z *= 0.9;

                // Blood Trail
                if (!e.lastTrailPos) e.lastTrailPos = e.mesh.position.clone();
                if (e.mesh.position.distanceTo(e.lastTrailPos) > 1.5) {
                    callbacks.spawnDecal(e.mesh.position.x, e.mesh.position.z, 0.4, MATERIALS.bloodDecal);
                    e.lastTrailPos.copy(e.mesh.position);
                }
            }
            // Tumble
            if (e.deathVel.lengthSq() > 0.5) e.mesh.rotation.y += 2.0 * delta;

            // Flatten
            const targetRot = e.fallForward ? Math.PI / 2 : -Math.PI / 2;
            if (e.fallForward) {
                if (e.mesh.rotation.x < Math.PI / 2) e.mesh.rotation.x += 8 * delta;
            } else {
                if (e.mesh.rotation.x > -Math.PI / 2) e.mesh.rotation.x -= 8 * delta;
            }

            if (e.deathVel.lengthSq() < 0.1 || age >= totalDuration) {
                e.dead = true;
                // Note: EnemyManager cleanup handles final corpse conversion and blood pool
            }
        }
    } else if (e.deathState === 'dying_ash') {
        const totalDuration = 3000; // ms
        const age = now - e.deathTimer;
        const progress = Math.max(0, 1.0 - age / totalDuration); // 1.0 down to 0.0

        if (e.mesh) {
            e.mesh.visible = true; // Safety
            // Uniformly shrink the whole mesh
            const scale = (e.originalScale || 1.0) * progress;
            const wScale = (e.widthScale || 1.0) * scale;
            e.mesh.scale.set(wScale, scale, wScale);

            // Grow Ash Pile
            if (e.ashPile) {
                const ashProgress = 1.0 - progress; // 0.0 to 1.0
                const ashScaleBase = e.originalScale || 1.0;
                // Add some variety/wobble while growing? Maybe just straight scaling for now.
                e.ashPile.scale.set(
                    ashScaleBase * ashProgress * (1 + (e.widthScale || 1.0) * 0.5),
                    ashScaleBase * ashProgress,
                    ashScaleBase * ashProgress * (1 + (e.widthScale || 1.0) * 0.5)
                );
            }

            // Shrinking Fire Particles
            const baseParticles = e.isBoss ? 4 : 1;
            const particleCount = baseParticles + Math.floor(Math.random() * 2);
            // Scale dispersion and height by current progress
            const effectRadius = (e.isBoss ? (e.originalScale * 1.2) : 0.6) * progress;

            for (let i = 0; i < particleCount; i++) {
                const px = e.mesh.position.x + (Math.random() - 0.5) * effectRadius;
                const pz = e.mesh.position.z + (Math.random() - 0.5) * effectRadius;
                const pyBase = e.mesh.position.y + (e.isBoss ? 1.0 : 0.5) * progress;
                callbacks.spawnPart(px, pyBase + Math.random() * (e.isBoss ? 2.0 : 1.0) * progress, pz, 'campfire_flame', 1);
            }

            // Sink into ground slightly
            e.mesh.position.y -= 0.2 * delta;

            // Darken material toward black
            const baseColor = new THREE.Color(e.color);
            e.mesh.traverse((child) => {
                if (child instanceof THREE.Mesh && child.material) {
                    const mat = child.material as THREE.MeshStandardMaterial;
                    if (mat.color) {
                        // Smooth transition to black
                        mat.color.setRGB(
                            baseColor.r * progress,
                            baseColor.g * progress,
                            baseColor.b * progress
                        );
                    }
                }
            });
        }

        if (age >= totalDuration) {
            e.dead = true;
        }
    }
}
