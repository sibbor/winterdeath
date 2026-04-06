import * as THREE from 'three';
import { Enemy } from '../entities/enemies/EnemyManager';
import { EnemyDeathState } from '../entities/enemies/EnemyTypes';
import { GEOMETRY, MATERIALS } from '../utils/assets';
import { soundManager } from '../utils/audio/SoundManager';
import { haptic } from '../utils/HapticManager';
import { WEAPONS } from '../content/weapons';
import { DamageID } from '../entities/player/CombatTypes';
import { StatusEffectType } from '../content/perks';
import { SpatialGrid } from '../core/world/SpatialGrid';
import { WinterEngine } from '../core/engine/WinterEngine';
import { _buoyancyResult } from '../systems/WaterSystem';
import { NoiseType, NOISE_RADIUS, EnemyFlags } from '../entities/enemies/EnemyTypes';
import { WeaponFX } from './WeaponFX';
import { MaterialType } from '../content/environment';

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
    fireZones: FireZone[];
    applyDamage: (enemy: Enemy, amount: number, type: DamageID, isHighImpact?: boolean) => boolean;

    simTime: number;
    playerPos: THREE.Vector3;
    onPlayerHit: (damage: number, attacker: any, type: DamageID, isDoT?: boolean, effect?: any, duration?: number, intensity?: number, attackName?: string) => void;
    makeNoise: (pos: THREE.Vector3, type: NoiseType, radius: number) => void;
    weaponHandler: any;
    session: any;
}

export enum ProjectileType {
    BULLET = 0,
    THROWABLE = 1
}

export interface Projectile {
    mesh: THREE.Mesh;
    type: ProjectileType;
    weapon: DamageID;

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

// ZERO-GC SORTING (DOD)
const _enemyDistBuffer = new Float32Array(512);

/**
 * Optimized Zero-GC Insertion Sort for nearby enemies.
 * Calculates distance once per enemy and sorts in-place.
 * Best for small n (n < 64), which fits our SpatialGrid cell size.
 */
function manualSortNearbyEnemies(projectilePos: THREE.Vector3, enemies: Enemy[]) {
    const len = enemies.length;
    if (len <= 1) return;

    // 1. Cache distances to the projectile once (Zero-GC)
    for (let i = 0; i < len; i++) {
        const ePos = enemies[i].mesh.position;
        const dx = ePos.x - projectilePos.x;
        const dy = ePos.y - projectilePos.y;
        const dz = ePos.z - projectilePos.z;
        _enemyDistBuffer[i] = dx * dx + dy * dy + dz * dz;
    }

    // 2. Insertion Sort (Stable, O(n^2) but n is extremely small here)
    for (let i = 1; i < len; i++) {
        const enemy = enemies[i];
        const dist = _enemyDistBuffer[i];
        let j = i - 1;

        while (j >= 0 && _enemyDistBuffer[j] > dist) {
            enemies[j + 1] = enemies[j];
            _enemyDistBuffer[j + 1] = _enemyDistBuffer[j];
            j--;
        }
        enemies[j + 1] = enemy;
        _enemyDistBuffer[j + 1] = dist;
    }
}

// Audio Throttling for Arc-Cannon & Flamethrower
let _lastArcCannonSoundTime = 0;
let _lastFlameSoundTime = 0;

const FLAMETHROWER_CONE_ANGLE = Math.cos(28 * Math.PI / 180);

// ZERO-GC Pools
const PROJECTILE_POOL: Projectile[] = [];
const FIREZONE_POOL: FireZone[] = [];

// --- SYSTEM ---
export const ProjectileSystem = {
    _getProjectile: (): Projectile => {
        const pLen = PROJECTILE_POOL.length;
        for (let i = 0; i < pLen; i++) {
            const p = PROJECTILE_POOL[i];
            if (!p.active) {
                p.hitEntities.clear();
                p.active = true;
                return p;
            }
        }

        const p: Projectile = {
            mesh: new THREE.Mesh(),
            type: ProjectileType.BULLET,
            weapon: DamageID.NONE,
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

    launchBullet: (scene: THREE.Scene, projectiles: Projectile[], origin: THREE.Vector3, dir: THREE.Vector3, weapon: DamageID, damage?: number) => {
        const data = WEAPONS[weapon];
        if (!data) return;

        const p = ProjectileSystem._getProjectile();
        p.type = ProjectileType.BULLET;
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

        // VINTERDÖD DOD FLATTENING
        p.baseDamage = data.damage;
        p.damage = damage !== undefined ? damage : data.damage;
        p.piercing = data.piercing || false;
        p.pierceDecay = data.pierceDecay || 1.0;
        p.impactType = data.impactType;

        // Data-Driven High Impact Rules
        p.highImpactDistSq = (weapon === DamageID.SHOTGUN) ? 144.0 : 0;
        p.highImpactDamageFactor = (weapon === DamageID.REVOLVER) ? 0.5 : 0;

        projectiles.push(p);
    },

    launchThrowable: (scene: THREE.Scene, projectiles: Projectile[], origin: THREE.Vector3, target: THREE.Vector3, weapon: DamageID, time: number, damage: number) => {
        const data = WEAPONS[weapon];
        if (!data) return;

        const p = ProjectileSystem._getProjectile();
        p.type = ProjectileType.THROWABLE;
        p.weapon = weapon;
        p.mesh.position.copy(origin);
        p.mesh.rotation.set(0, 0, 0);

        switch (weapon) {
            case DamageID.MOLOTOV:
                p.mesh.geometry = GEOMETRY.molotov;
                p.mesh.material = MATERIALS.molotov;
                break;
            case DamageID.FLASHBANG:
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

        p.baseDamage = data.damage;
        p.damage = damage !== undefined ? damage : data.damage;
        p.life = time + 0.5;
        p.maxRadius = data.radius || 10;

        p.highImpactDistSq = 0;
        p.highImpactDamageFactor = 0;

        if (weapon !== DamageID.MOLOTOV) {
            if (!p.marker) {
                p.marker = new THREE.Mesh(GEOMETRY.landingMarker, MATERIALS.landingMarker);
                p.marker.rotation.x = -Math.PI / 2;
            }

            p.marker.position.copy(target);
            p.marker.scale.setScalar(data.radius || 10);

            if (p.marker.parent !== scene) scene.add(p.marker);
        }

        projectiles.push(p);
    },

    handleContinuousFire: (weapon: DamageID, origin: THREE.Vector3, direction: THREE.Vector3, simDelta: number, ctx: GameContext, damageOverride?: number) => {
        const data = WEAPONS[weapon];
        if (!data) return;

        const damage = damageOverride !== undefined ? damageOverride : (data.damage || 0) * (60 * simDelta);

        switch (weapon) {
            case DamageID.FLAMETHROWER: {
                if (Math.random() < 0.3) {
                    WeaponFX.createMuzzleFlash(origin, direction, false);
                }

                const count = 4;
                for (let i = 0; i < count; i++) {
                    _v1.copy(origin).addScaledVector(direction, 0.5 + Math.random() * 0.8);
                    WeaponFX.createFlame(_v1, direction);
                }

                const range = data.range || 15;
                const rangeSq = range * range;

                let maxReach = range;
                const obstacles = ctx.collisionGrid.getNearbyObstacles(origin, range);
                const obsLen = obstacles.length;
                for (let i = 0; i < obsLen; i++) {
                    const obs = obstacles[i];
                    _v1.subVectors(obs.position, origin);
                    const d = _v1.length();
                    if (d < 0.5) continue;

                    _v1.divideScalar(d);
                    if (direction.dot(_v1) > 0.96) {
                        const obsRad = obs.radius || 1.5;
                        if (d - obsRad < maxReach) {
                            maxReach = d - obsRad;
                        }
                    }
                }

                const enemies = ctx.collisionGrid.getNearbyEnemies(origin, range);
                const eneLen = enemies.length;
                for (let _fi = 0; _fi < eneLen; _fi++) {
                    const e = enemies[_fi];
                    if (e.deathState !== EnemyDeathState.ALIVE) continue;

                    _v1.subVectors(e.mesh.position, origin);
                    const distSq = _v1.lengthSq();

                    if (distSq > rangeSq) continue;

                    const dist = Math.sqrt(distSq);

                    if (dist > maxReach + 1.2) continue;

                    _v1.divideScalar(dist);
                    const dot = direction.dot(_v1);

                    if (dot > FLAMETHROWER_CONE_ANGLE) {
                        if ((e.statusFlags & EnemyFlags.IN_WATER) !== 0) {
                            if (Math.random() < 0.1) {
                                ctx.spawnPart(e.mesh.position.x, 0.5, e.mesh.position.z, 'large_smoke', 1);
                            }
                            continue;
                        }

                        e.statusFlags |= EnemyFlags.BURNING;
                        e.burnTickTimer = 0.5;
                        e.burnDuration = 5.0;

                        const chance = (simDelta * 1000) / (data.fireRate || 35);
                        if (Math.random() < chance) {
                            const finalDmg = damageOverride !== undefined ? (damageOverride / (60 * simDelta)) : data.damage;
                            ctx.applyDamage(e, finalDmg || 0, DamageID.FLAMETHROWER);
                        }
                    }
                }

                if (ctx.simTime - _lastFlameSoundTime > 200) {
                    soundManager.playFlamethrowerStart();
                    _lastFlameSoundTime = ctx.simTime;
                }

                break;
            }

            case DamageID.ARC_CANNON: {
                const range = data.range || 20.0;
                const rangeSq = range * range;
                const enemies = ctx.collisionGrid.getNearbyEnemies(origin, range);
                const eneLen = enemies.length;

                let target = null;
                let minDist = Infinity;
                const aimThreshold = 0.90;

                for (let _fi = 0; _fi < eneLen; _fi++) {
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
                        const potLen = potential.length;

                        for (let _pi = 0; _pi < potLen; _pi++) {
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

                    // --- VINTERDÖD FIX: Sammanhållen blixt (Chain Lightning) med avtagande skada ---
                    let currentDamage = damage;
                    const damageDecay = 0.80;
                    const stunDur = data.statusEffect?.duration || 2.5;

                    _v3.copy(origin);
                    const hitLen = _arcCannonHitList.length;

                    for (let i = 0; i < hitLen; i++) {
                        const e = _arcCannonHitList[i];

                        _v1.copy(e.mesh.position);
                        _v1.y += (e.originalScale || 1.0) * 1.0;

                        const isMain = (i === 0);
                        WeaponFX.createLightning(_v3, _v1, isMain);

                        ctx.applyDamage(e, currentDamage, DamageID.ARC_CANNON);

                        e.statusFlags |= EnemyFlags.STUNNED;
                        e.stunDuration = stunDur;

                        _v3.copy(_v1);
                        currentDamage *= damageDecay;
                    }

                    if (ctx.simTime - _lastArcCannonSoundTime > 150) {
                        soundManager.playArcCannonZap();
                        _lastArcCannonSoundTime = ctx.simTime;
                    }

                } else {
                    _v1.copy(origin).addScaledVector(direction, range);
                    WeaponFX.createLightning(origin, _v1, true);

                    if (ctx.simTime - _lastArcCannonSoundTime > 150) {
                        soundManager.playArcCannonZap();
                        _lastArcCannonSoundTime = ctx.simTime;
                    }
                }
                break;
            }
        }
    },

    update: (simDelta: number, simTime: number, ctx: GameContext, projectiles: Projectile[], fireZones: FireZone[]) => {
        ctx.simTime = simTime;

        const waterSystem = WinterEngine.getInstance()?.water;

        for (let i = projectiles.length - 1; i >= 0; i--) {
            const p = projectiles[i];

            if (p.type === ProjectileType.BULLET) {
                updateBullet(p, i, simDelta, ctx, projectiles);
            } else {
                updateThrowable(p, i, simDelta, ctx, simTime, projectiles, waterSystem);
            }
        }

        if (fireZones.length > 0) {
            let playerHitThisFrame = false;
            const frameCounter = (simTime * 0.06) | 0;

            for (let i = fireZones.length - 1; i >= 0; i--) {
                const fz = fireZones[i];
                fz.life -= simDelta;

                if ((frameCounter + i) % 2 === 0) {
                    WeaponFX.updateFireZoneVisuals(fz.mesh.position, fz.radius, simDelta * 2, ctx);
                }

                if (simTime - (fz._lastDamageTime || 0) > 500) {
                    fz._lastDamageTime = simTime;
                    const nearby = ctx.collisionGrid.getNearbyEnemies(fz.mesh.position, fz.radius);
                    const rSq = fz.radiusSq;
                    const nearLen = nearby.length;

                    for (let _ni = 0; _ni < nearLen; _ni++) {
                        const e = nearby[_ni];
                        if (e.deathState !== EnemyDeathState.ALIVE) continue;

                        if (e.mesh.position.distanceToSquared(fz.mesh.position) < rSq) {
                            e.statusFlags |= EnemyFlags.BURNING;
                            e.burnDuration = 5.0;
                            e.burnTickTimer = 0.5;
                        }
                    }

                    if (!playerHitThisFrame && ctx.playerPos.distanceToSquared(fz.mesh.position) < rSq) {
                        ctx.onPlayerHit(3, null, DamageID.BURN, true, StatusEffectType.BURNING, 3000, 5, "BURN");
                        playerHitThisFrame = true;
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
        const pLen = projectiles.length;
        for (let i = 0; i < pLen; i++) {
            const p = projectiles[i];
            if (p.mesh.parent) scene.remove(p.mesh);
            if (p.marker && p.marker.parent) scene.remove(p.marker);
            p.active = false;
        }

        const fLen = fireZones.length;
        for (let i = 0; i < fLen; i++) {
            const f = fireZones[i];
            if (f.mesh.parent) scene.remove(f.mesh);
            f.life = 0;
        }

        projectiles.length = 0;
        fireZones.length = 0;
    }
};

// --- INTERNAL HELPERS ---
function updateBullet(projectile: Projectile, index: number, simDelta: number, ctx: GameContext, projectiles: Projectile[]) {
    _v3.set(projectile.mesh.position.x, 0, projectile.mesh.position.z);
    projectile.mesh.position.addScaledVector(projectile.vel, simDelta);
    _v4.set(projectile.mesh.position.x, 0, projectile.mesh.position.z);
    projectile.life -= simDelta;

    let destroyBullet = false;

    _v2.subVectors(_v4, _v3);
    const lineLenSq = _v2.lengthSq();

    _v1.addVectors(_v3, _v4).multiplyScalar(0.5);
    const bulletTravelDist = projectile.speed * simDelta;
    const obsSearchRad = 2.0 + bulletTravelDist * 0.5;
    const nearbyObs = ctx.collisionGrid.getNearbyObstacles(_v1, obsSearchRad);
    const obsLen = nearbyObs.length;

    for (let i = 0; i < obsLen; i++) {
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

            const isGround = obs.mesh?.name?.startsWith('Ground_');
            if (!isGround) {
                const material = obs.materialId || (obs.mesh as any)?.userData?.materialId || MaterialType.GENERIC;
                soundManager.playImpact(material);
            }

            ctx.makeNoise(_v6, NoiseType.BULLET_HIT, NOISE_RADIUS[NoiseType.BULLET_HIT]);
            break;
        }
    }

    if (!destroyBullet) {
        _v1.set(0, 0, 0).addVectors(_v3, _v4).multiplyScalar(0.5);
        const enemySearchRad = 5.0 + bulletTravelDist * 0.5;
        const nearbyEnemies = ctx.collisionGrid.getNearbyEnemies(_v1, enemySearchRad);
        const eneLen = nearbyEnemies.length;

        if (eneLen > 1) {
            manualSortNearbyEnemies(_v3, nearbyEnemies);
        }

        for (let i = 0; i < eneLen; i++) {
            const enemy = nearbyEnemies[i];
            if (enemy.deathState !== EnemyDeathState.ALIVE || projectile.hitEntities.has(enemy.id)) continue;

            _v5.set(enemy.mesh.position.x, 0, enemy.mesh.position.z);
            const hitRad = enemy.hitRadius;

            _v6.subVectors(_v5, _v3);
            let t = lineLenSq > 0 ? Math.max(0, Math.min(1, _v6.dot(_v2) / lineLenSq)) : 0;
            _v6.copy(_v3).addScaledVector(_v2, t);

            if (_v6.distanceToSquared(_v5) < hitRad * hitRad) {

                let isHighImpact = false;

                if (projectile.highImpactDistSq > 0) {
                    const dx = _v6.x - projectile.origin.x;
                    const dz = _v6.z - projectile.origin.z;
                    const distFromOriginSq = dx * dx + dz * dz;
                    if (distFromOriginSq < projectile.highImpactDistSq) isHighImpact = true;
                } else if (projectile.highImpactDamageFactor > 0) {
                    if (projectile.damage >= projectile.baseDamage * projectile.highImpactDamageFactor) isHighImpact = true;
                }

                projectile.hitEntities.add(enemy.id);
                enemy.slowDuration = 0.5;

                const tracker = ctx.session.getSystem('damage_tracker_system');
                if (tracker) tracker.recordHit(ctx.session, projectile.weapon);

                const isKill = ctx.applyDamage(enemy, projectile.damage, projectile.weapon, isHighImpact);

                const mass = enemy.originalScale * enemy.widthScale;
                const force = (projectile.damage / 3) / Math.max(0.3, mass);

                if (isKill && isHighImpact) {
                    enemy.deathVel.copy(projectile.vel).normalize().multiplyScalar(force * 2.0).setY(4.0);
                }

                _v5.copy(projectile.vel).setY(0).normalize().multiplyScalar(force);
                enemy.knockbackVel.add(_v5);

                const headY = enemy.mesh.position.y + enemy.originalScale * 1.8;
                ctx.spawnPart(_v6.x, projectile.mesh.position.y, _v6.z, 'blood', 40);
                ctx.spawnPart(_v6.x, headY, _v6.z, 'blood_splat', 1, undefined, undefined, undefined, 3.0);
                soundManager.playImpact(MaterialType.FLESH);

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

        const pLen = projectiles.length;
        projectiles[index] = projectiles[pLen - 1];
        projectiles.pop();
    }
}

function updateThrowable(p: Projectile, index: number, simDelta: number, ctx: GameContext, simTime: number, projectiles: Projectile[], waterSystem: any) {
    p.vel.y -= 30 * simDelta;
    p.mesh.position.addScaledVector(p.vel, simDelta);
    p.mesh.rotation.x += 8 * simDelta;

    if (p.marker) {
        (p.marker.material as any).opacity = 0.4 + Math.abs(Math.sin(simTime * 0.01)) * 0.6;
    }

    let destroyed = false;
    let hitWater = false;
    let hitY = 0;

    if (p.mesh.position.y < 2.0 && waterSystem) {
        waterSystem.checkBuoyancy(p.mesh.position.x, p.mesh.position.y, p.mesh.position.z, ctx.session.state.renderTime);
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

        switch (p.weapon) {
            case DamageID.GRENADE:
                if (hitWater) {
                    soundManager.playWaterExplosion();
                    haptic.explosionWater();
                } else {
                    soundManager.playGrenadeImpact();
                    haptic.explosion();
                }
                const gnRadius = hitWater ? (NOISE_RADIUS[NoiseType.GRENADE] * 0.5) : NOISE_RADIUS[NoiseType.GRENADE];
                ctx.makeNoise(_v1, NoiseType.GRENADE, gnRadius);
                WeaponFX.createGrenadeImpact(_v1, p.maxRadius || 10, hitWater, ctx);

                const effectiveRadius = hitWater ? (p.maxRadius || 10) * 0.5 : (p.maxRadius || 10);
                const nearby = ctx.collisionGrid.getNearbyEnemies(_v1, effectiveRadius + 3.0);
                const nLen = nearby.length;

                for (let i = 0; i < nLen; i++) {
                    const e = nearby[i];
                    if (e.deathState !== EnemyDeathState.ALIVE) continue;

                    _v2.subVectors(e.mesh.position, _v1);
                    const distSq = _v2.lengthSq();
                    const totalRad = effectiveRadius + e.hitRadius;

                    if (distSq < totalRad * totalRad) {
                        const isKill = ctx.applyDamage(e, p.damage, DamageID.GRENADE, true);

                        if (isKill) {
                            const forceMultiplier = hitWater ? 5.0 : 15.0;
                            const force = forceMultiplier * (1.0 - Math.sqrt(distSq) / effectiveRadius);
                            _v4.copy(_v2).normalize().setY(hitWater ? 1.5 : 0.5).multiplyScalar(force);
                            e.deathVel.copy(_v4);
                        } else {
                            const mass = e.originalScale * e.widthScale;
                            const kbForce = hitWater ? 12 : 25;
                            _v4.copy(_v2).normalize().multiplyScalar(kbForce / mass).setY(hitWater ? 1.0 : 2.0);
                            e.knockbackVel.add(_v4);
                        }
                    }
                }
                break;

            case DamageID.MOLOTOV:
                if (hitWater) {
                    ctx.makeNoise(_v1, NoiseType.MOLOTOV, NOISE_RADIUS[NoiseType.BULLET_HIT]);
                    soundManager.playWaterSplash();
                    haptic.explosionWater();
                } else {
                    ctx.makeNoise(_v1, NoiseType.MOLOTOV, NOISE_RADIUS[NoiseType.MOLOTOV]);
                    soundManager.playMolotovImpact();
                    haptic.explosion();
                }

                WeaponFX.createMolotovImpact(_v1, p.maxRadius || 10, hitWater, ctx);

                if (!hitWater) {
                    let fz: FireZone | null = null;
                    const fLen = FIREZONE_POOL.length;
                    for (let i = 0; i < fLen; i++) {
                        if (FIREZONE_POOL[i].life <= 0) {
                            fz = FIREZONE_POOL[i];
                            break;
                        }
                    }

                    const mRad = p.maxRadius || 10;
                    if (!fz) {
                        fz = { mesh: new THREE.Mesh(GEOMETRY.fireZone, MATERIALS.fireZone), radius: mRad, radiusSq: mRad * mRad, life: 6.0 };
                        FIREZONE_POOL.push(fz);
                    }

                    fz.radius = mRad;
                    fz.radiusSq = mRad * mRad;
                    fz.life = 6.0;
                    fz._lastDamageTime = 0;
                    fz.mesh.rotation.x = -Math.PI / 2;
                    fz.mesh.position.set(_v1.x, 0.24, _v1.z);
                    fz.mesh.scale.setScalar(fz.radius / 3.5);

                    if (fz.mesh.parent !== ctx.scene) ctx.scene.add(fz.mesh);
                    ctx.fireZones.push(fz);

                    const direct = ctx.collisionGrid.getNearbyEnemies(_v1, mRad);
                    const rSq = fz.radiusSq;
                    const dLen = direct.length;
                    for (let i = 0; i < dLen; i++) {
                        const e = direct[i];
                        if (e.deathState !== EnemyDeathState.ALIVE) continue;

                        if (e.mesh.position.distanceToSquared(_v1) < rSq) {
                            ctx.applyDamage(e, 0, DamageID.MOLOTOV);

                            e.statusFlags |= EnemyFlags.BURNING;
                            e.burnDuration = 5.0;
                            e.burnTickTimer = 0.5;
                        }
                    }
                }
                break;

            case DamageID.FLASHBANG:
                if (hitWater) {
                    ctx.makeNoise(_v1, NoiseType.FLASHBANG, NOISE_RADIUS[NoiseType.BULLET_HIT]);
                    soundManager.playWaterSplash();
                    haptic.explosionWater();
                } else {
                    ctx.makeNoise(_v1, NoiseType.FLASHBANG, NOISE_RADIUS[NoiseType.FLASHBANG]);
                    soundManager.playFlashbangImpact();
                    haptic.explosion();
                }

                WeaponFX.createFlashbangImpact(_v1, hitWater, ctx);

                const fbRad = p.maxRadius || 10;
                const nearbyFb = ctx.collisionGrid.getNearbyEnemies(_v1, fbRad);
                const fbRSq = fbRad * fbRad;
                const fLen = nearbyFb.length;

                for (let i = 0; i < fLen; i++) {
                    const e = nearbyFb[i];
                    if (e.deathState !== EnemyDeathState.ALIVE) continue;

                    if (e.mesh.position.distanceToSquared(_v1) < fbRSq) {
                        e.statusFlags |= EnemyFlags.BLINDED | EnemyFlags.STUNNED;
                        e.blindDuration = 4.0;
                        e.stunDuration = 1.5;
                        WeaponFX.createStunSparks(e.mesh.position);
                    }
                }
                break;
        }

        p.active = false;

        const pLen = projectiles.length;
        projectiles[index] = projectiles[pLen - 1];
        projectiles.pop();
    } else {
        p.life -= simDelta;
    }
}