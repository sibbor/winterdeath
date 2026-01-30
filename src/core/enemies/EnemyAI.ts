
import * as THREE from 'three';
import { Enemy } from '../../types/enemy';
import { Obstacle, resolveCollision } from '../../utils/physics';
import { MATERIALS } from '../../utils/assets';

export const EnemyAI = {
    updateEnemy: (
        e: Enemy,
        now: number,
        delta: number,
        playerPos: THREE.Vector3,
        obstacles: Obstacle[],
        callbacks: {
            onPlayerHit: (damage: number, type: string, enemyPos: THREE.Vector3) => void;
            spawnPart: (x: number, y: number, z: number, type: string, count: number, mesh?: THREE.Mesh, vel?: THREE.Vector3, color?: number) => void;
            spawnDecal: (x: number, z: number, scale: number, mat?: any) => void;
            onDamageDealt: (amount: number) => void;
        }
    ) => {
        if (e.dead) return;

        // --- Handle Falling Death Animation (Bullets/Impact) ---
        if (e.deathState === 'falling') {
            // Safety timer to force death state eventually
            e.deathTimer -= delta;

            if (e.deathVel) {
                // Gravity
                e.deathVel.y -= 30 * delta;

                // Move
                e.mesh.position.add(e.deathVel.clone().multiplyScalar(delta));

                // Ground Collision & Friction
                if (e.mesh.position.y <= 0.2) {
                    e.mesh.position.y = 0.2;
                    e.deathVel.y = 0;

                    // High friction on ground to simulate body dragging
                    const friction = 3.0;
                    e.deathVel.x -= e.deathVel.x * friction * delta;
                    e.deathVel.z -= e.deathVel.z * friction * delta;

                    // --- BLOOD TRAIL LOGIC ---
                    if (!e.lastTrailPos) e.lastTrailPos = e.mesh.position.clone();

                    const distMoved = e.mesh.position.distanceTo(e.lastTrailPos);
                    // Spawn a smear every 1.5 units moved
                    if (distMoved > 1.5) {
                        const baseScale = e.originalScale || 1.0;
                        callbacks.spawnDecal(e.mesh.position.x, e.mesh.position.z, (0.8 + Math.random() * 0.4) * baseScale, MATERIALS.bloodDecal);
                        e.lastTrailPos.copy(e.mesh.position);
                    }
                }

                // Orientation
                const speedSq = e.deathVel.x * e.deathVel.x + e.deathVel.z * e.deathVel.z;
                // Rotate to face direction of slide (or away depending on desired effect, usually bodies tumble)
                // Here we keep the "blown back" rotation on X, but rotate Y to match slide vector if fast enough
                if (speedSq > 0.5) {
                    // Slight random rotation for tumble effect
                    e.mesh.rotation.y += 2.0 * delta;
                }

                // Fall/Roll Animation (Rotate X to lay flat)
                const fallSpeed = 8.0;
                if (e.fallForward) {
                    // Face plant: Rotate towards Math.PI / 2
                    if (e.mesh.rotation.x < Math.PI / 2) {
                        e.mesh.rotation.x = Math.min(Math.PI / 2, e.mesh.rotation.x + fallSpeed * delta);
                    }
                } else {
                    // Backward fall: Rotate towards -Math.PI / 2
                    if (e.mesh.rotation.x > -Math.PI / 2) {
                        e.mesh.rotation.x = Math.max(-Math.PI / 2, e.mesh.rotation.x - fallSpeed * delta);
                    }
                }

                // --- STOP CONDITION ---
                // If stopped moving or timer ran out
                if (speedSq < 0.1 || e.deathTimer <= 0) {
                    e.deathState = 'dead'; // Mark strictly dead
                    e.dead = true; // Cleanup flag

                    // --- FINAL BLOOD POOL ---
                    // Spawn a large pool where they stopped with randomized size, relative to body size
                    const baseScale = e.originalScale || 1.0;
                    const poolSize = (1.5 + Math.random() * 2.5) * baseScale;
                    callbacks.spawnDecal(e.mesh.position.x, e.mesh.position.z, poolSize, MATERIALS.bloodDecal);

                    // "Pouring out" effect - spawn more blood particles
                    callbacks.spawnPart(
                        e.mesh.position.x, 0.2, e.mesh.position.z,
                        'blood',
                        Math.floor(30 * baseScale), // Scale particle count too
                        undefined,
                        new THREE.Vector3(0, 0.2, 0) // Slow upward then fall
                    );

                    e.bloodSpawned = true;
                }
            }
            return;
        }

        // --- Handle Dying Animation (Ash/Fire) ---
        if (e.deathState === 'dying_ash') {
            e.deathTimer -= delta;

            // Melt down animation
            if (e.mesh) {
                const shrinkRate = 1.0 * delta;
                e.mesh.scale.y = Math.max(0.1, e.mesh.scale.y - shrinkRate);
                const expandRate = 0.2 * delta;
                e.mesh.scale.x += expandRate;
                e.mesh.scale.z += expandRate;
                e.mesh.position.y = Math.max(0, e.mesh.position.y - 0.2 * delta);
            }

            // Visuals: Smoke and Embers
            if (Math.random() < 0.4) {
                const px = e.mesh.position.x + (Math.random() - 0.5) * 0.5;
                const pz = e.mesh.position.z + (Math.random() - 0.5) * 0.5;
                callbacks.spawnPart(px, e.mesh.position.y + 0.5, pz, 'smoke', 1);
                if (Math.random() < 0.5) {
                    callbacks.spawnPart(px, e.mesh.position.y + 0.2, pz, 'campfire_flame', 1);
                }
            }

            if (e.deathTimer <= 0) {
                e.dead = true;
            }
            return; // Skip other logic
        }

        // Standard Death Check (Safety fallback)
        if (e.hp <= 0) {
            e.dead = true;
            return;
        }

        // --- Status Effects ---

        // Burning
        if (e.isBurning) {
            // Visuals: Continuous flames attached to body
            if (Math.random() < 0.3) {
                const px = e.mesh.position.x + (Math.random() - 0.5) * 0.5;
                const pz = e.mesh.position.z + (Math.random() - 0.5) * 0.5;
                const py = e.mesh.position.y + Math.random() * 1.5;
                callbacks.spawnPart(px, py, pz, 'campfire_flame', 1);
            }

            if (e.burnTimer > 0) {
                e.burnTimer -= delta;
                if (e.burnTimer <= 0) {
                    // Tick Damage
                    const burnDmg = 5;
                    e.hp -= burnDmg;
                    callbacks.onDamageDealt(burnDmg);
                    e.burnTimer = 0.5; // Reset tick

                    if (e.hp <= 0) {
                        // Start Ash Death
                        e.deathState = 'dying_ash';
                        e.deathTimer = 1.5; // Duration of melt
                        return;
                    }
                }
            }
            if (e.afterburnTimer > 0) {
                e.afterburnTimer -= delta;
                if (e.afterburnTimer <= 0) e.isBurning = false;
            }
        }

        // Blind
        if (e.isBlinded) {
            e.velocity.set(0, 0, 0); // Stop movement if blinded
            if (now > e.blindUntil) {
                e.isBlinded = false;
                // Reset scale to ensure they return to normal shape
                e.mesh.scale.setScalar(e.originalScale);
            } else {
                // BLINDED ANIMATION (Stunned/Panic)
                e.mesh.rotation.y += Math.sin(now * 0.05) * 0.3;
                const cower = 0.85 + Math.sin(now * 0.015) * 0.05;
                e.mesh.scale.y = e.originalScale * cower;
                const bulch = 1.0 + (1.0 - cower) * 0.5;
                e.mesh.scale.x = e.originalScale * bulch;
                e.mesh.scale.z = e.originalScale * bulch;

                if (Math.random() < 0.15) {
                    const headY = e.mesh.position.y + (e.mesh.userData.baseY || 1.0) + 1.2;
                    callbacks.spawnPart(
                        e.mesh.position.x + (Math.random() - 0.5) * 0.8,
                        headY + (Math.random() - 0.5) * 0.5,
                        e.mesh.position.z + (Math.random() - 0.5) * 0.8,
                        'stun_star',
                        1
                    );
                }
                return;
            }
        }

        // Slow Timer
        if (e.slowTimer > 0) {
            e.slowTimer -= delta;
        }

        // --- Movement & Attack Logic ---

        const distSq = e.mesh.position.distanceToSquared(playerPos);
        const range = 1.5; // Attack range

        // Cooldown
        if (e.attackCooldown > 0) e.attackCooldown -= delta * 1000;

        // Knockback recovery
        if (now - e.lastKnockback < 200) {
            return;
        }

        // Move towards player
        if (distSq > range * range) {
            const dir = new THREE.Vector3().subVectors(playerPos, e.mesh.position).normalize();

            let currentSpeed = e.speed * 10;
            if (e.slowTimer > 0) currentSpeed *= 0.5;

            const moveVec = dir.multiplyScalar(currentSpeed * delta);

            // Update Velocity for Physics
            e.velocity.copy(dir).multiplyScalar(currentSpeed);

            const testPos = e.mesh.position.clone().add(moveVec);

            // Obstacle Collision
            for (const obs of obstacles) {
                const push = resolveCollision(testPos, 0.5, obs);
                if (push) testPos.add(push);
            }

            e.mesh.position.copy(testPos);
            e.mesh.lookAt(playerPos.x, e.mesh.position.y, playerPos.z);
        } else {
            e.velocity.set(0, 0, 0); // Stopped to attack
            // Attack
            if (e.attackCooldown <= 0) {
                e.attackCooldown = 1500; // 1.5s attack speed
                callbacks.onPlayerHit(e.damage, e.type, e.mesh.position);

                // Lunge visual
                const dir = new THREE.Vector3().subVectors(playerPos, e.mesh.position).normalize();
                e.mesh.position.add(dir.multiplyScalar(0.5));
            }
        }

        // Bobbing animation
        if (!e.isBlinded) {
            const bob = Math.sin(now * 0.01);
            e.mesh.position.y = (e.mesh.userData.baseY || 1.0) + Math.abs(bob) * 0.1;
        }
    }
};
