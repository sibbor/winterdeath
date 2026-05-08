import * as THREE from 'three';
import { ProjectilePoolState, MAX_PROJECTILES } from '../core/state/ProjectilePool';
import { getEnemyAt } from './EnemySystem';
import { DamageID } from '../entities/player/CombatTypes';
import { PlayerStatID } from '../entities/player/PlayerTypes';
import { System, SystemID } from './System';
import { ENTITY_STATUS } from '../content/constants';
import { EnemyDeathState, EnemyFlags } from '../entities/enemies/EnemyTypes';
import { EnemyPoolState } from '../core/state/EnemyPool';
import { GameSessionLogic } from '../game/session/GameSessionLogic';
import { EnemyManager } from '../entities/enemies/EnemyManager';
import { ProjectileRenderer } from '../core/renderers/ProjectileRenderer';
import { WeaponFX } from './WeaponFX';
import { GamePlaySounds } from '../utils/audio/AudioLib';
import { MaterialType } from '../content/environment';
import { ParticlePool } from '../core/state/ParticlePool';
import { WEAPONS } from '../content/weapons';
import { FXParticleType } from '../types/FXTypes';
import { FXSystem } from './FXSystem';

// --- ZERO-GC SCRATCHPADS ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3();
const _v6 = new THREE.Vector3();

/**
 * Projectile System (Phase 8)
 * 
 * High-performance, Zero-GC projectile simulation.
 * Replaces legacy ProjectileSystem.ts with a contiguous SoA pool.
 * Uses Phase 7 Spatial Hash Grid for O(1) hit detection.
 */
export class ProjectileSystem implements System {
    readonly systemId = SystemID.PROJECTILE;
    id = 'projectile_system';
    isFixedStep = true;

    private session: GameSessionLogic | null = null;
    private renderer: ProjectileRenderer | null = null;

    init(session: GameSessionLogic) {
        this.session = session;
        ProjectilePoolState.activeCount = 0;
        this.renderer = new ProjectileRenderer(session.engine.scene);
    }

    /**
     * Main update loop for all active projectiles.
     * ZERO-GC hot path.
     */
    update(session: GameSessionLogic, dt: number, simTime: number, renderTime: number) {
        this.session = session;
        // Lifecycle Guard - Ensure we don't run simulation in non-combat contexts (Camp/UI)
        if (!session || !session.state) return;

        // --- PHASE 1: CONTINUOUS FIRE (DoD Ray-free) ---
        this.handleContinuousFire(dt, simTime);

        const pool = ProjectilePoolState;
        const state = session.state;
        const enemies = EnemyManager.getActiveEnemies();

        // --- PHASE 2: PERSISTENT FIRE ZONES (Audit Fix) ---
        this.processFireZones(dt, simTime, state);

        for (let i = 0; i < pool.activeCount; i++) {
            // 1. Physics Update (SoA)
            if (pool.hasGravity[i]) {
                pool.velY[i] -= 30 * dt; // Gravity constant
            }

            pool.posX[i] += pool.velX[i] * dt;
            pool.posY[i] += pool.velY[i] * dt;
            pool.posZ[i] += pool.velZ[i] * dt;
            pool.life[i] -= dt;

            let despawn = pool.life[i] <= 0;

            // 2. Environment Collision (O(1) Obstacle Check)
            if (!despawn && state.collisionGrid) {
                _v1.set(pool.posX[i], pool.posY[i], pool.posZ[i]);
                _v2.set(pool.velX[i], pool.velY[i], pool.velZ[i]).multiplyScalar(dt);

                const grid = state.collisionGrid;
                const obstacles = grid.getNearbyObstacles(_v1, 2.0);
                for (let o = 0; o < obstacles.length; o++) {
                    const obs = obstacles[o];
                    _v3.set(obs.position.x, 0, obs.position.z);
                    _v4.subVectors(_v3, _v1);
                    const t = Math.max(0, Math.min(1, _v4.dot(_v2) / _v2.lengthSq()));
                    _v5.copy(_v1).addScaledVector(_v2, t);

                    const rad = obs.radius || 1.0;
                    if (_v5.distanceToSquared(_v3) < rad * rad) {
                        despawn = true;
                        GamePlaySounds.playImpact(obs.materialId || MaterialType.GENERIC);
                        break;
                    }
                }
            }

            // 3. Enemy Hit Detection (Phase 7 Spatial Grid)
            if (!despawn) {
                // Ground / Water check for throwables
                if (pool.hasGravity[i] && pool.posY[i] <= 0.1) {
                    despawn = true;
                    this.triggerExplosion(i);
                } else {
                    const enemyIdx = getEnemyAt(pool.posX[i], pool.posZ[i], 0.8);

                    if (enemyIdx !== -1) {
                        const enemy = enemies[enemyIdx];
                        if (enemy && state.applyDamage) {
                            const halfHeight = enemy.originalScale || 1.0;
                            const enemyY = enemy.mesh.position.y;
                            if (pool.posY[i] >= enemyY - halfHeight && pool.posY[i] <= enemyY + halfHeight) {
                                // 1. Apply SoA Damage (Phase 9 Deferred Resolution)
                                EnemyPoolState.hp[enemyIdx] -= pool.damage[i];
                                if (EnemyPoolState.hp[enemyIdx] <= 0) {
                                    EnemyPoolState.statusFlags[enemyIdx] |= ENTITY_STATUS.DEAD;
                                }

                                // 2. Trigger Legacy Callback (For FX and Telemetry)
                                state.applyDamage(enemy, pool.damage[i], pool.weaponId[i]);

                                if (this.session) {
                                    this.session.spawnParticle(pool.posX[i], pool.posY[i], pool.posZ[i], FXParticleType.BLOOD_SPLATTER, 3);
                                }
                                GamePlaySounds.playImpact(MaterialType.FLESH);

                                // --- PIERCING & HIT-STOP ---
                                const wepStats = WEAPONS[pool.weaponId[i]];
                                const canPierce = wepStats?.piercing && pool.pierceCount[i] < 3;

                                // 1. Hit-Stop Logic (Tactile Feedback)
                                const isKill = EnemyPoolState.hp[enemyIdx] <= 0;
                                const isHighImpact = pool.damage[i] > 50 || isKill || (wepStats?.impactType === EnemyDeathState.GIBBED);

                                // 2. Kinetic Feedback (Knockback)
                                const mass = (enemy.originalScale || 1.0) * (enemy.widthScale || 1.0);
                                const force = (pool.damage[i] / 3) / Math.max(0.3, mass);
                                _v1.set(pool.velX[i], 0, pool.velZ[i]).normalize().multiplyScalar(force);
                                enemy.knockbackVel.add(_v1);

                                if (isKill && isHighImpact) {
                                    enemy.deathVel.set(pool.velX[i], pool.velY[i], pool.velZ[i]).normalize().multiplyScalar(force * 2.0).setY(4.0);
                                }

                                if (isHighImpact && session.state) {
                                    const ms = isKill ? 45 : 35;
                                    session.state.hitStopTime = Math.max(session.state.hitStopTime || 0, ms);
                                }

                                if (canPierce) {
                                    pool.pierceCount[i]++;
                                    pool.damage[i] *= (wepStats?.pierceDecay || 0.7);
                                    despawn = false;
                                } else {
                                    despawn = true;
                                }
                            }
                        }
                    }
                }
            }

            // 3. Swap-and-Go Recycling
            if (despawn) {
                this.despawnProjectile(i);
                i--; // Strict Zero-GC: Check the swapped element in the next iteration
            }
        }

        // 4. Render Sync
        if (this.renderer) {
            this.renderer.syncTransforms();
        }
    }

    private triggerExplosion(idx: number) {
        const pool = ProjectilePoolState;
        const radius = pool.weaponId[idx] === DamageID.GRENADE ? 8 : 5;
        const damage = pool.damage[idx];
        const px = pool.posX[idx];
        const pz = pool.posZ[idx];

        let hitCount = 0;

        // DoD AoE Damage
        for (let i = 0; i < EnemyPoolState.activeCount; i++) {
            if ((EnemyPoolState.statusFlags[i] & ENTITY_STATUS.DEAD) !== 0) continue;
            const dx = EnemyPoolState.posX[i] - px;
            const dz = EnemyPoolState.posZ[i] - pz;
            const distSq = dx * dx + dz * dz;
            if (distSq < radius * radius) {
                EnemyPoolState.hp[i] -= damage;
                this.session?.state.applyDamage(EnemyManager.getActiveEnemies()[i], damage, pool.weaponId[idx], true);
                hitCount++;
            }
        }

        if (hitCount > 0 && this.session) {
            const tracker = this.session.getSystem<any>(SystemID.DAMAGE_TRACKER);
            if (tracker) {
                tracker.recordHit(this.session, pool.weaponId[idx]);
                tracker.recordUniqueEnemiesHitByExplosive(this.session, hitCount);
            }
        }

        // Trigger FX
        _v1.set(px, 0.1, pz);
        if (this.session) {
            if (pool.weaponId[idx] === DamageID.GRENADE) {
                WeaponFX.createGrenadeImpact(_v1, radius, false, this.session);
            } else if (pool.weaponId[idx] === DamageID.MOLOTOV) {
                WeaponFX.createMolotovImpact(_v1, radius, false, this.session);

                // --- CREATE PERSISTENT FIRE ZONE ---
                this.session.state.fireZones.push({
                    x: px,
                    z: pz,
                    radius: radius,
                    life: 8.0, // 8 seconds of fire
                    damage: damage * 0.2 // 20% of impact damage per second
                });
            } else if (pool.weaponId[idx] === DamageID.FLASHBANG) {
                WeaponFX.createFlashbangImpact(_v1, false, this.session);
            }
        }
    }

    private processFireZones(dt: number, simTime: number, state: any) {
        const fireZones = state.fireZones;
        if (!fireZones || fireZones.length === 0) return;

        const enemies = EnemyManager.getActiveEnemies();
        const ctx = this.session; // GameSessionLogic implements the necessary FX interface

        for (let i = 0; i < fireZones.length; i++) {
            const fz = fireZones[i];
            fz.life -= dt;

            if (fz.life <= 0) {
                fireZones.splice(i, 1);
                i--;
                continue;
            }

            // Visuals (Throttled update)
            _v1.set(fz.x, 0, fz.z);
            if (ctx) {
                WeaponFX.updateFireZoneVisuals(_v1, fz.radius, dt, ctx);
            }

            // Damage (Tick every 0.5s)
            const tickRate = 0.5;
            if (simTime % tickRate < dt) {
                const dmg = fz.damage * tickRate;
                const radSq = fz.radius * fz.radius;

                for (let j = 0; j < EnemyPoolState.activeCount; j++) {
                    if ((EnemyPoolState.statusFlags[j] & ENTITY_STATUS.DEAD) !== 0) continue;

                    const dx = EnemyPoolState.posX[j] - fz.x;
                    const dz = EnemyPoolState.posZ[j] - fz.z;
                    const dSq = dx * dx + dz * dz;

                    if (dSq < radSq) {
                        EnemyPoolState.hp[j] -= dmg;
                        EnemyPoolState.statusFlags[j] |= EnemyFlags.BURNING; // Apply status
                        state.applyDamage(enemies[j], dmg, DamageID.BURN, false);
                    }
                }
            }
        }
    }

    /**
     * Compatibility Bridge: launchBullet
     */
    static launchBullet(scene: THREE.Scene, projectiles: any, origin: THREE.Vector3, dir: THREE.Vector3, weapon: DamageID, damage?: number, life: number = 1.5) {
        const speed = 70; // Standard bullet speed
        const vx = dir.x * speed;
        const vy = dir.y * speed;
        const vz = dir.z * speed;

        // Weapon Muzzle FX (Phase 13 optimized)
        WeaponFX.createMuzzleFlash(origin, dir);
        WeaponFX.createMuzzleFire(origin, dir);

        this.spawnProjectile(
            origin.x, origin.y, origin.z,
            vx, vy, vz,
            life, damage || 10, weapon, true, false, 0
        );
    }

    /**
     * Compatibility Bridge: launchThrowable
     */
    static launchThrowable(scene: THREE.Scene, projectiles: any, origin: THREE.Vector3, target: THREE.Vector3, weapon: DamageID, time: number, damage: number) {
        const g = 30.0;
        const vx = (target.x - origin.x) / time;
        const vy = (target.y - origin.y + 0.5 * g * time * time) / time;
        const vz = (target.z - origin.z) / time;

        this.spawnProjectile(
            origin.x, origin.y, origin.z,
            vx, vy, vz,
            time, damage, weapon, true, true, 1
        );
    }

    /**
     * Spawns a new projectile using the next available slot in the pool.
     */
    static spawnProjectile(
        x: number, y: number, z: number,
        vx: number, vy: number, vz: number,
        life: number, damage: number,
        weaponId: DamageID, isPlayer: boolean = true,
        hasGravity: boolean = false, type: number = 0
    ) {
        if (ProjectilePoolState.activeCount >= MAX_PROJECTILES) return;

        const idx = ProjectilePoolState.activeCount;
        ProjectilePoolState.posX[idx] = x;
        ProjectilePoolState.posY[idx] = y;
        ProjectilePoolState.posZ[idx] = z;
        ProjectilePoolState.velX[idx] = vx;
        ProjectilePoolState.velY[idx] = vy;
        ProjectilePoolState.velZ[idx] = vz;
        ProjectilePoolState.life[idx] = life;
        ProjectilePoolState.damage[idx] = damage;
        ProjectilePoolState.weaponId[idx] = weaponId;
        ProjectilePoolState.isPlayer[idx] = isPlayer ? 1 : 0;
        ProjectilePoolState.hasGravity[idx] = hasGravity ? 1 : 0;
        ProjectilePoolState.type[idx] = type;
        ProjectilePoolState.pierceCount[idx] = 0;

        ProjectilePoolState.activeCount++;
    }

    private despawnProjectile(index: number) {
        const pool = ProjectilePoolState;
        const lastIdx = pool.activeCount - 1;

        if (index < lastIdx) {
            pool.posX[index] = pool.posX[lastIdx];
            pool.posY[index] = pool.posY[lastIdx];
            pool.posZ[index] = pool.posZ[lastIdx];
            pool.velX[index] = pool.velX[lastIdx];
            pool.velY[index] = pool.velY[lastIdx];
            pool.velZ[index] = pool.velZ[lastIdx];
            pool.life[index] = pool.life[lastIdx];
            pool.damage[index] = pool.damage[lastIdx];
            pool.weaponId[index] = pool.weaponId[lastIdx];
            pool.isPlayer[index] = pool.isPlayer[lastIdx];
            pool.hasGravity[index] = pool.hasGravity[lastIdx];
            pool.type[index] = pool.type[lastIdx];
        }

        pool.activeCount--;
    }

    private handleContinuousFire(dt: number, time: number) {
        if (!this.session || !this.session.state) return;
        const state = this.session.state;
        const wepId = state.activeWeapon;

        // Only process when firing continuous weapons
        if (!state.inputState.fire || state.isReloading) return;
        if (wepId !== DamageID.FLAMETHROWER && wepId !== DamageID.ARC_CANNON) return;

        // Verify ammo (WeaponHandler handles consumption, we just gate damage here)
        if (state.weaponAmmo[wepId] <= 0) return;

        if (!this.session.playerPos) return;
        const px = this.session.playerPos.x;
        const pz = this.session.playerPos.z;

        // Extract Aim Direction (SMI normalized Vector2)
        const aimX = state.inputState.aimVector.x;
        const aimZ = state.inputState.aimVector.y; // Map V2.y to V3.z

        const isFlame = wepId === DamageID.FLAMETHROWER;
        const baseRange = isFlame ? 10 : 14;
        const range = baseRange * (state.statsBuffer[PlayerStatID.MULTIPLIER_RANGE] || 1.0);
        const rangeSq = range * range;

        // Base damage scaled by delta. 
        // 60fps normalization (60 * dt)
        const damage = (isFlame ? 0.8 : 1.2) * (60 * dt);
        const cosHalfAngle = 0.94; // ~20 degrees
        const beamWidth = 1.2;

        const enemies = EnemyManager.getActiveEnemies();

        for (let i = 0; i < EnemyPoolState.activeCount; i++) {
            if ((EnemyPoolState.statusFlags[i] & ENTITY_STATUS.DEAD) !== 0) continue;

            const ex = EnemyPoolState.posX[i] - px;
            const ez = EnemyPoolState.posZ[i] - pz;
            const dSq = ex * ex + ez * ez;

            if (dSq > rangeSq) continue;

            const dot = ex * aimX + ez * aimZ;
            if (dot <= 0) continue;

            let hit = false;
            if (isFlame) {
                const invDist = 1.0 / Math.sqrt(dSq);
                if ((ex * invDist * aimX + ez * invDist * aimZ) > cosHalfAngle) {
                    hit = true;
                }
            } else {
                const cross = ex * aimZ - ez * aimX;
                if (Math.abs(cross) < beamWidth) {
                    hit = true;

                    // --- ARC CHAINING ---
                    // Chain up to 4 additional enemies if the primary hit landed
                    let currentChain = enemies[i];
                    let chainCount = 0;
                    _v3.copy(currentChain.mesh.position);

                    for (let j = 0; j < EnemyPoolState.activeCount && chainCount < 4; j++) {
                        if (i === j) continue;
                        if ((EnemyPoolState.statusFlags[j] & ENTITY_STATUS.DEAD) !== 0) continue;

                        const cx = EnemyPoolState.posX[j] - EnemyPoolState.posX[i];
                        const cz = EnemyPoolState.posZ[j] - EnemyPoolState.posZ[i];
                        const cDistSq = cx * cx + cz * cz;

                        if (cDistSq < 64) { // 8m chain range
                            EnemyPoolState.hp[j] -= damage * 0.7;
                            state.applyDamage(enemies[j], damage * 0.7, wepId, false);
                            WeaponFX.drawArcLightning(this.session!.engine.scene, _v3, enemies[j].mesh.position, false);
                            _v3.copy(enemies[j].mesh.position);
                            chainCount++;
                        }
                    }
                    WeaponFX.drawArcLightning(this.session!.engine.scene, this.session!.playerPos, enemies[i].mesh.position, true);
                }
            }

            if (hit) {
                EnemyPoolState.hp[i] -= damage;

                // Trigger legacy damage for telemetry/XP/Death handling
                // We use a low-impact flag for continuous hits to prevent hit-stop spam
                state.applyDamage(enemies[i], damage, wepId, false);

                if (EnemyPoolState.hp[i] <= 0) {
                    EnemyPoolState.statusFlags[i] |= ENTITY_STATUS.DEAD;
                    // Hit-stop on finishing blows (Continuous)
                    if (state) {
                        state.hitStopTime = Math.max(state.hitStopTime || 0, 35);
                    }
                } else if (isFlame) {
                    // Apply BURNING status effect to enemies hit by flamethrower
                    EnemyPoolState.statusFlags[i] |= EnemyFlags.BURNING;

                    // Also trigger burn visuals immediately
                    const ctx = this.session;
                    if (ctx && Math.random() < 0.3) {
                        _v4.set(EnemyPoolState.posX[i], 1.0, EnemyPoolState.posZ[i]);
                        WeaponFX.updateFireZoneVisuals(_v4, 0.5, dt, ctx);
                    }
                }

                // Spawn hit particles (FXSystem Splatter)
                if (Math.random() > 0.85 && this.session) {
                    this.session.spawnParticle(EnemyPoolState.posX[i], 1.2, EnemyPoolState.posZ[i], FXParticleType.BLOOD_SPLATTER, 3);
                }
            }
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
