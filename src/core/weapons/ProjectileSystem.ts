import * as THREE from 'three';
import { Enemy } from '../EnemyManager';
import { Obstacle } from '../systems/WindSystem';
import { GEOMETRY, MATERIALS } from '../../utils/assets';
import { soundManager } from '../../utils/sound';
import { WEAPONS, WeaponBehavior, WeaponType } from '../../content/weapons';
import { SpatialGrid } from '../world/SpatialGrid';

// --- INTERFACES ---

export interface FireZone {
    mesh: THREE.Mesh;
    radius: number;
    life: number;
    _lastDamageTime?: number;
}

export interface GameContext {
    scene: THREE.Scene;
    enemies: Enemy[];
    collisionGrid: SpatialGrid;
    spawnPart: (x: number, y: number, z: number, type: string, count: number, mesh?: any, vel?: any, color?: number, scale?: number) => void;
    spawnDecal: (x: number, z: number, scale: number, mat?: any) => void;
    explodeEnemy: (e: Enemy, force: THREE.Vector3) => void;
    trackStats: (type: 'damage' | 'hit', amt: number, isBoss?: boolean) => void;
    addScore: (amt: number) => void;
    addFireZone: (z: FireZone) => void;
    now: number;
    noiseEvents?: { pos: THREE.Vector3, radius: number, time: number, active: boolean }[];
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
    hitEntities: Set<string>; // Prevents multiple hits on the same enemy per projectile
    active: boolean;
}

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3();

const PROJECTILE_POOL: Projectile[] = [];

// --- REGISTRIES ---

const THROWABLE_BEHAVIORS: Record<string, { onImpact: (pos: THREE.Vector3, radius: number, ctx: GameContext, damage?: number) => void }> = {
    [WeaponType.GRENADE]: {
        onImpact: (pos, radius, ctx, damage = 180) => {
            ctx.spawnPart(pos.x, 0, pos.z, 'flash', 1);
            ctx.spawnPart(pos.x, 0, pos.z, 'shockwave', 1);
            ctx.spawnPart(pos.x, 0, pos.z, 'debris', 25);
            ctx.spawnDecal(pos.x, pos.z, 2.5, MATERIALS.scorchDecal);
            soundManager.playExplosion();

            if (ctx.noiseEvents) ctx.noiseEvents.push({ pos: pos.clone(), radius: 80, time: ctx.now, active: true });

            const nearby = ctx.collisionGrid.getNearbyEnemies(pos, radius + 2.0);
            for (let i = 0; i < nearby.length; i++) {
                const e = nearby[i];
                if (e.deathState !== 'alive') continue;

                _v1.subVectors(e.mesh.position, pos);
                const distSq = _v1.lengthSq();
                const totalRad = radius + (0.5 * e.widthScale * e.originalScale);

                if (distSq < totalRad * totalRad) {
                    const actualDmg = Math.max(0, Math.min(e.hp, damage));
                    e.lastDamageType = WeaponType.GRENADE; // Standard explosion death
                    e.hp -= damage;
                    ctx.trackStats('damage', actualDmg, !!e.isBoss);

                    if (e.hp <= 0) {
                        const force = 12.0 * (1.0 - Math.sqrt(distSq) / radius);
                        _v4.copy(_v1).normalize().setY(0.5).multiplyScalar(force);
                        ctx.explodeEnemy(e, _v4);
                    }
                }
            }
        }
    },
    [WeaponType.MOLOTOV]: {
        onImpact: (pos, radius, ctx) => {
            ctx.spawnPart(pos.x, 0, pos.z, 'glass', 15);
            soundManager.playExplosion();

            const fz: FireZone = { mesh: new THREE.Mesh(GEOMETRY.fireZone, MATERIALS.fireZone), radius, life: 6.0 };
            fz.mesh.rotation.x = -Math.PI / 2;
            fz.mesh.position.set(pos.x, 0.24, pos.z);
            fz.mesh.scale.setScalar(fz.radius / 3.5);
            ctx.scene.add(fz.mesh);
            ctx.addFireZone(fz);

            // Instant ignition for enemies caught in the initial burst
            const direct = ctx.collisionGrid.getNearbyEnemies(pos, radius);
            for (const e of direct) {
                e.lastDamageType = WeaponType.MOLOTOV;
                e.isBurning = true;
                e.afterburnTimer = 5.0;
            }
        }
    },
    [WeaponType.FLASHBANG]: {
        onImpact: (pos, radius, ctx) => {
            ctx.spawnPart(pos.x, 2, pos.z, 'flash', 1);
            soundManager.playExplosion();
            const nearby = ctx.collisionGrid.getNearbyEnemies(pos, radius);
            for (const e of nearby) {
                e.isBlinded = true;
                e.blindTimer = 4.0;
                e.stunTimer = 1.5;
            }
        }
    }
};

// --- SYSTEM ---

export const ProjectileSystem = {
    _getProjectile: (type: 'bullet' | 'throwable', weapon: string, mesh: THREE.Mesh): Projectile => {
        for (let i = 0; i < PROJECTILE_POOL.length; i++) {
            const p = PROJECTILE_POOL[i];
            if (!p.active) {
                p.type = type; p.weapon = weapon; p.mesh = mesh;
                p.hitEntities.clear(); p.active = true;
                return p;
            }
        }
        const p: Projectile = { mesh, type, weapon, vel: new THREE.Vector3(), origin: new THREE.Vector3(), damage: 0, life: 0, hitEntities: new Set(), active: true };
        PROJECTILE_POOL.push(p);
        return p;
    },

    spawnBullet: (scene: THREE.Scene, projectiles: Projectile[], origin: THREE.Vector3, dir: THREE.Vector3, weapon: string) => {
        const data = WEAPONS[weapon];
        if (!data) return;

        const mesh = new THREE.Mesh(GEOMETRY.bullet, MATERIALS.bullet);
        mesh.position.copy(origin);

        // Spread calculation
        _v2.copy(origin).add(dir);
        _v2.x += (Math.random() - 0.5) * data.spread;
        _v2.z += (Math.random() - 0.5) * data.spread;
        mesh.lookAt(_v2);
        mesh.rotateX(Math.PI / 2);
        scene.add(mesh);

        const p = ProjectileSystem._getProjectile('bullet', weapon, mesh);
        p.vel.copy(dir).multiplyScalar(data.bulletSpeed || 70);
        p.origin.copy(origin); // Track origin for distance-based gibbing
        p.damage = data.damage;
        p.life = 1.5;
        projectiles.push(p);
    },

    spawnThrowable: (scene: THREE.Scene, projectiles: Projectile[], origin: THREE.Vector3, dir: THREE.Vector3, weapon: string, charge: number) => {
        const data = WEAPONS[weapon];
        if (!data) return;

        const throwDist = 5 + charge * 30;
        const mesh = new THREE.Mesh(GEOMETRY.grenade, MATERIALS.grenade);
        if (weapon === WeaponType.MOLOTOV) mesh.material = MATERIALS.molotov;

        mesh.position.copy(origin);
        scene.add(mesh);

        const p = ProjectileSystem._getProjectile('throwable', weapon, mesh);
        const time = 1.0;
        p.vel.set((dir.x * throwDist) / time, (0 - origin.y + 0.5 * 30 * time * time) / time, (dir.z * throwDist) / time);
        p.origin.copy(origin);
        p.damage = data.damage;
        p.life = time + 0.5;
        p.maxRadius = data.range;

        const marker = new THREE.Mesh(GEOMETRY.landingMarker, MATERIALS.landingMarker);
        _v3.copy(dir).normalize().multiplyScalar(throwDist);
        marker.position.copy(origin).add(_v3).setY(0.1);
        marker.rotation.x = -Math.PI / 2;
        marker.scale.setScalar(data.range);
        scene.add(marker);
        p.marker = marker;

        projectiles.push(p);
    },

    update: (delta: number, now: number, ctx: Omit<GameContext, 'addFireZone'>, projectiles: Projectile[], fireZones: FireZone[]) => {
        const fullCtx: GameContext = { ...ctx, addFireZone: (z) => fireZones.push(z), now: now };

        for (let i = projectiles.length - 1; i >= 0; i--) {
            const p = projectiles[i];
            if (p.type === 'bullet') updateBullet(p, i, delta, fullCtx, projectiles);
            else updateThrowable(p, i, delta, fullCtx, now, projectiles);
        }

        for (let i = fireZones.length - 1; i >= 0; i--) {
            const fz = fireZones[i];
            fz.life -= delta;
            if (!fz._lastDamageTime || now - fz._lastDamageTime > 500) {
                fz._lastDamageTime = now;
                const nearby = fullCtx.collisionGrid.getNearbyEnemies(fz.mesh.position, fz.radius);
                for (const e of nearby) {
                    if (e.deathState !== 'alive') continue;
                    e.lastDamageType = WeaponType.MOLOTOV; // Vital for burning death
                    e.hp -= 15;
                    e.isBurning = true;
                    e.afterburnTimer = 5.0;
                    e.burnTimer = 0.5;
                    fullCtx.trackStats('damage', 15, !!e.isBoss);
                }
            }
            if (Math.random() > 0.5) {
                const r = Math.sqrt(Math.random()) * fz.radius;
                const theta = Math.random() * Math.PI * 2;
                fullCtx.spawnPart(fz.mesh.position.x + r * Math.cos(theta), 0.2, fz.mesh.position.z + r * Math.sin(theta), 'campfire_flame', 1);
            }
            if (fz.life <= 0) { fullCtx.scene.remove(fz.mesh); fireZones.splice(i, 1); }
        }
    },

    clear: (scene: THREE.Scene, projectiles: Projectile[], fireZones: FireZone[]) => {
        for (const p of projectiles) {
            scene.remove(p.mesh);
            if (p.marker) scene.remove(p.marker);
            p.active = false;
        }
        for (const f of fireZones) scene.remove(f.mesh);
        projectiles.length = 0; fireZones.length = 0;
    }
};

// --- INTERNAL HELPERS ---



function updateBullet(p: Projectile, index: number, delta: number, ctx: GameContext, projectiles: Projectile[]) {
    p.mesh.position.addScaledVector(p.vel, delta);
    p.life -= delta;
    let destroyBullet = false;
    const data = WEAPONS[p.weapon];
    if (!data) return;

    // A. Obstacle Collision
    const nearbyObs = ctx.collisionGrid.getNearbyObstacles(p.mesh.position, 2.0);
    for (const obs of nearbyObs) {
        if (p.mesh.position.distanceToSquared(obs.mesh.position) < (obs.radius || 2) ** 2) {
            destroyBullet = true;
            ctx.spawnPart(p.mesh.position.x, p.mesh.position.y, p.mesh.position.z, 'smoke', 3);
            soundManager.playImpact(obs.mesh.userData?.material || 'concrete');
            break;
        }
    }

    // B. Enemy Collision (PIERCING ENABLED)
    if (!destroyBullet) {
        const nearbyEnemies = ctx.collisionGrid.getNearbyEnemies(p.mesh.position, 2.5);

        // Piercing requires hitting the closest enemy first
        if (data.piercing && nearbyEnemies.length > 1) {
            nearbyEnemies.sort((a, b) => p.mesh.position.distanceToSquared(a.mesh.position) - p.mesh.position.distanceToSquared(b.mesh.position));
        }

        for (const e of nearbyEnemies) {
            if (e.deathState !== 'alive' || p.hitEntities.has(e.id)) continue;

            const scale = e.originalScale || 1.0;
            const hitRad = 0.6 * e.widthScale * scale;
            _v1.subVectors(p.mesh.position, e.mesh.position);

            // Sphere-ish Hitbox Check
            if (_v1.x * _v1.x + _v1.z * _v1.z < hitRad * hitRad && Math.abs(p.mesh.position.y - e.mesh.position.y) < 4.0 * scale) {

                // --- SPECIAL: GIBBING LOGIC ---
                let isHighImpact = false;
                if (p.weapon === WeaponType.SHOTGUN) {
                    // Close range shotgun blasts gib
                    if (p.mesh.position.distanceTo(p.origin) < 6.0) isHighImpact = true;
                } else if (p.weapon === WeaponType.REVOLVER) {
                    // Fresh revolver bullets (first or second hit) gib
                    if (p.damage >= data.baseDamage * 0.8) isHighImpact = true;
                }
                e.lastHitWasHighImpact = isHighImpact;

                // --- APPLY HIT ---
                e.lastDamageType = p.weapon;
                const actualDmg = Math.max(0, Math.min(e.hp, p.damage));
                e.hp -= p.damage;
                e.hitTime = ctx.now;
                e.slowTimer = 0.45;
                p.hitEntities.add(e.id);

                // --- APPLY STATUS EFFECTS ---
                if (data.statusEffect.type === 'burning') {
                    e.isBurning = true; e.afterburnTimer = data.statusEffect.duration; e.burnTimer = 0.5;
                } else if (data.statusEffect.type === 'electrified') {
                    e.stunTimer = data.statusEffect.duration;
                }

                ctx.trackStats('hit', 1);
                ctx.trackStats('damage', actualDmg, !!e.isBoss);
                ctx.spawnPart(p.mesh.position.x, p.mesh.position.y, p.mesh.position.z, 'blood', 45);
                soundManager.playImpact('flesh');

                // --- PIERCING LOOP ---
                if (data.piercing) {
                    p.damage *= data.pierceDecay;
                    // Bullet dissipates if too weak
                    if (p.damage < 15) { destroyBullet = true; break; }
                    // CONTINUES: We do not break the for-loop here if piercing
                } else {
                    destroyBullet = true;
                    break;
                }
            }
        }
    }

    if (destroyBullet || p.life <= 0) {
        ctx.scene.remove(p.mesh); p.active = false;
        projectiles.splice(index, 1);
    }
}

function updateThrowable(p: Projectile, index: number, delta: number, ctx: GameContext, now: number, projectiles: Projectile[]) {
    p.vel.y -= 30 * delta; // Gravity
    p.mesh.position.addScaledVector(p.vel, delta);
    p.mesh.rotation.x += 8 * delta;
    if (p.marker) (p.marker.material as any).opacity = 0.4 + Math.abs(Math.sin(now * 0.01)) * 0.6;

    if (p.mesh.position.y <= 0.1 || p.life <= 0) {
        ctx.scene.remove(p.mesh); if (p.marker) ctx.scene.remove(p.marker);
        _v1.copy(p.mesh.position).setY(0);
        const behavior = THROWABLE_BEHAVIORS[p.weapon];
        if (behavior) behavior.onImpact(_v1, p.maxRadius || 10, ctx, p.damage);
        p.active = false; projectiles.splice(index, 1);
    } else p.life -= delta;
}