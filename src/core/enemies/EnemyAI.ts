import * as THREE from 'three';
import { Enemy, AIState } from '../../types/enemy';
import { Obstacle, applyCollisionResolution } from '../systems/WindSystem';
import { MATERIALS } from '../../utils/assets';
import { SpatialGrid } from '../world/SpatialGrid';
import { WeaponType } from '../../content/weapons';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3();
const _color = new THREE.Color();

// --- DEBUG ASSETS ---
const _debugRingGeo = new THREE.RingGeometry(0.95, 1.0, 16);
_debugRingGeo.rotateX(-Math.PI / 2);
const _debugRingMat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.5, side: THREE.DoubleSide });

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
        allEnemies: Enemy[],
        shakeIntensity: number,
        debugMode: boolean,
        callbacks: {
            onPlayerHit: (damage: number, attacker: any, type: string) => void;
            spawnPart: (x: number, y: number, z: number, type: string, count: number, mesh?: THREE.Mesh, vel?: THREE.Vector3, color?: number, scale?: number) => void;
            spawnDecal: (x: number, z: number, scale: number, mat?: any) => void;
            onDamageDealt: (amount: number) => void;
            playSound: (id: string) => void;
            spawnBubble: (text: string, duration: number) => void;
            onAshStart: (e: Enemy) => void;
            getLastDamageType: () => string;
        }
    ) => {
        // Guard: If entity is fully processed or missing mesh, abort
        if (e.deathState === 'dead' || !e.mesh) return;

        // --- 1. HANDLE INITIAL DEATH TRIGGER ---
        if (e.hp <= 0 && e.deathState === 'alive') {
            e.deathTimer = now;
            const dmgType = e.lastDamageType; // Provided by ProjectileSystem
            const isHighImpact = e.lastHitWasHighImpact; // Provided by ProjectileSystem

            // Death Branching Logic
            // Priority 1: Fire (Ash)
            if (e.isBurning || dmgType === WeaponType.MOLOTOV || dmgType === WeaponType.FLAMETHROWER) {
                e.deathState = 'burning';
                callbacks.onAshStart(e);
            }
            // Priority 2: Explosions (Instant Gib)
            else if (dmgType === WeaponType.GRENADE || e.type === 'BOMBER') {
                e.deathState = 'exploded';
            }
            // Priority 3: Heavy Ballistics (Conditional Gibbing)
            else if (dmgType === WeaponType.REVOLVER || dmgType === WeaponType.SHOTGUN) {
                if (isHighImpact) {
                    e.deathState = 'gibbed'; // Meat explosion
                } else {
                    e.deathState = 'shot'; // Physical fall
                    e.fallForward = false; // Heavy impact usually pushes them back
                    if (e.deathVel) e.deathVel.copy(e.velocity).multiplyScalar(-0.5).setY(2.5);
                }
            }
            // Priority 4: Electricity
            else if (dmgType === WeaponType.TESLA_CANNON) {
                e.deathState = 'electrified';
            }
            // Priority 5: Standard (SMG, Pistol, Rifle)
            else {
                e.deathState = 'shot';
                if (e.deathVel) {
                    // Slight upward and backward force on death
                    _v1.subVectors(e.mesh.position, playerPos).normalize();
                    e.deathVel.copy(_v1).multiplyScalar(5.0).setY(2.0);
                }
                e.fallForward = Math.random() > 0.5;
            }
            return;
        }

        // --- 2. HANDLE DEATH ANIMATIONS ---
        if (e.deathState !== 'alive') {
            handleDeathAnimation(e, delta, now, callbacks);
            if (e.mesh.userData.debugRing) e.mesh.userData.debugRing.visible = false;
            return;
        }

        // --- 3. POOLING SCALE RECOVERY ---
        const targetScaleY = e.originalScale || 1.0;
        if (Math.abs(e.mesh.scale.y - targetScaleY) > 0.05) {
            const w = e.widthScale || 1.0;
            e.mesh.scale.set(targetScaleY * w, targetScaleY, targetScaleY * w);
            e.mesh.visible = true;
        }

        // --- 4. STATUS EFFECTS & STUNS ---
        handleStatusEffects(e, delta, now, callbacks);
        if (e.stunTimer && e.stunTimer > 0) {
            e.stunTimer -= delta;
            // Visual jitter for electrified/stunned enemies
            e.mesh.position.x += (Math.random() - 0.5) * 0.1;
            return;
        }
        if (e.blindTimer && e.blindTimer > 0) { e.blindTimer -= delta; return; }

        // --- 5. SENSORS ---
        const dx = playerPos.x - e.mesh.position.x;
        const dz = playerPos.z - e.mesh.position.z;
        const distSq = dx * dx + dz * dz;
        const canSeePlayer = distSq < 900; // 30m detection

        let heardNoise = false;
        let noisePos: THREE.Vector3 | null = null;
        if (!canSeePlayer && noiseEvents.length > 0) {
            for (let i = 0; i < noiseEvents.length; i++) {
                const n = noiseEvents[i];
                if (!n.active || now - n.time > 2000) continue;
                if (e.mesh.position.distanceToSquared(n.pos) < (n.radius * n.radius)) {
                    heardNoise = true; noisePos = n.pos; break;
                }
            }
        }

        // --- 6. MASS-BASED KNOCKBACK PHYSICS ---
        if (e.knockbackVel && e.knockbackVel.lengthSq() > 0.01) {
            // Body Mass: Bigger enemies are harder to push
            const mass = (e.originalScale || 1.0) * (e.widthScale || 1.0);
            const moveInertia = delta / Math.max(0.5, mass);

            e.mesh.position.addScaledVector(e.knockbackVel, moveInertia);

            // Gravity effect on knockback
            e.knockbackVel.y -= 50 * delta;

            // Friction/Drag: Heavier enemies stop sliding faster
            const friction = 1.0 + (mass * 2.0);
            e.knockbackVel.multiplyScalar(Math.max(0, 1 - friction * delta));

            if (e.mesh.position.y <= 0) {
                e.mesh.position.y = 0;
                e.knockbackVel.set(0, 0, 0);
            }
        }

        // --- 7. STATE MACHINE ---
        switch (e.state) {
            case AIState.IDLE:
                e.idleTimer -= delta;
                if (canSeePlayer) { e.state = AIState.CHASE; updateLastSeen(e, playerPos, now); }
                else if (heardNoise && noisePos) { e.state = AIState.SEARCH; updateLastSeen(e, noisePos, now); e.searchTimer = 5.0; }
                else if (e.idleTimer <= 0) {
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
                moveEntity(e, _v1, delta, e.speed * 0.5, collisionGrid);
                if (canSeePlayer) e.state = AIState.CHASE;
                else if (e.searchTimer <= 0) { e.state = AIState.IDLE; e.idleTimer = 1.0 + Math.random() * 2.0; }
                break;

            case AIState.CHASE:
                if (canSeePlayer) updateLastSeen(e, playerPos, now);
                if ((!canSeePlayer && now - e.lastSeenTime > 5000) || distSq > 2500) { e.state = AIState.SEARCH; e.searchTimer = 5.0; }
                else {
                    const target = canSeePlayer ? playerPos : e.lastSeenPos!;
                    if (e.type === 'BOMBER' && distSq < 12.0) { e.state = AIState.EXPLODING; e.explosionTimer = 1.5; return; }

                    moveEntity(e, target, delta, e.speed, collisionGrid);

                    const attackRange = e.type === 'TANK' ? 7.0 : 3.8;
                    if (distSq < attackRange && e.attackCooldown <= 0) {
                        if (e.type === 'TANK') {
                            e.attackCooldown = 3000; callbacks.onPlayerHit(e.damage, e, 'TANK_SMASH'); callbacks.playSound('tank_smash');
                        } else {
                            e.state = AIState.BITING; e.grappleTimer = 2.0; e.attackCooldown = 2000;
                        }
                    }
                }
                break;

            case AIState.BITING:
                e.grappleTimer -= delta * (shakeIntensity > 1.0 ? 6.0 : 1.0);
                _v1.set(0, 0, 0.4).applyQuaternion(e.mesh.quaternion);
                e.mesh.position.copy(playerPos).add(_v1);
                if (now % 500 < 30) callbacks.onPlayerHit(e.damage * 0.2, e, 'BITING');
                if (e.grappleTimer <= 0) e.state = AIState.CHASE;
                break;

            case AIState.EXPLODING:
                e.explosionTimer -= delta;
                if (e.indicatorRing) {
                    e.indicatorRing.visible = true;
                    e.indicatorRing.position.copy(e.mesh.position);
                    const pulse = 0.3 + Math.abs(Math.sin(now * 0.015)) * 0.5;
                    (e.indicatorRing.material as any).opacity = pulse;
                }
                if (e.explosionTimer <= 0) {
                    if (e.mesh.position.distanceToSquared(playerPos) < 30.0) callbacks.onPlayerHit(60, e, 'BOMBER_EXPLOSION');
                    e.hp = 0; e.deathState = 'exploded';
                }
                break;

            case AIState.SEARCH:
                e.searchTimer -= delta;
                if (e.lastSeenPos && e.mesh.position.distanceToSquared(e.lastSeenPos) > 1.5) moveEntity(e, e.lastSeenPos, delta, e.speed * 0.8, collisionGrid);
                else e.mesh.rotation.y += delta * 2.5;
                if (canSeePlayer) e.state = AIState.CHASE; else if (e.searchTimer <= 0) e.state = AIState.IDLE;
                break;
        }

        // --- 8. FINAL UPDATES ---
        if (e.attackCooldown > 0) e.attackCooldown -= delta * 1000;
        if (e.slowTimer > 0) e.slowTimer -= delta;

        // Idle bobbing movement
        if (e.mesh.userData.baseY === undefined) e.mesh.userData.baseY = e.mesh.position.y;
        e.mesh.position.y = e.mesh.userData.baseY + Math.abs(Math.sin(now * (e.state === AIState.CHASE ? 0.018 : 0.009))) * 0.12;

        // Debug Hitboxes
        if (debugMode) {
            if (!e.mesh.userData.debugRing) {
                const ring = new THREE.Mesh(_debugRingGeo, _debugRingMat);
                e.mesh.add(ring);
                e.mesh.userData.debugRing = ring;
            }
            const hitRadius = 0.5 * (e.originalScale || 1.0) * (e.widthScale || 1.0);
            e.mesh.userData.debugRing.visible = true;
            e.mesh.userData.debugRing.scale.setScalar(hitRadius);
            e.mesh.userData.debugRing.position.set(0, -e.mesh.position.y + 0.05, 0);
        }
    }
};

// --- HELPERS ---



function moveEntity(e: Enemy, target: THREE.Vector3, delta: number, speed: number, collisionGrid: SpatialGrid) {
    _v1.set(target.x, e.mesh.position.y, target.z);
    _v2.subVectors(_v1, e.mesh.position);
    const dist = _v2.length();
    if (dist < 0.01) return;

    _v2.divideScalar(dist);
    let curSpeed = speed * 10;
    if (e.slowTimer > 0) curSpeed *= 0.55;

    _v3.copy(_v2).multiplyScalar(curSpeed * delta);
    e.velocity.copy(_v2).multiplyScalar(curSpeed);
    _v4.copy(e.mesh.position).add(_v3);

    const baseScale = e.originalScale || 1.0;
    const hitRadius = 0.5 * baseScale * (e.widthScale || 1.0);

    const nearby = collisionGrid.getNearbyObstacles(_v4, hitRadius + 1.5);
    for (let i = 0; i < nearby.length; i++) {
        applyCollisionResolution(_v4, hitRadius, nearby[i]);
    }

    e.mesh.position.copy(_v4);

    // Smooth lookAt
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
        if (Math.random() > 0.75) {
            _v1.set(e.mesh.position.x + (Math.random() - 0.5), e.mesh.position.y + 1.2, e.mesh.position.z + (Math.random() - 0.5));
            callbacks.spawnPart(_v1.x, _v1.y, _v1.z, 'campfire_flame', 1);
        }
        if (e.burnTimer > 0) {
            e.burnTimer -= delta;
            if (e.burnTimer <= 0) { e.hp -= 6; callbacks.onDamageDealt(6); e.burnTimer = 0.5; }
        }
        if (e.afterburnTimer > 0) {
            e.afterburnTimer -= delta;
            if (e.afterburnTimer <= 0) e.isBurning = false;
        }
    }
}



function handleDeathAnimation(e: Enemy, delta: number, now: number, callbacks: any) {
    const age = now - e.deathTimer!;

    if (e.deathState === 'shot' || e.deathState === 'electrified') {
        if (e.deathVel) {
            e.deathVel.y -= 35 * delta; // Gravity
            e.mesh.position.addScaledVector(e.deathVel, delta);

            if (e.mesh.position.y <= 0.2) { e.mesh.position.y = 0.2; e.deathVel.set(0, 0, 0); }

            // Rotate towards ground
            const targetRot = (Math.PI / 2) * (e.fallForward ? 1 : -1);
            e.mesh.rotation.x += (targetRot - e.mesh.rotation.x) * 0.12;

            // Electric jitter
            if (e.deathState === 'electrified' && age < 1000) {
                e.mesh.position.x += (Math.random() - 0.5) * 0.15;
                if (Math.random() > 0.9) callbacks.spawnPart(e.mesh.position.x, 1, e.mesh.position.z, 'spark', 1);
            }
        }
    } else if (e.deathState === 'burning') {
        const progress = Math.max(0, 1.0 - age / 2500);
        const s = (e.originalScale || 1.0) * progress;
        e.mesh.scale.set(s * (e.widthScale || 1.0), s, s * (e.widthScale || 1.0));

        _color.set(e.color).multiplyScalar(progress);
        e.mesh.traverse((c: any) => { if (c.material?.color) c.material.color.copy(_color); });
    }
}