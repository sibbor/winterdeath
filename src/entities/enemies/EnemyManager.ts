import * as THREE from 'three';
import { MATERIALS } from '../../utils/assets';
import { KMH_TO_MS } from '../../content/constants';
import { Enemy, AIState, EnemyEffectType, EnemyDeathState, EnemyType, ENEMY_MAX_HP, ENEMY_BASE_SPEED, ENEMY_SCORE, ENEMY_COLOR, ENEMY_SCALE, ENEMY_WIDTH_SCALE, EnemyFlags, NoiseType } from '../../entities/enemies/EnemyTypes';
import { DamageID } from '../../entities/player/CombatTypes';
import { EnemySpawner } from './EnemySpawner';
import { EnemyAI } from './EnemyAI';
import { MaterialType } from '../../content/environment';
import { GamePlaySounds, EnemySounds } from '../../utils/audio/AudioLib';
import { audioEngine } from '../../utils/audio/AudioEngine';
import { SpatialGrid } from '../../core/world/SpatialGrid';
import { ZombieRenderer } from '../../core/renderers/ZombieRenderer';
import { CorpseRenderer } from '../../core/renderers/CorpseRenderer';
import { AshRenderer } from '../../core/renderers/AshRenderer';
import { FXSystem } from '../../systems/FXSystem';
import { WaterSystem } from '../../systems/WaterSystem';
import { WinterEngine } from '../../core/engine/WinterEngine';
import { SoundID } from '../../utils/audio/AudioTypes';
import { getCachedNumberString } from '../../utils/NumberCache';

export type { Enemy };

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _camDir = new THREE.Vector3();
const _up = new THREE.Vector3(0, 5, 0);

const _white = new THREE.Color(0xffffff);
const _cyan = new THREE.Color(0x00ffff);
const _flashColor = new THREE.Color();
const _color = new THREE.Color();

const _syncList: Enemy[] = [];
const enemyPool: Enemy[] = [];

// Shared iterative stack to avoid recursive stack frames and closures
const _traverseStack: THREE.Object3D[] = [];

let zombieRenderer: ZombieRenderer | null = null;
let corpseRenderer: CorpseRenderer | null = null;
let ashRenderer: AshRenderer | null = null;

// --- ZERO-GC MATERIAL HELPERS ---
function applyElectrifiedGlow(root: any, colorObj: THREE.Color, intensity: number) {
    _traverseStack.length = 0;
    _traverseStack.push(root);

    while (_traverseStack.length > 0) {
        const obj = _traverseStack.pop() as any;

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
            for (let i = 0; i < obj.children.length; i++) {
                _traverseStack.push(obj.children[i]);
            }
        }
    }
}

function resetMaterialEmissive(root: any) {
    _traverseStack.length = 0;
    _traverseStack.push(root);

    while (_traverseStack.length > 0) {
        const obj = _traverseStack.pop() as any;

        if (obj.isMesh && obj.material && obj.material.emissive) {
            obj.material.emissive.setHex(0x000000);
            obj.material.emissiveIntensity = 0;
        }

        if (obj.children) {
            for (let i = 0; i < obj.children.length; i++) {
                _traverseStack.push(obj.children[i]);
            }
        }
    }
}

function setBaseColor(root: any, colorObj: THREE.Color) {
    _traverseStack.length = 0;
    _traverseStack.push(root);

    while (_traverseStack.length > 0) {
        const obj = _traverseStack.pop() as any;

        if (obj.isMesh && obj.material && obj.material.color) {
            obj.material.color.copy(colorObj);
        }

        if (obj.children) {
            for (let i = 0; i < obj.children.length; i++) {
                _traverseStack.push(obj.children[i]);
            }
        }
    }
}

// --- REUSABLE UPDATE CALLBACKS (100% Zero-GC) --- 
export interface AIContext {
    spawnPart: ((x: number, y: number, z: number, type: string, count: number, mesh?: THREE.Object3D, vel?: THREE.Vector3, color?: number, scale?: number) => void) | null;
    spawnDecal: ((x: number, z: number, s: number, mat: THREE.Material, type?: string) => void) | null;
    applyDamage: ((enemy: Enemy, amount: number, type: DamageID, isHighImpact?: boolean) => void) | null;
    onEffectTick: ((e: Enemy, type: EnemyEffectType) => void) | null;
    playSound: (id: SoundID) => void;
    spawnBubble: ((text: string, duration: number) => void) | null;
    onPlayerHit: (damage: number, attacker: any, type: DamageID, isDoT?: boolean, effect?: any, dur?: number, intense?: number, attackName?: string) => void;
    _realOnPlayerHit: ((damage: number, attacker: any, type: DamageID, isDoT?: boolean, effect?: any, dur?: number, intense?: number, attackName?: string) => void) | null;
}

const _aiContext: AIContext = {
    spawnPart: null,
    spawnDecal: null,
    applyDamage: null,
    onEffectTick: null,
    playSound: (id: SoundID) => audioEngine.playSound(id),
    spawnBubble: null,
    onPlayerHit: (damage: number, attacker: any, type: DamageID, isDoT?: boolean, effect?: any, dur?: number, intense?: number, attackName?: string) => {
        if (_aiContext._realOnPlayerHit) {
            _aiContext._realOnPlayerHit(damage, attacker, type, isDoT, effect, dur, intense, attackName);
        }
    },
    _realOnPlayerHit: null
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

    update: (
        playerPos: THREE.Vector3,
        enemies: Enemy[],
        collisionGrid: SpatialGrid,
        isDead: boolean,
        onPlayerHit: (damage: number, attacker: any, type: DamageID, isDoT?: boolean, effect?: any, duration?: number, intensity?: number) => void,
        spawnPart: (x: number, y: number, z: number, type: string, count: number, mesh?: THREE.Object3D, vel?: THREE.Vector3, color?: number, scale?: number) => void,
        spawnDecal: (x: number, z: number, s: number, mat: THREE.Material, type?: string) => void,
        applyDamage: (enemy: Enemy, amount: number, type: DamageID, isHighImpact?: boolean) => void,
        spawnBubble: ((text: string, duration: number) => void) | null,
        water: WaterSystem | null,
        delta: number,
        simTime: number,
        renderTime: number
    ) => {

        collisionGrid.updateEnemyGrid(enemies);
        _syncList.length = 0;

        _aiContext._realOnPlayerHit = onPlayerHit;
        _aiContext.spawnPart = spawnPart;
        _aiContext.spawnDecal = spawnDecal;
        _aiContext.applyDamage = applyDamage;
        _aiContext.spawnBubble = spawnBubble;

        const engine = WinterEngine.getInstance();
        const camera = engine.camera;
        const cameraPos = camera.threeCamera.position;
        const cameraDir = _camDir.set(0, 0, -1).applyQuaternion(camera.threeCamera.quaternion);

        const len = enemies.length;
        for (let i = 0; i < len; i++) {
            const e = enemies[i];

            if (e.deathState === EnemyDeathState.ALIVE) {
                // Let EnemyAI handle duration updates and physics!
                EnemyAI.updateEnemy(e, playerPos, collisionGrid, isDead, _aiContext, water, delta, simTime, renderTime);
            }

            if (e.deathState !== EnemyDeathState.ALIVE && e.deathState !== EnemyDeathState.DEAD) {
                EnemyManager.processDeathAnimation(e, _aiContext, delta, simTime, renderTime);
            }

            const deathState = e.deathState;

            if (deathState === EnemyDeathState.BURNED || deathState === EnemyDeathState.ELECTROCUTED || deathState === EnemyDeathState.DROWNED) {
                e.mesh.visible = true;
                e.mesh.matrixAutoUpdate = true;
            }
            else if ((e.statusFlags & EnemyFlags.BOSS) === 0 && !e.mesh.userData.exploded && deathState !== EnemyDeathState.DEAD) {
                let isVisible = true;
                if (cameraPos && cameraDir) {
                    _v2.subVectors(e.mesh.position, cameraPos);
                    const dot = cameraDir.dot(_v2);
                    const distSq = _v2.lengthSq();

                    if (dot < -2.0 && distSq > 625) {
                        isVisible = false;
                    }
                }

                const isTelegraphing = e.indicatorRing && e.indicatorRing.visible;

                if (isVisible && !isTelegraphing) {
                    e.mesh.visible = false;
                    e.mesh.matrixAutoUpdate = false;
                    e.mesh.updateMatrix();
                    _syncList.push(e);
                } else {
                    e.mesh.visible = isVisible;
                    e.mesh.matrixAutoUpdate = true;
                }
            }

            if (deathState === EnemyDeathState.ALIVE) {
                if ((e.statusFlags & EnemyFlags.BOSS) !== 0 && e.mesh && e.color !== undefined) {
                    const timeSinceHit = simTime - e.hitTime;
                    if (timeSinceHit < 100) {
                        if (!e.mesh.userData.isFlashing) {
                            e.mesh.userData.isFlashing = true;
                            const isArc = e.lastDamageType === DamageID.ARC_CANNON;

                            if (isArc) _flashColor.setHex(0x00ffff).lerp(_white, 0.4);
                            else _flashColor.setHex(0xffffff);

                            _traverseStack.length = 0;
                            _traverseStack.push(e.mesh);
                            while (_traverseStack.length > 0) {
                                const c = _traverseStack.pop() as any;
                                if (c.isMesh && c.material && c.material.emissive) {
                                    c.material.emissive.copy(_flashColor);
                                    c.material.emissiveIntensity = isArc ? 2.0 : 1.0;
                                }
                                for (let k = 0; k < c.children.length; k++) {
                                    _traverseStack.push(c.children[k]);
                                }
                            }
                        }
                    } else {
                        if (e.mesh.userData.isFlashing) {
                            e.mesh.userData.isFlashing = false;

                            _traverseStack.length = 0;
                            _traverseStack.push(e.mesh);
                            while (_traverseStack.length > 0) {
                                const c = _traverseStack.pop() as any;
                                if (c.isMesh && c.material && c.material.emissive) {
                                    c.material.emissive.setHex(0x000000);
                                    c.material.emissiveIntensity = 0.0;
                                }
                                for (let k = 0; k < c.children.length; k++) {
                                    _traverseStack.push(c.children[k]);
                                }
                            }
                        }
                    }
                } else if ((e.statusFlags & EnemyFlags.BOSS) === 0 && e.color !== undefined) {
                    const timeSinceHit = simTime - e.hitTime;
                    if (timeSinceHit < 100) {
                        if (!e.mesh.userData.isFlashing) {
                            e.mesh.userData.isFlashing = true;
                            e.mesh.userData.originalColor = e.color;
                            const isArc = e.lastDamageType === DamageID.ARC_CANNON;
                            if (isArc) {
                                e.color = _flashColor.setHex(0x00ffff).lerp(_white, 0.4).getHex();
                            } else {
                                e.color = 0xffffff;
                            }
                        }
                    } else {
                        if (e.mesh.userData.isFlashing) {
                            e.mesh.userData.isFlashing = false;
                            e.color = e.mesh.userData.originalColor as number;
                        }
                    }
                }
            }
        }

        if (zombieRenderer) zombieRenderer.sync(_syncList, simTime);
        if (ashRenderer) ashRenderer.update(Math.max(simTime, 1));
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

    getAshRenderer: () => ashRenderer,

    spawn: (scene: THREE.Scene, playerPos: THREE.Vector3, forcedType?: EnemyType, forcedPos?: THREE.Vector3, bossSpawned: boolean = false, enemyCount: number = 0): Enemy | null => {
        let enemy: Enemy | null = null;
        const newType = (forcedType !== undefined) ? forcedType : EnemySpawner.determineType(enemyCount, bossSpawned);

        if (enemyPool.length > 0) {
            enemy = enemyPool.pop()!;
            EnemyManager.resetEnemy(enemy, newType, playerPos, forcedPos);
            if (!enemy.mesh.parent) scene.add(enemy.mesh);
        } else {
            enemy = EnemySpawner.spawn(scene, playerPos, newType, forcedPos, bossSpawned, enemyCount);
        }

        if (enemy) {
            enemy.mesh.visible = (enemy.statusFlags & EnemyFlags.BOSS) !== 0;
        }

        return enemy;
    },

    resetEnemy: (e: Enemy, newType: EnemyType, playerPos: THREE.Vector3, forcedPos?: THREE.Vector3) => {
        e.type = newType;

        // DOD: Base Stat Initialization
        e.maxHp = ENEMY_MAX_HP[newType];
        e.hp = e.maxHp;
        e.speed = ENEMY_BASE_SPEED[newType] * KMH_TO_MS;
        e.score = ENEMY_SCORE[newType];
        e.color = ENEMY_COLOR[newType];
        e.originalScale = ENEMY_SCALE[newType];
        e.widthScale = ENEMY_WIDTH_SCALE[newType];

        // Initialize collision radii
        e.hitRadius = e.originalScale * 0.5;
        e.combatRadius = e.originalScale * 1.5;

        // Zero-out all status flags and timers
        e.statusFlags = 0;
        if (newType === EnemyType.BOSS) e.statusFlags |= EnemyFlags.BOSS;

        if (forcedPos) {
            _v2.set((Math.random() - 0.5) * 4, 0, (Math.random() - 0.5) * 4);
            e.mesh.position.copy(forcedPos).add(_v2);
        } else {
            const angle = Math.random() * Math.PI * 2;
            const dist = 45 + Math.random() * 30;
            e.mesh.position.set(playerPos.x + Math.cos(angle) * dist, 0, playerPos.z + Math.sin(angle) * dist);
        }

        e.deathState = EnemyDeathState.ALIVE;
        e.velocity.set(0, 0, 0);
        e.knockbackVel.set(0, 0, 0);
        e.deathVel.set(0, 0, 0);
        e.deathTimer = 0;
        e.bloodSpawned = false;
        e.hitRenderTime = 0;
        e.lastDamageType = DamageID.NONE;
        e._accumulatedDamage = 0;
        e._lastDamageTextTime = 0;
        e.lastSeenTime = 0;
        e.awareness = 0;
        e.lastHeardNoiseType = NoiseType.NONE;
        
        // --- ZERO-GC VECTOR ALLOCATION (Pool warmup phase) ---
        if (!e.lastKnownPosition) e.lastKnownPosition = new THREE.Vector3();
        if (!e.mesh.userData.targetPos) e.mesh.userData.targetPos = new THREE.Vector3();

        // --- STALE DATA RESET (DOD) ---
        e.lastKnownPosition.copy(e.mesh.position);
        (e.mesh.userData.targetPos as THREE.Vector3).set(0, 0, 0);
        
        e.lastTrailPos.set(0, 0, 0); 
        e.hasLastTrailPos = false;

        // FIX: Ensure tackle time is reset to prevent NaN physics failures
        e.lastTackleTime = 0;

        const s = e.originalScale;
        const w = e.widthScale;
        e.mesh.scale.set(s * w, s, s * w);

        _color.setHex(e.color);
        setBaseColor(e.mesh, _color);
        resetMaterialEmissive(e.mesh);

        e.stunDuration = 0;
        e.slowDuration = 0;
        e.blindDuration = 0;
        e.burnDuration = 0;
        e.burnTickTimer = 0;
        e.lastBurnTick = 0;

        e.drownTimer = 0;
        e.drownDmgTimer = 0;
        e.fallStartY = 0;

        e.mesh.userData.exploded = false;
        e.mesh.userData.gibbed = false;
        e.mesh.userData.electrocuted = false;
        e.mesh.userData.ashSpawned = false;
        e.mesh.userData.ashPermanent = false;
        e.mesh.userData.isRagdolling = false;
        e.mesh.userData.isFlashing = false;
        e.mesh.userData.wasKnockedBack = false;
        e.mesh.userData.wasStunned = false;

        // Reset spin velocity to zero (No truthy check, V8 Shape Locking guarantees existence)
        (e.mesh.userData.spinVel as THREE.Vector3).set(0, 0, 0);
        (e.mesh.userData.hitDir as THREE.Vector3).set(0, 0, 0);
        e.mesh.userData.ashPermanent = false;
        e.mesh.userData.isFlashing = false;
        e.mesh.userData.isRagdolling = false;
        e.ashPile = null;

        (e.mesh.userData.spinVel as THREE.Vector3).set(0, 0, 0);
        (e.mesh.userData.hitDir as THREE.Vector3).set(0, 0, 0);

        if (e.indicatorRing) {
            e.indicatorRing.visible = false;
            e.indicatorRing.matrixAutoUpdate = false;
        }
    },

    spawnBoss: (scene: THREE.Scene, pos: { x: number, z: number }, bossData: any) => {
        const boss = EnemySpawner.spawnBoss(scene, pos, bossData);
        if (boss) boss.mesh.visible = true;
        return boss;
    },

    spawnHorde: (scene: THREE.Scene, startPos: THREE.Vector3, count: number, bossSpawned: boolean, currentCount: number, forcedType?: EnemyType) => {
        const horde: Enemy[] = [];
        const goldenAngle = 137.5 * (Math.PI / 180);
        const spacing = 1.5;

        for (let i = 0; i < count; i++) {
            const radius = Math.sqrt(i) * spacing;
            const theta = i * goldenAngle;

            _v1.set(
                startPos.x + Math.cos(theta) * radius,
                0,
                startPos.z + Math.sin(theta) * radius
            );

            const enemy = EnemyManager.spawn(scene, startPos, forcedType, _v1, bossSpawned, currentCount + i);
            if (enemy) horde.push(enemy);
        }
        return horde;
    },

    createCorpse: (enemy: Enemy, forcedColor?: number) => {
        if (corpseRenderer) {
            corpseRenderer.addCorpse(
                enemy.mesh.position,
                enemy.mesh.quaternion,
                enemy.originalScale,
                enemy.widthScale,
                forcedColor !== undefined ? forcedColor : enemy.color
            );
        }
    },

    explodeEnemy: (enemy: Enemy, callbacks: any, velocity?: THREE.Vector3, isGibbed: boolean = false) => {
        if (enemy.mesh.userData.exploded) return;
        enemy.mesh.userData.exploded = true;

        const enemyScale = enemy.originalScale * enemy.widthScale;
        const pos = enemy.mesh.position;

        if (enemy.mesh.parent) enemy.mesh.parent.remove(enemy.mesh);

        let burstScale = 1.0;
        const dmgType = enemy.lastDamageType;
        if (dmgType === DamageID.GRENADE) burstScale = 3.0;
        else if (dmgType === DamageID.SHOTGUN || dmgType === DamageID.REVOLVER) burstScale = 2.0;

        const decalScale = ((enemy.statusFlags & EnemyFlags.BOSS) !== 0 ? 6.0 : enemyScale * burstScale);

        // Null-safety check for callbacks since _aiContext can be cleared/nullified
        if (callbacks.spawnDecal) {
            callbacks.spawnDecal(pos.x, pos.z, decalScale, MATERIALS.bloodDecal, 'splatter');
        }

        const bloodCount = (enemy.statusFlags & EnemyFlags.BOSS) !== 0 ? 12 : 5;
        const goreCount = (enemy.statusFlags & EnemyFlags.BOSS) !== 0 ? 12 : 5;
        const enemyTopY = pos.y + enemy.originalScale * 1.8;

        if (callbacks.spawnPart) {
            callbacks.spawnPart(pos.x, 1, pos.z, 'blood', bloodCount);
            callbacks.spawnPart(pos.x, enemyTopY, pos.z, 'blood_splat', 3, undefined, undefined, undefined, 4.0);
        }

        _v1.set(0, 0, 0);
        if (velocity) {
            _v1.copy(velocity);
        } else if (enemy.deathVel.x !== 0 || enemy.deathVel.z !== 0) {
            _v1.copy(enemy.deathVel);
        } else {
            _v1.copy(enemy.velocity).multiplyScalar(0.5).add(_up);
        }

        const massScale = enemy.originalScale * enemy.originalScale;
        const goreScale = (enemy.statusFlags & EnemyFlags.BOSS) !== 0 ? Math.min(massScale * 1.5, 4.5) : massScale * 2.2;

        if (callbacks.spawnPart) {
            for (let i = 0; i < goreCount; i++) {
                _v2.set(_v1.x + (Math.random() - 0.5) * 12, _v1.y + Math.random() * 6, _v1.z + (Math.random() - 0.5) * 10);
                callbacks.spawnPart(pos.x, pos.y + 1, pos.z, 'gore', 1, undefined, _v2, enemy.color, goreScale);
            }
        }
    },

    processDeathAnimation: (e: Enemy, callbacks: any, delta: number, simTime: number, renderTime: number) => {
        const age = simTime - e.deathTimer;

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
                // No-op
                break;

            case EnemyDeathState.BURNED:
                const duration = 1500;
                const progress = Math.min(1.0, age / duration);

                if (!e.mesh.userData.ashSpawned) {
                    e.mesh.userData.ashSpawned = true;
                    if (ashRenderer) {
                        ashRenderer.addAsh(e.mesh.position, e.mesh.rotation, e.originalScale, e.widthScale, e.color, simTime, 1500);
                    }
                }

                const s = e.originalScale;
                const w = e.widthScale;
                const shrink = 1.0 - progress;

                e.mesh.scale.set(s * w * shrink, s * shrink, s * w * shrink);

                _color.setHex(e.color).lerp(_white, progress);
                setBaseColor(e.mesh, _color);

                if (progress >= 1.0) {
                    if (!e.mesh.userData.ashPermanent) {
                        e.mesh.userData.ashPermanent = true;
                        if (e.mesh.parent) e.mesh.parent.remove(e.mesh);
                    }
                    e.deathState = EnemyDeathState.DEAD;
                }
                break;

            case EnemyDeathState.ELECTROCUTED:
                if (!e.mesh.userData.electrocuted) {
                    e.mesh.userData.electrocuted = true;
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

                    e.mesh.rotation.x = THREE.MathUtils.lerp(0, e.mesh.userData.targetRotX, fallProgress);
                    e.mesh.rotation.z = THREE.MathUtils.lerp(0, e.mesh.userData.targetRotZ, fallProgress);
                    e.mesh.position.y = THREE.MathUtils.lerp(e.mesh.userData.deathPosY, 0.2, fallProgress);

                    const pulse = Math.sin(renderTime * 0.05) * 0.5 + 0.5;
                    _color.copy(_cyan).lerp(_white, Math.random() * 0.3);
                    applyElectrifiedGlow(e.mesh, _color, 1.0 + pulse * 4.0);

                    const jitter = (1.0 - fallProgress * 0.5) * 0.2;
                    e.mesh.rotation.y += (Math.random() - 0.5) * jitter;

                    if (Math.random() > 0.85 && callbacks.spawnPart) {
                        _v1.set(
                            e.mesh.userData.deathPosX + (Math.random() - 0.5),
                            e.mesh.position.y + 0.5,
                            e.mesh.userData.deathPosZ + (Math.random() - 0.5)
                        );
                        callbacks.spawnPart(_v1.x, _v1.y, _v1.z, 'spark', 1);
                    }
                } else {
                    _color.setHex(e.color || 0xffffff).multiplyScalar(0.3);
                    resetMaterialEmissive(e.mesh);
                    setBaseColor(e.mesh, _color);

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

    knockbackEnemies: (
        ctx: any,
        center: THREE.Vector3,
        radius: number,
        maxForce: number,
        maxDamage: number,
        damageType: DamageID
    ) => {
        const grid = ctx.collisionGrid;
        if (!grid) return;

        let hitAnyone = false;
        const enemies = grid.getNearbyEnemies(center, radius);
        const len = enemies.length;
        const radiusSq = radius * radius;

        for (let i = 0; i < len; i++) {
            const e = enemies[i];
            if (e.deathState !== EnemyDeathState.ALIVE) continue;

            _v1.subVectors(e.mesh.position, center);
            _v1.y = 0;
            const distSq = _v1.lengthSq();

            if (distSq < radiusSq) {
                hitAnyone = true;
                // VINTERDÖD: Sqrt Purge! 
                // Using quadratic falloff for physics/damage (distSq / radiusSq). 
                // APPROXIMATION: falloff = 1.0 - (distSq / radiusSq)
                const falloff = 1.0 - (distSq / radiusSq);

                // --- DAMAGE ---
                const damage = Math.ceil(maxDamage * falloff);
                if (damage > 0) {
                    const applyDamage = (ctx as any).applyDamage;
                    // We pass maxForce >= 20 as a generic threshold for system-wide "high impact" hits
                    // so the combat system still knows if it should e.g. gib a dying enemy.
                    if (applyDamage) applyDamage(e, damage, damageType, maxForce >= 20);
                    else e.hp -= damage;
                }

                // --- PHYSICS ---
                if (_v1.lengthSq() < 0.001) _v1.set(0, 0, 1);
                _v1.normalize();

                const mass = (e.originalScale || 1.0) * (e.widthScale || 1.0);
                const force = (maxForce * falloff) / Math.max(0.5, mass);

                // Dynamic scaling based on incoming force
                const lift = maxForce * 0.45 * falloff;
                e.knockbackVel.set(_v1.x * force, lift, _v1.z * force);

                // Radius knockback: Set persistent slow for recovery window
                e.stunDuration = Math.max(1.2, (maxForce * 0.05) * falloff);
                e.slowDuration = 3.5;
                e.state = AIState.IDLE;
                e.attackTimer = 0; // BREAKOUT: Cancel any active bite/hit grip

                // Always ragdoll non-bosses, scale spin intensity with force
                if ((e.statusFlags & EnemyFlags.BOSS) === 0) {
                    e.mesh.userData.isRagdolling = true;
                    const sVel = e.mesh.userData.spinVel as THREE.Vector3;
                    const spinMod = force * 0.8;
                    sVel.set(
                        (Math.random() - 0.5) * spinMod,
                        (Math.random() - 0.5) * spinMod * 1.2,
                        (Math.random() - 0.5) * spinMod
                    );
                }

                // --- VISUALS ---
                if (ctx.particles) {
                    // Blood amount scales with damage (min 2, max 10)
                    const bloodDrops = Math.max(2, Math.min(10, Math.ceil(maxDamage * falloff * 1.5)));
                    FXSystem.spawnPart(ctx.engine?.scene || ctx.scene, ctx.particles, e.mesh.position.x, 1.5, e.mesh.position.z, 'blood', bloodDrops);
                }
            }
        }

        if (hitAnyone) GamePlaySounds.playImpact(MaterialType.FLESH);
    },

    applyKnockback: (enemy: Enemy, impactPos: THREE.Vector3, moveVec: THREE.Vector3, isDashing: boolean, state: any, scene: THREE.Scene, delta: number, simTime: number) => {
        const canTackle = enemy.deathState === EnemyDeathState.ALIVE && (simTime - enemy.lastTackleTime > 300);
        if (!canTackle) return;

        // Cancel any active attacks BEFORE overwriting the state
        if (enemy.state === AIState.ATTACK_CHARGE || enemy.state === AIState.ATTACKING) {
            enemy.attackTimer = 0;
        }

        // Apply baseline stun/slow for ALL impacts
        enemy.stunDuration = isDashing ? 2.0 : 0.5; // Short stun for regular hits
        enemy.slowDuration = isDashing ? 3.5 : 1.5;
        enemy.state = AIState.IDLE;
        enemy.lastTackleTime = simTime;

        // If not a dash/heavy impact, apply light push and exit early
        if (!isDashing) {
            const push = ((enemy.statusFlags & EnemyFlags.BOSS) !== 0 ? 1.0 : 4.0) / (enemy.originalScale * enemy.originalScale);
            _v2.subVectors(enemy.mesh.position, impactPos).setY(0).normalize().multiplyScalar(push);
            enemy.knockbackVel.add(_v2);
            return;
        }

        // Heavy impact (Dash/Vehicle) physics
        const mass = (enemy.originalScale * enemy.originalScale * enemy.widthScale);
        const pushMultiplier = ((enemy.statusFlags & EnemyFlags.BOSS) !== 0 ? 0.1 : 1.0) / Math.max(0.5, mass);

        _v2.subVectors(enemy.mesh.position, impactPos).setY(0).normalize();
        _v1.copy(moveVec).normalize();

        // Prevent zombies from being sucked inward if impact angle is sharp
        if (_v2.dot(_v1) > 0.3) {
            _v1.set(moveVec.z, 0, -moveVec.x).normalize();
            if (_v2.dot(_v1) < 0) _v1.negate();
            _v2.lerp(_v1, 0.85).normalize();
        }

        const force = 30.0 * pushMultiplier;
        const lift = 30.0 * pushMultiplier;

        enemy.knockbackVel.set(_v2.x * force, lift, _v2.z * force);

        // Apply dash damage (skip if damage was already handled by the vehicle system)
        if (isDashing && enemy.lastDamageType !== DamageID.VEHICLE_RAM && enemy.lastDamageType !== DamageID.VEHICLE_SPLATTER) {
            const tackleDamage = 10;
            const applyDamage = (state as any).applyDamage;
            if (applyDamage) applyDamage(enemy, tackleDamage, DamageID.RUSH);
            else enemy.hp -= tackleDamage;

            if (state.callbacks?.showDamageText) {
                state.callbacks.showDamageText(enemy.mesh.position.x, 2.5, enemy.mesh.position.z, getCachedNumberString(tackleDamage), "#ffffff");
            }
        }

        // Ragdoll visuals and spinning for standard enemies
        if ((enemy.statusFlags & EnemyFlags.BOSS) === 0) {
            enemy.mesh.userData.isRagdolling = true;
            const sVel = enemy.mesh.userData.spinVel as THREE.Vector3;
            sVel.set(
                (Math.random() - 0.5) * 25,
                (Math.random() - 0.5) * 30,
                (Math.random() - 0.5) * 25
            );
        }

        FXSystem.spawnPart(scene, state.particles, enemy.mesh.position.x, 1, enemy.mesh.position.z, 'hit', 12);
        GamePlaySounds.playImpact(MaterialType.FLESH);
    },

    applyVehicleHit: (
        e: Enemy,
        knockDir: THREE.Vector3,
        speedMS: number,
        vehicleDef: any,
        state: any,
        session: any,
        delta: number,
        simTime: number
    ): boolean => {
        const speedKmh = speedMS * 3.6;
        const mass = e.originalScale * e.widthScale;
        const massRatio = (vehicleDef.mass * 0.001) / (mass || 1.0);

        const baseDamage = speedKmh * massRatio * vehicleDef.collisionDamageMultiplier * 2.0;

        e.hp -= baseDamage;
        e.hitTime = simTime;
        e.hitRenderTime = (session.state as any).renderTime || 0;

        const scene = session.engine.scene;

        const tracker = (session as any).getSystem('damage_tracker_system') as any;
        if (tracker) tracker.recordOutgoingDamage(session, baseDamage, DamageID.VEHICLE, (e.statusFlags & EnemyFlags.BOSS) !== 0);

        if (e.hp <= 0) {
            e.statusFlags |= EnemyFlags.DEAD;
            if (tracker) tracker.recordKill(session, DamageID.VEHICLE, (e.statusFlags & EnemyFlags.BOSS) !== 0);

            if (speedKmh >= 80) {
                e.deathState = EnemyDeathState.GIBBED;
                e.lastDamageType = DamageID.VEHICLE_SPLATTER;

                const forceDir = _v3.copy(knockDir).multiplyScalar(speedMS * 1.5).setY(3.0);
                EnemyManager.explodeEnemy(e, _aiContext, forceDir, true);

                session.engine.camera.shake(0.4);
                GamePlaySounds.playImpact(MaterialType.FLESH);

                return true;
            } else if (speedKmh >= 20) {
                e.deathState = EnemyDeathState.FALL;
                e.lastDamageType = DamageID.VEHICLE_RAM;

                const pushForce = speedMS * 0.8 * massRatio;
                const upForce = speedMS * 0.6 * massRatio;

                e.deathVel.copy(knockDir).multiplyScalar(pushForce);
                e.deathVel.y = Math.max(4.0, upForce);

                FXSystem.spawnPart(scene, state.particles, e.mesh.position.x, 1, e.mesh.position.z, 'blood', 20);
                FXSystem.spawnDecal(scene, state.bloodDecals, e.mesh.position.x, e.mesh.position.z,
                    1.0 + Math.random() * 1.5, MATERIALS.bloodDecal);

                session.engine.camera.shake(0.2);
                GamePlaySounds.playImpact(MaterialType.FLESH);

                return true;
            } else {
                e.deathState = EnemyDeathState.GENERIC;
                e.lastDamageType = DamageID.VEHICLE_PUSH;

                e.deathVel.copy(knockDir).multiplyScalar(speedMS * massRatio * 0.2);
                e.deathVel.y = 2.0;

                return false;
            }
        } else {
            e.lastDamageType = DamageID.VEHICLE_PUSH;

            // Use dedicated V3 and V4 to avoid aliasing with V1 and V2 inside applyKnockback
            _v3.copy(knockDir).multiplyScalar(speedMS);
            _v4.copy(e.mesh.position).addScaledVector(knockDir, -1.0);

            EnemyManager.applyKnockback(e, _v4, _v3, true, state, scene, delta, simTime);

            e.slowDuration = 0.5;
            return false;
        }
    },

    cleanupDeadEnemies: (scene: THREE.Scene, enemies: Enemy[], state: any, callbacks: any, delta: number, simTime: number) => {
        for (let i = enemies.length - 1; i >= 0; i--) {
            const e = enemies[i];

            if (e.deathState === EnemyDeathState.ALIVE) continue;

            if (!e.deathTimer) {
                e.deathTimer = simTime;
                e.mesh.userData.deathPx = e.mesh.position.x;
                e.mesh.userData.deathPy = e.mesh.position.y;
                e.mesh.userData.deathPz = e.mesh.position.z;
                if (!e.mesh.userData.exploded) {
                    if (e.type === EnemyType.RUNNER) EnemySounds.playGrowl('runner', e.mesh.position);
                    else if (e.type === EnemyType.TANK) EnemySounds.playGrowl('tank', e.mesh.position);
                    else EnemySounds.playGrowl('walker', e.mesh.position);
                }
            }

            const shouldCleanup = (e.deathState === EnemyDeathState.DEAD) || e.mesh.userData.exploded || e.mesh.userData.gibbed;

            if (shouldCleanup) {
                let leaveCorpse = false;
                let bloodType = '';

                if (e.mesh.userData.exploded) {
                    EnemyManager.explodeEnemy(e, callbacks, _up);
                    bloodType = 'none';
                }
                else if (e.mesh.userData.gibbed) {
                    if (e.mesh.parent) e.mesh.parent.remove(e.mesh);
                    bloodType = 'none';
                }
                else if (e.mesh.userData.ashSpawned) {
                    if (e.mesh.parent) e.mesh.parent.remove(e.mesh);
                }
                else if (e.mesh.userData.electrocuted) {
                    leaveCorpse = true;
                    bloodType = 'scorch';
                }
                else if (e.deathState === EnemyDeathState.DROWNED || e.lastDamageType === DamageID.DROWNING) {
                    leaveCorpse = true;
                    bloodType = 'none';
                }
                else {
                    leaveCorpse = true;
                    bloodType = 'blood';
                }

                if (e.mesh.parent) scene.remove(e.mesh);

                if (leaveCorpse && (e.statusFlags & EnemyFlags.BOSS) === 0) {
                    const corpseColor = bloodType === 'scorch' ? _color.setHex(e.color || 0xffffff).multiplyScalar(0.4).getHex() : e.color;
                    EnemyManager.createCorpse(e, corpseColor);
                }

                if (!e.bloodSpawned && bloodType === 'blood') {
                    if (callbacks.spawnDecal) callbacks.spawnDecal(e.mesh.position.x, e.mesh.position.z, (1.5 + Math.random() * 2.5) * (e.originalScale || 1.0), MATERIALS.bloodDecal);
                    e.bloodSpawned = true;
                } else if (!e.bloodSpawned && bloodType === 'scorch') {
                    if (callbacks.spawnDecal) callbacks.spawnDecal(e.mesh.position.x, e.mesh.position.z, (1.2 + Math.random() * 0.5) * (e.originalScale || 1.0), MATERIALS.scorchDecal);
                    e.bloodSpawned = true;
                }
                const session = callbacks.getSession ? callbacks.getSession() : null;
                if (session) {
                    const tracker = session.getSystem('damage_tracker_system') as any;
                    if (tracker) tracker.recordKill(session, e.type, (e.statusFlags & EnemyFlags.BOSS) !== 0);
                }
                if (callbacks.gainXp) callbacks.gainXp(e.score || 10);

                if ((e.statusFlags & EnemyFlags.BOSS) !== 0 && e.bossId !== undefined && e.bossId !== -1) {
                    if (callbacks.onBossKilled) callbacks.onBossKilled(e.bossId);
                    if (callbacks.spawnScrap) callbacks.spawnScrap(e.mesh.position.x, e.mesh.position.z, 500);
                } else if (Math.random() < 0.15) {
                    if (callbacks.spawnScrap) callbacks.spawnScrap(e.mesh.position.x, e.mesh.position.z, 1 + Math.floor(Math.random() * 5));
                }

                if (e.indicatorRing?.parent) e.indicatorRing.parent.remove(e.indicatorRing);

                const recycled = enemies[i];
                enemies[i] = enemies[enemies.length - 1];
                enemies.pop();

                recycled.statusFlags |= EnemyFlags.DEAD;
                recycled.deathState = EnemyDeathState.DEAD;

                if ((recycled.statusFlags & EnemyFlags.BOSS) === 0) enemyPool.push(recycled);
            }
        }
    }
};

// --- INITIALIZE AI CALLBACKS ---
_aiContext.onEffectTick = (enemy: Enemy, type: EnemyEffectType) => {
    const pos = enemy.mesh.position;

    if (!_aiContext.spawnPart) return;

    switch (type) {
        case EnemyEffectType.STUN:
            _aiContext.spawnPart(pos.x, pos.y + 1.8, pos.z, 'enemy_effect_stun', 1, undefined, undefined, 0xffff00, 0.3);
            break;
        case EnemyEffectType.FLAME:
            _v1.set(pos.x + (Math.random() - 0.5) * 0.5, pos.y + 1.0, pos.z + (Math.random() - 0.5) * 0.5);
            _aiContext.spawnPart(_v1.x, _v1.y, _v1.z, 'enemy_effect_flame', 1);
            break;
        case EnemyEffectType.SPARK:
            _v1.set(pos.x + (Math.random() - 0.5) * 0.4, pos.y + 0.8 + Math.random() * 0.4, pos.z + (Math.random() - 0.5) * 0.4);
            _aiContext.spawnPart(_v1.x, _v1.y, _v1.z, 'enemy_effect_spark', 1);
            break;
    }
};