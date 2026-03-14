import * as THREE from 'three';
import { MATERIALS } from '../utils/assets';
import { Enemy, AIState, EnemyEffectType, EnemyDeathState } from '../types/enemy';
import { DamageType, StatusEffectType } from '../types/combat';
import { EnemySpawner } from './enemies/EnemySpawner';
import { EnemyAI } from './enemies/EnemyAI';
import { soundManager } from '../utils/SoundManager';
import { SpatialGrid } from './world/SpatialGrid';
import { ZombieRenderer } from './renderers/ZombieRenderer';
import { CorpseRenderer } from './renderers/CorpseRenderer';
import { AshRenderer } from './renderers/AshRenderer';
import { FXSystem } from './systems/FXSystem';
import { WaterSystem } from './systems/WaterSystem';
import { WeaponType } from '../content/weapons';

export type { Enemy };

// --- INTERNAL POOLING & SCRATCHPADS ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _up = new THREE.Vector3(0, 5, 0);
const _white = new THREE.Color(0xffffff);
const _cyan = new THREE.Color(0x00ffff);
const _flashColor = new THREE.Color();
const _color = new THREE.Color();
const _syncList: Enemy[] = [];
const enemyPool: Enemy[] = [];

let zombieRenderer: ZombieRenderer | null = null;
let corpseRenderer: CorpseRenderer | null = null;
let ashRenderer: AshRenderer | null = null;

// --- ZERO-GC MATERIAL HELPERS ---
function applyElectrifiedGlow(obj: any, colorObj: THREE.Color, intensity: number) {
    if (obj.isMesh && obj.material) {
        if (obj.material.emissive) {
            obj.material.emissive.copy(colorObj);
            obj.material.emissiveIntensity = intensity;
        }
        if (obj.material.color) {
            obj.material.color.copy(colorObj);
        }
    }
    if (obj.children) {
        for (let i = 0; i < obj.children.length; i++) applyElectrifiedGlow(obj.children[i], colorObj, intensity);
    }
}

function resetMaterialEmissive(obj: any) {
    if (obj.isMesh && obj.material && obj.material.emissive) {
        obj.material.emissive.setHex(0x000000);
        obj.material.emissiveIntensity = 0;
    }
    if (obj.children) {
        for (let i = 0; i < obj.children.length; i++) resetMaterialEmissive(obj.children[i]);
    }
}

function setBaseColor(obj: any, colorObj: THREE.Color) {
    if (obj.isMesh && obj.material && obj.material.color) {
        obj.material.color.copy(colorObj);
    }
    if (obj.children) {
        for (let i = 0; i < obj.children.length; i++) setBaseColor(obj.children[i], colorObj);
    }
}

// --- REUSABLE UPDATE CALLBACKS --- 
const _aiCallbacks: any = {
    onPlayerHit: null as any,
    spawnPart: null as any,
    spawnDecal: null as any,
    spawnBubble: null as any,
    applyDamage: null as any,
    onEffectTick: null as any,
    onPlayerHitExtended: (damage: number, attacker: any, type: string, effect?: any, dur?: number, intense?: number) => {
        if (_aiCallbacks.onPlayerHit) _aiCallbacks.onPlayerHit(damage, attacker, type, effect, dur, intense);
    },
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
        e.deathState = EnemyDeathState.ALIVE;
        e.velocity.set(0, 0, 0);
        e.knockbackVel.set(0, 0, 0);
        e.deathVel.set(0, 0, 0);
        e.deathTimer = 0;
        e.bloodSpawned = false;
        e.lastDamageType = 'standard';
        e._accumulatedDamage = 0;
        e._lastDamageTextTime = 0;

        const s = e.originalScale || 1.0;
        const w = e.widthScale || 1.0;
        e.mesh.scale.set(s * w, s, s * w);

        _color.setHex(e.color || 0xffffff);
        setBaseColor(e.mesh, _color);
        resetMaterialEmissive(e.mesh);

        e.stunTimer = 0;
        e.blindTimer = 0;
        e.burnTimer = 0;
        e.isBurning = false;

        e.isInWater = false; e.isWading = false; e.isDrowning = false;
        e.drownTimer = 0; e.drownDmgTimer = 0;
        e.isAirborne = false; e.fallStartY = 0;
        e._accumulatedDamage = 0; e._lastDamageTextTime = 0;

        e.mesh.userData.exploded = false;
        e.mesh.userData.gibbed = false;
        e.mesh.userData.electrocuted = false;
        e.mesh.userData.ashSpawned = false;
        e.mesh.userData.ashPermanent = false;
        e.mesh.userData.baseY = undefined;
        e.mesh.userData.isFlashing = false;
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

    createCorpse: (enemy: Enemy, forcedColor?: number) => {
        if (corpseRenderer) {
            corpseRenderer.addCorpse(
                enemy.mesh.position,
                enemy.mesh.quaternion,
                enemy.originalScale || 1.0,
                enemy.widthScale || 1.0,
                forcedColor !== undefined ? forcedColor : enemy.color
            );
        }
    },

    explodeEnemy: (enemy: Enemy, callbacks: any, velocity?: THREE.Vector3, isGibbed: boolean = false) => {
        if (enemy.mesh.userData.exploded) return;
        enemy.mesh.userData.exploded = true;

        const enemyScale = (enemy.originalScale || 1.0) * (enemy.widthScale || 1.0);
        const pos = enemy.mesh.position;

        if (enemy.mesh.parent) enemy.mesh.parent.remove(enemy.mesh);

        let burstScale = 1.0;
        const dmgType = enemy.lastDamageType || '';
        if (dmgType === WeaponType.GRENADE) burstScale = 3.0;
        else if (dmgType === WeaponType.SHOTGUN || dmgType === WeaponType.REVOLVER) burstScale = 2.0;

        const decalScale = (enemy.isBoss ? 6.0 : enemyScale * burstScale);
        callbacks.spawnDecal(pos.x, pos.z, decalScale, MATERIALS.bloodDecal, 'splatter');

        const bloodCount = enemy.isBoss ? 12 : 5;
        const goreCount = enemy.isBoss ? 12 : 5;
        const enemyTopY = pos.y + (enemy.originalScale || 1.0) * 1.8;

        callbacks.spawnPart(pos.x, 1, pos.z, 'blood', bloodCount);
        callbacks.spawnPart(pos.x, enemyTopY, pos.z, 'blood_splat', 3, undefined, undefined, undefined, 4.0);

        _v1.set(0, 0, 0);
        if (velocity) {
            _v1.copy(velocity);
        } else if (enemy.deathVel && (enemy.deathVel.x !== 0 || enemy.deathVel.z !== 0)) {
            _v1.copy(enemy.deathVel);
        } else {
            _v1.copy(enemy.velocity).multiplyScalar(0.5).add(_up);
        }

        const massScale = (enemy.originalScale || 1.0) * (enemy.originalScale || 1.0);
        const goreScale = enemy.isBoss ? Math.min(massScale * 1.5, 4.5) : massScale * 2.2;

        for (let i = 0; i < goreCount; i++) {
            _v2.set(_v1.x + (Math.random() - 0.5) * 12, _v1.y + Math.random() * 6, _v1.z + (Math.random() - 0.5) * 10);
            callbacks.spawnPart(pos.x, pos.y + 1, pos.z, 'gore', 1, undefined, _v2, enemy.color, goreScale);
        }
    },

    processDeathAnimation: (e: Enemy, delta: number, now: number, callbacks: any) => {
        const age = now - (e.deathTimer || now);

        switch (e.deathState) {
            case EnemyDeathState.EXPLODED:
                EnemyManager.explodeEnemy(e, callbacks, e.deathVel);
                e.deathState = EnemyDeathState.DEAD;
                break;

            case EnemyDeathState.GIBBED:
                EnemyManager.explodeEnemy(e, callbacks, e.deathVel, true);
                e.deathState = EnemyDeathState.DEAD;
                break;

            case EnemyDeathState.DROWNED:
                e.deathState = EnemyDeathState.DEAD;
                break;

            case EnemyDeathState.BURNED:
                const duration = 1500;
                const progress = Math.min(1.0, age / duration);

                if (!e.mesh.userData.ashSpawned) {
                    e.mesh.userData.ashSpawned = true;
                    if (ashRenderer) {
                        ashRenderer.addAsh(e.mesh.position, e.mesh.rotation, e.originalScale || 1.0, e.widthScale || 1.0, e.color || 0xffffff, now, 1500);
                    }
                }

                const s = e.originalScale || 1.0;
                const w = e.widthScale || 1.0;
                const shrink = 1.0 - progress;

                e.mesh.scale.set(s * w * shrink, s * shrink, s * w * shrink);

                _color.setHex(e.color || 0xffffff).lerp(_white.setHex(0x000000), progress);
                setBaseColor(e.mesh, _color);

                if (progress >= 1.0) {
                    if (!e.mesh.userData.ashPermanent) {
                        e.mesh.userData.ashPermanent = true;
                        if (e.mesh.parent) e.mesh.parent.remove(e.mesh);
                    }
                    e.deathState = EnemyDeathState.DEAD;
                }
                break;

            case EnemyDeathState.ELECTRIFIED:
                if (!e.mesh.userData.electrocuted) {
                    e.mesh.userData.electrocuted = true;
                    // PERFORMANCE: Lock death coordinates to prevent drifting during pool recycling
                    e.mesh.userData.deathPosX = e.mesh.position.x;
                    e.mesh.userData.deathPosZ = e.mesh.position.z;
                    e.mesh.userData.deathPosY = e.mesh.position.y;

                    e.mesh.userData.fallDuration = 400 + Math.random() * 200;
                    e.mesh.userData.twitchDuration = 1800 + Math.random() * 500;

                    e.mesh.userData.targetRotX = -Math.PI / 2.1;
                    e.mesh.userData.targetRotZ = (Math.random() - 0.5) * 0.5;
                }

                const fallDur = e.mesh.userData.fallDuration;
                const twitchDur = e.mesh.userData.twitchDuration;

                if (age < twitchDur) {
                    const fallProgress = Math.min(1.0, age / fallDur);

                    // 1. Fall over animation using lerp
                    e.mesh.rotation.x = THREE.MathUtils.lerp(0, e.mesh.userData.targetRotX, fallProgress);
                    e.mesh.rotation.z = THREE.MathUtils.lerp(0, e.mesh.userData.targetRotZ, fallProgress);
                    e.mesh.position.y = THREE.MathUtils.lerp(e.mesh.userData.deathPosY, 0.2, fallProgress);

                    // 2. Cyan High-Frequency Pulse (Zero-GC emissive update)
                    const pulse = Math.sin(now * 0.05) * 0.5 + 0.5;
                    _color.copy(_cyan).lerp(_white, Math.random() * 0.3);
                    applyElectrifiedGlow(e.mesh, _color, 1.0 + pulse * 4.0);

                    // 3. Muscle Spasms: Use rotation jitter for better visual stability than position jitter
                    const jitter = (1.0 - fallProgress * 0.5) * 0.2;
                    e.mesh.rotation.y += (Math.random() - 0.5) * jitter;

                    // 4. Fixed particles: Ensure sparks spawn relative to the locked death position
                    if (Math.random() > 0.85 && callbacks.spawnPart) {
                        _v1.set(
                            e.mesh.userData.deathPosX + (Math.random() - 0.5),
                            e.mesh.position.y + 0.5,
                            e.mesh.userData.deathPosZ + (Math.random() - 0.5)
                        );
                        callbacks.spawnPart(_v1.x, _v1.y, _v1.z, 'spark', 1);
                    }
                } else {
                    // Finalize: Reset to charred, static state
                    _color.setHex(e.color || 0xffffff).multiplyScalar(0.3);
                    resetMaterialEmissive(e.mesh);
                    setBaseColor(e.mesh, _color);

                    // Ensure final snap to locked position
                    e.mesh.position.x = e.mesh.userData.deathPosX;
                    e.mesh.position.y = 0.2;
                    e.mesh.position.z = e.mesh.userData.deathPosZ;

                    e.deathState = EnemyDeathState.DEAD;
                }
                break;

            case EnemyDeathState.SHOT:
            case EnemyDeathState.GENERIC:
            case EnemyDeathState.FALL:
            default:
                e.deathVel.y -= 35 * delta;
                e.mesh.position.addScaledVector(e.deathVel, delta);
                if (e.mesh.position.y <= 0.2) {
                    e.mesh.position.y = 0.2;
                    e.deathVel.set(0, 0, 0);
                }

                const targetRot = (Math.PI / 2) * (e.fallForward ? 1 : -1);
                e.mesh.rotation.x += (targetRot - e.mesh.rotation.x) * 0.12;

                if (e.mesh.userData.spinDir) {
                    e.mesh.rotation.y += e.mesh.userData.spinDir * delta;
                    e.mesh.userData.spinDir *= 0.9;
                }

                e.mesh.quaternion.setFromEuler(e.mesh.rotation);

                if (age > 1000) {
                    e.deathState = EnemyDeathState.DEAD;
                }
                break;
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

    applyKnockback: (enemy: Enemy, impactPos: THREE.Vector3, moveVec: THREE.Vector3, isDashing: boolean, state: any, scene: THREE.Scene, now: number) => {
        const canTackle = enemy.deathState === 'ALIVE' && (!enemy.lastTackleTime || now - enemy.lastTackleTime > 300);
        if (!canTackle) return;

        if (!isDashing) {
            const push = (enemy.isBoss ? 1.0 : 4.0) / (enemy.originalScale * enemy.originalScale);
            _v2.subVectors(enemy.mesh.position, impactPos).setY(0).normalize().multiplyScalar(push);
            enemy.knockbackVel.add(_v2);
            enemy.lastTackleTime = now;
            return;
        }

        if (enemy.state === AIState.ATTACK_CHARGE || enemy.state === AIState.ATTACKING) {
            enemy.state = AIState.IDLE;
            enemy.attackTimer = 0;
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

    // --- NY FORDONS-KOLLISION ---
    applyVehicleHit: (
        e: Enemy,
        knockDir: THREE.Vector3,
        speedMS: number,
        vehicleDef: any,
        state: any,
        session: any,
        now: number
    ): boolean => {
        const speedKmh = speedMS * 3.6;
        const mass = (e.originalScale || 1.0) * (e.widthScale || 1.0);
        const massRatio = (vehicleDef.mass * 0.001) / (mass || 1.0);

        // Momentum-baserad skada
        const baseDamage = speedKmh * massRatio * vehicleDef.collisionDamageMultiplier * 2.0;

        e.hp -= baseDamage;
        e.hitTime = now;

        const scene = session.engine.scene;

        // --- FATAL HIT ---
        if (e.hp <= 0) {
            e.dead = true;

            // 1. GIBBED (>= 80 km/h) - High speed splatter
            if (speedKmh >= 80) {
                e.deathState = EnemyDeathState.GIBBED;
                e.lastDamageType = DamageType.VEHICLE_SPLATTER;

                // Tvingar fram lite uppåt-kraft och mycket framåt-kraft för gibbningen
                const forceDir = _v1.copy(knockDir).multiplyScalar(speedMS * 1.5).setY(3.0);

                EnemyManager.explodeEnemy(e, _aiCallbacks, forceDir, true);

                session.engine.camera.shake(0.4);
                soundManager.playImpact('flesh');

                return true; // Tung träff

                // 2. FALL (20 - 79 km/h) - Airborne ragdoll effect
            } else if (speedKmh >= 20) {
                e.deathState = EnemyDeathState.FALL;
                e.lastDamageType = DamageType.VEHICLE_RAM;

                // Båge genom luften
                const pushForce = speedMS * 0.8 * massRatio;
                const upForce = speedMS * 0.6 * massRatio;

                e.deathVel.copy(knockDir).multiplyScalar(pushForce);
                e.deathVel.y = Math.max(4.0, upForce);

                FXSystem.spawnPart(scene, state.particles, e.mesh.position.x, 1, e.mesh.position.z, 'blood', 20);
                FXSystem.spawnDecal(scene, state.bloodDecals, e.mesh.position.x, e.mesh.position.z,
                    1.0 + Math.random() * 1.5, MATERIALS.bloodDecal);

                session.engine.camera.shake(0.2);
                soundManager.playImpact('flesh');

                return true; // Tung träff

                // 3. GENERIC (< 20 km/h) - Low speed death, falls over
            } else {
                e.deathState = EnemyDeathState.GENERIC;
                e.lastDamageType = DamageType.VEHICLE_PUSH;

                e.deathVel.copy(knockDir).multiplyScalar(speedMS * massRatio * 0.2);
                e.deathVel.y = 2.0;

                return false; // Lätt träff
            }

            // --- SURVIVED HIT (Knockback) ---
        } else {
            e.lastDamageType = DamageType.VEHICLE_PUSH;

            // Skapa en velocity-vektor som representerar bilens smäll för att skicka till knockback-systemet
            _v1.copy(knockDir).multiplyScalar(speedMS);

            // _v2 används normalt för impactPos i applyKnockback, vi lånar bilens position (som _knockDir pekar från)
            // men vi räknar baklänges från zombien för att få en exakt point-of-impact.
            _v2.copy(e.mesh.position).addScaledVector(knockDir, -1.0);

            EnemyManager.applyKnockback(e, _v2, _v1, true, state, scene, now);

            e.slowTimer = 0.5;
            return false;
        }
    },

    update: (delta: number, now: number, playerPos: THREE.Vector3, enemies: Enemy[], collisionGrid: SpatialGrid, noiseEvents: any[], isDead: boolean, onPlayerHit: any, spawnPart: any, spawnDecal: any, spawnBubble: any, applyDamage?: any, water?: WaterSystem) => {
        collisionGrid.updateEnemyGrid(enemies);
        _syncList.length = 0;

        _aiCallbacks.onPlayerHit = onPlayerHit;
        _aiCallbacks.spawnPart = spawnPart;
        _aiCallbacks.spawnDecal = spawnDecal;
        _aiCallbacks.spawnBubble = spawnBubble;
        _aiCallbacks.applyDamage = applyDamage;

        const len = enemies.length;
        for (let i = 0; i < len; i++) {
            const e = enemies[i];

            // 1. Endast AI Logic om de är ALIVE
            if (e.deathState === 'ALIVE') {
                EnemyAI.updateEnemy(e, now, delta, playerPos, collisionGrid, noiseEvents, isDead, {
                    ..._aiCallbacks,
                    onPlayerHit: _aiCallbacks.onPlayerHitExtended
                }, water);
            }

            // 2. Visuella animationer 
            if (e.deathState !== 'ALIVE' && e.deathState !== 'DEAD') {
                EnemyManager.processDeathAnimation(e, delta, now, _aiCallbacks);
            }

            const s = e.deathState;

            // 3. Renderings-beslut
            if (s === 'BURNED' || s === 'ELECTRIFIED' || s === 'DROWNED') {
                e.mesh.visible = true;
                e.mesh.matrixAutoUpdate = true; // Enable local matrix calculus when explicitly drawn
            }
            else if (!e.isBoss && !e.mesh.userData.exploded && s !== 'DEAD') {
                e.mesh.visible = false;
                e.mesh.matrixAutoUpdate = false; // Freeze to save CPU when instanced
                _syncList.push(e);
            }

            // 4. Hit Flashes (Flyttat från AI för renare arkitektur!)
            if (s === 'ALIVE') {
                if (e.isBoss && e.mesh && e.color !== undefined) {
                    const timeSinceHit = now - e.hitTime;
                    if (timeSinceHit < 100) {
                        if (!e.mesh.userData.isFlashing) {
                            e.mesh.userData.isFlashing = true;
                            const isArc = e.lastDamageType === WeaponType.ARC_CANNON;

                            if (isArc) _flashColor.setHex(0x00ffff).lerp(_white.setHex(0xffffff), 0.4);
                            else _flashColor.setHex(0xffffff);

                            e.mesh.traverse((c: any) => {
                                if (c.isMesh && c.material && c.material.emissive) {
                                    c.material.emissive.copy(_flashColor);
                                    c.material.emissiveIntensity = isArc ? 2.0 : 1.0;
                                }
                            });
                        }
                    } else {
                        if (e.mesh.userData.isFlashing) {
                            e.mesh.userData.isFlashing = false;
                            e.mesh.traverse((c: any) => {
                                if (c.isMesh && c.material && c.material.emissive) {
                                    c.material.emissive.setHex(0x000000);
                                    c.material.emissiveIntensity = 0.0;
                                }
                            });
                        }
                    }
                } else if (!e.isBoss && e.color !== undefined) {
                    const timeSinceHit = now - e.hitTime;
                    if (timeSinceHit < 100) {
                        if (!e.mesh.userData.isFlashing) {
                            e.mesh.userData.isFlashing = true;
                            e.mesh.userData.originalColor = e.color;
                            const isArc = e.lastDamageType === WeaponType.ARC_CANNON;
                            if (isArc) {
                                e.color = _flashColor.setHex(0x00ffff).lerp(_white.setHex(0xffffff), 0.4).getHex();
                            } else {
                                e.color = 0xffffff;
                            }
                        }
                    } else {
                        if (e.mesh.userData.isFlashing) {
                            e.mesh.userData.isFlashing = false;
                            e.color = e.mesh.userData.originalColor || 0xffffff;
                        }
                    }
                }
            }
        }

        if (zombieRenderer) zombieRenderer.sync(_syncList, now);
        if (ashRenderer) ashRenderer.update(Math.max(now, 1));
    },

    cleanupDeadEnemies: (scene: THREE.Scene, enemies: Enemy[], now: number, state: any, callbacks: any, delta: number = 1 / 60) => {
        for (let i = enemies.length - 1; i >= 0; i--) {
            const e = enemies[i];

            if (e.deathState === EnemyDeathState.ALIVE) continue;

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

            const shouldCleanup = (e.deathState === EnemyDeathState.DEAD) || e.mesh.userData.exploded || e.mesh.userData.gibbed;

            if (shouldCleanup) {
                let leaveCorpse = false;
                let bloodType = '';

                if (e.mesh.userData.exploded) {
                    EnemyManager.explodeEnemy(e, callbacks, _up);
                }
                else if (e.mesh.userData.gibbed) {
                    if (e.mesh.parent) e.mesh.parent.remove(e.mesh);
                }
                else if (e.mesh.userData.ashSpawned) {
                    if (e.mesh.parent) e.mesh.parent.remove(e.mesh);
                }
                else if (e.mesh.userData.electrocuted) {
                    leaveCorpse = true;
                    bloodType = 'scorch';
                }
                else {
                    leaveCorpse = true;
                    bloodType = 'blood';
                }

                if (e.mesh.parent) scene.remove(e.mesh);

                if (leaveCorpse && !e.isBoss) {
                    const corpseColor = bloodType === 'scorch' ? _color.setHex(e.color || 0xffffff).multiplyScalar(0.4).getHex() : e.color;
                    EnemyManager.createCorpse(e, corpseColor);
                }

                if (!e.bloodSpawned && bloodType === 'blood') {
                    callbacks.spawnDecal(e.mesh.position.x, e.mesh.position.z, (1.5 + Math.random() * 2.5) * (e.originalScale || 1.0), MATERIALS.bloodDecal);
                    e.bloodSpawned = true;
                } else if (!e.bloodSpawned && bloodType === 'scorch') {
                    callbacks.spawnDecal(e.mesh.position.x, e.mesh.position.z, (1.2 + Math.random() * 0.5) * (e.originalScale || 1.0), MATERIALS.scorchDecal);
                    e.bloodSpawned = true;
                }

                const kType = e.type || 'Unknown';
                state.killsByType[kType] = (state.killsByType[kType] || 0) + 1;
                state.killsInRun++;
                callbacks.gainXp(e.score || 10);

                if (e.isBoss && e.bossId !== undefined) {
                    callbacks.onBossKilled(e.bossId);
                    callbacks.spawnScrap(e.mesh.position.x, e.mesh.position.z, 500);
                } else if (Math.random() < 0.15) {
                    callbacks.spawnScrap(e.mesh.position.x, e.mesh.position.z, 1 + Math.floor(Math.random() * 5));
                }

                if (e.indicatorRing?.parent) e.indicatorRing.parent.remove(e.indicatorRing);

                const recycled = enemies[i];
                enemies[i] = enemies[enemies.length - 1];
                enemies.pop();

                recycled.dead = true;
                recycled.deathState = EnemyDeathState.DEAD;
                if (!recycled.isBoss) enemyPool.push(recycled);
            }
        }
    }
};

// --- INITIALIZE AI CALLBACKS ---
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