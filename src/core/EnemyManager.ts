import * as THREE from 'three';
import { GEOMETRY, MATERIALS } from '../utils/assets';
import { Enemy, AIState, EnemyDeathState, EnemyEffectType } from '../types/enemy';
import { EnemySpawner } from './enemies/EnemySpawner';
import { EnemyAI } from './enemies/EnemyAI';
import { soundManager } from '../utils/sound';
import { SpatialGrid } from './world/SpatialGrid';
import { ZombieRenderer } from './renderers/ZombieRenderer';
import { CorpseRenderer } from './renderers/CorpseRenderer';
import { AshRenderer } from './renderers/AshRenderer';
import { FXSystem } from './systems/FXSystem';
import { WaterSystem } from './systems/WaterSystem';

export type { Enemy };

// --- INTERNAL POOLING & SCRATCHPADS ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3(); // Used for burst scale calculation
const _up = new THREE.Vector3(0, 5, 0);
const _white = new THREE.Color(0xffffff);
const _ashColor = new THREE.Color(0x111111);
const _color = new THREE.Color();
const _baseColor = new THREE.Color();
const _syncList: Enemy[] = [];
const enemyPool: Enemy[] = [];

let zombieRenderer: ZombieRenderer | null = null;
let corpseRenderer: CorpseRenderer | null = null;
let ashRenderer: AshRenderer | null = null;

// --- REUSABLE UPDATE CALLBACKS --- (Initialized after EnemyManager to allow circular references)
const _aiCallbacks: any = {
    onPlayerHit: null as any,
    spawnPart: null as any,
    spawnDecal: null as any,
    spawnBubble: null as any,
    onDamageDealt: null as any,
    onDeath: null as any,
    onEffectTick: null as any,
    playSound: (id: string) => soundManager.playEffect(id)
};

export const EnemyManager = {
    init: (scene: THREE.Scene) => {
        if (!zombieRenderer) zombieRenderer = new ZombieRenderer(scene);
        else zombieRenderer.reAttach(scene);

        if (!corpseRenderer) corpseRenderer = new CorpseRenderer(scene);
        else corpseRenderer.reAttach(scene);

        if (!ashRenderer) ashRenderer = new AshRenderer(scene);
        else ashRenderer.reAttach(scene);

        enemyPool.length = 0;
    },

    clear: () => {
        zombieRenderer?.destroy();
        corpseRenderer?.destroy();
        ashRenderer?.destroy();
        zombieRenderer = null;
        corpseRenderer = null;
        ashRenderer = null;
        enemyPool.length = 0;
    },

    spawn: (scene: THREE.Scene, playerPos: THREE.Vector3, forcedType?: string, forcedPos?: THREE.Vector3, bossSpawned: boolean = false, enemyCount: number = 0): Enemy | null => {
        let enemy: Enemy | null = null;
        const typeToSpawn = forcedType || EnemySpawner.determineType(enemyCount, bossSpawned);

        if (enemyPool.length > 0) {
            enemy = enemyPool.pop()!;
            EnemyManager.resetEnemy(enemy, typeToSpawn, playerPos, forcedPos);
            if (!enemy.mesh.parent) scene.add(enemy.mesh);
        } else {
            enemy = EnemySpawner.spawn(scene, playerPos, typeToSpawn, forcedPos, bossSpawned, enemyCount);
        }

        if (enemy) {
            if (!enemy.isBoss) enemy.mesh.visible = false;
            else enemy.mesh.visible = true;
        }

        return enemy;
    },

    resetEnemy: (e: Enemy, newType: string, playerPos: THREE.Vector3, forcedPos?: THREE.Vector3) => {
        EnemySpawner.applyTypeStats(e, newType);

        if (forcedPos) {
            _v1.set((Math.random() - 0.5) * 4, 0, (Math.random() - 0.5) * 4);
            e.mesh.position.copy(forcedPos).add(_v1);
        } else {
            const angle = Math.random() * Math.PI * 2;
            const dist = 45 + Math.random() * 30;
            e.mesh.position.set(playerPos.x + Math.cos(angle) * dist, 0, playerPos.z + Math.sin(angle) * dist);
        }

        e.dead = false;
        e.hp = e.maxHp;
        e.deathState = 'ALIVE';
        e.velocity.set(0, 0, 0);
        e.knockbackVel.set(0, 0, 0);
        e.deathVel.set(0, 0, 0);
        e.deathTimer = 0;
        e.bloodSpawned = false;
        e.lastDamageType = 'standard';

        const s = e.originalScale || 1.0;
        const w = e.widthScale || 1.0;
        e.mesh.scale.set(s * w, s, s * w);

        e.mesh.traverse((child: any) => {
            if (child.isMesh && child.material) {
                if (child.material.color) child.material.color.set(e.color || 0xffffff);
                if (child.material.opacity !== undefined) child.material.opacity = 1.0;
            }
        });

        e.stunTimer = 0;
        e.blindTimer = 0;
        e.burnTimer = 0;
        e.isBurning = false;

        // Reset water and airborne states
        e.isInWater = false; e.isWading = false; e.isDrowning = false;
        e.drownTimer = 0; e.drownDmgTimer = 0;
        e.isAirborne = false; e.fallStartY = 0;

        // CRITICAL BUG FIX: Thoroughly wipe all potential visual death flags for pooled enemies
        e.mesh.userData.exploded = false;
        e.mesh.userData.gibbed = false;
        e.mesh.userData.electrocuted = false;
        e.mesh.userData.ashSpawned = false;
        e.mesh.userData.ashPermanent = false;
        e.mesh.userData.baseY = undefined;
        e.ashPile = undefined;

        if (e.indicatorRing) e.indicatorRing.visible = false;
    },

    spawnBoss: (scene: THREE.Scene, pos: { x: number, z: number }, bossData: any) => {
        const boss = EnemySpawner.spawnBoss(scene, pos, bossData);
        if (boss) boss.mesh.visible = true;
        return boss;
    },

    spawnHorde: (scene: THREE.Scene, startPos: THREE.Vector3, count: number, bossSpawned: boolean, currentCount: number) => {
        const horde: Enemy[] = [];
        for (let i = 0; i < count; i++) {
            const enemy = EnemyManager.spawn(scene, startPos, undefined, startPos, bossSpawned, currentCount + i);
            if (enemy) horde.push(enemy);
        }
        return horde;
    },

    createCorpse: (enemy: Enemy) => {
        if (corpseRenderer) {
            corpseRenderer.addCorpse(
                enemy.mesh.position,
                enemy.mesh.quaternion,
                enemy.originalScale || 1.0,
                enemy.widthScale || 1.0,
                enemy.color
            );
        }
    },

    /**
     * Centralized handling for all high-impact death effects (GIBBED or EXPLODED).
     */
    explodeEnemy: (enemy: Enemy, callbacks: any, velocity?: THREE.Vector3, isGibbed: boolean = false) => {
        if (enemy.mesh.userData.exploded) return;
        enemy.mesh.userData.exploded = true;

        const enemyScale = (enemy.originalScale || 1.0) * (enemy.widthScale || 1.0);
        const pos = enemy.mesh.position;

        // 1. Instant mesh removal
        if (enemy.mesh.parent) enemy.mesh.parent.remove(enemy.mesh);

        // 2. Calculate burst scale based on weapon type (Zero-GC string comparison)
        let burstScale = 1.0;
        const dmgType = enemy.lastDamageType || '';
        if (dmgType === 'GRENADE' || dmgType === 'grenade') burstScale = 3.0;
        else if (dmgType === 'SHOTGUN' || dmgType === 'shotgun' || dmgType === 'REVOLVER' || dmgType === 'revolver') burstScale = 2.0;

        // 2. Spawn Decal
        const decalScale = (enemy.isBoss ? 6.0 : enemyScale * burstScale);
        callbacks.spawnDecal(pos.x, pos.z, decalScale, MATERIALS.bloodDecal, 'splatter');

        // 3. Spawn Particles & Blood
        const bloodCount = enemy.isBoss ? 12 : 5;
        const goreCount = enemy.isBoss ? 12 : 5;

        callbacks.spawnPart(pos.x, 1, pos.z, 'blood', bloodCount);

        // 4. Velocity handling for death trajectories
        _v1.set(0, 0, 0);
        if (velocity) {
            _v1.copy(velocity);
        } else if (enemy.deathVel && (enemy.deathVel.x !== 0 || enemy.deathVel.z !== 0)) {
            _v1.copy(enemy.deathVel);
        } else {
            _v1.copy(enemy.velocity).multiplyScalar(0.5).add(_up);
        }

        // [VINTERDÖD] Cap Boss Gore Scale to prevent massive blue boulders
        const maxGoreScale = enemy.isBoss ? Math.min(enemyScale * 1.5, 3.0) : enemyScale * 0.8;

        for (let i = 0; i < goreCount; i++) {
            _v2.set(_v1.x + (Math.random() - 0.5) * 12, _v1.y + Math.random() * 6, _v1.z + (Math.random() - 0.5) * 10);
            callbacks.spawnPart(pos.x, pos.y + 1, pos.z, 'gore', 1, undefined, _v2, enemy.color, maxGoreScale);
        }
    },

    handleDeathVisuals: (e: Enemy, type: EnemyDeathState, callbacks: any) => {
        const now = performance.now();
        const age = now - (e.deathTimer || now);
        const delta = 1 / 60;

        // Note: We NO LONGER override e.deathState to 'DEAD' inside this function.
        // It remains 'BURNED', 'SHOT' etc. until the absolute cleanup phase.
        // This solves the bug where cleanup misidentified corpses.

        if (type === 'EXPLODED') {
            EnemyManager.explodeEnemy(e, callbacks, e.deathVel);
            return;
        }

        else if (type === 'GIBBED') {
            EnemyManager.explodeEnemy(e, callbacks, e.deathVel, true);
            return;
        }

        else if (type === 'BURNED') {
            if (!e.mesh.userData.ashSpawned) {
                e.mesh.userData.ashSpawned = true;

                // Trigger the instanced ash pile instead of creating a massive mesh tree
                if (ashRenderer) {
                    ashRenderer.addAsh(e.mesh.position, e.mesh.rotation, e.originalScale || 1.0, e.widthScale || 1.0, e.color || 0xffffff, now, 1500);
                }
            }

            const progress = Math.min(1.0, age / 1500);
            const s = e.originalScale || 1.0;
            const w = e.widthScale || 1.0;

            // 1. Shrink enemy mesh
            const shrink = 1.0 - progress;
            e.mesh.scale.set(s * w * shrink, s * shrink, s * w * shrink);

            // 2. Finalize removal
            if (progress >= 1.0 && !e.mesh.userData.ashPermanent) {
                e.mesh.userData.ashPermanent = true;
                if (e.mesh.parent) e.mesh.parent.remove(e.mesh);
            }
            return;
        }

        else if (type === 'ELECTRIFIED') {
            if (!e.mesh.userData.electrocuted) {
                e.mesh.userData.electrocuted = true;
                e.mesh.userData.deathPosX = e.mesh.position.x;
                e.mesh.userData.deathPosZ = e.mesh.position.z;
                // Electrocution stiffens the body instantly (falls straight back)
                e.mesh.userData.fallRot = -Math.PI / 2;
            }

            // Fall like a plank
            if (age < 150) {
                const t = age / 150;
                e.mesh.rotation.x = e.mesh.userData.fallRot * t;
                e.mesh.position.y = Math.max(0.2, (e.mesh.position.y || 1.0) * (1 - t));
            } else {
                e.mesh.rotation.x = e.mesh.userData.fallRot;
                e.mesh.position.y = 0.2;

                // Jittering physics
                const twitchIntensity = Math.max(0, 1.0 - (age / 1200));
                if (twitchIntensity > 0) {
                    const jitterX = (Math.random() - 0.5) * 0.5 * twitchIntensity;
                    const jitterZ = (Math.random() - 0.5) * 0.5 * twitchIntensity;
                    e.mesh.position.x = e.mesh.userData.deathPosX + jitterX;
                    e.mesh.position.z = e.mesh.userData.deathPosZ + jitterZ;

                    // Body cramps
                    e.mesh.rotation.y += (Math.random() - 0.5) * 0.3 * twitchIntensity;
                    e.mesh.rotation.z = (Math.random() - 0.5) * 0.3 * twitchIntensity;
                }

                if (Math.random() > 0.4) callbacks.onEffectTick(e, 'SPARK');
            }
            e.mesh.quaternion.setFromEuler(e.mesh.rotation);
            return;
        }

        else if (type === 'SHOT' || type === 'GENERIC') {
            e.deathVel.y -= 45 * delta;
            e.mesh.position.addScaledVector(e.deathVel, delta);

            if (e.mesh.position.y > 0.2) {
                e.mesh.rotation.y += (e.mesh.userData.spinDir || 0) * delta;
            } else {
                e.mesh.position.y = 0.2;
                e.deathVel.set(0, 0, 0);
            }

            // fallForward = true means faceplant, false means falling backwards
            const targetRot = (Math.PI / 2) * (e.fallForward ? 1 : -1);
            e.mesh.rotation.x += (targetRot - e.mesh.rotation.x) * 0.25;
            e.mesh.quaternion.setFromEuler(e.mesh.rotation);
        }
    },

    applyShove: (playerGroup: THREE.Group, radiusSq: number, state: any, scene: THREE.Scene, now: number) => {
        let shovedAnyone = false;
        const enemies = state.enemies;

        for (let i = 0; i < enemies.length; i++) {
            const enemy = enemies[i];
            if (enemy.deathState === 'ALIVE') {
                const distSq = enemy.mesh.position.distanceToSquared(playerGroup.position);

                if (distSq < radiusSq) {
                    shovedAnyone = true;

                    enemy.state = AIState.IDLE;
                    enemy.stunTimer = 1.5;
                    enemy.attackCooldown = 2000;

                    const damage = 5;
                    enemy.hp -= damage;
                    enemy.lastDamageType = 'melee';

                    if (state.callbacks?.trackStats) {
                        state.callbacks.trackStats('damage', damage, !!enemy.isBoss);
                    }
                    if (state.callbacks?.spawnFloatingText) {
                        state.callbacks.spawnFloatingText(enemy.mesh.position.x, 2.5, enemy.mesh.position.z, damage.toString(), "#ffffff");
                    }

                    _v1.subVectors(enemy.mesh.position, playerGroup.position);
                    _v1.y = 0;
                    if (_v1.lengthSq() < 0.01) _v1.set(0, 0, 1).applyQuaternion(playerGroup.quaternion);
                    _v1.normalize();

                    const mass = (enemy.originalScale || 1.0) * (enemy.widthScale || 1.0);
                    const force = 25.0 / Math.max(0.5, mass);

                    enemy.knockbackVel.set(_v1.x * force, 6.0, _v1.z * force);

                    if (!enemy.isBoss) {
                        enemy.mesh.userData.isRagdolling = true;
                        if (!enemy.mesh.userData.spinVel) enemy.mesh.userData.spinVel = new THREE.Vector3();
                        enemy.mesh.userData.spinVel.set(
                            (Math.random() - 0.5) * 15,
                            (Math.random() - 0.5) * 20,
                            (Math.random() - 0.5) * 15
                        );
                    }

                    FXSystem.spawnPart(scene, state.particles, enemy.mesh.position.x, 1.5, enemy.mesh.position.z, 'blood', 8);
                }
            }
        }

        if (shovedAnyone) {
            soundManager.playImpact('flesh');
        }
    },

    applyTackle: (enemy: Enemy, impactPos: THREE.Vector3, moveVec: THREE.Vector3, isDashing: boolean, state: any, scene: THREE.Scene, now: number) => {
        const canTackle = enemy.deathState === 'ALIVE' && (!enemy.lastTackleTime || now - enemy.lastTackleTime > 300);
        if (!canTackle) return;

        // BARA DASH ska kunna avbryta en attack och stunna fienden!
        if (!isDashing) {
            // Om spelaren bara går in i fienden, gör vi en mjuk fysisk knuff men låter AI:n fortsätta attackera
            const push = (enemy.isBoss ? 1.0 : 4.0) / (enemy.originalScale * enemy.originalScale);
            _v2.subVectors(enemy.mesh.position, impactPos).setY(0).normalize().multiplyScalar(push);
            enemy.knockbackVel.add(_v2);
            enemy.lastTackleTime = now;
            return; // <- VIKTIGT: Returnera här så vi inte byter state till IDLE och stunnar dem
        }

        // --- DASH LOGIC ---
        if (enemy.state === AIState.BITING) {
            enemy.state = AIState.IDLE;
            enemy.attackCooldown = 1500;
        }

        const mass = (enemy.originalScale * enemy.originalScale * (enemy.widthScale || 1.0));
        const pushMultiplier = (enemy.isBoss ? 0.1 : 1.0) / Math.max(0.5, mass);

        _v2.subVectors(enemy.mesh.position, impactPos).setY(0).normalize();
        _v1.copy(moveVec).normalize();
        if (_v2.dot(_v1) > 0.3) {
            _v1.set(moveVec.z, 0, -moveVec.x).normalize();
            if (_v2.dot(_v1) < 0) _v1.negate();
            _v2.lerp(_v1, 0.85).normalize();
        }

        const force = 30.0 * pushMultiplier;
        const lift = 30.0 * pushMultiplier;

        enemy.knockbackVel.set(_v2.x * force, lift, _v2.z * force);
        enemy.state = AIState.IDLE;
        enemy.lastTackleTime = now;
        enemy.stunTimer = 2.0;

        if (!enemy.isBoss) {
            enemy.mesh.userData.isRagdolling = true;
            if (!enemy.mesh.userData.spinVel) enemy.mesh.userData.spinVel = new THREE.Vector3();
            enemy.mesh.userData.spinVel.set(
                (Math.random() - 0.5) * 25,
                (Math.random() - 0.5) * 30,
                (Math.random() - 0.5) * 25
            );
        }
        FXSystem.spawnPart(scene, state.particles, enemy.mesh.position.x, 1, enemy.mesh.position.z, 'hit', 12);
        soundManager.playImpact('flesh');
    },

    // Update loop — water ref is threaded so EnemyAI can call checkBuoyancy without importing WinterEngine
    update: (delta: number, now: number, playerPos: THREE.Vector3, enemies: Enemy[], collisionGrid: SpatialGrid, noiseEvents: any[], shakeIntensity: number, playerIsDead: boolean, onPlayerHit: any, spawnPart: any, spawnDecal: any, spawnBubble: any, onDamageDealt?: any, water?: WaterSystem) => {
        collisionGrid.updateEnemyGrid(enemies);
        _syncList.length = 0;

        _aiCallbacks.onPlayerHit = onPlayerHit;
        _aiCallbacks.spawnPart = spawnPart;
        _aiCallbacks.spawnDecal = spawnDecal;
        _aiCallbacks.spawnBubble = spawnBubble;
        _aiCallbacks.onDamageDealt = onDamageDealt;

        const len = enemies.length;
        for (let i = 0; i < len; i++) {
            const e = enemies[i];

            EnemyAI.updateEnemy(e, now, delta, playerPos, collisionGrid, noiseEvents, shakeIntensity, playerIsDead, _aiCallbacks, water);

            const s = e.deathState;

            // BURNED and ELECTRIFIED manipulate the material so they stay as individual meshes
            if (s === 'BURNED' || s === 'ELECTRIFIED' || s === 'DROWNED') {
                e.mesh.visible = true;
            }
            // ALIVE, SHOT, FALL, GENERIC — rendered via InstancedMesh while falling
            else if (!e.isBoss && !e.mesh.userData.exploded) {
                e.mesh.visible = false;
                _syncList.push(e);
            }
        }

        if (zombieRenderer) zombieRenderer.sync(_syncList, now);
        if (ashRenderer) ashRenderer.update(Math.max(now, 1));
    },

    cleanupDeadEnemies: (scene: THREE.Scene, enemies: Enemy[], now: number, state: any, callbacks: any, delta: number = 1 / 60) => {
        for (let i = enemies.length - 1; i >= 0; i--) {
            const e = enemies[i];

            if (e.deathState === 'ALIVE') continue;

            if (!e.deathTimer) {
                e.deathTimer = now;
                e.mesh.userData.deathPx = e.mesh.position.x;
                e.mesh.userData.deathPy = e.mesh.position.y;
                e.mesh.userData.deathPz = e.mesh.position.z;
                if (!e.mesh.userData.exploded) {
                    if (e.type === 'RUNNER') soundManager.playRunnerDeath();
                    else if (e.type === 'TANK') soundManager.playTankDeath();
                    else soundManager.playWalkerDeath();
                }
            }

            const age = now - e.deathTimer;
            const isElectrified = e.deathState === 'ELECTRIFIED';
            const cleanupDelay = isElectrified ? 1500 : 2000; // Increased electrified duration
            const shouldCleanup = (age > cleanupDelay) || e.mesh.userData.exploded;

            if (isElectrified && !shouldCleanup && age > 0) {
                // Electrocution Spasms
                e.mesh.visible = true;

                // 1. Positional Jitter — scaled by delta for FPS-independence
                const ux = e.mesh.userData.deathPx ?? e.mesh.position.x;
                const uy = e.mesh.userData.deathPy ?? e.mesh.position.y;
                const uz = e.mesh.userData.deathPz ?? e.mesh.position.z;
                const jitter = Math.min(delta, 0.05) * 60; // cap spike frames

                e.mesh.position.set(
                    ux + (Math.random() - 0.5) * 0.25 * jitter,
                    uy + (Math.random() - 0.5) * 0.15 * jitter,
                    uz + (Math.random() - 0.5) * 0.25 * jitter
                );

                // 2. Surging Emissive Intensity (Cyan)
                e.mesh.traverse((child: any) => {
                    if (child.isMesh && child.material) {
                        const mat = child.material as THREE.MeshStandardMaterial;
                        if (mat.emissive) {
                            mat.emissive.setHex(0x00ffff);
                            mat.emissiveIntensity = 0.5 + Math.random() * 3.0;
                        }
                    }
                });

                // 3. Electric Spark Particles
                if (Math.random() > 0.6) {
                    callbacks.spawnPart(
                        e.mesh.position.x + (Math.random() - 0.5) * 1.0,
                        e.mesh.position.y + Math.random() * 1.8,
                        e.mesh.position.z + (Math.random() - 0.5) * 1.0,
                        'electric_flash',
                        1,
                        undefined,
                        undefined,
                        0x00ffff,
                        0.4
                    );
                }
            }

            if (shouldCleanup) {
                // By preserving e.deathState from the AI, we skip guessing and false positives entirely.
                const cleanupType = e.deathState;

                // Always remove mesh at cleanup (final safeguard)
                if (e.mesh.parent) e.mesh.parent.remove(e.mesh);

                switch (cleanupType) {
                    case 'EXPLODED':
                    case 'GIBBED':
                    case 'BURNED':
                        break; // These types DO NOT leave corpses
                    case 'DROWNED':
                        // Body floats face-down on the water surface — registered as a floatingProp
                        if (!e.isBoss) {
                            // Temporarily strip the circular entity ref before clone.
                            // Three.js Object3D.copy() calls JSON.stringify(userData) internally,
                            // which would crash on the enemy→mesh→userData.entity→enemy circle.
                            const savedEntity = e.mesh.userData.entity;
                            e.mesh.userData.entity = undefined;

                            const floatBody = e.mesh.clone();

                            // Restore on the original (the float body inherits undefined, which is fine)
                            e.mesh.userData.entity = savedEntity;

                            floatBody.rotation.x = -Math.PI / 2; // Lie face-down
                            floatBody.position.copy(e.mesh.position);
                            floatBody.position.y = 0.3; // Flush with water surface
                            floatBody.userData.velocity = new THREE.Vector3();
                            floatBody.userData.floatOffset = 0.0;
                            floatBody.userData.mass = 75;
                            if (callbacks.registerFloatingCorpse) {
                                callbacks.registerFloatingCorpse(floatBody, e.mesh.position);
                            } else {
                                if (e.mesh.parent) e.mesh.parent.add(floatBody);
                            }
                        }
                        // No blood decal for drowned enemies
                        break;
                    case 'FALL':
                        // Same visual as SHOT — corpse + blood pool
                        if (!e.isBoss) EnemyManager.createCorpse(e);
                        if (!e.bloodSpawned) {
                            callbacks.spawnDecal(e.mesh.position.x, e.mesh.position.z, (1.5 + Math.random() * 2.5) * (e.originalScale || 1.0), MATERIALS.bloodDecal);
                            e.bloodSpawned = true;
                        }
                        break;
                    case 'ELECTRIFIED':
                        if (!e.isBoss) EnemyManager.createCorpse(e);
                        if (!e.bloodSpawned) {
                            callbacks.spawnDecal(e.mesh.position.x, e.mesh.position.z, (1.2 + Math.random() * 0.5) * (e.originalScale || 1.0), MATERIALS.scorchDecal);
                            e.bloodSpawned = true;
                        }
                        break;
                    case 'SHOT':
                    case 'GENERIC':
                    default:
                        if (!e.isBoss) EnemyManager.createCorpse(e);
                        if (!e.bloodSpawned) {
                            callbacks.spawnDecal(e.mesh.position.x, e.mesh.position.z, (1.5 + Math.random() * 2.5) * (e.originalScale || 1.0), MATERIALS.bloodDecal);
                            e.bloodSpawned = true;
                        }
                        break;
                }

                const kType = e.type || 'Unknown';
                state.killsByType[kType] = (state.killsByType[kType] || 0) + 1;
                state.killsInRun++;
                callbacks.gainXp(e.score || 10);

                // Boss-specific: trigger defeat flow + big scrap drop
                if (e.isBoss && e.bossId !== undefined) {
                    callbacks.onBossKilled(e.bossId);
                    callbacks.spawnScrap(e.mesh.position.x, e.mesh.position.z, 500);
                }
                // Regular enemies: 15% chance to drop 1-5 scrap
                else if (Math.random() < 0.15) {
                    callbacks.spawnScrap(e.mesh.position.x, e.mesh.position.z, 1 + Math.floor(Math.random() * 5));
                }

                if (e.indicatorRing?.parent) e.indicatorRing.parent.remove(e.indicatorRing);

                const recycled = enemies[i];
                enemies[i] = enemies[enemies.length - 1];
                enemies.pop();

                recycled.dead = true;
                recycled.deathState = 'DEAD';
                if (!recycled.isBoss) enemyPool.push(recycled);
            }
        }
    }
};

// --- INITIALIZE AI CALLBACKS ---
_aiCallbacks.onDeath = (enemy: Enemy, type: EnemyDeathState) => EnemyManager.handleDeathVisuals(enemy, type, _aiCallbacks);
_aiCallbacks.onEffectTick = (enemy: Enemy, type: EnemyEffectType) => {
    const pos = enemy.mesh.position;

    switch (type) {
        case 'STUN':
            _aiCallbacks.spawnPart(pos.x, pos.y + 1.8, pos.z, 'enemy_effect_stun', 1, undefined, undefined, 0xffff00, 0.3);
            break;
        case 'FLAME':
            _v1.set(pos.x + (Math.random() - 0.5) * 0.5, pos.y + 1.0, pos.z + (Math.random() - 0.5) * 0.5);
            _aiCallbacks.spawnPart(_v1.x, _v1.y, _v1.z, 'enemy_effect_flame', 1);
            break;
        case 'SPARK':
            _v1.set(pos.x + (Math.random() - 0.5) * 0.4, pos.y + 0.8 + Math.random() * 0.4, pos.z + (Math.random() - 0.5) * 0.4);
            _aiCallbacks.spawnPart(_v1.x, _v1.y, _v1.z, 'enemy_effect_spark', 1);
            break;
    }
};