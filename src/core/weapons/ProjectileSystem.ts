import * as THREE from 'three';
import { Enemy } from '../EnemyManager';
import { Obstacle } from '../world/CollisionResolution';
import { GEOMETRY, MATERIALS } from '../../utils/assets';
import { soundManager } from '../../utils/sound';
import { WEAPONS, WeaponBehavior, WeaponType } from '../../content/weapons';
import { FXSystem } from '../systems/FXSystem';
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
    spawnFloatingText: (x: number, y: number, z: number, text: string, color?: string) => void;
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
    hitEntities: Set<string>;
    active: boolean;
}

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3();

// Dedicated scratchpads for Arc-Cannon continuous fire
const _arcCannonHitList: Enemy[] = [];
const _arcCannonHitIds = new Set<string>();

// ZERO-GC Pools
const PROJECTILE_POOL: Projectile[] = [];
const FIREZONE_POOL: FireZone[] = [];

// --- REGISTRIES ---

const THROWABLE_BEHAVIORS: Record<string, { onImpact: (pos: THREE.Vector3, radius: number, ctx: GameContext, damage?: number) => void }> = {
    [WeaponType.GRENADE]: {
        onImpact: (pos, radius, ctx, damage = 180) => {
            ctx.spawnPart(pos.x, 0, pos.z, 'flash', 1, undefined, undefined, undefined, 15.0);
            ctx.spawnPart(pos.x, 0, pos.z, 'shockwave', 1, undefined, undefined, undefined, 12.0);
            ctx.spawnPart(pos.x, 0, pos.z, 'debris', 25, undefined, undefined, undefined, 2.0);
            ctx.spawnDecal(pos.x, pos.z, 2.5, MATERIALS.scorchDecal);
            soundManager.playExplosion();

            if (ctx.noiseEvents) ctx.noiseEvents.push({ pos: pos.clone(), radius: 80, time: ctx.now, active: true });

            const nearby = ctx.collisionGrid.getNearbyEnemies(pos, radius + 3.0);
            for (let i = 0; i < nearby.length; i++) {
                const e = nearby[i];
                if (e.deathState !== 'alive') continue;

                _v2.subVectors(e.mesh.position, pos);
                const distSq = _v2.lengthSq();
                const totalRad = radius + (1.0 * e.widthScale * e.originalScale);

                if (distSq < totalRad * totalRad) {
                    const actualDmg = Math.max(0, Math.min(e.hp, damage));
                    e.lastDamageType = WeaponType.GRENADE;
                    e.hp -= damage;
                    ctx.trackStats('damage', actualDmg, !!e.isBoss);
                    if (ctx.spawnFloatingText) ctx.spawnFloatingText(e.mesh.position.x, 2, e.mesh.position.z, Math.round(damage).toString(), '#ffaa00');

                    if (e.hp <= 0) {
                        const force = 15.0 * (1.0 - Math.sqrt(distSq) / radius);
                        _v4.copy(_v2).normalize().setY(0.5).multiplyScalar(force);
                        ctx.explodeEnemy(e, _v4);
                    } else {
                        const mass = (e.originalScale || 1.0) * (e.widthScale || 1.0);
                        _v4.copy(_v2).normalize().multiplyScalar(25 / mass).setY(2.0);
                        e.knockbackVel.add(_v4);
                    }
                }
            }
        }
    },
    [WeaponType.MOLOTOV]: {
        onImpact: (pos, radius, ctx) => {
            ctx.spawnPart(pos.x, 0, pos.z, 'glass', 15);
            soundManager.playExplosion();

            // ZERO-GC: Pool FireZones
            let fz: FireZone | null = null;
            for (let i = 0; i < FIREZONE_POOL.length; i++) {
                if (FIREZONE_POOL[i].life <= 0) {
                    fz = FIREZONE_POOL[i];
                    break;
                }
            }
            if (!fz) {
                fz = { mesh: new THREE.Mesh(GEOMETRY.fireZone, MATERIALS.fireZone), radius, life: 6.0 };
                FIREZONE_POOL.push(fz);
            }

            fz.radius = radius;
            fz.life = 6.0;
            fz._lastDamageTime = 0;
            fz.mesh.rotation.x = -Math.PI / 2;
            fz.mesh.position.set(pos.x, 0.24, pos.z);
            fz.mesh.scale.setScalar(fz.radius / 3.5);

            if (fz.mesh.parent !== ctx.scene) ctx.scene.add(fz.mesh);
            ctx.addFireZone(fz);

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
            ctx.spawnPart(pos.x, 2, pos.z, 'flash', 1, undefined, undefined, undefined, 8.0);
            soundManager.playExplosion();
            const nearby = ctx.collisionGrid.getNearbyEnemies(pos, radius);
            for (const e of nearby) {
                e.isBlinded = true;
                e.blindTimer = 4.0;
                e.stunTimer = 1.5;
                ctx.spawnPart(e.mesh.position.x, 1.8, e.mesh.position.z, 'stun_star', 3, undefined, undefined, undefined, 0.8);
            }
        }
    }
};

// --- SYSTEM ---

export const ProjectileSystem = {
    // ZERO-GC: Reuses both the data object AND the underlying THREE.Mesh
    _getProjectile: (): Projectile => {
        for (let i = 0; i < PROJECTILE_POOL.length; i++) {
            const p = PROJECTILE_POOL[i];
            if (!p.active) {
                p.hitEntities.clear();
                p.active = true;
                return p;
            }
        }

        // Pre-allocate new projectile if pool is empty
        const p: Projectile = {
            mesh: new THREE.Mesh(),
            type: 'bullet',
            weapon: '',
            vel: new THREE.Vector3(),
            origin: new THREE.Vector3(),
            damage: 0,
            life: 0,
            hitEntities: new Set(),
            active: true
        };
        PROJECTILE_POOL.push(p);
        return p;
    },

    spawnBullet: (scene: THREE.Scene, projectiles: Projectile[], origin: THREE.Vector3, dir: THREE.Vector3, weapon: string) => {
        const data = WEAPONS[weapon];
        if (!data) return;

        const p = ProjectileSystem._getProjectile();
        p.type = 'bullet';
        p.weapon = weapon;

        // Configure pooled mesh
        p.mesh.geometry = GEOMETRY.bullet;
        p.mesh.material = MATERIALS.bullet;
        p.mesh.position.copy(origin);

        // FIXED: Apply spread in World Space to the actual physics vector first!
        _v1.copy(dir);
        if (data.spread && data.spread > 0) {
            _v1.x += (Math.random() - 0.5) * data.spread;
            _v1.z += (Math.random() - 0.5) * data.spread;
            _v1.normalize();
        }

        // Align mesh to physics vector
        _v2.copy(origin).add(_v1);
        p.mesh.lookAt(_v2);
        p.mesh.rotateX(Math.PI / 2); // Bullet mesh orientation fix

        if (p.mesh.parent !== scene) scene.add(p.mesh);

        // Cleanup marker if object was previously a throwable
        if (p.marker && p.marker.parent === scene) scene.remove(p.marker);

        p.vel.copy(_v1).multiplyScalar(data.bulletSpeed || 70);
        p.origin.copy(origin);
        p.damage = data.damage;
        p.life = 1.5;
        projectiles.push(p);
    },

    spawnThrowable: (scene: THREE.Scene, projectiles: Projectile[], origin: THREE.Vector3, dir: THREE.Vector3, weapon: string, charge: number) => {
        const data = WEAPONS[weapon];
        if (!data) return;

        const p = ProjectileSystem._getProjectile();
        p.type = 'throwable';
        p.weapon = weapon;

        // Configure pooled mesh
        p.mesh.geometry = GEOMETRY.grenade;
        p.mesh.material = weapon === WeaponType.MOLOTOV ? MATERIALS.molotov : MATERIALS.grenade;
        p.mesh.position.copy(origin);
        p.mesh.rotation.set(0, 0, 0); // Reset rotation for arc spinning

        if (p.mesh.parent !== scene) scene.add(p.mesh);

        const throwDist = 5 + charge * 30;
        const time = 1.0;
        p.vel.set((dir.x * throwDist) / time, (0 - origin.y + 0.5 * 30 * time * time) / time, (dir.z * throwDist) / time);
        p.origin.copy(origin);
        p.damage = data.damage;
        p.life = time + 0.5;
        p.maxRadius = data.range;

        // Pool Marker mesh
        if (!p.marker) {
            p.marker = new THREE.Mesh(GEOMETRY.landingMarker, MATERIALS.landingMarker);
            p.marker.rotation.x = -Math.PI / 2;
        }

        _v3.copy(dir).normalize().multiplyScalar(throwDist);
        p.marker.position.copy(origin).add(_v3).setY(0.1);
        p.marker.scale.setScalar(data.range);

        if (p.marker.parent !== scene) scene.add(p.marker);

        projectiles.push(p);
    },

    // --- CONTINUOUS WEAPON HANDLING ---

    handleContinuousFire: (weapon: WeaponType, origin: THREE.Vector3, direction: THREE.Vector3, delta: number, ctx: GameContext) => {
        const data = WEAPONS[weapon];
        if (!data) return;

        // FLAMETHROWER
        if (weapon === WeaponType.FLAMETHROWER) {
            const count = Math.ceil(delta * 0.06);
            for (let i = 0; i < count; i++) {
                _v1.copy(origin).addScaledVector(direction, 0.5);
                FXSystem.spawnFlame(_v1, direction);
            }

            const coneAngle = Math.cos(25 * Math.PI / 180);
            const range = data.range;

            const enemies = ctx.collisionGrid.getNearbyEnemies(origin, range);
            for (const e of enemies) {
                if (e.deathState !== 'alive') continue;

                _v1.subVectors(e.mesh.position, origin);
                const dist = _v1.length();
                if (dist > range) continue;

                _v1.normalize();
                const dot = direction.dot(_v1);

                if (dot > coneAngle) {
                    e.isBurning = true;
                    e.lastDamageType = WeaponType.FLAMETHROWER;
                    e.burnTimer = 0.5;
                    e.afterburnTimer = 5.0;

                    const chance = delta / data.fireRate;
                    if (Math.random() < chance) {
                        e.hp -= data.damage;
                        ctx.trackStats('damage', data.damage, !!e.isBoss);
                        if (ctx.spawnFloatingText) {
                            ctx.spawnFloatingText(e.mesh.position.x, 2.0 + Math.random(), e.mesh.position.z, Math.round(data.damage).toString(), '#ffaa00');
                        }
                    }
                }
            }
        }

        // ARC-CANNON
        else if (weapon === WeaponType.ARC_CANNON) {
            const range = data.range;
            const enemies = ctx.collisionGrid.getNearbyEnemies(origin, range);
            let target = null;
            let minDist = Infinity;
            const aimThreshold = 0.95;

            for (const e of enemies) {
                if (e.deathState !== 'alive') continue;
                _v1.subVectors(e.mesh.position, origin);
                const dist = _v1.length();
                if (dist > range) continue;

                _v1.normalize();
                if (direction.dot(_v1) > aimThreshold) {
                    if (dist < minDist) {
                        minDist = dist;
                        target = e;
                    }
                }
            }

            if (target) {
                const damage = data.damage;
                const chainMax = 5;
                const chainRange = 8.0;

                // ZERO-GC: Clear and reuse global scratchpad arrays/sets
                _arcCannonHitList.length = 0;
                _arcCannonHitIds.clear();

                _arcCannonHitList.push(target);
                _arcCannonHitIds.add(target.id);

                let curr = target;
                while (_arcCannonHitList.length < chainMax) {
                    const potential = ctx.collisionGrid.getNearbyEnemies(curr.mesh.position, chainRange);
                    let next = null;
                    let nextDist = Infinity;

                    for (const p of potential) {
                        if (p.deathState !== 'alive' || _arcCannonHitIds.has(p.id)) continue;
                        const d = p.mesh.position.distanceToSquared(curr.mesh.position);
                        if (d < nextDist) {
                            nextDist = d;
                            next = p;
                        }
                    }

                    if (next) {
                        _arcCannonHitList.push(next);
                        _arcCannonHitIds.add(next.id);
                        curr = next;
                    } else {
                        break;
                    }
                }

                const finalDamage = damage / _arcCannonHitList.length;
                const stunDur = (data.statusEffect?.duration || 2.5) / _arcCannonHitList.length;

                _v3.copy(origin);

                for (let i = 0; i < _arcCannonHitList.length; i++) {
                    const e = _arcCannonHitList[i];
                    _v1.copy(e.mesh.position).y += 1.0;

                    FXSystem.spawnLightning(_v3, _v1);

                    e.hp -= finalDamage;
                    e.lastDamageType = WeaponType.ARC_CANNON;
                    e.stunTimer = stunDur;
                    ctx.trackStats('damage', finalDamage, !!e.isBoss);

                    _v3.copy(_v1);

                    ctx.spawnFloatingText(e.mesh.position.x, 2.5, e.mesh.position.z, Math.round(finalDamage).toString(), '#00ffff');
                }

                soundManager.playArcCannonZap();
            } else {
                _v1.copy(origin).addScaledVector(direction, range);
                FXSystem.spawnLightning(origin, _v1);
                soundManager.playArcCannonZap();
            }
        }
    },

    update: (delta: number, now: number, ctx: GameContext, projectiles: Projectile[], fireZones: FireZone[]) => {
        ctx.now = now;

        // ZERO-GC: Ensure function is only allocated once if missing, avoiding frame-by-frame allocation
        if (!ctx.addFireZone) {
            ctx.addFireZone = (z: FireZone) => fireZones.push(z);
        }

        for (let i = projectiles.length - 1; i >= 0; i--) {
            const p = projectiles[i];
            if (p.type === 'bullet') updateBullet(p, i, delta, ctx, projectiles);
            else updateThrowable(p, i, delta, ctx, now, projectiles);
        }

        for (let i = fireZones.length - 1; i >= 0; i--) {
            const fz = fireZones[i];
            fz.life -= delta;

            if (!fz._lastDamageTime || now - fz._lastDamageTime > 500) {
                fz._lastDamageTime = now;
                const nearby = ctx.collisionGrid.getNearbyEnemies(fz.mesh.position, fz.radius);
                for (const e of nearby) {
                    if (e.deathState !== 'alive') continue;
                    e.lastDamageType = WeaponType.MOLOTOV;
                    e.hp -= 15; e.isBurning = true; e.afterburnTimer = 5.0; e.burnTimer = 0.5;
                    ctx.trackStats('damage', 15, !!e.isBoss);
                }
            }

            const flameCount = 4;
            for (let j = 0; j < flameCount; j++) {
                const r = Math.sqrt(Math.random()) * fz.radius;
                const theta = Math.random() * Math.PI * 2;
                ctx.spawnPart(fz.mesh.position.x + r * Math.cos(theta), 0.2, fz.mesh.position.z + r * Math.sin(theta), 'flame', 1);
            }

            if (fz.life <= 0) {
                ctx.scene.remove(fz.mesh);
                // ZERO-GC: Swap-and-Pop instead of .splice
                fireZones[i] = fireZones[fireZones.length - 1];
                fireZones.pop();
            }
        }
    },

    clear: (scene: THREE.Scene, projectiles: Projectile[], fireZones: FireZone[]) => {
        for (const p of projectiles) {
            if (p.mesh.parent) scene.remove(p.mesh);
            if (p.marker && p.marker.parent) scene.remove(p.marker);
            p.active = false;
        }
        for (const f of fireZones) {
            if (f.mesh.parent) scene.remove(f.mesh);
            f.life = 0; // Mark for reuse
        }
        projectiles.length = 0; fireZones.length = 0;
    }
};

// --- INTERNAL HELPERS ---
function updateBullet(p: Projectile, index: number, delta: number, ctx: GameContext, projectiles: Projectile[]) {
    _v3.set(p.mesh.position.x, 0, p.mesh.position.z);
    p.mesh.position.addScaledVector(p.vel, delta);
    _v4.set(p.mesh.position.x, 0, p.mesh.position.z);
    p.life -= delta;

    let destroyBullet = false;
    const data = WEAPONS[p.weapon];
    if (!data) return;

    const nearbyObs = ctx.collisionGrid.getNearbyObstacles(p.mesh.position, 2.0);
    for (const obs of nearbyObs) {
        const obsPos = obs.position;
        if (p.mesh.position.distanceToSquared(obsPos) < (obs.radius || 2) ** 2) {
            destroyBullet = true;
            ctx.spawnPart(p.mesh.position.x, p.mesh.position.y, p.mesh.position.z, 'smoke', 3);
            soundManager.playImpact(obs.mesh?.userData?.material || 'concrete');
            break;
        }
    }

    if (!destroyBullet) {
        _v1.addVectors(_v3, _v4).multiplyScalar(0.5);
        const bulletTravelDist = p.vel.length() * delta;
        const searchRad = 5.0 + bulletTravelDist;
        const nearbyEnemies = ctx.collisionGrid.getNearbyEnemies(_v1, searchRad);

        if (nearbyEnemies.length > 1) {
            nearbyEnemies.sort((a, b) => _v3.distanceToSquared(a.mesh.position) - _v3.distanceToSquared(b.mesh.position));
        }

        for (const e of nearbyEnemies) {
            if (e.deathState !== 'alive' || p.hitEntities.has(e.id)) continue;

            const enemyXZ = _v1.set(e.mesh.position.x, 0, e.mesh.position.z);
            const lineVec = _v2.subVectors(_v4, _v3);
            const startToEnemy = _v5.subVectors(enemyXZ, _v3);

            const lineLenSq = lineVec.lengthSq();
            let t = lineLenSq > 0 ? Math.max(0, Math.min(1, startToEnemy.dot(lineVec) / lineLenSq)) : 0;

            const closestPointXZ = _v2.copy(_v3).addScaledVector(lineVec, t);
            const distSq = closestPointXZ.distanceToSquared(enemyXZ);

            const hitRad = 1.2 * (e.widthScale || 1.0) * (e.originalScale || 1.0);

            if (distSq < hitRad * hitRad) {
                let isHighImpact = false;
                if (p.weapon === WeaponType.SHOTGUN) {
                    if (closestPointXZ.distanceToSquared(p.origin) < 144.0) isHighImpact = true;
                } else if (p.weapon === WeaponType.REVOLVER) {
                    if (p.damage >= data.baseDamage * 0.5) isHighImpact = true;
                }

                e.lastHitWasHighImpact = isHighImpact;
                e.lastDamageType = p.weapon;
                const actualDmg = Math.max(0, Math.min(e.hp, p.damage));
                e.hp -= p.damage;
                e.hitTime = ctx.now;
                e.slowTimer = 0.5;
                p.hitEntities.add(e.id);

                const mass = (e.originalScale || 1.0) * (e.widthScale || 1.0);
                const force = (p.damage / 3) / Math.max(0.3, mass);
                _v1.copy(p.vel).setY(0).normalize().multiplyScalar(force);
                e.knockbackVel.add(_v1);

                if (ctx.spawnFloatingText) {
                    ctx.spawnFloatingText(e.mesh.position.x, 3.0, e.mesh.position.z, Math.round(p.damage).toString(), isHighImpact ? '#ff0000' : '#ffffff');
                }

                ctx.trackStats('hit', 1);
                ctx.trackStats('damage', actualDmg, !!e.isBoss);

                ctx.spawnPart(closestPointXZ.x, p.mesh.position.y, closestPointXZ.z, 'blood', 40);
                soundManager.playImpact('flesh');

                if (data.piercing) {
                    p.damage *= data.pierceDecay;
                    if (p.damage < 15) { destroyBullet = true; break; }
                } else {
                    destroyBullet = true;
                    break;
                }
            }
        }
    }

    if (destroyBullet || p.life <= 0) {
        ctx.scene.remove(p.mesh);
        p.active = false;

        // ZERO-GC: Swap-and-Pop
        projectiles[index] = projectiles[projectiles.length - 1];
        projectiles.pop();
    }
}

function updateThrowable(p: Projectile, index: number, delta: number, ctx: GameContext, now: number, projectiles: Projectile[]) {
    p.vel.y -= 30 * delta;
    p.mesh.position.addScaledVector(p.vel, delta);
    p.mesh.rotation.x += 8 * delta;
    if (p.marker) (p.marker.material as any).opacity = 0.4 + Math.abs(Math.sin(now * 0.01)) * 0.6;

    if (p.mesh.position.y <= 0.1 || p.life <= 0) {
        ctx.scene.remove(p.mesh); if (p.marker) ctx.scene.remove(p.marker);
        _v1.copy(p.mesh.position).setY(0);
        const behavior = THROWABLE_BEHAVIORS[p.weapon];
        if (behavior) behavior.onImpact(_v1, p.maxRadius || 10, ctx, p.damage);
        p.active = false;

        // ZERO-GC: Swap-and-Pop
        projectiles[index] = projectiles[projectiles.length - 1];
        projectiles.pop();
    } else {
        p.life -= delta;
    }
}