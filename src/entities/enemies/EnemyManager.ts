import * as THREE from 'three';
import { SystemID } from '../../systems/System';
import { MATERIALS } from '../../utils/assets';
import { KMH_TO_MS, AI_LOD } from '../../content/constants';
import { EnemyPoolState, ENEMY_POOL_SIZE } from '../../core/state/EnemyPool';
import { Enemy, AIState, EnemyEffectType, EnemyDeathState, EnemyType, ENEMY_MAX_HP, ENEMY_BASE_SPEED, ENEMY_SCORE, ENEMY_COLOR, ENEMY_SCALE, ENEMY_WIDTH_SCALE, EnemyFlags, NoiseType, EnemyDeathDecal, EnemyGrowlType } from '../../entities/enemies/EnemyTypes';
import { COLORS, ENEMY_COLORS } from '../../utils/ui/ColorUtils';
import { AbilityID, DamageID, DamageType, EnemyAttackType } from '../../entities/player/CombatTypes';
import { StatusEffectID } from '../../types/StatusEffects';
import { ZOMBIE_TYPES } from '../../content/enemies/zombies';
import { BOSSES } from '../../content/enemies/bosses';
import { EnemySpawner } from './EnemySpawner';
import { EnemyAI } from './EnemyAI';
import { RuntimeStressHarness } from '../../utils/debug/RuntimeStressHarness';
import { MaterialType } from '../../content/environment';
import { GamePlaySounds, EnemySounds } from '../../utils/audio/AudioLib';
import { audioEngine } from '../../utils/audio/AudioEngine';
import { ZombieRenderer } from '../../core/renderers/ZombieRenderer';
import { CorpseRenderer } from '../../core/renderers/CorpseRenderer';
import { AshRenderer } from '../../core/renderers/AshRenderer';
import { FXParticleType, FXDecalType } from '../../types/FXTypes';
import { FXSystem } from '../../systems/FXSystem';
import { SoundID } from '../../utils/audio/AudioTypes';
import { GameSessionLogic } from '../../game/session/GameSessionLogic';
import { GameSessionState } from '../../game/session/GameSessionState';
import { PlayerStatusFlags } from '../../types/CareerStats';
import { WorldStreamer } from '../../core/world/WorldStreamer';
import { ChunkManager } from '../../core/world/ChunkManager';
import { SectorBuildContext, SectorUpdateContext, BossID } from '../../game/session/SectorTypes';
import { SPATIAL_CONFIG } from '../../config/SpatialConfig';
import { SectorSystem } from '../../systems/SectorSystem';
import { LootSystem } from '../../systems/LootSystem';
import { _buoyancyResult } from '../../systems/WaterSystem';
import { ABILITIES } from '../../content/abilities';

export type { Enemy };

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _camDir = new THREE.Vector3();
const _up = new THREE.Vector3(0, 5, 0);

const _white = new THREE.Color(COLORS.WHITE.num);
const _cyan = new THREE.Color(COLORS.ELECTRIC_FLASH.num);
const _flashColor = new THREE.Color();
const _color = new THREE.Color();

const _syncList: Enemy[] = [];
// CONTIGUOUS POOL: activeEnemies[0...activeCount-1] are active.
const activeEnemies: Enemy[] = new Array(ENEMY_POOL_SIZE);
const inactiveEnemies: Enemy[] = [];
let activeCount = 0;

const EMPTY_ATTACKS: any[] = [];


// Shared iterative stack to avoid recursive stack frames and closures
const _traverseStack: THREE.Object3D[] = [];

let zombieRenderer: ZombieRenderer | null = null;
let corpseRenderer: CorpseRenderer | null = null;
let ashRenderer: AshRenderer | null = null;

let _currentSession: GameSessionLogic | null = null;
let _currentStreamer: WorldStreamer | null = null;
let _frameCount = 0;

// --- STATIC CALLBACK WRAPPERS (Zero-GC) ---
const _queryEnemies = (pos: THREE.Vector3, rad: number, outPoolIdx: number) => {
    if (_currentStreamer) _currentStreamer.getNearbyEnemies(pos.x, pos.z, rad, outPoolIdx);
};


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
    spawnParticle: ((x: number, y: number, z: number, type: FXParticleType, count: number, mesh?: THREE.Object3D, vel?: THREE.Vector3, color?: number, scale?: number) => void) | null;
    spawnDecal: ((x: number, z: number, s: number, mat: THREE.Material, type?: FXDecalType) => void) | null;
    applyDamage: ((enemy: Enemy, amount: number, damageType: DamageType, damageSource: DamageID, isHighImpact?: boolean) => boolean) | null;
    onEffectTick: ((e: Enemy, type: EnemyEffectType) => void) | null;
    playSound: (id: SoundID) => void;
    setBubble: ((text: string, duration: number) => void) | null;
    queryEnemies: ((pos: THREE.Vector3, radius: number, outPoolIdx: number) => void) | null;
    onPlayerHit: (damage: number, attacker: any, damageType: DamageType, damageSource: DamageID, isDoT?: boolean, effectType?: StatusEffectID, duration?: number, intensity?: number, specificAttackType?: EnemyAttackType) => void;
    _realOnPlayerHit: ((damage: number, attacker: any, damageType: DamageType, damageSource: DamageID, isDoT?: boolean, effectType?: StatusEffectID, duration?: number, intensity?: number, specificAttackType?: EnemyAttackType) => void) | null;
}

const _aiContext: AIContext = {
    spawnParticle: null,
    spawnDecal: null,
    applyDamage: null,
    onEffectTick: null,
    playSound: (id: SoundID) => audioEngine.playSound(id),
    setBubble: null,
    queryEnemies: _queryEnemies,

    onPlayerHit: (damage: number, attacker: any, damageType: DamageType, damageSource: DamageID, isDoT?: boolean, effectType?: StatusEffectID, duration?: number, intensity?: number, specificAttackType?: EnemyAttackType) => {
        if (_aiContext._realOnPlayerHit) {
            _aiContext._realOnPlayerHit(damage, attacker, damageType, damageSource, isDoT, effectType, duration, intensity, specificAttackType);
        }
    },
    _realOnPlayerHit: null
};

// Removed buckets for flat pool optimization (Phase 6)

export const EnemyManager = {
    systemId: SystemID.ENEMY_MANAGER,
    id: 'enemy_manager',
    enabled: true,
    persistent: false, // Must be false to prevent leaking into the Camp

    init: (session: GameSessionLogic, initialPoolSize: number = ENEMY_POOL_SIZE) => {
        _currentSession = session;
        const scene = session.engine.scene;
        if (!zombieRenderer) zombieRenderer = new ZombieRenderer(scene);
        else zombieRenderer.reAttach(scene);

        if (!corpseRenderer) corpseRenderer = new CorpseRenderer(scene);
        else corpseRenderer.reAttach(scene);

        if (!ashRenderer) ashRenderer = new AshRenderer(scene);
        else ashRenderer.reAttach(scene);

        activeCount = 0;
        inactiveEnemies.length = 0;
        _frameCount = 0;
        EnemyPoolState.activeCount = 0;

        // Contiguous Pool Warmup
        const dummyScene = new THREE.Scene();
        const dummyPos = new THREE.Vector3();
        for (let i = 0; i < ENEMY_POOL_SIZE; i++) {
            const enemy = EnemySpawner.spawn(dummyScene, dummyPos, EnemyType.WALKER, undefined, false, true);
            if (enemy) {
                enemy.mesh.visible = false;
                enemy.mesh.removeFromParent();
                enemy.poolId = i;
                enemy.currentChunkKey = -1;
                enemy.bucketIndex = -1;
                enemy._sqf = 0;
                inactiveEnemies.push(enemy);
            }
        }
    },

    reAttach: (scene: THREE.Scene) => {
        if (zombieRenderer) zombieRenderer.reAttach(scene);
        if (corpseRenderer) corpseRenderer.reAttach(scene);
        if (ashRenderer) ashRenderer.reAttach(scene);

        // VINTERDÖD FIX: Ensure all active enemies' visual meshes are migrated to the new scene
        // Prevents "invisible enemies" hits when transitioning sectors without recycling.
        for (let i = 0; i < activeCount; i++) {
            const e = activeEnemies[i];
            if (e && e.mesh && e.mesh.parent !== scene) {
                scene.add(e.mesh);
            }
        }
    },

    update: (
        session: GameSessionLogic,
        delta: number,
        simTime: number,
        renderTime: number
    ) => {
        // Lifecycle Guard - Prevent AI updates during sector transitions or in the Camp
        const streamer = session.worldStreamer;
        if (!session || !session.state || !streamer) return;

        // VINTERDÖD HARDENING: Prevent invisible enemies if the renderer was cleared but not re-inited
        if (!zombieRenderer) {
            const scene = session.engine.scene;
            if (scene) zombieRenderer = new ZombieRenderer(scene);
        }

        const state = session.state;

        const playerPos = state.player.position;
        const pX = playerPos.x;
        const pZ = playerPos.z;

        const isDead = (state.combat.statusFlags & PlayerStatusFlags.DEAD) !== 0;
        const playerStatusFlags = state.combat.statusFlags;
        const water = session.engine.water;
        const ground = session.engine.ground;
        const callbacks = state.callbacks;
        const onPlayerHit = callbacks?.onPlayerHit;
        const spawnParticle = callbacks?.spawnParticle;
        const spawnDecal = callbacks?.spawnDecal;
        const applyDamage = state.applyDamage;

        _frameCount++;
        _syncList.length = 0;

        _aiContext._realOnPlayerHit = onPlayerHit;
        _aiContext.spawnParticle = spawnParticle;
        _aiContext.spawnDecal = spawnDecal;
        _aiContext.applyDamage = applyDamage;
        _currentStreamer = streamer;

        const globalTimeScale = state?.metrics?.globalTimeScale ?? 1.0;
        const scaledDelta = delta * globalTimeScale;

        const camera = session.engine.camera;
        const cameraPos = camera.threeCamera.position;
        const cameraDir = _camDir.set(0, 0, -1).applyQuaternion(camera.threeCamera.quaternion);

        // --- PHASE 6: CONTIGUOUS POOL UPDATE ---
        for (let i = 0; i < activeCount; i++) {
            const e = activeEnemies[i];
            if (!e) continue;

            // --- 1. SPATIAL GATING (Zero-GC) ---
            const dx = e.mesh.position.x - pX;
            const dz = e.mesh.position.z - pZ;
            const distSq = dx * dx + dz * dz;

            const isDying = e.deathState !== EnemyDeathState.ALIVE && e.deathState !== EnemyDeathState.DEAD;

            let updateFrequency = 0;
            const AI_CORE_RADIUS_SQ = AI_LOD.CORE_RADIUS_SQ;
            const AI_THROTTLED_RADIUS_SQ = AI_LOD.THROTTLED_RADIUS_SQ;

            if (isDying || distSq < AI_CORE_RADIUS_SQ) {
                updateFrequency = 1;
            } else if (distSq < AI_THROTTLED_RADIUS_SQ) {
                updateFrequency = 6;
            }

            const shouldUpdate = updateFrequency > 0 && (_frameCount % updateFrequency === 0);

            if (shouldUpdate) {
                // --- VINTERDÖD STABILIZATION: Sync SoA -> Object ---
                // This allows TriggerSystem/ProjectileSystem to inject flags/damage directly into SoA
                e.statusFlags |= EnemyPoolState.statusFlags[i];
                if (EnemyPoolState.hp[i] < e.hp) e.hp = EnemyPoolState.hp[i];

                // --- 2. LOGIC UPDATE ---
                if (e.deathState === EnemyDeathState.ALIVE) {
                    EnemyAI.updateEnemy(e, playerPos, playerStatusFlags, streamer as any, isDead, _aiContext, water, ground, session, scaledDelta * updateFrequency, simTime, renderTime);

                    // --- STRESS HARNESS: MONITOR PHASING ---
                    RuntimeStressHarness.assertPhasing("Enemy", e.mesh.position.x, e.mesh.position.z, e.prevP.x, e.prevP.z);
                    e.prevP.copy(e.mesh.position);
                } else if (isDying) {
                    EnemyManager.processDeathAnimation(e, _aiContext, session, scaledDelta, simTime, renderTime, ground, water);
                }

                // --- 2b. SPATIAL RE-BUCKETING (Zero-GC Migration) ---
                EnemyManager.updateSpatialPosition(e, streamer);

                // SYNC TO TypedArray SoA (Source of Truth for other systems)
                EnemyPoolState.posX[i] = e.mesh.position.x;
                EnemyPoolState.posY[i] = e.mesh.position.y;
                EnemyPoolState.posZ[i] = e.mesh.position.z;
                EnemyPoolState.rotY[i] = e.mesh.rotation.y;
                EnemyPoolState.hp[i] = e.hp;
                EnemyPoolState.deathState[i] = e.deathState;
                EnemyPoolState.statusFlags[i] = e.statusFlags;
                EnemyPoolState.aiState[i] = e.state;
                EnemyPoolState.velX[i] = e.velocity.x;
                EnemyPoolState.velY[i] = e.velocity.y;
                EnemyPoolState.velZ[i] = e.velocity.z;

                e.mesh.updateMatrix();
            }

            // --- 3. RENDER SYNC ---
            if (updateFrequency > 0 || isDying) {
                _syncList.push(e);

                const deathState = e.deathState;
                switch (deathState) {
                    case EnemyDeathState.BURNED:
                    case EnemyDeathState.ELECTROCUTED:
                    case EnemyDeathState.DROWNED:
                        e.mesh.visible = true;
                        e.mesh.matrixAutoUpdate = true;

                        // Ensure the standalone body mesh is temporarily visible for dying animations
                        const dBody = e.bodyMesh;
                        if (dBody) dBody.visible = true;
                        break;
                    case EnemyDeathState.DEAD:
                        break;
                    default:
                        const isDying = deathState !== EnemyDeathState.ALIVE;
                        if (isDying) {
                            e.mesh.visible = false;
                            e.mesh.matrixAutoUpdate = true;
                        } else if ((e.statusFlags & EnemyFlags.BOSS) === 0 && !(e.statusFlags & EnemyFlags.EXPLODED)) {
                            let isVisible = true;
                            if (cameraPos && cameraDir) {
                                _v2.subVectors(e.mesh.position, cameraPos);
                                const dot = cameraDir.dot(_v2);
                                const dSq = _v2.lengthSq();
                                if (dot < AI_LOD.CULL_DOT_THRESHOLD && dSq > AI_LOD.THROTTLED_RADIUS_SQ) isVisible = false;
                            }
                            const isTelegraphing = e.indicatorRing && e.indicatorRing.visible;
                            if (!isVisible && !isTelegraphing) {
                                e.mesh.visible = false;
                                e.mesh.matrixAutoUpdate = false;
                            } else if (isVisible && !isTelegraphing) {
                                e.mesh.visible = false;
                                e.mesh.matrixAutoUpdate = false;
                                e.mesh.updateMatrix();
                            } else {
                                e.mesh.visible = isVisible;
                                e.mesh.matrixAutoUpdate = true;
                            }
                        } else {
                            e.mesh.visible = true;
                            e.mesh.matrixAutoUpdate = true;
                        }
                        break;
                }

                // Flash feedback
                if (deathState === EnemyDeathState.ALIVE && e.color !== undefined) {
                    const isBoss = (e.statusFlags & EnemyFlags.BOSS) !== 0;
                    const timeSinceHit = simTime - e.hitTime;
                    if (timeSinceHit < 100) {
                        if (!(e.statusFlags & EnemyFlags.FLASH_ACTIVE)) {
                            e.statusFlags |= EnemyFlags.FLASH_ACTIVE;
                            e.originalColor = e.color;
                            const isArc = e.lastDamageType === DamageID.ARC_CANNON;
                            if (isArc) {
                                e.color = ENEMY_COLORS.ELECTRIC_ARC_FLASH.num;
                                if (isBoss) applyElectrifiedGlow(e.mesh, _cyan, 2.0); // Using scratchpad _cyan
                            } else {
                                e.color = ENEMY_COLORS.HIT_FLASH.num;
                                if (isBoss) applyElectrifiedGlow(e.mesh, _white, 1.0); // Using scratchpad _white
                            }
                        }
                    } else if (e.statusFlags & EnemyFlags.FLASH_ACTIVE) {
                        e.statusFlags &= ~EnemyFlags.FLASH_ACTIVE;
                        if (isBoss) resetMaterialEmissive(e.mesh);
                        else e.color = e.originalColor;
                    }
                }
            } else {
                e.mesh.visible = false;
                e.mesh.matrixAutoUpdate = false;
            }
        }

        if (zombieRenderer) zombieRenderer.sync(_syncList, simTime);
        if (ashRenderer) ashRenderer.update(Math.max(simTime, 1), playerPos);
    },

    clear: () => {
        zombieRenderer?.destroy();
        corpseRenderer?.destroy();
        ashRenderer?.destroy();
        zombieRenderer = null;
        corpseRenderer = null;
        ashRenderer = null;

        // VINTERDÖD STABILIZATION: Strict nulling to prevent sector-to-sector reference leaks
        for (let i = 0; i < ENEMY_POOL_SIZE; i++) {
            if (activeEnemies[i]) {
                activeEnemies[i].mesh.removeFromParent();
            }
            activeEnemies[i] = null!;
        }

        inactiveEnemies.length = 0;
        activeCount = 0;
        EnemyPoolState.activeCount = 0;

        // Zero-out entire SoA state to be safe
        EnemyPoolState.statusFlags.fill(0);
        EnemyPoolState.hp.fill(0);
        EnemyPoolState.posX.fill(0);
        EnemyPoolState.posZ.fill(0);
        EnemyPoolState.deathState.fill(EnemyDeathState.DEAD);
    },

    getAshRenderer: () => ashRenderer,
    getActiveEnemies: () => activeEnemies,
    getActiveCount: () => activeCount,

    spawn: (scene: THREE.Scene, playerPos: THREE.Vector3, forcedType?: EnemyType, forcedPos?: THREE.Vector3, bossSpawned: boolean = false, enemyCount: number = 0, isForced: boolean = false): Enemy | null => {
        // VINTERDÖD STABILIZATION: Generic Sector Gating
        // Non-combat sectors (e.g. PLAYGROUND) suppress all ambient/event spawns. Only direct 'isForced' calls (Terminals) are allowed.
        if (_currentSession && !isForced) {
            const sectorDef = SectorSystem.getSector(_currentSession.sectorId);
            if (sectorDef && sectorDef.spawnZombiesOnSector === false) {
                return null;
            }
        }

        if (activeCount >= ENEMY_POOL_SIZE) return null;

        const newType = (forcedType !== undefined) ? forcedType : EnemySpawner.determineType(bossSpawned);
        let enemy: Enemy;

        if (inactiveEnemies.length > 0) {
            enemy = inactiveEnemies.pop()!;
            EnemyManager.resetEnemy(enemy, newType, playerPos, forcedPos);
            // VINTERDÖD FIX: Robust scene attachment check to handle sector transitions
            if (enemy.mesh.parent !== scene) scene.add(enemy.mesh);
        } else {
            // Defensive: should ideally never happen with fixed pool
            enemy = EnemySpawner.spawn(scene, playerPos, newType, forcedPos, bossSpawned, false, enemyCount)!;
        }

        if (enemy) {
            enemy.mesh.visible = (enemy.statusFlags & EnemyFlags.BOSS) !== 0;

            const index = activeCount;
            activeEnemies[index] = enemy;
            enemy.poolId = index;

            // Sync Initial State to SoA
            EnemyPoolState.posX[index] = enemy.mesh.position.x;
            EnemyPoolState.posY[index] = enemy.mesh.position.y;
            EnemyPoolState.posZ[index] = enemy.mesh.position.z;
            EnemyPoolState.hp[index] = enemy.hp;
            EnemyPoolState.maxHp[index] = enemy.maxHp;
            EnemyPoolState.types[index] = enemy.type;
            EnemyPoolState.deathState[index] = enemy.deathState;
            EnemyPoolState.statusFlags[index] = enemy.statusFlags;

            activeCount++;
            EnemyPoolState.activeCount = activeCount;

            // Initial Spatial Positioning
            if (_currentSession) {
                EnemyManager.updateSpatialPosition(enemy, _currentSession.worldStreamer);
            }
        }

        return enemy;
    },

    /**
     * Updates an enemy's position in the unified WorldStreamer grid.
     * Uses strict O(1) Swap-and-Pop for bucket migration to ensure Zero-GC.
     */
    updateSpatialPosition: (e: Enemy, streamer: WorldStreamer) => {
        const posX = e.mesh.position.x;
        const posZ = e.mesh.position.z;

        const newKey = streamer.getSmiKeyFromWorld(posX, posZ);
        const newBucketIdx = streamer.getBucketIndex(posX, posZ);
        const ix = ChunkManager.getCoordIndex(posX);
        const iz = ChunkManager.getCoordIndex(posZ);

        // If chunk or bucket changed, migrate
        if (newKey !== e.currentChunkKey || newBucketIdx !== e.bucketIndex) {
            // 1. Remove from old bucket (Swap-and-Pop)
            if (e.currentChunkKey !== -1) {
                const oldGrid = streamer.getGridByKey(e.currentChunkKey);
                if (oldGrid) {
                    const oldBucket = oldGrid.enemyBuckets[e.bucketIndex];
                    const oldCount = oldGrid.enemyCounts[e.bucketIndex];
                    const localIdx = e._internalBucketIdx; // Need to track internal index for O(1) removal

                    if (localIdx !== -1 && localIdx < oldCount) {
                        // Swap with last
                        const lastEnemy = oldBucket[oldCount - 1];
                        oldBucket[localIdx] = lastEnemy;
                        if (lastEnemy) lastEnemy._internalBucketIdx = localIdx;

                        oldBucket[oldCount - 1] = null;
                        oldGrid.enemyCounts[e.bucketIndex]--;
                    }
                }
            }

            // 2. Add to new bucket
            const newGrid = streamer.getOrCreateGrid(ix, iz);
            if (newGrid) {
                const count = newGrid.enemyCounts[newBucketIdx];
                if (count < 16) { // BUCKET_CAPACITY
                    newGrid.enemyBuckets[newBucketIdx][count] = e;
                    e._internalBucketIdx = count;
                    newGrid.enemyCounts[newBucketIdx]++;
                    e.currentChunkKey = newKey;
                    e.bucketIndex = newBucketIdx;
                } else {
                    // Overflow handling: Force to -1 to retry next frame or skip
                    e.currentChunkKey = -1;
                    e._internalBucketIdx = -1;
                }
            } else {
                // Out of streamed bounds
                e.currentChunkKey = -1;
                e._internalBucketIdx = -1;
            }
        }
    },

    recycleEnemy: (index: number) => {
        if (index < 0 || index >= activeCount) return;

        const enemy = activeEnemies[index];
        enemy.mesh.visible = false;
        enemy.mesh.removeFromParent();

        if (_currentSession && _currentSession.state && _currentSession.state.enemies.activeBoss === enemy) {
            _currentSession.state.enemies.activeBoss = null;
        }

        // Remove from spatial grid
        if (enemy.currentChunkKey !== -1) {
            if (_currentSession && _currentSession.worldStreamer) {
                const grid = _currentSession.worldStreamer.getGridByKey(enemy.currentChunkKey);
                if (grid) {
                    const bIdx = enemy.bucketIndex;
                    const count = grid.enemyCounts[bIdx];
                    const localIdx = enemy._internalBucketIdx;
                    if (localIdx !== -1 && localIdx < count) {
                        const last = grid.enemyBuckets[bIdx][count - 1];
                        grid.enemyBuckets[bIdx][localIdx] = last;
                        if (last) last._internalBucketIdx = localIdx;
                        grid.enemyBuckets[bIdx][count - 1] = null;
                        grid.enemyCounts[bIdx]--;
                    }
                }
            }
        }

        inactiveEnemies.push(enemy);

        // SWAP-AND-GO: Move last active enemy to current slot
        if (index < activeCount - 1) {
            const lastIdx = activeCount - 1;
            const lastEnemy = activeEnemies[lastIdx];
            activeEnemies[index] = lastEnemy;

            // Sync SoA: Move last to vacated slot
            EnemyPoolState.posX[index] = EnemyPoolState.posX[lastIdx];
            EnemyPoolState.posY[index] = EnemyPoolState.posY[lastIdx];
            EnemyPoolState.posZ[index] = EnemyPoolState.posZ[lastIdx];
            EnemyPoolState.rotY[index] = EnemyPoolState.rotY[lastIdx];
            EnemyPoolState.hp[index] = EnemyPoolState.hp[lastIdx];
            EnemyPoolState.maxHp[index] = EnemyPoolState.maxHp[lastIdx];
            EnemyPoolState.types[index] = EnemyPoolState.types[lastIdx];
            EnemyPoolState.deathState[index] = EnemyPoolState.deathState[lastIdx];
            EnemyPoolState.statusFlags[index] = EnemyPoolState.statusFlags[lastIdx];
            EnemyPoolState.aiState[index] = EnemyPoolState.aiState[lastIdx];
            EnemyPoolState.velX[index] = EnemyPoolState.velX[lastIdx];
            EnemyPoolState.velY[index] = EnemyPoolState.velY[lastIdx];
            EnemyPoolState.velZ[index] = EnemyPoolState.velZ[lastIdx];

            lastEnemy.poolId = index;
        }

        activeCount--;
        activeEnemies[activeCount] = null!;
        EnemyPoolState.activeCount = activeCount;
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

        // Attack list initialization (Zero-GC pooling)
        const typeData = (newType === EnemyType.BOSS) ? BOSSES[0] : ((ZOMBIE_TYPES as any)[newType] || ZOMBIE_TYPES.WALKER);
        e.attacks = typeData.attacks || EMPTY_ATTACKS;

        if (e.attackCooldowns) e.attackCooldowns.fill(0);

        // Initialize collision radii
        e.hitRadius = e.originalScale * 0.5 * Math.max(0.7, e.widthScale);
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
        e.lastKnockback = 0;
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
        e.bossId = BossID.NONE;

        // --- ZERO-GC VECTOR ALLOCATION (Pool warmup phase) ---
        if (!e.lastKnownPosition) e.lastKnownPosition = new THREE.Vector3();
        e.targetPos.set(0, 0, 0);

        // Advanced Physics Warmup
        e.swingX = 0;
        e.swingZ = 0;
        e.swingVelX = 0;
        e.swingVelZ = 0;

        e.prevP.set(Infinity, Infinity, Infinity);

        if (!e.lastObsQueryPos) e.lastObsQueryPos = new THREE.Vector3(0, -1000, 0);
        else e.lastObsQueryPos.set(0, -1000, 0);

        if (!e.cachedObstacles) e.cachedObstacles = new Array(16);
        else e.cachedObstacles.fill(null);

        e.cachedObstacleCount = 0;

        e.lastTrailPos.set(0, 0, 0);
        e.hasLastTrailPos = false;

        // FIX: Ensure tackle time is reset to prevent NaN physics failures
        e.lastTackleTime = 0;

        const s = e.originalScale;
        const w = e.widthScale;
        e.mesh.scale.set(s * w, s, s * w);

        // Reset the body visibility based on whether it is a Boss (regular zombies are instanced and hidden)
        const body = e.bodyMesh;
        if (body) {
            body.visible = (e.statusFlags & EnemyFlags.BOSS) !== 0;
        }

        _color.setHex(e.color);
        setBaseColor(e.mesh, _color);
        resetMaterialEmissive(e.mesh);

        e.stunDuration = 0;
        e.slowDuration = 0;
        e.blindDuration = 0;
        e.burnDuration = 0;
        e.grappleDuration = 0; // Reset grapple
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

        e.currentChunkKey = -1;
        e.bucketIndex = -1;
        e._internalBucketIdx = -1;
        e._sqf = 0;

        e.mesh.updateMatrix();
    },

    spawnBoss: (scene: THREE.Scene, pos: { x: number, z: number }, bossData: any, isForced: boolean = false) => {
        // Generic Sector Gating
        if (_currentSession && !isForced) {
            const sectorDef = SectorSystem.getSector(_currentSession.sectorId);
            if (sectorDef && sectorDef.spawnZombiesOnSector === false) {
                return null;
            }
        }

        const boss = EnemySpawner.spawnBoss(scene, pos, bossData);
        if (boss) {
            boss.mesh.visible = true;

            const index = activeCount;
            activeEnemies[index] = boss;
            boss.poolId = index;

            // Sync SoA
            EnemyPoolState.posX[index] = boss.mesh.position.x;
            EnemyPoolState.posY[index] = boss.mesh.position.y;
            EnemyPoolState.posZ[index] = boss.mesh.position.z;
            EnemyPoolState.hp[index] = boss.hp;
            EnemyPoolState.maxHp[index] = boss.maxHp;
            EnemyPoolState.types[index] = boss.type;
            EnemyPoolState.deathState[index] = boss.deathState;
            EnemyPoolState.statusFlags[index] = boss.statusFlags;

            activeCount++;
            EnemyPoolState.activeCount = activeCount;

            if (_currentSession && _currentSession.state) {
                _currentSession.state.enemies.activeBoss = boss;
            }
        }
        return boss;
    },

    spawnHorde: (scene: THREE.Scene, startPos: THREE.Vector3, count: number, bossSpawned: boolean, currentCount: number, forcedType?: EnemyType, isForced: boolean = false, onSpawn?: (e: Enemy) => void): void => {
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

            const enemy = EnemyManager.spawn(scene, startPos, forcedType, _v1, bossSpawned, currentCount + i, isForced);
            if (enemy && onSpawn) onSpawn(enemy);
        }
    },

    createCorpse: (enemy: Enemy, forcedColor?: number) => {
        if (corpseRenderer) {
            const isFloating = enemy.deathState === EnemyDeathState.DROWNED || (enemy.statusFlags & EnemyFlags.DROWNING) !== 0;

            corpseRenderer.addCorpse(
                enemy.mesh.position,
                enemy.mesh.quaternion,
                enemy.originalScale,
                enemy.widthScale,
                forcedColor !== undefined ? forcedColor : enemy.color,
                isFloating
            );
        }
    },

    explodeEnemy: (enemy: Enemy, callbacks: any, velocity?: THREE.Vector3, isGibbed: boolean = false) => {
        if (enemy.statusFlags & EnemyFlags.EXPLODED) return;
        enemy.statusFlags |= EnemyFlags.EXPLODED;
        if (isGibbed) {
            enemy.statusFlags |= EnemyFlags.GIBBED;
            if (callbacks.session) {
                const tracker = (callbacks.session as GameSessionLogic).getSystem<any>(SystemID.DAMAGE_TRACKER);
                if (tracker) tracker.recordGib(callbacks.session);
            }
        }

        const enemyScale = enemy.originalScale * enemy.widthScale;
        const pos = enemy.mesh.position;

        if (enemy.mesh.parent) enemy.mesh.parent.remove(enemy.mesh);

        let burstScale = 1.0;
        const dmgType = enemy.lastDamageType;
        if (dmgType === DamageID.GRENADE) burstScale = 3.0;
        else if (dmgType === DamageID.SHOTGUN || dmgType === DamageID.REVOLVER) burstScale = 2.0;

        const decalScale = ((enemy.statusFlags & EnemyFlags.BOSS) !== 0 ? 6.0 : enemyScale * burstScale);

        // null-safety check for callbacks since _aiContext can be cleared/nullified
        if (callbacks.spawnDecal) {
            callbacks.spawnDecal(pos.x, pos.z, decalScale, MATERIALS.bloodDecal, FXDecalType.SPLATTER);
        }

        const bloodCount = (enemy.statusFlags & EnemyFlags.BOSS) !== 0 ? 12 : 5;
        const goreCount = (enemy.statusFlags & EnemyFlags.BOSS) !== 0 ? 12 : 5;
        const enemyTopY = pos.y + enemy.originalScale * 1.8;

        if (callbacks.spawnParticle) {
            callbacks.spawnParticle(pos.x, 1.5, pos.z, FXParticleType.BLOOD_SPLATTER, 6);
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
                callbacks.spawnParticle(pos.x, pos.y + 1, pos.z, FXParticleType.GORE, 1, undefined, _v2, enemy.color, goreScale);
            }
        }
    },

    processDeathAnimation: (e: Enemy, callbacks: any, session: any, delta: number, simTime: number, renderTime: number, ground: any, water: any) => {
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
                if (water) {
                    water.checkBuoyancy(e.mesh.position.x, e.mesh.position.y, e.mesh.position.z, renderTime);
                    const targetY = _buoyancyResult.waterLevel - 0.2 + Math.sin(renderTime * 0.002) * 0.05;
                    e.mesh.position.y = THREE.MathUtils.lerp(e.mesh.position.y, targetY, 2 * delta);

                    // Fade out rotation to float face down
                    e.mesh.rotation.x = THREE.MathUtils.lerp(e.mesh.rotation.x, -Math.PI / 1.1, delta);
                    e.mesh.rotation.z = THREE.MathUtils.lerp(e.mesh.rotation.z, (Math.random() - 0.5) * 0.2, delta);
                }
                if (age > 2000) e.deathState = EnemyDeathState.DEAD;
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
                    _color.setHex(ENEMY_COLORS.ELECTRIC_ARC_FLASH.num);
                    applyElectrifiedGlow(e.mesh, _color, 1.0 + pulse * 4.0);

                    const jitter = (1.0 - fallProgress * 0.5) * 0.2;
                    e.mesh.rotation.y += (Math.random() - 0.5) * jitter;

                    if (Math.random() > 0.85) {
                        _v1.set(
                            e.targetPos.x + (Math.random() - 0.5),
                            e.mesh.position.y + 0.5,
                            e.targetPos.z + (Math.random() - 0.5)
                        );
                        if (callbacks.spawnParticle) {
                            callbacks.spawnParticle(_v1.x, _v1.y, _v1.z, FXParticleType.SPARK, 1);
                        }
                    }
                } else {
                    _color.setHex(e.color || 0xffffff).multiplyScalar(0.3);
                    resetMaterialEmissive(e.mesh);
                    setBaseColor(e.mesh, _color);

                    const floorY = ground.getGroundHeight(e.targetPos.x, e.targetPos.z, session);
                    e.mesh.position.x = e.targetPos.x;
                    e.mesh.position.y = floorY + 0.1;
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

                const floorY = ground.getGroundHeight(e.mesh.position.x, e.mesh.position.z, session);
                if (e.mesh.position.y <= floorY) {
                    e.mesh.position.y = floorY;

                    if (e.deathVel.y < -5.0 && water) {
                        water.checkBuoyancy(e.mesh.position.x, e.mesh.position.y, e.mesh.position.z, renderTime);
                        if (_buoyancyResult.inWater) {
                            water.spawnRipple(e.mesh.position.x, e.mesh.position.z, 0.8, 1.2);
                            if (callbacks.spawnParticle) callbacks.spawnParticle(e.mesh.position.x, _buoyancyResult.waterLevel, e.mesh.position.z, FXParticleType.SPLASH, 4);
                        }
                    }

                    e.deathVel.set(0, 0, 0);
                }

                // --- PROCEDURAL PHYSICS DEATH FALL (VINTERDÖD STABILIZATION) ---
                // Rotate the zombie so it actually tips over and drops to the ground
                const fallProgress = Math.min(1.0, age / 400.0); // Tip over completely in 400ms
                const targetRotX = e.fallForward ? -Math.PI / 2 : Math.PI / 2;
                e.mesh.rotation.x = THREE.MathUtils.lerp(0, targetRotX, fallProgress);

                // Spin slowly while falling for extra gritty realism
                if (age < 400) {
                    e.mesh.rotation.y += (e.fallForward ? 1 : -1) * 2.0 * delta * (1.0 - fallProgress);
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
        spinIntensity: number,
        damageSource: DamageID = DamageID.NONE
    ) => {
        if (enemy.deathState !== EnemyDeathState.ALIVE) return;

        enemy.lastKnockback = damageSource;

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
        ctx: SectorBuildContext | SectorUpdateContext,
        center: THREE.Vector3,
        radius: number,
        maxForce: number,
        maxDamage: number,
        damageType: DamageType,
        damageSource: DamageID,
        direction?: THREE.Vector3
    ) => {
        const streamer = ctx.worldStreamer;
        if (!streamer) return;

        let hasDir = false;
        if (direction && direction.lengthSq() > 0.001) {
            _v2.copy(direction).normalize();
            _v2.y = 0;
            if (_v2.lengthSq() > 0.001) {
                _v2.normalize();
                hasDir = true;
            }
        }

        let hitAnyone = false;
        const enPool = streamer.getEnemyPool();
        const enPoolIdx = enPool.nextIndex();
        streamer.getNearbyEnemies(center.x, center.z, radius, enPoolIdx);

        const enemies = enPool.getPool(enPoolIdx);
        const len = enPool.getCount(enPoolIdx);
        const radiusSq = radius * radius;

        for (let i = 0; i < len; i++) {
            const e = enemies[i];
            if (e.deathState !== EnemyDeathState.ALIVE) continue;

            _v1.subVectors(e.mesh.position, center);
            _v1.y = 0;
            const distSq = _v1.lengthSq();

            if (distSq < radiusSq) {
                const isGrappling = e.state === AIState.GRAPPLE;
                if (!isGrappling && hasDir) {
                    if (_v1.dot(_v2) < 0) continue;
                }
                hitAnyone = true;
                const falloff = 1.0 - (distSq / radiusSq);

                const abilityRush = ABILITIES[AbilityID.RUSH];
                const abilityDodge = ABILITIES[AbilityID.DODGE];
                const isRush = damageSource === DamageID.RUSH;
                const isDodge = damageSource === DamageID.DODGE;
                const baseDamage = isRush ? (abilityRush?.damage ?? 10) : (isDodge ? (abilityDodge?.damage ?? 0) : 0);
                const damage = (isRush || isDodge) ? baseDamage : Math.ceil(maxDamage * falloff);

                if (damage > 0 || (isRush || isDodge)) {
                    if (ctx.applyDamage) ctx.applyDamage(e, damage, damageType, damageSource, maxForce >= 20);
                    else e.hp -= damage;
                }

                // --- PHYSICS (Using Unified Pipeline) ---
                // Dramatically increase RUSH lift and decrease DODGE lift for requested feedback
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
                    force * spinScale,
                    damageSource
                );

                // --- VISUALS ---
                ctx.spawnParticle(e.mesh.position.x, 1.5, e.mesh.position.z, FXParticleType.BLOOD_SPLATTER, 6);
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
        state: GameSessionState,
        session: GameSessionLogic,
        delta: number,
        simTime: number,
        renderTime: number
    ): boolean => {
        const speedKmh = speedMS * 3.6;
        const mass = e.originalScale * e.widthScale;
        const massRatio = (vehicleDef.mass * 0.001) / (mass || 1.0);

        const baseDamage = speedKmh * massRatio * vehicleDef.collisionDamageMultiplier * 2.0;

        e.hitTime = simTime;
        e.hitRenderTime = renderTime;

        const scene = session.engine.scene;

        // Redirect damage through the centralized system to ensure proper telemetry and XP attribution
        session.damageTracker.recordOutgoingDamage(session, baseDamage, DamageID.VEHICLE_SPLATTER, (e.statusFlags & EnemyFlags.BOSS) !== 0);

        // Call applyDamage instead of direct HP mutation to trigger centralized onEnemyKilled
        const applyDamage = session.state.applyDamage;
        if (applyDamage) {
            applyDamage(e, baseDamage, vehicleDef.defaultDamageType as DamageType, vehicleDef.defaultDamageID as DamageID);
        } else {
            e.hp -= baseDamage;
        }

        if (e.hp <= 0) {
            e.statusFlags |= EnemyFlags.DEAD;

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

                FXSystem.spawnParticle(scene, state.combat.particles, e.mesh.position.x, 1.5, e.mesh.position.z, FXParticleType.BLOOD_SPLATTER, 6);
                FXSystem.spawnDecal(scene, state.world.bloodDecals, e.mesh.position.x, e.mesh.position.z,
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
            // [VINTERDÖD FIX] Attribution to the unified VEHICLE category
            EnemyManager.applyImpactForce(e, _v4, speedMS * 15, liftRatio, 1.5, speedMS * 2.0, DamageID.VEHICLE);

            e.slowDuration = 0.5;
            return false;
        }
    },

    cleanupDeadEnemies: (
        session: GameSessionLogic,
        delta: number,
        simTime: number
    ) => {
        const scene = session.engine.scene;
        const state = session.state;
        const callbacks = state.callbacks;

        // --- PHASE 6: CONTIGUOUS CLEANUP ---
        let i = 0;
        while (i < activeCount) {
            const e = activeEnemies[i];

            if (e.deathState === EnemyDeathState.ALIVE) {
                // Out-of-bounds check (Zero-GC ambient hibernation recycling)
                const playerPos = state.player.position;
                if (playerPos && (e.statusFlags & EnemyFlags.BOSS) === 0) {
                    const dx = e.mesh.position.x - playerPos.x;
                    const dz = e.mesh.position.z - playerPos.z;
                    const distSq = dx * dx + dz * dz;

                    // If beyond simulation/hibernation range, recycle immediately
                    if (distSq > SPATIAL_CONFIG.AI_HIBERNATION_RADIUS_SQ) {
                        EnemyManager.recycleEnemy(i);
                        // Swap-and-Go: Do not increment i, check new occupant in this slot
                        continue;
                    }
                }
                i++;
                continue;
            }

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
                // [VINTERDÖD FIX] Telemetry is now handled centrally by GameSessionLogic/PlayerStatsSystem 
                // during the applyDamage tick. recordKill here was causing double-counting.
                if (callbacks.gainXp) callbacks.gainXp(e.score || 10);

                if ((e.statusFlags & EnemyFlags.BOSS) !== 0 && e.bossId !== undefined && e.bossId !== -1) {
                    if (callbacks.onBossKilled) callbacks.onBossKilled(e.bossId);
                    LootSystem.spawnScrapExplosion(scene, e.mesh.position.x, e.mesh.position.z, 500);
                } else if (Math.random() < 0.15) {
                    LootSystem.spawnScrapExplosion(scene, e.mesh.position.x, e.mesh.position.z, 1 + Math.floor(Math.random() * 5));
                }

                if (e.indicatorRing?.parent) e.indicatorRing.parent.remove(e.indicatorRing);

                // --- CORPSE HANDLING ---
                const isExploded = (e.statusFlags & EnemyFlags.EXPLODED) !== 0;
                const isAsh = (e.statusFlags & EnemyFlags.ASH_PERMANENT) !== 0;
                if (!isExploded && !isAsh) {
                    EnemyManager.createCorpse(e);
                }

                // --- RECYCLE (Swap-and-Go) ---
                EnemyManager.recycleEnemy(i);
                // DO NOT increment i, check new occupant
            } else {
                i++;
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
            _aiContext.spawnParticle(pos.x, pos.y + 1.8, pos.z, FXParticleType.ENEMY_EFFECT_STUN, 1, undefined, undefined, 0xffff00, 0.3);
            break;
        case EnemyEffectType.FLAME:
            _v1.set(pos.x + (Math.random() - 0.5) * 0.5, pos.y + 1.8, pos.z + (Math.random() - 0.5) * 0.5);
            _aiContext.spawnParticle(_v1.x, _v1.y, _v1.z, FXParticleType.ENEMY_EFFECT_FLAME, 1);
            break;
        case EnemyEffectType.SPARK:
            _v1.set(pos.x + (Math.random() - 0.5) * 0.4, pos.y + 1.8 + Math.random() * 0.4, pos.z + (Math.random() - 0.5) * 0.4);
            _aiContext.spawnParticle(_v1.x, _v1.y, _v1.z, FXParticleType.ENEMY_EFFECT_SPARK, 1);
            break;
    }
};
