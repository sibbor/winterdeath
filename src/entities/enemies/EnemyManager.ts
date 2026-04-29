import * as THREE from 'three';
import { MATERIALS } from '../../utils/assets';
import { KMH_TO_MS, INITIAL_ENEMY_POOL } from '../../content/constants';
import { Enemy, AIState, EnemyEffectType, EnemyDeathState, EnemyType, ENEMY_MAX_HP, ENEMY_BASE_SPEED, ENEMY_SCORE, ENEMY_COLOR, ENEMY_SCALE, ENEMY_WIDTH_SCALE, EnemyFlags, NoiseType, EnemyDeathDecal, EnemyGrowlType } from '../../entities/enemies/EnemyTypes';
import { DamageID } from '../../entities/player/CombatTypes';
import { ZOMBIE_TYPES } from '../../content/enemies/zombies';
import { BOSSES } from '../../content/enemies/bosses';
import { EnemySpawner } from './EnemySpawner';
import { EnemyAI } from './EnemyAI';
import { MaterialType } from '../../content/environment';
import { GamePlaySounds, EnemySounds } from '../../utils/audio/AudioLib';
import { audioEngine } from '../../utils/audio/AudioEngine';
import { SpatialGrid } from '../../core/world/SpatialGrid';
import { ZombieRenderer } from '../../core/renderers/ZombieRenderer';
import { CorpseRenderer } from '../../core/renderers/CorpseRenderer';
import { AshRenderer } from '../../core/renderers/AshRenderer';
import { FXParticleType } from '../../types/FXTypes';
import { FXSystem } from '../../systems/FXSystem';
import { WaterSystem } from '../../systems/WaterSystem';
import { WinterEngine } from '../../core/engine/WinterEngine';
import { SoundID } from '../../utils/audio/AudioTypes';
import { System, SystemID } from '../../systems/System';
import { GameSessionLogic } from '../../game/session/GameSessionLogic';
import { PlayerStatusFlags } from '../../entities/player/PlayerTypes';

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
    spawnParticle: ((x: number, y: number, z: number, type: string, count: number, mesh?: THREE.Object3D, vel?: THREE.Vector3, color?: number, scale?: number) => void) | null;
    spawnDecal: ((x: number, z: number, s: number, mat: THREE.Material, type?: string) => void) | null;
    applyDamage: ((enemy: Enemy, amount: number, type: DamageID, isHighImpact?: boolean) => void) | null;
    onEffectTick: ((e: Enemy, type: EnemyEffectType) => void) | null;
    playSound: (id: SoundID) => void;
    spawnBubble: ((text: string, duration: number) => void) | null;
    queryEnemies: ((pos: THREE.Vector3, radius: number) => Enemy[]) | null;
    onPlayerHit: (damage: number, attacker: any, type: DamageID, isDoT?: boolean, effect?: any, dur?: number, intense?: number, attackName?: string) => void;
    _realOnPlayerHit: ((damage: number, attacker: any, type: DamageID, isDoT?: boolean, effect?: any, dur?: number, intense?: number, attackName?: string) => void) | null;
}

const _aiContext: AIContext = {
    spawnParticle: null,
    spawnDecal: null,
    applyDamage: null,
    onEffectTick: null,
    playSound: (id: SoundID) => audioEngine.playSound(id),
    spawnBubble: null,
    queryEnemies: null,
    onPlayerHit: (damage: number, attacker: any, type: DamageID, isDoT?: boolean, effect?: any, dur?: number, intense?: number, attackName?: string) => {
        if (_aiContext._realOnPlayerHit) {
            _aiContext._realOnPlayerHit(damage, attacker, type, isDoT, effect, dur, intense, attackName);
        }
    },
    _realOnPlayerHit: null
};

export const EnemyManager = {
    systemId: SystemID.ENEMY_MANAGER,
    id: 'enemy_manager',
    enabled: true,
    persistent: true,

    init: (session: GameSessionLogic, initialPoolSize: number = INITIAL_ENEMY_POOL) => {
        const scene = session.engine.scene;
        if (!zombieRenderer) zombieRenderer = new ZombieRenderer(scene);
        else zombieRenderer.reAttach(scene);
 
        if (!corpseRenderer) corpseRenderer = new CorpseRenderer(scene);
        else corpseRenderer.reAttach(scene);
 
        if (!ashRenderer) ashRenderer = new AshRenderer(scene);
        else ashRenderer.reAttach(scene);
 
        enemyPool.length = 0;

        // VINTERDÖD: Pool Inflation (Zero-GC Pre-allocation)
        // We pre-allocate the CPU memory for enemies during the loading screen
        // to ensure that spawning during gameplay never triggers a 'new' allocation.
        const dummyScene = new THREE.Scene();
        const dummyPos = new THREE.Vector3();
        for (let i = 0; i < initialPoolSize; i++) {
            const enemy = EnemySpawner.spawn(dummyScene, dummyPos, EnemyType.WALKER);
            if (enemy) {
                enemy.mesh.visible = false;
                enemy.mesh.removeFromParent(); // Detach from dummy scene
                enemyPool.push(enemy);
            }
        }
    },

    reAttach: (scene: THREE.Scene) => {
        if (zombieRenderer) zombieRenderer.reAttach(scene);
        if (corpseRenderer) corpseRenderer.reAttach(scene);
        if (ashRenderer) ashRenderer.reAttach(scene);
    },


    update: (
        session: GameSessionLogic,
        delta: number,
        simTime: number,
        renderTime: number
    ) => {
        const state = session.state;
        const playerPos = session.playerPos || session.engine.camera.lookAtTarget;
        const enemies = state.enemies;
        const collisionGrid = state.collisionGrid;
        const isDead = (state.statusFlags & PlayerStatusFlags.DEAD) !== 0;
        const water = session.engine.water;
        const playerStatusFlags = state.statusFlags;
        const callbacks = state.callbacks;

        const onPlayerHit = callbacks?.onPlayerHit;
        const spawnParticle = callbacks?.spawnParticle;
        const spawnDecal = callbacks?.spawnDecal;
        const applyDamage = state.applyDamage;
        const spawnBubble = callbacks?.spawnBubble;

        collisionGrid.updateEnemyGrid(enemies);
        _syncList.length = 0;

        _aiContext._realOnPlayerHit = onPlayerHit;
        _aiContext.spawnParticle = spawnParticle;
        _aiContext.spawnDecal = spawnDecal;
        _aiContext.applyDamage = applyDamage;
        _aiContext.spawnBubble = spawnBubble;
        _aiContext.queryEnemies = (pos: THREE.Vector3, rad: number) => collisionGrid.getNearbyEnemies(pos, rad);

        const globalTimeScale = state?.globalTimeScale ?? 1.0;
        const scaledDelta = delta * globalTimeScale;

        const camera = session.engine.camera;
        const cameraPos = camera.threeCamera.position;
        const cameraDir = _camDir.set(0, 0, -1).applyQuaternion(camera.threeCamera.quaternion);

        const len = enemies.length;
        for (let i = 0; i < len; i++) {
            const e = enemies[i];

            if (e.deathState === EnemyDeathState.ALIVE) {
                // Let EnemyAI handle duration updates and physics!
                EnemyAI.updateEnemy(e, playerPos, playerStatusFlags, collisionGrid, isDead, _aiContext, water, scaledDelta, simTime, renderTime);
            }

            if (e.deathState !== EnemyDeathState.ALIVE && e.deathState !== EnemyDeathState.DEAD) {
                EnemyManager.processDeathAnimation(e, _aiContext, scaledDelta, simTime, renderTime);
            }

            const deathState = e.deathState;

            switch (deathState) {
                case EnemyDeathState.BURNED:
                case EnemyDeathState.ELECTROCUTED:
                case EnemyDeathState.DROWNED:
                    e.mesh.visible = true;
                    e.mesh.matrixAutoUpdate = true;
                    break;

                case EnemyDeathState.DEAD:
                    // Handled by pooling/removal logic
                    break;

                default:
                    // Visibility culling for standard enemies
                    if ((e.statusFlags & EnemyFlags.BOSS) === 0 && !(e.statusFlags & EnemyFlags.EXPLODED)) {
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
                    } else {
                        // Bosses and exploded entities usually stay visible
                        e.mesh.visible = true;
                        e.mesh.matrixAutoUpdate = true;
                    }
                    break;
            }

            if (deathState === EnemyDeathState.ALIVE && e.color !== undefined) {
                const isBoss = (e.statusFlags & EnemyFlags.BOSS) !== 0;
                const timeSinceHit = simTime - e.hitTime;
                const isRecentHit = timeSinceHit < 100;

                if (isBoss) {
                    if (isRecentHit) {
                        if (!(e.statusFlags & EnemyFlags.FLASH_ACTIVE)) {
                            e.statusFlags |= EnemyFlags.FLASH_ACTIVE;
                            const isArc = e.lastDamageType === DamageID.ARC_CANNON;

                            if (isArc) _flashColor.setHex(0x00ffff).lerp(_white, 0.4);
                            else _flashColor.setHex(0xffffff);

                            const intensity = isArc ? 2.0 : 1.0;

                            _traverseStack.length = 0;
                            _traverseStack.push(e.mesh);
                            while (_traverseStack.length > 0) {
                                const c = _traverseStack.pop() as any;
                                if (c.isMesh && c.material && c.material.emissive) {
                                    c.material.emissive.copy(_flashColor);
                                    c.material.emissiveIntensity = intensity;
                                }
                                if (c.children) {
                                    for (let k = 0; k < c.children.length; k++) {
                                        _traverseStack.push(c.children[k]);
                                    }
                                }
                            }
                        }
                    } else {
                        if (e.statusFlags & EnemyFlags.FLASH_ACTIVE) {
                            e.statusFlags &= ~EnemyFlags.FLASH_ACTIVE;
                            resetMaterialEmissive(e.mesh);
                        }
                    }

                    // No boss
                } else {
                    if (isRecentHit) {
                        if (!(e.statusFlags & EnemyFlags.FLASH_ACTIVE)) {
                            e.statusFlags |= EnemyFlags.FLASH_ACTIVE;
                            e.originalColor = e.color;
                            const isArc = e.lastDamageType === DamageID.ARC_CANNON;
                            if (isArc) {
                                e.color = _flashColor.setHex(0x00ffff).lerp(_white, 0.4).getHex();
                            } else {
                                e.color = 0xffffff;
                            }
                        }
                    } else {
                        if (e.statusFlags & EnemyFlags.FLASH_ACTIVE) {
                            e.statusFlags &= ~EnemyFlags.FLASH_ACTIVE;
                            e.color = e.originalColor;
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
        const newType = (forcedType !== undefined) ? forcedType : EnemySpawner.determineType(bossSpawned);

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

        // VINTERDÖD: Attack list initialization (Zero-GC pooling)
        const typeData = (newType === EnemyType.BOSS) ? BOSSES[0] : ((ZOMBIE_TYPES as any)[newType] || ZOMBIE_TYPES.WALKER);
        e.attacks = typeData.attacks || [];
        if (e.attackCooldowns) e.attackCooldowns.fill(0);

        // Initialize collision radii
        e.hitRadius = e.originalScale * 0.5;
        e.combatRadius = e.originalScale * 1.5;
        e.attackOffset = 0.5 + e.hitRadius;

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
        e.targetPos.set(0, 0, 0);

        // VINTERDÖD: Advanced Physics Warmup
        e.swingX = 0;
        e.swingZ = 0;
        e.swingVelX = 0;
        e.swingVelZ = 0;

        e.prevP.set(0, -1000, 0);

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
        e.grappleDuration = 0; // VINTERDÖD: Reset grapple
        e.burnTickTimer = 0;
        e.lastBurnTick = 0;

        e.drownTimer = 0;
        e.drownDmgTimer = 0;
        e.fallStartY = 0;

        e.spinVel.set(0, 0, 0);
        e.hitDir.set(0, 0, 0);
        e.baseY = 0;
        e.animRotX = 0;
        e.animRotZ = 0;
        e.lastAIState = AIState.IDLE;
        e.ashPile = null;

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
        if (enemy.statusFlags & EnemyFlags.EXPLODED) return;
        enemy.statusFlags |= EnemyFlags.EXPLODED;
        if (isGibbed) enemy.statusFlags |= EnemyFlags.GIBBED;

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

        if (callbacks.spawnParticle) {
            callbacks.spawnParticle(pos.x, 1.5, pos.z, 'blood_splatter', 6);
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

        if (callbacks.spawnParticle) {
            for (let i = 0; i < goreCount; i++) {
                _v2.set(_v1.x + (Math.random() - 0.5) * 12, _v1.y + Math.random() * 6, _v1.z + (Math.random() - 0.5) * 10);
                callbacks.spawnParticle(pos.x, pos.y + 1, pos.z, 'gore', 1, undefined, _v2, enemy.color, goreScale);
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

                if (!(e.statusFlags & EnemyFlags.ASH_SPAWNED)) {
                    e.statusFlags |= EnemyFlags.ASH_SPAWNED;
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
                    if (!(e.statusFlags & EnemyFlags.ASH_PERMANENT)) {
                        e.statusFlags |= EnemyFlags.ASH_PERMANENT;
                        if (e.mesh.parent) e.mesh.parent.remove(e.mesh);
                    }
                    e.deathState = EnemyDeathState.DEAD;
                }
                break;

            case EnemyDeathState.ELECTROCUTED:
                if (!(e.statusFlags & EnemyFlags.ELECTROCUTED)) {
                    e.statusFlags |= EnemyFlags.ELECTROCUTED;
                    e.targetPos.copy(e.mesh.position); // Reusing as deathPos
                    e.baseY = e.mesh.position.y; // Reusing as deathPosY

                    e.stunDuration = 400 + Math.random() * 200; // Reusing for fallDuration
                    e.slowDuration = 1800 + Math.random() * 500; // Reusing for twitchDuration

                    e.swingX = -Math.PI / 2.1; // Reusing for targetRotX
                    e.swingZ = (Math.random() - 0.5) * 0.5; // Reusing for targetRotZ
                }

                const fallDur = e.stunDuration;
                const twitchDur = e.slowDuration;

                if (age < twitchDur) {
                    const fallProgress = Math.min(1.0, age / fallDur);

                    e.mesh.rotation.x = THREE.MathUtils.lerp(0, e.swingX, fallProgress);
                    e.mesh.rotation.z = THREE.MathUtils.lerp(0, e.swingZ, fallProgress);
                    e.mesh.position.y = THREE.MathUtils.lerp(e.baseY, 0.2, fallProgress);

                    const pulse = Math.sin(renderTime * 0.05) * 0.5 + 0.5;
                    _color.copy(_cyan).lerp(_white, Math.random() * 0.3);
                    applyElectrifiedGlow(e.mesh, _color, 1.0 + pulse * 4.0);

                    const jitter = (1.0 - fallProgress * 0.5) * 0.2;
                    e.mesh.rotation.y += (Math.random() - 0.5) * jitter;

                    if (Math.random() > 0.85 && callbacks.spawnParticle) {
                        _v1.set(
                            e.targetPos.x + (Math.random() - 0.5),
                            e.mesh.position.y + 0.5,
                            e.targetPos.z + (Math.random() - 0.5)
                        );
                        callbacks.spawnParticle(_v1.x, _v1.y, _v1.z, 'spark', 1);
                    }
                } else {
                    _color.setHex(e.color || 0xffffff).multiplyScalar(0.3);
                    resetMaterialEmissive(e.mesh);
                    setBaseColor(e.mesh, _color);

                    e.mesh.position.x = e.targetPos.x;
                    e.mesh.position.y = 0.2;
                    e.mesh.position.z = e.targetPos.z;

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

                e.mesh.quaternion.setFromEuler(e.mesh.rotation);

                if (age > 1000) {
                    e.deathState = EnemyDeathState.DEAD;
                }
                break;
        }
    },

    /**
     * UNIFIED PERFORMANCE PHYSICS: The single source of truth for sending zombies flying.
     * Handles horizontal knockback, vertical lift, ragdoll state initialization, and spin.
     */
    applyImpactForce: (
        enemy: Enemy,
        impactSourcePos: THREE.Vector3,
        forceMag: number,
        liftRatio: number,
        stunDuration: number,
        spinIntensity: number
    ) => {
        if (enemy.deathState !== EnemyDeathState.ALIVE) return;

        // --- 1. DIRECTIONAL MATH (Zero-GC) ---
        _v1.subVectors(enemy.mesh.position, impactSourcePos);
        _v1.y = 0;
        if (_v1.lengthSq() < 0.001) _v1.set(0, 0, 1);
        else _v1.normalize();

        const mass = (enemy.originalScale || 1.0) * (enemy.widthScale || 1.0);
        const force = forceMag / Math.max(0.5, mass);
        const lift = forceMag * liftRatio / Math.max(0.5, mass);

        // --- 2. APPLY VELOCITY ---
        enemy.knockbackVel.set(_v1.x * force, lift, _v1.z * force);

        // --- 3. STATE & INTERRUPTION ---
        enemy.stunDuration = stunDuration;
        enemy.slowDuration = Math.max(3.5, stunDuration + 1.5);

        // Interrupt attacks
        if (enemy.state === AIState.ATTACK_CHARGE || enemy.state === AIState.ATTACKING) {
            enemy.attackTimer = 0;
            if (enemy.indicatorRing) enemy.indicatorRing.visible = false;
        }
        enemy.state = AIState.IDLE;

        // --- 4. RAGDOLL & SPIN ---
        if ((enemy.statusFlags & EnemyFlags.BOSS) === 0) {
            enemy.statusFlags |= EnemyFlags.RAGDOLLING;
            enemy.spinVel.set(
                (Math.random() - 0.5) * spinIntensity,
                (Math.random() - 0.5) * spinIntensity * 1.2,
                (Math.random() - 0.5) * spinIntensity
            );
        }
    },

    /**
     * Handles the physics and logic for multiple enemies being hit by
     * player's Rush or Dodge.
     */
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

                // --- PHYSICS (Using Unified Pipeline) ---
                const isDodge = damageType === DamageID.DODGE;
                const isRush = damageType === DamageID.RUSH;

                // VINTERDÖD: Dramatically increase RUSH lift and decrease DODGE lift for requested feedback
                const liftRatio = isDodge ? 0.05 : (isRush ? 1.6 : 0.45);
                const spinScale = isRush ? 2.5 : 0.8;
                const force = maxForce * falloff;
                const stunDur = (isRush ? 2.0 : 1.2) * falloff;

                // Add slight horizontal "Spread" variance
                _v1.x += (Math.random() - 0.5) * (force * 0.1);
                _v1.z += (Math.random() - 0.5) * (force * 0.1);

                EnemyManager.applyImpactForce(
                    e,
                    center,
                    force,
                    liftRatio,
                    Math.max(0.8, stunDur),
                    force * spinScale
                );

                // --- VISUALS ---
                if (ctx.particles) {
                    FXSystem.spawnParticle(ctx.engine?.scene || ctx.scene, ctx.particles, e.mesh.position.x, 1.5, e.mesh.position.z, FXParticleType.BLOOD_SPLATTER, 6);
                }
            }
        }

        if (hitAnyone) GamePlaySounds.playImpact(MaterialType.FLESH);
    },

    /**
     * Handles the physics and logic for a single enemy being hit by a vehicle.
      */
    ramEnemies: (
        e: Enemy,
        knockDir: THREE.Vector3,
        speedMS: number,
        vehicleDef: any,
        state: any,
        session: any,
        delta: number,
        simTime: number,
        renderTime: number
    ): boolean => {
        const speedKmh = speedMS * 3.6;
        const mass = e.originalScale * e.widthScale;
        const massRatio = (vehicleDef.mass * 0.001) / (mass || 1.0);

        const baseDamage = speedKmh * massRatio * vehicleDef.collisionDamageMultiplier * 2.0;

        e.hp -= baseDamage;
        e.hitTime = simTime;
        e.hitRenderTime = renderTime;

        const scene = session.engine.scene;

        const tracker = (session as any).getSystem('damage_tracker_system') as any;
        if (tracker) tracker.recordOutgoingDamage(session, baseDamage, DamageID.VEHICLE, (e.statusFlags & EnemyFlags.BOSS) !== 0);

        if (e.hp <= 0) {
            e.statusFlags |= EnemyFlags.DEAD;
            if (tracker) {
                _v1.copy(e.mesh.position).setY(0);
                const pPos = session.playerPos;
                const dSq = pPos ? _v1.distanceToSquared(pPos) : 0;
                tracker.recordKill(session, DamageID.VEHICLE, (e.statusFlags & EnemyFlags.BOSS) !== 0, -1, DamageID.VEHICLE, dSq);
            }

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

                FXSystem.spawnParticle(scene, state.particles, e.mesh.position.x, 1.5, e.mesh.position.z, FXParticleType.BLOOD_SPLATTER, 6);
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

            // Unified Physics Impact for vehicles
            const liftRatio = 0.4 + (speedMS * 0.02); // Faster = more lift
            EnemyManager.applyImpactForce(e, _v4, speedMS * 15, liftRatio, 1.5, speedMS * 2.0);

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
                e.targetPos.copy(e.mesh.position);
                e.baseY = e.mesh.position.y;
                if (!(e.statusFlags & EnemyFlags.EXPLODED)) {
                    let growlType = EnemyGrowlType.WALKER;
                    if (e.type === EnemyType.RUNNER) growlType = EnemyGrowlType.RUNNER;
                    else if (e.type === EnemyType.TANK) growlType = EnemyGrowlType.TANK;
                    EnemySounds.playGrowl(growlType, e.mesh.position);
                }
            }

            const shouldCleanup = (e.deathState === EnemyDeathState.DEAD) || (e.statusFlags & (EnemyFlags.EXPLODED | EnemyFlags.GIBBED)) !== 0;

            if (shouldCleanup) {
                let leaveCorpse = false;
                let deathDecal = EnemyDeathDecal.NONE;

                if (e.statusFlags & EnemyFlags.EXPLODED) {
                    EnemyManager.explodeEnemy(e, callbacks, _up);
                }
                else if (e.statusFlags & EnemyFlags.GIBBED) {
                    if (e.mesh.parent) e.mesh.parent.remove(e.mesh);
                }
                else if (e.statusFlags & EnemyFlags.ASH_SPAWNED) {
                    if (e.mesh.parent) e.mesh.parent.remove(e.mesh);
                }
                else if (e.statusFlags & EnemyFlags.ELECTROCUTED) {
                    leaveCorpse = true;
                    deathDecal = EnemyDeathDecal.SCORCH;
                }
                else if (e.deathState === EnemyDeathState.DROWNED || e.lastDamageType === DamageID.DROWNING) {
                    leaveCorpse = true;
                }
                else {
                    leaveCorpse = true;
                    deathDecal = EnemyDeathDecal.BLOOD;
                }

                if (e.mesh.parent) scene.remove(e.mesh);

                if (leaveCorpse && (e.statusFlags & EnemyFlags.BOSS) === 0) {
                    const corpseColor = deathDecal === EnemyDeathDecal.SCORCH ? _color.setHex(e.color || 0xffffff).multiplyScalar(0.4).getHex() : e.color;
                    EnemyManager.createCorpse(e, corpseColor);
                }

                if (!e.bloodSpawned && deathDecal === EnemyDeathDecal.BLOOD) {
                    if (callbacks.spawnDecal) callbacks.spawnDecal(e.mesh.position.x, e.mesh.position.z, (1.5 + Math.random() * 2.5) * (e.originalScale || 1.0), MATERIALS.bloodDecal);
                    e.bloodSpawned = true;
                } else if (!e.bloodSpawned && deathDecal === EnemyDeathDecal.SCORCH) {
                    if (callbacks.spawnDecal) callbacks.spawnDecal(e.mesh.position.x, e.mesh.position.z, (1.2 + Math.random() * 0.5) * (e.originalScale || 1.0), MATERIALS.scorchDecal);
                    e.bloodSpawned = true;
                }

                const session = callbacks.getSession ? callbacks.getSession() : null;
                if (session) {
                    const tracker = session.getSystem('damage_tracker_system') as any;
                    if (tracker) {
                        _v1.copy(e.mesh.position).setY(0);
                        const pPos = session.playerPos;
                        const dSq = pPos ? _v1.distanceToSquared(pPos) : 0;
                        tracker.recordKill(session, e.type, (e.statusFlags & EnemyFlags.BOSS) !== 0, e.bossId, e.lastDamageType as any, dSq);
                    }
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

    if (!_aiContext.spawnParticle) return;

    switch (type) {
        case EnemyEffectType.STUN:
            _aiContext.spawnParticle(pos.x, pos.y + 1.8, pos.z, 'enemy_effect_stun', 1, undefined, undefined, 0xffff00, 0.3);
            break;
        case EnemyEffectType.FLAME:
            _v1.set(pos.x + (Math.random() - 0.5) * 0.5, pos.y + 1.0, pos.z + (Math.random() - 0.5) * 0.5);
            _aiContext.spawnParticle(_v1.x, _v1.y, _v1.z, 'enemy_effect_flame', 1);
            break;
        case EnemyEffectType.SPARK:
            _v1.set(pos.x + (Math.random() - 0.5) * 0.4, pos.y + 0.8 + Math.random() * 0.4, pos.z + (Math.random() - 0.5) * 0.4);
            _aiContext.spawnParticle(_v1.x, _v1.y, _v1.z, 'enemy_effect_spark', 1);
            break;
    }
};