
import * as THREE from 'three';
import { Enemy } from '../EnemyManager';
import { Obstacle } from '../../utils/physics';
import { GEOMETRY, MATERIALS } from '../../utils/assets';
import { soundManager } from '../../utils/sound';
import { WeaponType } from '../../types';

export interface FireZone {
    mesh: THREE.Mesh;
    radius: number;
    life: number;
}

export interface GameContext {
    scene: THREE.Scene;
    enemies: Enemy[];
    obstacles: Obstacle[];
    spawnPart: (x: number, y: number, z: number, type: string, count: number, mesh?: any, vel?: any, color?: number) => void;
    spawnDecal: (x: number, z: number, scale: number, mat?: any) => void;
    explodeEnemy: (e: Enemy, force: THREE.Vector3) => void;
    trackStats: (type: 'damage' | 'hit', amt: number, isBoss?: boolean) => void;
    addScore: (amt: number) => void;
    addFireZone: (z: FireZone) => void;
    now: number;
}

export interface Projectile {
    mesh: THREE.Mesh;
    type: 'bullet' | 'throwable';
    weapon: string;
    vel: THREE.Vector3;
    origin: THREE.Vector3;
    damage: number;
    life: number;
    maxRadius?: number;
    marker?: THREE.Mesh;
    hitEntities?: Set<string>;
}

export interface ThrowableBehavior {
    radius: number;
    fuseTime: number;
    createMesh: () => THREE.Mesh;
    createMarker: (radius: number) => THREE.Mesh;
    onImpact: (pos: THREE.Vector3, radius: number, ctx: GameContext) => void;
}

const DEFAULT_MARKER = (radius: number) => {
    const m = new THREE.Mesh(GEOMETRY.landingMarker, MATERIALS.landingMarker);
    m.scale.set(radius, radius, radius);
    m.rotation.x = -Math.PI / 2;
    return m;
};

const THROWABLE_REGISTRY: Record<string, ThrowableBehavior> = {
    [WeaponType.GRENADE]: {
        radius: 10,
        fuseTime: 1.0,
        createMesh: () => new THREE.Mesh(GEOMETRY.grenade, MATERIALS.grenade),
        createMarker: DEFAULT_MARKER,
        onImpact: (pos, radius, ctx) => {
            ctx.spawnPart(pos.x, 0, pos.z, 'flash', 1, undefined, undefined, 0xffffaa);
            ctx.spawnPart(pos.x, 0, pos.z, 'shockwave', 1, undefined, undefined, 0xffaa00);
            ctx.spawnPart(pos.x, 0, pos.z, 'debris', 15, undefined, undefined, 0xffaa00);
            ctx.spawnDecal(pos.x, pos.z, 2.5, MATERIALS.scorchDecal);
            soundManager.playExplosion();

            const damage = 150;
            const knockbackBase = 1.0;
            const knockbackMax = 10.0;

            for (const e of ctx.enemies) {
                if (e.dead || e.deathState !== 'alive') continue;
                const dist = e.mesh.position.distanceTo(pos);
                if (dist < radius) {
                    const actualDamage = Math.max(0, Math.min(e.hp, damage));
                    e.hp -= damage;
                    ctx.trackStats('damage', actualDamage, !!e.isBoss);
                    ctx.spawnPart(e.mesh.position.x, 1.5, e.mesh.position.z, 'blood', 120);

                    if (e.hp <= 0) {
                        const distRatio = Math.min(1, dist / radius);
                        const forceMag = knockbackBase + (1.0 - distRatio) * (knockbackMax - knockbackBase);
                        const blastDir = new THREE.Vector3().subVectors(e.mesh.position, pos).normalize();
                        blastDir.y = 0.5;
                        blastDir.normalize().multiplyScalar(forceMag);
                        ctx.explodeEnemy(e, blastDir);
                        ctx.addScore(Math.ceil(actualDamage));
                        ctx.spawnPart(e.mesh.position.x, 2, e.mesh.position.z, 'gore', 25);
                        ctx.spawnDecal(e.mesh.position.x, e.mesh.position.z, 2.0, MATERIALS.bloodDecal);
                    } else {
                        e.hitTime = ctx.now;
                    }
                }
            }
        }
    },
    [WeaponType.MOLOTOV]: {
        radius: 15,
        fuseTime: 1.0,
        createMesh: () => new THREE.Mesh(GEOMETRY.molotov, MATERIALS.molotov),
        createMarker: DEFAULT_MARKER,
        onImpact: (pos, radius, ctx) => {
            ctx.spawnPart(pos.x, 0, pos.z, 'glass', 15);
            for (let i = 0; i < 30; i++) {
                const x = pos.x + (Math.random() - 0.5) * 3;
                const z = pos.z + (Math.random() - 0.5) * 3;
                ctx.spawnPart(x, 0.5, z, 'campfire_flame', 1, undefined, undefined, 0xff7700);
            }
            soundManager.playExplosion();

            const fz: FireZone = {
                mesh: new THREE.Mesh(GEOMETRY.fireZone, MATERIALS.fireZone),
                radius: radius,
                life: 5.0
            };
            fz.mesh.rotation.x = -Math.PI / 2;
            fz.mesh.position.set(pos.x, 0.1, pos.z);
            fz.mesh.scale.setScalar(fz.radius / 3.5);
            ctx.scene.add(fz.mesh);
            ctx.addFireZone(fz);
        }
    },
    [WeaponType.FLASHBANG]: {
        radius: 10,
        fuseTime: 1.0,
        createMesh: () => new THREE.Mesh(GEOMETRY.grenade, new THREE.MeshStandardMaterial({ color: 0xcccccc })),
        createMarker: DEFAULT_MARKER,
        onImpact: (pos, radius, ctx) => {
            ctx.spawnPart(pos.x, 2, pos.z, 'flash', 1, undefined, undefined, 0xffffff);
            ctx.spawnPart(pos.x, 1, pos.z, 'spark', 10);
            soundManager.playExplosion();

            const blindDuration = 2500;
            for (const e of ctx.enemies) {
                if (e.mesh.position.distanceTo(pos) < radius) {
                    e.isBlinded = true;
                    e.blindUntil = ctx.now + blindDuration;
                }
            }
        }
    }
};

const BULLET_REGISTRY: Record<string, { geometry: THREE.BufferGeometry, material: THREE.Material, speed: number }> = {
    'DEFAULT': { geometry: GEOMETRY.bullet, material: MATERIALS.bullet, speed: 60 }
};

// Module-level state
let activeProjectiles: Projectile[] = [];
let activeFireZones: FireZone[] = [];

export const ProjectileSystem = {
    // Keep getters for compatibility if needed, though direct access is common in this codebase
    get projectiles() { return activeProjectiles; },
    get fireZones() { return activeFireZones; },

    spawnBullet: (scene: THREE.Scene, origin: THREE.Vector3, dir: THREE.Vector3, weapon: string, damage: number) => {
        const visuals = BULLET_REGISTRY[weapon] || BULLET_REGISTRY['DEFAULT'];
        const b = new THREE.Mesh(visuals.geometry, visuals.material);
        b.position.copy(origin);

        // Rotate bullet to face direction
        const target = origin.clone().add(dir);
        b.lookAt(target);
        b.rotateX(Math.PI / 2); // Align cylinder with forward dir

        scene.add(b);

        activeProjectiles.push({
            mesh: b,
            type: 'bullet',
            weapon: weapon,
            vel: dir.clone().multiplyScalar(visuals.speed),
            origin: origin.clone(),
            damage: damage,
            life: 1.5,
            hitEntities: new Set()
        });
    },

    spawnThrowable: (scene: THREE.Scene, origin: THREE.Vector3, dir: THREE.Vector3, throwableId: string, chargeRatio: number) => {
        const def = THROWABLE_REGISTRY[throwableId];
        if (!def) return;

        const maxDist = 25;
        const throwDist = Math.max(2, chargeRatio * maxDist);

        const proj = def.createMesh();
        proj.position.copy(origin);
        scene.add(proj);

        // Arc Physics
        const gravity = 30;
        const timeToTarget = def.fuseTime;
        const vx = (dir.x * throwDist) / timeToTarget;
        const vz = (dir.z * throwDist) / timeToTarget;
        const vy = (0 - origin.y + 0.5 * gravity * timeToTarget * timeToTarget) / timeToTarget;

        // Marker
        const marker = def.createMarker(def.radius);
        const targetPos = origin.clone().add(dir.clone().normalize().multiplyScalar(throwDist));
        marker.position.set(targetPos.x, 0.1, targetPos.z);
        scene.add(marker);

        activeProjectiles.push({
            mesh: proj,
            type: 'throwable',
            weapon: throwableId,
            vel: new THREE.Vector3(vx, vy, vz),
            origin: origin.clone(),
            damage: 0,
            life: timeToTarget + 0.5,
            maxRadius: def.radius,
            marker: marker
        });
    },

    update: (delta: number, now: number, ctx: Omit<GameContext, 'addFireZone'>) => {
        const fullCtx: GameContext = {
            ...ctx,
            addFireZone: (z) => activeFireZones.push(z),
            now: now
        };

        // --- UPDATE PROJECTILES ---
        for (let i = activeProjectiles.length - 1; i >= 0; i--) {
            const p = activeProjectiles[i];

            if (p.type === 'bullet') {
                updateBullet(p, i, delta, fullCtx);
            } else {
                updateThrowable(p, i, delta, fullCtx, now);
            }
        }

        // --- UPDATE FIRE ZONES ---
        for (let i = activeFireZones.length - 1; i >= 0; i--) {
            const fz = activeFireZones[i];
            fz.life -= delta;

            const flameDensity = 3;
            for (let k = 0; k < flameDensity; k++) {
                const r = Math.sqrt(Math.random()) * (fz.radius * 0.8);
                const theta = Math.random() * 2 * Math.PI;
                const fx = fz.mesh.position.x + r * Math.cos(theta);
                const fzPos = fz.mesh.position.z + r * Math.sin(theta);
                const color = Math.random() > 0.5 ? 0xff5500 : 0xff3300;
                fullCtx.spawnPart(fx, 0.1, fzPos, 'campfire_flame', 1, undefined, undefined, color);
            }

            if (Math.random() > 0.3) {
                const r = Math.sqrt(Math.random()) * fz.radius;
                const theta = Math.random() * 2 * Math.PI;
                const sx = fz.mesh.position.x + r * Math.cos(theta);
                const sz = fz.mesh.position.z + r * Math.sin(theta);
                fullCtx.spawnPart(sx, 0.5, sz, 'campfire_spark', 1, undefined, undefined, 0xffaa00);
            }

            fullCtx.enemies.forEach(e => {
                if (e.dead || e.deathState !== 'alive') return;
                if (e.mesh.position.distanceTo(fz.mesh.position) < fz.radius) {
                    e.isBurning = true;
                    if (e.burnTimer <= 0) e.burnTimer = 0.5;
                    e.afterburnTimer = 2.0;
                }
            });

            if (fz.life <= 0) {
                fullCtx.scene.remove(fz.mesh);
                activeFireZones.splice(i, 1);
            }
        }
    },

    clear: (scene: THREE.Scene) => {
        activeProjectiles.forEach(p => {
            scene.remove(p.mesh);
            if (p.marker) scene.remove(p.marker);
        });
        activeFireZones.forEach(f => scene.remove(f.mesh));
        activeProjectiles = [];
        activeFireZones = [];
    }
};

// --- INTERNAL HELPERS ---

function updateBullet(p: Projectile, index: number, delta: number, ctx: GameContext) {
    p.mesh.position.add(p.vel.clone().multiplyScalar(delta));
    p.life -= delta;

    let destroy = false;

    // Obstacle Collision
    for (const obs of ctx.obstacles) {
        const distSq = p.mesh.position.distanceToSquared(obs.mesh.position);
        const r = obs.radius || 4.0;
        if (distSq < r * r) {
            destroy = true;
            ctx.spawnPart(p.mesh.position.x, p.mesh.position.y, p.mesh.position.z, 'smoke', 2);
            break;
        }
    }

    // Enemy Collision
    if (!destroy) {
        for (const e of ctx.enemies) {
            if (e.dead || e.deathState !== 'alive') continue;
            if (p.hitEntities && p.hitEntities.has(e.mesh.uuid)) continue;

            const dx = p.mesh.position.x - e.mesh.position.x;
            const dz = p.mesh.position.z - e.mesh.position.z;
            if (dx * dx + dz * dz < 1.0) {
                if (Math.abs(p.mesh.position.y - e.mesh.position.y) < 2.0) {
                    ctx.trackStats('hit', 1);
                    const actualDamage = Math.max(0, Math.min(e.hp, p.damage));
                    e.hp -= p.damage;
                    ctx.trackStats('damage', actualDamage, !!e.isBoss);
                    e.hitTime = ctx.now;

                    ctx.spawnPart(e.mesh.position.x, 1.5, e.mesh.position.z, 'blood', 80);
                    ctx.spawnDecal(e.mesh.position.x, e.mesh.position.z, 0.7 + Math.random() * 0.5, MATERIALS.bloodDecal);
                    e.slowTimer = 0.5;

                    if (e.isBoss) {
                        ctx.spawnPart(e.mesh.position.x, 2, e.mesh.position.z, 'gore', 8);
                        ctx.spawnDecal(e.mesh.position.x, e.mesh.position.z, 1.2 + Math.random(), MATERIALS.bloodDecal);
                    }

                    if (e.hp <= 0) {
                        const distFromOrigin = p.origin.distanceTo(e.mesh.position);
                        const isShotgun = p.weapon === WeaponType.SHOTGUN;
                        const isRevolver = p.weapon === WeaponType.REVOLVER;

                        let shouldGib = false;
                        if (!e.isBoss) {
                            if (isShotgun) shouldGib = distFromOrigin < 5.0;
                            else if (isRevolver) {
                                const hitCount = p.hitEntities ? p.hitEntities.size : 0;
                                shouldGib = hitCount <= 1;
                            }
                        }

                        if (shouldGib) {
                            const explodeForce = p.vel.clone().normalize().multiplyScalar(4.0);
                            ctx.explodeEnemy(e, explodeForce);
                            ctx.addScore(Math.ceil(actualDamage));
                            ctx.spawnPart(e.mesh.position.x, 2, e.mesh.position.z, 'gore', 25);
                            ctx.spawnDecal(e.mesh.position.x, e.mesh.position.z, 2.5, MATERIALS.bloodDecal);
                            if (!isRevolver) { destroy = true; break; }
                        } else {
                            if (e.isBoss) e.dead = true;
                            else {
                                e.deathState = 'falling';
                                e.deathTimer = 2.0;

                                const baseSpeed = e.speed * 10;
                                const isMoving = e.velocity.lengthSq() > 0.1;
                                let finalVelocity = new THREE.Vector3();

                                if (isMoving) {
                                    finalVelocity.copy(e.velocity).normalize().multiplyScalar(baseSpeed * 1.5);
                                    finalVelocity.add(p.vel.clone().normalize().multiplyScalar(2.0));
                                } else {
                                    let impactForce = 12;
                                    if (isShotgun) {
                                        const forceFactor = Math.max(0.2, 1.0 - (distFromOrigin / 12.0));
                                        impactForce = 30 * forceFactor;
                                    } else if (isRevolver) impactForce = 25;
                                    finalVelocity.copy(p.vel).normalize().multiplyScalar(impactForce);
                                }
                                finalVelocity.y = 2.0;
                                e.deathVel = finalVelocity;
                            }
                        }
                        ctx.addScore(Math.ceil(actualDamage));
                    }

                    if (p.weapon === WeaponType.REVOLVER) {
                        if (!p.hitEntities) p.hitEntities = new Set();
                        p.hitEntities.add(e.mesh.uuid);
                        p.damage = Math.floor(p.damage * 0.7);
                        if (p.damage < 10) { destroy = true; break; }
                    } else { destroy = true; break; }
                }
            }
        }
    }

    if (destroy || p.life <= 0) {
        ctx.scene.remove(p.mesh);
        activeProjectiles.splice(index, 1);
    }
}

function updateThrowable(p: Projectile, index: number, delta: number, ctx: GameContext, now: number) {
    p.vel.y -= 30 * delta;
    p.mesh.position.add(p.vel.clone().multiplyScalar(delta));
    p.mesh.rotation.x += 10 * delta;

    if (p.marker) {
        const pulse = Math.abs(Math.sin(now * 0.015));
        (p.marker.material as THREE.Material).opacity = 0.3 + 0.7 * pulse;
        const scaleBase = p.maxRadius || 1.0;
        const scalePulse = 1.0 + 0.05 * pulse;
        p.marker.scale.set(scaleBase * scalePulse, scaleBase * scalePulse, scaleBase * scalePulse);
    }

    // Ground Hit or Fuse Expired
    const isGroundHit = p.mesh.position.y <= 0.2;
    const isFuseExpired = p.life <= 0;

    if (isGroundHit || isFuseExpired) {
        ctx.scene.remove(p.mesh);
        if (p.marker) ctx.scene.remove(p.marker);
        activeProjectiles.splice(index, 1);

        const pos = p.mesh.position.clone();
        if (isGroundHit) pos.y = 0; // Snap to ground for impact

        const behavior = THROWABLE_REGISTRY[p.weapon];
        if (behavior) {
            behavior.onImpact(pos, p.maxRadius || behavior.radius, ctx);
        }
    } else {
        p.life -= delta;
    }
}
