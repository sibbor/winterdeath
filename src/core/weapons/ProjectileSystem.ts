import * as THREE from 'three';
import { Enemy } from '../EnemyManager';
import { Obstacle } from '../../utils/physics';
import { GEOMETRY, MATERIALS } from '../../utils/assets';
import { soundManager } from '../../utils/sound';
import { WeaponType } from '../../types';

// --- INTERFACES ---

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
    noiseEvents?: { pos: THREE.Vector3, radius: number, time: number }[];
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

// --- OPTIMIZATION SCRATCHPADS ---
// These pre-allocated vectors prevent memory allocations in the update loop
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();

// --- REGISTRIES ---

const DEFAULT_MARKER = (radius: number) => {
    const m = new THREE.Mesh(GEOMETRY.landingMarker, MATERIALS.landingMarker);
    m.scale.set(radius, radius, radius);
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.22;
    m.renderOrder = 8;
    return m;
};

const THROWABLE_REGISTRY: Record<string, ThrowableBehavior> = {
    [WeaponType.GRENADE]: {
        radius: 10,
        fuseTime: 1.0,
        createMesh: () => new THREE.Mesh(GEOMETRY.grenade, MATERIALS.grenade),
        createMarker: DEFAULT_MARKER,
        onImpact: (pos, radius, ctx) => {
            ctx.spawnPart(pos.x, 0, pos.z, 'flash', 1);
            ctx.spawnPart(pos.x, 0, pos.z, 'shockwave', 1);
            ctx.spawnPart(pos.x, 0, pos.z, 'debris', 15);
            ctx.spawnDecal(pos.x, pos.z, 2.5, MATERIALS.scorchDecal);
            soundManager.playExplosion();

            if (ctx.noiseEvents) {
                ctx.noiseEvents.push({ pos: pos.clone(), radius: 75, time: ctx.now });
            }

            const damage = 150;
            const knockbackBase = 1.0;
            const knockbackMax = 10.0;

            for (const e of ctx.enemies) {
                if (e.dead || e.deathState !== 'alive') continue;

                const dist = e.mesh.position.distanceTo(pos);
                const enemyRadius = 0.5 * (e.widthScale || 1.0) * (e.originalScale || 1.0);

                if (dist < radius + enemyRadius) {
                    const actualDamage = Math.max(0, Math.min(e.hp, damage));
                    e.hp -= damage;
                    ctx.trackStats('damage', actualDamage, !!e.isBoss);
                    ctx.spawnPart(e.mesh.position.x, 1.5 * (e.originalScale || 1.0), e.mesh.position.z, 'blood', 120);

                    if (e.hp <= 0) {
                        const distRatio = Math.min(1, dist / radius);
                        const forceMag = knockbackBase + (1.0 - distRatio) * (knockbackMax - knockbackBase);

                        // Optimized direction using scratchpad
                        _v1.subVectors(e.mesh.position, pos).normalize();
                        _v1.y = 0.5;
                        _v1.normalize().multiplyScalar(forceMag);

                        ctx.explodeEnemy(e, _v1);
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
                ctx.spawnPart(x, 0.5, z, 'campfire_flame', 1);
            }
            soundManager.playExplosion();

            if (ctx.noiseEvents) {
                ctx.noiseEvents.push({ pos: pos.clone(), radius: 75, time: ctx.now });
            }

            const fz: FireZone = {
                mesh: new THREE.Mesh(GEOMETRY.fireZone, MATERIALS.fireZone),
                radius: radius,
                life: 5.0
            };
            fz.mesh.rotation.x = -Math.PI / 2;
            fz.mesh.position.set(pos.x, 0.24, pos.z);
            fz.mesh.scale.setScalar(fz.radius / 3.5);
            fz.mesh.renderOrder = 9;
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
            ctx.spawnPart(pos.x, 2, pos.z, 'flash', 1);
            ctx.spawnPart(pos.x, 1, pos.z, 'spark', 10);
            soundManager.playExplosion();

            if (ctx.noiseEvents) {
                ctx.noiseEvents.push({ pos: pos.clone(), radius: 75, time: ctx.now });
            }

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

// --- SYSTEM ---

export const ProjectileSystem = {
    spawnBullet: (scene: THREE.Scene, projectiles: Projectile[], origin: THREE.Vector3, dir: THREE.Vector3, weapon: string, damage: number) => {
        const visuals = BULLET_REGISTRY[weapon] || BULLET_REGISTRY['DEFAULT'];
        const b = new THREE.Mesh(visuals.geometry, visuals.material);
        b.position.copy(origin);

        _v1.copy(origin).add(dir);
        b.lookAt(_v1);
        b.rotateX(Math.PI / 2);

        scene.add(b);

        projectiles.push({
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

    spawnThrowable: (scene: THREE.Scene, projectiles: Projectile[], origin: THREE.Vector3, dir: THREE.Vector3, throwableId: string, chargeRatio: number) => {
        const def = THROWABLE_REGISTRY[throwableId];
        if (!def) return;

        const maxDist = 25;
        const throwDist = Math.max(2, chargeRatio * maxDist);
        const proj = def.createMesh();
        proj.position.copy(origin);
        scene.add(proj);

        const gravity = 30;
        const timeToTarget = def.fuseTime;
        const vx = (dir.x * throwDist) / timeToTarget;
        const vz = (dir.z * throwDist) / timeToTarget;
        const vy = (0 - origin.y + 0.5 * gravity * timeToTarget * timeToTarget) / timeToTarget;

        const marker = def.createMarker(def.radius);
        _v1.copy(dir).normalize().multiplyScalar(throwDist);
        marker.position.copy(origin).add(_v1);
        marker.position.y = 0.1;
        scene.add(marker);

        projectiles.push({
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

    update: (delta: number, now: number, ctx: Omit<GameContext, 'addFireZone'>, projectiles: Projectile[], fireZones: FireZone[]) => {
        const fullCtx: GameContext = {
            ...ctx,
            addFireZone: (z) => fireZones.push(z),
            now: now
        };

        // Update Projectiles
        for (let i = projectiles.length - 1; i >= 0; i--) {
            const p = projectiles[i];
            if (p.type === 'bullet') updateBullet(p, i, delta, fullCtx, projectiles);
            else updateThrowable(p, i, delta, fullCtx, now, projectiles);
        }

        // Update Fire Zones
        for (let i = fireZones.length - 1; i >= 0; i--) {
            const fz = fireZones[i];
            fz.life -= delta;

            // Using flameDensity with pooled particles is safe
            const flameDensity = 15;
            for (let k = 0; k < flameDensity; k++) {
                const r = Math.sqrt(Math.random()) * (fz.radius * 0.9);
                const theta = Math.random() * 2 * Math.PI;
                const fx = fz.mesh.position.x + r * Math.cos(theta);
                const fzPos = fz.mesh.position.z + r * Math.sin(theta);
                fullCtx.spawnPart(fx, 0.1, fzPos, 'campfire_flame', 1);
            }

            if (fz.life <= 0) {
                fullCtx.scene.remove(fz.mesh);
                fireZones.splice(i, 1);
            }
        }
    },

    clear: (scene: THREE.Scene, projectiles: Projectile[], fireZones: FireZone[]) => {
        projectiles.forEach(p => {
            scene.remove(p.mesh);
            if (p.marker) scene.remove(p.marker);
        });
        fireZones.forEach(f => scene.remove(f.mesh));
        projectiles.length = 0;
        fireZones.length = 0;
    }
};

// --- OPTIMIZED INTERNAL HELPERS ---

function updateBullet(p: Projectile, index: number, delta: number, ctx: GameContext, projectiles: Projectile[]) {
    // Zero-GC position update
    p.mesh.position.addScaledVector(p.vel, delta);
    p.life -= delta;

    let destroy = false;

    // Obstacle Collision (Using distanceToSquared for performance)
    for (const obs of ctx.obstacles) {
        const r = obs.radius || 4.0;
        if (p.mesh.position.distanceToSquared(obs.mesh.position) < r * r) {
            destroy = true;
            ctx.spawnPart(p.mesh.position.x, p.mesh.position.y, p.mesh.position.z, 'smoke', 2);
            soundManager.playImpact(obs.mesh.userData?.material?.toLowerCase() || 'concrete');
            break;
        }
    }

    // Enemy Collision
    if (!destroy) {
        for (const e of ctx.enemies) {
            if (e.dead || e.deathState !== 'alive') continue;
            if (p.hitEntities && p.hitEntities.has(e.mesh.uuid)) continue;

            const scale = e.originalScale || 1.0;
            const horizontalScale = (e.widthScale || 1.0) * scale;
            const dx = p.mesh.position.x - e.mesh.position.x;
            const dz = p.mesh.position.z - e.mesh.position.z;
            const hitRadius = 1.0 * horizontalScale;

            if (dx * dx + dz * dz < hitRadius * hitRadius) {
                if (Math.abs(p.mesh.position.y - e.mesh.position.y) < 6.0 * scale) {
                    ctx.trackStats('hit', 1);
                    const actualDamage = Math.max(0, Math.min(e.hp, p.damage));
                    e.hp -= p.damage;
                    ctx.trackStats('damage', actualDamage, !!e.isBoss);
                    e.hitTime = ctx.now;

                    ctx.spawnPart(e.mesh.position.x, 1.5 * scale, e.mesh.position.z, 'blood', 80);
                    soundManager.playImpact('flesh');
                    ctx.spawnDecal(e.mesh.position.x, e.mesh.position.z, (0.7 + Math.random() * 0.5) * horizontalScale, MATERIALS.bloodDecal);

                    e.slowTimer = 0.5;

                    // Piercing Logic (Revolver)
                    if (p.weapon === WeaponType.REVOLVER) {
                        if (!p.hitEntities) p.hitEntities = new Set();
                        p.hitEntities.add(e.mesh.uuid);
                        p.damage *= 0.7;
                        if (p.damage < 10) destroy = true;
                    } else {
                        destroy = true;
                    }

                    if (e.hp <= 0) {
                        _v1.copy(p.vel).normalize().multiplyScalar(4.0);
                        ctx.explodeEnemy(e, _v1);
                    }
                    if (destroy) break;
                }
            }
        }
    }

    if (destroy || p.life <= 0) {
        ctx.scene.remove(p.mesh);
        projectiles.splice(index, 1);
    }
}

function updateThrowable(p: Projectile, index: number, delta: number, ctx: GameContext, now: number, projectiles: Projectile[]) {
    p.vel.y -= 30 * delta;
    p.mesh.position.addScaledVector(p.vel, delta);
    p.mesh.rotation.x += 10 * delta;

    if (p.marker) {
        const pulse = Math.abs(Math.sin(now * 0.015));
        const mat = p.marker.material as any;
        if (mat.opacity !== undefined) mat.opacity = 0.3 + 0.7 * pulse;
    }

    if (p.mesh.position.y <= 0.2 || p.life <= 0) {
        ctx.scene.remove(p.mesh);
        if (p.marker) ctx.scene.remove(p.marker);

        _v1.copy(p.mesh.position);
        if (p.mesh.position.y <= 0.2) _v1.y = 0;

        const behavior = THROWABLE_REGISTRY[p.weapon];
        if (behavior) behavior.onImpact(_v1, p.maxRadius || behavior.radius, ctx);

        projectiles.splice(index, 1);
    } else {
        p.life -= delta;
    }
}