import * as THREE from 'three';
import { Enemy, AIState } from '../../types/enemy';
import { Obstacle, applyCollisionResolution } from '../world/CollisionResolution';
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
const _blackColor = new THREE.Color(0x000000); // [VINTERDÖD] Statisk färg för bränn-lerp

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
            onDamageDealt: (amount: number, enemy: Enemy) => void;
            playSound: (id: string) => void;
            spawnBubble: (text: string, duration: number) => void;
            onAshStart: (e: Enemy) => void;
        }
    ) => {
        if (e.deathState === 'dead' || !e.mesh) return;

        // --- 1. HANDLE INITIAL DEATH TRIGGER ---
        if (e.hp <= 0 && e.deathState === 'alive') {
            e.deathTimer = now;
            const dmgType = e.lastDamageType;
            const isHighImpact = e.lastHitWasHighImpact;

            if (dmgType === WeaponType.GRENADE || e.type === 'BOMBER') {
                e.deathState = 'exploded';
            }
            else if (dmgType === WeaponType.REVOLVER || dmgType === WeaponType.SHOTGUN) {
                if (isHighImpact) {
                    e.deathState = 'gibbed';
                } else {
                    e.deathState = 'shot';
                    e.fallForward = false;
                    if (e.deathVel) e.deathVel.copy(e.velocity).multiplyScalar(-0.5).setY(2.5);
                }
            }
            else if (e.isBurning || dmgType === WeaponType.MOLOTOV || dmgType === WeaponType.FLAMETHROWER) {
                e.deathState = 'burning';
                callbacks.onAshStart(e);
            }
            else if (dmgType === WeaponType.ARC_CANNON) {
                e.deathState = 'electrified';
            }
            else {
                e.deathState = 'shot';
                if (e.deathVel) {
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
            e.mesh.position.x += (Math.random() - 0.5) * 0.1;
            return;
        }
        if (e.blindTimer && e.blindTimer > 0) { e.blindTimer -= delta; return; }

        // --- 5. SENSORS & SEPARATION ---
        const dx = playerPos.x - e.mesh.position.x;
        const dz = playerPos.z - e.mesh.position.z;
        const distSq = dx * dx + dz * dz;
        const canSeePlayer = distSq < 900;

        if (allEnemies) {
            if (!e.separationForce) e.separationForce = new THREE.Vector3();
            let sepCount = 0;
            const separationRadiusSq = 1.0;

            // [VINTERDÖD] Deklarerar variabler utanför loopen för absolut Zero-GC säkerhet
            let other: Enemy, odx: number, odz: number, odSq: number, od: number;

            for (let i = 0; i < allEnemies.length; i++) {
                other = allEnemies[i];
                if (other === e || other.deathState === 'dead') continue;

                odx = e.mesh.position.x - other.mesh.position.x;
                odz = e.mesh.position.z - other.mesh.position.z;
                odSq = odx * odx + odz * odz;

                if (odSq < separationRadiusSq && odSq > 0.001) {
                    od = Math.sqrt(odSq);
                    e.separationForce.x += (odx / od) / od;
                    e.separationForce.z += (odz / od) / od;
                    sepCount++;
                }
            }
        }

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

                if (Math.random() < 0.005) callbacks.playSound(e.type === 'RUNNER' ? 'runner_scream' : (e.type === 'TANK' ? 'tank_roar' : 'walker_groan'));
                break;

            case AIState.WANDER:
                e.searchTimer -= delta;
                _v1.copy(e.mesh.position).addScaledVector(e.velocity, delta);
                moveEntity(e, _v1, delta, e.speed * 0.5, collisionGrid);
                if (canSeePlayer) e.state = AIState.CHASE;
                else if (e.searchTimer <= 0) { e.state = AIState.IDLE; e.idleTimer = 1.0 + Math.random() * 2.0; }

                const wanderStepInterval = 1200;
                if (now > (e.lastStepTime || 0) + wanderStepInterval) {
                    callbacks.playSound('step_zombie');
                    e.lastStepTime = now;
                }
                break;

            case AIState.CHASE:
                if (canSeePlayer) updateLastSeen(e, playerPos, now);
                if ((!canSeePlayer && now - e.lastSeenTime > 5000) || distSq > 2500) { e.state = AIState.SEARCH; e.searchTimer = 5.0; }
                else {
                    const target = canSeePlayer ? playerPos : e.lastSeenPos!;
                    if (e.type === 'BOMBER' && distSq < 12.0) { e.state = AIState.EXPLODING; e.explosionTimer = 1.5; return; }

                    moveEntity(e, target, delta, e.speed, collisionGrid);

                    const chaseStepInterval = e.type === 'RUNNER' ? 250 : 400;
                    if (now > (e.lastStepTime || 0) + chaseStepInterval) {
                        if (e.type === 'TANK') callbacks.playSound('tank_smash');
                        else callbacks.playSound('step_snow');
                        e.lastStepTime = now;
                    }

                    if (Math.random() < 0.01) callbacks.playSound(e.type === 'RUNNER' ? 'runner_attack' : (e.type === 'TANK' ? 'tank_roar' : 'walker_attack'));

                    const attackRange = e.type === 'TANK' ? 7.0 : 3.8;
                    if (distSq < attackRange && e.attackCooldown <= 0) {
                        if (e.type === 'TANK') {
                            e.attackCooldown = 3000; callbacks.onPlayerHit(e.damage, e, 'TANK_SMASH'); callbacks.playSound('tank_smash');
                        } else {
                            e.state = AIState.BITING; e.grappleTimer = 2.0; e.attackCooldown = 2000;
                            callbacks.playSound(e.type === 'RUNNER' ? 'runner_attack' : 'walker_attack');
                        }
                    }
                }
                break;

            case AIState.BITING:
                e.grappleTimer -= delta * (shakeIntensity > 1.0 ? 6.0 : 1.0);
                _v1.set(0, 0, 0.4).applyQuaternion(e.mesh.quaternion);
                e.mesh.position.copy(playerPos).add(_v1);
                if (now % 500 < 30) {
                    callbacks.onPlayerHit(e.damage * 0.2, e, 'BITING');
                    callbacks.playSound('impact_flesh');
                }
                if (e.grappleTimer <= 0) e.state = AIState.CHASE;
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

                if (now % 400 < 30) callbacks.playSound('bomber_beep');

                if (e.indicatorRing) {
                    e.indicatorRing.visible = true;
                    e.indicatorRing.position.set(0, 0.1 - (sineVal * bounceHeight), 0);

                    e.indicatorRing.scale.setScalar(12.0 + Math.sin(now * 0.01) * 1.0);
                    const flashSpeed = (1.6 - e.explosionTimer) * 30;
                    const pulse = 0.5 + 0.5 * Math.sin(now * 0.01 * flashSpeed);

                    if (e.indicatorRing.material) {
                        const mat = e.indicatorRing.material as any;
                        mat.opacity = 0.4 + (1.0 - (e.explosionTimer / 1.5)) * 0.6;
                        mat.color.setHex(pulse > 0.5 ? 0xffffff : 0xff0000);
                    }
                }

                if (e.explosionTimer <= 0) {
                    if (e.mesh.position.distanceToSquared(playerPos) < 144.0) {
                        callbacks.onPlayerHit(60, e, 'BOMBER_EXPLOSION');
                    }
                    e.hp = 0;
                    e.deathState = 'exploded';
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

        if (e.stunTimer > 0) {
            e.stunTimer -= delta;

            if (e.mesh.userData.baseY === undefined) e.mesh.userData.baseY = e.mesh.position.y;
            const twitchX = (Math.random() - 0.5) * 0.2;
            const twitchZ = (Math.random() - 0.5) * 0.2;
            e.mesh.position.x += twitchX;
            e.mesh.position.z += twitchZ;
            e.mesh.rotation.y += (Math.random() - 0.5) * 0.5;

            if (Math.random() < 0.1) {
                callbacks.spawnPart(e.mesh.position.x, e.mesh.position.y + 1.0, e.mesh.position.z, 'stun_star', 1, undefined, undefined, 0xffff00, 0.3);
            }

            if (e.stunTimer <= 0) {
                e.state = AIState.CHASE;
            }
            return;
        }

        if (e.slowTimer > 0) e.slowTimer -= delta;

        if (e.mesh.userData.baseY === undefined) e.mesh.userData.baseY = e.mesh.position.y;
        e.mesh.position.y = e.mesh.userData.baseY + Math.abs(Math.sin(now * (e.state === AIState.CHASE ? 0.018 : 0.009))) * 0.12;

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
    if (e.separationForce) {
        _v3.addScaledVector(e.separationForce, delta * 5.0);
        e.separationForce.set(0, 0, 0);
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
            _v1.set(e.mesh.position.x + (Math.random() - 0.5) * 0.5, e.mesh.position.y + 1.0, e.mesh.position.z + (Math.random() - 0.5) * 0.5);
            callbacks.spawnPart(_v1.x, _v1.y, _v1.z, 'flame', 1);
        }
        if (e.burnTimer > 0) {
            e.burnTimer -= delta;
            if (e.burnTimer <= 0) { e.hp -= 6; callbacks.onDamageDealt(6, e); e.burnTimer = 0.5; }
        }
        if (e.afterburnTimer > 0) {
            e.afterburnTimer -= delta;
            if (e.afterburnTimer <= 0) e.isBurning = false;
        }
    }
}

function handleDeathAnimation(e: Enemy, delta: number, now: number, callbacks: any) {
    const age = now - e.deathTimer!;

    if (e.deathState === 'burning') {
        const duration = 1500;
        const progress = Math.min(1.0, age / duration);

        if (!e.mesh.userData.ashSpawned) {
            e.mesh.userData.ashSpawned = true;
            callbacks.spawnPart(e.mesh.position.x, 0.5, e.mesh.position.z, 'debris', 5, undefined, undefined, 0x333333, 0.5);
        }

        // [VINTERDÖD] Återinförd cache-logik för att undvika frame-by-frame traversering
        let body = e.mesh.userData.bodyCache;
        let colorMats: THREE.Material[] = e.mesh.userData.colorMats;

        if (body === undefined) {
            body = e.mesh.children.find(c => c.userData.isBody) || null;
            e.mesh.userData.bodyCache = body;

            colorMats = [];
            if (body) {
                body.traverse((c: any) => {
                    if (c.isMesh && c.material) colorMats.push(c.material);
                });
            }
            e.mesh.userData.colorMats = colorMats;
        }

        const ash = e.ashPile;

        if (body) {
            const s = Math.max(0.001, (1.0 - progress) * (e.originalScale || 1.0));
            body.scale.set(s * (e.widthScale || 1.0), s, s * (e.widthScale || 1.0));
        }

        if (ash) {
            ash.visible = true;
            const startScale = 0.1;
            const massScale = (e.originalScale || 1.0) * (e.widthScale || 1.0);
            const targetScale = massScale;
            const s = startScale + (targetScale - startScale) * progress;
            ash.scale.setScalar(s);
        }

        // [VINTERDÖD] Platt iteration istället för onödig kloning och callback-funktioner
        _color.set(e.color).lerp(_blackColor, progress);
        if (colorMats) {
            for (let i = 0; i < colorMats.length; i++) {
                (colorMats[i] as any).color.copy(_color);
            }
        }

        if (progress >= 1.0) {
            if (ash && e.mesh.parent) {
                const permanentAsh = ash.clone();
                permanentAsh.applyMatrix4(e.mesh.matrixWorld);

                permanentAsh.quaternion.set(0, 0, 0, 1);
                permanentAsh.position.copy(e.mesh.position);
                permanentAsh.position.y = 0.05;

                const massScale = (e.originalScale || 1.0) * (e.widthScale || 1.0);
                permanentAsh.scale.setScalar(massScale);

                e.mesh.parent.add(permanentAsh);
            }
            if (e.mesh.parent) e.mesh.parent.remove(e.mesh);
            e.deathState = 'dead';
        }
        return;
    }

    if (e.deathState === 'gibbed') {
        if (!e.mesh.userData.gibbed) {
            e.mesh.userData.gibbed = true;
            e.mesh.visible = false;

            const count = (e.type === 'TANK' || e.type === 'BOSS') ? 12 : 6;
            const scale = (e.originalScale || 1.0) * (e.widthScale || 1.0);

            callbacks.spawnPart(e.mesh.position.x, 1.0, e.mesh.position.z, 'blood', 20, undefined, undefined, undefined, scale);
            callbacks.spawnPart(e.mesh.position.x, 1.0, e.mesh.position.z, 'gore', count, undefined, undefined, undefined, scale);
            callbacks.spawnPart(e.mesh.position.x, 1.0, e.mesh.position.z, 'limb', 2, undefined, undefined, undefined, scale);

            callbacks.spawnDecal(e.mesh.position.x, e.mesh.position.z, 2.0 * scale, MATERIALS.bloodDecal);
        }
        if (now - e.deathTimer! > 100) e.deathState = 'dead';
        return;
    }

    if (e.deathState === 'shot' || e.deathState === 'electrified') {
        if (e.deathState === 'electrified') {
            if (!e.mesh.userData.electrocuted) {
                e.mesh.userData.electrocuted = true;
                e.mesh.userData.deathPosX = e.mesh.position.x;
                e.mesh.userData.deathPosZ = e.mesh.position.z;
            }

            if (age < 120) {
                const t = age / 120;
                e.mesh.rotation.x = -Math.PI / 2 * t;
                e.mesh.position.y = Math.max(0.2, (e.mesh.position.y || 1.0) * (1 - t));
            } else {
                const baseHeight = 0.2;
                e.mesh.rotation.x = -Math.PI / 2;
                e.mesh.position.y = baseHeight;

                const jitter = 0.15;
                e.mesh.position.x = e.mesh.userData.deathPosX + (Math.random() - 0.5) * jitter;
                e.mesh.position.z = e.mesh.userData.deathPosZ + (Math.random() - 0.5) * jitter;

                if (Math.random() > 0.4) callbacks.spawnPart(e.mesh.position.x, 0.5, e.mesh.position.z, 'spark', 1);
            }
            e.mesh.quaternion.setFromEuler(e.mesh.rotation);
        }
        else {
            e.deathVel.y -= 35 * delta;
            e.mesh.position.addScaledVector(e.deathVel, delta);
            if (e.mesh.position.y <= 0.2) { e.mesh.position.y = 0.2; e.deathVel.set(0, 0, 0); }
            const targetRot = (Math.PI / 2) * (e.fallForward ? 1 : -1);
            e.mesh.rotation.x += (targetRot - e.mesh.rotation.x) * 0.12;
            e.mesh.quaternion.setFromEuler(e.mesh.rotation);
        }
    }
}