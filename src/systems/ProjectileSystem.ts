import * as THREE from 'three';
import { ColliderType } from '../core/world/CollisionResolution';
import { ProjectilePoolState, MAX_PROJECTILES } from '../core/pools/ProjectilePool';
import { DamageID, DamageType, WeaponID } from '../entities/player/CombatTypes';
import { StatID, PlayerStatusFlags } from '../types/CareerStats';
import { StatusEffectID } from '../content/perks';
import { System, SystemID } from './System';
import { ENTITY_STATUS, PHYSICS, COMBAT, MAX_ENTITIES } from '../content/constants';
import { EnemyDeathState, EnemyFlags, NoiseType, NOISE_RADIUS } from '../entities/enemies/EnemyTypes';
import { EnemyPoolState } from '../core/pools/EnemyPool';
import { GameSessionLogic } from '../game/session/GameSessionLogic';
import { EnemyManager } from '../entities/enemies/EnemyManager';
import { ProjectileRenderer } from '../core/renderers/ProjectileRenderer';
import { WeaponFX } from './WeaponFX';
import { CareerStatsSystem } from './CareerStatsSystem';
import { GamePlaySounds } from '../utils/audio/AudioLib';
import { MaterialType } from '../content/environment';
import { WEAPONS } from '../content/weapons';
import { FXParticleType } from '../types/FXTypes';

// --- ZERO-GC SCRATCHPADS ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3();
const _v5Local = new THREE.Vector3();
const _m1 = new THREE.Matrix4();
const _q1 = new THREE.Quaternion();

// Gib Master: Zero-GC callbacks scratchpad reused for every force-gib call from this system
const _gibForceDir = new THREE.Vector3();
// Stable session reference updated once per update() — avoids per-hit closure allocation
let _gibSession: GameSessionLogic | null = null;
const _gibCallbacks = {
    spawnParticle(x: number, y: number, z: number, type: FXParticleType, count: number, mesh?: any, vel?: THREE.Vector3, color?: any, scale?: number) {
        _gibSession!.spawnParticle(x, y, z, type, count, mesh, vel, color, scale);
    },
    spawnDecal(x: number, z: number, sc: number, mat?: any, t?: any) {
        _gibSession!.spawnDecal(x, z, sc, mat, t);
    },
    get session() { return _gibSession; },
};

/**
 * Projectile System
 * * High-performance, Zero-GC projectile simulation.
 * Replaces legacy ProjectileSystem.ts with a contiguous SoA pool.
 * Uses Phase 7 Spatial Hash Grid for O(1) hit detection.
 */
export class ProjectileSystem implements System {
    readonly systemId = SystemID.PROJECTILE;
    id = 'projectile_system';
    isFixedStep = true;

    private session!: GameSessionLogic;
    private renderer!: ProjectileRenderer;
    private lastShotgunHitTime: number = -1;

    init(session: GameSessionLogic) {
        ProjectilePoolState.activeCount = 0;

        this.session = session;
        this.renderer = new ProjectileRenderer(session.engine.scene);
        this.lastShotgunHitTime = -1;
    }

    /**
     * Main update loop for all active projectiles.
     * ZERO-GC hot path.
     */
    update(session: GameSessionLogic, delta: number, simTime: number, renderTime: number) {
        this.session = session;
        // Lifecycle Guard - Ensure we don't run simulation in non-combat contexts (Camp/UI)
        if (!session || !session.state) return;

        // Bind Gib Master callbacks once per tick — stable reference, Zero-GC hot path
        _gibSession = session;

        // Synchronize weapon visual effects pools (Lightning/Dynamic Lights)
        WeaponFX.updateFX(session, delta);

        // --- PHASE 1: CONTINUOUS FIRE (DoD Ray-free) ---
        this.handleContinuousFire(delta, simTime);

        const pool = ProjectilePoolState;
        const state = session.state;

        // --- PHASE 2: PERSISTENT FIRE ZONES ---
        this.processFireZones(delta, simTime, state);

        for (let i = 0; i < pool.activeCount; i++) {
            // 1. Physics Update (SoA)
            if (pool.hasGravity[i]) {
                pool.velY[i] -= PHYSICS.GRAVITY * delta;
            }

            pool.posX[i] += pool.velX[i] * delta;
            pool.posY[i] += pool.velY[i] * delta;
            pool.posZ[i] += pool.velZ[i] * delta;
            pool.life[i] -= delta;

            let despawn = pool.life[i] <= 0;

            if (despawn && pool.type[i] === 1) {
                // Throwable reached target/fuse limit! Trigger explosion immediately.
                this.triggerExplosion(i, false);
            }

            // 2. Environment Collision (O(1) Obstacle Check)
            const streamer = session.systems.worldStreamer;
            if (!despawn && streamer) {
                _v1.set(pool.posX[i], pool.posY[i], pool.posZ[i]);
                _v2.set(pool.velX[i], pool.velY[i], pool.velZ[i]).multiplyScalar(delta);

                const poolIdx = streamer.getObstaclePool().nextIndex();
                streamer.getNearbyObstacles(pool.posX[i], pool.posZ[i], 2.0, poolIdx);

                const obstacles = streamer.getObstaclePool().getPool(poolIdx);
                const obsCount = streamer.getObstaclePool().getCount(poolIdx);

                for (let o = 0; o < obsCount; o++) {
                    const obs = obstacles[o];
                    if (obs.isMutated) continue;

                    _v3.set(obs.position.x, 0, obs.position.z);
                    _v4.subVectors(_v3, _v1);
                    const t = Math.max(0, Math.min(1, _v4.dot(_v2) / _v2.lengthSq()));
                    _v5.copy(_v1).addScaledVector(_v2, t);

                    let hit = false;
                    const col = obs.collider;

                    if (col && col.type === ColliderType.BOX && col.size) {
                        // --- ORIENTED BOUNDING BOX COLLISION (Zero-GC O(1)) ---
                        if (obs.mesh) {
                            _m1.copy(obs.mesh.matrixWorld).invert();
                            _v5Local.copy(_v5).applyMatrix4(_m1);
                        } else {
                            _v5Local.subVectors(_v5, obs.position);
                            if (obs.quaternion) {
                                _q1.copy(obs.quaternion).conjugate();
                                _v5Local.applyQuaternion(_q1);
                            }
                            if (obs.scale) {
                                if (obs.scale.x !== 0) _v5Local.x *= (1.0 / obs.scale.x);
                                if (obs.scale.y !== 0) _v5Local.y *= (1.0 / obs.scale.y);
                                if (obs.scale.z !== 0) _v5Local.z *= (1.0 / obs.scale.z);
                            }
                        }

                        if (col.center) {
                            _v5Local.sub(col.center);
                        }

                        const hX = col.size.x * 0.5;
                        const hY = col.size.y * 0.5;
                        const hZ = col.size.z * 0.5;

                        if (_v5Local.x >= -hX && _v5Local.x <= hX &&
                            _v5Local.y >= -hY && _v5Local.y <= hY &&
                            _v5Local.z >= -hZ && _v5Local.z <= hZ) {
                            hit = true;
                        }
                    } else {
                        // --- SPHERE COLLISION ---
                        const rad = obs.radius || 1.0;
                        if (_v5.distanceToSquared(_v3) < rad * rad) {
                            hit = true;
                        }
                    }

                    if (hit) {
                        despawn = true;
                        if (pool.type[i] === 1) {
                            // Throwable hit obstacle: explode immediately
                            this.triggerExplosion(i, false);
                        } else {
                            GamePlaySounds.playImpact(obs.materialId || MaterialType.GENERIC);
                            session.makeNoise(_v5, NoiseType.BULLET_HIT, NOISE_RADIUS[NoiseType.BULLET_HIT]);
                        }
                        break;
                    }
                }
            }

            // 3. Enemy Hit Detection (Phase 7 Spatial Grid)
            if (!despawn) {
                const groundY = session.engine.ground ? session.engine.ground.getGroundHeight(pool.posX[i], pool.posZ[i], session, pool.posY[i]) : 0;

                // --- WATER IMPACT DETECTION ---
                if (session.engine.water) {
                    session.engine.water.checkBuoyancy(pool.posX[i], pool.posY[i], pool.posZ[i], renderTime);
                    const b = session.engine.water.getBuoyancyResult();

                    if (b.inWater && pool.posY[i] <= b.waterLevel + 0.1 && pool.velY[i] <= 0) {
                        despawn = true;
                        session.engine.water.spawnRipple(pool.posX[i], pool.posZ[i], renderTime, 0.8);
                        this.session.spawnParticle(pool.posX[i], b.waterLevel + 0.1, pool.posZ[i], FXParticleType.SPLASH, 8);
                        this.triggerExplosion(i, true);
                    }
                }

                if (!despawn && pool.hasGravity[i] && pool.posY[i] <= groundY + 0.1) {
                    despawn = true;
                    this.triggerExplosion(i, false);
                } else if (!despawn) {
                    _v1.set(pool.posX[i] - pool.velX[i] * delta, pool.posY[i] - pool.velY[i] * delta, pool.posZ[i] - pool.velZ[i] * delta);
                    _v2.set(pool.velX[i] * delta, pool.velY[i] * delta, pool.velZ[i] * delta);

                    const streamer = session.systems.worldStreamer;
                    const poolIdx = streamer.getEnemyPool().nextIndex();

                    const approxPathDist = Math.abs(_v2.x) + Math.abs(_v2.y) + Math.abs(_v2.z);
                    const queryRadius = Math.max(2.5, approxPathDist * 0.5 + 1.5);
                    const midX = pool.posX[i] - (_v2.x * 0.5);
                    const midZ = pool.posZ[i] - (_v2.z * 0.5);

                    streamer.getNearbyEnemies(midX, midZ, queryRadius, poolIdx);

                    const nearby = streamer.getEnemyPool().getPool(poolIdx);
                    const nearCount = streamer.getEnemyPool().getCount(poolIdx);

                    for (let n = 0; n < nearCount; n++) {
                        const enemy = nearby[n];
                        if (!enemy || EnemyPoolState.hp[enemy.poolId] <= 0) continue;

                        const enemyIdx = enemy.poolId | 0;
                        if (state.handleEnemyHit) {
                            const px = _v1.x; const pz = _v1.z;
                            const vx = _v2.x; const vz = _v2.z;
                            const ex = enemy.mesh.position.x;
                            const ez = enemy.mesh.position.z;

                            const vLenSq = vx * vx + vz * vz;
                            const dot = (ex - px) * vx + (ez - pz) * vz;
                            const tProj = vLenSq > 0.0001 ? Math.max(0, Math.min(1, dot / vLenSq)) : 0;

                            const closestX = px + vx * tProj;
                            const closestZ = pz + vz * tProj;

                            const dx = closestX - ex;
                            const dz = closestZ - ez;
                            const distSq = dx * dx + dz * dz;

                            const hitRad = enemy.hitRadius || 0.8;
                            if (distSq <= hitRad * hitRad) {
                                const wepStats = WEAPONS[pool.weaponId[i]];

                                const isRevolver = pool.weaponId[i] === WeaponID.REVOLVER;
                                const isShotgun = pool.weaponId[i] === WeaponID.SHOTGUN;
                                const pPos = session.state.player.position;
                                const dxP = pool.posX[i] - pPos.x;
                                const dzP = pool.posZ[i] - pPos.z;
                                const distToPlayerSq = dxP * dxP + dzP * dzP;
                                const isCloseShotgun = isShotgun && distToPlayerSq < 16;

                                const isHighImpact = pool.damage[i] > 50 || isCloseShotgun || (wepStats?.impactType === EnemyDeathState.GIBBED && !isRevolver);

                                // FIXED: Authoritative Entity Stamp to prevent data desynchronization during death loop dispatcher
                                enemy.lastDamageType = pool.weaponId[i];
                                enemy.lastHitWasHighImpact = isHighImpact;

                                const isKill = state.handleEnemyHit(enemy, pool.damage[i], wepStats?.defaultDamageType || 1, pool.weaponId[i], isHighImpact);

                                // GIB MASTER: Force-gib any enemy hit by a projectile weapon while buff is active.
                                // Excludes THROWABLE and CONTINUOUS weapons — those never reach this bullet loop.
                                if (
                                    (state.combat.statusFlags & PlayerStatusFlags.GIB_MASTER) !== 0 &&
                                    enemy.deathState !== EnemyDeathState.GIBBED &&
                                    (enemy.statusFlags & EnemyFlags.DEAD) === 0
                                ) {
                                    enemy.deathState = EnemyDeathState.GIBBED;
                                    enemy.lastDamageType = pool.weaponId[i];
                                    _gibForceDir.set(pool.velX[i], pool.velY[i], pool.velZ[i]).normalize().multiplyScalar(6.0);
                                    EnemyManager.gibEnemy(enemy, _gibCallbacks, _gibForceDir);
                                    enemy.statusFlags |= EnemyFlags.DEAD;
                                    EnemyPoolState.statusFlags[enemyIdx] |= EnemyFlags.DEAD;
                                }

                                if (pool.weaponId[i] === WeaponID.SHOTGUN) {
                                    if (simTime !== this.lastShotgunHitTime) {
                                        CareerStatsSystem.recordHit(session, pool.weaponId[i]);
                                        this.lastShotgunHitTime = simTime;
                                    }
                                } else {
                                    CareerStatsSystem.recordHit(session, pool.weaponId[i]);
                                }

                                EnemyPoolState.hp[enemyIdx] = enemy.hp;
                                enemy.slowDuration = Math.max(enemy.slowDuration, 1.5);

                                _v5.set(pool.velX[i], pool.velY[i] + 2.0, pool.velZ[i]).normalize().multiplyScalar(5.0);
                                this.session.spawnParticle(pool.posX[i], pool.posY[i], pool.posZ[i], FXParticleType.BLOOD_SPLATTER, 6, undefined, _v5);
                                GamePlaySounds.playImpact(MaterialType.FLESH);

                                const canPierce = wepStats?.piercing && pool.pierceCount[i] < 3;

                                const mass = (enemy.originalScale || 1.0) * (enemy.widthScale || 1.0);
                                const force = (pool.damage[i] / 3) / Math.max(0.3, mass);
                                _v1.set(pool.velX[i], 0, pool.velZ[i]).normalize().multiplyScalar(force);
                                enemy.knockbackVel.add(_v1);

                                if (isKill && isHighImpact) {
                                    enemy.deathVel.set(pool.velX[i], pool.velY[i], pool.velZ[i]).normalize().multiplyScalar(force * 2.0).setY(4.0);
                                }

                                if (isHighImpact && session.state) {
                                    const ms = isKill ? 45 : 35;
                                    session.state.metrics.hitStopTime = Math.max(session.state.metrics.hitStopTime || 0, ms);
                                }

                                if (canPierce) {
                                    pool.pierceCount[i]++;
                                    pool.damage[i] *= (wepStats?.pierceDecay || 0.7);

                                    _v1.set(pool.velX[i], 0, pool.velZ[i]).normalize().multiplyScalar(hitRad + 0.1);
                                    pool.posX[i] += _v1.x;
                                    pool.posZ[i] += _v1.z;
                                    despawn = false;
                                } else {
                                    despawn = true;
                                }
                                break;
                            }
                        }
                    }
                }
            }

            if (despawn) {
                this.despawnProjectile(i);
                i--;
            }
        }

        if (this.renderer) {
            this.renderer.syncTransforms();
        }
    }

    private triggerExplosion(idx: number, hitWater: boolean = false) {
        const pool = ProjectilePoolState;
        const radius = pool.weaponId[idx] === DamageID.GRENADE ? 8 : 5;
        const damage = pool.damage[idx];
        const px = pool.posX[idx];
        const pz = pool.posZ[idx];

        let hitCount = 0;

        const streamer = this.session.systems.worldStreamer;
        const poolIdx = streamer.getEnemyPool().nextIndex();
        streamer.getNearbyEnemies(px, pz, radius, poolIdx);

        const nearby = streamer.getEnemyPool().getPool(poolIdx);
        const nearCount = streamer.getEnemyPool().getCount(poolIdx);
        const activeEnemies = EnemyManager.getActiveEnemies();
        const radSq = radius * radius;

        for (let i = 0; i < nearCount; i++) {
            const enemy = nearby[i];
            if (!enemy) continue;
            const eIdx = enemy.poolId | 0;
            if ((EnemyPoolState.statusFlags[eIdx] & ENTITY_STATUS.DEAD) !== 0) continue;
            const dx = enemy.mesh.position.x - px;
            const dz = enemy.mesh.position.z - pz;
            const distSq = dx * dx + dz * dz;
            if (distSq < radSq) {
                const enemyObj = activeEnemies[eIdx];
                if (enemyObj) {
                    const dist = Math.sqrt(distSq);
                    const forceMag = 15.0 + (1.0 - dist / radius) * 20.0;
                    if (distSq > 0.001) {
                        enemyObj.deathVel.set(dx / dist, 0, dz / dist).multiplyScalar(forceMag);
                    } else {
                        enemyObj.deathVel.set(0, 0, 1).multiplyScalar(forceMag);
                    }
                    enemyObj.deathVel.y = 8.0 + Math.random() * 4.0;

                    // Critical entity stamp for AoE explosive sweeps
                    enemyObj.lastDamageType = pool.weaponId[idx];
                    enemyObj.lastHitWasHighImpact = true;
                }
                EnemyPoolState.hp[eIdx] -= damage;
                this.session.state.handleEnemyHit(activeEnemies[eIdx], damage, DamageType.EXPLOSION, pool.weaponId[idx], true);
                hitCount++;
            }
        }

        if (hitCount > 0) {
            CareerStatsSystem.recordHit(this.session, pool.weaponId[idx]);
            CareerStatsSystem.recordUniqueEnemiesHitByExplosive(this.session, hitCount);
        }

        _v1.set(px, hitWater ? (this.session.engine.water?.getBuoyancyResult().waterLevel || 0.1) : 0.1, pz);

        let noiseType = NoiseType.OTHER;
        if (pool.weaponId[idx] === DamageID.GRENADE) {
            noiseType = NoiseType.GRENADE;
        } else if (pool.weaponId[idx] === DamageID.MOLOTOV) {
            noiseType = NoiseType.MOLOTOV;
        } else if (pool.weaponId[idx] === DamageID.FLASHBANG) {
            noiseType = NoiseType.FLASHBANG;
        }
        if (noiseType !== NoiseType.OTHER) {
            this.session.makeNoise(_v1, noiseType, NOISE_RADIUS[noiseType]);
        }

        if (pool.weaponId[idx] === DamageID.GRENADE) {
            WeaponFX.createGrenadeImpact(_v1, radius, hitWater, this.session);
        } else if (pool.weaponId[idx] === DamageID.MOLOTOV) {
            WeaponFX.createMolotovImpact(_v1, radius, hitWater, this.session);

            if (!hitWater) {
                const fZones = this.session.state.combat.fireZones;
                const fCount = this.session.state.combat.fireZoneCount | 0;
                if (fCount < MAX_ENTITIES.FIRE_ZONES) {
                    const fz = fZones[fCount];
                    fz.x = px; fz.z = pz; fz.radius = radius; fz.life = 8.0;
                    fz.damage = damage * 0.2; fz.sourceId = pool.weaponId[idx];
                    fz.nextTick = (this.session.state.simTime || 0) + 500;
                    this.session.state.combat.fireZoneCount = (fCount + 1) | 0;
                }
            }
        } else if (pool.weaponId[idx] === DamageID.FLASHBANG) {
            WeaponFX.createFlashbangImpact(_v1, false, this.session);
        }
    }

    private processFireZones(delta: number, simTime: number, state: any) {
        let fCount = state.combat.fireZoneCount | 0;
        if (fCount === 0) return;

        const fireZones = state.combat.fireZones;
        const enemies = EnemyManager.getActiveEnemies();
        const ctx = this.session;

        for (let i = 0; i < fCount; i++) {
            const fz = fireZones[i];
            fz.life -= delta;

            if (fz.life <= 0) {
                const lastIdx = (fCount - 1) | 0;
                if (i < lastIdx) {
                    const last = fireZones[lastIdx];
                    fz.x = last.x; fz.z = last.z; fz.radius = last.radius;
                    fz.life = last.life; fz.damage = last.damage; fz.sourceId = last.sourceId;
                    fz.nextTick = last.nextTick;
                }
                state.combat.fireZoneCount = lastIdx; fCount = lastIdx; i--;
                continue;
            }

            _v1.set(fz.x, 0, fz.z);
            if (ctx) {
                WeaponFX.updateFireZoneVisuals(_v1, fz.radius, delta, ctx);
            }

            const TICK_INTERVAL_MS = 500;
            if (simTime >= fz.nextTick) {
                fz.nextTick = simTime + TICK_INTERVAL_MS;
                const dmg = fz.damage * (TICK_INTERVAL_MS / 1000);
                const radSq = fz.radius * fz.radius;

                if (ctx) {
                    const pdx = ctx.state.player.position.x - fz.x;
                    const pdz = ctx.state.player.position.z - fz.z;
                    if (pdx * pdx + pdz * pdz <= radSq) {
                        ctx.systems.perkSystem.applyPerk(ctx, StatusEffectID.BURNING, 1500, 1.0);
                        if (ctx.state.callbacks?.handlePlayerHit) {
                            ctx.state.callbacks.handlePlayerHit(dmg, null, DamageType.BURN, fz.sourceId || DamageID.BURN, true, StatusEffectID.BURNING, 1500, 1.0);
                        }
                    }
                }

                if (ctx?.worldStreamer) {
                    const streamer = ctx.worldStreamer;
                    const poolIdx = streamer.getEnemyPool().nextIndex();
                    streamer.getNearbyEnemies(fz.x, fz.z, fz.radius, poolIdx);

                    const nearby = streamer.getEnemyPool().getPool(poolIdx);
                    const nearCount = streamer.getEnemyPool().getCount(poolIdx);

                    for (let j = 0; j < nearCount; j++) {
                        const enemy = nearby[j];
                        if (!enemy) continue;
                        const jIdx = enemy.poolId | 0;
                        if ((EnemyPoolState.statusFlags[jIdx] & EnemyFlags.DEAD) !== 0) continue;

                        const dx = EnemyPoolState.posX[jIdx] - fz.x;
                        const dz = EnemyPoolState.posZ[jIdx] - fz.z;
                        if (dx * dx + dz * dz <= radSq) {
                            EnemyPoolState.hp[jIdx] -= dmg;
                            EnemyPoolState.statusFlags[jIdx] = (EnemyPoolState.statusFlags[jIdx] | EnemyFlags.BURNING) | 0;

                            const enemyObj = enemies[jIdx];
                            if (enemyObj) {
                                enemyObj.statusFlags = (enemyObj.statusFlags | EnemyFlags.BURNING) | 0;
                                enemyObj.burnSource = fz.sourceId || DamageID.BURN;

                                // Entity damage stamp for environment fire zones
                                enemyObj.lastDamageType = fz.sourceId || DamageID.BURN;
                                enemyObj.lastHitWasHighImpact = false;
                            }

                            state.handleEnemyHit(enemyObj, dmg, DamageType.BURN, fz.sourceId, false);
                        }
                    }
                }
            }
        }
    }

    static launchBullet(origin: THREE.Vector3, dir: THREE.Vector3, weaponId: WeaponID, damage?: number, life: number = 1.5) {
        const speed = (WEAPONS as any)[weaponId]?.bulletSpeed || 70;
        const vx = dir.x * speed; const vy = dir.y * speed; const vz = dir.z * speed;

        this.spawnProjectile(origin.x, origin.y, origin.z, vx, vy, vz, life, damage || 10, weaponId, true, false, 0);
    }

    static launchThrowable(origin: THREE.Vector3, target: THREE.Vector3, weaponId: WeaponID, time: number, damage: number) {
        const g = PHYSICS.GRAVITY;
        const vx = (target.x - origin.x) / time;
        const vy = (target.y - origin.y + 0.5 * g * time * time) / time;
        const vz = (target.z - origin.z) / time;

        this.spawnProjectile(origin.x, origin.y, origin.z, vx, vy, vz, time, damage, weaponId, true, true, 1);
    }

    static spawnProjectile(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, damage: number, weaponId: WeaponID, isPlayer: boolean = true, hasGravity: boolean = false, type: number = 0) {
        if (ProjectilePoolState.activeCount >= MAX_PROJECTILES) return;

        const idx = ProjectilePoolState.activeCount;
        ProjectilePoolState.posX[idx] = x; ProjectilePoolState.posY[idx] = y; ProjectilePoolState.posZ[idx] = z;
        ProjectilePoolState.velX[idx] = vx; ProjectilePoolState.velY[idx] = vy; ProjectilePoolState.velZ[idx] = vz;
        ProjectilePoolState.life[idx] = life; ProjectilePoolState.damage[idx] = damage; ProjectilePoolState.weaponId[idx] = weaponId;
        ProjectilePoolState.isPlayer[idx] = isPlayer ? 1 : 0; ProjectilePoolState.hasGravity[idx] = hasGravity ? 1 : 0;
        ProjectilePoolState.type[idx] = type; ProjectilePoolState.pierceCount[idx] = 0;

        ProjectilePoolState.activeCount++;
    }

    private despawnProjectile(index: number) {
        const pool = ProjectilePoolState; const lastIdx = pool.activeCount - 1;
        if (index < lastIdx) {
            pool.posX[index] = pool.posX[lastIdx]; pool.posY[index] = pool.posY[lastIdx]; pool.posZ[index] = pool.posZ[lastIdx];
            pool.velX[index] = pool.velX[lastIdx]; pool.velY[index] = pool.velY[lastIdx]; pool.velZ[index] = pool.velZ[lastIdx];
            pool.life[index] = pool.life[lastIdx]; pool.damage[index] = pool.damage[lastIdx]; pool.weaponId[index] = pool.weaponId[lastIdx];
            pool.isPlayer[index] = pool.isPlayer[lastIdx]; pool.hasGravity[index] = pool.hasGravity[lastIdx]; pool.type[index] = pool.type[lastIdx];
        }
        pool.activeCount--;
    }

    /**
         * High-performance continuous weapon simulation loop.
         * Implements Loop Inversion (Loop-Switch Unrolling) to guarantee perfect 
         * hardware branch prediction and enable V8 TurboFan auto-vectorization.
         */
    private handleContinuousFire(delta: number, time: number) {
        const state = this.session.state;
        if (!state.inputState.fire || state.combat.isReloading) return;

        const wepId = state.combat.activeWeapon;
        if (wepId !== WeaponID.FLAMETHROWER && wepId !== WeaponID.ARC_CANNON) return;
        if (state.combat.weaponAmmo[wepId] <= 0) return;

        const px = state.player.position.x;
        const pz = state.player.position.z;

        const aimX = state.player.aimDirection.x;
        const aimZ = state.player.aimDirection.y;

        const baseRange = wepId === WeaponID.FLAMETHROWER ? 10 : 14;
        const range = baseRange * (state.player.statsBuffer[StatID.MULTIPLIER_RANGE] || 1.0);
        const rangeSq = range * range;
        const damage = (wepId === WeaponID.FLAMETHROWER ? 0.8 : 1.2) * (60 * delta);

        const enemies = EnemyManager.getActiveEnemies();
        const activeCount = EnemyPoolState.activeCount;
        let anyHit = false;

        // --- PIPELINE DISPATCHER JUMP TABLE (LOOP INVERSION) ---
        switch (wepId) {
            case WeaponID.FLAMETHROWER: {
                const cosHalfAngle = COMBAT.FLAMETHROWER_CONE_COS;

                _v1.set(aimX, 0, aimZ).normalize(); // Direction
                _v2.copy(state.player.position);
                _v2.y += 1.4; // Muzzle height alignment
                WeaponFX.drawFlames(this.session.engine.scene, _v2, _v1, range);

                for (let i = 0; i < activeCount; i++) {
                    if (((EnemyPoolState.statusFlags[i] | 0) & (ENTITY_STATUS.DEAD | 0)) !== 0) continue;

                    const ex = EnemyPoolState.posX[i] - px;
                    const ez = EnemyPoolState.posZ[i] - pz;
                    const dSq = ex * ex + ez * ez;
                    if (dSq > rangeSq) continue;

                    const dot = ex * aimX + ez * aimZ;
                    if (dot <= 0) continue;

                    // Compute clean 2D cone dot product
                    const invDist = 1.0 / Math.sqrt(dSq);
                    if ((ex * invDist * aimX + ez * invDist * aimZ) > cosHalfAngle) {
                        anyHit = true;
                        EnemyPoolState.hp[i] -= damage;

                        // Explicit entity combat stamping
                        enemies[i].lastDamageType = wepId;
                        enemies[i].lastHitWasHighImpact = false;

                        state.handleEnemyHit(enemies[i], damage, DamageType.BURN, wepId as unknown as DamageID, false);

                        if (EnemyPoolState.hp[i] <= 0) {
                            state.metrics.hitStopTime = Math.max(state.metrics.hitStopTime || 0, 35) | 0;
                        } else {
                            // Apply burning status bitmask
                            EnemyPoolState.statusFlags[i] = (EnemyPoolState.statusFlags[i] | EnemyFlags.BURNING) | 0;
                            enemies[i].statusFlags = (enemies[i].statusFlags | EnemyFlags.BURNING) | 0;
                            enemies[i].burnSource = wepId;

                            if (Math.random() < 0.3) {
                                _v4.set(EnemyPoolState.posX[i], 1.0, EnemyPoolState.posZ[i]);
                                WeaponFX.updateFireZoneVisuals(_v4, 0.5, delta, this.session);
                            }
                        }

                        if (Math.random() > 0.85) {
                            this.session.spawnParticle(EnemyPoolState.posX[i], 1.2, EnemyPoolState.posZ[i], FXParticleType.BLOOD_SPLATTER, 3);
                        }
                    }
                }
                break;
            }

            case WeaponID.ARC_CANNON: {
                const beamWidth = 1.2;

                for (let i = 0; i < activeCount; i++) {
                    if (((EnemyPoolState.statusFlags[i] | 0) & (ENTITY_STATUS.DEAD | 0)) !== 0) continue;

                    const ex = EnemyPoolState.posX[i] - px;
                    const ez = EnemyPoolState.posZ[i] - pz;
                    const dSq = ex * ex + ez * ez;
                    if (dSq > rangeSq) continue;

                    const dot = ex * aimX + ez * aimZ;
                    if (dot <= 0) continue;

                    // Compute straight 2D cross product proxy for high-speed linear beam tracking
                    const cross = ex * aimZ - ez * aimX;
                    if (Math.abs(cross) < beamWidth) {
                        anyHit = true;
                        EnemyPoolState.hp[i] -= damage;
                        enemies[i].stunDuration = Math.max(enemies[i].stunDuration, 0.5);

                        // Explicit entity combat stamping
                        enemies[i].lastDamageType = wepId;
                        enemies[i].lastHitWasHighImpact = false;

                        state.handleEnemyHit(enemies[i], damage, DamageType.ELECTRIC, wepId as unknown as DamageID, false);

                        // --- NESTED ARC CHAINING PIPELINE ---
                        let chainCount = 0;
                        _v3.copy(enemies[i].mesh.position);

                        for (let j = 0; j < activeCount && chainCount < 4; j++) {
                            if ((i | 0) === (j | 0)) continue;
                            if (((EnemyPoolState.statusFlags[j] | 0) & (ENTITY_STATUS.DEAD | 0)) !== 0) continue;

                            const cx = EnemyPoolState.posX[j] - EnemyPoolState.posX[i];
                            const cz = EnemyPoolState.posZ[j] - EnemyPoolState.posZ[i];
                            const cDistSq = cx * cx + cz * cz;

                            if (cDistSq < 64) { // 8 meter maximum jumping distance bounds
                                EnemyPoolState.hp[j] -= damage * 0.7;
                                enemies[j].stunDuration = Math.max(enemies[j].stunDuration, 0.5);

                                // Stamp chained sub-targets safely
                                enemies[j].lastDamageType = wepId;
                                enemies[j].lastHitWasHighImpact = false;

                                state.handleEnemyHit(enemies[j], damage * 0.7, DamageType.ELECTRIC, wepId as unknown as DamageID, false);
                                WeaponFX.drawArcLightning(this.session.engine.scene, _v3, enemies[j].mesh.position, false);
                                _v3.copy(enemies[j].mesh.position);
                                chainCount++;
                            }
                        }
                        // Render the primary authoritative connection beam
                        WeaponFX.drawArcLightning(this.session.engine.scene, state.player.position, enemies[i].mesh.position, true);

                        if (EnemyPoolState.hp[i] <= 0) {
                            state.metrics.hitStopTime = Math.max(state.metrics.hitStopTime || 0, 35) | 0;
                        }

                        if (Math.random() > 0.85) {
                            this.session.spawnParticle(EnemyPoolState.posX[i], 1.2, EnemyPoolState.posZ[i], FXParticleType.BLOOD_SPLATTER, 3);
                        }
                    }
                }

                // --- IDEAL FALLBACK BEAM BRANCH ---
                if (!anyHit) {
                    // Project clean linear cosmetic bolt when firing into empty environments
                    _v1.set(aimX, 0, aimZ).normalize().multiplyScalar(range).add(state.player.position);
                    _v1.y = state.player.position.y + 1.4; // Target shoulder height alignment

                    _v2.copy(state.player.position);
                    _v2.y += 1.4; // Origin barrel-tip height alignment

                    WeaponFX.drawArcLightning(this.session.engine.scene, _v2, _v1, false);
                }
                break;
            }
        }

        // Global accuracy tracking notification
        if (anyHit) {
            CareerStatsSystem.recordHit(this.session, wepId as unknown as DamageID);
        }
    }

    static clear(scene?: THREE.Scene, projectiles?: any[], fireZones?: any[]) {
        ProjectilePoolState.activeCount = 0;
    }

    clear() {
        ProjectilePoolState.activeCount = 0;
        if (this.renderer) this.renderer.clear();
    }

    reAttach(newScene: THREE.Scene) {
        if (this.renderer) this.renderer.reAttach(newScene);
    }
}