import * as THREE from 'three';
import { Enemy } from '../entities/enemies/EnemyManager';
import { EnemyDeathState } from '../entities/enemies/EnemyTypes';
import { GEOMETRY, MATERIALS } from '../utils/assets';
import { soundManager } from '../utils/SoundManager';
import { haptic } from '../utils/HapticManager';
import { WEAPONS, WeaponType } from '../content/weapons';
import { StatusEffectType, DamageType } from '../entities/player/CombatTypes';
import { SpatialGrid } from '../core/world/SpatialGrid';
import { WinterEngine } from '../core/engine/WinterEngine';
import { _buoyancyResult } from '../systems/WaterSystem';
import { NoiseType, NOISE_RADIUS } from '../entities/enemies/EnemyTypes';
import { WeaponFX } from './WeaponFX';

// --- INTERFACES ---

export interface FireZone {
    mesh: THREE.Mesh;
    radius: number;
    radiusSq: number;
    life: number;
    _lastDamageTime?: number;
}

export interface GameContext {
    scene: THREE.Scene;
    enemies: Enemy[];
    collisionGrid: SpatialGrid;
    spawnPart: (x: number, y: number, z: number, type: string, count: number, mesh?: any, vel?: any, color?: number, scale?: number, life?: number) => void;
    explodeEnemy: (e: Enemy, force: THREE.Vector3) => void;
    addScore: (amt: number) => void;
    addFireZone: (z: FireZone) => void;
    applyDamage: (enemy: Enemy, amount: number, type: string | WeaponType | DamageType, isHighImpact?: boolean) => boolean;

    now: number;
    playerPos: THREE.Vector3;
    onPlayerHit: (damage: number, attacker: any, type: string | DamageType, isDoT?: boolean, effect?: any, duration?: number, intensity?: number, attackName?: string) => void;
    makeNoise: (pos: THREE.Vector3, type: NoiseType, radius: number) => void;
    weaponHandler?: any;
}

export interface Projectile {
    mesh: THREE.Mesh;
    type: 'bullet' | 'throwable';
    weapon: string;

    // --- Fysik & Vektorer ---
    vel: THREE.Vector3;
    origin: THREE.Vector3;
    speed: number;
    life: number;
    active: boolean;
    hitEntities: Set<string>;

    // --- ZERO-GC FLATTENING (DOD) ---
    damage: number;
    baseDamage: number;
    piercing: boolean;
    pierceDecay: number;
    impactType: EnemyDeathState;
    highImpactDistSq: number;       // Avstånd från origin i kvadrat. 0 = inaktiv.
    highImpactDamageFactor: number; // Procent av baseDamage. 0 = inaktiv.

    maxRadius?: number;
    marker?: THREE.Mesh;
}

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3();
const _v6 = new THREE.Vector3();

// Dedicated scratchpads for Arc-Cannon continuous fire
const _arcCannonHitList: Enemy[] = [];
const _arcCannonHitIds = new Set<string>();

// Audio Throttling for Arc-Cannon
let _lastArcSoundTime = 0;

// CONSTANTS (Pre-calculated math to save CPU cycles)
const FLAMETHROWER_CONE_ANGLE = Math.cos(28 * Math.PI / 180);

// ZERO-GC Pools
const PROJECTILE_POOL: Projectile[] = [];
const FIREZONE_POOL: FireZone[] = [];

// --- REGISTRIES ---

const THROWABLE_BEHAVIORS: Record<string, { onImpact: (ctx: GameContext, pos: THREE.Vector3, radius: number, damage: number, hitWater: boolean) => void }> = {

    [WeaponType.GRENADE]: {
        onImpact: (ctx, pos, radius, damage, hitWater) => {
            if (hitWater) {
                soundManager.playWaterExplosion();
                haptic.explosionWater();
            } else {
                soundManager.playGrenadeImpact();
                haptic.explosion();
            }

            const effectiveNoiseRadius = hitWater ? (NOISE_RADIUS.GRENADE * 0.5) : NOISE_RADIUS.GRENADE;
            ctx.makeNoise(pos, NoiseType.GRENADE, effectiveNoiseRadius);

            WeaponFX.createGrenadeImpact(pos, radius, hitWater, ctx);

            const effectiveRadius = hitWater ? radius * 0.5 : radius;
            const nearby = ctx.collisionGrid.getNearbyEnemies(pos, effectiveRadius + 3.0);

            for (let i = 0; i < nearby.length; i++) {
                const e = nearby[i];
                if (e.deathState !== EnemyDeathState.ALIVE) continue;

                _v2.subVectors(e.mesh.position, pos);
                const distSq = _v2.lengthSq();
                const totalRad = effectiveRadius + (1.0 * e.widthScale * (e.originalScale || 1.0));

                if (distSq < totalRad * totalRad) {
                    const isKill = ctx.applyDamage(e, damage, WeaponType.GRENADE, true);

                    if (isKill) {
                        const forceMultiplier = hitWater ? 5.0 : 15.0;
                        const force = forceMultiplier * (1.0 - Math.sqrt(distSq) / effectiveRadius);
                        _v4.copy(_v2).normalize().setY(hitWater ? 1.5 : 0.5).multiplyScalar(force);
                        e.deathVel.copy(_v4);
                    } else {
                        const mass = (e.originalScale || 1.0) * (e.widthScale || 1.0);
                        const kbForce = hitWater ? 12 : 25;
                        _v4.copy(_v2).normalize().multiplyScalar(kbForce / mass).setY(hitWater ? 1.0 : 2.0);
                        e.knockbackVel.add(_v4);
                    }
                }
            }
        }
    },

    [WeaponType.MOLOTOV]: {
        onImpact: (ctx, pos, radius, damage, hitWater) => {
            if (hitWater) {
                ctx.makeNoise(pos, NoiseType.MOLOTOV, NOISE_RADIUS.BULLET_HIT);
                soundManager.playWaterSplash();
                haptic.explosionWater();
            } else {
                ctx.makeNoise(pos, NoiseType.MOLOTOV, NOISE_RADIUS.MOLOTOV);
                soundManager.playMolotovImpact();
                haptic.explosion();
            }

            WeaponFX.createMolotovImpact(pos, radius, hitWater, ctx);

            if (hitWater) return;

            let fz: FireZone | null = null;
            for (let i = 0; i < FIREZONE_POOL.length; i++) {
                if (FIREZONE_POOL[i].life <= 0) {
                    fz = FIREZONE_POOL[i];
                    break;
                }
            }

            if (!fz) {
                fz = { mesh: new THREE.Mesh(GEOMETRY.fireZone, MATERIALS.fireZone), radius, radiusSq: radius * radius, life: 6.0 };
                FIREZONE_POOL.push(fz);
            }

            fz.radius = radius;
            fz.radiusSq = radius * radius;
            fz.life = 6.0;
            fz._lastDamageTime = 0;
            fz.mesh.rotation.x = -Math.PI / 2;
            fz.mesh.position.set(pos.x, 0.24, pos.z);
            fz.mesh.scale.setScalar(fz.radius / 3.5);

            if (fz.mesh.parent !== ctx.scene) ctx.scene.add(fz.mesh);
            ctx.addFireZone(fz);

            const direct = ctx.collisionGrid.getNearbyEnemies(pos, radius);
            const rSq = fz.radiusSq;
            for (let i = 0; i < direct.length; i++) {
                const e = direct[i];
                if (e.deathState !== EnemyDeathState.ALIVE) continue;

                if (e.mesh.position.distanceToSquared(pos) < rSq) {
                    ctx.applyDamage(e, 0, WeaponType.MOLOTOV);
                    e.isBurning = true;
                    e.afterburnTimer = 5.0;
                    e.burnTimer = 0.5;
                }
            }
        }
    },

    [WeaponType.FLASHBANG]: {
        onImpact: (ctx, pos, radius, damage, hitWater) => {
            if (hitWater) {
                ctx.makeNoise(pos, NoiseType.FLASHBANG, NOISE_RADIUS.BULLET_HIT);
                soundManager.playWaterSplash();
                haptic.explosionWater();
            } else {
                ctx.makeNoise(pos, NoiseType.FLASHBANG, NOISE_RADIUS.FLASHBANG);
                soundManager.playFlashbangImpact();
                haptic.explosion();
            }

            WeaponFX.createFlashbangImpact(pos, hitWater, ctx);

            const nearby = ctx.collisionGrid.getNearbyEnemies(pos, radius);
            const rSq = radius * radius;

            for (let i = 0; i < nearby.length; i++) {
                const e = nearby[i];
                if (e.deathState !== EnemyDeathState.ALIVE) continue;

                if (e.mesh.position.distanceToSquared(pos) < rSq) {
                    e.isBlinded = true;
                    e.blindTimer = 4.0;
                    e.stunTimer = 1.5;
                    WeaponFX.createStunSparks(e.mesh.position);
                }
            }
        }
    }
};

// --- SYSTEM ---
export const ProjectileSystem = {
    _getProjectile: (): Projectile => {
        for (let i = 0; i < PROJECTILE_POOL.length; i++) {
            const p = PROJECTILE_POOL[i];
            if (!p.active) {
                p.hitEntities.clear();
                p.active = true;
                return p;
            }
        }

        const p: Projectile = {
            mesh: new THREE.Mesh(),
            type: 'bullet',
            weapon: '',
            vel: new THREE.Vector3(),
            origin: new THREE.Vector3(),
            speed: 0,
            damage: 0,
            baseDamage: 0,
            piercing: false,
            pierceDecay: 1.0,
            impactType: EnemyDeathState.SHOT,
            highImpactDistSq: 0,
            highImpactDamageFactor: 0,
            life: 0,
            hitEntities: new Set(),
            active: true
        };
        PROJECTILE_POOL.push(p);
        return p;
    },

    launchBullet: (scene: THREE.Scene, projectiles: Projectile[], origin: THREE.Vector3, dir: THREE.Vector3, weapon: string, damage?: number) => {
        const data = WEAPONS[weapon];
        if (!data) return;

        const p = ProjectileSystem._getProjectile();
        p.type = 'bullet';
        p.weapon = weapon;

        p.mesh.geometry = GEOMETRY.bullet;
        p.mesh.material = MATERIALS.bullet;
        p.mesh.position.copy(origin);

        _v1.copy(dir);
        if (data.spread && data.spread > 0) {
            _v1.x += (Math.random() - 0.5) * data.spread;
            _v1.z += (Math.random() - 0.5) * data.spread;
            _v1.normalize();
        }

        _v2.copy(origin).add(_v1);
        p.mesh.lookAt(_v2);
        p.mesh.rotateX(Math.PI / 2);

        if (p.mesh.parent !== scene) scene.add(p.mesh);
        if (p.marker && p.marker.parent === scene) scene.remove(p.marker);

        p.speed = data.bulletSpeed || 70;
        p.vel.copy(_v1).multiplyScalar(p.speed);
        p.origin.copy(origin);
        p.life = 1.5;

        // VINTERDÖD DOD FLATTENING: Kopiera vapnets DNA till skottet
        p.baseDamage = data.damage;
        p.damage = damage !== undefined ? damage : data.damage;
        p.piercing = data.piercing || false;
        p.pierceDecay = data.pierceDecay || 1.0;
        p.impactType = data.impactType;

        // Sätt de generiska High Impact-reglerna för skottet (Data-Driven)
        p.highImpactDistSq = weapon === WeaponType.SHOTGUN ? 144.0 : 0;
        p.highImpactDamageFactor = weapon === WeaponType.REVOLVER ? 0.5 : 0;

        projectiles.push(p);
    },

    launchThrowable: (scene: THREE.Scene, projectiles: Projectile[], origin: THREE.Vector3, target: THREE.Vector3, weapon: string, time: number, damage: number) => {
        const data = WEAPONS[weapon];
        if (!data) return;

        const p = ProjectileSystem._getProjectile();
        p.type = 'throwable';
        p.weapon = weapon;
        p.mesh.position.copy(origin);
        p.mesh.rotation.set(0, 0, 0);

        switch (weapon) {
            case WeaponType.MOLOTOV:
                p.mesh.geometry = GEOMETRY.molotov;
                p.mesh.material = MATERIALS.molotov;
                break;
            case WeaponType.FLASHBANG:
                p.mesh.geometry = GEOMETRY.flashbang;
                p.mesh.material = MATERIALS.flashbang;
                break;
            default:
                p.mesh.geometry = GEOMETRY.grenade;
                p.mesh.material = MATERIALS.grenade;
                break;
        }

        if (p.mesh.parent !== scene) scene.add(p.mesh);

        const g = 30.0;
        p.vel.set(
            (target.x - origin.x) / time,
            (target.y - origin.y + 0.5 * g * time * time) / time,
            (target.z - origin.z) / time
        );

        p.speed = p.vel.length();
        p.origin.copy(origin);

        // Throwable DNA
        p.baseDamage = data.damage;
        p.damage = damage !== undefined ? damage : data.damage;
        p.life = time + 0.5;
        p.maxRadius = data.radius || 10;

        // Reset irrelevant bullet DNA
        p.highImpactDistSq = 0;
        p.highImpactDamageFactor = 0;

        if (!p.marker) {
            p.marker = new THREE.Mesh(GEOMETRY.landingMarker, MATERIALS.landingMarker);
            p.marker.rotation.x = -Math.PI / 2;
        }

        p.marker.position.copy(target);
        p.marker.scale.setScalar(data.radius || 10);

        if (p.marker.parent !== scene) scene.add(p.marker);

        projectiles.push(p);
    },

    handleContinuousFire: (weapon: WeaponType, origin: THREE.Vector3, direction: THREE.Vector3, delta: number, ctx: GameContext, damageOverride?: number) => {
        const data = WEAPONS[weapon];
        if (!data) return;

        const damage = damageOverride !== undefined ? damageOverride : (data.damage || 0) * (60 * delta);

        switch (weapon) {
            case WeaponType.FLAMETHROWER: {
                if (Math.random() < 0.3) {
                    WeaponFX.createMuzzleFlash(origin, direction, false);
                }

                const count = 4;
                for (let i = 0; i < count; i++) {
                    _v1.copy(origin).addScaledVector(direction, 0.5 + Math.random() * 0.8);
                    WeaponFX.createFlame(_v1, direction);
                }

                const range = data.range;
                const rangeSq = range * range;

                const enemies = ctx.collisionGrid.getNearbyEnemies(origin, range);
                for (let _fi = 0; _fi < enemies.length; _fi++) {
                    const e = enemies[_fi];
                    if (e.deathState !== EnemyDeathState.ALIVE) continue;

                    _v1.subVectors(e.mesh.position, origin);
                    const distSq = _v1.lengthSq();

                    if (distSq > rangeSq) continue;

                    const dist = Math.sqrt(distSq);
                    _v1.divideScalar(dist);

                    const dot = direction.dot(_v1);

                    if (dot > FLAMETHROWER_CONE_ANGLE) {
                        e.isBurning = true;
                        e.burnTimer = 0.5;
                        e.afterburnTimer = 5.0;

                        const chance = (delta * 1000) / (data.fireRate || 35);
                        if (Math.random() < chance) {
                            const finalDmg = damageOverride !== undefined ? (damageOverride / (60 * delta)) : data.damage;
                            ctx.applyDamage(e, finalDmg, WeaponType.FLAMETHROWER);
                        }
                    }
                }
                break;
            }

            case WeaponType.ARC_CANNON: {
                const range = data.range;
                const rangeSq = range * range;
                const enemies = ctx.collisionGrid.getNearbyEnemies(origin, range);

                let target = null;
                let minDist = Infinity;
                const aimThreshold = 0.90;

                for (let _fi = 0; _fi < enemies.length; _fi++) {
                    const e = enemies[_fi];
                    if (e.deathState !== EnemyDeathState.ALIVE) continue;

                    _v1.subVectors(e.mesh.position, origin);
                    const distSq = _v1.lengthSq();
                    if (distSq > rangeSq) continue;

                    const dist = Math.sqrt(distSq);
                    _v1.divideScalar(dist);

                    if (direction.dot(_v1) > aimThreshold) {
                        if (dist < minDist) {
                            minDist = dist;
                            target = e;
                        }
                    }
                }

                if (target) {
                    const chainMax = 5;
                    const chainRange = 8.0;

                    _arcCannonHitList.length = 0;
                    _arcCannonHitIds.clear();

                    _arcCannonHitList.push(target);
                    _arcCannonHitIds.add(target.id);

                    let curr = target;
                    while (_arcCannonHitList.length < chainMax) {
                        const potential = ctx.collisionGrid.getNearbyEnemies(curr.mesh.position, chainRange);
                        let next = null;
                        let nextDist = Infinity;

                        for (let _pi = 0; _pi < potential.length; _pi++) {
                            const p = potential[_pi];
                            if (p.deathState !== EnemyDeathState.ALIVE || _arcCannonHitIds.has(p.id)) continue;
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
                    const primaryTarget = _arcCannonHitList[0];
                    _v1.copy(primaryTarget.mesh.position).y += 1.0;

                    WeaponFX.createLightning(_v3, _v1, true);
                    ctx.applyDamage(primaryTarget, finalDamage, WeaponType.ARC_CANNON);
                    primaryTarget.stunTimer = stunDur;

                    _v3.copy(_v1);

                    for (let i = 1; i < _arcCannonHitList.length; i++) {
                        const e = _arcCannonHitList[i];
                        _v1.copy(e.mesh.position).y += 1.0;

                        WeaponFX.createLightning(_v3, _v1, false);
                        ctx.applyDamage(e, finalDamage, WeaponType.ARC_CANNON);
                        e.stunTimer = stunDur;

                        _v3.copy(_v1);
                    }

                    if (ctx.now - _lastArcSoundTime > 150) {
                        soundManager.playArcCannonZap();
                        _lastArcSoundTime = ctx.now;
                    }

                } else {
                    _v1.copy(origin).addScaledVector(direction, range);
                    WeaponFX.createLightning(origin, _v1, true);

                    if (ctx.now - _lastArcSoundTime > 150) {
                        soundManager.playArcCannonZap();
                        _lastArcSoundTime = ctx.now;
                    }
                }
                break;
            }
        }
    },

    update: (delta: number, now: number, ctx: GameContext, projectiles: Projectile[], fireZones: FireZone[]) => {
        ctx.now = now;

        if (!ctx.addFireZone) {
            ctx.addFireZone = (z: FireZone) => fireZones.push(z);
        }

        // VINTERDÖD FIX: Hämta vattnet en gång per frame!
        const waterSystem = WinterEngine.getInstance()?.water;

        for (let i = projectiles.length - 1; i >= 0; i--) {
            const p = projectiles[i];

            if (p.type === 'bullet') {
                updateBullet(p, i, delta, ctx, projectiles);
            } else {
                updateThrowable(p, i, delta, ctx, now, projectiles, waterSystem);
            }
        }

        if (fireZones.length > 0) {
            let playerHitThisFrame = false;
            const frameCounter = (now * 0.06) | 0;

            for (let i = fireZones.length - 1; i >= 0; i--) {
                const fz = fireZones[i];
                fz.life -= delta;

                if ((frameCounter + i) % 2 === 0) {
                    WeaponFX.updateFireZoneVisuals(fz.mesh.position, fz.radius, delta * 2, ctx);
                }

                if (!fz._lastDamageTime || now - fz._lastDamageTime > 500) {
                    fz._lastDamageTime = now;
                    const nearby = ctx.collisionGrid.getNearbyEnemies(fz.mesh.position, fz.radius);
                    const rSq = fz.radiusSq;
                    for (let _ni = 0; _ni < nearby.length; _ni++) {
                        const e = nearby[_ni];
                        if (e.deathState !== EnemyDeathState.ALIVE) continue;

                        if (e.mesh.position.distanceToSquared(fz.mesh.position) < rSq) {
                            e.isBurning = true;
                            e.afterburnTimer = 5.0;
                            e.burnTimer = 0.5;
                        }
                    }

                    if (!playerHitThisFrame && ctx.playerPos.distanceToSquared(fz.mesh.position) < rSq) {
                        if (ctx.onPlayerHit) {
                            ctx.onPlayerHit(3, null, DamageType.BURN, true, StatusEffectType.BURNING, 3000, 5, DamageType.BURN);
                            playerHitThisFrame = true;
                        }
                    }
                }

                if (fz.life <= 0) {
                    ctx.scene.remove(fz.mesh);
                    fireZones[i] = fireZones[fireZones.length - 1];
                    fireZones.pop();
                }
            }
        }
    },

    clear: (scene: THREE.Scene, projectiles: Projectile[], fireZones: FireZone[]) => {
        for (let i = 0; i < projectiles.length; i++) {
            const p = projectiles[i];
            if (p.mesh.parent) scene.remove(p.mesh);
            if (p.marker && p.marker.parent) scene.remove(p.marker);
            p.active = false;
        }
        for (let i = 0; i < fireZones.length; i++) {
            const f = fireZones[i];
            if (f.mesh.parent) scene.remove(f.mesh);
            f.life = 0;
        }
        projectiles.length = 0; fireZones.length = 0;
    }
};

// --- INTERNAL HELPERS ---
function updateBullet(projectile: Projectile, index: number, delta: number, ctx: GameContext, projectiles: Projectile[]) {
    _v3.set(projectile.mesh.position.x, 0, projectile.mesh.position.z);
    projectile.mesh.position.addScaledVector(projectile.vel, delta);
    _v4.set(projectile.mesh.position.x, 0, projectile.mesh.position.z);
    projectile.life -= delta;

    let destroyBullet = false;

    _v2.subVectors(_v4, _v3);
    const lineLenSq = _v2.lengthSq();

    _v1.addVectors(_v3, _v4).multiplyScalar(0.5);
    const bulletTravelDist = projectile.speed * delta;
    const obsSearchRad = 2.0 + bulletTravelDist * 0.5;
    const nearbyObs = ctx.collisionGrid.getNearbyObstacles(_v1, obsSearchRad);

    for (let i = 0; i < nearbyObs.length; i++) {
        const obs = nearbyObs[i];

        if (Math.abs(obs.position.x - ctx.playerPos.x) < 0.5 && Math.abs(obs.position.z - ctx.playerPos.z) < 0.5) {
            continue;
        }

        _v5.set(obs.position.x, 0, obs.position.z);
        const rad = obs.radius || 2.0;

        _v6.subVectors(_v5, _v3);
        let t = lineLenSq > 0 ? Math.max(0, Math.min(1, _v6.dot(_v2) / lineLenSq)) : 0;
        _v6.copy(_v3).addScaledVector(_v2, t);

        if (_v6.distanceToSquared(_v5) < rad * rad) {
            destroyBullet = true;
            soundManager.playImpact(obs.mesh?.userData?.material || 'concrete');
            ctx.makeNoise(_v6, NoiseType.BULLET_HIT, NOISE_RADIUS.BULLET_HIT);
            break;
        }
    }

    if (!destroyBullet) {
        _v1.addVectors(_v3, _v4).multiplyScalar(0.5);
        const enemySearchRad = 5.0 + bulletTravelDist * 0.5;
        const nearbyEnemies = ctx.collisionGrid.getNearbyEnemies(_v1, enemySearchRad);

        if (nearbyEnemies.length > 1) {
            nearbyEnemies.sort((a, b) => _v3.distanceToSquared(a.mesh.position) - _v3.distanceToSquared(b.mesh.position));
        }

        for (let i = 0; i < nearbyEnemies.length; i++) {
            const enemy = nearbyEnemies[i];
            if (enemy.deathState !== EnemyDeathState.ALIVE || projectile.hitEntities.has(enemy.id)) continue;

            _v5.set(enemy.mesh.position.x, 0, enemy.mesh.position.z);
            const hitRad = 1.2 * (enemy.widthScale || 1.0) * (enemy.originalScale || 1.0);

            _v6.subVectors(_v5, _v3);
            let t = lineLenSq > 0 ? Math.max(0, Math.min(1, _v6.dot(_v2) / lineLenSq)) : 0;
            _v6.copy(_v3).addScaledVector(_v2, t);

            if (_v6.distanceToSquared(_v5) < hitRad * hitRad) {

                // VINTERDÖD DOD FLATTENING: Ren matematisk utvärdering, noll kännedom om vapentyper!
                let isHighImpact = false;

                if (projectile.highImpactDistSq > 0) {
                    const distFromOriginSq = (_v6.x - projectile.origin.x) ** 2 + (_v6.z - projectile.origin.z) ** 2;
                    if (distFromOriginSq < projectile.highImpactDistSq) isHighImpact = true;
                } else if (projectile.highImpactDamageFactor > 0) {
                    if (projectile.damage >= projectile.baseDamage * projectile.highImpactDamageFactor) isHighImpact = true;
                }

                projectile.hitEntities.add(enemy.id);
                enemy.slowTimer = 0.5;

                const isKill = ctx.applyDamage(enemy, projectile.damage, projectile.weapon, isHighImpact);

                const mass = (enemy.originalScale || 1.0) * (enemy.widthScale || 1.0);
                const force = (projectile.damage / 3) / Math.max(0.3, mass);

                if (isKill && isHighImpact) {
                    enemy.deathVel.copy(projectile.vel).normalize().multiplyScalar(force * 2.0).setY(4.0);
                }

                _v5.copy(projectile.vel).setY(0).normalize().multiplyScalar(force);
                enemy.knockbackVel.add(_v5);

                const headY = enemy.mesh.position.y + (enemy.originalScale || 1.0) * 1.8;
                ctx.spawnPart(_v6.x, projectile.mesh.position.y, _v6.z, 'blood', 40);
                ctx.spawnPart(_v6.x, headY, _v6.z, 'blood_splat', 1, undefined, undefined, undefined, 3.0);
                soundManager.playImpact('flesh');

                // VINTERDÖD DOD FLATTENING: Läser primitiva variabler, noll pointer chasing!
                if (projectile.piercing) {
                    projectile.damage *= projectile.pierceDecay;
                    if (projectile.damage < 15) { destroyBullet = true; break; }
                } else {
                    destroyBullet = true;
                    break;
                }
            }
        }
    }

    if (destroyBullet || projectile.life <= 0) {
        ctx.scene.remove(projectile.mesh);
        projectile.active = false;

        projectiles[index] = projectiles[projectiles.length - 1];
        projectiles.pop();
    }
}

function updateThrowable(p: Projectile, index: number, delta: number, ctx: GameContext, now: number, projectiles: Projectile[], waterSystem: any) {
    p.vel.y -= 30 * delta;
    p.mesh.position.addScaledVector(p.vel, delta);
    p.mesh.rotation.x += 8 * delta;
    if (p.marker) {
        (p.marker.material as any).opacity = 0.4 + Math.abs(Math.sin(now * 0.01)) * 0.6;
    }

    let destroyed = false;
    let hitWater = false;
    let hitY = 0;

    // VINTERDÖD FIX: Broadphase Check! Räkna bara matte om vi faktiskt är nära vattnet.
    if (p.mesh.position.y < 2.0 && waterSystem) {
        waterSystem.checkBuoyancy(p.mesh.position.x, p.mesh.position.y, p.mesh.position.z);
        if (_buoyancyResult.inWater && p.mesh.position.y <= _buoyancyResult.waterLevel) {
            destroyed = true;
            hitWater = true;
            hitY = _buoyancyResult.waterLevel;
        }
    }

    if (!destroyed && (p.mesh.position.y <= 0.1 || p.life <= 0)) {
        destroyed = true;
        hitY = 0;
    }

    if (destroyed) {
        ctx.scene.remove(p.mesh);
        if (p.marker) {
            ctx.scene.remove(p.marker);
        }

        _v1.copy(p.mesh.position).setY(hitY);
        const behavior = THROWABLE_BEHAVIORS[p.weapon];

        if (behavior) {
            behavior.onImpact(ctx, _v1, p.maxRadius || 10, p.damage, hitWater);
        }

        p.active = false;

        projectiles[index] = projectiles[projectiles.length - 1];
        projectiles.pop();
    } else {
        p.life -= delta;
    }
}