import * as THREE from 'three';
import { SystemID } from '../../systems/System';
import { MATERIALS } from '../../utils/assets';
import { KMH_TO_MS, AI_LOD } from '../../content/constants';
import { EnemyPoolState, ENEMY_POOL_SIZE } from '../../core/pools/EnemyPool';
import { Enemy, AIState, EnemyEffectType, EnemyDeathState, EnemyType, ENEMY_MAX_HP, ENEMY_BASE_SPEED, ENEMY_XP, ENEMY_COLOR, ENEMY_SCALE, ENEMY_WIDTH_SCALE, EnemyFlags, NoiseType, EnemyDeathDecal, EnemyGrowlType } from '../../entities/enemies/EnemyTypes';
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
import { CareerStatsSystem } from '../../systems/CareerStatsSystem';
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

const _whiteColor = new THREE.Color(COLORS.WHITE.num);
const _blackColor = new THREE.Color(0x111111);
const _cyanColor = new THREE.Color(COLORS.ELECTRIC_FLASH.num);
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
    handleEnemyHit: ((enemy: Enemy, amount: number, damageType: DamageType, damageSource: DamageID, isHighImpact?: boolean) => boolean) | null;
    onEffectTick: ((enemy: Enemy, type: EnemyEffectType) => void) | null;
    playSound: (id: SoundID) => void;
    setBubble: ((text: string, duration: number) => void) | null;
    queryEnemies: ((pos: THREE.Vector3, radius: number, outPoolIdx: number) => void) | null;
    handlePlayerHit: (damage: number, attacker: any, damageType: DamageType, damageSource: DamageID, isDoT?: boolean, effectType?: StatusEffectID, duration?: number, intensity?: number, specificAttackType?: EnemyAttackType) => boolean;
    _realHandlePlayerHit: ((damage: number, attacker: any, damageType: DamageType, damageSource: DamageID, isDoT?: boolean, effectType?: StatusEffectID, duration?: number, intensity?: number, specificAttackType?: EnemyAttackType) => boolean) | null;
}

const _aiContext: AIContext = {
    spawnParticle: null,
    spawnDecal: null,
    handleEnemyHit: null,
    onEffectTick: null,
    playSound: (id: SoundID) => audioEngine.playSound(id),
    setBubble: null,
    queryEnemies: _queryEnemies,

    handlePlayerHit: (damage: number, attacker: any, damageType: DamageType, damageSource: DamageID, isDoT?: boolean, effectType?: StatusEffectID, duration?: number, intensity?: number, specificAttackType?: EnemyAttackType) => {
        if (_aiContext._realHandlePlayerHit) {
            return _aiContext._realHandlePlayerHit(damage, attacker, damageType, damageSource, isDoT, effectType, duration, intensity, specificAttackType);
        }
        return false;
    },
    _realHandlePlayerHit: null
};

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
            const enemy = activeEnemies[i];
            if (enemy && enemy.mesh && enemy.mesh.parent !== scene) {
                scene.add(enemy.mesh);
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
        const streamer = session.systems.worldStreamer;
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
        const enemySystem = session.systems.enemySystem as any;
        const handlePlayerHit = enemySystem?.callbacks?.handlePlayerHit || state.callbacks?.handlePlayerHit;
        const spawnParticle = enemySystem?.callbacks?.spawnParticle || state.callbacks?.spawnParticle;
        const spawnDecal = enemySystem?.callbacks?.spawnDecal || state.callbacks?.spawnDecal;
        const handleEnemyHit = state.handleEnemyHit;

        _frameCount++;
        _syncList.length = 0;

        _aiContext._realHandlePlayerHit = handlePlayerHit;
        _aiContext.spawnParticle = spawnParticle;
        _aiContext.spawnDecal = spawnDecal;
        _aiContext.handleEnemyHit = handleEnemyHit;
        _currentStreamer = streamer;

        const globalTimeScale = state?.metrics?.globalTimeScale ?? 1.0;
        const scaledDelta = delta * globalTimeScale;

        const camera = session.engine.camera;
        const cameraPos = camera.threeCamera.position;
        const cameraDir = _camDir.set(0, 0, -1).applyQuaternion(camera.threeCamera.quaternion);

        // --- CONTIGUOUS POOL UPDATE ---
        for (let i = 0; i < activeCount; i++) {
            const enemy = activeEnemies[i];
            if (!enemy) continue;

            // --- 1. SPATIAL GATING (Zero-GC) ---
            const dx = enemy.mesh.position.x - pX;
            const dz = enemy.mesh.position.z - pZ;
            const distSq = dx * dx + dz * dz;

            const isDying = enemy.deathState !== EnemyDeathState.ALIVE && enemy.deathState !== EnemyDeathState.DEAD;

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
                enemy.statusFlags |= EnemyPoolState.statusFlags[i];
                if (EnemyPoolState.hp[i] < enemy.hp) enemy.hp = EnemyPoolState.hp[i];

                // --- 2. LOGIC UPDATE ---
                if (enemy.deathState === EnemyDeathState.ALIVE) {
                    EnemyAI.updateEnemy(enemy, playerPos, playerStatusFlags, streamer as any, isDead, _aiContext, water, ground, session, scaledDelta * updateFrequency, simTime, renderTime);

                    // --- STRESS HARNESS: MONITOR PHASING ---
                    RuntimeStressHarness.assertPhasing("Enemy", enemy.mesh.position.x, enemy.mesh.position.z, enemy.prevP.x, enemy.prevP.z);
                    enemy.prevP.copy(enemy.mesh.position);
                } else if (isDying) {
                    EnemyManager.processDeathAnimation(enemy, _aiContext, session, scaledDelta, simTime, renderTime, ground, water);
                }

                // --- 2b. SPATIAL RE-BUCKETING (Zero-GC Migration) ---
                EnemyManager.updateSpatialPosition(enemy, streamer);

                // SYNC TO TypedArray SoA (Source of Truth for other systems)
                EnemyPoolState.posX[i] = enemy.mesh.position.x;
                EnemyPoolState.posY[i] = enemy.mesh.position.y;
                EnemyPoolState.posZ[i] = enemy.mesh.position.z;
                EnemyPoolState.rotY[i] = enemy.mesh.rotation.y;
                EnemyPoolState.hp[i] = enemy.hp;
                EnemyPoolState.deathState[i] = enemy.deathState;
                EnemyPoolState.statusFlags[i] = enemy.statusFlags;
                EnemyPoolState.aiState[i] = enemy.state;
                EnemyPoolState.velX[i] = enemy.velocity.x;
                EnemyPoolState.velY[i] = enemy.velocity.y;
                EnemyPoolState.velZ[i] = enemy.velocity.z;

                enemy.mesh.updateMatrix();
            }

            // --- 3. RENDER SYNC ---
            if (updateFrequency > 0 || isDying) {
                _syncList.push(enemy);

                const deathState = enemy.deathState;
                switch (deathState) {
                    case EnemyDeathState.BURNED:
                    case EnemyDeathState.ELECTROCUTED:
                    case EnemyDeathState.DROWNED:
                        enemy.mesh.visible = true;
                        enemy.mesh.matrixAutoUpdate = true;

                        // Ensure the standalone body mesh is temporarily visible for dying animations
                        const dBody = enemy.bodyMesh;
                        if (dBody) dBody.visible = true;
                        break;
                    case EnemyDeathState.DEAD:
                        break;
                    default:
                        const isDying = deathState !== EnemyDeathState.ALIVE;
                        if (isDying) {
                            enemy.mesh.visible = false;
                            enemy.mesh.matrixAutoUpdate = true;
                        } else if ((enemy.statusFlags & EnemyFlags.BOSS) === 0 && !(enemy.statusFlags & EnemyFlags.EXPLODED)) {
                            let isVisible = true;
                            if (cameraPos && cameraDir) {
                                _v2.subVectors(enemy.mesh.position, cameraPos);
                                const dot = cameraDir.dot(_v2);
                                const dSq = _v2.lengthSq();
                                if (dot < AI_LOD.CULL_DOT_THRESHOLD && dSq > AI_LOD.THROTTLED_RADIUS_SQ) isVisible = false;
                            }
                            const isTelegraphing = enemy.indicatorRing && enemy.indicatorRing.visible;
                            if (!isVisible && !isTelegraphing) {
                                enemy.mesh.visible = false;
                                enemy.mesh.matrixAutoUpdate = false;
                            } else if (isVisible && !isTelegraphing) {
                                enemy.mesh.visible = false;
                                enemy.mesh.matrixAutoUpdate = false;
                                enemy.mesh.updateMatrix();
                            } else {
                                enemy.mesh.visible = isVisible;
                                enemy.mesh.matrixAutoUpdate = true;
                            }
                        } else {
                            enemy.mesh.visible = true;
                            enemy.mesh.matrixAutoUpdate = true;
                        }
                        break;
                }

                // Flash feedback
                if (deathState === EnemyDeathState.ALIVE && enemy.color !== undefined) {
                    const isBoss = (enemy.statusFlags & EnemyFlags.BOSS) !== 0;
                    const timeSinceHit = simTime - enemy.hitTime;
                    if (timeSinceHit < 100) {
                        if (!(enemy.statusFlags & EnemyFlags.FLASH_ACTIVE)) {
                            enemy.statusFlags |= EnemyFlags.FLASH_ACTIVE;
                            enemy.originalColor = enemy.color;
                            const isArc = enemy.lastDamageType === DamageID.ARC_CANNON;
                            if (isArc) {
                                enemy.color = ENEMY_COLORS.ELECTRIC_ARC_FLASH.num;
                                if (isBoss) applyElectrifiedGlow(enemy.mesh, _cyanColor, 2.0); // Using scratchpad _cyan
                            } else {
                                enemy.color = ENEMY_COLORS.HIT_FLASH.num;
                                if (isBoss) applyElectrifiedGlow(enemy.mesh, _whiteColor, 1.0); // Using scratchpad _white
                            }
                        }
                    } else if (enemy.statusFlags & EnemyFlags.FLASH_ACTIVE) {
                        enemy.statusFlags &= ~EnemyFlags.FLASH_ACTIVE;
                        if (isBoss) resetMaterialEmissive(enemy.mesh);
                        else enemy.color = enemy.originalColor;
                    }
                }
            } else {
                enemy.mesh.visible = false;
                enemy.mesh.matrixAutoUpdate = false;
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

            // Sync state.enemies.pool so HudSystem, OcclusionSystem, and EnemyWaveSystem see this entity.
            // This is the single authoritative push point — all other spawn paths converge here.
            if (_currentSession?.state) {
                _currentSession.state.enemies.pool.push(enemy);
            }

            // Initial Spatial Positioning
            if (_currentSession) {
                EnemyManager.updateSpatialPosition(enemy, _currentSession.systems.worldStreamer);
            }
        }

        return enemy;
    },

    /**
     * Updates an enemy's position in the unified WorldStreamer grid.
     * Uses strict O(1) Swap-and-Pop for bucket migration to ensure Zero-GC.
     */
    updateSpatialPosition: (enemy: Enemy, streamer: WorldStreamer) => {
        const posX = enemy.mesh.position.x;
        const posZ = enemy.mesh.position.z;

        const newKey = streamer.getSmiKeyFromWorld(posX, posZ);
        const newBucketIdx = streamer.getBucketIndex(posX, posZ);
        const ix = ChunkManager.getCoordIndex(posX);
        const iz = ChunkManager.getCoordIndex(posZ);

        // If chunk or bucket changed, migrate
        if (newKey !== enemy.currentChunkKey || newBucketIdx !== enemy.bucketIndex) {
            // 1. Remove from old bucket (Swap-and-Pop)
            if (enemy.currentChunkKey !== -1) {
                const oldGrid = streamer.getGridByKey(enemy.currentChunkKey);
                if (oldGrid) {
                    const oldBucket = oldGrid.enemyBuckets[enemy.bucketIndex];
                    const oldCount = oldGrid.enemyCounts[enemy.bucketIndex];
                    const localIdx = enemy._internalBucketIdx; // Need to track internal index for O(1) removal

                    if (localIdx !== -1 && localIdx < oldCount) {
                        // Swap with last
                        const lastEnemy = oldBucket[oldCount - 1];
                        oldBucket[localIdx] = lastEnemy;
                        if (lastEnemy) lastEnemy._internalBucketIdx = localIdx;

                        oldBucket[oldCount - 1] = null;
                        oldGrid.enemyCounts[enemy.bucketIndex]--;
                    }
                }
            }

            // 2. Add to new bucket
            const newGrid = streamer.getOrCreateGrid(ix, iz);
            if (newGrid) {
                const count = newGrid.enemyCounts[newBucketIdx];
                if (count < 16) { // BUCKET_CAPACITY
                    newGrid.enemyBuckets[newBucketIdx][count] = enemy;
                    enemy._internalBucketIdx = count;
                    newGrid.enemyCounts[newBucketIdx]++;
                    enemy.currentChunkKey = newKey;
                    enemy.bucketIndex = newBucketIdx;
                } else {
                    // Overflow handling: Force to -1 to retry next frame or skip
                    enemy.currentChunkKey = -1;
                    enemy._internalBucketIdx = -1;
                }
            } else {
                // Out of streamed bounds
                enemy.currentChunkKey = -1;
                enemy._internalBucketIdx = -1;
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
            if (_currentSession && _currentSession.systems.worldStreamer) {
                const grid = _currentSession.systems.worldStreamer.getGridByKey(enemy.currentChunkKey);
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

        // Swap-pop from state.enemies.pool to mirror the activeEnemies[] swap below.
        // indexOf is O(n) but only runs on death (not 60fps) — pool cap is 100.
        if (_currentSession?.state) {
            const statePool = _currentSession.state.enemies.pool;
            const stateIdx = statePool.indexOf(enemy);
            if (stateIdx !== -1) {
                statePool[stateIdx] = statePool[statePool.length - 1];
                statePool.pop();
            }
        }

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

    resetEnemy: (enemy: Enemy, newType: EnemyType, playerPos: THREE.Vector3, forcedPos?: THREE.Vector3) => {
        enemy.type = newType;

        // DOD: Base Stat Initialization
        enemy.maxHp = ENEMY_MAX_HP[newType];
        enemy.hp = enemy.maxHp;
        enemy.speed = ENEMY_BASE_SPEED[newType] * KMH_TO_MS;
        enemy.xp = ENEMY_XP[newType];
        enemy.color = ENEMY_COLOR[newType];
        enemy.originalScale = ENEMY_SCALE[newType];
        enemy.widthScale = ENEMY_WIDTH_SCALE[newType];

        // Attack list initialization (Zero-GC pooling)
        const typeData = (newType === EnemyType.BOSS) ? BOSSES[0] : ((ZOMBIE_TYPES as any)[newType] || ZOMBIE_TYPES.WALKER);
        enemy.attacks = typeData.attacks || EMPTY_ATTACKS;

        if (enemy.attackCooldowns) enemy.attackCooldowns.fill(0);

        // Initialize collision radii
        enemy.hitRadius = enemy.originalScale * 0.5 * Math.max(0.7, enemy.widthScale);
        enemy.combatRadius = enemy.originalScale * 1.5;
        enemy.attackOffset = 0.5 + enemy.hitRadius;

        // Zero-out all status flags and timers
        enemy.statusFlags = 0;
        if (newType === EnemyType.BOSS) enemy.statusFlags |= EnemyFlags.BOSS;

        if (forcedPos) {
            _v2.set((Math.random() - 0.5) * 4, 0, (Math.random() - 0.5) * 4);
            enemy.mesh.position.copy(forcedPos).add(_v2);
        } else {
            const angle = Math.random() * Math.PI * 2;
            const dist = 45 + Math.random() * 30;
            enemy.mesh.position.set(playerPos.x + Math.cos(angle) * dist, 0, playerPos.z + Math.sin(angle) * dist);
        }

        enemy.spawnPos.copy(enemy.mesh.position);
        enemy.lastKnownPosition.copy(enemy.mesh.position);
        enemy.deathState = EnemyDeathState.ALIVE;
        enemy.velocity.set(0, 0, 0);
        enemy.knockbackVel.set(0, 0, 0);
        enemy.lastKnockback = 0;
        enemy.deathVel.set(0, 0, 0);
        enemy.deathTimer = 0;
        enemy.bloodSpawned = false;
        enemy.hitRenderTime = 0;
        enemy.lastDamageType = DamageID.NONE;
        enemy._accumulatedDamage = 0;
        enemy._lastDamageTextTime = 0;
        enemy.lastSeenTime = 0;
        enemy.awareness = 0;
        enemy.lastHeardNoiseType = NoiseType.NONE;
        enemy.bossId = BossID.NONE;

        // --- ZERO-GC VECTOR ALLOCATION (Pool warmup phase) ---
        if (!enemy.lastKnownPosition) enemy.lastKnownPosition = new THREE.Vector3();
        enemy.targetPos.set(0, 0, 0);

        // Advanced Physics Warmup
        enemy.swingX = 0;
        enemy.swingZ = 0;
        enemy.swingVelX = 0;
        enemy.swingVelZ = 0;

        enemy.prevP.set(Infinity, Infinity, Infinity);

        if (!enemy.lastObsQueryPos) enemy.lastObsQueryPos = new THREE.Vector3(0, -1000, 0);
        else enemy.lastObsQueryPos.set(0, -1000, 0);

        if (!enemy.cachedObstacles) enemy.cachedObstacles = new Array(16);
        else enemy.cachedObstacles.fill(null);

        enemy.cachedObstacleCount = 0;

        enemy.lastTrailPos.set(0, 0, 0);
        enemy.hasLastTrailPos = false;

        // FIX: Ensure tackle time is reset to prevent NaN physics failures
        enemy.lastTackleTime = 0;

        const s = enemy.originalScale;
        const w = enemy.widthScale;
        enemy.mesh.scale.set(s * w, s, s * w);

        // Reset the body visibility based on whether it is a Boss (regular zombies are instanced and hidden)
        const body = enemy.bodyMesh;
        if (body) {
            body.visible = (enemy.statusFlags & EnemyFlags.BOSS) !== 0;
        }

        _color.setHex(enemy.color);
        setBaseColor(enemy.mesh, _color);
        resetMaterialEmissive(enemy.mesh);

        enemy.stunDuration = 0;
        enemy.slowDuration = 0;
        enemy.blindDuration = 0;
        enemy.burnDuration = 0;
        enemy.grappleDuration = 0; // Reset grapple
        enemy.burnTickTimer = 0;
        enemy.lastBurnTick = 0;

        enemy.drownTimer = 0;
        enemy.drownDmgTimer = 0;
        enemy.fallStartY = 0;

        enemy.spinVel.set(0, 0, 0);
        enemy.hitDir.set(0, 0, 0);
        enemy.baseY = 0;
        enemy.animRotX = 0;
        enemy.animRotZ = 0;
        enemy.lastAIState = AIState.IDLE;
        enemy.ashPile = null;

        if (enemy.indicatorRing) {
            enemy.indicatorRing.visible = false;
            enemy.indicatorRing.matrixAutoUpdate = false;
        }

        enemy.currentChunkKey = -1;
        enemy.bucketIndex = -1;
        enemy._internalBucketIdx = -1;
        enemy._sqf = 0;

        enemy.mesh.updateMatrix();
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

            // Sync state.enemies.pool for boss entity (same as regular spawn)
            if (_currentSession?.state) {
                _currentSession.state.enemies.pool.push(boss);
            }

            if (_currentSession && _currentSession.state) {
                _currentSession.state.enemies.activeBoss = boss;
            }
        }
        return boss;
    },

    spawnHorde: (scene: THREE.Scene, startPos: THREE.Vector3, count: number, bossSpawned: boolean, currentCount: number, forcedType?: EnemyType, isForced: boolean = false,
        onSpawn?: (enemy: Enemy) => void): void => {
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

    gibEnemy: (enemy: Enemy, callbacks: any, forceDir?: THREE.Vector3) => {
        EnemyManager.explodeEnemy(enemy, callbacks, forceDir);
    },

    explodeEnemy: (enemy: Enemy, callbacks: any, forceDir?: THREE.Vector3) => {
        //if (enemy.statusFlags & EnemyFlags.EXPLODED) return;
        if (enemy.deathState === EnemyDeathState.GIBBED) {
            enemy.statusFlags |= EnemyFlags.GIBBED;
            CareerStatsSystem.recordGib(callbacks.session, enemy.lastDamageType);
        } else {
            enemy.statusFlags |= EnemyFlags.EXPLODED;
        }

        // Enemy position, body mass and head position
        const enemyPos = enemy.mesh.position;
        const enemyBodyMass = enemy.originalScale * enemy.widthScale;
        const enemyHeadPos = enemyPos.y + enemy.originalScale * 1.8;
        const isBoss = (enemy.statusFlags & EnemyFlags.BOSS) !== 0;

        if (enemy.mesh.parent) enemy.mesh.parent.remove(enemy.mesh);

        // --- 1. BLOOD DECAL ---
        // Scaled based on weapon type & enemy type:
        const dmgType = enemy.lastDamageType;
        let weaponBurstScale = 1.0;
        if (dmgType === DamageID.GRENADE) weaponBurstScale = 3.0;
        else if (dmgType === DamageID.SHOTGUN || dmgType === DamageID.REVOLVER) weaponBurstScale = 2.0;

        const decalScale = (isBoss ? 6.0 : enemyBodyMass * weaponBurstScale);
        if (callbacks.spawnDecal) {
            callbacks.spawnDecal(enemyPos.x, enemyPos.z, decalScale, MATERIALS.bloodDecal, FXDecalType.SPLATTER);
        }

        // --- 2. BLOOD SPLATTER ---
        // Based on enemy type
        const bloodCount = (isBoss ? 12 : 6);
        if (callbacks.spawnParticle) {
            callbacks.spawnParticle(enemyPos.x, enemyHeadPos, enemyPos.z, FXParticleType.BLOOD_SPLATTER, bloodCount);
        }

        // --- 3. GORE ---
        // Based on enemy type & body mass
        const goreCount = (isBoss ? 12 : 6);
        // Gore scale: boss uses raw body mass for proportional giant chunks.
        // Zombies use a minimum floor (1.4) so chunks are always visible on snow — sub-unit
        // meshes (Runner at 0.37-0.69) are near-invisible against the ground plane.
        const goreScale = isBoss ? (enemyBodyMass * 1.2) : Math.max(1.4, enemyBodyMass * 1.2);


        // Gore physics
        _v1.set(0, 0, 0);
        if (forceDir) {
            _v1.copy(forceDir);
        } else if (enemy.deathVel.x !== 0 || enemy.deathVel.z !== 0) {
            _v1.copy(enemy.deathVel);
        } else {
            _v1.copy(enemy.velocity).multiplyScalar(0.5).add(_up);
        }
        if (callbacks.spawnParticle) {
            for (let i = 0; i < goreCount; i++) {
                // Isolated physics vector calculation completely free of stale scratchpad garbage
                _v2.set(
                    (Math.random() - 0.5) * 10,
                    3.0 + Math.random() * 6,
                    (Math.random() - 0.5) * 10
                );

                // Add the death/impact vector to the random burst
                _v2.addScaledVector(_v1, 0.6);

                // Signature mapping: (x, y, z, type, count, customMesh, customVel, color, scale)
                callbacks.spawnParticle(
                    enemyPos.x,
                    enemyHeadPos,
                    enemyPos.z,
                    FXParticleType.GORE,
                    1,
                    undefined,
                    _v2,
                    enemy.color,
                    goreScale // Triggers proportional size inside FXSystem!
                );
            }
        }
    },

    /**
     * UNIFIED PERFORMANCE PHYSICS: The single source of truth for sending zombies flying.
     * Handles horizontal knockback, vertical lift, ragdoll state initialization and spinning.
     * Works for RUSH, DODGE, VEHICLE & applies PHYSICAL damage
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

        // --- Initialize fall height tracking for fall damage ---
        enemy.fallStartY = enemy.mesh.position.y;

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
        const numEnemies = enPool.getCount(enPoolIdx);
        const radiusSq = radius * radius;

        for (let i = 0; i < numEnemies; i++) {
            const enemy = enemies[i];
            if (enemy.deathState !== EnemyDeathState.ALIVE) continue;

            _v1.subVectors(enemy.mesh.position, center);
            _v1.y = 0;
            const distSq = _v1.lengthSq();

            if (distSq < radiusSq) {
                const isGrappling = enemy.state === AIState.GRAPPLE;
                if (!isGrappling && hasDir) {
                    if (_v1.dot(_v2) < 0) continue;
                }
                hitAnyone = true;
                const falloff = 1.0 - (distSq / radiusSq);

                const abilityRush = ABILITIES[AbilityID.RUSH];
                const abilityDodge = ABILITIES[AbilityID.DODGE];
                const isRush = damageSource === DamageID.RUSH;
                const isDodge = damageSource === DamageID.DODGE;
                const baseDamage = isRush ? (abilityRush?.damage ?? 10) : (isDodge ? (abilityDodge?.damage ?? 5) : 5);
                const damage = (isRush || isDodge) ? baseDamage : Math.ceil(maxDamage * falloff);

                // TODO: VALIDATE THIS!
                // This is immediatley applied when the enemies are hit, but
                // we're also applying fall damage once the enemies hit the ground:
                if (damage > 0 || (isRush || isDodge)) {
                    if (ctx.handleEnemyHit) ctx.handleEnemyHit(enemy, damage, damageType, damageSource, maxForce >= 20);
                    else enemy.hp -= damage;
                }

                // --- PHYSICS (Using Unified Pipeline) ---
                // RUSH lift is higher than DODGE lift
                const liftRatio = isDodge ? 0.05 : (isRush ? 1.6 : 0.45);
                const spinScale = isRush ? 2.5 : 0.8;
                const force = maxForce * falloff;
                const stunDur = (isRush ? 2.0 : 1.2) * falloff;

                // Add slight horizontal "Spread" variance
                _v1.x += (Math.random() - 0.7) * (force * 0.2);
                _v1.z += (Math.random() - 0.7) * (force * 0.2);

                EnemyManager.applyImpactForce(
                    enemy,
                    center,
                    force,
                    liftRatio,
                    Math.max(0.8, stunDur),
                    force * spinScale,
                    damageSource
                );

                // --- VISUALS ---
                ctx.spawnParticle(enemy.mesh.position.x, 1.5, enemy.mesh.position.z, FXParticleType.BLOOD_SPLATTER, 6);
            }
        }

        if (hitAnyone) GamePlaySounds.playImpact(MaterialType.FLESH);
    },

    /**
     * Handles the physics and logic for a single enemy being hit by a vehicle.
      */
    ramEnemies: (
        enemy: Enemy,
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
        const mass = enemy.originalScale * enemy.widthScale;
        const massRatio = (vehicleDef.mass * 0.001) / (mass || 1.0);

        const baseDamage = speedKmh * massRatio * vehicleDef.collisionDamageMultiplier * 2.0;

        enemy.hitTime = simTime;
        enemy.hitRenderTime = renderTime;

        const scene = session.engine.scene;

        // Call handleEnemyHit instead of direct HP mutation to trigger centralized onEnemyKilled and telemetry
        const handleEnemyHit = session.state.handleEnemyHit;
        if (handleEnemyHit) {
            handleEnemyHit(enemy, baseDamage, vehicleDef.defaultDamageType as DamageType, vehicleDef.defaultDamageID as DamageID);
        } else {
            enemy.hp -= baseDamage;
        }

        if (enemy.hp <= 0) {
            enemy.statusFlags |= EnemyFlags.DEAD;

            if (speedKmh >= 80) {
                enemy.deathState = EnemyDeathState.GIBBED;
                enemy.lastDamageType = DamageID.VEHICLE_SPLATTER;

                const forceDir = _v3.copy(knockDir).multiplyScalar(speedMS * 1.5).setY(3.0);
                EnemyManager.gibEnemy(enemy, _aiContext, forceDir);

                session.engine.camera.shake(0.4);
                GamePlaySounds.playImpact(MaterialType.FLESH);

                return true;
            } else if (speedKmh >= 20) {
                enemy.deathState = EnemyDeathState.FALL;
                enemy.lastDamageType = DamageID.VEHICLE_RAM;

                const pushForce = speedMS * 0.8 * massRatio;
                const upForce = speedMS * 0.6 * massRatio;

                enemy.deathVel.copy(knockDir).multiplyScalar(pushForce);
                enemy.deathVel.y = Math.max(4.0, upForce);

                FXSystem.spawnParticle(scene, state.combat.particles, enemy.mesh.position.x, 1.5, enemy.mesh.position.z, FXParticleType.BLOOD_SPLATTER, 6);
                FXSystem.spawnDecal(scene, state.world.bloodDecals, enemy.mesh.position.x, enemy.mesh.position.z,
                    1.0 + Math.random() * 1.5, MATERIALS.bloodDecal);

                session.engine.camera.shake(0.2);
                GamePlaySounds.playImpact(MaterialType.FLESH);

                return true;
            } else {
                enemy.deathState = EnemyDeathState.GENERIC;
                enemy.lastDamageType = DamageID.VEHICLE_PUSH;

                enemy.deathVel.copy(knockDir).multiplyScalar(speedMS * massRatio * 0.2);
                enemy.deathVel.y = 2.0;

                return false;
            }
        } else {
            enemy.lastDamageType = DamageID.VEHICLE_PUSH;

            // Use dedicated V3 and V4 to avoid aliasing with V1 and V2 inside applyKnockback
            _v3.copy(knockDir).multiplyScalar(speedMS);
            _v4.copy(enemy.mesh.position).addScaledVector(knockDir, -1.0);

            // Unified Physics Impact for vehicles
            const liftRatio = 0.4 + (speedMS * 0.02); // Faster = more lift
            // [VINTERDÖD FIX] Attribution to the unified VEHICLE category
            EnemyManager.applyImpactForce(enemy, _v4, speedMS * 15, liftRatio, 1.5, speedMS * 2.0, DamageID.VEHICLE);

            enemy.slowDuration = 0.5;
            return false;
        }
    },

    processDeathAnimation: (enemy: Enemy, callbacks: any, session: any, delta: number, simTime: number, renderTime: number, ground: any, water: any) => {
        const age = simTime - enemy.deathTimer;

        switch (enemy.deathState) {
            case EnemyDeathState.EXPLODED:
                EnemyManager.explodeEnemy(enemy, callbacks);
                enemy.deathState = EnemyDeathState.DEAD;
                break;

            case EnemyDeathState.GIBBED:
                EnemyManager.gibEnemy(enemy, callbacks);
                enemy.deathState = EnemyDeathState.DEAD;
                break;

            case EnemyDeathState.DROWNED:
                if (water) {
                    water.checkBuoyancy(enemy.mesh.position.x, enemy.mesh.position.y, enemy.mesh.position.z, renderTime);
                    const targetY = _buoyancyResult.waterLevel - 0.2 + Math.sin(renderTime * 0.002) * 0.05;
                    enemy.mesh.position.y = THREE.MathUtils.lerp(enemy.mesh.position.y, targetY, 2 * delta);

                    // Fade out rotation to float face down on the water surface
                    enemy.mesh.rotation.x = THREE.MathUtils.lerp(enemy.mesh.rotation.x, -Math.PI / 1.1, delta);
                    enemy.mesh.rotation.z = THREE.MathUtils.lerp(enemy.mesh.rotation.z, (Math.random() - 0.5) * 0.2, delta);
                }
                if (age > 2000) enemy.deathState = EnemyDeathState.DEAD;
                break;

            case EnemyDeathState.BURNED:
                const duration = 1500;
                const progress = Math.min(1.0, age / duration);

                if (!(enemy.statusFlags & EnemyFlags.ASH_SPAWNED)) {
                    enemy.statusFlags |= EnemyFlags.ASH_SPAWNED;
                    if (ashRenderer) {
                        ashRenderer.addAsh(enemy.mesh.position, enemy.mesh.rotation, enemy.originalScale, enemy.widthScale, enemy.color, simTime, 1500);
                    }
                }

                const s = enemy.originalScale;
                const w = enemy.widthScale;
                const shrink = 1.0 - progress;

                enemy.mesh.scale.set(s * w * shrink, s * shrink, s * w * shrink);

                // FIXED: Lerp base color to charcoal black instead of white for carbonization feel
                _color.setHex(enemy.color).lerp(_blackColor, progress);
                setBaseColor(enemy.mesh, _color);

                // Zero-GC: Continuously spawn residual flame particles while crisping up
                if (progress < 0.85 && Math.random() > 0.4 && callbacks.spawnParticle) {
                    _v1.set(enemy.mesh.position.x + (Math.random() - 0.5) * 0.4, enemy.mesh.position.y + 0.4 * shrink, enemy.mesh.position.z + (Math.random() - 0.5) * 0.4);
                    callbacks.spawnParticle(_v1.x, _v1.y, _v1.z, FXParticleType.ENEMY_EFFECT_FLAME, 1);
                }

                if (progress >= 1.0) {
                    if (!(enemy.statusFlags & EnemyFlags.ASH_PERMANENT)) {
                        enemy.statusFlags |= EnemyFlags.ASH_PERMANENT;
                        if (enemy.mesh.parent) enemy.mesh.parent.remove(enemy.mesh);

                        // Zero-GC: Trigger a final smoke puff when the body is completely consumed
                        if (callbacks.spawnParticle) {
                            callbacks.spawnParticle(enemy.mesh.position.x, enemy.mesh.position.y + 0.1, enemy.mesh.position.z, FXParticleType.SMOKE, 4);
                        }
                    }
                    enemy.deathState = EnemyDeathState.DEAD;
                }
                break;

            case EnemyDeathState.ELECTROCUTED:
                if (!(enemy.statusFlags & EnemyFlags.ELECTROCUTED)) {
                    enemy.statusFlags |= EnemyFlags.ELECTROCUTED;
                    enemy.targetPos.copy(enemy.mesh.position); // Reusing as deathPos
                    enemy.baseY = enemy.mesh.position.y; // Reusing as deathPosY

                    enemy.stunDuration = 400 + Math.random() * 200; // Reusing for fallDuration
                    enemy.slowDuration = 1800 + Math.random() * 500; // Reusing for twitchDuration

                    enemy.swingX = -Math.PI / 2.1; // Reusing for targetRotX
                    enemy.swingZ = (Math.random() - 0.5) * 0.5; // Reusing for targetRotZ
                }

                const fallDur = enemy.stunDuration;
                const twitchDur = enemy.slowDuration;

                if (age < twitchDur) {
                    const fallProgress = Math.min(1.0, age / fallDur);

                    enemy.mesh.rotation.x = THREE.MathUtils.lerp(0, enemy.swingX, fallProgress);
                    enemy.mesh.rotation.z = THREE.MathUtils.lerp(0, enemy.swingZ, fallProgress);
                    enemy.mesh.position.y = THREE.MathUtils.lerp(enemy.mesh.position.y, 0.2, fallProgress);

                    const pulse = Math.sin(renderTime * 0.05) * 0.5 + 0.5;
                    _color.setHex(ENEMY_COLORS.ELECTRIC_ARC_FLASH.num);
                    applyElectrifiedGlow(enemy.mesh, _color, 1.0 + pulse * 4.0);

                    const jitter = (1.0 - fallProgress * 0.5) * 0.2;
                    enemy.mesh.rotation.y += (Math.random() - 0.5) * jitter;

                    if (Math.random() > 0.85) {
                        _v1.set(
                            enemy.targetPos.x + (Math.random() - 0.5),
                            enemy.mesh.position.y + 0.5,
                            enemy.targetPos.z + (Math.random() - 0.5)
                        );
                        if (callbacks.spawnParticle) {
                            callbacks.spawnParticle(_v1.x, _v1.y, _v1.z, FXParticleType.SPARK, 1);
                        }
                    }
                } else {
                    _color.setHex(enemy.color || 0xffffff).multiplyScalar(0.3);
                    resetMaterialEmissive(enemy.mesh);
                    setBaseColor(enemy.mesh, _color);

                    const floorY = ground.getGroundHeight(enemy.targetPos.x, enemy.targetPos.z, session);
                    enemy.mesh.position.x = enemy.targetPos.x;
                    enemy.mesh.position.y = floorY + 0.1;
                    enemy.mesh.position.z = enemy.targetPos.z;

                    enemy.deathState = EnemyDeathState.DEAD;
                }
                break;

            case EnemyDeathState.SHOT:
            case EnemyDeathState.GENERIC:
            case EnemyDeathState.FALL:
            default:
                enemy.deathVel.y -= 35 * delta;
                enemy.mesh.position.addScaledVector(enemy.deathVel, delta);

                const floorY = ground.getGroundHeight(enemy.mesh.position.x, enemy.mesh.position.z, session);
                if (enemy.mesh.position.y <= floorY) {
                    enemy.mesh.position.y = floorY;

                    if (enemy.deathVel.y < -5.0 && water) {
                        water.checkBuoyancy(enemy.mesh.position.x, enemy.mesh.position.y, enemy.mesh.position.z, renderTime);
                        if (_buoyancyResult.inWater) {
                            water.spawnRipple(enemy.mesh.position.x, enemy.mesh.position.z, 0.8, 1.2);
                            if (callbacks.spawnParticle) callbacks.spawnParticle(enemy.mesh.position.x, _buoyancyResult.waterLevel, enemy.mesh.position.z, FXParticleType.SPLASH, 4);
                        }
                    }

                    enemy.deathVel.set(0, 0, 0);
                }

                // --- PROCEDURAL PHYSICS DEATH FALL (VINTERDÖD STABILIZATION) ---
                const fallProgress = Math.min(1.0, age / 400.0);
                const targetRotX = enemy.fallForward ? -Math.PI / 2 : Math.PI / 2;
                enemy.mesh.rotation.x = THREE.MathUtils.lerp(0, targetRotX, fallProgress);

                if (age < 400) {
                    enemy.mesh.rotation.y += (enemy.fallForward ? 1 : -1) * 2.0 * delta * (1.0 - fallProgress);
                }

                enemy.mesh.quaternion.setFromEuler(enemy.mesh.rotation);

                if (age > 1000) {
                    enemy.deathState = EnemyDeathState.DEAD;
                }
                break;
        }
    },

    cleanupDeadEnemies: (
        session: GameSessionLogic,
        delta: number,
        simTime: number
    ) => {
        const scene = session.engine.scene;
        const state = session.state;
        const enemySystem = session.systems.enemySystem as any;
        const rewardXP = enemySystem?.callbacks?.rewardXP || state.callbacks?.rewardXP;
        const onBossKilled = enemySystem?.callbacks?.onBossKilled || state.callbacks?.onBossKilled;

        // --- CONTIGUOUS CLEANUP ---
        let i = 0;
        while (i < activeCount) {
            const enemy = activeEnemies[i];

            if (enemy.deathState === EnemyDeathState.ALIVE) {
                // Out-of-bounds check (Zero-GC ambient hibernation recycling)
                const playerPos = state.player.position;
                if (playerPos && (enemy.statusFlags & EnemyFlags.BOSS) === 0) {
                    const dx = enemy.mesh.position.x - playerPos.x;
                    const dz = enemy.mesh.position.z - playerPos.z;
                    const distSq = dx * dx + dz * dz;

                    // If beyond simulation/hibernation range, recycle immediately
                    if (distSq > SPATIAL_CONFIG.AI_HIBERNATION_RADIUS_SQ) {
                        EnemyManager.recycleEnemy(i);
                        continue;
                    }
                }
                i++;
                continue;
            }

            if (!enemy.deathTimer) {
                enemy.deathTimer = simTime;
                enemy.targetPos.copy(enemy.mesh.position);
                enemy.baseY = enemy.mesh.position.y;
                if (!(enemy.statusFlags & EnemyFlags.EXPLODED)) {
                    let growlType = EnemyGrowlType.WALKER;
                    if (enemy.type === EnemyType.RUNNER) growlType = EnemyGrowlType.RUNNER;
                    else if (enemy.type === EnemyType.TANK) growlType = EnemyGrowlType.TANK;
                    EnemySounds.playGrowl(growlType, enemy.mesh.position);
                }
            }

            const shouldCleanup = (enemy.deathState === EnemyDeathState.DEAD) || (enemy.statusFlags & (EnemyFlags.EXPLODED | EnemyFlags.GIBBED)) !== 0;

            if (shouldCleanup) {
                if (rewardXP) rewardXP(enemy.xp || 10);

                if ((enemy.statusFlags & EnemyFlags.BOSS) !== 0 && enemy.bossId !== undefined && enemy.bossId !== -1) {
                    if (onBossKilled) onBossKilled(enemy.bossId);
                    LootSystem.spawnScrapExplosion(scene, enemy.mesh.position.x, enemy.mesh.position.z, 500);
                } else if (Math.random() < 0.15) {
                    LootSystem.spawnScrapExplosion(scene, enemy.mesh.position.x, enemy.mesh.position.z, 1 + Math.floor(Math.random() * 5));
                }

                if (enemy.indicatorRing?.parent) enemy.indicatorRing.parent.remove(enemy.indicatorRing);

                // --- CORPSE HANDLING ---
                // Do not show corpse if the enemy was exploded, gibbed, or turned to ash:
                const isExploded = (enemy.statusFlags & EnemyFlags.EXPLODED) !== 0;
                const isAsh = (enemy.statusFlags & EnemyFlags.ASH_PERMANENT) !== 0;
                const isGibbed = (enemy.statusFlags & EnemyFlags.GIBBED) !== 0;

                if (!isExploded && !isAsh && !isGibbed) {
                    EnemyManager.createCorpse(enemy);
                }

                // --- RECYCLE (Swap-and-Go) ---
                EnemyManager.recycleEnemy(i);
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
