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
import { NoiseType } from './NoiseSystem';
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
    spawnDecal: (x: number, z: number, scale: number, mat?: any) => void;
    explodeEnemy: (e: Enemy, force: THREE.Vector3) => void;
    addScore: (amt: number) => void;
    addFireZone: (z: FireZone) => void;
    applyDamage: (enemy: Enemy, amount: number, type: string | WeaponType | DamageType, isHighImpact?: boolean) => boolean;

    now: number;
    playerPos: THREE.Vector3;
    onPlayerHit: (damage: number, attacker: any, type: string | DamageType, isDoT?: boolean, effect?: any, duration?: number, intensity?: number, attackName?: string) => void;
    noiseEvents?: any[];
    makeNoise?: (pos: THREE.Vector3, type: NoiseType, radius?: number) => void;
    weaponHandler?: any;
}

export interface Projectile {
    mesh: THREE.Mesh;
    type: 'bullet' | 'throwable';
    weapon: string;
    vel: THREE.Vector3;
    origin: THREE.Vector3;
    speed: number;
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

const THROWABLE_BEHAVIORS: Record<string, { onImpact: (pos: THREE.Vector3, radius: number, ctx: GameContext, damage?: number, hitWater?: boolean) => void }> = {

    [WeaponType.GRENADE]: {
        onImpact: (pos, radius, ctx, damage = 180, hitWater = false) => {
            if (!hitWater) {
                _v2.set(0, 0, 0);

                const effectScale = radius * 0.25;

                // 1. FLASH: Much shorter lifespan (from 15 to 5) and smaller scale.
                // It should only be there for a fraction of a second to simulate the light flash.
                ctx.spawnPart(pos.x, pos.y + 0.5, pos.z, 'flash', 1, undefined, _v2, undefined, effectScale, 5.0);

                // 2. SHOCKWAVE: Ground marker for to "anchor" the explosion in the ground
                ctx.spawnPart(pos.x, pos.y + 0.1, pos.z, 'shockwave', 1, undefined, _v2, undefined, radius * 0.5, 5.0);

                // 3. BLAST RADIUS: A red/orange ring on the ground showing exactly where the damage occurred
                ctx.spawnPart(pos.x, pos.y + 0.05, pos.z, 'blastRadius', 1, undefined, _v2, undefined, radius, 30.0);

                // 4. FIRE: Fewer "large_fire" (they are the ones that blind the most).
                for (let i = 0; i < 8; i++) {
                    _v2.set(Math.random() - 0.5, Math.random() * 0.5 + 0.2, Math.random() - 0.5)
                        .normalize()
                        .multiplyScalar(radius * 0.5);

                    // Use 'fire' instead of 'large_fire' for most
                    const type = i < 3 ? 'large_fire' : 'fire';
                    ctx.spawnPart(pos.x, pos.y + 0.5, pos.z, type, 1, undefined, _v2, undefined, effectScale * 0.6 + Math.random() * 0.5, 15 + Math.random() * 10);
                }

                // 5. SMOKE: More smoke than fire for a grenade. It gives a "dirtier" feeling.
                for (let i = 0; i < 15; i++) {
                    _v2.set(Math.random() - 0.5, Math.random() * 0.8 + 0.4, Math.random() - 0.5)
                        .normalize()
                        .multiplyScalar(radius * 0.4 * (1.0 + Math.random()));

                    ctx.spawnPart(pos.x, pos.y + 0.8, pos.z, 'large_smoke', 1, undefined, _v2, undefined, effectScale * 0.8 + Math.random(), 60 + Math.random() * 40);
                }

                // 6. DEBRIS: Gravel and shrapnel flying far
                for (let i = 0; i < 15; i++) {
                    _v2.set(Math.random() - 0.5, Math.random() * 1.2 + 0.5, Math.random() - 0.5)
                        .normalize()
                        .multiplyScalar(radius * 2.0); // Shrapnel flies outside the smoke puff

                    ctx.spawnPart(pos.x, pos.y + 0.5, pos.z, 'debris', 1, undefined, _v2, undefined, 0.4 + Math.random() * 0.4, 80 + Math.random() * 40);
                }
            }

            const engine = WinterEngine.getInstance();
            let inWater = hitWater;
            let waterY = pos.y;
            if (engine && engine.water && !inWater) {
                engine.water.checkBuoyancy(pos.x, pos.y, pos.z);
                if (_buoyancyResult.inWater && pos.y <= _buoyancyResult.waterLevel) {
                    inWater = true;
                    waterY = _buoyancyResult.waterLevel;
                }
            }

            if (inWater) {
                ctx.spawnPart(pos.x, waterY, pos.z, 'splash', 85);
                if (engine.water) {
                    engine.water.spawnExplosionRipple(pos.x, pos.z, 200.0);
                }
            } else {
                ctx.spawnDecal(pos.x, pos.z, 4.0, MATERIALS.scorchDecal);
            }
            soundManager.playExplosion();
            haptic.explosion();

            if (ctx.weaponHandler) {
                ctx.weaponHandler.emitImpactNoise(pos, WeaponType.GRENADE, ctx);
            }

            const nearby = ctx.collisionGrid.getNearbyEnemies(pos, radius + 3.0);
            for (let i = 0; i < nearby.length; i++) {
                const e = nearby[i];
                if (e.deathState !== EnemyDeathState.ALIVE) continue;

                _v2.subVectors(e.mesh.position, pos);
                const distSq = _v2.lengthSq();
                const totalRad = radius + (1.0 * e.widthScale * (e.originalScale || 1.0));

                if (distSq < totalRad * totalRad) {
                    const isKill = ctx.applyDamage(e, damage, WeaponType.GRENADE, true);

                    if (isKill) {
                        const force = 15.0 * (1.0 - Math.sqrt(distSq) / radius);
                        _v4.copy(_v2).normalize().setY(0.5).multiplyScalar(force);
                        e.deathVel.copy(_v4);
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
            haptic.explosion();

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

            const engine = WinterEngine.getInstance();
            let inWater = false;
            let waterY = 0;
            if (engine && engine.water) {
                engine.water.checkBuoyancy(pos.x, pos.y, pos.z);
                if (_buoyancyResult.inWater && pos.y <= _buoyancyResult.waterLevel) {
                    inWater = true;
                    waterY = _buoyancyResult.waterLevel;
                }
            }

            if (inWater) {
                ctx.spawnPart(pos.x, waterY, pos.z, 'large_smoke', 20);
                ctx.spawnPart(pos.x, waterY, pos.z, 'splash', 10);
                if (engine.water) engine.water.spawnRipple(pos.x, pos.z, 8.0);
            } else {
                if (fz.mesh.parent !== ctx.scene) ctx.scene.add(fz.mesh);
                ctx.addFireZone(fz);
                ctx.spawnDecal(pos.x, pos.z, fz.radius * 2.0, MATERIALS.scorchDecal);
            }

            const direct = ctx.collisionGrid.getNearbyEnemies(pos, radius);
            const rSq = fz.radiusSq;
            for (let i = 0; i < direct.length; i++) {
                const e = direct[i];
                if (e.mesh.position.distanceToSquared(pos) < rSq) {
                    ctx.applyDamage(e, 0, WeaponType.MOLOTOV);
                    e.isBurning = true;
                    e.afterburnTimer = 5.0;
                    e.burnTimer = 0.5;
                }
            }

            if (ctx.weaponHandler) {
                ctx.weaponHandler.emitImpactNoise(pos, WeaponType.MOLOTOV, ctx);
            }
        }
    },
    [WeaponType.FLASHBANG]: {
        onImpact: (pos, radius, ctx) => {
            ctx.spawnPart(pos.x, 2, pos.z, 'flash', 1, undefined, undefined, undefined, 8.0);
            ctx.spawnDecal(pos.x, pos.z, 2.0, MATERIALS.scorchDecal);
            soundManager.playExplosion();
            haptic.explosion();

            const nearby = ctx.collisionGrid.getNearbyEnemies(pos, radius);
            const rSq = radius * radius;
            for (let i = 0; i < nearby.length; i++) {
                const e = nearby[i];
                if (e.mesh.position.distanceToSquared(pos) < rSq) {
                    e.isBlinded = true;
                    e.blindTimer = 4.0;
                    e.stunTimer = 1.5;
                    ctx.spawnPart(e.mesh.position.x, 1.8, e.mesh.position.z, 'enemy_effect_stun', 3, undefined, undefined, undefined, 0.8);
                }
            }

            if (ctx.weaponHandler) {
                ctx.weaponHandler.emitImpactNoise(pos, WeaponType.FLASHBANG, ctx);
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
            life: 0,
            hitEntities: new Set(),
            active: true
        };
        PROJECTILE_POOL.push(p);
        return p;
    },

    spawnBullet: (scene: THREE.Scene, projectiles: Projectile[], origin: THREE.Vector3, dir: THREE.Vector3, weapon: string, damage?: number) => {
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
        p.damage = damage !== undefined ? damage : data.damage;
        p.life = 1.5;
        projectiles.push(p);
    },

    spawnThrowable: (scene: THREE.Scene, projectiles: Projectile[], origin: THREE.Vector3, target: THREE.Vector3, weapon: string, time: number) => {
        const data = WEAPONS[weapon];
        if (!data) return;

        const p = ProjectileSystem._getProjectile();
        p.type = 'throwable';
        p.weapon = weapon;
        p.mesh.position.copy(origin);
        p.mesh.rotation.set(0, 0, 0);

        if (weapon == WeaponType.MOLOTOV) {
            p.mesh.geometry = GEOMETRY.molotov;
            p.mesh.material = MATERIALS.molotov;
        } else if (weapon == WeaponType.FLASHBANG) {
            p.mesh.geometry = GEOMETRY.flashbang;
            p.mesh.material = MATERIALS.flashbang
        } else {
            p.mesh.geometry = GEOMETRY.grenade;
            p.mesh.material = MATERIALS.grenade;
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
        p.damage = data.damage;
        p.life = time + 0.5;
        p.maxRadius = data.range;

        if (!p.marker) {
            p.marker = new THREE.Mesh(GEOMETRY.landingMarker, MATERIALS.landingMarker);
            p.marker.rotation.x = -Math.PI / 2;
        }

        p.marker.position.copy(target);
        p.marker.scale.setScalar(data.range);

        if (p.marker.parent !== scene) scene.add(p.marker);

        projectiles.push(p);
    },

    // --- CONTINUOUS WEAPON HANDLING ---

    handleContinuousFire: (weapon: WeaponType, origin: THREE.Vector3, direction: THREE.Vector3, delta: number, ctx: GameContext, damageOverride?: number) => {
        const data = WEAPONS[weapon];
        if (!data) return;

        const damage = damageOverride !== undefined ? damageOverride : (data.damage || 0) * (60 * delta);

        if (weapon === WeaponType.FLAMETHROWER) {
            if (Math.random() < 0.3) {
                WeaponFX.spawnMuzzleFlash(origin, direction, false);
            }

            // Skapa elden (vi ökar till 4 partiklar per tick för att molnet ska bli riktigt tätt)
            const count = 4;
            for (let i = 0; i < count; i++) {
                // Sprid ut startpunkten marginellt för att elden ska se oregelbunden ut direkt från mynningen
                _v1.copy(origin).addScaledVector(direction, 0.5 + Math.random() * 0.8);
                WeaponFX.spawnFlame(_v1, direction);
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

                // Fienden måste befinna sig inuti den nya, bredare konen
                if (dot > FLAMETHROWER_CONE_ANGLE) {
                    e.isBurning = true;
                    e.burnTimer = 0.5;
                    e.afterburnTimer = 5.0;

                    const chance = (delta * 1000) / data.fireRate;
                    if (Math.random() < chance) {
                        const finalDmg = damageOverride !== undefined ? (damageOverride / (60 * delta)) : data.damage;
                        ctx.applyDamage(e, finalDmg, WeaponType.FLAMETHROWER);
                    }
                }
            }
        }

        else if (weapon === WeaponType.ARC_CANNON) {
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

                // 1. MAIN BOLT: Origin -> First Target (Thicker visual)
                _v3.copy(origin);
                const primaryTarget = _arcCannonHitList[0];
                _v1.copy(primaryTarget.mesh.position).y += 1.0;

                WeaponFX.spawnLightning(_v3, _v1, true);
                ctx.applyDamage(primaryTarget, finalDamage, WeaponType.ARC_CANNON);
                primaryTarget.stunTimer = stunDur;

                // 2. BRANCHES: First Target -> Secondary Targets (Kedjad ström från fiende till fiende)
                _v3.copy(_v1);

                for (let i = 1; i < _arcCannonHitList.length; i++) {
                    const e = _arcCannonHitList[i];
                    _v1.copy(e.mesh.position).y += 1.0;

                    WeaponFX.spawnLightning(_v3, _v1, false);
                    ctx.applyDamage(e, finalDamage, WeaponType.ARC_CANNON);
                    e.stunTimer = stunDur;

                    _v3.copy(_v1); // Nästa gren startar från denna fienden!
                }

                // Throttle the sound logic (approx 6 times per second)
                if (ctx.now - _lastArcSoundTime > 150) {
                    soundManager.playArcCannonZap();
                    _lastArcSoundTime = ctx.now;
                }

            } else {
                // Shoot empty bolt into the void
                _v1.copy(origin).addScaledVector(direction, range);
                WeaponFX.spawnLightning(origin, _v1, true);

                if (ctx.now - _lastArcSoundTime > 150) {
                    soundManager.playArcCannonZap();
                    _lastArcSoundTime = ctx.now;
                }
            }
        }
    },

    update: (delta: number, now: number, ctx: GameContext, projectiles: Projectile[], fireZones: FireZone[]) => {
        ctx.now = now;

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

                // Player Burn Interaction
                if (ctx.playerPos.distanceToSquared(fz.mesh.position) < rSq) {
                    if (ctx.onPlayerHit) {
                        ctx.onPlayerHit(3, null, DamageType.BURN, true, StatusEffectType.BURNING, 3000, 5, 'Fire');
                    }
                }
            }

            const targetFlameCount = 360 * delta;
            let flameCount = Math.floor(targetFlameCount);
            if (Math.random() < (targetFlameCount - flameCount)) flameCount++;

            for (let j = 0; j < flameCount; j++) {
                const r = Math.sqrt(Math.random()) * fz.radius;
                const theta = Math.random() * Math.PI * 2;
                const fx = fz.mesh.position.x + r * Math.cos(theta);
                const fzZ = fz.mesh.position.z + r * Math.sin(theta);

                const normalizedDist = r / fz.radius;
                const flameScale = 2.5 - normalizedDist * 1.8;
                const flameY = 0.3 + (1.0 - normalizedDist) * 1.2;
                const colorHex = Math.random() > 0.6 ? 0xffcc00 : (Math.random() > 0.3 ? 0xff8800 : 0xff4400);

                ctx.spawnPart(fx, flameY, fzZ, 'fire', 1, undefined, undefined, colorHex, flameScale);
            }

            if (fz.life <= 0) {
                ctx.scene.remove(fz.mesh);
                fireZones[i] = fireZones[fireZones.length - 1];
                fireZones.pop();
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
    const data = WEAPONS[projectile.weapon];
    if (!data) return;

    _v2.subVectors(_v4, _v3);
    const lineLenSq = _v2.lengthSq();

    _v1.addVectors(_v3, _v4).multiplyScalar(0.5);
    const bulletTravelDist = projectile.speed * delta;
    const obsSearchRad = 2.0 + bulletTravelDist * 0.5;
    const nearbyObs = ctx.collisionGrid.getNearbyObstacles(_v1, obsSearchRad);

    for (let i = 0; i < nearbyObs.length; i++) {
        const obs = nearbyObs[i];

        // Ignore player's own collider
        if (Math.abs(obs.position.x - ctx.playerPos.x) < 0.5 && Math.abs(obs.position.z - ctx.playerPos.z) < 0.5) {
            continue;
        }

        _v5.set(obs.position.x, 0, obs.position.z);
        const rad = obs.radius || 2.0;

        // Use _v6 here so we don't overwrite _v1 used for Grid Search
        _v6.subVectors(_v5, _v3);
        let t = lineLenSq > 0 ? Math.max(0, Math.min(1, _v6.dot(_v2) / lineLenSq)) : 0;
        _v6.copy(_v3).addScaledVector(_v2, t);

        if (_v6.distanceToSquared(_v5) < rad * rad) {
            destroyBullet = true;
            ctx.spawnPart(_v6.x, projectile.mesh.position.y, _v6.z, 'smoke', 3);
            soundManager.playImpact(obs.mesh?.userData?.material || 'concrete');
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
                let isHighImpact = false;
                if (projectile.weapon === WeaponType.SHOTGUN) {
                    const distFromOriginSq = Math.pow(_v6.x - projectile.origin.x, 2) + Math.pow(_v6.z - projectile.origin.z, 2);
                    if (distFromOriginSq < 144.0) isHighImpact = true;
                } else if (projectile.weapon === WeaponType.REVOLVER) {
                    if (projectile.damage >= data.baseDamage * 0.5) isHighImpact = true;
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

                if (data.piercing) {
                    projectile.damage *= data.pierceDecay;
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

function updateThrowable(p: Projectile, index: number, delta: number, ctx: GameContext, now: number, projectiles: Projectile[]) {
    p.vel.y -= 30 * delta;
    p.mesh.position.addScaledVector(p.vel, delta);
    p.mesh.rotation.x += 8 * delta;
    if (p.marker) (p.marker.material as any).opacity = 0.4 + Math.abs(Math.sin(now * 0.01)) * 0.6;

    let destroyed = false;
    let hitWater = false;
    let hitY = 0;

    const engine = WinterEngine.getInstance();
    if (engine && engine.water) {
        engine.water.checkBuoyancy(p.mesh.position.x, p.mesh.position.y, p.mesh.position.z);
        if (_buoyancyResult.inWater && p.mesh.position.y <= _buoyancyResult.waterLevel) {
            destroyed = true;
            hitWater = true;
            hitY = _buoyancyResult.waterLevel;
            ctx.spawnPart(p.mesh.position.x, hitY, p.mesh.position.z, 'splash', 15);
            engine.water.spawnRipple(p.mesh.position.x, p.mesh.position.z, 5.0);
        }
    }

    if (!destroyed && (p.mesh.position.y <= 0.1 || p.life <= 0)) {
        destroyed = true;
        hitY = 0;
    }

    if (destroyed) {
        ctx.scene.remove(p.mesh); if (p.marker) ctx.scene.remove(p.marker);
        _v1.copy(p.mesh.position).setY(hitY);
        const behavior = THROWABLE_BEHAVIORS[p.weapon];
        if (behavior) behavior.onImpact(_v1, p.maxRadius || 10, ctx, p.damage, hitWater);
        p.active = false;

        projectiles[index] = projectiles[projectiles.length - 1];
        projectiles.pop();
    } else {
        p.life -= delta;
    }
}